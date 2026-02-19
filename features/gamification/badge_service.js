/**
 * سرویس مدیریت نشان‌ها (Badge Service) - نسخه نهایی
 * مسئولیت: تعریف، اعطا و بازیابی نشان‌های کاربر با قابلیت tracking پیشرفت
 * 
 * اصول رعایت شده:
 * - SOLID (SRP, OCP, DIP, ISP, LSP)
 * - KISS, DRY, YAGNI
 * - State Machine برای چرخه حیات نشان‌ها
 * - Progress Tracking برای نمایش درصد پیشرفت
 * - Retry Mechanism برای خطاهای موقت
 * - Factory Pattern برای ایجاد سرویس
 * - Observer Pattern برای رویدادها
 * - Strategy Pattern برای معیارها (داخلی)
 * - Immutable State
 * - Comprehensive Error Handling
 * - Structured Logging
 */

import { CONFIG } from '../../core/config/app-config.js';
import { logger } from '../../core/utils/logger.js';

// ================ ثابت‌ها و Enumeration ها ================

/**
 * @readonly
 * @enum {string}
 */
export const BADGE_TIERS = {
    BRONZE: 'bronze',
    SILVER: 'silver',
    GOLD: 'gold',
    PLATINUM: 'platinum'
};

/**
 * @readonly
 * @enum {string}
 */
export const BADGE_STATES = {
    LOCKED: 'locked',           // قفل شده
    IN_PROGRESS: 'in_progress', // در حال پیشرفت
    UNLOCKED: 'unlocked',       // باز شده (قابل دریافت)
    CLAIMED: 'claimed'          // دریافت شده
};

/**
 * @readonly
 * @enum {string}
 */
export const BADGE_CRITERIA_TYPES = {
    LOGIN_STREAK: 'login_streak',
    LESSONS_COMPLETED: 'lessons_completed',
    PERFECT_EXERCISES: 'perfect_exercises',
    POINTS_EARNED: 'points_earned',
    TIME_SPENT: 'time_spent',
    BADGES_EARNED: 'badges_earned',
    STREAK_MILESTONE: 'streak_milestone'
};

/**
 * @readonly
 * @enum {string}
 */
export const BADGE_EVENTS = {
    AWARDED: 'badge:awarded',
    PROGRESS_UPDATED: 'badge:progress_updated',
    UNLOCKED: 'badge:unlocked',
    CLAIMED: 'badge:claimed',
    BATCH_AWARDED: 'badges:batch_awarded'
};

// ================ Type Definitions (JSDoc) ================

/**
 * @typedef {Object} Badge
 * @property {string} id - شناسه یکتای نشان
 * @property {string} name - نام نشان
 * @property {string} description - توضیحات نشان
 * @property {string} icon - آیکون نشان
 * @property {keyof BADGE_TIERS} tier - سطح نشان
 * @property {number} points_required - امتیاز مورد نیاز
 * @property {string[]} criteria - معیارهای دریافت
 * @property {boolean} is_hidden - مخفی بودن تا زمان دریافت
 * @property {number} version - نسخه قانون نشان
 * @property {string[]} prerequisites - پیش‌نیازها
 * @property {Object} metadata - فراداده اضافی
 */

/**
 * @typedef {Object} BadgeProgress
 * @property {string} badge_id - شناسه نشان
 * @property {number} current_value - مقدار فعلی
 * @property {number} required_value - مقدار مورد نیاز
 * @property {number} percent - درصد پیشرفت (0-100)
 * @property {keyof BADGE_STATES} state - وضعیت فعلی
 * @property {Date} last_updated - آخرین بروزرسانی
 * @property {Object?} metadata - فراداده پیشرفت
 */

/**
 * @typedef {Object} AwardedBadge
 * @property {string} user_id - شناسه کاربر
 * @property {string} badge_id - شناسه نشان
 * @property {Date} awarded_at - زمان دریافت
 * @property {keyof BADGE_TIERS} tier - سطح نشان
 * @property {Object} metadata - فراداده دریافت
 * @property {number} points_awarded - امتیاز اعطا شده
 */

// ================ کلاس اصلی BadgeService ================

class BadgeService {
    /** @type {Map<string, Badge>} */
    #badges_map = new Map();
    
    /** @type {Map<string, Function[]>} */
    #event_listeners = new Map();
    
    /** @type {Map<string, BadgeProgress>} */
    #progress_cache = new Map();
    
    /** @type {number} */
    #max_retries = 3;
    
    /** @type {number} */
    #retry_delay = 1000;
    
    /** @type {boolean} */
    #is_initialized = false;
    
    /**
     * @param {Object} dependencies - وابستگی‌های تزریق شده
     * @param {Object} dependencies.badge_repository - مخزن نشان‌ها
     * @param {Object} dependencies.user_repository - مخزن کاربران
     * @param {Object} dependencies.lesson_repository - مخزن درس‌ها
     * @param {Object} dependencies.event_bus - رویدادهای سیستمی (اختیاری)
     * @param {Object} dependencies.cache_service - سرویس کش (اختیاری)
     */
    constructor({ 
        badge_repository, 
        user_repository, 
        lesson_repository,
        event_bus = null,
        cache_service = null 
    }) {
        // اعتبارسنجی وابستگی‌های ضروری
        if (!badge_repository || !user_repository || !lesson_repository) {
            throw new Error('badge_repository, user_repository and lesson_repository are required');
        }
        
        this.badge_repository = badge_repository;
        this.user_repository = user_repository;
        this.lesson_repository = lesson_repository;
        this.event_bus = event_bus;
        this.cache_service = cache_service;
        
        // مقداردهی اولیه
        this.#initialize();
    }
    
    /**
     * مقداردهی اولیه سرویس
     * @private
     */
    async #initialize() {
        try {
            await this.#load_badges();
            this.#subscribe_to_events();
            this.#is_initialized = true;
            
            logger.info('badge_service_initialized', { 
                badge_count: this.#badges_map.size 
            });
        } catch (error) {
            logger.error('badge_service_init_failed', { 
                error: error.message,
                stack: error.stack 
            });
            
            // Fallback: داده‌های خالی اما سرویس فعال
            this.#badges_map.clear();
            this.#is_initialized = true;
        }
    }
    
    /**
     * بارگذاری نشان‌ها از repository با retry mechanism
     * @private
     */
    async #load_badges() {
        const operation = async () => {
            // تلاش از کش (اگر وجود دارد)
            if (this.cache_service) {
                const cached = await this.cache_service.get('badges:all');
                if (cached) {
                    this.#badges_map = new Map(cached.map(b => [b.id, b]));
                    logger.debug('badges_loaded_from_cache');
                    return;
                }
            }
            
            // بارگذاری از repository
            const badges = await this.badge_repository.get_all();
            
            // اعتبارسنجی داده‌ها
            const valid_badges = badges.filter(badge => this.#validate_badge_data(badge));
            
            // تبدیل به Map برای دسترسی سریع
            this.#badges_map = new Map(valid_badges.map(badge => [badge.id, badge]));
            
            // ذخیره در کش
            if (this.cache_service && valid_badges.length > 0) {
                await this.cache_service.set('badges:all', valid_badges, 3600); // 1 ساعت
            }
            
            logger.info('badges_loaded', { count: valid_badges.length });
        };
        
        await this.#with_retry(operation, 'load_badges');
    }
    
    /**
     * اعتبارسنجی داده‌های یک نشان
     * @private
     */
    #validate_badge_data(badge) {
        const required_fields = ['id', 'name', 'description', 'tier', 'criteria'];
        
        for (const field of required_fields) {
            if (!badge[field]) {
                logger.warn('badge_missing_required_field', { 
                    badge_id: badge.id, 
                    field 
                });
                return false;
            }
        }
        
        if (!Object.values(BADGE_TIERS).includes(badge.tier)) {
            logger.warn('badge_invalid_tier', { 
                badge_id: badge.id, 
                tier: badge.tier 
            });
            return false;
        }
        
        if (!Array.isArray(badge.criteria) || badge.criteria.length === 0) {
            logger.warn('badge_invalid_criteria', { badge_id: badge.id });
            return false;
        }
        
        return true;
    }
    
    /**
     * مکانیزم retry با exponential backoff
     * @private
     */
    async #with_retry(operation, operation_name, retry_count = 0) {
        try {
            return await operation();
        } catch (error) {
            if (retry_count >= this.#max_retries) {
                logger.error('operation_failed_max_retries', {
                    operation: operation_name,
                    retries: retry_count,
                    error: error.message
                });
                throw error;
            }
            
            const delay = this.#retry_delay * Math.pow(2, retry_count);
            logger.warn('operation_retry', {
                operation: operation_name,
                retry_count: retry_count + 1,
                delay_ms: delay,
                error: error.message
            });
            
            await new Promise(resolve => setTimeout(resolve, delay));
            return this.#with_retry(operation, operation_name, retry_count + 1);
        }
    }
    
    /**
     * اشتراک در رویدادهای سیستم
     * @private
     */
    #subscribe_to_events() {
        if (!this.event_bus) return;
        
        const events = [
            { name: 'user:login_streak_updated', handler: this.#handle_streak_event },
            { name: 'lesson:completed', handler: this.#handle_lesson_event },
            { name: 'points:earned', handler: this.#handle_points_event },
            { name: 'exercise:perfected', handler: this.#handle_exercise_event },
            { name: 'user:level_up', handler: this.#handle_level_event }
        ];
        
        events.forEach(({ name, handler }) => {
            this.event_bus.on(name, async (data) => {
                await this.#with_retry(
                    () => handler.call(this, data),
                    `event_${name}`
                );
            });
        });
        
        logger.info('badge_service_subscribed_to_events', { event_count: events.length });
    }
    
    // ================ Event Handlers ================
    
    /**
     * مدیریت رویداد استریک
     * @private
     */
    async #handle_streak_event(data) {
        const { user_id, streak_count } = data;
        await this.#check_and_award_badges(user_id, 'login_streak', { value: streak_count });
        await this.#update_badge_progress(user_id, 'login_streak', streak_count);
    }
    
    /**
     * مدیریت رویداد درس
     * @private
     */
    async #handle_lesson_event(data) {
        const { user_id, lesson_id, perfect_score } = data;
        await this.#check_and_award_badges(user_id, 'lessons_completed', { lesson_id });
        
        if (perfect_score) {
            await this.#check_and_award_badges(user_id, 'perfect_lesson', { lesson_id });
        }
    }
    
    /**
     * مدیریت رویداد امتیاز
     * @private
     */
    async #handle_points_event(data) {
        const { user_id, points, total_points } = data;
        await this.#check_and_award_badges(user_id, 'points_earned', { points, total_points });
    }
    
    /**
     * مدیریت رویداد تمرین
     * @private
     */
    async #handle_exercise_event(data) {
        const { user_id, exercise_id, is_perfect } = data;
        if (is_perfect) {
            await this.#check_and_award_badges(user_id, 'perfect_exercises', { exercise_id });
        }
    }
    
    /**
     * مدیریت رویداد سطح
     * @private
     */
    async #handle_level_event(data) {
        const { user_id, new_level } = data;
        await this.#check_and_award_badges(user_id, 'level_reached', { level: new_level });
    }
    
    // ================ API های عمومی ================
    
    /**
     * دریافت همه نشان‌ها با قابلیت فیلتر
     * @param {Object} filters - فیلترها
     * @returns {Promise<Badge[]>}
     */
    async get_all_badges(filters = {}) {
        await this.#ensure_initialized();
        
        let badges = Array.from(this.#badges_map.values());
        
        if (filters.tier) {
            badges = badges.filter(b => b.tier === filters.tier);
        }
        
        if (filters.only_visible) {
            badges = badges.filter(b => !b.is_hidden);
        }
        
        if (filters.search) {
            const search_lower = filters.search.toLowerCase();
            badges = badges.filter(b => 
                b.name.toLowerCase().includes(search_lower) ||
                b.description.toLowerCase().includes(search_lower)
            );
        }
        
        return badges;
    }
    
    /**
     * دریافت نشان‌های یک کاربر با وضعیت پیشرفت
     * @param {string} user_id - شناسه کاربر
     * @returns {Promise<Object>}
     */
    async get_user_badges(user_id) {
        await this.#ensure_initialized();
        
        if (!user_id) {
            throw new Error('user_id is required');
        }
        
        try {
            // دریافت نشان‌های کسب شده
            const earned = await this.badge_repository.get_user_badges(user_id);
            const earned_ids = new Set(earned.map(b => b.badge_id));
            
            // دریافت پیشرفت برای نشان‌های در حال پیشرفت
            const badges_with_progress = [];
            
            for (const badge of this.#badges_map.values()) {
                if (earned_ids.has(badge.id)) {
                    badges_with_progress.push({
                        ...badge,
                        state: BADGE_STATES.CLAIMED,
                        earned_at: earned.find(e => e.badge_id === badge.id)?.awarded_at
                    });
                } else {
                    const progress = await this.get_badge_progress(user_id, badge.id);
                    badges_with_progress.push({
                        ...badge,
                        ...progress
                    });
                }
            }
            
            // محاسبه آمار
            const stats = this.#calculate_badge_stats(badges_with_progress, earned);
            
            return {
                badges: badges_with_progress,
                stats,
                earned_count: earned.length,
                in_progress_count: badges_with_progress.filter(b => b.state === BADGE_STATES.IN_PROGRESS).length
            };
            
        } catch (error) {
            logger.error('get_user_badges_failed', { user_id, error: error.message });
            return {
                badges: [],
                stats: this.#get_empty_stats(),
                earned_count: 0,
                in_progress_count: 0
            };
        }
    }
    
    /**
     * دریافت پیشرفت یک نشان برای کاربر
     * @param {string} user_id 
     * @param {string} badge_id 
     * @returns {Promise<BadgeProgress>}
     */
    async get_badge_progress(user_id, badge_id) {
        await this.#ensure_initialized();
        
        if (!user_id || !badge_id) {
            throw new Error('user_id and badge_id are required');
        }
        
        // بررسی کش
        const cache_key = `progress:${user_id}:${badge_id}`;
        if (this.#progress_cache.has(cache_key)) {
            return this.#progress_cache.get(cache_key);
        }
        
        const badge = this.#badges_map.get(badge_id);
        if (!badge) {
            throw new Error(`badge not found: ${badge_id}`);
        }
        
        // محاسبه پیشرفت بر اساس معیارها
        const progress = await this.#calculate_badge_progress(user_id, badge);
        
        // تعیین وضعیت
        progress.state = this.#determine_badge_state(progress);
        
        // ذخیره در کش (با زمان انقضا)
        this.#progress_cache.set(cache_key, progress);
        setTimeout(() => this.#progress_cache.delete(cache_key), 5 * 60 * 1000); // 5 دقیقه
        
        return progress;
    }
    
    /**
     * محاسبه پیشرفت یک نشان
     * @private
     */
    async #calculate_badge_progress(user_id, badge) {
        const progress = {
            badge_id: badge.id,
            current_value: 0,
            required_value: 0,
            percent: 0,
            state: BADGE_STATES.LOCKED,
            last_updated: new Date(),
            metadata: {}
        };
        
        // اگر نشان قبلاً کسب شده
        const has_badge = await this.badge_repository.has_badge(user_id, badge.id);
        if (has_badge) {
            progress.state = BADGE_STATES.CLAIMED;
            return progress;
        }
        
        // محاسبه بر اساس معیار اول (ساده‌سازی شده)
        const criterion = badge.criteria[0];
        const [type, required] = criterion.split('_');
        
        progress.required_value = parseInt(required) || 0;
        
        switch (type) {
            case 'login':
                progress.current_value = await this.#get_login_streak(user_id);
                break;
            case 'lessons':
                progress.current_value = await this.#get_completed_lessons_count(user_id);
                break;
            case 'points':
                progress.current_value = await this.#get_user_points(user_id);
                progress.required_value = badge.points_required;
                break;
            case 'perfect':
                progress.current_value = await this.#get_perfect_exercises_count(user_id);
                break;
            default:
                progress.current_value = 0;
        }
        
        if (progress.required_value > 0) {
            progress.percent = Math.min(
                Math.round((progress.current_value / progress.required_value) * 100),
                100
            );
        }
        
        return progress;
    }
    
    /**
     * تعیین وضعیت نشان بر اساس پیشرفت
     * @private
     */
    #determine_badge_state(progress) {
        if (progress.percent >= 100) {
            return BADGE_STATES.UNLOCKED;
        }
        if (progress.current_value > 0) {
            return BADGE_STATES.IN_PROGRESS;
        }
        return BADGE_STATES.LOCKED;
    }
    
    /**
     * بررسی و اعطای خودکار نشان‌ها
     * @param {string} user_id 
     * @param {string} event_type 
     * @param {Object} event_data 
     * @returns {Promise<Badge[]>}
     */
    async #check_and_award_badges(user_id, event_type, event_data) {
        const eligible_badges = this.#find_eligible_badges(event_type, event_data);
        const awarded_badges = [];
        
        for (const badge of eligible_badges) {
            const awarded = await this.#award_badge_if_eligible(user_id, badge, event_data);
            if (awarded) {
                awarded_badges.push(badge);
            }
        }
        
        if (awarded_badges.length > 0) {
            await this.#notify_badges_awarded(user_id, awarded_badges);
            
            // پاک کردن کش پیشرفت
            awarded_badges.forEach(badge => {
                const cache_key = `progress:${user_id}:${badge.id}`;
                this.#progress_cache.delete(cache_key);
            });
        }
        
        return awarded_badges;
    }
    
    /**
     * اعطای یک نشان خاص به کاربر
     * @param {string} user_id 
     * @param {string} badge_id 
     * @param {Object} metadata 
     * @returns {Promise<boolean>}
     */
    async award_badge(user_id, badge_id, metadata = {}) {
        await this.#ensure_initialized();
        
        if (!user_id || !badge_id) {
            logger.warn('award_badge_invalid_params', { user_id, badge_id });
            return false;
        }
        
        return this.#with_retry(async () => {
            const badge = this.#badges_map.get(badge_id);
            if (!badge) {
                logger.warn('badge_not_found', { badge_id });
                return false;
            }
            
            // بررسی عدم تکراری بودن
            const has_badge = await this.badge_repository.has_badge(user_id, badge_id);
            if (has_badge) {
                logger.debug('badge_already_awarded', { user_id, badge_id });
                return false;
            }
            
            // محاسبه امتیاز نشان
            const points_awarded = CONFIG.BADGE_TIER_POINTS?.[badge.tier] || 0;
            
            const award_data = {
                user_id,
                badge_id,
                awarded_at: new Date().toISOString(),
                tier: badge.tier,
                points_awarded,
                metadata: {
                    ...metadata,
                    badge_version: badge.version,
                    awarded_by: 'system'
                }
            };
            
            await this.badge_repository.award_badge(award_data);
            
            // بروزرسانی آمار کاربر
            await this.#update_user_stats(user_id, badge, points_awarded);
            
            // انتشار رویداد
            this.#emit(BADGE_EVENTS.AWARDED, { user_id, badge, award_data });
            
            if (this.event_bus) {
                this.event_bus.emit('badge:awarded', { user_id, badge });
                this.event_bus.emit('notification:create', {
                    user_id,
                    type: 'badge_earned',
                    data: { badge }
                });
            }
            
            logger.info('badge_awarded', { 
                user_id, 
                badge_id,
                tier: badge.tier,
                points: points_awarded
            });
            
            return true;
            
        }, 'award_badge');
    }
    
    /**
     * اعطای گروهی نشان‌ها
     * @param {string} user_id 
     * @param {string[]} badge_ids 
     * @param {Object} metadata 
     * @returns {Promise<Object>}
     */
    async award_badges_batch(user_id, badge_ids, metadata = {}) {
        await this.#ensure_initialized();
        
        const results = {
            succeeded: [],
            failed: [],
            total_points: 0
        };
        
        for (const badge_id of badge_ids) {
            const success = await this.award_badge(user_id, badge_id, {
                ...metadata,
                batch_award: true
            });
            
            if (success) {
                results.succeeded.push(badge_id);
                const badge = this.#badges_map.get(badge_id);
                results.total_points += CONFIG.BADGE_TIER_POINTS?.[badge?.tier] || 0;
            } else {
                results.failed.push(badge_id);
            }
        }
        
        if (results.succeeded.length > 0) {
            this.#emit(BADGE_EVENTS.BATCH_AWARDED, {
                user_id,
                badges: results.succeeded,
                total_points: results.total_points
            });
        }
        
        logger.info('badges_batch_awarded', {
            user_id,
            succeeded: results.succeeded.length,
            failed: results.failed.length
        });
        
        return results;
    }
    
    /**
     * اعطای نشان در صورت احراز شرایط
     * @private
     */
    async #award_badge_if_eligible(user_id, badge, event_data) {
        const is_eligible = await this.#check_eligibility(user_id, badge, event_data);
        
        if (is_eligible) {
            return this.award_badge(user_id, badge.id, {
                triggered_by: event_data.type,
                triggered_value: event_data.value,
                triggered_at: new Date().toISOString()
            });
        }
        
        return false;
    }
    
    /**
     * بروزرسانی پیشرفت نشان‌ها
     * @private
     */
    async #update_badge_progress(user_id, criterion_type, current_value) {
        const relevant_badges = Array.from(this.#badges_map.values())
            .filter(badge => 
                badge.criteria.some(c => c.startsWith(criterion_type)) &&
                !this.badge_repository.has_badge(user_id, badge.id)
            );
        
        for (const badge of relevant_badges) {
            const progress = await this.get_badge_progress(user_id, badge.id);
            
            this.#emit(BADGE_EVENTS.PROGRESS_UPDATED, {
                user_id,
                badge_id: badge.id,
                progress
            });
            
            // اگر به 100% رسید، رویداد unlock بفرست
            if (progress.percent >= 100 && progress.state === BADGE_STATES.IN_PROGRESS) {
                this.#emit(BADGE_EVENTS.UNLOCKED, {
                    user_id,
                    badge_id: badge.id,
                    badge
                });
            }
        }
    }
    
    /**
     * یافتن نشان‌های واجد شرایط بر اساس رویداد
     * @private
     */
    #find_eligible_badges(event_type, event_data) {
        return Array.from(this.#badges_map.values()).filter(badge => 
            badge.criteria.some(c => {
                const [type] = c.split('_');
                return type === event_type;
            })
        );
    }
    
    /**
     * بررسی eligibility کاربر برای نشان
     * @private
     */
    async #check_eligibility(user_id, badge, event_data) {
        // بررسی پیش‌نیازها
        if (badge.prerequisites?.length > 0) {
            for (const prereq of badge.prerequisites) {
                const has_prereq = await this.badge_repository.has_badge(user_id, prereq);
                if (!has_prereq) return false;
            }
        }
        
        // بررسی معیارها
        for (const criterion of badge.criteria) {
            const is_met = await this.#check_criterion(user_id, criterion, event_data);
            if (!is_met) return false;
        }
        
        // بررسی امتیاز مورد نیاز
        if (badge.points_required > 0) {
            const user_stats = await this.user_repository.get_stats(user_id);
            if ((user_stats?.total_points || 0) < badge.points_required) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * بررسی یک معیار خاص
     * @private
     */
    async #check_criterion(user_id, criterion, event_data) {
        const [type, value] = criterion.split('_');
        const required_value = parseInt(value) || 0;
        
        switch (type) {
            case 'login':
                const streak = await this.#get_login_streak(user_id);
                return streak >= required_value;
                
            case 'lessons':
                const lessons = await this.#get_completed_lessons_count(user_id);
                return lessons >= required_value;
                
            case 'points':
                const points = await this.#get_user_points(user_id);
                return points >= required_value;
                
            case 'perfect':
                const perfect = await this.#get_perfect_exercises_count(user_id);
                return perfect >= required_value;
                
            case 'streak':
                return event_data?.value >= required_value;
                
            default:
                logger.warn('unknown_criterion_type', { type, criterion });
                return false;
        }
    }
    
    // ================ متدهای کمکی ================
    
    async #get_login_streak(user_id) {
        const stats = await this.user_repository.get_stats(user_id);
        return stats?.login_streak || 0;
    }
    
    async #get_completed_lessons_count(user_id) {
        return this.lesson_repository.get_completed_count(user_id);
    }
    
    async #get_user_points(user_id) {
        const stats = await this.user_repository.get_stats(user_id);
        return stats?.total_points || 0;
    }
    
    async #get_perfect_exercises_count(user_id) {
        const stats = await this.user_repository.get_stats(user_id);
        return stats?.perfect_exercises || 0;
    }
    
    async #update_user_stats(user_id, badge, points_awarded) {
        try {
            await this.user_repository.update_stats(user_id, {
                badges_count: 1,
                total_badge_points: points_awarded,
                last_badge_earned: new Date().toISOString(),
                highest_tier_badge: badge.tier
            });
        } catch (error) {
            logger.error('update_user_stats_failed', { 
                user_id, 
                badge_id: badge.id,
                error: error.message 
            });
        }
    }
    
    #calculate_badge_stats(badges, earned) {
        const tier_counts = {
            [BADGE_TIERS.BRONZE]: 0,
            [BADGE_TIERS.SILVER]: 0,
            [BADGE_TIERS.GOLD]: 0,
            [BADGE_TIERS.PLATINUM]: 0
        };
        
        earned.forEach(b => {
            const badge = this.#badges_map.get(b.badge_id);
            if (badge && tier_counts.hasOwnProperty(badge.tier)) {
                tier_counts[badge.tier]++;
            }
        });
        
        return {
            by_tier: tier_counts,
            total_points: earned.reduce((sum, b) => sum + (b.points_awarded || 0), 0),
            last_earned: earned.length > 0 ? earned[earned.length - 1].awarded_at : null
        };
    }
    
    #get_empty_stats() {
        return {
            by_tier: {
                [BADGE_TIERS.BRONZE]: 0,
                [BADGE_TIERS.SILVER]: 0,
                [BADGE_TIERS.GOLD]: 0,
                [BADGE_TIERS.PLATINUM]: 0
            },
            total_points: 0,
            last_earned: null
        };
    }
    
    async #ensure_initialized() {
        if (!this.#is_initialized) {
            await this.#initialize();
        }
    }
    
    // ================ Event System ================
    
    /**
     * ثبت شنونده رویداد
     * @param {string} event 
     * @param {Function} callback 
     */
    on(event, callback) {
        if (!this.#event_listeners.has(event)) {
            this.#event_listeners.set(event, []);
        }
        this.#event_listeners.get(event).push(callback);
    }
    
    /**
     * حذف شنونده رویداد
     * @param {string} event 
     * @param {Function} callback 
     */
    off(event, callback) {
        if (this.#event_listeners.has(event)) {
            const listeners = this.#event_listeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }
    
    /**
     * ارسال رویداد به شنوندگان
     * @private
     */
    #emit(event, data) {
        if (this.#event_listeners.has(event)) {
            this.#event_listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    logger.error('listener_execution_failed', { 
                        event, 
                        error: error.message 
                    });
                }
            });
        }
    }
    
    async #notify_badges_awarded(user_id, badges) {
        this.#emit(BADGE_EVENTS.BATCH_AWARDED, { user_id, badges });
    }
    
    /**
     * پاکسازی منابع
     */
    dispose() {
        this.#event_listeners.clear();
        this.#progress_cache.clear();
        logger.info('badge_service_disposed');
    }
    
    /**
     * بازنشانی کش (برای تست‌ها)
     * @private
     */
    _clear_cache() {
        this.#progress_cache.clear();
    }
}

// ================ Factory Function ================

/**
 * ایجاد نمونه BadgeService با وابستگی‌های پیش‌فرض
 * @param {Object} options 
 * @returns {Promise<BadgeService>}
 */
export async function create_badge_service(options = {}) {
    const {
        badge_repository,
        user_repository,
        lesson_repository,
        event_bus = null,
        cache_service = null
    } = options;
    
    if (!badge_repository || !user_repository || !lesson_repository) {
        throw new Error('badge_repository, user_repository and lesson_repository are required');
    }
    
    return new BadgeService({
        badge_repository,
        user_repository,
        lesson_repository,
        event_bus,
        cache_service
    });
}

// ================ Export ================

export default BadgeService;
