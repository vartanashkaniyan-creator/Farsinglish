/**
 * @fileoverview سرویس مدیریت پروفایل کاربر - نسخه فوق پیشرفته
 * @module features/profile/profile-service
 */

// core imports
import { db } from '../../core/db/indexeddb-wrapper.js';
import { logger } from '../../core/utils/logger.js';
import { stateManager } from '../../core/state/state-manager.js';
import { UserModel } from '../../shared/models/user-model.js';
import { UserSettingsModel } from '../../shared/models/user-settings-model.js';

/**
 * @readonly
 * @enum {string}
 */
const ProfileEvents = {
    /** پروفایل به‌روزرسانی شد */
    UPDATED: 'profile:updated',
    /** تنظیمات به‌روزرسانی شد */
    SETTINGS_UPDATED: 'profile:settings:updated',
    /** آواتار تغییر کرد */
    AVATAR_CHANGED: 'profile:avatar:changed',
    /** پروفایل حذف شد */
    DELETED: 'profile:deleted',
    /** امتیاز تجربه تغییر کرد */
    XP_UPDATED: 'profile:xp:updated',
    /** سطح کاربر افزایش یافت */
    LEVEL_UP: 'profile:level:up'
};

/**
 * @readonly
 * @enum {number}
 */
const ProfileLimits = {
    /** حداقل طول نام کاربری */
    MIN_USERNAME_LENGTH: 3,
    /** حداکثر طول نام کاربری */
    MAX_USERNAME_LENGTH: 20,
    /** حداکثر حجم آواتار (5MB) */
    MAX_AVATAR_SIZE: 5 * 1024 * 1024,
    /** زمان اعتبار کش (5 دقیقه) */
    CACHE_TTL: 5 * 60 * 1000,
    /** حداکثر تعداد تلاش مجدد */
    MAX_RETRIES: 3,
    /** تأخیر پایه برای backoff (ms) */
    BASE_RETRY_DELAY: 100,
    /** فاصله زمانی بین رویدادها برای rate limiting (ms) */
    EVENT_THROTTLE_INTERVAL: 1000,
    /** حداکثر تعداد رویداد در بازه زمانی */
    MAX_EVENTS_PER_INTERVAL: 10,
    /** زمان نمونه‌برداری متریک‌ها (ms) */
    METRICS_SAMPLE_INTERVAL: 60000
};

/**
 * @typedef {Object} ProfileData
 * @property {string} id - شناسه یکتای کاربر
 * @property {string} username - نام کاربری
 * @property {string} email - ایمیل کاربر
 * @property {string} [avatar_url] - آدرس تصویر پروفایل
 * @property {number} xp - امتیاز تجربه
 * @property {number} level - سطح کاربر
 * @property {Date} created_at - تاریخ عضویت
 * @property {Date} last_active - آخرین فعالیت
 */

/**
 * @typedef {Object} ProfileUpdateData
 * @property {string} [username] - نام کاربری جدید
 * @property {string} [email] - ایمیل جدید
 * @property {string} [avatar_url] - آدرس تصویر جدید
 * @property {Object} [settings] - تنظیمات کاربر
 */

/**
 * @typedef {Object} OperationMetrics
 * @property {string} operation_name
 * @property {number} duration_ms
 * @property {boolean} success
 * @property {string} [error]
 * @property {number} timestamp
 */

/**
 * @template T
 * @class Result
 */
class Result {
    /**
     * @private
     * @param {boolean} success
     * @param {T|null} data
     * @param {string|null} error
     * @param {Object} [metadata]
     */
    constructor(success, data, error, metadata = {}) {
        this.success = success;
        this.data = data;
        this.error = error;
        this.timestamp = Date.now();
        this.metadata = metadata;
    }

    /**
     * نتیجه موفق
     * @static
     * @param {T} data
     * @param {Object} [metadata]
     * @returns {Result<T>}
     */
    static ok(data, metadata = {}) {
        return new Result(true, data, null, metadata);
    }

    /**
     * نتیجه ناموفق
     * @static
     * @param {string} error
     * @param {Object} [metadata]
     * @returns {Result<null>}
     */
    static fail(error, metadata = {}) {
        return new Result(false, null, error, metadata);
    }

    /** @returns {boolean} */
    isSuccess() { return this.success; }

    /** @returns {T|null} */
    getOrNull() { return this.success ? this.data : null; }

    /** @returns {string} */
    getErrorMessage() { return this.error || 'عملیات موفق'; }
}

/**
 * @class ValidationError
 * @extends Error
 */
class ValidationError extends Error {
    /**
     * @param {string} message
     * @param {Object} fields
     */
    constructor(message, fields) {
        super(message);
        this.name = 'ValidationError';
        this.fields = fields;
    }
}

/**
 * کلاس سرویس مدیریت پروفایل
 * @class ProfileService
 */
class ProfileService {
    /** @type {ProfileService} */
    static #instance;

    /** @type {string} */
    #current_user_id;

    /** @type {Map<string, Function>} */
    #listeners = new Map();

    /** @type {Map<string, {data: ProfileData, expires: number}>} */
    #profile_cache = new Map();

    /** @type {Map<string, number>} برای Rate Limiting */
    #event_timestamps = new Map();

    /** @type {Map<string, number>} برای Debounce */
    #debounce_timers = new Map();

    /** @type {Array<OperationMetrics>} برای Metric Collection */
    #metrics_buffer = [];

    /** @type {AbortController} کنترل کننده لغو عملیات‌ها */
    #global_abort_controller = new AbortController();

    /** @type {number} تایمر فلاش متریک‌ها */
    #metrics_flush_timer;

    /**
     * پیاده‌سازی Singleton Pattern
     * @private
     */
    constructor() {
        if (ProfileService.#instance) {
            return ProfileService.#instance;
        }
        ProfileService.#instance = this;
        this.#init();
        this.#start_metrics_collection();
    }

    /**
     * دریافت instance سرویس
     * @static
     * @returns {ProfileService}
     */
    static getInstance() {
        if (!ProfileService.#instance) {
            ProfileService.#instance = new ProfileService();
        }
        return ProfileService.#instance;
    }

    /**
     * مقداردهی اولیه سرویس
     * @private
     * @returns {Promise<void>}
     */
    async #init() {
        try {
            const state = stateManager.getState();
            this.#current_user_id = state?.user?.id;

            logger.info('ProfileService initialized', {
                user_id: this.#current_user_id
            });
        } catch (error) {
            logger.error('ProfileService initialization failed', { error });
        }
    }

    /**
     * شروع جمع‌آوری متریک‌ها
     * @private
     */
    #start_metrics_collection() {
        this.#metrics_flush_timer = setInterval(() => {
            this.#flush_metrics();
        }, ProfileLimits.METRICS_SAMPLE_INTERVAL);
    }

    /**
     * ثبت متریک عملیات
     * @private
     * @param {string} operation_name
     * @param {number} duration_ms
     * @param {boolean} success
     * @param {string} [error]
     */
    #record_metric(operation_name, duration_ms, success, error) {
        /** @type {OperationMetrics} */
        const metric = {
            operation_name,
            duration_ms,
            success,
            error,
            timestamp: Date.now()
        };
        
        this.#metrics_buffer.push(metric);
        
        // اگر بافر خیلی بزرگ شد، فلاش کن
        if (this.#metrics_buffer.length >= 100) {
            this.#flush_metrics();
        }
    }

    /**
     * فلاش متریک‌ها به لاگ
     * @private
     */
    #flush_metrics() {
        if (this.#metrics_buffer.length === 0) return;
        
        const metrics_copy = [...this.#metrics_buffer];
        this.#metrics_buffer = [];
        
        logger.info('Performance metrics', {
            metrics: metrics_copy,
            count: metrics_copy.length,
            avg_duration: metrics_copy.reduce((acc, m) => acc + m.duration_ms, 0) / metrics_copy.length
        });
    }

    /**
     * ایجاد AbortSignal برای عملیات
     * @private
     * @param {number} timeout_ms - زمان تایم‌اوت
     * @returns {AbortSignal}
     */
    #create_operation_signal(timeout_ms = 30000) {
        const controller = new AbortController();
        const timeout_id = setTimeout(() => controller.abort(), timeout_ms);
        
        // ترکیب با سیگنال گلوبال
        const signal = AbortSignal.any([
            this.#global_abort_controller.signal,
            controller.signal
        ]);
        
        // پاکسازی تایمر بعد از اتمام
        signal.addEventListener('abort', () => clearTimeout(timeout_id));
        
        return signal;
    }

    /**
     * اجرای عملیات با تلاش مجدد و قابلیت لغو
     * @private
     * @template T
     * @param {Function} operation - عملیات دیتابیس
     * @param {string} operation_name - نام عملیات
     * @param {number} [timeout_ms] - تایم‌اوت
     * @returns {Promise<T>}
     */
    async #with_retry(operation, operation_name, timeout_ms = 30000) {
        let last_error;
        const start_time = Date.now();

        for (let i = 0; i < ProfileLimits.MAX_RETRIES; i++) {
            const signal = this.#create_operation_signal(timeout_ms);
            
            try {
                const result = await operation(signal);
                
                // ثبت متریک موفق
                this.#record_metric(
                    operation_name,
                    Date.now() - start_time,
                    true
                );
                
                return result;
                
            } catch (error) {
                last_error = error;
                
                // اگر عملیات لغو شده، ریترای نکن
                if (error.name === 'AbortError') {
                    logger.warn(`${operation_name} aborted`, {
                        attempt: i + 1
                    });
                    throw error;
                }

                logger.warn(`${operation_name} failed (attempt ${i + 1}/${ProfileLimits.MAX_RETRIES})`, {
                    error: error.message
                });

                if (i < ProfileLimits.MAX_RETRIES - 1) {
                    const delay = ProfileLimits.BASE_RETRY_DELAY * Math.pow(2, i);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // ثبت متریک ناموفق
        this.#record_metric(
            operation_name,
            Date.now() - start_time,
            false,
            last_error?.message
        );

        throw last_error;
    }

    /**
     * دریافت پروفایل از کش
     * @private
     * @param {string} user_id
     * @returns {ProfileData|null}
     */
    #get_cached_profile(user_id) {
        const cached = this.#profile_cache.get(user_id);
        if (cached && cached.expires > Date.now()) {
            logger.debug('Cache hit for profile', { user_id });
            return cached.data;
        }
        this.#profile_cache.delete(user_id);
        return null;
    }

    /**
     * ذخیره پروفایل در کش
     * @private
     * @param {string} user_id
     * @param {ProfileData} profile
     */
    #cache_profile(user_id, profile) {
        this.#profile_cache.set(user_id, {
            data: profile,
            expires: Date.now() + ProfileLimits.CACHE_TTL
        });
        logger.debug('Profile cached', { user_id });
    }

    /**
     * پاک کردن کش پروفایل
     * @private
     * @param {string} user_id
     */
    #invalidate_cache(user_id) {
        this.#profile_cache.delete(user_id);
        logger.debug('Profile cache invalidated', { user_id });
    }

    /**
     * اعتبارسنجی داده‌های به‌روزرسانی
     * @private
     * @param {ProfileUpdateData} data
     * @returns {ProfileUpdateData}
     * @throws {ValidationError}
     */
    #validate_update_data(data) {
        /** @type {Object.<string, string>} */
        const errors = {};

        if (data.username !== undefined) {
            if (data.username.length < ProfileLimits.MIN_USERNAME_LENGTH) {
                errors.username = `نام کاربری باید حداقل ${ProfileLimits.MIN_USERNAME_LENGTH} کاراکتر باشد`;
            }
            if (data.username.length > ProfileLimits.MAX_USERNAME_LENGTH) {
                errors.username = `نام کاربری باید حداکثر ${ProfileLimits.MAX_USERNAME_LENGTH} کاراکتر باشد`;
            }
            if (!/^[a-zA-Z0-9_\u0600-\u06FF]+$/.test(data.username)) {
                errors.username = 'نام کاربری فقط می‌تواند شامل حروف، اعداد و زیرخط باشد';
            }
        }

        if (data.email !== undefined && !this.#validate_email(data.email)) {
            errors.email = 'ایمیل وارد شده معتبر نیست';
        }

        if (data.avatar_url !== undefined) {
            try {
                new URL(data.avatar_url);
            } catch {
                errors.avatar_url = 'آدرس تصویر معتبر نیست';
            }
        }

        if (Object.keys(errors).length > 0) {
            throw new ValidationError('خطا در اعتبارسنجی داده‌ها', errors);
        }

        return data;
    }

    /**
     * اعتبارسنجی Rate Limiting برای رویدادها
     * @private
     * @param {string} event - نام رویداد
     * @returns {boolean}
     */
    #check_rate_limit(event) {
        const now = Date.now();
        const key = `${event}_${Math.floor(now / ProfileLimits.EVENT_THROTTLE_INTERVAL)}`;
        
        const count = this.#event_timestamps.get(key) || 0;
        
        if (count >= ProfileLimits.MAX_EVENTS_PER_INTERVAL) {
            logger.warn('Rate limit exceeded for event', { event });
            return false;
        }
        
        this.#event_timestamps.set(key, count + 1);
        
        // پاکسازی کلیدهای قدیمی بعد از یک بازه
        setTimeout(() => {
            this.#event_timestamps.delete(key);
        }, ProfileLimits.EVENT_THROTTLE_INTERVAL * 2);
        
        return true;
    }

    /**
     * اجرای Debounce برای رویدادها
     * @private
     * @param {string} key - کلید یکتا
     * @param {Function} fn - تابع مورد نظر
     * @param {number} delay - تأخیر (ms)
     */
    #debounce(key, fn, delay = 500) {
        if (this.#debounce_timers.has(key)) {
            clearTimeout(this.#debounce_timers.get(key));
        }
        
        const timer = setTimeout(() => {
            this.#debounce_timers.delete(key);
            fn();
        }, delay);
        
        this.#debounce_timers.set(key, timer);
    }

    /**
     * پشتیبان‌گیری خودکار قبل از آپدیت
     * @private
     * @param {string} user_id
     * @param {ProfileData} current_profile
     * @param {ProfileUpdateData} update_data
     */
    async #auto_backup(user_id, current_profile, update_data) {
        try {
            const backup = {
                user_id,
                original: current_profile,
                changes: update_data,
                timestamp: new Date(),
                version: '1.0.0'
            };
            
            // ذخیره در localStorage به عنوان پشتیبان موقت
            const backup_key = `profile_backup_${user_id}_${Date.now()}`;
            localStorage.setItem(backup_key, JSON.stringify(backup));
            
            // نگهداری فقط ۵ پشتیبان آخر
            const backups = Object.keys(localStorage)
                .filter(key => key.startsWith(`profile_backup_${user_id}`))
                .sort()
                .reverse();
                
            if (backups.length > 5) {
                backups.slice(5).forEach(key => localStorage.removeItem(key));
            }
            
            logger.debug('Auto backup created', { user_id, backup_key });
        } catch (error) {
            logger.warn('Auto backup failed', { error: error.message });
        }
    }

    /**
     * بازیابی از آخرین پشتیبان
     * @public
     * @async
     * @param {string} user_id
     * @returns {Promise<Result<ProfileData|null>>}
     */
    async restore_from_backup(user_id) {
        try {
            const backups = Object.keys(localStorage)
                .filter(key => key.startsWith(`profile_backup_${user_id}`))
                .sort()
                .reverse();
                
            if (backups.length === 0) {
                return Result.fail('پشتیبان‌ای یافت نشد');
            }
            
            const latest_backup = JSON.parse(localStorage.getItem(backups[0]));
            
            logger.info('Profile restored from backup', {
                user_id,
                backup_time: latest_backup.timestamp
            });
            
            return Result.ok(latest_backup.original);
        } catch (error) {
            logger.error('Restore from backup failed', { error: error.message });
            return Result.fail('خطا در بازیابی از پشتیبان');
        }
    }

    /**
     * دریافت پروفایل کاربر جاری
     * @public
     * @async
     * @returns {Promise<Result<ProfileData>>}
     */
    async get_current_profile() {
        const start_time = Date.now();
        
        try {
            if (!this.#current_user_id) {
                return Result.fail('کاربر وارد نشده است', { code: 'UNAUTHORIZED' });
            }

            // بررسی کش
            const cached = this.#get_cached_profile(this.#current_user_id);
            if (cached) {
                this.#record_metric('get_profile', Date.now() - start_time, true);
                return Result.ok(cached, { source: 'cache' });
            }

            // دریافت از دیتابیس با retry و قابلیت لغو
            /** @type {ProfileData} */
            const profile = await this.#with_retry(
                (signal) => db.users.get(this.#current_user_id, { signal }),
                'get_profile'
            );

            if (!profile) {
                return Result.fail('پروفایل یافت نشد', { code: 'NOT_FOUND' });
            }

            // محاسبه سطح بر اساس XP
            const level = UserModel.calculateLevel(profile.xp);

            /** @type {ProfileData} */
            const enriched_profile = {
                ...profile,
                level,
                last_active: new Date()
            };

            // ذخیره در کش
            this.#cache_profile(this.#current_user_id, enriched_profile);

            logger.debug('Profile retrieved', { user_id: this.#current_user_id });
            
            this.#record_metric('get_profile', Date.now() - start_time, true);
            return Result.ok(enriched_profile, { source: 'database' });

        } catch (error) {
            if (error.name === 'AbortError') {
                return Result.fail('عملیات لغو شد', { code: 'ABORTED' });
            }
            
            logger.error('Get profile failed', { error: error.message, user_id: this.#current_user_id });
            this.#record_metric('get_profile', Date.now() - start_time, false, error.message);
            return Result.fail('خطا در دریافت پروفایل', {
                code: 'INTERNAL_ERROR',
                details: error.message
            });
        }
    }

    /**
     * به‌روزرسانی پروفایل کاربر
     * @public
     * @async
     * @param {ProfileUpdateData} update_data - داده‌های به‌روزرسانی
     * @returns {Promise<Result<ProfileData>>}
     */
    async update_profile(update_data) {
        const start_time = Date.now();
        
        try {
            // اعتبارسنجی ورودی
            if (!update_data || Object.keys(update_data).length === 0) {
                return Result.fail('داده‌ای برای به‌روزرسانی وجود ندارد', {
                    code: 'INVALID_INPUT'
                });
            }

            if (!this.#current_user_id) {
                return Result.fail('کاربر وارد نشده است', { code: 'UNAUTHORIZED' });
            }

            // اعتبارسنجی داده‌ها
            const validated_data = this.#validate_update_data(update_data);

            // دریافت پروفایل فعلی
            const current_profile = await this.#with_retry(
                (signal) => db.users.get(this.#current_user_id, { signal }),
                'update_profile:get'
            );

            if (!current_profile) {
                return Result.fail('پروفایل یافت نشد', { code: 'NOT_FOUND' });
            }

            // پشتیبان‌گیری خودکار
            await this.#auto_backup(this.#current_user_id, current_profile, validated_data);

            // به‌روزرسانی در دیتابیس
            /** @type {ProfileData} */
            const updated_profile = {
                ...current_profile,
                ...validated_data,
                last_active: new Date()
            };

            await this.#with_retry(
                (signal) => db.users.update(this.#current_user_id, updated_profile, { signal }),
                'update_profile:update'
            );

            // پاک کردن کش
            this.#invalidate_cache(this.#current_user_id);

            // به‌روزرسانی state با debounce
            this.#debounce(
                `state_update_${this.#current_user_id}`,
                () => {
                    stateManager.dispatch({
                        type: ProfileEvents.UPDATED,
                        payload: updated_profile
                    });
                },
                300
            );

            // اطلاع به شنوندگان با rate limiting
            if (this.#check_rate_limit(ProfileEvents.UPDATED)) {
                this.#notify_listeners(ProfileEvents.UPDATED, updated_profile);
            }

            // بررسی افزایش سطح
            const old_level = UserModel.calculateLevel(current_profile.xp);
            const new_level = UserModel.calculateLevel(updated_profile.xp);

            if (new_level > old_level && this.#check_rate_limit(ProfileEvents.LEVEL_UP)) {
                this.#notify_listeners(ProfileEvents.LEVEL_UP, {
                    old_level,
                    new_level,
                    user_id: this.#current_user_id
                });
            }

            logger.info('Profile updated', {
                user_id: this.#current_user_id,
                updated_fields: Object.keys(update_data)
            });

            this.#record_metric('update_profile', Date.now() - start_time, true);
            return Result.ok(updated_profile, {
                fields: Object.keys(update_data)
            });

        } catch (error) {
            if (error instanceof ValidationError) {
                return Result.fail(error.message, {
                    code: 'VALIDATION_ERROR',
                    fields: error.fields
                });
            }

            if (error.name === 'AbortError') {
                return Result.fail('عملیات لغو شد', { code: 'ABORTED' });
            }

            logger.error('Update profile failed', {
                error: error.message,
                user_id: this.#current_user_id
            });

            this.#record_metric('update_profile', Date.now() - start_time, false, error.message);
            return Result.fail('خطا در به‌روزرسانی پروفایل', {
                code: 'INTERNAL_ERROR',
                details: error.message
            });
        }
    }

    /**
     * دریافت تنظیمات کاربر
     * @public
     * @async
     * @returns {Promise<Result<Object>>}
     */
    async get_user_settings() {
        const start_time = Date.now();
        
        try {
            if (!this.#current_user_id) {
                return Result.fail('کاربر وارد نشده است', { code: 'UNAUTHORIZED' });
            }

            /** @type {UserSettingsModel} */
            const settings = await this.#with_retry(
                (signal) => db.settings.where('user_id').equals(this.#current_user_id).first({ signal }),
                'get_user_settings'
            );

            const default_settings = UserSettingsModel.getDefaultSettings();

            this.#record_metric('get_settings', Date.now() - start_time, true);
            return Result.ok(settings || default_settings, {
                source: settings ? 'database' : 'default'
            });

        } catch (error) {
            if (error.name === 'AbortError') {
                return Result.fail('عملیات لغو شد', { code: 'ABORTED' });
            }
            
            logger.error('Get user settings failed', { error: error.message });
            this.#record_metric('get_settings', Date.now() - start_time, false, error.message);
            return Result.fail('خطا در دریافت تنظیمات', {
                code: 'INTERNAL_ERROR',
                details: error.message
            });
        }
    }

    /**
     * به‌روزرسانی تنظیمات کاربر
     * @public
     * @async
     * @param {Object} settings - تنظیمات جدید
     * @returns {Promise<Result<boolean>>}
     */
    async update_user_settings(settings) {
        const start_time = Date.now();
        
        try {
            if (!this.#current_user_id) {
                return Result.fail('کاربر وارد نشده است', { code: 'UNAUTHORIZED' });
            }

            const validated_settings = UserSettingsModel.validate(settings);

            await this.#with_retry(
                (signal) => db.settings.update(this.#current_user_id, {
                    ...validated_settings,
                    updated_at: new Date()
                }, { signal }),
                'update_user_settings'
            );

            if (this.#check_rate_limit(ProfileEvents.SETTINGS_UPDATED)) {
                this.#notify_listeners(ProfileEvents.SETTINGS_UPDATED, validated_settings);
            }

            logger.info('User settings updated', {
                user_id: this.#current_user_id
            });

            this.#record_metric('update_settings', Date.now() - start_time, true);
            return Result.ok(true);

        } catch (error) {
            if (error.name === 'AbortError') {
                return Result.fail('عملیات لغو شد', { code: 'ABORTED' });
            }
            
            logger.error('Update settings failed', { error: error.message });
            this.#record_metric('update_settings', Date.now() - start_time, false, error.message);
            return Result.fail('خطا در به‌روزرسانی تنظیمات', {
                code: 'INTERNAL_ERROR',
                details: error.message
            });
        }
    }

    /**
     * ثبت شنونده برای رویدادهای پروفایل
     * @public
     * @param {ProfileEvents|string} event - نام رویداد
     * @param {Function} callback - تابع برگشت
     * @returns {string} - شناسه شنونده
     */
    add_listener(event, callback) {
        const listener_id = `${event}-${Date.now()}-${Math.random()}`;
        this.#listeners.set(listener_id, { event, callback });
        return listener_id;
    }

    /**
     * حذف شنونده
     * @public
     * @param {string} listener_id - شناسه شنونده
     * @returns {boolean}
     */
    remove_listener(listener_id) {
        return this.#listeners.delete(listener_id);
    }

    /**
     * اطلاع‌رسانی به شنوندگان
     * @private
     * @param {ProfileEvents|string} event - نام رویداد
     * @param {*} data - داده رویداد
     */
    #notify_listeners(event, data) {
        this.#listeners.forEach((listener) => {
            if (listener.event === event) {
                try {
                    listener.callback(data);
                } catch (error) {
                    logger.error('Listener execution failed', {
                        event,
                        error: error.message
                    });
                }
            }
        });
    }

    /**
     * اعتبارسنجی ایمیل
     * @private
     * @param {string} email - ایمیل
     * @returns {boolean}
     */
    #validate_email(email) {
        const email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return email_regex.test(email);
    }

    /**
     * لغو تمام عملیات‌های در حال اجرا
     * @public
     */
    abort_all_operations() {
        this.#global_abort_controller.abort();
        this.#global_abort_controller = new AbortController();
        logger.info('All operations aborted');
    }

    /**
     * پاکسازی منابع
     * @public
     */
    dispose() {
        // لغو همه عملیات‌ها
        this.#global_abort_controller.abort();
        
        // پاکسازی تایمرها
        clearInterval(this.#metrics_flush_timer);
        this.#debounce_timers.forEach(timer => clearTimeout(timer));
        
        // پاکسازی شنوندگان و کش
        this.#listeners.clear();
        this.#profile_cache.clear();
        this.#event_timestamps.clear();
        this.#debounce_timers.clear();
        
        // فلاش نهایی متریک‌ها
        this.#flush_metrics();
        
        logger.info('ProfileService disposed');
    }
}

// ایجاد instance پیش‌فرض
const profileService = ProfileService.getInstance();

// export به صورت named export برای استفاده در ماژول‌های دیگر
export { profileService, ProfileEvents, Result };
export default profileService;

// export کلاس برای تست‌ها
export { ProfileService, ValidationError };
