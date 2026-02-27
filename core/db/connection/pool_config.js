/**
 * pool_config.js
 * ----------------
 * تنظیمات و پیکربندی Connection Pool برای IndexedDB
 *
 * اصول رعایت‌شده:
 * - اصول آلفا (Immutable, Validation, DI, Consistency)
 * - JavaScript + JSDoc (آماده مهاجرت به TypeScript)
 * - snake_case در نام‌گذاری فایل و کلیدهای پیکربندی
 * - سازگار با محیط‌های قدیمی‌تر (بدون numeric separator و بدون وابستگی به structuredClone)
 */

/**
 * @typedef {Object} PoolLimits
 * @property {number} min_connections - حداقل تعداد اتصال
 * @property {number} max_connections - حداکثر تعداد اتصال
 * @property {number} idle_timeout_ms - زمان آزاد ماندن اتصال قبل از آزادسازی
 */

/**
 * @typedef {Object} RetryPolicy
 * @property {number} max_retries - حداکثر تلاش مجدد
 * @property {number} backoff_ms - فاصله زمانی بین تلاش‌ها
 */

/**
 * @typedef {Object} PoolConfig
 * @property {PoolLimits} limits
 * @property {RetryPolicy} retry_policy
 * @property {boolean} enable_metrics
 * @property {boolean} strict_mode
 */

/**
 * پیکربندی پیش‌فرض (Immutable)
 * @type {PoolConfig}
 */
const DEFAULT_POOL_CONFIG = Object.freeze({
    limits: Object.freeze({
        min_connections: 1,
        max_connections: 5,
        idle_timeout_ms: 30000
    }),
    retry_policy: Object.freeze({
        max_retries: 3,
        backoff_ms: 500
    }),
    enable_metrics: true,
    strict_mode: true
});

/**
 * Clone امن برای سازگاری با مرورگرهای قدیمی
 * @param {any} value
 * @returns {any}
 */
function safe_clone(value) {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
}

/**
 * اعتبارسنجی عمیق پیکربندی Pool
 * @param {PoolConfig} config
 * @throws {Error}
 */
function validate_pool_config(config) {
    if (!config || typeof config !== 'object') {
        throw new Error('pool_config must be an object');
    }

    const { limits, retry_policy } = config;

    if (!limits) throw new Error('limits is required');
    if (limits.min_connections < 0) throw new Error('min_connections must be >= 0');
    if (limits.max_connections <= 0) throw new Error('max_connections must be > 0');
    if (limits.min_connections > limits.max_connections) {
        throw new Error('min_connections cannot exceed max_connections');
    }

    if (!retry_policy) throw new Error('retry_policy is required');
    if (retry_policy.max_retries < 0) throw new Error('max_retries must be >= 0');
    if (retry_policy.backoff_ms < 0) throw new Error('backoff_ms must be >= 0');
}

/**
 * ساخت پیکربندی نهایی Pool (Immutable + Safe Merge)
 * @param {Partial<PoolConfig>} overrides
 * @returns {PoolConfig}
 */
export function create_pool_config(overrides = {}) {
    const merged_config = safe_clone(DEFAULT_POOL_CONFIG);

    if (overrides.limits) {
        Object.assign(merged_config.limits, overrides.limits);
    }

    if (overrides.retry_policy) {
        Object.assign(merged_config.retry_policy, overrides.retry_policy);
    }

    if (typeof overrides.enable_metrics === 'boolean') {
        merged_config.enable_metrics = overrides.enable_metrics;
    }

    if (typeof overrides.strict_mode === 'boolean') {
        merged_config.strict_mode = overrides.strict_mode;
    }

    validate_pool_config(merged_config);

    return Object.freeze({
        ...merged_config,
        limits: Object.freeze({ ...merged_config.limits }),
        retry_policy: Object.freeze({ ...merged_config.retry_policy })
    });
}

/**
 * دریافت نسخه پیش‌فرض پیکربندی Pool
 * @returns {PoolConfig}
 */
export function get_default_pool_config() {
    return DEFAULT_POOL_CONFIG;
}
