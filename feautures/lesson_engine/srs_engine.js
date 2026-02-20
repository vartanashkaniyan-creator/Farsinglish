/**
 * @file srs_engine.js
 * @version 3.0.0
 * @description موتور پیشرفته الگوریتم مرور هوشمند (SRS) با معماری Plugin-Based، Event-Driven و Middleware
 * @copyright Farsinglish Project 2024
 * 
 * ویژگی‌ها:
 * - پشتیبانی از الگوریتم‌های SM-2، Anki، FSRS
 * - معماری استراتژی برای توسعه‌پذیری (OCP)
 * - سیستم Event-Driven برای ارتباط با سایر ماژول‌ها
 * - Serialization + Migration خودکار
 * - Adaptive Parameters (شخصی‌سازی بر اساس عملکرد کاربر)
 * - Middleware Pipeline برای افزودن قابلیت‌های جانبی
 * - Result Pattern برای مدیریت خطا
 * - Time Provider برای تست‌پذیری
 * - Cache هوشمند با LRU
 * - Composite Validator
 * - Telemetry داخلی
 */

// ============== ثابت‌ها و پیکربندی ==============

/** @type {Readonly<Record<string, number>>} */
export const DEFAULTS = Object.freeze({
    // مقادیر پایه
    MIN_EASE_FACTOR: 1.3,
    MAX_EASE_FACTOR: 5.0,
    DEFAULT_EASE_FACTOR: 2.5,
    INTERVAL_REP_0: 1,
    INTERVAL_REP_1: 6,
    MAX_INTERVAL: 36500,
    
    // ضرایب تعدیل
    EASE_BONUS: 0.15,
    EASE_PENALTY: 0.2,
    HARD_PENALTY: 0.1,
    AGAIN_MULTIPLIER: 0.5,
    HARD_MULTIPLIER: 1.2,
    GOOD_MULTIPLIER: 2.5,
    EASY_MULTIPLIER: 3.0,
    
    // کش و تاریخچه
    CACHE_MAX_SIZE: 1000,
    MAX_HISTORY_LENGTH: 20,
    
    // Adaptive parameters
    ADAPTATION_THRESHOLD: 10,
    ADAPTATION_FACTOR: 0.1,
    
    // Retention factor
    RETENTION_FACTOR: 10
});

/** @type {Readonly<Record<string, number>>} */
export const FSRS_CONSTANTS = Object.freeze({
    W0: 0.4,
    W1: 0.6,
    W2: 1.0,
    DECAY: 0.5,
    DIFFICULTY_DECAY: 0.1,
    DIFFICULTY_INCREASE: 0.2,
    STABILITY_MULTIPLIER: 30
});

/** @type {string} */
export const VERSION = '3.0.0';

/** @type {Readonly<Record<string, string>>} */
export const CHANGELOG = Object.freeze({
    '3.0.0': 'Added Event-Driven, Serialization, Adaptive Parameters, Middleware',
    '2.0.0': 'Added FSRS algorithm, Result Pattern, Cache',
    '1.0.0': 'Initial version with SM-2 and Anki'
});

// ============== Enums ==============

/** @enum {number} */
export const ReviewQuality = Object.freeze({
    AGAIN: 0,
    HARD: 1,
    GOOD: 2,
    EASY: 3,
    PERFECT: 4
});

/** @enum {string} */
export const AlgorithmType = Object.freeze({
    SM2: 'sm2',
    ANKI: 'anki',
    FSRS: 'fsrs'
});

/** @enum {string} */
export const ErrorCode = Object.freeze({
    INVALID_QUALITY: 'INVALID_QUALITY',
    INVALID_REPETITION: 'INVALID_REPETITION',
    INVALID_EASE_FACTOR: 'INVALID_EASE_FACTOR',
    INVALID_INTERVAL: 'INVALID_INTERVAL',
    INVALID_DATA: 'INVALID_DATA',
    ALGORITHM_NOT_FOUND: 'ALGORITHM_NOT_FOUND',
    CACHE_ERROR: 'CACHE_ERROR',
    MIGRATION_ERROR: 'MIGRATION_ERROR',
    MIDDLEWARE_ERROR: 'MIDDLEWARE_ERROR'
});

/** @enum {string} */
export const EventType = Object.freeze({
    CARD_REVIEWED: 'card:reviewed',
    CARD_RESET: 'card:reset',
    ALGORITHM_CHANGED: 'algorithm:changed',
    PARAMETERS_ADAPTED: 'parameters:adapted',
    CACHE_CLEARED: 'cache:cleared',
    ERROR: 'error'
});

// ============== Type Definitions ==============

/**
 * @typedef {Object} SRSConfig
 * @property {AlgorithmType} algorithm
 * @property {number} maxInterval
 * @property {boolean} enableFuzzing
 * @property {number} fuzzRange
 * @property {boolean} enableTelemetry
 * @property {number} cacheSize
 * @property {number} easeBonus
 * @property {number} easePenalty
 * @property {number} hardPenalty
 */

/**
 * @typedef {Object} SRSBaseData
 * @property {number} repetition
 * @property {number} easeFactor
 * @property {number} interval
 * @property {number} lapses
 * @property {number} lastDuration
 * @property {readonly number[]} reviewHistory
 * @property {string} [nextReview]
 * @property {string} [lastReviewDate]
 */

/**
 * @typedef {SRSBaseData} SRSData
 */

/**
 * @typedef {Object} SRSMetrics
 * @property {number} retention
 * @property {number} stability
 * @property {number} difficulty
 * @property {number} averageQuality
 * @property {number} streak
 */

/**
 * @typedef {Object} SRSResult
 * @property {SRSData} data
 * @property {SRSMetrics} metrics
 */

/**
 * @typedef {Object} SuccessResult
 * @property {true} success
 * @property {SRSResult} data
 */

/**
 * @typedef {Object} ErrorResult
 * @property {false} success
 * @property {ErrorCode} code
 * @property {string} message
 * @property {string} [stack]
 */

/** @typedef {SuccessResult | ErrorResult} Result */

/**
 * @typedef {Object} EventPayload
 * @property {string} type
 * @property {*} data
 * @property {number} timestamp
 */

/**
 * @typedef {Function} EventListener
 * @param {EventPayload} payload
 */

/**
 * @typedef {Object} MiddlewareContext
 * @property {number} quality
 * @property {SRSData} currentData
 * @property {SRSConfig} config
 * @property {Object} [extra]
 */

/**
 * @typedef {Object} Middleware
 * @property {function(MiddlewareContext): MiddlewareContext} [before]
 * @property {function(SRSResult, MiddlewareContext): SRSResult} [after]
 * @property {string} name
 */

// ============== Event Bus ==============

/**
 * @class EventBus
 * @description سیستم انتشار/اشتراک رویداد برای ارتباط ماژول‌ها
 */
class EventBus {
    /** @type {Map<string, Set<EventListener>>} */
    #listeners = new Map();

    /**
     * @param {string} event
     * @param {EventListener} listener
     * @returns {() => void} unsubscribe function
     */
    on(event, listener) {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, new Set());
        }
        this.#listeners.get(event).add(listener);
        
        // Return unsubscribe function
        return () => this.off(event, listener);
    }

    /**
     * @param {string} event
     * @param {EventListener} listener
     */
    off(event, listener) {
        this.#listeners.get(event)?.delete(listener);
    }

    /**
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
        const payload = {
            type: event,
            data,
            timestamp: Date.now()
        };
        
        this.#listeners.get(event)?.forEach(listener => {
            try {
                listener(payload);
            } catch (error) {
                console.error(`Error in event listener for ${event}:`, error);
            }
        });
    }

    /** @param {string} event */
    clear(event) {
        if (event) {
            this.#listeners.delete(event);
        } else {
            this.#listeners.clear();
        }
    }

    /** @returns {string[]} */
    getEvents() {
        return Array.from(this.#listeners.keys());
    }
}

// ============== Strategy Interfaces ==============

/**
 * @interface IStrategy
 */
class IStrategy {
    /**
     * @param {number} quality
     * @param {SRSData} currentData
     * @param {SRSConfig} config
     * @returns {SRSResult}
     */
    calculate(quality, currentData, config) {
        throw new Error('Must be implemented');
    }

    /**
     * @returns {string}
     */
    get name() {
        return this.constructor.name;
    }
}

// ============== Strategy Implementations ==============

/** @implements {IStrategy} */
class SM2Strategy extends IStrategy {
    /** @type {Readonly<Record<string, number>>} */
    static #CONSTANTS = Object.freeze({
        BASE_INCREASE: 0.1,
        QUALITY_FACTOR: 0.08,
        QUALITY_SQUARE_FACTOR: 0.02
    });

    get name() { return 'SM-2'; }

    /**
     * @param {number} quality
     * @param {SRSData} currentData
     * @param {SRSConfig} config
     * @returns {SRSResult}
     */
    calculate(quality, currentData, config) {
        const { repetition = 0, easeFactor = DEFAULTS.DEFAULT_EASE_FACTOR, 
                interval = 0, lapses = 0, reviewHistory = [] } = currentData;

        // Update ease factor
        const easeAdjustment = SM2Strategy.#easeFactorAdjustment(quality);
        let newEaseFactor = easeFactor + easeAdjustment;
        newEaseFactor = Math.max(DEFAULTS.MIN_EASE_FACTOR, 
                                Math.min(DEFAULTS.MAX_EASE_FACTOR, newEaseFactor));

        // Update repetition and interval
        const { newRepetition, newInterval } = quality >= 3
            ? this.#handleCorrect(repetition, interval, newEaseFactor)
            : this.#handleIncorrect();

        // Apply fuzzing
        const finalInterval = config.enableFuzzing 
            ? this.#applyFuzzing(newInterval, config.fuzzRange)
            : newInterval;

        const newData = this.#createNewData(
            newRepetition,
            newEaseFactor,
            Math.min(finalInterval, config.maxInterval),
            quality < 3 ? lapses + 1 : lapses,
            currentData.lastDuration || 0,
            [...reviewHistory, quality].slice(-DEFAULTS.MAX_HISTORY_LENGTH),
            currentData.lastReviewDate
        );

        const metrics = this.#calculateMetrics(newData, quality);

        return { data: newData, metrics };
    }

    /** @private */
    static #easeFactorAdjustment(quality) {
        return SM2Strategy.#CONSTANTS.BASE_INCREASE - 
               (5 - quality) * (SM2Strategy.#CONSTANTS.QUALITY_FACTOR + 
               (5 - quality) * SM2Strategy.#CONSTANTS.QUALITY_SQUARE_FACTOR);
    }

    /** @private */
    #handleCorrect(repetition, interval, easeFactor) {
        const newRepetition = repetition + 1;
        let newInterval;

        if (newRepetition === 1) {
            newInterval = DEFAULTS.INTERVAL_REP_0;
        } else if (newRepetition === 2) {
            newInterval = DEFAULTS.INTERVAL_REP_1;
        } else {
            newInterval = Math.round(interval * easeFactor);
        }

        return { newRepetition, newInterval };
    }

    /** @private */
    #handleIncorrect() {
        return { newRepetition: 0, newInterval: 1 };
    }

    /** @private */
    #applyFuzzing(interval, fuzzRange) {
        const range = Math.max(1, Math.floor(interval * fuzzRange));
        const offset = Math.floor(Math.random() * (range * 2 + 1)) - range;
        return Math.max(1, interval + offset);
    }

    /** @private */
    #createNewData(repetition, easeFactor, interval, lapses, lastDuration, reviewHistory, lastReviewDate) {
        return Object.freeze({
            repetition,
            easeFactor: Number(easeFactor.toFixed(2)),
            interval,
            lapses,
            lastDuration,
            reviewHistory: Object.freeze(reviewHistory),
            lastReviewDate: lastReviewDate || new Date().toISOString()
        });
    }

    /** @private */
    #calculateMetrics(data, quality) {
        const retention = Math.exp(-data.interval / (data.easeFactor * DEFAULTS.RETENTION_FACTOR));
        const stability = data.interval * data.easeFactor;
        const lapseRate = data.reviewHistory.length > 0
            ? data.reviewHistory.filter(q => q < 3).length / data.reviewHistory.length
            : 0.5;
        const difficulty = Math.min(1, lapseRate * 1.5);
        const averageQuality = data.reviewHistory.length > 0
            ? data.reviewHistory.reduce((a, b) => a + b, 0) / data.reviewHistory.length
            : 0;
        const streak = this.#calculateStreak(data.reviewHistory);

        return Object.freeze({
            retention: Number(retention.toFixed(3)),
            stability: Number(stability.toFixed(1)),
            difficulty: Number(difficulty.toFixed(2)),
            averageQuality: Number(averageQuality.toFixed(2)),
            streak
        });
    }

    /** @private */
    #calculateStreak(history) {
        let streak = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i] >= 3) streak++;
            else break;
        }
        return streak;
    }
}

/** @implements {IStrategy} */
class AnkiStrategy extends IStrategy {
    get name() { return 'Anki'; }

    /**
     * @param {number} quality
     * @param {SRSData} currentData
     * @param {SRSConfig} config
     * @returns {SRSResult}
     */
    calculate(quality, currentData, config) {
        const { repetition = 0, easeFactor = DEFAULTS.DEFAULT_EASE_FACTOR, 
                interval = 0, lapses = 0, reviewHistory = [] } = currentData;

        const result = this.#processQuality(quality, repetition, interval, easeFactor, config);
        
        // Apply fuzzing
        const finalInterval = config.enableFuzzing 
            ? this.#applyFuzzing(result.newInterval, config.fuzzRange)
            : result.newInterval;

        const newData = Object.freeze({
            repetition: result.newRepetition,
            easeFactor: Number(result.newEaseFactor.toFixed(2)),
            interval: Math.min(finalInterval, config.maxInterval),
            lapses: quality === 0 ? lapses + 1 : lapses,
            lastDuration: currentData.lastDuration || 0,
            reviewHistory: Object.freeze([...reviewHistory, quality].slice(-DEFAULTS.MAX_HISTORY_LENGTH)),
            lastReviewDate: currentData.lastReviewDate || new Date().toISOString()
        });

        const metrics = this.#calculateMetrics(newData, quality);

        return { data: newData, metrics };
    }

    /** @private */
    #processQuality(quality, repetition, interval, easeFactor, config) {
        switch (quality) {
            case ReviewQuality.AGAIN:
                return {
                    newInterval: 1,
                    newRepetition: 0,
                    newEaseFactor: Math.max(DEFAULTS.MIN_EASE_FACTOR, easeFactor - (config.easePenalty || DEFAULTS.EASE_PENALTY))
                };
            case ReviewQuality.HARD:
                return {
                    newInterval: Math.max(1, Math.round(interval * (config.hardMultiplier || DEFAULTS.HARD_MULTIPLIER))),
                    newRepetition: repetition + 1,
                    newEaseFactor: Math.max(DEFAULTS.MIN_EASE_FACTOR, easeFactor - (config.hardPenalty || DEFAULTS.HARD_PENALTY))
                };
            case ReviewQuality.GOOD:
                let newInterval;
                if (repetition === 0) newInterval = 1;
                else if (repetition === 1) newInterval = 6;
                else newInterval = Math.round(interval * easeFactor);
                
                return {
                    newInterval,
                    newRepetition: repetition + 1,
                    newEaseFactor: easeFactor
                };
            case ReviewQuality.EASY:
                const easyInterval = repetition === 0 
                    ? 4 
                    : Math.round(interval * easeFactor * (config.easyMultiplier || DEFAULTS.EASY_MULTIPLIER));
                return {
                    newInterval: easyInterval,
                    newRepetition: repetition + 1,
                    newEaseFactor: Math.min(DEFAULTS.MAX_EASE_FACTOR, easeFactor + (config.easeBonus || DEFAULTS.EASE_BONUS))
                };
            default:
                throw new Error(`Invalid quality for Anki: ${quality}`);
        }
    }

    /** @private */
    #applyFuzzing(interval, fuzzRange) {
        const range = Math.max(1, Math.floor(interval * fuzzRange));
        const offset = Math.floor(Math.random() * (range * 2 + 1)) - range;
        return Math.max(1, interval + offset);
    }

    /** @private */
    #calculateMetrics(data, quality) {
        const retention = Math.exp(-data.interval / (data.easeFactor * DEFAULTS.RETENTION_FACTOR));
        const stability = data.interval * data.easeFactor;
        const lapseRate = data.reviewHistory.length > 0
            ? data.reviewHistory.filter(q => q < 3).length / data.reviewHistory.length
            : 0.5;
        const difficulty = Math.min(1, lapseRate * 1.5);
        const averageQuality = data.reviewHistory.length > 0
            ? data.reviewHistory.reduce((a, b) => a + b, 0) / data.reviewHistory.length
            : 0;
        const streak = this.#calculateStreak(data.reviewHistory);

        return Object.freeze({
            retention: Number(retention.toFixed(3)),
            stability: Number(stability.toFixed(1)),
            difficulty: Number(difficulty.toFixed(2)),
            averageQuality: Number(averageQuality.toFixed(2)),
            streak
        });
    }

    /** @private */
    #calculateStreak(history) {
        let streak = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i] >= 2) streak++;
            else break;
        }
        return streak;
    }
}

/** @implements {IStrategy} */
class FSRSStrategy extends IStrategy {
    get name() { return 'FSRS'; }

    /**
     * @param {number} quality
     * @param {SRSData} currentData
     * @param {SRSConfig} config
     * @returns {SRSResult}
     */
    calculate(quality, currentData, config) {
        const { repetition = 0, interval = 0, lapses = 0, reviewHistory = [] } = currentData;

        // Calculate difficulty from history
        const avgQuality = reviewHistory.length > 0 
            ? reviewHistory.reduce((a, b) => a + b, 0) / reviewHistory.length 
            : 3;
        const difficulty = Math.max(0, Math.min(1, 1 - (avgQuality / 5)));

        // Calculate stability
        let stability;
        if (repetition === 0) {
            stability = FSRS_CONSTANTS.W0;
        } else {
            stability = interval * Math.pow(1 + FSRS_CONSTANTS.DECAY, -repetition);
        }

        // Update based on quality
        const { newStability, newDifficulty } = quality >= 3
            ? {
                newStability: stability * (1 + (quality / 5) * FSRS_CONSTANTS.W1),
                newDifficulty: Math.max(0, difficulty - FSRS_CONSTANTS.DIFFICULTY_DECAY)
              }
            : {
                newStability: stability * (config.againMultiplier || DEFAULTS.AGAIN_MULTIPLIER),
                newDifficulty: Math.min(1, difficulty + FSRS_CONSTANTS.DIFFICULTY_INCREASE)
              };

        // Calculate new interval
        let newInterval = Math.round(newStability * FSRS_CONSTANTS.STABILITY_MULTIPLIER);
        if (repetition === 0) newInterval = 1;

        // Convert stability to ease factor for compatibility
        const newEaseFactor = Math.max(DEFAULTS.MIN_EASE_FACTOR, 
                                      Math.min(DEFAULTS.MAX_EASE_FACTOR, newStability * 2));

        const newData = Object.freeze({
            repetition: repetition + 1,
            easeFactor: Number(newEaseFactor.toFixed(2)),
            interval: Math.min(newInterval, config.maxInterval),
            lapses: quality < 3 ? lapses + 1 : lapses,
            lastDuration: currentData.lastDuration || 0,
            reviewHistory: Object.freeze([...reviewHistory, quality].slice(-DEFAULTS.MAX_HISTORY_LENGTH)),
            lastReviewDate: currentData.lastReviewDate || new Date().toISOString()
        });

        const metrics = {
            retention: Math.exp(-interval / (stability * FSRS_CONSTANTS.STABILITY_MULTIPLIER)),
            stability: newStability,
            difficulty: newDifficulty,
            averageQuality: avgQuality,
            streak: this.#calculateStreak(reviewHistory)
        };

        return { data: newData, metrics };
    }

    /** @private */
    #calculateStreak(history) {
        let streak = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i] >= 3) streak++;
            else break;
        }
        return streak;
    }
}

// ============== Validators ==============

/** @type {Readonly<Record<string, import('./types').ValidationRule>>} */
const VALIDATORS = Object.freeze({
    quality: {
        validate: (q) => Number.isInteger(q) && q >= 0 && q <= 5,
        code: ErrorCode.INVALID_QUALITY,
        message: 'Quality must be integer between 0 and 5'
    },
    repetition: {
        validate: (r) => r === undefined || (Number.isInteger(r) && r >= 0),
        code: ErrorCode.INVALID_REPETITION,
        message: 'Repetition must be non-negative integer'
    },
    easeFactor: {
        validate: (e) => e === undefined || (typeof e === 'number' && e >= DEFAULTS.MIN_EASE_FACTOR && e <= DEFAULTS.MAX_EASE_FACTOR),
        code: ErrorCode.INVALID_EASE_FACTOR,
        message: `Ease factor must be between ${DEFAULTS.MIN_EASE_FACTOR} and ${DEFAULTS.MAX_EASE_FACTOR}`
    },
    interval: {
        validate: (i) => i === undefined || (typeof i === 'number' && i >= 0 && i <= DEFAULTS.MAX_INTERVAL),
        code: ErrorCode.INVALID_INTERVAL,
        message: `Interval must be between 0 and ${DEFAULTS.MAX_INTERVAL}`
    }
});

// ============== Cache Implementation ==============

/**
 * @template K, V
 * @class LRUCache
 */
class LRUCache {
    /** @type {Map<K, V>} */
    #cache;
    /** @type {number} */
    #maxSize;

    /**
     * @param {number} maxSize
     */
    constructor(maxSize) {
        this.#cache = new Map();
        this.#maxSize = maxSize;
    }

    /**
     * @param {K} key
     * @returns {V | undefined}
     */
    get(key) {
        const item = this.#cache.get(key);
        if (item !== undefined) {
            // Refresh item (move to end)
            this.#cache.delete(key);
            this.#cache.set(key, item);
        }
        return item;
    }

    /**
     * @param {K} key
     * @param {V} value
     */
    set(key, value) {
        if (this.#cache.size >= this.#maxSize) {
            // Remove oldest (first item)
            const firstKey = this.#cache.keys().next().value;
            this.#cache.delete(firstKey);
        }
        this.#cache.set(key, value);
    }

    /**
     * @param {K} key
     * @returns {boolean}
     */
    has(key) {
        return this.#cache.has(key);
    }

    clear() {
        this.#cache.clear();
    }

    /** @returns {number} */
    get size() {
        return this.#cache.size;
    }

    /** @returns {[K, V][]} */
    entries() {
        return Array.from(this.#cache.entries());
    }
}

// ============== Result Factory ==============

export const Result = Object.freeze({
    /**
     * @param {SRSResult} data
     * @returns {SuccessResult}
     */
    ok: (data) => ({ success: true, data }),

    /**
     * @param {ErrorCode} code
     * @param {string} message
     * @param {string} [stack]
     * @returns {ErrorResult}
     */
    fail: (code, message, stack = '') => ({ 
        success: false, 
        code, 
        message,
        stack: stack || new Error().stack 
    })
});

// ============== Main Engine Class ==============

/**
 * موتور اصلی SRS با معماری استراتژی
 * @class SRSEngine
 */
export class SRSEngine {
    /** @type {Readonly<SRSConfig>} */
    #config;
    
    /** @type {Map<AlgorithmType, IStrategy>} */
    #strategies;
    
    /** @type {IStrategy} */
    #currentStrategy;
    
    /** @type {LRUCache<string, SRSResult>} */
    #cache;
    
    /** @type {() => Date} */
    #timeProvider;
    
    /** @type {Object} */
    #metrics;
    
    /** @type {EventBus} */
    #eventBus;
    
    /** @type {Array<import('./types').Middleware>} */
    #middlewares;
    
    /** @type {Map<string, any>} */
    #plugins;

    /**
     * @param {Partial<SRSConfig>} config
     * @param {() => Date} [timeProvider]
     */
    constructor(config = {}, timeProvider = () => new Date()) {
        this.#config = this.#mergeConfig(config);
        this.#timeProvider = timeProvider;
        this.#strategies = this.#initStrategies();
        this.#currentStrategy = this.#getStrategy(this.#config.algorithm);
        this.#cache = new LRUCache(this.#config.cacheSize || DEFAULTS.CACHE_MAX_SIZE);
        this.#metrics = this.#initMetrics();
        this.#eventBus = new EventBus();
        this.#middlewares = [];
        this.#plugins = new Map();
        
        this.#emit(EventType.ENGINE_INITIALIZED, { 
            algorithm: this.#config.algorithm,
            version: VERSION 
        });
    }

    // ============== Public API ==============

    /**
     * محاسبه داده‌های جدید SRS
     * @param {number} quality
     * @param {SRSData} currentData
     * @returns {Result}
     */
    calculate(quality, currentData) {
        const startTime = performance.now();
        
        try {
            // 1. Validation
            const validation = this.#validate(quality, currentData);
            if (!validation.success) {
                this.#emit(EventType.ERROR, validation);
                return validation;
            }

            // 2. Create context for middleware
            let context = {
                quality,
                currentData,
                config: this.#config,
                extra: { startTime }
            };

            // 3. Pre-processing middleware
            for (const mw of this.#middlewares) {
                if (mw.before) {
                    try {
                        context = mw.before(context);
                    } catch (error) {
                        this.#emit(EventType.MIDDLEWARE_ERROR, { middleware: mw.name, error });
                    }
                }
            }

            // 4. Cache check
            const cacheKey = this.#generateCacheKey(context.quality, context.currentData);
            const cached = this.#cache.get(cacheKey);
            if (cached) {
                this.#emit(EventType.CACHE_HIT, { cacheKey });
                return Result.ok(cached);
            }

            // 5. Execute strategy
            const result = this.#currentStrategy.calculate(
                context.quality, 
                context.currentData, 
                context.config
            );
            
            // 6. Post-processing middleware
            let finalResult = result;
            for (const mw of this.#middlewares) {
                if (mw.after) {
                    try {
                        finalResult = mw.after(finalResult, context);
                    } catch (error) {
                        this.#emit(EventType.MIDDLEWARE_ERROR, { middleware: mw.name, error });
                    }
                }
            }

            // 7. Cache result
            this.#cache.set(cacheKey, finalResult);
            
            // 8. Track metrics
            this.#trackMetrics(quality, finalResult);
            
            // 9. Emit event
            this.#emit(EventType.CARD_REVIEWED, {
                quality,
                result: finalResult,
                duration: performance.now() - startTime,
                algorithm: this.#config.algorithm
            });
            
            return Result.ok(finalResult);
        } catch (error) {
            const errorResult = Result.fail(
                ErrorCode.ALGORITHM_NOT_FOUND,
                error instanceof Error ? error.message : 'Unknown error in strategy execution',
                error instanceof Error ? error.stack : undefined
            );
            
            this.#emit(EventType.ERROR, errorResult);
            return errorResult;
        }
    }

    /**
     * محاسبه دسته‌ای برای چند کارت
     * @param {Array<{quality: number, data: SRSData}>} reviews
     * @param {boolean} parallel
     * @returns {Result[]}
     */
    calculateBatch(reviews, parallel = false) {
        if (parallel) {
            // اجرای موازی با Promise.all
            return Promise.all(reviews.map(r => 
                Promise.resolve().then(() => this.calculate(r.quality, r.data))
            ));
        }
        // اجرای ترتیبی
        return reviews.map(r => this.calculate(r.quality, r.data));
    }

    /**
     * تغییر الگوریتم در حال اجرا
     * @param {AlgorithmType} algorithm
     * @returns {Result}
     */
    switchAlgorithm(algorithm) {
        const strategy = this.#strategies.get(algorithm);
        if (!strategy) {
            return Result.fail(ErrorCode.ALGORITHM_NOT_FOUND, `Algorithm ${algorithm} not found`);
        }
        
        this.#currentStrategy = strategy;
        this.#config = Object.freeze({ ...this.#config, algorithm });
        
        // Clear cache when switching algorithms
        this.#cache.clear();
        
        this.#emit(EventType.ALGORITHM_CHANGED, { algorithm });
        
        return Result.ok({
            data: this.resetCard(),
            metrics: this.#getCurrentMetrics()
        });
    }

    /**
     * ثبت middleware جدید
     * @param {import('./types').Middleware} middleware
     * @returns {SRSEngine} برای chainable API
     */
    use(middleware) {
        if (!middleware.name) {
            middleware.name = `middleware_${this.#middlewares.length}`;
        }
        this.#middlewares.push(middleware);
        return this;
    }

    /**
     * ثبت رویداد
     * @param {string} event
     * @param {EventListener} listener
     * @returns {() => void}
     */
    on(event, listener) {
        return this.#eventBus.on(event, listener);
    }

    /**
     * ثبت پلاگین جدید
     * @param {string} name
     * @param {any} plugin
     * @returns {SRSEngine}
     */
    registerPlugin(name, plugin) {
        this.#plugins.set(name, plugin);
        if (plugin.onRegister) {
            plugin.onRegister(this);
        }
        return this;
    }

    /**
     * دریافت پلاگین
     * @param {string} name
     * @returns {any}
     */
    getPlugin(name) {
        return this.#plugins.get(name);
    }

    /**
     * تطبیق پارامترها با عملکرد کاربر
     * @param {Array<number>} reviewHistory
     * @returns {SRSEngine}
     */
    adaptToUser(reviewHistory) {
        if (reviewHistory.length < DEFAULTS.ADAPTATION_THRESHOLD) {
            return this; // Not enough data
        }

        const avgQuality = reviewHistory.reduce((a, b) => a + b, 0) / reviewHistory.length;
        const failureRate = reviewHistory.filter(q => q < 2).length / reviewHistory.length;
        
        // Adjust parameters based on performance
        const newConfig = { ...this.#config };
        
        if (avgQuality < 2.5) {
            // User struggles - be more generous
            newConfig.easeBonus = (this.#config.easeBonus || DEFAULTS.EASE_BONUS) * 1.2;
            newConfig.easePenalty = (this.#config.easePenalty || DEFAULTS.EASE_PENALTY) * 0.8;
            newConfig.hardPenalty = (this.#config.hardPenalty || DEFAULTS.HARD_PENALTY) * 0.8;
        } else if (avgQuality > 4) {
            // User excels - be more aggressive
            newConfig.easeBonus = (this.#config.easeBonus || DEFAULTS.EASE_BONUS) * 0.8;
            newConfig.maxInterval = Math.min(
                this.#config.maxInterval * 1.2,
                DEFAULTS.MAX_INTERVAL
            );
        }

        // Adjust based on failure rate
        if (failureRate > 0.3) {
            // Too many failures - shorten intervals
            newConfig.againMultiplier = DEFAULTS.AGAIN_MULTIPLIER * 1.2;
        } else if (failureRate < 0.1) {
            // Very few failures - lengthen intervals
            newConfig.againMultiplier = DEFAULTS.AGAIN_MULTIPLIER * 0.8;
        }

        this.#config = Object.freeze(newConfig);
        this.#cache.clear(); // Clear cache with new parameters
        
        this.#emit(EventType.PARAMETERS_ADAPTED, {
            oldConfig: this.#config,
            newConfig,
            avgQuality,
            failureRate
        });

        return this;
    }

    /**
     * محاسبه تاریخ مرور بعدی
     * @param {number} intervalDays
     * @returns {Date}
     */
    getNextReviewDate(intervalDays) {
        const now = this.#timeProvider();
        return new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    }

    /**
     * بررسی نیاز به مرور
     * @param {Object} card
     * @returns {boolean}
     */
    isDue(card) {
        if (!card?.nextReview) return true;
        return new Date(card.nextReview) <= this.#timeProvider();
    }

    /**
     * بازنشانی کارت به حالت اولیه
     * @param {Partial<SRSData>} baseData
     * @returns {SRSData}
     */
    resetCard(baseData = {}) {
        const data = Object.freeze({
            repetition: 0,
            easeFactor: DEFAULTS.DEFAULT_EASE_FACTOR,
            interval: 0,
            lapses: 0,
            lastDuration: 0,
            reviewHistory: [],
            lastReviewDate: this.#timeProvider().toISOString(),
            ...baseData
        });

        this.#emit(EventType.CARD_RESET, { data });
        return data;
    }

    /**
     * تبدیل به JSON برای ذخیره‌سازی
     * @returns {Object}
     */
    toJSON() {
        return {
            __version: VERSION,
            __timestamp: Date.now(),
            config: this.#config,
            metrics: this.#metrics,
            cache: Array.from(this.#cache.entries()),
            strategies: Array.from(this.#strategies.keys()),
            currentStrategy: this.#currentStrategy.name
        };
    }

    /**
     * بازیابی از JSON
     * @param {any} json
     * @param {boolean} migrate
     * @returns {SRSEngine}
     */
    static fromJSON(json, migrate = true) {
        try {
            let data = json;
            
            // Migration if needed
            if (migrate && data.__version && data.__version !== VERSION) {
                data = SRSEngine.#migrate(data, data.__version, VERSION);
            }
            
            const engine = new SRSEngine(data.config);
            
            // Restore metrics
            if (data.metrics) {
                engine.#metrics = data.metrics;
            }
            
            // Restore cache
            if (data.cache) {
                data.cache.forEach(([key, value]) => {
                    engine.#cache.set(key, value);
                });
            }
            
            // Restore strategy
            if (data.currentStrategy && data.currentStrategy !== engine.#currentStrategy.name) {
                const strategy = Array.from(engine.#strategies.entries())
                    .find(([_, s]) => s.name === data.currentStrategy);
                if (strategy) {
                    engine.#currentStrategy = strategy[1];
                }
            }
            
            return engine;
        } catch (error) {
            throw new Error(`Failed to restore SRSEngine: ${error.message}`);
        }
    }

    /**
     * دریافت آمار جاری موتور
     * @returns {Object}
     */
    getMetrics() {
        return {
            ...this.#metrics,
            cacheSize: this.#cache.size,
            algorithm: this.#config.algorithm,
            strategy: this.#currentStrategy.name,
            middlewareCount: this.#middlewares.length,
            pluginCount: this.#plugins.size
        };
    }

    /**
     * دریافت EventBus برای استفاده خارجی
     * @returns {EventBus}
     */
    getEventBus() {
        return this.#eventBus;
    }

    /**
     * پاک کردن کش
     */
    clearCache() {
        this.#cache.clear();
        this.#emit(EventType.CACHE_CLEARED, { timestamp: Date.now() });
    }

    /**
     * دریافت snapshot برای debugging
     * @returns {Object}
     */
    snapshot() {
        return {
            config: this.#config,
            metrics: this.#metrics,
            cache: this.#cache.entries(),
            middleware: this.#middlewares.map(m => m.name),
            plugins: Array.from(this.#plugins.keys()),
            timestamp: Date.now()
        };
    }

    // ============== Private Methods ==============

    /** @private */
    #mergeConfig(config) {
        return Object.freeze({
            algorithm: config.algorithm || AlgorithmType.SM2,
            maxInterval: config.maxInterval || DEFAULTS.MAX_INTERVAL,
            enableFuzzing: config.enableFuzzing || false,
            fuzzRange: config.fuzzRange || 0.05,
            enableTelemetry: config.enableTelemetry || false,
            cacheSize: config.cacheSize || DEFAULTS.CACHE_MAX_SIZE,
            easeBonus: config.easeBonus || DEFAULTS.EASE_BONUS,
            easePenalty: config.easePenalty || DEFAULTS.EASE_PENALTY,
            hardPenalty: config.hardPenalty || DEFAULTS.HARD_PENALTY,
            againMultiplier: config.againMultiplier || DEFAULTS.AGAIN_MULTIPLIER,
            hardMultiplier: config.hardMultiplier || DEFAULTS.HARD_MULTIPLIER,
            goodMultiplier: config.goodMultiplier || DEFAULTS.GOOD_MULTIPLIER,
            easyMultiplier: config.easyMultiplier || DEFAULTS.EASY_MULTIPLIER
        });
    }

    /** @private */
    #initStrategies() {
        const strategies = new Map();
        strategies.set(AlgorithmType.SM2, new SM2Strategy());
        strategies.set(AlgorithmType.ANKI, new AnkiStrategy());
        strategies.set(AlgorithmType.FSRS, new FSRSStrategy());
        return strategies;
    }

    /** @private */
    #getStrategy(algorithm) {
        const strategy = this.#strategies.get(algorithm);
        if (!strategy) {
            throw new Error(`Strategy not found for algorithm: ${algorithm}`);
        }
        return strategy;
    }

    /** @private */
    #initMetrics() {
        return {
            totalReviews: 0,
            qualityDistribution: [0, 0, 0, 0, 0, 0],
            averageEase: DEFAULTS.DEFAULT_EASE_FACTOR,
            averageInterval: 0,
            lastReset: this.#timeProvider().toISOString(),
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    /** @private */
    #validate(quality, data) {
        // Validate quality
        if (!VALIDATORS.quality.validate(quality)) {
            return Result.fail(VALIDATORS.quality.code, VALIDATORS.quality.message);
        }

        // Validate data object
        if (!data || typeof data !== 'object') {
            return Result.fail(ErrorCode.INVALID_DATA, 'Current data must be an object');
        }

        // Validate each field if present
        if (data.repetition !== undefined && !VALIDATORS.repetition.validate(data.repetition)) {
            return Result.fail(VALIDATORS.repetition.code, VALIDATORS.repetition.message);
        }

        if (data.easeFactor !== undefined && !VALIDATORS.easeFactor.validate(data.easeFactor)) {
            return Result.fail(VALIDATORS.easeFactor.code, VALIDATORS.easeFactor.message);
        }

        if (data.interval !== undefined && !VALIDATORS.interval.validate(data.interval)) {
            return Result.fail(VALIDATORS.interval.code, VALIDATORS.interval.message);
        }

        return Result.ok({ data: null }); // Dummy success
    }

    /** @private */
    #generateCacheKey(quality, data) {
        return `${quality}_${data.repetition}_${data.easeFactor}_${data.interval}`;
    }

    /** @private */
    #trackMetrics(quality, result) {
        if (!this.#config.enableTelemetry) return;

        this.#metrics.totalReviews++;
        this.#metrics.qualityDistribution[quality]++;
        
        // Update moving average of ease factor
        const total = this.#metrics.totalReviews;
        const currentAvg = this.#metrics.averageEase;
        const newEase = result.data.easeFactor;
        this.#metrics.averageEase = (currentAvg * (total - 1) + newEase) / total;
        
        // Update average interval
        const currentIntervalAvg = this.#metrics.averageInterval;
        const newInterval = result.data.interval;
        this.#metrics.averageInterval = (currentIntervalAvg * (total - 1) + newInterval) / total;
        
        // Cache stats
        if (this.#cache.size > 0) {
            this.#metrics.cacheHits++;
        } else {
            this.#metrics.cacheMisses++;
        }
    }

    /** @private */
    #getCurrentMetrics() {
        const cacheEfficiency = this.#metrics.totalReviews > 0 
            ? (this.#metrics.cacheHits / this.#metrics.totalReviews * 100).toFixed(1)
            : 0;
            
        return {
            totalReviews: this.#metrics.totalReviews,
            averageEase: Number(this.#metrics.averageEase.toFixed(2)),
            averageInterval: Math.round(this.#metrics.averageInterval),
            cacheEfficiency: Number(cacheEfficiency),
            qualityDistribution: this.#metrics.qualityDistribution
        };
    }

    /** @private */
    #emit(event, data) {
        this.#eventBus.emit(event, data);
    }

    /** @private */
    static #migrate(data, fromVersion, toVersion) {
        let migrated = { ...data };
        
        // Migration path: 1.0.0 -> 2.0.0
        if (fromVersion === '1.0.0' && toVersion >= '2.0.0') {
            migrated = SRSEngine.#migrateV1ToV2(migrated);
            fromVersion = '2.0.0';
        }
        
        // Migration path: 2.0.0 -> 3.0.0
        if (fromVersion === '2.0.0' && toVersion >= '3.0.0') {
            migrated = SRSEngine.#migrateV2ToV3(migrated);
            fromVersion = '3.0.0';
        }
        
        migrated.__version = toVersion;
        migrated.__migrated = true;
        
        return migrated;
    }

    /** @private */
    static #migrateV1ToV2(data) {
        return {
            ...data,
            __version: '2.0.0',
            metrics: data.metrics || {
                totalReviews: 0,
                qualityDistribution: [0, 0, 0, 0, 0, 0],
                averageEase: DEFAULTS.DEFAULT_EASE_FACTOR
            }
        };
    }

    /** @private */
    static #migrateV2ToV3(data) {
        return {
            ...data,
            __version: '3.0.0',
            config: {
                ...data.config,
                easeBonus: DEFAULTS.EASE_BONUS,
                easePenalty: DEFAULTS.EASE_PENALTY,
                hardPenalty: DEFAULTS.HARD_PENALTY
            }
        };
    }
}

// ============== Factory Functions ==============

/**
 * ایجاد نمونه از موتور SRS
 * @param {Partial<SRSConfig>} config
 * @param {() => Date} [timeProvider]
 * @returns {SRSEngine}
 */
export function create_srs_engine(config = {}, timeProvider) {
    return new SRSEngine(config, timeProvider);
}

/**
 * محاسبه آمار کلی برای مجموعه کارت‌ها
 * @param {Array<SRSData & { nextReview?: Date | string }>} cards
 * @param {Date} [now]
 * @returns {Object}
 */
export function calculate_deck_stats(cards, now = new Date()) {
    if (!cards?.length) {
        return {
            totalCards: 0,
            dueCards: 0,
            averageEase: 0,
            averageInterval: 0,
            retention: 0,
            cardsByEase: { low: 0, medium: 0, high: 0 },
            learningRate: 0
        };
    }

    let dueCount = 0;
    let totalEase = 0;
    let totalInterval = 0;
    const easeDistribution = { low: 0, medium: 0, high: 0 };
    let matureCards = 0;

    cards.forEach(card => {
        // Due count
        if (card.nextReview && new Date(card.nextReview) <= now) {
            dueCount++;
        }

        // Ease distribution
        const ease = card.easeFactor || DEFAULTS.DEFAULT_EASE_FACTOR;
        totalEase += ease;
        
        if (ease < 2.0) easeDistribution.low++;
        else if (ease < 3.0) easeDistribution.medium++;
        else easeDistribution.high++;

        totalInterval += card.interval || 0;
        
        // Mature cards (interval > 21 days)
        if (card.interval > 21) matureCards++;
    });

    const avgInterval = totalInterval / cards.length;
    const avgEase = totalEase / cards.length;
    const retention = Math.exp(-avgInterval / (avgEase * DEFAULTS.RETENTION_FACTOR));
    const learningRate = cards.length > 0 ? matureCards / cards.length : 0;

    return Object.freeze({
        totalCards: cards.length,
        dueCards: dueCount,
        averageEase: Number(avgEase.toFixed(2)),
        averageInterval: Math.round(avgInterval),
        retention: Number(retention.toFixed(3)),
        cardsByEase: easeDistribution,
        learningRate: Number(learningRate.toFixed(2))
    });
}

// ============== Browser Global Export ==============

if (typeof window !== 'undefined') {
    window.FarsinglishSRS = {
        SRSEngine,
        create_srs_engine,
        calculate_deck_stats,
        ReviewQuality,
        AlgorithmType,
        ErrorCode,
        EventType,
        DEFAULTS,
        VERSION,
        CHANGELOG
    };
}

// ============== Named Exports ==============
export default SRSEngine;
export { 
    SM2Strategy,
    AnkiStrategy,
    FSRSStrategy,
    EventBus,
    LRUCache
};
