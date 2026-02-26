/**
 * @file core/db/connection/connection_retry.js
 * @description Robust connection retry controller with exponential backoff
 *              (browser & PWA safe, no Node-only APIs)
 */

/**
 * @typedef {Object} connection_retry_options
 * @property {number} max_attempts        Maximum retry attempts
 * @property {number} base_delay_ms       Initial delay in milliseconds
 * @property {number} max_delay_ms        Maximum delay cap
 * @property {number} backoff_factor      Exponential backoff factor
 * @property {boolean} jitter             Add random jitter to delay
 */

/**
 * @typedef {Object} connection_retry_deps
 * @property {(message: string) => void} [logger]
 * @property {(attempt: number, error: Error) => void} [on_retry]
 */

const DEFAULT_RETRY_OPTIONS = Object.freeze({
    max_attempts: 5,
    base_delay_ms: 500,
    max_delay_ms: 30_000,
    backoff_factor: 2,
    jitter: true
});

/**
 * Calculate exponential backoff delay.
 *
 * @param {number} attempt
 * @param {connection_retry_options} options
 * @returns {number}
 */
function calculate_delay(attempt, options) {
    const exponential = options.base_delay_ms *
        Math.pow(options.backoff_factor, attempt - 1);

    const capped = Math.min(exponential, options.max_delay_ms);

    if (!options.jitter) return capped;

    const jitter_factor = 0.5 + Math.random(); // 0.5x – 1.5x
    return Math.floor(capped * jitter_factor);
}

/**
 * Sleep helper (Promise-based, browser safe).
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute an async operation with retry & backoff.
 *
 * @template T
 * @param {() => Promise<T>} operation
 * @param {connection_retry_options} [user_options]
 * @param {connection_retry_deps} [deps]
 * @returns {Promise<T>}
 */
export async function retry_connection(
    operation,
    user_options = {},
    deps = {}
) {
    if (typeof operation !== 'function') {
        throw new TypeError('retry_connection: operation must be a function');
    }

    const options = Object.freeze({
        ...DEFAULT_RETRY_OPTIONS,
        ...user_options
    });

    const logger = typeof deps.logger === 'function'
        ? deps.logger
        : () => {};

    const on_retry = typeof deps.on_retry === 'function'
        ? deps.on_retry
        : () => {};

    let last_error = null;

    for (let attempt = 1; attempt <= options.max_attempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            last_error = error instanceof Error
                ? error
                : new Error(String(error));

            on_retry(attempt, last_error);

            logger(
                `[connection_retry] attempt ${attempt}/${options.max_attempts} failed: ` +
                last_error.message
            );

            if (attempt >= options.max_attempts) break;

            const delay = calculate_delay(attempt, options);
            await sleep(delay);
        }
    }

    throw last_error ?? new Error('retry_connection: failed without error');
}

/**
 * Safe wrapper that never throws.
 *
 * @template T
 * @param {() => Promise<T>} operation
 * @param {connection_retry_options} [options]
 * @param {connection_retry_deps} [deps]
 * @returns {Promise<{ success: boolean, result: T | null, error: Error | null }>}
 */
export async function safe_retry_connection(
    operation,
    options,
    deps
) {
    try {
        const result = await retry_connection(operation, options, deps);
        return { success: true, result, error: null };
    } catch (error) {
        return {
            success: false,
            result: null,
            error: error instanceof Error ? error : new Error(String(error))
        };
    }
}
