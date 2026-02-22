
import { PERFORMANCE_LEVELS } from '../constants.js';

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} is_valid
 * @property {string[]} errors
 */

/**
 * اعتبارسنجی پیشرفته داده‌های درس
 * @param {Object} lesson_data
 * @returns {ValidationResult}
 */
export const validate_lesson_data = (lesson_data) => {
    const errors = [];
    if (!lesson_data?.id) errors.push('lesson id required');
    else if (typeof lesson_data.id !== 'string') errors.push('lesson id must be string');

    if (!lesson_data?.title) errors.push('title required');
    else if (typeof lesson_data.title !== 'string') errors.push('title must be string');

    if (!lesson_data?.exercises) errors.push('exercises required');
    else if (!Array.isArray(lesson_data.exercises)) errors.push('exercises must be an array');

    return { is_valid: errors.length === 0, errors };
};

/**
 * محاسبه فاصله Levenshtein بهینه بین دو رشته
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export const levenshtein_distance = (a = '', b = '') => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const prev_row = Array(b.length + 1).fill(0);
    const curr_row = Array(b.length + 1).fill(0);

    for (let j = 0; j <= b.length; j++) prev_row[j] = j;

    for (let i = 1; i <= a.length; i++) {
        curr_row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr_row[j] = Math.min(curr_row[j - 1] + 1, prev_row[j] + 1, prev_row[j - 1] + cost);
        }
        for (let j = 0; j <= b.length; j++) prev_row[j] = curr_row[j];
    }

    return curr_row[b.length];
};

/**
 * محاسبه درصد شباهت بین دو رشته
 * @param {string} a
 * @param {string} b
 * @returns {number} درصد شباهت (0-100)
 */
export const similarity_percentage = (a = '', b = '') => {
    const distance = levenshtein_distance(a, b);
    const max_length = Math.max(a.length, b.length);
    return Math.round(max_length === 0 ? 100 : ((max_length - distance) / max_length) * 100);
};

/**
 * پاکسازی رشته از کاراکترهای خطرناک
 * @param {string} input
 * @returns {string}
 */
export const sanitize_input = (input = '') => input.replace(/[<>\/"'`]/g, '');
