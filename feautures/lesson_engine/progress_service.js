/**
 * سرویس مدیریت پیشرفت کاربر - نسخه فوق پیشرفته
 * مسئول: ذخیره، بازیابی و به‌روزرسانی پیشرفت درس‌ها با الگوریتم SRS
 * 
 * @module services/progress
 * @requires ../../shared/models/progress-model
 * @requires ./srs-engine
 */

import { create_initial_progress, update_progress } from '../../shared/models/progress-model.js';
import { calculate_srs, get_next_review_date } from './srs-engine.js';

// ============================================================================
// تعریف تایپ‌ها (JSDoc)
// ============================================================================

/**
 * @enum {string}
 */
export const ErrorCode = {
    INVALID_INPUT: 'ERR_INVALID_INPUT',
    INVALID_QUALITY: 'ERR_INVALID_QUALITY',
    DB_ERROR: 'ERR_DATABASE',
    NOT_FOUND: 'ERR_NOT_FOUND',
    CIRCUIT_OPEN: 'ERR_CIRCUIT_OPEN'
};

/**
 * @template T
 * @typedef {Object} Result
 * @property {boolean} success
 * @property {T} [data]
 * @property {string} [error]
 * @property {ErrorCode} [code]
 */

/**
 * @typedef {Object} ProgressData
 * @property {string} user_id - شناسه کاربر
 * @property {string} lesson_id - شناسه درس
 * @property {number} repetition - تعداد تکرار
 * @property {number} ease_factor - ضریب آسانی (2.5 پیش‌فرض)
 * @property {number} interval - فاصله زمانی (روز)
 * @property {string} next_review_date - تاریخ مرور بعدی (ISO)
 * @property {string} last_reviewed_at - آخرین زمان مرور
 * @property {number} stage - مرحله فعلی (0-5)
 */

/**
 * @typedef {Object} SRSUpdateData
 * @property {number} repetition
 * @property {number} ease_factor
 * @property {number} interval
 */

/**
 * @callback ProgressRepositoryGet
 * @param {string} user_id
 * @param {string} lesson_id
 * @returns {Promise<ProgressData|null>}
 */

/**
 * @callback ProgressRepositoryGetAll
 * @param {string} user_id
 * @returns {Promise<ProgressData[]>}
 */

/**
 * @callback ProgressRepositorySave
 * @param {ProgressData} progress
 * @returns {Promise<void>}
 */

/**
 * @callback ProgressRepositorySaveBulk
 * @param {ProgressData[]} progresses
 * @returns {Promise<void>}
 */

/**
 * @callback ProgressRepositoryDelete
 * @param {string} user_id
 * @param {string} lesson_id
 * @returns {Promise<void>}
 */

/**
 * @typedef {Object} ProgressRepository
 * @property {ProgressRepositoryGet} get_progress
 * @property {ProgressRepositoryGetAll} get_all_progress
 * @property {ProgressRepositorySave} save_progress
 * @property {ProgressRepositorySaveBulk} [save_bulk_progress]
 * @property {ProgressRepositoryDelete} delete_progress
 */

/**
 * @callback SchedulerGetPrioritized
 * @param {ProgressData[]} progresses
 * @returns {ProgressData[]}
 */

/**
 * @typedef {Object} SRScheduler
 * @property {SchedulerGetPrioritized} get_prioritized_lessons
 */

/**
 * @callback LoggerDebug
 * @param {string} message
 * @param {Object} [context]
 * @returns {void}
 */

/**
 * @callback LoggerInfo
 * @param {string} message
 * @param {Object} [context]
 * @returns {void}
 */

/**
 * @callback LoggerWarn
 * @param {string} message
 * @param {Object} [context]
 * @returns {void}
 */

/**
 * @callback LoggerError
 * @param {string} message
 * @param {Object} [context]
 * @returns {void}
 */

/**
 * @callback LoggerMetric
 * @param {string} metric_name
 * @param {Object} data
 * @returns {void}
 */

/**
 * @typedef {Object} Logger
 * @property {LoggerDebug} debug
 * @property {LoggerInfo} info
 * @property {LoggerWarn} warn
 * @property {LoggerError} error
 * @property {LoggerMetric} metric
 */

/**
 * @typedef {Object} CacheEntry
 * @property {ProgressData} data
 * @property {number} timestamp
 */

// ============================================================================
// کلاس MetricCollector
// ============================================================================

class MetricCollector {
    /** @type {Map<string, number[]>} */
    #metrics = new Map();
    
    /** @type {number} */
    #max_values_per_metric = 100;

    /**
     * @param {number} [max_values=100] - حداکثر تعداد مقادیر ذخیره شده
     */
    constructor(max_values = 100) {
        this.#max_values_per_metric = max_values;
    }

    /**
     * ثبت یک مقدار متریک
     * @param {string} name - نام متریک
     * @param {number} value - مقدار
     */
    record(name, value) {
        if (!this.#metrics.has(name)) {
            this.#metrics.set(name, []);
        }
        
        const values = this.#metrics.get(name);
        values.push(value);
        
        if (values.length > this.#max_values_per_metric) {
            values.shift();
        }
    }

    /**
     * دریافت آمار یک متریک
     * @param {string} name - نام متریک
     * @returns {Object} - آمار متریک
     */
    get_stats(name) {
        const values = this.#metrics.get(name) || [];
        
        if (values.length === 0) {
            return { count: 0 };
        }
        
        const sum = values.reduce((a, b) => a + b, 0);
        const sorted = [...values].sort((a, b) => a - b);
        
        return {
            count: values.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: Number((sum / values.length).toFixed(2)),
            p50: this.#percentile(sorted, 0.5),
            p90: this.#percentile(sorted, 0.9),
            p95: this.#percentile(sorted, 0.95)
        };
    }

    /**
     * @private
     * @param {number[]} sorted_array 
     * @param {number} percentile 
     * @returns {number}
     */
    #percentile(sorted_array, percentile) {
        if (sorted_array.length === 0) return 0;
        const index = Math.floor(sorted_array.length * percentile);
        return sorted_array[Math.min(index, sorted_array.length - 1)];
    }

    /**
     * دریافت تمام آمارها
     * @returns {Object}
     */
    get_all_stats() {
        const result = {};
        for (const [name] of this.#metrics) {
            result[name] = this.get_stats(name);
        }
        return result;
    }

    /**
     * پاک کردن همه متریک‌ها
     */
    clear() {
        this.#metrics.clear();
    }
}

// ============================================================================
// ثابت‌های پیکربندی
// ============================================================================

const PROGRESS_SERVICE_CONFIG = Object.freeze({
    /** @type {number} کیفیت پیش‌فرض برای پاسخ صحیح */
    DEFAULT_QUALITY: 4,
    
    /** @type {number} حداقل کیفیت مجاز */
    MIN_QUALITY: 0,
    
    /** @type {number} حداکثر کیفیت مجاز */
    MAX_QUALITY: 5,
    
    /** @type {number} زمان اعتبار کش (۵ دقیقه) */
    CACHE_TTL_MS: 5 * 60 * 1000,
    
    /** @type {number} حداکثر تعداد آیتم در کش */
    CACHE_MAX_SIZE: 100,
    
    /** @type {boolean} فعال بودن کش */
    CACHE_ENABLED: true,
    
    /** @type {number} حداکثر تعداد تلاش مجدد */
    MAX_RETRIES: 3,
    
    /** @type {number} تأخیر پایه برای Retry (میلی‌ثانیه) */
    BASE_RETRY_DELAY_MS: 1000,
    
    /** @type {string} نسخه سرویس */
    VERSION: '2.1.0'
});

// ============================================================================
// کلاس اصلی سرویس
// ============================================================================

export class ProgressService extends EventTarget {
    /** @type {ProgressRepository} */
    #repository;
    
    /** @type {SRScheduler} */
    #scheduler;
    
    /** @type {Logger} */
    #logger;
    
    /** @type {Map<string, CacheEntry>} */
    #cache;
    
    /** @type {number} */
    #cache_ttl;
    
    /** @type {boolean} */
    #cache_enabled;
    
    /** @type {MetricCollector} */
    #metrics;
    
    /** @type {Set<Object>} */
    #event_listeners;

    /**
     * ایجاد یک نمونه از سرویس پیشرفت
     * 
     * @param {Object} deps - وابستگی‌های تزریق شده
     * @param {ProgressRepository} deps.repository - مخزن داده
     * @param {SRScheduler} deps.scheduler - زمان‌بند SRS
     * @param {Logger} deps.logger - لاگر
     * @param {Object} [options] - گزینه‌های اضافی
     * @param {number} [options.cache_ttl] - زمان اعتبار کش (میلی‌ثانیه)
     * @param {boolean} [options.cache_enabled] - فعال/غیرفعال کردن کش
     * @throws {Error} اگر وابستگی‌های ضروری وجود نداشته باشند
     */
    constructor({ repository, scheduler, logger }, options = {}) {
        super();
        
        if (!repository) throw new Error('ProgressRepository is required');
        if (!scheduler) throw new Error('SRScheduler is required');
        if (!logger) throw new Error('Logger is required');
        
        this.#repository = repository;
        this.#scheduler = scheduler;
        this.#logger = logger;
        
        this.#cache = new Map();
        this.#cache_ttl = options.cache_ttl || PROGRESS_SERVICE_CONFIG.CACHE_TTL_MS;
        this.#cache_enabled = options.cache_enabled ?? PROGRESS_SERVICE_CONFIG.CACHE_ENABLED;
        this.#metrics = new MetricCollector();
        this.#event_listeners = new Set();
        
        this.#logger.info('ProgressService initialized', {
            version: PROGRESS_SERVICE_CONFIG.VERSION,
            cache_enabled: this.#cache_enabled,
            cache_ttl: this.#cache_ttl
        });
    }

    // ========================================================================
    // متدهای خصوصی
    // ========================================================================

    /**
     * ایجاد کلید کش
     * @private
     * @param {string} user_id 
     * @param {string} lesson_id 
     * @returns {string}
     */
    #get_cache_key(user_id, lesson_id) {
        return `${user_id}:${lesson_id}`;
    }

    /**
     * دریافت از کش
     * @private
     * @param {string} user_id 
     * @param {string} lesson_id 
     * @returns {ProgressData|null}
     */
    #get_from_cache(user_id, lesson_id) {
        if (!this.#cache_enabled) return null;
        
        const key = this.#get_cache_key(user_id, lesson_id);
        const entry = this.#cache.get(key);
        
        if (!entry) return null;
        
        const now = Date.now();
        if (now - entry.timestamp > this.#cache_ttl) {
            this.#cache.delete(key);
            this.#logger.debug('Cache expired', { key });
            return null;
        }
        
        this.#logger.debug('Cache hit', { key });
        return entry.data;
    }

    /**
     * ذخیره در کش
     * @private
     * @param {string} user_id 
     * @param {string} lesson_id 
     * @param {ProgressData} data 
     */
    #set_in_cache(user_id, lesson_id, data) {
        if (!this.#cache_enabled) return;
        
        const key = this.#get_cache_key(user_id, lesson_id);
        
        if (this.#cache.size >= PROGRESS_SERVICE_CONFIG.CACHE_MAX_SIZE) {
            const oldest_key = this.#cache.keys().next().value;
            this.#cache.delete(oldest_key);
            this.#logger.debug('Cache max size reached, removed oldest', { key: oldest_key });
        }
        
        this.#cache.set(key, {
            data: Object.freeze({ ...data }),
            timestamp: Date.now()
        });
    }

    /**
     * پاک کردن کش برای یک کاربر
     * @private
     * @param {string} user_id 
     */
    #invalidate_user_cache(user_id) {
        if (!this.#cache_enabled) return;
        
        for (const [key] of this.#cache) {
            if (key.startsWith(`${user_id}:`)) {
                this.#cache.delete(key);
            }
        }
        
        this.#logger.debug('User cache invalidated', { user_id });
    }

    /**
     * انتشار رویداد
     * @private
     * @param {string} event_name 
     * @param {Object} detail 
     */
    #dispatch_event(event_name, detail) {
        const event = new CustomEvent(event_name, { 
            detail: Object.freeze({ ...detail, timestamp: new Date().toISOString() })
        });
        
        this.dispatchEvent(event);
        
        // ثبت متریک برای رویداد
        this.#metrics.record(`event.${event_name}`, 1);
    }

    /**
     * ثبت متریک
     * @private
     * @param {string} metric_name 
     * @param {Object} data 
     */
    #log_metric(metric_name, data) {
        this.#logger.metric(metric_name, {
            ...data,
            service: 'progress',
            version: PROGRESS_SERVICE_CONFIG.VERSION
        });
        
        // ثبت در MetricCollector
        if (data.duration) {
            this.#metrics.record(`${metric_name}.duration`, data.duration);
        }
        if (data.count) {
            this.#metrics.record(`${metric_name}.count`, data.count);
        }
    }

    /**
     * اجرای عملیات با Retry
     * @private
     * @template T
     * @param {() => Promise<T>} operation - عملیات ناهمگام
     * @param {string} operation_name - نام عملیات (برای لاگ)
     * @param {number} [max_retries] - حداکثر تعداد تلاش
     * @returns {Promise<T>}
     */
    async #with_retry(operation, operation_name, max_retries = PROGRESS_SERVICE_CONFIG.MAX_RETRIES) {
        let last_error;
        const start_time = Date.now();
        
        for (let attempt = 1; attempt <= max_retries; attempt++) {
            try {
                const result = await operation();
                
                // ثبت متریک موفقیت
                this.#metrics.record(`${operation_name}.success`, 1);
                this.#metrics.record(`${operation_name}.attempts`, attempt);
                
                return result;
            } catch (error) {
                last_error = error;
                
                this.#logger.debug(`Retry ${attempt}/${max_retries} for ${operation_name}`, {
                    error: error.message
                });
                
                if (attempt < max_retries) {
                    // Exponential backoff: 1s, 2s, 4s, ...
                    const delay = PROGRESS_SERVICE_CONFIG.BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        // ثبت متریک شکست
        const duration = Date.now() - start_time;
        this.#metrics.record(`${operation_name}.failure`, 1);
        this.#metrics.record(`${operation_name}.failure_duration`, duration);
        
        throw last_error;
    }

    /**
     * ثبت رویداد با قابلیت پاکسازی
     * @param {string} type - نوع رویداد
     * @param {EventListenerOrEventListenerObject} listener - تابع شنونده
     */
    add_safe_listener(type, listener) {
        this.addEventListener(type, listener);
        this.#event_listeners.add({ type, listener });
    }

    // ========================================================================
    // متدهای عمومی
    // ========================================================================

    /**
     * دریافت پیشرفت یک کاربر در یک درس خاص
     * 
     * @param {string} user_id - شناسه کاربر
     * @param {string} lesson_id - شناسه درس
     * @returns {Promise<Result<ProgressData|null>>} - نتیجه شامل داده پیشرفت یا خطا
     */
    async get_progress(user_id, lesson_id) {
        if (!user_id?.trim() || !lesson_id?.trim()) {
            return {
                success: false,
                error: 'شناسه کاربر و درس الزامی است',
                code: ErrorCode.INVALID_INPUT
            };
        }

        const start_time = Date.now();

        try {
            // تلاش برای دریافت از کش
            const cached = this.#get_from_cache(user_id, lesson_id);
            if (cached) {
                this.#metrics.record('get_progress.cache_hit', 1);
                return {
                    success: true,
                    data: cached
                };
            }

            // دریافت از مخزن با Retry
            const progress = await this.#with_retry(
                () => this.#repository.get_progress(user_id, lesson_id),
                'get_progress'
            );
            
            if (progress) {
                // ذخیره در کش
                this.#set_in_cache(user_id, lesson_id, progress);
                
                const duration = Date.now() - start_time;
                this.#log_metric('progress.get', {
                    user_id,
                    lesson_id,
                    found: true,
                    duration
                });
                
                return {
                    success: true,
                    data: Object.freeze(progress)
                };
            }

            const duration = Date.now() - start_time;
            this.#log_metric('progress.get', {
                user_id,
                lesson_id,
                found: false,
                duration
            });

            return {
                success: true,
                data: null
            };

        } catch (error) {
            const duration = Date.now() - start_time;
            
            this.#logger.error('Failed to get progress', {
                user_id,
                lesson_id,
                error: error.message,
                duration
            });
            
            this.#log_metric('progress.error', {
                user_id,
                lesson_id,
                operation: 'get',
                error: error.message,
                duration
            });

            return {
                success: false,
                error: 'خطا در دریافت اطلاعات پیشرفت',
                code: ErrorCode.DB_ERROR
            };
        }
    }

    /**
     * دریافت تمام پیشرفت‌های یک کاربر
     * 
     * @param {string} user_id - شناسه کاربر
     * @returns {Promise<Result<ProgressData[]>>} - نتیجه شامل لیست پیشرفت‌ها
     */
    async get_all_progress(user_id) {
        if (!user_id?.trim()) {
            return {
                success: false,
                error: 'شناسه کاربر الزامی است',
                code: ErrorCode.INVALID_INPUT,
                data: []
            };
        }

        const start_time = Date.now();

        try {
            const list = await this.#with_retry(
                () => this.#repository.get_all_progress(user_id),
                'get_all_progress'
            );
            
            const progress_list = Array.isArray(list) 
                ? list.map(p => Object.freeze(p)) 
                : [];
            
            const duration = Date.now() - start_time;
            
            this.#log_metric('progress.get_all', {
                user_id,
                count: progress_list.length,
                duration
            });

            return {
                success: true,
                data: progress_list
            };

        } catch (error) {
            const duration = Date.now() - start_time;
            
            this.#logger.error('Failed to get all progress', {
                user_id,
                error: error.message,
                duration
            });

            this.#log_metric('progress.error', {
                user_id,
                operation: 'get_all',
                error: error.message,
                duration
            });

            return {
                success: false,
                error: 'خطا در دریافت لیست پیشرفت‌ها',
                code: ErrorCode.DB_ERROR,
                data: []
            };
        }
    }

    /**
     * ایجاد یا بازنشانی پیشرفت یک درس
     * 
     * @param {string} user_id - شناسه کاربر
     * @param {string} lesson_id - شناسه درس
     * @returns {Promise<Result<ProgressData>>} - نتیجه شامل پیشرفت جدید
     */
    async initialize_progress(user_id, lesson_id) {
        if (!user_id?.trim() || !lesson_id?.trim()) {
            return {
                success: false,
                error: 'شناسه کاربر و درس الزامی است',
                code: ErrorCode.INVALID_INPUT
            };
        }

        const start_time = Date.now();

        try {
            const initial_progress = create_initial_progress(user_id, lesson_id);
            
            await this.#with_retry(
                () => this.#repository.save_progress(initial_progress),
                'initialize_progress'
            );
            
            // پاک کردن کش
            this.#invalidate_user_cache(user_id);
            
            // انتشار رویداد
            this.#dispatch_event('progress:initialized', {
                user_id,
                lesson_id,
                progress: initial_progress
            });

            const duration = Date.now() - start_time;
            
            this.#log_metric('progress.initialize', {
                user_id,
                lesson_id,
                duration
            });

            return {
                success: true,
                data: Object.freeze(initial_progress)
            };

        } catch (error) {
            const duration = Date.now() - start_time;
            
            this.#logger.error('Failed to initialize progress', {
                user_id,
                lesson_id,
                error: error.message,
                duration
            });

            this.#log_metric('progress.error', {
                user_id,
                lesson_id,
                operation: 'initialize',
                error: error.message,
                duration
            });

            return {
                success: false,
                error: 'خطا در ایجاد پیشرفت اولیه',
                code: ErrorCode.DB_ERROR
            };
        }
    }

    /**
     * ذخیره مستقیم یک پیشرفت (برای همگام‌سازی)
     * 
     * @param {ProgressData} progress - داده پیشرفت
     * @returns {Promise<Result>}
     */
    async save_progress(progress) {
        if (!progress?.user_id?.trim() || !progress?.lesson_id?.trim()) {
            return {
                success: false,
                error: 'داده پیشرفت نامعتبر است',
                code: ErrorCode.INVALID_INPUT
            };
        }

        const start_time = Date.now();

        try {
            await this.#with_retry(
                () => this.#repository.save_progress(progress),
                'save_progress'
            );
            
            // پاک کردن کش
            this.#invalidate_user_cache(progress.user_id);
            
            // انتشار رویداد
            this.#dispatch_event('progress:saved', {
                user_id: progress.user_id,
                lesson_id: progress.lesson_id,
                progress
            });

            const duration = Date.now() - start_time;
            
            this.#log_metric('progress.save', {
                user_id: progress.user_id,
                lesson_id: progress.lesson_id,
                duration
            });

            return {
                success: true
            };

        } catch (error) {
            const duration = Date.now() - start_time;
            
            this.#logger.error('Failed to save progress', {
                user_id: progress.user_id,
                lesson_id: progress.lesson_id,
                error: error.message,
                duration
            });

            this.#log_metric('progress.error', {
                user_id: progress.user_id,
                lesson_id: progress.lesson_id,
                operation: 'save',
                error: error.message,
                duration
            });

            return {
                success: false,
                error: 'خطا در ذخیره پیشرفت',
                code: ErrorCode.DB_ERROR
            };
        }
    }

    /**
     * به‌روزرسانی پیشرفت پس از یک تمرین با الگوریتم SRS
     * 
     * @param {string} user_id - شناسه کاربر
     * @param {string} lesson_id - شناسه درس
     * @param {number} quality - کیفیت پاسخ (۰ تا ۵)
     * @returns {Promise<Result<ProgressData>>} - نتیجه شامل پیشرفت به‌روز شده
     */
    async update_progress_with_srs(user_id, lesson_id, quality) {
        if (!user_id?.trim() || !lesson_id?.trim()) {
            return {
                success: false,
                error: 'شناسه کاربر و درس الزامی است',
                code: ErrorCode.INVALID_INPUT
            };
        }

        if (quality < PROGRESS_SERVICE_CONFIG.MIN_QUALITY || 
            quality > PROGRESS_SERVICE_CONFIG.MAX_QUALITY) {
            return {
                success: false,
                error: `کیفیت باید بین ${PROGRESS_SERVICE_CONFIG.MIN_QUALITY} و ${PROGRESS_SERVICE_CONFIG.MAX_QUALITY} باشد`,
                code: ErrorCode.INVALID_QUALITY
            };
        }

        const start_time = Date.now();

        try {
            // ۱. دریافت پیشرفت فعلی
            const progress_result = await this.get_progress(user_id, lesson_id);
            
            if (!progress_result.success) {
                return progress_result;
            }

            let progress = progress_result.data;
            
            if (!progress) {
                // اگر وجود ندارد، یک نمونه جدید ایجاد کن
                const init_result = await this.initialize_progress(user_id, lesson_id);
                if (!init_result.success) {
                    return init_result;
                }
                progress = init_result.data;
            }

            // ۲. محاسبه داده‌های جدید SRS
            const current_srs = {
                repetition: progress.repetition || 0,
                ease_factor: progress.ease_factor || 2.5,
                interval: progress.interval || 0
            };
            
            const srs_update = calculate_srs(quality, current_srs);
            const next_review_date = get_next_review_date(srs_update.interval).toISOString();

            // ۳. به‌روزرسانی مدل پیشرفت (با Immutability)
            const updated_progress = Object.freeze({
                ...progress,
                ...srs_update,
                next_review_date,
                last_reviewed_at: new Date().toISOString()
            });

            // ۴. ذخیره در مخزن
            await this.#with_retry(
                () => this.#repository.save_progress(updated_progress),
                'update_progress_with_srs'
            );
            
            // ۵. پاک کردن کش
            this.#invalidate_user_cache(user_id);
            
            // ۶. انتشار رویداد
            this.#dispatch_event('progress:updated', {
                user_id,
                lesson_id,
                quality,
                old_progress: progress,
                new_progress: updated_progress
            });

            const duration = Date.now() - start_time;

            // ۷. ثبت متریک
            this.#log_metric('progress.srs_update', {
                user_id,
                lesson_id,
                quality,
                old_ease_factor: progress.ease_factor,
                new_ease_factor: srs_update.ease_factor,
                interval: srs_update.interval,
                duration
            });

            return {
                success: true,
                data: updated_progress
            };

        } catch (error) {
            const duration = Date.now() - start_time;
            
            this.#logger.error('Failed to update progress with SRS', {
                user_id,
                lesson_id,
                quality,
                error: error.message,
                duration
            });

            this.#log_metric('progress.error', {
                user_id,
                lesson_id,
                operation: 'srs_update',
                quality,
                error: error.message,
                duration
            });

            return {
                success: false,
                error: 'خطا در به‌روزرسانی پیشرفت',
                code: ErrorCode.DB_ERROR
            };
        }
    }

    /**
     * حذف پیشرفت یک درس (در صورت لغو یا بازنشانی)
     * 
     * @param {string} user_id - شناسه کاربر
     * @param {string} lesson_id - شناسه درس
     * @returns {Promise<Result>}
     */
    async delete_progress(user_id, lesson_id) {
        if (!user_id?.trim() || !lesson_id?.trim()) {
            return {
                success: false,
                error: 'شناسه کاربر و درس الزامی است',
                code: ErrorCode.INVALID_INPUT
            };
        }

        const start_time = Date.now();

        try {
            await this.#with_retry(
                () => this.#repository.delete_progress(user_id, lesson_id),
                'delete_progress'
            );
            
            // پاک کردن کش
            this.#invalidate_user_cache(user_id);
            
            // انتشار رویداد
            this.#dispatch_event('progress:deleted', {
                user_id,
                lesson_id
            });

            const duration = Date.now() - start_time;
            
            this.#log_metric('progress.delete', {
                user_id,
                lesson_id,
                duration
            });

            return {
                success: true
            };

        } catch (error) {
            const duration = Date.now() - start_time;
            
            this.#logger.error('Failed to delete progress', {
                user_id,
                lesson_id,
                error: error.message,
                duration
            });

            this.#log_metric('progress.error', {
                user_id,
                lesson_id,
                operation: 'delete',
                error: error.message,
                duration
            });

            return {
                success: false,
                error: 'خطا در حذف پیشرفت',
                code: ErrorCode.DB_ERROR
            };
        }
    }

    /**
     * دریافت درس‌های نیازمند مرور امروز (با اولویت‌بندی)
     * 
     * @param {string} user_id - شناسه کاربر
     * @returns {Promise<Result<ProgressData[]>>} - نتیجه شامل لیست مرتب‌شده
     */
    async get_due_lessons(user_id) {
        if (!user_id?.trim()) {
            return {
                success: false,
                error: 'شناسه کاربر الزامی است',
                code: ErrorCode.INVALID_INPUT,
                data: []
            };
        }

        const start_time = Date.now();

        try {
            const all_progress_result = await this.get_all_progress(user_id);
            
            if (!all_progress_result.success) {
                return all_progress_result;
            }

            const now = new Date();
            const due_progress = all_progress_result.data.filter(p => {
                if (!p.next_review_date) return true;
                return new Date(p.next_review_date) <= now;
            });

            // اولویت‌بندی با Scheduler تزریق شده
            const prioritized = this.#scheduler.get_prioritized_lessons(due_progress);

            const duration = Date.now() - start_time;
            
            this.#log_metric('progress.due_lessons', {
                user_id,
                total: all_progress_result.data.length,
                due: due_progress.length,
                prioritized: prioritized.length,
                duration
            });

            return {
                success: true,
                data: prioritized.map(p => Object.freeze(p))
            };

        } catch (error) {
            const duration = Date.now() - start_time;
            
            this.#logger.error('Failed to get due lessons', {
                user_id,
                error: error.message,
                duration
            });

            this.#log_metric('progress.error', {
                user_id,
                operation: 'get_due',
                error: error.message,
                duration
            });

            return {
                success: false,
                error: 'خطا در دریافت درس‌های قابل مرور',
                code: ErrorCode.DB_ERROR,
                data: []
            };
        }
    }

    /**
     * ذخیره چند پیشرفت به صورت یکجا با بچینگ هوشمند
     * 
     * @param {ProgressData[]} progresses - آرایه‌ای از داده‌های پیشرفت
     * @param {number} [batch_size=50] - اندازه هر بچ
     * @returns {Promise<Result<{saved_count: number, failed_count: number}>>}
     */
    async save_bulk_progress(progresses, batch_size = 50) {
        if (!Array.isArray(progresses) || progresses.length === 0) {
            return {
                success: false,
                error: 'لیست پیشرفت‌ها نامعتبر است',
                code: ErrorCode.INVALID_INPUT
            };
        }

        // اعتبارسنجی هر آیتم
        for (const p of progresses) {
            if (!p?.user_id?.trim() || !p?.lesson_id?.trim()) {
                return {
                    success: false,
                    error: 'یکی از آیتم‌های پیشرفت نامعتبر است',
                    code: ErrorCode.INVALID_INPUT
                };
            }
        }

        const start_time = Date.now();
        const results = [];
        let saved_count = 0;
        let failed_count = 0;

        try {
            // پردازش به صورت بچ
            for (let i = 0; i < progresses.length; i += batch_size) {
                const batch = progresses.slice(i, i + batch_size);
                
                try {
                    // اگر متد bulk وجود داشت استفاده کن، وگرنه یکی‌یکی
                    if (this.#repository.save_bulk_progress) {
                        await this.#with_retry(
                            () => this.#repository.save_bulk_progress(batch),
                            'save_bulk_progress'
                        );
                    } else {
                        for (const p of batch) {
                            await this.#with_retry(
                                () => this.#repository.save_progress(p),
                                'save_progress_batch'
                            );
                        }
                    }
                    
                    saved_count += batch.length;
                    
                    // انتشار رویداد برای هر بچ
                    this.#dispatch_event('progress:batch_completed', {
                        batch_index: i / batch_size,
                        total_batches: Math.ceil(progresses.length / batch_size),
                        batch_size: batch.length
                    });
                    
                } catch (error) {
                    failed_count += batch.length;
                    this.#logger.error('Batch failed', { 
                        batch_index: i / batch_size,
                        error: error.message 
                    });
                    results.push({ success: false, error: error.message });
                }
            }

            // پاک کردن کش برای همه کاربران
            const unique_users = [...new Set(progresses.map(p => p.user_id))];
            for (const uid of unique_users) {
                this.#invalidate_user_cache(uid);
            }

            const duration = Date.now() - start_time;

            // انتشار رویداد نهایی
            this.#dispatch_event('progress:bulk_saved', {
                total: progresses.length,
                saved: saved_count,
                failed: failed_count,
                users: unique_users
            });

            this.#log_metric('progress.bulk_save', {
                total: progresses.length,
                saved: saved_count,
                failed: failed_count,
                users_count: unique_users.length,
                duration
            });

            return {
                success: true,
                data: { saved_count, failed_count }
            };

        } catch (error) {
            const duration = Date.now() - start_time;
            
            this.#logger.error('Failed to save bulk progress', {
                count: progresses.length,
                error: error.message,
                duration
            });

            this.#log_metric('progress.error', {
                operation: 'bulk_save',
                count: progresses.length,
                error: error.message,
                duration
            });

            return {
                success: false,
                error: 'خطا در ذخیره گروهی پیشرفت‌ها',
                code: ErrorCode.DB_ERROR
            };
        }
    }

    /**
     * پاکسازی منابع
     * 
     * @returns {void}
     */
    dispose() {
        // پاک کردن همه listenerها
        for (const { type, listener } of this.#event_listeners) {
            this.removeEventListener(type, listener);
        }
        this.#event_listeners.clear();
        
        // پاک کردن کش
        this.#cache.clear();
        
        // پاک کردن متریک‌ها
        this.#metrics.clear();
        
        this.#logger.debug('ProgressService disposed', {
            version: PROGRESS_SERVICE_CONFIG.VERSION
        });
    }

    /**
     * پاک کردن کش
     * 
     * @returns {void}
     */
    clear_cache() {
        this.#cache.clear();
        this.#logger.debug('Cache cleared');
    }

    /**
     * دریافت پیکربندی سرویس
     * 
     * @returns {Object} - کپی از پیکربندی
     */
    get_config() {
        return { ...PROGRESS_SERVICE_CONFIG };
    }

    /**
     * دریافت آمار سرویس
     * 
     * @returns {Object} - آمار فعلی
     */
    get_stats() {
        return {
            cache_size: this.#cache.size,
            cache_enabled: this.#cache_enabled,
            cache_ttl: this.#cache_ttl,
            version: PROGRESS_SERVICE_CONFIG.VERSION,
            metrics: this.#metrics.get_all_stats(),
            active_listeners: this.#event_listeners.size
        };
    }
}

// ============================================================================
// ثابت‌های عمومی
// ============================================================================

export const PROGRESS_CONSTANTS = Object.freeze({
    DEFAULT_QUALITY: PROGRESS_SERVICE_CONFIG.DEFAULT_QUALITY,
    MIN_QUALITY: PROGRESS_SERVICE_CONFIG.MIN_QUALITY,
    MAX_QUALITY: PROGRESS_SERVICE_CONFIG.MAX_QUALITY,
    VERSION: PROGRESS_SERVICE_CONFIG.VERSION,
    ErrorCode
});

// ============================================================================
// توابع کمکی
// ============================================================================

/**
 * ایجاد یک نمونه از سرویس با وابستگی‌های پیش‌فرض
 * (برای استفاده سریع در توسعه)
 * 
 * @param {Object} deps - وابستگی‌ها
 * @param {ProgressRepository} deps.repository - مخزن داده
 * @param {SRScheduler} deps.scheduler - زمان‌بند SRS
 * @param {Logger} deps.logger - لاگر
 * @returns {ProgressService}
 */
export function create_progress_service(deps) {
    return new ProgressService(deps);
    }
