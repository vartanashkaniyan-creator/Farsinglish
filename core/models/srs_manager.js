import EventEmitter from 'events';

/**
 * @class SRSManager
 * مدیریت SRS برای درس‌ها با SM-2، تاریخچه مرور، و Event-Driven
 */
export class SRSManager extends EventEmitter {
  #lessons = new Map(); // lesson_id -> srs_data
  #history = new Map(); // lesson_id -> array of reviews
  #due_index = new Set(); // درس‌های آماده مرور سریع
  logger;

  constructor(dependencies = {}) {
    super();
    this.logger = dependencies.logger || console;
    this.storage = dependencies.storage || null; // optional برای lazy loading تاریخچه
  }

  /** بررسی و اعمال SM-2 */
  apply_sm2(srs_data, quality) {
    if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
      this.logger.error(`Invalid quality value: ${quality}`);
      return srs_data;
    }

    const new_data = structuredClone(srs_data);

    if (quality >= 3) {
      if (new_data.repetitions === 0) new_data.interval = 1;
      else if (new_data.repetitions === 1) new_data.interval = 6;
      else new_data.interval = Math.round(new_data.interval * new_data.ease_factor);

      new_data.repetitions += 1;
    } else {
      new_data.repetitions = 0;
      new_data.interval = 1;
    }

    new_data.ease_factor = Math.max(
      1.3,
      new_data.ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    );

    new_data.next_review = Date.now() + new_data.interval * 24 * 60 * 60 * 1000;
    new_data.last_quality = quality;

    return new_data;
  }

  /** ثبت مرور و نگهداری تاریخچه */
  add_to_history(lesson_id, review_data) {
    const history = this.#history.get(lesson_id) || [];
    history.push({
      date: Date.now(),
      quality: review_data.last_quality,
      interval: review_data.interval,
      ease_factor: review_data.ease_factor
    });
    this.#history.set(lesson_id, history.slice(-50)); // آخرین 50 مرور
  }

  /** مرور یک درس با quality و بروزرسانی SRS */
  review_lesson(lesson_id, quality) {
    if (!this.#lessons.has(lesson_id)) {
      this.logger.error(`Lesson not found: ${lesson_id}`);
      return null;
    }

    const old_data = this.#lessons.get(lesson_id);
    const new_data = this.apply_sm2(old_data, quality);

    this.#lessons.set(lesson_id, new_data);
    this.add_to_history(lesson_id, new_data);
    this.update_due_index(lesson_id, new_data.next_review);

    this.emit('srs_updated', { lesson_id, old_data, new_data });
    return new_data;
  }

  /** مرور همزمان چند درس */
  review_lessons(entries) {
    const results = [];
    for (const { lesson_id, quality } of entries) {
      results.push(this.review_lesson(lesson_id, quality));
    }
    this.emit('srs_batch_updated', { count: entries.length });
    return results;
  }

  /** محاسبه retention واقعی با وزن‌دهی نمایی */
  calculate_retention(lesson_id) {
    const history = this.#history.get(lesson_id) || [];
    if (history.length === 0) return 0;

    const weights = history.map((_, i) => Math.exp(i / history.length));
    const weighted_sum = history.reduce((sum, h, i) => sum + h.quality * weights[i], 0);
    const weight_sum = weights.reduce((a, b) => a + b, 0);

    return Math.min(100, Math.round((weighted_sum / weight_sum) * 20));
  }

  /** دریافت لیست درس‌های آماده مرور */
  get_due_lessons(now = Date.now()) {
    const due = [];
    for (const lesson_id of this.#due_index) {
      const data = this.#lessons.get(lesson_id);
      if (data && data.next_review <= now) due.push(lesson_id);
    }
    return due;
  }

  /** بروزرسانی ایندکس درس‌های due */
  update_due_index(lesson_id, new_next_review) {
    if (new_next_review <= Date.now()) this.#due_index.add(lesson_id);
    else this.#due_index.delete(lesson_id);
  }

  /** افزودن درس جدید */
  add_lesson(lesson_id, srs_data) {
    if (this.#lessons.has(lesson_id)) {
      this.logger.warn(`Lesson already exists: ${lesson_id}`);
      return;
    }
    this.#lessons.set(lesson_id, srs_data);
    this.update_due_index(lesson_id, srs_data.next_review);
  }

  /** Lazy loading تاریخچه */
  async load_history(lesson_id) {
    if (!this.#history.has(lesson_id) && this.storage?.load_history) {
      const history = await this.storage.load_history(lesson_id);
      this.#history.set(lesson_id, history);
    }
    return this.#history.get(lesson_id);
  }

  /** سریال‌سازی استاندارد */
  to_json() {
    return {
      lessons: Array.from(this.#lessons.entries()).map(([lesson_id, data]) => ({
        lesson_id,
        repetitions: data.repetitions,
        interval: data.interval,
        ease_factor: data.ease_factor,
        next_review: data.next_review,
        last_quality: data.last_quality
      })),
      history: Array.from(this.#history.entries()).map(([lesson_id, reviews]) => ({
        lesson_id,
        reviews: reviews.map(r => ({ ...r }))
      }))
    };
  }

  static from_json(json, dependencies = {}) {
    const manager = new SRSManager(dependencies);
    if (json.lessons) {
      for (const l of json.lessons) {
        manager.#lessons.set(l.lesson_id, {
          repetitions: l.repetitions,
          interval: l.interval,
          ease_factor: l.ease_factor,
          next_review: l.next_review,
          last_quality: l.last_quality
        });
        manager.update_due_index(l.lesson_id, l.next_review);
      }
    }
    if (json.history) {
      for (const h of json.history) {
        manager.#history.set(h.lesson_id, h.reviews);
      }
    }
    return manager;
  }
}
