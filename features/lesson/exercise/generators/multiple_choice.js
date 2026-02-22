import { EXERCISE_TYPES } from '../../constants.js';

/**
 * @typedef {Object} Exercise
 * @property {string} id
 * @property {string} question
 * @property {string[]} options
 * @property {string} answer
 * @property {string} type
 */

/**
 * تولید سوالات چندگزینه‌ای
 */
export class MultipleChoiceGenerator {
    /**
     * @param {Object} logger - وابستگی تزریقی برای لاگ
     */
    constructor(logger = console) {
        /** @type {Object} */
        this.logger = logger;
    }

    /**
     * تولید تمرین
     * @param {Object} lesson - داده‌های درس
     * @param {number} count - تعداد سوالات مورد نظر
     * @returns {Exercise[]} لیست سوالات
     */
    generate(lesson, count = 5) {
        try {
            if (!lesson?.exercises || !Array.isArray(lesson.exercises)) return [];

            // فیلتر سوالات چندگزینه‌ای
            const filtered = lesson.exercises.filter(
                (ex) => ex.type === EXERCISE_TYPES.MULTIPLE_CHOICE
            );

            if (filtered.length === 0) return [];

            // اعتبارسنجی count
            const valid_count = Math.min(Math.max(count, 1), filtered.length);

            // Shuffle بدون تغییر آرایه اصلی
            const shuffled = [...filtered];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            return shuffled.slice(0, valid_count);
        } catch (error) {
            this.logger.error('error generating multiple choice exercises:', error);
            return [];
        }
    }
}
