/**
 * @file migration_circuit.js
 * @description مدیریت Circuit Breaker برای اجرای ایمن migration steps
 * @author
 */

import EventEmitter from 'eventemitter3';

/**
 * @typedef {Object} MigrationCircuitOptions
 * @property {number} failure_threshold تعداد خطاهای متوالی قبل از فعال شدن circuit
 * @property {number} reset_timeout زمان بازنشانی circuit (ms)
 */

/**
 * کلاس مدیریت Circuit Breaker برای migration
 * @extends EventEmitter
 */
export class MigrationCircuit extends EventEmitter {
    #failure_count = 0;
    #circuit_open = false;
    #reset_timeout = 30000;
    #failure_threshold = 5;
    #reset_timer = null;

    /**
     * @param {MigrationCircuitOptions} options
     */
    constructor({ failure_threshold = 5, reset_timeout = 30000 } = {}) {
        super();
        this.#failure_threshold = failure_threshold;
        this.#reset_timeout = reset_timeout;
    }

    /**
     * بررسی وضعیت circuit
     * @returns {boolean} true اگر circuit باز است
     */
    is_circuit_open() {
        return this.#circuit_open;
    }

    /**
     * ثبت موفقیت اجرای step
     */
    record_success() {
        if (this.#failure_count > 0) this.#failure_count = 0;
        if (this.#circuit_open) this.#schedule_reset();
    }

    /**
     * ثبت شکست اجرای step
     */
    record_failure() {
        this.#failure_count++;
        if (this.#failure_count >= this.#failure_threshold) {
            this.#open_circuit();
        }
    }

    /**
     * اجرای یک عملیات با کنترل circuit
     * @param {() => Promise<any>} operation
     */
    async execute(operation) {
        if (this.#circuit_open) {
            this.emit('circuit:open');
            throw new Error('Migration circuit breaker is open');
        }

        try {
            const result = await operation();
            this.record_success();
            return result;
        } catch (error) {
            this.record_failure();
            this.emit('circuit:failure', error);
            throw error;
        }
    }

    /**
     * باز کردن circuit
     */
    #open_circuit() {
        if (!this.#circuit_open) {
            this.#circuit_open = true;
            this.emit('circuit:opened');
            this.#schedule_reset();
        }
    }

    /**
     * زمان‌بندی بازنشانی circuit
     */
    #schedule_reset() {
        if (this.#reset_timer) clearTimeout(this.#reset_timer);
        this.#reset_timer = setTimeout(() => {
            this.#circuit_open = false;
            this.#failure_count = 0;
            this.emit('circuit:closed');
            this.#reset_timer = null;
        }, this.#reset_timeout);
    }
}

/**
 * Singleton آماده برای استفاده
 */
export const migration_circuit = new MigrationCircuit();
