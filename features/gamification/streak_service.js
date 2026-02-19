// features/gamification/streak_service.js
// سرویس مدیریت استریک روزانه - رعایت اصول SOLID و معماری لایه‌ای

import { logger } from '../../core/utils/logger.js';
import { state_manager } from '../../core/state/state_manager.js';
import { STREAK_CONFIG } from '../../config/feature-config.js';
import { StreakDTO } from '../../shared/dto/streak.dto.js';

/**
 * @typedef {import('../../core/abstract/streak_repository.abstract.js').StreakRepository} StreakRepository
 * @typedef {import('../../core/utils/logger.js').Logger} Logger
 * @typedef {import('../../core/state/state_manager.js').StateManager} StateManager
 */

/**
 * @template T
 * @typedef {Object} Result
 * @property {boolean} success
 * @property {T|null} data
 * @property {string|null} error
 */

/**
 * @typedef {Object} TimeProvider
 * @property {function(): Date} now
 */

/**
 * @typedef {Object} CacheEntry
 * @property {StreakDTO} data
 * @property {number} expires_at
 */

/**
 * کلاس سرویس استریک - تک‌وظیفگی: مدیریت استریک کاربر
 * وارونگی وابستگی: وابسته به انتزاع repository
 */
export class StreakService {
    /** @type {StreakRepository} */
    #streak_repository;
    
    /** @type {Logger} */
    #logger;
    
    /** @type {StateManager} */
    #state_manager;
    
    /** @type {Object} */
    #config;
    
    /** @type {TimeProvider} */
    #time_provider;
    
    /** @type {Map<string, CacheEntry>} */
    #cache;
    
    /** @type {number} */
    #cache_ttl_ms;

    /**
     * تزریق وابستگی در constructor
     * @param {Object} dependencies
     */
    constructor(dependencies = {}) {
        this.#streak_repository = dependencies.streak_repository;
        this.#logger = dependencies.logger || logger;
        this.#state_manager = dependencies.state_manager || state_manager;
        this.#config = dependencies.config || STREAK_CONFIG;
        this.#time_provider = dependencies.time_provider || { now: () => new Date() };
        this.#cache = new Map();
        this.#cache_ttl_ms = dependencies.cache_ttl_ms || 5 * 60 * 1000; // 5 دقیقه
    }

    /**
     * بررسی Eligibility فریز
     * @private
     * @param {Object} streak_data
     * @returns {boolean}
     */
    #is_freeze_eligible(streak_data) {
        return streak_data.freeze_count > 0 && 
               streak_data.current_streak >= this.#config.streak_required_for_freeze;
    }

    /**
     * بررسی و به‌روزرسانی استریک کاربر
     * @param {string} user_id
     * @returns {Promise<Result<StreakDTO>>}
     */
    async update_streak(user_id) {
        if (!user_id?.trim()) {
            this.#logger.error('update_streak: user_id is required');
            return { success: false, data: null, error: 'user_id is required' };
        }

        try {
            const streak_data = await this.#streak_repository.get_by_user_id(user_id);
            
            if (!streak_data) {
                const initial = await this.#create_initial_streak(user_id);
                return { success: true, data: initial, error: null };
            }

            const today = this.#get_today_date();
            let updated_streak = this.#calculate_streak(streak_data, today);
            
            // مهاجرت خودکار در همه مسیرها
            updated_streak = this.#migrate_if_needed(updated_streak);
            
            const saved_streak = await this.#streak_repository.save(updated_streak);
            
            // به‌روزرسانی کش
            this.#set_cache(user_id, saved_streak);
            
            this.#update_streak_state(saved_streak);
            
            return { success: true, data: new StreakDTO(saved_streak), error: null };
            
        } catch (error) {
            this.#logger.error('Failed to update streak', { user_id, error: error.message });
            return { 
                success: false, 
                data: null, 
                error: `Streak update failed: ${error.message}` 
            };
        }
    }

    /**
     * ایجاد استریک اولیه برای کاربر جدید
     * @private
     * @param {string} user_id
     * @returns {Promise<Object>}
     */
    async #create_initial_streak(user_id) {
        const initial_streak = {
            user_id,
            current_streak: 0,
            longest_streak: 0,
            last_activity_date: this.#get_today_date(),
            is_frozen: false,
            freeze_count: this.#config.max_freeze_per_month,
            freeze_history: [],
            version: 2
        };

        return await this.#streak_repository.save(initial_streak);
    }

    /**
     * محاسبه استریک بر اساس آخرین فعالیت
     * @private
     * @param {Object} streak_data
     * @param {string} today
     * @returns {Object}
     */
    #calculate_streak(streak_data, today) {
        if (streak_data.last_activity_date === today) {
            return streak_data;
        }

        const last_date = new Date(streak_data.last_activity_date);
        const current_date = new Date(today);
        const diff_days = this.#get_date_diff(last_date, current_date);

        if (diff_days === 1) {
            return this.#increment_streak(streak_data, today);
        }

        if (diff_days > 1) {
            return this.#handle_streak_break(streak_data, today);
        }

        return streak_data;
    }

    /**
     * افزایش استریک
     * @private
     * @param {Object} streak_data
     * @param {string} today
     * @returns {Object}
     */
    #increment_streak(streak_data, today) {
        const new_streak = {
            ...streak_data,
            current_streak: streak_data.current_streak + 1,
            last_activity_date: today,
            is_frozen: false
        };
        
        new_streak.longest_streak = Math.max(
            new_streak.current_streak,
            streak_data.longest_streak
        );
        
        return new_streak;
    }

    /**
     * مدیریت شکست استریک
     * @private
     * @param {Object} streak_data
     * @param {string} today
     * @returns {Object}
     */
    #handle_streak_break(streak_data, today) {
        if (this.#is_freeze_eligible(streak_data)) {
            return {
                ...streak_data,
                freeze_count: streak_data.freeze_count - 1,
                is_frozen: true,
                last_activity_date: today,
                freeze_history: [
                    ...(streak_data.freeze_history || []),
                    { date: today, preserved_streak: streak_data.current_streak }
                ]
            };
        }

        return {
            user_id: streak_data.user_id,
            current_streak: 1,
            longest_streak: streak_data.longest_streak,
            last_activity_date: today,
            is_frozen: false,
            freeze_count: this.#config.max_freeze_per_month,
            freeze_history: [],
            version: 2
        };
    }

    /**
     * مهاجرت خودکار داده
     * @private
     * @param {Object} streak_data
     * @returns {Object}
     */
    #migrate_if_needed(streak_data) {
        if (!streak_data.version || streak_data.version < 2) {
            return {
                ...streak_data,
                freeze_history: streak_data.freeze_history || [],
                version: 2
            };
        }
        return streak_data;
    }

    /**
     * دریافت استریک کاربر (با کش)
     * @param {string} user_id
     * @returns {Promise<Result<StreakDTO|null>>}
     */
    async get_streak(user_id) {
        if (!user_id?.trim()) {
            return { success: false, data: null, error: 'user_id is required' };
        }

        // بررسی کش
        const cached = this.#get_cached(user_id);
        if (cached) {
            return { success: true, data: cached, error: null };
        }

        try {
            const data = await this.#streak_repository.get_by_user_id(user_id);
            if (data) {
                const dto = new StreakDTO(data);
                this.#set_cache(user_id, dto);
                return { success: true, data: dto, error: null };
            }
            return { success: true, data: null, error: null };
            
        } catch (error) {
            this.#logger.error('Failed to get streak', { user_id, error: error.message });
            return { success: false, data: null, error: error.message };
        }
    }

    /**
     * بررسی فعالیت امروز
     * @param {string} user_id
     * @returns {Promise<Result<boolean>>}
     */
    async has_activity_today(user_id) {
        const result = await this.get_streak(user_id);
        if (!result.success) {
            return { success: false, data: false, error: result.error };
        }
        
        const has_activity = result.data?.last_activity_date === this.#get_today_date();
        return { success: true, data: has_activity, error: null };
    }

    /**
     * دریافت زمان باقیمانده
     * @param {string} user_id
     * @returns {Promise<Result<number>>}
     */
    async get_remaining_grace_period(user_id) {
        const result = await this.get_streak(user_id);
        if (!result.success) {
            return { success: false, data: 0, error: result.error };
        }
        
        if (!result.data) {
            return { success: true, data: 0, error: null };
        }

        const last_date = new Date(result.data.last_activity_date);
        const current_date = this.#time_provider.now();
        const hours_passed = (current_date - last_date) / (1000 * 60 * 60);

        const remaining = Math.max(0, this.#config.grace_hours - hours_passed);
        return { success: true, data: remaining, error: null };
    }

    /**
     * ریست استریک
     * @param {string} user_id
     * @returns {Promise<Result<StreakDTO>>}
     */
    async reset_streak(user_id) {
        if (!user_id?.trim()) {
            return { success: false, data: null, error: 'user_id is required' };
        }

        try {
            const reset_data = {
                user_id,
                current_streak: 0,
                longest_streak: 0,
                last_activity_date: this.#get_today_date(),
                is_frozen: false,
                freeze_count: this.#config.max_freeze_per_month,
                freeze_history: [],
                version: 2
            };

            const saved = await this.#streak_repository.save(reset_data);
            
            // به‌روزرسانی کش
            this.#set_cache(user_id, saved);
            
            this.#update_streak_state(saved);
            this.#logger.info('Streak reset', { user_id });
            
            return { success: true, data: new StreakDTO(saved), error: null };
            
        } catch (error) {
            this.#logger.error('Failed to reset streak', { user_id, error: error.message });
            return { success: false, data: null, error: error.message };
        }
    }

    /**
     * پاک کردن کش
     * @param {string} user_id
     */
    invalidate_cache(user_id) {
        this.#cache.delete(user_id);
    }

    /**
     * دریافت از کش
     * @private
     * @param {string} user_id
     * @returns {StreakDTO|null}
     */
    #get_cached(user_id) {
        const entry = this.#cache.get(user_id);
        if (!entry) return null;
        
        const now = this.#time_provider.now().getTime();
        if (now > entry.expires_at) {
            this.#cache.delete(user_id);
            return null;
        }
        
        return entry.data;
    }

    /**
     * ذخیره در کش
     * @private
     * @param {string} user_id
     * @param {Object} data
     */
    #set_cache(user_id, data) {
        const expires_at = this.#time_provider.now().getTime() + this.#cache_ttl_ms;
        this.#cache.set(user_id, {
            data: new StreakDTO(data),
            expires_at
        });
    }

    /**
     * به‌روزرسانی state
     * @private
     * @param {Object} streak_data
     */
    #update_streak_state(streak_data) {
        this.#state_manager.update_state({
            gamification: {
                streak: new StreakDTO(streak_data),
                last_updated: this.#time_provider.now().toISOString()
            }
        });
    }

    /**
     * تاریخ امروز
     * @private
     * @returns {string}
     */
    #get_today_date() {
        return this.#time_provider.now().toISOString().split('T')[0];
    }

    /**
     * اختلاف روز
     * @private
     * @param {Date} date1
     * @param {Date} date2
     * @returns {number}
     */
    #get_date_diff(date1, date2) {
        const utc1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
        const utc2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
        return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
    }
}

// نمونه پیش‌فرض
export const streak_service = new StreakService();

// کارخانه برای تست
export const create_streak_service = (dependencies) => new StreakService(dependencies);
