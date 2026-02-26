/**
 * @file core/db/validators/connection_config_validator.js
 * @description
 * Validator فوق‌سختگیرانه تنظیمات اتصال دیتابیس
 * منطبق با اصول آلفا، snake_case، بدون side-effect، بدون dependency
 * سازگار با Browser / PWA / Node
 */

/* -------------------------------------------------------------------------- */
/* Utilities                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * بررسی plain object (null-safe)
 * @param {*} value
 * @returns {boolean}
 */
function is_plain_object(value) {
    if (value === null || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * ساخت خطای استاندارد با prefix
 * @param {string} message
 * @returns {Error}
 */
function create_config_error(message) {
    const error = new Error(`[connection_config] ${message}`);
    error.name = 'ConnectionConfigError';
    return error;
}

/* -------------------------------------------------------------------------- */
/* Schema                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * @readonly
 */
const CONNECTION_CONFIG_SCHEMA = Object.freeze({
    min_connections: { type: 'number', min: 0, required: false },
    max_connections: { type: 'number', min: 1, required: true },
    acquire_timeout_ms: { type: 'number', min: 1, required: false },
    idle_timeout_ms: { type: 'number', min: 0, required: false },
    retry_attempts: { type: 'number', min: 0, required: false },
    retry_delay_ms: { type: 'number', min: 0, required: false },
    health_check_interval_ms: { type: 'number', min: 0, required: false },
    reconnect_on_failure: { type: 'boolean', required: false }
});

/* -------------------------------------------------------------------------- */
/* Core Validation Logic                                                       */
/* -------------------------------------------------------------------------- */

/**
 * اعتبارسنجی یک فیلد بر اساس rule
 * @param {string} key
 * @param {*} value
 * @param {{type?:string,min?:number,required?:boolean}} rule
 */
function validate_field(key, value, rule) {
    if (rule.required && value === undefined) {
        throw create_config_error(`Missing required field: ${key}`);
    }

    if (value === undefined) return;

    if (value === null) {
        throw create_config_error(`"${key}" cannot be null`);
    }

    if (rule.type && typeof value !== rule.type) {
        throw create_config_error(
            `Invalid type for "${key}": expected ${rule.type}, got ${typeof value}`
        );
    }

    if (rule.type === 'number') {
        if (!Number.isFinite(value)) {
            throw create_config_error(`"${key}" must be a finite number`);
        }
        if (rule.min !== undefined && value < rule.min) {
            throw create_config_error(`"${key}" must be >= ${rule.min}`);
        }
    }

    if (rule.type === 'boolean' && typeof value !== 'boolean') {
        throw create_config_error(`"${key}" must be a boolean`);
    }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * اعتبارسنجی کامل config اتصال دیتابیس
 * - fail-fast
 * - بدون mutation
 * - پشتیبانی از Symbol keys
 *
 * @param {object} config
 * @returns {true}
 */
export function validate_connection_config(config) {
    if (!is_plain_object(config)) {
        throw create_config_error('Config must be a plain object');
    }

    // بررسی فیلدهای تعریف‌شده
    for (const key of Object.keys(CONNECTION_CONFIG_SCHEMA)) {
        validate_field(key, config[key], CONNECTION_CONFIG_SCHEMA[key]);
    }

    // بررسی فیلدهای ناشناخته (شامل Symbol)
    for (const key of Reflect.ownKeys(config)) {
        if (typeof key === 'symbol' || !(key in CONNECTION_CONFIG_SCHEMA)) {
            throw create_config_error(`Unknown config field: ${String(key)}`);
        }
    }

    // قوانین وابسته (cross-field)
    if (
        config.min_connections !== undefined &&
        config.max_connections !== undefined &&
        config.min_connections > config.max_connections
    ) {
        throw create_config_error(
            'min_connections cannot be greater than max_connections'
        );
    }

    return true;
}

/**
 * نسخه ایمن برای runtime
 * هیچ‌گاه throw نمی‌کند
 *
 * @param {object} config
 * @returns {{valid:boolean,error:Error|null}}
 */
export function safe_validate_connection_config(config) {
    try {
        validate_connection_config(config);
        return { valid: true, error: null };
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error : new Error(String(error))
        };
    }
}

/* -------------------------------------------------------------------------- */
/* End of File                                                                 */
/* -------------------------------------------------------------------------- */
