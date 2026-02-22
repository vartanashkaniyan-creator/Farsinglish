// features/lesson/srs/srs_engine.js

/**
 * SM-2 SRS Engine – نسخه حرفه‌ای و سخت‌گیرانه
 * محاسبه مرور بعدی، interval و ease_factor با رعایت SRP و محدودیت‌ها
 */
export class SRSEngine {
    /**
     * @param {Object} config
     * @param {number} config.min_ease - حداقل ease_factor
     * @param {number} config.max_ease - حداکثر ease_factor
     */
    constructor(config = {}) {
        this.config = {
            min_ease: 1.3,
            max_ease: 2.5,
            ...config
        };
    }

    /**
     * محاسبه بازه مرور بعدی و به‌روزرسانی ease_factor
     * @param {Object} params
     * @param {number} params.quality - کیفیت پاسخ (0-5)
     * @param {number} params.repetitions
     * @param {number} params.ease_factor
     * @param {number} params.interval
     * @returns {{interval:number, repetitions:number, ease_factor:number}}
     */
    calculate_next_review({ quality, repetitions = 0, ease_factor = 2.5, interval = 1 }) {
        let next_repetitions = repetitions;
        let next_interval = interval;
        let next_ease_factor = ease_factor;

        if (quality < 3) {
            // پاسخ ضعیف → reset
            next_repetitions = 0;
            next_interval = 1;
        } else {
            // افزایش تعداد مرور
            next_repetitions += 1;

            // تعیین interval بر اساس تعداد مرور
            if (next_repetitions === 1) next_interval = 1;
            else if (next_repetitions === 2) next_interval = 6;
            else next_interval = Math.round(next_interval * next_ease_factor);

            // محاسبه مرحله‌ای ease_factor
            const q = 5 - quality;
            const delta = 0.1 - q * (0.08 + q * 0.02);
            next_ease_factor += delta;

            // محدود کردن بین min_ease و max_ease
            next_ease_factor = Math.min(Math.max(next_ease_factor, this.config.min_ease), this.config.max_ease);
        }

        return { interval: next_interval, repetitions: next_repetitions, ease_factor: next_ease_factor };
    }

    /**
     * محاسبه تاریخ مرور بعدی
     * @param {Date|string} last_review
     * @param {number} interval
     * @returns {Date}
     */
    get_next_review_date(last_review, interval) {
        const d = new Date(last_review);
        d.setDate(d.getDate() + interval);
        return d;
    }
    }
