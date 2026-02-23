/**
 * @fileoverview UserMetrics 2.2.0 - مدیریت آمار و متریک‌های کاربر
 * نسخه حرفه‌ای، ماژولار، قابل توسعه و امن
 * تاریخ: 2026-02-23
 */

/**
 * @typedef {Object} UserMetricsData
 * @property {number} total_lessons
 * @property {number} completed_lessons
 * @property {number} learned_words
 * @property {number} total_time_spent
 * @property {number} average_score
 */

/**
 * @typedef {Object} MetricsConfig
 * @property {number} max_history_items
 * @property {number} min_score
 * @property {number} max_score
 * @property {string} time_unit
 */

/**
 * @typedef {Object} EventPayload
 * @property {string} field
 * @property {*} value
 * @property {number} timestamp
 */

class EventEmitter {
    #listeners = new Map();

    /**
     * ثبت listener
     * @param {string} event
     * @param {Function} callback
     */
    on(event, callback) {
        if (!this.#listeners.has(event)) this.#listeners.set(event, []);
        this.#listeners.get(event).push(callback);
    }

    /**
     * ثبت listener یکبار مصرف
     * @param {string} event
     * @param {Function} callback
     */
    once(event, callback) {
        const wrapper = (data) => {
            callback(data);
            this.remove_listener(event, wrapper);
        };
        this.on(event, wrapper);
    }

    /**
     * پاکسازی listener
     * @param {string} event
     * @param {Function} callback
     */
    remove_listener(event, callback) {
        const listeners = this.#listeners.get(event);
        if (listeners) {
            this.#listeners.set(event, listeners.filter(cb => cb !== callback));
        }
    }

    /**
     * emit رویداد
     * @param {string} event
     * @param {Object} data
     */
    emit(event, data) {
        (this.#listeners.get(event) || []).forEach(cb => cb(data));
    }

    /**
     * پاکسازی کامل
     */
    destroy() {
        this.#listeners.clear();
    }
}

class HistoryTracker {
    #history = [];
    #max_items;

    /**
     * @param {number} max_items
     */
    constructor(max_items) {
        this.#max_items = max_items;
    }

    /**
     * افزودن آیتم تاریخچه
     * @param {string} action
     * @param {Object} details
     */
    add(action, details) {
        this.#history.push({ timestamp: Date.now(), action, ...details });
        if (this.#history.length > this.#max_items) this.#history.shift();
    }

    /**
     * دریافت آیتم‌های اخیر
     * @param {number} limit
     * @returns {Array}
     */
    get_recent(limit = 50) {
        return this.#history.slice(-limit);
    }

    /**
     * پاکسازی تاریخچه
     */
    destroy() {
        this.#history = [];
    }
}

class MiddlewarePipeline {
    #middlewares = [];

    /**
     * افزودن middleware
     * @param {Function} fn
     */
    use(fn) {
        this.#middlewares.push(fn);
    }

    /**
     * اجرای زنجیره middlewareها با timeout
     * @param {string} event
     * @param {Object} data
     * @param {Function} core_operation
     * @param {number} timeout
     */
    async process(event, data, core_operation, timeout = 5000) {
        const chain = async (i = 0) => {
            if (i < this.#middlewares.length) {
                await this.#middlewares[i](event, data, async () => chain(i + 1));
            } else {
                await core_operation();
            }
        };

        return Promise.race([
            chain(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Middleware timeout')), timeout)
            )
        ]);
    }

    /**
     * پاکسازی middleware
     */
    destroy() {
        this.#middlewares = [];
    }
}

class MetricsValidator {
    /**
     * اعتبارسنجی عدد صحیح مثبت
     * @param {number} value
     * @param {string} field
     * @throws {Error}
     */
    static validate_positive_integer(value, field) {
        if (!Number.isInteger(value) || value <= 0) {
            throw new Error(`${field} must be a positive integer`);
        }
    }

    /**
     * اعتبارسنجی نمره
     * @param {number} score
     * @param {MetricsConfig} config
     * @throws {Error}
     */
    static validate_score(score, config) {
        if (score < config.min_score || score > config.max_score) {
            throw new Error(`Score must be between ${config.min_score} and ${config.max_score}`);
        }
    }
}

class UserMetrics {
    #metrics;
    #logger;
    #events = new EventEmitter();
    #history;
    #middleware = new MiddlewarePipeline();
    #config;
    #result_class;

    /**
     * @param {Object} deps
     * @param {UserMetricsData} [deps.data={}]
     * @param {Object} deps.logger
     * @param {MetricsConfig} [deps.config]
     * @param {Object} deps.result_class
     */
    constructor({ data = {}, logger, config = {}, result_class }) {
        if (!logger) throw new Error('Logger is required');
        if (!result_class) throw new Error('Result class is required');

        this.#logger = logger;
        this.#result_class = result_class;
        this.#config = {
            max_history_items: config.max_history_items || 1000,
            min_score: config.min_score || 0,
            max_score: config.max_score || 100,
            time_unit: config.time_unit || 'minutes'
        };
        this.#history = new HistoryTracker(this.#config.max_history_items);
        this.#metrics = this.#sanitize_input(data);
    }

    #sanitize_input(input) {
        const safe = input && typeof input === 'object' ? input : {};
        return {
            total_lessons: Number(safe.total_lessons || 0),
            completed_lessons: Number(safe.completed_lessons || 0),
            learned_words: Number(safe.learned_words || 0),
            total_time_spent: Number(safe.total_time_spent || 0),
            average_score: Number(safe.average_score || 0)
        };
    }

    async #execute(operation, error_message) {
        try {
            const result = await operation();
            return this.#result_class.success(result);
        } catch (error) {
            this.#logger.error(error_message, error);
            return this.#result_class.failure(error_message, error);
        }
    }

    /**
     * افزودن درس تکمیل‌شده
     * @param {Object} params
     * @param {number} [params.count=1]
     * @param {number} [params.score]
     */
    async increment_completed({ count = 1, score } = {}) {
        return this.#execute(async () => {
            MetricsValidator.validate_positive_integer(count, 'count');

            if (score !== undefined) {
                MetricsValidator.validate_score(score, this.#config);
                this.#update_average_score(count, score);
            }

            if (this.#metrics.completed_lessons + count > this.#metrics.total_lessons) {
                this.#logger.warn('Completed lessons exceed total lessons');
            }

            this.#metrics.completed_lessons += count;

            await this.#middleware.process(
                'metrics_updated',
                { count, score },
                () => this.#events.emit('metrics_updated', { field: 'completed_lessons', value: this.#metrics.completed_lessons, timestamp: Date.now() })
            );

            this.#history.add('increment_completed', { count, score });
            return this;
        }, 'Failed to increment completed lessons');
    }

    #update_average_score(count, score) {
        const old_avg = this.#metrics.average_score;
        const old_total = this.#metrics.completed_lessons;
        this.#metrics.average_score = (old_avg * old_total + score * count) / (old_total + count);
    }

    on(event, callback) {
        this.#events.on(event, callback);
    }

    once(event, callback) {
        this.#events.once(event, callback);
    }

    remove_listener(event, callback) {
        this.#events.remove_listener(event, callback);
    }

    reset() {
        return this.#execute(() => {
            this.#metrics = this.#sanitize_input({});
            this.#history = new HistoryTracker(this.#config.max_history_items);
            this.#events.emit('metrics_reset', { timestamp: Date.now() });
            return this;
        }, 'Failed to reset metrics');
    }

    snapshot() {
        return {
            metrics: { ...this.#metrics },
            history: this.#history.get_recent(),
            timestamp: Date.now()
        };
    }

    async restore(snapshot) {
        return this.#execute(async () => {
            this.#metrics = { ...snapshot.metrics };
            snapshot.history?.forEach(item => this.#history.add(item.action, item));
            return this;
        }, 'Failed to restore snapshot');
    }

    descriptive_stats() {
        const days_active = Math.max(1, this.#history.get_recent(30).length);
        return {
            avg_daily_time: this.#metrics.total_time_spent / days_active,
            consistency_score: this.progress_percentage(),
            completion_rate: this.#metrics.completed_lessons / Math.max(1, this.#metrics.total_lessons) * 100,
            time_unit: this.#config.time_unit
        };
    }

    progress_percentage() {
        const { total_lessons, completed_lessons } = this.#metrics;
        return total_lessons === 0 ? 0 : Math.min(100, Math.max(0, (completed_lessons / total_lessons) * 100));
    }

    use_middleware(fn) {
        this.#middleware.use(fn);
    }

    destroy() {
        this.#events.destroy();
        this.#history.destroy();
        this.#middleware.destroy();
    }
        }
