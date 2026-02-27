/**
 * @file migration_tracker.js
 * @description مدیریت مهاجرت‌های دیتابیس با رعایت اصول آلفا و logging جداگانه
 * @version 1.1.0
 */

import { clone_deep } from '../../utils/clone_util.js';

/**
 * @typedef {Object} MigrationEntry
 * @property {string} id - شناسه یکتا مهاجرت
 * @property {string} description - توضیح کوتاه مهاجرت
 * @property {boolean} executed - وضعیت اجرای مهاجرت
 * @property {Date} timestamp - زمان آخرین اجرا
 */

/**
 * @typedef {Object} MigrationTrackerDeps
 * @property {EventBusInterface} event_bus - سیستم انتشار رویداد
 * @property {ValidatorInterface} validator - اعتبارسنجی مهاجرت‌ها
 * @property {MigrationExecutorInterface} executor - اجرای واقعی مهاجرت‌ها
 * @property {LoggerInterface} logger - لاگینگ تخصصی
 */

export class MigrationTracker {
  /**
   * @param {MigrationTrackerDeps} deps - وابستگی‌ها از طریق DI
   */
  constructor({ event_bus, validator, executor, logger }) {
    /** @private */
    this._event_bus = event_bus;
    /** @private */
    this._validator = validator;
    /** @private */
    this._executor = executor;
    /** @private */
    this._logger = logger;
    /** @private @type {MigrationEntry[]} */
    this._migrations = [];
    /** @private @type {MigrationEntry[]} */
    this._snapshots = [];
  }

  /**
   * افزودن مهاجرت جدید
   * @param {MigrationEntry} migration
   */
  add_migration(migration) {
    this._validator.validate_migration_entry(migration);
    this._migrations.push(clone_deep(migration));
    this._event_bus.emit('migration_added', clone_deep(migration));
    this._logger.info(`Migration added: ${migration.id}`);
  }

  /**
   * اجرای مهاجرت مشخص
   * @param {string} migration_id
   * @returns {Promise<void>}
   */
  async execute_migration(migration_id) {
    const migration = this._migrations.find(m => m.id === migration_id);
    if (!migration) {
      const errMsg = `Migration not found: ${migration_id}`;
      this._logger.error(errMsg);
      throw new Error(errMsg);
    }

    this._create_snapshot();

    try {
      await this._executor.execute_migration(clone_deep(migration));
      migration.executed = true;
      migration.timestamp = new Date();
      this._event_bus.emit('migration_executed', clone_deep(migration));
      this._logger.info(`Migration executed: ${migration.id}`);
    } catch (err) {
      this._logger.error(`Migration failed: ${migration.id}`, err);
      this._restore_last_snapshot();
      this._event_bus.emit('migration_failed', { migration_id, error: err });
      throw err;
    }
  }

  /**
   * گرفتن آخرین snapshot
   * @returns {MigrationEntry[]}
   */
  get_last_snapshot() {
    if (this._snapshots.length === 0) return [];
    return clone_deep(this._snapshots[this._snapshots.length - 1]);
  }

  /**
   * ایجاد snapshot جدید
   * @private
   */
  _create_snapshot() {
    this._snapshots.push(clone_deep(this._migrations));
  }

  /**
   * بازگرداندن آخرین snapshot
   * @private
   */
  _restore_last_snapshot() {
    if (this._snapshots.length === 0) {
      this._logger.warn('No snapshot to restore');
      return;
    }
    const last_snapshot = this._snapshots.pop();
    this._migrations = clone_deep(last_snapshot);
    this._logger.info('Snapshot restored successfully');
  }

  /**
   * لیست همه مهاجرت‌ها
   * @returns {MigrationEntry[]}
   */
  list_migrations() {
    return clone_deep(this._migrations);
  }
}
