/**
 * @file core/db/connection/timeout_handler.js
 * @description Enterprise-ready TimeoutHandler with hooks, metrics, retry, concurrency, and event-driven architecture.
 */

import EventEmitter from 'eventemitter3';
import { logger } from '../../utils/logger.js';
import { deep_clone } from '../../utils/clone_utils.js';

const DEFAULT_TIMEOUT_OPTIONS = Object.freeze({
    timeout_ms: 5000,
    retry_on_timeout: false,
    max_concurrent_operations: 5,
    retry_count: 1,
    silent: false,
});

export class TimeoutHandler extends EventEmitter {
    #active_operations = 0;
    #queue = [];
    #options = {};
    #state = {
        operation_metadata: new Map(),
        metrics: { total: 0, success: 0, failed: 0, retried: 0 },
    };
    #hooks = {
        before: [],
        after: [],
    };

    constructor(user_options = {}) {
        super();
        this.#options = { ...DEFAULT_TIMEOUT_OPTIONS, ...user_options };
    }

    /**
     * Register hooks to run before or after operations.
     * @param {string} type 'before' | 'after'
     * @param {Function} fn async function
     */
    register_hook(type, fn) {
        if (!['before', 'after'].includes(type)) throw new Error('Invalid hook type');
        if (typeof fn !== 'function') throw new Error('Hook must be a function');
        this.#hooks[type].push(fn);
        return this;
    }

    /**
     * Schedule an async operation with timeout, retry, hooks, and metrics.
     * @param {Function} operation async function
     * @param {any} args arguments for operation
     * @param {Object} options optional {timeout_ms, retry_count}
     */
    async run(operation, args = null, options = {}) {
        if (typeof operation !== 'function') throw new Error('operation must be a function');

        // Override per-operation options
        const op_options = { ...this.#options, ...options };
        const retry_limit = op_options.retry_count;

        // Wait for max concurrent operations
        if (this.#active_operations >= op_options.max_concurrent_operations) {
            await new Promise((resolve) => this.#queue.push(resolve));
        }

        this.#active_operations++;
        const metadata = { start_time: Date.now(), args: deep_clone(args), retries: 0 };
        const op_id = Symbol('op_id');
        this.#state.operation_metadata.set(op_id, metadata);
        this.#state.metrics.total++;

        let attempt = 0;
        let result;
        let success = false;

        while (attempt <= retry_limit) {
            attempt++;
            metadata.retries = attempt - 1;

            try {
                // Execute hooks before
                for (const hook of this.#hooks.before) await hook(deep_clone(args), metadata);

                result = await this.#run_with_timeout(operation, args, op_options.timeout_ms);
                
                // Success hooks and events
                success = true;
                this.#state.metrics.success++;
                this.emit('operation_success', { op_id, metadata, result });
                for (const hook of this.#hooks.after) await hook(deep_clone(args), metadata, result, null);
                break;
            } catch (err) {
                if (err?.message === 'Timeout' && op_options.retry_on_timeout && attempt <= retry_limit) {
                    this.#state.metrics.retried++;
                    this.emit('operation_retry', { op_id, metadata, attempt });
                    continue; // retry
                } else {
                    this.#state.metrics.failed++;
                    this.emit('operation_failed', { op_id, metadata, error: err });
                    for (const hook of this.#hooks.after) await hook(deep_clone(args), metadata, null, err);
                    if (!op_options.silent) logger.error(err);
                    throw err;
                }
            }
        }

        this.#active_operations--;
        this.#state.operation_metadata.delete(op_id);
        this.#process_queue();
        return result;
    }

    /**
     * Run operation with timeout.
     * @private
     */
    #run_with_timeout(operation, args, timeout_ms) {
        return new Promise((resolve, reject) => {
            let completed = false;
            const timer = setTimeout(() => {
                if (!completed) reject(new Error('Timeout'));
            }, timeout_ms);

            Promise.resolve()
                .then(() => operation(args))
                .then((res) => {
                    completed = true;
                    clearTimeout(timer);
                    resolve(res);
                })
                .catch((err) => {
                    completed = true;
                    clearTimeout(timer);
                    reject(err);
                });
        });
    }

    /**
     * Process queued operations
     * @private
     */
    #process_queue() {
        if (this.#queue.length > 0 && this.#active_operations < this.#options.max_concurrent_operations) {
            const next = this.#queue.shift();
            next?.();
        }
    }

    /**
     * Update runtime options
     * @param {Object} new_options
     */
    update_options(new_options = {}) {
        this.#options = { ...this.#options, ...new_options };
        return this;
    }

    /**
     * Get current state snapshot
     */
    get_state() {
        return deep_clone(this.#state);
    }

    /**
     * Graceful shutdown: clear queue and wait active operations
     */
    async shutdown() {
        this.#queue = [];
        while (this.#active_operations > 0) {
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        this.emit('shutdown');
        return this;
    }
}
