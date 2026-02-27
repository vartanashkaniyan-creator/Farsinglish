/**
 * @file core/db/connection/health_monitor.js
 * @description Connection health monitor with auto-healing, retry, exponential backoff, and event-driven management
 * @version 1.1.0
 */

import { deep_clone } from '../../utils/clone_utils.js';

/**
 * @typedef {Object} HealthMonitorOptions
 * @property {number} check_interval_ms - Base interval between health checks
 * @property {number} max_retries - Maximum retry attempts per connection
 * @property {boolean} silent - Suppress warnings/errors
 * @property {number} ping_timeout_ms - Timeout for ping operation
 * @property {boolean} auto_remove_failed - Remove permanently failed connections
 * @property {Function} logger - Optional logger
 */

/**
 * HealthMonitor manages database connection health with retry, auto-heal, and exponential backoff.
 */
export class HealthMonitor {
    #connections;
    #options;
    #interval_id;
    #event_listeners;
    #retry_counts;

    constructor(connections = [], options = {}) {
        this.#connections = deep_clone(connections);
        this.#options = Object.freeze({
            check_interval_ms: options.check_interval_ms ?? 5000,
            max_retries: options.max_retries ?? 3,
            silent: options.silent ?? false,
            ping_timeout_ms: options.ping_timeout_ms ?? 2000,
            auto_remove_failed: options.auto_remove_failed ?? false,
            logger: options.logger ?? console
        });
        this.#interval_id = null;
        this.#retry_counts = new Map();
        this.#event_listeners = new Map([
            ['connection_checked', []],
            ['connection_failed', []],
            ['connection_recovered', []],
            ['all_connections_failed', []]
        ]);
    }

    /** Start periodic health checks */
    start() {
        if (this.#interval_id) return this;
        this.#interval_id = setInterval(() => this.#check_all_connections(), this.#options.check_interval_ms);
        return this;
    }

    /** Stop health checks */
    stop() {
        if (this.#interval_id) {
            clearInterval(this.#interval_id);
            this.#interval_id = null;
        }
        return this;
    }

    /** Subscribe to events */
    on(event, callback) {
        if (!this.#event_listeners.has(event)) {
            if (!this.#options.silent) this.#options.logger.warn(`[HealthMonitor] Unsupported event: ${event}`);
            return this;
        }
        this.#event_listeners.get(event).push(callback);
        return this;
    }

    /** Emit event */
    #emit(event, data) {
        const listeners = this.#event_listeners.get(event) ?? [];
        listeners.forEach(cb => {
            try { cb(data); } catch (err) {
                if (!this.#options.silent) this.#options.logger.error(`[HealthMonitor] Error in ${event} listener:`, err);
            }
        });
    }

    /** Check all connections in parallel with timeout */
    async #check_all_connections() {
        const failed_connections = [];

        const check_promises = this.#connections.map(conn =>
            this.#check_connection(conn)
                .then(healthy => ({ conn, healthy }))
                .catch(() => ({ conn, healthy: false }))
        );

        const results = await Promise.allSettled(check_promises);

        for (const res of results) {
            if (res.status === 'fulfilled') {
                const { conn, healthy } = res.value;
                this.#emit('connection_checked', { connection: conn, healthy, attempt_number: this.#retry_counts.get(conn) ?? 0 });
                if (!healthy) failed_connections.push(conn);
            }
        }

        if (failed_connections.length) {
            failed_connections.forEach(conn => this.#handle_failure(conn));
            if (failed_connections.length === this.#connections.length) {
                this.#emit('all_connections_failed', { connections: failed_connections });
            }
        }
    }

    /** Check single connection with ping timeout */
    async #check_connection(connection) {
        if (typeof connection.ping !== 'function') return false;
        const timeout = this.#options.ping_timeout_ms;
        return new Promise(resolve => {
            let finished = false;
            const timer = setTimeout(() => {
                if (!finished) {
                    finished = true;
                    resolve(false);
                }
            }, timeout);

            connection.ping()
                .then(() => {
                    if (!finished) {
                        finished = true;
                        clearTimeout(timer);
                        resolve(true);
                    }
                })
                .catch(err => {
                    if (!finished) {
                        finished = true;
                        clearTimeout(timer);
                        if (!this.#options.silent) this.#options.logger.warn('[HealthMonitor] Connection ping failed', err);
                        resolve(false);
                    }
                });
        });
    }

    /** Handle failed connection with exponential backoff retry */
    async #handle_failure(connection) {
        const retries = this.#retry_counts.get(connection) ?? 0;
        if (retries >= this.#options.max_retries) {
            this.#emit('connection_failed', { connection, retries });
            if (this.#options.auto_remove_failed) this.remove_connection(connection);
            return;
        }

        this.#retry_counts.set(connection, retries + 1);
        const backoff = Math.min(1000 * 2 ** retries, 30000); // max 30s
        const jitter = Math.random() * 200; // ±200ms jitter
        await new Promise(r => setTimeout(r, backoff + jitter));

        try {
            if (typeof connection.reconnect === 'function') {
                await connection.reconnect();
                this.#retry_counts.set(connection, 0);
                this.#emit('connection_recovered', { connection, attempt_number: retries + 1 });
            }
        } catch (err) {
            if (!this.#options.silent) this.#options.logger.error('[HealthMonitor] Reconnect failed', err);
            this.#handle_failure(connection); // recursive retry
        }
    }

    /** Get current state of all connections */
    get_state() {
        return deep_clone({
            connections: this.#connections,
            retry_counts: Object.fromEntries(this.#retry_counts)
        });
    }

    /** Add new connection dynamically */
    add_connection(connection) {
        this.#connections.push(connection);
        this.#retry_counts.set(connection, 0);
        return this;
    }

    /** Remove a connection */
    remove_connection(connection) {
        this.#connections = this.#connections.filter(c => c !== connection);
        this.#retry_counts.delete(connection);
        return this;
    }

    /** Destroy monitor and cleanup */
    destroy() {
        this.stop();
        this.#connections = [];
        this.#retry_counts.clear();
        this.#event_listeners.clear();
        return this;
    }
}
