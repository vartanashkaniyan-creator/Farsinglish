/**
 * @fileoverview Validator پیشرفته Achievementهای کاربر - نسخه ۳.۶.۱
 * رعایت SOLID, OCP, DIP, Snake_case, JSDoc کامل
 */

import Result from './result_pattern.js';

/** @enum {string} */
export const ValidationErrorCodes = Object.freeze({
  MISSING_FIELD: 'ERR_MISSING_FIELD',
  INVALID_TYPE: 'ERR_INVALID_TYPE',
  INVALID_VALUE: 'ERR_INVALID_VALUE'
});

/** @enum {string} */
export const ValidationEvents = Object.freeze({
  VALIDATION_START: 'validation_start',
  VALIDATION_SUCCESS: 'validation_success',
  VALIDATION_FAILED: 'validation_failed'
});

/** پایه خطاهای اعتبارسنجی */
export class ValidationError extends Error {
  constructor(message, code, details = []) {
    super(message);
    this.code = code;
    this.details = details;
    Object.freeze(this);
  }
}

export class MissingFieldError extends ValidationError {
  constructor(field, code = ValidationErrorCodes.MISSING_FIELD) {
    super(`Missing required field: ${field}`, code);
    this.field = field;
  }
}

export class InvalidTypeError extends ValidationError {
  constructor(field, expected, actual) {
    super(`Invalid type for ${field}: expected ${expected}, got ${typeof actual}`, ValidationErrorCodes.INVALID_TYPE);
    this.field = field;
    this.expected = expected;
    this.actual = actual;
  }
}

export class InvalidValueError extends ValidationError {
  constructor(field, message) {
    super(message, ValidationErrorCodes.INVALID_VALUE);
    this.field = field;
  }
}

export class UserAchievementsValidator {
  #rules_registry = [];
  #default_rules = [];
  #cache = new Map();
  #cache_ttl = 5000; // ms
  #metrics = { total_validations: 0, cache_hits: 0 };
  #event_bus = null;
  #subscribers = {};
  #validation_config = {};

  constructor(deps = {}) {
    if (!Result || typeof Result.ok !== 'function') {
      throw new Error('Result pattern not properly imported');
    }

    this.#event_bus = deps.event_bus || null;
    this.#validation_config = Object.freeze({
      strict: deps.context?.strict ?? true
    });

    // قوانین پیش‌فرض
    this.#default_rules = [
      { rule: p => (typeof p.id === 'string' && p.id.trim().length > 0) ? Result.ok() : Result.fail(new MissingFieldError('id')), priority: 100 },
      { rule: p => (typeof p.title === 'string' && p.title.trim().length > 0) ? Result.ok() : Result.fail(new MissingFieldError('title')), priority: 100 }
    ];

    this.#rules_registry.push(...this.#default_rules);
  }

  add_rule(rule, priority = 0) {
    if (typeof rule !== 'function') throw new TypeError('Rule must be a function');
    this.#rules_registry.push({ rule, priority });
    this.#rules_registry.sort((a, b) => b.priority - a.priority);
  }

  on(event_type, callback) {
    if (typeof callback !== 'function') throw new TypeError('Callback must be a function');
    if (!this.#subscribers[event_type]) this.#subscribers[event_type] = [];
    this.#subscribers[event_type].push(callback);
  }

  off(event_type, callback) {
    if (!this.#subscribers[event_type]) return;
    this.#subscribers[event_type] = this.#subscribers[event_type].filter(cb => cb !== callback);
  }

  #dispatch_event(event_type, payload) {
    if (this.#event_bus?.emit) {
      try { this.#event_bus.emit(event_type, payload); } catch {}
    }
    const subs = this.#subscribers[event_type] || [];
    for (const cb of subs) {
      try { cb(payload); } catch {}
    }
  }

  #get_cache_key(payload) {
    if (!payload || typeof payload !== 'object') return JSON.stringify({});
    const sorted = Object.keys(payload).sort().reduce((acc, key) => { acc[key] = payload[key]; return acc; }, {});
    return JSON.stringify(sorted);
  }

  #set_cache(key, value) {
    const max_size = 100;
    if (this.#cache.size >= max_size) {
      const firstKey = this.#cache.keys().next().value;
      this.#cache.delete(firstKey);
    }
    this.#cache.set(key, value);
  }

  clear_cache() {
    this.#cache.clear();
  }

  #validate_field_type(payload, field, type, required = false) {
    const val = payload[field];
    if (required && (val == null || (type === 'string' && (typeof val !== 'string' || val.trim().length === 0)))) {
      return new MissingFieldError(field);
    }
    if (val != null && typeof val !== type) {
      return new InvalidTypeError(field, type, val);
    }
    return null;
  }

  async validate_async(payload) {
    this.#metrics.total_validations++;
    const key = this.#get_cache_key(payload);
    const cached = this.#cache.get(key);
    if (cached && (Date.now() - cached.timestamp < this.#cache_ttl)) {
      this.#metrics.cache_hits++;
      return cached.result;
    }

    this.#dispatch_event(ValidationEvents.VALIDATION_START, payload);

    const errors = [];

    const all_rules = this.#rules_registry;
    const results = await Promise.allSettled(all_rules.map(r => r.rule(payload)));

    for (const res of results) {
      let result;
      if (res.status === 'fulfilled') result = res.value;
      else result = Result.fail(new ValidationError(String(res.reason), ValidationErrorCodes.INVALID_VALUE));

      if (!result || typeof result.success !== 'boolean') {
        errors.push(new ValidationError('Invalid Result object', ValidationErrorCodes.INVALID_VALUE));
      } else if (!result.success && result.error) {
        errors.push(result.error);
      }
    }

    ['id', 'title'].forEach(f => {
      const type_error = this.#validate_field_type(payload, f, 'string', true);
      if (type_error) errors.push(type_error);
    });

    if (payload.points != null) {
      if (typeof payload.points !== 'number') errors.push(new InvalidTypeError('points', 'number', payload.points));
      else if (payload.points < 0) errors.push(new InvalidValueError('points', 'Points cannot be negative'));
    }

    if (this.#validation_config.strict && payload.description != null && typeof payload.description !== 'string') {
      errors.push(new InvalidTypeError('description', 'string', payload.description));
    }

    let final_result;
    if (errors.length > 0) {
      final_result = Result.fail(new ValidationError('Validation failed', ValidationErrorCodes.INVALID_VALUE, errors));
    } else {
      final_result = Result.ok();
    }

    if (final_result.success) this.#set_cache(key, { result: final_result, timestamp: Date.now() });

    this.#dispatch_event(final_result.success ? ValidationEvents.VALIDATION_SUCCESS : ValidationEvents.VALIDATION_FAILED, payload);

    return final_result;
  }

  async validate_many(payloads) {
    if (!Array.isArray(payloads)) return [];
    const promises = payloads.map(p => this.validate_async(p));
    const results = await Promise.allSettled(promises);
    return results.map(r => r.status === 'fulfilled' ? r.value : Result.fail(new ValidationError(String(r.reason), ValidationErrorCodes.INVALID_VALUE)));
  }

  to_json_schema() {
    return {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1 },
        title: { type: 'string', minLength: 1 },
        points: { type: 'number', minimum: 0 },
        description: { type: 'string' }
      },
      required: ['id', 'title']
    };
  }

  get_metrics() {
    return { ...this.#metrics };
  }
      }
