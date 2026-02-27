/**
 * @file core/db/connection/stats_aggregator.js
 * @description مدیریت آمار اجرا با immutability، event-driven و validation کامل
 * @fires StatsAggregator#stats_updated
 * @fires StatsAggregator#stats_reset
 * @fires StatsAggregator#stats_loaded
 * @fires StatsAggregator#stats_error
 */

import { deep_clone } from '../../utils/clone_utils.js';
import { validate_numeric_range } from '../../validators/validation_utils.js';
import EventEmitter from 'events';

export class StatsAggregator extends EventEmitter {
  /**
   * @param {Object} config
   * @param {boolean} [config.enable_logging=false]
   * @param {number} [config.max_history=1000]
   */
  constructor({ enable_logging = false, max_history = 1000 } = {}) {
    super();

    // Type check (اصل آلفا)
    if (typeof enable_logging !== 'boolean') throw new Error('enable_logging must be boolean');
    if (typeof max_history !== 'number' || max_history <= 0) throw new Error('max_history must be positive number');

    this._enable_logging = enable_logging;
    this._max_history = max_history;

    /** @type {Array<Object>} */
    this._history = [];

    /** @type {Object} */
    this._stats_data = {
      total_records: 0,
      success_count: 0,
      failure_count: 0,
      average_time_ms: 0
    };
  }

  /**
   * افزودن رکورد جدید
   * @param {number} execution_time_ms
   * @param {boolean} success
   * @returns {StatsAggregator} this (Fluent Interface)
   */
  add_record(execution_time_ms, success) {
    try {
      // Validation اول (اصل ۴)
      validate_numeric_range(execution_time_ms, 0, Number.MAX_SAFE_INTEGER, 'execution_time_ms');
      if (typeof success !== 'boolean') throw new Error('success must be boolean');

      // Immutable Data Flow (اصل ۲)
      const new_stats = deep_clone(this._stats_data);

      new_stats.total_records += 1;
      if (success) new_stats.success_count += 1;
      else new_stats.failure_count += 1;

      // محاسبه میانگین
      new_stats.average_time_ms = ((new_stats.average_time_ms * (new_stats.total_records - 1)) + execution_time_ms) / new_stats.total_records;

      this._stats_data = new_stats;

      // مدیریت History برای Memory Leak
      this._history.push(deep_clone(new_stats));
      if (this._history.length > this._max_history) this._history.shift();

      this.emit('stats_updated', deep_clone(this._stats_data));
      if (this._enable_logging) console.log('Stats updated:', this._stats_data);
    } catch (error) {
      this.emit('stats_error', error);
      if (this._enable_logging) console.error('StatsAggregator error:', error);
      throw error;
    }
    return this;
  }

  /**
   * ریست کردن آمار
   * @returns {StatsAggregator}
   */
  reset() {
    try {
      this._stats_data = {
        total_records: 0,
        success_count: 0,
        failure_count: 0,
        average_time_ms: 0
      };
      this._history = [];
      this.emit('stats_reset');
    } catch (error) {
      this.emit('stats_error', error);
      throw error;
    }
    return this;
  }

  /**
   * بارگذاری آمار از JSON
   * @param {string} json_data
   * @returns {StatsAggregator}
   */
  from_json(json_data) {
    try {
      const parsed = JSON.parse(json_data);
      ['total_records', 'success_count', 'failure_count', 'average_time_ms'].forEach(key => {
        if (typeof parsed[key] !== 'number') throw new Error(`Invalid stats field: ${key}`);
        if (parsed[key] < 0) throw new Error(`Negative value for ${key}`);
      });
      this._stats_data = deep_clone(parsed);
      this.emit('stats_loaded', deep_clone(this._stats_data));
    } catch (error) {
      this.emit('stats_error', error);
      throw error;
    }
    return this;
  }

  /**
   * تبدیل آمار به JSON
   * @returns {string}
   */
  to_json() {
    return JSON.stringify(this._stats_data);
  }

  /**
   * دریافت snapshot آخرین وضعیت
   * @returns {Object}
   */
  get_snapshot() {
    return deep_clone(this._stats_data);
  }

  /**
   * دریافت کل History
   * @returns {Array<Object>}
   */
  get_history() {
    return deep_clone(this._history);
  }
}
