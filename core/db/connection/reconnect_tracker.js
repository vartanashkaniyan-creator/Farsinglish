/**
 * @file reconnect_tracker.js
 * @description مدیریت تلاش‌های reconnect با backoff، مدیریت Abort و تشخیص خطاهای قابل retry
 */

import EventEmitter from 'events';

/**
 * @typedef {Object} ReconnectOptions
 * @property {number} max_attempts حداکثر تعداد تلاش‌ها (0 = بی‌نهایت)
 * @property {number} base_delay_ms تاخیر اولیه به میلی‌ثانیه
 * @property {number} backoff_factor ضریب افزایش تاخیر
 * @property {Function} connect_fn تابع اتصال async که ممکن است reject شود
 * @property {Function} [is_retryable_fn] تابع برای تشخیص اینکه خطا retryable است
 */

/**
 * کلاس مدیریت reconnect
 */
export class ReconnectTracker extends EventEmitter {
  /**
   * @param {ReconnectOptions} options
   */
  constructor(options) {
    super();
    const {
      max_attempts = 5,
      base_delay_ms = 1000,
      backoff_factor = 2,
      connect_fn,
      is_retryable_fn = () => true
    } = options;

    this.max_attempts = max_attempts;
    this.base_delay_ms = base_delay_ms;
    this.backoff_factor = backoff_factor;
    this.connect_fn = connect_fn;
    this.is_retryable_fn = is_retryable_fn;

    this.attempt_count = 0;
    this.is_connected = false;
    this._abort_controller = null;
  }

  /**
   * شروع فرآیند reconnect
   * @returns {Promise<void>}
   */
  async start_reconnect() {
    // ⚠️ بهبود race condition: بررسی و ساخت AbortController در یک بلاک synchronized-like
    if (this._abort_controller) {
      this.emit('error', new Error('Reconnect already in progress'));
      return;
    }

    const abort_controller = new AbortController();
    this._abort_controller = abort_controller;
    const { signal } = abort_controller;

    this.reset_tracker();

    while (!this.is_connected && (this.attempt_count < this.max_attempts || this.max_attempts === 0)) {
      if (signal.aborted) {
        this.emit('abort');
        break;
      }

      this.attempt_count++;
      try {
        await this.connect_fn();
        this.is_connected = true;
        this.emit('connected');
        break;
      } catch (error) {
        if (!this.is_retryable_fn(error)) {
          this.emit('error', error);
          break;
        }
        this.emit('retry', { attempt_count: this.attempt_count, error });
        const delay_ms = this.calculate_delay();
        await this.delay(delay_ms, signal);
      }
    }

    this._abort_controller = null;
  }

  /**
   * لغو فرآیند reconnect
   */
  cancel_reconnect() {
    if (this._abort_controller) {
      this._abort_controller.abort();
      this._abort_controller = null;
      this.emit('cancelled');
    }
  }

  /**
   * ریست کردن شمارنده و وضعیت اتصال
   */
  reset_tracker() {
    this.attempt_count = 0;
    this.is_connected = false;
  }

  /**
   * محاسبه تاخیر بر اساس backoff_factor
   * @returns {number} تاخیر به میلی‌ثانیه
   */
  calculate_delay() {
    return Math.round(this.base_delay_ms * Math.pow(this.backoff_factor, this.attempt_count - 1));
  }

  /**
   * تاخیر امن با پشتیبانی از AbortController
   * @param {number} ms
   * @param {AbortSignal} signal
   * @returns {Promise<void>}
   */
  delay(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Reconnect aborted'));
      });
    });
  }
}
