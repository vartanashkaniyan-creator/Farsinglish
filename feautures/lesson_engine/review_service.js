/**
 * سرویس مرور هوشمند
 * مسئول: دریافت و اولویت‌بندی درس‌های نیازمند مرور
 * وابستگی: ProgressService برای پیشرفت، LessonService برای اطلاعات درس
 * تزریق وابستگی از طریق سازنده
 */

import { filterDueItems, sortByPriority } from './srs-scheduler.js';

// ---------- ثابت‌ها ----------
const DEFAULT_REVIEW_LIMIT = 20; // حداکثر تعداد درس در هر مرور

/**
 * @typedef {Object} LessonService
 * @property {function(string): Promise<Object>} getLesson - دریافت اطلاعات درس
 * @property {function(string): Promise<Array>} getLessonsByIds - دریافت چند درس
 */

/**
 * @typedef {Object} ReviewItem
 * @property {string} lessonId
 * @property {Object} lesson - اطلاعات کامل درس
 * @property {Object} progress - داده پیشرفت
 * @property {number} priorityScore - امتیاز اولویت
 * @property {boolean} isDue - آیا نیاز به مرور امروز دارد؟
 */

export class ReviewService {
    /**
     * @param {Object} deps - وابستگی‌های تزریق شده
     * @param {Object} deps.progressService - سرویس پیشرفت
     * @param {Object} deps.lessonService - سرویس درس (دسترسی به اطلاعات درس)
     */
    constructor(deps) {
        const { progressService, lessonService } = deps || {};
        
        if (!progressService) {
            throw new Error('progressService is required');
        }
        if (!lessonService) {
            throw new Error('lessonService is required');
        }

        this._progressService = progressService;
        this._lessonService = lessonService;
    }

    /**
     * دریافت درس‌های نیازمند مرور با اولویت‌بندی
     * @param {string} userId - شناسه کاربر
     * @param {Object} options - گزینه‌ها
     * @param {number} [options.limit] - حداکثر تعداد
     * @param {Date} [options.now] - زمان جاری (برای تست)
     * @returns {Promise<ReviewItem[]>} - لیست مرتب‌شده بر اساس اولویت
     */
    async getReviewsDue(userId, options = {}) {
        const { limit = DEFAULT_REVIEW_LIMIT, now = new Date() } = options;

        // ۱. دریافت تمام پیشرفت‌های کاربر
        const allProgress = await this._progressService.getAllProgress(userId);
        if (!allProgress.length) return [];

        // ۲. فیلتر آیتم‌های سررسید شده
        const dueProgress = filterDueItems(allProgress, now);
        if (!dueProgress.length) return [];

        // ۳. مرتب‌سازی بر اساس اولویت
        const sortedProgress = sortByPriority(dueProgress, now);

        // ۴. محدود کردن تعداد
        const limitedProgress = sortedProgress.slice(0, limit);

        // ۵. دریافت اطلاعات کامل درس‌ها
        const lessonIds = limitedProgress.map(p => p.lessonId);
        const lessons = await this._lessonService.getLessonsByIds(lessonIds);
        
        // ۶. ترکیب داده‌ها
        const reviewItems = limitedProgress.map(progress => {
            const lesson = lessons.find(l => l.id === progress.lessonId) || null;
            const priorityScore = this._calculatePriorityScore(progress, now);
            
            return {
                lessonId: progress.lessonId,
                lesson,
                progress,
                priorityScore,
                isDue: true
            };
        });

        return reviewItems;
    }

    /**
     * دریافت اولین درس برای مرور فوری
     * @param {string} userId 
     * @returns {Promise<ReviewItem|null>}
     */
    async getNextReview(userId) {
        const items = await this.getReviewsDue(userId, { limit: 1 });
        return items.length ? items[0] : null;
    }

    /**
     * تعداد درس‌های نیازمند مرور امروز
     * @param {string} userId 
     * @param {Date} [now] 
     * @returns {Promise<number>}
     */
    async countDue(userId, now = new Date()) {
        const allProgress = await this._progressService.getAllProgress(userId);
        const due = filterDueItems(allProgress, now);
        return due.length;
    }

    /**
     * محاسبه امتیاز اولویت (کپسوله‌سازی شده)
     * @private
     */
    _calculatePriorityScore(progress, now) {
        // از srs-scheduler استفاده می‌کند؛ اینجا فقط واسط است
        return sortByPriority([progress], now)[0]?.priorityScore || 0;
    }

    /**
     * ثبت نتیجه مرور و به‌روزرسانی SRS
     * @param {string} userId 
     * @param {string} lessonId 
     * @param {number} quality - کیفیت پاسخ (۰-۵)
     * @returns {Promise<Object>} - پیشرفت به‌روز شده
     */
    async submitReview(userId, lessonId, quality) {
        return await this._progressService.updateProgressWithSRS(userId, lessonId, quality);
    }

    /**
     * بازنشانی مرور یک درس (مثل شروع دوباره)
     * @param {string} userId 
     * @param {string} lessonId 
     */
    async resetReview(userId, lessonId) {
        return await this._progressService.initializeProgress(userId, lessonId);
    }
}

// ---------- واحد تست ساده (برای مرورگر) ----------
if (typeof window !== 'undefined' && window.VITEST) {
    window.__REVIEW_SERVICE__ = { ReviewService };
}
