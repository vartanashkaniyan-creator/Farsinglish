// core/db/validators/config_schema_validator.js

/**
 * @file config_schema_validator.js
 * @description Validator پیشرفته پیکربندی DB بر اساس اصول آلفا
 */

/**
 * @typedef {Object} ConfigSchema
 * @property {string} db_name - نام دیتابیس
 * @property {number} version - نسخه schema
 * @property {Array<Object>} tables - تعریف جداول
 * @property {Object} [optional_settings] - تنظیمات اختیاری
 */

import { logger } from '../../logger/logger.js';

export class ConfigSchemaValidator {
  /**
   * Sanitize config: حذف فیلدهای غیرمجاز در optional_settings
   * @param {ConfigSchema} config 
   * @returns {ConfigSchema} نسخه پاکسازی شده
   */
  static sanitize_config(config) {
    if (!config.optional_settings) return config;

    const allowed_keys = ['theme', 'notifications', 'cache_strategy'];
    const sanitized_settings = {};
    for (const key of Object.keys(config.optional_settings)) {
      if (allowed_keys.includes(key)) {
        sanitized_settings[key] = config.optional_settings[key];
      }
    }

    return {
      ...config,
      optional_settings: sanitized_settings,
    };
  }

  /**
   * اعتبارسنجی کل پیکربندی
   * @param {ConfigSchema} config پیکربندی ورودی
   * @returns {Promise<void>}
   * @throws {Error} در صورت عدم تطابق با schema
   */
  static async validate_config_schema(config) {
    try {
      if (!config) {
        throw new Error('Config is null or undefined');
      }

      if (typeof config !== 'object') {
        throw new TypeError('Config must be an object');
      }

      // Required fields
      const required_keys = ['db_name', 'version', 'tables'];
      for (const key of required_keys) {
        if (!(key in config)) {
          throw new Error(`Missing required key: ${key}`);
        }
      }

      // Type checks
      if (typeof config.db_name !== 'string') {
        throw new TypeError('db_name must be a string');
      }

      if (!Number.isInteger(config.version) || config.version < 1) {
        throw new TypeError('version must be an integer >= 1');
      }

      if (!Array.isArray(config.tables)) {
        throw new TypeError('tables must be an array');
      }

      // Optional settings validation
      config = ConfigSchemaValidator.sanitize_config(config);

      // Async simulation for potential I/O
      await Promise.resolve();

      logger.info({
        message: 'Config validated successfully',
        context: 'config_schema_validator',
        config_summary: {
          db_name: config.db_name,
          version: config.version,
          tables_count: config.tables.length,
        },
      });

    } catch (error) {
      logger.error({
        message: 'Config validation failed',
        context: 'config_schema_validator',
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });

      throw error;
    }
  }
}
