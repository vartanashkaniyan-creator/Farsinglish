/**
 * core/events/connection_events.js
 *
 * Alpha Principles Compliance:
 * - Immutability: full Object.freeze (deep)
 * - No dependencies
 * - Flat API (no breaking changes)
 * - snake_case naming
 * - Explicitness over convention
 * - IDE type-safety via JSDoc (no TypeScript)
 */

/**
 * @typedef {(
 *  'connection:created' |
 *  'connection:destroyed' |
 *  'connection:acquired' |
 *  'connection:released' |
 *  'connection:healthy' |
 *  'connection:unhealthy' |
 *  'connection:error' |
 *  'connection:timeout' |
 *  'connection:reconnect_attempt' |
 *  'connection:reconnect_success' |
 *  'connection:reconnect_failed' |
 *  'pool:initialized' |
 *  'pool:scaled_up' |
 *  'pool:scaled_down' |
 *  'pool:shutdown'
 * )} connection_event
 */

/**
 * Flat, immutable event constants (primary public API)
 */
export const CONNECTION_EVENTS = Object.freeze({
    connection_created: 'connection:created',
    connection_destroyed: 'connection:destroyed',

    connection_acquired: 'connection:acquired',
    connection_released: 'connection:released',

    connection_healthy: 'connection:healthy',
    connection_unhealthy: 'connection:unhealthy',

    connection_error: 'connection:error',
    connection_timeout: 'connection:timeout',

    connection_reconnect_attempt: 'connection:reconnect_attempt',
    connection_reconnect_success: 'connection:reconnect_success',
    connection_reconnect_failed: 'connection:reconnect_failed',

    pool_initialized: 'pool:initialized',
    pool_scaled_up: 'pool:scaled_up',
    pool_scaled_down: 'pool:scaled_down',
    pool_shutdown: 'pool:shutdown'
});

/**
 * Internal categorized index (non-breaking, non-string-based logic)
 * Not intended as primary API
 */
const EVENT_CATEGORY_INDEX = Object.freeze({
    lifecycle: Object.freeze(new Set([
        CONNECTION_EVENTS.connection_created,
        CONNECTION_EVENTS.connection_destroyed
    ])),

    pool: Object.freeze(new Set([
        CONNECTION_EVENTS.pool_initialized,
        CONNECTION_EVENTS.pool_scaled_up,
        CONNECTION_EVENTS.pool_scaled_down,
        CONNECTION_EVENTS.pool_shutdown,
        CONNECTION_EVENTS.connection_acquired,
        CONNECTION_EVENTS.connection_released
    ])),

    health: Object.freeze(new Set([
        CONNECTION_EVENTS.connection_healthy,
        CONNECTION_EVENTS.connection_unhealthy
    ])),

    error: Object.freeze(new Set([
        CONNECTION_EVENTS.connection_error,
        CONNECTION_EVENTS.connection_timeout
    ])),

    reconnect: Object.freeze(new Set([
        CONNECTION_EVENTS.connection_reconnect_attempt,
        CONNECTION_EVENTS.connection_reconnect_success,
        CONNECTION_EVENTS.connection_reconnect_failed
    ]))
});

/**
 * Fast validation without allocations
 *
 * @param {string} event_name
 * @returns {event_name is connection_event}
 */
export function is_valid_connection_event(event_name) {
    return Object.values(CONNECTION_EVENTS).includes(event_name);
}

/**
 * Safe category check without relying on naming conventions
 *
 * @param {string} event_name
 * @param {'lifecycle'|'pool'|'health'|'error'|'reconnect'} category
 * @returns {boolean}
 */
export function is_connection_event_in_category(event_name, category) {
    const category_set = EVENT_CATEGORY_INDEX[category];
    if (!category_set) return false;
    return category_set.has(event_name);
}

/**
 * Exposed read-only categories (diagnostic / tooling usage only)
 */
export const CONNECTION_EVENT_CATEGORIES = Object.freeze({
    lifecycle: EVENT_CATEGORY_INDEX.lifecycle,
    pool: EVENT_CATEGORY_INDEX.pool,
    health: EVENT_CATEGORY_INDEX.health,
    error: EVENT_CATEGORY_INDEX.error,
    reconnect: EVENT_CATEGORY_INDEX.reconnect
});
