/**
 * @fileoverview مدل داده کاربر برای لایه‌های مختلف برنامه
 * @module shared/models/user_model
 * 
 * @requires module:shared/constants/constants
 * @description مسئولیت: نمایش، اعتبارسنجی و تبدیل داده‌های کاربر
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze|Object.freeze}
 */

// ============ Types Definition (JSDoc) ============

/**
 * @typedef {Object} UserStatistics
 * @property {number} level - سطح فعلی کاربر (۱-۱۰)
 * @property {number} xp - امتیاز تجربه کل
 * @property {number} streakDays - تعداد روزهای پیاپی
 * @property {number} totalLessons - کل درس‌ها
 * @property {number} completedLessons - درس‌های تکمیل شده
 * @property {number} learnedWords - لغات یادگرفته شده
 * @property {Object} levelProgress - اطلاعات پیشرفت سطح
 * @property {number} levelProgress.percentage - درصد پیشرفت
 * @property {number} levelProgress.current - XP فعلی در سطح
 * @property {number} levelProgress.total - XP کل مورد نیاز
 */

/**
 * @typedef {Object} AchievementReward
 * @property {number} xp - امتیاز جایزه
 * @property {string} badge - نشان
 * @property {string} icon - آیکون
 */

/**
 * @typedef {Object} AchievementData
 * @property {string} id - شناسه دستاورد
 * @property {string} title - عنوان
 * @property {string} description - توضیحات
 * @property {AchievementReward} reward - جایزه
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - اعتبارسنجی موفق
 * @property {string[]} errors - لیست خطاها
 */

// ============ Constants ============
const UserRole = Object.freeze({
    STUDENT: 'student',
    TEACHER: 'teacher',
    ADMIN: 'admin',
    GUEST: 'guest'
});

const UserLevel = Object.freeze({
    BEGINNER: 1,
    ELEMENTARY: 2,
    INTERMEDIATE: 3,
    UPPER_INTERMEDIATE: 4,
    ADVANCED: 5,
    PROFICIENT: 6,
    EXPERT: 7,
    MASTER: 8,
    GRANDMASTER: 9,
    LEGEND: 10
});

const LanguageCode = Object.freeze({
    PERSIAN: 'fa',
    ENGLISH: 'en',
    ARABIC: 'ar',
    TURKISH: 'tr'
});

const AchievementType = Object.freeze({
    LESSON: 'lesson',
    STREAK: 'streak',
    VOCABULARY: 'vocabulary',
    PERFECT: 'perfect',
    TIME: 'time',
    SPECIAL: 'special'
});

// ============ Achievement Class ============
class Achievement {
    /**
     * @param {string} id - شناسه دستاورد
     * @param {string} title - عنوان
     * @param {string} description - توضیحات
     * @param {Function} condition - شرط دستیابی
     * @param {AchievementReward} reward - جایزه
     * @param {string} [type=AchievementType.SPECIAL] - نوع دستاورد
     */
    constructor(id, title, description, condition, reward, type = AchievementType.SPECIAL) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.condition = condition;
        this.reward = reward;
        this.type = type;
        this.createdAt = new Date().toISOString();
    }

    /**
     * بررسی شرط دستاورد با مدیریت خطا
     * @param {UserModel} user - مدل کاربر
     * @returns {boolean} نتیجه بررسی
     */
    check(user) {
        return this._executeSafely('check', () => this.condition?.(user) ?? false);
    }

    /**
     * @returns {AchievementData} داده‌های قابل سریالایز
     */
    toJSON() {
        return {
            id: this.id,
            title: this.title,
            description: this.description,
            type: this.type,
            reward: this.reward
        };
    }

    /**
     * اجرای ایمن تابع با Result Pattern
     * @private
     * @param {string} method - نام متد
     * @param {Function} action - تابع اجرایی
     * @returns {any} نتیجه
     */
    _executeSafely(method, action) {
        try {
            return action();
        } catch (error) {
            console.error(`Error in Achievement.${method} for ${this.id}:`, error);
            return false;
        }
    }
}

// ============ User Achievements Manager ============
class UserAchievements {
    /**
     * @param {UserModel} user - مدل کاربر
     */
    constructor(user) {
        this.user = user;
        this.achievements = new Map();
        this.unlocked = new Set(user.achievements?.unlocked || []);
        this.unlockedAt = new Map(user.achievements?.unlockedAt || []);
        this._initAchievements();
    }

    _initAchievements() {
        const achievements = [
            new Achievement(
                'first_lesson',
                '🥉 اولین قدم',
                'اولین درس خود را کامل کنید',
                user => user.stats.completedLessons >= 1,
                { xp: 50, badge: '🥉', icon: '🎯' },
                AchievementType.LESSON
            ),
            new Achievement(
                'lesson_10',
                '📚 دانش‌آموز',
                '۱۰ درس را کامل کنید',
                user => user.stats.completedLessons >= 10,
                { xp: 150, badge: '📚', icon: '📖' },
                AchievementType.LESSON
            ),
            new Achievement(
                'streak_7',
                '🔥 هفته‌ای بدون توقف',
                '۷ روز متوالی درس بخوانید',
                user => user.streakDays >= 7,
                { xp: 100, badge: '🔥', icon: '🔥' },
                AchievementType.STREAK
            ),
            new Achievement(
                'vocabulary_50',
                '🔤 واژه‌آموز',
                '۵۰ واژه یاد بگیرید',
                user => user.stats.learnedWords >= 50,
                { xp: 100, badge: '🔤', icon: '📝' },
                AchievementType.VOCABULARY
            )
        ];
        
        achievements.forEach(a => this.achievements.set(a.id, a));
    }

    /**
     * بررسی دستاوردهای جدید
     * @returns {Achievement[]} دستاوردهای تازه باز شده
     */
    checkUnlocked() {
        const newlyUnlocked = [];
        
        for (const [id, achievement] of this.achievements) {
            if (!this.unlocked.has(id) && achievement.check(this.user)) {
                this.unlocked.add(id);
                this.unlockedAt.set(id, new Date().toISOString());
                newlyUnlocked.push(achievement);
            }
        }
        
        return newlyUnlocked;
    }

    /**
     * @returns {AchievementData[]} دستاوردهای باز شده
     */
    getUnlockedAchievements() {
        return Array.from(this.unlocked).map(id => ({
            ...this.achievements.get(id).toJSON(),
            unlockedAt: this.unlockedAt.get(id)
        }));
    }

    /**
     * @returns {Object} آمار دستاوردها
     */
    getStats() {
        return {
            total: this.achievements.size,
            unlocked: this.unlocked.size,
            locked: this.achievements.size - this.unlocked.size,
            totalXpEarned: this._calculateTotalXp()
        };
    }

    /**
     * محاسبه کل XP دریافتی از دستاوردها
     * @private
     * @returns {number}
     */
    _calculateTotalXp() {
        return this.getUnlockedAchievements()
            .reduce((sum, a) => sum + (a.reward?.xp || 0), 0);
    }

    toJSON() {
        return {
            unlocked: Array.from(this.unlocked),
            unlockedAt: Array.from(this.unlockedAt.entries())
        };
    }
}

// ============ Validator ============
class UserValidator {
    /**
     * @type {Object} قوانین اعتبارسنجی
     */
    static rules = {
        email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        username: (v) => v?.length >= 3 && v?.length <= 50,
        level: (v) => v >= 1 && v <= 10,
        xp: (v) => v >= 0,
        streakDays: (v) => v >= 0,
        dailyGoal: (v) => v >= 1 && v <= 50
    };

    /**
     * اعتبارسنجی کامل کاربر
     * @param {Object} userData - داده‌های کاربر
     * @returns {ValidationResult}
     */
    static validate(userData) {
        const errors = [];
        
        if (!userData.email || !this.rules.email(userData.email)) {
            errors.push('ایمیل نامعتبر است');
        }
        
        if (!userData.username || !this.rules.username(userData.username)) {
            errors.push('نام کاربری باید بین ۳ تا ۵۰ کاراکتر باشد');
        }
        
        if (userData.level !== undefined && !this.rules.level(userData.level)) {
            errors.push('سطح باید بین ۱ تا ۱۰ باشد');
        }
        
        if (userData.xp !== undefined && !this.rules.xp(userData.xp)) {
            errors.push('XP نمی‌تواند منفی باشد');
        }
        
        if (userData.streakDays !== undefined && !this.rules.streakDays(userData.streakDays)) {
            errors.push('استریک نمی‌تواند منفی باشد');
        }
        
        if (userData.dailyGoal !== undefined && !this.rules.dailyGoal(userData.dailyGoal)) {
            errors.push('هدف روزانه باید بین ۱ تا ۵۰ باشد');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

// ============ XP Calculator (Pure Functions) ============
class XPCalculator {
    /**
     * جدول XP مورد نیاز برای هر سطح
     * @static
     * @returns {number[]}
     */
    static get XP_TABLE() {
        return [
            0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500,
            6600, 7800, 9100, 10500, 12000, 13600, 15300, 17100, 19000
        ];
    }

    /**
     * محاسبه سطح بر اساس XP
     * @static
     * @param {number} xp - امتیاز تجربه
     * @returns {number} سطح
     */
    static calculateLevel(xp) {
        for (let i = this.XP_TABLE.length - 1; i >= 0; i--) {
            if (xp >= this.XP_TABLE[i]) {
                return i + 1;
            }
        }
        return 1;
    }

    /**
     * XP مورد نیاز برای سطح مشخص
     * @static
     * @param {number} level - سطح
     * @returns {number}
     */
    static getXpForLevel(level) {
        return level >= 1 && level <= this.XP_TABLE.length ? 
            this.XP_TABLE[level - 1] : 0;
    }

    /**
     * XP مورد نیاز برای سطح بعدی
     * @static
     * @param {number} level - سطح فعلی
     * @returns {number}
     */
    static getXpForNextLevel(level) {
        return level < this.XP_TABLE.length ? 
            this.XP_TABLE[level] : 20000;
    }

    /**
     * محاسبه پیشرفت در سطح فعلی
     * @static
     * @param {number} xp - XP فعلی
     * @param {number} level - سطح فعلی
     * @returns {Object} اطلاعات پیشرفت
     */
    static calculateProgress(xp, level) {
        const currentLevelXp = this.getXpForNextLevel(level);
        const prevLevelXp = level > 1 ? this.getXpForLevel(level - 1) : 0;
        const levelXpRange = currentLevelXp - prevLevelXp;
        const currentXpInLevel = xp - prevLevelXp;
        
        return {
            percentage: Math.min(100, Math.floor((currentXpInLevel / levelXpRange) * 100)),
            current: currentXpInLevel,
            total: levelXpRange,
            needed: levelXpRange - currentXpInLevel,
            nextLevel: level + 1
        };
    }
}

// ============ Result Pattern ============
class Result {
    /**
     * نتیجه موفق
     * @static
     * @param {any} data - داده
     * @returns {Object}
     */
    static success(data) {
        return { success: true, data, error: null };
    }

    /**
     * نتیجه ناموفق
     * @static
     * @param {string} error - پیام خطا
     * @returns {Object}
     */
    static failure(error) {
        return { success: false, data: null, error };
    }

    /**
     * اجرای ایمن تابع با Result Pattern
     * @static
     * @param {Function} fn - تابع اجرایی
     * @param {string} errorMessage - پیام خطای پیش‌فرض
     * @returns {Object}
     */
    static tryCatch(fn, errorMessage = 'خطای ناشناخته') {
        try {
            const data = fn();
            return this.success(data);
        } catch (error) {
            console.error(errorMessage, error);
            return this.failure(error.message || errorMessage);
        }
    }
}

// ============ User Model Class ============
class UserModel {
    /**
     * @param {Object} data - داده‌های اولیه کاربر
     */
    constructor(data = {}) {
        // شناسه‌ها
        this.id = data.id || this._generateId();
        
        // اطلاعات هویتی
        this.email = data.email || '';
        this.username = data.username || '';
        this.firstName = data.firstName || '';
        this.lastName = data.lastName || '';
        this.fullName = data.fullName || this._getFullName();
        
        // تنظیمات
        this.language = data.language || LanguageCode.PERSIAN;
        this.role = data.role || UserRole.STUDENT;
        this.level = this._validateLevel(data.level || UserLevel.BEGINNER);
        this.xp = Math.max(0, data.xp || 0);
        this.streakDays = Math.max(0, data.streakDays || 0);
        this.dailyGoal = Math.max(1, Math.min(50, data.dailyGoal || 5));
        
        // وضعیت
        this.isActive = data.isActive !== false;
        this.isVerified = data.isVerified || false;
        this.isPremium = data.isPremium || false;
        this.lastActive = data.lastActive || new Date().toISOString();
        
        // زمان‌بندی
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
        this.lastStreakUpdate = data.lastStreakUpdate || null;
        
        // آمار
        this.stats = {
            totalLessons: data.stats?.totalLessons || 0,
            completedLessons: data.stats?.completedLessons || 0,
            learnedWords: data.stats?.learnedWords || 0,
            totalTimeSpent: data.stats?.totalTimeSpent || 0,
            averageScore: data.stats?.averageScore || 0,
            ...data.stats
        };
        
        // تنظیمات کاربر
        this.settings = {
            notifications: {
                lessonReminder: data.settings?.notifications?.lessonReminder !== false,
                streakReminder: data.settings?.notifications?.streakReminder !== false
            },
            display: {
                theme: data.settings?.display?.theme || 'light',
                fontSize: data.settings?.display?.fontSize || 'medium'
            },
            ...data.settings
        };
        
        // دستاوردها
        this.achievements = new UserAchievements(this);
        if (data.achievements) {
            data.achievements.unlocked?.forEach(id => this.achievements.unlocked.add(id));
        }
        
        // اعتبارسنجی اولیه
        this._validate();
    }

    // ============ Public Methods ============

    /**
     * تبدیل به آبجکت ساده برای ذخیره‌سازی
     * @returns {Object}
     */
    toObject() {
        return {
            id: this.id,
            email: this.email,
            username: this.username,
            firstName: this.firstName,
            lastName: this.lastName,
            fullName: this.fullName,
            language: this.language,
            role: this.role,
            level: this.level,
            xp: this.xp,
            streakDays: this.streakDays,
            dailyGoal: this.dailyGoal,
            isActive: this.isActive,
            isVerified: this.isVerified,
            isPremium: this.isPremium,
            lastActive: this.lastActive,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            lastStreakUpdate: this.lastStreakUpdate,
            stats: { ...this.stats },
            settings: JSON.parse(JSON.stringify(this.settings)),
            achievements: this.achievements.toJSON()
        };
    }

    /**
     * تبدیل به JSON
     * @returns {Object}
     */
    toJSON() {
        const obj = this.toObject();
        return obj;
    }

    /**
     * اعتبارسنجی کامل مدل با Result Pattern
     * @returns {Object} نتیجه اعتبارسنجی
     */
    validate() {
        return Result.tryCatch(
            () => {
                const validation = UserValidator.validate(this.toObject());
                return validation;
            },
            'خطا در اعتبارسنجی کاربر'
        );
    }

    /**
     * به‌روزرسانی جزئی با Result Pattern
     * @param {Object} updates - تغییرات
     * @returns {Object} نتیجه با مدل جدید
     */
    update(updates) {
        return Result.tryCatch(
            () => {
                const updatedModel = new UserModel({
                    ...this.toObject(),
                    ...updates,
                    updatedAt: new Date().toISOString()
                });
                updatedModel.achievements = this.achievements;
                return updatedModel;
            },
            'خطا در به‌روزرسانی کاربر'
        );
    }

    /**
     * افزایش XP با Result Pattern
     * @param {number} amount - مقدار XP
     * @returns {Object} نتیجه با مدل جدید
     */
    addXp(amount) {
        if (amount <= 0) return Result.success(this);
        
        return Result.tryCatch(
            () => {
                const oldLevel = this.level;
                const newXp = this.xp + amount;
                const newLevel = XPCalculator.calculateLevel(newXp);
                
                const updatedUser = new UserModel({
                    ...this.toObject(),
                    xp: newXp,
                    level: newLevel,
                    stats: {
                        ...this.stats,
                        totalTimeSpent: this.stats.totalTimeSpent + Math.floor(amount / 10)
                    },
                    updatedAt: new Date().toISOString()
                });
                
                // بررسی دستاوردهای جدید
                const newAchievements = updatedUser.achievements.checkUnlocked();
                
                return {
                    user: updatedUser,
                    levelUp: newLevel > oldLevel,
                    newAchievements
                };
            },
            'خطا در افزایش XP'
        );
    }

    /**
     * افزایش استریک با Result Pattern
     * @returns {Object} نتیجه با مدل جدید
     */
    incrementStreak() {
        return Result.tryCatch(
            () => {
                const today = new Date().toDateString();
                const lastUpdate = this.lastStreakUpdate ? 
                    new Date(this.lastStreakUpdate).toDateString() : null;
                
                if (lastUpdate === today) {
                    return { user: this, streakIncreased: false };
                }
                
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                
                let newStreakDays;
                if (lastUpdate === yesterday.toDateString()) {
                    newStreakDays = this.streakDays + 1;
                } else {
                    newStreakDays = 1;
                }
                
                const updatedUser = new UserModel({
                    ...this.toObject(),
                    streakDays: newStreakDays,
                    lastStreakUpdate: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
                
                // بررسی دستاوردهای جدید
                const newAchievements = updatedUser.achievements.checkUnlocked();
                
                return {
                    user: updatedUser,
                    streakIncreased: true,
                    newStreakDays,
                    newAchievements
                };
            },
            'خطا در افزایش استریک'
        );
    }

    /**
     * دریافت آمار جامع کاربر
     * @returns {UserStatistics}
     */
    getStatistics() {
        return {
            level: this.level,
            xp: this.xp,
            streakDays: this.streakDays,
            totalLessons: this.stats.totalLessons,
            completedLessons: this.stats.completedLessons,
            learnedWords: this.stats.learnedWords,
            levelProgress: XPCalculator.calculateProgress(this.xp, this.level),
            completionRate: this.stats.totalLessons > 0 
                ? Math.floor((this.stats.completedLessons / this.stats.totalLessons) * 100) 
                : 0,
            totalTimeSpent: this._formatTime(this.stats.totalTimeSpent),
            achievements: this.achievements.getStats()
        };
    }

    /**
     * XP مورد نیاز برای سطح بعدی
     * @returns {number}
     */
    getXpForNextLevel() {
        return XPCalculator.getXpForNextLevel(this.level);
    }

    /**
     * ایجاد مدل کاربر پیش‌فرض
     * @static
     * @returns {UserModel}
     */
    static createDefault() {
        return new UserModel({
            username: 'کاربر جدید',
            language: LanguageCode.PERSIAN,
            role: UserRole.STUDENT,
            level: UserLevel.BEGINNER,
            xp: 0,
            streakDays: 0,
            dailyGoal: 5,
            isActive: true,
            isVerified: false,
            stats: {
                totalLessons: 0,
                completedLessons: 0,
                learnedWords: 0,
                totalTimeSpent: 0,
                averageScore: 0
            }
        });
    }

    /**
     * ایجاد مدل از داده‌های خام
     * @static
     * @param {Object} data - داده‌های خام
     * @returns {UserModel}
     */
    static fromRawData(data) {
        return new UserModel(data);
    }

    // ============ Private Methods ============

    /**
     * اعتبارسنجی داخلی
     * @private
     */
    _validate() {
        if (!this.fullName && (this.firstName || this.lastName)) {
            this.fullName = this._getFullName();
        }
        this.updatedAt = new Date().toISOString();
    }

    /**
     * اعتبارسنجی سطح
     * @private
     * @param {number} level - سطح
     * @returns {number}
     */
    _validateLevel(level) {
        return Math.max(1, Math.min(10, parseInt(level) || 1));
    }

    /**
     * تولید شناسه یکتا
     * @private
     * @returns {string}
     */
    _generateId() {
        return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * محاسبه نام کامل
     * @private
     * @returns {string}
     */
    _getFullName() {
        if (this.firstName && this.lastName) {
            return `${this.firstName} ${this.lastName}`.trim();
        }
        return this.firstName || this.lastName || this.username;
    }

    /**
     * فرمت زمان
     * @private
     * @param {number} minutes - دقیقه
     * @returns {string}
     */
    _formatTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        
        if (hours === 0) return `${mins} دقیقه`;
        if (mins === 0) return `${hours} ساعت`;
        return `${hours} ساعت و ${mins} دقیقه`;
    }
}

// ============ User Factory ============
class UserFactory {
    /**
     * ایجاد کاربر بر اساس نوع
     * @param {string} type - نوع کاربر
     * @param {Object} data - داده‌های اضافی
     * @returns {UserModel}
     */
    static create(type, data = {}) {
        switch(type) {
            case 'student':
                return new UserModel({
                    role: UserRole.STUDENT,
                    level: UserLevel.BEGINNER,
                    dailyGoal: 5,
                    ...data
                });
            case 'teacher':
                return new UserModel({
                    role: UserRole.TEACHER,
                    level: UserLevel.EXPERT,
                    isVerified: true,
                    ...data
                });
            case 'guest':
                return new UserModel({
                    role: UserRole.GUEST,
                    username: 'میهمان',
                    isActive: true,
                    isVerified: false,
                    ...data
                });
            default:
                return UserModel.createDefault();
        }
    }
}

// ============ Export ============
export {
    UserModel,
    UserFactory,
    UserValidator,
    XPCalculator,
    Result,
    UserRole,
    UserLevel,
    LanguageCode,
    Achievement,
    UserAchievements
};
