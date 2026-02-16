/**
 * core/db/indexeddb-wrapper.js
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
 */

// ================================================
// Feature Detection
// ================================================

class IndexedDBFeatureDetector {
    static isSupported() {
        return !!window.indexedDB;
    }

    static getMaxVersion() {
        try {
            indexedDB.open('test-db', 1);
            return 1;
        } catch {
            return 0;
        }
    }

    static getLimits() {
        return {
            maxStoreNameLength: 100,
            maxIndexNameLength: 100,
            maxKeySize: 2048,
            maxValueSize: 128 * 1024 * 1024,
            supportsBlob: true,
            supportsArrayBuffer: true
        };
    }

    static async checkStorageQuota() {
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
 * قرارداد اصلی اتصال دیتابیس
 */
class DatabaseConnection {
    async open() { throw new Error('Not implemented'); }
    async close() { throw new Error('Not implemented'); }
    async get(storeName, key) { throw new Error('Not implemented'); }
    async getAll(storeName) { throw new Error('Not implemented'); }
    async save(storeName, data) { throw new Error('Not implemented'); }
    async saveBatch(storeName, items) { throw new Error('Not implemented'); }
    async delete(storeName, key) { throw new Error('Not implemented'); }
    async deleteBatch(storeName, keys) { throw new Error('Not implemented'); }
    async clear(storeName) { throw new Error('Not implemented'); }
    async count(storeName) { throw new Error('Not implemented'); }
    transaction(storeNames, mode) { throw new Error('Not implemented'); }
    query(storeName) { throw new Error('Not implemented'); }
}

/**
 * @interface SchemaManager
 * قرارداد مدیریت نسخه و اسکیما
 */
class SchemaManager {
    async migrate(db, oldVersion, newVersion) { throw new Error('Not implemented'); }
    getCurrentVersion() { throw new Error('Not implemented'); }
    validateSchema(storeName, data) { throw new Error('Not implemented'); }
    registerMigration(fromVersion, toVersion, migrationFn) { throw new Error('Not implemented'); }
}

/**
 * @interface QueryBuilder
 * قرارداد ساخت کوئری
 */
class QueryBuilder {
    where(field, operator, value) { throw new Error('Not implemented'); }
    and(field, operator, value) { throw new Error('Not implemented'); }
    or(field, operator, value) { throw new Error('Not implemented'); }
    limit(count) { throw new Error('Not implemented'); }
    offset(start) { throw new Error('Not implemented'); }
    orderBy(field, direction) { throw new Error('Not implemented'); }
    execute() { throw new Error('Not implemented'); }
    explain() { throw new Error('Not implemented'); }
}

/**
 * @interface PerformanceMonitor
 * قرارداد مانیتورینگ عملکرد
 */
class PerformanceMonitor {
    measure(operation, fn) { throw new Error('Not implemented'); }
    getStats(operation) { throw new Error('Not implemented'); }
    reset() { throw new Error('Not implemented'); }
}

/**
 * @interface CacheLayer
 * قرارداد لایه کش
 */
class CacheLayer {
    get(key) { throw new Error('Not implemented'); }
    set(key, value, ttl) { throw new Error('Not implemented'); }
    delete(key) { throw new Error('Not implemented'); }
    clear() { throw new Error('Not implemented'); }
    invalidate(storeName) { throw new Error('Not implemented'); }
}

// ================================================
// پیاده‌سازی Cache Layer
// ================================================

class MemoryCacheLayer extends CacheLayer {
    #cache = new Map();
    #timeouts = new Map();
    #maxSize = 1000;

    constructor(maxSize = 1000) {
        super();
        this.#maxSize = maxSize;
    }

    get(key) {
        const cached = this.#cache.get(key);
        if (!cached) return null;

        if (cached.expiry && cached.expiry < Date.now()) {
            this.delete(key);
            return null;
        }

        return cached.value;
    }

    set(key, value, ttl = 300000) { // 5 دقیقه پیش‌فرض
        // مدیریت حجم کش
        if (this.#cache.size >= this.#maxSize) {
            const oldestKey = this.#cache.keys().next().value;
            this.delete(oldestKey);
        }

        const expiry = ttl ? Date.now() + ttl : null;
        this.#cache.set(key, { value, expiry });

        // تنظیم تایمر انقضا
        if (ttl) {
            const timeout = setTimeout(() => this.delete(key), ttl);
            this.#timeouts.set(key, timeout);
        }

        return true;
    }

    delete(key) {
        this.#cache.delete(key);
        if (this.#timeouts.has(key)) {
            clearTimeout(this.#timeouts.get(key));
            this.#timeouts.delete(key);
        }
        return true;
    }

    clear() {
        this.#cache.clear();
        for (const timeout of this.#timeouts.values()) {
            clearTimeout(timeout);
        }
        this.#timeouts.clear();
    }

    invalidate(storeName) {
        const prefix = `${storeName}:`;
        for (const key of this.#cache.keys()) {
            if (key.startsWith(prefix)) {
                this.delete(key);
            }
        }
    }

    get size() {
        return this.#cache.size;
    }
}

// ================================================
// پیاده‌سازی Performance Monitor
// ================================================

class DatabasePerformanceMonitor extends PerformanceMonitor {
    #metrics = new Map();
    #maxEntries = 100;

    constructor(maxEntries = 100) {
        super();
        this.#maxEntries = maxEntries;
    }

    async measure(operation, fn) {
        const start = performance.now();
        let success = false;

        try {
            const result = await fn();
            success = true;
            return result;
        } finally {
            const duration = performance.now() - start;
            this.#recordMetric(operation, duration, success);
        }
    }

    #recordMetric(operation, duration, success) {
        if (!this.#metrics.has(operation)) {
            this.#metrics.set(operation, []);
        }

        const metrics = this.#metrics.get(operation);
        metrics.push({
            duration,
            success,
            timestamp: Date.now()
        });

        if (metrics.length > this.#maxEntries) {
            metrics.shift();
        }
    }

    getStats(operation) {
        const metrics = this.#metrics.get(operation) || [];

        if (metrics.length === 0) return null;

        const durations = metrics.map(m => m.duration);
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        const max = Math.max(...durations);
        const min = Math.min(...durations);
        const successRate = metrics.filter(m => m.success).length / metrics.length;
        const p95 = this.#percentile(durations, 95);

        return {
            avg,
            max,
            min,
            p95,
            successRate,
            count: metrics.length
        };
    }

    #percentile(values, percentile) {
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[index];
    }

    reset(operation) {
        if (operation) {
            this.#metrics.delete(operation);
        } else {
            this.#metrics.clear();
        }
    }
}

// ================================================
// پیاده‌سازی Query Builder پیشرفته
// ================================================

class IndexedDBQueryBuilder extends QueryBuilder {
    #connection = null;
    #storeName = '';
    #filters = [];
    #limitCount = null;
    #offsetCount = 0;
    #orderField = null;
    #orderDirection = 'next';
    #useIndex = null;

    constructor(connection, storeName) {
        super();
        this.#connection = connection;
        this.#storeName = storeName;
    }

    where(field, operator, value) {
        this.#filters.push({ type: 'where', field, operator, value });
        return this;
    }

    and(field, operator, value) {
        this.#filters.push({ type: 'and', field, operator, value });
        return this;
    }

    or(field, operator, value) {
        this.#filters.push({ type: 'or', field, operator, value });
        return this;
    }

    useIndex(indexName) {
        this.#useIndex = indexName;
        return this;
    }

    limit(count) {
        this.#limitCount = Math.max(0, count);
        return this;
    }

    offset(start) {
        this.#offsetCount = Math.max(0, start);
        return this;
    }

    orderBy(field, direction = 'asc') {
        this.#orderField = field;
        this.#orderDirection = direction === 'asc' ? 'next' : 'prev';
        return this;
    }

    async execute() {
        return this.#connection.measure('query', async () => {
            const allData = await this.#connection.getAll(this.#storeName);

            // اعمال فیلتر
            let filtered = this.#applyFilters(allData);

            // اعمال مرتب‌سازی
            filtered = this.#applySorting(filtered);

            // اعمال صفحه‌بندی
            filtered = this.#applyPagination(filtered);

            return filtered;
        });
    }

    async explain() {
        return {
            store: this.#storeName,
            filters: this.#filters,
            orderBy: this.#orderField ? {
                field: this.#orderField,
                direction: this.#orderDirection === 'next' ? 'asc' : 'desc'
            } : null,
            limit: this.#limitCount,
            offset: this.#offsetCount,
            estimatedResults: (await this.#connection.count(this.#storeName))
        };
    }

    #applyFilters(data) {
        if (this.#filters.length === 0) return data;

        return data.filter(item => {
            let result = true;
            let orResult = false;

            for (const filter of this.#filters) {
                const { type, field, operator, value } = filter;
                const match = this.#evaluateCondition(item[field], operator, value);

                if (type === 'where' || type === 'and') {
                    result = result && match;
                } else if (type === 'or') {
                    orResult = orResult || match;
                }
            }

            return result || orResult;
        });
    }

    #evaluateCondition(value, operator, compareValue) {
        switch (operator) {
            case '==': return value === compareValue;
            case '!=': return value !== compareValue;
            case '>': return value > compareValue;
            case '>=': return value >= compareValue;
            case '<': return value < compareValue;
            case '<=': return value <= compareValue;
            case 'includes': return value?.includes(compareValue);
            case 'startsWith': return value?.startsWith(compareValue);
            case 'endsWith': return value?.endsWith(compareValue);
            case 'between': return value >= compareValue[0] && value <= compareValue[1];
            case 'in': return compareValue.includes(value);
            default: return true;
        }
    }

    #applySorting(data) {
        if (!this.#orderField) return data;

        return [...data].sort((a, b) => {
            const aVal = a[this.#orderField];
            const bVal = b[this.#orderField];

            if (this.#orderDirection === 'next') {
                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            } else {
                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            }
        });
    }

    #applyPagination(data) {
        let result = data;

        if (this.#offsetCount > 0) {
            result = result.slice(this.#offsetCount);
        }

        if (this.#limitCount !== null) {
            result = result.slice(0, this.#limitCount);
        }

        return result;
    }
}

// ================================================
// پیاده‌سازی Transaction Manager
// ================================================

class TransactionManager {
    #connection;

    constructor(connection) {
        this.#connection = connection;
    }

    async runInTransaction(storeNames, operations, mode = 'readwrite') {
        return this.#connection.measure('transaction', async () => {
            const stores = Array.isArray(storeNames) ? storeNames : [storeNames];
            const transaction = this.#connection.transaction(stores, mode);

            return new Promise((resolve, reject) => {
                const results = [];

                transaction.oncomplete = () => resolve(results);
                transaction.onerror = (event) => reject(event.target.error);
                transaction.onabort = (event) => reject(new Error('Transaction aborted'));

                operations(transaction, results);
            });
        });
    }

    async atomic(storeName, key, updateFn) {
        return this.runInTransaction(storeName, async (transaction, results) => {
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => {
                const oldData = request.result;
                const newData = updateFn(oldData);

                const putRequest = store.put(newData);
                putRequest.onsuccess = () => results.push(newData);
            };
        });
    }

    async atomicUpdate(storeName, key, updates) {
        return this.atomic(storeName, key, (oldData) => ({
            ...oldData,
            ...updates,
            updated_at: new Date().toISOString()
        }));
    }
}

// ================================================
// پیاده‌سازی Backup/Restore
// ================================================

class DatabaseBackup {
    static async backup(connection, storeNames) {
        const backup = {};

        for (const storeName of storeNames) {
            backup[storeName] = await connection.getAll(storeName);
        }

        const backupStr = JSON.stringify(backup);
        const compressed = await this.#compress(backupStr);

        return {
            data: compressed,
            timestamp: Date.now(),
            stores: storeNames,
            version: connection.databaseVersion,
            size: compressed.length
        };
    }

    static async restore(connection, backupData) {
        const decompressed = await this.#decompress(backupData.data);
        const backup = JSON.parse(decompressed);

        const transaction = connection.transaction(backupData.stores, 'readwrite');

        return new Promise((resolve, reject) => {
            let completed = 0;
            const total = backupData.stores.length;

            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(new Error('Restore failed'));

            for (const [storeName, items] of Object.entries(backup)) {
                const store = transaction.objectStore(storeName);
                store.clear().onsuccess = () => {
                    items.forEach(item => store.add(item));
                    completed++;
                };
            }
        });
    }

    static async #compress(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const compressed = await this.#deflate(data);
        return btoa(String.fromCharCode(...new Uint8Array(compressed)));
    }

    static async #decompress(compressed) {
        const binary = atob(compressed);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const decompressed = await this.#inflate(bytes);
        return new TextDecoder().decode(decompressed);
    }

    static async #deflate(data) {
        const cs = new CompressionStream('deflate');
        const writer = cs.writable.getWriter();
        writer.write(data);
        writer.close();
        const compressed = await new Response(cs.readable).arrayBuffer();
        return new Uint8Array(compressed);
    }

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
// پیاده‌سازی Connection Pool
// ================================================

class ConnectionPoolManager {
    #pools = new Map();
    #maxConnections = 5;
    #connectionFactory;

    constructor(connectionFactory, maxConnections = 5) {
        this.#connectionFactory = connectionFactory;
        this.#maxConnections = maxConnections;
    }

    async getConnection(dbName, version, schemaManager) {
        const key = `${dbName}_${version}`;

        if (!this.#pools.has(key)) {
            this.#pools.set(key, []);
        }

        const pool = this.#pools.get(key);

        // استفاده از اتصال موجود
        if (pool.length > 0) {
            const connection = pool.pop();
            await connection.open();
            return connection;
        }

        // ایجاد اتصال جدید
        const connection = this.#connectionFactory.createConnection(dbName, version, schemaManager);
        await connection.open();
        return connection;
    }

    releaseConnection(dbName, version, connection) {
        const key = `${dbName}_${version}`;
        const pool = this.#pools.get(key) || [];

        if (pool.length < this.#maxConnections) {
            pool.push(connection);
        } else {
            connection.close();
        }
    }

    async closeAll() {
        for (const [key, pool] of this.#pools) {
            for (const connection of pool) {
                await connection.close();
            }
        }
        this.#pools.clear();
    }
}

// ================================================
// پیاده‌سازی اصلی IndexedDB Connection
// ================================================

class IndexedDBConnection extends DatabaseConnection {
    #db = null;
    #dbName = '';
    #dbVersion = 1;
    #isOpen = false;
    #openPromise = null;
    #schemaManager = null;
    #transactionManager = null;
    #performanceMonitor = null;
    #cacheLayer = null;
    #retryConfig = {
        maxRetries: 3,
        initialDelay: 100,
        maxDelay: 3000
    };

    constructor(dbName, dbVersion, schemaManager, options = {}) {
        super();
        this.#dbName = dbName;
        this.#dbVersion = dbVersion;
        this.#schemaManager = schemaManager;
        this.#performanceMonitor = options.performanceMonitor || new DatabasePerformanceMonitor();
        this.#cacheLayer = options.cacheLayer || new MemoryCacheLayer();
        this.#transactionManager = new TransactionManager(this);
    }

    async measure(operation, fn) {
        return this.#performanceMonitor.measure(operation, fn);
    }

    async #withRetry(operation, context = '') {
        let lastError;
        let delay = this.#retryConfig.initialDelay;

        for (let i = 0; i < this.#retryConfig.maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Retry ${i + 1}/${this.#retryConfig.maxRetries} for ${context}:`, error.message);

                if (i < this.#retryConfig.maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay = Math.min(delay * 2, this.#retryConfig.maxDelay);
                }
            }
        }

        throw new Error(`Operation failed after ${this.#retryConfig.maxRetries} retries: ${lastError.message}`);
    }

    async open() {
        if (!IndexedDBFeatureDetector.isSupported()) {
            throw new Error('IndexedDB is not supported in this browser');
        }

        if (this.#isOpen && this.#db) {
            return this.#db;
        }

        if (this.#openPromise) {
            return this.#openPromise;
        }

        this.#openPromise = this.#withRetry(async () => {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.#dbName, this.#dbVersion);

                request.onerror = (event) => {
                    console.error('❌ IndexedDB open error:', event.target.error);
                    reject(new Error(`Failed to open database: ${event.target.error.message}`));
                };

                request.onsuccess = (event) => {
                    this.#db = event.target.result;
                    this.#isOpen = true;
                    this.#openPromise = null;

                    this.#db.onclose = () => {
                        this.#isOpen = false;
                        this.#db = null;
                        console.warn('⚠️ Database connection closed unexpectedly');
                        this.#cacheLayer.clear();
                    };

                    this.#db.onerror = (event) => {
                        console.error('❌ Database error:', event.target.error);
                        this.#cacheLayer.clear();
                    };

                    this.#db.onversionchange = () => {
                        this.#db.close();
                        this.#isOpen = false;
                        this.#db = null;
                        this.#cacheLayer.clear();
                        console.warn('⚠️ Database version changed, connection closed');
                    };

                    console.log(`✅ IndexedDB connected: ${this.#dbName} v${this.#dbVersion}`);
                    resolve(this.#db);
                };

                request.onupgradeneeded = async (event) => {
                    const db = event.target.result;
                    const oldVersion = event.oldVersion;
                    const newVersion = event.newVersion;

                    try {
                        await this.#schemaManager.migrate(db, oldVersion, newVersion);
                        console.log(`🔄 Database migrated: ${oldVersion} → ${newVersion}`);
                    } catch (error) {
                        console.error('❌ Migration failed:', error);
                        reject(error);
                    }
                };
            });
        }, 'open database');

        return this.#openPromise;
    }

    async close() {
        return this.#withRetry(async () => {
            if (this.#db && this.#isOpen) {
                this.#db.close();
                this.#isOpen = false;
                this.#db = null;
                this.#cacheLayer.clear();
                console.log('🔒 Database connection closed');
            }
        }, 'close database');
    }

    async get(storeName, key) {
        const cacheKey = `${storeName}:${key}`;
        const cached = this.#cacheLayer.get(cacheKey);

        if (cached !== null) {
            return cached;
        }

        return this.measure('get', async () => {
            await this.#ensureConnection();

            return this.#withRetry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#createTransaction(storeName, 'readonly');
                    const store = transaction.objectStore(storeName);
                    const request = store.get(key);

                    request.onsuccess = () => {
                        const result = request.result || null;
                        if (result) {
                            this.#cacheLayer.set(cacheKey, result);
                        }
                        resolve(result);
                    };

                    request.onerror = () => reject(new Error(`Failed to get ${storeName}:${key}`));
                });
            }, `get ${storeName}:${key}`);
        });
    }

    async getAll(storeName) {
        const cacheKey = `${storeName}:all`;
        const cached = this.#cacheLayer.get(cacheKey);

        if (cached !== null) {
            return cached;
        }

        return this.measure('getAll', async () => {
            await this.#ensureConnection();

            return this.#withRetry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#createTransaction(storeName, 'readonly');
                    const store = transaction.objectStore(storeName);
                    const request = store.getAll();

                    request.onsuccess = () => {
                        const result = request.result || [];
                        this.#cacheLayer.set(cacheKey, result);
                        resolve(result);
                    };

                    request.onerror = () => reject(new Error(`Failed to get all from ${storeName}`));
                });
            }, `getAll ${storeName}`);
        });
    }

    async save(storeName, data) {
        if (!this.#schemaManager.validateSchema(storeName, data)) {
            throw new Error(`Invalid data for store: ${storeName}`);
        }

        return this.measure('save', async () => {
            await this.#ensureConnection();

            return this.#withRetry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#createTransaction(storeName, 'readwrite');
                    const store = transaction.objectStore(storeName);

                    const request = data.id ? store.put(data) : store.add(data);

                    request.onsuccess = () => {
                        const key = request.result;
                        console.log(`✅ Saved to ${storeName}:`, data.id || key);

                        // پاک کردن کش مرتبط
                        this.#cacheLayer.invalidate(storeName);

                        resolve(key);
                    };

                    request.onerror = () => reject(new Error(`Failed to save to ${storeName}`));
                });
            }, `save ${storeName}`);
        });
    }

    async saveBatch(storeName, items) {
        return this.measure('saveBatch', async () => {
            await this.#ensureConnection();

            return this.#withRetry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#createTransaction(storeName, 'readwrite');
                    const store = transaction.objectStore(storeName);

                    const results = [];
                    let completed = 0;

                    transaction.oncomplete = () => {
                        this.#cacheLayer.invalidate(storeName);
                        resolve(results);
                    };

                    transaction.onerror = () => reject(new Error('Batch save failed'));

                    items.forEach((item, index) => {
                        const request = item.id ? store.put(item) : store.add(item);

                        request.onsuccess = () => {
                            results[index] = request.result;
                            completed++;
                        };
                    });
                });
            }, `saveBatch ${storeName}`);
        });
    }

    async delete(storeName, key) {
        return this.measure('delete', async () => {
            await this.#ensureConnection();

            return this.#withRetry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#createTransaction(storeName, 'readwrite');
                    const store = transaction.objectStore(storeName);
                    const request = store.delete(key);

                    request.onsuccess = () => {
                        console.log(`🗑️ Deleted from ${storeName}:`, key);
                        this.#cacheLayer.delete(`${storeName}:${key}`);
                        this.#cacheLayer.invalidate(storeName);
                        resolve();
                    };

                    request.onerror = () => reject(new Error(`Failed to delete from ${storeName}`));
                });
            }, `delete ${storeName}:${key}`);
        });
    }

    async deleteBatch(storeName, keys) {
        return this.measure('deleteBatch', async () => {
            await this.#ensureConnection();

            return this.#withRetry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#createTransaction(storeName, 'readwrite');
                    const store = transaction.objectStore(storeName);

                    let completed = 0;

                    transaction.oncomplete = () => {
                        keys.forEach(key => this.#cacheLayer.delete(`${storeName}:${key}`));
                        this.#cacheLayer.invalidate(storeName);
                        resolve();
                    };

                    transaction.onerror = () => reject(new Error('Batch delete failed'));

                    keys.forEach(key => {
                        const request = store.delete(key);
                        request.onsuccess = () => completed++;
                    });
                });
            }, `deleteBatch ${storeName}`);
        });
    }

    async clear(storeName) {
        return this.measure('clear', async () => {
            await this.#ensureConnection();

            return this.#withRetry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#createTransaction(storeName, 'readwrite');
                    const store = transaction.objectStore(storeName);
                    const request = store.clear();

                    request.onsuccess = () => {
                        console.log(`🧹 Cleared store: ${storeName}`);
                        this.#cacheLayer.invalidate(storeName);
                        resolve();
                    };

                    request.onerror = () => reject(new Error(`Failed to clear ${storeName}`));
                });
            }, `clear ${storeName}`);
        });
    }

    async count(storeName) {
        return this.measure('count', async () => {
            await this.#ensureConnection();

            return this.#withRetry(async () => {
                return new Promise((resolve, reject) => {
                    const transaction = this.#createTransaction(storeName, 'readonly');
                    const store = transaction.objectStore(storeName);
                    const request = store.count();

                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(new Error(`Failed to count ${storeName}`));
                });
            }, `count ${storeName}`);
        });
    }

    transaction(storeNames, mode = 'readonly') {
        if (!this.#db || !this.#isOpen) {
            throw new Error('Database not connected');
        }
        return this.#db.transaction(storeNames, mode);
    }

    query(storeName) {
        return new IndexedDBQueryBuilder(this, storeName);
    }

    getTransactionManager() {
        return this.#transactionManager;
    }

    getBackupManager() {
        return DatabaseBackup;
    }

    getPerformanceStats(operation) {
        return this.#performanceMonitor.getStats(operation);
    }

    async #ensureConnection() {
        if (!this.#isOpen || !this.#db) {
            await this.open();
        }
    }

    #createTransaction(storeName, mode) {
        const transaction = this.#db.transaction(storeName, mode);

        transaction.onerror = (event) => {
            console.error(`❌ Transaction error on ${storeName}:`, event.target.error);
        };

        transaction.onabort = (event) => {
            console.warn(`⚠️ Transaction aborted on ${storeName}:`, event.target.error);
        };

        return transaction;
    }

    get isConnected() {
        return this.#isOpen && this.#db !== null;
    }

    get databaseName() {
        return this.#dbName;
    }

    get databaseVersion() {
        return this.#dbVersion;
    }

    get cacheStats() {
        return {
            size: this.#cacheLayer.size,
            enabled: true
        };
    }
}

// ================================================
// Versioned Schema Manager
// ================================================

class VersionedSchemaManager extends SchemaManager {
    #stores = new Map();
    #migrations = new Map();
    #currentVersion = 1;

    constructor(version = 1) {
        super();
        this.#currentVersion = version;
    }

    registerStore(name, schema) {
        this.#stores.set(name, schema);
    }

    registerMigration(fromVersion, toVersion, migrationFn) {
        const key = `${fromVersion}->${toVersion}`;
        this.#migrations.set(key, migrationFn);
    }

    async migrate(db, oldVersion, newVersion) {
        if (oldVersion === 0) {
            await this.#createInitialSchema(db);
        } else {
            await this.#applyMigrations(db, oldVersion, newVersion);
        }
    }

    async #createInitialSchema(db) {
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

    async #applyMigrations(db, oldVersion, newVersion) {
        for (let v = oldVersion; v < newVersion; v++) {
            const migrationKey = `${v}->${v + 1}`;
            const migration = this.#migrations.get(migrationKey);

            if (migration) {
                await migration(db);
                console.log(`✅ Migration ${migrationKey} applied`);
            }
        }
    }

    getCurrentVersion() {
        return this.#currentVersion;
    }

    validateSchema(storeName, data) {
        const schema = this.#stores.get(storeName);
        if (!schema) {
            console.warn(`⚠️ No schema registered for store: ${storeName}`);
            return true;
        }

        if (schema.requiredFields) {
            for (const field of schema.requiredFields) {
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
}

// ================================================
// Factory و Singleton
// ================================================

class DatabaseFactory {
    static #instance = null;
    static #connections = new Map();
    #poolManager = null;

    constructor() {
        if (DatabaseFactory.#instance) {
            return DatabaseFactory.#instance;
        }
        this.#poolManager = new ConnectionPoolManager(this);
        DatabaseFactory.#instance = this;
    }

    static getInstance() {
        if (!DatabaseFactory.#instance) {
            DatabaseFactory.#instance = new DatabaseFactory();
        }
        return DatabaseFactory.#instance;
    }

    createConnection(dbName, version, schemaManager, options = {}) {
        const key = `${dbName}_${version}`;

        if (!DatabaseFactory.#connections.has(key)) {
            const connection = new IndexedDBConnection(
                dbName,
                version,
                schemaManager,
                {
                    cacheLayer: options.cacheLayer || new MemoryCacheLayer(),
                    performanceMonitor: options.performanceMonitor || new DatabasePerformanceMonitor()
                }
            );
            DatabaseFactory.#connections.set(key, connection);
        }

        return DatabaseFactory.#connections.get(key);
    }

    async getPooledConnection(dbName, version, schemaManager, options = {}) {
        return this.#poolManager.getConnection(dbName, version, schemaManager);
    }

    releaseConnection(dbName, version, connection) {
        this.#poolManager.releaseConnection(dbName, version, connection);
    }

    async closeAllConnections() {
        await this.#poolManager.closeAll();

        const closePromises = [];
        for (const [key, connection] of DatabaseFactory.#connections) {
            closePromises.push(connection.close());
        }
        await Promise.all(closePromises);
        DatabaseFactory.#connections.clear();
    }
}

// ================================================
// Export
// ================================================

const dbFactory = DatabaseFactory.getInstance();

export {
    // اینترفیس‌ها
    DatabaseConnection,
    SchemaManager,
    QueryBuilder,
    PerformanceMonitor,
    CacheLayer,

    // پیاده‌سازی‌های اصلی
    IndexedDBConnection,
    IndexedDBQueryBuilder,
    VersionedSchemaManager,
    DatabaseFactory,
    DatabasePerformanceMonitor,
    MemoryCacheLayer,
    ConnectionPoolManager,
    DatabaseBackup,
    TransactionManager,
    IndexedDBFeatureDetector,

    // Factory instance
    dbFactory as default
};
