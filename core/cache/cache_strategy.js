/**
 * @fileoverview استراتژی‌های پیشرفته کش‌ینگ با پشتیبانی از TTL، حداکثر سایز و الگوهای مختلف
 * @author Farsinglish Team
 * @version 2.1.0
 */

/**
 * @template T
 * @typedef {Object} CacheEntry
 * @property {T} data - داده ذخیره شده
 * @property {number} timestamp - زمان ذخیره‌سازی (timestamp)
 * @property {number} expiresAt - زمان انقضا
 * @property {number} accessCount - تعداد دفعات دسترسی (برای LFU)
 * @property {number} lastAccessed - آخرین زمان دسترسی (برای LRU)
 * @property {string[]} [tags] - برچسب‌ها برای گروه‌بندی
 * @property {number} [priority] - اولویت (1=بالا, 2=متوسط, 3=پایین)
 * @property {number} [size] - حجم تقریبی داده
 */

/**
 * @typedef {Object} CacheStats
 * @property {number} hits - تعداد hits
 * @property {number} misses - تعداد misses
 * @property {number} size - تعداد آیتم‌های فعلی
 * @property {number} memoryUsage - حجم تقریبی حافظه
 * @property {number} hitRate - نرخ موفقیت
 * @property {Object} timeBased - آمار زمانی
 * @property {number} timeBased.lastHour - hits در ساعت اخیر
 * @property {number} timeBased.lastDay - hits در روز اخیر
 * @property {number} timeBased.lastWeek - hits در هفته اخیر
 */

/**
 * @typedef {Object} CacheOptions
 * @property {number} [ttl=3600000] - زمان انقضا پیش‌فرض (میلی‌ثانیه)
 * @property {number} [maxSize=1000] - حداکثر تعداد آیتم‌ها
 * @property {string} [strategy='lru'] - استراتژی حذف (lru/lfu/fifo)
 * @property {boolean} [enableStats=true] - فعال‌سازی آمار
 * @property {Function} [serializer] - تابع سریالایز سفارشی
 * @property {Function} [deserializer] - تابع دی‌سریالایز سفارشی
 * @property {Object} [events] - Event emitter برای رویدادها
 * @property {boolean} [enableWarming=false] - فعال‌سازی cache warming
 * @property {number} [warmingInterval=3600000] - فاصله زمانی warming
 */

/**
 * @enum {string}
 */
export const EvictionStrategy = {
    LRU: 'lru', // Least Recently Used
    LFU: 'lfu', // Least Frequently Used
    FIFO: 'fifo' // First In First Out
};

/**
 * @enum {number}
 */
export const PriorityLevel = {
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3
};

/**
 * کلاس اصلی استراتژی کش با پشتیبانی از الگوریتم‌های مختلف حذف
 * @template T
 */
export class CacheStrategy {
    /** @type {Map<string, CacheEntry<T>>} */
    #cache = new Map();

    /** @type {CacheOptions} */
    #options;

    /** @type {CacheStats} */
    #stats = {
        hits: 0,
        misses: 0,
        size: 0,
        memoryUsage: 0,
        hitRate: 0,
        timeBased: {
            lastHour: 0,
            lastDay: 0,
            lastWeek: 0
        }
    };

    /** @type {Map<string, number>} */
    #frequencyMap = new Map(); // برای LFU

    /** @type {string[]} */
    #accessOrder = []; // برای LRU و FIFO

    /** @type {number} */
    #lastCleanup = Date.now();

    /** @type {number} */
    #cleanupInterval = 60000; // 1 دقیقه

    /** @type {Map<string, number>} */
    #timeBasedHits = new Map(); // برای آمار زمانی

    /** @type {Set<string>} */
    #warmingKeys = new Set(); // کلیدهای برای warming

    /** @type {Map<string, Function>} */
    #subscribers = new Map(); // مشترکین رویدادها

    /** @type {number|null} */
    #warmingTimer = null;

    /**
     * @param {CacheOptions} options
     * @throws {Error} در صورت نامعتبر بودن options
     */
    constructor(options = {}) {
        this.#validateOptions(options);
        
        this.#options = {
            ttl: options.ttl ?? 3600000,
            maxSize: options.maxSize ?? 1000,
            strategy: options.strategy ?? EvictionStrategy.LRU,
            enableStats: options.enableStats ?? true,
            serializer: options.serializer ?? JSON.stringify,
            deserializer: options.deserializer ?? JSON.parse,
            events: options.events,
            enableWarming: options.enableWarming ?? false,
            warmingInterval: options.warmingInterval ?? 3600000
        };

        this.#registerWithGlobalManager();
        
        if (this.#options.enableWarming) {
            this.#startWarming();
        }
    }

    /**
     * اعتبارسنجی تنظیمات
     * @param {CacheOptions} options
     * @throws {Error}
     */
    #validateOptions(options) {
        if (options.ttl !== undefined && (typeof options.ttl !== 'number' || options.ttl < 0)) {
            throw new Error('TTL باید عدد مثبت باشد');
        }
        if (options.maxSize !== undefined && (typeof options.maxSize !== 'number' || options.maxSize < 1)) {
            throw new Error('maxSize باید عدد بزرگتر از ۰ باشد');
        }
        if (options.strategy && !Object.values(EvictionStrategy).includes(options.strategy)) {
            throw new Error('استراتژی نامعتبر است');
        }
    }

    /**
     * ثبت در کش‌منیجر سراسری
     */
    #registerWithGlobalManager() {
        if (globalThis.__cacheManager) {
            globalThis.__cacheManager.register(this);
        }
    }

    // ================ متدهای اصلی ================

    /**
     * ذخیره یک آیتم در کش
     * @param {string} key - کلید یکتا
     * @param {T} value - مقدار
     * @param {Partial<CacheEntry>} [metadata] - متادیتای اضافی
     * @returns {Promise<boolean>} - موفقیت عملیات
     */
    async set(key, value, metadata = {}) {
        if (!key || typeof key !== 'string') {
            throw new Error('کلید باید رشته غیر خالی باشد');
        }

        try {
            await this.#ensureCapacity();

            const now = Date.now();
            const ttl = metadata.ttl ?? this.#options.ttl;
            
            // محاسبه حجم
            const serialized = this.#options.serializer(value);
            const size = serialized.length;

            /** @type {CacheEntry<T>} */
            const entry = {
                data: value,
                timestamp: now,
                expiresAt: ttl === Infinity ? Infinity : now + ttl,
                accessCount: 0,
                lastAccessed: now,
                tags: metadata.tags || [],
                priority: metadata.priority ?? PriorityLevel.MEDIUM,
                size,
                ...metadata
            };

            // حذف حجم قبلی اگر کلید وجود داشت
            const oldEntry = this.#cache.get(key);
            if (oldEntry?.size) {
                this.#stats.memoryUsage -= oldEntry.size;
            }

            this.#stats.memoryUsage += size;
            this.#cache.set(key, entry);
            this.#updateAccessPatterns(key);
            this.#stats.size = this.#cache.size;

            // اضافه به warming set اگر priority بالا است
            if (entry.priority === PriorityLevel.HIGH) {
                this.#warmingKeys.add(key);
            }

            this.#scheduleCleanup();
            this.#emitEvent('set', { key, size: this.#cache.size });
            this.#logOperation('set', { key, size: this.#cache.size });

            return true;
        } catch (error) {
            this.#emitEvent('error', { operation: 'set', key, error: error.message });
            this.#logOperation('set_error', { key, error: error.message });
            return false;
        }
    }

    /**
     * ذخیره چند آیتم همزمان
     * @param {Array<[string, T, Partial<CacheEntry>?]>} entries
     * @returns {Promise<boolean>}
     */
    async setMany(entries) {
        const results = await Promise.allSettled(
            entries.map(([key, value, metadata]) => 
                this.set(key, value, metadata)
            )
        );
        
        const success = results.every(r => r.status === 'fulfilled' && r.value === true);
        this.#emitEvent('set_many', { count: entries.length, success });
        
        return success;
    }

    /**
     * دریافت یک آیتم از کش
     * @param {string} key - کلید
     * @returns {Promise<T|null>} - مقدار یا null
     */
    async get(key) {
        try {
            const entry = this.#cache.get(key);

            if (!entry || this.#isExpired(entry)) {
                if (entry) {
                    await this.delete(key);
                }
                this.#updateStats(false);
                this.#emitEvent('miss', { key });
                return null;
            }

            entry.accessCount++;
            entry.lastAccessed = Date.now();
            this.#updateAccessPatterns(key);
            
            this.#updateStats(true);
            this.#recordTimeBasedHit();
            this.#emitEvent('hit', { key });
            this.#logOperation('get_hit', { key });

            return entry.data;
        } catch (error) {
            this.#emitEvent('error', { operation: 'get', key, error: error.message });
            this.#logOperation('get_error', { key, error: error.message });
            return null;
        }
    }

    /**
     * دریافت با متادیتا
     * @param {string} key
     * @returns {Promise<{data: T, metadata: Partial<CacheEntry>}|null>}
     */
    async getWithMetadata(key) {
        const entry = this.#cache.get(key);
        
        if (!entry || this.#isExpired(entry)) {
            return null;
        }

        return {
            data: entry.data,
            metadata: {
                createdAt: entry.timestamp,
                expiresAt: entry.expiresAt,
                accessCount: entry.accessCount,
                lastAccessed: entry.lastAccessed,
                tags: entry.tags,
                priority: entry.priority
            }
        };
    }

    /**
     * دریافت چند آیتم همزمان
     * @param {string[]} keys - آرایه کلیدها
     * @returns {Promise<Map<string, T|null>>}
     */
    async getMany(keys) {
        const results = new Map();
        await Promise.all(keys.map(async key => {
            const value = await this.get(key);
            results.set(key, value);
        }));
        return results;
    }

    /**
     * دریافت با متد سفارشی در صورت عدم وجود
     * @param {string} key - کلید
     * @param {Function} fetcher - تابع دریافت کننده
     * @param {Partial<CacheEntry>} [metadata] - متادیتا
     * @returns {Promise<T>}
     */
    async getOrFetch(key, fetcher, metadata = {}) {
        const cached = await this.get(key);
        if (cached !== null) return cached;

        try {
            const value = await fetcher();
            await this.set(key, value, metadata);
            this.#emitEvent('fetch', { key });
            return value;
        } catch (error) {
            this.#emitEvent('fetch_error', { key, error: error.message });
            throw new Error(`خطا در دریافت داده: ${error.message}`);
        }
    }

    /**
     * به‌روزرسانی جزئی یک آیتم
     * @param {string} key
     * @param {Function} updater
     * @returns {Promise<boolean>}
     */
    async update(key, updater) {
        const entry = this.#cache.get(key);
        if (!entry) return false;
        
        try {
            entry.data = await updater(entry.data);
            entry.lastAccessed = Date.now();
            
            await this.set(key, entry.data, {
                tags: entry.tags,
                priority: entry.priority
            });
            
            this.#emitEvent('update', { key });
            return true;
        } catch (error) {
            this.#emitEvent('error', { operation: 'update', key, error: error.message });
            return false;
        }
    }

    /**
     * حذف یک آیتم
     * @param {string} key - کلید
     * @returns {Promise<boolean>}
     */
    async delete(key) {
        const entry = this.#cache.get(key);
        if (entry) {
            if (entry.size) {
                this.#stats.memoryUsage -= entry.size;
            }
            
            this.#cache.delete(key);
            this.#removeFromAccessPatterns(key);
            this.#warmingKeys.delete(key);
            this.#stats.size = this.#cache.size;
            
            this.#emitEvent('delete', { key });
            this.#logOperation('delete', { key });
            return true;
        }
        return false;
    }

    /**
     * حذف بر اساس برچسب
     * @param {string} tag - برچسب
     * @returns {Promise<number>} - تعداد آیتم‌های حذف شده
     */
    async deleteByTag(tag) {
        let count = 0;
        for (const [key, entry] of this.#cache.entries()) {
            if (entry.tags?.includes(tag)) {
                await this.delete(key);
                count++;
            }
        }
        this.#emitEvent('delete_by_tag', { tag, count });
        this.#logOperation('delete_by_tag', { tag, count });
        return count;
    }

    /**
     * پاکسازی کامل کش
     * @returns {Promise<void>}
     */
    async clear() {
        this.#cache.clear();
        this.#accessOrder = [];
        this.#frequencyMap.clear();
        this.#warmingKeys.clear();
        this.#timeBasedHits.clear();
        this.#stats = {
            hits: 0,
            misses: 0,
            size: 0,
            memoryUsage: 0,
            hitRate: 0,
            timeBased: {
                lastHour: 0,
                lastDay: 0,
                lastWeek: 0
            }
        };
        
        this.#emitEvent('clear');
        this.#logOperation('clear');
    }

    // ================ متدهای مدیریت ظرفیت ================

    /**
     * اطمینان از ظرفیت کافی
     * @returns {Promise<void>}
     */
    async #ensureCapacity() {
        if (this.#cache.size < this.#options.maxSize) return;

        const shouldEvict = await this.#selectVictim();
        if (shouldEvict) {
            await this.#evictOne();
        }
    }

    /**
     * انتخاب قربانی بر اساس استراتژی و اولویت
     * @returns {Promise<string|null>}
     */
    async #selectVictim() {
        if (this.#cache.size === 0) return null;

        // گروه‌بندی بر اساس اولویت
        const entries = Array.from(this.#cache.entries());
        const lowPriority = entries.filter(([_, e]) => e.priority === PriorityLevel.LOW);
        const mediumPriority = entries.filter(([_, e]) => e.priority === PriorityLevel.MEDIUM);
        
        // اولویت حذف: LOW > MEDIUM > HIGH
        const candidates = lowPriority.length > 0 ? lowPriority :
                          mediumPriority.length > 0 ? mediumPriority : entries;

        switch (this.#options.strategy) {
            case EvictionStrategy.LRU:
                // پیدا کردن قدیمی‌ترین دسترسی در بین کاندیداها
                return candidates.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)[0][0];
                
            case EvictionStrategy.LFU:
                // پیدا کردن کمترین دسترسی در بین کاندیداها
                return candidates.sort((a, b) => a[1].accessCount - b[1].accessCount)[0][0];
                
            case EvictionStrategy.FIFO:
                // پیدا کردن قدیمی‌ترین ورودی در بین کاندیداها
                return candidates.sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
                
            default:
                return candidates[0][0];
        }
    }

    /**
     * حذف یک آیتم
     * @returns {Promise<boolean>}
     */
    async #evictOne() {
        const victim = await this.#selectVictim();
        if (victim) {
            await this.delete(victim);
            this.#emitEvent('eviction', { key: victim, strategy: this.#options.strategy });
            this.#logOperation('eviction', { key: victim, strategy: this.#options.strategy });
            return true;
        }
        return false;
    }

    /**
     * پاکسازی آیتم‌های منقضی
     * @returns {Promise<number>} - تعداد آیتم‌های حذف شده
     */
    async #cleanupExpired() {
        const now = Date.now();
        let expiredCount = 0;

        for (const [key, entry] of this.#cache.entries()) {
            if (this.#isExpired(entry)) {
                await this.delete(key);
                expiredCount++;
            }
        }

        if (expiredCount > 0) {
            this.#emitEvent('cleanup_expired', { count: expiredCount });
            this.#logOperation('cleanup_expired', { count: expiredCount });
        }

        return expiredCount;
    }

    /**
     * بررسی انقضای یک آیتم
     * @param {CacheEntry} entry
     * @returns {boolean}
     */
    #isExpired(entry) {
        return entry.expiresAt !== Infinity && Date.now() > entry.expiresAt;
    }

    // ================ Cache Warming ================

    /**
     * شروع فرآیند warming
     */
    #startWarming() {
        if (this.#warmingTimer) {
            clearInterval(this.#warmingTimer);
        }

        this.#warmingTimer = setInterval(() => {
            this.#warmCache();
        }, this.#options.warmingInterval);
    }

    /**
     * گرم کردن کش
     */
    async #warmCache() {
        const keysToWarm = Array.from(this.#warmingKeys);
        
        for (const key of keysToWarm) {
            const entry = this.#cache.get(key);
            if (entry && !this.#isExpired(entry)) {
                // تمدید زمان انقضا
                entry.expiresAt = Date.now() + this.#options.ttl;
                this.#emitEvent('warmed', { key });
            }
        }
        
        this.#logOperation('cache_warmed', { count: keysToWarm.length });
    }

    // ================ Subscription System ================

    /**
     * اشتراک در رویدادهای کش
     * @param {string} event
     * @param {Function} callback
     * @returns {Function} تابع لغو اشتراک
     */
    subscribe(event, callback) {
        if (!this.#subscribers.has(event)) {
            this.#subscribers.set(event, new Set());
        }
        
        this.#subscribers.get(event).add(callback);
        
        return () => {
            this.#subscribers.get(event)?.delete(callback);
        };
    }

    /**
     * انتشار رویداد
     * @param {string} event
     * @param {*} data
     */
    #emitEvent(event, data) {
        // انتشار به subscribers داخلی
        const subscribers = this.#subscribers.get(event);
        if (subscribers) {
            subscribers.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    this.#logOperation('event_error', { event, error: error.message });
                }
            });
        }

        // انتشار به event emitter خارجی
        if (this.#options.events) {
            this.#options.events.emit(`cache:${event}`, data);
        }
    }

    // ================ متدهای به‌روزرسانی الگوها ================

    /**
     * به‌روزرسانی الگوهای دسترسی
     * @param {string} key
     */
    #updateAccessPatterns(key) {
        this.#removeFromAccessPatterns(key);
        this.#accessOrder.push(key);
        
        const freq = this.#frequencyMap.get(key) || 0;
        this.#frequencyMap.set(key, freq + 1);
    }

    /**
     * حذف از الگوهای دسترسی
     * @param {string} key
     */
    #removeFromAccessPatterns(key) {
        const index = this.#accessOrder.indexOf(key);
        if (index > -1) {
            this.#accessOrder.splice(index, 1);
        }
        this.#frequencyMap.delete(key);
    }

    // ================ متدهای آمار ================

    /**
     * ثبت hit زمانی
     */
    #recordTimeBasedHit() {
        const now = Date.now();
        const hour = Math.floor(now / 3600000);
        const day = Math.floor(now / 86400000);
        const week = Math.floor(now / 604800000);

        this.#timeBasedHits.set(`hour:${hour}`, (this.#timeBasedHits.get(`hour:${hour}`) || 0) + 1);
        this.#timeBasedHits.set(`day:${day}`, (this.#timeBasedHits.get(`day:${day}`) || 0) + 1);
        this.#timeBasedHits.set(`week:${week}`, (this.#timeBasedHits.get(`week:${week}`) || 0) + 1);

        // به‌روزرسانی آمار زمانی
        const nowHour = Math.floor(now / 3600000);
        const nowDay = Math.floor(now / 86400000);
        const nowWeek = Math.floor(now / 604800000);

        this.#stats.timeBased.lastHour = this.#timeBasedHits.get(`hour:${nowHour}`) || 0;
        this.#stats.timeBased.lastDay = this.#timeBasedHits.get(`day:${nowDay}`) || 0;
        this.#stats.timeBased.lastWeek = this.#timeBasedHits.get(`week:${nowWeek}`) || 0;
    }

    /**
     * به‌روزرسانی آمار
     * @param {boolean} hit
     */
    #updateStats(hit) {
        if (!this.#options.enableStats) return;

        if (hit) {
            this.#stats.hits++;
        } else {
            this.#stats.misses++;
        }

        const total = this.#stats.hits + this.#stats.misses;
        this.#stats.hitRate = total > 0 ? this.#stats.hits / total : 0;
    }

    /**
     * دریافت آمار
     * @returns {CacheStats}
     */
    getStats() {
        return { ...this.#stats };
    }

    /**
     * ریست آمار
     */
    resetStats() {
        this.#stats = {
            hits: 0,
            misses: 0,
            size: this.#cache.size,
            memoryUsage: this.#stats.memoryUsage,
            hitRate: 0,
            timeBased: {
                lastHour: 0,
                lastDay: 0,
                lastWeek: 0
            }
        };
        this.#timeBasedHits.clear();
    }

    // ================ متدهای پشتیبانی ================

    /**
     * برنامه‌ریزی پاکسازی دوره‌ای
     */
    #scheduleCleanup() {
        const now = Date.now();
        if (now - this.#lastCleanup > this.#cleanupInterval) {
            setTimeout(() => this.#cleanupExpired(), 0);
            this.#lastCleanup = now;
        }
    }

    /**
     * لاگ عملیات
     * @param {string} operation
     * @param {Object} data
     */
    #logOperation(operation, data = {}) {
        if (process.env.NODE_ENV === 'development') {
            console.debug(`[CacheStrategy] ${operation}:`, data);
        }
    }

    /**
     * بررسی وجود کلید
     * @param {string} key
     * @returns {Promise<boolean>}
     */
    async has(key) {
        const entry = this.#cache.get(key);
        return entry !== undefined && !this.#isExpired(entry);
    }

    /**
     * دریافت تمام کلیدها
     * @returns {string[]}
     */
    keys() {
        return Array.from(this.#cache.keys());
    }

    /**
     * دریافت تعداد آیتم‌ها
     * @returns {number}
     */
    size() {
        return this.#cache.size;
    }

    /**
     * ایجاد یک کش جدید با تنظیمات مشابه
     * @returns {CacheStrategy<T>}
     */
    clone() {
        return new CacheStrategy(this.#options);
    }

    /**
     * پاکسازی منابع
     */
    dispose() {
        if (this.#warmingTimer) {
            clearInterval(this.#warmingTimer);
        }
        
        this.#cache.clear();
        this.#accessOrder = [];
        this.#frequencyMap.clear();
        this.#warmingKeys.clear();
        this.#timeBasedHits.clear();
        this.#subscribers.clear();
        
        if (globalThis.__cacheManager) {
            globalThis.__cacheManager.unregister(this);
        }
        
        this.#emitEvent('dispose');
        this.#logOperation('dispose');
    }
}

/**
 * تابع کمکی برای ایجاد کش با تنظیمات پیش‌فرض
 * @template T
 * @param {CacheOptions} options
 * @returns {CacheStrategy<T>}
 */
export const createCache = (options = {}) => {
    return new CacheStrategy(options);
};

/**
 * دکوراتور برای کش کردن خودکار متدها
 * @param {CacheOptions} options
 * @returns {Function}
 */
export function Cached(options = {}) {
    const cache = new CacheStrategy(options);
    
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = async function(...args) {
            const key = `${propertyKey}:${JSON.stringify(args)}`;
            return cache.getOrFetch(key, () => originalMethod.apply(this, args));
        };
        
        return descriptor;
    };
}

/**
 * تابع کمکی برای پاکسازی حافظه
 */
export const clearAllCaches = () => {
    if (globalThis.__cacheManager) {
        globalThis.__cacheManager.clearAll();
    }
};
