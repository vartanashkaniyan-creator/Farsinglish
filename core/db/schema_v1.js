// ============================================
// farsinglish_validators_async.js - Enterprise-ready
// ============================================

import { validate as validate_uuid } from 'uuid';
import bcrypt from 'bcrypt';

// ============================================
// Constants
// ============================================
export const VALIDATION_CODES = {
    REQUIRED: 'required',
    INVALID_EMAIL: 'invalid_email',
    INVALID_DATE: 'invalid_date',
    INVALID_BCRYPT: 'invalid_bcrypt',
};

// ============================================
// Validation Result Class
// ============================================
export class ValidationResult {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.metadata = {
            duration: 0,
            cached: false,
            async: false,
        };
    }

    addError(error) { if (error) this.errors.push(error); }
    addWarning(warning) { if (warning) this.warnings.push(warning); }
    isValid() { return this.errors.length === 0; }
}

// ============================================
// Validation Helpers
// ============================================
export class ValidationHelpers {
    /**
     * Validate string with options
     */
    static validate_string(field, value, { min, max, pattern, required = true } = {}) {
        if (required && (value === undefined || value === null || value === '')) {
            return { field, error: 'required', code: VALIDATION_CODES.REQUIRED };
        }
        if (value && typeof value !== 'string') {
            return { field, error: 'must be string' };
        }
        if (value && min && value.length < min) {
            return { field, error: `min length ${min}` };
        }
        if (value && max && value.length > max) {
            return { field, error: `max length ${max}` };
        }
        if (value && pattern && !pattern.test(value)) {
            return { field, error: 'pattern mismatch' };
        }
        return null;
    }

    /**
     * Validate email
     */
    static validate_email(field, value, required = true) {
        const email_pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return this.validate_string(field, value, { pattern: email_pattern, required, min: 5 });
    }

    /**
     * Validate date with optional past/future check
     */
    static validate_date(field, value, { past, future, required = true } = {}) {
        if (required && !value) return { field, error: 'required', code: VALIDATION_CODES.REQUIRED };
        const date = new Date(value);
        if (isNaN(date.getTime())) return { field, error: 'invalid date', code: VALIDATION_CODES.INVALID_DATE };
        const now = new Date();
        if (past && date > now) return { field, error: 'date must be in past' };
        if (future && date < now) return { field, error: 'date must be in future' };
        return null;
    }

    /**
     * Validate bcrypt hash format
     */
    static validate_bcrypt(field, value) {
        const bcrypt_pattern = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;
        if (!bcrypt_pattern.test(value)) {
            return { field, error: 'invalid bcrypt', code: VALIDATION_CODES.INVALID_BCRYPT };
        }
        return null;
    }

    /**
     * Async validator
     */
    static async validate_async(field, value, async_validator) {
        try {
            const result = await async_validator(value);
            return result ? null : { field, error: 'async validation failed' };
        } catch (error) {
            return { field, error: error.message };
        }
    }

    /**
     * Batch validation
     */
    static validate_batch(validators, data) {
        const results = {};
        for (const [field, validator] of Object.entries(validators)) {
            const res = validator(data[field]);
            if (res) results[field] = res;
        }
        return results;
    }
}

// ============================================
// Validation Cache for Async Validators
// ============================================
export const validation_cache = new Map();

export async function validate_with_cache(field, value, validator, ttl = 5000) {
    const key = `${field}:${value}`;
    if (validation_cache.has(key)) return validation_cache.get(key);
    const result = await validator(value);
    validation_cache.set(key, result);
    setTimeout(() => validation_cache.delete(key), ttl);
    return result;
}

// ============================================
// Rate Limiter for Async Validators
// ============================================
export class RateLimiter {
    #limits = new Map();

    can_execute(key, max_per_minute = 60) {
        const now = Date.now();
        const window_start = now - 60000;
        const calls = this.#limits.get(key) || [];
        const recent_calls = calls.filter(t => t > window_start);
        if (recent_calls.length >= max_per_minute) return false;
        recent_calls.push(now);
        this.#limits.set(key, recent_calls);
        return true;
    }
}

// ============================================
// Validation Pipeline
// ============================================
export class ValidationPipeline {
    #validators = [];

    add(validator) {
        this.#validators.push(validator);
        return this;
    }

    async execute(data) {
        const errors = [];
        for (const validator of this.#validators) {
            const result = await validator(data);
            if (result) errors.push(result);
        }
        return errors;
    }
}

// ============================================
// Schema-based Validator
// ============================================
export class SchemaValidator {
    static validate(schema, data) {
        const result = new ValidationResult();
        for (const [field, rules] of Object.entries(schema)) {
            const value = data[field];
            if (rules.required && !value) {
                result.addError({ field, error: 'required' });
                continue;
            }
            switch (rules.type) {
                case 'string':
                    result.addError(ValidationHelpers.validate_string(field, value, rules));
                    break;
                case 'email':
                    result.addError(ValidationHelpers.validate_email(field, value, rules.required));
                    break;
                case 'date':
                    result.addError(ValidationHelpers.validate_date(field, value, rules));
                    break;
                case 'bcrypt':
                    result.addError(ValidationHelpers.validate_bcrypt(field, value));
                    break;
            }
        }
        return result;
    }
}

// ============================================
// User-friendly Error Messages (I18n Ready)
// ============================================
export class ValidationMessageBuilder {
    static get_user_friendly_message(error) {
        const messages = {
            [VALIDATION_CODES.REQUIRED]: `فیلد ${error.field} اجباری است`,
            [VALIDATION_CODES.INVALID_EMAIL]: 'ایمیل وارد شده معتبر نیست',
            [VALIDATION_CODES.INVALID_DATE]: 'تاریخ وارد شده معتبر نیست',
            [VALIDATION_CODES.INVALID_BCRYPT]: 'فرمت رمز عبور نامعتبر است',
        };
        return messages[error.code] || `خطا در فیلد ${error.field}`;
    }

    static build_error_response(errors) {
        return {
            success: false,
            errors: errors.map(e => ({
                field: e.field,
                message: this.get_user_friendly_message(e),
                code: e.code,
                severity: 'error'
            })),
            timestamp: Date.now()
        };
    }
}

// ============================================
// Example Schema
// ============================================
export const user_schema = {
    username: { type: 'string', min: 3, max: 50, required: true },
    email: { type: 'email', required: true },
    password_hash: { type: 'bcrypt', required: true },
    created_at: { type: 'date', past: true }
};
