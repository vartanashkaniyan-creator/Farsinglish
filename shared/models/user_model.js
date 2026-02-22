import { EventEmitter } from './user_events.js';
import { UserValidator } from './user_validator.js';
import { UserAchievements } from './user_achievements.js';
import { XPCalculator } from './user_metrics.js';
import { Result } from './user_result.js';
import {
    UserRole,
    UserLevel,
    LanguageCode
} from './constants.js';

class UserModel {
    /**
     * @param {Object} data - داده‌های اولیه کاربر
     */
    constructor(data = {}) {
        // Event System
        this.events = new EventEmitter();

        // Validation Gate: بررسی اولیه داده‌ها
        const validation = UserValidator.quick_validate(data);
        if (!validation.isValid) {
            console.warn('User data issues:', validation.errors);
        }

        // شناسه‌ها
        this.id = data.id || this._generate_id();

        // اطلاعات هویتی
        this.email = data.email || '';
        this.username = data.username || '';
        this.first_name = data.first_name || '';
        this.last_name = data.last_name || '';
        this.full_name = data.full_name || this._get_full_name();

        // تنظیمات
        this.language = data.language || LanguageCode.PERSIAN;
        this.role = data.role || UserRole.STUDENT;
        this.level = this._validate_level(data.level || UserLevel.BEGINNER);
        this.xp = Math.max(0, data.xp || 0);
        this.streak_days = Math.max(0, data.streak_days || 0);
        this.daily_goal = Math.max(1, Math.min(50, data.daily_goal || 5));

        // وضعیت
        this.is_active = data.is_active !== false;
        this.is_verified = data.is_verified || false;
        this.is_premium = data.is_premium || false;
        this.last_active = data.last_active || new Date().toISOString();

        // زمان‌بندی
        this.created_at = data.created_at || new Date().toISOString();
        this.updated_at = data.updated_at || new Date().toISOString();
        this.last_streak_update = data.last_streak_update || null;

        // آمار
        this.stats = {
            total_lessons: data.stats?.total_lessons || 0,
            completed_lessons: data.stats?.completed_lessons || 0,
            learned_words: data.stats?.learned_words || 0,
            total_time_spent: data.stats?.total_time_spent || 0,
            average_score: data.stats?.average_score || 0,
            ...data.stats
        };

        // تنظیمات کاربر
        this.settings = {
            notifications: {
                lesson_reminder: data.settings?.notifications?.lesson_reminder !== false,
                streak_reminder: data.settings?.notifications?.streak_reminder !== false
            },
            display: {
                theme: data.settings?.display?.theme || 'light',
                font_size: data.settings?.display?.font_size || 'medium'
            },
            ...data.settings
        };

        // دستاوردها
        this.achievements = new UserAchievements(this);
        data.achievements?.unlocked?.forEach(id => this.achievements.unlocked.add(id));

        // اعتبارسنجی داخلی
        this._validate();
    }

    // ============ Public Methods ============

    add_xp(amount) {
        if (amount <= 0) return Result.success(this);

        return Result.tryCatch(() => {
            const old_level = this.level;
            const new_xp = this.xp + amount;
            const new_level = XPCalculator.calculate_level(new_xp);

            const updated_user = new UserModel({
                ...this.to_object(),
                xp: new_xp,
                level: new_level,
                stats: {
                    ...this.stats,
                    total_time_spent: this.stats.total_time_spent + Math.floor(amount / 10)
                },
                updated_at: new Date().toISOString()
            });

            const new_achievements = updated_user.achievements.check_unlocked();

            // Emit Event برای level_up
            if (new_level > old_level) {
                this.events.emit('level_up', { old_level, new_level });
            }

            return {
                user: updated_user,
                level_up: new_level > old_level,
                new_achievements
            };
        }, 'خطا در افزایش XP');
    }

    increment_streak() {
        return Result.tryCatch(() => {
            const today = new Date().toDateString();
            const last_update = this.last_streak_update ? 
                new Date(this.last_streak_update).toDateString() : null;

            if (last_update === today) return { user: this, streak_increased: false };

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const new_streak_days = last_update === yesterday.toDateString() 
                ? this.streak_days + 1 
                : 1;

            const updated_user = new UserModel({
                ...this.to_object(),
                streak_days: new_streak_days,
                last_streak_update: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            const new_achievements = updated_user.achievements.check_unlocked();

            return {
                user: updated_user,
                streak_increased: true,
                new_streak_days,
                new_achievements
            };
        }, 'خطا در افزایش استریک');
    }

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
            achievements: this.achievements.toJSON()
        };
    }

    // ... سایر متدها مشابه نسخه قبلی با snake_case و JSDoc

    _validate() {
        if (!this.full_name && (this.first_name || this.last_name)) {
            this.full_name = this._get_full_name();
        }
        this.updated_at = new Date().toISOString();
    }

    _validate_level(level) {
        return Math.max(1, Math.min(10, parseInt(level) || 1));
    }

    _generate_id() {
        return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    _get_full_name() {
        if (this.first_name && this.last_name) return `${this.first_name} ${this.last_name}`.trim();
        return this.first_name || this.last_name || this.username;
    }
}

export { UserModel, UserAchievements, UserValidator, XPCalculator, Result, UserRole, UserLevel, LanguageCode };
