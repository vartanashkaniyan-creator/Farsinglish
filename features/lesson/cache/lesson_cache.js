/**
 * LessonCache حرفه‌ای با TTL، مدیریت خطا، حجم محدود و type safety
 * @template T
 */
export class LessonCache {
    /**
     * @param {number} default_ttl - زمان پیش‌فرض زندگی کش (ms)
     * @param {number} max_size - حداکثر تعداد آیتم در کش
     * @param {Console} logger - وابستگی تزریقی برای لاگ
     */
    constructor(default_ttl = 300_000, max_size = 1000, logger = console) {
        /** @private @type {Map<string, {value: T, expiry: number}>} */
        this.store = new Map();
        /** @private @type {number} */
        this.default_ttl = default_ttl;
        /** @private @type {number} */
        this.max_size = max_size;
        /** @private @type {Console} */
        this.logger = logger;

        /** metrics */
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * دریافت یا فراخوانی کش
     * @param {string} key
     * @param {() => Promise<T>} fetcher
     * @param {number} ttl
     * @returns {Promise<T|null>}
     */
    async get_or_fetch(key, fetcher, ttl = this.default_ttl) {
        const cached = this.store.get(key);

        if (cached && cached.expiry > Date.now()) {
            this.hits++;
            return cached.value;
        }

        this.misses++;
        try {
            const value = await fetcher();
            this.set(key, value, ttl);
            return value;
        } catch (error) {
            this.logger.error(`fetcher error for key "${key}":`, error);
            return null; // جلوگیری از کرش
        }
    }

    /**
     * ذخیره مقدار در کش با مدیریت max_size
     * @param {string} key
     * @param {T} value
     * @param {number} ttl
     */
    set(key, value, ttl = this.default_ttl) {
        if (this.store.size >= this.max_size) {
            // حذف قدیمی‌ترین آیتم
            const firstKey = this.store.keys().next().value;
            this.store.delete(firstKey);
        }

        const expiry = Date.now() + ttl;
        this.store.set(key, { value, expiry });
    }

    /**
     * حذف کش خاص
     * @param {string} key
     */
    delete(key) {
        this.store.delete(key);
    }

    /**
     * حذف کش بر اساس الگو (pattern) - invalidate
     * @param {RegExp|string} pattern
     */
    invalidate(pattern) {
        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
        for (const key of this.store.keys()) {
            if (regex.test(key)) this.store.delete(key);
        }
    }

    /**
     * پاکسازی مقادیر منقضی شده
     */
    clean_expired() {
        const now = Date.now();
        for (const [key, { expiry }] of this.store.entries()) {
            if (expiry <= now) this.store.delete(key);
        }
    }

    /**
     * دریافت metrics کش
     */
    get_metrics() {
        return { hits: this.hits, misses: this.misses, size: this.store.size };
    }

    /**
     * پاکسازی کامل کش
     */
    clear() {
        this.store.clear();
        this.hits = 0;
        this.misses = 0;
    }
             }
