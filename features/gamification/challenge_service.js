/**
 * @fileoverview سرویس مدیریت چالش‌های روزانه و هفتگی
 * @author Farsinglish Team
 * @version 2.0.0
 */

import { Repository } from '../../core/data/repository.js';
import { Logger } from '../../core/utils/logger.js';
import { StateManager } from '../../core/state/state_manager.js';
import { EventEmitter } from '../../core/utils/event_emitter.js';

/**
 * @typedef {Object} ChallengeConfig
 * @property {number} dailyLimit - حداکثر تعداد چالش روزانه
 * @property {number} weeklyLimit - حداکثر تعداد چالش هفتگی
 * @property {Object} rewards - پاداش‌های پایه
 * @property {number} rewards.basePoints - امتیاز پایه هر چالش
 * @property {number} rewards.bonusPoints - امتیاز اضافی برای چالش‌های ویژه
 */

/**
 * @typedef {Object} ChallengeFilters
 * @property {boolean} [active] - چالش‌های فعال
 * @property {boolean} [completed] - چالش‌های تکمیل شده
 * @property {string} [type] - نوع چالش (daily/weekly/special)
 * @property {Date} [fromDate] - از تاریخ
 * @property {Date} [toDate] - تا تاریخ
 */

/**
 * @typedef {Object} Result
 * @property {boolean} success
 * @property {*} [data]
 * @property {string} [error]
 * @property {number} timestamp
 */

/**
 * کلاس سرویس چالش‌ها با معماری حرفه‌ای
 */
export class ChallengeService {
    /** @type {ChallengeService} */
    static #instance;

    /** @type {Repository} */
    #repository;

    /** @type {Logger} */
    #logger;

    /** @type {StateManager} */
    #stateManager;

    /** @type {EventEmitter} */
    #events;

    /** @type {ChallengeConfig} */
    #config;

    /** @type {Map<string, {data: *, timestamp: number}>} */
    #cache = new Map();

    /** @type {number} */
    #cacheTTL = 5 * 60 * 1000; // 5 دقیقه

    /** @type {Map<string, AbortController>} */
    #activeRequests = new Map();

    /**
     * @param {Repository} repository
     * @param {Logger} logger
     * @param {StateManager} stateManager
     * @param {EventEmitter} events
     * @param {ChallengeConfig} config
     */
    constructor(repository, logger, stateManager, events, config) {
        if (ChallengeService.#instance) {
            return ChallengeService.#instance;
        }

        this.#repository = repository;
        this.#logger = logger;
        this.#stateManager = stateManager;
        this.#events = events;
        this.#config = this.#validateConfig(config);

        ChallengeService.#instance = this;
        this.#logger.info('ChallengeService initialized', { config: this.#config });
    }

    // ================ متدهای خصوصی (Validation) ================

    /**
     * @param {ChallengeConfig} config
     * @returns {ChallengeConfig}
     */
    #validateConfig(config) {
        const defaultConfig = {
            dailyLimit: 3,
            weeklyLimit: 10,
            rewards: { basePoints: 10, bonusPoints: 25 }
        };

        if (!config || typeof config !== 'object') return defaultConfig;

        try {
            return {
                dailyLimit: config.dailyLimit > 0 ? config.dailyLimit : defaultConfig.dailyLimit,
                weeklyLimit: config.weeklyLimit > 0 ? config.weeklyLimit : defaultConfig.weeklyLimit,
                rewards: {
                    basePoints: config.rewards?.basePoints > 0 ? config.rewards.basePoints : defaultConfig.rewards.basePoints,
                    bonusPoints: config.rewards?.bonusPoints > 0 ? config.rewards.bonusPoints : defaultConfig.rewards.bonusPoints
                }
            };
        } catch {
            return defaultConfig;
        }
    }

    /**
     * @param {*} input
     * @param {string} field
     * @returns {{success: boolean, error?: string}}
     */
    #validateRequired(input, field) {
        if (!input || typeof input !== 'object') {
            return { success: false, error: 'ورودی نامعتبر است' };
        }
        if (!input[field]) {
            return { success: false, error: `فیلد ${field} الزامی است` };
        }
        return { success: true };
    }

    /**
     * @param {string} userId
     * @returns {{success: boolean, error?: string}}
     */
    #validateUserId(userId) {
        if (!userId || typeof userId !== 'string') {
            return { success: false, error: 'شناسه کاربر معتبر نیست' };
        }
        if (userId.length < 5) {
            return { success: false, error: 'شناسه کاربر باید حداقل ۵ کاراکتر باشد' };
        }
        return { success: true };
    }

    /**
     * @param {number} progress
     * @returns {{success: boolean, error?: string}}
     */
    #validateProgress(progress) {
        if (typeof progress !== 'number' || isNaN(progress)) {
            return { success: false, error: 'پیشرفت باید عدد باشد' };
        }
        if (progress < 0) {
            return { success: false, error: 'پیشرفت نمی‌تواند منفی باشد' };
        }
        return { success: true };
    }

    // ================ متدهای خصوصی (Result) ================

    /**
     * @template T
     * @param {T} data
     * @returns {Result}
     */
    #success(data) {
        return {
            success: true,
            data,
            timestamp: Date.now()
        };
    }

    /**
     * @param {string} error
     * @param {*} [details]
     * @returns {Result}
     */
    #failure(error, details) {
        this.#logger.error(error, { details });
        return {
            success: false,
            error,
            timestamp: Date.now()
        };
    }

    /**
     * @template T
     * @param {Promise<T>} promise
     * @param {string} errorMessage
     * @returns {Promise<Result>}
     */
    async #tryCatch(promise, errorMessage) {
        try {
            const data = await promise;
            return this.#success(data);
        } catch (error) {
            return this.#failure(errorMessage || error.message, { originalError: error });
        }
    }

    // ================ متدهای خصوصی (Cache) ================

    /**
     * @param {string} key
     * @returns {*}
     */
    #getCached(key) {
        const cached = this.#cache.get(key);
        if (!cached) return null;

        const isExpired = Date.now() - cached.timestamp > this.#cacheTTL;
        if (isExpired) {
            this.#cache.delete(key);
            return null;
        }

        return cached.data;
    }

    /**
     * @param {string} key
     * @param {*} data
     */
    #setCached(key, data) {
        this.#cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * @param {string} pattern
     */
    #invalidateCache(pattern) {
        const regex = new RegExp(pattern);
        for (const key of this.#cache.keys()) {
            if (regex.test(key)) {
                this.#cache.delete(key);
            }
        }
        this.#logger.debug('Cache invalidated', { pattern });
    }

    // ================ متدهای خصوصی (Request) ================

    /**
     * @param {string} requestId
     * @returns {AbortSignal}
     */
    #createAbortSignal(requestId) {
        const controller = new AbortController();
        this.#activeRequests.set(requestId, controller);
        return controller.signal;
    }

    /**
     * @param {string} requestId
     */
    #cleanupRequest(requestId) {
        this.#activeRequests.delete(requestId);
    }

    /**
     * لغو همه درخواست‌ها
     */
    abortAllRequests() {
        this.#activeRequests.forEach(controller => controller.abort());
        this.#activeRequests.clear();
        this.#logger.info('All requests aborted');
    }

    // ================ متدهای اصلی (Core Logic) ================

    /**
     * دریافت چالش‌های کاربر
     * @param {string} userId
     * @param {ChallengeFilters} [filters]
     * @returns {Promise<Result>}
     */
    async getUserChallenges(userId, filters = {}) {
        // 1. Validation
        const userValidation = this.#validateUserId(userId);
        if (!userValidation.success) {
            return this.#failure(userValidation.error);
        }

        const requestId = `getChallenges-${userId}`;

        // 2. Cache Check
        const cacheKey = `challenges-${userId}-${JSON.stringify(filters)}`;
        const cached = this.#getCached(cacheKey);
        if (cached) {
            this.#logger.debug('Returning cached challenges', { userId });
            return this.#success(cached);
        }

        // 3. Request with AbortController
        const signal = this.#createAbortSignal(requestId);

        try {
            // 4. Fetch Data
            const result = await this.#tryCatch(
                this.#repository.findByUserId(userId, {
                    collection: 'challenges',
                    signal
                }),
                'خطا در دریافت چالش‌ها'
            );

            if (!result.success) {
                return result;
            }

            let challenges = result.data || [];

            // 5. Generate initial challenges if empty
            if (challenges.length === 0) {
                const generated = await this.#generateInitialChallenges(userId);
                if (!generated.success) {
                    return generated;
                }
                challenges = generated.data;
            }

            // 6. Apply filters
            const filtered = this.#applyFilters(challenges, filters);

            // 7. Cache the result
            this.#setCached(cacheKey, filtered);

            // 8. Update state
            this.#stateManager.dispatch({
                type: 'CHALLENGES_LOADED',
                payload: { userId, challenges: filtered }
            });

            return this.#success(filtered);
        } catch (error) {
            if (error.name === 'AbortError') {
                return this.#failure('درخواست لغو شد', { requestId });
            }
            return this.#failure(error.message);
        } finally {
            this.#cleanupRequest(requestId);
        }
    }

    /**
     * اعمال فیلترها
     * @param {Array} challenges
     * @param {ChallengeFilters} filters
     * @returns {Array}
     */
    #applyFilters(challenges, filters) {
        return challenges.filter(challenge => {
            if (filters.active !== undefined && challenge.isActive !== filters.active) return false;
            if (filters.completed !== undefined && challenge.isCompleted !== filters.completed) return false;
            if (filters.type && challenge.type !== filters.type) return false;
            if (filters.fromDate && new Date(challenge.createdAt) < filters.fromDate) return false;
            if (filters.toDate && new Date(challenge.createdAt) > filters.toDate) return false;
            return true;
        });
    }

    /**
     * تولید چالش‌های اولیه
     * @param {string} userId
     * @returns {Promise<Result>}
     */
    async #generateInitialChallenges(userId) {
        const today = new Date();
        const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        const initialChallenges = [
            {
                id: crypto.randomUUID(),
                userId,
                title: 'اولین درس امروز',
                description: 'یک درس را امروز کامل کن',
                type: 'daily',
                goal: 1,
                progress: 0,
                points: this.#config.rewards.basePoints,
                startDate: today,
                endDate: today,
                isActive: true,
                isCompleted: false,
                createdAt: today,
                updatedAt: today
            },
            {
                id: crypto.randomUUID(),
                userId,
                title: 'مرور منظم',
                description: 'سه درس را امروز مرور کن',
                type: 'daily',
                goal: 3,
                progress: 0,
                points: this.#config.rewards.basePoints * 1.5,
                startDate: today,
                endDate: today,
                isActive: true,
                isCompleted: false,
                createdAt: today,
                updatedAt: today
            },
            {
                id: crypto.randomUUID(),
                userId,
                title: 'ستاره هفته',
                description: '۱۰ درس را این هفته کامل کن',
                type: 'weekly',
                goal: 10,
                progress: 0,
                points: this.#config.rewards.bonusPoints,
                startDate: today,
                endDate: weekFromNow,
                isActive: true,
                isCompleted: false,
                createdAt: today,
                updatedAt: today
            }
        ];

        try {
            await this.#repository.bulkCreate('challenges', initialChallenges);
            
            this.#logger.info('Initial challenges generated', { 
                userId, 
                count: initialChallenges.length 
            });

            this.#events.emit('challenges:generated', { userId, challenges: initialChallenges });

            return this.#success(initialChallenges);
        } catch (error) {
            return this.#failure('خطا در تولید چالش‌های اولیه', { originalError: error.message });
        }
    }

    /**
     * به‌روزرسانی پیشرفت چالش
     * @param {string} challengeId
     * @param {number} progress
     * @returns {Promise<Result>}
     */
    async updateProgress(challengeId, progress) {
        // 1. Validation
        if (!challengeId || typeof challengeId !== 'string') {
            return this.#failure('شناسه چالش معتبر نیست');
        }

        const progressValidation = this.#validateProgress(progress);
        if (!progressValidation.success) {
            return this.#failure(progressValidation.error);
        }

        try {
            // 2. Fetch challenge
            const challengeResult = await this.#tryCatch(
                this.#repository.findById('challenges', challengeId),
                'چالش یافت نشد'
            );

            if (!challengeResult.success) {
                return challengeResult;
            }

            const challenge = challengeResult.data;
            if (!challenge) {
                return this.#failure(`چالش با شناسه ${challengeId} یافت نشد`);
            }

            if (challenge.isCompleted) {
                return this.#failure('این چالش قبلاً تکمیل شده است');
            }

            // 3. Update progress
            const oldProgress = challenge.progress;
            challenge.progress = Math.min(progress, challenge.goal);
            challenge.updatedAt = new Date();

            const isCompleted = challenge.progress >= challenge.goal;

            if (isCompleted && oldProgress < challenge.goal) {
                challenge.isCompleted = true;
                challenge.completedAt = new Date();

                this.#events.emit('challenge:completed', {
                    userId: challenge.userId,
                    challengeId: challenge.id,
                    points: challenge.points
                });

                this.#logger.info('Challenge completed', { 
                    challengeId, 
                    userId: challenge.userId,
                    points: challenge.points 
                });
            }

            // 4. Save to repository
            const updated = await this.#repository.update('challenges', challengeId, challenge);

            // 5. Invalidate cache
            this.#invalidateCache(`challenges-${challenge.userId}`);

            // 6. Update state
            this.#stateManager.dispatch({
                type: 'CHALLENGE_UPDATED',
                payload: { challengeId, progress: updated.progress, isCompleted: updated.isCompleted }
            });

            return this.#success(updated);
        } catch (error) {
            return this.#failure('خطا در به‌روزرسانی چالش', { originalError: error.message });
        }
    }

    /**
     * پاکسازی منابع
     */
    dispose() {
        this.abortAllRequests();
        this.#cache.clear();
        this.#events.removeAllListeners();
        this.#logger.info('ChallengeService disposed');
    }
}

// تابع کمکی برای ایجاد نمونه
export const createChallengeService = (deps = {}) => {
    const repository = deps.repository || new Repository();
    const logger = deps.logger || new Logger();
    const stateManager = deps.stateManager || new StateManager();
    const events = deps.events || new EventEmitter();
    const config = deps.config || {};

    return new ChallengeService(repository, logger, stateManager, events, config);
};
