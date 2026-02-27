/**
 * @file backoff_calculator.js
 * @description مدیریت محاسبات exponential backoff برای retry درخواست‌ها (فوق‌پیشرفته)
 * @module core/db/connection/backoff_calculator
 */

'use strict';

/**
 * @typedef {Object} BackoffOptions
 * @property {number} initial_delay_ms - تأخیر اولیه به میلی‌ثانیه
 * @property {number} max_delay_ms - بیشترین تأخیر به میلی‌ثانیه
 * @property {number} multiplier - ضریب رشد تأخیر
 * @property {number} jitter - درصد تصادفی برای جلوگیری از همزمانی
 */

/**
 * مقادیر پیش‌فرض Backoff
 */
const DEFAULT_BACKOFF_CONFIG = Object.freeze({
    initial_delay_ms: 100,
    max_delay_ms: 10000,
    multiplier: 2,
    jitter: 0.1,
    max_attempts: 5
});

/**
 * اعتبارسنجی مقادیر BackoffOptions
 * @param {BackoffOptions} options 
 */
function validate_backoff_options(options) {
    if (options.initial_delay_ms < 0) throw new Error('initial_delay_ms must be >= 0');
    if (options.max_delay_ms <= 0) throw new Error('max_delay_ms must be > 0');
    if (options.multiplier < 1) throw new Error('multiplier must be >= 1');
    if (options.jitter < 0 || options.jitter > 1) throw new Error('jitter must be between 0 and 1');
}

/**
 * کلاس مدیریت backoff برای retry ها
 */
class BackoffCalculator {
  /**
   * @param {BackoffOptions} options
   * @param {() => number} random_generator - تابع تولید عدد تصادفی [0,1] (برای تست قابل تزریق)
   */
  constructor(options = {}, random_generator = Math.random) {
    const opts = { ...DEFAULT_BACKOFF_CONFIG, ...options };
    validate_backoff_options(opts);

    this.initial_delay_ms = opts.initial_delay_ms;
    this.max_delay_ms = opts.max_delay_ms;
    this.multiplier = opts.multiplier;
    this.jitter = opts.jitter;
    this.random_generator = random_generator;

    this.attempt_count = 0;
    Object.freeze(this); // کلاس immutable
  }

  /**
   * محاسبه تأخیر بعدی با exponential backoff و jitter
   * @returns {number} تأخیر به میلی‌ثانیه
   */
  next_delay_ms() {
    let delay = this.initial_delay_ms * Math.pow(this.multiplier, this.attempt_count);
    delay = Math.min(delay, this.max_delay_ms);

    // اعمال jitter تصادفی با random generator تزریق شده
    const jitter_value = delay * this.jitter * (this.random_generator() * 2 - 1);
    delay += jitter_value;

    this.attempt_count += 1;
    return Math.max(0, Math.round(delay));
  }

  /**
   * ریست شمارنده تلاش‌ها
   */
  reset() {
    this.attempt_count = 0;
  }

  /**
   * اجرای تابع با retry و backoff مدیریت‌شده
   * @template T
   * @param {() => Promise<T>} fn - تابع async که باید اجرا شود
   * @param {number} max_attempts - بیشترین تعداد تلاش
   * @returns {Promise<T>}
   */
  async execute_with_retry(fn, max_attempts = DEFAULT_BACKOFF_CONFIG.max_attempts) {
    this.reset();
    let last_error;

    for (let attempt = 0; attempt < max_attempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        last_error = error;
        const delay = this.next_delay_ms();
        await this._sleep(delay);
      }
    }

    throw last_error;
  }

  /**
   * @private
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default BackoffCalculator;
