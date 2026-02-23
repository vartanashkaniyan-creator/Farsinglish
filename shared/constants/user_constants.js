/**
 * @fileoverview ثابت‌های کاربری با اعتبارسنجی پیشرفته و امن
 * @module shared/constants/user_constants
 * @version 1.2.0
 * @readonly
 *
 * @example
 * import { CONSTANTS, CONSTANT_VALIDATORS } from './user_constants.js';
 *
 * const userRole = CONSTANTS.USER.ROLES.ADMIN;
 * const isValid = CONSTANT_VALIDATORS.USER_ROLES.validate(userRole);
 */

'use strict';

/**
 * اعتبارسنجی enum برای جلوگیری از مقادیر تکراری
 * @param {Object} obj
 * @param {string} name
 * @throws {Error} اگر مقادیر تکراری باشد
 */
const validate_enum = (obj, name) => {
    const values = Object.values(obj);
    if (new Set(values).size !== values.length) {
        throw new Error(`Duplicate values detected in ${name}`);
    }
};

// ========================================
// ✅ Feature Flags - توسعه‌پذیری بدون تغییر هسته
// ========================================
export const FEATURE_FLAGS = Object.freeze({
    ENABLE_GAMIFICATION: process.env.ENABLE_GAMIFICATION === 'true',
    ENABLE_SOCIAL_FEATURES: process.env.ENABLE_SOCIAL_FEATURES === 'true'
});

// ========================================
// ✅ کلیدهای نقش کاربری
// ========================================
/**
 * @enum {string}
 * @readonly
 */
export const USER_ROLES = Object.freeze({
    ADMIN: 'admin',
    TEACHER: 'teacher',
    STUDENT: 'student',
    GUEST: 'guest',
    ...(FEATURE_FLAGS.ENABLE_GAMIFICATION && { PREMIUM: 'premium' })
});
validate_enum(USER_ROLES, 'USER_ROLES');

// ========================================
// ✅ وضعیت کاربران
// ========================================
/**
 * @enum {string}
 * @readonly
 */
export const USER_STATUS = Object.freeze({
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    BANNED: 'banned',
    PENDING: 'pending'
});
validate_enum(USER_STATUS, 'USER_STATUS');

// ========================================
// ✅ کلیدهای متریک‌های کاربری
// ========================================
/**
 * @enum {string}
 * @readonly
 */
export const USER_METRICS_KEYS = Object.freeze({
    TOTAL_LESSONS: 'total_lessons',
    COMPLETED_LESSONS: 'completed_lessons',
    LEARNED_WORDS: 'learned_words',
    TOTAL_TIME_SPENT: 'total_time_spent',
    AVERAGE_SCORE: 'average_score'
});

// ========================================
// ✅ کلیدهای حساس امن
// ========================================
export const SECURE_KEYS = Object.freeze({
    TOKEN: Symbol('token'),
    REFRESH_TOKEN: Symbol('refresh_token')
});

// ========================================
// ✅ محدودیت‌های اعتبارسنجی کاربر
// ========================================
export const USER_VALIDATION_LIMITS = Object.freeze({
    MIN_LESSONS: 0,
    MAX_LESSONS: 10000,
    MIN_SCORE: 0,
    MAX_SCORE: 100,
    MAX_USERNAME_LENGTH: 32,
    MAX_EMAIL_LENGTH: 254
});

// ========================================
// ✅ Regex ها
// ========================================
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;

// ========================================
// ✅ Validator برای تست runtime
// ========================================
/**
 * @typedef {Object} ConstantValidator
 * @property {Function} validate
 * @property {string} error_message
 */
const create_validator = (validate, error_message) => ({ validate, error_message });

export const CONSTANT_VALIDATORS = Object.freeze({
    USER_ROLES: create_validator(
        (role) => Object.values(USER_ROLES).includes(role),
        'Invalid user role'
    ),
    USER_STATUS: create_validator(
        (status) => Object.values(USER_STATUS).includes(status),
        'Invalid user status'
    ),
    EMAIL: create_validator(
        (email) => EMAIL_REGEX.test(email),
        'Invalid email format'
    ),
    USERNAME: create_validator(
        (username) => USERNAME_REGEX.test(username),
        'Invalid username format'
    )
});

// ========================================
// ✅ Metadata و نسخه‌گذاری
// ========================================
export const CONSTANTS_METADATA = Object.freeze({
    VERSION: '1.2.0',
    LAST_UPDATED: '2026-02-23',
    DEPRECATED_KEYS: [],
    MIGRATION_PATH: {}
});

// ========================================
// ✅ گروه‌بندی ثابت‌ها
// ========================================
export const CONSTANTS = Object.freeze({
    USER: {
        ROLES: USER_ROLES,
        STATUS: USER_STATUS,
        VALIDATION_LIMITS: USER_VALIDATION_LIMITS
    },
    VALIDATION: {
        REGEX: {
            EMAIL: EMAIL_REGEX,
            USERNAME: USERNAME_REGEX
        },
        CONSTANT_VALIDATORS
    },
    METRICS: {
        KEYS: USER_METRICS_KEYS
    },
    SECURE_KEYS,
    FEATURE_FLAGS,
    METADATA: CONSTANTS_METADATA
});

// ========================================
// ✅ Environment Config برای موبایل و وب
// ========================================
export const ENV_CONFIG = Object.freeze({
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV === 'development',
    isTest: process.env.NODE_ENV === 'test'
});

// ========================================
// ✅ اعتبارسنجی Runtime هنگام توسعه
// ========================================
if (process.env.NODE_ENV === 'development') {
    Object.entries(USER_VALIDATION_LIMITS).forEach(([key, value]) => {
        if (typeof value !== 'number') {
            console.warn(`⚠️ ${key} باید عدد باشد، دریافت شد: ${typeof value}`);
        }
    });

    // تست Regex
    ['test@example.com'].forEach(email => {
        if (!EMAIL_REGEX.test(email)) console.error('❌ EMAIL_REGEX معتبر نیست');
    });
}
