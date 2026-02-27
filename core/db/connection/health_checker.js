/**
 * @file core/db/connection/health_checker.js
 * @version 1.0.0
 * @description
 * Health checker for database connection pools.
 * Fully aligned with Alpha Principles:
 * - SRP
 * - Immutability
 * - Encapsulation
 * - snake_case
 * - Defensive async handling
 */

/**
 * @typedef {Object} health_check_result
 * @property {boolean} ok
 * @property {number|null} latency_ms
 * @property {boolean} degraded
 * @property {boolean} max_failures_reached
 */

const DEFAULTS = Object.freeze({
    check_timeout_ms: 3_000,
    max_failures: 3
});

export class health_checker {
    #pool;
    #options;
    #last_check_ts = null;
    #last_latency_ms = null;
    #failure_count = 0;

    /**
     * @param {Object} pool
     * @param {Function} pool.acquire
     * @param {Object} [options]
     */
    constructor(pool, options = {}) {
        if (!pool || typeof pool.acquire !== 'function') {
            throw new TypeError('health_checker requires a pool with acquire()');
        }

        this.#pool = pool;
        this.#options = Object.freeze({
            ...DEFAULTS,
            ...options
        });
    }

    /**
     * Perform a health check against the pool.
     * @returns {Promise<health_check_result>}
     */
    async check_health() {
        const start_ts = Date.now();
        this.#last_check_ts = start_ts;

        let connection;

        try {
            connection = await this.#with_timeout(
                this.#pool.acquire.bind(this.#pool)(),
                this.#options.check_timeout_ms
            );

            const latency_ms = Date.now() - start_ts;

            this.#last_latency_ms = latency_ms;
            this.#failure_count = 0;

            return Object.freeze({
                ok: true,
                latency_ms,
                degraded: false,
                max_failures_reached: false
            });
        } catch (error) {
            this.#failure_count += 1;

            return Object.freeze({
                ok: false,
                latency_ms: null,
                degraded: this.#failure_count >= this.#options.max_failures,
                max_failures_reached:
                    this.#failure_count >= this.#options.max_failures
            });
        } finally {
            if (connection && typeof connection.release === 'function') {
                try {
                    connection.release();
                } catch (_) {
                    /* release must never crash health check */
                }
            }
        }
    }

    /**
     * Reset internal state.
     * @returns {health_checker}
     */
    reset() {
        this.#failure_count = 0;
        this.#last_latency_ms = null;
        this.#last_check_ts = null;
        return this;
    }

    /**
     * Get immutable internal state snapshot.
     */
    get_state() {
        return Object.freeze({
            last_check_ts: this.#last_check_ts,
            last_latency_ms: this.#last_latency_ms,
            failure_count: this.#failure_count
        });
    }

    /**
     * Wrap a promise with a timeout.
     * @private
     */
    async #with_timeout(promise, timeout_ms) {
        let timer;

        try {
            return await Promise.race([
                promise,
                new Promise((_, reject) => {
                    timer = setTimeout(
                        () => reject(new Error('Health check timeout')),
                        timeout_ms
                    );
                })
            ]);
        } finally {
            clearTimeout(timer);
        }
    }
}

Object.freeze(health_checker);
