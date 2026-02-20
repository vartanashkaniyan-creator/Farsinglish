/**
 * core/db/indexeddb_wrapper.js
 * 
 * پیاده‌سازی نهایی و پیشرفته مدیریت اتصال IndexedDB
 * با رعایت کامل اصول SOLID و معماری لایه‌ای
 * 
 * اصول رعایت شده:
 * - Singleton Pattern (تک‌نمونه)
 * - Dependency Inversion (وابستگی به انتزاع)
 * - Single Responsibility (تک‌وظیفگی)
 * - Interface Segregation (جداسازی اینترفیس)
 * - Open/Closed (قابل توسعه بدون تغییر)
 * - KISS & DRY (سادگی و عدم تکرار)
 * - JavaScript + JSDoc (مستندسازی کامل)
 * - snake_case در نام‌گذاری فایل
 * - Enterprise-ready با Metrics، Validation و Health Check
 */

// ================================================
// ثابت‌های پیکربندی (ایزوله کردن Magic Numbers)
// ================================================

/** @constant {Object} - پیکربندی پیش‌فرض سیستم */
const DEFAULT_CONFIG = {
    /** @type {number} حداکثر تعداد تلاش مجدد */
    MAX_RETRIES: 3,
    /** @type {number} تأخیر اولیه بین تلاش‌ها (میلی‌ثانیه) */
    INITIAL_RETRY_DELAY: 100,
    /** @type {number} حداکثر تأخیر بین تلاش‌ها (میلی‌ثانیه) */
    MAX_RETRY_DELAY: 3000,
    /** @type {number} زمان پیش‌فرض کش (5 دقیقه) */
    DEFAULT_CACHE_TTL: 300000,
    /** @type {number} حداکثر تعداد آیتم‌های کش */
    MAX_CACHE_SIZE: 1000,
    /** @type {number} زمان تایم‌آوت عملیات (30 ثانیه) */
    OPERATION_TIMEOUT: 30000
};

// ================================================
// کلاس‌های خطای اختصاصی
// ================================================

/**
 * @class DatabaseError
 * @extends Error
 * @description خطای پایه دیتابیس
 */
class DatabaseError extends Error {
    /**
     * @param {string} message - پیام خطا
     * @param {Error} [original_error] - خطای اصلی
     */
    constructor(message, original_error = null) {
        super(message);
        this.name = 'DatabaseError';
        this.original_error = original_error;
        this.timestamp = new Date().toISOString();
    }
}

/**
 * @class ConnectionError
 * @extends DatabaseError
 * @description خطای اتصال به دیتابیس
 */
class ConnectionError extends DatabaseError {
    /** @param {string} message - پیام خطا */
    constructor(message) {
        super(message);
        this.name = 'ConnectionError';
    }
}

/**
 * @class QueryError
 * @extends DatabaseError
 * @description خطای اجرای کوئری
 */
class QueryError extends DatabaseError {
    /** @param {string} message - پیام خطا */
    constructor(message) {
        super(message);
        this.name = 'QueryError';
    }
}

// ================================================
// Feature Detection
// ================================================

/**
 * @class IndexedDBFeatureDetector
 * @description تشخیص قابلیت‌های مرورگر برای IndexedDB
 */
class IndexedDBFeatureDetector {
    /**
     * بررسی پشتیبانی از IndexedDB
     * @returns {boolean} true اگر مرورگر پشتیبانی می‌کند
     */
    static is_supported() {
        return !!window.indexedDB;
    }

    /**
     * دریافت حداکثر نسخه پشتیبانی شده
     * @returns {number} حداکثر نسخه
     */
    static get_max_version() {
        try {
            indexedDB.open('test-db', 1);
            return 1;
        } catch {
            return 0;
        }
    }

    /**
     * دریافت محدودیت‌های مرورگر
     * @returns {Object} محدودیت‌ها
     */
    static get_limits() {
        return {
            max_store_name_length: 100,
            max_index_name_length: 100,
            max_key_size: 2048,
            max_value_size: 128 * 1024 * 1024,
            supports_blob: true,
            supports_array_buffer: true
        };
    }

    /**
     * بررسی فضای ذخیره‌سازی موجود
     * @returns {Promise<Object|null>} آمار فضای ذخیره‌سازی
     */
    static async check_storage_quota() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage,
                quota: estimate.quota,
                percentage: (estimate.usage / estimate.quota) * 100
            };
        }
        return null;
    }
}

// ================================================
// انتزاع‌ها (اینترفیس‌ها)
// ================================================

/**
 * @interface DatabaseConnection
 * @description قرارداد اصلی اتصال دیتابیس
 */
class DatabaseConnection {
    /** @returns {Promise<IDBDatabase>} */
    async open() { throw new Error('Not implemented'); }
    
    /** @returns {Promise<void>} */
    async close() { throw new Error('Not implemented'); }
    
    /**
     * @param {string} store_name
     * @param {IDBValidKey} key
     * @returns {Promise<Object|null>}
     */
    async get(store_name, key) { throw new Error('Not implemented'); }
    
    /**
     * @param {string} store_name
     * @returns {Promise<Array<Object>>}
     */
    async get_all(store_name) { throw new Error('Not implemented'); }
    
    /**
     * @param {string} store_name
     * @param {Object} data
     * @returns {Promise<IDBValidKey>}
     */
    async save(store_name, data) { throw new Error('Not implemented'); }
    
    /**
     * @param {string} store_name
     * @param {Array<Object>} items
     * @returns {Promise<Array<IDBValidKey>>}
     */
    async save_batch(store_name, items) { throw new Error('Not implemented'); }
    
    /**
     * @param {string} store_name
     * @param {IDBValidKey} key
     * @returns {Promise<void>}
     */
    async delete(store_name, key) { throw new Error('Not implemented'); }
    
    /**
     * @param {string} store_name
     * @param {Array<IDBValidKey>} keys
     * @returns {Promise<void>}
     */
    async delete_batch(store_name, keys) { throw new Error('Not implemented'); }
    
    /**
     * @param {string} store_name
     * @returns {Promise<void>}
     */
    async clear(store_name) { throw new Error('Not implemented'); }
    
    /**
     * @param {string} store_name
     * @returns {Promise<number>}
     */
    async count(store_name) { throw new Error('Not implemented'); }
    
    /**
     * @param {string|Array<string>} store_names
     * @param {string} mode
     * @returns {IDBTransaction}
     */
    transaction(store_names, mode) { throw new Error('Not implemented'); }
    
    /**
     * @param {string} store_name
     * @returns {QueryBuilder}
     */
    query(store_name) { throw new Error('Not implemented'); }
    
    /** @returns {Promise<Object>} */
    async health_check() { throw new Error('Not implemented'); }
}

/**
 * @interface QueryBuilder
 * @description قرارداد ساخت کوئری
 */
class QueryBuilder {
    /**
     * @param {string} field
     * @param {string} operator
     * @param {*} value
     * @returns {QueryBuilder}
     */
    where(field, operator, value) { throw new Error('Not implemented'); }
    
    /**
     * @param {string} field
     * @param {string} operator
     * @param {*} value
     * @returns {QueryBuilder}
     */
    and(field, operator, value) { throw new Error('Not implemented'); }
    
    /**
     * @param {string} field
     * @param {string} operator
     * @param {*} value
     * @returns {QueryBuilder}
     */
    or(field, operator, value) { throw new Error('Not implemented'); }
    
    /**
     * @param {number} count
     * @returns {QueryBuilder}
     */
    limit(count) { throw new Error('Not implemented'); }
    
    /**
     * @param {number} start
     * @returns {QueryBuilder}
     */
    offset(start) { throw new Error('Not implemented'); }
    
    /**
     * @param {string} field
     * @param {string} direction
     * @returns {QueryBuilder}
     */
    order_by(field, direction) { throw new Error('Not implemented'); }
    
    /** @returns {Promise<Array<Object>>} */
    async execute() { throw new Error('Not implemented'); }
    
    /** @returns {Promise<Object>} */
    async explain() { throw new Error('Not implemented'); }
}

// ================================================
// پیاده‌سازی Cache Layer
// ================================================

/**
 * @class MemoryCacheLayer
 * @description پیاده‌سازی کش حافظه با قابلیت انقضا
 */
class MemoryCacheLayer {
    /** @type {Map<string, {value: *, expiry: number|null}>} */
    #cache = new Map();
    
    /** @type {Map<string, number>} */
    #timeouts = new Map();
    
    /** @type {number} */
    #max_size;
    
    /** @type {Object} - آمار کش */
    #stats = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0
    };

    /**
     * @param {number} max_size - حداکثر تعداد آیتم‌های کش
     */
    constructor(max_size = DEFAULT_CONFIG.MAX_CACHE_SIZE) {
        this.#max_size = max_size;
    }

    /**
     * دریافت آیتم از کش
     * @param {string} key - کلید آیتم
     * @returns {*} مقدار یا null
     */
    get(key) {
        this.#validate_key(key);
        
        const cached = this.#cache.get(key);
        if (!cached) {
            this.#stats.misses++;
            return null;
        }

        if (cached.expiry && cached.expiry < Date.now()) {
            this.delete(key);
            this.#stats.misses++;
            return null;
        }

        this.#stats.hits++;
        return cached.value;
    }

    /**
     * ذخیره آیتم در کش
     * @param {string} key - کلید آیتم
     * @param {*} value - مقدار
     * @param {number} ttl - زمان زندگی (میلی‌ثانیه)
     * @returns {boolean} موفقیت عملیات
     */
    set(key, value, ttl = DEFAULT_CONFIG.DEFAULT_CACHE_TTL) {
        this.#validate_key(key);
        
        // مدیریت حجم کش
        if (this.#cache.size >= this.#max_size) {
            const oldest_key = this.#cache.keys().next().value;
            this.delete(oldest_key);
        }

        const expiry = ttl ? Date.now() + ttl : null;
        this.#cache.set(key, { value, expiry });

        // تنظیم تایمر انقضا
        if (ttl) {
            const timeout = setTimeout(() => this.delete(key), ttl);
            this.#timeouts.set(key, timeout);
        }

        this.#stats.sets++;
        return true;
    }

    /**
     * حذف آیتم از کش
     * @param {string} key - کلید آیتم
     * @returns {boolean} موفقیت عملیات
     */
    delete(key) {
        this.#validate_key(key);
        
        this.#cache.delete(key);
        if (this.#timeouts.has(key)) {
            clearTimeout(this.#timeouts.get(key));
            this.#timeouts.delete(key);
        }
        
        this.#stats.deletes++;
        return true;
    }

    /** پاک کردن کل کش */
    clear() {
        this.#cache.clear();
        for (const timeout of this.#timeouts.values()) {
            clearTimeout(timeout);
        }
        this.#timeouts.clear();
        
        this.#stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0
        };
    }

    /**
     * باطل کردن کش یک فروشگاه
     * @param {string} store_name - نام فروشگاه
     */
    invalidate_store(store_name) {
        this.#validate_store_name(store_name);
        
        const prefix = `${store_name}:`;
        for (const key of this.#cache.keys()) {
            if (key.startsWith(prefix)) {
                this.delete(key);
            }
        }
    }

    /**
     * دریافت آمار کش
     * @returns {Object} آمار کش
     */
    get_stats() {
        const hit_rate = this.#stats.hits + this.#stats.misses === 0 
            ? 0 
            : this.#stats.hits / (this.#stats.hits + this.#stats.misses);
        
        return {
            size: this.#cache.size,
            max_size: this.#max_size,
            hits: this.#stats.hits,
            misses: this.#stats.misses,
            sets: this.#stats.sets,
            deletes: this.#stats.deletes,
            hit_rate: hit_rate
        };
    }

    /** @param {string} key */
    #validate_key(key) {
        if (!key || typeof key !== 'string') {
            throw new DatabaseError('Invalid cache key');
        }
    }

    /** @param {string} store_name */
    #validate_store_name(store_name) {
        if (!store_name || typeof store_name !== 'string') {
            throw new DatabaseError('Invalid store name');
        }
    }
}

// ================================================
// پیاده‌سازی Performance Monitor
// ================================================

/**
 * @class DatabasePerformanceMonitor
 * @description مانیتورینگ عملکرد دیتابیس
 */
class DatabasePerformanceMonitor {
    /** @type {Map<string, Array<Object>>} */
    #metrics = new Map();
    
    /** @type {number} */
    #max_entries;

    /**
     * @param {number} max_entries - حداکثر تعداد رکوردها
     */
    constructor(max_entries = 100) {
        this.#max_entries = max_entries;
    }

    /**
     * اندازه‌گیری زمان اجرای یک عملیات
     * @param {string} operation - نام عملیات
     * @param {Function} fn - تابع مورد نظر
     * @returns {Promise<*>} نتیجه تابع
     */
    async measure(operation, fn) {
        const start = performance.now();
        let success = false;

        try {
            const result = await fn();
            success = true;
            return result;
        } finally {
            const duration = performance.now() - start;
            this.#record_metric(operation, duration, success);
        }
    }

    /**
     * @param {string} operation
     * @param {number} duration
     * @param {boolean} success
     */
    #record_metric(operation, duration, success) {
        if (!this.#metrics.has(operation)) {
            this.#metrics.set(operation, []);
        }

        const metrics = this.#metrics.get(operation);
        metrics.push({
            duration,
            success,
            timestamp: Date.now()
        });

        if (metrics.length > this.#max_entries) {
            metrics.shift();
        }
    }

    /**
     * دریافت آمار یک عملیات
     * @param {string} operation - نام عملیات
     * @returns {Object|null} آمار عملیات
     */
    get_stats(operation) {
        const metrics = this.#metrics.get(operation) || [];

        if (metrics.length === 0) return null;

        const durations = metrics.map(m => m.duration);
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        const max = Math.max(...durations);
        const min = Math.min(...durations);
        const success_rate = metrics.filter(m => m.success).length / metrics.length;
        const p95 = this.#percentile(durations, 95);

        return {
            avg,
            max,
            min,
            p95,
            success_rate,
            count: metrics.length
        };
    }

    /**
     * @param {Array<number>} values
     * @param {number} percentile
     * @returns {number}
     */
    #percentile(values, percentile) {
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[index];
    }

    /** دریافت تمام آمارها */
    get_all_stats() {
        const all_stats = {};
        for (const [operation] of this.#metrics) {
            all_stats[operation] = this.get_stats(operation);
        }
        return all_stats;
    }

    /** ریست کردن آمار */
    reset() {
        this.#metrics.clear();
    }

    /** @returns {number} تعداد عملیات ثبت شده */
    get total_operations() {
        let total = 0;
        for (const metrics of this.#metrics.values()) {
            total += metrics.length;
        }
        return total;
    }
}

// ================================================
// پیاده‌سازی Query Builder پیشرفته
// ================================================

/**
 * @class IndexedDBQueryBuilder
 * @implements {QueryBuilder}
 * @description ساخت کوئری برای IndexedDB
 */
class IndexedDBQueryBuilder extends QueryBuilder {
    /** @type {IndexedDBConnection} */
    #connection;
    
    /** @type {string} */
    #store_name;
    
    /** @type {Array<Object>} */
    #filters = [];
    
    /** @type {number|null} */
    #limit_count = null;
    
    /** @type {number} */
    #offset_count = 0;
    
    /** @type {string|null} */
    #order_field = null;
    
    /** @type {string} */
    #order_direction = 'next';

    /**
     * @param {IndexedDBConnection} connection
     * @param {string} store_name
     */
    constructor(connection, store_name) {
        super();
        this.#connection = connection;
        this.#store_name = store_name;
    }

    /**
     * @param {string} field
     * @param {string} operator
     * @param {*} value
     * @returns {IndexedDBQueryBuilder}
     */
    where(field, operator, value) {
        this.#validate_field(field);
        this.#validate_operator(operator);
        
        this.#filters.push({ type: 'where', field, operator, value });
        return this;
    }

    /**
     * @param {string} field
     * @param {string} operator
     * @param {*} value
     * @returns {IndexedDBQueryBuilder}
     */
    and(field, operator, value) {
        this.#validate_field(field);
        this.#validate_operator(operator);
        
        this.#filters.push({ type: 'and', field, operator, value });
        return this;
    }

    /**
     * @param {string} field
     * @param {string} operator
     * @param {*} value
     * @returns {IndexedDBQueryBuilder}
     */
    or(field, operator, value) {
        this.#validate_field(field);
        this.#validate_operator(operator);
        
        this.#filters.push({ type: 'or', field, operator, value });
        return this;
    }

    /**
     * @param {number} count
     * @returns {IndexedDBQueryBuilder}
     */
    limit(count) {
        if (typeof count !== 'number' || count < 0) {
            throw new QueryError('Limit must be a positive number');
        }
        this.#limit_count = count;
        return this;
    }

    /**
     * @param {number} start
     * @returns {IndexedDBQueryBuilder}
     */
    offset(start) {
        if (typeof start !== 'number' || start < 0) {
            throw new QueryError('Offset must be a positive number');
        }
        this.#offset_count = start;
        return this;
    }

    /**
     * @param {string} field
     * @param {string} direction
     * @returns {IndexedDBQueryBuilder}
     */
    order_by(field, direction = 'asc') {
        this.#validate_field(field);
        
        this.#order_field = field;
        this.#order_direction = direction === 'asc' ? 'next' : 'prev';
        return this;
    }

    /**
     * @returns {Promise<Array<Object>>}
     */
    async execute() {
        return this.#connection.measure('query', async () => {
            const all_data = await this.#connection.get_all(this.#store_name);

            // اعمال فیلتر
            let filtered = this.#apply_filters(all_data);

            // اعمال مرتب‌سازی
            filtered = this.#apply_sorting(filtered);

            // اعمال صفحه‌بندی
            filtered = this.#apply_pagination(filtered);

            return filtered;
        });
    }

    /**
     * @returns {Promise<Object>}
     */
    async explain() {
        return {
            store: this.#store_name,
            filters: this.#filters,
            order_by: this.#order_field ? {
                field: this.#order_field,
                direction: this.#order_direction === 'next' ? 'asc' : 'desc'
            } : null,
            limit: this.#limit_count,
            offset: this.#offset_count,
            estimated_results: await this.#connection.count(this.#store_name)
        };
    }

    /**
     * @param {Array<Object>} data
     * @returns {Array<Object>}
     */
    #apply_filters(data) {
        if (this.#filters.length === 0) return data;

        return data.filter(item => {
            let result = true;
            let or_result = false;

            for (const filter of this.#filters) {
                const { type, field, operator, value } = filter;
                const match = this.#evaluate_condition(item[field], operator, value);

                if (type === 'where' || type === 'and') {
                    result = result && match;
                } else if (type === 'or') {
                    or_result = or_result || match;
                }
            }

            return result || or_result;
        });
    }

    /**
     * @param {*} value
     * @param {string} operator
     * @param {*} compare_value
     * @returns {boolean}
     */
    #evaluate_condition(value, operator, compare_value) {
        switch (operator) {
            case '==': return value === compare_value;
            case '!=': return value !== compare_value;
            case '>': return value > compare_value;
            case '>=': return value >= compare_value;
            case '<': return value < compare_value;
            case '<=': return value <= compare_value;
            case 'includes': return value?.includes(compare_value);
            case 'starts_with': return value?.startsWith(compare_value);
            case 'ends_with': return value?.endsWith(compare_value);
            case 'between': return value >= compare_value[0] && value <= compare_value[1];
            case 'in': return compare_value.includes(value);
            default: return true;
        }
    }

    /**
     * @param {Array<Object>} data
     * @returns {Array<Object>}
     */
    #apply_sorting(data) {
        if (!this.#order_field) return data;

        return [...data].sort((a, b) => {
            const a_val = a[this.#order_field];
            const b_val = b[this.#order_field];

            if (this.#order_direction === 'next') {
                return a_val < b_val ? -1 : a_val > b_val ? 1 : 0;
            } else {
                return a_val > b_val ? -1 : a_val < b_val ? 1 : 0;
            }
        });
    }

    /**
     * @param {Array<Object>} data
     * @returns {Array<Object>}
     */
    #apply_pagination(data) {
        let result = data;

        if (this.#offset_count > 0) {
            result = result.slice(this.#offset_count);
        }

        if (this.#limit_count !== null) {
            result = result.slice(0, this.#limit_count);
        }

        return result;
    }

    /** @param {string} field */
    #validate_field(field) {
        if (!field || typeof field !== 'string') {
            throw new QueryError('Invalid field name');
        }
    }

    /** @param {string} operator */
    #validate_operator(operator) {
        const valid_operators = ['==', '!=', '>', '>=', '<', '<=', 'includes', 'starts_with', 'ends_with', 'between', 'in'];
        if (!valid_operators.includes(operator)) {
            throw new QueryError(`Invalid operator: ${operator}`);
        }
    }
}

// ================================================
// پیاده‌سازی Transaction Manager
// ================================================

/**
 * @class TransactionManager
 * @description مدیریت تراکنش‌های دیتابیس
 */
class TransactionManager {
    /** @type {IndexedDBConnection} */
    #connection;

    /**
     * @param {IndexedDBConnection} connection
     */
    constructor(connection) {
        this.#connection = connection;
    }

    /**
     * اجرای عملیات در تراکنش
     * @param {string|Array<string>} store_names
     * @param {Function} operations
     * @param {string} mode
     * @returns {Promise<Array<*>>}
     */
    async run_in_transaction(store_names, operations, mode = 'readwrite') {
        return this.#connection.measure('transaction', async () => {
            const stores = Array.isArray(store_names) ? store_names : [store_names];
            const transaction = this.#connection.transaction(stores, mode);

            return new Promise((resolve, reject) => {
                const results = [];

                transaction.oncomplete = () => resolve(results);
                transaction.onerror = (event) => reject(new QueryError('Transaction failed', event.target.error));
                transaction.onabort = (event) => reject(new QueryError('Transaction aborted', event.target.error));

                try {
                    operations(transaction, results);
                } catch (error) {
                    reject(new QueryError('Operation error', error));
                }
            });
        });
    }

    /**
     * به‌روزرسانی اتمی یک آیتم
     * @param {string} store_name
     * @param {IDBValidKey} key
     * @param {Function} update_fn
     * @returns {Promise<Object>}
     */
    async atomic_update(store_name, key, update_fn) {
        return this.run_in_transaction(store_name, async (transaction, results) => {
            const store = transaction.objectStore(store_name);
            const request = store.get(key);

            request.onsuccess = () => {
                const old_data = request.result;
                const new_data = update_fn(old_data);

                const put_request = store.put(new_data);
                put_request.onsuccess = () => results.push(new_data);
            };
        });
    }

    /**
     * به‌روزرسانی سریع یک آیتم
     * @param {string} store_name
     * @param {IDBValidKey} key
     * @param {Object} updates
     * @returns {Promise<Object>}
     */
    async quick_update(store_name, key, updates) {
        return this.atomic_update(store_name, key, (old_data) => ({
            ...old_data,
            ...updates,
            updated_at: new Date().toISOString()
        }));
    }
}

// ================================================
// پیاده‌سازی Backup/Restore
// ================================================

/**
 * @class DatabaseBackup
 * @description ابزار پشتیبان‌گیری و بازیابی دیتابیس
 */
class DatabaseBackup {
    /**
     * ایجاد پشتیبان
     * @param {IndexedDBConnection} connection
     * @param {Array<string>} store_names
     * @returns {Promise<Object>}
     */
    static async backup(connection, store_names) {
        const backup = {};

        for (const store_name of store_names) {
            backup[store_name] = await connection.get_all(store_name);
        }

        const backup_str = JSON.stringify(backup);
        const compressed = await this.#compress(backup_str);

        return {
            data: compressed,
            timestamp: Date.now(),
            stores: store_names,
            version: connection.database_version,
            size: compressed.length
        };
    }

    /**
     * بازیابی از پشتیبان
     * @param {IndexedDBConnection} connection
     * @param {Object} backup_data
     * @returns {Promise<boolean>}
     */
    static async restore(connection, backup_data) {
        const decompressed = await this.#decompress(backup_data.data);
        const backup = JSON.parse(decompressed);

        const transaction = connection.transaction(backup_data.stores, 'readwrite');

        return new Promise((resolve, reject) => {
            let completed = 0;
            const total = backup_data.stores.length;

            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(new DatabaseError('Restore failed'));

            for (const [store_name, items] of Object.entries(backup)) {
                const store = transaction.objectStore(store_name);
                store.clear().onsuccess = () => {
                    items.forEach(item => store.add(item));
                    completed++;
                };
            }
        });
    }

    /**
     * @param {string} str
     * @returns {Promise<string>}
     */
    static async #compress(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const compressed = await this.#deflate(data);
        return btoa(String.fromCharCode(...new Uint8Array(compressed)));
    }

    /**
     * @param {string} compressed
     * @returns {Promise<string>}
     */
    static async #decompress(compressed) {
        const binary = atob(compressed);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const decompressed = await this.#inflate(bytes);
        return new TextDecoder().decode(decompressed);
    }

    /**
     * @param {Uint8Array} data
     * @returns {Promise<Uint8Array>}
     */
    static async #deflate(data) {
        const cs = new CompressionStream('deflate');
        const writer = cs.writable.getWriter();
        writer.write(data);
        writer.close();
        const compressed = await new Response(cs.readable).arrayBuffer();
        return new Uint8Array(compressed);
    }

    /**
     * @param {Uint8Array} data
     * @returns {Promise<Uint8Array>}
     */
    static async #inflate(data) {
        const cs = new DecompressionStream('deflate');
        const writer = cs.writable.getWriter();
        writer.write(data);
        writer.close();
        const decompressed = await new Response(cs.readable).arrayBuffer();
        return new Uint8Array(decompressed);
    }
}

// ================================================
// پیاده‌سازی اصلی IndexedDB Connection
// ================================================

/**
 * @class IndexedDBConnection
 * @implements {DatabaseConnection}
 * @description پیاده‌سازی اصلی اتصال IndexedDB با قابلیت‌های پیشرفته
 */
class IndexedDBConnection extends DatabaseConnection {
    /** @type {IDBDatabase|null} */
    #db = null;
    
    /** @type {string} */
    #db_name;
    
    /** @type {number} */
    #db_version;
    
    /** @type {boolean} */
    #is_open = false;
    
    /** @type {Promise<IDBDatabase>|null} */
    #open_promise = null;
    
    /** @type {SchemaManager} */
    #schema_manager;
    
    /** @type {TransactionManager} */
    #transaction_manager;
    
    /** @type {DatabasePerformanceMonitor} */
    #performance_monitor;
    
    /** @type {MemoryCacheLayer} */
    #cache_layer;
    
    /** @type {Object} - آمار کلی */
    #metrics = {
        total_operations: 0,
        cache_hits: 0,
        cache_misses: 0,
        errors: 0,
        operations_by_type: {}
    };

    /**
     * @param {string} db_name
     * @param {number} db_version
     * @param {SchemaManager} schema_manager
     * @param {Object} options
     */
    constructor(db_name, db_version, schema_manager, options = {}) {
        super();
        this.#db_name = db_name;
        this.#db_version = db_version;
        this.#schema_manager = schema_manager;
        this.#performance_monitor = options.performance_monitor || new DatabasePerformanceMonitor();
        this.#cache_layer = options.cache_layer || new MemoryCacheLayer();
        this.#transaction_manager = new TransactionManager(this);
    }

    /**
     * سیستم لاگ یکپارچه
     * @param {string} level
     * @param {string} message
     * @param {*} [data]
     * @private
     */
    #log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const log_entry = { 
            timestamp, 
            level, 
            message, 
            data,
            component: 'IndexedDBConnection',
            db: this.#db_name
        };
        
        if (level === 'error') {
            console.error(JSON.stringify(log_entry));
        } else {
            console.log(JSON.stringify(log_entry));
        }
    }

    /**
     * افزایش آمار
     * @param {string} metric
     * @param {string} [operation]
     * @private
     */
    #increment_metric(metric, operation = null) {
        if (metric === 'operation' && operation) {
            this.#metrics.operations_by_type[operation] = 
                (this.#metrics.operations_by_type[operation] || 0) + 1;
        }
        this.#metrics[metric] = (this.#metrics[metric] || 0) + 1;
    }

    /**
     * مدیریت خطاهای Promise
     * @param {Error} error
     * @param {string} context
     * @throws {DatabaseError}
     * @private
     */
    #handle_promise_error(error, context) {
        this.#log('error', `Operation failed: ${context}`, error);
        this.#increment_metric('errors');
        throw new DatabaseError(`Operation failed: ${context}`, error);
    }

    /**
     * اعتبارسنجی نام فروشگاه
     * @param {string} store_name
     * @throws {DatabaseError}
     * @private
     */
    #validate_store_name(store_name) {
        if (!store_name || typeof store_name !== 'string') {
            throw new DatabaseError('Invalid store name: must be a non-empty string');
        }
    }

    /**
     * اعتبارسنجی کلید
     * @param {IDBValidKey} key
     * @throws {DatabaseError}
     * @private
     */
    #validate_key(key) {
        if (key === undefined || key === null) {
            throw new DatabaseError('Invalid key: cannot be null or undefined');
        }
    }

    /**
     * اجرای عملیات با تایم‌اوت
     * @param {Promise} promise
     * @param {string} context
     * @param {number} timeout_ms
     * @returns {Promise}
     * @private
     */
    #with_timeout(promise, context, timeout_ms = DEFAULT_CONFIG.OPERATION_TIMEOUT) {
        const timeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Timeout: ${context}`)), timeout_ms);
        });
        return Promise.race([promise, timeout]);
    }

    /**
     * اجرای عملیات با تلاش مجدد
     * @param {Function} operation
     * @param {string} context
     * @returns {Promise}
     * @private
     */
    async #with_retry(operation, context = '') {
        let last_error;
        let delay = DEFAULT_CONFIG.INITIAL_RETRY_DELAY;

        for (let i = 0; i < DEFAULT_CONFIG.MAX_RETRIES; i++) {
            try {
                return await operation();
            } catch (error) {
                last_error = error;
                this.#log('warn', `Retry ${i + 1}/${DEFAULT_CONFIG.MAX_RETRIES} for ${context}`, error.message);

                if (i < DEFAULT_CONFIG.MAX_RETRIES - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay = Math.min(delay * 2, DEFAULT_CONFIG.MAX_RETRY_DELAY);
                }
            }
        }

        throw new DatabaseError(`Operation failed after ${DEFAULT_CONFIG.MAX_RETRIES} retries`, last_error);
    }

    /**
     * اندازه‌گیری و اجرای عملیات
     * @param {string} operation
     * @param {Function} fn
     * @returns {Promise<*>}
     */
    async measure(operation, fn) {
        this.#increment_metric('total_operations');
        this.#increment_metric('operation', operation);
        return this.#performance_monitor.measure(operation, fn);
    }

    /** @returns {Promise<IDBDatabase>} */
    async open() {
        if (!IndexedDBFeatureDetector.is_supported()) {
            throw new ConnectionError('IndexedDB is not supported in this browser');
        }

        if (this.#is_open && this.#db) {
            return this.#db;
        }

        if (this.#open_promise) {
            return this.#open_promise;
        }

        this.#open_promise = this.#with_retry(async () => {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.#db_name, this.#db_version);

                request.onerror = (event) => {
                    this.#log('error', 'IndexedDB open error', event.target.error);
                    reject(new ConnectionError(`Failed to open database: ${event.target.error.message}`));
                };

                request.onsuccess = (event) => {
                    this.#db = event.target.result;
                    this.#is_open = true;
                    this.#open_promise = null;

                    this.#db.onclose = () => {
                        this.#is_open = false;
                        this.#db = null;
                        this.#log('warn', 'Database connection closed unexpectedly');
                        this.#cache_layer.clear();
                    };

                    this.#db.onerror = (event) => {
                        this.#log('error', 'Database error', event.target.error);
                        this.#cache_layer.clear();
                    };

                    this.#db.onversionchange = () => {
                        this.#db.close();
                        this.#is_open = false;
                        this.#db = null;
                        this.#cache_layer.clear();
                        this.#log('warn', 'Database version changed, connection closed');
                    };

                    this.#log('info', `IndexedDB connected: ${this.#db_name} v${this.#db_version}`);
                    resolve(this.#db);
                };

                request.onupgradeneeded = async (event) => {
                    const db = event.target.result;
                    const old_version = event.oldVersion;
                    const new_version = event.newVersion;

                    try {
                        await this.#schema_manager.migrate(db, old_version, new_version);
                        this.#log('info', `Database migrated: ${old_version} → ${new_version}`);
                    } catch (error) {
                        this.#log('error', 'Migration failed', error);
                        reject(error);
                    }
                };
            });
        }, 'open database');

        return this.#open_promise;
    }

    /** @returns {Promise<void>} */
    async close() {
        return this.#with_retry(async () => {
            if (this.#db && this.#is_open) {
                this.#db.close();
                this.#is_open = false;
                this.#db = null;
                this.#cache_layer.clear();
                this.#log('info', 'Database connection closed');
            }
        }, 'close database');
    }

    /**
     * @param {string} store_name
     * @param {IDBValidKey} key
     * @returns {Promise<Object|null>}
     */
    async get(store_name, key) {
        this.#validate_store_name(store_name);
        this.#validate_key(key);

        const cache_key = `${store_name}:${key}`;
        const cached = this.#cache_layer.get(cache_key);

        if (cached !== null) {
            this.#increment_metric('cache_hits');
            return cached;
        }

        this.#increment_metric('cache_misses');

        return this.measure('get', async () => {
            await this.#ensure_connection();

            return this.#with_retry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#create_transaction(store_name, 'readonly');
                    const store = transaction.objectStore(store_name);
                    const request = store.get(key);

                    request.onsuccess = () => {
                        const result = request.result || null;
                        if (result) {
                            this.#cache_layer.set(cache_key, result);
                        }
                        resolve(result);
                    };

                    request.onerror = () => reject(new QueryError(`Failed to get ${store_name}:${key}`));
                });
            }, `get ${store_name}:${key}`);
        });
    }

    /**
     * @param {string} store_name
     * @returns {Promise<Array<Object>>}
     */
    async get_all(store_name) {
        this.#validate_store_name(store_name);

        const cache_key = `${store_name}:all`;
        const cached = this.#cache_layer.get(cache_key);

        if (cached !== null) {
            this.#increment_metric('cache_hits');
            return cached;
        }

        this.#increment_metric('cache_misses');

        return this.measure('get_all', async () => {
            await this.#ensure_connection();

            return this.#with_retry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#create_transaction(store_name, 'readonly');
                    const store = transaction.objectStore(store_name);
                    const request = store.getAll();

                    request.onsuccess = () => {
                        const result = request.result || [];
                        this.#cache_layer.set(cache_key, result);
                        resolve(result);
                    };

                    request.onerror = () => reject(new QueryError(`Failed to get all from ${store_name}`));
                });
            }, `get_all ${store_name}`);
        });
    }

    /**
     * @param {string} store_name
     * @param {Object} data
     * @returns {Promise<IDBValidKey>}
     */
    async save(store_name, data) {
        this.#validate_store_name(store_name);
        
        if (!data || typeof data !== 'object') {
            throw new DatabaseError('Invalid data: must be an object');
        }

        if (!this.#schema_manager.validate_schema(store_name, data)) {
            throw new DatabaseError(`Invalid data for store: ${store_name}`);
        }

        return this.measure('save', async () => {
            await this.#ensure_connection();

            return this.#with_retry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#create_transaction(store_name, 'readwrite');
                    const store = transaction.objectStore(store_name);

                    const request = data.id ? store.put(data) : store.add(data);

                    request.onsuccess = () => {
                        const key = request.result;
                        this.#log('info', `Saved to ${store_name}`, { key });

                        // پاک کردن کش مرتبط
                        this.#cache_layer.invalidate_store(store_name);

                        resolve(key);
                    };

                    request.onerror = () => reject(new QueryError(`Failed to save to ${store_name}`));
                });
            }, `save ${store_name}`);
        });
    }

    /**
     * @param {string} store_name
     * @param {Array<Object>} items
     * @returns {Promise<Array<IDBValidKey>>}
     */
    async save_batch(store_name, items) {
        this.#validate_store_name(store_name);
        
        if (!Array.isArray(items)) {
            throw new DatabaseError('Invalid items: must be an array');
        }

        return this.measure('save_batch', async () => {
            await this.#ensure_connection();

            return this.#with_retry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#create_transaction(store_name, 'readwrite');
                    const store = transaction.objectStore(store_name);

                    const results = [];
                    let completed = 0;

                    transaction.oncomplete = () => {
                        this.#cache_layer.invalidate_store(store_name);
                        resolve(results);
                    };

                    transaction.onerror = () => reject(new QueryError('Batch save failed'));

                    items.forEach((item, index) => {
                        const request = item.id ? store.put(item) : store.add(item);

                        request.onsuccess = () => {
                            results[index] = request.result;
                            completed++;
                        };
                    });
                });
            }, `save_batch ${store_name}`);
        });
    }

    /**
     * @param {string} store_name
     * @param {IDBValidKey} key
     * @returns {Promise<void>}
     */
    async delete(store_name, key) {
        this.#validate_store_name(store_name);
        this.#validate_key(key);

        return this.measure('delete', async () => {
            await this.#ensure_connection();

            return this.#with_retry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#create_transaction(store_name, 'readwrite');
                    const store = transaction.objectStore(store_name);
                    const request = store.delete(key);

                    request.onsuccess = () => {
                        this.#log('info', `Deleted from ${store_name}`, { key });
                        this.#cache_layer.delete(`${store_name}:${key}`);
                        this.#cache_layer.invalidate_store(store_name);
                        resolve();
                    };

                    request.onerror = () => reject(new QueryError(`Failed to delete from ${store_name}`));
                });
            }, `delete ${store_name}:${key}`);
        });
    }

    /**
     * @param {string} store_name
     * @param {Array<IDBValidKey>} keys
     * @returns {Promise<void>}
     */
    async delete_batch(store_name, keys) {
        this.#validate_store_name(store_name);
        
        if (!Array.isArray(keys)) {
            throw new DatabaseError('Invalid keys: must be an array');
        }

        return this.measure('delete_batch', async () => {
            await this.#ensure_connection();

            return this.#with_retry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#create_transaction(store_name, 'readwrite');
                    const store = transaction.objectStore(store_name);

                    let completed = 0;

                    transaction.oncomplete = () => {
                        keys.forEach(key => this.#cache_layer.delete(`${store_name}:${key}`));
                        this.#cache_layer.invalidate_store(store_name);
                        resolve();
                    };

                    transaction.onerror = () => reject(new QueryError('Batch delete failed'));

                    keys.forEach(key => {
                        const request = store.delete(key);
                        request.onsuccess = () => completed++;
                    });
                });
            }, `delete_batch ${store_name}`);
        });
    }

    /**
     * @param {string} store_name
     * @returns {Promise<void>}
     */
    async clear(store_name) {
        this.#validate_store_name(store_name);

        return this.measure('clear', async () => {
            await this.#ensure_connection();

            return this.#with_retry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#create_transaction(store_name, 'readwrite');
                    const store = transaction.objectStore(store_name);
                    const request = store.clear();

                    request.onsuccess = () => {
                        this.#log('info', `Cleared store: ${store_name}`);
                        this.#cache_layer.invalidate_store(store_name);
                        resolve();
                    };

                    request.onerror = () => reject(new QueryError(`Failed to clear ${store_name}`));
                });
            }, `clear ${store_name}`);
        });
    }

    /**
     * @param {string} store_name
     * @returns {Promise<number>}
     */
    async count(store_name) {
        this.#validate_store_name(store_name);

        return this.measure('count', async () => {
            await this.#ensure_connection();

            return this.#with_retry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#create_transaction(store_name, 'readonly');
                    const store = transaction.objectStore(store_name);
                    const request = store.count();

                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(new QueryError(`Failed to count ${store_name}`));
                });
            }, `count ${store_name}`);
        });
    }

    /**
     * @param {string|Array<string>} store_names
     * @param {string} mode
     * @returns {IDBTransaction}
     */
    transaction(store_names, mode = 'readonly') {
        if (!this.#db || !this.#is_open) {
            throw new ConnectionError('Database not connected');
        }
        return this.#db.transaction(store_names, mode);
    }

    /**
     * @param {string} store_name
     * @returns {QueryBuilder}
     */
    query(store_name) {
        this.#validate_store_name(store_name);
        return new IndexedDBQueryBuilder(this, store_name);
    }

    /**
     * بررسی سلامت دیتابیس
     * @returns {Promise<Object>}
     */
    async health_check() {
        try {
            await this.#ensure_connection();
            
            // تست عملیات پایه
            const test_key = '_health_check_' + Date.now();
            const test_data = { id: test_key, timestamp: Date.now() };
            
            await this.save('_health', test_data);
            const retrieved = await this.get('_health', test_key);
            await this.delete('_health', test_key);

            const storage_quota = await IndexedDBFeatureDetector.check_storage_quota();
            const cache_stats = this.#cache_layer.get_stats();
            const performance_stats = this.#performance_monitor.get_all_stats();

            return {
                status: 'healthy',
                version: this.#db_version,
                is_connected: this.#is_open,
                storage: storage_quota,
                cache: cache_stats,
                metrics: {
                    total_operations: this.#metrics.total_operations,
                    cache_hits: this.#metrics.cache_hits,
                    cache_misses: this.#metrics.cache_misses,
                    errors: this.#metrics.errors,
                    hit_rate: this.#metrics.cache_hits + this.#metrics.cache_misses === 0
                        ? 0
                        : this.#metrics.cache_hits / (this.#metrics.cache_hits + this.#metrics.cache_misses)
                },
                performance: performance_stats,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * دریافت آمار کلی
     * @returns {Object}
     */
    get_stats() {
        return {
            metrics: { ...this.#metrics },
            cache: this.#cache_layer.get_stats(),
            performance: this.#performance_monitor.get_all_stats(),
            db_info: {
                name: this.#db_name,
                version: this.#db_version,
                is_connected: this.#is_open
            }
        };
    }

    /** @returns {Promise<void>} */
    async #ensure_connection() {
        if (!this.#is_open || !this.#db) {
            await this.open();
        }
    }

    /**
     * @param {string} store_name
     * @param {string} mode
     * @returns {IDBTransaction}
     * @private
     */
    #create_transaction(store_name, mode) {
        const transaction = this.#db.transaction(store_name, mode);

        transaction.onerror = (event) => {
            this.#log('error', `Transaction error on ${store_name}`, event.target.error);
        };

        transaction.onabort = (event) => {
            this.#log('warn', `Transaction aborted on ${store_name}`, event.target.error);
        };

        return transaction;
    }

    /** @returns {TransactionManager} */
    get_transaction_manager() {
        return this.#transaction_manager;
    }

    /** @returns {typeof DatabaseBackup} */
    get_backup_manager() {
        return DatabaseBackup;
    }

    /**
     * @param {string} operation
     * @returns {Object|null}
     */
    get_performance_stats(operation) {
        return this.#performance_monitor.get_stats(operation);
    }

    /** @returns {boolean} */
    get is_connected() {
        return this.#is_open && this.#db !== null;
    }

    /** @returns {string} */
    get database_name() {
        return this.#db_name;
    }

    /** @returns {number} */
    get database_version() {
        return this.#db_version;
    }
}

// ================================================
// Versioned Schema Manager
// ================================================

/**
 * @class VersionedSchemaManager
 * @implements {SchemaManager}
 * @description مدیریت نسخه‌های اسکیما با قابلیت مهاجرت
 */
class VersionedSchemaManager {
    /** @type {Map<string, Object>} */
    #stores = new Map();
    
    /** @type {Map<string, Function>} */
    #migrations = new Map();
    
    /** @type {number} */
    #current_version;

    /**
     * @param {number} version
     */
    constructor(version = 1) {
        this.#current_version = version;
    }

    /**
     * ثبت فروشگاه
     * @param {string} name
     * @param {Object} schema
     */
    register_store(name, schema) {
        this.#validate_store_name(name);
        this.#stores.set(name, schema);
    }

    /**
     * ثبت مهاجرت
     * @param {number} from_version
     * @param {number} to_version
     * @param {Function} migration_fn
     */
    register_migration(from_version, to_version, migration_fn) {
        const key = `${from_version}->${to_version}`;
        this.#migrations.set(key, migration_fn);
    }

    /**
     * اجرای مهاجرت
     * @param {IDBDatabase} db
     * @param {number} old_version
     * @param {number} new_version
     * @returns {Promise<void>}
     */
    async migrate(db, old_version, new_version) {
        if (old_version === 0) {
            await this.#create_initial_schema(db);
        } else {
            await this.#apply_migrations(db, old_version, new_version);
        }
    }

    /**
     * @param {IDBDatabase} db
     * @returns {Promise<void>}
     * @private
     */
    async #create_initial_schema(db) {
        for (const [name, schema] of this.#stores) {
            if (!db.objectStoreNames.contains(name)) {
                const store = db.createObjectStore(name, schema.options || { keyPath: 'id', autoIncrement: true });

                if (schema.indexes) {
                    for (const index of schema.indexes) {
                        store.createIndex(index.name, index.keyPath, index.options);
                    }
                }
            }
        }
    }

    /**
     * @param {IDBDatabase} db
     * @param {number} old_version
     * @param {number} new_version
     * @returns {Promise<void>}
     * @private
     */
    async #apply_migrations(db, old_version, new_version) {
        for (let v = old_version; v < new_version; v++) {
            const migration_key = `${v}->${v + 1}`;
            const migration = this.#migrations.get(migration_key);

            if (migration) {
                await migration(db);
                console.log(`✅ Migration ${migration_key} applied`);
            }
        }
    }

    /** @returns {number} */
    get_current_version() {
        return this.#current_version;
    }

    /**
     * اعتبارسنجی اسکیما
     * @param {string} store_name
     * @param {Object} data
     * @returns {boolean}
     */
    validate_schema(store_name, data) {
        const schema = this.#stores.get(store_name);
        if (!schema) {
            console.warn(`⚠️ No schema registered for store: ${store_name}`);
            return true;
        }

        if (schema.required_fields) {
            for (const field of schema.required_fields) {
                if (data[field] === undefined || data[field] === null) {
                    console.warn(`⚠️ Missing required field: ${field}`);
                    return false;
                }
            }
        }

        if (schema.types) {
            for (const [field, type] of Object.entries(schema.types)) {
                if (data[field] !== undefined && typeof data[field] !== type) {
                    console.warn(`⚠️ Field ${field} should be ${type}`);
                    return false;
                }
            }
        }

        return true;
    }

    /** @param {string} store_name */
    #validate_store_name(store_name) {
        if (!store_name || typeof store_name !== 'string') {
            throw new DatabaseError('Invalid store name');
        }
    }
}

// ================================================
// Factory و Singleton
// ================================================

/**
 * @class DatabaseFactory
 * @description کارخانه ایجاد اتصالات دیتابیس با Singleton Pattern
 */
class DatabaseFactory {
    /** @type {DatabaseFactory|null} */
    static #instance = null;
    
    /** @type {Map<string, IndexedDBConnection>} */
    #connections = new Map();

    /**
     * @private
     */
    constructor() {
        if (DatabaseFactory.#instance) {
            return DatabaseFactory.#instance;
        }
        DatabaseFactory.#instance = this;
    }

    /**
     * @returns {DatabaseFactory}
     */
    static get_instance() {
        if (!DatabaseFactory.#instance) {
            DatabaseFactory.#instance = new DatabaseFactory();
        }
        return DatabaseFactory.#instance;
    }

    /**
     * ایجاد اتصال جدید
     * @param {string} db_name
     * @param {number} version
     * @param {SchemaManager} schema_manager
     * @param {Object} options
     * @returns {IndexedDBConnection}
     */
    create_connection(db_name, version, schema_manager, options = {}) {
        const key = `${db_name}_${version}`;

        if (!this.#connections.has(key)) {
            const connection = new IndexedDBConnection(
                db_name,
                version,
                schema_manager,
                {
                    cache_layer: options.cache_layer || new MemoryCacheLayer(),
                    performance_monitor: options.performance_monitor || new DatabasePerformanceMonitor()
                }
            );
            this.#connections.set(key, connection);
        }

        return this.#connections.get(key);
    }

    /**
     * بستن همه اتصالات
     * @returns {Promise<void>}
     */
    async close_all_connections() {
        const close_promises = [];
        for (const [key, connection] of this.#connections) {
            close_promises.push(connection.close());
        }
        await Promise.all(close_promises);
        this.#connections.clear();
    }

    /** @returns {number} تعداد اتصالات فعال */
    get active_connections() {
        return this.#connections.size;
    }
}

// ================================================
// Export
// ================================================

const db_factory = DatabaseFactory.get_instance();

export {
    // اینترفیس‌ها
    DatabaseConnection,
    QueryBuilder,

    // کلاس‌های خطا
    DatabaseError,
    ConnectionError,
    QueryError,

    // پیاده‌سازی‌های اصلی
    IndexedDBConnection,
    IndexedDBQueryBuilder,
    VersionedSchemaManager,
    DatabaseFactory,
    DatabasePerformanceMonitor,
    MemoryCacheLayer,
    DatabaseBackup,
    TransactionManager,
    IndexedDBFeatureDetector,

    // ابزارها
    DEFAULT_CONFIG,

    // Factory instance
    db_factory as default
};
