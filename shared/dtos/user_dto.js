/**
 * @fileoverview Data Transfer Object (DTO) برای مدل کاربر
 * 
 * این ماژول مسئولیت اعتبارسنجی، تبدیل و انتقال امن داده‌های کاربر
 * بین لایه‌های مختلف برنامه را بر عهده دارد.
 * 
 * @module UserDTO
 * @author Farsinglish Team
 * @version 2.0.0
 */

import { Validator } from '../../core/utils/validator.js';
import { Result } from '../../core/utils/result.js';

/**
 * @typedef {Object} UserData
 * @property {string} id - شناسه یکتای کاربر
 * @property {string} username - نام کاربری
 * @property {string} email - ایمیل کاربر
 * @property {string} [fullName] - نام و نام خانوادگی (اختیاری)
 * @property {string} [avatar] - آواتار کاربر (اختیاری)
 * @property {Date} [birthDate] - تاریخ تولد (اختیاری)
 * @property {number} xp - امتیاز تجربی
 * @property {number} level - سطح کاربر
 * @property {number} streak - رکورد روزهای متوالی
 * @property {Date} createdAt - تاریخ ثبت‌نام
 * @property {Date} updatedAt - آخرین به‌روزرسانی
 * @property {Object} settings - تنظیمات کاربر
 * @property {string} settings.language - زبان ترجیحی
 * @property {boolean} settings.notifications - فعال بودن نوتیفیکیشن
 * @property {'light'|'dark'|'system'} settings.theme - تم انتخابی
 */

/**
 * @typedef {Object} UserCreateInput
 * @property {string} username - نام کاربری
 * @property {string} email - ایمیل کاربر
 * @property {string} password - رمز عبور
 * @property {string} [fullName] - نام و نام خانوادگی
 * @property {Date} [birthDate] - تاریخ تولد
 */

/**
 * @typedef {Object} UserUpdateInput
 * @property {string} [username] - نام کاربری
 * @property {string} [email] - ایمیل کاربر
 * @property {string} [fullName] - نام و نام خانوادگی
 * @property {string} [avatar] - آواتار کاربر
 * @property {Date} [birthDate] - تاریخ تولد
 * @property {Object} [settings] - تنظیمات کاربر
 */

/**
 * @typedef {Object} UserResponse
 * @property {string} id
 * @property {string} username
 * @property {string} email
 * @property {string} [fullName]
 * @property {string} [avatar]
 * @property {string} [birthDate]
 * @property {number} xp
 * @property {number} level
 * @property {number} streak
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {Object} settings
 */

/**
 * @typedef {Object} PublicUserProfile
 * @property {string} id
 * @property {string} username
 * @property {string} [fullName]
 * @property {string} [avatar]
 * @property {number} level
 * @property {number} streak
 * @property {Object} settings
 * @property {string} settings.language
 * @property {'light'|'dark'|'system'} settings.theme
 */

/**
 * @typedef {Object} SafeLogData
 * @property {string} id
 * @property {string} username
 * @property {string} emailMasked
 * @property {number} level
 */

/**
 * کلاس DTO کاربر با قابلیت اعتبارسنجی و تبدیل پیشرفته
 * @immutable
 */
export class UserDTO {
    /** @type {Validator} */
    static #validator = new Validator();

    /** @type {RegExp} */
    static #EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    /** @type {RegExp} */
    static #USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

    /** @type {RegExp} */
    static #URL_REGEX = /^(https?:\/\/|data:image\/)[^\s]+$/i;

    /** @type {number} */
    static #MIN_PASSWORD_LENGTH = 8;

    /** @type {number} */
    static #MAX_FULLNAME_LENGTH = 100;

    /** @type {RegExp} */
    static #PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;

    /** @type {number} */
    static #MIN_AGE = 5;

    /** @type {number} */
    static #MAX_AGE = 120;

    /**
     * قوانین اعتبارسنجی کاربر
     * @readonly
     * @enum {Object}
     */
    static VALIDATION_RULES = {
        USERNAME: {
            pattern: this.#USERNAME_REGEX,
            message: 'نام کاربری باید ۳-۲۰ کاراکتر و شامل حروف، اعداد و زیرخط باشد'
        },
        EMAIL: {
            pattern: this.#EMAIL_REGEX,
            message: 'ایمیل معتبر نیست'
        },
        PASSWORD: {
            pattern: this.#PASSWORD_REGEX,
            message: 'رمز عبور باید حداقل ۸ کاراکتر، شامل یک حرف بزرگ، یک عدد و یک کاراکتر خاص (!@#$%^&*) باشد'
        },
        AVATAR: {
            pattern: this.#URL_REGEX,
            message: 'آواتار باید یک URL معتبر یا تصویر data:image باشد'
        }
    };

    /**
     * اعتبارسنجی سریع یک فیلد
     * @param {string} field - نام فیلد
     * @param {*} value - مقدار فیلد
     * @returns {boolean} - معتبر بودن فیلد
     */
    static isValid(field, value) {
        switch (field) {
            case 'username':
                return this.#USERNAME_REGEX.test(value);
            case 'email':
                return this.#EMAIL_REGEX.test(value);
            case 'password':
                return this.#PASSWORD_REGEX.test(value);
            case 'avatar':
                return !value || this.#URL_REGEX.test(value);
            default:
                return true;
        }
    }

    /**
     * اعتبارسنجی تاریخ تولد
     * @param {Date|string} birthDate
     * @returns {{success: boolean, error?: string}}
     */
    static #validateBirthDate(birthDate) {
        if (!birthDate) return { success: true };
        
        const date = birthDate instanceof Date ? birthDate : new Date(birthDate);
        if (isNaN(date.getTime())) {
            return { success: false, error: 'تاریخ تولد معتبر نیست' };
        }

        const today = new Date();
        const age = today.getFullYear() - date.getFullYear();
        const monthDiff = today.getMonth() - date.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
            age--;
        }

        if (age < this.#MIN_AGE) {
            return { success: false, error: `سن باید حداقل ${this.#MIN_AGE} سال باشد` };
        }
        if (age > this.#MAX_AGE) {
            return { success: false, error: `سن نمی‌تواند بیش از ${this.#MAX_AGE} سال باشد` };
        }

        return { success: true };
    }

    /**
     * اعتبارسنجی و تبدیل داده‌های ورودی برای ایجاد کاربر
     * @param {UserCreateInput} input - داده‌های ورودی
     * @returns {Result<Omit<UserData, 'id'|'createdAt'|'updatedAt'>>} - نتیجه اعتبارسنجی
     */
    static fromCreateInput(input) {
        // 1. اعتبارسنجی وجود ورودی
        if (!input || typeof input !== 'object') {
            return Result.fail('ورودی ایجاد کاربر معتبر نیست');
        }

        // 2. اعتبارسنجی فیلدهای اجباری
        const requiredFields = ['username', 'email', 'password'];
        for (const field of requiredFields) {
            if (!input[field] || typeof input[field] !== 'string') {
                return Result.fail(`فیلد ${field} الزامی و باید رشته باشد`);
            }
        }

        // 3. اعتبارسنجی فرمت‌ها با قوانین جدید
        if (!this.#USERNAME_REGEX.test(input.username)) {
            return Result.fail(this.VALIDATION_RULES.USERNAME.message);
        }

        if (!this.#EMAIL_REGEX.test(input.email)) {
            return Result.fail(this.VALIDATION_RULES.EMAIL.message);
        }

        if (!this.#PASSWORD_REGEX.test(input.password)) {
            return Result.fail(this.VALIDATION_RULES.PASSWORD.message);
        }

        // 4. اعتبارسنجی فیلدهای اختیاری
        if (input.fullName && input.fullName.length > this.#MAX_FULLNAME_LENGTH) {
            return Result.fail(`نام و نام خانوادگی نمی‌تواند بیش از ${this.#MAX_FULLNAME_LENGTH} کاراکتر باشد`);
        }

        // 5. اعتبارسنجی تاریخ تولد
        if (input.birthDate) {
            const birthValidation = this.#validateBirthDate(input.birthDate);
            if (!birthValidation.success) {
                return Result.fail(birthValidation.error);
            }
        }

        // 6. ساخت آبجکت نهایی (بدون فیلدهای حساس)
        const userData = {
            username: input.username.trim(),
            email: input.email.toLowerCase().trim(),
            fullName: input.fullName?.trim(),
            birthDate: input.birthDate ? new Date(input.birthDate) : undefined
            // رمز عبور در اینجا ذخیره نمی‌شود - فقط اعتبارسنجی شد
        };

        // 7. حذف فیلدهای undefined
        const cleaned = Object.fromEntries(
            Object.entries(userData).filter(([_, v]) => v !== undefined)
        );

        return Result.ok(cleaned);
    }

    /**
     * اعتبارسنجی و تبدیل داده‌های ورودی برای به‌روزرسانی کاربر
     * @param {UserUpdateInput} input - داده‌های ورودی
     * @returns {Result<Partial<UserData>>} - نتیجه اعتبارسنجی
     */
    static fromUpdateInput(input) {
        // 1. اعتبارسنجی وجود ورودی
        if (!input || typeof input !== 'object') {
            return Result.fail('ورودی به‌روزرسانی کاربر معتبر نیست');
        }

        // 2. بررسی وجود حداقل یک فیلد برای به‌روزرسانی
        if (Object.keys(input).length === 0) {
            return Result.fail('حداقل یک فیلد برای به‌روزرسانی باید وارد شود');
        }

        /** @type {Partial<UserData>} */
        const updateData = {};

        // 3. اعتبارسنجی فیلدهای اختیاری
        if (input.username !== undefined) {
            if (typeof input.username !== 'string' || !this.#USERNAME_REGEX.test(input.username)) {
                return Result.fail(this.VALIDATION_RULES.USERNAME.message);
            }
            updateData.username = input.username.trim();
        }

        if (input.email !== undefined) {
            if (typeof input.email !== 'string' || !this.#EMAIL_REGEX.test(input.email)) {
                return Result.fail(this.VALIDATION_RULES.EMAIL.message);
            }
            updateData.email = input.email.toLowerCase().trim();
        }

        if (input.fullName !== undefined) {
            if (typeof input.fullName !== 'string') {
                return Result.fail('نام و نام خانوادگی باید رشته باشد');
            }
            if (input.fullName.length > this.#MAX_FULLNAME_LENGTH) {
                return Result.fail(`نام و نام خانوادگی نمی‌تواند بیش از ${this.#MAX_FULLNAME_LENGTH} کاراکتر باشد`);
            }
            updateData.fullName = input.fullName.trim() || undefined;
        }

        if (input.avatar !== undefined) {
            if (typeof input.avatar !== 'string') {
                return Result.fail('آواتار باید رشته باشد');
            }
            if (input.avatar && !this.#URL_REGEX.test(input.avatar)) {
                return Result.fail(this.VALIDATION_RULES.AVATAR.message);
            }
            updateData.avatar = input.avatar.trim() || undefined;
        }

        if (input.birthDate !== undefined) {
            const birthValidation = this.#validateBirthDate(input.birthDate);
            if (!birthValidation.success) {
                return Result.fail(birthValidation.error);
            }
            updateData.birthDate = input.birthDate ? new Date(input.birthDate) : undefined;
        }

        // 4. اعتبارسنجی تنظیمات
        if (input.settings !== undefined) {
            const settingsValidation = this.#validateSettings(input.settings);
            if (!settingsValidation.success) {
                return Result.fail(settingsValidation.error);
            }
            updateData.settings = settingsValidation.data;
        }

        return Result.ok(updateData);
    }

    /**
     * اعتبارسنجی تنظیمات کاربر
     * @param {Object} settings - تنظیمات ورودی
     * @returns {{success: boolean, data?: Object, error?: string}}
     */
    static #validateSettings(settings) {
        if (typeof settings !== 'object' || settings === null) {
            return { success: false, error: 'تنظیمات باید یک آبجکت باشد' };
        }

        /** @type {Object} */
        const validatedSettings = {};

        // اعتبارسنجی زبان
        if (settings.language !== undefined) {
            const validLanguages = ['fa', 'en'];
            if (typeof settings.language !== 'string' || !validLanguages.includes(settings.language)) {
                return { success: false, error: 'زبان باید fa یا en باشد' };
            }
            validatedSettings.language = settings.language;
        }

        // اعتبارسنجی نوتیفیکیشن
        if (settings.notifications !== undefined) {
            if (typeof settings.notifications !== 'boolean') {
                return { success: false, error: 'نوتیفیکیشن باید boolean باشد' };
            }
            validatedSettings.notifications = settings.notifications;
        }

        // اعتبارسنجی تم
        if (settings.theme !== undefined) {
            const validThemes = ['light', 'dark', 'system'];
            if (typeof settings.theme !== 'string' || !validThemes.includes(settings.theme)) {
                return { success: false, error: 'تم باید light, dark یا system باشد' };
            }
            validatedSettings.theme = settings.theme;
        }

        return { success: true, data: validatedSettings };
    }

    /**
     * تبدیل مدل کاربر به پاسخ API (حذف فیلدهای حساس)
     * @param {UserData} user - مدل کاربر
     * @returns {Result<UserResponse>} - پاسخ امن برای ارسال
     */
    static toResponse(user) {
        // 1. اعتبارسنجی ورودی
        if (!user || typeof user !== 'object') {
            return Result.fail('مدل کاربر معتبر نیست');
        }

        // 2. بررسی فیلدهای اجباری
        const requiredFields = ['id', 'username', 'email', 'xp', 'level', 'streak'];
        for (const field of requiredFields) {
            if (!user[field]) {
                return Result.fail(`فیلد ${field} در مدل کاربر وجود ندارد`);
            }
        }

        // 3. ساخت پاسخ امن (بدون رمز عبور و داده‌های حساس)
        /** @type {UserResponse} */
        const response = {
            id: user.id,
            username: user.username,
            email: user.email,
            xp: user.xp,
            level: user.level,
            streak: user.streak,
            createdAt: user.createdAt instanceof Date ? 
                user.createdAt.toISOString() : 
                new Date(user.createdAt).toISOString(),
            updatedAt: user.updatedAt instanceof Date ? 
                user.updatedAt.toISOString() : 
                new Date(user.updatedAt).toISOString(),
            settings: {
                language: user.settings?.language || 'fa',
                notifications: user.settings?.notifications ?? true,
                theme: user.settings?.theme || 'system'
            }
        };

        // 4. اضافه کردن فیلدهای اختیاری اگر وجود دارند
        if (user.fullName) {
            response.fullName = user.fullName;
        }

        if (user.avatar) {
            response.avatar = user.avatar;
        }

        if (user.birthDate) {
            response.birthDate = user.birthDate instanceof Date ? 
                user.birthDate.toISOString().split('T')[0] : 
                new Date(user.birthDate).toISOString().split('T')[0];
        }

        return Result.ok(response);
    }

    /**
     * تبدیل مدل کاربر به پروفایل عمومی (برای نمایش به دیگران)
     * @param {UserData} user - مدل کاربر
     * @returns {Result<PublicUserProfile>} - پروفایل عمومی
     */
    static toPublicProfile(user) {
        if (!user || typeof user !== 'object') {
            return Result.fail('مدل کاربر معتبر نیست');
        }

        /** @type {PublicUserProfile} */
        const profile = {
            id: user.id,
            username: user.username,
            level: user.level,
            streak: user.streak,
            settings: {
                language: user.settings?.language || 'fa',
                theme: user.settings?.theme || 'system'
            }
        };

        if (user.fullName) {
            profile.fullName = user.fullName;
        }

        if (user.avatar) {
            profile.avatar = user.avatar;
        }

        return Result.ok(profile);
    }

    /**
     * تبدیل مدل کاربر به داده‌های امن برای لاگ
     * @param {UserData} user - مدل کاربر
     * @returns {SafeLogData} - داده‌های امن برای لاگ
     */
    static toLog(user) {
        if (!user) {
            return {
                id: 'unknown',
                username: 'unknown',
                emailMasked: 'unknown',
                level: 0
            };
        }

        // ماسک کردن ایمیل: reza@gmail.com => re***@gmail.com
        const emailParts = user.email ? user.email.split('@') : ['', ''];
        const maskedEmail = emailParts[0] && emailParts[1] ? 
            `${emailParts[0].substring(0, 2)}***@${emailParts[1]}` : 
            'invalid-email';

        return {
            id: user.id,
            username: user.username,
            emailMasked: maskedEmail,
            level: user.level || 0
        };
    }

    /**
     * بررسی یکسان بودن دو کاربر
     * @param {UserData} user1 - کاربر اول
     * @param {UserData} user2 - کاربر دوم
     * @returns {boolean} - آیا برابر هستند؟
     */
    static equals(user1, user2) {
        if (!user1 || !user2) return false;
        return (
            user1.id === user2.id &&
            user1.username === user2.username &&
            user1.email === user2.email &&
            user1.xp === user2.xp &&
            user1.level === user2.level &&
            user1.streak === user2.streak
        );
    }

    /**
     * ایجاد یک کپی خالص از داده‌های کاربر
     * @param {UserData} user - کاربر اصلی
     * @returns {UserData} - کپی عمیق
     */
    static clone(user) {
        return JSON.parse(JSON.stringify(user));
    }
}

// اطمینان از immutable بودن
Object.freeze(UserDTO);
Object.freeze(UserDTO.VALIDATION_RULES);
