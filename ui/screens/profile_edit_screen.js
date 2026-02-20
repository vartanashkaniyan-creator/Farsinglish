/**
 * @fileoverview صفحه ویرایش پروفایل کاربر با رعایت اصول SOLID و الگوهای طراحی پیشرفته
 * این کامپوننت مسئول نمایش و ویرایش اطلاعات شخصی کاربر است
 * 
 * @module ui/screens/profile_edit_screen
 * 
 * @requires core/state/state-manager
 * @requires features/profile/profile-service
 * @requires shared/models/user-model
 * @requires ui/components/form-input
 * @requires ui/components/basic-button
 * @requires core/utils/logger
 * @requires core/navigation/router
 */

import { stateManager } from '../../core/state/state-manager.js';
import { profileService } from '../../features/profile/profile-service.js';
import { UserModel } from '../../shared/models/user-model.js';
import { FormInput } from '../components/form-input.js';
import { BasicButton } from '../components/basic-button.js';
import { logger } from '../../core/utils/logger.js';
import { router } from '../../core/navigation/router.js';

/**
 * @typedef {Object} ProfileEditScreenConfig
 * @property {HTMLElement} container - المان والد برای رندر صفحه
 * @property {Function} onSaveSuccess - کال‌بک پس از ذخیره موفق
 * @property {Function} onCancel - کال‌بک هنگام انصراف
 * @property {I18n} [i18n] - سرویس بین‌المللی‌سازی (اختیاری)
 */

/**
 * @typedef {Object} ProfileEditState
 * @property {UserModel|null} user - داده‌های کاربر
 * @property {boolean} isLoading - وضعیت بارگذاری
 * @property {Object<string, string>} errors - خطاهای فرم
 * @property {boolean} isDirty - آیا فرم تغییر کرده است
 * @property {boolean} isSaving - در حال ذخیره‌سازی
 * @property {Object} formData - داده‌های فرم
 * @property {boolean} isValid - آیا فرم معتبر است
 * @property {boolean} isOnline - وضعیت اتصال به اینترنت
 * @property {boolean} hasDraft - آیا پیش‌نویس ذخیره شده وجود دارد
 */

/**
 * @typedef {Object} ValidationRule
 * @property {string} field - نام فیلد
 * @property {boolean} [required] - اجباری بودن
 * @property {number} [min] - حداقل طول
 * @property {number} [max] - حداکثر طول
 * @property {RegExp} [pattern] - الگوی اعتبارسنجی
 * @property {string} message - پیام خطا
 */

/**
 * @typedef {Object} FormFieldConfig
 * @property {string} type - نوع فیلد
 * @property {string} name - نام فیلد
 * @property {string} label - برچسب
 * @property {*} value - مقدار اولیه
 * @property {string} [placeholder] - متن راهنما
 * @property {boolean} [required] - اجباری بودن
 * @property {number} [min] - حداقل مقدار
 * @property {number} [max] - حداکثر مقدار
 * @property {number} [rows] - تعداد ردیف (برای textarea)
 * @property {Array<{value: string, label: string}>} [options] - گزینه‌ها (برای select)
 * @property {boolean} [checked] - وضعیت چک‌باکس
 */

/**
 * @template T
 * @typedef {Object} CacheEntry
 * @property {T} data - داده ذخیره شده
 * @property {number} timestamp - زمان ذخیره‌سازی
 */

/**
 * صفحه ویرایش پروفایل کاربر با معماری پیشرفته
 * 
 * @class
 * @implements {IProfileEditScreen}
 */
export class ProfileEditScreen {
    /** @type {ProfileEditScreenConfig} */
    #config;

    /** @type {ProfileEditState} */
    #state;

    /** @type {Object<string, FormInput>} */
    #formFields = {};

    /** @type {BasicButton|null} */
    #saveButton = null;

    /** @type {BasicButton|null} */
    #cancelButton = null;

    /** @type {HTMLElement|null} */
    #errorContainer = null;

    /** @type {HTMLElement|null} */
    #formElement = null;

    /** @type {number|null} */
    #stateUnsubscribe = null;

    /** @type {Function|null} */
    #debouncedValidate = null;

    /** @type {Function|null} */
    #debouncedAutoSave = null;

    /** @type {ValidationRule[]} */
    #validationSchema;

    /** @type {FormFieldConfig[]} */
    #formSchema;

    /** @type {Map<string, CacheEntry<UserModel>>} */
    #userCache = new Map();

    /** @type {number} */
    #cacheTTL = 5 * 60 * 1000; // 5 دقیقه

    /** @type {AbortController|null} */
    #abortController = null;

    /** @type {number|null} */
    #autoSaveInterval = null;

    /** @type {string} */
    #draftKey = 'profile_edit_draft';

    /**
     * ایجاد صفحه ویرایش پروفایل
     * 
     * @param {ProfileEditScreenConfig} config - تنظیمات صفحه
     * @throws {Error} اگر کانفیگ نامعتبر باشد
     */
    constructor(config) {
        this.#validateConfig(config);
        this.#config = this.#initConfig(config);
        
        /** @type {UserModel|null} */
        const currentUser = stateManager.getState().user;
        
        this.#validationSchema = this.#createValidationSchema();
        this.#formSchema = this.#createFormSchema();
        
        this.#state = this.#createInitialState(currentUser);
        this.#debouncedValidate = this.#createDebounce(this.#validateForm.bind(this), 300);
        this.#debouncedAutoSave = this.#createDebounce(this.#saveDraft.bind(this), 1000);

        this.#init();
        this.#setupNetworkListeners();
        this.#loadDraft();
        this.#startAutoSave();
        
        logger.info('ProfileEditScreen initialized', { userId: currentUser?.id });
    }

    /**
     * مقداردهی اولیه کانفیگ با مقادیر پیش‌فرض
     * 
     * @param {ProfileEditScreenConfig} config - کانفیگ ورودی
     * @returns {ProfileEditScreenConfig} کانفیگ تکمیل‌شده
     * @private
     */
    #initConfig(config) {
        return {
            ...config,
            i18n: config.i18n || {
                t: (key) => {
                    /** @type {Object<string, string>} */
                    const translations = {
                        'profile.edit.title': 'ویرایش پروفایل',
                        'profile.edit.subtitle': 'اطلاعات شخصی خود را ویرایش کنید',
                        'profile.edit.save': 'ذخیره تغییرات',
                        'profile.edit.cancel': 'انصراف',
                        'profile.edit.full_name': 'نام و نام خانوادگی',
                        'profile.edit.email': 'ایمیل',
                        'profile.edit.bio': 'درباره من',
                        'profile.edit.native_language': 'زبان مادری',
                        'profile.edit.target_language': 'زبان مورد نظر',
                        'profile.edit.daily_goal': 'هدف روزانه',
                        'profile.edit.public_profile': 'پروفایل عمومی باشد',
                        'profile.edit.offline': 'شما در حالت آفلاین هستید',
                        'profile.edit.draft_loaded': 'پیش‌نویس بازیابی شد',
                        'profile.edit.draft_saved': 'پیش‌نویس ذخیره شد'
                    };
                    return translations[key] || key;
                }
            }
        };
    }

    /**
     * ایجاد اعتبارسنج‌کننده با تاخیر (debounce) با قابلیت cancel
     * 
     * @param {Function} fn - تابع مورد نظر
     * @param {number} delay - تاخیر به میلی‌ثانیه
     * @returns {Function} تابع debounce شده
     * @private
     */
    #createDebounce(fn, delay) {
        /** @type {number|null} */
        let timer = null;
        
        const debounced = (...args) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
        
        debounced.cancel = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };
        
        return debounced;
    }

    /**
     * ایجاد Schema اعتبارسنجی
     * 
     * @returns {ValidationRule[]} قوانین اعتبارسنجی
     * @private
     */
    #createValidationSchema() {
        return [
            {
                field: 'fullName',
                required: true,
                min: 3,
                max: 100,
                message: 'نام و نام خانوادگی باید بین ۳ تا ۱۰۰ کاراکتر باشد'
            },
            {
                field: 'email',
                required: true,
                pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'ایمیل معتبر نیست'
            },
            {
                field: 'dailyGoal',
                min: 1,
                max: 100,
                message: 'هدف روزانه باید بین ۱ تا ۱۰۰ باشد'
            }
        ];
    }

    /**
     * ایجاد Schema فرم
     * 
     * @returns {FormFieldConfig[]} پیکربندی فیلدهای فرم
     * @private
     */
    #createFormSchema() {
        return [
            {
                type: 'text',
                name: 'fullName',
                label: this.#config.i18n.t('profile.edit.full_name'),
                placeholder: 'مثال: علی محمدی',
                required: true,
                max: 100
            },
            {
                type: 'email',
                name: 'email',
                label: this.#config.i18n.t('profile.edit.email'),
                placeholder: 'example@email.com',
                required: true
            },
            {
                type: 'textarea',
                name: 'bio',
                label: this.#config.i18n.t('profile.edit.bio'),
                placeholder: 'خودت را معرفی کن...',
                max: 500,
                rows: 4
            },
            {
                type: 'select',
                name: 'nativeLanguage',
                label: this.#config.i18n.t('profile.edit.native_language'),
                options: [
                    { value: 'fa', label: 'فارسی' },
                    { value: 'en', label: 'انگلیسی' },
                    { value: 'ar', label: 'عربی' },
                    { value: 'tr', label: 'ترکی' }
                ]
            },
            {
                type: 'select',
                name: 'targetLanguage',
                label: this.#config.i18n.t('profile.edit.target_language'),
                options: [
                    { value: 'en', label: 'انگلیسی' },
                    { value: 'es', label: 'اسپانیایی' },
                    { value: 'fr', label: 'فرانسوی' },
                    { value: 'de', label: 'آلمانی' }
                ]
            },
            {
                type: 'number',
                name: 'dailyGoal',
                label: this.#config.i18n.t('profile.edit.daily_goal'),
                min: 1,
                max: 100,
                required: true
            },
            {
                type: 'checkbox',
                name: 'isPublic',
                label: this.#config.i18n.t('profile.edit.public_profile')
            }
        ];
    }

    /**
     * ایجاد state اولیه
     * 
     * @param {UserModel|null} user - مدل کاربر
     * @returns {ProfileEditState} state اولیه
     * @private
     */
    #createInitialState(user) {
        const formData = this.#initializeFormData(user);
        
        return {
            user,
            isLoading: !user,
            errors: {},
            isDirty: false,
            isSaving: false,
            formData: this.#createFormProxy(formData),
            isValid: true,
            isOnline: navigator.onLine,
            hasDraft: false
        };
    }

    /**
     * ایجاد Proxy برای مدیریت خودکار تغییرات فرم
     * 
     * @param {Object} formData - داده‌های فرم
     * @returns {Object} Proxy شده فرم
     * @private
     */
    #createFormProxy(formData) {
        return new Proxy(formData, {
            set: (target, prop, value) => {
                target[prop] = value;
                this.#state.isDirty = true;
                this.#debouncedValidate();
                this.#debouncedAutoSave();
                this.#updateSaveButtonState();
                return true;
            }
        });
    }

    /**
     * اجرای عملیات با Error Boundary
     * 
     * @template T
     * @param {Function} fn - تابع مورد نظر
     * @param {string} fallbackMessage - پیام خطای پیش‌فرض
     * @returns {Promise<T|null>} نتیجه یا null در صورت خطا
     * @private
     */
    async #withErrorBoundary(fn, fallbackMessage) {
        try {
            return await fn.call(this);
        } catch (error) {
            this.#showError(fallbackMessage || 'خطایی در اجرای عملیات رخ داد');
            logger.error('Error boundary caught:', error);
            return null;
        }
    }

    /**
     * به‌روزرسانی گروهی state
     * 
     * @param {Partial<ProfileEditState>} updates - تغییرات
     * @private
     */
    #batchUpdate(updates) {
        const newState = { ...this.#state };
        Object.assign(newState, updates);
        this.#state = newState;
        this.#render();
    }

    /**
     * تنظیم شنونده‌های وضعیت شبکه
     * 
     * @private
     */
    #setupNetworkListeners() {
        window.addEventListener('online', () => this.#handleNetworkChange(true));
        window.addEventListener('offline', () => this.#handleNetworkChange(false));
    }

    /**
     * مدیریت تغییر وضعیت شبکه
     * 
     * @param {boolean} isOnline - وضعیت آنلاین
     * @private
     */
    #handleNetworkChange(isOnline) {
        this.#state.isOnline = isOnline;
        
        if (isOnline) {
            this.#syncDraft();
        } else {
            this.#showWarning(this.#config.i18n.t('profile.edit.offline'));
        }
        
        this.#updateSaveButtonState();
    }

    /**
     * دریافت داده کاربر با کش
     * 
     * @param {string} userId - شناسه کاربر
     * @returns {Promise<UserModel|null>} داده کاربر
     * @private
     */
    async #getUserWithCache(userId) {
        const cached = this.#userCache.get(userId);
        
        if (cached && Date.now() - cached.timestamp < this.#cacheTTL) {
            logger.debug('Returning cached user data', { userId });
            return cached.data;
        }

        const user = await profileService.getCurrentUser();
        
        this.#userCache.set(userId, {
            data: user,
            timestamp: Date.now()
        });
        
        return user;
    }

    /**
     * پاکسازی کش منقضی
     * 
     * @private
     */
    #clearExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.#userCache.entries()) {
            if (now - value.timestamp > this.#cacheTTL) {
                this.#userCache.delete(key);
            }
        }
    }

    /**
     * ذخیره پیش‌نویس در localStorage
     * 
     * @private
     */
    #saveDraft() {
        if (!this.#state.isDirty || !this.#state.formData) return;
        
        try {
            const draft = {
                formData: this.#state.formData,
                timestamp: Date.now()
            };
            
            localStorage.setItem(this.#draftKey, JSON.stringify(draft));
            this.#state.hasDraft = true;
            
            logger.debug('Draft saved', { timestamp: draft.timestamp });
        } catch (error) {
            logger.error('Failed to save draft', error);
        }
    }

    /**
     * بارگذاری پیش‌نویس از localStorage
     * 
     * @private
     */
    #loadDraft() {
        try {
            const draftJson = localStorage.getItem(this.#draftKey);
            if (!draftJson) return;
            
            const draft = JSON.parse(draftJson);
            
            // بررسی منقضی نشدن پیش‌نویس (حداکثر ۲۴ ساعت)
            if (Date.now() - draft.timestamp > 24 * 60 * 60 * 1000) {
                localStorage.removeItem(this.#draftKey);
                return;
            }
            
            if (draft.formData && confirm('پیش‌نویسی از ویرایش قبلی یافت شد. بازیابی شود؟')) {
                Object.assign(this.#state.formData, draft.formData);
                this.#updateFormFields();
                this.#state.hasDraft = true;
                this.#showSuccess(this.#config.i18n.t('profile.edit.draft_loaded'));
            }
        } catch (error) {
            logger.error('Failed to load draft', error);
        }
    }

    /**
     * همگام‌سازی پیش‌نویس پس از آنلاین شدن
     * 
     * @private
     */
    #syncDraft() {
        if (this.#state.hasDraft && this.#state.isDirty) {
            this.#showInfo('همگام‌سازی پیش‌نویس در حال انجام...');
            this.#debouncedAutoSave();
        }
    }

    /**
     * شروع ذخیره خودکار دوره‌ای
     * 
     * @private
     */
    #startAutoSave() {
        this.#autoSaveInterval = setInterval(() => {
            if (this.#state.isDirty && this.#state.isValid) {
                this.#saveDraft();
            }
        }, 30000); // هر ۳۰ ثانیه
    }

    /**
     * اعتبارسنجی کانفیگ ورودی
     * 
     * @param {ProfileEditScreenConfig} config - کانفیگ برای اعتبارسنجی
     * @private
     * @throws {Error} اگر کانفیگ نامعتبر باشد
     */
    #validateConfig(config) {
        if (!config?.container) {
            throw new Error('ProfileEditScreen: container is required');
        }
        
        if (!(config.container instanceof HTMLElement)) {
            throw new Error('ProfileEditScreen: container must be HTMLElement');
        }
    }

    /**
     * مقداردهی اولیه داده‌های فرم
     * 
     * @param {UserModel|null} user - مدل کاربر
     * @returns {Object} داده‌های اولیه فرم
     * @private
     */
    #initializeFormData(user) {
        if (!user) return {};

        return {
            fullName: user.fullName || '',
            email: user.email || '',
            bio: user.bio || '',
            nativeLanguage: user.nativeLanguage || 'fa',
            targetLanguage: user.targetLanguage || 'en',
            dailyGoal: user.settings?.dailyGoal || 10,
            isPublic: user.settings?.isPublic || false
        };
    }

    /**
     * مقداردهی اولیه صفحه
     * 
     * @private
     */
    #init() {
        this.#render();
        this.#attachEvents();
        this.#subscribeToState();
        
        if (this.#state.isLoading) {
            this.#loadUserData();
        }
    }

    /**
     * رندر صفحه
     * 
     * @private
     */
    #render() {
        this.#config.container.innerHTML = '';
        this.#config.container.className = 'profile-edit-screen';

        this.#config.container.appendChild(this.#renderHeader());
        this.#formElement = this.#renderForm();
        this.#config.container.appendChild(this.#formElement);
        this.#config.container.appendChild(this.#renderFooter());
        this.#renderNetworkStatus();
    }

    /**
     * رندر هدر صفحه
     * 
     * @returns {HTMLElement} المان هدر
     * @private
     */
    #renderHeader() {
        /** @type {HTMLElement} */
        const header = document.createElement('div');
        header.className = 'profile-edit-header';

        /** @type {HTMLElement} */
        const title = document.createElement('h1');
        title.className = 'profile-edit-title';
        title.textContent = this.#config.i18n.t('profile.edit.title');
        title.setAttribute('dir', 'rtl');

        /** @type {HTMLElement} */
        const subtitle = document.createElement('p');
        subtitle.className = 'profile-edit-subtitle';
        subtitle.textContent = this.#config.i18n.t('profile.edit.subtitle');
        subtitle.setAttribute('dir', 'rtl');

        header.appendChild(title);
        header.appendChild(subtitle);

        return header;
    }

    /**
     * رندر فرم ویرایش با استفاده از Form Factory و Event Delegation
     * 
     * @returns {HTMLElement} المان فرم
     * @private
     */
    #renderForm() {
        /** @type {HTMLElement} */
        const form = document.createElement('form');
        form.className = 'profile-edit-form';
        form.setAttribute('dir', 'rtl');
        form.setAttribute('novalidate', '');

        // ایجاد فیلدها با استفاده از Form Factory
        this.#formSchema.forEach(fieldConfig => {
            const field = this.#createField({
                ...fieldConfig,
                value: this.#state.formData[fieldConfig.name],
                onChange: null // حذف onChange تکی برای استفاده از Event Delegation
            });
            
            if (field) {
                this.#formFields[fieldConfig.name] = field;
                if (fieldConfig.type !== 'checkbox') {
                    form.appendChild(field.getElement());
                }
            }
        });

        // کانتینر خطاها
        this.#errorContainer = document.createElement('div');
        this.#errorContainer.className = 'form-errors';
        this.#errorContainer.setAttribute('role', 'alert');
        this.#errorContainer.setAttribute('dir', 'rtl');
        form.appendChild(this.#errorContainer);

        return form;
    }

    /**
     * رندر وضعیت شبکه
     * 
     * @private
     */
    #renderNetworkStatus() {
        if (!this.#state.isOnline) {
            const statusEl = document.createElement('div');
            statusEl.className = 'network-status offline';
            statusEl.textContent = this.#config.i18n.t('profile.edit.offline');
            statusEl.setAttribute('dir', 'rtl');
            this.#config.container.insertBefore(statusEl, this.#formElement);
        }
    }

    /**
     * Form Factory: ایجاد فیلد فرم بر اساس نوع
     * 
     * @param {FormFieldConfig & {onChange: Function|null}} config - پیکربندی فیلد
     * @returns {FormInput|null} کامپوننت فیلد
     * @private
     */
    #createField(config) {
        const fieldConfig = {
            container: this.#formElement,
            type: config.type,
            name: config.name,
            label: config.label,
            placeholder: config.placeholder,
            required: config.required,
            maxLength: config.max,
            onChange: null // برای Event Delegation
        };

        if (config.type === 'textarea') {
            fieldConfig.rows = config.rows;
        } else if (config.type === 'select') {
            fieldConfig.options = config.options;
        } else if (config.type === 'number') {
            fieldConfig.min = config.min;
            fieldConfig.max = config.max;
        } else if (config.type === 'checkbox') {
            fieldConfig.checked = config.checked;
        }

        return new FormInput(fieldConfig);
    }

    /**
     * رندر فوتر با دکمه‌ها
     * 
     * @returns {HTMLElement} المان فوتر
     * @private
     */
    #renderFooter() {
        /** @type {HTMLElement} */
        const footer = document.createElement('div');
        footer.className = 'profile-edit-footer';

        /** @type {HTMLElement} */
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-container';

        // دکمه ذخیره
        this.#saveButton = new BasicButton({
            container: buttonContainer,
            text: this.#config.i18n.t('profile.edit.save'),
            variant: 'primary',
            size: 'large',
            disabled: !this.#state.isDirty || this.#state.isSaving || !this.#state.isValid || !this.#state.isOnline,
            isLoading: this.#state.isSaving,
            onClick: () => this.#handleSave()
        });

        // دکمه انصراف
        this.#cancelButton = new BasicButton({
            container: buttonContainer,
            text: this.#config.i18n.t('profile.edit.cancel'),
            variant: 'secondary',
            size: 'large',
            disabled: this.#state.isSaving,
            onClick: () => this.#handleCancel()
        });

        footer.appendChild(buttonContainer);
        return footer;
    }

    /**
     * اتصال رویدادها با Event Delegation
     * 
     * @private
     */
    #attachEvents() {
        if (this.#formElement) {
            this.#formElement.addEventListener('submit', (e) => {
                e.preventDefault();
                this.#handleSave();
            });

            // Event Delegation برای همه تغییرات فرم
            this.#formElement.addEventListener('input', this.#handleFormChange.bind(this));
            this.#formElement.addEventListener('change', this.#handleFormChange.bind(this));
        }
    }

    /**
     * مدیریت تغییرات فرم با Event Delegation
     * 
     * @param {Event} e - رویداد
     * @private
     */
    #handleFormChange(e) {
        const target = e.target;
        if (!target.name) return;

        const { name, type, value, checked } = target;
        const fieldValue = type === 'checkbox' ? checked : value;
        
        this.#state.formData[name] = fieldValue;
        this.#validateField(name, fieldValue);
    }

    /**
     * اشتراک در تغییرات state سراسری
     * 
     * @private
     */
    #subscribeToState() {
        this.#stateUnsubscribe = stateManager.subscribe((newState) => {
            if (newState.user && !this.#state.user) {
                this.#state.user = newState.user;
                this.#state.formData = this.#initializeFormData(newState.user);
                this.#updateFormFields();
            }
        });
    }

    /**
     * به‌روزرسانی فیلدهای فرم با داده‌های جدید
     * 
     * @private
     */
    #updateFormFields() {
        Object.entries(this.#formFields).forEach(([key, field]) => {
            if (field && this.#state.formData[key] !== undefined) {
                field.setValue(this.#state.formData[key]);
            }
        });
    }

    /**
     * اعتبارسنجی یک فیلد
     * 
     * @param {string} fieldName - نام فیلد
     * @param {*} value - مقدار فیلد
     * @private
     */
    #validateField(fieldName, value) {
        const rule = this.#validationSchema.find(r => r.field === fieldName);
        if (!rule) return;

        /** @type {string|null} */
        let error = null;

        if (rule.required && (!value || value.toString().trim().length === 0)) {
            error = rule.message;
        } else if (rule.min && value < rule.min) {
            error = rule.message;
        } else if (rule.max && value > rule.max) {
            error = rule.message;
        } else if (rule.pattern && !rule.pattern.test(value)) {
            error = rule.message;
        }

        if (error) {
            this.#state.errors[fieldName] = error;
        } else {
            delete this.#state.errors[fieldName];
        }

        this.#displayErrors();
        this.#updateFormValidity();
    }

    /**
     * اعتبارسنجی کامل فرم
     * 
     * @returns {boolean} نتیجه اعتبارسنجی
     * @private
     */
    #validateForm() {
        let isValid = true;

        this.#validationSchema.forEach(rule => {
            const value = this.#state.formData[rule.field];
            this.#validateField(rule.field, value);
            
            if (this.#state.errors[rule.field]) {
                isValid = false;
            }
        });

        this.#state.isValid = isValid;
        return isValid;
    }

    /**
     * به‌روزرسانی وضعیت اعتبار فرم
     * 
     * @private
     */
    #updateFormValidity() {
        this.#state.isValid = Object.keys(this.#state.errors).length === 0;
        this.#updateSaveButtonState();
    }

    /**
     * نمایش خطاها در رابط کاربری
     * 
     * @private
     */
    #displayErrors() {
        if (!this.#errorContainer) return;

        /** @type {string[]} */
        const errorList = Object.values(this.#state.errors).filter(Boolean);

        if (errorList.length === 0) {
            this.#errorContainer.innerHTML = '';
            this.#errorContainer.style.display = 'none';
            return;
        }

        /** @type {HTMLElement} */
        const list = document.createElement('ul');
        list.className = 'error-list';

        errorList.forEach((error) => {
            /** @type {HTMLElement} */
            const item = document.createElement('li');
            item.textContent = error;
            list.appendChild(item);
        });

        this.#errorContainer.innerHTML = '';
        this.#errorContainer.appendChild(list);
        this.#errorContainer.style.display = 'block';
    }

    /**
     * نمایش پیام خطا به کاربر
     * 
     * @param {string} message - پیام خطا
     * @private
     */
    #showError(message) {
        this.#showMessage(message, 'error');
    }

    /**
     * نمایش پیام هشدار به کاربر
     * 
     * @param {string} message - پیام هشدار
     * @private
     */
    #showWarning(message) {
        this.#showMessage(message, 'warning');
    }

    /**
     * نمایش پیام موفقیت به کاربر
     * 
     * @param {string} message - پیام موفقیت
     * @private
     */
    #showSuccess(message) {
        this.#showMessage(message, 'success');
    }

    /**
     * نمایش پیام اطلاعات به کاربر
     * 
     * @param {string} message - پیام اطلاعات
     * @private
     */
    #showInfo(message) {
        this.#showMessage(message, 'info');
    }

    /**
     * نمایش پیام به کاربر
     * 
     * @param {string} message - متن پیام
     * @param {string} type - نوع پیام
     * @private
     */
    #showMessage(message, type = 'info') {
        if (!this.#errorContainer) return;

        this.#errorContainer.innerHTML = `
            <div class="message message-${type}">
                ${message}
            </div>
        `;
        this.#errorContainer.style.display = 'block';
        
        // پاک کردن خودکار پس از ۵ ثانیه
        setTimeout(() => {
            if (this.#errorContainer) {
                this.#errorContainer.style.display = 'none';
            }
        }, 5000);
    }

    /**
     * به‌روزرسانی وضعیت دکمه ذخیره
     * 
     * @private
     */
    #updateSaveButtonState() {
        if (this.#saveButton) {
            this.#saveButton.setDisabled(
                !this.#state.isDirty || 
                this.#state.isSaving || 
                !this.#state.isValid ||
                !this.#state.isOnline
            );
        }
    }

    /**
     * بارگذاری داده‌های کاربر
     * 
     * @private
     */
    async #loadUserData() {
        // لغو درخواست قبلی
        if (this.#abortController) {
            this.#abortController.abort();
        }
        
        this.#abortController = new AbortController();
        
        await this.#withErrorBoundary(async () => {
            this.#state.isLoading = true;
            
            /** @type {UserModel} */
            const user = await this.#getUserWithCache('current');
            
            this.#batchUpdate({
                user,
                formData: this.#initializeFormData(user),
                isLoading: false
            });
            
            this.#updateFormFields();
            logger.debug('User data loaded for edit', { userId: user.id });
        }, 'خطا در بارگذاری اطلاعات کاربر');
        
        this.#abortController = null;
    }

    /**
     * مدیریت ذخیره اطلاعات
     * 
     * @private
     */
    async #handleSave() {
        if (this.#state.isSaving) return;
        if (!this.#state.isOnline) {
            this.#showWarning('برای ذخیره تغییرات به اینترنت متصل شوید');
            return;
        }

        // اعتبارسنجی نهایی
        if (!this.#validateForm()) {
            this.#displayErrors();
            return;
        }

        this.#state.isSaving = true;
        this.#updateSaveButtonState();

        // لغو auto-save در حین ذخیره
        if (this.#debouncedAutoSave) {
            this.#debouncedAutoSave.cancel();
        }

        await this.#withErrorBoundary(async () => {
            /** @type {UserModel} */
            const updatedUser = await profileService.updateProfile(this.#state.formData);
            
            // پاکسازی کش و پیش‌نویس
            this.#userCache.delete('current');
            localStorage.removeItem(this.#draftKey);
            
            this.#batchUpdate({
                user: updatedUser,
                isDirty: false,
                isSaving: false,
                hasDraft: false
            });
            
            logger.info('Profile updated successfully', { userId: updatedUser.id });
            
            // به‌روزرسانی state سراسری
            stateManager.dispatch({
                type: 'USER_UPDATED',
                payload: updatedUser
            });

            this.#showSuccess('پروفایل با موفقیت به‌روزرسانی شد');

            // بازگشت به صفحه قبل با تاخیر
            setTimeout(() => {
                if (this.#config.onSaveSuccess) {
                    this.#config.onSaveSuccess(updatedUser);
                } else {
                    router.goBack();
                }
            }, 1500);
        }, 'خطا در ذخیره اطلاعات. لطفاً دوباره تلاش کنید');
    }

    /**
     * مدیریت انصراف
     * 
     * @private
     */
    #handleCancel() {
        logger.debug('Profile edit cancelled');
        
        // پرس و جو در صورت داشتن تغییرات ذخیره نشده
        if (this.#state.isDirty) {
            const confirm = window.confirm('تغییرات ذخیره نشده‌اند. خارج می‌شوید؟');
            if (!confirm) return;
        }
        
        if (this.#config.onCancel) {
            this.#config.onCancel();
        } else {
            router.goBack();
        }
    }

    /**
     * پاکسازی منابع
     * 
     * @public
     */
    destroy() {
        logger.debug('Destroying ProfileEditScreen');
        
        // لغو اشتراک state
        if (this.#stateUnsubscribe) {
            this.#stateUnsubscribe();
            this.#stateUnsubscribe = null;
        }

        // لغو تایمرها
        if (this.#debouncedValidate?.cancel) {
            this.#debouncedValidate.cancel();
        }
        
        if (this.#debouncedAutoSave?.cancel) {
            this.#debouncedAutoSave.cancel();
        }
        
        if (this.#autoSaveInterval) {
            clearInterval(this.#autoSaveInterval);
            this.#autoSaveInterval = null;
        }

        // لغو درخواست‌های ناتمام
        if (this.#abortController) {
            this.#abortController.abort();
            this.#abortController = null;
        }

        // پاکسازی کامپوننت‌های فرزند
        Object.values(this.#formFields).forEach(field => {
            if (field?.destroy) {
                field.destroy();
            }
        });

        if (this.#saveButton?.destroy) {
            this.#saveButton.destroy();
        }

        if (this.#cancelButton?.destroy) {
            this.#cancelButton.destroy();
        }

        // پاکسازی DOM
        if (this.#config.container) {
            this.#config.container.innerHTML = '';
        }

        // پاکسازی ارجاعات
        this.#formFields = {};
        this.#saveButton = null;
        this.#cancelButton = null;
        this.#errorContainer = null;
        this.#formElement = null;
        this.#debouncedValidate = null;
        this.#debouncedAutoSave = null;
        this.#userCache.clear();
        
        // حذف شنونده‌های شبکه
        window.removeEventListener('online', this.#handleNetworkChange);
        window.removeEventListener('offline', this.#handleNetworkChange);
    }
}

export default ProfileEditScreen;
