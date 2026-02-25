/**
 * @file db_validator.js
 * @description Enterprise-Grade Validator برای دیتابیس و داده‌ها، منطبق با اصول آلفا
 * @version 2.0
 */

///////////////////////
// Constants & Config //
///////////////////////

export const SCHEMA_VERSION = 1;
export const MAX_BATCH_SIZE = 1000;
export const MAX_CACHE_SIZE = 100;
export const ALLOWED_COLUMN_TYPES = ['string', 'number', 'boolean', 'date', 'object', 'array'];
export const IDENTIFIER_REGEX = /^[a-z][a-z0-9_]*$/;

export const ERROR_CODES = {
    INVALID_IDENTIFIER: 'ERR-4001',
    INVALID_TYPE: 'ERR-4002',
    INVALID_VALUE: 'ERR-4003',
    BATCH_SIZE_EXCEEDED: 'ERR-4004',
    NESTED_VALIDATION_FAILED: 'ERR-4005'
};

/////////////////////////
// Metrics & Caching   //
/////////////////////////

export const validation_metrics = {
    total_validations: 0,
    errors_by_type: new Map()
};

export const schema_cache = new Map();

///////////////////////
// Core Validation   //
///////////////////////

/**
 * بررسی identifier
 * @param {string} identifier
 */
export function validate_identifier(identifier) {
    if (!IDENTIFIER_REGEX.test(identifier)) {
        validation_metrics.total_validations++;
        validation_metrics.errors_by_type.set(ERROR_CODES.INVALID_IDENTIFIER,
            (validation_metrics.errors_by_type.get(ERROR_CODES.INVALID_IDENTIFIER) || 0) + 1);
        throw new Error(`${ERROR_CODES.INVALID_IDENTIFIER}: Invalid identifier "${identifier}"`);
    }
}

/**
 * بررسی نوع داده
 * @param {*} value
 * @param {string} type
 * @param {boolean} [nullable=false]
 */
export function validate_column_value(value, type, nullable = false) {
    if (value == null && nullable) return;
    switch (type) {
        case 'string':
            if (typeof value !== 'string') throw new TypeError('Expected string');
            break;
        case 'number':
            if (typeof value !== 'number') throw new TypeError('Expected number');
            break;
        case 'boolean':
            if (typeof value !== 'boolean') throw new TypeError('Expected boolean');
            break;
        case 'date':
            if (!(value instanceof Date) || isNaN(value)) throw new TypeError('Invalid date');
            break;
        case 'object':
            if (typeof value !== 'object' || value === null) throw new TypeError('Expected object');
            break;
        case 'array':
            if (!Array.isArray(value)) throw new TypeError('Expected array');
            break;
        default:
            throw new TypeError(`Unsupported type: ${type}`);
    }
    validation_metrics.total_validations++;
}

/**
 * بررسی آرایه‌ها و ساختار تو در تو
 * @param {Array} arr
 * @param {string} type
 */
export function validate_nested_structure(arr, type) {
    if (!Array.isArray(arr)) throw new TypeError('Expected array for nested validation');
    arr.forEach(item => validate_column_value(item, type));
}

/**
 * بررسی batch از رکوردها
 * @param {Array} records
 * @param {Object} schema
 */
export function validate_batch(records, schema) {
    if (records.length > MAX_BATCH_SIZE) {
        throw new Error(ERROR_CODES.BATCH_SIZE_EXCEEDED);
    }
    records.forEach(record => validate_record_against_schema(record, schema));
}

/**
 * اعتبارسنجی رکورد بر اساس schema
 * @param {Object} record
 * @param {Object} schema
 */
export function validate_record_against_schema(record, schema) {
    const errors = [];
    for (const [field, rules] of Object.entries(schema)) {
        try {
            validate_identifier(field);
            validate_column_value(record[field], rules.type, rules.nullable);
            if (rules.validate) rules.validate(record[field]);
        } catch (e) {
            errors.push(e);
        }
    }
    if (errors.length) throw new AggregateError(errors);
}

/**
 * جمع‌آوری چند Validator
 * @param  {...Function} validators
 */
export function compose_validators(...validators) {
    return (value) => validators.every(v => v(value));
}

/**
 * اعتبارسنجی با caching
 * @param {Object} record
 * @param {string} schema_key
 * @param {Object} schema
 */
export function validate_cached(record, schema_key, schema) {
    if (!schema_cache.has(schema_key)) {
        if (schema_cache.size >= MAX_CACHE_SIZE) {
            const firstKey = schema_cache.keys().next().value;
            schema_cache.delete(firstKey);
        }
        schema_cache.set(schema_key, schema);
    }
    return validate_record_against_schema(record, schema_cache.get(schema_key));
}

/**
 * اعتبارسنجی async
 * @param {*} value
 * @param {Function} async_validator
 */
export async function validate_async(value, async_validator) {
    const result = await async_validator(value);
    if (!result.valid) throw new Error(result.message);
}

/**
 * اعتبارسنجی تراکنش‌ها
 * @param {Array} operations
 * @param {Object} schema_map
 */
export function validate_transaction(operations, schema_map) {
    return operations.every(op => validate_cached(op.data, op.table, schema_map[op.table]));
}

/**
 * تولید گزارش Validation
 */
export function generate_validation_report() {
    return {
        timestamp: new Date().toISOString(),
        metrics: {
            total: validation_metrics.total_validations,
            errors: Object.fromEntries(validation_metrics.errors_by_type)
        },
        cache_size: schema_cache.size
    };
}

/**
 * Freeze کردن schemaهای ثابت
 * @param {Object} schema
 */
export function freeze_schema(schema) {
    return Object.freeze(schema);
}

/**
 * Reset metrics برای تست و Debug
 */
export function reset_metrics() {
    validation_metrics.total_validations = 0;
    validation_metrics.errors_by_type.clear();
}

/**
 * Infer schema از نمونه داده
 * @param {Object} data
 */
export function infer_schema_from_sample(data) {
    const inferred = {};
    for (const [key, value] of Object.entries(data)) {
        inferred[key] = { type: typeof value, nullable: value == null };
    }
    return inferred;
}

/**
 * ایجاد validator با pre/post hook
 * @param {Function} pre_hook
 * @param {Function} validator
 * @param {Function} post_hook
 */
export function create_validator_with_hooks(pre_hook, validator, post_hook) {
    return (value) => {
        pre_hook?.(value);
        const result = validator(value);
        post_hook?.(result);
        return result;
    };
}

/**
 * اعتبارسنجی با نسخه schema (برای migration)
 * @param {Object} record
 * @param {string} schema_key
 * @param {Object} schema
 * @param {number} version
 */
export function validate_with_version(record, schema_key, schema, version) {
    if (version !== SCHEMA_VERSION) {
        // اجرای migration خودکار
    }
    return validate_cached(record, schema_key, schema);
}
