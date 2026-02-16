
// shared/models/user-model.js
/**
 * User Model - مدل داده کاربر برای لایه‌های مختلف برنامه
 * مسئولیت: نمایش، اعتبارسنجی و تبدیل داده‌های کاربر
 * اصل SRP: فقط مدیریت داده‌های کاربر و اعتبارسنجی
 * اصل DRY: استفاده از ثابت‌ها و توابع مشترک
 * اصل OCP: قابلیت توسعه بدون تغییر کد اصلی
 * اصل DIP: وابستگی به انتزاع‌ها نه پیاده‌سازی
 * اصل ISP: اینترفیس‌های مجزا برای عملیات مختلف
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
    TURKISH: 'tr',
    SPANISH: 'es',
    FRENCH: 'fr',
    GERMAN: 'de',
    RUSSIAN: 'ru',
    CHINESE: 'zh',
    HINDI: 'hi'
});

const AchievementType = Object.freeze({
    LESSON: 'lesson',
    STREAK: 'streak',
    VOCABULARY: 'vocabulary',
    PERFECT: 'perfect',
    TIME: 'time',
    SOCIAL: 'social',
    SPECIAL: 'special'
});

// ============ Achievement Class ============
class Achievement {
    constructor(id, title, description, condition, reward, type = AchievementType.SPECIAL) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.condition = condition; // تابع شرط
        this.reward = reward; // { xp: number, badge: string, icon: string }
        this.type = type;
        this.createdAt = new Date().toISOString();
    }

    check(user) {
        try {
            return this.condition(user);
        } catch (error) {
            console.error(`Error checking achievement ${this.id}:`, error);
            return false;
        }
    }

    toJSON() {
        return {
            id: this.id,
            title: this.title,
            description: this.description,
            type: this.type,
            reward: this.reward
        };
    }
}

// ============ User Achievements Manager ============
class UserAchievements {
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
                'lesson_50',
                '🎓 محقق',
                '۵۰ درس را کامل کنید',
                user => user.stats.completedLessons >= 50,
                { xp: 500, badge: '🎓', icon: '👨‍🎓' },
                AchievementType.LESSON
            ),
            new Achievement(
                'lesson_100',
                '🏆 استاد',
                '۱۰۰ درس را کامل کنید',
                user => user.stats.completedLessons >= 100,
                { xp: 1000, badge: '🏆', icon: '👑' },
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
                'streak_30',
                '🌋 یک ماه بی‌وقفه',
                '۳۰ روز متوالی درس بخوانید',
                user => user.streakDays >= 30,
                { xp: 500, badge: '🌋', icon: '⚡' },
                AchievementType.STREAK
            ),
            new Achievement(
                'streak_100',
                '💯 صد روز طلایی',
                '۱۰۰ روز متوالی درس بخوانید',
                user => user.streakDays >= 100,
                { xp: 2000, badge: '💯', icon: '🌟' },
                AchievementType.STREAK
            ),
            new Achievement(
                'vocabulary_50',
                '🔤 واژه‌آموز',
                '۵۰ واژه یاد بگیرید',
                user => user.stats.learnedWords >= 50,
                { xp: 100, badge: '🔤', icon: '📝' },
                AchievementType.VOCABULARY
            ),
            new Achievement(
                'vocabulary_200',
                '📖 فرهنگ‌نویس',
                '۲۰۰ واژه یاد بگیرید',
                user => user.stats.learnedWords >= 200,
                { xp: 300, badge: '📖', icon: '📕' },
                AchievementType.VOCABULARY
            ),
            new Achievement(
                'vocabulary_500',
                '🗣️ سخنران',
                '۵۰۰ واژه یاد بگیرید',
                user => user.stats.learnedWords >= 500,
                { xp: 800, badge: '🗣️', icon: '💬' },
                AchievementType.VOCABULARY
            ),
            new Achievement(
                'perfect_10',
                '🎯 تیرانداز دقیق',
                '۱۰ تمرین را با نمره کامل بگذرانید',
                user => (user.stats.perfectScores || 0) >= 10,
                { xp: 200, badge: '🎯', icon: '✅' },
                AchievementType.PERFECT
            ),
            new Achievement(
                'time_10h',
                '⏳ زمان‌شناس',
                '۱۰ ساعت مطالعه کنید',
                user => user.stats.totalTimeSpent >= 600,
                { xp: 150, badge: '⏳', icon: '⌛' },
                AchievementType.TIME
            ),
            new Achievement(
                'time_50h',
                '⌛ استاد زمان',
                '۵۰ ساعت مطالعه کنید',
                user => user.stats.totalTimeSpent >= 3000,
                { xp: 500, badge: '⌛', icon: '⏰' },
                AchievementType.TIME
            ),
            new Achievement(
                'level_5',
                '⭐ پیشرو',
                'به سطح ۵ برسید',
                user => user.level >= 5,
                { xp: 200, badge: '⭐', icon: '🌟' },
                AchievementType.SPECIAL
            ),
            new Achievement(
                'level_10',
                '💎 افسانه',
                'به سطح ۱۰ برسید',
                user => user.level >= 10,
                { xp: 1000, badge: '💎', icon: '👑' },
                AchievementType.SPECIAL
            )
        ];
        
        achievements.forEach(a => this.achievements.set(a.id, a));
    }

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

    getUnlockedAchievements() {
        return Array.from(this.unlocked).map(id => ({
            ...this.achievements.get(id).toJSON(),
            unlockedAt: this.unlockedAt.get(id)
        }));
    }

    getLockedAchievements() {
        const locked = [];
        for (const [id, achievement] of this.achievements) {
            if (!this.unlocked.has(id)) {
                locked.push({
                    ...achievement.toJSON(),
                    progress: this._calculateProgress(achievement)
                });
            }
        }
        return locked;
    }

    _calculateProgress(achievement) {
        // محاسبه پیشرفت برای هر دستاورد
        switch(achievement.id) {
            case 'first_lesson':
            case 'lesson_10':
            case 'lesson_50':
            case 'lesson_100':
                return Math.min(100, (this.user.stats.completedLessons / 
                    this._getTargetForAchievement(achievement.id)) * 100);
                
            case 'streak_7':
            case 'streak_30':
            case 'streak_100':
                return Math.min(100, (this.user.streakDays / 
                    this._getTargetForAchievement(achievement.id)) * 100);
                
            case 'vocabulary_50':
            case 'vocabulary_200':
            case 'vocabulary_500':
                return Math.min(100, (this.user.stats.learnedWords / 
                    this._getTargetForAchievement(achievement.id)) * 100);
                
            default:
                return 0;
        }
    }

    _getTargetForAchievement(achievementId) {
        const targets = {
            'first_lesson': 1,
            'lesson_10': 10,
            'lesson_50': 50,
            'lesson_100': 100,
            'streak_7': 7,
            'streak_30': 30,
            'streak_100': 100,
            'vocabulary_50': 50,
            'vocabulary_200': 200,
            'vocabulary_500': 500
        };
        return targets[achievementId] || 1;
    }

    getStats() {
        return {
            total: this.achievements.size,
            unlocked: this.unlocked.size,
            locked: this.achievements.size - this.unlocked.size,
            totalXpEarned: this.getUnlockedAchievements()
                .reduce((sum, a) => sum + (a.reward?.xp || 0), 0)
        };
    }

    toJSON() {
        return {
            unlocked: Array.from(this.unlocked),
            unlockedAt: Array.from(this.unlockedAt.entries())
        };
    }
}

// ============ User Observer ============
class UserObserver {
    constructor() {
        this.observers = new Map();
    }

    subscribe(event, callback) {
        if (!this.observers.has(event)) {
            this.observers.set(event, []);
        }
        this.observers.get(event).push(callback);
        return this;
    }

    unsubscribe(event, callback) {
        if (this.observers.has(event)) {
            const callbacks = this.observers.get(event).filter(cb => cb !== callback);
            this.observers.set(event, callbacks);
        }
        return this;
    }

    notify(event, data) {
        if (this.observers.has(event)) {
            this.observers.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in observer for ${event}:`, error);
                }
            });
        }
    }

    clear() {
        this.observers.clear();
    }
}

// ============ User Model Class ============
class UserModel {
    constructor(data = {}) {
        // شناسه‌ها
        this.id = data.id || this._generateId();
        this.externalId = data.externalId || null;
        
        // اطلاعات هویتی
        this.email = data.email || '';
        this.username = data.username || '';
        this.phone = data.phone || '';
        this.firstName = data.firstName || '';
        this.lastName = data.lastName || '';
        this.fullName = data.fullName || this._getFullName();
        this.avatarUrl = data.avatarUrl || this._getDefaultAvatar();
        this.bio = data.bio || '';
        
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
        this.currentLessonId = data.currentLessonId || null;
        
        // زمان‌بندی
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
        this.lastStreakUpdate = data.lastStreakUpdate || null;
        this.premiumExpiresAt = data.premiumExpiresAt || null;
        
        // آمار و پیشرفت
        this.stats = {
            totalLessons: data.stats?.totalLessons || 0,
            completedLessons: data.stats?.completedLessons || 0,
            totalWords: data.stats?.totalWords || 0,
            learnedWords: data.stats?.learnedWords || 0,
            totalTimeSpent: data.stats?.totalTimeSpent || 0, // دقیقه
            averageScore: data.stats?.averageScore || 0,
            accuracyRate: data.stats?.accuracyRate || 0,
            perfectScores: data.stats?.perfectScores || 0,
            totalReviews: data.stats?.totalReviews || 0,
            ...data.stats
        };
        
        // تنظیمات کاربر
        this.settings = {
            notifications: {
                lessonReminder: data.settings?.notifications?.lessonReminder !== false,
                streakReminder: data.settings?.notifications?.streakReminder !== false,
                achievement: data.settings?.notifications?.achievement !== false,
                weeklyReport: data.settings?.notifications?.weeklyReport !== false
            },
            sound: {
                enabled: data.settings?.sound?.enabled !== false,
                volume: Math.max(0, Math.min(1, data.settings?.sound?.volume || 0.7))
            },
            display: {
                theme: data.settings?.display?.theme || 'light',
                fontSize: data.settings?.display?.fontSize || 'medium',
                showHints: data.settings?.display?.showHints !== false,
                highContrast: data.settings?.display?.highContrast || false
            },
            learning: {
                srsEnabled: data.settings?.learning?.srsEnabled !== false,
                autoPlayAudio: data.settings?.learning?.autoPlayAudio || false,
                reviewBeforeNew: data.settings?.learning?.reviewBeforeNew || false,
                difficulty: data.settings?.learning?.difficulty || 'adaptive',
                maxReviewsPerDay: data.settings?.learning?.maxReviewsPerDay || 50
            },
            privacy: {
                shareProgress: data.settings?.privacy?.shareProgress || false,
                publicProfile: data.settings?.privacy?.publicProfile || false,
                showStreak: data.settings?.privacy?.showStreak !== false
            },
            ...data.settings
        };
        
        // دستاوردها
        this.achievements = new UserAchievements(this);
        if (data.achievements) {
            data.achievements.unlocked?.forEach(id => this.achievements.unlocked.add(id));
        }
        
        // Observer
        this.observers = new UserObserver();
        
        // اعتبارسنجی اولیه
        this._validate();
    }

    // ============ Public Methods ============

    /**
     * تبدیل به آبجکت ساده برای ذخیره‌سازی
     */
    toObject() {
        return {
            id: this.id,
            externalId: this.externalId,
            email: this.email,
            username: this.username,
            phone: this.phone,
            firstName: this.firstName,
            lastName: this.lastName,
            fullName: this.fullName,
            avatarUrl: this.avatarUrl,
            bio: this.bio,
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
            currentLessonId: this.currentLessonId,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            lastStreakUpdate: this.lastStreakUpdate,
            premiumExpiresAt: this.premiumExpiresAt,
            stats: { ...this.stats },
            settings: JSON.parse(JSON.stringify(this.settings)),
            achievements: this.achievements.toJSON()
        };
    }

    /**
     * تبدیل به JSON
     */
    toJSON() {
        const obj = this.toObject();
        // حذف فیلدهای حساس
        delete obj.password;
        delete obj.password_hash;
        delete obj.salt;
        delete obj.resetToken;
        return obj;
    }

    /**
     * اعتبارسنجی کامل مدل
     */
    validate() {
        const errors = [];
        
        // اعتبارسنجی ایمیل
        if (!this.email || !this._isValidEmail(this.email)) {
            errors.push('ایمیل نامعتبر است');
        }
        
        // اعتبارسنجی نام کاربری
        if (!this.username || this.username.length < 3) {
            errors.push('نام کاربری باید حداقل ۳ کاراکتر باشد');
        }
        
        if (this.username.length > 50) {
            errors.push('نام کاربری نباید بیش از ۵۰ کاراکتر باشد');
        }
        
        // اعتبارسنجی سطح
        if (this.level < 1 || this.level > 10) {
            errors.push('سطح باید بین ۱ تا ۱۰ باشد');
        }
        
        // اعتبارسنجی XP
        if (this.xp < 0) {
            errors.push('XP نمی‌تواند منفی باشد');
        }
        
        // اعتبارسنجی streak
        if (this.streakDays < 0) {
            errors.push('تعداد روزهای استریک نمی‌تواند منفی باشد');
        }
        
        // اعتبارسنجی dailyGoal
        if (this.dailyGoal < 1 || this.dailyGoal > 50) {
            errors.push('هدف روزانه باید بین ۱ تا ۵۰ باشد');
        }
        
        // اعتبارسنجی آمار
        if (this.stats.totalLessons < this.stats.completedLessons) {
            errors.push('تعداد درس‌های تکمیل شده نمی‌تواند از کل درس‌ها بیشتر باشد');
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            model: this
        };
    }

    /**
     * اعتبارسنجی اسکیما
     */
    static validateSchema(data) {
        const schema = this.getSchema();
        const errors = [];
        
        for (const [field, rules] of Object.entries(schema.fields)) {
            const value = data[field];
            
            if (rules.required && (value === undefined || value === null || value === '')) {
                errors.push(`فیلد ${field} الزامی است`);
                continue;
            }
            
            if (value !== undefined && value !== null) {
                if (rules.type && typeof value !== rules.type) {
                    errors.push(`فیلد ${field} باید از نوع ${rules.type} باشد`);
                }
                
                if (rules.minLength && value.length < rules.minLength) {
                    errors.push(`فیلد ${field} باید حداقل ${rules.minLength} کاراکتر باشد`);
                }
                
                if (rules.maxLength && value.length > rules.maxLength) {
                    errors.push(`فیلد ${field} نباید بیشتر از ${rules.maxLength} کاراکتر باشد`);
                }
                
                if (rules.min !== undefined && value < rules.min) {
                    errors.push(`فیلد ${field} باید حداقل ${rules.min} باشد`);
                }
                
                if (rules.max !== undefined && value > rules.max) {
                    errors.push(`فیلد ${field} نباید بیشتر از ${rules.max} باشد`);
                }
                
                if (rules.enum && !rules.enum.includes(value)) {
                    errors.push(`فیلد ${field} باید یکی از مقادیر ${rules.enum.join(', ')} باشد`);
                }
                
                if (rules.format === 'email' && !this._isValidEmail(value)) {
                    errors.push(`فرمت ایمیل در فیلد ${field} نامعتبر است`);
                }
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * به‌روزرسانی جزئی
     */
    update(updates) {
        // ایجاد کپی از مدل فعلی
        const updatedModel = new UserModel({
            ...this.toObject(),
            ...updates,
            updatedAt: new Date().toISOString()
        });
        
        // کپی observerها
        updatedModel.observers = this.observers;
        
        return updatedModel;
    }

    /**
     * افزایش XP
     */
    addXp(amount) {
        if (amount <= 0) return this;
        
        const oldLevel = this.level;
        const newXp = this.xp + amount;
        const newLevel = this._calculateLevel(newXp);
        
        const updatedUser = this.update({
            xp: newXp,
            level: newLevel,
            stats: {
                ...this.stats,
                totalTimeSpent: this.stats.totalTimeSpent + Math.floor(amount / 10) // هر 10 XP = 1 دقیقه
            }
        });
        
        // اطلاع‌رسانی رویدادها
        if (newLevel > oldLevel) {
            updatedUser.observers.notify('levelUp', {
                oldLevel,
                newLevel,
                xpGained: amount
            });
        }
        
        // بررسی دستاوردهای جدید
        const newAchievements = updatedUser.achievements.checkUnlocked();
        if (newAchievements.length > 0) {
            updatedUser.observers.notify('achievementsUnlocked', {
                achievements: newAchievements.map(a => a.toJSON())
            });
        }
        
        return updatedUser;
    }

    /**
     * افزایش streak
     */
    incrementStreak() {
        const today = new Date().toDateString();
        const lastUpdate = this.lastStreakUpdate ? 
            new Date(this.lastStreakUpdate).toDateString() : null;
        
        // اگر امروز قبلاً streak افزایش یافته، تغییر نده
        if (lastUpdate === today) {
            return this;
        }
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        let newStreakDays;
        
        // اگر دیروز streak افزایش یافته، ادامه دهد
        if (lastUpdate === yesterday.toDateString()) {
            newStreakDays = this.streakDays + 1;
        } else {
            // در غیر این صورت reset شود
            newStreakDays = 1;
        }
        
        const updatedUser = this.update({
            streakDays: newStreakDays,
            lastStreakUpdate: new Date().toISOString()
        });
        
        // اطلاع‌رسانی رویدادها برای نقاط عطف
        if ([7, 30, 100, 365].includes(newStreakDays)) {
            updatedUser.observers.notify('streakMilestone', {
                days: newStreakDays
            });
        }
        
        // بررسی دستاوردهای جدید
        const newAchievements = updatedUser.achievements.checkUnlocked();
        if (newAchievements.length > 0) {
            updatedUser.observers.notify('achievementsUnlocked', {
                achievements: newAchievements.map(a => a.toJSON())
            });
        }
        
        return updatedUser;
    }

    /**
     * بررسی وضعیت premium
     */
    isPremiumActive() {
        if (!this.isPremium) return false;
        
        if (!this.premiumExpiresAt) return true;
        
        return new Date(this.premiumExpiresAt) > new Date();
    }

    /**
     * محاسبه XP مورد نیاز برای سطح بعدی
     */
    getXpForNextLevel() {
        const xpTable = [
            0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500,
            6600, 7800, 9100, 10500, 12000, 13600, 15300, 17100, 19000
        ];
        
        return this.level < 20 ? xpTable[this.level] : 20000;
    }

    /**
     * محاسبه پیشرفت به سطح بعدی
     */
    getLevelProgress() {
        const currentLevelXp = this.getXpForNextLevel();
        const prevLevelXp = this.level > 1 ? 
            this._calculateXpForLevel(this.level - 1) : 0;
        
        const levelXpRange = currentLevelXp - prevLevelXp;
        const currentXpInLevel = this.xp - prevLevelXp;
        
        return {
            percentage: Math.min(100, Math.floor((currentXpInLevel / levelXpRange) * 100)),
            current: currentXpInLevel,
            total: levelXpRange,
            needed: levelXpRange - currentXpInLevel,
            nextLevel: this.level + 1
        };
    }

    /**
     * دریافت آمار جامع کاربر
     */
    getStatistics() {
        return {
            level: this.level,
            xp: this.xp,
            streakDays: this.streakDays,
            totalLessons: this.stats.totalLessons,
            completedLessons: this.stats.completedLessons,
            completionRate: this.stats.totalLessons > 0 
                ? Math.floor((this.stats.completedLessons / this.stats.totalLessons) * 100) 
                : 0,
            learnedWords: this.stats.learnedWords,
            totalWords: this.stats.totalWords,
            vocabularyProgress: this.stats.totalWords > 0
                ? Math.floor((this.stats.learnedWords / this.stats.totalWords) * 100)
                : 0,
            averageScore: Math.floor(this.stats.averageScore),
            accuracyRate: Math.floor(this.stats.accuracyRate),
            perfectScores: this.stats.perfectScores || 0,
            totalTimeSpent: this._formatTime(this.stats.totalTimeSpent),
            levelProgress: this.getLevelProgress(),
            xpForNextLevel: this.getXpForNextLevel(),
            isPremiumActive: this.isPremiumActive(),
            achievements: this.achievements.getStats(),
            dailyGoal: this.dailyGoal,
            dailyProgress: Math.min(100, Math.floor((this.stats.completedLessons % this.dailyGoal) / this.dailyGoal * 100))
        };
    }

    /**
     * پیش‌بینی رسیدن به سطح بعدی
     */
    predictNextLevel() {
        const xpNeeded = this.getXpForNextLevel() - this.xp;
        
        // محاسبه میانگین XP دریافتی روزانه بر اساس فعالیت
        const daysSinceCreation = Math.max(1, Math.ceil(
            (new Date() - new Date(this.createdAt)) / (1000 * 60 * 60 * 24)
        ));
        
        const avgDailyXp = this.xp / daysSinceCreation;
        const daysNeeded = avgDailyXp > 0 ? Math.ceil(xpNeeded / avgDailyXp) : 30;
        
        const estimatedDate = new Date();
        estimatedDate.setDate(estimatedDate.getDate() + daysNeeded);
        
        return {
            xpNeeded,
            daysNeeded,
            estimatedDate: estimatedDate.toLocaleDateString('fa-IR'),
            avgDailyXp: Math.floor(avgDailyXp)
        };
    }

    /**
     * دریافت هدف پیشنهادی
     */
    getRecommendedGoal() {
        // پیشنهاد هدف روزانه بر اساس عملکرد
        if (this.streakDays >= 30) {
            return Math.min(30, this.dailyGoal + 5);
        }
        
        if (this.streakDays >= 7) {
            return Math.min(20, this.dailyGoal + 3);
        }
        
        if (this.stats.completedLessons > 50) {
            return Math.min(15, this.dailyGoal);
        }
        
        return Math.max(5, Math.floor(this.dailyGoal * 0.8));
    }

    /**
     * همگام‌سازی با سرور
     */
    syncWithServer(serverData) {
        // ایجاد کپی و به‌روزرسانی با داده سرور
        const mergedData = {
            ...this.toObject(),
            ...serverData,
            stats: {
                ...this.stats,
                ...(serverData.stats || {})
            },
            settings: {
                ...this.settings,
                ...(serverData.settings || {})
            },
            updatedAt: new Date().toISOString()
        };
        
        const syncedUser = new UserModel(mergedData);
        syncedUser.observers = this.observers;
        
        return syncedUser;
    }

    /**
     * دریافت تغییرات از تاریخ مشخص
     */
    getChangesSince(date) {
        const changes = [];
        const since = new Date(date);
        const updated = new Date(this.updatedAt);
        
        if (updated > since) {
            changes.push({
                field: 'user',
                oldValue: null,
                newValue: this.toJSON(),
                timestamp: this.updatedAt
            });
        }
        
        return changes;
    }

    /**
     * خروجی برای export
     */
    toExport() {
        return {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            user: this.toJSON()
        };
    }

    /**
     * ایجاد از export
     */
    static fromExport(exportedData) {
        if (exportedData.version !== '1.0') {
            throw new Error('نسخه پشتیبانی نمی‌شود');
        }
        return new UserModel(exportedData.user);
    }

    /**
     * تبدیل به CSV
     */
    toCSV() {
        const obj = this.toObject();
        return Object.values(obj).map(v => 
            typeof v === 'object' ? `"${JSON.stringify(v).replace(/"/g, '""')}"` : v
        ).join(',');
    }

    /**
     * تبدیل به FormData
     */
    toFormData() {
        const formData = new FormData();
        Object.entries(this.toObject()).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                if (typeof value === 'object') {
                    formData.append(key, JSON.stringify(value));
                } else {
                    formData.append(key, value.toString());
                }
            }
        });
        return formData;
    }

    /**
     * تبدیل به Query String
     */
    toQueryString() {
        const params = new URLSearchParams();
        Object.entries(this.toObject()).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                if (typeof value === 'object') {
                    params.append(key, JSON.stringify(value));
                } else {
                    params.append(key, value.toString());
                }
            }
        });
        return params.toString();
    }

    /**
     * ایجاد مدل کاربر پیش‌فرض
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
            isPremium: false,
            stats: {
                totalLessons: 0,
                completedLessons: 0,
                totalWords: 0,
                learnedWords: 0,
                totalTimeSpent: 0,
                averageScore: 0,
                accuracyRate: 0,
                perfectScores: 0,
                totalReviews: 0
            }
        });
    }

    /**
     * ایجاد مدل از داده‌های خام
     */
    static fromRawData(data) {
        return new UserModel(data);
    }

    /**
     * ساختار مدل برای نمایش
     */
    static getSchema() {
        return {
            fields: {
                id: { type: 'string', required: true },
                email: { type: 'string', required: true, format: 'email' },
                username: { type: 'string', required: true, minLength: 3, maxLength: 50 },
                firstName: { type: 'string', maxLength: 50 },
                lastName: { type: 'string', maxLength: 50 },
                phone: { type: 'string', pattern: '^09[0-9]{9}$' },
                level: { type: 'number', min: 1, max: 10 },
                xp: { type: 'number', min: 0 },
                streakDays: { type: 'number', min: 0 },
                dailyGoal: { type: 'number', min: 1, max: 50 },
                language: { type: 'string', enum: Object.values(LanguageCode) },
                role: { type: 'string', enum: Object.values(UserRole) },
                isActive: { type: 'boolean' },
                isVerified: { type: 'boolean' },
                isPremium: { type: 'boolean' }
            }
        };
    }

    /**
     * جستجو بین کاربران
     */
    static search(users, query) {
        const searchTerm = query.toLowerCase();
        return users.filter(user => 
            user.username.toLowerCase().includes(searchTerm) ||
            user.email.toLowerCase().includes(searchTerm) ||
            (user.firstName && user.firstName.toLowerCase().includes(searchTerm)) ||
            (user.lastName && user.lastName.toLowerCase().includes(searchTerm)) ||
            (user.phone && user.phone.includes(searchTerm))
        );
    }

    /**
     * فیلتر بر اساس سطح
     */
    static filterByLevel(users, minLevel, maxLevel) {
        return users.filter(user => 
            user.level >= minLevel && user.level <= maxLevel
        );
    }

    /**
     * فیلتر بر اساس فعالیت
     */
    static filterByActive(users, days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        
        return users.filter(user => 
            new Date(user.lastActive) >= cutoff
        );
    }

    /**
     * فیلتر بر اساس نقش
     */
    static filterByRole(users, role) {
        return users.filter(user => user.role === role);
    }

    /**
     * مرتب‌سازی کاربران
     */
    static sort(users, by = 'xp', order = 'desc') {
        const sorted = [...users];
        
        sorted.sort((a, b) => {
            let valA, valB;
            
            switch(by) {
                case 'xp':
                    valA = a.xp;
                    valB = b.xp;
                    break;
                case 'level':
                    valA = a.level;
                    valB = b.level;
                    break;
                case 'streak':
                    valA = a.streakDays;
                    valB = b.streakDays;
                    break;
                case 'lastActive':
                    valA = new Date(a.lastActive).getTime();
                    valB = new Date(b.lastActive).getTime();
                    break;
                case 'created':
                    valA = new Date(a.createdAt).getTime();
                    valB = new Date(b.createdAt).getTime();
                    break;
                default:
                    valA = a[by];
                    valB = b[by];
            }
            
            if (order === 'desc') {
                return valB - valA;
            } else {
                return valA - valB;
            }
        });
        
        return sorted;
    }

    // ============ Observer Methods ============

    /**
     * اشتراک در رویداد
     */
    on(event, callback) {
        this.observers.subscribe(event, callback);
        return this;
    }

    /**
     * لغو اشتراک
     */
    off(event, callback) {
        this.observers.unsubscribe(event, callback);
        return this;
    }

    // ============ Private Methods ============

    /**
     * اعتبارسنجی داخلی
     * @private
     */
    _validate() {
        // تنظیم fullName اگر خالی است
        if (!this.fullName && (this.firstName || this.lastName)) {
            this.fullName = this._getFullName();
        }
        
        // تنظیم avatar پیش‌فرض
        if (!this.avatarUrl) {
            this.avatarUrl = this._getDefaultAvatar();
        }
        
        // تنظیم updatedAt
        this.updatedAt = new Date().toISOString();
    }

    /**
     * اعتبارسنجی ایمیل
     * @private
     */
    static _isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    _isValidEmail(email) {
        return UserModel._isValidEmail(email);
    }

    /**
     * اعتبارسنجی سطح
     * @private
     */
    _validateLevel(level) {
        return Math.max(1, Math.min(10, parseInt(level) || 1));
    }

    /**
     * تولید شناسه یکتا
     * @private
     */
    _generateId() {
        return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * محاسبه نام کامل
     * @private
     */
    _getFullName() {
        if (this.firstName && this.lastName) {
            return `${this.firstName} ${this.lastName}`.trim();
        }
        return this.firstName || this.lastName || this.username;
    }

    /**
     * آواتار پیش‌فرض
     * @private
     */
    _getDefaultAvatar() {
        const colors = ['FF6B6B', '4ECDC4', 'FFD166', '06D6A0', '118AB2', 'EF476F', '073B4C'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const initials = (this.username[0] || 'U').toUpperCase();
        
        return `https://ui-avatars.com/api/?name=${initials}&background=${color}&color=fff&size=128&bold=true&format=svg`;
    }

    /**
     * محاسبه سطح بر اساس XP
     * @private
     */
    _calculateLevel(xp) {
        const levels = [
            0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500,
            6600, 7800, 9100, 10500, 12000, 13600, 15300, 17100, 19000
        ];
        
        for (let i = levels.length - 1; i >= 0; i--) {
            if (xp >= levels[i]) {
                return i + 1;
            }
        }
        return 1;
    }

    /**
     * محاسبه XP مورد نیاز برای یک سطح
     * @private
     */
    _calculateXpForLevel(level) {
        const xpTable = [
            0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500,
            6600, 7800, 9100, 10500, 12000, 13600, 15300, 17100, 19000
        ];
        
        return level >= 1 && level <= 20 ? xpTable[level - 1] : 0;
    }

    /**
     * فرمت زمان
     * @private
     */
    _formatTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        
        if (hours === 0) {
            return `${mins} دقیقه`;
        } else if (mins === 0) {
            return `${hours} ساعت`;
        } else {
            return `${hours} ساعت و ${mins} دقیقه`;
        }
    }
}

// ============ User Factory ============
class UserFactory {
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
                    dailyGoal: 10,
                    stats: {
                        totalLessons: 100,
                        completedLessons: 80,
                        ...data.stats
                    },
                    ...data
                });
                
            case 'admin':
                return new UserModel({
                    role: UserRole.ADMIN,
                    level: UserLevel.MASTER,
                    isVerified: true,
                    isPremium: true,
                    dailyGoal: 5,
                    ...data
                });
                
            case 'guest':
                return new UserModel({
                    role: UserRole.GUEST,
                    username: 'میهمان',
                    isActive: true,
                    isVerified: false,
                    isPremium: false,
                    ...data
                });
                
            default:
                return UserModel.createDefault();
        }
    }

    static createBatch(type, count, baseData = {}) {
        const users = [];
        for (let i = 0; i < count; i++) {
            users.push(this.create(type, {
                ...baseData,
                username: `${baseData.username || 'user'}_${i + 1}`,
                email: baseData.email ? 
                    baseData.email.replace('@', `${i + 1}@`) : 
                    `user${i + 1}@example.com`
            }));
        }
        return users;
    }
}

// ============ Export ============
export {
    UserModel,
    UserFactory,
    UserRole,
    UserLevel,
    LanguageCode,
    Achievement,
    UserAchievements,
    UserObserver
};
