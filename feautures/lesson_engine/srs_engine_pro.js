/**
 * srs-engine-pro.js
 * موتور پیشرفته الگوریتم مرور هوشمند (SRS) با پشتیبانی از SM-2، آنکی و FSRS
 * ورودی: کیفیت پاسخ (۰ تا ۵) + داده‌های تکرار قبلی + پیکربندی
 * خروجی: داده‌های به‌روز شده برای تکرار بعدی + آمار تحلیلی
 * کاملاً خالص (Pure) و بدون وابستگی
 * نسخه حرفه‌ای - قابل استفاده همزمان با نسخه ساده
 */

// ---------- ثابت‌ها و پیکربندی ----------
const DEFAULTS = {
    MIN_EASE_FACTOR: 1.3,
    MAX_EASE_FACTOR: 5.0,
    DEFAULT_EASE_FACTOR: 2.5,
    INTERVAL_REP_0: 1,        // روز
    INTERVAL_REP_1: 6,        // روز
    MAX_INTERVAL: 36500,      // 100 سال (حداکثر)
    EASE_BONUS: 0.15,         // پاداش برای پاسخ‌های عالی
    EASE_PENALTY: 0.2,        // جریمه برای پاسخ‌های ضعیف
    HARD_PENALTY: 0.1,        // جریمه برای پاسخ‌های سخت
    AGAIN_MULTIPLIER: 0.5,    // ضریب کاهش برای پاسخ AGAIN
    HARD_MULTIPLIER: 1.2,     // ضریب افزایش برای پاسخ HARD
    GOOD_MULTIPLIER: 2.5,     // ضریب افزایش برای پاسخ GOOD
    EASY_MULTIPLIER: 3.0      // ضریب افزایش برای پاسخ EASY
};

// ---------- انواع پاسخ (Enum) ----------
export const ReviewQuality = {
    AGAIN: 0,     // کاملاً فراموش شده
    HARD: 1,      // سخت
    GOOD: 2,      // خوب
    EASY: 3,      // آسان
    PERFECT: 4    // عالی (فقط برای SM-2)
};

// ---------- الگوریتم‌های پشتیبانی شده ----------
export const AlgorithmType = {
    SM2: 'sm2',           // الگوریتم کلاسیک سوپرممو
    ANKI: 'anki',         // شبیه آنکی (با گزینه‌های ۴ حالته)
    FSRS: 'fsrs'          // الگوریتم مبتنی بر حافظه بلندمدت
};

/**
 * @typedef {Object} SRSConfig
 * @property {string} algorithm - الگوریتم (sm2, anki, fsrs)
 * @property {number} maxInterval - حداکثر فاصله مجاز
 * @property {boolean} enableFuzzing - فعال‌سازی پراکندگی تصادفی
 * @property {number} fuzzRange - محدوده پراکندگی (۰.۰۵ = ۵٪)
 */

/**
 * @typedef {Object} SRSData
 * @property {number} repetition - تعداد تکرارهای موفق پشت‌سر هم
 * @property {number} easeFactor - ضریب آسانی (≥1.3)
 * @property {number} interval - فاصله کنونی (روز)
 * @property {number} lapses - تعداد لغزش‌ها (دفعات فراموشی)
 * @property {number} lastDuration - مدت زمان آخرین پاسخ (ثانیه)
 * @property {Array<number>} reviewHistory - تاریخچه کیفیت‌ها
 */

/**
 * @typedef {Object} SRSResult
 * @property {SRSData} data - داده‌های به‌روز شده
 * @property {Object} metrics - آمار تحلیلی
 * @property {number} metrics.retention - پیش‌بینی میزان به‌خاطر سپاری (۰-۱)
 * @property {number} metrics.stability - پایداری حافظه (روز)
 * @property {number} metrics.difficulty - سختی کارت (۰-۱)
 */

/**
 * کلاس اصلی موتور SRS با پشتیب از الگوریتم‌های مختلف
 */
export class SRSEngine {
    /**
     * @param {Partial<SRSConfig>} config - پیکربندی
     */
    constructor(config = {}) {
        this.config = {
            algorithm: config.algorithm || AlgorithmType.SM2,
            maxInterval: config.maxInterval || DEFAULTS.MAX_INTERVAL,
            enableFuzzing: config.enableFuzzing || false,
            fuzzRange: config.fuzzRange || 0.05,
            ...config
        };
    }

    /**
     * محاسبه داده‌های جدید SRS
     * @param {number} quality - کیفیت پاسخ
     * @param {SRSData} currentData - داده‌های کنونی
     * @returns {SRSResult} نتیجه به‌روز شده با آمار
     */
    calculate(quality, currentData) {
        // اعتبارسنجی ورودی
        this._validateInput(quality, currentData);

        // انتخاب الگوریتم مناسب
        switch (this.config.algorithm) {
            case AlgorithmType.ANKI:
                return this._calculateAnki(quality, currentData);
            case AlgorithmType.FSRS:
                return this._calculateFSRS(quality, currentData);
            case AlgorithmType.SM2:
            default:
                return this._calculateSM2(quality, currentData);
        }
    }

    /**
     * الگوریتم SM-2 کلاسیک
     * @private
     */
    _calculateSM2(quality, currentData) {
        const { repetition = 0, easeFactor = DEFAULTS.DEFAULT_EASE_FACTOR, 
                interval = 0, lapses = 0, reviewHistory = [] } = currentData;

        // به‌روزرسانی ضریب آسانی
        let newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        newEaseFactor = Math.max(DEFAULTS.MIN_EASE_FACTOR, 
                                Math.min(DEFAULTS.MAX_EASE_FACTOR, newEaseFactor));

        // به‌روزرسانی تعداد تکرار و فاصله
        let newRepetition, newInterval;

        if (quality >= 3) {
            // پاسخ صحیح
            newRepetition = repetition + 1;
            
            if (newRepetition === 1) {
                newInterval = DEFAULTS.INTERVAL_REP_0;
            } else if (newRepetition === 2) {
                newInterval = DEFAULTS.INTERVAL_REP_1;
            } else {
                newInterval = Math.round(interval * newEaseFactor);
            }
        } else {
            // پاسخ غلط
            newRepetition = 0;
            newInterval = 1;
        }

        // اعمال پراکندگی تصادفی (اختیاری)
        if (this.config.enableFuzzing && newInterval > 10) {
            newInterval = this._applyFuzzing(newInterval);
        }

        // محدود کردن فاصله
        newInterval = Math.min(newInterval, this.config.maxInterval);

        const newData = {
            repetition: newRepetition,
            easeFactor: Number(newEaseFactor.toFixed(2)),
            interval: newInterval,
            lapses: quality < 3 ? lapses + 1 : lapses,
            lastDuration: currentData.lastDuration || 0,
            reviewHistory: [...(reviewHistory || []), quality].slice(-20) // آخرین ۲۰ تا
        };

        // محاسبه آمار
        const metrics = this._calculateMetrics(newData, quality);

        return { data: newData, metrics };
    }

    /**
     * الگوریتم شبیه آنکی (۴ گزینه)
     * @private
     */
    _calculateAnki(quality, currentData) {
        const { repetition = 0, easeFactor = DEFAULTS.DEFAULT_EASE_FACTOR, 
                interval = 0, lapses = 0, reviewHistory = [] } = currentData;

        let newEaseFactor = easeFactor;
        let newRepetition = repetition;
        let newInterval;

        switch (quality) {
            case ReviewQuality.AGAIN: // 0
                newInterval = 1;
                newRepetition = 0;
                newEaseFactor = Math.max(DEFAULTS.MIN_EASE_FACTOR, easeFactor - DEFAULTS.EASE_PENALTY);
                break;
            case ReviewQuality.HARD: // 1
                newInterval = Math.max(1, Math.round(interval * DEFAULTS.HARD_MULTIPLIER));
                newRepetition = repetition + 1;
                newEaseFactor = Math.max(DEFAULTS.MIN_EASE_FACTOR, easeFactor - DEFAULTS.HARD_PENALTY);
                break;
            case ReviewQuality.GOOD: // 2
                if (repetition === 0) {
                    newInterval = 1;
                } else if (repetition === 1) {
                    newInterval = 6;
                } else {
                    newInterval = Math.round(interval * easeFactor);
                }
                newRepetition = repetition + 1;
                break;
            case ReviewQuality.EASY: // 3
                if (repetition === 0) {
                    newInterval = 4;
                } else {
                    newInterval = Math.round(interval * easeFactor * DEFAULTS.EASY_MULTIPLIER);
                }
                newRepetition = repetition + 1;
                newEaseFactor = Math.min(DEFAULTS.MAX_EASE_FACTOR, easeFactor + DEFAULTS.EASE_BONUS);
                break;
            default:
                throw new Error('کیفیت نامعتبر برای الگوریتم آنکی');
        }

        // اعمال پراکندگی و محدودیت
        if (this.config.enableFuzzing && newInterval > 10) {
            newInterval = this._applyFuzzing(newInterval);
        }
        newInterval = Math.min(newInterval, this.config.maxInterval);

        const newData = {
            repetition: newRepetition,
            easeFactor: Number(newEaseFactor.toFixed(2)),
            interval: newInterval,
            lapses: quality === 0 ? lapses + 1 : lapses,
            lastDuration: currentData.lastDuration || 0,
            reviewHistory: [...(reviewHistory || []), quality].slice(-20)
        };

        const metrics = this._calculateMetrics(newData, quality);
        return { data: newData, metrics };
    }

    /**
     * الگوریتم FSRS (Free Spaced Repetition Scheduler)
     * @private
     */
    _calculateFSRS(quality, currentData) {
        // FSRS از پارامترهای پیچیده‌تری استفاده می‌کند
        const { repetition = 0, easeFactor = DEFAULTS.DEFAULT_EASE_FACTOR, 
                interval = 0, lapses = 0, reviewHistory = [] } = currentData;

        // ثابت‌های FSRS (در حالت ساده شده)
        const FSRS_CONSTANTS = {
            w0: 0.4,   // سختی اولیه
            w1: 0.6,   // نرخ فراموشی
            w2: 1.0,   // پایداری
            decay: 0.5 // نرخ زوال
        };

        // محاسبه سختی (difficulty) بر اساس تاریخچه
        const avgQuality = reviewHistory.length > 0 
            ? reviewHistory.reduce((a, b) => a + b, 0) / reviewHistory.length 
            : 3;
        const difficulty = Math.max(0, Math.min(1, 1 - (avgQuality / 5)));

        // محاسبه پایداری (stability)
        let stability;
        if (repetition === 0) {
            stability = FSRS_CONSTANTS.w0;
        } else {
            stability = interval * Math.pow(1 + FSRS_CONSTANTS.decay, -repetition);
        }

        // به‌روزرسانی بر اساس کیفیت
        let newStability, newDifficulty;
        if (quality >= 3) {
            // پاسخ صحیح
            newStability = stability * (1 + (quality / 5) * FSRS_CONSTANTS.w1);
            newDifficulty = Math.max(0, difficulty - 0.1);
        } else {
            // پاسخ غلط
            newStability = stability * DEFAULTS.AGAIN_MULTIPLIER;
            newDifficulty = Math.min(1, difficulty + 0.2);
        }

        // محاسبه فاصله جدید
        let newInterval = Math.round(newStability * 30); // تبدیل به روز
        if (repetition === 0) newInterval = 1;

        // اعمال محدودیت‌ها
        newInterval = Math.min(newInterval, this.config.maxInterval);
        
        // تبدیل پایداری به easeFactor معادل (برای سازگاری)
        const newEaseFactor = Math.max(DEFAULTS.MIN_EASE_FACTOR, 
                                      Math.min(DEFAULTS.MAX_EASE_FACTOR, newStability * 2));

        const newData = {
            repetition: repetition + 1,
            easeFactor: Number(newEaseFactor.toFixed(2)),
            interval: newInterval,
            lapses: quality < 3 ? lapses + 1 : lapses,
            lastDuration: currentData.lastDuration || 0,
            reviewHistory: [...(reviewHistory || []), quality].slice(-20)
        };

        // محاسبه آمار مخصوص FSRS
        const metrics = {
            retention: Math.exp(-interval / (stability * 30)),
            stability: newStability,
            difficulty: newDifficulty,
            ...this._calculateMetrics(newData, quality)
        };

        return { data: newData, metrics };
    }

    /**
     * اعتبارسنجی ورودی
     * @private
     */
    _validateInput(quality, currentData) {
        if (quality < 0 || quality > 5) {
            throw new Error('کیفیت باید بین ۰ تا ۵ باشد');
        }
        if (!currentData || typeof currentData !== 'object') {
            throw new Error('داده‌های جاری الزامی است');
        }
        if (currentData.repetition !== undefined && 
            (currentData.repetition < 0 || !Number.isInteger(currentData.repetition))) {
            throw new Error('repetition باید عدد صحیح نامنفی باشد');
        }
    }

    /**
     * اعمال پراکندگی تصادفی برای جلوگیری از یکنواختی
     * @private
     */
    _applyFuzzing(interval) {
        const range = Math.max(1, Math.floor(interval * this.config.fuzzRange));
        const offset = Math.floor(Math.random() * (range * 2 + 1)) - range;
        return Math.max(1, interval + offset);
    }

    /**
     * محاسبه آمار تحلیلی
     * @private
     */
    _calculateMetrics(data, quality) {
        // نرخ به‌خاطر سپاری پیش‌بینی شده
        const retention = Math.exp(-data.interval / (data.easeFactor * 10));
        
        // پایداری (بر اساس فواصل)
        const stability = data.interval * data.easeFactor;
        
        // سختی (بر اساس نرخ لغزش‌ها و تاریخچه)
        const lapseRate = data.reviewHistory.length > 0
            ? data.reviewHistory.filter(q => q < 3).length / data.reviewHistory.length
            : 0.5;
        const difficulty = Math.min(1, lapseRate * 1.5);

        return {
            retention: Number(retention.toFixed(3)),
            stability: Number(stability.toFixed(1)),
            difficulty: Number(difficulty.toFixed(2))
        };
    }

    /**
     * محاسبه تاریخ مرور بعدی
     * @param {number} intervalDays - فاصله بر حسب روز
     * @param {Date} [fromDate] - تاریخ شروع (پیش‌فرض: امروز)
     * @returns {Date} تاریخ مرور بعدی
     */
    getNextReviewDate(intervalDays, fromDate = new Date()) {
        const date = new Date(fromDate);
        date.setDate(date.getDate() + intervalDays);
        return date;
    }

    /**
     * بررسی نیاز به مرور
     * @param {Object} card - کارت با فیلد nextReview
     * @param {Date} [now] - زمان کنونی
     * @returns {boolean}
     */
    isDue(card, now = new Date()) {
        if (!card || !card.nextReview) return true;
        const reviewDate = new Date(card.nextReview);
        return reviewDate <= now;
    }

    /**
     * بازنشانی کارت به حالت اولیه
     * @param {Partial<SRSData>} baseData - داده‌های پایه
     * @returns {SRSData}
     */
    resetCard(baseData = {}) {
        return {
            repetition: 0,
            easeFactor: DEFAULTS.DEFAULT_EASE_FACTOR,
            interval: 0,
            lapses: 0,
            lastDuration: 0,
            reviewHistory: [],
            ...baseData
        };
    }
}

// ---------- توابع کمکی مستقل ----------

/**
 * ایجاد نمونه پیش‌فرض از موتور SRS
 * @param {Partial<SRSConfig>} config 
 * @returns {SRSEngine}
 */
export function createSRSEngine(config = {}) {
    return new SRSEngine(config);
}

/**
 * محاسبه آمار کلی برای یک مجموعه کارت
 * @param {Array<SRSData>} cards 
 * @returns {Object}
 */
export function calculateDeckStats(cards) {
    if (!cards || cards.length === 0) {
        return {
            totalCards: 0,
            dueCards: 0,
            averageEase: 0,
            averageInterval: 0,
            retention: 0
        };
    }

    const now = new Date();
    let dueCount = 0;
    let totalEase = 0;
    let totalInterval = 0;

    cards.forEach(card => {
        if (card.nextReview && new Date(card.nextReview) <= now) {
            dueCount++;
        }
        totalEase += card.easeFactor || 0;
        totalInterval += card.interval || 0;
    });

    // محاسبه نرخ به‌خاطر سپاری پیش‌بینی شده
    const avgInterval = totalInterval / cards.length;
    const avgEase = totalEase / cards.length;
    const retention = Math.exp(-avgInterval / (avgEase * 10));

    return {
        totalCards: cards.length,
        dueCards: dueCount,
        averageEase: Number(avgEase.toFixed(2)),
        averageInterval: Math.round(avgInterval),
        retention: Number(retention.toFixed(3))
    };
}

// ---------- فضای نام برای محیط مرورگر ----------
if (typeof window !== 'undefined') {
    window.FarsinglishSRSPro = {
        SRSEngine,
        createSRSEngine,
        calculateDeckStats,
        ReviewQuality,
        AlgorithmType,
        DEFAULTS
    };
            }
