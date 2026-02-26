/**
 * core/db/db_migrator.js
 *
 * Alpha Principles compliant
 * - Strict SRP
 * - Defensive programming
 * - Deterministic rollback
 * - snake_case naming
 * - Mobile-friendly (pure JS, no TS)
 */

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

import {
    validate_and_clone_step
} from './validators/migration_step_validator.js';

import {
    deep_clone
} from '../utils/clone_utils.js';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_OPTIONS = Object.freeze({
    stop_on_rollback_error: false,
    logger: null
});

/* -------------------------------------------------------------------------- */
/* DbMigrator                                                                 */
/* -------------------------------------------------------------------------- */

export class DbMigrator {

    #db;
    #steps = [];
    #executed_steps = [];
    #listeners = Object.create(null);
    #options;

    /**
     * @param {object} db
     * @param {object} [options]
     */
    constructor(db, options = {}) {
        if (!db) {
            throw new Error('db instance is required');
        }

        this.#db = db;
        this.#options = Object.freeze({
            ...DEFAULT_OPTIONS,
            ...options
        });
    }

    /* ---------------------------------------------------------------------- */
    /* Event System                                                            */
    /* ---------------------------------------------------------------------- */

    on(event_name, handler) {
        if (typeof handler !== 'function') {
            throw new TypeError('event handler must be a function');
        }

        (this.#listeners[event_name] ||= []).push(handler);
        return this;
    }

    #emit(event_name, payload) {
        const handlers = this.#listeners[event_name];
        if (!handlers) return;

        for (const handler of handlers) {
            try {
                handler(payload);
            } catch (err) {
                this.#log('error', 'event handler failed', err);
            }
        }
    }

    /* ---------------------------------------------------------------------- */
    /* Registration                                                            */
    /* ---------------------------------------------------------------------- */

    register_step(step) {
        const validated_step = validate_and_clone_step(step);
        this.#steps.push(validated_step);
        return this;
    }

    register_steps(steps = []) {
        for (const step of steps) {
            this.register_step(step);
        }
        return this;
    }

    /* ---------------------------------------------------------------------- */
    /* Execution                                                               */
    /* ---------------------------------------------------------------------- */

    async migrate() {
        this.#emit('before_all');

        for (const step of this.#steps) {
            await this.#execute_step(step);
        }

        this.#emit('after_all');
    }

    async #execute_step(step) {
        this.#emit('before_step', step);

        try {
            await Promise.resolve(step.migrate(this.#db));
            this.#executed_steps.push(step);
            this.#emit('after_step', step);
        } catch (error) {
            this.#emit('error', { step, error });
            await this.#rollback_from(step, error);
            throw error;
        }
    }

    /* ---------------------------------------------------------------------- */
    /* Rollback                                                                */
    /* ---------------------------------------------------------------------- */

    async #rollback_from(failed_step, root_error) {
        this.#log('error', 'migration failed, starting rollback', root_error);

        const steps_to_rollback = deep_clone(this.#executed_steps).reverse();

        for (const step of steps_to_rollback) {
            if (typeof step.rollback !== 'function') {
                continue;
            }

            try {
                await Promise.resolve(step.rollback(this.#db));
                this.#emit('rollback_step', step);
            } catch (rollback_error) {
                this.#log(
                    'error',
                    `rollback failed for step ${String(step.step_id)}`,
                    rollback_error
                );

                if (this.#options.stop_on_rollback_error) {
                    throw rollback_error;
                }
            }
        }
    }

    /* ---------------------------------------------------------------------- */
    /* Utilities                                                               */
    /* ---------------------------------------------------------------------- */

    #log(level, message, error = null) {
        const logger = this.#options.logger || console;
        const fn = logger[level] || logger.log;
        fn.call(logger, message, error ?? '');
    }

    get_state() {
        return Object.freeze({
            registered_steps: this.#steps.length,
            executed_steps: this.#executed_steps.length
        });
    }
}
