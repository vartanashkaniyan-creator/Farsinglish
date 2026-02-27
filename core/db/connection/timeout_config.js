/**
 * @file core/db/connection/timeout_config.js
 * @description Centralized, immutable, and validated timeout configuration
 *
 * Alpha principles:
 * - SRP / KISS
 * - snake_case enforced
 * - immutable outputs
 * - defensive validation
 */

/**
 * @typedef {Object} timeout_config
 * @property {number} connect_timeout_ms
 * @property {number} query_timeout_ms
 * @property {number} idle_timeout_ms
 * @property {number} acquire_timeout_ms
 */

/** @type {Readonly<timeout_config>} */
const DEFAULT_TIMEOUT_CONFIG = Object.freeze({
    connect_timeout_ms: 10_000,
    query_timeout_ms: 30_000,
    idle_timeout_ms: 60_000,
    acquire_timeout_ms: 15_000,
});

/**
 * Check whether a value is a safe, finite, positive integer.
 *
 * @param {*} value
 * @returns {boolean}
 */
function is_positive_int(value) {
    return (
        Number.isInteger(value) &&
        Number.isSafeInteger(value) &&
        value > 0
    );
}

/**
 * Validate timeout configuration overrides.
 *
 * @param {Object} config
 * @throws {TypeError|RangeError}
 */
export function validate_timeout_config(config) {
    if (config === null || typeof config !== 'object') {
        throw new TypeError('timeout_config must be a non-null object');
    }

    for (const [key, value] of Object.entries(config)) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_TIMEOUT_CONFIG, key)) {
            throw new TypeError(`Unknown timeout option: ${String(key)}`);
        }
        if (!is_positive_int(value)) {
            throw new RangeError(
                `Invalid value for ${key}: ${String(value)} (expected safe positive integer ms)`
            );
        }
    }
}

/**
 * Create normalized and immutable timeout configuration.
 *
 * @param {Partial<timeout_config>|null|undefined} overrides
 * @returns {Readonly<timeout_config>}
 */
export function create_timeout_config(overrides) {
    const safe_overrides = overrides ?? {};

    validate_timeout_config(safe_overrides);

    return Object.freeze({
        ...DEFAULT_TIMEOUT_CONFIG,
        ...safe_overrides,
    });
}

/**
 * Get default timeout configuration (immutable).
 *
 * @returns {Readonly<timeout_config>}
 */
export function get_default_timeout_config() {
    return DEFAULT_TIMEOUT_CONFIG;
}

/**
 * Type guard for timeout_config.
 *
 * @param {*} value
 * @param {Object} [options]
 * @param {(msg: string) => void} [options.logger]
 * @returns {value is timeout_config}
 */
export function is_timeout_config(value, options = {}) {
    const { logger } = options;

    try {
        validate_timeout_config(value);
        return true;
    } catch (error) {
        if (typeof logger === 'function') {
            logger(error.message);
        }
        return false;
    }
}
