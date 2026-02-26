/**
 * @file core/db/connection_manager.js
 * @description Ultra-lightweight ConnectionManager (base only)
 */

import EventEmitter from 'eventemitter3';
import { CONNECTION_EVENTS } from './connection_events.js';
import { safe_validate_connection_config } from './validators/connection_config_validator.js';
import { logger as default_logger } from './utils/logger.js';

export class ConnectionManager extends EventEmitter {
    #pool;
    #health;
    #reconnect;
    #logger;
    #events_bound = false;
    #options;

    /**
     * @typedef {Object} ConnectionManagerDeps
     * @property {object} pool
     * @property {object} health_checker
     * @property {object} reconnect_handler
     * @property {object} [logger]
     */

    /**
     * @param {ConnectionManagerDeps} deps
     * @param {object} [options]
     */
    constructor(deps, options = {}) {
        super();
        this.#validate_deps(deps);

        this.#pool = deps.pool;
        this.#health = deps.health_checker;
        this.#reconnect = deps.reconnect_handler;
        this.#logger = deps.logger ?? default_logger;
        this.#options = Object.freeze({ ...options });
    }

    #validate_deps(deps) {
        if (!deps) throw new Error('Deps must be provided');
        ['pool', 'health_checker', 'reconnect_handler'].forEach((key) => {
            if (typeof deps[key] !== 'object') {
                throw new Error(`${key} must be an object`);
            }
        });
    }

    #bind_events() {
        if (this.#events_bound) return;
        this.#events_bound = true;

        this.#health.on(CONNECTION_EVENTS.HEALTH.HEALTHY, (conn) => this.emit(CONNECTION_EVENTS.HEALTH.HEALTHY, conn));
        this.#health.on(CONNECTION_EVENTS.HEALTH.UNHEALTHY, (conn) => this.emit(CONNECTION_EVENTS.HEALTH.UNHEALTHY, conn));
        this.#reconnect.on(CONNECTION_EVENTS.RECONNECT.SUCCESS, (conn) => this.emit(CONNECTION_EVENTS.RECONNECT.SUCCESS, conn));
        this.#reconnect.on(CONNECTION_EVENTS.RECONNECT.FAILED, (conn) => this.emit(CONNECTION_EVENTS.RECONNECT.FAILED, conn));
    }

    start() {
        this.#bind_events();
        this.#health.start();
        this.#reconnect.start();
    }

    async stop() {
        await this.#reconnect.stop();
        await this.#health.stop();
        await this.#pool.shutdown();
    }

    async acquire() {
        try {
            return await this.#pool.acquire();
        } catch (error) {
            this.#logger.error('[ConnectionManager] acquire failed', String(error));
            throw error;
        }
    }

    async release(connection) {
        try {
            await this.#pool.release(connection);
        } catch (error) {
            this.#logger.error('[ConnectionManager] release failed', String(error));
        }
    }

    async destroy(connection) {
        try {
            await this.#pool.destroy(connection);
        } catch (error) {
            this.#logger.error('[ConnectionManager] destroy failed', String(error));
        }
    }

    validate_config(config) {
        safe_validate_connection_config(config);
    }

    get_metrics() {
        return {
            total_connections: this.#pool.size,
            active_connections: this.#pool.active_count,
            idle_connections: this.#pool.idle_count,
            reconnect_queue_size: this.#reconnect.queue_size
        };
    }
}
