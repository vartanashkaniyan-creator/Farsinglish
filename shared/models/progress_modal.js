/**
 * مدل پیشرفت کاربر در یک درس
 * داده‌های SRS و آمار تمرین را نگهداری می‌کند
 * کاملاً ایزوله و بدون وابستگی
 */

// ---------- ثابت‌ها ----------
const MIN_MASTERY_LEVEL = 0;
const MAX_MASTERY_LEVEL = 5;
const DEFAULT_MASTERY_LEVEL = 0;

/**
 * @typedef {Object} ProgressData
 * @property {string} userId - شناسه کاربر
 * @property {string} lessonId - شناسه درس
 * @property {number} repetition - تکرار موفق پشت‌سر هم
 * @property {number} easeFactor - ضریب آسانی (≥1.3)
 * @property {number} interval - فاصله کنونی (روز)
 * @property {string} nextReviewDate - تاریخ مرور بعدی (ISO string)
 * @property {number} masteryLevel - سطح تسلط (۰ تا ۵)
 * @property {number} totalReviews - تعداد کل مرورها
 * @property {number} correctCount - تعداد پاسخ‌های صحیح
 * @property {number} incorrectCount - تعداد پاسخ‌های غلط
 * @property {string} lastReviewedAt - آخرین زمان مرور (ISO string)
 * @property {boolean} isDue - آیا نیاز به مرور دارد؟ (محاسبه‌شده)
 */

/**
 * ایجاد یک نمونه جدید از پیشرفت (مقدار پیش‌فرض)
 * @param {string} userId 
 * @param {string} lessonId 
 * @returns {ProgressData} نمونه اولیه
 */
export function createInitialProgress(userId, lessonId) {
    if (!userId || !lessonId) {
        throw new Error('userId and lessonId are required');
    }

    return {
        userId,
        lessonId,
        repetition: 0,
        easeFactor: 2.5,
        interval: 0,
        nextReviewDate: new Date().toISOString(), // امروز
        masteryLevel: DEFAULT_MASTERY_LEVEL,
        totalReviews: 0,
        correctCount: 0,
        incorrectCount: 0,
        lastReviewedAt: null,
        isDue: true
    };
}

/**
 * به‌روزرسانی پیشرفت با داده‌های جدید SRS
 * @param {ProgressData} progress - پیشرفت فعلی (immutable)
 * @param {Object} srsUpdate - خروجی از srs-engine.calculateSRS
 * @param {string} reviewDate - تاریخ مرور (ISO string)
 * @returns {ProgressData} نمونه جدید به‌روز شده
 */
export function updateProgress(progress, srsUpdate, reviewDate) {
    // اعتبارسنجی
    if (!progress || !srsUpdate) {
        throw new Error('progress and srsUpdate are required');
    }

    const wasCorrect = srsUpdate.repetition > progress.repetition || 
                       (srsUpdate.repetition === 0 && progress.repetition > 0);
    
    return {
        ...progress,
        repetition: srsUpdate.repetition,
        easeFactor: srsUpdate.easeFactor,
        interval: srsUpdate.interval,
        nextReviewDate: reviewDate,
        totalReviews: progress.totalReviews + 1,
        correctCount: wasCorrect ? progress.correctCount + 1 : progress.correctCount,
        incorrectCount: wasCorrect ? progress.incorrectCount : progress.incorrectCount + 1,
        lastReviewedAt: new Date().toISOString(),
        masteryLevel: calculateMasteryLevel(
            srsUpdate.repetition,
            progress.correctCount + (wasCorrect ? 1 : 0),
            progress.totalReviews + 1
        ),
        isDue: false // پس از مرور، سررسید به تاریخ جدید منتقل شده
    };
}

/**
 * محاسبه سطح تسلط (۰-۵) بر اساس آمار
 * @param {number} repetition 
 * @param {number} correctCount 
 * @param {number} totalReviews 
 * @returns {number} 0-5
 */
function calculateMasteryLevel(repetition, correctCount, totalReviews) {
    if (totalReviews === 0) return 0;
    
    const accuracy = correctCount / totalReviews;
    
    // سطح ۱: حداقل یک مرور موفق
    if (repetition >= 1) return 1;
    // سطح ۲: تکرار ۲+ و دقت > ۰.۶
    if (repetition >= 2 && accuracy > 0.6) return 2;
    // سطح ۳: تکرار ۳+ و دقت > ۰.۷
    if (repetition >= 3 && accuracy > 0.7) return 3;
    // سطح ۴: تکرار ۴+ و دقت > ۰.۸
    if (repetition >= 4 && accuracy > 0.8) return 4;
    // سطح ۵: تکرار ۵+ و دقت > ۰.۹
    if (repetition >= 5 && accuracy > 0.9) return 5;
    
    // بازگشت به بالاترین سطح ممکن
    return Math.min(repetition, MAX_MASTERY_LEVEL);
}

/**
 * بررسی آیا درس نیاز به مرور دارد؟
 * @param {ProgressData} progress 
 * @param {Date} [now] - زمان جاری (برای تست)
 * @returns {boolean}
 */
export function isDue(progress, now = new Date()) {
    if (!progress || !progress.nextReviewDate) return true;
    const reviewTime = new Date(progress.nextReviewDate).getTime();
    return reviewTime <= now.getTime();
}

// ---------- واحد تست ساده (اختیاری) ----------
if (typeof window !== 'undefined' && window.VITEST) {
    window.__PROGRESS_MODEL__ = { createInitialProgress, updateProgress, isDue };
}
