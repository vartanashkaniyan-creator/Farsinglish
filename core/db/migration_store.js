// core/db/migration_store.js
import { deep_clone } from '../utils/clone_utils.js';
import { logger } from '../utils/logger.js';
import EventEmitter from 'eventemitter3';

/**
 * @description Migration Store با مدیریت cache و پشتیبانی از Version Migration
 * @class MigrationStore
 * @extends EventEmitter
 */
export class MigrationStore extends EventEmitter {
    #db_name = 'migration_db';
    #store_name = 'executed_steps';
    #db_version = 1;
    #db = null;
    #executed_steps = [];
    #connection_promise = null;
    #cache_dirty = true;

    constructor(db_version = 1) {
        super();
        this.#db_version = db_version;
    }

    /**
     * باز کردن یا ایجاد IndexedDB با پشتیبانی از version migration
     * @async
     */
    async open_db() {
        if (this.#connection_promise) return this.#connection_promise;

        this.#connection_promise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.#db_name, this.#db_version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const old_version = event.oldVersion || 0;
                const new_version = event.newVersion || this.#db_version;

                if (!db.objectStoreNames.contains(this.#store_name)) {
                    db.createObjectStore(this.#store_name, { keyPath: 'step_id' });
                }

                if (old_version < new_version) {
                    // منطق مهاجرت schema بین نسخه‌ها
                    this.emit('migration:db_upgraded', { old_version, new_version });
                }
            };

            request.onsuccess = (event) => {
                this.#db = event.target.result;
                resolve();
            };

            request.onerror = (event) => {
                logger.error('Failed to open IndexedDB:', String(event.target.error));
                reject(event.target.error);
            };
        });

        return this.#connection_promise;
    }

    /**
     * همگام‌سازی کش با DB
     * @private
     * @async
     */
    async #ensure_cache_sync() {
        if (!this.#db) await this.open_db();
        if (!this.#cache_dirty) return;

        return new Promise((resolve, reject) => {
            const tx = this.#db.transaction(this.#store_name, 'readonly');
            const store = tx.objectStore(this.#store_name);
            const request = store.getAll();

            request.onsuccess = (event) => {
                this.#executed_steps = deep_clone(event.target.result || []);
                this.#cache_dirty = false;
                resolve();
            };

            request.onerror = (event) => {
                logger.error('Failed to sync cache from DB:', String(event.target.error));
                reject(event.target.error);
            };
        });
    }

    /**
     * بارگذاری تمامی steps
     * @async
     */
    async load() {
        await this.#ensure_cache_sync();
        this.emit('migration:loaded', this.get_all_steps());
    }

    /**
     * اضافه کردن یک step
     * @param {object} step
     * @param {string|number} step.step_id
     * @returns {Promise<boolean>} true اگر اضافه شد، false اگر تکراری بود
     */
    async add_step(step) {
        if (!step?.step_id) throw new Error('Step must have step_id');
        await this.#ensure_cache_sync();

        const exists = this.#executed_steps.some(s => s.step_id === step.step_id);
        if (exists) return false;

        const cloned_step = deep_clone(step);
        const tx = this.#db.transaction(this.#store_name, 'readwrite');
        const store = tx.objectStore(this.#store_name);
        const request = store.put(cloned_step);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                this.#executed_steps.push(cloned_step);
                this.#cache_dirty = false;
                this.emit('migration:step_added', cloned_step);
                resolve(true);
            };
            request.onerror = (event) => {
                logger.error('Failed to add step:', String(event.target.error));
                reject(event.target.error);
            };
        });
    }

    /**
     * بررسی وجود یک step
     * @param {string|number} step_id
     * @returns {Promise<boolean>}
     */
    async has_step(step_id) {
        await this.#ensure_cache_sync();
        return this.#executed_steps.some(s => s.step_id === step_id);
    }

    /**
     * بازگرداندن همه steps
     * @returns {Array<object>}
     */
    get_all_steps() {
        return deep_clone(this.#executed_steps);
    }

    /**
     * حذف یک step
     * @param {string|number} step_id
     * @async
     */
    async remove_step(step_id) {
        await this.#ensure_cache_sync();
        if (!this.#executed_steps.some(s => s.step_id === step_id)) return false;

        const tx = this.#db.transaction(this.#store_name, 'readwrite');
        const store = tx.objectStore(this.#store_name);
        const request = store.delete(step_id);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                this.#executed_steps = this.#executed_steps.filter(s => s.step_id !== step_id);
                this.emit('migration:step_removed', step_id);
                resolve(true);
            };
            request.onerror = (event) => {
                logger.error('Failed to remove step:', String(event.target.error));
                reject(event.target.error);
            };
        });
    }

    /**
     * پاکسازی کامل
     * @async
     */
    async clear() {
        await this.#ensure_cache_sync();
        const tx = this.#db.transaction(this.#store_name, 'readwrite');
        const store = tx.objectStore(this.#store_name);
        const request = store.clear();

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                this.#executed_steps = [];
                this.#cache_dirty = false;
                this.emit('migration:cleared');
                resolve();
            };
            request.onerror = (event) => {
                logger.error('Failed to clear executed steps:', String(event.target.error));
                reject(event.target.error);
            };
        });
    }

    /**
     * اضافه کردن batch از steps
     * @param {Array<object>} steps
     * @async
     */
    async add_steps(steps) {
        if (!Array.isArray(steps)) throw new Error('Steps must be an array');
        await this.#ensure_cache_sync();

        const tx = this.#db.transaction(this.#store_name, 'readwrite');
        const store = tx.objectStore(this.#store_name);

        for (const step of steps) {
            if (!step?.step_id) continue;
            const exists = this.#executed_steps.some(s => s.step_id === step.step_id);
            if (!exists) {
                store.put(deep_clone(step));
                this.#executed_steps.push(deep_clone(step));
            }
        }

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve(true);
            tx.onerror = (event) => {
                logger.error('Failed to add steps batch:', String(event.target.error));
                reject(event.target.error);
            };
        });
    }
}

/**
 * Singleton instance
 */
export const migration_store = new MigrationStore();
