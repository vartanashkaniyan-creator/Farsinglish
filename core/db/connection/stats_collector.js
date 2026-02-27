// core/db/connection/stats_collector.js
import { structured_clone_fallback } from '../utils/clone_utils.js';
import EventEmitter from 'events';

/**
 * @typedef {Object} StatsEntry
 * @property {Date} timestamp - زمان ثبت
 * @property {Object} data - داده‌های جمع‌آوری شده
 */

/**
 * StatsCollector: جمع‌آوری و نگهداری آمار پایگاه داده
 * ویژگی‌ها:
 *  - Fluent Interface
 *  - AbortController برای عملیات Async
 *  - تاریخچه آمار (#stats_history و #current_stats) با محدودیت max_history
 *  - Event-Driven Error Handling
 */
export class StatsCollector extends EventEmitter {
  #db_query_runner;
  #stats_history = [];
  #current_stats = null;
  #abort_controller = null;
  #interval_id = null;
  #max_history = 100;

  /**
   * @param {Object} db_query_runner - instance تزریق شده برای اجرای query ها
   * @param {number} max_history - حداکثر تعداد ورودی‌های تاریخچه
   */
  constructor(db_query_runner, max_history = 100) {
    super();
    if (!db_query_runner) throw new Error('db_query_runner is required');
    this.#db_query_runner = db_query_runner;
    this.#max_history = max_history;
  }

  /**
   * شروع جمع‌آوری دوره‌ای آمار
   * @param {number} interval_ms
   * @returns {StatsCollector} Fluent
   */
  start_periodic_collection(interval_ms) {
    if (typeof interval_ms !== 'number' || interval_ms <= 0) {
      throw new Error('interval_ms must be a positive number');
    }

    if (this.#interval_id) this.stop_periodic_collection();

    this.#abort_controller = new AbortController();
    const signal = this.#abort_controller.signal;

    this.#interval_id = setInterval(async () => {
      try {
        if (signal.aborted) return;

        const data = await this.#db_query_runner.fetch_stats({ signal });
        const snapshot = structured_clone_fallback(data);

        this.#current_stats = snapshot;
        this.#stats_history.push({
          timestamp: new Date(),
          data: snapshot
        });

        // محدودیت تعداد تاریخچه
        if (this.#stats_history.length > this.#max_history) {
          this.#stats_history.shift();
        }

        this.emit('stats_updated', snapshot);
      } catch (error) {
        this.emit('stats_error', error);
      }
    }, interval_ms);

    return this;
  }

  /**
   * توقف جمع‌آوری دوره‌ای
   * @returns {StatsCollector} Fluent
   */
  stop_periodic_collection() {
    if (this.#interval_id) clearInterval(this.#interval_id);
    if (this.#abort_controller) this.#abort_controller.abort();
    this.#interval_id = null;
    this.#abort_controller = null;
    return this;
  }

  /**
   * آخرین وضعیت آمار
   * @returns {Object|null}
   */
  get_current_stats() {
    return this.#current_stats;
  }

  /**
   * تمام تاریخچه آمار
   * @returns {StatsEntry[]}
   */
  get_stats_history() {
    return [...this.#stats_history];
  }

  /**
   * اجرای تابع aggregator روی آخرین آمار
   * @param {(stats: Object) => any} aggregator_function
   * @returns {any}
   */
  aggregate(aggregator_function) {
    if (!this.#current_stats) return null;
    try {
      return aggregator_function(structured_clone_fallback(this.#current_stats));
    } catch (error) {
      this.emit('stats_error', error);
      return null;
    }
  }

  /**
   * پاک‌سازی کامل تاریخچه آمار
   * @returns {StatsCollector} Fluent
   */
  reset_stats_history() {
    this.#stats_history = [];
    this.#current_stats = null;
    return this;
  }
}

// Helper: fallback برای clone در محیط‌های قدیمی
export function structured_clone_fallback(obj) {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}
