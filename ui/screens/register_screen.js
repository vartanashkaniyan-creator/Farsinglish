```javascript
// ui/screens/register_screen.js

import { auth_service } from '../../core/auth/auth_service.js';
import { state_manager } from '../../core/state/state_manager.js';
import { validator } from '../../features/exercise/validator.js';
import { logger } from '../../core/utils/logger.js';
import { form_input } from '../components/form_input.js';
import { basic_button } from '../components/basic_button.js';
import { password_strength_meter } from '../components/password_strength_meter.js';
import { captcha_widget } from '../components/captcha_widget.js';
import { two_factor_setup } from '../components/two_factor_setup.js';
import { offline_manager } from '../../core/offline/offline_manager.js';
import { session_manager } from '../../core/auth/session_manager.js';

/**
 * صفحه ثبت‌نام کاربر پیشرفته
 * @module RegisterScreen
 * 
 * ویژگی‌ها:
 * - فرم ثبت‌نام با اعتبارسنجی پیشرفته
 * - نمایش قدرت رمز عبور (Password Strength Meter)
 * - قابلیت نمایش/مخفی کردن رمز عبور
 * - Auto-focus روی اولین فیلد
 * - Captcha برای جلوگیری از ربات
 * - پشتیبانی از 2FA (احراز هویت دو مرحله‌ای)
 * - ذخیره موقت داده فرم در IndexedDB (مقاوم در برابر قطعی)
 * - CSRF token و Rate limiting سمت کلاینت
 * - Tracking رویدادها برای تحلیل
 */

class RegisterScreen {
    // Private fields
    #container = null;
    #form_data = {
        username: '',
        email: '',
        password: '',
        confirm_password: '',
        two_factor_enabled: false,
        two_factor_secret: null
    };
    #errors = {};
    #is_loading = false;
    #form_inputs = {};
    #state_change_listeners = [];
    #pending_redirect = false;
    #registration_attempts = 0;
    #last_attempt_time = 0;
    #csrf_token = null;
    #captcha_validated = false;
    #two_factor_setup_complete = false;
    #draft_id = null;
    #performance_timers = {};

    /**
     * ایجاد صفحه ثبت‌نام
     * @param {Object} options - گزینه‌های صفحه
     * @param {HTMLElement} options.container - المان والد
     * @param {Object} options.router - شیء مسیریاب
     * @param {Object} options.csrf_token - توکن CSRF (اختیاری)
     */
    constructor({ container, router, csrf_token = null }) {
        if (!container) {
            throw new Error('RegisterScreen: container is required');
        }

        this.#container = container;
        this.router = router;
        this.#csrf_token = csrf_token || this.#generate_csrf_token();
        this.#start_performance_tracking('constructor');
        
        this.#initialize_async();
    }

    /**
     * مقداردهی اولیه ناهمزمان
     */
    async #initialize_async() {
        try {
            await this.#load_draft_from_indexeddb();
            this.#render();
            this.#attach_events();
            this.#auto_focus_first_field();
            
            logger.info('RegisterScreen initialized', { 
                component: 'RegisterScreen',
                has_draft: !!this.#draft_id
            });
            
            this.#track_event('screen_loaded');
            this.#end_performance_tracking('constructor');
        } catch (error) {
            logger.error('Failed to initialize RegisterScreen', { error });
            this.#show_fallback_interface();
        }
    }

    /**
     * تولید توکن CSRF سمت کلاینت
     */
    #generate_csrf_token() {
        return Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * شروع tracking عملکرد
     */
    #start_performance_tracking(marker) {
        this.#performance_timers[marker] = performance.now();
    }

    /**
     * پایان tracking عملکرد
     */
    #end_performance_tracking(marker) {
        if (this.#performance_timers[marker]) {
            const duration = performance.now() - this.#performance_timers[marker];
            logger.debug(`Performance [${marker}]`, { duration_ms: Math.round(duration) });
            delete this.#performance_timers[marker];
        }
    }

    /**
     * نمایش رابط جایگزین در صورت خطا
     */
    #show_fallback_interface() {
        this.#container.innerHTML = `
            <div class="register-screen container py-8 px-4 max-w-md mx-auto text-center">
                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                    <h2 class="text-xl font-semibold text-yellow-800 mb-2">خطا در بارگذاری</h2>
                    <p class="text-yellow-700 mb-4">لطفاً صفحه را بازخوانی کنید</p>
                    <button onclick="location.reload()" class="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700">
                        بازخوانی صفحه
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * بارگذاری داده‌های پیش‌نویس از IndexedDB
     */
    async #load_draft_from_indexeddb() {
        try {
            const db = await this.#get_db();
            const transaction = db.transaction(['register_drafts'], 'readonly');
            const store = transaction.objectStore('register_drafts');
            
            return new Promise((resolve) => {
                const request = store.get('current_draft');
                
                request.onsuccess = () => {
                    if (request.result) {
                        this.#draft_id = request.result.id;
                        this.#form_data = {
                            ...this.#form_data,
                            ...request.result.data
                        };
                    }
                    resolve();
                };
                
                request.onerror = () => resolve();
            });
        } catch (error) {
            logger.error('Failed to load draft from IndexedDB', { error });
            // Fallback به localStorage
            this.#load_draft_from_localstorage();
        }
    }

    /**
     * بارگذاری داده‌های پیش‌نویس از localStorage (پشتیبان)
     */
    #load_draft_from_localstorage() {
        try {
            const saved = localStorage.getItem('register_draft_secure');
            if (saved) {
                const decrypted = this.#decrypt_data(saved);
                if (decrypted) {
                    this.#form_data.username = decrypted.username || '';
                    this.#form_data.email = decrypted.email || '';
                }
            }
        } catch (error) {
            logger.error('Failed to load draft from localStorage', { error });
        }
    }

    /**
     * رمزگشایی داده‌های حساس
     */
    #decrypt_data(encrypted_data) {
        // در پروژه واقعی از crypto.subtle استفاده شود
        // اینجا صرفاً شبیه‌سازی شده
        try {
            return JSON.parse(atob(encrypted_data));
        } catch {
            return null;
        }
    }

    /**
     * رمزنگاری داده‌های حساس
     */
    #encrypt_data(data) {
        // در پروژه واقعی از crypto.subtle استفاده شود
        return btoa(JSON.stringify(data));
    }

    /**
     * دریافت connection دیتابیس
     */
    #get_db() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('FarsinglishDrafts', 1);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('register_drafts')) {
                    db.createObjectStore('register_drafts', { keyPath: 'id' });
                }
            };
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * ذخیره پیش‌نویس در IndexedDB
     */
    async #save_draft_to_indexeddb() {
        try {
            const db = await this.#get_db();
            const transaction = db.transaction(['register_drafts'], 'readwrite');
            const store = transaction.objectStore('register_drafts');
            
            const draft = {
                id: this.#draft_id || crypto.randomUUID(),
                data: {
                    username: this.#form_data.username,
                    email: this.#form_data.email
                },
                timestamp: Date.now(),
                version: 1
            };
            
            this.#draft_id = draft.id;
            
            return new Promise((resolve, reject) => {
                const request = store.put(draft);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            logger.error('Failed to save draft to IndexedDB', { error });
            // Fallback به localStorage با رمزنگاری
            this.#save_draft_to_localstorage_secure();
        }
    }

    /**
     * ذخیره امن پیش‌نویس در localStorage
     */
    #save_draft_to_localstorage_secure() {
        try {
            const data_to_save = {
                username: this.#form_data.username,
                email: this.#form_data.email
            };
            const encrypted = this.#encrypt_data(data_to_save);
            localStorage.setItem('register_draft_secure', encrypted);
        } catch (error) {
            logger.error('Failed to save draft securely', { error });
        }
    }

    /**
     * پاک کردن پیش‌نویس
     */
    async #clear_draft() {
        try {
            if (this.#draft_id) {
                const db = await this.#get_db();
                const transaction = db.transaction(['register_drafts'], 'readwrite');
                const store = transaction.objectStore('register_drafts');
                store.delete(this.#draft_id);
            }
        } catch (error) {
            logger.error('Failed to clear draft from IndexedDB', { error });
        }
        
        try {
            localStorage.removeItem('register_draft_secure');
        } catch (error) {
            logger.error('Failed to clear draft from localStorage', { error });
        }
        
        this.#draft_id = null;
    }

    /**
     * Auto-focus روی اولین فیلد
     */
    #auto_focus_first_field() {
        setTimeout(() => {
            const first_input = this.#container.querySelector('input[name="username"]');
            if (first_input) {
                first_input.focus();
            }
        }, 100);
    }

    /**
     * بررسی محدودیت نرخ ثبت‌نام
     */
    #check_rate_limit() {
        const now = Date.now();
        const time_window = 60000; // 1 دقیقه
        const max_attempts = 5; // حداکثر 5 تلاش در دقیقه
        
        // بازنشانی شمارنده اگر time_window گذشته
        if (now - this.#last_attempt_time > time_window) {
            this.#registration_attempts = 0;
        }
        
        if (this.#registration_attempts >= max_attempts) {
            const wait_time = Math.ceil((time_window - (now - this.#last_attempt_time)) / 1000);
            this.#errors.general = `تعداد تلاش‌های مجاز محدود است. ${wait_time} ثانیه دیگر تلاش کنید.`;
            this.#render();
            return false;
        }
        
        return true;
    }

    /**
     * رندر صفحه
     */
    #render() {
        this.#container.innerHTML = '';
        
        const screen_container = document.createElement('div');
        screen_container.className = 'register-screen container py-8 px-4 max-w-md mx-auto';
        screen_container.setAttribute('data-testid', 'register-screen');
        
        // عنوان صفحه
        const header = document.createElement('div');
        header.className = 'mb-8 text-center';
        header.innerHTML = `
            <h1 class="text-3xl font-bold text-gray-800 mb-2">ایجاد حساب کاربری</h1>
            <p class="text-gray-600">به Farsinglish خوش آمدید</p>
        `;
        screen_container.appendChild(header);

        // فرم ثبت‌نام
        const form = document.createElement('form');
        form.className = 'space-y-6';
        form.setAttribute('data-testid', 'register-form');
        form.setAttribute('novalidate', 'true');
        form.onsubmit = (e) => e.preventDefault();

        // فیلد نام کاربری
        const username_container = document.createElement('div');
        username_container.className = 'form-field-container';
        this.#form_inputs.username = form_input({
            type: 'text',
            name: 'username',
            placeholder: 'نام کاربری',
            value: this.#form_data.username,
            required: true,
            min_length: 3,
            max_length: 40,
            autocomplete: 'username',
            class_name: 'w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
            error: this.#errors.username,
            on_input: (value) => {
                this.#form_data.username = value;
                delete this.#errors.username;
                this.#save_draft_to_indexeddb();
                this.#clear_field_error('username');
            }
        });
        username_container.appendChild(this.#form_inputs.username);
        form.appendChild(username_container);

        // فیلد ایمیل
        const email_container = document.createElement('div');
        email_container.className = 'form-field-container';
        this.#form_inputs.email = form_input({
            type: 'email',
            name: 'email',
            placeholder: 'ایمیل',
            value: this.#form_data.email,
            required: true,
            autocomplete: 'email',
            class_name: 'w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
            error: this.#errors.email,
            on_input: (value) => {
                this.#form_data.email = value;
                delete this.#errors.email;
                this.#save_draft_to_indexeddb();
                this.#clear_field_error('email');
            }
        });
        email_container.appendChild(this.#form_inputs.email);
        form.appendChild(email_container);

        // فیلد رمز عبور با نمایش قدرت و قابلیت نمایش/مخفی
        const password_container = document.createElement('div');
        password_container.className = 'form-field-container space-y-2';
        
        // wrapper برای نمایش/مخفی کردن رمز
        const password_wrapper = document.createElement('div');
        password_wrapper.className = 'relative';
        
        this.#form_inputs.password = form_input({
            type: 'password',
            name: 'password',
            placeholder: 'رمز عبور',
            value: this.#form_data.password,
            required: true,
            min_length: 8,
            autocomplete: 'new-password',
            class_name: 'w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12',
            error: this.#errors.password,
            on_input: (value) => {
                this.#form_data.password = value;
                delete this.#errors.password;
                this.#validate_password_match();
                this.#update_password_strength(value);
                this.#clear_field_error('password');
            }
        });
        
        // دکمه نمایش/مخفی کردن رمز
        const toggle_button = document.createElement('button');
        toggle_button.type = 'button';
        toggle_button.className = 'absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700';
        toggle_button.innerHTML = '👁️';
        toggle_button.setAttribute('aria-label', 'نمایش/مخفی کردن رمز عبور');
        toggle_button.onclick = () => {
            const input = this.#form_inputs.password.querySelector('input');
            if (input) {
                input.type = input.type === 'password' ? 'text' : 'password';
                toggle_button.innerHTML = input.type === 'password' ? '👁️' : '🔒';
            }
        };
        
        password_wrapper.appendChild(this.#form_inputs.password);
        password_wrapper.appendChild(toggle_button);
        password_container.appendChild(password_wrapper);
        
        // نوار قدرت رمز عبور
        const strength_meter = password_strength_meter({
            password: this.#form_data.password,
            class_name: 'mt-2'
        });
        this.#form_inputs.password_strength = strength_meter;
        password_container.appendChild(strength_meter);
        
        form.appendChild(password_container);

        // فیلد تکرار رمز عبور با نمایش/مخفی
        const confirm_container = document.createElement('div');
        confirm_container.className = 'form-field-container';
        
        const confirm_wrapper = document.createElement('div');
        confirm_wrapper.className = 'relative';
        
        this.#form_inputs.confirm_password = form_input({
            type: 'password',
            name: 'confirm_password',
            placeholder: 'تکرار رمز عبور',
            value: this.#form_data.confirm_password,
            required: true,
            autocomplete: 'new-password',
            class_name: 'w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12',
            error: this.#errors.confirm_password,
            on_input: (value) => {
                this.#form_data.confirm_password = value;
                this.#validate_password_match();
                this.#clear_field_error('confirm_password');
            }
        });
        
        const confirm_toggle = document.createElement('button');
        confirm_toggle.type = 'button';
        confirm_toggle.className = 'absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700';
        confirm_toggle.innerHTML = '👁️';
        confirm_toggle.setAttribute('aria-label', 'نمایش/مخفی کردن تکرار رمز');
        confirm_toggle.onclick = () => {
            const input = this.#form_inputs.confirm_password.querySelector('input');
            if (input) {
                input.type = input.type === 'password' ? 'text' : 'password';
                confirm_toggle.innerHTML = input.type === 'password' ? '👁️' : '🔒';
            }
        };
        
        confirm_wrapper.appendChild(this.#form_inputs.confirm_password);
        confirm_wrapper.appendChild(confirm_toggle);
        confirm_container.appendChild(confirm_wrapper);
        form.appendChild(confirm_container);

        // Captcha
        const captcha_container = document.createElement('div');
        captcha_container.className = 'form-field-container';
        
        this.#form_inputs.captcha = captcha_widget({
            on_validate: (is_valid) => {
                this.#captcha_validated = is_valid;
                if (!is_valid) {
                    this.#errors.captcha = 'لطفاً کد امنیتی را به درستی وارد کنید';
                } else {
                    delete this.#errors.captcha;
                }
                this.#render();
            },
            class_name: 'w-full'
        });
        captcha_container.appendChild(this.#form_inputs.captcha);
        
        if (this.#errors.captcha) {
            const error_el = document.createElement('p');
            error_el.className = 'text-red-600 text-sm mt-1';
            error_el.setAttribute('data-error-for', 'captcha');
            error_el.textContent = this.#errors.captcha;
            captcha_container.appendChild(error_el);
        }
        
        form.appendChild(captcha_container);

        // گزینه فعال‌سازی 2FA
        const two_factor_container = document.createElement('div');
        two_factor_container.className = 'form-field-container';
        
        const two_factor_checkbox = document.createElement('label');
        two_factor_checkbox.className = 'flex items-center space-x-3 space-x-reverse cursor-pointer';
        two_factor_checkbox.innerHTML = `
            <input type="checkbox" name="enable_2fa" ${this.#form_data.two_factor_enabled ? 'checked' : ''} class="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
            <span class="text-gray-700">فعال‌سازی احراز هویت دو مرحله‌ای (پیشنهادی)</span>
        `;
        
        const checkbox = two_factor_checkbox.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            this.#form_data.two_factor_enabled = e.target.checked;
            if (e.target.checked && !this.#two_factor_setup_complete) {
                this.#show_two_factor_setup();
            }
            this.#render();
        });
        
        two_factor_container.appendChild(two_factor_checkbox);
        form.appendChild(two_factor_container);

        // نمایش خطای عمومی
        if (this.#errors.general) {
            const error_el = document.createElement('div');
            error_el.className = 'bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-200';
            error_el.setAttribute('data-testid', 'general-error');
            error_el.setAttribute('role', 'alert');
            error_el.textContent = this.#errors.general;
            form.appendChild(error_el);
        }

        // دکمه ثبت‌نام
        const button_container = document.createElement('div');
        button_container.className = 'pt-4';
        
        const is_offline = !offline_manager.is_online();
        const button_text = this.#is_loading ? 'در حال ثبت‌نام...' : 
                           is_offline ? 'عدم اتصال به اینترنت' : 'ثبت‌نام';
        
        this.#form_inputs.submit = basic_button({
            text: button_text,
            type: 'submit',
            variant: 'primary',
            full_width: true,
            disabled: this.#is_loading || is_offline || !this.#captcha_validated,
            class_name: 'w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed',
            onclick: () => this.#handle_register()
        });
        button_container.appendChild(this.#form_inputs.submit);
        form.appendChild(button_container);

        // لینک ورود
        const login_link_container = document.createElement('div');
        login_link_container.className = 'text-center mt-6';
        login_link_container.innerHTML = `
            <p class="text-gray-600">
                حساب کاربری دارید؟ 
                <a href="#" class="text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-300 rounded" data-testid="login-link">ورود</a>
            </p>
        `;
        
        const login_link = login_link_container.querySelector('a');
        if (login_link) {
            login_link.addEventListener('click', (e) => {
                e.preventDefault();
                this.#track_event('navigate_to_login');
                this.router?.navigate('/login');
            });
        }

        screen_container.appendChild(form);
        screen_container.appendChild(login_link_container);
        this.#container.appendChild(screen_container);
    }

    /**
     * نمایش setup احراز هویت دو مرحله‌ای
     */
    #show_two_factor_setup() {
        if (!this.#two_factor_setup_complete) {
            two_factor_setup({
                container: this.#container,
                on_complete: (secret) => {
                    this.#form_data.two_factor_secret = secret;
                    this.#two_factor_setup_complete = true;
                    this.#track_event('two_factor_enabled');
                },
                on_cancel: () => {
                    this.#form_data.two_factor_enabled = false;
                    this.#render();
                }
            });
        }
    }

    /**
     * به‌روزرسانی نوار قدرت رمز عبور
     */
    #update_password_strength(password) {
        if (this.#form_inputs.password_strength && 
            typeof this.#form_inputs.password_strength.update === 'function') {
            this.#form_inputs.password_strength.update(password);
        }
    }

    /**
     * اتصال رویدادها
     */
    #attach_events() {
        // رویدادهای کلی فرم
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.#is_loading && this.#captcha_validated) {
                this.#handle_register();
            }
        });

        // تشخیص آنلاین/آفلاین
        window.addEventListener('online', () => {
            this.#update_submit_button();
        });

        window.addEventListener('offline', () => {
            this.#update_submit_button();
            this.#errors.general = 'اتصال اینترنت قطع شده است';
            this.#render();
        });
    }

    /**
     * پاک کردن خطای یک فیلد
     */
    #clear_field_error(field_name) {
        const error_element = this.#container.querySelector(`[data-error-for="${field_name}"]`);
        if (error_element) {
            error_element.remove();
        }
    }

    /**
     * اعتبارسنجی تطابق رمز عبور
     */
    #validate_password_match() {
        if (this.#form_data.password && this.#form_data.confirm_password) {
            if (this.#form_data.password !== this.#form_data.confirm_password) {
                this.#errors.confirm_password = 'رمز عبور و تکرار آن مطابقت ندارند';
            } else {
                delete this.#errors.confirm_password;
            }
        }
    }

    /**
     * اعتبارسنجی داده‌های فرم
     * @returns {boolean}
     */
    #validate_form() {
        this.#errors = {};

        // اعتبارسنجی نام کاربری
        if (!this.#form_data.username || this.#form_data.username.trim() === '') {
            this.#errors.username = 'نام کاربری الزامی است';
        } else if (this.#form_data.username.length < 3) {
            this.#errors.username = 'نام کاربری باید حداقل ۳ کاراکتر باشد';
        } else if (this.#form_data.username.length > 40) {
            this.#errors.username = 'نام کاربری باید حداکثر ۴۰ کاراکتر باشد';
        } else if (!/^[a-zA-Z0-9_]+$/.test(this.#form_data.username)) {
            this.#errors.username = 'نام کاربری فقط می‌تواند شامل حروف، اعداد و زیرخط باشد';
        }

        // اعتبارسنجی ایمیل
        if (!this.#form_data.email || this.#form_data.email.trim() === '') {
            this.#errors.email = 'ایمیل الزامی است';
        } else if (!validator.is_email(this.#form_data.email)) {
            this.#errors.email = 'ایمیل معتبر نیست';
        }

        // اعتبارسنجی رمز عبور
        if (!this.#form_data.password) {
            this.#errors.password = 'رمز عبور الزامی است';
        } else if (this.#form_data.password.length < 8) {
            this.#errors.password = 'رمز عبور باید حداقل ۸ کاراکتر باشد';
        } else if (!validator.is_strong_password(this.#form_data.password)) {
            this.#errors.password = 'رمز عبور باید شامل حرف بزرگ، کوچک، عدد و کاراکتر خاص باشد';
        }

        // اعتبارسنجی تکرار رمز عبور
        if (!this.#form_data.confirm_password) {
            this.#errors.confirm_password = 'تکرار رمز عبور الزامی است';
        } else if (this.#form_data.password !== this.#form_data.confirm_password) {
            this.#errors.confirm_password = 'رمز عبور و تکرار آن مطابقت ندارند';
        }

        // اعتبارسنجی Captcha
        if (!this.#captcha_validated) {
            this.#errors.captcha = 'لطفاً کد امنیتی را تأیید کنید';
        }

        return Object.keys(this.#errors).length === 0;
    }

    /**
     * نمایش خطاها در فرم
     */
    #display_errors() {
        for (const [field, message] of Object.entries(this.#errors)) {
            if (field === 'general') continue;

            const input = this.#form_inputs[field];
            if (input && typeof input.set_error === 'function') {
                input.set_error(message);
            }
        }
    }

    /**
     * tracking رویدادها برای تحلیل
     */
    #track_event(event_name, extra_data = {}) {
        const event_data = {
            event: event_name,
            timestamp: new Date().toISOString(),
            screen: 'register',
            username_length: this.#form_data.username?.length || 0,
            email_provided: !!this.#form_data.email,
            password_length: this.#form_data.password?.length || 0,
            two_factor_enabled: this.#form_data.two_factor_enabled,
            captcha_validated: this.#captcha_validated,
            is_offline: !offline_manager.is_online(),
            ...extra_data
        };

        // ذخیره در localStorage برای ارسال بعدی
        const events_log = JSON.parse(localStorage.getItem('analytics_events') || '[]');
        events_log.push(event_data);
        
        // نگه‌داری فقط 100 رویداد آخر
        if (events_log.length > 100) {
            events_log.shift();
        }
        
        localStorage.setItem('analytics_events', JSON.stringify(events_log));
        
        // در حالت توسعه، در کنسول هم نمایش بده
        if (process.env.NODE_ENV === 'development') {
            logger.debug('Analytics event', event_data);
        }
    }

    /**
     * پردازش ثبت‌نام
     */
    async #handle_register() {
        if (this.#is_loading) return;

        this.#start_performance_tracking('registration');

        // بررسی وضعیت آفلاین
        if (!offline_manager.is_online()) {
            this.#errors.general = 'برای ثبت‌نام به اتصال اینترنت نیاز دارید';
            this.#render();
            this.#track_event('registration_failed_offline');
            return;
        }

        // بررسی محدودیت نرخ
        if (!this.#check_rate_limit()) {
            this.#render();
            this.#track_event('registration_rate_limited');
            return;
        }

        // اعتبارسنجی فرم
        if (!this.#validate_form()) {
            this.#display_errors();
            this.#track_event('registration_validation_failed', { errors: Object.keys(this.#errors) });
            logger.warn('Registration validation failed', { errors: this.#errors });
            this.#notify_state_change();
            return;
        }

        this.#is_loading = true;
        this.#update_submit_button();
        this.#notify_state_change();

        try {
            logger.info('Attempting registration', { 
                username: this.#form_data.username,
                two_factor_enabled: this.#form_data.two_factor_enabled 
            });

            this.#track_event('registration_attempt');

            // افزایش شمارنده تلاش‌ها
            this.#registration_attempts++;
            this.#last_attempt_time = Date.now();

            // آماده‌سازی داده برای ارسال
            const registration_data = {
                username: this.#form_data.username.trim(),
                email: this.#form_data.email.trim().toLowerCase(),
                password: this.#form_data.password,
                csrf_token: this.#csrf_token,
                captcha_validated: this.#captcha_validated,
                two_factor: this.#form_data.two_factor_enabled ? {
                    enabled: true,
                    secret: this.#form_data.two_factor_secret
                } : { enabled: false },
                client_info: {
                    timestamp: Date.now(),
                    user_agent: navigator.userAgent,
                    language: navigator.language,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    screen_size: `${window.screen.width}x${window.screen.height}`
                }
            };

            const result = await auth_service.register(registration_data);

            if (result.success) {
                logger.info('Registration successful', { 
                    username: this.#form_data.username,
                    user_id: result.user?.id 
                });
                
                this.#track_event('registration_success', { user_id: result.user?.id });
                
                await this.#clear_draft();
                
                // ذخیره اطلاعات کاربر در state
                state_manager.setState({
                    user: result.user,
                    is_authenticated: true,
                    session_id: result.session_id,
                    two_factor_required: result.two_factor_required || false
                });

                // ذخیره session
                if (result.session_id) {
                    session_manager.set_session({
                        session_id: result.session_id,
                        user_id: result.user.id,
                        expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 روز
                    });
                }

                // انتقال به صفحه اصلی یا تکمیل 2FA
                if (result.two_factor_required && !result.two_factor_verified) {
                    this.router?.navigate('/two-factor-verification', {
                        state: { user_id: result.user.id }
                    });
                } else {
                    this.router?.navigate('/home');
                }
            } else {
                this.#errors.general = result.message || 'خطا در ثبت‌نام';
                this.#render();
                this.#track_event('registration_failed', { reason: result.message });
                logger.error('Registration failed', { message: result.message });
            }
        } catch (error) {
            this.#errors.general = 'خطا در ارتباط با سرور. لطفاً مجدداً تلاش کنید.';
            this.#render();
            this.#track_event('registration_error', { error: error.message });
            logger.error('Registration error', { error });
        } finally {
            this.#is_loading = false;
            this.#update_submit_button();
            this.#notify_state_change();
            this.#end_performance_tracking('registration');
        }
    }

    /**
     * بروزرسانی وضعیت دکمه ثبت
     */
    #update_submit_button() {
        const is_offline = !offline_manager.is_online();
        
        if (this.#form_inputs.submit && typeof this.#form_inputs.submit.set_text === 'function') {
            const button_text = this.#is_loading ? 'در حال ثبت‌نام...' : 
                               is_offline ? 'عدم اتصال به اینترنت' : 'ثبت‌نام';
            this.#form_inputs.submit.set_text(button_text);
        }
        if (this.#form_inputs.submit && typeof this.#form_inputs.submit.set_disabled === 'function') {
            this.#form_inputs.submit.set_disabled(this.#is_loading || is_offline || !this.#captcha_validated);
        }
    }

    /**
     * ثبت تغییر وضعیت
     */
    #notify_state_change() {
        const state = {
            is_loading: this.#is_loading,
            errors: { ...this.#errors },
            form_data: { 
                username: this.#form_data.username,
                email: this.#form_data.email,
                two_factor_enabled: this.#form_data.two_factor_enabled
            },
            captcha_validated: this.#captcha_validated,
            two_factor_complete: this.#two_factor_setup_complete
        };
        
        this.#state_change_listeners.forEach(listener => {
            try {
                listener(state);
            } catch (error) {
                logger.error('State change listener failed', { error });
            }
        });
    }

    /**
     * اشتراک‌گذاری تغییرات وضعیت
     * @param {Function} listener 
     * @returns {Function} تابع لغو اشتراک
     */
    on_state_change(listener) {
        if (typeof listener !== 'function') {
            throw new Error('listener must be a function');
        }

        this.#state_change_listeners.push(listener);

        // برگرداندن تابع لغو اشتراک
        return () => {
            this.#state_change_listeners = this.#state_change_listeners.filter(l => l !== listener);
        };
    }

    /**
     * پاکسازی منابع
     */
    dispose() {
        this.#track_event('screen_closed');
        
        this.#state_change_listeners = [];
        this.#form_inputs = {};
        this.#container.innerHTML = '';
        this.#pending_redirect = false;
        this.#performance_timers = {};
        
        logger.info('RegisterScreen disposed', { component: 'RegisterScreen' });
    }
}

export { RegisterScreen };
```
