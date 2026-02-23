/**
 * @interface IUserModel
 * @property {string} id
 * @property {string} email
 * @property {number} level
 * @method add_xp
 * @method increment_streak
 * @method to_object
 */

/**
 * @typedef {Object} UserStats
 * @property {number} total_lessons
 * @property {number} completed_lessons
 * @property {number} learned_words
 * @property {number} total_time_spent
 * @property {number} average_score
 */

/**
 * @typedef {Object} NotificationSettings
 * @property {boolean} lesson_reminder
 * @property {boolean} streak_reminder
 */

/**
 * @typedef {Object} DisplaySettings
 * @property {'small'|'medium'|'large'} font_size
 * @property {'light'|'dark'|'system'} theme
 */

/**
 * @typedef {Object} UserSettings
 * @property {NotificationSettings} notifications
 * @property {DisplaySettings} display
 */

import { UserRole, UserLevel, LanguageCode, DEFAULT_VALUES } from './constants/user_constants.js';
import { Result } from '../../core/result.js';

/**
 * @class UserModel
 * @implements {IUserModel}
 */
class UserModel {
    /** @readonly @type {string} */
    id;

    /** @type {string} */
    email;

    /** @type {string} */
    username;

    /** @type {string} */
    first_name;

    /** @type {string} */
    last_name;

    /** @type {string} */
    full_name;

    /** @type {number} */
    level;

    /** @type {number} */
    xp;

    /** @type {number} */
    streak_days;

    /** @type {number} */
    daily_goal;

    /** @type {boolean} */
    is_active;

    /** @type {boolean} */
    is_verified;

    /** @type {boolean} */
    is_premium;

    /** @type {string} */
    last_active;

    /** @readonly @type {string} */
    created_at;

    /** @type {string} */
    updated_at;

    /** @type {string|null} */
    last_streak_update;

    /** @type {UserStats} */
    stats;

    /** @type {UserSettings} */
    settings;

    /** @private @type {IUserValidator} */
    _validator;

    /** @private @type {IEventEmitter} */
    _events;

    /** @private @type {IAchievementManager} */
    _achievements;

    /** @private @type {Console} */
    _logger;

    /**
     * @param {Object} data
     * @param {IUserValidator} validator
     * @param {IEventEmitter} events
     * @param {IAchievementManager} achievements
     * @param {Console} logger
     */
    constructor(data = {}, validator, events, achievements, logger = console) {
        if (!validator || !events || !achievements) {
            throw new Error('validator, events, and achievements are required');
        }

        this._validator = validator;
        this._events = events;
        this._achievements = achievements.init(this);
        this._logger = logger;

        this.id = crypto.randomUUID?.() || `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        this.email = data.email || '';
        this.username = data.username || '';
        this.first_name = data.first_name || '';
        this.last_name = data.last_name || '';
        this.full_name = data.full_name || this._get_full_name();

        this.language = data.language || LanguageCode.PERSIAN;
        this.level = this._validate_level(data.level || UserLevel.BEGINNER);
        this.xp = Math.max(0, data.xp || 0);
        this.streak_days = Math.max(0, data.streak_days || 0);
        this.daily_goal = Math.max(DEFAULT_VALUES.DAILY_GOAL_MIN, Math.min(DEFAULT_VALUES.DAILY_GOAL_MAX, data.daily_goal || DEFAULT_VALUES.DAILY_GOAL_DEFAULT));

        this.is_active = data.is_active !== false;
        this.is_verified = data.is_verified || false;
        this.is_premium = data.is_premium || false;
        this.last_active = data.last_active || new Date().toISOString();
        this.created_at = data.created_at || new Date().toISOString();
        this.updated_at = data.updated_at || new Date().toISOString();
        this.last_streak_update = data.last_streak_update || null;

        this.stats = { ...DEFAULT_VALUES.STATS, ...data.stats };
        this.settings = { ...DEFAULT_VALUES.SETTINGS, ...data.settings };

        this._achievements.load(data.achievements);
        this._validate();
    }

    /**
     * @param {number} amount
     * @returns {Result<Object>}
     * @throws {Error} اگر مقدار XP نامعتبر باشد
     */
    add_xp(amount) {
        return Result.tryCatch(() => {
            if (amount <= 0) return Result.success({ user: this });

            const old_level = this.level;
            const new_xp = this.xp + amount;
            const new_level = UserLevel.calculate_level(new_xp);

            const updated_user = this._clone({ xp: new_xp, level: new_level, stats: { ...this.stats, total_time_spent: this.stats.total_time_spent + Math.floor(amount / DEFAULT_VALUES.XP_PER_MINUTE) }, updated_at: new Date().toISOString() });

            const new_achievements = updated_user._achievements.check_unlocked();

            if (new_level > old_level) {
                this._events.emit('level_up', { old_level, new_level });
            }

            return { user: updated_user, level_up: new_level > old_level, new_achievements };
        }, 'خطا در افزایش XP');
    }

    /**
     * @returns {Result<Object>}
     */
    increment_streak() {
        return Result.tryCatch(() => {
            const today = new Date().toDateString();
            const last_update = this.last_streak_update ? new Date(this.last_streak_update).toDateString() : null;

            if (last_update === today) return Result.success({ user: this, streak_increased: false });

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const new_streak_days = last_update === yesterday.toDateString() ? this.streak_days + 1 : 1;

            const updated_user = this._clone({ streak_days: new_streak_days, last_streak_update: new Date().toISOString(), updated_at: new Date().toISOString() });
            const new_achievements = updated_user._achievements.check_unlocked();

            return { user: updated_user, streak_increased: true, new_streak_days, new_achievements };
        }, 'خطا در افزایش استریک');
    }

    /**
     * @returns {Object}
     */
    to_object() {
        return {
            id: this.id,
            email: this.email,
            username: this.username,
            first_name: this.first_name,
            last_name: this.last_name,
            full_name: this.full_name,
            language: this.language,
            role: this.role,
            level: this.level,
            xp: this.xp,
            streak_days: this.streak_days,
            daily_goal: this.daily_goal,
            is_active: this.is_active,
            is_verified: this.is_verified,
            is_premium: this.is_premium,
            last_active: this.last_active,
            created_at: this.created_at,
            updated_at: this.updated_at,
            last_streak_update: this.last_streak_update,
            stats: { ...this.stats },
            settings: JSON.parse(JSON.stringify(this.settings)),
            achievements: this._achievements.toJSON()
        };
    }

    /**
     * @private
     */
    _validate() {
        if (!this.full_name && (this.first_name || this.last_name)) {
            this.full_name = this._get_full_name();
        }
        this.updated_at = new Date().toISOString();
    }

    /**
     * @private
     */
    _validate_level(level) {
        return Math.max(UserLevel.MIN, Math.min(UserLevel.MAX, parseInt(level) || UserLevel.MIN));
    }

    /**
     * @private
     */
    _get_full_name() {
        if (this.first_name && this.last_name) return `${this.first_name} ${this.last_name}`.trim();
        return this.first_name || this.last_name || this.username;
    }

    /**
     * @private
     */
    _clone(overrides = {}) {
        return new UserModel({ ...this.to_object(), ...overrides }, this._validator, this._events, this._achievements, this._logger);
    }
}

export { UserModel };
