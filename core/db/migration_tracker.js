// core/db/migration_tracker.js
import EventEmitter from 'eventemitter3';
import { deep_clone } from '../utils/clone_utils.js';
import { migration_store } from './migration_store.js';
import { execute_with_retry } from './migration_retry.js';
import { MigrationCircuit } from './migration_circuit.js';

/**
 * MigrationTracker
 * مدیریت اجرای migrationها با retry، circuit breaker، event-driven و persistence
 */
export class MigrationTracker extends EventEmitter {
    #pending_steps = [];
    #executed_steps = [];
    #executing = false;
    #circuit = null;

    /**
     * @param {Array} steps - آرایه قدم‌های migration اولیه
     */
    constructor(steps = []) {
        super();
        this.#pending_steps = deep_clone(steps);
        this.#executed_steps = migration_store.load() ?? [];
        this.#circuit = new MigrationCircuit();
    }

    /**
     * ثبت قدم‌های جدید برای migration
     * @param {Array} steps
     */
    register_steps(steps) {
        const cloned_steps = deep_clone(steps);
        for (const step of cloned_steps) {
            if (!this.#pending_steps.find(s => s.step_id === step.step_id)) {
                this.#pending_steps.push(step);
            }
        }
        this.emit('migration:steps_registered', cloned_steps.map(s => s.step_id));
    }

    /**
     * اجرای همه قدم‌ها با مدیریت lock، retry و circuit
     */
    async execute_all() {
        if (this.#executing) throw new Error('Migration already in progress');
        this.#executing = true;

        try {
            while (this.#pending_steps.length > 0) {
                const step = this.#pending_steps[0];

                // بررسی circuit breaker
                if (this.#circuit.is_open()) {
                    this.emit('migration:circuit_open', step.step_id);
                    break;
                }

                try {
                    await execute_with_retry(step.migrate, { retries: step.retries ?? 3, delay: step.delay ?? 1000 });

                    // موفقیت: ابتدا ذخیره وضعیت، سپس حذف از pending
                    this.#executed_steps.push(step);
                    await this.#save_state();
                    this.#pending_steps.shift();

                    this.#circuit.reset_on_success();
                    this.emit('migration:step_success', step.step_id, {
                        executed_count: this.#executed_steps.length,
                        pending_count: this.#pending_steps.length
                    });
                } catch (error) {
                    this.#circuit.record_failure();
                    this.emit('migration:step_error', step.step_id, error);
                    break; // توقف حلقه تا retry بعدی
                }
            }

            if (this.#pending_steps.length === 0) {
                this.emit('migration:all_done', this.#executed_steps.map(s => s.step_id));
            }
        } finally {
            this.#executing = false;
        }
    }

    /**
     * بازگشت وضعیت فعلی migration
     */
    get_status() {
        return {
            executed_steps: deep_clone(this.#executed_steps),
            pending_steps: deep_clone(this.#pending_steps),
            circuit_open: this.#circuit.is_open()
        };
    }

    /**
     * ذخیره پایدار state executed_steps
     */
    async #save_state() {
        await migration_store.save(this.#executed_steps);
    }
}
