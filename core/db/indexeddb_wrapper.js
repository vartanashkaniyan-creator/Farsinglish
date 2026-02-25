/**
 * indexeddb_wrapper.js
 * Alpha-compliant, Enterprise-ready, Fluent Interface, Bulk & Advanced Transactions
 * Author: Farsinglish Team
 * Version: 5.0.0
 */

import { EventEmitter } from 'events';

// ==========================================
// 1. Database Error
// ==========================================
class database_error extends Error {
    constructor(message, original_error = null) {
        super(message);
        this.name = 'DatabaseError';
        this.original_error = original_error;
    }
}

// ==========================================
// 2. Store Validator
// ==========================================
class store_validator {
    static validate_store_name(store_name) {
        if (!store_name || typeof store_name !== 'string') throw new database_error('Invalid store name');
    }
    static validate_key(key) {
        if (key === undefined || key === null) throw new database_error('Invalid key');
    }
    static validate_value(value) {
        if (value === undefined) throw new database_error('Invalid value');
    }
}

// ==========================================
// 3. Query Operator
// ==========================================
const query_operator = {
    EQUALS: '==', NOT_EQUALS: '!=', GREATER_THAN: '>', GREATER_THAN_OR_EQUAL: '>=',
    LESS_THAN: '<', LESS_THAN_OR_EQUAL: '<=', INCLUDES: 'includes',
    STARTS_WITH: 'starts_with', ENDS_WITH: 'ends_with', BETWEEN: 'between', IN: 'in'
};

// ==========================================
// 4. Event Manager
// ==========================================
class event_observable_manager extends EventEmitter {
    subscribe(store_name, callback) { this.on(`store:${store_name}`, callback); return this; }
    notify(store_name, data) { this.emit(`store:${store_name}`, data); return this; }
}

// ==========================================
// 5. Connection Pool
// ==========================================
class connection_pool {
    static #pool = []; static #max_size = 5; static #current_size = 0;
    static async acquire(create_fn) {
        if (this.#pool.length > 0) return this.#pool.pop();
        if (this.#current_size < this.#max_size) { this.#current_size++; return await create_fn(); }
        return new Promise(resolve => setTimeout(async () => resolve(await this.acquire(create_fn)), 50));
    }
    static release(conn) {
        if (this.#pool.length < this.#max_size) this.#pool.push(conn);
        else if (conn.close) { conn.close(); this.#current_size--; }
    }
}

// ==========================================
// 6. Query Cache
// ==========================================
class query_cache {
    #cache = new Map();
    get(key) { const r = this.#cache.get(key); if (!r) return null; if (r.expires && r.expires < Date.now()) { this.#cache.delete(key); return null; } return r.value; }
    set(key, value, ttl = 5000) { this.#cache.set(key, { value, expires: ttl ? Date.now() + ttl : null }); return this; }
    clear() { this.#cache.clear(); return this; }
}

// ==========================================
// 7. Performance Monitor
// ==========================================
class performance_monitor {
    #metrics = new Map();
    async measure(operation, fn) { const start = performance.now(); const result = await fn(); const end = performance.now(); this.#metrics.set(operation, [...(this.#metrics.get(operation) || []), end - start]); return result; }
    get_metrics(operation) { return this.#metrics.get(operation) || []; }
}

// ==========================================
// 8. Schema Manager
// ==========================================
class schema_manager {
    #schemas = new Map();
    register_store(store_name, schema) { this.#schemas.set(store_name, schema); return this; }
    validate_schema(store_name, data) {
        const schema = this.#schemas.get(store_name); if (!schema) return true;
        for (const [field, type] of Object.entries(schema)) {
            if (data[field] !== undefined && typeof data[field] !== type) throw new database_error(`Invalid type for ${field}`);
        }
        return true;
    }
}

// ==========================================
// 9. Transaction Manager (Advanced)
// ==========================================
class transaction_manager {
    #db;
    constructor(db) { this.#db = db; }
    
    async run_in_transaction(stores, callback, retries = 3) {
        for (let attempt = 0; attempt < retries; attempt++) {
            const tx = this.#db.transaction(stores, 'readwrite');
            try { return await callback(tx); }
            catch (err) {
                tx.abort();
                if (attempt === retries - 1) throw err;
                await new Promise(r => setTimeout(r, 50 * Math.pow(2, attempt)));
            }
        }
    }

    async run_bulk(operations = [], retries = 3) {
        return this.run_in_transaction([...new Set(operations.map(op => op.store_name))], async tx => {
            for (const op of operations) {
                const store = tx.objectStore(op.store_name);
                if (op.type === 'put') store.put(op.value, op.key);
                if (op.type === 'delete') store.delete(op.key);
            }
            return true;
        }, retries);
    }
}

// ==========================================
// 10. Filter Expression (Advanced Query)
// ==========================================
class filter_expression {
    constructor(type = 'condition') { this.type = type; this.conditions = []; this.condition = null; }
    add_condition(expr) { expr instanceof filter_expression ? this.conditions.push(expr) : this.condition = expr; return this; }
    evaluate(item) {
        if (this.type === 'condition') return this.#eval_condition(item);
        if (this.type === 'and') return this.conditions.every(c => c.evaluate(item));
        if (this.type === 'or') return this.conditions.some(c => c.evaluate(item));
        return true;
    }
    #eval_condition(item) {
        if (!this.condition) return true;
        const { field, operator, value } = this.condition;
        const val = item[field];
        switch(operator) {
            case query_operator.EQUALS: return val === value;
            case query_operator.NOT_EQUALS: return val !== value;
            case query_operator.GREATER_THAN: return val > value;
            case query_operator.GREATER_THAN_OR_EQUAL: return val >= value;
            case query_operator.LESS_THAN: return val < value;
            case query_operator.LESS_THAN_OR_EQUAL: return val <= value;
            case query_operator.IN: return Array.isArray(value) && value.includes(val);
            case query_operator.BETWEEN: return Array.isArray(value) && val >= value[0] && val <= value[1];
            default: return true;
        }
    }
}

// ==========================================
// 11. IndexedDB Wrapper (Main)
// ==========================================
class indexeddb_wrapper {
    static #instance;
    #db_name; #version; #db; #pool; #cache; #monitor; #events; #schema_manager; #tx_manager;

    constructor(db_name, version = 1) {
        if (indexeddb_wrapper.#instance) return indexeddb_wrapper.#instance;
        this.#db_name = db_name; this.#version = version;
        this.#pool = connection_pool; this.#cache = new query_cache(); this.#monitor = new performance_monitor();
        this.#events = new event_observable_manager(); this.#schema_manager = new schema_manager();
        indexeddb_wrapper.#instance = this;
    }

    async connect() {
        this.#db = await this.#pool.acquire(() => new Promise((resolve, reject) => {
            const req = indexedDB.open(this.#db_name, this.#version);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(new database_error('Connection failed', req.error));
        }));
        this.#tx_manager = new transaction_manager(this.#db);
        return this;
    }

    // ==========================================
    // Fluent CRUD
    // ==========================================
    async get(store_name, key) {
        const cache_key = `${store_name}:${key}`;
        const cached = this.#cache.get(cache_key);
        if (cached) return cached;
        const value = await this._do_get(store_name, key);
        if (value) this.#cache.set(cache_key, value);
        return value;
    }

    async put(store_name, key, value) {
        store_validator.validate_store_name(store_name); store_validator.validate_key(key); store_validator.validate_value(value);
        await this.#tx_manager.run_in_transaction([store_name], tx => new Promise((resolve, reject) => {
            const store = tx.objectStore(store_name);
            const req = store.put(value, key);
            req.onsuccess = () => { this.#cache.set(`${store_name}:${key}`, value); this.#events.notify(store_name, { type: 'put', key, value }); resolve(value); };
            req.onerror = () => reject(new database_error('Put failed', req.error));
        }));
        return this;
    }

    async delete(store_name, key) {
        store_validator.validate_store_name(store_name); store_validator.validate_key(key);
        await this.#tx_manager.run_in_transaction([store_name], tx => new Promise((resolve, reject) => {
            const store = tx.objectStore(store_name);
            const req = store.delete(key);
            req.onsuccess = () => { this.#cache.clear(); this.#events.notify(store_name, { type: 'delete', key }); resolve(true); };
            req.onerror = () => reject(new database_error('Delete failed', req.error));
        }));
        return this;
    }

    async upsert(store_name, key, value) { return this.put(store_name, key, value); }

    async bulk(operations = []) { return this.#tx_manager.run_bulk(operations); }

    // ==========================================
    // Internal get operation
    // ==========================================
    async _do_get(store_name, key) {
        store_validator.validate_store_name(store_name); store_validator.validate_key(key);
        const tx = this.#db.transaction(store_name, 'readonly'); const store = tx.objectStore(store_name);
        return new Promise((resolve, reject) => {
            const req = store.get(key);
            req.onsuccess = () => { this.#events.notify(store_name, { type: 'get', key }); resolve(req.result ?? null); };
            req.onerror = () => reject(new database_error('Get failed', req.error));
        });
    }

    // ==========================================
    // Schema & Subscription
    // ==========================================
    register_store_schema(store_name, schema) { this.#schema_manager.register_store(store_name, schema); return this; }
    validate_store_data(store_name, data) { return this.#schema_manager.validate_schema(store_name, data); }
    subscribe(store_name, callback) { this.#events.subscribe(store_name, callback); return this; }
    on(event, callback) { this.#events.on(event, callback); return this; }

    // ==========================================
    // Metrics
    // ==========================================
    get_metrics(operation) { return this.#monitor.get_metrics(operation); }
}

export { indexeddb_wrapper, database_error, store_validator, query_operator, filter_expression };
