/**
 * @file core/db/connection/timeout_watchdog.js
 * @description Timeout watchdog for DB connections (single responsibility).
 * @version 1.1.2
 */

/* -------------------------------------------------------------------------- */
/*                                   CONSTANTS                                */
/* -------------------------------------------------------------------------- */

const DEFAULT_CONFIG = Object.freeze({
    timeout_ms: 30_000,
    check_interval_ms: 250,
    silent: false
});

const SUPPORTED_EVENTS = Object.freeze([
    'timeout',
    'tick',
    'stop',
    'clear'
]);

/* -------------------------------------------------------------------------- */
/*                                   HELPERS                                  */
/* -------------------------------------------------------------------------- */

/**
 * Assert a positive millisecond value.
 * @param {number} value
 * @param {string} name
 */
function assert_positive_ms(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`[timeout_watchdog] ${name} must be a positive number (ms)`);
    }
}

/* -------------------------------------------------------------------------- */
/*                              TIMEOUT WATCHDOG                              */
/* -------------------------------------------------------------------------- */

export class TimeoutWatchdog {
    #config;
    #start_ts;
    #timer_id;
    #listeners;
    #stopped;

    constructor(config = {}) {
        const merged = {
            ...DEFAULT_CONFIG,
            ...config
        };

        assert_positive_ms(merged.timeout_ms, 'timeout_ms');
        assert_positive_ms(merged.check_interval_ms, 'check_interval_ms');

        this.#config = Object.freeze(merged);
        this.#start_ts = null;
        this.#timer_id = null;
        this.#stopped = true;

        this.#listeners = new Map();
        SUPPORTED_EVENTS.forEach(event => this.#listeners.set(event, new Set()));
    }

    /* ---------------------------------------------------------------------- */
    /*                                   STATE                                  */
    /* ---------------------------------------------------------------------- */

    get_state() {
        if (!this.#start_ts) {
            return {
                started: false,
                elapsed_ms: 0,
                remaining_ms: this.#config.timeout_ms
            };
        }

        const elapsed = Date.now() - this.#start_ts;

        return {
            started: !this.#stopped,
            elapsed_ms: elapsed,
            remaining_ms: Math.max(
                0,
                this.#config.timeout_ms - elapsed
            )
        };
    }

    /* ---------------------------------------------------------------------- */
    /*                                  LIFECYCLE                               */
    /* ---------------------------------------------------------------------- */

    start() {
        if (!this.#stopped) return this;

        // 🔧 micro-optimization: runtime safety check
        assert_positive_ms(
            this.#config.check_interval_ms,
            'check_interval_ms'
        );

        this.#stopped = false;
        this.#start_ts = Date.now();

        this.#timer_id = setInterval(() => {
            const state = this.get_state();

            this.#emit('tick', state);

            if (state.remaining_ms <= 0) {
                this.#emit('timeout', state);
                this.stop();
            }
        }, this.#config.check_interval_ms);

        return this;
    }

    stop() {
        if (this.#stopped) return this;

        this.#clear_timer();
        this.#stopped = true;

        this.#emit('stop', this.get_state());
        return this;
    }

    clear() {
        const state = this.get_state();

        this.#clear_timer();
        this.#start_ts = null;
        this.#stopped = true;

        this.#emit('clear', state);
        return this;
    }

    /* ---------------------------------------------------------------------- */
    /*                                  EVENTS                                  */
    /* ---------------------------------------------------------------------- */

    on(event, handler) {
        if (!this.#listeners.has(event)) {
            throw new Error(`[timeout_watchdog] Unsupported event: ${event}`);
        }

        this.#listeners.get(event).add(handler);
        return this;
    }

    off(event, handler) {
        this.#listeners.get(event)?.delete(handler);
        return this;
    }

    /* ---------------------------------------------------------------------- */
    /*                                  INTERNAL                                */
    /* ---------------------------------------------------------------------- */

    #emit(event, payload) {
        const listeners = this.#listeners.get(event);
        if (!listeners || listeners.size === 0) return;

        // 🔧 micro-optimization: direct Set.forEach
        listeners.forEach(listener => {
            try {
                const result = listener(payload);
                if (result instanceof Promise) {
                    result.catch(err => {
                        if (!this.#config.silent) {
                            console.error(
                                `[timeout_watchdog] async listener error`,
                                err
                            );
                        }
                    });
                }
            } catch (err) {
                if (!this.#config.silent) {
                    console.error(
                        `[timeout_watchdog] listener error`,
                        err
                    );
                }
            }
        });
    }

    #clear_timer() {
        if (this.#timer_id !== null) {
            clearInterval(this.#timer_id);
            this.#timer_id = null;
        }
    }
}

/* -------------------------------------------------------------------------- */
/*                                   EXPORT                                   */
/* -------------------------------------------------------------------------- */

export default TimeoutWatchdog;
