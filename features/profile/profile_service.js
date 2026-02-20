/**
 * @fileoverview سرویس مدیریت پروفایل کاربر
 * این ماژول مسئول تمام عملیات مرتبط با پروفایل کاربر است
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
    BASE_RETRY_DELAY: 100
};

/**
 * @typedef {Object} ProfileData
 * @property {string} id - شناسه یکتای کاربر
 * @property {string} username - نام کاربری
 * @property {string} email - ایمیل کاربر
 * @property {string} [avatarUrl] - آدرس تصویر پروفایل
 * @property {number} xp - امتیاز تجربه
 * @property {number} level - سطح کاربر
 * @property {Date} createdAt - تاریخ عضویت
 * @property {Date} lastActive - آخرین فعالیت
 */

/**
 * @typedef {Object} ProfileUpdateData
 * @property {string} [username] - نام کاربری جدید
 * @property {string} [email] - ایمیل جدید
 * @property {string} [avatarUrl] - آدرس تصویر جدید
 * @property {Object} [settings] - تنظیمات کاربر
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
    #currentUserId;

    /** @type {Map<string, Function>} */
    #listeners = new Map();

    /** @type {Map<string, {data: ProfileData, expires: number}>} */
    #profileCache = new Map();

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
            this.#currentUserId = state?.user?.id;

            logger.info('ProfileService initialized', {
                userId: this.#currentUserId
            });
        } catch (error) {
            logger.error('ProfileService initialization failed', { error });
        }
    }

    /**
     * اجرای عملیات با تلاش مجدد
     * @private
     * @template T
     * @param {Function} operation - عملیات دیتابیس
     * @param {string} operationName - نام عملیات
     * @returns {Promise<T>}
     */
    async #withRetry(operation, operationName) {
        let lastError;

        for (let i = 0; i < ProfileLimits.MAX_RETRIES; i++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                logger.warn(`${operationName} failed (attempt ${i + 1}/${ProfileLimits.MAX_RETRIES})`, {
                    error: error.message
                });

                if (i < ProfileLimits.MAX_RETRIES - 1) {
                    const delay = ProfileLimits.BASE_RETRY_DELAY * Math.pow(2, i);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }

    /**
     * دریافت پروفایل از کش
     * @private
     * @param {string} userId
     * @returns {ProfileData|null}
     */
    #getCachedProfile(userId) {
        const cached = this.#profileCache.get(userId);
        if (cached && cached.expires > Date.now()) {
            logger.debug('Cache hit for profile', { userId });
            return cached.data;
        }
        this.#profileCache.delete(userId);
        return null;
    }

    /**
     * ذخیره پروفایل در کش
     * @private
     * @param {string} userId
     * @param {ProfileData} profile
     */
    #cacheProfile(userId, profile) {
        this.#profileCache.set(userId, {
            data: profile,
            expires: Date.now() + ProfileLimits.CACHE_TTL
        });
        logger.debug('Profile cached', { userId });
    }

    /**
     * پاک کردن کش پروفایل
     * @private
     * @param {string} userId
     */
    #invalidateCache(userId) {
        this.#profileCache.delete(userId);
        logger.debug('Profile cache invalidated', { userId });
    }

    /**
     * اعتبارسنجی داده‌های به‌روزرسانی
     * @private
     * @param {ProfileUpdateData} data
     * @returns {ProfileUpdateData}
     * @throws {ValidationError}
     */
    #validateUpdateData(data) {
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

        if (data.email !== undefined && !this.#validateEmail(data.email)) {
            errors.email = 'ایمیل وارد شده معتبر نیست';
        }

        if (data.avatarUrl !== undefined) {
            try {
                new URL(data.avatarUrl);
            } catch {
                errors.avatarUrl = 'آدرس تصویر معتبر نیست';
            }
        }

        if (Object.keys(errors).length > 0) {
            throw new ValidationError('خطا در اعتبارسنجی داده‌ها', errors);
        }

        return data;
    }

    /**
     * دریافت پروفایل کاربر جاری
     * @public
     * @async
     * @returns {Promise<Result<ProfileData>>}
     */
    async getCurrentProfile() {
        try {
            if (!this.#currentUserId) {
                return Result.fail('کاربر وارد نشده است', { code: 'UNAUTHORIZED' });
            }

            // بررسی کش
            const cached = this.#getCachedProfile(this.#currentUserId);
            if (cached) {
                return Result.ok(cached, { source: 'cache' });
            }

            // دریافت از دیتابیس با retry
            /** @type {ProfileData} */
            const profile = await this.#withRetry(
                () => db.users.get(this.#currentUserId),
                'getCurrentProfile'
            );

            if (!profile) {
                return Result.fail('پروفایل یافت نشد', { code: 'NOT_FOUND' });
            }

            // محاسبه سطح بر اساس XP
            const level = UserModel.calculateLevel(profile.xp);

            /** @type {ProfileData} */
            const enrichedProfile = {
                ...profile,
                level,
                lastActive: new Date()
            };

            // ذخیره در کش
            this.#cacheProfile(this.#currentUserId, enrichedProfile);

            logger.debug('Profile retrieved', { userId: this.#currentUserId });
            return Result.ok(enrichedProfile, { source: 'database' });

        } catch (error) {
            logger.error('Get profile failed', { error: error.message, userId: this.#currentUserId });
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
     * @param {ProfileUpdateData} updateData - داده‌های به‌روزرسانی
     * @returns {Promise<Result<ProfileData>>}
     */
    async updateProfile(updateData) {
        try {
            // اعتبارسنجی ورودی
            if (!updateData || Object.keys(updateData).length === 0) {
                return Result.fail('داده‌ای برای به‌روزرسانی وجود ندارد', {
                    code: 'INVALID_INPUT'
                });
            }

            if (!this.#currentUserId) {
                return Result.fail('کاربر وارد نشده است', { code: 'UNAUTHORIZED' });
            }

            // اعتبارسنجی داده‌ها
            const validatedData = this.#validateUpdateData(updateData);

            // دریافت پروفایل فعلی
            const currentProfile = await this.#withRetry(
                () => db.users.get(this.#currentUserId),
                'updateProfile:get'
            );

            if (!currentProfile) {
                return Result.fail('پروفایل یافت نشد', { code: 'NOT_FOUND' });
            }

            // به‌روزرسانی در دیتابیس
            /** @type {ProfileData} */
            const updatedProfile = {
                ...currentProfile,
                ...validatedData,
                lastActive: new Date()
            };

            await this.#withRetry(
                () => db.users.update(this.#currentUserId, updatedProfile),
                'updateProfile:update'
            );

            // پاک کردن کش
            this.#invalidateCache(this.#currentUserId);

            // به‌روزرسانی state
            stateManager.dispatch({
                type: ProfileEvents.UPDATED,
                payload: updatedProfile
            });

            // اطلاع به شنوندگان
            this.#notifyListeners(ProfileEvents.UPDATED, updatedProfile);

            // بررسی افزایش سطح
            const oldLevel = UserModel.calculateLevel(currentProfile.xp);
            const newLevel = UserModel.calculateLevel(updatedProfile.xp);

            if (newLevel > oldLevel) {
                this.#notifyListeners(ProfileEvents.LEVEL_UP, {
                    oldLevel,
                    newLevel,
                    userId: this.#currentUserId
                });
            }

            logger.info('Profile updated', {
                userId: this.#currentUserId,
                updatedFields: Object.keys(updateData)
            });

            return Result.ok(updatedProfile, {
                fields: Object.keys(updateData)
            });

        } catch (error) {
            if (error instanceof ValidationError) {
                return Result.fail(error.message, {
                    code: 'VALIDATION_ERROR',
                    fields: error.fields
                });
            }

            logger.error('Update profile failed', {
                error: error.message,
                userId: this.#currentUserId
            });

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
    async getUserSettings() {
        try {
            if (!this.#currentUserId) {
                return Result.fail('کاربر وارد نشده است', { code: 'UNAUTHORIZED' });
            }

            /** @type {UserSettingsModel} */
            const settings = await this.#withRetry(
                () => db.settings.where('userId').equals(this.#currentUserId).first(),
                'getUserSettings'
            );

            const defaultSettings = UserSettingsModel.getDefaultSettings();

            return Result.ok(settings || defaultSettings, {
                source: settings ? 'database' : 'default'
            });

        } catch (error) {
            logger.error('Get user settings failed', { error: error.message });
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
    async updateUserSettings(settings) {
        try {
            if (!this.#currentUserId) {
                return Result.fail('کاربر وارد نشده است', { code: 'UNAUTHORIZED' });
            }

            const validatedSettings = UserSettingsModel.validate(settings);

            await this.#withRetry(
                () => db.settings.update(this.#currentUserId, {
                    ...validatedSettings,
                    updatedAt: new Date()
                }),
                'updateUserSettings'
            );

            this.#notifyListeners(ProfileEvents.SETTINGS_UPDATED, validatedSettings);

            logger.info('User settings updated', {
                userId: this.#currentUserId
            });

            return Result.ok(true);

        } catch (error) {
            logger.error('Update settings failed', { error: error.message });
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
    addListener(event, callback) {
        const listenerId = `${event}-${Date.now()}-${Math.random()}`;
        this.#listeners.set(listenerId, { event, callback });
        return listenerId;
    }

    /**
     * حذف شنونده
     * @public
     * @param {string} listenerId - شناسه شنونده
     * @returns {boolean}
     */
    removeListener(listenerId) {
        return this.#listeners.delete(listenerId);
    }

    /**
     * اطلاع‌رسانی به شنوندگان
     * @private
     * @param {ProfileEvents|string} event - نام رویداد
     * @param {*} data - داده رویداد
     */
    #notifyListeners(event, data) {
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
    #validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * پاکسازی منابع
     * @public
     */
    dispose() {
        this.#listeners.clear();
        this.#profileCache.clear();
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
