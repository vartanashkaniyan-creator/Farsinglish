// core/constants/validation_constants.js

/**
 * SRS Algorithm Constants
 * @readonly
 */
export const SRS_CONSTANTS = {
    MIN_STAGE: 0,
    MAX_STAGE: 10,
    MIN_EF: 1.3,
    MAX_EF: 5.0,
    MAX_INTERVAL: 365 // Maximum interval in days
};

/**
 * User Validation Constants
 * @readonly
 */
export const USER_CONSTANTS = {
    MIN_USERNAME_LENGTH: 3,
    MAX_USERNAME_LENGTH: 50,
    MAX_EMAIL_LENGTH: 255,
    MIN_PASSWORD_LENGTH: 8,
    MAX_PASSWORD_LENGTH: 72
};

/**
 * Lesson Validation Constants
 * @readonly
 */
export const LESSON_CONSTANTS = {
    MIN_TITLE_LENGTH: 3,
    MAX_TITLE_LENGTH: 200,
    MIN_LEVEL: 1,
    MAX_LEVEL: 100,
    MAX_DURATION: 3600 // 1 hour in seconds
};

/**
 * Validation Error/Warning Codes
 * @readonly
 */
export const VALIDATION_CODES = {
    // Error codes
    REQUIRED: 'REQUIRED',
    INVALID_TYPE: 'INVALID_TYPE',
    INVALID_FORMAT: 'INVALID_FORMAT',
    INVALID_RANGE: 'INVALID_RANGE',
    INVALID_VALUE: 'INVALID_VALUE',
    INVALID_DATE: 'INVALID_DATE',
    INVALID_CHARS: 'INVALID_CHARS',
    MIN_LENGTH: 'MIN_LENGTH',
    MAX_LENGTH_EXCEEDED: 'MAX_LENGTH_EXCEEDED',
    DUPLICATE: 'DUPLICATE',
    
    // Warning codes
    MISSING_FIELD: 'MISSING_FIELD',
    FORMAT_WARNING: 'FORMAT_WARNING',
    SECURITY_WARNING: 'SECURITY_WARNING',
    UNUSUAL_VALUE: 'UNUSUAL_VALUE',
    
    // Generic invalid
    INVALID: 'INVALID'
};
