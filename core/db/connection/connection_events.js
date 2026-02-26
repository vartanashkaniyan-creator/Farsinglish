/**
 * core/db/connection/connection_events.js
 *
 * نسخه نهایی سخت‌گیرانه مطابق اصول آلفا
 *
 * تضمین‌ها:
 * - Immutability کامل (Object.freeze روی تمام ساختارهای اشتراکی)
 * - Single Source of Truth
 * - O(1) برای validation و group lookup
 * - Fail-Fast واقعی
 * - snake_case در تمام نام‌گذاری‌ها
 * - JSDoc دقیق و قابل اتکا برای tooling
 */

/**
 * @typedef {string} connection_event
 */

/**
 * @typedef {ReadonlyArray<connection_event>} connection_event_group
 */

/**
 * گروه‌های رویداد اتصال (تعریف اولیه – بدون منطق)
 */
export const connection_event_groups = Object.freeze({
  CONNECTION_LIFECYCLE: Object.freeze([
    'connection:created',
    'connection:destroyed',
    'connection:stale',
  ]),

  CONNECTION_STATE: Object.freeze([
    'connection:open',
    'connection:closed',
    'connection:busy',
    'connection:idle',
    'connection:error',
  ]),

  POOL_LIFECYCLE: Object.freeze([
    'pool:created',
    'pool:destroyed',
    'pool:resize',
  ]),
});

/**
 * نگاشت نام‌گذاری‌شده رویدادها
 *
 * @type {Readonly<Record<string, connection_event>>}
 */
export const connection_events = Object.freeze({
  CONNECTION_CREATED: 'connection:created',
  CONNECTION_DESTROYED: 'connection:destroyed',
  CONNECTION_STALE: 'connection:stale',

  CONNECTION_OPEN: 'connection:open',
  CONNECTION_CLOSED: 'connection:closed',
  CONNECTION_BUSY: 'connection:busy',
  CONNECTION_IDLE: 'connection:idle',
  CONNECTION_ERROR: 'connection:error',

  POOL_CREATED: 'pool:created',
  POOL_DESTROYED: 'pool:destroyed',
  POOL_RESIZE: 'pool:resize',
});

/**
 * Set immutable برای اعتبارسنجی سریع
 *
 * @type {ReadonlySet<connection_event>}
 */
const connection_event_set = Object.freeze(
  new Set(Object.values(connection_events)),
);

/**
 * Map immutable برای گروه‌یابی O(1)
 *
 * @type {ReadonlyMap<connection_event, string>}
 */
const event_to_group = Object.freeze(new Map([
  ...connection_event_groups.CONNECTION_LIFECYCLE.map(
    (event) => [event, 'CONNECTION_LIFECYCLE'],
  ),
  ...connection_event_groups.CONNECTION_STATE.map(
    (event) => [event, 'CONNECTION_STATE'],
  ),
  ...connection_event_groups.POOL_LIFECYCLE.map(
    (event) => [event, 'POOL_LIFECYCLE'],
  ),
]));

/**
 * بررسی معتبر بودن رویداد اتصال
 *
 * @param {unknown} value
 * @returns {value is connection_event}
 */
export function is_connection_event(value) {
  return typeof value === 'string' && connection_event_set.has(value);
}

/**
 * Assertion سخت‌گیرانه (Fail-Fast واقعی)
 *
 * @param {unknown} value
 * @throws {TypeError}
 */
export function assert_connection_event(value) {
  if (!is_connection_event(value)) {
    throw new TypeError(
      `invalid_connection_event: ${String(value)}`,
    );
  }
}

/**
 * دریافت نام گروه مربوط به رویداد
 *
 * @param {connection_event} event
 * @returns {string | null}
 */
export function get_connection_event_group(event) {
  return event_to_group.get(event) || null;
}
