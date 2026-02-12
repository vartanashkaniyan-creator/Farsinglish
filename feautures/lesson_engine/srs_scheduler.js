/**
 * زمان‌بندی مرورهای هوشمند
 * مسئول: فیلتر و اولویت‌بندی درس‌های نیازمند مرور
 * وابستگی: مدل پیشرفت (Progress) - بدون وابستگی مستقیم به srs-engine
 */

// ---------- ثابت‌های اولویت‌بندی ----------
const BASE_PRIORITY_SCORE = 100;
const OVERDUE_PENALTY_PER_DAY = 5;    // هر روز تأخیر، امتیاز بالاتر
const LOW_EASE_FACTOR_BONUS = 20;     // ضریب آسانی پایین → نیاز فوری‌تر
const MASTERY_PENALTY = 10;           // سطح تسلط بالا → اولویت کمتر

/**
 * @typedef {Object} ProgressItem
 * @property {string} lessonId
 * @property {string} nextReviewDate
 * @property {number} interval
 * @property {number} easeFactor
 * @property {number} masteryLevel
 * @property {number} repetition
 */

/**
 * فیلتر کردن آیتم‌های نیازمند مرور
 * @param {ProgressItem[]} progressList - لیست پیشرفت‌ها
 * @param {Date} [now] - زمان جاری (برای تست)
 * @returns {ProgressItem[]} آیتم‌های سررسید شده
 */
export function filterDueItems(progressList, now = new Date()) {
    if (!Array.isArray(progressList)) {
        throw new Error('progressList must be an array');
    }

    return progressList.filter(item => {
        if (!item || !item.nextReviewDate) return true; // بدون تاریخ = نیاز فوری
        const reviewTime = new Date(item.nextReviewDate).getTime();
        return reviewTime <= now.getTime();
    });
}

/**
 * محاسبه امتیاز اولویت برای مرتب‌سازی
 * (عدد بزرگتر = اولویت بالاتر)
 * @param {ProgressItem} item
 * @param {Date} now
 * @returns {number}
 */
export function calculatePriorityScore(item, now = new Date()) {
    let score = BASE_PRIORITY_SCORE;

    // 1. اضافه کردن جریمه تأخیر (هر روز دیرتر = فوری‌تر)
    if (item.nextReviewDate) {
        const reviewDate = new Date(item.nextReviewDate);
        const daysOverdue = Math.max(0, (now - reviewDate) / (1000 * 60 * 60 * 24));
        score += daysOverdue * OVERDUE_PENALTY_PER_DAY;
    }

    // 2. ضریب آسانی پایین → نیاز به تمرین بیشتر
    if (item.easeFactor < 2.0) {
        score += LOW_EASE_FACTOR_BONUS;
    }

    // 3. سطح تسلط بالا → اولویت کمتر (یاد گرفته)
    if (item.masteryLevel >= 4) {
        score -= MASTERY_PENALTY * (item.masteryLevel - 3);
    }

    // 4. تکرار صفر → کاملاً جدید = اولویت بالا
    if (item.repetition === 0) {
        score += 50;
    }

    return Math.max(0, score); // امتیاز منفی ممنوع
}

/**
 * مرتب‌سازی آیتم‌های نیازمند مرور بر اساس اولویت (نزولی)
 * @param {ProgressItem[]} dueItems
 * @param {Date} [now]
 * @returns {ProgressItem[]} آرایه مرتب‌شده (کپی)
 */
export function sortByPriority(dueItems, now = new Date()) {
    if (!Array.isArray(dueItems)) {
        throw new Error('dueItems must be an array');
    }

    // کپی عمیق ساده (برای حفظ خالص بودن تابع)
    const itemsCopy = dueItems.map(item => ({ ...item }));

    return itemsCopy.sort((a, b) => {
        const scoreA = calculatePriorityScore(a, now);
        const scoreB = calculatePriorityScore(b, now);
        return scoreB - scoreA; // نزولی
    });
}

/**
 * دریافت تعداد آیتم‌های نیازمند مرور در بازه زمانی
 * @param {ProgressItem[]} progressList
 * @param {number} daysAhead - چند روز آینده (پیش‌فرض: ۱ روز)
 * @param {Date} [now]
 * @returns {number}
 */
export function countDueInNextDays(progressList, daysAhead = 1, now = new Date()) {
    const dueItems = filterDueItems(progressList, now);
    const futureThreshold = new Date(now);
    futureThreshold.setDate(now.getDate() + daysAhead);

    return dueItems.filter(item => {
        if (!item.nextReviewDate) return true;
        const reviewTime = new Date(item.nextReviewDate).getTime();
        return reviewTime <= futureThreshold.getTime();
    }).length;
}

// ---------- واحد تست ساده (برای مرورگر) ----------
if (typeof window !== 'undefined' && window.VITEST) {
    window.__SRS_SCHEDULER__ = {
        filterDueItems,
        sortByPriority,
        calculatePriorityScore,
        countDueInNextDays
    };
}
