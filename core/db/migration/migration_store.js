/**
 * @file migration_store.js
 * @description مدیریت مهاجرت‌های پایگاه داده با اصول آلفا (نسخه اصلاح‌شده)
 * @version 1.1.0
 */

import { clone_deep } from '../utils/clone_util.js';
import { validate_migration_schema } from './migration_validator.js';
import EventEmitter from 'events';

/**
 * @typedef {Object} MigrationRecord
 * @property {string} migration_id
 * @property {string} description
 * @property {Date|null} applied_at
 * @property {boolean} success
 * @property {Error|null} error_log
 */

/**
 * MigrationStore - مدیریت ذخیره، اعمال و rollback مهاجرت‌ها
 */
export class MigrationStore extends EventEmitter {
  #migration_history = [];
  #pending_migrations = [];
  #db_connector = null;
  #stop_on_error = false;

  /**
   * @param {Object} db_connector - اتصال پایگاه داده
   * @param {boolean} [stop_on_error=false] - توقف اجرای مهاجرت‌ها پس از خطا
   */
  constructor(db_connector, stop_on_error = false) {
    super();
    if (!db_connector) throw new Error('db_connector is required');
    this.#db_connector = db_connector;
    this.#stop_on_error = stop_on_error;
  }

  /**
   * اضافه کردن مهاجرت جدید
   * @param {MigrationRecord} migration
   */
  add_migration(migration) {
    if (!migration) throw new Error('migration cannot be null or undefined');
    validate_migration_schema(migration);

    const migration_clone = clone_deep(migration);
    migration_clone.error_log = null;
    this.#pending_migrations.push(migration_clone);
    this.emit('migration_added', migration_clone);
  }

  /**
   * اعمال تمام مهاجرت‌های در انتظار
   */
  async apply_pending_migrations() {
    for (const migration of this.#pending_migrations) {
      try {
        await this.#db_connector.execute_migration(migration);
        const applied_migration = clone_deep({ ...migration, applied_at: new Date(), success: true });
        this.#migration_history.push(applied_migration);
        this.emit('migration_applied', applied_migration);
      } catch (error) {
        const failed_migration = clone_deep({ ...migration, applied_at: new Date(), success: false, error_log: error });
        this.#migration_history.push(failed_migration);
        this.emit('migration_failed', failed_migration, error);
        if (this.#stop_on_error) break;
      }
    }
    this.#pending_migrations = [];
  }

  /**
   * بازگردانی مهاجرت‌ها تا نسخه مشخص
   * @param {string} version_id
   */
  async rollback_to_version(version_id) {
    const idx = this.#migration_history.findIndex(m => m.migration_id === version_id);
    if (idx === -1) return;

    for (let i = this.#migration_history.length - 1; i >= idx; i--) {
      const migration = this.#migration_history[i];
      try {
        await this.#db_connector.rollback_migration(migration);
        const rolled_back = clone_deep({ ...migration, applied_at: null, success: false });
        this.#migration_history.pop();
        this.emit('migration_rolled_back', rolled_back);
      } catch (error) {
        migration.error_log = error;
        this.emit('rollback_failed', migration, error);
      }
    }
  }

  /**
   * دسترسی به تاریخچه مهاجرت‌ها (Immutable)
   * @returns {MigrationRecord[]}
   */
  get_migration_history() {
    return clone_deep(this.#migration_history);
  }

  /**
   * دسترسی به مهاجرت‌های در انتظار (Immutable)
   * @returns {MigrationRecord[]}
   */
  get_pending_migrations() {
    return clone_deep(this.#pending_migrations);
  }
}
