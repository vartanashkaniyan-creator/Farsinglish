// core/db/connection/reconnect.js
// Alpha Principles compliant – snake_case – PWA-safe – no Node-only deps

import EventEmitter from 'eventemitter3';
import { deep_clone } from '../../utils/clone_utils.js';
import { logger as default_logger } from '../../utils/logger.js';

/**
 * @typedef {Object} reconnect_options
 * @property {number} max_attempts
 * @property {number} initial_delay_ms
 * @property {number} max_delay_ms
 * @property {number} backoff_factor
 * @property {boolean} jitter
 */

/**
 * DEFAULT_RECONNECT_OPTIONS
 * Immutable by design (Alpha: Immutability)
 */
const DEFAULT_RECONNECT_OPTIONS = Object.freeze({
    max_attempts: Infinity,
    initial_delay_ms: 500,
    max_delay_ms: 30_000,
    backoff_factor: 2,
    jitter: true
});

/**
 * ReconnectManager
 *
 * Responsibilities (SRP):
 * - Handle reconnection attempts
 * - Exponential backoff with optional jitter
 * - Emit lifecycle events
 *
 * No assumptions about connection internals
 */
export class ReconnectManager extends EventEmitter {

    #create_connection;
    #destroy_connection;
    #options;
    #logger;

    #attempt = 0;
    #stopped = false;
    #current_timeout_id = null;

    /**
     * @param {Function} create_connection async () => connection
     * @param {Function} destroy_connection async (connection)
     * @param {reconnect_options} user_options
     * @param {Object} injected_logger
     */
    constructor(
        create_connection,
        destroy_connection,
        user_options = {},
        injected_logger = default_logger
    ) {
        super();

        if (typeof create_connection !== 'function') {
            throw new TypeError('create_connection must be a function');
        }
        if (typeof destroy_connection !== 'function') {
            throw new TypeError('destroy_connection must be a function');
        }

        this.#create_connection = create_connection;
        this.#destroy_connection = destroy_connection;
        this.#options = Object.freeze({
            ...DEFAULT_RECONNECT_OPTIONS,
            ...deep_clone(user_options)
        });
        this.#logger = injected_logger;
    }

    /**
     * Start reconnection loop
     * @returns {Promise<any>} resolved connection
     */
    async start() {
        this.#stopped = false;
        this.#attempt = 0;

        this.#logger.info('reconnect:start');
        this.emit('start');

        return this.#try_reconnect();
    }

    /**
     * Stop reconnection attempts
     */
    stop() {
        this.#stopped = true;

        if (this.#current_timeout_id !== null) {
            clearTimeout(this.#current_timeout_id);
            this.#current_timeout_id = null;
        }

        this.#logger.info('reconnect:stopped');
        this.emit('stopped');
    }

    /**
     * Internal reconnect loop
     */
    async #try_reconnect() {
        if (this.#stopped) {
            throw new Error('Reconnect stopped');
        }

        this.#attempt++;

        if (this.#attempt > this.#options.max_attempts) {
            const error = new Error('Max reconnect attempts reached');
            this.#logger.error(error);
            this.emit('failed', error);
            throw error;
        }

        this.emit('attempt', this.#attempt);

        try {
            const connection = await this.#create_connection();

            this.#logger.info(`reconnect:success (attempt ${this.#attempt})`);
            this.emit('success', connection);

            this.#reset_state();
            return connection;

        } catch (error) {
            this.#logger.warn(
                `reconnect:failed attempt ${this.#attempt}`,
                error
            );
            this.emit('error', error, this.#attempt);

            const delay = this.#calculate_delay();
            await this.#wait(delay);

            return this.#try_reconnect();
        }
    }

    /**
     * Calculate exponential backoff delay
     */
    #calculate_delay() {
        const {
            initial_delay_ms,
            max_delay_ms,
            backoff_factor,
            jitter
        } = this.#options;

        let delay =
            initial_delay_ms *
            Math.pow(backoff_factor, this.#attempt - 1);

        delay = Math.min(delay, max_delay_ms);

        if (jitter) {
            delay = Math.random() * delay;
        }

        return Math.floor(delay);
    }

    /**
     * Promise-based timeout (abortable via stop)
     */
    #wait(ms) {
        return new Promise((resolve, reject) => {
            if (this.#stopped) {
                return reject(new Error('Reconnect stopped'));
            }

            this.#current_timeout_id = setTimeout(() => {
                this.#current_timeout_id = null;
                resolve();
            }, ms);
        });
    }

    /**
     * Reset internal state after success
     */
    #reset_state() {
        this.#attempt = 0;
        this.#current_timeout_id = null;
    }
}

/*
Events emitted:
- start
- attempt(attempt_number)
- success(connection)
- error(error, attempt_number)
- failed(error)
- stopped
*/
