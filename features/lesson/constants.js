// features/lesson/constants.js

/**
 * @enum {number} سطح دشواری درس
 */
export const DIFFICULTY_LEVELS = Object.freeze({
    BEGINNER: 1,
    ELEMENTARY: 2,
    INTERMEDIATE: 3,
    ADVANCED: 4,
    EXPERT: 5
});

/**
 * @enum {string} نوع تمرین
 */
export const EXERCISE_TYPES = Object.freeze({
    MULTIPLE_CHOICE: 'multiple_choice',
    FILL_IN_BLANK: 'fill_in_blank',
    TRUE_FALSE: 'true_false',
    MATCHING: 'matching'
});

/**
 * جوایز XP بر اساس سطح دشواری
 * 🔹 از کلید عددی استفاده شده تا وابستگی به enum نباشد
 */
export const XP_REWARDS = Object.freeze({
    1: 10,    // BEGINNER
    2: 25,    // ELEMENTARY
    3: 50,    // INTERMEDIATE
    4: 100,   // ADVANCED
    5: 200    // EXPERT
});

/**
 * @enum {string} سطح عملکرد
 * 🔹 فقط در این فایل تعریف شده، از utils حذف شده (DRY)
 */
export const PERFORMANCE_LEVELS = Object.freeze({
    EXCELLENT: 'excellent',
    GOOD: 'good',
    FAIR: 'fair',
    POOR: 'poor'
});

/**
 * محدودیت‌های تمرین (اختیاری، برای توسعه‌پذیری)
 */
export const EXERCISE_LIMITS = Object.freeze({
    MIN_COUNT: 1,
    MAX_COUNT: 20,
    DEFAULT_COUNT: 5
});
