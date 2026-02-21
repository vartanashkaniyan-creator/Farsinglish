/**
 * @file srs_scheduler.js
 * @version 2.2.0
 * @description زمان‌بندی و اولویت‌بندی مرورهای هوشمند (SRS Scheduler) با معماری پیشرفته
 * @copyright Farsinglish Project 2024
 * 
 * ویژگی‌ها:
 * - فیلتر و اولویت‌بندی درس‌های نیازمند مرور
 * - محاسبه امتیاز اولویت با پارامترهای پویا
 * - Result Pattern یکپارچه با core
 * - Time Provider برای تست‌پذیری کامل
 * - Cache Management هوشمند با الگوریتم LFU
 * - اعتبارسنجی کامل با Schema Validation
 * - Logging پیشرفته برای hit/miss
 * - Date Parsing ایمن با try/catch
 * - Dependency Injection برای کش
 * - Query Builder پیشرفته
 */

// ============== Imports ==============

// در پروژه واقعی، این import از مسیر اصلی انجام می‌شود
// import { Result, ErrorCode } from '../core/utils/result.js';
// import { Logger } from '../core/utils/logger.js';

// ============== CONSTANTS ==============

/** @type {Readonly<Record<string, number>>} */
export const PRIORITY_CONSTANTS = Object.freeze({
    // امتیازات پایه
    BASE_SCORE: 100,
    MAX_PRIORITY_SCORE: 1000,
    
    // جریمه تأخیر (هر روز)
    OVERDUE_PENALTY_PER_DAY: 5,
    
    // ضریب آسانی
    LOW_EASE_THRESHOLD: 2.0,
    LOW_EASE_BONUS: 20,
    
    // سطح تسلط
    MASTERY_THRESHOLD: 4,
    MASTERY_PENALTY_PER_LEVEL: 10,
    
    // کارت جدید
    NEW_CARD_BONUS: 50,
    
    // بازه‌های زمانی
    DEFAULT_DAYS_AHEAD: 1,
    
    // Batch processing
    DEFAULT_BATCH_SIZE: 1000,
    
    // Cache limits
    MAX_CACHE_SIZE: 10000,
    CACHE_CLEANUP_INTERVAL: 60000, // 1 دقیقه
    CACHE_EVICTION_PERCENT: 20, // درصد حذف در هر بار
    MAX_HIT_HISTORY: 1000
});

/** @type {Readonly<Record<string, string>>} */
export const ERROR_CODES = Object.freeze({
    INVALID_PROGRESS_LIST: 'INVALID_PROGRESS_LIST',
    INVALID_DUE_ITEMS: 'INVALID_DUE_ITEMS',
    INVALID_ITEM: 'INVALID_ITEM',
    OPERATION_ABORTED: 'OPERATION_ABORTED',
    CACHE_ERROR: 'CACHE_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    DATE_PARSE_ERROR: 'DATE_PARSE_ERROR'
});

// ============== Logger ==============

/**
 * @interface ILogger
 */
class ILogger {
    info(message, meta) { throw new Error('Not implemented'); }
    warn(message, meta) { throw new Error('Not implemented'); }
    error(message, meta) { throw new Error('Not implemented'); }
    debug(message, meta) { throw new Error('Not implemented'); }
}

/**
 * @class ConsoleLogger
 * @implements {ILogger}
 */
class ConsoleLogger extends ILogger {
    info(message, meta) { console.log(`[INFO] ${message}`, meta || ''); }
    warn(message, meta) { console.warn(`[WARN] ${message}`, meta || ''); }
    error(message, meta) { console.error(`[ERROR] ${message}`, meta || ''); }
    debug(message, meta) { console.debug(`[DEBUG] ${message}`, meta || ''); }
}

// ============== Result Pattern ==============

/**
 * @typedef {Object} SuccessResult
 * @property {true} success
 * @property {*} data
 */

/**
 * @typedef {Object} ErrorResult
 * @property {false} success
 * @property {string} code
 * @property {string} message
 * @property {Object} [details]
 */

/** @typedef {SuccessResult | ErrorResult} Result */

/** @type {Readonly<Result>} */
export const Result = Object.freeze({
    /**
     * @param {*} data
     * @returns {SuccessResult}
     */
    ok: (data) => ({ success: true, data }),

    /**
     * @param {string} code
     * @param {string} message
     * @param {Object} [details]
     * @returns {ErrorResult}
     */
    fail: (code, message, details = {}) => ({ 
        success: false, 
        code, 
        message,
        details
    })
});

// ============== Type Definitions ==============

/**
 * @typedef {Object} ProgressItem
 * @property {string} lessonId - شناسه درس (الزامی)
 * @property {string|Date} [nextReviewDate] - تاریخ مرور بعدی
 * @property {number} [interval=0] - فاصله زمانی (روز)
 * @property {number} [easeFactor=2.5] - ضریب آسانی (1.3-5.0)
 * @property {number} [masteryLevel=0] - سطح تسلط (۰-۵)
 * @property {number} [repetition=0] - تعداد تکرار (>=0)
 * @property {number} [lapses=0] - تعداد فراموشی (>=0)
 * @property {number} [lastDuration=0] - آخرین مدت زمان
 */

/**
 * @typedef {Object} ValidationSchema
 * @property {string} type
 * @property {boolean} [required]
 * @property {number} [min]
 * @property {number} [max]
 * @property {RegExp} [pattern]
 */

/**
 * @typedef {Object} DueItemsResult
 * @property {ProgressItem[]} items - آیتم‌های سررسید شده
 * @property {number} count - تعداد کل
 * @property {number} overdue - تعداد تأخیردار
 * @property {number} duration - زمان پردازش (ms)
 */

/**
 * @typedef {Object} BatchOptions
 * @property {number} [batchSize=1000] - اندازه هر دسته
 * @property {Function} [timeProvider] - تامین‌کننده زمان
 * @property {Function} [onProgress] - callback پیشرفت
 * @property {AbortSignal} [signal] - سیگنال لغو
 * @property {ILogger} [logger] - لاگر
 */

/**
 * @typedef {Object} TimeProvider
 * @property {function(): Date} now - زمان جاری
 */

// ============== Cache Interface ==============

/**
 * @interface ICache
 */
class ICache {
    get(key) { throw new Error('Not implemented'); }
    set(key, value) { throw new Error('Not implemented'); }
    has(key) { throw new Error('Not implemented'); }
    delete(key) { throw new Error('Not implemented'); }
    clear() { throw new Error('Not implemented'); }
    getStats() { throw new Error('Not implemented'); }
}

// ============== Smart Cache Implementation ==============

/**
 * @class SmartCache
 * @implements {ICache}
 * @description پیاده‌سازی LFU Cache با مدیریت هوشمند
 */
class SmartCache extends ICache {
    /** @type {Map<string, any>} */
    #storage;
    
    /** @type {Map<string, {hitCount: number, lastAccessed: number, timestamp: number}>} */
    #metadata;
    
    /** @type {number} */
    #maxSize;
    
    /** @type {number} */
    #hits = 0;
    
    /** @type {number} */
    #misses = 0;
    
    /** @type {ILogger} */
    #logger;
    
    /** @type {Array<{key: string, hitCount: number, timestamp: number}>} */
    #hitHistory = [];

    /**
     * @param {number} maxSize
     * @param {ILogger} logger
     */
    constructor(maxSize = PRIORITY_CONSTANTS.MAX_CACHE_SIZE, logger = new ConsoleLogger()) {
        super();
        this.#storage = new Map();
        this.#metadata = new Map();
        this.#maxSize = maxSize;
        this.#logger = logger;
        
        // تنظیم پاکسازی خودکار
        setInterval(() => this.#smartEvict(), PRIORITY_CONSTANTS.CACHE_CLEANUP_INTERVAL);
    }

    /**
     * @param {string} key
     * @returns {any}
     */
    get(key) {
        const value = this.#storage.get(key);
        if (value !== undefined) {
            this.#hits++;
            this.#updateMetadata(key);
            this.#logger.debug('Cache hit', { key, hitCount: this.#metadata.get(key)?.hitCount });
            return value;
        }
        this.#misses++;
        this.#logger.debug('Cache miss', { key });
        return undefined;
    }

    /**
     * @param {string} key
     * @param {any} value
     */
    set(key, value) {
        if (this.#storage.size >= this.#maxSize) {
            this.#smartEvict();
        }
        
        this.#storage.set(key, value);
        this.#metadata.set(key, {
            hitCount: 0,
            lastAccessed: Date.now(),
            timestamp: Date.now()
        });
        
        this.#logger.debug('Cache set', { key, cacheSize: this.#storage.size });
    }

    /**
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
        return this.#storage.has(key);
    }

    /**
     * @param {string} key
     * @returns {boolean}
     */
    delete(key) {
        const deleted = this.#storage.delete(key);
        this.#metadata.delete(key);
        if (deleted) {
            this.#logger.debug('Cache delete', { key });
        }
        return deleted;
    }

    /**
     * پاکسازی کامل کش
     */
    clear() {
        this.#storage.clear();
        this.#metadata.clear();
        this.#hits = 0;
        this.#misses = 0;
        this.#hitHistory = [];
        this.#logger.info('Cache cleared');
    }

    /**
     * @private
     * @param {string} key
     */
    #updateMetadata(key) {
        const meta = this.#metadata.get(key);
        if (meta) {
            meta.hitCount++;
            meta.lastAccessed = Date.now();
            
            // ثبت در تاریخچه
            this.#hitHistory.push({
                key,
                hitCount: meta.hitCount,
                timestamp: Date.now()
            });
            
            // محدود کردن تاریخچه
            if (this.#hitHistory.length > PRIORITY_CONSTANTS.MAX_HIT_HISTORY) {
                this.#hitHistory.shift();
            }
        }
    }

    /**
     * @private
     * پاکسازی هوشمند بر اساس LFU (Least Frequently Used)
     */
    #smartEvict() {
        if (this.#storage.size < this.#maxSize * 0.8) return;

        // محاسبه امتیاز برای هر آیتم
        const items = Array.from(this.#metadata.entries())
            .map(([key, meta]) => ({
                key,
                score: this.#calculateEvictionScore(meta)
            }))
            .sort((a, b) => b.score - a.score); // امتیاز بالاتر = کاندید بهتری برای حذف

        // حذف ۲۰٪ از آیتم‌های با بالاترین امتیاز (کم‌اهمیت‌ترین)
        const toRemove = items.slice(0, Math.floor(items.length * PRIORITY_CONSTANTS.CACHE_EVICTION_PERCENT / 100));
        
        toRemove.forEach(item => {
            this.#storage.delete(item.key);
            this.#metadata.delete(item.key);
        });

        this.#logger.info('Cache eviction completed', {
            removedCount: toRemove.length,
            remainingSize: this.#storage.size,
            strategy: 'LFU'
        });
    }

    /**
     * @private
     * محاسبه امتیاز برای حذف (بالاتر = زودتر حذف شود)
     * @param {Object} meta
     * @returns {number}
     */
    #calculateEvictionScore(meta) {
        const age = Date.now() - meta.timestamp; // عمر آیتم
        const recency = Date.now() - meta.lastAccessed; // زمان از آخرین دسترسی
        const hitScore = 1 / (meta.hitCount + 1); // هرچه hit کمتر، امتیاز بالاتر
        
        // ترکیب فاکتورها (وزن‌دهی قابل تنظیم)
        return (age * 0.3) + (recency * 0.5) + (hitScore * 1000);
    }

    /**
     * دریافت آمار کش
     * @returns {Object}
     */
    getStats() {
        const total = this.#hits + this.#misses;
        return {
            size: this.#storage.size,
            maxSize: this.#maxSize,
            hits: this.#hits,
            misses: this.#misses,
            hitRate: total > 0 ? Number((this.#hits / total * 100).toFixed(1)) : 0,
            topItems: this.#hitHistory.slice(-10).reverse(),
            metadata: Array.from(this.#metadata.entries()).map(([key, meta]) => ({
                key,
                ...meta
            }))
        };
    }
}

// ============== Validator ==============

/**
 * @class ProgressItemValidator
 * @description اعتبارسنجی پیشرفته آیتم‌های پیشرفت
 */
class ProgressItemValidator {
    /** @type {Readonly<Record<string, ValidationSchema>>} */
    static #SCHEMA = Object.freeze({
        lessonId: { type: 'string', required: true, pattern: /^[a-zA-Z0-9_-]+$/ },
        easeFactor: { type: 'number', min: 1.3, max: 5.0 },
        masteryLevel: { type: 'number', min: 0, max: 5 },
        repetition: { type: 'number', min: 0 },
        lapses: { type: 'number', min: 0 },
        interval: { type: 'number', min: 0 },
        lastDuration: { type: 'number', min: 0 }
    });

    /**
     * اعتبارسنجی کامل آیتم
     * @param {*} item
     * @returns {Result}
     */
    static validate(item) {
        if (!item || typeof item !== 'object') {
            return Result.fail(
                ERROR_CODES.INVALID_ITEM,
                'Item must be an object'
            );
        }

        const errors = [];

        // بررسی فیلدهای اجباری
        for (const [field, schema] of Object.entries(this.#SCHEMA)) {
            if (schema.required && !(field in item)) {
                errors.push(`Missing required field: ${field}`);
                continue;
            }

            const value = item[field];
            if (value !== undefined) {
                const fieldError = this.#validateField(field, value, schema);
                if (fieldError) {
                    errors.push(fieldError);
                }
            }
        }

        if (errors.length > 0) {
            return Result.fail(
                ERROR_CODES.VALIDATION_ERROR,
                'Validation failed',
                { errors }
            );
        }

        return Result.ok(item);
    }

    /**
     * @private
     */
    static #validateField(field, value, schema) {
        if (schema.type === 'string') {
            if (typeof value !== 'string') {
                return `${field} must be a string`;
            }
            if (schema.pattern && !schema.pattern.test(value)) {
                return `${field} has invalid format`;
            }
        }

        if (schema.type === 'number') {
            if (typeof value !== 'number' || isNaN(value)) {
                return `${field} must be a valid number`;
            }
            if (schema.min !== undefined && value < schema.min) {
                return `${field} must be >= ${schema.min}`;
            }
            if (schema.max !== undefined && value > schema.max) {
                return `${field} must be <= ${schema.max}`;
            }
        }

        return null;
    }

    /**
     * تبدیل مقادیر به نوع صحیح
     * @param {Object} item
     * @returns {Object}
     */
    static sanitize(item) {
        const sanitized = { ...item };
        
        if (sanitized.easeFactor !== undefined) {
            sanitized.easeFactor = Number(sanitized.easeFactor);
        }
        if (sanitized.masteryLevel !== undefined) {
            sanitized.masteryLevel = Number(sanitized.masteryLevel);
        }
        if (sanitized.repetition !== undefined) {
            sanitized.repetition = Number(sanitized.repetition);
        }
        
        return sanitized;
    }
}

// ============== Date Utilities ==============

/**
 * تبدیل ایمن به Date
 * @param {*} date
 * @param {Date} [fallback]
 * @returns {Result}
 */
export function safeToDate(date, fallback = new Date()) {
    try {
        if (date instanceof Date) {
            return Result.ok(date);
        }
        
        if (typeof date === 'string' || typeof date === 'number') {
            const parsed = new Date(date);
            if (!isNaN(parsed.getTime())) {
                return Result.ok(parsed);
            }
        }
        
        return Result.fail(
            ERROR_CODES.DATE_PARSE_ERROR,
            `Invalid date format: ${date}`,
            { value: date }
        );
    } catch (error) {
        return Result.fail(
            ERROR_CODES.DATE_PARSE_ERROR,
            error instanceof Error ? error.message : 'Date parse failed',
            { original: date }
        );
    }
}

/**
 * تبدیل ایمن به timestamp
 * @param {*} date
 * @returns {Result}
 */
export function safeToTime(date) {
    const result = safeToDate(date);
    if (!result.success) return result;
    return Result.ok(result.data.getTime());
}

// ============== Cache Instance with DI ==============

/**
 * @class SchedulerCacheManager
 * @description مدیریت کش با Dependency Injection
 */
export class SchedulerCacheManager {
    /** @type {ICache} */
    #cache;
    
    /** @type {ILogger} */
    #logger;

    /**
     * @param {ICache} cache
     * @param {ILogger} logger
     */
    constructor(cache, logger = new ConsoleLogger()) {
        this.#cache = cache;
        this.#logger = logger;
    }

    getDate(dateStr) {
        return this.#cache.get(`date:${dateStr}`);
    }

    setDate(dateStr, date) {
        this.#cache.set(`date:${dateStr}`, date);
    }

    getPriority(itemId, timeKey) {
        const cached = this.#cache.get(`priority:${itemId}`);
        if (cached && cached.timeKey === timeKey) {
            return cached.score;
        }
        return undefined;
    }

    setPriority(itemId, score, timeKey) {
        this.#cache.set(`priority:${itemId}`, { score, timeKey, timestamp: Date.now() });
    }

    clear() {
        this.#cache.clear();
        this.#logger.info('Scheduler cache cleared');
    }

    getStats() {
        return this.#cache.getStats();
    }
}

// ============== Cache Instance (پیش‌فرض) ==============

/** @type {SchedulerCacheManager} */
let cacheManager = new SchedulerCacheManager(new SmartCache());

/**
 * تنظیم Cache Manager (برای DI)
 * @param {SchedulerCacheManager} manager
 */
export function setCacheManager(manager) {
    cacheManager = manager;
}

/**
 * پاکسازی کش زمان‌بندی
 * @returns {Result}
 */
export function clearSchedulerCache() {
    try {
        cacheManager.clear();
        return Result.ok({ cleared: true, timestamp: Date.now() });
    } catch (error) {
        return Result.fail(
            ERROR_CODES.CACHE_ERROR,
            error instanceof Error ? error.message : 'Cache clear failed'
        );
    }
}

/**
 * دریافت آمار کش
 * @returns {Object}
 */
export function getCacheStats() {
    return cacheManager.getStats();
}

// ============== Time Provider ==============

/**
 * ایجاد Time Provider پیش‌فرض
 * @returns {TimeProvider}
 */
export function createTimeProvider() {
    return {
        now: () => new Date()
    };
}

// ============== Utility Functions ==============

/**
 * تبدیل ورودی به شیء Date با کش و try/catch
 * @private
 * @param {string|Date} date
 * @param {TimeProvider} [timeProvider]
 * @returns {Result}
 */
function toDateSafe(date, timeProvider = createTimeProvider()) {
    if (date instanceof Date) return Result.ok(date);
    
    // Try cache first
    const cached = cacheManager.getDate(date);
    if (cached) return Result.ok(cached);
    
    // Parse with safe method
    const result = safeToDate(date);
    if (result.success) {
        cacheManager.setDate(date, result.data);
    }
    return result;
}

/**
 * تبدیل به timestamp با try/catch
 * @private
 * @param {string|Date} date
 * @param {TimeProvider} [timeProvider]
 * @returns {Result}
 */
function toTimeSafe(date, timeProvider) {
    const result = toDateSafe(date, timeProvider);
    if (!result.success) return result;
    return Result.ok(result.data.getTime());
}

/**
 * اعتبارسنجی آیتم پیشرفت (نسخه ایمن)
 * @private
 * @param {*} item
 * @returns {Result}
 */
function validateProgressItem(item) {
    return ProgressItemValidator.validate(item);
}

/**
 * ایجاد شناسه یکتا برای آیتم
 * @private
 * @param {ProgressItem} item
 * @returns {string}
 */
function getItemId(item) {
    return `${item.lessonId}_${item.repetition || 0}`;
}

/**
 * بررسی سررسید بودن آیتم (نسخه ایمن)
 * @private
 * @param {ProgressItem} item
 * @param {TimeProvider} timeProvider
 * @returns {Result}
 */
function isItemDueSafe(item, timeProvider) {
    if (!item?.nextReviewDate) return Result.ok(true);
    
    const now = timeProvider.now();
    const reviewTimeResult = toTimeSafe(item.nextReviewDate, timeProvider);
    const nowTimeResult = toTimeSafe(now, timeProvider);
    
    if (!reviewTimeResult.success || !nowTimeResult.success) {
        return Result.fail(
            ERROR_CODES.DATE_PARSE_ERROR,
            'Failed to parse dates for due check'
        );
    }
    
    return Result.ok(reviewTimeResult.data <= nowTimeResult.data);
}

// ============== Main Functions ==============

/**
 * فیلتر کردن آیتم‌های نیازمند مرور
 * @param {ProgressItem[]} progressList - لیست پیشرفت‌ها
 * @param {TimeProvider} [timeProvider] - تامین‌کننده زمان
 * @returns {Promise<Result>} نتیجه شامل آرایه آیتم‌های سررسید شده
 */
export async function filterDueItems(progressList, timeProvider = createTimeProvider()) {
    // Validation
    if (!Array.isArray(progressList)) {
        return Result.fail(
            ERROR_CODES.INVALID_PROGRESS_LIST,
            'progressList must be an array'
        );
    }

    const startTime = performance.now();
    const dueItems = [];
    const errors = [];

    // Filter with validation
    for (const item of progressList) {
        const validationResult = validateProgressItem(item);
        if (!validationResult.success) {
            errors.push({ item, error: validationResult });
            continue;
        }

        const dueResult = await isItemDueSafe(validationResult.data, timeProvider);
        if (!dueResult.success) {
            errors.push({ item, error: dueResult });
            continue;
        }

        if (dueResult.data) {
            dueItems.push(validationResult.data);
        }
    }

    const duration = performance.now() - startTime;

    return Result.ok({
        items: dueItems,
        count: dueItems.length,
        errors: errors.length > 0 ? errors : undefined,
        duration: Math.round(duration)
    });
}

/**
 * محاسبه امتیاز اولویت برای مرتب‌سازی
 * @param {ProgressItem} item - آیتم پیشرفت
 * @param {TimeProvider} [timeProvider] - تامین‌کننده زمان
 * @returns {Promise<Result>} امتیاز اولویت
 */
export async function calculatePriorityScore(item, timeProvider = createTimeProvider()) {
    // Validation
    const validationResult = validateProgressItem(item);
    if (!validationResult.success) {
        return Result.fail(
            ERROR_CODES.INVALID_ITEM,
            'Invalid item for priority calculation',
            { error: validationResult }
        );
    }

    const validItem = validationResult.data;
    const now = timeProvider.now();
    let score = PRIORITY_CONSTANTS.BASE_SCORE;

    try {
        // 1. Overdue penalty
        if (validItem.nextReviewDate) {
            const reviewTimeResult = await toTimeSafe(validItem.nextReviewDate, timeProvider);
            const currentTimeResult = await toTimeSafe(now, timeProvider);
            
            if (reviewTimeResult.success && currentTimeResult.success) {
                const daysOverdue = Math.max(0, (currentTimeResult.data - reviewTimeResult.data) / (1000 * 60 * 60 * 24));
                score += daysOverdue * PRIORITY_CONSTANTS.OVERDUE_PENALTY_PER_DAY;
            }
        }

        // 2. Low ease factor
        const easeFactor = validItem.easeFactor ?? 2.5;
        if (easeFactor < PRIORITY_CONSTANTS.LOW_EASE_THRESHOLD) {
            score += PRIORITY_CONSTANTS.LOW_EASE_BONUS;
        }

        // 3. High mastery level
        const masteryLevel = validItem.masteryLevel ?? 0;
        if (masteryLevel >= PRIORITY_CONSTANTS.MASTERY_THRESHOLD) {
            const penalty = PRIORITY_CONSTANTS.MASTERY_PENALTY_PER_LEVEL * 
                           (masteryLevel - PRIORITY_CONSTANTS.MASTERY_THRESHOLD + 1);
            score -= penalty;
        }

        // 4. New card
        const repetition = validItem.repetition ?? 0;
        if (repetition === 0) {
            score += PRIORITY_CONSTANTS.NEW_CARD_BONUS;
        }

        // Ensure score is within bounds
        score = Math.max(0, Math.min(score, PRIORITY_CONSTANTS.MAX_PRIORITY_SCORE));
        
        return Result.ok(score);
    } catch (error) {
        return Result.fail(
            ERROR_CODES.INVALID_ITEM,
            'Error calculating priority score',
            { error: error.message }
        );
    }
}

/**
 * نسخه بهینه‌سازی شده محاسبه امتیاز با کش
 * @param {ProgressItem} item
 * @param {TimeProvider} [timeProvider]
 * @returns {Promise<Result>}
 */
export async function calculatePriorityScoreCached(item, timeProvider = createTimeProvider()) {
    const validationResult = validateProgressItem(item);
    if (!validationResult.success) {
        return Result.fail(
            ERROR_CODES.INVALID_ITEM,
            'Invalid item for cached priority calculation',
            { error: validationResult }
        );
    }

    const validItem = validationResult.data;
    const itemId = getItemId(validItem);
    const timeKey = timeProvider.now().toDateString();
    
    // Check cache
    const cached = cacheManager.getPriority(itemId, timeKey);
    if (cached !== undefined) {
        return Result.ok(cached);
    }
    
    // Calculate and cache
    const scoreResult = await calculatePriorityScore(validItem, timeProvider);
    if (scoreResult.success) {
        cacheManager.setPriority(itemId, scoreResult.data, timeKey);
    }
    
    return scoreResult;
}

/**
 * مرتب‌سازی آیتم‌های نیازمند مرور بر اساس اولویت
 * @param {ProgressItem[]} dueItems - آرایه آیتم‌های سررسید شده
 * @param {TimeProvider} [timeProvider] - تامین‌کننده زمان
 * @returns {Promise<Result>} نتیجه شامل آرایه مرتب‌شده
 */
export async function sortByPriority(dueItems, timeProvider = createTimeProvider()) {
    // Validation
    if (!Array.isArray(dueItems)) {
        return Result.fail(
            ERROR_CODES.INVALID_DUE_ITEMS,
            'dueItems must be an array'
        );
    }

    const startTime = performance.now();
    const validItems = [];
    const errors = [];

    // Validate all items first
    for (const item of dueItems) {
        const validationResult = validateProgressItem(item);
        if (validationResult.success) {
            validItems.push(validationResult.data);
        } else {
            errors.push({ item, error: validationResult });
        }
    }

    // Create copies with scores
    const itemsWithScores = [];
    for (const item of validItems) {
        const scoreResult = await calculatePriorityScoreCached(item, timeProvider);
        if (scoreResult.success) {
            itemsWithScores.push({
                item: { ...item },
                score: scoreResult.data
            });
        } else {
            errors.push({ item, error: scoreResult });
        }
    }

    // Sort by score
    itemsWithScores.sort((a, b) => b.score - a.score);

    const duration = performance.now() - startTime;

    return Result.ok({
        items: itemsWithScores.map(i => i.item),
        scores: itemsWithScores.map(i => i.score),
        count: itemsWithScores.length,
        errors: errors.length > 0 ? errors : undefined,
        duration: Math.round(duration)
    });
}

/**
 * دریافت تعداد آیتم‌های نیازمند مرور در بازه زمانی
 * @param {ProgressItem[]} progressList - لیست پیشرفت‌ها
 * @param {number} [daysAhead=1] - چند روز آینده
 * @param {TimeProvider} [timeProvider] - تامین‌کننده زمان
 * @returns {Promise<Result>} نتیجه شامل تعداد آیتم‌ها
 */
export async function countDueInNextDays(
    progressList, 
    daysAhead = PRIORITY_CONSTANTS.DEFAULT_DAYS_AHEAD, 
    timeProvider = createTimeProvider()
) {
    // Validation
    if (!Array.isArray(progressList)) {
        return Result.fail(
            ERROR_CODES.INVALID_PROGRESS_LIST,
            'progressList must be an array'
        );
    }

    const filterResult = await filterDueItems(progressList, timeProvider);
    
    if (!filterResult.success) {
        return filterResult;
    }

    const now = timeProvider.now();
    const futureThreshold = new Date(now);
    futureThreshold.setDate(now.getDate() + daysAhead);
    const thresholdTimeResult = await toTimeSafe(futureThreshold, timeProvider);
    
    if (!thresholdTimeResult.success) {
        return Result.fail(
            ERROR_CODES.DATE_PARSE_ERROR,
            'Failed to parse threshold date'
        );
    }

    let count = 0;
    for (const item of filterResult.data.items) {
        if (!item?.nextReviewDate) {
            count++;
            continue;
        }
        
        const itemTimeResult = await toTimeSafe(item.nextReviewDate, timeProvider);
        if (itemTimeResult.success && itemTimeResult.data <= thresholdTimeResult.data) {
            count++;
        }
    }

    return Result.ok({
        count,
        daysAhead,
        referenceDate: now.toISOString()
    });
}

/**
 * پردازش دسته‌ای برای لیست‌های بزرگ با قابلیت لغو
 * @param {ProgressItem[]} progressList - لیست بزرگ پیشرفت‌ها
 * @param {BatchOptions} options - گزینه‌ها
 * @returns {Promise<Result>} نتیجه پردازش
 */
export async function processDueItemsInBatches(progressList, options = {}) {
    const {
        batchSize = PRIORITY_CONSTANTS.DEFAULT_BATCH_SIZE,
        timeProvider = createTimeProvider(),
        onProgress = null,
        signal = null,
        logger = new ConsoleLogger()
    } = options;

    // Validation
    if (!Array.isArray(progressList)) {
        return Result.fail(
            ERROR_CODES.INVALID_PROGRESS_LIST,
            'progressList must be an array'
        );
    }

    // Check for abort
    if (signal?.aborted) {
        return Result.fail(
            ERROR_CODES.OPERATION_ABORTED,
            'Operation was aborted before starting'
        );
    }

    const startTime = performance.now();
    const result = [];
    const total = progressList.length;
    let processed = 0;
    let errorCount = 0;

    logger.info('Starting batch processing', { total, batchSize });

    for (let i = 0; i < total; i += batchSize) {
        // Check for abort
        if (signal?.aborted) {
            logger.warn('Operation aborted', { processed });
            return Result.fail(
                ERROR_CODES.OPERATION_ABORTED,
                `Operation aborted after processing ${processed} items`
            );
        }

        const batch = progressList.slice(i, i + batchSize);
        const batchResult = [];
        
        for (const item of batch) {
            const validationResult = validateProgressItem(item);
            if (!validationResult.success) {
                errorCount++;
                logger.debug('Invalid item skipped', { item, error: validationResult });
                continue;
            }

            const dueResult = await isItemDueSafe(validationResult.data, timeProvider);
            if (dueResult.success && dueResult.data) {
                batchResult.push(validationResult.data);
            }
        }
        
        result.push(...batchResult);
        processed += batch.length;

        // Progress reporting
        if (onProgress) {
            try {
                onProgress({
                    processed,
                    total,
                    found: result.length,
                    errors: errorCount,
                    percentage: Math.round((processed / total) * 100),
                    batch: Math.floor(i / batchSize) + 1,
                    totalBatches: Math.ceil(total / batchSize)
                });
            } catch (error) {
                logger.error('Progress callback failed', { error });
            }
        }

        // Dynamic yield based on batch size
        if (i % (batchSize * 5) === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
            logger.debug('Yielded to event loop', { processed });
        }
    }

    const now = timeProvider.now();
    const duration = performance.now() - startTime;

    logger.info('Batch processing completed', {
        total,
        processed,
        found: result.length,
        errors: errorCount,
        duration
    });

    return Result.ok({
        items: result,
        count: result.length,
        overdue: result.filter(item => 
            item.nextReviewDate && toTimeSafe(item.nextReviewDate, timeProvider)
        ).length,
        duration: Math.round(duration),
        processedItems: processed,
        totalItems: total,
        errorCount
    });
}

/**
 * ایجاد Query Builder برای فیلترهای پیشرفته
 * @param {TimeProvider} [timeProvider]
 * @returns {DueItemsQuery} نمونه Query Builder
 */
export function createQuery(timeProvider = createTimeProvider()) {
    return new DueItemsQuery(timeProvider);
}

/**
 * @class DueItemsQuery
 * @description Query Builder برای جستجوی پیشرفته آیتم‌های سررسید شده
 */
export class DueItemsQuery {
    /** @type {Array<function(ProgressItem):Promise<boolean>>} */
    #filters = [];
    
    /** @type {Array<function(ProgressItem, ProgressItem):Promise<number>>} */
    #sorts = [];
    
    /** @type {number} */
    #limit = Infinity;
    
    /** @type {TimeProvider} */
    #timeProvider;

    /**
     * @param {TimeProvider} timeProvider
     */
    constructor(timeProvider) {
        this.#timeProvider = timeProvider;
    }

    /**
     * تنظیم تامین‌کننده زمان
     * @param {TimeProvider} timeProvider
     * @returns {DueItemsQuery}
     */
    withTimeProvider(timeProvider) {
        this.#timeProvider = timeProvider;
        return this;
    }

    /**
     * فیلتر آیتم‌های سررسید شده
     * @returns {DueItemsQuery}
     */
    due() {
        this.#filters.push(async (item) => {
            const dueResult = await isItemDueSafe(item, this.#timeProvider);
            return dueResult.success && dueResult.data;
        });
        return this;
    }

    /**
     * فیلتر بر اساس ضریب آسانی
     * @param {number} min - حداقل
     * @param {number} max - حداکثر
     * @returns {DueItemsQuery}
     */
    withEaseFactor(min, max) {
        this.#filters.push(async (item) => {
            const ease = item.easeFactor ?? 2.5;
            return ease >= min && ease <= max;
        });
        return this;
    }

    /**
     * فیلتر بر اساس سطح تسلط
     * @param {number} min - حداقل
     * @param {number} max - حداکثر
     * @returns {DueItemsQuery}
     */
    withMasteryLevel(min, max) {
        this.#filters.push(async (item) => {
            const level = item.masteryLevel ?? 0;
            return level >= min && level <= max;
        });
        return this;
    }

    /**
     * فیلتر بر اساس شناسه درس
     * @param {string[]} lessonIds
     * @returns {DueItemsQuery}
     */
    withLessonIds(lessonIds) {
        const idSet = new Set(lessonIds);
        this.#filters.push(async (item) => idSet.has(item.lessonId));
        return this;
    }

    /**
     * مرتب‌سازی بر اساس اولویت
     * @returns {DueItemsQuery}
     */
    sortByPriority() {
        this.#sorts.push(async (a, b) => {
            const scoreAResult = await calculatePriorityScoreCached(a, this.#timeProvider);
            const scoreBResult = await calculatePriorityScoreCached(b, this.#timeProvider);
            
            if (!scoreAResult.success || !scoreBResult.success) {
                return 0;
            }
            
            return scoreBResult.data - scoreAResult.data;
        });
        return this;
    }

    /**
     * مرتب‌سازی بر اساس تاریخ مرور
     * @param {boolean} ascending - صعودی/نزولی
     * @returns {DueItemsQuery}
     */
    sortByDate(ascending = true) {
        this.#sorts.push(async (a, b) => {
            const timeAResult = a.nextReviewDate 
                ? await toTimeSafe(a.nextReviewDate, this.#timeProvider)
                : Result.ok(0);
            const timeBResult = b.nextReviewDate 
                ? await toTimeSafe(b.nextReviewDate, this.#timeProvider)
                : Result.ok(0);
            
            if (!timeAResult.success || !timeBResult.success) {
                return 0;
            }
            
            return ascending 
                ? timeAResult.data - timeBResult.data
                : timeBResult.data - timeAResult.data;
        });
        return this;
    }

    /**
     * محدود کردن تعداد نتایج
     * @param {number} count
     * @returns {DueItemsQuery}
     */
    limit(count) {
        this.#limit = count;
        return this;
    }

    /**
     * اجرای Query
     * @param {ProgressItem[]} items
     * @returns {Promise<Result>}
     */
    async execute(items) {
        if (!Array.isArray(items)) {
            return Result.fail(ERROR_CODES.INVALID_PROGRESS_LIST, 'Items must be an array');
        }

        const startTime = performance.now();
        let result = [];
        const errors = [];

        // Validate and apply filters
        for (const item of items) {
            const validationResult = validateProgressItem(item);
            if (!validationResult.success) {
                errors.push({ item, error: validationResult });
                continue;
            }

            let include = true;
            for (const filter of this.#filters) {
                try {
                    const filterResult = await filter(validationResult.data);
                    if (!filterResult) {
                        include = false;
                        break;
                    }
                } catch (error) {
                    errors.push({ item, error: error.message });
                    include = false;
                    break;
                }
            }

            if (include) {
                result.push(validationResult.data);
            }
        }

        // Apply sorts (only if needed)
        if (this.#sorts.length > 0 && result.length > 1) {
            const sorted = [...result];
            for (const sort of this.#sorts) {
                try {
                    sorted.sort(sort);
                } catch (error) {
                    errors.push({ error: 'Sort failed', details: error.message });
                }
            }
            result = sorted;
        }

        // Apply limit
        if (result.length > this.#limit) {
            result = result.slice(0, this.#limit);
        }

        const duration = performance.now() - startTime;

        return Result.ok({
            items: result,
            count: result.length,
            errors: errors.length > 0 ? errors : undefined,
            duration: Math.round(duration)
        });
    }
}

// ============== Browser Global Export ==============

if (typeof window !== 'undefined') {
    window.FarsinglishSRS = {
        ...(window.FarsinglishSRS || {}),
        scheduler: {
            // Core functions
            filterDueItems,
            sortByPriority,
            calculatePriorityScore,
            calculatePriorityScoreCached,
            countDueInNextDays,
            processDueItemsInBatches,
            
            // Cache management
            clearSchedulerCache,
            getCacheStats,
            setCacheManager,
            
            // Query builder
            createQuery,
            DueItemsQuery,
            
            // Utilities
            createTimeProvider,
            safeToDate,
            safeToTime,
            
            // Validators
            ProgressItemValidator,
            
            // Constants
            PRIORITY_CONSTANTS,
            ERROR_CODES
        }
    };
}

// ============== Named Exports ==============
export default {
    filterDueItems,
    sortByPriority,
    calculatePriorityScore,
    calculatePriorityScoreCached,
    countDueInNextDays,
    processDueItemsInBatches,
    clearSchedulerCache,
    getCacheStats,
    setCacheManager,
    createQuery,
    DueItemsQuery,
    createTimeProvider,
    safeToDate,
    safeToTime,
    ProgressItemValidator,
    PRIORITY_CONSTANTS,
    ERROR_CODES
};
