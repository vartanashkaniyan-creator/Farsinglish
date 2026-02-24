// core/models/lesson_model.js
import { SRSManager } from './srs_manager.js';
import { ContentValidator } from './content_validator.js';
import { generate_uuid, pipe } from './utils.js';

/** @readonly @enum {number} */
export const difficulty_level = Object.freeze({
  VERY_EASY: 1,
  EASY: 2,
  MEDIUM: 3,
  HARD: 4,
  VERY_HARD: 5
});

/** @readonly @enum {string} */
export const lesson_events = Object.freeze({
  UPDATED: 'lesson:updated',
  REVIEWED: 'lesson:reviewed',
  CONTENT_LOADED: 'lesson:content_loaded',
  ERROR: 'lesson:error'
});

export class LessonModel {
  #content;
  #srs_data;
  #history = [];
  #listeners = new Map();

  _content_loaded = false;

  constructor(
    data = {},
    dependencies = {}
  ) {
    if (!data.content) {
      throw new Error('lesson.content is required');
    }

    ContentValidator.validate_deep(data.content);

    this.id = generate_uuid();
    this.difficulty = data.difficulty ?? difficulty_level.MEDIUM;

    this.#content = data.content;

    this.srs_manager =
      dependencies.srs_manager ?? new SRSManager();

    this.logger =
      dependencies.logger ?? console;

    this.#srs_data =
      this.srs_manager.init_lesson(this.id, data.srs_data);

    this.save_snapshot();

    return new Proxy(this, this.#proxy_handler());
  }

  /* ---------------- Proxy Validation ---------------- */

  #proxy_handler() {
    return {
      set: (obj, prop, value) => {
        if (prop === 'difficulty') {
          if (!Object.values(difficulty_level).includes(value)) {
            throw new Error('invalid difficulty level');
          }
        }

        obj[prop] = value;
        obj.emit(lesson_events.UPDATED, { prop, value });
        return true;
      }
    };
  }

  /* ---------------- Events ---------------- */

  on(event, callback) {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }
    this.#listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    this.#listeners.get(event)?.delete(callback);
  }

  emit(event, payload) {
    this.#listeners
      .get(event)
      ?.forEach(cb => {
        try { cb(payload); }
        catch (e) { this.logger.error(e); }
      });
  }

  /* ---------------- Core Logic ---------------- */

  review(quality) {
    if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
      throw new Error('invalid review quality');
    }

    try {
      this.#srs_data =
        this.srs_manager.apply_sm2(this.#srs_data, quality);

      this.save_snapshot();
      this.emit(lesson_events.REVIEWED, { quality });
    } catch (error) {
      this.logger.error(error);
      this.emit(lesson_events.ERROR, error);
    }

    return this;
  }

  with(updates) {
    return new LessonModel(
      { ...this.to_object(), ...updates },
      { srs_manager: this.srs_manager, logger: this.logger }
    );
  }

  pipe(...operations) {
    return pipe(...operations)(this);
  }

  /* ---------------- State History ---------------- */

  save_snapshot() {
    this.#history.push(this.to_object());
    return this;
  }

  undo() {
    if (this.#history.length <= 1) return this;

    this.#history.pop();
    return new LessonModel(
      this.#history[this.#history.length - 1],
      { srs_manager: this.srs_manager, logger: this.logger }
    );
  }

  /* ---------------- Content ---------------- */

  get content() {
    return this._content_loaded
      ? structuredClone(this.#content)
      : this.#content;
  }

  async load_content() {
    if (this._content_loaded) return;

    ContentValidator.validate_deep(this.#content);
    this._content_loaded = true;
    this.emit(lesson_events.CONTENT_LOADED);
  }

  /* ---------------- Metrics ---------------- */

  get retention_rate() {
    return this.srs_manager.calculate_retention_rate(
      this.#srs_data
    );
  }

  calculate_next_review() {
    return this.srs_manager.calculate_next_review(
      this.#srs_data
    );
  }

  /* ---------------- Serialization ---------------- */

  to_object() {
    return {
      id: this.id,
      difficulty: this.difficulty,
      content: this._content_loaded
        ? structuredClone(this.#content)
        : this.#content,
      srs_data: structuredClone(this.#srs_data)
    };
  }

  to_db_format() {
    return this.to_object();
  }

  to_api_format() {
    return this.to_object();
  }

  /* ---------------- Smart Comparison ---------------- */

  [Symbol.toPrimitive](hint) {
    if (hint === 'number') return this.retention_rate;
    if (hint === 'string') return JSON.stringify(this.to_object());
    return this.id;
  }

  compare_to(other_lesson) {
    return this.retention_rate - other_lesson.retention_rate;
  }
      }
