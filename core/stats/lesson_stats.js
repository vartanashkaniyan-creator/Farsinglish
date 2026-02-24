// core/stats/lesson_stats.js
/**
 * @fileoverview محاسبات آماری پیشرفته برای درس‌ها با پشتیبانی از SRS
 * @module lesson_stats
 * @author Farsinglish Team
 * @version 1.0.0
 */

/**
 * @typedef {Object} SRSHistoryItem
 * @property {number} quality - کیفیت پاسخ (0-5)
 * @property {string|Date} date - تاریخ مرور
 * @property {number} [response_time] - زمان پاسخ (میلی‌ثانیه)
 */

/**
 * @typedef {Object} SRSData
 * @property {string} lesson_id
 * @property {SRSHistoryItem[]} history
 * @property {Object} [metadata] - فراداده اضافی
 */

/**
 * @typedef {Object} LessonStatsSummary
 * @property {number} retention_rate - نرخ ماندگاری (0-1)
 * @property {number} accuracy - درصد پاسخ صحیح (0-100)
 * @property {number} review_count - تعداد مرورها
 * @property {number} average_quality - میانگین کیفیت
 * @property {number} [streak] - رکورد پشت سر هم
 */

export const lesson_stats = {
  /**
   * اعتبارسنجی داده SRS
   * @param {*} srs_data
   * @returns {srs_data is SRSData}
   * @private
   */
  _is_valid_srs_data(srs_data) {
    if (!srs_data || typeof srs_data !== 'object') return false;
    if (!Array.isArray(srs_data.history)) return false;

    return srs_data.history.every(item => 
      item &&
      Number.isFinite(item.quality) &&
      item.quality >= 0 &&
      item.quality <= 5 &&
      (item.date instanceof Date || typeof item.date === 'string') &&
      (!('response_time' in item) || (typeof item.response_time === 'number' && item.response_time >= 0))
    );
  },

  /**
   * محاسبه نرخ ماندگاری با الگوریتم SM-2 ساده پیشرفته
   * @param {SRSData} srs_data
   * @returns {number} نرخ ماندگاری (0-1)
   */
  calculate_retention_rate(srs_data) {
    if (!this._is_valid_srs_data(srs_data)) return 0;
    const history = srs_data.history;
    if (history.length === 0) return 0;

    // وزن‌دهی مرورهای اخیر
    const weighted_sum = history.reduce((sum, item, idx) => {
      const weight = Math.pow(0.9, history.length - 1 - idx);
      return sum + (item.quality / 5) * weight;
    }, 0);

    const total_weight = history.reduce((sum, _, idx) => sum + Math.pow(0.9, history.length - 1 - idx), 0);

    return Number((weighted_sum / total_weight).toFixed(2));
  },

  /**
   * محاسبه درصد پاسخ صحیح
   * @param {SRSData} srs_data
   * @param {Object} [options]
   * @param {number} [options.min_quality=4] - حداقل کیفیت برای پاسخ صحیح
   * @returns {number} درصد (0-100)
   */
  calculate_accuracy(srs_data, { min_quality = 4 } = {}) {
    if (!this._is_valid_srs_data(srs_data)) return 0;
    const history = srs_data.history;
    if (history.length === 0) return 0;

    const correct = history.filter(item => item.quality >= min_quality).length;
    return Number(((correct / history.length) * 100).toFixed(1));
  },

  /**
   * محاسبه میانگین کیفیت پاسخ‌ها
   * @param {SRSData} srs_data
   * @returns {number} میانگین کیفیت (0-5)
   */
  calculate_average_quality(srs_data) {
    if (!this._is_valid_srs_data(srs_data)) return 0;
    const history = srs_data.history;
    if (history.length === 0) return 0;

    const sum = history.reduce((acc, item) => acc + item.quality, 0);
    return Number((sum / history.length).toFixed(2));
  },

  /**
   * گرفتن خلاصه آماری کامل یک درس
   * @param {SRSData} srs_data
   * @returns {LessonStatsSummary}
   */
  get_summary(srs_data) {
    if (!this._is_valid_srs_data(srs_data)) {
      return {
        retention_rate: 0,
        accuracy: 0,
        review_count: 0,
        average_quality: 0
      };
    }

    return {
      retention_rate: this.calculate_retention_rate(srs_data),
      accuracy: this.calculate_accuracy(srs_data),
      review_count: srs_data.history.length,
      average_quality: this.calculate_average_quality(srs_data)
    };
  },

  /**
   * مقایسه دو درس از نظر retention و accuracy
   * @param {SRSData} lesson_a
   * @param {SRSData} lesson_b
   * @returns {Object} نتایج مقایسه
   */
  compare_lessons(lesson_a, lesson_b) {
    const stats_a = this.get_summary(lesson_a);
    const stats_b = this.get_summary(lesson_b);

    return {
      retention: {
        a: stats_a.retention_rate,
        b: stats_b.retention_rate,
        difference: Number((stats_a.retention_rate - stats_b.retention_rate).toFixed(2)),
        better: stats_a.retention_rate === stats_b.retention_rate ? 'tie' : stats_a.retention_rate > stats_b.retention_rate ? 'A' : 'B'
      },
      accuracy: {
        a: stats_a.accuracy,
        b: stats_b.accuracy,
        difference: Number((stats_a.accuracy - stats_b.accuracy).toFixed(1))
      }
    };
  },

  /**
   * مرتب‌سازی درس‌ها بر اساس شاخص مشخص
   * @param {Array<{lesson_id: string, srs_data: SRSData}>} lessons
   * @param {Object} options
   * @param {'retention'|'accuracy'|'review_count'} options.by
   * @param {'asc'|'desc'} [options.order='desc']
   * @returns {Array} کپی مرتب‌شده بدون تغییر درس اصلی
   */
  sort_lessons(lessons, { by = 'retention', order = 'desc' } = {}) {
    if (!Array.isArray(lessons)) return [];

    return lessons
      .map(lesson => ({
        ...lesson,
        _summary: this.get_summary(lesson.srs_data)
      }))
      .sort((a, b) => {
        const val_a = a._summary[by] ?? 0;
        const val_b = b._summary[by] ?? 0;
        return order === 'asc' ? val_a - val_b : val_b - val_a;
      })
      .map(({ _summary, ...lesson }) => lesson);
  },

  /**
   * pipe محاسبات برای انعطاف بالا
   * @param {SRSData} srs_data
   * @param {...Function} fns - توابع محاسباتی
   * @returns {*} خروجی pipeline
   */
  pipe(srs_data, ...fns) {
    return fns.reduce((acc, fn) => typeof fn === 'function' ? fn(acc) : acc, srs_data);
  }
};
