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

    /**
     * تزریق وابستگی در constructor
     * @param {Object} dependencies
     */
    constructor(dependencies = {}) {
        this.#streak_repository = dependencies.streak_repository;
        this.#logger = dependencies.logger || logger;
        this.#state_manager = dependencies.state_manager || state_manager;
        this.#config = STREAK_CONFIG;
    }

    /**
     * بررسی Eligibility فریز
     * @private
     */
    is_freeze_eligible(streak_data) {
        return streak_data.freeze_count > 0 && 
               streak_data.current_streak >= this.#config.streak_required_for_freeze;
    }

    /**
     * بررسی و به‌روزرسانی استریک کاربر
     * @param {string} user_id
     * @returns {Promise<StreakDTO>}
     */
    async update_streak(user_id) {
        if (!user_id?.trim()) {
            this.#logger.error('update_streak: user_id is required');
            throw new Error('user_id is required');
        }

        try {
            const streak_data = await this.#streak_repository.get_by_user_id(user_id);
            
            if (!streak_data) {
                return await this.#create_initial_streak(user_id);
            }

            const today = this.#get_today_date();
            const updated_streak = this.#calculate_streak(streak_data, today);
            
            const saved_streak = await this.#streak_repository.save(updated_streak);
            this.#update_streak_state(saved_streak);
            
            return new StreakDTO(saved_streak);
            
        } catch (error) {
            this.#logger.error('Failed to update streak', { user_id, error: error.message });
            throw new Error(`Streak update failed: ${error.message}`);
        }
    }

    /**
     * ایجاد استریک اولیه برای کاربر جدید
     * @private
     */
    async #create_initial_streak(user_id) {
        const initial_streak = {
            user_id,
            current_streak: 0,
            longest_streak: 0,
            last_activity_date: this.#get_today_date(),
            is_frozen: false,
            freeze_count: this.#config.max_freeze_per_month,
            version: 2
        };

        const saved = await this.#streak_repository.save(initial_streak);
        return new StreakDTO(saved);
    }

    /**
     * محاسبه استریک بر اساس آخرین فعالیت
     * @private
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
        
        return this.#migrate_if_needed(new_streak);
    }

    /**
     * مدیریت شکست استریک
     * @private
     */
    #handle_streak_break(streak_data, today) {
        if (this.is_freeze_eligible(streak_data)) {
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
     * دریافت استریک کاربر
     * @param {string} user_id
     * @returns {Promise<StreakDTO|null>}
     */
    async get_streak(user_id) {
        if (!user_id?.trim()) return null;

        try {
            const data = await this.#streak_repository.get_by_user_id(user_id);
            return data ? new StreakDTO(data) : null;
        } catch (error) {
            this.#logger.error('Failed to get streak', { user_id, error: error.message });
            return null;
        }
    }

    /**
     * بررسی فعالیت امروز
     * @param {string} user_id
     * @returns {Promise<boolean>}
     */
    async has_activity_today(user_id) {
        const streak = await this.get_streak(user_id);
        return streak?.last_activity_date === this.#get_today_date();
    }

    /**
     * دریافت زمان باقیمانده
     * @param {string} user_id
     * @returns {Promise<number>}
     */
    async get_remaining_grace_period(user_id) {
        const streak = await this.get_streak(user_id);
        if (!streak) return 0;

        const last_date = new Date(streak.last_activity_date);
        const current_date = new Date();
        const hours_passed = (current_date - last_date) / (1000 * 60 * 60);

        return Math.max(0, this.#config.grace_hours - hours_passed);
    }

    /**
     * ریست استریک
     * @param {string} user_id
     * @returns {Promise<StreakDTO>}
     */
    async reset_streak(user_id) {
        if (!user_id?.trim()) {
            throw new Error('user_id is required');
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
            this.#update_streak_state(saved);
            this.#logger.info('Streak reset', { user_id });
            
            return new StreakDTO(saved);
            
        } catch (error) {
            this.#logger.error('Failed to reset streak', { user_id, error: error.message });
            throw error;
        }
    }

    /**
     * به‌روزرسانی state
     * @private
     */
    #update_streak_state(streak_data) {
        this.#state_manager.update_state({
            gamification: {
                streak: new StreakDTO(streak_data),
                last_updated: new Date().toISOString()
            }
        });
    }

    /**
     * تاریخ امروز
     * @private
     */
    #get_today_date() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * اختلاف روز
     * @private
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
