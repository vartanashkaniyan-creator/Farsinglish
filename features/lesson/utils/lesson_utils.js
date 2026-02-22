// features/lesson/utils/lesson_utils.js

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} is_valid
 * @property {string[]} errors
 */

/**
 * Enum برای سطح عملکرد
 */
export const PERFORMANCE_LEVELS = Object.freeze({
    EXCELLENT: 'excellent',
    GOOD: 'good',
    FAIR: 'fair',
    POOR: 'poor'
});

/**
 * اعتبارسنجی داده‌های درس
 * @param {Object} lesson_data
 * @returns {ValidationResult}
 */
export const validate_lesson_data = (lesson_data) => {
    const errors = [];
    if (!lesson_data?.id) errors.push('lesson id required');
    if (!lesson_data?.title) errors.push('title required');
    if (!lesson_data?.exercises || !Array.isArray(lesson_data.exercises)) errors.push('exercises must be an array');
    return { is_valid: errors.length === 0, errors };
};

/**
 * تبدیل امتیاز به سطح عملکرد
 * @param {number} score
 * @returns {string} performance level (enum)
 */
export const get_performance_level = (score) => {
    if (score >= 90) return PERFORMANCE_LEVELS.EXCELLENT;
    if (score >= 70) return PERFORMANCE_LEVELS.GOOD;
    if (score >= 50) return PERFORMANCE_LEVELS.FAIR;
    return PERFORMANCE_LEVELS.POOR;
};

/**
 * محاسبه فاصله Levenshtein بین دو رشته
 * @param {string} a
 * @param {string} b
 * @returns {number} فاصله
 */
export const levenshtein_distance = (a = '', b = '') => {
    const matrix = Array.from({ length: b.length + 1 }, () => Array(a.length + 1).fill(0));

    for (let i = 0; i <= b.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = b[i - 1] === a[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,       // حذف
                matrix[i][j - 1] + 1,       // درج
                matrix[i - 1][j - 1] + cost // جایگزینی
            );
        }
    }
    return matrix[b.length][a.length];
};

/**
 * محاسبه درصد شباهت بین دو رشته
 * @param {string} a
 * @param {string} b
 * @returns {number} درصد شباهت (0 تا 100)
 */
export const similarity_percentage = (a = '', b = '') => {
    const distance = levenshtein_distance(a, b);
    const max_length = Math.max(a.length, b.length);
    return Math.round(max_length === 0 ? 100 : ((max_length - distance) / max_length) * 100);
};

/**
 * پاکسازی رشته از کاراکترهای خطرناک (XSS)
 * @param {string} input
 * @returns {string}
 */
export const sanitize_input = (input = '') => {
    return input.replace(/[<>\/"'`]/g, ''); // ساده، برای پروژه بزرگ توصیه به DOMPurify
};
