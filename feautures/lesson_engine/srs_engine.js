/**
 * موتور الگوریتم مرور هوشمند SM-2
 * ورودی: کیفیت پاسخ (۰ تا ۵) + داده‌های تکرار قبلی
 * خروجی: داده‌های به‌روز شده برای تکرار بعدی
 * کاملاً خالص (Pure) و بدون وابستگی
 */

// ---------- ثابت‌ها (اعداد جادویی ممنوع) ----------
const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;
const INTERVAL_REP_0 = 1;   // روز
const INTERVAL_REP_1 = 6;   // روز

/**
 * @typedef {Object} SRSData
 * @property {number} repetition - تعداد تکرارهای موفق پشت‌سر هم
 * @property {number} easeFactor - ضریب آسانی (≥1.3)
 * @property {number} interval - فاصله کنونی (روز)
 */

/**
 * محاسبه داده‌های جدید SRS بر اساس الگوریتم SM-2
 * @param {number} quality - کیفیت پاسخ (0=فراموشی کامل تا 5=کامل)
 * @param {SRSData} currentData - داده‌های کنونی
 * @returns {SRSData} داده‌های به‌روز شده
 */
export function calculateSRS(quality, currentData) {
    // اعتبارسنجی ورودی
    if (quality < 0 || quality > 5) {
        throw new Error('Quality must be between 0 and 5');
    }
    if (!currentData || typeof currentData !== 'object') {
        throw new Error('currentData is required');
    }

    const { repetition = 0, easeFactor = DEFAULT_EASE_FACTOR, interval = 0 } = currentData;

    // 1. به‌روزرسانی ضریب آسانی (Easiness Factor)
    let newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (newEaseFactor < MIN_EASE_FACTOR) {
        newEaseFactor = MIN_EASE_FACTOR;
    }

    // 2. به‌روزرسانی تعداد تکرار
    let newRepetition;
    if (quality >= 3) {
        newRepetition = repetition + 1;
    } else {
        newRepetition = 0;
    }

    // 3. محاسبه فاصله جدید
    let newInterval;
    if (newRepetition === 0) {
        newInterval = 0; // نیاز به مرور فوری (در عمل صفر به معنی امروز)
    } else if (newRepetition === 1) {
        newInterval = INTERVAL_REP_0;
    } else if (newRepetition === 2) {
        newInterval = INTERVAL_REP_1;
    } else {
        newInterval = Math.round(interval * easeFactor);
    }

    return {
        repetition: newRepetition,
        easeFactor: Number(newEaseFactor.toFixed(2)), // دقت دو رقم اعشار
        interval: newInterval
    };
}

/**
 * محاسبه تاریخ مرور بعدی بر اساس فاصله (روز)
 * @param {number} intervalDays - فاصله بر حسب روز
 * @returns {Date} تاریخ مرور بعدی
 */
export function getNextReviewDate(intervalDays) {
    const date = new Date();
    date.setDate(date.getDate() + intervalDays);
    return date;
}

// ---------- واحد تست ساده (اختیاری، برای استفاده در مرورگر) ----------
if (typeof window !== 'undefined' && window.VITEST) {
    // فقط برای محیط تست – حذف در بیلد نهایی
    window.__SRS_ENGINE__ = { calculateSRS, getNextReviewDate };
}
