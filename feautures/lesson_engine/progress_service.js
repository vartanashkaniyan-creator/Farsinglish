/**
 * سرویس مدیریت پیشرفت کاربر
 * مسئول: ذخیره، بازیابی و به‌روزرسانی پیشرفت درس‌ها
 * وابستگی: اینترفیس مخزن داده (تزریق وابستگی)
 */

import { createInitialProgress, updateProgress } from '../../shared/models/progress-model.js';
import { calculateSRS, getNextReviewDate } from './srs-engine.js';

// ---------- ثابت‌ها ----------
const DEFAULT_QUALITY = 4; // کیفیت پیش‌فرض برای پاسخ صحیح

/**
 * @typedef {Object} ProgressRepository
 * @property {function(string, string): Promise<Object>} getProgress
 * @property {function(string): Promise<Array>} getAllProgress
 * @property {function(Object): Promise<void>} saveProgress
 * @property {function(string, string): Promise<void>} deleteProgress
 */

export class ProgressService {
    /**
     * @param {ProgressRepository} repository - مخزن داده (پیاده‌سازی IndexedDB یا Mock)
     */
    constructor(repository) {
        if (!repository) {
            throw new Error('ProgressRepository is required');
        }
        this._repository = repository;
    }

    /**
     * دریافت پیشرفت یک کاربر در یک درس خاص
     * @param {string} userId 
     * @param {string} lessonId 
     * @returns {Promise<Object>} - داده پیشرفت یا null اگر وجود نداشته باشد
     */
    async getProgress(userId, lessonId) {
        if (!userId || !lessonId) {
            throw new Error('userId and lessonId are required');
        }
        try {
            const progress = await this._repository.getProgress(userId, lessonId);
            return progress || null;
        } catch (error) {
            console.error(`[ProgressService] Failed to get progress: ${error.message}`);
            throw error; // لایه بالاتر تصمیم می‌گیرد
        }
    }

    /**
     * دریافت تمام پیشرفت‌های یک کاربر
     * @param {string} userId 
     * @returns {Promise<Array>}
     */
    async getAllProgress(userId) {
        if (!userId) {
            throw new Error('userId is required');
        }
        try {
            const list = await this._repository.getAllProgress(userId);
            return Array.isArray(list) ? list : [];
        } catch (error) {
            console.error(`[ProgressService] Failed to get all progress: ${error.message}`);
            return [];
        }
    }

    /**
     * ایجاد یا بازنشانی پیشرفت یک درس
     * @param {string} userId 
     * @param {string} lessonId 
     * @returns {Promise<Object>} - پیشرفت جدید
     */
    async initializeProgress(userId, lessonId) {
        if (!userId || !lessonId) {
            throw new Error('userId and lessonId are required');
        }
        const initialProgress = createInitialProgress(userId, lessonId);
        await this._repository.saveProgress(initialProgress);
        return initialProgress;
    }

    /**
     * ذخیره مستقیم یک پیشرفت (برای همگام‌سازی)
     * @param {Object} progress 
     * @returns {Promise<void>}
     */
    async saveProgress(progress) {
        if (!progress || !progress.userId || !progress.lessonId) {
            throw new Error('Invalid progress object');
        }
        await this._repository.saveProgress(progress);
    }

    /**
     * به‌روزرسانی پیشرفت پس از یک تمرین با الگوریتم SRS
     * @param {string} userId 
     * @param {string} lessonId 
     * @param {number} quality - کیفیت پاسخ (۰ تا ۵)
     * @returns {Promise<Object>} - پیشرفت به‌روز شده
     */
    async updateProgressWithSRS(userId, lessonId, quality) {
        if (quality < 0 || quality > 5) {
            throw new Error('Quality must be between 0 and 5');
        }

        // ۱. دریافت پیشرفت فعلی
        let progress = await this.getProgress(userId, lessonId);
        if (!progress) {
            // اگر وجود ندارد، یک نمونه جدید ایجاد کن
            progress = createInitialProgress(userId, lessonId);
        }

        // ۲. محاسبه داده‌های جدید SRS
        const currentSRS = {
            repetition: progress.repetition || 0,
            easeFactor: progress.easeFactor || 2.5,
            interval: progress.interval || 0
        };
        const srsUpdate = calculateSRS(quality, currentSRS);
        const nextReviewDate = getNextReviewDate(srsUpdate.interval).toISOString();

        // ۳. به‌روزرسانی مدل پیشرفت
        const updatedProgress = updateProgress(progress, srsUpdate, nextReviewDate);

        // ۴. ذخیره در مخزن
        await this._repository.saveProgress(updatedProgress);
        return updatedProgress;
    }

    /**
     * حذف پیشرفت یک درس (در صورت لغو یا بازنشانی)
     * @param {string} userId 
     * @param {string} lessonId 
     * @returns {Promise<void>}
     */
    async deleteProgress(userId, lessonId) {
        if (!userId || !lessonId) {
            throw new Error('userId and lessonId are required');
        }
        await this._repository.deleteProgress(userId, lessonId);
    }

    /**
     * دریافت درس‌های نیازمند مرور امروز (با اولویت‌بندی)
     * @param {string} userId 
     * @returns {Promise<Array>} - لیست مرتب‌شده بر اساس اولویت
     */
    async getDueLessons(userId) {
        const allProgress = await this.getAllProgress(userId);
        
        // فیلتر و مرتب‌سازی توسط srs-scheduler (در فایل بعدی اضافه می‌شود)
        // فعلاً یک پیاده‌سازی ساده: برگرداندن همه
        return allProgress.filter(p => {
            if (!p.nextReviewDate) return true;
            return new Date(p.nextReviewDate) <= new Date();
        });
    }
}

// ---------- واحد تست ساده (اختیاری) ----------
if (typeof window !== 'undefined' && window.VITEST) {
    window.__PROGRESS_SERVICE__ = { ProgressService };
}
