/**
 * @file core/db/connection/health.js
 * @description Health manager for database connections - فوق پیشرفته، مبتنی بر اصول آلفا
 */

import EventEmitter from 'eventemitter3';
import { logger } from '../../utils/logger.js';
import { deep_clone } from '../../utils/clone_utils.js';

const DEFAULT_HEALTH_OPTIONS = Object.freeze({
    check_interval_ms: 5000,
    stop_on_unhealthy: false,
    silent: false,
});

export class ConnectionHealth extends EventEmitter {
    #connections = [];
    #options = {};
    #interval_id = null;

    constructor(connections = [], options = {}) {
        super();
        this.#connections = deep_clone(connections).map((conn, idx) => ({
            connection: conn,
            connection_id: Symbol(`connection_${idx}`),
            healthy: null,
        }));
        this.#options = { ...DEFAULT_HEALTH_OPTIONS, ...options };
    }

    add_connection(connection) {
        if (!connection || typeof connection !== 'object') {
            throw new Error('Invalid connection object');
        }
        const new_conn = {
            connection,
            connection_id: Symbol(`connection_${this.#connections.length}`),
            healthy: null,
        };
        this.#connections.push(new_conn);
        return this;
    }

    remove_connection(connection_id) {
        const index = this.#connections.findIndex(c => c.connection_id === connection_id);
        if (index >= 0) this.#connections.splice(index, 1);
        return this;
    }

    async check_connection(connection_wrapper) {
        const { connection } = connection_wrapper;
        if (!connection || typeof connection.ping !== 'function') {
            connection_wrapper.healthy = false;
            logger.error('[Health] Connection missing ping method');
            return false;
        }
        try {
            const result = await connection.ping();
            connection_wrapper.healthy = Boolean(result);
            this.emit(connection_wrapper.healthy ? 'healthy' : 'unhealthy', connection_wrapper);
            return connection_wrapper.healthy;
        } catch (err) {
            connection_wrapper.healthy = false;
            this.emit('unhealthy', connection_wrapper, err);
            if (!this.#options.silent) logger.error('[Health] ping failed', err);
            return false;
        }
    }

    async check_all_connections() {
        const cloned_connections = deep_clone(this.#connections);
        const results = await Promise.allSettled(
            cloned_connections.map(wrapper => this.check_connection(wrapper))
        );
        return results.every(r => r.status === 'fulfilled' && r.value === true);
    }

    start_health_checks() {
        if (this.#interval_id) clearInterval(this.#interval_id);
        this.#interval_id = setInterval(async () => {
            try {
                await this.check_all_connections();
            } catch (err) {
                if (!this.#options.silent) logger.error('[Health] periodic check failed', err);
            }
        }, this.#options.check_interval_ms);
        return this;
    }

    stop_health_checks() {
        if (this.#interval_id) clearInterval(this.#interval_id);
        this.#interval_id = null;
        return this;
    }

    shutdown() {
        this.stop_health_checks();
        this.#connections = [];
        this.emit('shutdown');
        return this;
    }

    get_state() {
        return this.#connections.map(({ connection_id, healthy }) => ({
            connection_id,
            healthy,
        }));
    }
}
