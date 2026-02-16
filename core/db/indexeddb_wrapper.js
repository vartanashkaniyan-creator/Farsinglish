
/**
 * core/db/indexeddb-wrapper.js
 * 
 * پیاده‌سازی الگوی Singleton برای مدیریت اتصال IndexedDB
 * با رعایت اصول SOLID و معماری لایه‌ای
 * 
 * اصول رعایت شده:
 * - Singleton Pattern (تک‌نمونه)
 * - Dependency Inversion (وابستگی به انتزاع)
 * - Single Responsibility (تک‌وظیفگی)
 * - Interface Segregation (جداسازی اینترفیس)
 * - Open/Closed (قابل توسعه بدون تغییر)
 */

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
    async delete(storeName, key) { throw new Error('Not implemented'); }
    async clear(storeName) { throw new Error('Not implemented'); }
    transaction(storeNames, mode) { throw new Error('Not implemented'); }
}

/**
 * @interface SchemaManager
 * قرارداد مدیریت نسخه و اسکیما
 */
class SchemaManager {
    async migrate(db, oldVersion, newVersion) { throw new Error('Not implemented'); }
    getCurrentVersion() { throw new Error('Not implemented'); }
    validateSchema(storeName, data) { throw new Error('Not implemented'); }
}

/**
 * @interface QueryBuilder
 * قرارداد ساخت کوئری
 */
class QueryBuilder {
    where(field, operator, value) { throw new Error('Not implemented'); }
    limit(count) { throw new Error('Not implemented'); }
    offset(start) { throw new Error('Not implemented'); }
    orderBy(field, direction) { throw new Error('Not implemented'); }
    execute() { throw new Error('Not implemented'); }
}

// ================================================
// پیاده‌سازی اصلی
// ================================================

/**
 * @class IndexedDBConnection
 * پیاده‌سازی Concrete اتصال IndexedDB
 * @implements {DatabaseConnection}
 */
class IndexedDBConnection extends DatabaseConnection {
    #db = null;
    #dbName = '';
    #dbVersion = 1;
    #isOpen = false;
    #openPromise = null;
    #schemaManager = null;

    /**
     * @param {string} dbName - نام دیتابیس
     * @param {number} dbVersion - نسخه دیتابیس
     * @param {SchemaManager} schemaManager - مدیریت اسکیما
     */
    constructor(dbName, dbVersion, schemaManager) {
        super();
        this.#dbName = dbName;
        this.#dbVersion = dbVersion;
        this.#schemaManager = schemaManager;
    }

    /**
     * باز کردن اتصال دیتابیس
     * @returns {Promise<IDBDatabase>}
     */
    async open() {
        if (this.#isOpen && this.#db) {
            return this.#db;
        }

        if (this.#openPromise) {
            return this.#openPromise;
        }

        this.#openPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.#dbName, this.#dbVersion);

            request.onerror = (event) => {
                console.error('❌ IndexedDB open error:', event.target.error);
                reject(new Error(`Failed to open database: ${event.target.error.message}`));
            };

            request.onsuccess = (event) => {
                this.#db = event.target.result;
                this.#isOpen = true;
                this.#openPromise = null;
                
                // رویداد قطع اتصال
                this.#db.onclose = () => {
                    this.#isOpen = false;
                    this.#db = null;
                    console.warn('⚠️ Database connection closed unexpectedly');
                };

                // رویداد خطا
                this.#db.onerror = (event) => {
                    console.error('❌ Database error:', event.target.error);
                };

                // رویداد نسخه‌گذاری
                this.#db.onversionchange = () => {
                    this.#db.close();
                    this.#isOpen = false;
                    this.#db = null;
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

        return this.#openPromise;
    }

    /**
     * بستن اتصال دیتابیس
     * @returns {Promise<void>}
     */
    async close() {
        if (this.#db && this.#isOpen) {
            this.#db.close();
            this.#isOpen = false;
            this.#db = null;
            console.log('🔒 Database connection closed');
        }
    }

    /**
     * دریافت یک رکورد
     * @param {string} storeName - نام ذخیره‌گاه
     * @param {IDBValidKey} key - کلید رکورد
     * @returns {Promise<any>}
     */
    async get(storeName, key) {
        await this.#ensureConnection();
        
        return new Promise((resolve, reject) => {
            const transaction = this.#createTransaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(new Error(`Failed to get ${storeName}:${key}`));
        });
    }

    /**
     * دریافت همه رکوردهای یک ذخیره‌گاه
     * @param {string} storeName - نام ذخیره‌گاه
     * @returns {Promise<Array>}
     */
    async getAll(storeName) {
        await this.#ensureConnection();
        
        return new Promise((resolve, reject) => {
            const transaction = this.#createTransaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(new Error(`Failed to get all from ${storeName}`));
        });
    }

    /**
     * ذخیره یک رکورد
     * @param {string} storeName - نام ذخیره‌گاه
     * @param {Object} data - داده مورد نظر
     * @returns {Promise<IDBValidKey>}
     */
    async save(storeName, data) {
        // اعتبارسنجی داده
        if (!this.#schemaManager.validateSchema(storeName, data)) {
            throw new Error(`Invalid data for store: ${storeName}`);
        }

        await this.#ensureConnection();
        
        return new Promise((resolve, reject) => {
            const transaction = this.#createTransaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            
            // اگر data.id وجود دارد، آپدیت می‌کنیم
            const request = data.id ? store.put(data) : store.add(data);

            request.onsuccess = () => {
                console.log(`✅ Saved to ${storeName}:`, data.id || request.result);
                resolve(request.result);
            };
            
            request.onerror = () => reject(new Error(`Failed to save to ${storeName}`));
        });
    }

    /**
     * حذف یک رکورد
     * @param {string} storeName - نام ذخیره‌گاه
     * @param {IDBValidKey} key - کلید رکورد
     * @returns {Promise<void>}
     */
    async delete(storeName, key) {
        await this.#ensureConnection();
        
        return new Promise((resolve, reject) => {
            const transaction = this.#createTransaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => {
                console.log(`🗑️ Deleted from ${storeName}:`, key);
                resolve();
            };
            
            request.onerror = () => reject(new Error(`Failed to delete from ${storeName}`));
        });
    }

    /**
     * پاک کردن همه رکوردهای یک ذخیره‌گاه
     * @param {string} storeName - نام ذخیره‌گاه
     * @returns {Promise<void>}
     */
    async clear(storeName) {
        await this.#ensureConnection();
        
        return new Promise((resolve, reject) => {
            const transaction = this.#createTransaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => {
                console.log(`🧹 Cleared store: ${storeName}`);
                resolve();
            };
            
            request.onerror = () => reject(new Error(`Failed to clear ${storeName}`));
        });
    }

    /**
     * ایجاد تراکنش
     * @param {string|Array} storeNames - نام ذخیره‌گاه‌ها
     * @param {string} mode - حالت تراکنش
     * @returns {IDBTransaction}
     */
    transaction(storeNames, mode = 'readonly') {
        if (!this.#db || !this.#isOpen) {
            throw new Error('Database not connected');
        }
        return this.#db.transaction(storeNames, mode);
    }

    /**
     * ایجاد کوئری‌ساز
     * @param {string} storeName - نام ذخیره‌گاه
     * @returns {QueryBuilder}
     */
    query(storeName) {
        return new IndexedDBQueryBuilder(this, storeName);
    }

    /**
     * اطمینان از وجود اتصال
     * @private
     */
    async #ensureConnection() {
        if (!this.#isOpen || !this.#db) {
            await this.open();
        }
    }

    /**
     * ایجاد تراکنش با مدیریت خطا
     * @private
     */
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

    /**
     * وضعیت فعلی اتصال
     */
    get isConnected() {
        return this.#isOpen && this.#db !== null;
    }

    /**
     * نام دیتابیس
     */
    get databaseName() {
        return this.#dbName;
    }

    /**
     * نسخه دیتابیس
     */
    get databaseVersion() {
        return this.#dbVersion;
    }
}

/**
 * @class IndexedDBQueryBuilder
 * @implements {QueryBuilder}
 * ساخت کوئری برای IndexedDB
 */
class IndexedDBQueryBuilder extends QueryBuilder {
    #connection = null;
    #storeName = '';
    #filters = [];
    #limitCount = null;
    #offsetCount = 0;
    #orderField = null;
    #orderDirection = 'next';

    constructor(connection, storeName) {
        super();
        this.#connection = connection;
        this.#storeName = storeName;
    }

    where(field, operator, value) {
        this.#filters.push({ field, operator, value });
        return this;
    }

    limit(count) {
        this.#limitCount = count;
        return this;
    }

    offset(start) {
        this.#offsetCount = start;
        return this;
    }

    orderBy(field, direction = 'asc') {
        this.#orderField = field;
        this.#orderDirection = direction === 'asc' ? 'next' : 'prev';
        return this;
    }

    async execute() {
        const allData = await this.#connection.getAll(this.#storeName);
        
        // اعمال فیلتر
        let filtered = this.#applyFilters(allData);
        
        // اعمال مرتب‌سازی
        filtered = this.#applySorting(filtered);
        
        // اعمال صفحه‌بندی
        filtered = this.#applyPagination(filtered);
        
        return filtered;
    }

    #applyFilters(data) {
        if (this.#filters.length === 0) return data;

        return data.filter(item => {
            return this.#filters.every(filter => {
                const { field, operator, value } = filter;
                
                switch (operator) {
                    case '==': return item[field] === value;
                    case '!=': return item[field] !== value;
                    case '>': return item[field] > value;
                    case '>=': return item[field] >= value;
                    case '<': return item[field] < value;
                    case '<=': return item[field] <= value;
                    case 'includes': return item[field]?.includes(value);
                    default: return true;
                }
            });
        });
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
// Factory و Singleton
// ================================================

/**
 * @class DatabaseFactory
 * کارخانه ایجاد اتصال دیتابیس
 */
class DatabaseFactory {
    static #instance = null;
    static #connections = new Map();

    /**
     * دریافت نمونه Singleton
     * @returns {DatabaseFactory}
     */
    static getInstance() {
        if (!DatabaseFactory.#instance) {
            DatabaseFactory.#instance = new DatabaseFactory();
        }
        return DatabaseFactory.#instance;
    }

    /**
     * ایجاد یا دریافت اتصال دیتابیس
     * @param {string} dbName - نام دیتابیس
     * @param {number} version - نسخه
     * @param {SchemaManager} schemaManager - مدیریت اسکیما
     * @returns {IndexedDBConnection}
     */
    createConnection(dbName, version, schemaManager) {
        const key = `${dbName}_${version}`;
        
        if (!DatabaseFactory.#connections.has(key)) {
            const connection = new IndexedDBConnection(dbName, version, schemaManager);
            DatabaseFactory.#connections.set(key, connection);
        }
        
        return DatabaseFactory.#connections.get(key);
    }

    /**
     * بستن همه اتصال‌ها
     */
    async closeAllConnections() {
        const closePromises = [];
        for (const [key, connection] of DatabaseFactory.#connections) {
            closePromises.push(connection.close());
        }
        await Promise.all(closePromises);
        DatabaseFactory.#connections.clear();
    }
}

// ================================================
// Schema Manager پیش‌فرض
// ================================================

/**
 * @class DefaultSchemaManager
 * @implements {SchemaManager}
 * مدیریت اسکیما پیش‌فرض
 */
class DefaultSchemaManager extends SchemaManager {
    #stores = new Map();
    #currentVersion = 1;

    constructor(version = 1) {
        super();
        this.#currentVersion = version;
    }

    /**
     * ثبت یک ذخیره‌گاه
     * @param {string} name - نام ذخیره‌گاه
     * @param {Object} schema - اسکیما
     */
    registerStore(name, schema) {
        this.#stores.set(name, schema);
    }

    async migrate(db, oldVersion, newVersion) {
        // ایجاد ذخیره‌گاه‌ها در نسخه اول
        if (oldVersion === 0) {
            for (const [name, schema] of this.#stores) {
                if (!db.objectStoreNames.contains(name)) {
                    const store = db.createObjectStore(name, schema.options || { autoIncrement: true });
                    
                    // ایجاد ایندکس‌ها
                    if (schema.indexes) {
                        for (const index of schema.indexes) {
                            store.createIndex(index.name, index.keyPath, index.options);
                        }
                    }
                }
            }
        }
    }

    getCurrentVersion() {
        return this.#currentVersion;
    }

    validateSchema(storeName, data) {
        const schema = this.#stores.get(storeName);
        if (!schema) return true; // اگر اسکیما ثبت نشده، رد می‌کنیم

        // اعتبارسنجی ساده
        if (schema.requiredFields) {
            for (const field of schema.requiredFields) {
                if (data[field] === undefined || data[field] === null) {
                    console.warn(`⚠️ Missing required field: ${field}`);
                    return false;
                }
            }
        }

        return true;
    }
}

// ================================================
// خروجی نهایی (API عمومی)
// ================================================

const dbFactory = DatabaseFactory.getInstance();

export {
    DatabaseConnection,
    SchemaManager,
    QueryBuilder,
    IndexedDBConnection,
    IndexedDBQueryBuilder,
    DatabaseFactory,
    DefaultSchemaManager,
    dbFactory as default
};
