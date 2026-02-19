/**
 * @fileoverview سرویس مدیریت امتیازدهی پیشرفته
 * @author Farsinglish Team
 * @version 2.0.0
 * 
 * مسئولیت: محاسبه، ثبت و بازیابی امتیازات کاربر با قابلیت‌های idempotency، anti-cheat و atomic transactions
 * 
 * اصول رعایت شده:
 * - SRP: فقط مسئولیت امتیازدهی
 * - OCP: استراتژی‌ها قابل توسعه از طریق کانفیگ
 * - DIP: وابسته به انتزاع repository
 * - KISS: توابع کوچک و خوانا
 * - DRY: منطق مشترک در یک مکان
 * - JSDoc کامل: همه توابع و آبجکت‌ها مستند شده‌اند
 */

import { event_bus } from '../../core/events/event_bus.js';
import { logger } from '../../core/utils/logger.js';

// ==================== Types (JSDoc) ====================

/**
 * @typedef {Object} PointTransaction
 * @property {string} user_id
 * @property {string} activity_type
 * @property {number} points_earned
 * @property {number} old_points
 * @property {number} new_points
 * @property {string} request_id
 * @property {string} created_at
 * @property {Object} context
 */

/**
 * @typedef {Object} UserPoints
 * @property {string} id
 * @property {number} points
 * @property {number} level
 * @property {number} total_points_earned
 * @property {number} version
 * @property {string} last_activity
 * @property {string} created_at
 */

/**
 * @typedef {Object} AwardPointsResult
 * @property {number} points_earned
 * @property {boolean} level_up
 * @property {number} old_level
 * @property {number} new_level
 * @property {number} total_points
 * @property {string} request_id
 * @property {number} time_multiplier
 */

/**
 * @typedef {Object} LevelThreshold
 * @property {number} level
 * @property {number} min_points
 * @property {number} bonus
 * @property {string} title
 */

/**
 * @typedef {Object} TimeBonus
 * @property {string} type
 * @property {number} start
 * @property {number} end
 * @property {number} multiplier
 * @property {string} description
 * @property {number[]} [days]
 */

/**
 * @typedef {Object} PointsCacheItem
 * @property {number} points
 * @property {number} level
 * @property {number} timestamp
 */

/**
 * @typedef {Object} OfflineQueueItem
 * @property {string} id
 * @property {string} type
 * @property {Object} data
 * @property {number} timestamp
 * @property {number} retry_count
 * @property {boolean} [failed]
 */

// ==================== ثابت‌ها و تنظیمات ====================

/** @type {number} زمان ماندگاری کش (میلی‌ثانیه) */
const CACHE_TTL = 60000; // ۱ دقیقه

/** @type {number} حداکثر تعداد تلاش مجدد */
const MAX_RETRY_ATTEMPTS = 3;

/** @type {number} پنجره idempotency (میلی‌ثانیه) */
const IDEMPOTENCY_WINDOW = 86400000; // ۲۴ ساعت

/** @type {number} محدودیت درخواست در دقیقه */
const RATE_LIMIT_PER_MINUTE = 10;

/** @type {string} کلید ذخیره‌سازی صف آفلاین */
const OFFLINE_QUEUE_KEY = 'points_offline_queue';

/** @type {string} کلید ذخیره‌سازی کش */
const POINTS_CACHE_KEY = 'points_cache';

/** @type {number} زمان پاکسازی کش (میلی‌ثانیه) */
const CACHE_CLEANUP_INTERVAL = 60000; // ۱ دقیقه

/** @type {number} اندازه دسته برای پردازش گروهی */
const BATCH_SIZE = 10;

/** @type {number} زمان انتظار برای پردازش گروهی (میلی‌ثانیه) */
const BATCH_WAIT_TIME = 5000; // ۵ ثانیه

// ==================== Feature Flags ====================

/** @type {Object} پرچم‌های فعال/غیرفعال کردن ویژگی‌ها */
const FEATURES = {
    /** پردازش گروهی امتیازات */
    BATCH_PROCESSING: process?.env?.ENABLE_BATCH_PROCESSING === 'true' || true,
    
    /** صف آفلاین */
    OFFLINE_QUEUE: process?.env?.ENABLE_OFFLINE_QUEUE === 'true' || true,
    
    /** Web Workers برای محاسبات سنگین */
    WEB_WORKERS: process?.env?.ENABLE_WEB_WORKERS === 'true' || false,
    
    /** کش پیشرفته */
    ADVANCED_CACHE: process?.env?.ENABLE_ADVANCED_CACHE === 'true' || true,
    
    /** لاگ ساختاریافته */
    STRUCTURED_LOGGING: process?.env?.ENABLE_STRUCTURED_LOGGING === 'true' || true,
    
    /** Dead Letter Queue */
    DEAD_LETTER_QUEUE: process?.env?.ENABLE_DLQ === 'true' || true
};

// ==================== استراتژی‌های محاسبه امتیاز ====================

/** @type {Object.<string, Function>} استراتژی‌های محاسبه امتیاز */
const POINT_STRATEGIES = {
    /**
     * @param {number} difficulty
     * @returns {number}
     */
    LESSON_COMPLETE: (difficulty = 1) => 10 * difficulty,
    
    /**
     * @param {number} streak_count
     * @returns {number}
     */
    EXERCISE_CORRECT: (streak_count = 1) => 5 + (streak_count * 2),
    
    /** @returns {number} */
    EXERCISE_WRONG: () => 1,
    
    /**
     * @param {number} days
     * @returns {number}
     */
    STREAK_MILESTONE: (days) => days * 20,
    
    /** @returns {number} */
    DAILY_LOGIN: () => 3,
    
    /**
     * @param {number} difficulty
     * @returns {number}
     */
    CHALLENGE_COMPLETE: (difficulty) => 15 * difficulty,
    
    /** @returns {number} */
    PERFECT_LESSON: () => 25,
    
    /**
     * @param {number} time_seconds
     * @returns {number}
     */
    QUICK_RESPONSE: (time_seconds) => time_seconds < 3 ? 5 : 0,
    
    /**
     * @param {number} bonus
     * @returns {number}
     */
    LEVEL_UP_BONUS: (bonus) => bonus,
    
    /** @returns {number} */
    SHARE_ACHIEVEMENT: () => 10,
    
    /** @returns {number} */
    INVITE_FRIEND: () => 50
};

// ==================== سطوح امتیاز ====================

/** @type {LevelThreshold[]} سطوح امتیاز */
const LEVEL_THRESHOLDS = [
    { level: 1, min_points: 0, bonus: 0, title: 'مبتدی' },
    { level: 2, min_points: 100, bonus: 50, title: 'هنرجو' },
    { level: 3, min_points: 250, bonus: 100, title: 'فعال' },
    { level: 4, min_points: 500, bonus: 200, title: 'پیشرو' },
    { level: 5, min_points: 1000, bonus: 400, title: 'حرفه‌ای' },
    { level: 6, min_points: 2000, bonus: 800, title: 'کارشناس' },
    { level: 7, min_points: 4000, bonus: 1600, title: 'استاد' }
];

// ==================== پاداش‌های زمانی ====================

/** @type {Object.<string, TimeBonus>} پاداش‌های زمانی */
const TIME_BONUSES = {
    MORNING_BONUS: {
        type: 'hourly',
        start: 5,
        end: 8,
        multiplier: 1.5,
        description: 'صبح زود'
    },
    WEEKEND_BONUS: {
        type: 'daily',
        days: [4, 5], // پنجشنبه و جمعه
        multiplier: 1.2,
        description: 'آخر هفته'
    },
    NIGHT_OWL: {
        type: 'hourly',
        start: 22,
        end: 23,
        multiplier: 1.3,
        description: 'شب‌زنده‌دار'
    }
};

// ==================== توابع کمکی ====================

/**
 * تاخیر اجرا
 * @param {number} ms - میلی‌ثانیه
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * تولید شناسه درخواست یکتا
 * @param {string} prefix - پیشوند
 * @returns {string}
 */
const generate_request_id = (prefix = 'pts') => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

/**
 * ذخیره‌سازی امن در localStorage
 * @param {string} key 
 * @param {any} value 
 */
const safe_storage_set = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        logger.error('storage_set_failed', { key, error: error.message });
    }
};

/**
 * بازیابی امن از localStorage
 * @param {string} key 
 * @param {any} default_value 
 * @returns {any}
 */
const safe_storage_get = (key, default_value = null) => {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : default_value;
    } catch (error) {
        logger.error('storage_get_failed', { key, error: error.message });
        return default_value;
    }
};

// ==================== سرویس Idempotency ====================

/**
 * سرویس Idempotency داخلی
 * @class
 */
class IdempotencyService {
    /** @type {Map<string, {result: any, timestamp: number}>} */
    #storage = new Map();
    
    /** @type {number} */
    #window_ms;

    /**
     * @param {number} window_ms
     */
    constructor(window_ms = IDEMPOTENCY_WINDOW) {
        this.#window_ms = window_ms;
        this.#start_cleanup_interval();
    }

    /**
     * دریافت نتیجه ذخیره شده
     * @param {string} request_id
     * @returns {Promise<any>}
     */
    async get_result(request_id) {
        const item = this.#storage.get(request_id);
        if (!item) return null;
        
        if (Date.now() - item.timestamp > this.#window_ms) {
            this.#storage.delete(request_id);
            return null;
        }
        
        return item.result;
    }

    /**
     * ذخیره نتیجه
     * @param {string} request_id
     * @param {any} result
     * @returns {Promise<void>}
     */
    async save_result(request_id, result) {
        this.#storage.set(request_id, {
            result,
            timestamp: Date.now()
        });
    }

    /** پاکسازی دوره‌ای کش */
    #start_cleanup_interval() {
        setInterval(() => {
            const now = Date.now();
            for (const [key, value] of this.#storage.entries()) {
                if (now - value.timestamp > this.#window_ms) {
                    this.#storage.delete(key);
                }
            }
        }, CACHE_CLEANUP_INTERVAL);
    }
}

// ==================== سرویس Anti-Cheat ====================

/**
 * سرویس Anti-Cheat داخلی
 * @class
 */
class AntiCheatService {
    /** @type {Map<string, number[]>} */
    #activity_log = new Map();
    
    /** @type {Map<string, Map<string, number>>} */
    #daily_counts = new Map();

    /**
     * اعتبارسنجی فعالیت
     * @param {string} user_id
     * @param {string} activity_type
     * @param {Object} context
     * @returns {Promise<void>}
     * @throws {Error}
     */
    async validate_activity(user_id, activity_type, context) {
        if (this.#is_suspicious_activity(user_id, activity_type)) {
            throw new Error('Suspicious activity detected');
        }

        if (this.#is_daily_limit_exceeded(user_id, activity_type)) {
            throw new Error('Daily limit exceeded');
        }

        this.#log_activity(user_id, activity_type, context);
    }

    /**
     * @param {string} user_id
     * @param {string} activity_type
     * @returns {boolean}
     */
    #is_suspicious_activity(user_id, activity_type) {
        const key = `${user_id}:${activity_type}`;
        const now = Date.now();
        const recent = this.#activity_log.get(key) || [];
        
        // اگر بیش از ۲۰ فعالیت در ۵ دقیقه باشد
        const recent_count = recent.filter(t => now - t < 300000).length;
        return recent_count > 20;
    }

    /**
     * @param {string} user_id
     * @param {string} activity_type
     * @returns {boolean}
     */
    #is_daily_limit_exceeded(user_id, activity_type) {
        /** @type {Object.<string, number>} */
        const limits = { 
            LESSON_COMPLETE: 20, 
            EXERCISE_CORRECT: 100,
            DAILY_LOGIN: 1,
            STREAK_MILESTONE: 1
        };
        
        if (!limits[activity_type]) return false;

        const today = new Date().toDateString();
        const user_counts = this.#daily_counts.get(user_id) || new Map();
        const count = user_counts.get(today)?.get(activity_type) || 0;
        
        return count >= limits[activity_type];
    }

    /**
     * @param {string} user_id
     * @param {string} activity_type
     * @param {Object} context
     */
    #log_activity(user_id, activity_type, context) {
        const key = `${user_id}:${activity_type}`;
        const now = Date.now();
        
        if (!this.#activity_log.has(key)) {
            this.#activity_log.set(key, []);
        }
        
        const log = this.#activity_log.get(key);
        log.push(now);

        // محدود کردن حجم log
        if (log.length > 100) {
            log.shift();
        }

        // به‌روزرسانی آمار روزانه
        const today = new Date().toDateString();
        if (!this.#daily_counts.has(user_id)) {
            this.#daily_counts.set(user_id, new Map());
        }
        
        const user_daily = this.#daily_counts.get(user_id);
        if (!user_daily.has(today)) {
            user_daily.set(today, new Map());
        }
        
        const daily_activities = user_daily.get(today);
        const current = daily_activities.get(activity_type) || 0;
        daily_activities.set(activity_type, current + 1);
    }
}

// ==================== سرویس صف آفلاین ====================

/**
 * سرویس صف آفلاین داخلی
 * @class
 */
class OfflineQueueService {
    /** @type {OfflineQueueItem[]} */
    #queue = [];
    
    /** @type {string} */
    #storage_key;

    /**
     * @param {string} storage_key
     */
    constructor(storage_key = OFFLINE_QUEUE_KEY) {
        this.#storage_key = storage_key;
        this.#load_from_storage();
    }

    /**
     * افزودن به صف
     * @param {string} type
     * @param {Object} data
     * @returns {Promise<OfflineQueueItem>}
     */
    async enqueue(type, data) {
        /** @type {OfflineQueueItem} */
        const item = {
            id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            type,
            data,
            timestamp: Date.now(),
            retry_count: 0
        };
        
        this.#queue.push(item);
        this.#save_to_storage();
        
        if (FEATURES.STRUCTURED_LOGGING) {
            logger.info('offline_queue_enqueued', { item_id: item.id, type });
        }
        
        return item;
    }

    /**
     * دریافت آیتم‌های صف
     * @param {string} type
     * @returns {Promise<OfflineQueueItem[]>}
     */
    async get_items(type) {
        return this.#queue.filter(item => item.type === type && !item.failed);
    }

    /**
     * حذف از صف
     * @param {string} id
     * @returns {Promise<void>}
     */
    async remove_item(id) {
        this.#queue = this.#queue.filter(item => item.id !== id);
        this.#save_to_storage();
    }

    /**
     * افزایش شمارنده تلاش مجدد
     * @param {string} id
     * @returns {Promise<void>}
     */
    async increment_retry(id) {
        const item = this.#queue.find(i => i.id === id);
        if (item) {
            item.retry_count++;
            this.#save_to_storage();
        }
    }

    /**
     * علامت‌گذاری به عنوان failed
     * @param {string} id
     * @returns {Promise<void>}
     */
    async mark_as_failed(id) {
        const item = this.#queue.find(i => i.id === id);
        if (item) {
            item.failed = true;
            this.#save_to_storage();
            
            if (FEATURES.DEAD_LETTER_QUEUE) {
                this.#add_to_dlq(item);
            }
        }
    }

    /**
     * افزودن به Dead Letter Queue
     * @param {OfflineQueueItem} item
     */
    #add_to_dlq(item) {
        const dlq_key = 'dead_letter_queue';
        const dlq = safe_storage_get(dlq_key, []);
        dlq.push({
            ...item,
            failed_at: Date.now()
        });
        
        // نگه‌داری فقط ۱۰۰ آیتم آخر
        if (dlq.length > 100) dlq.shift();
        
        safe_storage_set(dlq_key, dlq);
        
        logger.error('item_added_to_dlq', { 
            item_id: item.id, 
            type: item.type,
            retries: item.retry_count 
        });
    }

    /** ذخیره در localStorage */
    #save_to_storage() {
        safe_storage_set(this.#storage_key, this.#queue);
    }

    /** بازیابی از localStorage */
    #load_from_storage() {
        this.#queue = safe_storage_get(this.#storage_key, []);
    }
}

// ==================== سرویس کش پیشرفته ====================

/**
 * سرویس کش پیشرفته با پشتیبانی TTL
 * @class
 */
class AdvancedCacheService {
    /** @type {Map<string, {value: any, expiry: number}>} */
    #cache = new Map();
    
    /** @type {string} */
    #storage_key;

    /**
     * @param {string} storage_key
     */
    constructor(storage_key = POINTS_CACHE_KEY) {
        this.#storage_key = storage_key;
        this.#load_from_storage();
        this.#start_cleanup_interval();
    }

    /**
     * ذخیره در کش
     * @param {string} key
     * @param {any} value
     * @param {number} ttl - زمان تا انقضا (میلی‌ثانیه)
     */
    set(key, value, ttl = CACHE_TTL) {
        const expiry = Date.now() + ttl;
        this.#cache.set(key, { value, expiry });
        
        if (FEATURES.ADVANCED_CACHE) {
            this.#save_to_storage();
        }
    }

    /**
     * دریافت از کش
     * @param {string} key
     * @returns {any}
     */
    get(key) {
        const item = this.#cache.get(key);
        
        if (!item) return null;
        
        if (Date.now() > item.expiry) {
            this.#cache.delete(key);
            return null;
        }
        
        return item.value;
    }

    /**
     * حذف از کش
     * @param {string} key
     */
    delete(key) {
        this.#cache.delete(key);
        
        if (FEATURES.ADVANCED_CACHE) {
            this.#save_to_storage();
        }
    }

    /** پاکسازی کامل کش */
    clear() {
        this.#cache.clear();
        
        if (FEATURES.ADVANCED_CACHE) {
            localStorage.removeItem(this.#storage_key);
        }
    }

    /** ذخیره در localStorage */
    #save_to_storage() {
        const to_save = {};
        for (const [key, { value, expiry }] of this.#cache.entries()) {
            if (expiry > Date.now()) {
                to_save[key] = { value, expiry };
            }
        }
        safe_storage_set(this.#storage_key, to_save);
    }

    /** بازیابی از localStorage */
    #load_from_storage() {
        const saved = safe_storage_get(this.#storage_key, {});
        
        for (const [key, { value, expiry }] of Object.entries(saved)) {
            if (expiry > Date.now()) {
                this.#cache.set(key, { value, expiry });
            }
        }
    }

    /** پاکسازی دوره‌ای */
    #start_cleanup_interval() {
        setInterval(() => {
            const now = Date.now();
            let changed = false;
            
            for (const [key, { expiry }] of this.#cache.entries()) {
                if (now > expiry) {
                    this.#cache.delete(key);
                    changed = true;
                }
            }
            
            if (changed && FEATURES.ADVANCED_CACHE) {
                this.#save_to_storage();
            }
        }, CACHE_CLEANUP_INTERVAL);
    }
}

// ==================== سرویس پردازش گروهی ====================

/**
 * سرویس پردازش گروهی امتیازات
 * @class
 */
class BatchProcessorService {
    /** @type {Array<{user_id: string, activity_type: string, context: Object, request_id: string}>} */
    #batch = [];
    
    /** @type {NodeJS.Timeout|null} */
    #timeout = null;
    
    /** @type {Function} */
    #processor;
    
    /** @type {number} */
    #batch_size;
    
    /** @type {number} */
    #wait_time;

    /**
     * @param {Function} processor
     * @param {number} batch_size
     * @param {number} wait_time
     */
    constructor(processor, batch_size = BATCH_SIZE, wait_time = BATCH_WAIT_TIME) {
        this.#processor = processor;
        this.#batch_size = batch_size;
        this.#wait_time = wait_time;
    }

    /**
     * افزودن به دسته
     * @param {Object} item
     * @returns {Promise<any>}
     */
    async add(item) {
        return new Promise((resolve, reject) => {
            const promise_item = { ...item, resolve, reject };
            this.#batch.push(promise_item);
            
            if (this.#batch.length >= this.#batch_size) {
                this.#flush();
            } else if (!this.#timeout) {
                this.#timeout = setTimeout(() => this.#flush(), this.#wait_time);
            }
        });
    }

    /** پردازش دسته */
    async #flush() {
        if (this.#timeout) {
            clearTimeout(this.#timeout);
            this.#timeout = null;
        }
        
        if (this.#batch.length === 0) return;
        
        const batch_to_process = [...this.#batch];
        this.#batch = [];
        
        try {
            const results = await this.#processor(batch_to_process.map(({ user_id, activity_type, context, request_id }) => ({
                user_id, activity_type, context, request_id
            })));
            
            batch_to_process.forEach((item, index) => {
                item.resolve(results[index]);
            });
        } catch (error) {
            batch_to_process.forEach(item => {
                item.reject(error);
            });
            
            logger.error('batch_processing_failed', { error: error.message });
        }
    }

    /** تخلیه اجباری دسته */
    async flush_force() {
        await this.#flush();
    }
}

// ==================== سرویس اصلی ====================

/**
 * سرویس مدیریت امتیازدهی
 * @class
 */
class PointsService {
    /** @type {Object} */
    #user_repository;
    
    /** @type {Map<string, PointsCacheItem>} */
    #points_cache = new Map();
    
    /** @type {Set<Function>} */
    #listeners = new Set();
    
    /** @type {IdempotencyService} */
    #idempotency_service;
    
    /** @type {AntiCheatService} */
    #anti_cheat_service;
    
    /** @type {OfflineQueueService} */
    #offline_queue;
    
    /** @type {AdvancedCacheService} */
    #advanced_cache;
    
    /** @type {BatchProcessorService|null} */
    #batch_processor = null;
    
    /** @type {Map<string, number[]>} */
    #request_counter = new Map();

    /**
     * @param {Object} user_repository - ریپازیتوری کاربران
     * @throws {Error}
     */
    constructor(user_repository) {
        if (!user_repository) {
            throw new Error('user_repository is required');
        }
        
        this.#user_repository = user_repository;
        this.#idempotency_service = new IdempotencyService();
        this.#anti_cheat_service = new AntiCheatService();
        
        if (FEATURES.OFFLINE_QUEUE) {
            this.#offline_queue = new OfflineQueueService();
        }
        
        if (FEATURES.ADVANCED_CACHE) {
            this.#advanced_cache = new AdvancedCacheService();
        }
        
        if (FEATURES.BATCH_PROCESSING) {
            this.#batch_processor = new BatchProcessorService(
                this.#process_batch.bind(this)
            );
        }
        
        this.#init_event_listeners();
        this.#init_offline_support();
        this.#init_health_check();
    }

    /**
     * ثبت رویداد و محاسبه امتیاز
     * @param {string} user_id
     * @param {string} activity_type
     * @param {Object} context
     * @returns {Promise<AwardPointsResult>}
     */
    async award_points(user_id, activity_type, context = {}) {
        const request_id = context.request_id || generate_request_id();
        const start_time = Date.now();

        try {
            this.#validate_input({ user_id, activity_type, context });

            // بررسی idempotency
            const existing_result = await this.#idempotency_service.get_result(request_id);
            if (existing_result) {
                logger.debug('idempotent_request_detected', { request_id, user_id, activity_type });
                return existing_result;
            }

            // بررسی rate limit
            await this.#check_rate_limit(user_id, activity_type);
            
            // بررسی anti-cheat
            await this.#anti_cheat_service.validate_activity(user_id, activity_type, context);

            // محاسبه امتیاز
            const base_points = this.#calculate_points(activity_type, context);
            const time_multiplier = this.#get_time_multiplier();
            const points_earned = Math.round(base_points * time_multiplier);

            if (points_earned === 0) {
                return this.#create_empty_result(request_id);
            }

            // اجرای تراکنش
            let result;
            
            if (FEATURES.BATCH_PROCESSING && this.#batch_processor) {
                // پردازش گروهی
                result = await this.#batch_processor.add({
                    user_id,
                    activity_type,
                    context,
                    request_id
                });
            } else {
                // پردازش مستقیم
                result = await this.#execute_points_transaction(
                    user_id, 
                    activity_type, 
                    points_earned, 
                    context,
                    request_id
                );
            }

            // ذخیره نتیجه برای idempotency
            await this.#idempotency_service.save_result(request_id, result);

            // لاگ ساختاریافته
            if (FEATURES.STRUCTURED_LOGGING) {
                logger.info('points_awarded', {
                    request_id,
                    user_id,
                    activity_type,
                    points_earned,
                    duration: Date.now() - start_time
                });
            }

            return result;

        } catch (error) {
            return this.#handle_error(error, { user_id, activity_type, request_id });
        }
    }

    /**
     * پردازش گروهی امتیازات
     * @param {Array<{user_id: string, activity_type: string, context: Object, request_id: string}>} items
     * @returns {Promise<AwardPointsResult[]>}
     */
    async #process_batch(items) {
        const results = [];
        
        for (const item of items) {
            try {
                const base_points = this.#calculate_points(item.activity_type, item.context);
                const time_multiplier = this.#get_time_multiplier();
                const points_earned = Math.round(base_points * time_multiplier);
                
                const result = await this.#execute_points_transaction(
                    item.user_id,
                    item.activity_type,
                    points_earned,
                    item.context,
                    item.request_id
                );
                
                results.push(result);
            } catch (error) {
                logger.error('batch_item_failed', {
                    request_id: item.request_id,
                    error: error.message
                });
                
                // برای آیتم‌های failed، نتیجه خطا برمی‌گردانیم
                results.push({
                    points_earned: 0,
                    level_up: false,
                    total_points: null,
                    request_id: item.request_id,
                    error: error.message
                });
            }
        }
        
        return results;
    }

    /**
     * ثبت امتیاز در حالت آفلاین
     * @param {string} user_id
     * @param {string} activity_type
     * @param {Object} context
     * @returns {Promise<Object>}
     */
    async award_points_offline(user_id, activity_type, context = {}) {
        if (!FEATURES.OFFLINE_QUEUE || !this.#offline_queue) {
            return this.award_points(user_id, activity_type, context);
        }

        if (navigator.onLine) {
            return this.award_points(user_id, activity_type, context);
        }

        const offline_data = {
            user_id,
            activity_type,
            context,
            timestamp: Date.now(),
            request_id: generate_request_id('offline')
        };

        await this.#offline_queue.enqueue('award_points', offline_data);
        
        logger.info('points_activity_queued_offline', { user_id, activity_type });
        
        return {
            queued: true,
            message: 'Activity will be synced when online',
            offline_data: offline_data
        };
    }

    /**
     * همگام‌سازی فعالیت‌های آفلاین
     * @returns {Promise<void>}
     */
    async sync_offline_activities() {
        if (!FEATURES.OFFLINE_QUEUE || !this.#offline_queue) return;

        const queue = await this.#offline_queue.get_items('award_points');
        
        for (const item of queue) {
            try {
                await this.award_points(
                    item.data.user_id,
                    item.data.activity_type,
                    { 
                        ...item.data.context, 
                        request_id: item.data.request_id,
                        offline_sync: true 
                    }
                );
                await this.#offline_queue.remove_item(item.id);
            } catch (error) {
                logger.error('offline_sync_failed', { 
                    item_id: item.id, 
                    error: error.message 
                });
                
                if (item.retry_count >= MAX_RETRY_ATTEMPTS) {
                    await this.#offline_queue.mark_as_failed(item.id);
                } else {
                    await this.#offline_queue.increment_retry(item.id);
                    
                    // تلاش مجدد با backoff
                    setTimeout(() => {
                        this.sync_offline_activities();
                    }, Math.pow(2, item.retry_count) * 1000);
                }
            }
        }
    }

    /**
     * اجرای تراکنش اتمیک
     * @param {string} user_id
     * @param {string} activity_type
     * @param {number} points_earned
     * @param {Object} context
     * @param {string} request_id
     * @returns {Promise<AwardPointsResult>}
     */
    async #execute_points_transaction(user_id, activity_type, points_earned, context, request_id) {
        return await this.#user_repository.transaction(async (transaction) => {
            let user = await this.#user_repository.find_by_id(user_id, { transaction });
            
            if (!user) {
                user = await this.#create_user_with_defaults(user_id, { transaction });
            }

            const old_points = user.points || 0;
            const new_points = old_points + points_earned;
            
            const old_level = this.#calculate_level(old_points);
            const new_level = this.#calculate_level(new_points);
            const level_up = new_level > old_level;

            // ثبت تاریخچه
            /** @type {PointTransaction} */
            const history_item = {
                user_id,
                activity_type,
                points_earned,
                old_points,
                new_points,
                context: JSON.stringify(context),
                request_id,
                created_at: new Date().toISOString()
            };
            
            await this.#user_repository.add_points_history(history_item, { transaction });

            // به‌روزرسانی کاربر
            const updated_user = await this.#user_repository.update(user_id, {
                points: new_points,
                level: new_level,
                last_activity: new Date().toISOString(),
                total_points_earned: (user.total_points_earned || 0) + points_earned,
                version: (user.version || 0) + 1
            }, { transaction });

            // به‌روزرسانی کش
            this.#update_cache(user_id, {
                points: new_points,
                level: new_level
            });

            /** @type {AwardPointsResult} */
            const result = {
                points_earned,
                level_up,
                old_level,
                new_level,
                total_points: new_points,
                request_id,
                time_multiplier: this.#get_time_multiplier()
            };

            // رویداد بعد از commit
            transaction.afterCommit(async () => {
                await this.#emit_point_event({
                    ...result,
                    user_id,
                    activity_type,
                    old_total: old_points,
                    new_total: new_points,
                    timestamp: new Date().toISOString()
                });

                if (level_up) {
                    await this.#handle_level_up(user_id, new_level, context);
                }
            });

            return result;
        });
    }

    /**
     * دریافت امتیاز کل کاربر
     * @param {string} user_id
     * @returns {Promise<number>}
     */
    async get_user_points(user_id) {
        try {
            // بررسی کش پیشرفته
            if (FEATURES.ADVANCED_CACHE && this.#advanced_cache) {
                const cached = this.#advanced_cache.get(`user_points_${user_id}`);
                if (cached !== null) return cached;
            }

            // بررسی کش ساده
            const cached = this.#points_cache.get(user_id);
            if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
                return cached.points;
            }

            const user = await this.#user_repository.find_by_id(user_id);
            const points = user?.points || 0;

            // ذخیره در کش
            if (FEATURES.ADVANCED_CACHE && this.#advanced_cache) {
                this.#advanced_cache.set(`user_points_${user_id}`, points);
            }
            
            this.#update_cache(user_id, { points, level: user?.level || 1 });

            return points;

        } catch (error) {
            logger.error('get_user_points_failed', { user_id, error: error.message });
            return 0;
        }
    }

    /**
     * دریافت تاریخچه امتیازات
     * @param {string} user_id
     * @param {number} limit
     * @param {number} offset
     * @returns {Promise<PointTransaction[]>}
     */
    async get_points_history(user_id, limit = 50, offset = 0) {
        try {
            return await this.#user_repository.get_points_history(user_id, limit, offset);
        } catch (error) {
            logger.error('get_points_history_failed', { user_id, error: error.message });
            return [];
        }
    }

    /**
     * دریافت آمار کلی امتیازات
     * @param {string} user_id
     * @returns {Promise<Object|null>}
     */
    async get_points_statistics(user_id) {
        try {
            const user = await this.#user_repository.find_by_id(user_id);
            if (!user) return null;

            const history = await this.get_points_history(user_id, 1000);
            
            const seven_days_ago = Date.now() - (7 * 24 * 60 * 60 * 1000);
            const recent_activities = history.filter(h => 
                new Date(h.created_at).getTime() > seven_days_ago
            );

            const daily_average = recent_activities.length / 7;

            return {
                total_points: user.points,
                level: user.level,
                next_level_points: this.#get_next_level_threshold(user.level),
                points_to_next_level: this.#get_points_to_next_level(user.points, user.level),
                daily_average: Math.round(daily_average * 10) / 10,
                total_activities: history.length,
                last_activity: user.last_activity
            };

        } catch (error) {
            logger.error('get_points_statistics_failed', { user_id, error: error.message });
            return null;
        }
    }

    /**
     * بررسی وضعیت سلامت سرویس (Health Check)
     * @returns {Promise<Object>}
     */
    async health_check() {
        const status = {
            service: 'points_service',
            status: 'healthy',
            timestamp: new Date().toISOString(),
            features: { ...FEATURES },
            checks: {}
        };

        try {
            // بررسی اتصال به repository
            const db_check = await this.#user_repository.ping?.() || true;
            status.checks.database = db_check ? 'ok' : 'failed';
            
            if (!db_check) status.status = 'degraded';

            // بررسی کش
            status.checks.cache = this.#points_cache.size > 0 ? 'ok' : 'empty';

            // بررسی صف آفلاین
            if (FEATURES.OFFLINE_QUEUE && this.#offline_queue) {
                const queue_items = await this.#offline_queue.get_items('award_points');
                status.checks.offline_queue = {
                    count: queue_items.length,
                    status: queue_items.length < 100 ? 'ok' : 'warning'
                };
            }

            // بررسی Dead Letter Queue
            if (FEATURES.DEAD_LETTER_QUEUE) {
                const dlq = safe_storage_get('dead_letter_queue', []);
                status.checks.dead_letter_queue = {
                    count: dlq.length,
                    status: dlq.length < 10 ? 'ok' : 'warning'
                };
            }

        } catch (error) {
            status.status = 'unhealthy';
            status.error = error.message;
        }

        return status;
    }

    // ==================== متدهای کمکی ====================

    /**
     * محاسبه امتیاز بر اساس نوع فعالیت
     * @param {string} activity_type
     * @param {Object} context
     * @returns {number}
     */
    #calculate_points(activity_type, context) {
        const strategy = POINT_STRATEGIES[activity_type];
        
        if (!strategy) {
            logger.warn('unknown_activity_type', { activity_type });
            return 0;
        }

        try {
            switch (activity_type) {
                case 'LESSON_COMPLETE':
                    return strategy(context.difficulty || 1);
                case 'EXERCISE_CORRECT':
                    return strategy(context.streak_count || 1);
                case 'STREAK_MILESTONE':
                    return strategy(context.days || 1);
                case 'QUICK_RESPONSE':
                    return strategy(context.response_time || 999);
                default:
                    return strategy();
            }
        } catch (error) {
            logger.error('points_calculation_failed', { activity_type, context, error: error.message });
            return 0;
        }
    }

    /**
     * دریافت ضریب زمانی
     * @returns {number}
     */
    #get_time_multiplier() {
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay();

        for (const config of Object.values(TIME_BONUSES)) {
            if (config.type === 'hourly' && hour >= config.start && hour <= config.end) {
                return config.multiplier;
            }
            if (config.type === 'daily' && config.days?.includes(day)) {
                return config.multiplier;
            }
        }

        return 1.0;
    }

    /**
     * محاسبه سطح بر اساس امتیاز
     * @param {number} points
     * @returns {number}
     */
    #calculate_level(points) {
        for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
            if (points >= LEVEL_THRESHOLDS[i].min_points) {
                return LEVEL_THRESHOLDS[i].level;
            }
        }
        return 1;
    }

    /**
     * بررسی rate limiting
     * @param {string} user_id
     * @param {string} activity_type
     * @returns {Promise<void>}
     * @throws {Error}
     */
    async #check_rate_limit(user_id, activity_type) {
        const key = `${user_id}:${activity_type}`;
        const now = Date.now();
        const window_start = now - 60000;
        
        const requests = this.#request_counter.get(key) || [];
        const recent_requests = requests.filter(t => t > window_start);
        
        if (recent_requests.length >= RATE_LIMIT_PER_MINUTE) {
            throw new Error('Rate limit exceeded');
        }
        
        recent_requests.push(now);
        this.#request_counter.set(key, recent_requests);
    }

    /**
     * مدیریت سطح‌آپ
     * @param {string} user_id
     * @param {number} new_level
     * @param {Object} context
     */
    async #handle_level_up(user_id, new_level, context) {
        const level_data = LEVEL_THRESHOLDS.find(l => l.level === new_level);
        
        if (level_data?.bonus > 0) {
            await this.award_points(user_id, 'LEVEL_UP_BONUS', {
                bonus: level_data.bonus,
                ...context,
                request_id: generate_request_id('level_up')
            });
        }

        await event_bus.emit('user_level_up', {
            user_id,
            new_level,
            bonus: level_data?.bonus || 0,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * ایجاد کاربر پیش‌فرض
     * @param {string} user_id
     * @param {Object} options
     * @returns {Promise<UserPoints>}
     */
    async #create_user_with_defaults(user_id, options = {}) {
        return await this.#user_repository.create({
            id: user_id,
            points: 0,
            level: 1,
            total_points_earned: 0,
            version: 1,
            created_at: new Date().toISOString()
        }, options);
    }

    /**
     * به‌روزرسانی کش
     * @param {string} user_id
     * @param {Object} data
     */
    #update_cache(user_id, data) {
        this.#points_cache.set(user_id, {
            ...data,
            timestamp: Date.now()
        });
    }

    /**
     * اعتبارسنجی ورودی
     * @param {Object} params
     * @param {string} params.user_id
     * @param {string} params.activity_type
     * @param {Object} params.context
     * @throws {Error}
     */
    #validate_input({ user_id, activity_type, context }) {
        if (!user_id || typeof user_id !== 'string') {
            throw new Error('Invalid user_id');
        }
        if (!activity_type || typeof activity_type !== 'string') {
            throw new Error('Invalid activity_type');
        }
        if (context && typeof context !== 'object') {
            throw new Error('Invalid context');
        }
    }

    /**
     * ایجاد نتیجه خالی
     * @param {string} request_id
     * @returns {AwardPointsResult}
     */
    #create_empty_result(request_id) {
        return {
            points_earned: 0,
            level_up: false,
            old_level: 0,
            new_level: 0,
            total_points: null,
            request_id,
            time_multiplier: 1
        };
    }

    /**
     * مدیریت خطا
     * @param {Error} error
     * @param {Object} context
     * @returns {never}
     */
    #handle_error(error, context) {
        logger.error('award_points_failed', {
            ...context,
            error: error.message,
            stack: error.stack
        });

        throw error;
    }

    /**
     * ارسال رویداد امتیاز
     * @param {Object} event_data
     */
    async #emit_point_event(event_data) {
        await event_bus.emit('points_awarded', event_data);

        this.#listeners.forEach(listener => {
            try {
                listener(event_data);
            } catch (error) {
                logger.error('point_listener_failed', { error: error.message });
            }
        });
    }

    /**
     * راه‌اندازی event listeners
     */
    #init_event_listeners() {
        event_bus.on('lesson_completed', async (data) => {
            await this.award_points_offline(data.user_id, 'LESSON_COMPLETE', {
                difficulty: data.lesson_difficulty,
                request_id: `lesson_${data.lesson_id}_${Date.now()}`
            });
        });

        event_bus.on('exercise_answered', async (data) => {
            if (data.correct) {
                await this.award_points_offline(data.user_id, 'EXERCISE_CORRECT', {
                    streak_count: data.streak_count,
                    request_id: `exercise_${data.exercise_id}_${Date.now()}`
                });
            } else {
                await this.award_points_offline(data.user_id, 'EXERCISE_WRONG', {
                    request_id: `exercise_wrong_${data.exercise_id}_${Date.now()}`
                });
            }
        });
    }

    /**
     * راه‌اندازی پشتیبانی آفلاین
     */
    #init_offline_support() {
        if (typeof window !== 'undefined' && FEATURES.OFFLINE_QUEUE) {
            window.addEventListener('online', () => {
                logger.info('connection_restored', { timestamp: new Date().toISOString() });
                this.sync_offline_activities();
            });
        }
    }

    /**
     * راه‌اندازی Health Check
     */
    #init_health_check() {
        if (typeof window !== 'undefined') {
            // ثبت endpoint health check در کنسول برای دیباگ
            window.__points_service_health = () => this.health_check();
        }
    }

    /**
     * دریافت آستانه سطح بعدی
     * @param {number} current_level
     * @returns {number}
     */
    #get_next_level_threshold(current_level) {
        const next_level = LEVEL_THRESHOLDS.find(l => l.level === current_level + 1);
        return next_level?.min_points || Infinity;
    }

    /**
     * محاسبه امتیاز مورد نیاز تا سطح بعدی
     * @param {number} current_points
     * @param {number} current_level
     * @returns {number}
     */
    #get_points_to_next_level(current_points, current_level) {
        const next_threshold = this.#get_next_level_threshold(current_level);
        if (next_threshold === Infinity) return 0;
        return Math.max(0, next_threshold - current_points);
    }

    /**
     * ثبت listener برای رویدادهای امتیاز
     * @param {Function} callback
     * @returns {Function} تابع برای لغو listener
     */
    on_points_awarded(callback) {
        this.#listeners.add(callback);
        return () => this.#listeners.delete(callback);
    }

    /**
     * پاکسازی کش (برای تست)
     */
    clear_cache() {
        this.#points_cache.clear();
        this.#request_counter.clear();
        
        if (FEATURES.ADVANCED_CACHE && this.#advanced_cache) {
            this.#advanced_cache.clear();
        }
    }

    /**
     * تخلیه اجباری دسته (برای تست)
     */
    async flush_batch() {
        if (FEATURES.BATCH_PROCESSING && this.#batch_processor) {
            await this.#batch_processor.flush_force();
        }
    }
}

// ==================== Factory functions ====================

/**
 * ایجاد نمونه سرویس امتیاز
 * @param {Object} user_repository
 * @returns {PointsService}
 */
export const create_points_service = (user_repository) => {
    return new PointsService(user_repository);
};

/** @type {PointsService|null} */
let points_service_instance = null;

/**
 * دریافت نمونه سرویس امتیاز (Singleton)
 * @param {Object} user_repository
 * @returns {PointsService}
 */
export const get_points_service = (user_repository) => {
    if (!points_service_instance && user_repository) {
        points_service_instance = new PointsService(user_repository);
    }
    return points_service_instance;
};

export default PointsService;
