/**
 * @file schema_validator.js
 * @description Validator پیشرفته اسکیماها برای دیتابیس با رعایت اصول آلفا
 */

import EventEmitter from 'events';
import { deep_clone } from '../../utils/deep_clone.js';
import { log_appender } from '../../logger/log_appender.js';

/**
 * @typedef {Object} ColumnSchema
 * @property {string} name - نام ستون
 * @property {('string'|'number'|'boolean'|'date'|'object'|'array')} type - نوع داده ستون
 * @property {boolean} [nullable] - آیا ستون nullable است
 */

/**
 * @typedef {Object} TableSchema
 * @property {string} table_name - نام جدول
 * @property {Array<ColumnSchema>} columns - لیست ستون‌ها
 * @property {Array<string>} [required_fields] - فیلدهای ضروری
 */

/** انواع مجاز ستون‌ها */
export const SCHEMA_TYPES = ['string', 'number', 'boolean', 'date', 'object', 'array'];

/**
 * Validator کلاس اسکیما
 */
export class SchemaValidator extends EventEmitter {
  /**
   * @param {Array<TableSchema>} [schemas=[]] - لیست اولیه اسکیماها
   */
  constructor(schemas = []) {
    super();
    this.schemas = Array.isArray(schemas) ? deep_clone(schemas) : [];
  }

  /**
   * افزودن یک اسکیما جدید
   * @param {TableSchema} table_schema
   * @returns {boolean} موفقیت
   */
  add_schema(table_schema) {
    if (!table_schema || !table_schema.table_name) return false;
    try {
      if (!this._validate_table_schema(table_schema)) {
        this.emit('validation_error', {
          table_name: table_schema.table_name || 'unknown',
          error: 'Invalid table schema'
        });
        return false;
      }
      this.schemas.push(deep_clone(table_schema));
      this.emit('schema_added', table_schema.table_name);
      return true;
    } catch (error) {
      log_appender.error(error);
      this.emit('validation_error', {
        table_name: table_schema.table_name || 'unknown',
        error
      });
      return false;
    }
  }

  /**
   * بررسی وجود اسکیما با نام مشخص
   * @param {string} table_name
   * @returns {boolean}
   */
  has_schema(table_name) {
    return this.schemas.some(s => s.table_name === table_name);
  }

  /**
   * پیدا کردن اسکیما بر اساس نام جدول
   * @param {string} table_name
   * @returns {TableSchema|null}
   */
  find_schema_by_name(table_name) {
    return this.schemas.find(s => s.table_name === table_name) || null;
  }

  /**
   * اعتبارسنجی کامل جدول
   * @private
   * @param {TableSchema} table_schema
   * @returns {boolean}
   */
  _validate_table_schema(table_schema) {
    if (!table_schema?.table_name || !Array.isArray(table_schema.columns)) return false;

    for (const col of table_schema.columns) {
      if (!col.name || !SCHEMA_TYPES.includes(col.type)) return false;
    }

    if (table_schema.required_fields &&
        !Array.isArray(table_schema.required_fields)) return false;

    return true;
  }

  /**
   * دریافت کل اسکیماها (readonly)
   * @returns {Array<TableSchema>}
   */
  get_all_schemas() {
    return deep_clone(this.schemas);
  }
}
