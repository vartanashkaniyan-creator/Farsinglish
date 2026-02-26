/**
 * core/db/connection/connection_stats.js
 *
 * طراحی‌شده بر اساس اصول آلفا
 *
 * اهداف:
 * - جمع‌آوری آمار اتصال بدون side-effect
 * - Immutability در خروجی‌ها
 * - O(1) update برای همه counters
 * - سازگار با Browser / PWA
 * - بدون وابستگی خارجی
 * - snake_case کامل
 */

/**
 * @typedef {Object} connection_stats_snapshot
 * @property {number} total_created
 * @property {number} total_destroyed
 * @property {number} active_connections
 * @property {number} idle_connections
 * @property {number} busy_connections
 * @property {number} error_count
 * @property {number} reconnect_attempts
 * @property {number} reconnect_success
 * @property {number} reconnect_failed
 * @property {number} last_updated_at
 */

/**
 * کلاس مدیریت آمار اتصال
 * فقط مسئول آمار است (SRP کامل)
 */
export class connection_stats {
  #total_created = 0;
  #total_destroyed = 0;

  #active_connections = 0;
  #idle_connections = 0;
  #busy_connections = 0;

  #error_count = 0;

  #reconnect_attempts = 0;
  #reconnect_success = 0;
  #reconnect_failed = 0;

  #last_updated_at = Date.now();

  /**
   * @private
   */
  #touch() {
    this.#last_updated_at = Date.now();
  }

  /** lifecycle */
  record_created() {
    this.#total_created++;
    this.#active_connections++;
    this.#touch();
  }

  record_destroyed() {
    if (this.#active_connections > 0) {
      this.#active_connections--;
    }
    this.#total_destroyed++;
    this.#touch();
  }

  /** state */
  record_idle() {
    if (this.#busy_connections > 0) {
      this.#busy_connections--;
    }
    this.#idle_connections++;
    this.#touch();
  }

  record_busy() {
    if (this.#idle_connections > 0) {
      this.#idle_connections--;
    }
    this.#busy_connections++;
    this.#touch();
  }

  /** errors */
  record_error() {
    this.#error_count++;
    this.#touch();
  }

  /** reconnect */
  record_reconnect_attempt() {
    this.#reconnect_attempts++;
    this.#touch();
  }

  record_reconnect_success() {
    this.#reconnect_success++;
    this.#touch();
  }

  record_reconnect_failed() {
    this.#reconnect_failed++;
    this.#touch();
  }

  /**
   * snapshot immutable از وضعیت فعلی
   *
   * @returns {connection_stats_snapshot}
   */
  get_snapshot() {
    return Object.freeze({
      total_created: this.#total_created,
      total_destroyed: this.#total_destroyed,
      active_connections: this.#active_connections,
      idle_connections: this.#idle_connections,
      busy_connections: this.#busy_connections,
      error_count: this.#error_count,
      reconnect_attempts: this.#reconnect_attempts,
      reconnect_success: this.#reconnect_success,
      reconnect_failed: this.#reconnect_failed,
      last_updated_at: this.#last_updated_at,
    });
  }

  /**
   * ریست کامل آمار (کنترل‌شده)
   */
  reset() {
    this.#total_created = 0;
    this.#total_destroyed = 0;
    this.#active_connections = 0;
    this.#idle_connections = 0;
    this.#busy_connections = 0;
    this.#error_count = 0;
    this.#reconnect_attempts = 0;
    this.#reconnect_success = 0;
    this.#reconnect_failed = 0;
    this.#touch();
  }
}
این فایب رو بر اساس اصول آلفا و رعایت اصلsnak case_در نامگذاریها
فایل رو بصورت فوق پیشرفته وفوق تخصصی،سختگیرانه ولی دقیق وفنی وتخصصی و بدون تعصب بررسی کن
