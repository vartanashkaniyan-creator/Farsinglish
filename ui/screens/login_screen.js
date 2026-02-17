// ui/screens/login_screen.js
/**
 * @file صفحه ورود به حساب کاربری - نسخه پیشرفته با قابلیت‌های الحاقی
 * @version 2.0.0
 * 
 * این ماژول مسئولیت نمایش فرم ورود، اعتبارسنجی پیشرفته ورودی‌ها،
 * مدیریت نشست کاربر، پشتیبانی از RTL، انیمیشن‌ها، ذخیره موقت اطلاعات،
 * و ارتباط با سرویس احراز هویت را بر عهده دارد.
 * 
 * قابلیت‌های جدید:
 * - ورود با رمز یکبارمصرف (OTP)
 * - ورود با حساب‌های اجتماعی (گوگل، گیت‌هاب)
 * - کپچای ساده (ضد ربات)
 * - ذخیره چند حساب کاربری
 * - تأیید دو مرحله‌ای (2FA)
 * 
 * @requires ../../core/auth/auth_service.js
 * @requires ../../core/auth/session_manager.js
 * @requires ../../core/state/state_manager.js
 * @requires ../../core/utils/logger.js
 * @requires ../../core/offline/offline_manager.js
 * @requires ../components/form_input.js
 * @requires ../components/basic_button.js
 * @requires ../../features/auth/otp_service.js
 * @requires ../../features/auth/social_login.js
 * @requires ../../features/security/captcha.js
 * @requires ../../features/auth/multi_account.js
 * @requires ../../features/security/two_factor.js
 */

import auth_service from '../../core/auth/auth_service.js';
import session_manager from '../../core/auth/session_manager.js';
import state_manager from '../../core/state/state_manager.js';
import logger from '../../core/utils/logger.js';
import offline_manager from '../../core/offline/offline_manager.js';
import FormInput from '../components/form_input.js';
import BasicButton from '../components/basic_button.js';
import otp_service from '../../features/auth/otp_service.js';
import social_login from '../../features/auth/social_login.js';
import captcha from '../../features/security/captcha.js';
import multi_account from '../../features/auth/multi_account.js';
import two_factor from '../../features/security/two_factor.js';

// ===============================
// ثابت‌های پیکربندی
// ===============================

/**
 * فعال/غیرفعال کردن قابلیت‌ها
 * @constant
 * @private
 */
const _FEATURES = {
    ENABLE_OTP: true,
    ENABLE_SOCIAL: true,
    ENABLE_CAPTCHA: true,
    ENABLE_MULTI_ACCOUNT: true,
    ENABLE_2FA: true,
    ENABLE_BIOMETRIC: false // برای نسخه‌های بعدی
};

/**
 * ثابت‌های اعتبارسنجی
 * @constant
 * @private
 */
const _VALIDATION_RULES = {
    EMAIL: {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        max_length: 100,
        min_length: 5,
        message: {
            empty: 'ایمیل نمی‌تواند خالی باشد',
            invalid: 'ایمیل معتبر وارد کنید (مثال: user@domain.com)',
            too_long: 'ایمیل نمی‌تواند بیش از ۱۰۰ کاراکتر باشد',
            too_short: 'ایمیل باید حداقل ۵ کاراکتر باشد'
        }
    },
    PASSWORD: {
        min_length: 6,
        max_length: 50,
        message: {
            empty: 'رمز عبور نمی‌تواند خالی باشد',
            too_short: 'رمز عبور باید حداقل ۶ کاراکتر باشد',
            too_long: 'رمز عبور نمی‌تواند بیش از ۵۰ کاراکتر باشد'
        }
    },
    OTP: {
        length: 6,
        pattern: /^\d{6}$/,
        expiry_seconds: 60,
        message: {
            empty: 'کد یکبارمصرف را وارد کنید',
            invalid: 'کد باید ۶ رقم باشد',
            expired: 'کد منقضی شده است. درخواست کد جدید دهید'
        }
    },
    TWO_FA: {
        length: 6,
        pattern: /^\d{6}$/,
        message: {
            empty: 'کد تأیید دو مرحله‌ای را وارد کنید',
            invalid: 'کد باید ۶ رقم باشد'
        }
    },
    REMEMBER_ME: {
        storage_key: 'farsinglish_remembered_email',
        max_days: 30
    }
};

/**
 * پیام‌های خطای سیستمی
 * @constant
 * @private
 */
const _SYSTEM_MESSAGES = {
    NETWORK_ERROR: 'خطا در برقراری ارتباط. اتصال اینترنت خود را بررسی کنید',
    SERVER_ERROR: 'خطای سرور. لطفاً بعداً دوباره تلاش کنید',
    UNKNOWN_ERROR: 'خطای ناشناخته. با پشتیبانی تماس بگیرید',
    RATE_LIMIT_ERROR: 'تعداد درخواست‌ها بیش از حد مجاز است. چند دقیقه دیگر تلاش کنید',
    SESSION_ERROR: 'خطا در ایجاد نشست. دوباره تلاش کنید',
    VALIDATION_ERROR: 'لطفاً خطاهای فرم را برطرف کنید',
    CAPTCHA_ERROR: 'کد امنیتی اشتباه است',
    OTP_SEND_ERROR: 'خطا در ارسال کد یکبارمصرف',
    SOCIAL_LOGIN_ERROR: 'خطا در ورود با حساب اجتماعی'
};

/**
 * رویدادهای صفحه
 * @constant
 * @private
 */
const _EVENTS = {
    LOGIN_START: 'login:start',
    LOGIN_SUCCESS: 'login:success',
    LOGIN_FAILURE: 'login:failure',
    LOGIN_ERROR: 'login:error',
    VALIDATION_ERROR: 'validation:error',
    FORM_SUBMIT: 'form:submit',
    FIELD_CHANGE: 'field:change',
    REMEMBER_ME_LOADED: 'remember:loaded',
    NETWORK_STATUS_CHANGE: 'network:change',
    OTP_REQUESTED: 'otp:requested',
    OTP_SENT: 'otp:sent',
    OTP_VERIFIED: 'otp:verified',
    SOCIAL_LOGIN_START: 'social:start',
    SOCIAL_LOGIN_SUCCESS: 'social:success',
    SOCIAL_LOGIN_ERROR: 'social:error',
    CAPTCHA_GENERATED: 'captcha:generated',
    CAPTCHA_VERIFIED: 'captcha:verified',
    TWO_FA_REQUIRED: '2fa:required',
    TWO_FA_VERIFIED: '2fa:verified',
    ACCOUNT_SWITCHED: 'account:switched'
};

// ===============================
// کلاس اصلی صفحه ورود
// ===============================

/**
 * کلاس صفحه ورود پیشرفته
 * @class
 * @description صفحه ورود با قابلیت‌های اعتبارسنجی پیشرفته، مدیریت نشست، انیمیشن و RTL
 */
class LoginScreen {
    // ===============================
    // سازنده و مقداردهی اولیه
    // ===============================

    /**
     * سازنده کلاس
     * @param {HTMLElement} container - المان DOM برای رندر صفحه
     * @param {Object} options - گزینه‌های پیکربندی
     * @param {Function} options.on_login_success - کال‌بک پس از ورود موفق
     * @param {Function} options.on_register_click - کال‌بک کلیک روی ثبت‌نام
     * @param {Function} options.on_forgot_password - کال‌بک فراموشی رمز
     * @param {boolean} options.enable_remember_me - فعال‌سازی ذخیره ایمیل
     * @param {boolean} options.enable_animations - فعال‌سازی انیمیشن‌ها
     * @param {string} options.redirect_url - آدرس هدایت پس از ورود
     */
    constructor(container, options = {}) {
        // اعتبارسنجی ورودی
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('ورودی container باید یک المان DOM معتبر باشد');
        }

        // تزریق وابستگی‌ها (Dependency Injection)
        this._container = container;
        this._options = {
            on_login_success: options.on_login_success || null,
            on_register_click: options.on_register_click || null,
            on_forgot_password: options.on_forgot_password || null,
            enable_remember_me: options.enable_remember_me !== false,
            enable_animations: options.enable_animations !== false,
            redirect_url: options.redirect_url || '/dashboard'
        };

        // وضعیت داخلی صفحه (Immutability رعایت می‌شود)
        this._state = {
            // فیلدهای فرم
            email: '',
            password: '',
            otp_code: '',
            two_factor_code: '',
            captcha_answer: '',
            
            // وضعیت‌های UI
            active_tab: 'password', // 'password', 'otp'
            is_loading: false,
            is_validating: false,
            is_online: navigator.onLine,
            show_password: false,
            remember_me: false,
            captcha_passed: false,
            two_factor_required: false,
            
            // خطاها
            errors: {
                email: '',
                password: '',
                otp: '',
                two_factor: '',
                captcha: '',
                general: ''
            },
            
            // آمار و متریک‌ها
            metrics: {
                attempt_count: 0,
                last_attempt_time: null,
                validation_time_ms: 0,
                otp_request_count: 0,
                last_otp_request: null
            },
            
            // داده‌های قابلیت‌ها
            features: {
                captcha_question: '',
                captcha_expected: 0,
                otp_timer: 0,
                otp_timer_interval: null,
                saved_accounts: [],
                social_providers: ['google', 'github']
            },
            
            // وضعیت کامپوننت‌ها
            components: {
                email_input: null,
                password_input: null,
                otp_input: null,
                two_factor_input: null,
                captcha_input: null,
                submit_button: null,
                social_buttons: []
            },
            
            // انیمیشن‌ها
            animations: {
                fade_in: false,
                slide_up: false,
                tab_switch: false
            }
        };

        // کامپوننت‌های فرزند
        this._components = {};

        // تایمرها و اینتروال‌ها (برای پاکسازی در destroy)
        this._timers = {
            validation_timer: null,
            animation_timer: null,
            network_check_timer: null,
            otp_timer: null
        };

        // لاگ اولیه
        logger.info('LoginScreen constructor called', 'login_screen', {
            enable_remember_me: this._options.enable_remember_me,
            enable_animations: this._options.enable_animations,
            is_online: this._state.is_online,
            features: _FEATURES
        });

        // مقداردهی اولیه
        this._initialize();
    }

    // ===============================
    // متدهای خصوصی (کپسوله‌سازی)
    // ===============================

    /**
     * مقداردهی اولیه صفحه
     * @private
     * @description راه‌اندازی همه زیرسیستم‌ها
     */
    _initialize() {
        try {
            // بررسی وضعیت آنلاین
            this._setup_network_listener();
            
            // بارگذاری ایمیل ذخیره شده
            if (this._options.enable_remember_me) {
                this._load_remembered_email();
            }
            
            // بارگذاری حساب‌های ذخیره شده (اگر فعال باشد)
            if (_FEATURES.ENABLE_MULTI_ACCOUNT) {
                this._load_saved_accounts();
            }
            
            // تولید کپچا (اگر فعال باشد)
            if (_FEATURES.ENABLE_CAPTCHA) {
                this._generate_captcha();
            }
            
            // رندر اولیه
            this._render();
            
            // اتصال رویدادها
            this._attach_events();
            
            // مقداردهی کامپوننت‌ها
            this._initialize_components();
            
            // اجرای انیمیشن ورود
            if (this._options.enable_animations) {
                this._run_entry_animation();
            }
            
            // گزارش به state_manager
            state_manager.dispatch({
                type: 'screen:initialized',
                payload: { screen: 'login' }
            });
            
            logger.info('LoginScreen initialized successfully', 'login_screen', {
                has_remembered_email: !!this._state.email,
                is_online: this._state.is_online,
                saved_accounts_count: this._state.features.saved_accounts.length
            });
        } catch (error) {
            logger.error('LoginScreen initialization failed', 'login_screen', {
                message: error.message,
                stack: error.stack
            });
            this._show_fatal_error('خطا در راه‌اندازی صفحه');
        }
    }

    /**
     * بارگذاری حساب‌های ذخیره شده
     * @private
     */
    _load_saved_accounts() {
        try {
            const accounts = multi_account.get_saved_accounts();
            this._update_state({
                features: {
                    ...this._state.features,
                    saved_accounts: accounts
                }
            });
            
            if (accounts.length > 0) {
                logger.info('Saved accounts loaded', 'login_screen', { count: accounts.length });
            }
        } catch (error) {
            logger.error('Failed to load saved accounts', 'login_screen', error);
        }
    }

    /**
     * تولید کپچای جدید
     * @private
     */
    _generate_captcha() {
        const { question, answer } = captcha.generate_simple();
        this._update_state({
            features: {
                ...this._state.features,
                captcha_question: question,
                captcha_expected: answer
            },
            captcha_passed: false,
            errors: { ...this._state.errors, captcha: '' }
        });
        
        this._emit_event(_EVENTS.CAPTCHA_GENERATED, { question });
    }

    /**
     * راه‌اندازی شنونده وضعیت شبکه
     * @private
     */
    _setup_network_listener() {
        window.addEventListener('online', () => {
            this._update_state({ is_online: true });
            this._show_notification('اتصال اینترنت برقرار شد', 'success');
            logger.info('Network became online', 'login_screen');
        });

        window.addEventListener('offline', () => {
            this._update_state({ is_online: false });
            this._show_notification('اتصال اینترنت قطع شد', 'warning');
            logger.warn('Network became offline', 'login_screen');
        });

        // بررسی دوره‌ای با offline_manager
        this._timers.network_check_timer = setInterval(() => {
            const is_online = offline_manager.is_online();
            if (is_online !== this._state.is_online) {
                this._update_state({ is_online });
            }
        }, 30000); // هر ۳۰ ثانیه
    }

    /**
     * بارگذاری ایمیل ذخیره شده
     * @private
     */
    _load_remembered_email() {
        try {
            const remembered = localStorage.getItem(_VALIDATION_RULES.REMEMBER_ME.storage_key);
            if (remembered) {
                const { email, timestamp } = JSON.parse(remembered);
                const days_passed = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
                
                if (days_passed <= _VALIDATION_RULES.REMEMBER_ME.max_days) {
                    this._update_state({ 
                        email: email,
                        remember_me: true 
                    });
                    
                    logger.info('Remembered email loaded', 'login_screen', { email });
                    
                    // انتشار رویداد
                    this._emit_event(_EVENTS.REMEMBER_ME_LOADED, { email });
                } else {
                    localStorage.removeItem(_VALIDATION_RULES.REMEMBER_ME.storage_key);
                }
            }
        } catch (error) {
            logger.error('Failed to load remembered email', 'login_screen', error);
        }
    }

    /**
     * ذخیره ایمیل برای دفعه بعد
     * @private
     */
    _save_remembered_email() {
        try {
            if (this._state.remember_me && this._state.email) {
                const data = {
                    email: this._state.email,
                    timestamp: Date.now()
                };
                localStorage.setItem(
                    _VALIDATION_RULES.REMEMBER_ME.storage_key,
                    JSON.stringify(data)
                );
                logger.info('Email saved for next time', 'login_screen');
            } else {
                localStorage.removeItem(_VALIDATION_RULES.REMEMBER_ME.storage_key);
            }
        } catch (error) {
            logger.error('Failed to save remembered email', 'login_screen', error);
        }
    }

    /**
     * درخواست کد OTP
     * @private
     */
    async _request_otp() {
        if (!this._state.email || this._validate_field('email') === false) {
            this._show_notification('ابتدا ایمیل معتبر وارد کنید', 'error');
            return;
        }

        this._emit_event(_EVENTS.OTP_REQUESTED, { email: this._state.email });

        try {
            this._update_state({
                metrics: {
                    ...this._state.metrics,
                    otp_request_count: this._state.metrics.otp_request_count + 1,
                    last_otp_request: Date.now()
                }
            });

            const result = await otp_service.request_otp(this._state.email);

            if (result.success) {
                // شروع تایمر
                this._start_otp_timer();
                
                this._show_notification(`کد یکبارمصرف به ${this._state.email} ارسال شد`, 'success');
                this._emit_event(_EVENTS.OTP_SENT, { email: this._state.email });
                
                logger.info('OTP sent successfully', 'login_screen', { 
                    email: this._state.email 
                });
            } else {
                throw new Error(result.error || _SYSTEM_MESSAGES.OTP_SEND_ERROR);
            }
        } catch (error) {
            this._show_notification(error.message, 'error');
            this._emit_event(_EVENTS.OTP_SENT, { error: error.message });
            
            logger.error('OTP request failed', 'login_screen', { 
                email: this._state.email,
                error: error.message 
            });
        }
    }

    /**
     * شروع تایمر OTP
     * @private
     */
    _start_otp_timer() {
        this._update_state({
            features: {
                ...this._state.features,
                otp_timer: _VALIDATION_RULES.OTP.expiry_seconds
            }
        });

        if (this._timers.otp_timer) {
            clearInterval(this._timers.otp_timer);
        }

        this._timers.otp_timer = setInterval(() => {
            const current = this._state.features.otp_timer;
            
            if (current <= 1) {
                clearInterval(this._timers.otp_timer);
                this._update_state({
                    features: {
                        ...this._state.features,
                        otp_timer: 0
                    }
                });
                
                // نمایش پیام انقضا
                this._show_notification('کد یکبارمصرف منقضی شد. درخواست جدید دهید', 'warning');
            } else {
                this._update_state({
                    features: {
                        ...this._state.features,
                        otp_timer: current - 1
                    }
                });
            }
            
            // به‌روزرسانی UI
            this._update_otp_timer_display();
        }, 1000);
    }

    /**
     * به‌روزرسانی نمایش تایمر OTP
     * @private
     */
    _update_otp_timer_display() {
        const timer_element = document.getElementById('otp-timer');
        if (timer_element) {
            timer_element.textContent = this._state.features.otp_timer;
        }
    }

    /**
     * مقداردهی کامپوننت‌های فرزند
     * @private
     */
    _initialize_components() {
        // کامپوننت‌ها بعد از رندر مقداردهی می‌شوند
        setTimeout(() => {
            const email_element = document.getElementById('login-email');
            const password_element = document.getElementById('login-password');
            const otp_element = document.getElementById('login-otp');
            const two_factor_element = document.getElementById('login-2fa');
            const captcha_element = document.getElementById('login-captcha');
            const submit_element = document.getElementById('login-submit');

            if (email_element) {
                this._components.email_input = new FormInput(email_element, {
                    type: 'email',
                    label: 'ایمیل',
                    on_change: (value) => this._handle_field_change('email', value)
                });
            }

            if (password_element) {
                this._components.password_input = new FormInput(password_element, {
                    type: 'password',
                    label: 'رمز عبور',
                    on_change: (value) => this._handle_field_change('password', value)
                });
            }

            if (otp_element) {
                this._components.otp_input = new FormInput(otp_element, {
                    type: 'text',
                    label: 'کد یکبارمصرف',
                    maxlength: _VALIDATION_RULES.OTP.length,
                    pattern: _VALIDATION_RULES.OTP.pattern,
                    on_change: (value) => this._handle_field_change('otp_code', value)
                });
            }

            if (two_factor_element) {
                this._components.two_factor_input = new FormInput(two_factor_element, {
                    type: 'text',
                    label: 'کد تأیید دو مرحله‌ای',
                    maxlength: _VALIDATION_RULES.TWO_FA.length,
                    pattern: _VALIDATION_RULES.TWO_FA.pattern,
                    on_change: (value) => this._handle_field_change('two_factor_code', value)
                });
            }

            if (captcha_element) {
                this._components.captcha_input = new FormInput(captcha_element, {
                    type: 'number',
                    label: 'حاصل عبارت',
                    on_change: (value) => this._handle_field_change('captcha_answer', parseInt(value) || 0)
                });
            }

            if (submit_element) {
                this._components.submit_button = new BasicButton(submit_element, {
                    text: this._state.active_tab === 'password' ? 'ورود با رمز عبور' : 'ورود با کد یکبارمصرف',
                    on_click: () => this._handle_submit()
                });
            }

            // مقداردهی دکمه‌های اجتماعی
            if (_FEATURES.ENABLE_SOCIAL) {
                this._state.features.social_providers.forEach(provider => {
                    const btn = document.getElementById(`social-${provider}`);
                    if (btn) {
                        this._components.social_buttons.push({
                            provider,
                            element: btn,
                            handler: () => this._handle_social_login(provider)
                        });
                        btn.addEventListener('click', () => this._handle_social_login(provider));
                    }
                });
            }
        }, 100);
    }

    /**
     * اجرای انیمیشن ورود به صفحه
     * @private
     */
    _run_entry_animation() {
        this._update_state({
            animations: {
                fade_in: true,
                slide_up: true,
                tab_switch: false
            }
        });

        this._timers.animation_timer = setTimeout(() => {
            this._update_state({
                animations: {
                    fade_in: false,
                    slide_up: false,
                    tab_switch: false
                }
            });
        }, 500);
    }

    /**
     * نمایش اعلان به کاربر
     * @private
     * @param {string} message - پیام
     * @param {string} type - نوع (success, error, warning, info)
     */
    _show_notification(message, type = 'info') {
        const event = new CustomEvent('notification:show', {
            detail: { message, type, duration: 3000 }
        });
        window.dispatchEvent(event);
    }

    /**
     * نمایش خطای بحرانی
     * @private
     * @param {string} message - پیام خطا
     */
    _show_fatal_error(message) {
        this._container.innerHTML = `
            <div class="fatal-error" role="alert">
                <h3>خطای بحرانی</h3>
                <p>${message}</p>
                <button onclick="window.location.reload()" class="btn btn-primary">
                    تلاش مجدد
                </button>
            </div>
        `;
    }

    /**
     * انتشار رویداد صفحه
     * @private
     * @param {string} event_name - نام رویداد
     * @param {Object} detail - جزئیات رویداد
     */
    _emit_event(event_name, detail = {}) {
        const event = new CustomEvent(event_name, { detail });
        this._container.dispatchEvent(event);
        
        // لاگ رویدادهای مهم
        if (event_name.includes('success') || event_name.includes('error')) {
            logger.info(`Event emitted: ${event_name}`, 'login_screen', detail);
        }
    }

    /**
     * به‌روزرسانی state صفحه (با رعایت Immutability)
     * @private
     * @param {Object} new_state - وضعیت جدید
     */
    _update_state(new_state) {
        this._state = {
            ...this._state,
            ...new_state,
            errors: {
                ...this._state.errors,
                ...(new_state.errors || {})
            },
            metrics: {
                ...this._state.metrics,
                ...(new_state.metrics || {})
            },
            features: {
                ...this._state.features,
                ...(new_state.features || {})
            }
        };
    }

    /**
     * رندر UI صفحه
     * @private
     */
    _render() {
        const animation_class = this._options.enable_animations 
            ? `${this._state.animations.fade_in ? 'fade-in' : ''} ${this._state.animations.slide_up ? 'slide-up' : ''}`
            : '';

        // ساخت HTML حساب‌های ذخیره شده
        const saved_accounts_html = _FEATURES.ENABLE_MULTI_ACCOUNT && this._state.features.saved_accounts.length > 0
            ? `
                <div class="saved-accounts">
                    <label class="form-label">ورود سریع با حساب‌های ذخیره شده</label>
                    <div class="account-list">
                        ${this._state.features.saved_accounts.map(account => `
                            <button type="button" class="account-item" data-email="${account.email}">
                                <span class="account-avatar">${account.email.charAt(0).toUpperCase()}</span>
                                <span class="account-email">${account.email}</span>
                                ${account.has_2fa ? '<span class="account-2fa">🔒</span>' : ''}
                            </button>
                        `).join('')}
                    </div>
                </div>
            ` : '';

        // ساخت HTML تب‌ها
        const tabs_html = _FEATURES.ENABLE_OTP ? `
            <div class="login-tabs">
                <button type="button" class="tab-btn ${this._state.active_tab === 'password' ? 'active' : ''}" data-tab="password">
                    <span class="tab-icon">🔑</span>
                    رمز عبور
                </button>
                <button type="button" class="tab-btn ${this._state.active_tab === 'otp' ? 'active' : ''}" data-tab="otp">
                    <span class="tab-icon">📱</span>
                    کد یکبارمصرف
                </button>
            </div>
        ` : '';

        // ساخت HTML دکمه‌های اجتماعی
        const social_html = _FEATURES.ENABLE_SOCIAL ? `
            <div class="social-login">
                <div class="social-divider">
                    <span>یا ورود با</span>
                </div>
                <div class="social-buttons">
                    <button type="button" id="social-google" class="social-btn google">
                        <svg width="20" height="20" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
                        </svg>
                        گوگل
                    </button>
                    <button type="button" id="social-github" class="social-btn github">
                        <svg width="20" height="20" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M12,2C6.477,2,2,6.477,2,12c0,4.419,2.865,8.166,6.839,9.489c0.5,0.09,0.682-0.218,0.682-0.484c0-0.236-0.009-0.866-0.014-1.699c-2.782,0.602-3.369-1.34-3.369-1.34c-0.455-1.157-1.11-1.465-1.11-1.465c-0.909-0.62,0.069-0.608,0.069-0.608c1.004,0.071,1.532,1.03,1.532,1.03c0.891,1.529,2.341,1.089,2.91,0.833c0.091-0.647,0.349-1.086,0.635-1.337c-2.22-0.251-4.555-1.111-4.555-4.943c0-1.091,0.39-1.984,1.03-2.682c-0.103-0.252-0.447-1.27,0.098-2.646c0,0,0.84-0.269,2.75,1.025c0.798-0.222,1.654-0.333,2.505-0.337c0.85,0.004,1.707,0.115,2.505,0.337c1.91-1.294,2.75-1.025,2.75-1.025c0.545,1.376,0.201,2.394,0.098,2.646c0.64,0.698,1.03,1.591,1.03,2.682c0,3.839-2.338,4.688-4.566,4.935c0.359,0.309,0.679,0.919,0.679,1.852c0,1.337-0.012,2.415-0.012,2.743c0,0.267,0.18,0.578,0.688,0.48C19.138,20.161,22,16.418,22,12C22,6.477,17.523,2,12,2z"/>
                        </svg>
                        گیت‌هاب
                    </button>
                </div>
            </div>
        ` : '';

        // ساخت HTML کپچا
        const captcha_html = _FEATURES.ENABLE_CAPTCHA && !this._state.captcha_passed ? `
            <div class="captcha-container">
                <div class="captcha-question">
                    <span class="question">${this._state.features.captcha_question} = ?</span>
                </div>
                <div class="form-group ${this._state.errors.captcha ? 'has-error' : ''}">
                    <input 
                        type="number" 
                        id="login-captcha" 
                        class="form-input captcha-input"
                        value="${this._state.captcha_answer}"
                        placeholder="حاصل عبارت"
                        ${this._state.is_loading ? 'disabled' : ''}
                        dir="ltr"
                    />
                    ${this._state.errors.captcha ? `
                        <div class="field-error">${this._state.errors.captcha}</div>
                    ` : ''}
                    <button type="button" class="refresh-captcha" title="کد جدید">
                        🔄
                    </button>
                </div>
            </div>
        ` : '';

        // ساخت HTML فیلد 2FA
        const two_factor_html = this._state.two_factor_required ? `
            <div class="form-group ${this._state.errors.two_factor ? 'has-error' : ''}">
                <label for="login-2fa" class="form-label">
                    کد تأیید دو مرحله‌ای
                    <span class="required-star">*</span>
                </label>
                <input 
                    type="text" 
                    id="login-2fa" 
                    class="form-input"
                    value="${this._state.two_factor_code}"
                    placeholder="۶ رقم"
                    maxlength="6"
                    pattern="\\d{6}"
                    required
                    ${this._state.is_loading ? 'disabled' : ''}
                    dir="ltr"
                />
                ${this._state.errors.two_factor ? `
                    <div class="field-error">${this._state.errors.two_factor}</div>
                ` : ''}
                <small class="field-hint">
                    کد را از اپلیکیشن احراز هویت وارد کنید
                </small>
            </div>
        ` : '';

        const template = `
            <div class="login-screen ${animation_class}" dir="rtl">
                <div class="login-container">
                    <!-- هدر -->
                    <div class="login-header">
                        <h1 class="login-title">ورود به حساب</h1>
                        <p class="login-subtitle">برای ادامه، وارد حساب خود شوید</p>
                    </div>

                    <!-- نشانگر وضعیت آنلاین -->
                    ${!this._state.is_online ? `
                        <div class="offline-indicator" role="alert">
                            ⚠️ شما در حالت آفلاین هستید. ورود نیاز به اینترنت دارد.
                        </div>
                    ` : ''}

                    <!-- پیام خطای عمومی -->
                    ${this._state.errors.general ? `
                        <div class="error-message" role="alert">
                            <span class="error-icon">❌</span>
                            ${this._state.errors.general}
                        </div>
                    ` : ''}

                    <!-- حساب‌های ذخیره شده -->
                    ${saved_accounts_html}

                    <!-- تب‌های ورود -->
                    ${tabs_html}

                    <!-- فرم اصلی -->
                    <form id="login-form" class="login-form" novalidate>
                        <!-- فیلد ایمیل (مشترک) -->
                        <div class="form-group ${this._state.errors.email ? 'has-error' : ''}">
                            <label for="login-email" class="form-label">
                                ایمیل
                                <span class="required-star">*</span>
                            </label>
                            <input 
                                type="email" 
                                id="login-email" 
                                name="email" 
                                class="form-input"
                                value="${this._state.email}"
                                placeholder="example@domain.com"
                                required
                                aria-required="true"
                                aria-describedby="email-error"
                                ${this._state.is_loading ? 'disabled' : ''}
                                dir="ltr"
                            />
                            ${this._state.errors.email ? `
                                <div id="email-error" class="field-error" role="alert">
                                    ${this._state.errors.email}
                                </div>
                            ` : ''}
                        </div>

                        <!-- فیلدهای مخصوص تب رمز عبور -->
                        ${this._state.active_tab === 'password' ? `
                            <!-- فیلد رمز عبور -->
                            <div class="form-group ${this._state.errors.password ? 'has-error' : ''}">
                                <label for="login-password" class="form-label">
                                    رمز عبور
                                    <span class="required-star">*</span>
                                </label>
                                <div class="password-wrapper">
                                    <input 
                                        type="${this._state.show_password ? 'text' : 'password'}" 
                                        id="login-password" 
                                        name="password" 
                                        class="form-input password-input"
                                        value="${this._state.password}"
                                        placeholder="••••••••"
                                        required
                                        minlength="${_VALIDATION_RULES.PASSWORD.min_length}"
                                        maxlength="${_VALIDATION_RULES.PASSWORD.max_length}"
                                        ${this._state.is_loading ? 'disabled' : ''}
                                        dir="ltr"
                                    />
                                    <button 
                                        type="button" 
                                        class="toggle-password" 
                                        aria-label="${this._state.show_password ? 'مخفی کردن' : 'نمایش'} رمز عبور"
                                    >
                                        ${this._state.show_password ? '👁️' : '👁️‍🗨️'}
                                    </button>
                                </div>
                                ${this._state.errors.password ? `
                                    <div class="field-error">${this._state.errors.password}</div>
                                ` : ''}
                            </div>

                            <!-- گزینه‌های اضافی -->
                            <div class="form-options">
                                <label class="checkbox-label">
                                    <input 
                                        type="checkbox" 
                                        name="remember" 
                                        ${this._state.remember_me ? 'checked' : ''}
                                        ${this._state.is_loading ? 'disabled' : ''}
                                    />
                                    <span>مرا به خاطر بسپار</span>
                                </label>
                                <button 
                                    type="button" 
                                    class="link-button forgot-password"
                                    ${this._state.is_loading ? 'disabled' : ''}
                                >
                                    رمز عبور را فراموش کرده‌اید؟
                                </button>
                            </div>
                        ` : ''}

                        <!-- فیلدهای مخصوص تب OTP -->
                        ${this._state.active_tab === 'otp' ? `
                            <!-- دکمه درخواست کد -->
                            <div class="otp-request-section">
                                <button 
                                    type="button" 
                                    id="request-otp-btn" 
                                    class="btn btn-secondary btn-block"
                                    ${this._state.is_loading || !this._state.is_online ? 'disabled' : ''}
                                >
                                    دریافت کد یکبارمصرف
                                </button>
                                
                                ${this._state.features.otp_timer > 0 ? `
                                    <div class="otp-timer">
                                        <span>زمان باقی‌مانده: </span>
                                        <span id="otp-timer" class="timer-value">${this._state.features.otp_timer}</span>
                                        <span>ثانیه</span>
                                    </div>
                                ` : ''}
                            </div>

                            <!-- فیلد کد OTP -->
                            <div class="form-group ${this._state.errors.otp ? 'has-error' : ''}">
                                <label for="login-otp" class="form-label">
                                    کد یکبارمصرف
                                    <span class="required-star">*</span>
                                </label>
                                <input 
                                    type="text" 
                                    id="login-otp" 
                                    class="form-input"
                                    value="${this._state.otp_code}"
                                    placeholder="۶ رقم"
                                    maxlength="6"
                                    pattern="\\d{6}"
                                    required
                                    ${this._state.is_loading || this._state.features.otp_timer === 0 ? 'disabled' : ''}
                                    dir="ltr"
                                />
                                ${this._state.errors.otp ? `
                                    <div class="field-error">${this._state.errors.otp}</div>
                                ` : ''}
                            </div>
                        ` : ''}

                        <!-- کپچا -->
                        ${captcha_html}

                        <!-- 2FA -->
                        ${two_factor_html}

                        <!-- دکمه ارسال -->
                        <button 
                            type="submit" 
                            id="login-submit"
                            class="btn btn-primary btn-block"
                            ${this._state.is_loading || !this._state.is_online ? 'disabled' : ''}
                        >
                            ${this._state.is_loading ? this._get_loading_text() : 
                              this._state.active_tab === 'password' ? 'ورود با رمز عبور' : 'ورود با کد یکبارمصرف'}
                        </button>

                        <!-- لینک ثبت‌نام -->
                        <div class="register-link">
                            حساب کاربری ندارید؟
                            <button 
                                type="button" 
                                class="link-button register-btn"
                                ${this._state.is_loading ? 'disabled' : ''}
                            >
                                ثبت‌نام کنید
                            </button>
                        </div>
                    </form>

                    <!-- دکمه‌های ورود اجتماعی -->
                    ${social_html}

                    <!-- بخش امنیت -->
                    <div class="security-badge">
                        <span>🔒</span>
                        <small>اطلاعات شما با امنیت بالا منتقل می‌شود</small>
                    </div>
                </div>
            </div>
        `;

        this._container.innerHTML = template;
    }

    /**
     * دریافت متن لودینگ (چرخشی)
     * @private
     * @returns {string} متن لودینگ
     */
    _get_loading_text() {
        const frames = ['در حال ورود', 'در حال ورود.', 'در حال ورود..', 'در حال ورود...'];
        const frame = Math.floor(Date.now() / 500) % frames.length;
        return frames[frame];
    }

    /**
     * اتصال رویدادها به المان‌ها
     * @private
     */
    _attach_events() {
        const form = document.getElementById('login-form');
        const email_input = document.getElementById('login-email');
        const password_input = document.getElementById('login-password');
        const otp_input = document.getElementById('login-otp');
        const two_factor_input = document.getElementById('login-2fa');
        const captcha_input = document.getElementById('login-captcha');
        const toggle_button = document.querySelector('.toggle-password');
        const remember_checkbox = document.querySelector('input[name="remember"]');
        const forgot_button = document.querySelector('.forgot-password');
        const register_button = document.querySelector('.register-btn');
        const refresh_captcha = document.querySelector('.refresh-captcha');
        const request_otp_btn = document.getElementById('request-otp-btn');
        const tabs = document.querySelectorAll('.tab-btn');
        const account_items = document.querySelectorAll('.account-item');

        // رویداد تغییر ایمیل (با debounce)
        email_input?.addEventListener('input', this._debounce((e) => {
            this._handle_field_change('email', e.target.value);
        }, 300));

        // رویداد تغییر رمز عبور (با debounce)
        password_input?.addEventListener('input', this._debounce((e) => {
            this._handle_field_change('password', e.target.value);
        }, 300));

        // رویداد تغییر کد OTP
        otp_input?.addEventListener('input', (e) => {
            this._handle_field_change('otp_code', e.target.value);
        });

        // رویداد تغییر کد 2FA
        two_factor_input?.addEventListener('input', (e) => {
            this._handle_field_change('two_factor_code', e.target.value);
        });

        // رویداد تغییر کپچا
        captcha_input?.addEventListener('input', (e) => {
            this._handle_field_change('captcha_answer', parseInt(e.target.value) || 0);
        });

        // نمایش/مخفی کردن رمز عبور
        toggle_button?.addEventListener('click', () => {
            this._update_state({ show_password: !this._state.show_password });
            this._render();
            this._attach_events();
        });

        // گزینه "مرا به خاطر بسپار"
        remember_checkbox?.addEventListener('change', (e) => {
            this._update_state({ remember_me: e.target.checked });
            logger.debug('Remember me toggled', 'login_screen', { checked: e.target.checked });
        });

        // دکمه فراموشی رمز
        forgot_button?.addEventListener('click', () => {
            if (this._options.on_forgot_password) {
                this._options.on_forgot_password();
            } else {
                window.location.href = '/forgot-password';
            }
        });

        // دکمه ثبت‌نام
        register_button?.addEventListener('click', () => {
            if (this._options.on_register_click) {
                this._options.on_register_click();
            } else {
                window.location.href = '/register';
            }
        });

        // تازه‌سازی کپچا
        refresh_captcha?.addEventListener('click', () => {
            this._generate_captcha();
            this._render();
            this._attach_events();
        });

        // درخواست کد OTP
        request_otp_btn?.addEventListener('click', () => {
            this._request_otp();
        });

        // تغییر تب‌ها
        tabs?.forEach(tab => {
            tab.addEventListener('click', () => {
                const tab_name = tab.dataset.tab;
                this._update_state({ 
                    active_tab: tab_name,
                    otp_code: '',
                    password: '',
                    errors: { email: '', password: '', otp: '', general: '' }
                });
                this._render();
                this._attach_events();
                
                // انیمیشن تغییر تب
                this._update_state({
                    animations: { ...this._state.animations, tab_switch: true }
                });
                setTimeout(() => {
                    this._update_state({
                        animations: { ...this._state.animations, tab_switch: false }
                    });
                }, 300);
            });
        });

        // انتخاب حساب ذخیره شده
        account_items?.forEach(item => {
            item.addEventListener('click', () => {
                const email = item.dataset.email;
                const account = this._state.features.saved_accounts.find(acc => acc.email === email);
                
                if (account) {
                    this._update_state({ 
                        email: account.email,
                        two_factor_required: account.has_2fa || false
                    });
                    
                    this._emit_event(_EVENTS.ACCOUNT_SWITCHED, { email });
                    
                    this._show_notification(`حساب ${email} انتخاب شد`, 'info');
                    
                    // اگر حساب 2FA دارد، پیام نمایش بده
                    if (account.has_2fa) {
                        this._show_notification('این حساب تأیید دو مرحله‌ای فعال دارد', 'warning');
                    }
                    
                    this._render();
                    this._attach_events();
                }
            });
        });

        // ارسال فرم
        form?.addEventListener('submit', (e) => {
            e.preventDefault();
            this._handle_submit();
        });
    }

    /**
     * تابع debounce برای بهینه‌سازی عملکرد
     * @private
     * @param {Function} func - تابع اصلی
     * @param {number} wait - زمان انتظار (میلی‌ثانیه)
     * @returns {Function} تابع debounce شده
     */
    _debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    /**
     * پردازش تغییر فیلدها
     * @private
     * @param {string} field - نام فیلد
     * @param {string|number} value - مقدار جدید
     */
    _handle_field_change(field, value) {
        // به‌روزرسانی state
        this._update_state({ [field]: value });

        // پاک کردن خطای مربوطه
        const new_errors = { ...this._state.errors };
        delete new_errors[field];
        delete new_errors.general;
        this._update_state({ errors: new_errors });

        // اعتبارسنجی بلادرنگ (با delay)
        if (this._timers.validation_timer) {
            clearTimeout(this._timers.validation_timer);
        }

        this._timers.validation_timer = setTimeout(() => {
            if (field === 'email' || field === 'password' || field === 'otp_code' || field === 'two_factor_code') {
                this._validate_field(field);
            }
            
            // اعتبارسنجی خودکار کپچا
            if (field === 'captcha_answer' && value === this._state.features.captcha_expected) {
                this._update_state({ captcha_passed: true });
                this._emit_event(_EVENTS.CAPTCHA_VERIFIED);
            }
        }, 500);

        // انتشار رویداد
        this._emit_event(_EVENTS.FIELD_CHANGE, { field, value });
    }

    /**
     * اعتبارسنجی یک فیلد
     * @private
     * @param {string} field - نام فیلد
     * @returns {boolean} نتیجه اعتبارسنجی
     */
    _validate_field(field) {
        const start_time = performance.now();
        
        let is_valid = true;
        const errors = { ...this._state.errors };

        if (field === 'email' || field === 'all') {
            const email = this._state.email.trim();
            
            if (!email) {
                errors.email = _VALIDATION_RULES.EMAIL.message.empty;
                is_valid = false;
            } else if (email.length < _VALIDATION_RULES.EMAIL.min_length) {
                errors.email = _VALIDATION_RULES.EMAIL.message.too_short;
                is_valid = false;
            } else if (email.length > _VALIDATION_RULES.EMAIL.max_length) {
                errors.email = _VALIDATION_RULES.EMAIL.message.too_long;
                is_valid = false;
            } else if (!_VALIDATION_RULES.EMAIL.pattern.test(email)) {
                errors.email = _VALIDATION_RULES.EMAIL.message.invalid;
                is_valid = false;
            } else {
                delete errors.email;
            }
        }

        if (field === 'password' || (field === 'all' && this._state.active_tab === 'password')) {
            const password = this._state.password;
            
            if (!password) {
                errors.password = _VALIDATION_RULES.PASSWORD.message.empty;
                is_valid = false;
            } else if (password.length < _VALIDATION_RULES.PASSWORD.min_length) {
                errors.password = _VALIDATION_RULES.PASSWORD.message.too_short;
                is_valid = false;
            } else if (password.length > _VALIDATION_RULES.PASSWORD.max_length) {
                errors.password = _VALIDATION_RULES.PASSWORD.message.too_long;
                is_valid = false;
            } else {
                delete errors.password;
            }
        }

        if (field === 'otp_code' || (field === 'all' && this._state.active_tab === 'otp')) {
            const otp = this._state.otp_code;
            
            if (!otp) {
                errors.otp = _VALIDATION_RULES.OTP.message.empty;
                is_valid = false;
            } else if (!_VALIDATION_RULES.OTP.pattern.test(otp)) {
                errors.otp = _VALIDATION_RULES.OTP.message.invalid;
                is_valid = false;
            } else if (this._state.features.otp_timer === 0) {
                errors.otp = _VALIDATION_RULES.OTP.message.expired;
                is_valid = false;
            } else {
                delete errors.otp;
            }
        }

        if (field === 'two_factor_code' || (field === 'all' && this._state.two_factor_required)) {
            const code = this._state.two_factor_code;
            
            if (!code) {
                errors.two_factor = _VALIDATION_RULES.TWO_FA.message.empty;
                is_valid = false;
            } else if (!_VALIDATION_RULES.TWO_FA.pattern.test(code)) {
                errors.two_factor = _VALIDATION_RULES.TWO_FA.message.invalid;
                is_valid = false;
            } else {
                delete errors.two_factor;
            }
        }

        // به‌روزرسانی خطاها و متریک‌ها
        this._update_state({
            errors,
            metrics: {
                ...this._state.metrics,
                validation_time_ms: performance.now() - start_time
            }
        });

        return is_valid;
    }

    /**
     * اعتبارسنجی کامل فرم
     * @private
     * @returns {boolean} نتیجه اعتبارسنجی
     */
    _validate_form() {
        this._update_state({ is_validating: true });
        
        let is_valid = this._validate_field('email');
        
        if (this._state.active_tab === 'password') {
            is_valid = this._validate_field('password') && is_valid;
        } else {
            is_valid = this._validate_field('otp_code') && is_valid;
        }
        
        if (this._state.two_factor_required) {
            is_valid = this._validate_field('two_factor_code') && is_valid;
        }
        
        if (_FEATURES.ENABLE_CAPTCHA && !this._state.captcha_passed) {
            const captcha_valid = this._state.captcha_answer === this._state.features.captcha_expected;
            if (!captcha_valid) {
                this._update_state({
                    errors: {
                        ...this._state.errors,
                        captcha: _SYSTEM_MESSAGES.CAPTCHA_ERROR
                    }
                });
                is_valid = false;
            }
        }
        
        if (!is_valid) {
            this._emit_event(_EVENTS.VALIDATION_ERROR, {
                errors: this._state.errors
            });
        }
        
        this._update_state({ is_validating: false });
        
        return is_valid;
    }

    /**
     * پردازش ارسال فرم
     * @private
     */
    async _handle_submit() {
        // انتشار رویداد شروع
        this._emit_event(_EVENTS.LOGIN_START, { method: this._state.active_tab });

        // افزایش شمارنده تلاش
        this._update_state({
            metrics: {
                ...this._state.metrics,
                attempt_count: this._state.metrics.attempt_count + 1,
                last_attempt_time: Date.now()
            }
        });

        // اعتبارسنجی فرم
        if (!this._validate_form()) {
            this._show_notification('لطفاً خطاهای فرم را برطرف کنید', 'error');
            return;
        }

        // بررسی وضعیت آنلاین
        if (!this._state.is_online) {
            this._update_state({
                errors: {
                    ...this._state.errors,
                    general: _SYSTEM_MESSAGES.NETWORK_ERROR
                }
            });
            this._render();
            this._attach_events();
            
            this._emit_event(_EVENTS.LOGIN_FAILURE, {
                reason: 'offline'
            });
            
            return;
        }

        // شروع لودینگ
        this._update_state({ 
            is_loading: true, 
            errors: { ...this._state.errors, general: '' }
        });
        this._render();
        this._attach_events();

        try {
            let result;
            
            if (this._state.active_tab === 'password') {
                // ورود با رمز عبور
                result = await auth_service.login({
                    email: this._state.email.trim(),
                    password: this._state.password,
                    two_factor_code: this._state.two_factor_required ? this._state.two_factor_code : null
                });
            } else {
                // ورود با OTP
                result = await otp_service.verify_otp({
                    email: this._state.email.trim(),
                    code: this._state.otp_code
                });
            }

            if (result.success) {
                // بررسی نیاز به 2FA
                if (result.requires_two_factor && !this._state.two_factor_required) {
                    this._update_state({ 
                        two_factor_required: true,
                        is_loading: false 
                    });
                    this._render();
                    this._attach_events();
                    
                    this._emit_event(_EVENTS.TWO_FA_REQUIRED);
                    
                    logger.info('2FA required', 'login_screen', { 
                        email: this._state.email 
                    });
                    
                    return;
                }

                // ذخیره ایمیل در صورت درخواست
                if (this._state.remember_me) {
                    this._save_remembered_email();
                    
                    // ذخیره حساب برای دسترسی سریع
                    if (_FEATURES.ENABLE_MULTI_ACCOUNT) {
                        multi_account.save_account({
                            email: this._state.email,
                            has_2fa: this._state.two_factor_required,
                            last_login: new Date().toISOString()
                        });
                    }
                }

                // ایجاد نشست کاربر
                const session = await session_manager.create_session(result.user);
                
                if (!session.success) {
                    throw new Error(_SYSTEM_MESSAGES.SESSION_ERROR);
                }

                // ذخیره در state_manager
                state_manager.set_state({
                    user: result.user,
                    session: session.data,
                    is_authenticated: true,
                    last_login: new Date().toISOString(),
                    login_method: this._state.active_tab
                });

                // انتشار رویداد موفقیت
                this._emit_event(_EVENTS.LOGIN_SUCCESS, {
                    user_id: result.user?.id,
                    session_id: session.data?.id,
                    method: this._state.active_tab
                });

                logger.info('Login successful', 'login_screen', { 
                    user_id: result.user?.id,
                    method: this._state.active_tab
                });

                // نمایش پیام موفقیت
                this._show_notification('ورود موفقیت‌آمیز بود', 'success');

                // پاکسازی تایمر OTP
                if (this._timers.otp_timer) {
                    clearInterval(this._timers.otp_timer);
                }

                // فراخوانی کال‌بک موفقیت
                if (this._options.on_login_success) {
                    this._options.on_login_success(result.user);
                } else {
                    // هدایت به صفحه اصلی
                    window.location.href = this._options.redirect_url;
                }
            } else {
                // خطای احراز هویت
                const error_message = result.error === 'invalid_credentials' 
                    ? 'ایمیل یا رمز عبور اشتباه است'
                    : result.error === 'user_not_found'
                        ? 'کاربری با این ایمیل یافت نشد'
                        : result.error === 'account_locked'
                            ? 'حساب کاربری قفل شده است. با پشتیبانی تماس بگیرید'
                            : result.error === 'invalid_otp'
                                ? 'کد یکبارمصرف اشتباه است'
                                : result.error === 'invalid_2fa'
                                    ? 'کد تأیید دو مرحله‌ای اشتباه است'
                                    : _SYSTEM_MESSAGES.SERVER_ERROR;

                this._update_state({ 
                    errors: {
                        ...this._state.errors,
                        general: error_message
                    },
                    is_loading: false 
                });
                this._render();
                this._attach_events();

                this._emit_event(_EVENTS.LOGIN_FAILURE, {
                    reason: 'auth_failed',
                    error: result.error
                });

                logger.warn('Login failed', 'login_screen', { error: result.error });
                
                // اگر کپچا فعال است، یک کپچای جدید تولید کن
                if (_FEATURES.ENABLE_CAPTCHA) {
                    this._generate_captcha();
                }
            }
        } catch (error) {
            // مدیریت خطاهای شبکه و سرور
            let error_message = _SYSTEM_MESSAGES.UNKNOWN_ERROR;
            
            if (error.message.includes('network') || error.message.includes('fetch')) {
                error_message = _SYSTEM_MESSAGES.NETWORK_ERROR;
            } else if (error.message.includes('timeout')) {
                error_message = 'زمان درخواست به پایان رسید. دوباره تلاش کنید';
            } else if (error.message.includes('rate limit')) {
                error_message = _SYSTEM_MESSAGES.RATE_LIMIT_ERROR;
            } else if (error.message.includes('500')) {
                error_message = _SYSTEM_MESSAGES.SERVER_ERROR;
            }

            this._update_state({ 
                errors: {
                    ...this._state.errors,
                    general: error_message
                },
                is_loading: false 
            });
            this._render();
            this._attach_events();

            this._emit_event(_EVENTS.LOGIN_ERROR, {
                message: error.message,
                code: error.code
            });

            logger.error('Login error', 'login_screen', { 
                message: error.message,
                stack: error.stack 
            });
            
            // اگر کپچا فعال است، یک کپچای جدید تولید کن
            if (_FEATURES.ENABLE_CAPTCHA) {
                this._generate_captcha();
            }
        }
    }

    /**
     * پردازش ورود با حساب اجتماعی
     * @private
     * @param {string} provider - نام ارائه‌دهنده (google, github)
     */
    async _handle_social_login(provider) {
        this._emit_event(_EVENTS.SOCIAL_LOGIN_START, { provider });

        if (!this._state.is_online) {
            this._show_notification(_SYSTEM_MESSAGES.NETWORK_ERROR, 'error');
            return;
        }

        this._update_state({ is_loading: true });
        this._render();
        this._attach_events();

        try {
            const result = await social_login.login(provider);

            if (result.success) {
                // ایجاد نشست کاربر
                const session = await session_manager.create_session(result.user);
                
                if (!session.success) {
                    throw new Error(_SYSTEM_MESSAGES.SESSION_ERROR);
                }

                // ذخیره در state_manager
                state_manager.set_state({
                    user: result.user,
                    session: session.data,
                    is_authenticated: true,
                    last_login: new Date().toISOString(),
                    login_method: `social_${provider}`
                });

                this._emit_event(_EVENTS.SOCIAL_LOGIN_SUCCESS, {
                    provider,
                    user_id: result.user?.id
                });

                logger.info(`Social login successful: ${provider}`, 'login_screen');

                this._show_notification(`ورود با ${provider} موفقیت‌آمیز بود`, 'success');

                if (this._options.on_login_success) {
                    this._options.on_login_success(result.user);
                } else {
                    window.location.href = this._options.redirect_url;
                }
            } else {
                throw new Error(result.error || _SYSTEM_MESSAGES.SOCIAL_LOGIN_ERROR);
            }
        } catch (error) {
            this._update_state({ is_loading: false });
            this._render();
            this._attach_events();

            this._emit_event(_EVENTS.SOCIAL_LOGIN_ERROR, {
                provider,
                error: error.message
            });

            this._show_notification(error.message, 'error');
            
            logger.error(`Social login failed: ${provider}`, 'login_screen', error);
        }
    }

    // ===============================
    // متدهای عمومی (API عمومی کلاس)
    // ===============================

    /**
     * دریافت وضعیت فعلی صفحه
     * @returns {Object} کپی از وضعیت (برای جلوگیری از تغییر مستقیم)
     */
    get_state() {
        return { ...this._state };
    }

    /**
     * پاکسازی فرم
     */
    reset_form() {
        this._update_state({
            email: '',
            password: '',
            otp_code: '',
            two_factor_code: '',
            captcha_answer: '',
            show_password: false,
            two_factor_required: false,
            errors: {
                email: '',
                password: '',
                otp: '',
                two_factor: '',
                captcha: '',
                general: ''
            }
        });
        
        if (_FEATURES.ENABLE_CAPTCHA) {
            this._generate_captcha();
        }
        
        this._render();
        this._attach_events();
        
        logger.info('Form reset', 'login_screen');
    }

    /**
     * تنظیم ایمیل به صورت برنامه‌نویسی
     * @param {string} email - ایمیل جدید
     */
    set_email(email) {
        if (typeof email === 'string') {
            this._update_state({ email });
            this._validate_field('email');
            this._render();
            this._attach_events();
        }
    }

    /**
     * دریافت مقدار یک فیلد
     * @param {string} field - نام فیلد
     * @returns {string|number} مقدار فیلد
     */
    get_field(field) {
        return this._state[field] || '';
    }

    /**
     * بررسی معتبر بودن فرم
     * @returns {boolean} نتیجه اعتبارسنجی
     */
    is_valid() {
        return this._validate_form();
    }

    /**
     * تغییر تب فعال
     * @param {string} tab - نام تب ('password' یا 'otp')
     */
    switch_tab(tab) {
        if (tab === 'password' || tab === 'otp') {
            this._update_state({ active_tab: tab });
            this._render();
            this._attach_events();
        }
    }

    /**
     * پاکسازی منابع صفحه (جلوگیری از memory leak)
     */
    destroy() {
        // پاکسازی تایمرها
        Object.values(this._timers).forEach(timer => {
            if (timer) clearTimeout(timer);
            if (timer) clearInterval(timer);
        });

        // پاکسازی کامپوننت‌ها
        Object.values(this._components).forEach(component => {
            if (component && typeof component.destroy === 'function') {
                component.destroy();
            }
        });

        // پاکسازی دکمه‌های اجتماعی
        this._components.social_buttons.forEach(({ element, handler }) => {
            element?.removeEventListener('click', handler);
        });

        // پاکسازی DOM
        this._container.innerHTML = '';

        // حذف شنونده‌ها
        window.removeEventListener('online', this._setup_network_listener);
        window.removeEventListener('offline', this._setup_network_listener);

        logger.info('LoginScreen destroyed', 'login_screen');
    }
}

// ===============================
// استایل‌های صفحه (برای PWA)
// ===============================

const _STYLES = `
    <style>
        /* استایل‌های پایه (همانند قبل) */
        .login-screen {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
        }

        .login-screen.rtl {
            direction: rtl;
        }

        .login-container {
            max-width: 450px;
            width: 100%;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 40px;
            animation: slideUp 0.5s ease-out;
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        /* استایل‌های جدید برای قابلیت‌های اضافه شده */
        
        /* تب‌ها */
        .login-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 25px;
            border-bottom: 2px solid #f0f0f0;
            padding-bottom: 10px;
        }

        .tab-btn {
            flex: 1;
            background: none;
            border: none;
            padding: 12px;
            font-size: 14px;
            font-weight: 600;
            color: #666;
            cursor: pointer;
            border-radius: 10px;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .tab-btn.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }

        .tab-icon {
            font-size: 18px;
        }

        /* حساب‌های ذخیره شده */
        .saved-accounts {
            margin-bottom: 25px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 12px;
        }

        .account-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 10px;
        }

        .account-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px;
            background: white;
            border: 1px solid #e1e1e1;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s ease;
            width: 100%;
            text-align: right;
        }

        .account-item:hover {
            background: #f0f0f0;
            transform: translateX(-5px);
        }

        .account-avatar {
            width: 36px;
            height: 36px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }

        .account-email {
            flex: 1;
            font-size: 14px;
            color: #333;
        }

        .account-2fa {
            font-size: 16px;
        }

        /* OTP */
        .otp-request-section {
            margin-bottom: 20px;
        }

        .btn-secondary {
            background: #6c757d;
            color: white;
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .btn-secondary:hover:not(:disabled) {
            background: #5a6268;
            transform: translateY(-2px);
        }

        .otp-timer {
            text-align: center;
            margin-top: 10px;
            color: #667eea;
            font-weight: 500;
        }

        .timer-value {
            font-size: 20px;
            font-weight: bold;
            margin: 0 5px;
        }

        /* کپچا */
        .captcha-container {
            margin-bottom: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 12px;
        }

        .captcha-question {
            text-align: center;
            margin-bottom: 10px;
        }

        .question {
            font-size: 24px;
            font-weight: bold;
            color: #333;
            background: white;
            padding: 10px 20px;
            border-radius: 10px;
            display: inline-block;
            border: 1px solid #e1e1e1;
        }

        .captcha-input {
            text-align: center;
            font-size: 18px;
            letter-spacing: 2px;
        }

        .refresh-captcha {
            position: absolute;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #667eea;
            padding: 5px;
        }

        .refresh-captcha:hover {
            color: #764ba2;
        }

        /* ورود اجتماعی */
        .social-login {
            margin-top: 25px;
        }

        .social-divider {
            text-align: center;
            position: relative;
            margin: 20px 0;
        }

        .social-divider::before,
        .social-divider::after {
            content: '';
            position: absolute;
            top: 50%;
            width: 45%;
            height: 1px;
            background: #e1e1e1;
        }

        .social-divider::before {
            right: 0;
        }

        .social-divider::after {
            left: 0;
        }

        .social-divider span {
            background: white;
            padding: 0 10px;
            color: #666;
            font-size: 14px;
        }

        .social-buttons {
            display: flex;
            gap: 10px;
            margin-top: 15px;
        }

        .social-btn {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 12px;
            border: 1px solid #e1e1e1;
            border-radius: 10px;
            background: white;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 14px;
            font-weight: 500;
        }

        .social-btn.google {
            color: #DB4437;
        }

        .social-btn.google:hover {
            background: #DB4437;
            color: white;
            border-color: #DB4437;
        }

        .social-btn.github {
            color: #333;
        }

        .social-btn.github:hover {
            background: #333;
            color: white;
            border-color: #333;
        }

        /* سایر استایل‌های پایه */
        .fade-in { animation: fadeIn 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        
        .slide-up { animation: slideUp 0.5s ease-out; }
        
        .offline-indicator {
            background: #fff3cd;
            color: #856404;
            padding: 10px;
            border-radius: 8px;
            margin-bottom: 20px;
            text-align: center;
            font-size: 14px;
            border: 1px solid #ffeeba;
        }

        .error-message {
            background: #f8d7da;
            color: #721c24;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            border: 1px solid #f5c6cb;
        }

        .form-group {
            margin-bottom: 20px;
            position: relative;
        }

        .form-label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
            font-size: 14px;
        }

        .form-input {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e1e1e1;
            border-radius: 10px;
            font-size: 16px;
            transition: all 0.3s ease;
            background: white;
            box-sizing: border-box;
        }

        .form-input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .password-wrapper {
            position: relative;
        }

        .toggle-password {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            cursor: pointer;
            padding: 0;
            font-size: 20px;
            color: #666;
            transition: color 0.3s ease;
        }

        .field-error {
            color: #dc3545;
            font-size: 12px;
            margin-top: 5px;
        }

        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .btn-primary:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }

        .register-link {
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 14px;
        }

        .link-button {
            background: none;
            border: none;
            color: #667eea;
            cursor: pointer;
            font-size: 14px;
            padding: 0;
            margin-right: 5px;
        }

        .security-badge {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 20px;
            color: #999;
            font-size: 12px;
        }

        @media (max-width: 480px) {
            .login-container { padding: 30px 20px; }
            .social-buttons { flex-direction: column; }
        }
    </style>
`;

// تزریق استایل‌ها به head (یک بار انجام شود)
if (typeof document !== 'undefined' && !document.getElementById('login-screen-styles')) {
    const style_sheet = document.createElement('div');
    style_sheet.innerHTML = _STYLES;
    document.head.appendChild(style_sheet.firstElementChild);
}

export default LoginScreen;
