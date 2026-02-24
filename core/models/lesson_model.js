// core/models/lesson_model.js
import { generate_uuid } from '../utils/utils.js';

/** @readonly @enum {string} */
export const LessonEvents = {
  UPDATED: 'lesson:updated',
  REVIEWED: 'lesson:reviewed',
  CONTENT_LOADED: 'lesson:content_loaded',
  LOAD_ERROR: 'lesson:load_error'
};

/** @readonly @enum {number} */
export const DifficultyLevel = {
  VERY_EASY: 1,
  EASY: 2,
  MEDIUM: 3,
  HARD: 4,
  VERY_HARD: 5
};

export class LessonError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LessonError';
    this.code = options.code || 'LESSON_ERROR';
    this.cause = options.cause;
  }
}

/**
 * مدل اصلی درس پیشرفته
 * @class
 * @param {Object} params
 * @param {Object} params.content - محتوای درس
 * @param {Object} params.srs_data - داده‌های SRS
 * @param {number} [params.difficulty=3] - سطح سختی
 * @param {Object} [params.services={}] - سرویس‌های تزریق شده
 */
export class LessonModel {
  #content;
  #srs_data;
  #history = [];
  #listeners = new Map();
  _content_loaded = false;

  constructor({ content, srs_data, difficulty = DifficultyLevel.MEDIUM, services = {} } = {}) {
    if (!content) throw new LessonError('Content is required');
    this.validator = services.validator;
    this.srs_manager = services.srs_manager;
    this.#content = content;
    this.#srs_data = this.srs_manager?.init(srs_data) ?? srs_data ?? {};
    this.id = generate_uuid();
    this.difficulty = difficulty;

    this.save_snapshot();
    return new Proxy(this, this._proxy_handler());
  }

  _proxy_handler() {
    const validators = {
      difficulty: v => Object.values(DifficultyLevel).includes(v),
      id: v => typeof v === 'string' && v.length > 0,
      _content_loaded: v => typeof v === 'boolean'
    };
    return {
      set: (obj, prop, value) => {
        if (validators[prop] && !validators[prop](value)) {
          throw new LessonError(`Invalid value for ${prop}`);
        }
        obj[prop] = value;
        if (prop !== 'id') this.emit(LessonEvents.UPDATED, { prop, value });
        return true;
      }
    };
  }

  /** EventEmitter واقعی */
  on(event, callback) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }
  off(event, callback) {
    this.#listeners.get(event)?.delete(callback);
  }
  emit(event, ...args) {
    const listeners = this.#listeners.get(event);
    if (listeners) listeners.forEach(cb => { try { cb(...args); } catch (e) { console.error(e); } });
  }

  /** اعمال الگوریتم SM-2 */
  apply_sm2(quality) {
    if (!this.srs_manager) throw new LessonError('SRS Manager not injected');
    this.#srs_data = this.srs_manager.apply_sm2(this.#srs_data, quality);
    this.save_snapshot();
    this.emit(LessonEvents.REVIEWED, quality);
  }

  /** Immutable update */
  with(updates) {
    return new LessonModel({ ...this.to_object(), ...updates, services: { validator: this.validator, srs_manager: this.srs_manager } });
  }

  /** Fluent pipe */
  pipe(...operations) {
    return operations.reduce((acc, fn) => fn(acc), this);
  }

  /** State History */
  save_snapshot() {
    this.#history.push(this.to_object());
    return this;
  }
  undo() {
    if (this.#history.length > 1) {
      this.#history.pop();
      return new LessonModel({ ...this.#history[this.#history.length - 1], services: { validator: this.validator, srs_manager: this.srs_manager } });
    }
    return this;
  }

  /** Content */
  get content() {
    return this._content_loaded ? structuredClone(this.#content) : this.#content;
  }

  async load_content() {
    if (this._content_loaded) return;
    try {
      if (this.validator?.validate_deep) this.validator.validate_deep(this.#content);
      // شبیه‌سازی بارگذاری async
      await new Promise(res => setTimeout(res, 0));
      this._content_loaded = true;
      this.emit(LessonEvents.CONTENT_LOADED);
    } catch (error) {
      this.emit(LessonEvents.LOAD_ERROR, error);
      throw new LessonError('Failed to load content', { cause: error });
    }
  }

  /** SRS */
  calculate_next_review() {
    return this.srs_manager?.calculate_next_review(this.#srs_data) ?? null;
  }

  /** Stats */
  get retention_rate() {
    return this.srs_manager?.calculate_retention_rate(this.#srs_data) ?? 0;
  }

  /** Async Iterator برای محتوای chunked */
  async *[Symbol.asyncIterator]() {
    for (const chunk of this.#content.chunks ?? [this.#content]) {
      yield chunk;
    }
  }

  /** Output Formats */
  to_object() {
    return {
      id: this.id,
      difficulty: this.difficulty,
      content: this._content_loaded ? structuredClone(this.#content) : this.#content,
      srs_data: { ...this.#srs_data }
    };
  }
  to_db_format() { return this.to_object(); }
  to_api_format() { return this.to_object(); }

  /** Symbol-based comparison هوشمند */
  [Symbol.toPrimitive](hint) {
    if (hint === 'number') return this.retention_rate;
    if (hint === 'string') return JSON.stringify(this.to_object());
    return this.id;
  }

  compare_to(other_lesson) {
    return this.retention_rate - other_lesson.retention_rate;
  }

  /** Localization */
  get_localized_title(lang = 'fa') {
    return this.#content[lang]?.title ?? this.#content.en?.title ?? '';
  }
  }
