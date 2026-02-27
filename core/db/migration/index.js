/**
 * core/db/migrations/index.js
 * Registry مرکزی migration_step ها
 * Alpha Principles Compliant
 */

class Migrations {
  constructor() {
    /** @type {Map<string, MigrationStep>} */
    this._steps = new Map();

    /** @type {Map<string, Function[]>} */
    this._listeners = new Map();
  }

  /**
   * @param {{ step_id: string, migrate: Function, rollback?: Function }} step
   * @returns {Migrations}
   */
  register_migration(step) {
    if (
      !step ||
      typeof step.step_id !== 'string' ||
      typeof step.migrate !== 'function'
    ) {
      throw new Error('Invalid migration_step definition');
    }

    if (this._steps.has(step.step_id)) {
      throw new Error(`Migration already registered: ${step.step_id}`);
    }

    this._steps.set(step.step_id, Object.freeze({ ...step }));
    this._emit_event('migration_registered', step.step_id);

    return this;
  }

  /**
   * @param {Array<object>} steps
   * @returns {Migrations}
   */
  register_migrations(steps) {
    if (!Array.isArray(steps)) {
      throw new Error('register_migrations expects an array');
    }

    steps.forEach((step) => this.register_migration(step));
    return this;
  }

  /**
   * @returns {Array<object>}
   */
  get_all_migrations() {
    return Array.from(this._steps.values());
  }

  /**
   * @param {string} step_id
   * @returns {boolean}
   */
  has_migration(step_id) {
    return this._steps.has(step_id);
  }

  /**
   * @param {string} event_name
   * @param {Function} callback
   * @returns {Migrations}
   */
  on(event_name, callback) {
    if (typeof callback !== 'function') {
      throw new Error('Event listener must be a function');
    }

    if (!this._listeners.has(event_name)) {
      this._listeners.set(event_name, []);
    }

    this._listeners.get(event_name).push(callback);
    return this;
  }

  /**
   * @param {string} event_name
   * @param {any} payload
   * @private
   */
  _emit_event(event_name, payload) {
    const listeners = this._listeners.get(event_name) || [];
    listeners.forEach((fn) => fn(payload));
  }

  /**
   * Debug / Testing only – immutable deep copy
   * @returns {Map<string, Function[]>}
   */
  get_all_events() {
    return new Map(
      [...this._listeners.entries()].map(([k, v]) => [k, [...v]])
    );
  }
}

export const migrations = new Migrations();
