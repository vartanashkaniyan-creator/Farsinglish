/**
 * @file core/db/connection/pool.js
 * @description Connection pool مدیریت اتصالات دیتابیس با auto-scaling، queue و idle cleanup
 */

import EventEmitter from 'events';
import { deep_clone } from '../../utils/clone_utils.js';

// DEFAULTS immutable
const DEFAULT_POOL_OPTIONS = Object.freeze({
    min_connections: 1,
    max_connections: 10,
    idle_timeout_ms: 30000,
    acquire_timeout_ms: 5000,
    retry_delay_ms: 200,
    retry_max_attempts: 5,
    silent: false
});

export class Pool extends EventEmitter {
    #create_connection;
    #destroy_connection;
    #options;
    #connections = [];
    #queue = [];
    #active_connections = 0;
    #idle_timer = null;
    #shutdown = false;

    /**
     * @param {Function} create_connection - تابع ایجاد اتصال
     * @param {Function} destroy_connection - تابع تخریب اتصال
     * @param {Object} user_options - تنظیمات pool
     */
    constructor(create_connection, destroy_connection, user_options = {}) {
        super();
        if (typeof create_connection !== 'function') throw new Error('create_connection must be a function');
        if (typeof destroy_connection !== 'function') throw new Error('destroy_connection must be a function');

        this.#create_connection = create_connection;
        this.#destroy_connection = destroy_connection;
        this.#options = { ...DEFAULT_POOL_OPTIONS, ...deep_clone(user_options) };
    }

    /**
     * acquire اتصال از pool
     * @returns {Promise<Object>} اتصال
     */
    acquire() {
        if (this.#shutdown) return Promise.reject(new Error('Pool is shut down'));

        return new Promise(async (resolve, reject) => {
            const wrapper = this.#connections.find(c => !c.in_use);
            if (wrapper) {
                wrapper.in_use = true;
                wrapper.last_used_at = Date.now();
                resolve(wrapper.connection);
            } else if (this.#connections.length < this.#options.max_connections) {
                try {
                    const conn = await this.#create_connection_safe();
                    resolve(conn);
                } catch (err) {
                    reject(err);
                }
            } else {
                const timeout = setTimeout(() => {
                    reject(new Error('Acquire timeout'));
                }, this.#options.acquire_timeout_ms);
                this.#queue.push({ resolve, reject, timeout });
            }
        });
    }

    /**
     * release اتصال به pool
     * @param {Object} connection 
     */
    release(connection) {
        const wrapper = this.#connections.find(c => c.connection === connection);
        if (!wrapper) return;
        wrapper.in_use = false;
        wrapper.last_used_at = Date.now();
        this.#process_queue();
    }

    /**
     * ایجاد اتصال امن با retry
     */
    async #create_connection_safe() {
        let attempts = 0;
        while (attempts < this.#options.retry_max_attempts) {
            try {
                const conn = await this.#create_connection();
                const wrapper = { connection: conn, in_use: true, last_used_at: Date.now() };
                this.#connections.push(wrapper);
                this.#active_connections++;
                return conn;
            } catch (err) {
                attempts++;
                if (!this.#options.silent) console.error('[Pool] create_connection failed', err);
                await new Promise(r => setTimeout(r, this.#options.retry_delay_ms));
            }
        }
        throw new Error('Max create_connection attempts exceeded');
    }

    /**
     * پردازش صف انتظار
     */
    #process_queue() {
        while (this.#queue.length) {
            const wrapper = this.#connections.find(c => !c.in_use);
            if (!wrapper) break;
            const { resolve, timeout } = this.#queue.shift();
            clearTimeout(timeout);
            wrapper.in_use = true;
            wrapper.last_used_at = Date.now();
            resolve(wrapper.connection);
        }
    }

    /**
     * Idle cleanup
     */
    #start_idle_cleanup() {
        if (this.#idle_timer) clearInterval(this.#idle_timer);
        this.#idle_timer = setInterval(() => {
            const now = Date.now();
            this.#connections.forEach((wrapper, i) => {
                if (!wrapper.in_use && now - wrapper.last_used_at > this.#options.idle_timeout_ms) {
                    this.#destroy_connection_safe(wrapper.connection);
                    this.#connections.splice(i, 1);
                    this.#active_connections--;
                }
            });
        }, this.#options.idle_timeout_ms);
    }

    /**
     * تخریب اتصال امن
     * @param {Object} conn 
     */
    async #destroy_connection_safe(conn) {
        try {
            await this.#destroy_connection(conn);
        } catch (err) {
            if (!this.#options.silent) console.error('[Pool] destroy_connection failed', err);
        }
    }

    /**
     * shutdown pool
     */
    async shutdown() {
        this.#shutdown = true;
        if (this.#idle_timer) clearInterval(this.#idle_timer);
        for (const wrapper of this.#connections) {
            await this.#destroy_connection_safe(wrapper.connection);
        }
        this.#connections = [];
        this.#queue.forEach(q => clearTimeout(q.timeout));
        this.#queue = [];
        this.#active_connections = 0;
        this.emit('shutdown');
    }
  }
