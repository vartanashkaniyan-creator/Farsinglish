/**
 * @file migration_steps.js
 * @description مدیریت پیشرفته migration دیتابیس‌ها با رعایت اصول آلفا و snake_case
 * @author
 */

import { EventEmitter } from 'eventemitter3';

/**
 * @typedef {Object} MigrationStep
 * @property {string} id - شناسه یکتا
 * @property {function(IDBDatabase): Promise<void>} apply_async - اجرای step
 * @property {function(IDBDatabase): Promise<void>} rollback_async - rollback step
 */

export class MigrationManager extends EventEmitter {
  #db_metadata = {};
  #db_connections = {};
  #migration_steps = {};
  #migration_history = {};
  #current_version = {};
  #migration_in_progress = false;

  /**
   * @param {Object} connection_manager - مدیریت اتصال به دیتابیس‌ها
   */
  constructor(connection_manager) {
    super();
    this.#db_connections = connection_manager;
  }

  /**
   * افزودن metadata دیتابیس
   * @param {string} db_key
   * @param {Object} metadata
   * @returns {MigrationManager}
   */
  add_db_instance(db_key, metadata) {
    if (!db_key || !metadata) throw new Error('invalid db_key or metadata');
    this.#db_metadata[db_key] = metadata;
    this.#migration_steps[db_key] = [];
    this.#migration_history[db_key] = [];
    this.#current_version[db_key] = 0;
    return this;
  }

  /**
   * clone امن step با حفظ توابع
   * @param {MigrationStep} step
   * @returns {MigrationStep}
   */
  #clone_step(step) {
    return {
      ...structuredClone(step),
      apply_async: step.apply_async,
      rollback_async: step.rollback_async,
    };
  }

  /**
   * اعتبارسنجی step
   * @param {MigrationStep} step
   */
  validate_migration_step(step) {
    if (!step || typeof step.apply_async !== 'function' || typeof step.rollback_async !== 'function') {
      throw new Error('invalid migration step');
    }
  }

  /**
   * افزودن step به DB مشخص
   * @param {MigrationStep} step
   * @param {string} db_key
   * @returns {MigrationManager}
   */
  add_migration_step(step, db_key) {
    this.validate_migration_step(step);
    if (!this.#migration_steps[db_key]) this.#migration_steps[db_key] = [];
    this.#migration_steps[db_key].push(this.#clone_step(step));
    this.emit('step_added', { db_key, step_id: step.id });
    return this;
  }

  /**
   * اجرای stepها تا target_version برای DB مشخص
   * @param {string} db_key
   * @param {number} target_version
   */
  async migrate_to_version_async(db_key, target_version) {
    if (!db_key || !this.#migration_steps[db_key]) throw new Error(`invalid db_key: ${db_key}`);
    if (target_version > this.#migration_steps[db_key].length) throw new Error('target_version out of range');

    const steps = this.#migration_steps[db_key];
    for (let i = this.#current_version[db_key]; i < target_version; i++) {
      const step = steps[i];
      try {
        const connection = await this.#db_connections.get_connection(db_key);
        await step.apply_async(connection);
        this.#migration_history[db_key].push(step);
        this.#current_version[db_key]++;
        this.emit('step_applied', { db_key, step_id: step.id, current_version: this.#current_version[db_key] });
      } catch (err) {
        this.emit('migration_error', { db_key, step_id: step.id, error: err });
        await this.rollback_last_step_async(db_key);
        throw err;
      }
    }
  }

  /**
   * rollback آخرین step برای DB مشخص
   * @param {string} db_key
   */
  async rollback_last_step_async(db_key) {
    const history_stack = this.#migration_history[db_key];
    if (!history_stack || history_stack.length === 0) return;

    const last_step = history_stack.pop();
    try {
      const connection = await this.#db_connections.get_connection(db_key);
      await last_step.rollback_async(connection);
      this.#current_version[db_key]--;
      this.emit('step_rolled_back', { db_key, step_id: last_step.id });
    } catch (err) {
      this.emit('rollback_error', { db_key, step_id: last_step.id, error: err });
      throw err;
    }
  }

  /**
   * migrate با transaction و backup/restore
   * @param {string} db_key
   * @param {number} target_version
   */
  async migrate_with_transaction(db_key, target_version) {
    const backup_metadata = structuredClone(this.#db_metadata);
    const backup_history = structuredClone(this.#migration_history);
    const backup_version = structuredClone(this.#current_version);

    try {
      await this.migrate_to_version_async(db_key, target_version);
    } catch (err) {
      this.#db_metadata = backup_metadata;
      this.#migration_history = backup_history;
      this.#current_version = backup_version;
      this.emit('migration_rollback', { db_key, error: err });
      throw err;
    }
  }

  /**
   * دریافت snapshot state فعلی DB
   * @param {string} db_key
   * @returns {Object}
   */
  get_snapshot_state(db_key) {
    if (!this.#db_metadata[db_key]) throw new Error(`invalid db_key: ${db_key}`);
    return {
      migration_steps: structuredClone(this.#migration_steps[db_key]),
      migration_history: structuredClone(this.#migration_history[db_key]),
      current_version: this.#current_version[db_key],
    };
  }

  /**
   * Undo آخرین عملیات migrate
   * @param {string} db_key
   */
  async undo_last_migration(db_key) {
    await this.rollback_last_step_async(db_key);
    this.emit('undo_performed', { db_key, current_version: this.#current_version[db_key] });
  }
}
