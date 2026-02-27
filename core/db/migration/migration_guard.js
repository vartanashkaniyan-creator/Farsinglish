/**
 * @file migration_guard.js
 * @description مدیریت مهاجرت‌ها با رعایت اصول آلفا
 * - Immutability و snapshot state
 * - Event-Driven coordination
 * - Error Handling استاندارد
 * - JSDoc کامل برای تمام توابع و typedefها
 */

import { clone_deep } from '../../utils/clone_utils.js';
import { logger } from '../logger/logger.js';
import { event_emitter } from '../event/event_bus.js';
import { schema_validator } from '../schema/schema_validator.js';
import { migration_runner } from './migration_runner.js';

/**
 * @typedef {Object} migration_guard_config
 * @property {Array<Object>} migrations لیست مهاجرت‌ها
 * @property {boolean} dry_run فقط شبیه‌سازی اجرا شود
 */

/**
 * کلاس MigrationGuard
 * مدیریت مهاجرت‌ها با قابلیت undo و snapshot
 */
export class migration_guard {
  /**
   * @param {migration_guard_config} config تنظیمات مهاجرت
   */
  constructor(config) {
    /** @private @type {migration_guard_config} */
    this._config = clone_deep(config);

    /** @private @type {Array<Object>} */
    this._snapshot_history = [];

    /** @private @type {boolean} */
    this._initialized = false;
  }

  /**
   * مقداردهی اولیه کلاس
   * @returns {void}
   */
  async init() {
    try {
      schema_validator.validate_deep(this._config);
      this._initialized = true;
      logger.info('MigrationGuard initialized successfully.');
      event_emitter.emit('migration_guard_initialized', { config: this._config });
    } catch (error) {
      logger.error('MigrationGuard initialization failed', error);
      event_emitter.emit('migration_guard_error', { error });
      throw error;
    }
  }

  /**
   * اجرای تمام مهاجرت‌ها
   * @returns {Promise<void>}
   */
  async execute_all_migrations() {
    if (!this._initialized) throw new Error('MigrationGuard not initialized');
    const snapshot = clone_deep(this._config);
    this._snapshot_history.push(snapshot);

    try {
      for (const migration of this._config.migrations) {
        await migration_runner.execute(migration);
        event_emitter.emit('migration_executed', { migration });
      }
      logger.info('All migrations executed successfully.');
      event_emitter.emit('all_migrations_completed');
    } catch (error) {
      logger.error('Migration execution failed', error);
      event_emitter.emit('migration_error', { error });
      throw error;
    }
  }

  /**
   * بازگرداندن آخرین مهاجرت
   * @returns {Promise<void>}
   */
  async undo_last_migration() {
    if (this._snapshot_history.length === 0) {
      logger.warn('No migration snapshot to undo.');
      return;
    }

    const last_snapshot = this._snapshot_history.pop();
    try {
      await migration_runner.rollback(last_snapshot.migrations);
      logger.info('Last migration undone successfully.');
      event_emitter.emit('migration_undone', { snapshot: last_snapshot });
    } catch (error) {
      logger.error('Undo migration failed', error);
      event_emitter.emit('migration_undo_error', { error });
      throw error;
    }
  }

  /**
   * دریافت وضعیت فعلی snapshot
   * @returns {Array<Object>} snapshot_history
   */
  snapshot_state() {
    return clone_deep(this._snapshot_history);
  }

  /**
   * افزودن مهاجرت جدید به لیست
   * @param {Object} migration مهاجرت جدید
   * @returns {void}
   */
  add_migration(migration) {
    if (!this._initialized) throw new Error('MigrationGuard not initialized');
    schema_validator.validate_deep(migration);
    this._config.migrations.push(clone_deep(migration));
    event_emitter.emit('migration_added', { migration });
  }
}
