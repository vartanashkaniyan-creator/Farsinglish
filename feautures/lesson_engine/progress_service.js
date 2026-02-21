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

/**
 * @typedef {Object} Result
 * @property {boolean} success
 * @property {*} [data]
 * @property {string} [error]
 * @property {string} [code]
 */

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
    
    /** @type {string} نسخه سرویس */
    VERSION: '2.0.0'
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
        this.dispatchEvent(new CustomEvent(event_name, { 
            detail: Object.freeze({ ...detail, timestamp: new Date().toISOString() })
        }));
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
    }

    // ========================================================================
    // متدهای عمومی
    // ========================================================================

    /**
     * دریافت پیشرفت یک کاربر در یک درس خاص
     * 
     * @param {string} user_id - شناسه کاربر
     * @param {string} lesson_id - شناسه درس
     * @returns {Promise<Result>} - نتیجه شامل داده پیشرفت یا خطا
     */
    async get_progress(user_id, lesson_id) {
        if (!user_id?.trim() || !lesson_id?.trim()) {
            return {
                success: false,
                error: 'شناسه کاربر و درس الزامی است',
                code: 'INVALID_INPUT'
            };
        }

        try {
            // تلاش برای دریافت از کش
            const cached = this.#get_from_cache(user_id, lesson_id);
            if (cached) {
                return {
                    success: true,
                    data: cached
                };
            }

            // دریافت از مخزن
            const progress = await this.#repository.get_progress(user_id, lesson_id);
            
            if (progress) {
                // ذخیره در کش
                this.#set_in_cache(user_id, lesson_id, progress);
                
                this.#log_metric('progress.get', {
                    user_id,
                    lesson_id,
                    found: true
                });
                
                return {
                    success: true,
                    data: Object.freeze(progress)
                };
            }

            this.#log_metric('progress.get', {
                user_id,
                lesson_id,
                found: false
            });

            return {
                success: true,
                data: null
            };

        } catch (error) {
            this.#logger.error('Failed to get progress', {
                user_id,
                lesson_id,
                error: error.message
            });
            
            this.#log_metric('progress.error', {
                user_id,
                lesson_id,
                operation: 'get',
                error: error.message
            });

            return {
                success: false,
                error: 'خطا در دریافت اطلاعات پیشرفت',
                code: 'DB_ERROR'
            };
        }
    }

    /**
     * دریافت تمام پیشرفت‌های یک کاربر
     * 
     * @param {string} user_id - شناسه کاربر
     * @returns {Promise<Result>} - نتیجه شامل لیست پیشرفت‌ها
     */
    async get_all_progress(user_id) {
        if (!user_id?.trim()) {
            return {
                success: false,
                error: 'شناسه کاربر الزامی است',
                code: 'INVALID_INPUT'
            };
        }

        try {
            const list = await this.#repository.get_all_progress(user_id);
            
            const progress_list = Array.isArray(list) 
                ? list.map(p => Object.freeze(p)) 
                : [];
            
            this.#log_metric('progress.get_all', {
                user_id,
                count: progress_list.length
            });

            return {
                success: true,
                data: progress_list
            };

        } catch (error) {
            this.#logger.error('Failed to get all progress', {
                user_id,
                error: error.message
            });

            this.#log_metric('progress.error', {
                user_id,
                operation: 'get_all',
                error: error.message
            });

            return {
                success: false,
                error: 'خطا در دریافت لیست پیشرفت‌ها',
                code: 'DB_ERROR',
                data: []
            };
        }
    }

    /**
     * ایجاد یا بازنشانی پیشرفت یک درس
     * 
     * @param {string} user_id - شناسه کاربر
     * @param {string} lesson_id - شناسه درس
     * @returns {Promise<Result>} - نتیجه شامل پیشرفت جدید
     */
    async initialize_progress(user_id, lesson_id) {
        if (!user_id?.trim() || !lesson_id?.trim()) {
            return {
                success: false,
                error: 'شناسه کاربر و درس الزامی است',
                code: 'INVALID_INPUT'
            };
        }

        try {
            const initial_progress = create_initial_progress(user_id, lesson_id);
            
            await this.#repository.save_progress(initial_progress);
            
            // پاک کردن کش
            this.#invalidate_user_cache(user_id);
            
            // انتشار رویداد
            this.#dispatch_event('progress:initialized', {
                user_id,
                lesson_id,
                progress: initial_progress
            });

            this.#log_metric('progress.initialize', {
                user_id,
                lesson_id
            });

            return {
                success: true,
                data: Object.freeze(initial_progress)
            };

        } catch (error) {
            this.#logger.error('Failed to initialize progress', {
                user_id,
                lesson_id,
                error: error.message
            });

            this.#log_metric('progress.error', {
                user_id,
                lesson_id,
                operation: 'initialize',
                error: error.message
            });

            return {
                success: false,
                error: 'خطا در ایجاد پیشرفت اولیه',
                code: 'DB_ERROR'
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
                code: 'INVALID_INPUT'
            };
        }

        try {
            await this.#repository.save_progress(progress);
            
            // پاک کردن کش
            this.#invalidate_user_cache(progress.user_id);
            
            // انتشار رویداد
            this.#dispatch_event('progress:saved', {
                user_id: progress.user_id,
                lesson_id: progress.lesson_id,
                progress
            });

            this.#log_metric('progress.save', {
                user_id: progress.user_id,
                lesson_id: progress.lesson_id
            });

            return {
                success: true
            };

        } catch (error) {
            this.#logger.error('Failed to save progress', {
                user_id: progress.user_id,
                lesson_id: progress.lesson_id,
                error: error.message
            });

            this.#log_metric('progress.error', {
                user_id: progress.user_id,
                lesson_id: progress.lesson_id,
                operation: 'save',
                error: error.message
            });

            return {
                success: false,
                error: 'خطا در ذخیره پیشرفت',
                code: 'DB_ERROR'
            };
        }
    }

    /**
     * به‌روزرسانی پیشرفت پس از یک تمرین با الگوریتم SRS
     * 
     * @param {string} user_id - شناسه کاربر
     * @param {string} lesson_id - شناسه درس
     * @param {number} quality - کیفیت پاسخ (۰ تا ۵)
     * @returns {Promise<Result>} - نتیجه شامل پیشرفت به‌روز شده
     */
    async update_progress_with_srs(user_id, lesson_id, quality) {
        if (!user_id?.trim() || !lesson_id?.trim()) {
            return {
                success: false,
                error: 'شناسه کاربر و درس الزامی است',
                code: 'INVALID_INPUT'
            };
        }

        if (quality < PROGRESS_SERVICE_CONFIG.MIN_QUALITY || 
            quality > PROGRESS_SERVICE_CONFIG.MAX_QUALITY) {
            return {
                success: false,
                error: `کیفیت باید بین ${PROGRESS_SERVICE_CONFIG.MIN_QUALITY} و ${PROGRESS_SERVICE_CONFIG.MAX_QUALITY} باشد`,
                code: 'INVALID_QUALITY'
            };
        }

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
            await this.#repository.save_progress(updated_progress);
            
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

            // ۷. ثبت متریک
            this.#log_metric('progress.srs_update', {
                user_id,
                lesson_id,
                quality,
                old_ease_factor: progress.ease_factor,
                new_ease_factor: srs_update.ease_factor,
                interval: srs_update.interval
            });

            return {
                success: true,
                data: updated_progress
            };

        } catch (error) {
            this.#logger.error('Failed to update progress with SRS', {
                user_id,
                lesson_id,
                quality,
                error: error.message
            });

            this.#log_metric('progress.error', {
                user_id,
                lesson_id,
                operation: 'srs_update',
                quality,
                error: error.message
            });

            return {
                success: false,
                error: 'خطا در به‌روزرسانی پیشرفت',
                code: 'DB_ERROR'
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
                code: 'INVALID_INPUT'
            };
        }

        try {
            await this.#repository.delete_progress(user_id, lesson_id);
            
            // پاک کردن کش
            this.#invalidate_user_cache(user_id);
            
            // انتشار رویداد
            this.#dispatch_event('progress:deleted', {
                user_id,
                lesson_id
            });

            this.#log_metric('progress.delete', {
                user_id,
                lesson_id
            });

            return {
                success: true
            };

        } catch (error) {
            this.#logger.error('Failed to delete progress', {
                user_id,
                lesson_id,
                error: error.message
            });

            this.#log_metric('progress.error', {
                user_id,
                lesson_id,
                operation: 'delete',
                error: error.message
            });

            return {
                success: false,
                error: 'خطا در حذف پیشرفت',
                code: 'DB_ERROR'
            };
        }
    }

    /**
     * دریافت درس‌های نیازمند مرور امروز (با اولویت‌بندی)
     * 
     * @param {string} user_id - شناسه کاربر
     * @returns {Promise<Result>} - نتیجه شامل لیست مرتب‌شده
     */
    async get_due_lessons(user_id) {
        if (!user_id?.trim()) {
            return {
                success: false,
                error: 'شناسه کاربر الزامی است',
                code: 'INVALID_INPUT'
            };
        }

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

            this.#log_metric('progress.due_lessons', {
                user_id,
                total: all_progress_result.data.length,
                due: due_progress.length,
                prioritized: prioritized.length
            });

            return {
                success: true,
                data: prioritized.map(p => Object.freeze(p))
            };

        } catch (error) {
            this.#logger.error('Failed to get due lessons', {
                user_id,
                error: error.message
            });

            this.#log_metric('progress.error', {
                user_id,
                operation: 'get_due',
                error: error.message
            });

            return {
                success: false,
                error: 'خطا در دریافت درس‌های قابل مرور',
                code: 'DB_ERROR',
                data: []
            };
        }
    }

    /**
     * ذخیره چند پیشرفت به صورت یکجا
     * 
     * @param {ProgressData[]} progresses - آرایه‌ای از داده‌های پیشرفت
     * @returns {Promise<Result>}
     */
    async save_bulk_progress(progresses) {
        if (!Array.isArray(progresses) || progresses.length === 0) {
            return {
                success: false,
                error: 'لیست پیشرفت‌ها نامعتبر است',
                code: 'INVALID_INPUT'
            };
        }

        // اعتبارسنجی هر آیتم
        for (const p of progresses) {
            if (!p?.user_id?.trim() || !p?.lesson_id?.trim()) {
                return {
                    success: false,
                    error: 'یکی از آیتم‌های پیشرفت نامعتبر است',
                    code: 'INVALID_INPUT'
                };
            }
        }

        try {
            // اگر متد bulk وجود داشت استفاده کن، وگرنه یکی‌یکی
            if (this.#repository.save_bulk_progress) {
                await this.#repository.save_bulk_progress(progresses);
            } else {
                for (const p of progresses) {
                    await this.#repository.save_progress(p);
                }
            }

            // پاک کردن کش برای همه کاربران
            const unique_users = [...new Set(progresses.map(p => p.user_id))];
            for (const uid of unique_users) {
                this.#invalidate_user_cache(uid);
            }

            // انتشار رویداد
            this.#dispatch_event('progress:bulk_saved', {
                count: progresses.length,
                users: unique_users
            });

            this.#log_metric('progress.bulk_save', {
                count: progresses.length,
                users_count: unique_users.length
            });

            return {
                success: true,
                data: { saved_count: progresses.length }
            };

        } catch (error) {
            this.#logger.error('Failed to save bulk progress', {
                count: progresses.length,
                error: error.message
            });

            this.#log_metric('progress.error', {
                operation: 'bulk_save',
                count: progresses.length,
                error: error.message
            });

            return {
                success: false,
                error: 'خطا در ذخیره گروهی پیشرفت‌ها',
                code: 'DB_ERROR'
            };
        }
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
            version: PROGRESS_SERVICE_CONFIG.VERSION
        };
    }
}

// ============================================================================
// ثابت‌های عمومی (در صورت نیاز)
// ============================================================================

export const PROGRESS_CONSTANTS = Object.freeze({
    DEFAULT_QUALITY: PROGRESS_SERVICE_CONFIG.DEFAULT_QUALITY,
    MIN_QUALITY: PROGRESS_SERVICE_CONFIG.MIN_QUALITY,
    MAX_QUALITY: PROGRESS_SERVICE_CONFIG.MAX_QUALITY,
    VERSION: PROGRESS_SERVICE_CONFIG.VERSION
});

// ============================================================================
// توابع کمکی (در صورت نیاز)
// ============================================================================

/**
 * ایجاد یک نمونه از سرویس با وابستگی‌های پیش‌فرض
 * (برای استفاده سریع در توسعه)
 * 
 * @param {Object} deps - وابستگی‌ها
 * @returns {ProgressService}
 */
export function create_progress_service(deps) {
    return new ProgressService(deps);
    }
