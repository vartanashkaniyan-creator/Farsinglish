/**
 * @file migration_progress_ui.js
 * @description UI پیشرفت مهاجرت با رعایت کامل اصول آلفا و snak_case
 */

class MigrationProgressUI {
  /** @type {HTMLElement} */
  #progress_bar;

  /** @type {HTMLElement} */
  #progress_text;

  constructor(container, event_bus) {
    if (!container) throw new Error('Container is required');
    if (!event_bus) throw new Error('Event bus is required');

    this.migration_progress_container = container;
    this.event_bus = event_bus;
    this._listeners = [];
    this.current_progress = 0;
    this.current_task = '';

    this._init_ui();
    this._register_events();
  }

  _init_ui() {
    this.#progress_bar = document.createElement('div');
    this.#progress_bar.className = 'migration-progress-bar';

    this.#progress_text = document.createElement('div');
    this.#progress_text.className = 'migration-progress-text';
    this.#progress_text.textContent = 'Starting Migration...';

    this.migration_progress_container.appendChild(this.#progress_bar);
    this.migration_progress_container.appendChild(this.#progress_text);
  }

  _register_events() {
    const update_fn = (data) => this.update_progress(data);
    const complete_fn = (data) => this.complete_state(data);

    this.event_bus.on('migration_progress', update_fn);
    this.event_bus.on('migration_completed', complete_fn);

    this._listeners.push({ event: 'migration_progress', fn: update_fn });
    this._listeners.push({ event: 'migration_completed', fn: complete_fn });
  }

  update_progress(data) {
    if (!data || typeof data.progress !== 'number') return;

    this.current_progress = Math.min(Math.max(data.progress, 0), 100);
    this.current_task = data.task || this.current_task;

    this.#progress_bar.className = `migration-progress-bar progress-level-${Math.round(this.current_progress)}`;
    this.#progress_text.textContent = `${this.current_task} (${this.current_progress}%)`;
  }

  complete_state(data = {}) {
    this.current_progress = 100;
    this.current_task = data.task || 'Migration Completed';

    this.#progress_bar.className = 'migration-progress-bar progress-completed';
    this.#progress_text.textContent = this.current_task;
  }

  destroy() {
    if (this._listeners.length) {
      this._listeners.forEach(({ event, fn }) => {
        if (typeof fn === 'function') this.event_bus.off(event, fn);
      });
      this._listeners = [];
    }

    if (this.migration_progress_container) {
      this.migration_progress_container.innerHTML = '';
    }
  }
}

export default MigrationProgressUI;
