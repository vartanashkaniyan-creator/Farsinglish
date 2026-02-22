import { SRSManager } from './SRSManager.js';
import { ContentValidator } from './ContentValidator.js';
import { LessonStats } from './LessonStats.js';
import { generateUUID, pipe } from './utils.js';

/**
 * مدل اصلی درس با قابلیت‌های پیشرفته
 * @class
 * @param {Object} data - داده‌های اولیه درس
 * @param {Object} data.content - محتوای درس
 * @param {Object} data.srsData - داده‌های SRS
 * @property {string} id - شناسه یکتا
 * @property {number} difficulty - سطح سختی (۱-۵)
 * @fires update - هنگام به‌روزرسانی
 */
export class LessonModel {
  #content;
  #srsData;
  #history = [];
  #events = {};
  _contentLoaded = false;

  constructor(data = {}) {
    ContentValidator.validateDeep(data.content);
    // Lazy clone اگر داده سنگین است
    this.#content = data.content; 
    this.#srsData = SRSManager.init(data.srsData);
    this.id = generateUUID();
    this.difficulty = data.difficulty ?? 3;

    this.saveSnapshot();
    return new Proxy(this, this._proxyHandler());
  }

  _proxyHandler() {
    return {
      set: (obj, prop, value) => {
        if (prop === 'difficulty' && (value < 1 || value > 5)) {
          throw new Error('سختی باید بین ۱-۵ باشد');
        }
        obj[prop] = value;
        return true;
      },
    };
  }

  /** اعمال الگوریتم SM-2
   * @param {number} quality - کیفیت پاسخ (۰-۵)
   * @fires update
   */
  applySM2(quality) {
    this.#srsData = SRSManager.applySM2(this.#srsData, quality);
    this.saveSnapshot();
  }

  /** Immutable update */
  with(updates) {
    return new LessonModel({ ...this.toObject(), ...updates });
  }

  /** Fluent pipe */
  pipe(...operations) {
    return pipe(...operations)(this);
  }

  /** EventEmitter */
  on(event, callback) {
    this.#events[event] = callback;
    return this;
  }
  emit(event, ...args) {
    this.#events[event]?.(...args);
  }

  /** State History */
  saveSnapshot() {
    this.#history.push(this.toObject());
    return this;
  }
  undo() {
    if (this.#history.length > 1) {
      this.#history.pop();
      return new LessonModel(this.#history[this.#history.length - 1]);
    }
    return this;
  }

  /** Content */
  get content() {
    return this._contentLoaded ? structuredClone(this.#content) : this.#content;
  }
  async loadContent() {
    if (this._contentLoaded) return;
    // Lazy loading محتوای سنگین
    this._contentLoaded = true;
  }

  /** SRS */
  calculateNextReview() {
    return SRSManager.calculateNextReview(this.#srsData);
  }

  /** Stats */
  get retentionRate() {
    return LessonStats.calculateRetentionRate(this.#srsData);
  }

  /** Output Formats */
  toObject() {
    return {
      id: this.id,
      difficulty: this.difficulty,
      content: this._contentLoaded ? structuredClone(this.#content) : this.#content,
      srsData: { ...this.#srsData },
    };
  }
  toDBFormat() { return this.toObject(); }
  toAPIFormat() { return this.toObject(); }

  /** Symbol-based comparison هوشمند */
  [Symbol.toPrimitive](hint) {
    if (hint === 'number') return this.retentionRate;
    if (hint === 'string') return JSON.stringify(this.toObject());
    return this.id;
  }

  compareTo(otherLesson) {
    return this.retentionRate - otherLesson.retentionRate;
  }
}
