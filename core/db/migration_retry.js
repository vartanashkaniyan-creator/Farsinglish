/**
 * @file migration_retry.js
 * @description مدیریت مکانیزم retry برای اجرای مراحل مهاجرت با Exponential Backoff
 */

import { deep_clone } from '../utils/clone_utils.js';
import { EventEmitter } from 'eventemitter3';

/**
 * @typedef {Object} RetryOptions
 * @property {number} retries تعداد تلاش‌ها
 * @property {number} base_delay زمان اولیه بین تلاش‌ها (ms)
 * @property {number} max_delay حداکثر زمان تاخیر (ms)
 */

/**
 * @class MigrationRetry
 * @extends EventEmitter
 * @description کلاس مدیریت retry برای اجرای ایمن migration steps
 */
export class MigrationRetry extends EventEmitter {
    #retry_options;
    #logger;

    /**
     * @param {RetryOptions} options
     * @param {Object} deps - وابستگی‌ها
     * @param {Console} deps.logger
     */
    constructor(options = {}, deps = {}) {
        super();
        this.#retry_options = {
            retries: options.retries ?? 3,
            base_delay: options.base_delay ?? 500,
            max_delay: options.max_delay ?? 5000
        };
        this.#logger = deps.logger ?? console;
    }

    /**
     * اجرای یک تابع با retry و exponential backoff
     * @template T
     * @param {() => Promise<T>} step_func
     * @param {string} step_name
     * @returns {Promise<T>}
     */
    async execute_with_retry(step_func, step_name = 'migration_step') {
        let attempt = 0;
        let delay = this.#retry_options.base_delay;

        while (attempt <= this.#retry_options.retries) {
            try {
                this.emit('retry:attempt', { step_name, attempt });
                return await step_func();
            } catch (error) {
                attempt++;
                if (attempt > this.#retry_options.retries) {
                    this.emit('retry:failed', { step_name, attempt, error });
                    this.#logger.error(`[MigrationRetry] Step failed after ${attempt} attempts:`, error);
                    throw error;
                } else {
                    this.emit('retry:backoff', { step_name, attempt, delay });
                    this.#logger.warn(`[MigrationRetry] Attempt ${attempt} failed, retrying in ${delay}ms:`, error);
                    await this.#wait(delay);
                    delay = Math.min(delay * 2, this.#retry_options.max_delay);
                }
            }
        }
    }

    /**
     * ایجاد تاخیر
     * @param {number} ms
     * @returns {Promise<void>}
     */
    async #wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * بروزرسانی تنظیمات retry
     * @param {Partial<RetryOptions>} options
     */
    update_retry_options(options) {
        this.#retry_options = { ...this.#retry_options, ...options };
    }

    /**
     * گرفتن تنظیمات فعلی
     * @returns {RetryOptions}
     */
    get_retry_options() {
        return deep_clone(this.#retry_options);
    }
}

// Singleton پیشرفته برای استفاده مشترک
export const migration_retry = new MigrationRetry({
    retries: 3,
    base_delay: 500,
    max_delay: 5000
}, { logger: console });
