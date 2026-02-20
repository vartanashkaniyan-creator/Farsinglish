/**
 * @fileoverview مدیریت اعتبارسنجی و پاکسازی کش با الگوهای پیشرفته
 * @author Farsinglish Team
 * @version 2.0.0
 * 
 * این ماژول مسئولیت مدیریت اعتبارسنجی هوشمند کش را بر عهده دارد
 * و از الگوهای Strategy، Observer، و WeakRef برای حداکثر کارایی استفاده می‌کند.
 */

/**
 * @template T
 * @typedef {Object} CacheEntry
 * @property {T} data - داده ذخیره شده
 * @property {number} timestamp - زمان ایجاد (timestamp)
 * @property {number} ttl - زمان زندگی (میلی‌ثانیه)
 * @property {number} accessCount - تعداد دفعات دسترسی
 * @property {Set<string>} tags - برچسب‌های مرتبط
 * @property {Object} metadata - متادیتای اضافی
 * @property {number} lastAccess - آخرین زمان دسترسی
 * @property {number} size - حجم تقریبی داده
 */

/**
 * @typedef {Object} InvalidationRule
 * @property {string} id - شناسه یکتای قانون
 * @property {RegExp|string} pattern - الگوی کلیدها
 * @property {InvalidationStrategy} strategy - استراتژی اعتبارسنجی
 * @property {number} priority - اولویت (۱-۱۰)
 * @property {boolean} enabled - فعال/غیرفعال
 * @property {Function} [condition] - شرط اضافی
 * @property {number} [ttl] - TTL اختصاصی برای این قانون
 */

/**
 * @typedef {'IMMEDIATE'|'DELAYED'|'LAZY'|'BATCH'} InvalidationStrategy
 */

/**
 * @typedef {Object} InvalidationEvent
 * @property {string} type - نوع رویداد
 * @property {string[]} keys - کلیدهای affected
 * @property {string} reason - دلیل اعتبارسنجی
 * @property {number} timestamp - زمان رویداد
 */

import { EventEmitter } from '../utils/event_emitter.js';
import { Logger } from '../utils/logger.js';
import { Result } from '../utils/result.js';

/**
 * کلاس مدیریت اعتبارسنجی پیشرفته کش
 * @template T
 */
export class CacheInvalidator {
    /** @type {Map<string, CacheEntry<T>>} */
    #cache;

    /** @type {WeakMap<object, CacheEntry<T>>} */
    #weakCache;

    /** @type {Map<string, InvalidationRule>} */
    #rules;

    /** @type {Map<string, ReturnType<typeof setTimeout>>} */
    #scheduledInvalidations;

    /** @type {EventEmitter} */
    #events;

    /** @type {Logger} */
    #logger;

    /** @type {Set<string>} */
    #dirtyKeys;

    /** @type {number} */
    #batchTimeout;

    /** @type {number} */
    #maxBatchSize;

    /** @type {boolean} */
    #isProcessing;

    /** @type {Map<string, number>} */
    #accessPatterns;

    /** @type {number} */
    #failureCount;

    /** @type {boolean} */
    #circuitOpen;

    /** @type {number} */
    #circuitResetTimer;

    /** @type {string} */
    #storageKey;

    /** @type {number} */
    static readonly DEFAULT_BATCH_TIMEOUT = 1000;

    /** @type {number} */
    static readonly DEFAULT_MAX_BATCH_SIZE = 50;

    /** @type {number} */
    static readonly CIRCUIT_THRESHOLD = 5;

    /** @type {number} */
    static readonly CIRCUIT_RESET_TIMEOUT = 30000;

    /**
     * @param {Object} options - گزینه‌های پیکربندی
     * @param {number} [options.batchTimeout=1000] - تأخیر پردازش گروهی
     * @param {number} [options.maxBatchSize=50] - حداکثر اندازه گروه
     * @param {Logger} [options.logger] - لاگر سفارشی
     * @param {string} [options.storageKey='cache-invalidator-rules'] - کلید ذخیره‌سازی
     */
    constructor(options = {}) {
        this.#cache = new Map();
        this.#weakCache = new WeakMap();
        this.#rules = new Map();
        this.#scheduledInvalidations = new Map();
        this.#events = new EventEmitter();
        this.#logger = options.logger || new Logger('CacheInvalidator');
        this.#dirtyKeys = new Set();
        this.#batchTimeout = options.batchTimeout || CacheInvalidator.DEFAULT_BATCH_TIMEOUT;
        this.#maxBatchSize = options.maxBatchSize || CacheInvalidator.DEFAULT_MAX_BATCH_SIZE;
        this.#isProcessing = false;
        this.#accessPatterns = new Map();
        this.#failureCount = 0;
        this.#circuitOpen = false;
        this.#circuitResetTimer = 0;
        this.#storageKey = options.storageKey || 'cache-invalidator-rules';

        this.#initializeDefaultRules();
        this.#loadPersistedRules();
        this.#setupCircuitBreaker();
        
        this.#logger.info('CacheInvalidator initialized', {
            batchTimeout: this.#batchTimeout,
            maxBatchSize: this.#maxBatchSize,
            weakCache: true,
            persistence: true
        });
    }

    // ================ متدهای خصوصی (Rule Management) ================

    /**
     * راه‌اندازی قوانین پیش‌فرض
     * @private
     */
    #initializeDefaultRules() {
        this.addRule({
            id: 'time-based',
            pattern: /.*/,
            strategy: 'LAZY',
            priority: 1,
            enabled: true,
            ttl: 3600000, // ۱ ساعت
            condition: (entry) => Date.now() - entry.timestamp > entry.ttl
        });

        this.addRule({
            id: 'access-based',
            pattern: /.*/,
            strategy: 'LAZY',
            priority: 2,
            enabled: true,
            condition: (entry) => entry.accessCount > 100 && entry.ttl < 3600000
        });

        this.addRule({
            id: 'memory-pressure',
            pattern: /.*/,
            strategy: 'IMMEDIATE',
            priority: 10,
            enabled: true,
            condition: () => performance.memory?.usedJSHeapSize > 100000000 // 100MB
        });
    }

    /**
     * بارگذاری قوانین ذخیره شده
     * @private
     */
    #loadPersistedRules() {
        try {
            const saved = localStorage.getItem(this.#storageKey);
            if (saved) {
                const rules = JSON.parse(saved);
                rules.forEach(rule => {
                    rule.pattern = new RegExp(rule.pattern);
                    this.#rules.set(rule.id, rule);
                });
                this.#logger.info('Rules loaded from storage', { count: rules.length });
            }
        } catch (error) {
            this.#logger.warn('Failed to load persisted rules', { error: error.message });
        }
    }

    /**
     * ذخیره قوانین
     * @private
     */
    #persistRules() {
        try {
            const rules = Array.from(this.#rules.values()).map(rule => ({
                ...rule,
                pattern: rule.pattern.toString()
            }));
            localStorage.setItem(this.#storageKey, JSON.stringify(rules));
            this.#logger.debug('Rules persisted', { count: rules.length });
        } catch (error) {
            this.#logger.warn('Failed to persist rules', { error: error.message });
        }
    }

    /**
     * راه‌اندازی circuit breaker
     * @private
     */
    #setupCircuitBreaker() {
        if (this.#circuitResetTimer) {
            clearTimeout(this.#circuitResetTimer);
        }
        
        if (this.#circuitOpen) {
            this.#circuitResetTimer = setTimeout(() => {
                this.#circuitOpen = false;
                this.#failureCount = 0;
                this.#logger.info('Circuit breaker reset');
            }, CacheInvalidator.CIRCUIT_RESET_TIMEOUT);
        }
    }

    /**
     * ثبت خطا در circuit breaker
     * @private
     */
    #recordFailure() {
        this.#failureCount++;
        if (this.#failureCount >= CacheInvalidator.CIRCUIT_THRESHOLD) {
            this.#circuitOpen = true;
            this.#logger.warn('Circuit breaker opened', { failures: this.#failureCount });
            this.#setupCircuitBreaker();
        }
    }

    /**
     * محاسبه TTL تطبیقی
     * @param {string} key
     * @param {number} baseTTL
     * @returns {number}
     */
    #calculateAdaptiveTTL(key, baseTTL) {
        const accessCount = this.#accessPatterns.get(key) || 0;
        const multiplier = 1 + Math.log2(accessCount + 1) / 10;
        return Math.min(baseTTL * multiplier, baseTTL * 3); // حداکثر ۳ برابر
    }

    /**
     * افزودن قانون اعتبارسنجی جدید
     * @param {InvalidationRule} rule - قانون اعتبارسنجی
     * @returns {Result<InvalidationRule>}
     */
    addRule(rule) {
        try {
            if (!rule.id || !rule.pattern || !rule.strategy) {
                return Result.fail('قانون باید دارای id، pattern و strategy باشد');
            }

            const validatedRule = this.#validateRule(rule);
            this.#rules.set(rule.id, validatedRule);
            this.#persistRules();
            
            this.#events.emit('rule:added', { ruleId: rule.id });
            this.#logger.debug('Rule added', { ruleId: rule.id, strategy: rule.strategy });

            return Result.ok(validatedRule);
        } catch (error) {
            this.#recordFailure();
            return Result.fail(`خطا در افزودن قانون: ${error.message}`);
        }
    }

    /**
     * اعتبارسنجی قانون
     * @param {InvalidationRule} rule
     * @returns {InvalidationRule}
     * @throws {Error}
     */
    #validateRule(rule) {
        if (rule.priority && (rule.priority < 1 || rule.priority > 10)) {
            throw new Error('اولویت باید بین ۱ تا ۱۰ باشد');
        }

        if (rule.pattern instanceof RegExp === false && typeof rule.pattern !== 'string') {
            throw new Error('الگو باید RegExp یا string باشد');
        }

        return {
            ...rule,
            priority: rule.priority || 5,
            enabled: rule.enabled !== false,
            pattern: rule.pattern instanceof RegExp ? rule.pattern : new RegExp(rule.pattern)
        };
    }

    /**
     * حذف قانون
     * @param {string} ruleId - شناسه قانون
     * @returns {Result<boolean>}
     */
    removeRule(ruleId) {
        const removed = this.#rules.delete(ruleId);
        if (removed) {
            this.#persistRules();
            this.#events.emit('rule:removed', { ruleId });
            this.#logger.debug('Rule removed', { ruleId });
            return Result.ok(true);
        }
        return Result.fail(`قانون با شناسه ${ruleId} یافت نشد`);
    }

    /**
     * ثبت یک آیتم در کش
     * @param {string} key - کلید
     * @param {T} data - داده
     * @param {Object} options - گزینه‌ها
     * @param {number} [options.ttl=3600000] - زمان زندگی (پیش‌فرض: ۱ ساعت)
     * @param {string[]} [options.tags] - برچسب‌ها
     * @param {boolean} [options.useWeakRef=false] - استفاده از WeakRef
     */
    set(key, data, options = {}) {
        if (this.#circuitOpen) {
            this.#logger.warn('Circuit open, skipping cache set', { key });
            return;
        }

        const baseTTL = options.ttl || 3600000;
        const adaptiveTTL = this.#calculateAdaptiveTTL(key, baseTTL);
        
        const entry = {
            data,
            timestamp: Date.now(),
            ttl: adaptiveTTL,
            accessCount: 0,
            tags: new Set(options.tags || []),
            metadata: {},
            lastAccess: Date.now(),
            size: this.#estimateSize(data)
        };

        if (options.useWeakRef && typeof WeakRef !== 'undefined') {
            this.#weakCache.set({}, entry);
        } else {
            this.#cache.set(key, entry);
        }

        this.#dirtyKeys.add(key);
        
        this.#logger.debug('Cache entry set', { 
            key, 
            ttl: entry.ttl, 
            adaptive: adaptiveTTL !== baseTTL,
            tags: options.tags 
        });
        
        this.#events.emit('entry:set', { key, tags: options.tags });

        // اعتبارسنجی برنامه‌ریزی شده
        this.#scheduleValidation(key, entry);
    }

    /**
     * تخمین حجم داده
     * @param {*} data
     * @returns {number}
     */
    #estimateSize(data) {
        try {
            return new Blob([JSON.stringify(data)]).size;
        } catch {
            return 0;
        }
    }

    /**
     * دریافت یک آیتم از کش
     * @param {string} key - کلید
     * @returns {T|null}
     */
    get(key) {
        if (this.#circuitOpen) {
            return null;
        }

        let entry = this.#cache.get(key);
        
        if (!entry) {
            // بررسی WeakCache
            for (const [_, weakEntry] of this.#weakCache) {
                if (weakEntry.data?.id === key) {
                    entry = weakEntry;
                    break;
                }
            }
        }

        if (!entry) return null;

        // اعتبارسنجی lazy
        if (this.#shouldInvalidateLazy(key, entry)) {
            this.#cache.delete(key);
            this.#logger.debug('Entry invalidated lazily', { key });
            return null;
        }

        entry.accessCount++;
        entry.lastAccess = Date.now();
        this.#accessPatterns.set(key, (this.#accessPatterns.get(key) || 0) + 1);

        return entry.data;
    }

    /**
     * بررسی نیاز به اعتبارسنجی lazy
     * @param {string} key
     * @param {CacheEntry} entry
     * @returns {boolean}
     */
    #shouldInvalidateLazy(key, entry) {
        const sortedRules = Array.from(this.#rules.values())
            .filter(r => r.enabled && r.strategy === 'LAZY')
            .sort((a, b) => b.priority - a.priority);

        for (const rule of sortedRules) {
            if (!rule.pattern.test(key)) continue;

            if (rule.condition && rule.condition(entry)) {
                return true;
            }

            if (rule.ttl && Date.now() - entry.timestamp > rule.ttl) {
                return true;
            }
        }
        return false;
    }

    /**
     * برنامه‌ریزی اعتبارسنجی
     * @param {string} key
     * @param {CacheEntry} entry
     */
    #scheduleValidation(key, entry) {
        if (entry.ttl === Infinity) return;

        const timeout = setTimeout(() => {
            this.#validateNow(key);
        }, entry.ttl);

        this.#scheduledInvalidations.set(key, timeout);
    }

    /**
     * اعتبارسنجی فوری یک کلید
     * @param {string} key
     */
    #validateNow(key) {
        const entry = this.#cache.get(key);
        if (!entry) return;

        if (Date.now() - entry.timestamp > entry.ttl) {
            this.#cache.delete(key);
            this.#events.emit('entry:expired', { key });
            this.#logger.debug('Entry expired', { key });
        }

        this.#scheduledInvalidations.delete(key);
    }

    /**
     * اعتبارسنجی گروهی
     * @param {string[]} keys
     * @param {InvalidationStrategy} strategy
     */
    invalidateBatch(keys, strategy = 'IMMEDIATE') {
        if (this.#circuitOpen) {
            return Result.fail('Circuit is open');
        }

        switch (strategy) {
            case 'IMMEDIATE':
                return this.#invalidateImmediate(keys);
            case 'DELAYED':
                return this.#invalidateDelayed(keys);
            case 'BATCH':
                return this.#addToBatch(keys);
            default:
                return Result.fail(`استراتژی ${strategy} پشتیبانی نمی‌شود`);
        }
    }

    /**
     * اعتبارسنجی فوری
     * @param {string[]} keys
     * @returns {Result<InvalidationEvent>}
     */
    #invalidateImmediate(keys) {
        try {
            const invalidated = [];

            for (const key of keys) {
                if (this.#cache.delete(key)) {
                    invalidated.push(key);
                    this.#cancelScheduled(key);
                }
            }

            const event = {
                type: 'IMMEDIATE',
                keys: invalidated,
                reason: 'manual_invalidation',
                timestamp: Date.now()
            };

            this.#events.emit('batch:invalidated', event);
            this.#logger.info('Batch invalidated', { count: invalidated.length, strategy: 'IMMEDIATE' });

            return Result.ok(event);
        } catch (error) {
            this.#recordFailure();
            return Result.fail(error.message);
        }
    }

    /**
     * اعتبارسنجی با تأخیر
     * @param {string[]} keys
     * @returns {Result<InvalidationEvent>}
     */
    #invalidateDelayed(keys) {
        try {
            const timeout = setTimeout(() => {
                const result = this.#invalidateImmediate(keys);
                if (result.success) {
                    this.#logger.debug('Delayed invalidation completed', { keyCount: keys.length });
                }
            }, 5000);

            keys.forEach(key => {
                this.#scheduledInvalidations.set(`delayed-${key}`, timeout);
            });

            return Result.ok({
                type: 'DELAYED',
                keys,
                reason: 'delayed_invalidation',
                timestamp: Date.now()
            });
        } catch (error) {
            this.#recordFailure();
            return Result.fail(error.message);
        }
    }

    /**
     * افزودن به صف گروهی
     * @param {string[]} keys
     * @returns {Result<InvalidationEvent>}
     */
    #addToBatch(keys) {
        keys.forEach(key => this.#dirtyKeys.add(key));

        if (this.#dirtyKeys.size >= this.#maxBatchSize && !this.#isProcessing) {
            this.#processBatch();
        } else if (!this.#isProcessing) {
            setTimeout(() => this.#processBatch(), this.#batchTimeout);
        }

        return Result.ok({
            type: 'BATCH',
            keys,
            reason: 'queued_for_batch',
            timestamp: Date.now()
        });
    }

    /**
     * پردازش صف گروهی
     * @returns {Promise<Result<InvalidationEvent>>}
     */
    async #processBatch() {
        if (this.#isProcessing || this.#dirtyKeys.size === 0) {
            return Result.ok({ type: 'BATCH', keys: [], reason: 'no_keys', timestamp: Date.now() });
        }

        this.#isProcessing = true;
        const keysToProcess = Array.from(this.#dirtyKeys);
        this.#dirtyKeys.clear();

        try {
            const result = this.#invalidateImmediate(keysToProcess);
            this.#logger.info('Batch processed', { count: keysToProcess.length });
            return result;
        } catch (error) {
            this.#recordFailure();
            return Result.fail(error.message);
        } finally {
            this.#isProcessing = false;
        }
    }

    /**
     * اعتبارسنجی بر اساس برچسب
     * @param {string} tag - برچسب
     * @returns {Result<string[]>}
     */
    invalidateByTag(tag) {
        try {
            const invalidated = [];

            for (const [key, entry] of this.#cache.entries()) {
                if (entry.tags.has(tag)) {
                    this.#cache.delete(key);
                    this.#cancelScheduled(key);
                    invalidated.push(key);
                }
            }

            this.#events.emit('tag:invalidated', { tag, count: invalidated.length });
            this.#logger.debug('Tag invalidated', { tag, count: invalidated.length });

            return Result.ok(invalidated);
        } catch (error) {
            this.#recordFailure();
            return Result.fail(error.message);
        }
    }

    /**
     * اعتبارسنجی بر اساس الگو
     * @param {RegExp|string} pattern - الگوی کلیدها
     * @returns {Result<string[]>}
     */
    invalidateByPattern(pattern) {
        try {
            const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
            const invalidated = [];

            for (const key of this.#cache.keys()) {
                if (regex.test(key)) {
                    this.#cache.delete(key);
                    this.#cancelScheduled(key);
                    invalidated.push(key);
                }
            }

            this.#events.emit('pattern:invalidated', { 
                pattern: pattern.toString(), 
                count: invalidated.length 
            });
            
            this.#logger.debug('Pattern invalidated', { 
                pattern: pattern.toString(), 
                count: invalidated.length 
            });

            return Result.ok(invalidated);
        } catch (error) {
            this.#recordFailure();
            return Result.fail(error.message);
        }
    }

    /**
     * لغو اعتبارسنجی برنامه‌ریزی شده
     * @param {string} key
     */
    #cancelScheduled(key) {
        const timeout = this.#scheduledInvalidations.get(key);
        if (timeout) {
            clearTimeout(timeout);
            this.#scheduledInvalidations.delete(key);
        }
    }

    /**
     * لغو همه اعتبارسنجی‌های برنامه‌ریزی شده
     */
    cancelAllScheduled() {
        this.#scheduledInvalidations.forEach(timeout => clearTimeout(timeout));
        this.#scheduledInvalidations.clear();
        this.#logger.info('All scheduled invalidations cancelled');
    }

    /**
     * دریافت آمار کش
     * @returns {Result<Object>}
     */
    getStats() {
        const stats = {
            totalEntries: this.#cache.size,
            weakEntries: 'unknown', // WeakMap size not accessible
            totalRules: this.#rules.size,
            scheduledInvalidations: this.#scheduledInvalidations.size,
            dirtyKeys: this.#dirtyKeys.size,
            isProcessing: this.#isProcessing,
            circuitBreaker: {
                open: this.#circuitOpen,
                failures: this.#failureCount
            },
            accessPatterns: {
                mostAccessed: Array.from(this.#accessPatterns.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([key, count]) => ({ key, count }))
            },
            rules: Array.from(this.#rules.values()).map(r => ({
                id: r.id,
                strategy: r.strategy,
                enabled: r.enabled,
                priority: r.priority,
                hasTTL: !!r.ttl
            }))
        };

        return Result.ok(stats);
    }

    /**
     * پاکسازی کامل کش
     * @returns {Result<number>}
     */
    clear() {
        const size = this.#cache.size;
        this.#cache.clear();
        this.#weakCache = new WeakMap(); // Reset WeakMap
        this.cancelAllScheduled();
        this.#dirtyKeys.clear();
        this.#accessPatterns.clear();
        this.#failureCount = 0;
        this.#circuitOpen = false;

        this.#events.emit('cache:cleared', { size });
        this.#logger.info('Cache cleared', { entriesRemoved: size });

        return Result.ok(size);
    }

    /**
     * پاکسازی منابع
     */
    dispose() {
        this.clear();
        this.#rules.clear();
        this.#events.removeAllListeners();
        
        if (this.#circuitResetTimer) {
            clearTimeout(this.#circuitResetTimer);
        }
        
        this.#logger.info('CacheInvalidator disposed');
    }

    /**
     * رویدادها
     */
    on(event, handler) {
        this.#events.on(event, handler);
    }

    off(event, handler) {
        this.#events.off(event, handler);
    }
}

/**
 * تابع کمکی برای ایجاد نمونه با تنظیمات پیش‌فرض
 * @param {Object} options
 * @returns {CacheInvalidator}
 */
export const createCacheInvalidator = (options = {}) => {
    return new CacheInvalidator(options);
};

export default CacheInvalidator;
