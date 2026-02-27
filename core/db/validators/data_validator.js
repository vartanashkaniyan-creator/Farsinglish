/**
 * @file core/db/validators/data_validator.js
 * @description DataValidator برای اعتبارسنجی انواع داده‌ها بر اساس schema, type, enum و custom rules
 * @version 1.0.1
 */

'use strict';

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - نتیجه اعتبارسنجی
 * @property {Array<string>} errors - لیست خطاهای رخ داده
 */

class DataValidator {
  /**
   * @param {Object} config - تنظیمات validator
   * @param {boolean} config.strict - فعال بودن حالت strict
   */
  constructor(config = { strict: true }) {
    /** @private @type {boolean} */
    this._strict = config.strict;

    /** @private @type {Array<string>} */
    this._errors = [];

    /** @private @type {any} */
    this._current_data = null;
  }

  /** @private Reset errors */
  _reset_errors() {
    this._errors = [];
  }

  /** @private Add an error message */
  _add_error(msg) {
    this._errors.push(msg);
  }

  /**
   * Validate data against schema
   * @param {any} data
   * @param {Object} schema
   * @returns {Promise<ValidationResult>}
   */
  async validate_schema(data, schema) {
    this._reset_errors();
    try {
      if (!data || typeof data !== 'object') {
        this._add_error('Data must be an object');
        if (this._strict) throw new Error(this._errors.join(', '));
        return { valid: false, errors: [...this._errors] };
      }

      for (const [key, rules] of Object.entries(schema)) {
        const value = data[key];

        // Required
        if (rules.required && (value === undefined || value === null)) {
          this._add_error(`${key} is required`);
          continue;
        }

        // Type
        if (rules.type && value !== undefined && typeof value !== rules.type) {
          this._add_error(`${key} must be of type ${rules.type}`);
        }

        // Enum
        if (rules.enum && !rules.enum.includes(value)) {
          this._add_error(`${key} must be one of ${rules.enum.join(', ')}`);
        }

        // Custom validator (sync or async)
        if (rules.custom && typeof rules.custom === 'function') {
          try {
            const result = rules.custom(value, data);
            const resolved = result instanceof Promise ? await result : result;
            if (resolved !== true) {
              this._add_error(`${key} failed custom validation`);
            }
          } catch (err) {
            this._add_error(`${key} custom validation threw error: ${err.message}`);
          }
        }
      }
    } catch (err) {
      if (this._strict) throw err;
    }

    return { valid: this._errors.length === 0, errors: [...this._errors] };
  }

  /**
   * Set data to validate (for fluent interface)
   * @param {any} data
   * @returns {DataValidator}
   */
  validate(data) {
    this._current_data = data;
    return this;
  }

  /**
   * Fluent validation with schema
   * @param {Object} schema
   * @returns {Promise<ValidationResult>}
   */
  async with_schema(schema) {
    return await this.validate_schema(this._current_data, schema);
  }

  /**
   * Add a custom validation function (chainable, async supported)
   * @param {(value: any, data: any) => boolean|string|Promise<boolean|string>} custom_fn
   * @returns {DataValidator}
   */
  with_custom(custom_fn) {
    if (!this._current_data) return this;
    const schema = { _fluent_custom: { custom: custom_fn } };
    // Fluent async validation handled in with_schema
    this.validate_schema(this._current_data, schema);
    return this;
  }

  /** Static factory برای lesson validation */
  static create_lesson_validator() {
    return new DataValidator({ strict: true });
  }

  /** Static factory برای user validation */
  static create_user_validator() {
    return new DataValidator({ strict: true });
  }
}

export default DataValidator;
