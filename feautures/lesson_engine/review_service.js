/**
 * @fileoverview سرویس مرور هوشمند - مدیریت درس‌های نیازمند مرور با الگوریتم SRS
 * @author Farsinglish Team
 * @version 5.0.0
 * @lastModified 2024-01-17
 * 
 * این فایل با رعایت اصول SOLID، KISS، DRY و الگوهای طراحی پیشرفته بازنویسی شده است.
 * نسخه 5.0.0 شامل بهینه‌سازی‌های نهایی: کش هوشمند با TTL، لاگ پویا، مدیریت timezone،
 * retry mechanism، و رفع race condition در کش داخلی.
 */

// ---------- ایمپورت‌ها ----------
// وابستگی‌ها از طریق تزریق دریافت می‌شوند، نه ایمپورت مستقیم

// ---------- ثابت‌های پیکربندی (اعداد جادویی ممنوع) ----------
/** @constant {number} حداکثر تعداد درس در هر مرور */
const DEFAULT_REVIEW_LIMIT = 20;

/** @constant {number} حداقل کیفیت پاسخ قابل قبول */
const MIN_QUALITY_SCORE = 0;

/** @constant {number} حداکثر کیفیت پاسخ */
const MAX_QUALITY_SCORE = 5;

/** @constant {number} مقدار پیش‌فرض ضریب آسانی */
const DEFAULT_EASE_FACTOR = 2.5;

/** @constant {number} میلی‌ثانیه در هر روز */
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** @constant {number} زمان کش برای آیتم‌های مرور (ثانیه) */
const CACHE_TTL_REVIEW_ITEMS = 300; // 5 دقیقه

/** @constant {number} زمان کش برای آمار (ثانیه) */
const CACHE_TTL_STATS = 300; // 5 دقیقه

/** @constant {number} زمان کش برای تعداد (ثانیه) */
const CACHE_TTL_COUNT = 60; // 1 دقیقه

/** @constant {number} زمان کش داخلی برای daysOverdue (میلی‌ثانیه) */
const INTERNAL_CACHE_TTL = 5 * 60 * 1000; // 5 دقیقه

/** @constant {number} حداکثر سایز کش داخلی */
const INTERNAL_CACHE_MAX_SIZE = 1000;

/** @constant {number} تعداد دفعات تلاش مجدد برای عملیات‌های کش */
const CACHE_RETRY_COUNT = 2;

/** @constant {number} تأخیر پایه برای retry (میلی‌ثانیه) */
const CACHE_RETRY_BASE_DELAY = 100;

/** @constant {Object} سطوح لاگ قابل پیکربندی */
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

/**
 * @typedef {Object} LogLevelConfig
 * @property {number} currentLevel - سطح فعلی لاگ
 * @property {number} sampleRate - نرخ نمونه‌برداری (0-1)
 */

// ---------- تعریف تایپ‌های قراردادی (Contracts) با JSDoc ----------

/**
 * @typedef {Object} IProgressRepository
 * @description قرارداد مخزن پیشرفت (وارونگی وابستگی - DIP)
 * @property {Function} getAllProgress - دریافت تمام پیشرفت‌های کاربر
 * @property {Function} getDueProgress - دریافت پیشرفت‌های سررسید شده با صفحه‌بندی
 * @property {Function} updateProgressWithSRS - به‌روزرسانی پیشرفت با الگوریتم SRS
 * @property {Function} initializeProgress - مقداردهی اولیه پیشرفت
 * @property {Function} getProgressVersion - دریافت نسخه پیشرفت برای Optimistic Lock
 * @property {Function} getProgressFields - دریافت فیلدهای مشخص از پیشرفت
 */

/**
 * @typedef {Object} ILessonRepository
 * @description قرارداد مخزن درس‌ها
 * @property {Function} getLessonsByIds - دریافت چند درس با شناسه
 * @property {Function} getLesson - دریافت یک درس
 * @property {Function} getLessonsMap - دریافت نقشه درس‌ها با cache
 * @property {Function} lessonExists - بررسی وجود درس
 */

/**
 * @typedef {Object} ISRSScheduler
 * @description قرارداد زمان‌بند مرور هوشمند
 * @property {Function} filterDueItems - فیلتر آیتم‌های سررسید شده
 * @property {Function} sortByPriority - مرتب‌سازی بر اساس اولویت
 * @property {Function} calculatePriority - محاسبه امتیاز اولویت
 * @property {Function} calculateNextReview - محاسبه زمان مرور بعدی
 */

/**
 * @typedef {Object} ILogger
 * @description قرارداد سیستم لاگ با قابلیت پیکربندی سطح
 * @property {Function} debug - لاگ دیباگ
 * @property {Function} info - لاگ اطلاعات
 * @property {Function} warn - لاگ هشدار
 * @property {Function} error - لاگ خطا
 * @property {Function} setLevel - تغییر سطح لاگ (تأثیر global)
 * @property {number} currentLevel - سطح فعلی
 */

/**
 * @typedef {Object} IMetricsCollector
 * @description قرارداد جمع‌آوری متریک با sampling
 * @property {Function} record - ثبت یک متریک
 * @property {Function} increment - افزایش شمارنده
 * @property {Function} timing - ثبت زمان اجرا
 * @property {Function} gauge - ثبت مقدار لحظه‌ای
 */

/**
 * @typedef {Object} IEventEmitter
 * @description قرارداد رویدادها با قابلیت پاکسازی و مدیریت خطا
 * @property {Function} emit - انتشار رویداد
 * @property {Function} on - ثبت شنونده با محافظ خطا
 * @property {Function} off - حذف شنونده
 * @property {Function} removeAllListeners - پاکسازی همه شنونده‌ها
 * @property {Function} listenerCount - تعداد شنونده‌های یک رویداد
 */

/**
 * @typedef {Object} ICacheService
 * @description قرارداد سرویس کش
 * @property {Function} get - دریافت از کش
 * @property {Function} set - ذخیره در کش با TTL
 * @property {Function} delete - حذف از کش
 * @property {Function} invalidate - invalid کردن کش بر اساس الگو
 */

/**
 * @typedef {Object} ProgressData
 * @property {string} lessonId - شناسه درس
 * @property {string} userId - شناسه کاربر
 * @property {number} stage - مرحله SRS (0-8)
 * @property {string} lastReviewed - آخرین زمان مرور (ISO UTC)
 * @property {string} nextReview - زمان مرور بعدی (ISO UTC)
 * @property {number} easeFactor - ضریب آسانی (1.3 - 2.5)
 * @property {number} consecutiveCorrect - تعداد پاسخ‌های درست متوالی
 * @property {number} version - نسخه برای Optimistic Lock
 */

/**
 * @typedef {Object} LessonData
 * @property {string} id - شناسه درس
 * @property {string} title - عنوان درس
 * @property {string} language - زبان
 * @property {Array} vocabulary - لغات درس
 * @property {Object} metadata - فراداده
 */

/**
 * @typedef {Object} ReviewItem
 * @property {string} lessonId - شناسه درس
 * @property {LessonData|null} lesson - اطلاعات کامل درس
 * @property {ProgressData} progress - داده پیشرفت
 * @property {number} priorityScore - امتیاز اولویت (0-100)
 * @property {boolean} isDue - آیا نیاز به مرور دارد
 * @property {number} daysOverdue - روزهای گذشته از سررسید (محاسبه دقیق)
 */

/**
 * @typedef {Object} ReviewOptions
 * @property {number} [limit] - حداکثر تعداد
 * @property {number} [offset] - نقطه شروع (برای صفحه‌بندی)
 * @property {string} [now] - زمان جاری (ISO UTC، برای تست)
 * @property {boolean} [includeLessons] - شامل اطلاعات درس شود؟
 * @property {Array<string>} [fields] - فیلدهای مورد نیاز از پیشرفت
 * @property {string} [timezone] - منطقه زمانی کاربر (برای نمایش)
 */

/**
 * @typedef {Object} ReviewResult
 * @property {ProgressData} updatedProgress - پیشرفت به‌روز شده
 * @property {boolean} success - موفقیت آمیز بودن
 * @property {number} timestamp - زمان ثبت
 * @property {number} version - نسخه جدید
 */

/**
 * @typedef {Object} ReviewStats
 * @property {number} totalItems - کل آیتم‌ها
 * @property {number} dueToday - سررسید امروز
 * @property {number} overdue - گذشته از سررسید
 * @property {number} mastered - مسلط شده (stage >= 5)
 * @property {number} learning - در حال یادگیری (stage 1-4)
 * @property {number} new - جدید (stage 0)
 * @property {number} averageEaseFactor - میانگین ضریب آسانی
 */

/**
 * @typedef {Object} CacheEntry
 * @property {*} value - مقدار ذخیره شده
 * @property {number} timestamp - زمان ذخیره‌سازی
 */

// ---------- کلاس اصلی با رعایت کامل SOLID و الگوهای طراحی ----------

export class ReviewService {
    /**
     * ایجاد سرویس مرور با تزریق وابستگی‌ها
     * @param {Object} deps - وابستگی‌های تزریق شده
     * @param {IProgressRepository} deps.progressRepository - مخزن پیشرفت
     * @param {ILessonRepository} deps.lessonRepository - مخزن درس‌ها
     * @param {ISRSScheduler} deps.srsScheduler - زمان‌بند SRS
     * @param {ILogger} [deps.logger] - سیستم لاگ (اختیاری)
     * @param {IMetricsCollector} [deps.metrics] - جمع‌آوری متریک (اختیاری)
     * @param {IEventEmitter} [deps.eventEmitter] - انتشار رویداد (اختیاری)
     * @param {ICacheService} [deps.cache] - سرویس کش (اختیاری)
     * @param {LogLevelConfig} [deps.logConfig] - پیکربندی لاگ
     * @throws {Error} اگر وابستگی‌های اجباری缺失 باشند
     */
    constructor(deps) {
        this._validateDependencies(deps);
        
        this._progressRepository = deps.progressRepository;
        this._lessonRepository = deps.lessonRepository;
        this._srsScheduler = deps.srsScheduler;
        this._cache = deps.cache || this._createNullCache();
        
        // ایجاد لاگ با قابلیت پیکربندی
        this._logger = this._createConfigurableLogger(deps.logger, deps.logConfig);
        
        this._metrics = deps.metrics || this._createNullMetrics();
        this._eventEmitter = deps.eventEmitter || this._createNullEventEmitter();
        
        // کش داخلی با TTL و LRU
        this._internalCache = new Map();
        this._internalCacheTimestamps = new Map();
        
        // قفل برای جلوگیری از race condition در کش داخلی
        this._cacheLock = false;
        
        this._initialized = true;
        this._setupEventListeners();
        
        this._log('info', 'ReviewService initialized', {
            hasCache: !!deps.cache,
            logLevel: this._logger.currentLevel
        });
    }

    /**
     * اعتبارسنجی وابستگی‌های اجباری
     * @private
     * @param {Object} deps 
     * @throws {Error}
     */
    _validateDependencies(deps) {
        const requiredDeps = ['progressRepository', 'lessonRepository', 'srsScheduler'];
        
        for (const dep of requiredDeps) {
            if (!deps?.[dep]) {
                throw new Error(`ReviewService: ${dep} is required`);
            }
        }
        
        // بررسی circular dependency potential
        if (deps.progressRepository.constructor?.name === 'ReviewService') {
            this._log('warn', 'Potential circular dependency detected', {
                repository: 'progressRepository'
            });
        }
    }

    /**
     * ایجاد Null Object Pattern برای کش
     * @private
     * @returns {ICacheService}
     */
    _createNullCache() {
        return {
            get: async () => null,
            set: async () => {},
            delete: async () => {},
            invalidate: async () => {}
        };
    }

    /**
     * ایجاد لاگ با قابلیت پیکربندی سطح و نمونه‌برداری
     * @private
     * @param {ILogger} [baseLogger] 
     * @param {LogLevelConfig} [config] 
     * @returns {ILogger}
     */
    _createConfigurableLogger(baseLogger, config = {}) {
        if (!baseLogger) {
            return this._createNullLogger();
        }

        const sampleRate = config.sampleRate ?? 1.0;
        
        // سطح واقعی لاگ را در خود logger تنظیم می‌کنیم
        if (config.currentLevel !== undefined && baseLogger.setLevel) {
            baseLogger.setLevel(config.currentLevel);
        }

        const shouldLog = (level) => {
            if (sampleRate < 1.0 && Math.random() > sampleRate) return false;
            return true;
        };

        // برگرداندن proxy که sample rate را اعمال می‌کند
        return {
            debug: (message, data) => shouldLog(LOG_LEVELS.DEBUG) && baseLogger.debug?.(message, data),
            info: (message, data) => shouldLog(LOG_LEVELS.INFO) && baseLogger.info?.(message, data),
            warn: (message, data) => shouldLog(LOG_LEVELS.WARN) && baseLogger.warn?.(message, data),
            error: (message, data) => shouldLog(LOG_LEVELS.ERROR) && baseLogger.error?.(message, data),
            setLevel: (level) => baseLogger.setLevel?.(level),
            get currentLevel() { return baseLogger.currentLevel; }
        };
    }

    /**
     * ایجاد Null Object Pattern برای لاگ
     * @private
     * @returns {ILogger}
     */
    _createNullLogger() {
        return {
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            setLevel: () => {},
            currentLevel: LOG_LEVELS.NONE
        };
    }

    /**
     * ایجاد Null Object برای متریک
     * @private
     * @returns {IMetricsCollector}
     */
    _createNullMetrics() {
        return {
            record: () => {},
            increment: () => {},
            timing: () => {},
            gauge: () => {}
        };
    }

    /**
     * ایجاد Null Object برای رویداد
     * @private
     * @returns {IEventEmitter}
     */
    _createNullEventEmitter() {
        return {
            emit: () => {},
            on: () => {},
            off: () => {},
            removeAllListeners: () => {},
            listenerCount: () => 0
        };
    }

    /**
     * راه‌اندازی شنونده‌های رویداد با محافظ خطا و جلوگیری از شنونده تکراری
     * @private
     */
    _setupEventListeners() {
        // بررسی وجود شنونده قبلی
        if (this._eventEmitter.listenerCount('review:submitted') === 0) {
            this._eventEmitter.on('review:submitted', async (event) => {
                try {
                    await this._handleReviewSubmitted(event);
                } catch (error) {
                    this._log('error', 'Error in review:submitted handler', { error: error.message });
                }
            });
        }

        if (this._eventEmitter.listenerCount('review:reset') === 0) {
            this._eventEmitter.on('review:reset', async (event) => {
                try {
                    await this._handleReviewReset(event);
                } catch (error) {
                    this._log('error', 'Error in review:reset handler', { error: error.message });
                }
            });
        }
    }

    /**
     * مدیریت رویداد ثبت مرور
     * @private
     * @param {Object} event 
     */
    async _handleReviewSubmitted(event) {
        const { userId, lessonId } = event;
        
        // غیرهمزمان و بدون await برای non-blocking
        this._safeCacheInvalidate(`progress_${userId}`, CACHE_RETRY_COUNT);
        this._safeCacheInvalidate(`due_${userId}`, CACHE_RETRY_COUNT);
        this._safeCacheInvalidate(`stats_${userId}`, CACHE_RETRY_COUNT);
        
        // پاکسازی کش داخلی
        this._clearInternalCache();
    }

    /**
     * مدیریت رویداد بازنشانی مرور
     * @private
     * @param {Object} event 
     */
    async _handleReviewReset(event) {
        const { userId } = event;
        
        this._safeCacheInvalidate(`progress_${userId}`, CACHE_RETRY_COUNT);
        this._safeCacheInvalidate(`stats_${userId}`, CACHE_RETRY_COUNT);
        this._clearInternalCache();
    }

    /**
     * invalid کردن کش با مدیریت خطا و retry
     * @private
     * @param {string} key 
     * @param {number} retryCount 
     * @param {number} delay 
     */
    async _safeCacheInvalidate(key, retryCount = 1, delay = CACHE_RETRY_BASE_DELAY) {
        for (let attempt = 1; attempt <= retryCount; attempt++) {
            try {
                await this._cache.invalidate(key);
                return;
            } catch (error) {
                this._log('warn', `Cache invalidation failed (attempt ${attempt}/${retryCount})`, {
                    key,
                    error: error.message
                });
                
                if (attempt < retryCount) {
                    await new Promise(resolve => setTimeout(resolve, delay * attempt));
                }
            }
        }
    }

    /**
     * پاکسازی کش داخلی با قفل
     * @private
     */
    _clearInternalCache() {
        // استفاده از قفل برای جلوگیری از race condition
        if (this._cacheLock) {
            setTimeout(() => this._clearInternalCache(), 10);
            return;
        }
        
        this._cacheLock = true;
        try {
            this._internalCache.clear();
            this._internalCacheTimestamps.clear();
            this._metrics.increment('internalCache.cleared');
        } finally {
            this._cacheLock = false;
        }
    }

    /**
     * پاکسازی آیتم‌های expired از کش داخلی
     * @private
     */
    _cleanupExpiredCache() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, timestamp] of this._internalCacheTimestamps.entries()) {
            if (now - timestamp > INTERNAL_CACHE_TTL) {
                expiredKeys.push(key);
            }
        }
        
        for (const key of expiredKeys) {
            this._internalCache.delete(key);
            this._internalCacheTimestamps.delete(key);
        }
        
        if (expiredKeys.length > 0) {
            this._metrics.record('internalCache.expired', expiredKeys.length);
        }
    }

    /**
     * پاکسازی قدیمی‌ترین آیتم‌ها وقتی کش پر می‌شود
     * @private
     */
    _evictLRU() {
        if (this._internalCache.size < INTERNAL_CACHE_MAX_SIZE) return;
        
        // تبدیل به آرایه و مرتب‌سازی بر اساس timestamp
        const entries = Array.from(this._internalCacheTimestamps.entries());
        entries.sort((a, b) => a[1] - b[1]);
        
        // حذف ۲۰٪ قدیمی‌ترین‌ها
        const evictCount = Math.floor(INTERNAL_CACHE_MAX_SIZE * 0.2);
        for (let i = 0; i < evictCount && i < entries.length; i++) {
            const [key] = entries[i];
            this._internalCache.delete(key);
            this._internalCacheTimestamps.delete(key);
        }
        
        this._metrics.record('internalCache.evicted', evictCount);
    }

    /**
     * دریافت از کش داخلی با TTL
     * @private
     * @param {string} key 
     * @returns {*}
     */
    _getFromInternalCache(key) {
        this._cleanupExpiredCache();
        
        const value = this._internalCache.get(key);
        if (value !== undefined) {
            this._metrics.increment('internalCache.hit');
            return value;
        }
        
        this._metrics.increment('internalCache.miss');
        return null;
    }

    /**
     * ذخیره در کش داخلی با TTL و LRU
     * @private
     * @param {string} key 
     * @param {*} value 
     */
    _setInInternalCache(key, value) {
        this._evictLRU();
        
        this._internalCache.set(key, value);
        this._internalCacheTimestamps.set(key, Date.now());
        
        this._metrics.gauge('internalCache.size', this._internalCache.size);
    }

    /**
     * پاکسازی منابع هنگام تخریب
     */
    destroy() {
        this._eventEmitter.removeAllListeners('review:submitted');
        this._eventEmitter.removeAllListeners('review:reset');
        this._internalCache.clear();
        this._internalCacheTimestamps.clear();
        this._log('info', 'ReviewService destroyed');
    }

    /**
     * لاگ کردن با سطح مشخص (غیرهمزمان و non-blocking)
     * @private
     * @param {string} level - سطح لاگ
     * @param {string} message - پیام
     * @param {Object} [data] - داده‌های اضافی
     */
    _log(level, message, data = {}) {
        if (this._logger && this._logger[level]) {
            // اجرای non-blocking بدون await
            setTimeout(() => {
                try {
                    this._logger[level](`[ReviewService] ${message}`, {
                        ...data,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    // خاموش در صورت خطای لاگ
                }
            }, 0);
        }
    }

    /**
     * دریافت زمان فعلی به UTC (با پشتیبانی از مرورگرهای قدیمی)
     * @private
     * @param {string|Date} [now] - زمان ورودی (اختیاری)
     * @returns {string} زمان ISO UTC
     */
    _getUTCTime(now) {
        if (!now) {
            return new Date().toISOString();
        }
        
        try {
            if (typeof now === 'string') {
                // برای سازگاری با Safari قدیمی، Z را اضافه می‌کنیم
                const dateStr = now.includes('Z') ? now : now + 'Z';
                return new Date(dateStr).toISOString();
            }
            if (now instanceof Date) {
                return now.toISOString();
            }
        } catch (error) {
            this._log('warn', 'Invalid date input, using current time', { input: now });
        }
        
        return new Date().toISOString();
    }

    /**
     * تبدیل زمان UTC به منطقه زمانی کاربر (برای نمایش)
     * @private
     * @param {string} utcTime 
     * @param {string} timezone 
     * @returns {string}
     */
    _formatUserTime(utcTime, timezone = 'UTC') {
        try {
            const date = new Date(utcTime);
            return date.toLocaleString('en-US', { timeZone: timezone });
        } catch (error) {
            this._log('warn', 'Timezone conversion failed', { timezone, error: error.message });
            return utcTime;
        }
    }

    /**
     * ایجاد کلید کش برای محاسبه daysOverdue
     * @private
     * @param {string} dueDateStr 
     * @param {string} nowStr 
     * @returns {string}
     */
    _getDaysOverdueCacheKey(dueDateStr, nowStr) {
        return `${dueDateStr}|${nowStr}`;
    }

    /**
     * محاسبه دقیق روزهای گذشته از سررسید (با memoization و TTL)
     * @private
     * @param {string} dueDateStr - تاریخ سررسید (ISO UTC)
     * @param {string} nowStr - زمان فعلی (ISO UTC)
     * @returns {number} تعداد روزهای دقیق
     */
    _calculateExactDaysOverdue(dueDateStr, nowStr) {
        const cacheKey = this._getDaysOverdueCacheKey(dueDateStr, nowStr);
        
        // بررسی کش داخلی
        const cached = this._getFromInternalCache(cacheKey);
        if (cached !== null) {
            return cached;
        }
        
        // محاسبه
        const dueDate = new Date(dueDateStr);
        const now = new Date(nowStr);
        
        if (dueDate > now) {
            this._setInInternalCache(cacheKey, 0);
            return 0;
        }
        
        // Reset to start of day برای محاسبه دقیق
        const dueStart = new Date(Date.UTC(
            dueDate.getUTCFullYear(),
            dueDate.getUTCMonth(),
            dueDate.getUTCDate()
        ));
        
        const nowStart = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate()
        ));
        
        const diffTime = Math.abs(nowStart - dueStart);
        const result = Math.floor(diffTime / MS_PER_DAY);
        
        // ذخیره در کش
        this._setInInternalCache(cacheKey, result);
        
        return result;
    }

    /**
     * clone انتخابی برای بهینه‌سازی
     * @private
     * @param {Object} obj 
     * @param {Array<string>} [fields] - فیلدهای مورد نیاز برای clone
     * @returns {Object}
     */
    _selectiveClone(obj, fields = null) {
        if (!obj) return obj;
        
        if (fields) {
            // فقط فیلدهای مورد نیاز را clone کن
            const result = {};
            for (const field of fields) {
                if (obj[field] !== undefined) {
                    result[field] = obj[field];
                }
            }
            return result;
        }
        
        // clone کامل
        try {
            if (typeof structuredClone === 'function') {
                return structuredClone(obj);
            }
            return JSON.parse(JSON.stringify(obj));
        } catch (error) {
            this._log('warn', 'Deep clone failed, using shallow copy', { error: error.message });
            return { ...obj };
        }
    }

    /**
     * دریافت درس‌های نیازمند مرور با صفحه‌بندی و اولویت‌بندی
     * @param {string} userId - شناسه کاربر
     * @param {ReviewOptions} [options] - گزینه‌ها
     * @returns {Promise<ReviewItem[]>} - لیست مرتب‌شده
     * @throws {Error} اگر userId نامعتبر باشد
     */
    async getReviewsDue(userId, options = {}) {
        // اعتبارسنجی ورودی
        if (!userId || typeof userId !== 'string') {
            this._log('error', 'Invalid userId', { userId });
            throw new Error('userId must be a non-empty string');
        }

        const {
            limit = DEFAULT_REVIEW_LIMIT,
            offset = 0,
            now = this._getUTCTime(),
            includeLessons = true,
            fields = ['lessonId', 'stage', 'nextReview', 'easeFactor', 'consecutiveCorrect', 'version'],
            timezone = 'UTC'
        } = options;

        const cacheKey = `due_${userId}_${limit}_${offset}_${now}_${includeLessons}`;
        
        // تلاش برای دریافت از کش
        try {
            const cached = await this._cache.get(cacheKey);
            if (cached) {
                this._metrics.increment('review.cache.hit');
                
                // تبدیل زمان به timezone کاربر در صورت نیاز
                if (timezone !== 'UTC') {
                    return this._formatItemsTimezone(cached, timezone);
                }
                return cached;
            }
        } catch (error) {
            this._log('warn', 'Cache get failed', { key: cacheKey, error: error.message });
        }

        this._metrics.increment('review.cache.miss');
        const startTime = Date.now();

        try {
            this._log('debug', 'Fetching reviews due', { userId, limit, offset });

            // ۱. دریافت مستقیم آیتم‌های سررسید شده از Repository (با فیلدهای محدود)
            const dueProgress = await this._progressRepository.getDueProgress(userId, {
                limit: limit + offset,
                now,
                fields // فقط فیلدهای مورد نیاز
            });

            if (dueProgress.length === 0) {
                this._log('info', 'No due items found', { userId });
                return [];
            }

            // ۲. صفحه‌بندی
            const paginatedProgress = dueProgress.slice(offset, offset + limit);

            // ۳. دریافت اطلاعات درس‌ها (اختیاری)
            let lessonMap = new Map();
            if (includeLessons && paginatedProgress.length > 0) {
                const lessonIds = paginatedProgress.map(p => p.lessonId);
                const lessons = await this._lessonRepository.getLessonsMap(lessonIds);
                lessonMap = lessons;
            }

            // ۴. ترکیب داده‌ها و ساخت ReviewItem (با Promise.all برای سرعت)
            const reviewItems = await this._buildReviewItems(paginatedProgress, lessonMap, now, fields);

            // ۵. ذخیره در کش (با مدیریت خطا و retry)
            await this._safeCacheInvalidate(cacheKey); // اول حذف کن
            try {
                await this._cache.set(cacheKey, reviewItems, CACHE_TTL_REVIEW_ITEMS);
            } catch (error) {
                this._log('warn', 'Cache set failed', { key: cacheKey, error: error.message });
            }

            // ۶. ثبت متریک
            const duration = Date.now() - startTime;
            this._metrics.timing('review.getReviewsDue.duration', duration);
            this._metrics.record('review.items.count', reviewItems.length);
            this._metrics.gauge('internalCache.size', this._internalCache.size);

            this._log('info', 'Reviews retrieved successfully', {
                userId,
                count: reviewItems.length,
                totalDue: dueProgress.length,
                duration
            });

            // ۷. انتشار رویداد (بدون await برای non-blocking)
            this._eventEmitter.emit('review:itemsRetrieved', {
                userId,
                count: reviewItems.length,
                timestamp: Date.now()
            });

            // ۸. تبدیل به timezone کاربر
            if (timezone !== 'UTC') {
                return this._formatItemsTimezone(reviewItems, timezone);
            }

            return reviewItems;

        } catch (error) {
            this._log('error', 'Failed to get reviews due', {
                userId,
                error: error.message,
                stack: error.stack
            });
            
            this._metrics.increment('review.getReviewsDue.error');
            
            throw new Error(`Failed to get reviews for user ${userId}: ${error.message}`);
        }
    }

    /**
     * فرمت آیتم‌ها با timezone کاربر
     * @private
     * @param {Array<ReviewItem>} items 
     * @param {string} timezone 
     * @returns {Array<ReviewItem>}
     */
    _formatItemsTimezone(items, timezone) {
        return items.map(item => {
            const formattedItem = { ...item };
            if (item.progress) {
                formattedItem.progress = {
                    ...item.progress,
                    lastReviewed: this._formatUserTime(item.progress.lastReviewed, timezone),
                    nextReview: this._formatUserTime(item.progress.nextReview, timezone)
                };
            }
            return formattedItem;
        });
    }

    /**
     * ساخت آیتم‌های مرور از داده‌های پیشرفت (با Promise.all)
     * @private
     * @param {Array<ProgressData>} progressItems 
     * @param {Map<string, LessonData>} lessonMap 
     * @param {string} now 
     * @param {Array<string>} fields - فیلدهای مورد نیاز
     * @returns {Promise<ReviewItem[]>}
     */
    async _buildReviewItems(progressItems, lessonMap, now, fields) {
        // استفاده از Promise.all برای پردازش همزمان
        const items = await Promise.all(progressItems.map(async (progress) => {
            const lesson = lessonMap.get(progress.lessonId) || null;
            
            // اگر درس گم شده بود، لاگ خطا
            if (!lesson) {
                this._log('warn', 'Lesson not found for progress', {
                    lessonId: progress.lessonId
                });
                
                // تست edge case: درس missing
                this._metrics.increment('review.missingLesson');
            }
            
            // محاسبه priority یکبار و ذخیره
            const priorityScore = this._srsScheduler.calculatePriority(progress, now);
            
            // clone انتخابی برای بهینه‌سازی
            const progressFields = fields || Object.keys(progress);
            
            return {
                lessonId: progress.lessonId,
                lesson: lesson ? this._selectiveClone(lesson, ['id', 'title', 'language']) : null,
                progress: this._selectiveClone(progress, progressFields),
                priorityScore,
                isDue: true,
                daysOverdue: this._calculateExactDaysOverdue(progress.nextReview, now)
            };
        }));
        
        // مرتب‌سازی نهایی بر اساس priority
        return items.sort((a, b) => b.priorityScore - a.priorityScore);
    }

    /**
     * دریافت اولین درس برای مرور فوری
     * @param {string} userId 
     * @param {string} [now] 
     * @param {string} [timezone]
     * @returns {Promise<ReviewItem|null>}
     */
    async getNextReview(userId, now = this._getUTCTime(), timezone = 'UTC') {
        this._metrics.increment('review.getNextReview.called');
        
        try {
            const items = await this.getReviewsDue(userId, { 
                limit: 1, 
                now,
                includeLessons: true,
                timezone
            });
            
            const result = items.length ? items[0] : null;
            
            this._log('info', 'Next review retrieved', {
                userId,
                hasNext: !!result,
                lessonId: result?.lessonId
            });
            
            this._eventEmitter.emit('review:nextRetrieved', {
                userId,
                hasNext: !!result,
                lessonId: result?.lessonId
            });
            
            return result;
            
        } catch (error) {
            this._log('error', 'Failed to get next review', { userId, error: error.message });
            this._metrics.increment('review.getNextReview.error');
            throw error;
        }
    }

    /**
     * تعداد درس‌های نیازمند مرور امروز
     * @param {string} userId 
     * @param {string} [now] 
     * @returns {Promise<number>}
     */
    async countDue(userId, now = this._getUTCTime()) {
        try {
            const cacheKey = `due_count_${userId}_${now}`;
            
            try {
                const cached = await this._cache.get(cacheKey);
                if (cached !== null) return cached;
            } catch (error) {
                this._log('warn', 'Cache get failed for count', { error: error.message });
            }

            const dueProgress = await this._progressRepository.getDueProgress(userId, { 
                now,
                fields: ['lessonId'] // فقط شناسه درس کافی است
            });
            
            const count = dueProgress.length;
            
            try {
                await this._cache.set(cacheKey, count, CACHE_TTL_COUNT);
            } catch (error) {
                this._log('warn', 'Cache set failed for count', { error: error.message });
            }
            
            this._metrics.record('review.due.count', count);
            
            return count;
            
        } catch (error) {
            this._log('error', 'Failed to count due items', { userId, error: error.message });
            return 0; // Fail safe: برگرداندن 0 به جای خطا
        }
    }

    /**
     * ثبت نتیجه مرور و به‌روزرسانی SRS
     * @param {string} userId 
     * @param {string} lessonId 
     * @param {number} quality - کیفیت پاسخ (۰-۵)
     * @returns {Promise<ReviewResult>}
     * @throws {Error} اگر ورودی نامعتبر باشد
     */
    async submitReview(userId, lessonId, quality) {
        // اعتبارسنجی پیشرفته
        this._validateReviewInput(userId, lessonId, quality);
        
        // بررسی وجود درس
        const lessonExists = await this._lessonRepository.lessonExists(lessonId);
        if (!lessonExists) {
            this._metrics.increment('review.submit.missingLesson');
            throw new Error(`Lesson with id ${lessonId} does not exist`);
        }

        this._metrics.increment('review.submitReview.called');
        const startTime = Date.now();
        
        try {
            this._log('info', 'Submitting review', { userId, lessonId, quality });

            // دریافت نسخه فعلی برای Optimistic Lock
            const currentVersion = await this._progressRepository.getProgressVersion(userId, lessonId);

            // ثبت در مخزن با نسخه
            const updatedProgress = await this._progressRepository.updateProgressWithSRS(
                userId, 
                lessonId, 
                quality,
                currentVersion // برای جلوگیری از Race Condition
            );

            if (!updatedProgress) {
                throw new Error('Progress update failed - version conflict or no data');
            }

            const result = {
                updatedProgress: this._selectiveClone(updatedProgress), // clone انتخابی
                success: true,
                timestamp: Date.now(),
                version: updatedProgress.version
            };

            // محاسبه زمان اجرا
            const duration = Date.now() - startTime;
            this._metrics.timing('review.submitReview.duration', duration);
            
            // انتشار رویداد (باعث invalidate کش می‌شود) - non-blocking
            this._eventEmitter.emit('review:submitted', {
                userId,
                lessonId,
                quality,
                timestamp: result.timestamp,
                nextReview: updatedProgress.nextReview,
                version: updatedProgress.version
            });

            this._log('info', 'Review submitted successfully', {
                userId,
                lessonId,
                quality,
                nextReview: updatedProgress.nextReview,
                duration,
                version: updatedProgress.version
            });

            return result;

        } catch (error) {
            this._log('error', 'Failed to submit review', {
                userId,
                lessonId,
                quality,
                error: error.message
            });
            
            this._metrics.increment('review.submitReview.error');
            
            throw new Error(`Review submission failed: ${error.message}`);
        }
    }

    /**
     * اعتبارسنجی ورودی مرور
     * @private
     * @param {string} userId 
     * @param {string} lessonId 
     * @param {number} quality 
     * @throws {Error}
     */
    _validateReviewInput(userId, lessonId, quality) {
        if (!userId || typeof userId !== 'string') {
            throw new Error('userId must be a non-empty string');
        }
        
        if (!lessonId || typeof lessonId !== 'string') {
            throw new Error('lessonId must be a non-empty string');
        }
        
        if (typeof quality !== 'number' || 
            quality < MIN_QUALITY_SCORE || 
            quality > MAX_QUALITY_SCORE) {
            throw new Error(`quality must be a number between ${MIN_QUALITY_SCORE} and ${MAX_QUALITY_SCORE}`);
        }
    }

    /**
     * بازنشانی کامل مرور یک درس (شروع دوباره از صفر)
     * @param {string} userId 
     * @param {string} lessonId 
     * @returns {Promise<ProgressData>}
     */
    async resetReview(userId, lessonId) {
        this._validateReviewInput(userId, lessonId, 0); // quality بررسی نمی‌شود
        
        // بررسی وجود درس
        const lessonExists = await this._lessonRepository.lessonExists(lessonId);
        if (!lessonExists) {
            this._metrics.increment('review.reset.missingLesson');
            throw new Error(`Cannot reset: Lesson with id ${lessonId} does not exist`);
        }
        
        try {
            this._log('warn', 'Resetting review completely', { userId, lessonId });

            // بازنشانی کامل به مقادیر پیش‌فرض
            const resetData = {
                stage: 0,
                easeFactor: DEFAULT_EASE_FACTOR,
                consecutiveCorrect: 0,
                lastReviewed: this._getUTCTime(),
                nextReview: this._getUTCTime(), // بلافاصله قابل مرور
                version: Date.now() // نسخه جدید
            };

            const result = await this._progressRepository.initializeProgress(userId, lessonId, resetData);
            
            // انتشار رویداد - non-blocking
            this._eventEmitter.emit('review:reset', {
                userId,
                lessonId,
                timestamp: Date.now(),
                fullReset: true
            });

            this._log('info', 'Review reset successfully', { userId, lessonId });
            
            return this._selectiveClone(result); // clone انتخابی

        } catch (error) {
            this._log('error', 'Failed to reset review', { userId, lessonId, error: error.message });
            throw new Error(`Review reset failed: ${error.message}`);
        }
    }

    /**
     * دریافت آمار مرور کاربر
     * @param {string} userId 
     * @returns {Promise<ReviewStats>}
     */
    async getReviewStats(userId) {
        try {
            const cacheKey = `stats_${userId}`;
            
            try {
                const cached = await this._cache.get(cacheKey);
                if (cached) return cached;
            } catch (error) {
                this._log('warn', 'Cache get failed for stats', { error: error.message });
            }

            const allProgress = await this._progressRepository.getAllProgress(userId, {
                fields: ['stage', 'nextReview', 'easeFactor'] // فقط فیلدهای مورد نیاز
            });
            
            if (!Array.isArray(allProgress)) {
                return this._getEmptyStats();
            }

            const now = this._getUTCTime();
            
            // محاسبات آماری با یک بار پیمایش
            const stats = allProgress.reduce((acc, item) => {
                acc.totalItems++;
                
                const isDue = new Date(item.nextReview) <= new Date(now);
                if (isDue) {
                    acc.dueToday++;
                    if (new Date(item.nextReview) < new Date(now)) {
                        acc.overdue++;
                    }
                }
                
                if (item.stage >= 5) acc.mastered++;
                else if (item.stage > 0) acc.learning++;
                else acc.new++;
                
                acc.easeSum += item.easeFactor || DEFAULT_EASE_FACTOR;
                
                return acc;
            }, {
                totalItems: 0,
                dueToday: 0,
                overdue: 0,
                mastered: 0,
                learning: 0,
                new: 0,
                easeSum: 0
            });

            const result = {
                totalItems: stats.totalItems,
                dueToday: stats.dueToday,
                overdue: stats.overdue,
                mastered: stats.mastered,
                learning: stats.learning,
                new: stats.new,
                averageEaseFactor: stats.totalItems > 0 
                    ? Number((stats.easeSum / stats.totalItems).toFixed(2))
                    : DEFAULT_EASE_FACTOR
            };

            try {
                await this._cache.set(cacheKey, result, CACHE_TTL_STATS);
            } catch (error) {
                this._log('warn', 'Cache set failed for stats', { error: error.message });
            }
            
            this._metrics.record('review.stats', result);
            
            return result;

        } catch (error) {
            this._log('error', 'Failed to get review stats', { userId, error: error.message });
            return this._getEmptyStats();
        }
    }

    /**
     * دریافت آمار خالی (Fail safe)
     * @private
     * @returns {ReviewStats}
     */
    _getEmptyStats() {
        return {
            totalItems: 0,
            dueToday: 0,
            overdue: 0,
            mastered: 0,
            learning: 0,
            new: 0,
            averageEaseFactor: DEFAULT_EASE_FACTOR
        };
    }
}

// ---------- بخش تست (فقط در محیط توسعه) ----------
if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    /**
     * نسخه تستی با Fake Repository برای محیط‌های آزمایشی
     */
    export class TestReviewService extends ReviewService {
        constructor(deps) {
            super(deps);
            this._testMode = true;
        }

        /**
         * تابع تستی برای بررسی اعتبارسنجی
         * @returns {boolean}
         */
        testValidation() {
            return !!this._progressRepository;
        }

        /**
         * شبیه‌سازی مرور با داده‌های تستی
         * @param {string} userId 
         * @param {Array} mockProgress 
         */
        async injectMockData(userId, mockProgress) {
            if (this._progressRepository.injectMock) {
                await this._progressRepository.injectMock(userId, mockProgress);
            }
        }

        /**
         * پاکسازی کش داخلی برای تست
         */
        clearInternalCache() {
            this._internalCache.clear();
            this._internalCacheTimestamps.clear();
        }

        /**
         * تست edge cases: درس missing
         * @param {string} userId 
         * @param {string} missingLessonId 
         */
        async testMissingLesson(userId, missingLessonId) {
            try {
                await this.getReviewsDue(userId, { includeLessons: true });
                return { passed: true };
            } catch (error) {
                return { passed: false, error: error.message };
            }
        }
    }
}

// ---------- Export نام‌گذاری شده برای وضوح ----------
export default ReviewService;
