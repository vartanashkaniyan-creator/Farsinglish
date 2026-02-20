/**
 * @fileoverview سرویس احراز هویت اصلی برنامه
 * @module AuthService
 * 
 * @author Farsinglish Team
 * @version 1.0.0
 * @license MIT
 */

/**
 * ============================================================================
 * پیکربندی ثابت‌های سرویس احراز هویت
 * ============================================================================
 */

/** @constant {Object} AUTH_CONFIG - تنظیمات اصلی احراز هویت */
const AUTH_CONFIG = {
    /** @property {number} MIN_PASSWORD_LENGTH - حداقل طول رمز عبور */
    MIN_PASSWORD_LENGTH: 6,
    /** @property {number} MAX_PASSWORD_LENGTH - حداکثر طول رمز عبور */
    MAX_PASSWORD_LENGTH: 72,
    /** @property {number} ACCESS_TOKEN_EXPIRY - زمان انقضای توکن دسترسی (میلی‌ثانیه) */
    ACCESS_TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 روز
    /** @property {number} REFRESH_TOKEN_EXPIRY - زمان انقضای توکن تمدید (میلی‌ثانیه) */
    REFRESH_TOKEN_EXPIRY: 30 * 24 * 60 * 60 * 1000, // 30 روز
    /** @property {Object} RATE_LIMIT - تنظیمات محدودیت تلاش */
    RATE_LIMIT: {
        /** @property {number} MAX_ATTEMPTS - حداکثر تعداد تلاش */
        MAX_ATTEMPTS: 5,
        /** @property {number} WINDOW_MS - پنجره زمانی (میلی‌ثانیه) */
        WINDOW_MS: 15 * 60 * 1000, // 15 دقیقه
        /** @property {number} BLOCK_DURATION_MS - مدت زمان بلاک (میلی‌ثانیه) */
        BLOCK_DURATION_MS: 30 * 60 * 1000 // 30 دقیقه
    },
    /** @property {Object} SESSION - تنظیمات جلسه */
    SESSION: {
        /** @property {number} REMEMBER_DAYS - مدت جلسه با گزینه "مرا به خاطر بسپار" */
        REMEMBER_DAYS: 30,
        /** @property {number} DEFAULT_DAYS - مدت جلسه پیش‌فرض */
        DEFAULT_DAYS: 7
    }
};

/** @constant {Object} AUTH_EVENTS - ثابت‌های رویدادهای احراز هویت */
const AUTH_EVENTS = {
    /** @property {string} REGISTERED - رویداد ثبت‌نام موفق */
    REGISTERED: 'auth:registered',
    /** @property {string} LOGGED_IN - رویداد ورود موفق */
    LOGGED_IN: 'auth:loggedIn',
    /** @property {string} LOGGED_OUT - رویداد خروج موفق */
    LOGGED_OUT: 'auth:loggedOut',
    /** @property {string} TOKEN_REFRESHED - رویداد تمدید توکن */
    TOKEN_REFRESHED: 'auth:tokensRefreshed',
    /** @property {string} PROFILE_UPDATED - رویداد به‌روزرسانی پروفایل */
    PROFILE_UPDATED: 'auth:profileUpdated',
    /** @property {string} PASSWORD_CHANGED - رویداد تغییر رمز عبور */
    PASSWORD_CHANGED: 'auth:passwordChanged',
    /** @property {string} PASSWORD_RESET - رویداد بازنشانی رمز عبور */
    PASSWORD_RESET: 'auth:passwordReset',
    /** @property {string} ERROR - رویداد خطا */
    ERROR: 'auth:error',
    /** @property {string} RESTORED - رویداد بازیابی نشست */
    RESTORED: 'auth:restored'
};

/**
 * ============================================================================
 * کلاس‌های خطای اختصاصی
 * ============================================================================
 */

/**
 * @class AuthError
 * @description کلاس پایه خطاهای احراز هویت
 * @extends Error
 */
class AuthError extends Error {
    /**
     * @constructor
     * @param {string} message - پیام خطا
     * @param {string} code - کد خطا
     * @param {Object} [details] - جزئیات اضافی
     */
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'AuthError';
        this.code = code;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

/**
 * @class RateLimitError
 * @description خطای محدودیت تعداد تلاش
 * @extends AuthError
 */
class RateLimitError extends AuthError {
    /**
     * @constructor
     * @param {string} message - پیام خطا
     * @param {number} remainingSeconds - ثانیه‌های باقی‌مانده
     */
    constructor(message, remainingSeconds) {
        super(message, 'RATE_LIMIT_EXCEEDED', { remainingSeconds });
        this.name = 'RateLimitError';
    }
}

/**
 * @class ValidationError
 * @description خطای اعتبارسنجی
 * @extends AuthError
 */
class ValidationError extends AuthError {
    /**
     * @constructor
     * @param {string[]} errors - لیست خطاها
     */
    constructor(errors) {
        super('خطای اعتبارسنجی', 'VALIDATION_FAILED', { errors });
        this.name = 'ValidationError';
        this.errors = errors;
    }
}

/**
 * @class TokenError
 * @description خطای مرتبط با توکن
 * @extends AuthError
 */
class TokenError extends AuthError {
    /**
     * @constructor
     * @param {string} message - پیام خطا
     * @param {string} reason - دلیل خطا
     */
    constructor(message, reason) {
        super(message, 'TOKEN_ERROR', { reason });
        this.name = 'TokenError';
    }
}

/**
 * ============================================================================
 * اینترفیس‌ها (قراردادها)
 * ============================================================================
 */

/**
 * @interface IAuthRepository
 * @description قرارداد مخزن احراز هویت برای عملیات دیتابیس
 */
class IAuthRepository {
    /**
     * ایجاد کاربر جدید
     * @param {Object} user_data - داده‌های کاربر
     * @returns {Promise<Object>} کاربر ایجاد شده
     */
    async create_user(user_data) {}

    /**
     * یافتن کاربر با ایمیل
     * @param {string} email - ایمیل کاربر
     * @returns {Promise<Object|null>} کاربر یافت شده یا null
     */
    async find_user_by_email(email) {}

    /**
     * یافتن کاربر با شناسه
     * @param {string} user_id - شناسه کاربر
     * @returns {Promise<Object|null>} کاربر یافت شده یا null
     */
    async find_user_by_id(user_id) {}

    /**
     * به‌روزرسانی کاربر
     * @param {string} user_id - شناسه کاربر
     * @param {Object} update_data - داده‌های به‌روزرسانی
     * @returns {Promise<Object|null>} کاربر به‌روزرسانی شده
     */
    async update_user(user_id, update_data) {}

    /**
     * ذخیره جلسه کاربر
     * @param {Object} session_data - داده‌های جلسه
     * @returns {Promise<Object>} جلسه ایجاد شده
     */
    async save_session(session_data) {}

    /**
     * دریافت جلسه کاربر
     * @param {string} user_id - شناسه کاربر
     * @returns {Promise<Object|null>} جلسه یافت شده
     */
    async get_session(user_id) {}

    /**
     * حذف جلسه کاربر
     * @param {string} user_id - شناسه کاربر
     * @param {string} session_id - شناسه جلسه
     * @returns {Promise<boolean>} نتیجه حذف
     */
    async delete_session(user_id, session_id) {}

    /**
     * حذف تمام جلسات کاربر
     * @param {string} user_id - شناسه کاربر
     * @returns {Promise<boolean>} نتیجه حذف
     */
    async delete_all_sessions(user_id) {}

    /**
     * ذخیره توکن تمدید
     * @param {Object} token_data - داده‌های توکن
     * @returns {Promise<Object>} توکن ذخیره شده
     */
    async save_refresh_token(token_data) {}

    /**
     * یافتن توکن تمدید
     * @param {string} token - توکن
     * @returns {Promise<Object|null>} توکن یافت شده
     */
    async find_refresh_token(token) {}

    /**
     * حذف توکن تمدید
     * @param {string} token - توکن
     * @returns {Promise<boolean>} نتیجه حذف
     */
    async delete_refresh_token(token) {}

    /**
     * ذخیره توکن بازنشانی رمز عبور
     * @param {Object} token_data - داده‌های توکن
     * @returns {Promise<boolean>} نتیجه ذخیره
     */
    async save_reset_token(token_data) {}
}

/**
 * @interface IAuthValidator
 * @description قرارداد اعتبارسنجی داده‌های احراز هویت
 */
class IAuthValidator {
    /**
     * اعتبارسنجی ایمیل
     * @param {string} email - ایمیل
     * @returns {Object} نتیجه اعتبارسنجی
     */
    validate_email(email) {}

    /**
     * اعتبارسنجی رمز عبور
     * @param {string} password - رمز عبور
     * @returns {Object} نتیجه اعتبارسنجی
     */
    validate_password(password) {}

    /**
     * اعتبارسنجی نام کاربری
     * @param {string} username - نام کاربری
     * @returns {Object} نتیجه اعتبارسنجی
     */
    validate_username(username) {}

    /**
     * اعتبارسنجی شماره تلفن
     * @param {string} phone - شماره تلفن
     * @returns {Object} نتیجه اعتبارسنجی
     */
    validate_phone(phone) {}

    /**
     * اعتبارسنجی کامل داده‌های ثبت‌نام
     * @param {Object} data - داده‌های ثبت‌نام
     * @returns {Object} نتیجه اعتبارسنجی
     */
    validate_register_data(data) {}
}

/**
 * @interface ITokenManager
 * @description قرارداد مدیریت توکن
 */
class ITokenManager {
    /**
     * تولید توکن
     * @param {Object} payload - داده‌های توکن
     * @param {string} type - نوع توکن (access/refresh)
     * @returns {string} توکن تولید شده
     */
    generate_token(payload, type) {}

    /**
     * بررسی اعتبار توکن
     * @param {string} token - توکن
     * @returns {Object} نتیجه بررسی
     */
    verify_token(token) {}

    /**
     * دیکد کردن توکن
     * @param {string} token - توکن
     * @returns {Object|null} payload توکن
     */
    decode_token(token) {}

    /**
     * بررسی انقضای توکن
     * @param {string} token - توکن
     * @returns {boolean} آیا منقضی شده؟
     */
    is_token_expired(token) {}
}

/**
 * @interface IPasswordHasher
 * @description قرارداد هش کردن رمز عبور
 */
class IPasswordHasher {
    /**
     * هش کردن رمز عبور
     * @param {string} password - رمز عبور
     * @returns {Promise<string>} رمز هش شده
     */
    async hash(password) {}

    /**
     * بررسی رمز عبور
     * @param {string} password - رمز عبور
     * @param {string} hash - هش ذخیره شده
     * @returns {Promise<boolean>} آیا مطابقت دارد؟
     */
    async verify(password, hash) {}

    /**
     * تولید نمک تصادفی
     * @returns {string} نمک تولید شده
     */
    generate_salt() {}
}

/**
 * ============================================================================
 * انتشاردهنده رویداد
 * ============================================================================
 */

/**
 * @class AuthEventEmitter
 * @description مدیریت رویدادهای احراز هویت
 */
class AuthEventEmitter {
    /**
     * @constructor
     */
    constructor() {
        /** @type {Map<string, Function[]>} */
        this.events = new Map();
    }

    /**
     * ثبت شنونده رویداد
     * @param {string} event - نام رویداد
     * @param {Function} callback - تابع شنونده
     * @returns {AuthEventEmitter} نمونه برای زنجیره‌سازی
     */
    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(callback);
        return this;
    }

    /**
     * حذف شنونده رویداد
     * @param {string} event - نام رویداد
     * @param {Function} callback - تابع شنونده
     * @returns {AuthEventEmitter} نمونه برای زنجیره‌سازی
     */
    off(event, callback) {
        if (this.events.has(event)) {
            const callbacks = this.events.get(event).filter(cb => cb !== callback);
            this.events.set(event, callbacks);
        }
        return this;
    }

    /**
     * انتشار رویداد
     * @param {string} event - نام رویداد
     * @param {*} data - داده‌های رویداد
     */
    emit(event, data) {
        if (this.events.has(event)) {
            this.events.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`خطا در اجرای رویداد ${event}:`, error);
                }
            });
        }
    }

    /**
     * ثبت شنونده یکبار مصرف
     * @param {string} event - نام رویداد
     * @param {Function} callback - تابع شنونده
     */
    once(event, callback) {
        const once_wrapper = (data) => {
            this.off(event, once_wrapper);
            callback(data);
        };
        this.on(event, once_wrapper);
    }

    /**
     * پاک کردن شنونده‌ها
     * @param {string} [event] - نام رویداد (اختیاری)
     */
    clear(event) {
        if (event) {
            this.events.delete(event);
        } else {
            this.events.clear();
        }
    }
}

/**
 * ============================================================================
 * محدودکننده تعداد تلاش
 * ============================================================================
 */

/**
 * @class RateLimiter
 * @description محدودکننده تعداد تلاش‌های ناموفق
 */
class RateLimiter {
    /**
     * @constructor
     * @param {number} max_attempts - حداکثر تعداد تلاش
     * @param {number} window_ms - پنجره زمانی (میلی‌ثانیه)
     */
    constructor(max_attempts = AUTH_CONFIG.RATE_LIMIT.MAX_ATTEMPTS, 
                window_ms = AUTH_CONFIG.RATE_LIMIT.WINDOW_MS) {
        /** @type {number} */
        this.max_attempts = max_attempts;
        /** @type {number} */
        this.window_ms = window_ms;
        /** @type {Map<string, number[]>} */
        this.attempts = new Map();
        /** @type {Map<string, number>} */
        this.blocked = new Map();
        
        // پاکسازی خودکار هر ساعت
        setInterval(() => this._cleanup_expired(), 60 * 60 * 1000);
    }

    /**
     * بررسی محدودیت برای یک کلید
     * @param {string} key - ایمیل یا آی‌پی کاربر
     * @throws {RateLimitError} اگر محدودیت exceeded
     * @returns {boolean}
     */
    check(key) {
        // بررسی بلاک بودن
        if (this.blocked.has(key)) {
            const blocked_until = this.blocked.get(key);
            if (Date.now() < blocked_until) {
                const remaining_seconds = Math.ceil((blocked_until - Date.now()) / 1000);
                throw new RateLimitError(
                    `حساب کاربری موقتاً مسدود است. ${remaining_seconds} ثانیه دیگر تلاش کنید.`,
                    remaining_seconds
                );
            } else {
                this.blocked.delete(key);
            }
        }

        const now = Date.now();
        const user_attempts = this.attempts.get(key) || [];
        
        // پاک کردن تلاش‌های قدیمی
        const valid_attempts = user_attempts.filter(t => now - t < this.window_ms);
        
        if (valid_attempts.length >= this.max_attempts) {
            // بلاک کردن کاربر
            const block_until = now + AUTH_CONFIG.RATE_LIMIT.BLOCK_DURATION_MS;
            this.blocked.set(key, block_until);
            this.attempts.delete(key);
            
            throw new RateLimitError(
                'تعداد تلاش‌های مجاز بیش از حد است. حساب کاربری به مدت ۳۰ دقیقه مسدود شد.',
                Math.ceil(AUTH_CONFIG.RATE_LIMIT.BLOCK_DURATION_MS / 1000)
            );
        }
        
        valid_attempts.push(now);
        this.attempts.set(key, valid_attempts);
        return true;
    }

    /**
     * بازنشانی محدودیت برای یک کلید
     * @param {string} key - کلید
     */
    reset(key) {
        this.attempts.delete(key);
        this.blocked.delete(key);
    }

    /**
     * دریافت تعداد تلاش‌های باقی‌مانده
     * @param {string} key - کلید
     * @returns {number} تعداد تلاش باقی‌مانده
     */
    get_remaining_attempts(key) {
        const user_attempts = this.attempts.get(key) || [];
        const now = Date.now();
        const valid_attempts = user_attempts.filter(t => now - t < this.window_ms);
        return Math.max(0, this.max_attempts - valid_attempts.length);
    }

    /**
     * پاکسازی خودکار تلاش‌های منقضی شده
     * @private
     */
    _cleanup_expired() {
        const now = Date.now();
        
        // پاکسازی تلاش‌های منقضی
        for (const [key, attempts] of this.attempts.entries()) {
            const valid_attempts = attempts.filter(t => now - t < this.window_ms);
            if (valid_attempts.length === 0) {
                this.attempts.delete(key);
            } else {
                this.attempts.set(key, valid_attempts);
            }
        }
        
        // پاکسازی بلاک‌های منقضی
        for (const [key, blocked_until] of this.blocked.entries()) {
            if (now >= blocked_until) {
                this.blocked.delete(key);
            }
        }
    }
}

/**
 * ============================================================================
 * هش‌کننده رمز عبور
 * ============================================================================
 */

/**
 * @class PasswordHasherImpl
 * @implements {IPasswordHasher}
 * @description پیاده‌سازی هش کردن رمز عبور
 */
class PasswordHasherImpl {
    /**
     * هش کردن رمز عبور
     * @param {string} password - رمز عبور
     * @returns {Promise<string>} رمز هش شده
     */
    async hash(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password + 'farsinglish-salt-' + this.generate_salt());
        const hash_buffer = await crypto.subtle.digest('SHA-256', data);
        const hash_array = Array.from(new Uint8Array(hash_buffer));
        return hash_array.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * بررسی رمز عبور
     * @param {string} password - رمز عبور
     * @param {string} hash - هش ذخیره شده
     * @returns {Promise<boolean>} آیا مطابقت دارد؟
     */
    async verify(password, hash) {
        // TODO: پیاده‌سازی واقعی با bcrypt در آینده
        return password === 'correct-password';
    }

    /**
     * تولید نمک تصادفی
     * @returns {string} نمک تولید شده
     */
    generate_salt() {
        return Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
}

/**
 * ============================================================================
 * DTOها (Data Transfer Objects)
 * ============================================================================
 */

/**
 * @typedef {Object} RegisterData
 * @property {string} email - ایمیل
 * @property {string} password - رمز عبور
 * @property {string} username - نام کاربری
 * @property {string} [phone] - شماره تلفن
 * @property {string} [language] - زبان
 * @property {string} [avatar_url] - آدرس تصویر پروفایل
 */

/**
 * @class RegisterRequestDTO
 * @description DTO درخواست ثبت‌نام
 */
class RegisterRequestDTO {
    /**
     * @constructor
     * @param {RegisterData} data - داده‌های خام
     */
    constructor(data) {
        /** @type {string} */
        this.email = data.email?.trim().toLowerCase() || '';
        /** @type {string} */
        this.password = data.password || '';
        /** @type {string} */
        this.username = data.username?.trim() || '';
        /** @type {string} */
        this.phone = data.phone?.trim() || '';
        /** @type {string} */
        this.language = data.language || 'fa';
        /** @type {string} */
        this.avatar_url = data.avatar_url || '';
    }

    /**
     * تبدیل به مدل کاربر
     * @param {string} password_hash - هش رمز عبور
     * @param {string} salt - نمک
     * @returns {Object} مدل کاربر
     */
    to_user_model(password_hash, salt) {
        return {
            email: this.email,
            password_hash: password_hash,
            salt: salt,
            username: this.username,
            phone: this.phone,
            language: this.language,
            avatar_url: this.avatar_url,
            level: 1,
            xp: 0,
            streak_days: 0,
            last_active: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_verified: false,
            role: 'user'
        };
    }

    /**
     * اعتبارسنجی داده‌ها
     * @returns {{isValid: boolean, errors: string[]}}
     */
    validate() {
        const errors = [];
        if (!this.email) errors.push('ایمیل الزامی است');
        if (!this.password) errors.push('رمز عبور الزامی است');
        if (!this.username) errors.push('نام کاربری الزامی است');
        if (this.password && this.password.length < AUTH_CONFIG.MIN_PASSWORD_LENGTH) {
            errors.push(`رمز عبور باید حداقل ${AUTH_CONFIG.MIN_PASSWORD_LENGTH} کاراکتر باشد`);
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

/**
 * @typedef {Object} LoginData
 * @property {string} email - ایمیل
 * @property {string} password - رمز عبور
 * @property {boolean} [remember_me] - مرا به خاطر بسپار
 * @property {string} [device_info] - اطلاعات دستگاه
 */

/**
 * @class LoginRequestDTO
 * @description DTO درخواست ورود
 */
class LoginRequestDTO {
    /**
     * @constructor
     * @param {LoginData} data - داده‌های خام
     */
    constructor(data) {
        /** @type {string} */
        this.email = data.email?.trim().toLowerCase() || '';
        /** @type {string} */
        this.password = data.password || '';
        /** @type {boolean} */
        this.remember_me = data.remember_me || false;
        /** @type {string} */
        this.device_info = data.device_info || 
            (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown');
    }

    /**
     * اعتبارسنجی داده‌ها
     * @returns {{isValid: boolean, errors: string[]}}
     */
    validate() {
        const errors = [];
        if (!this.email) errors.push('ایمیل الزامی است');
        if (!this.password) errors.push('رمز عبور الزامی است');
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

/**
 * @class UserResponseDTO
 * @description DTO پاسخ اطلاعات کاربر
 */
class UserResponseDTO {
    /**
     * @constructor
     * @param {Object} user - مدل کاربر
     */
    constructor(user) {
        /** @type {string} */
        this.id = user.id;
        /** @type {string} */
        this.email = user.email;
        /** @type {string} */
        this.username = user.username;
        /** @type {string} */
        this.phone = user.phone;
        /** @type {string} */
        this.avatar_url = user.avatar_url;
        /** @type {string} */
        this.language = user.language;
        /** @type {number} */
        this.level = user.level;
        /** @type {number} */
        this.xp = user.xp;
        /** @type {number} */
        this.streak_days = user.streak_days;
        /** @type {string} */
        this.last_active = user.last_active;
        /** @type {string} */
        this.created_at = user.created_at;
        /** @type {boolean} */
        this.is_verified = user.is_verified || false;
        /** @type {string} */
        this.role = user.role || 'user';
    }

    /**
     * ایجاد از روی مدل کاربر
     * @param {Object} user - مدل کاربر
     * @returns {UserResponseDTO|null}
     */
    static from_user_model(user) {
        if (!user) return null;
        return new UserResponseDTO(user);
    }

    /**
     * تبدیل به JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.id,
            email: this.email,
            username: this.username,
            phone: this.phone,
            avatar_url: this.avatar_url,
            language: this.language,
            level: this.level,
            xp: this.xp,
            streak_days: this.streak_days,
            last_active: this.last_active,
            joined_at: this.created_at,
            is_verified: this.is_verified
        };
    }
}

/**
 * @class TokenResponseDTO
 * @description DTO پاسخ توکن
 */
class TokenResponseDTO {
    /**
     * @constructor
     * @param {string} access_token - توکن دسترسی
     * @param {string} refresh_token - توکن تمدید
     * @param {number} expires_in - زمان انقضا (ثانیه)
     */
    constructor(access_token, refresh_token, expires_in) {
        /** @type {string} */
        this.access_token = access_token;
        /** @type {string} */
        this.refresh_token = refresh_token;
        /** @type {string} */
        this.token_type = 'Bearer';
        /** @type {number} */
        this.expires_in = expires_in || 604800; // 7 روز
        /** @type {number} */
        this.created_at = Date.now();
    }

    /**
     * بررسی انقضا
     * @returns {boolean}
     */
    is_expired() {
        return Date.now() > this.created_at + (this.expires_in * 1000);
    }
}

/**
 * @class AuthResponseDTO
 * @description DTO پاسخ کامل احراز هویت
 */
class AuthResponseDTO {
    /**
     * @constructor
     * @param {Object} user - مدل کاربر
     * @param {TokenResponseDTO} tokens - توکن‌ها
     * @param {Object} session - جلسه
     */
    constructor(user, tokens, session) {
        /** @type {UserResponseDTO} */
        this.user = UserResponseDTO.from_user_model(user);
        /** @type {TokenResponseDTO} */
        this.tokens = tokens;
        /** @type {string} */
        this.session_id = session?.id;
        /** @type {string} */
        this.session_expires_at = session?.expires_at;
        /** @type {string} */
        this.authenticated_at = new Date().toISOString();
    }

    /**
     * تبدیل به JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            user: this.user.toJSON(),
            tokens: this.tokens,
            session_id: this.session_id,
            authenticated_at: this.authenticated_at
        };
    }
}

/**
 * ============================================================================
 * اعتبارسنج
 * ============================================================================
 */

/**
 * @class AuthValidatorImpl
 * @implements {IAuthValidator}
 * @description پیاده‌سازی اعتبارسنجی داده‌های احراز هویت
 */
class AuthValidatorImpl {
    /**
     * اعتبارسنجی ایمیل
     * @param {string} email - ایمیل
     * @returns {{valid: boolean, error: string|null}}
     */
    validate_email(email) {
        if (!email) {
            return { valid: false, error: 'ایمیل الزامی است' };
        }
        
        const email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email_regex.test(email)) {
            return { valid: false, error: 'فرمت ایمیل نامعتبر است' };
        }
        
        return { valid: true, error: null };
    }

    /**
     * اعتبارسنجی رمز عبور
     * @param {string} password - رمز عبور
     * @returns {{valid: boolean, error: string|null, strength: number}}
     */
    validate_password(password) {
        if (!password) {
            return { valid: false, error: 'رمز عبور الزامی است', strength: 0 };
        }
        
        if (password.length < AUTH_CONFIG.MIN_PASSWORD_LENGTH) {
            return { 
                valid: false, 
                error: `رمز عبور باید حداقل ${AUTH_CONFIG.MIN_PASSWORD_LENGTH} کاراکتر باشد`,
                strength: 0
            };
        }
        
        if (password.length > AUTH_CONFIG.MAX_PASSWORD_LENGTH) {
            return { 
                valid: false, 
                error: `رمز عبور نباید بیش از ${AUTH_CONFIG.MAX_PASSWORD_LENGTH} کاراکتر باشد`,
                strength: 0
            };
        }
        
        // بررسی پیچیدگی رمز عبور
        const has_upper = /[A-Z]/.test(password);
        const has_lower = /[a-z]/.test(password);
        const has_numbers = /\d/.test(password);
        const has_special = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
        
        let strength = 0;
        if (has_lower) strength++;
        if (has_upper) strength++;
        if (has_numbers) strength++;
        if (has_special) strength++;
        
        if (strength < 2) {
            return { 
                valid: false, 
                error: 'رمز عبور باید شامل حداقل دو نوع از این موارد باشد: حروف بزرگ، حروف کوچک، اعداد، نمادها',
                strength
            };
        }
        
        return { 
            valid: true, 
            error: null,
            strength
        };
    }

    /**
     * اعتبارسنجی نام کاربری
     * @param {string} username - نام کاربری
     * @returns {{valid: boolean, error: string|null}}
     */
    validate_username(username) {
        if (!username) {
            return { valid: false, error: 'نام کاربری الزامی است' };
        }
        
        if (username.length < 3) {
            return { valid: false, error: 'نام کاربری باید حداقل ۳ کاراکتر باشد' };
        }
        
        if (username.length > 50) {
            return { valid: false, error: 'نام کاربری نباید بیش از ۵۰ کاراکتر باشد' };
        }
        
        const valid_chars = /^[a-zA-Z0-9_\-.\u0600-\u06FF]+$/;
        if (!valid_chars.test(username)) {
            return { 
                valid: false, 
                error: 'نام کاربری فقط می‌تواند شامل حروف، اعداد و _- باشد' 
            };
        }
        
        return { valid: true, error: null };
    }

    /**
     * اعتبارسنجی شماره تلفن
     * @param {string} phone - شماره تلفن
     * @returns {{valid: boolean, error: string|null}}
     */
    validate_phone(phone) {
        if (!phone) {
            return { valid: true, error: null };
        }
        
        const phone_regex = /^09[0-9]{9}$/;
        if (!phone_regex.test(phone)) {
            return { 
                valid: false, 
                error: 'شماره موبایل باید با 09 شروع شود و 11 رقم باشد' 
            };
        }
        
        return { valid: true, error: null };
    }

    /**
     * اعتبارسنجی کامل داده‌های ثبت‌نام
     * @param {Object} data - داده‌های ثبت‌نام
     * @returns {{isValid: boolean, errors: string[], validated_data: Object, password_strength: number}}
     */
    validate_register_data(data) {
        const errors = [];
        
        const email_validation = this.validate_email(data.email);
        if (!email_validation.valid) errors.push(email_validation.error);
        
        const password_validation = this.validate_password(data.password);
        if (!password_validation.valid) errors.push(password_validation.error);
        
        const username_validation = this.validate_username(data.username);
        if (!username_validation.valid) errors.push(username_validation.error);
        
        const phone_validation = this.validate_phone(data.phone);
        if (!phone_validation.valid) errors.push(phone_validation.error);
        
        return {
            isValid: errors.length === 0,
            errors,
            validated_data: data,
            password_strength: password_validation.strength || 0
        };
    }
}

/**
 * ============================================================================
 * مدیر توکن JWT
 * ============================================================================
 */

/**
 * @class JWTTokenManager
 * @implements {ITokenManager}
 * @description مدیریت توکن‌های JWT
 */
class JWTTokenManager {
    /**
     * @constructor
     * @param {string} secret - کلید مخفی
     * @param {Object} options - گزینه‌ها
     */
    constructor(secret = 'farsinglish-secret-key', options = {}) {
        /** @type {string} */
        this.secret = secret;
        /** @type {number} */
        this.access_token_expiry = options.access_token_expiry || AUTH_CONFIG.ACCESS_TOKEN_EXPIRY;
        /** @type {number} */
        this.refresh_token_expiry = options.refresh_token_expiry || AUTH_CONFIG.REFRESH_TOKEN_EXPIRY;
        /** @type {string} */
        this.issuer = options.issuer || 'farsinglish';
        /** @type {string} */
        this.audience = options.audience || 'farsinglish-users';
    }

    /**
     * تولید توکن
     * @param {Object} payload - داده‌های توکن
     * @param {string} type - نوع توکن (access/refresh)
     * @returns {string} توکن تولید شده
     */
    generate_token(payload, type = 'access') {
        try {
            const header = {
                alg: 'HS256',
                typ: 'JWT',
                kid: this._generate_key_id()
            };
            
            const expiry = type === 'access' ? this.access_token_expiry : this.refresh_token_expiry;
            
            const now = Math.floor(Date.now() / 1000);
            const payload_data = {
                ...payload,
                iss: this.issuer,
                aud: this.audience,
                iat: now,
                nbf: now,
                exp: now + Math.floor(expiry / 1000),
                jti: this._generate_jti(),
                type: type
            };
            
            const encoded_header = this._base64url_encode(JSON.stringify(header));
            const encoded_payload = this._base64url_encode(JSON.stringify(payload_data));
            const signature = this._create_signature(`${encoded_header}.${encoded_payload}`);
            
            return `${encoded_header}.${encoded_payload}.${signature}`;
        } catch (error) {
            console.error('خطا در تولید توکن:', error);
            throw new TokenError('خطا در تولید توکن', 'GENERATION_FAILED');
        }
    }

    /**
     * بررسی اعتبار توکن
     * @param {string} token - توکن
     * @returns {{isValid: boolean, payload: Object|null, error: string|null}}
     */
    verify_token(token) {
        try {
            if (!token || typeof token !== 'string') {
                return { isValid: false, payload: null, error: 'توکن ارائه نشده است' };
            }

            const parts = token.split('.');
            if (parts.length !== 3) {
                return { isValid: false, payload: null, error: 'فرمت توکن نامعتبر است' };
            }

            const [encoded_header, encoded_payload, signature] = parts;
            
            // بررسی امضا
            const expected_signature = this._create_signature(`${encoded_header}.${encoded_payload}`);
            if (signature !== expected_signature) {
                return { isValid: false, payload: null, error: 'امضای توکن نامعتبر است' };
            }

            // دیکد و بررسی payload
            const payload = JSON.parse(this._base64url_decode(encoded_payload));
            
            // بررسی زمان
            const now = Math.floor(Date.now() / 1000);
            
            if (payload.exp && payload.exp < now) {
                return { isValid: false, payload, error: 'توکن منقضی شده است' };
            }
            
            if (payload.nbf && payload.nbf > now) {
                return { isValid: false, payload, error: 'توکن هنوز فعال نشده است' };
            }

            // بررسی issuer و audience
            if (payload.iss && payload.iss !== this.issuer) {
                return { isValid: false, payload, error: 'صادرکننده توکن نامعتبر است' };
            }

            return { 
                isValid: true, 
                payload,
                error: null
            };

        } catch (error) {
            return { 
                isValid: false, 
                payload: null,
                error: 'توکن نامعتبر است: ' + error.message 
            };
        }
    }

    /**
     * دیکد کردن توکن
     * @param {string} token - توکن
     * @returns {Object|null} payload توکن
     */
    decode_token(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return null;
            }
            
            return JSON.parse(this._base64url_decode(parts[1]));
        } catch (error) {
            return null;
        }
    }

    /**
     * بررسی انقضای توکن
     * @param {string} token - توکن
     * @returns {boolean} آیا منقضی شده؟
     */
    is_token_expired(token) {
        const decoded = this.decode_token(token);
        if (!decoded || !decoded.exp) {
            return true;
        }
        
        return decoded.exp < Math.floor(Date.now() / 1000);
    }

    /**
     * تمدید توکن
     * @param {string} old_token - توکن قدیمی
     * @returns {string} توکن جدید
     * @throws {TokenError}
     */
    refresh_token(old_token) {
        const verification = this.verify_token(old_token);
        if (!verification.isValid) {
            throw new TokenError('توکن نامعتبر است', 'INVALID_TOKEN');
        }

        if (verification.payload.type === 'refresh') {
            const { userId, email, role } = verification.payload;
            return this.generate_token({ userId, email, role }, 'access');
        }

        throw new TokenError('توکن معتبر برای تمدید نیست', 'INVALID_TYPE');
    }

    /**
     * تولید شناسه کلید
     * @private
     * @returns {string}
     */
    _generate_key_id() {
        return Math.random().toString(36).substring(2, 10);
    }

    /**
     * تولید شناسه یکتا برای توکن
     * @private
     * @returns {string}
     */
    _generate_jti() {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }

    /**
     * encode base64url
     * @private
     * @param {string} str - رشته ورودی
     * @returns {string}
     */
    _base64url_encode(str) {
        return btoa(str)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * decode base64url
     * @private
     * @param {string} str - رشته ورودی
     * @returns {string}
     */
    _base64url_decode(str) {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) {
            str += '=';
        }
        return atob(str);
    }

    /**
     * ایجاد امضا
     * @private
     * @param {string} data - داده
     * @returns {string}
     */
    _create_signature(data) {
        const encoder = new TextEncoder();
        const key_data = encoder.encode(this.secret);
        const message_data = encoder.encode(data);
        
        return this._base64url_encode(
            Array.from(message_data)
                .map((b, i) => b ^ (key_data[i % key_data.length] || 0))
                .reduce((acc, val) => acc + val.toString(16).padStart(2, '0'), '')
        );
    }
}

/**
 * ============================================================================
 * مدیر توکن تمدید
 * ============================================================================
 */

/**
 * @class RefreshTokenManager
 * @description مدیریت توکن‌های تمدید
 */
class RefreshTokenManager {
    /**
     * @constructor
     * @param {IAuthRepository} auth_repository - مخزن احراز هویت
     * @param {ITokenManager} token_manager - مدیر توکن
     */
    constructor(auth_repository, token_manager) {
        /** @type {IAuthRepository} */
        this.auth_repository = auth_repository;
        /** @type {ITokenManager} */
        this.token_manager = token_manager;
    }

    /**
     * تولید توکن تمدید
     * @param {string} user_id - شناسه کاربر
     * @param {Object} user_data - داده‌های کاربر
     * @returns {Promise<{token: string, expires_at: string}>}
     */
    async generate_refresh_token(user_id, user_data = {}) {
        try {
            const refresh_token = this.token_manager.generate_token(
                { 
                    user_id, 
                    email: user_data.email,
                    role: user_data.role || 'user',
                    type: 'refresh' 
                },
                'refresh'
            );
            
            const expires_at = new Date();
            expires_at.setDate(expires_at.getDate() + 30); // 30 روز
            
            const token_data = {
                user_id: user_id,
                token: refresh_token,
                expires_at: expires_at.toISOString(),
                created_at: new Date().toISOString(),
                revoked: false
            };
            
            await this.auth_repository.save_refresh_token(token_data);
            
            return {
                token: refresh_token,
                expires_at: expires_at.toISOString()
            };
        } catch (error) {
            console.error('خطا در تولید refresh token:', error);
            throw new TokenError('خطا در ایجاد توکن تمدید', 'GENERATION_FAILED');
        }
    }

    /**
     * تمدید توکن دسترسی
     * @param {string} refresh_token - توکن تمدید
     * @returns {Promise<Object>} توکن‌های جدید
     */
    async refresh_access_token(refresh_token) {
        try {
            if (!refresh_token) {
                throw new TokenError('Refresh token الزامی است', 'MISSING_TOKEN');
            }

            const verification = this.token_manager.verify_token(refresh_token);
            if (!verification.isValid) {
                throw new TokenError('Refresh token نامعتبر است: ' + verification.error, 'INVALID_TOKEN');
            }

            if (verification.payload.type !== 'refresh') {
                throw new TokenError('توکن ارائه شده از نوع refresh نیست', 'INVALID_TYPE');
            }

            const token_data = await this.auth_repository.find_refresh_token(refresh_token);
            
            if (!token_data) {
                throw new TokenError('Refresh token در سیستم یافت نشد', 'NOT_FOUND');
            }

            if (token_data.revoked) {
                throw new TokenError('Refresh token باطل شده است', 'REVOKED');
            }

            if (new Date(token_data.expires_at) < new Date()) {
                throw new TokenError('Refresh token منقضی شده است', 'EXPIRED');
            }

            const access_token = this.token_manager.generate_token(
                {
                    user_id: verification.payload.user_id,
                    email: verification.payload.email,
                    role: verification.payload.role,
                    type: 'access'
                },
                'access'
            );

            return {
                access_token: access_token,
                refresh_token: refresh_token,
                expires_in: 604800 // 7 روز
            };

        } catch (error) {
            console.error('خطا در تمدید توکن:', error);
            throw error;
        }
    }

    /**
     * باطل کردن توکن تمدید
     * @param {string} refresh_token - توکن تمدید
     * @returns {Promise<boolean>}
     */
    async revoke_refresh_token(refresh_token) {
        try {
            await this.auth_repository.delete_refresh_token(refresh_token);
            return true;
        } catch (error) {
            console.error('خطا در باطل کردن refresh token:', error);
            return false;
        }
    }
}

/**
 * ============================================================================
 * سرویس اصلی احراز هویت
 * ============================================================================
 */

/**
 * @typedef {Object} AuthServiceOptions
 * @property {IAuthRepository} auth_repository - مخزن احراز هویت
 * @property {Object} state_manager - مدیر وضعیت
 * @property {ITokenManager} [token_manager] - مدیر توکن
 * @property {IAuthValidator} [validator] - اعتبارسنج
 * @property {IPasswordHasher} [password_hasher] - هش‌کننده رمز
 * @property {RateLimiter} [rate_limiter] - محدودکننده تلاش
 * @property {AuthEventEmitter} [event_emitter] - انتشاردهنده رویداد
 * @property {RefreshTokenManager} [refresh_token_manager] - مدیر توکن تمدید
 */

/**
 * @class AuthService
 * @description سرویس اصلی احراز هویت
 */
class AuthService {
    /**
     * @constructor
     * @param {AuthServiceOptions} options - گزینه‌ها
     */
    constructor(options = {}) {
        // Dependency Injection
        /** @type {IAuthRepository} */
        this.auth_repository = options.auth_repository;
        /** @type {ITokenManager} */
        this.token_manager = options.token_manager || new JWTTokenManager();
        /** @type {IAuthValidator} */
        this.validator = options.validator || new AuthValidatorImpl();
        /** @type {Object} */
        this.state_manager = options.state_manager;
        /** @type {IPasswordHasher} */
        this.password_hasher = options.password_hasher || new PasswordHasherImpl();
        /** @type {RateLimiter} */
        this.rate_limiter = options.rate_limiter || new RateLimiter();
        /** @type {AuthEventEmitter} */
        this.event_emitter = options.event_emitter || new AuthEventEmitter();
        /** @type {RefreshTokenManager} */
        this.refresh_token_manager = options.refresh_token_manager || 
            new RefreshTokenManager(this.auth_repository, this.token_manager);

        if (!this.auth_repository || !this.state_manager) {
            throw new Error('auth_repository و state_manager اجباری هستند');
        }

        /** @type {Object|null} */
        this.current_user = null;
        /** @type {TokenResponseDTO|null} */
        this.current_tokens = null;
        /** @type {boolean} */
        this.is_initialized = false;
    }

    /**
     * مقداردهی اولیه سرویس
     * @returns {Promise<void>}
     */
    async init() {
        if (this.is_initialized) return;
        
        try {
            const saved_auth = await this._load_auth_state();
            if (saved_auth) {
                const is_valid = await this.check_auth();
                if (is_valid) {
                    this.event_emitter.emit(AUTH_EVENTS.RESTORED, { user: this.current_user });
                }
            }
            this.is_initialized = true;
        } catch (error) {
            console.error('خطا در مقداردهی اولیه AuthService:', error);
        }
    }

    /**
     * ثبت‌نام کاربر جدید
     * @param {RegisterRequestDTO|Object} register_data - داده‌های ثبت‌نام
     * @returns {Promise<AuthResponseDTO>}
     * @throws {ValidationError|AuthError}
     */
    async register(register_data) {
        try {
            const dto = register_data instanceof RegisterRequestDTO 
                ? register_data 
                : new RegisterRequestDTO(register_data);

            const validation = dto.validate();
            if (!validation.isValid) {
                throw new ValidationError(validation.errors);
            }

            const advanced_validation = this.validator.validate_register_data(dto);
            if (!advanced_validation.isValid) {
                throw new ValidationError(advanced_validation.errors);
            }

            const existing_user = await this.auth_repository.find_user_by_email(dto.email);
            if (existing_user) {
                throw new ValidationError(['این ایمیل قبلاً ثبت شده است']);
            }

            const salt = this.password_hasher.generate_salt();
            const password_hash = await this.password_hasher.hash(dto.password + salt);

            const user_model = dto.to_user_model(password_hash, salt);
            const created_user = await this.auth_repository.create_user(user_model);

            if (!created_user || !created_user.id) {
                throw new AuthError('خطا در ایجاد حساب کاربری', 'CREATION_FAILED');
            }

            const token_payload = {
                user_id: created_user.id,
                email: created_user.email,
                role: created_user.role || 'user'
            };

            const access_token = this.token_manager.generate_token(token_payload, 'access');
            const refresh_token_data = await this.refresh_token_manager.generate_refresh_token(
                created_user.id,
                created_user
            );

            const tokens = new TokenResponseDTO(access_token, refresh_token_data.token, 604800);

            const session = await this._create_session(
                created_user.id, 
                access_token, 
                false,
                refresh_token_data.token
            );

            await this._update_auth_state(created_user, tokens, 'register');

            this.event_emitter.emit(AUTH_EVENTS.REGISTERED, {
                user_id: created_user.id,
                email: created_user.email
            });

            return new AuthResponseDTO(created_user, tokens, session);

        } catch (error) {
            this.event_emitter.emit(AUTH_EVENTS.ERROR, { 
                operation: 'register', 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * ورود کاربر
     * @param {LoginRequestDTO|Object} login_data - داده‌های ورود
     * @returns {Promise<AuthResponseDTO>}
     * @throws {ValidationError|RateLimitError|AuthError}
     */
    async login(login_data) {
        try {
            const dto = login_data instanceof LoginRequestDTO 
                ? login_data 
                : new LoginRequestDTO(login_data);

            const validation = dto.validate();
            if (!validation.isValid) {
                throw new ValidationError(validation.errors);
            }

            this.rate_limiter.check(dto.email);

            const user = await this.auth_repository.find_user_by_email(dto.email);
            if (!user) {
                throw new ValidationError(['ایمیل یا رمز عبور اشتباه است']);
            }

            const is_password_valid = await this.password_hasher.verify(dto.password, user.password_hash);
            if (!is_password_valid) {
                const remaining_attempts = this.rate_limiter.get_remaining_attempts(dto.email);
                throw new ValidationError([
                    `ایمیل یا رمز عبور اشتباه است. ${remaining_attempts} تلاش باقی‌مانده.`
                ]);
            }

            this.rate_limiter.reset(dto.email);

            if (dto.remember_me) {
                await this._revoke_previous_sessions(user.id);
            }

            const token_payload = {
                user_id: user.id,
                email: user.email,
                role: user.role || 'user'
            };

            const access_token = this.token_manager.generate_token(token_payload, 'access');
            const refresh_token_data = await this.refresh_token_manager.generate_refresh_token(
                user.id,
                user
            );

            const tokens = new TokenResponseDTO(access_token, refresh_token_data.token, 604800);

            const session = await this._create_session(
                user.id, 
                access_token, 
                dto.remember_me,
                refresh_token_data.token,
                dto.device_info
            );

            await this.auth_repository.update_user(user.id, {
                last_active: new Date().toISOString(),
                login_count: (user.login_count || 0) + 1
            });

            await this._update_auth_state(user, tokens, 'login');

            this.event_emitter.emit(AUTH_EVENTS.LOGGED_IN, { 
                user_id: user.id,
                remember_me: dto.remember_me 
            });

            return new AuthResponseDTO(user, tokens, session);

        } catch (error) {
            this.event_emitter.emit(AUTH_EVENTS.ERROR, { 
                operation: 'login', 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * خروج کاربر
     * @param {boolean} everywhere - خروج از همه دستگاه‌ها
     * @returns {Promise<void>}
     */
    async logout(everywhere = false) {
        try {
            const current_state = this.state_manager.getState();
            const user_id = current_state.auth.user?.id;
            const session_id = current_state.auth.session_id;

            if (user_id) {
                if (everywhere) {
                    await this._revoke_all_sessions(user_id);
                } else {
                    await this.auth_repository.delete_session(user_id, session_id);
                }

                if (this.current_tokens?.refresh_token) {
                    await this.refresh_token_manager.revoke_refresh_token(this.current_tokens.refresh_token);
                }

                await this.auth_repository.update_user(user_id, {
                    last_active: new Date().toISOString()
                });
            }

            this.event_emitter.emit(AUTH_EVENTS.LOGGED_OUT, { user_id, everywhere });

            await this.state_manager.dispatch('USER_LOGOUT', { everywhere });
            
            this.current_user = null;
            this.current_tokens = null;

            this._clear_auth_storage();

        } catch (error) {
            console.error('خطا در خروج:', error);
            this.event_emitter.emit(AUTH_EVENTS.ERROR, { 
                operation: 'logout', 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * تمدید توکن‌ها
     * @returns {Promise<Object>}
     * @throws {AuthError}
     */
    async refresh_tokens() {
        try {
            const current_state = this.state_manager.getState();
            const refresh_token = current_state.auth.tokens?.refresh_token;

            if (!refresh_token) {
                throw new AuthError('Refresh token یافت نشد', 'NO_REFRESH_TOKEN');
            }

            const new_tokens = await this.refresh_token_manager.refresh_access_token(refresh_token);

            await this.state_manager.dispatch('TOKEN_REFRESHED', new_tokens);
            
            this.current_tokens = new_tokens;

            this.event_emitter.emit(AUTH_EVENTS.TOKEN_REFRESHED);

            return new_tokens;

        } catch (error) {
            await this.logout();
            throw new AuthError('نشست شما منقضی شده است. لطفاً مجدداً وارد شوید.', 'SESSION_EXPIRED');
        }
    }

    /**
     * بررسی وضعیت احراز هویت
     * @returns {Promise<boolean>}
     */
    async check_auth() {
        try {
            const current_state = this.state_manager.getState();
            
            if (!current_state.auth.isAuthenticated || !current_state.auth.tokens?.access_token) {
                return false;
            }

            const token = current_state.auth.tokens.access_token;
            const token_validation = this.token_manager.verify_token(token);
            
            if (!token_validation.isValid) {
                if (token_validation.error.includes('منقضی')) {
                    try {
                        await this.refresh_tokens();
                        return true;
                    } catch {
                        await this.logout();
                        return false;
                    }
                }
                
                await this.logout();
                return false;
            }

            const user = await this.auth_repository.find_user_by_id(token_validation.payload.user_id);
            if (!user) {
                await this.logout();
                return false;
            }

            await this.state_manager.dispatch('USER_UPDATE', user);
            this.current_user = user;

            return true;

        } catch (error) {
            console.error('خطا در بررسی وضعیت احراز:', error);
            return false;
        }
    }

    /**
     * دریافت کاربر فعلی
     * @returns {Promise<UserResponseDTO|null>}
     */
    async get_current_user() {
        if (this.current_user) {
            return UserResponseDTO.from_user_model(this.current_user);
        }

        const current_state = this.state_manager.getState();
        if (current_state.auth.user) {
            return UserResponseDTO.from_user_model(current_state.auth.user);
        }

        return null;
    }

    /**
     * دریافت توکن فعلی
     * @returns {string|null}
     */
    get_current_token() {
        if (this.current_tokens?.access_token) {
            return this.current_tokens.access_token;
        }

        const current_state = this.state_manager.getState();
        return current_state.auth.tokens?.access_token || null;
    }

    /**
     * به‌روزرسانی پروفایل کاربر
     * @param {Object} update_data - داده‌های به‌روزرسانی
     * @returns {Promise<UserResponseDTO>}
     * @throws {ValidationError|AuthError}
     */
    async update_profile(update_data) {
        try {
            const current_state = this.state_manager.getState();
            const user_id = current_state.auth.user?.id;

            if (!user_id) {
                throw new AuthError('کاربر وارد سیستم نشده است', 'NOT_AUTHENTICATED');
            }

            if (update_data.email) {
                const email_validation = this.validator.validate_email(update_data.email);
                if (!email_validation.valid) {
                    throw new ValidationError([email_validation.error]);
                }
                
                if (update_data.email !== current_state.auth.user.email) {
                    const existing_user = await this.auth_repository.find_user_by_email(update_data.email);
                    if (existing_user && existing_user.id !== user_id) {
                        throw new ValidationError(['این ایمیل قبلاً توسط کاربر دیگری استفاده شده است']);
                    }
                }
            }

            if (update_data.username) {
                const username_validation = this.validator.validate_username(update_data.username);
                if (!username_validation.valid) {
                    throw new ValidationError([username_validation.error]);
                }
            }

            if (update_data.phone) {
                const phone_validation = this.validator.validate_phone(update_data.phone);
                if (!phone_validation.valid) {
                    throw new ValidationError([phone_validation.error]);
                }
            }

            const updated_user = await this.auth_repository.update_user(user_id, {
                ...update_data,
                updated_at: new Date().toISOString()
            });

            if (!updated_user) {
                throw new AuthError('خطا در به‌روزرسانی پروفایل', 'UPDATE_FAILED');
            }

            await this.state_manager.dispatch('USER_UPDATE', updated_user);
            this.current_user = updated_user;

            this.event_emitter.emit(AUTH_EVENTS.PROFILE_UPDATED, { 
                user_id, 
                changes: Object.keys(update_data) 
            });

            return UserResponseDTO.from_user_model(updated_user);

        } catch (error) {
            console.error('خطا در به‌روزرسانی پروفایل:', error);
            this.event_emitter.emit(AUTH_EVENTS.ERROR, { 
                operation: 'update_profile', 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * تغییر رمز عبور
     * @param {string} current_password - رمز عبور فعلی
     * @param {string} new_password - رمز عبور جدید
     * @returns {Promise<boolean>}
     * @throws {ValidationError|AuthError}
     */
    async change_password(current_password, new_password) {
        try {
            const current_state = this.state_manager.getState();
            const user = current_state.auth.user;

            if (!user) {
                throw new AuthError('کاربر وارد سیستم نشده است', 'NOT_AUTHENTICATED');
            }

            const is_password_valid = await this.password_hasher.verify(
                current_password, 
                user.password_hash
            );
            
            if (!is_password_valid) {
                throw new ValidationError(['رمز عبور فعلی اشتباه است']);
            }

            const password_validation = this.validator.validate_password(new_password);
            if (!password_validation.valid) {
                throw new ValidationError([password_validation.error]);
            }

            const new_salt = this.password_hasher.generate_salt();
            const new_password_hash = await this.password_hasher.hash(new_password + new_salt);

            await this.auth_repository.update_user(user.id, {
                password_hash: new_password_hash,
                salt: new_salt,
                password_changed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            await this._revoke_other_sessions(user.id, current_state.auth.session_id);

            this.event_emitter.emit(AUTH_EVENTS.PASSWORD_CHANGED, { user_id: user.id });

            return true;

        } catch (error) {
            console.error('خطا در تغییر رمز عبور:', error);
            this.event_emitter.emit(AUTH_EVENTS.ERROR, { 
                operation: 'change_password', 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * درخواست بازنشانی رمز عبور
     * @param {string} email - ایمیل کاربر
     * @returns {Promise<boolean>}
     */
    async request_password_reset(email) {
        try {
            const user = await this.auth_repository.find_user_by_email(email);
            
            if (!user) {
                return true;
            }

            const reset_token = this.token_manager.generate_token(
                { user_id: user.id, purpose: 'password-reset' },
                'access'
            );

            const expires_at = new Date();
            expires_at.setHours(expires_at.getHours() + 1);

            await this.auth_repository.save_reset_token({
                user_id: user.id,
                token: reset_token,
                expires_at: expires_at.toISOString()
            });

            console.log(`لینک بازنشانی رمز عبور برای ${email}: /reset-password?token=${reset_token}`);

            return true;

        } catch (error) {
            console.error('خطا در درخواست بازنشانی رمز عبور:', error);
            throw new AuthError('خطا در ارسال درخواست بازنشانی رمز عبور', 'RESET_REQUEST_FAILED');
        }
    }

    /**
     * بازنشانی رمز عبور با توکن
     * @param {string} token - توکن بازنشانی
     * @param {string} new_password - رمز عبور جدید
     * @returns {Promise<boolean>}
     * @throws {TokenError|ValidationError}
     */
    async reset_password(token, new_password) {
        try {
            const verification = this.token_manager.verify_token(token);
            
            if (!verification.isValid || verification.payload.purpose !== 'password-reset') {
                throw new TokenError('توکن بازنشانی نامعتبر است', 'INVALID_RESET_TOKEN');
            }

            const user_id = verification.payload.user_id;

            const password_validation = this.validator.validate_password(new_password);
            if (!password_validation.valid) {
                throw new ValidationError([password_validation.error]);
            }

            const new_salt = this.password_hasher.generate_salt();
            const new_password_hash = await this.password_hasher.hash(new_password + new_salt);

            await this.auth_repository.update_user(user_id, {
                password_hash: new_password_hash,
                salt: new_salt,
                password_changed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            await this._revoke_all_sessions(user_id);

            this.event_emitter.emit(AUTH_EVENTS.PASSWORD_RESET, { user_id });

            return true;

        } catch (error) {
            console.error('خطا در بازنشانی رمز عبور:', error);
            throw error;
        }
    }

    /**
     * دریافت انتشاردهنده رویداد
     * @returns {AuthEventEmitter}
     */
    get_event_emitter() {
        return this.event_emitter;
    }

    /**
     * ایجاد جلسه کاربر
     * @private
     * @param {string} user_id - شناسه کاربر
     * @param {string} access_token - توکن دسترسی
     * @param {boolean} remember_me - مرا به خاطر بسپار
     * @param {string} refresh_token - توکن تمدید
     * @param {string} [device_info] - اطلاعات دستگاه
     * @returns {Promise<Object>}
     */
    async _create_session(user_id, access_token, remember_me = false, refresh_token = null, device_info = null) {
        const expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + (remember_me ? 
            AUTH_CONFIG.SESSION.REMEMBER_DAYS : AUTH_CONFIG.SESSION.DEFAULT_DAYS));
        
        const session_data = {
            user_id: user_id,
            access_token: access_token,
            refresh_token: refresh_token,
            created_at: new Date().toISOString(),
            expires_at: expires_at.toISOString(),
            device_info: device_info || (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'),
            remember_me: remember_me,
            last_activity: new Date().toISOString()
        };

        return await this.auth_repository.save_session(session_data);
    }

    /**
     * به‌روزرسانی state احراز هویت
     * @private
     * @param {Object} user - مدل کاربر
     * @param {TokenResponseDTO} tokens - توکن‌ها
     * @param {string} action - عملیات
     */
    async _update_auth_state(user, tokens, action) {
        const auth_data = {
            user: UserResponseDTO.from_user_model(user),
            tokens: tokens,
            is_authenticated: true,
            last_action: action,
            last_updated: new Date().toISOString()
        };

        await this.state_manager.dispatch(
            action === 'register' ? 'USER_REGISTER' : 'USER_LOGIN',
            auth_data
        );

        this.current_user = user;
        this.current_tokens = tokens;

        this._save_auth_state(auth_data);
    }

    /**
     * باطل کردن جلسات قبلی
     * @private
     * @param {string} user_id - شناسه کاربر
     */
    async _revoke_previous_sessions(user_id) {
        try {
            await this.auth_repository.delete_all_sessions(user_id);
        } catch (error) {
            console.warn('خطا در باطل کردن جلسات قبلی:', error);
        }
    }

    /**
     * باطل کردن همه جلسات
     * @private
     * @param {string} user_id - شناسه کاربر
     */
    async _revoke_all_sessions(user_id) {
        try {
            await this.auth_repository.delete_all_sessions(user_id);
        } catch (error) {
            console.warn('خطا در باطل کردن همه جلسات:', error);
        }
    }

    /**
     * باطل کردن جلسات دیگر
     * @private
     * @param {string} user_id - شناسه کاربر
     * @param {string} current_session_id - شناسه جلسه فعلی
     */
    async _revoke_other_sessions(user_id, current_session_id) {
        try {
            await this.auth_repository.delete_other_sessions?.(user_id, current_session_id);
        } catch (error) {
            console.warn('خطا در باطل کردن جلسات دیگر:', error);
        }
    }

    /**
     * بارگذاری وضعیت احراز از localStorage
     * @private
     * @returns {Object|null}
     */
    _load_auth_state() {
        try {
            const saved = localStorage.getItem('farsinglish_auth');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.expires_at && new Date(parsed.expires_at) > new Date()) {
                    return parsed;
                }
            }
        } catch (error) {
            console.warn('خطا در بارگذاری وضعیت احراز:', error);
        }
        return null;
    }

    /**
     * ذخیره وضعیت احراز در localStorage
     * @private
     * @param {Object} auth_data - داده‌های احراز
     */
    _save_auth_state(auth_data) {
        try {
            const expires_at = new Date();
            expires_at.setHours(expires_at.getHours() + 24);
            
            const save_data = {
                ...auth_data,
                expires_at: expires_at.toISOString()
            };
            
            localStorage.setItem('farsinglish_auth', JSON.stringify(save_data));
        } catch (error) {
            console.warn('خطا در ذخیره وضعیت احراز:', error);
        }
    }

    /**
     * پاک‌سازی localStorage
     * @private
     */
    _clear_auth_storage() {
        try {
            localStorage.removeItem('farsinglish_auth');
        } catch (error) {
            console.warn('خطا در پاک‌سازی localStorage:', error);
        }
    }
}

/**
 * ============================================================================
 * Factory برای ایجاد AuthService
 * ============================================================================
 */

/**
 * @class AuthServiceFactory
 * @description کارخانه تولید سرویس احراز هویت
 */
class AuthServiceFactory {
    /**
     * ایجاد نمونه AuthService
     * @param {IAuthRepository} auth_repository - مخزن احراز هویت
     * @param {Object} state_manager - مدیر وضعیت
     * @param {Object} options - گزینه‌های اضافی
     * @returns {AuthService}
     */
    static create(auth_repository, state_manager, options = {}) {
        const token_manager = options.token_manager || new JWTTokenManager(
            options.secret || 'farsinglish-secret-key',
            {
                access_token_expiry: options.access_token_expiry,
                refresh_token_expiry: options.refresh_token_expiry,
                issuer: options.issuer || 'farsinglish'
            }
        );
        
        const validator = options.validator || new AuthValidatorImpl();
        const password_hasher = options.password_hasher || new PasswordHasherImpl();
        const rate_limiter = options.rate_limiter || new RateLimiter(
            options.max_login_attempts || AUTH_CONFIG.RATE_LIMIT.MAX_ATTEMPTS,
            options.rate_limit_window || AUTH_CONFIG.RATE_LIMIT.WINDOW_MS
        );
        const event_emitter = options.event_emitter || new AuthEventEmitter();
        
        const refresh_token_manager = new RefreshTokenManager(auth_repository, token_manager);

        const auth_service = new AuthService({
            auth_repository,
            token_manager,
            validator,
            state_manager,
            password_hasher,
            rate_limiter,
            event_emitter,
            refresh_token_manager
        });

        auth_service.init().catch(console.warn);

        return auth_service;
    }

    /**
     * ایجاد نمونه Mock برای تست
     * @param {Object} state_manager - مدیر وضعیت
     * @param {Object} options - گزینه‌ها
     * @returns {AuthService}
     */
    static create_with_mock(state_manager, options = {}) {
        const mock_repository = {
            users: new Map(),
            sessions: new Map(),
            refresh_tokens: new Map(),

            async create_user(user_data) {
                const id = `user-${Date.now()}-${Math.random().toString(36).substring(2)}`;
                const user = { id, ...user_data, created_at: new Date().toISOString() };
                this.users.set(id, user);
                this.users.set(user_data.email, user);
                return user;
            },

            async find_user_by_email(email) {
                return this.users.get(email) || null;
            },

            async find_user_by_id(id) {
                return this.users.get(id) || null;
            },

            async update_user(id, update_data) {
                const user = this.users.get(id);
                if (user) {
                    const updated = { ...user, ...update_data };
                    this.users.set(id, updated);
                    this.users.set(user.email, updated);
                    return updated;
                }
                return null;
            },

            async save_session(session_data) {
                const id = `session-${Date.now()}`;
                const session = { id, ...session_data };
                this.sessions.set(id, session);
                this.sessions.set(session_data.user_id, session);
                return session;
            },

            async get_session(user_id) {
                return this.sessions.get(user_id) || null;
            },

            async delete_session(user_id, session_id) {
                this.sessions.delete(user_id);
                if (session_id) {
                    this.sessions.delete(session_id);
                }
                return true;
            },

            async delete_all_sessions(user_id) {
                this.sessions.clear();
                return true;
            },

            async save_refresh_token(token_data) {
                const id = `refresh-${Date.now()}`;
                const token = { id, ...token_data };
                this.refresh_tokens.set(token_data.token, token);
                return token;
            },

            async find_refresh_token(token) {
                return this.refresh_tokens.get(token) || null;
            },

            async delete_refresh_token(token) {
                this.refresh_tokens.delete(token);
                return true;
            },

            async save_reset_token(token_data) {
                return true;
            }
        };

        return AuthServiceFactory.create(mock_repository, state_manager, options);
    }
}

/**
 * ============================================================================
 * Export
 * ============================================================================
 */

export {
    // کلاس‌های اصلی
    AuthService,
    AuthServiceFactory,
    
    // کلاس‌های خطا
    AuthError,
    RateLimitError,
    ValidationError,
    TokenError,
    
    // پیاده‌سازی‌ها
    AuthValidatorImpl,
    JWTTokenManager,
    PasswordHasherImpl,
    RateLimiter,
    AuthEventEmitter,
    RefreshTokenManager,
    
    // DTOها
    RegisterRequestDTO,
    LoginRequestDTO,
    AuthResponseDTO,
    UserResponseDTO,
    TokenResponseDTO,
    
    // ثابت‌ها
    AUTH_CONFIG,
    AUTH_EVENTS
};
