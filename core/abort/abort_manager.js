/**
 * @fileoverview مدیریت متمرکز AbortController برای لغو درخواست‌ها
 * 
 * این ماژول یک مدیریت مرکزی برای AbortControllerها فراهم می‌کند
 * که امکان لغو گروهی درخواست‌ها، مدیریت خودکار حافظه،
 * و جلوگیری از نشت شنونده‌ها را فراهم می‌کند.
 * 
 * @module abort-manager
 * @author Farsinglish Team
 * @version 2.0.0
 */

/**
 * @typedef {Object} AbortEntry
 * @property {AbortController} controller - کنترل‌کننده abort
 * @property {number} createdAt - زمان ایجاد (timestamp)
 * @property {string} [tag] - برچسب برای گروه‌بندی
 * @property {Function} [onAbort] - تابع callback هنگام لغو
 * @property {string} [reason] - دلیل لغو (برای تاریخچه)
 */

/**
 * @typedef {Object} AbortStats
 * @property {number} totalControllers - تعداد کل کنترل‌کننده‌ها
 * @property {number} activeRequests - تعداد درخواست‌های فعال
 * @property {number} abortedCount - تعداد لغو شده‌ها
 * @property {Array<string>} tags - برچسب‌های فعال
 * @property {Object} hourlyStats - آمار ساعتی
 * @property {Array<Object>} recentAborts - آخرین لغوها
 */

/**
 * @typedef {Object} AbortHistory
 * @property {string} id - شناسه درخواست
 * @property {string} reason - دلیل لغو
 * @property {number} timestamp - زمان لغو
 * @property {string} [tag] - برچسب
 */

/**
 * کلاس مدیریت متمرکز AbortController
 * @final
 * @sealed
 */
export class AbortManager {
    /** @type {AbortManager} */
    static #instance;

    /** @type {Map<string, AbortEntry>} */
    #controllers = new Map();

    /** @type {Map<string, Set<string>>} */
    #tagIndex = new Map();

    /** @type {number} */
    #defaultTimeout = 30000; // 30 ثانیه

    /** @type {number} */
    #abortedCount = 0;

    /** @type {boolean} */
    #isDebugMode = false;

    /** @type {number} */
    #maxConcurrent = 100; // حداکثر ۱۰۰ درخواست همزمان

    /** @type {Map<string, number>} */
    #hourlyStats = new Map(); // آمار ساعتی

    /** @type {Array<AbortHistory>} */
    #abortHistory = []; // تاریخچه لغوها

    /** @type {number} */
    #maxHistorySize = 100; // حداکثر ۱۰۰ مورد در تاریخچه

    /**
     * پیاده‌سازی Singleton
     * @param {Object} [options] - گزینه‌های پیکربندی
     * @param {number} [options.defaultTimeout] - تایم‌اوت پیش‌فرض
     * @param {boolean} [options.debugMode] - فعال‌سازی حالت دیباگ
     * @param {number} [options.maxConcurrent] - حداکثر درخواست همزمان
     */
    constructor(options = {}) {
        if (AbortManager.#instance) {
            return AbortManager.#instance;
        }

        this.#defaultTimeout = options.defaultTimeout ?? this.#defaultTimeout;
        this.#isDebugMode = options.debugMode ?? false;
        this.#maxConcurrent = options.maxConcurrent ?? this.#maxConcurrent;

        // پاکسازی خودکار در بازه‌های منظم
        this.#startAutoCleanup();

        AbortManager.#instance = this;

        this.#log('Initialized with options:', options);
    }

    /**
     * لاگ شرطی در حالت دیباگ
     * @private
     */
    #log(...args) {
        if (this.#isDebugMode) {
            console.debug('[AbortManager]', ...args);
        }
    }

    /**
     * شروع پاکسازی خودکار (هر ۵ دقیقه)
     * @private
     */
    #startAutoCleanup() {
        setInterval(() => {
            this.cleanupStaleControllers();
        }, 5 * 60 * 1000); // 5 دقیقه
    }

    /**
     * به‌روزرسانی آمار ساعتی
     * @private
     */
    #updateHourlyStats() {
        const hour = new Date().getHours();
        const current = this.#hourlyStats.get(hour) || 0;
        this.#hourlyStats.set(hour, current + 1);
    }

    /**
     * افزودن به تاریخچه لغو
     * @param {string} id
     * @param {string} reason
     * @param {string} [tag]
     * @private
     */
    #addToHistory(id, reason, tag) {
        this.#abortHistory.unshift({
            id,
            reason,
            tag,
            timestamp: Date.now()
        });

        // محدود کردن حجم تاریخچه
        if (this.#abortHistory.length > this.#maxHistorySize) {
            this.#abortHistory.pop();
        }
    }

    /**
     * اعتبارسنجی برچسب
     * @param {string} tag
     * @returns {boolean}
     * @private
     */
    #isValidTag(tag) {
        return tag && typeof tag === 'string' && tag.trim().length > 0;
    }

    /**
     * بررسی الگوی نام برای لغو دسته‌ای
     * @param {string} pattern - الگو مثل "user-*" یا "lesson-123-*"
     * @returns {Array<string>} - لیست شناسه‌های منطبق
     * @private
     */
    #matchPattern(pattern) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return Array.from(this.#controllers.keys()).filter(id => regex.test(id));
    }

    /**
     * ایجاد یک signal جدید
     * @param {string} id - شناسه یکتا برای درخواست
     * @param {Object} [options] - گزینه‌ها
     * @param {string} [options.tag] - برچسب برای گروه‌بندی
     * @param {number} [options.timeout] - تایم‌اوت به میلی‌ثانیه
     * @param {Function} [options.onAbort] - callback هنگام لغو
     * @returns {AbortSignal} - signal برای استفاده در fetch/درخواست
     * @throws {Error} اگر id تکراری یا بیش از حد مجاز باشد
     */
    createSignal(id, options = {}) {
        // اعتبارسنجی ورودی
        if (!id || typeof id !== 'string') {
            throw new Error('شناسه درخواست معتبر نیست');
        }

        if (this.#controllers.has(id)) {
            throw new Error(`درخواست با شناسه ${id} قبلاً ثبت شده است`);
        }

        // بررسی محدودیت تعداد همزمان
        if (this.#controllers.size >= this.#maxConcurrent) {
            throw new Error(`تعداد درخواست‌های همزمان از حد مجاز (${this.#maxConcurrent}) بیشتر شده است`);
        }

        // اعتبارسنجی برچسب
        if (options.tag && !this.#isValidTag(options.tag)) {
            throw new Error('برچسب نامعتبر است');
        }

        // ایجاد کنترل‌کننده جدید
        const controller = new AbortController();
        const timeoutMs = options.timeout ?? this.#defaultTimeout;

        /** @type {AbortEntry} */
        const entry = {
            controller,
            createdAt: Date.now(),
            tag: options.tag,
            onAbort: options.onAbort
        };

        // ذخیره در Map اصلی
        this.#controllers.set(id, entry);

        // به‌روزرسانی آمار
        this.#updateHourlyStats();

        // ایندکس‌گذاری بر اساس برچسب
        if (options.tag) {
            if (!this.#tagIndex.has(options.tag)) {
                this.#tagIndex.set(options.tag, new Set());
            }
            this.#tagIndex.get(options.tag).add(id);
        }

        // تنظیم تایم‌اوت خودکار
        if (timeoutMs > 0) {
            this.#setupAutoTimeout(id, timeoutMs);
        }

        // تنظیم handler برای پاکسازی خودکار پس از abort
        controller.signal.addEventListener('abort', () => {
            this.#handleAbort(id, controller.signal.reason);
        }, { once: true });

        this.#log(`Signal created: ${id}`, {
            tag: options.tag,
            timeout: timeoutMs,
            activeCount: this.#controllers.size
        });

        return controller.signal;
    }

    /**
     * تنظیم تایم‌اوت خودکار برای یک درخواست
     * @param {string} id
     * @param {number} timeoutMs
     * @private
     */
    #setupAutoTimeout(id, timeoutMs) {
        setTimeout(() => {
            if (this.#controllers.has(id)) {
                this.abort(id, 'timeout');
            }
        }, timeoutMs);
    }

    /**
     * مدیریت رویداد abort
     * @param {string} id
     * @param {string} reason
     * @private
     */
    #handleAbort(id, reason = 'manual') {
        const entry = this.#controllers.get(id);
        if (!entry) return;

        this.#abortedCount++;
        
        // افزودن به تاریخچه
        this.#addToHistory(id, reason, entry.tag);

        // اجرای callback اگر تعریف شده باشد
        if (entry.onAbort) {
            try {
                entry.onAbort(reason);
            } catch (error) {
                console.error(`[AbortManager] Error in onAbort callback for ${id}:`, error);
            }
        }

        // پاکسازی از ایندکس برچسب
        if (entry.tag) {
            const tagSet = this.#tagIndex.get(entry.tag);
            if (tagSet) {
                tagSet.delete(id);
                if (tagSet.size === 0) {
                    this.#tagIndex.delete(entry.tag);
                }
            }
        }

        // پاکسازی از Map اصلی
        this.#controllers.delete(id);

        this.#log(`Signal aborted and cleaned: ${id}`, { reason });
    }

    /**
     * لغو یک درخواست خاص
     * @param {string} id - شناسه درخواست
     * @param {string} [reason] - دلیل لغو
     * @returns {boolean} - true اگر لغو انجام شده باشد
     */
    abort(id, reason = 'manual') {
        const entry = this.#controllers.get(id);
        if (!entry) {
            this.#log(`No signal found for abort: ${id}`);
            return false;
        }

        try {
            entry.controller.abort(reason);
            return true;
        } catch (error) {
            console.error(`[AbortManager] Error aborting ${id}:`, error);
            return false;
        }
    }

    /**
     * لغو همه درخواست‌های دارای یک الگوی نام
     * @param {string} pattern - الگو مثل "user-*"
     * @param {string} [reason] - دلیل لغو
     * @returns {number} - تعداد درخواست‌های لغو شده
     */
    abortByPattern(pattern, reason = 'pattern-abort') {
        const matchedIds = this.#matchPattern(pattern);
        let count = 0;

        for (const id of matchedIds) {
            if (this.abort(id, reason)) {
                count++;
            }
        }

        this.#log(`Aborted ${count} requests with pattern: ${pattern}`);
        return count;
    }

    /**
     * لغو همه درخواست‌های دارای یک برچسب خاص
     * @param {string} tag - برچسب
     * @param {string} [reason] - دلیل لغو
     * @returns {number} - تعداد درخواست‌های لغو شده
     */
    abortByTag(tag, reason = 'tag-abort') {
        if (!this.#isValidTag(tag)) {
            this.#log('Invalid tag for abortByTag:', tag);
            return 0;
        }

        const tagSet = this.#tagIndex.get(tag);
        if (!tagSet) return 0;

        let count = 0;
        for (const id of tagSet) {
            if (this.abort(id, reason)) {
                count++;
            }
        }

        this.#log(`Aborted ${count} requests with tag: ${tag}`);
        return count;
    }

    /**
     * لغو همه درخواست‌ها
     * @param {string} [reason] - دلیل لغو
     * @returns {number} - تعداد درخواست‌های لغو شده
     */
    abortAll(reason = 'global-abort') {
        const ids = Array.from(this.#controllers.keys());
        let count = 0;

        for (const id of ids) {
            if (this.abort(id, reason)) {
                count++;
            }
        }

        this.#log(`Aborted all ${count} requests`);
        return count;
    }

    /**
     * پاکسازی کنترل‌کننده‌های قدیمی (بیش از ۱ ساعت)
     * @param {number} [maxAge] - حداکثر سن به میلی‌ثانیه
     * @returns {number} - تعداد پاکسازی شده
     */
    cleanupStaleControllers(maxAge = 60 * 60 * 1000) { // 1 ساعت پیش‌فرض
        const now = Date.now();
        let count = 0;

        for (const [id, entry] of this.#controllers.entries()) {
            if (now - entry.createdAt > maxAge) {
                try {
                    entry.controller.abort('stale');
                    count++;
                } catch (error) {
                    console.error(`[AbortManager] Error cleaning stale ${id}:`, error);
                }
            }
        }

        if (count > 0) {
            this.#log(`Cleaned ${count} stale controllers`);
        }

        return count;
    }

    /**
     * بررسی وجود یک درخواست فعال
     * @param {string} id
     * @returns {boolean}
     */
    has(id) {
        return this.#controllers.has(id);
    }

    /**
     * دریافت آمار وضعیت پیشرفته
     * @returns {AbortStats}
     */
    getStats() {
        return {
            totalControllers: this.#controllers.size,
            activeRequests: this.#controllers.size,
            abortedCount: this.#abortedCount,
            tags: Array.from(this.#tagIndex.keys()),
            hourlyStats: Object.fromEntries(this.#hourlyStats),
            recentAborts: this.#abortHistory.slice(0, 10) // ۱۰ مورد آخر
        };
    }

    /**
     * دریافت لیست درخواست‌های فعال
     * @returns {Array<{id: string, tag?: string, age: number}>}
     */
    getActiveRequests() {
        const now = Date.now();
        return Array.from(this.#controllers.entries()).map(([id, entry]) => ({
            id,
            tag: entry.tag,
            age: now - entry.createdAt
        }));
    }

    /**
     * تمدید timeout یک درخواست
     * @param {string} id
     * @param {number} additionalTime - زمان اضافه به میلی‌ثانیه
     * @returns {boolean}
     */
    extendTimeout(id, additionalTime) {
        const entry = this.#controllers.get(id);
        if (!entry) {
            this.#log(`Cannot extend: ${id} not found`);
            return false;
        }

        // تنظیم timeout جدید
        setTimeout(() => {
            if (this.#controllers.has(id)) {
                this.abort(id, 'extended-timeout');
            }
        }, additionalTime);

        this.#log(`Extended timeout for ${id} by ${additionalTime}ms`);
        return true;
    }

    /**
     * فعال/غیرفعال کردن حالت دیباگ
     * @param {boolean} enabled
     */
    setDebugMode(enabled) {
        this.#isDebugMode = enabled;
    }

    /**
     * پاکسازی کامل همه منابع
     */
    dispose() {
        this.abortAll('dispose');
        this.#controllers.clear();
        this.#tagIndex.clear();
        this.#abortedCount = 0;
        this.#hourlyStats.clear();
        this.#abortHistory = [];

        this.#log('Disposed');
    }
}

/**
 * تابع کمکی برای ایجاد instance با پیکربندی پیش‌فرض
 * @param {Object} [options]
 * @returns {AbortManager}
 */
export const createAbortManager = (options = {}) => {
    return new AbortManager(options);
};

// Export پیش‌فرض برای استفاده آسان
export default AbortManager;
