// shared/models/user-model.js
/**
 * User Model - مدل داده کاربر برای لایه‌های مختلف برنامه
 * مسئولیت: نمایش، اعتبارسنجی و تبدیل داده‌های کاربر
 * اصل SRP: فقط مدیریت داده‌های کاربر و اعتبارسنجی
 * اصل DRY: استفاده از ثابت‌ها و توابع مشترک
 * اصل OCP: قابلیت توسعه بدون تغییر کد اصلی
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
    RUSSIAN: 'ru'
});

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
        this.dailyGoal = Math.max(1, data.dailyGoal || 5);
        
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
                showHints: data.settings?.display?.showHints !== false
            },
            learning: {
                srsEnabled: data.settings?.learning?.srsEnabled !== false,
                autoPlayAudio: data.settings?.learning?.autoPlayAudio || false,
                reviewBeforeNew: data.settings?.learning?.reviewBeforeNew || false,
                difficulty: data.settings?.learning?.difficulty || 'adaptive'
            },
            ...data.settings
        };
        
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
            settings: { ...this.settings }
        };
    }

    /**
     * تبدیل به JSON
     */
    toJSON() {
        return this.toObject();
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
        
        return {
            isValid: errors.length === 0,
            errors,
            model: this
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
        
        return updatedModel;
    }

    /**
     * افزایش XP
     */
    addXp(amount) {
        if (amount <= 0) return this;
        
        const newXp = this.xp + amount;
        const newLevel = this._calculateLevel(newXp);
        
        return this.update({
            xp: newXp,
            level: newLevel,
            stats: {
                ...this.stats,
                totalTimeSpent: this.stats.totalTimeSpent + (amount / 10) // هر 10 XP = 1 دقیقه
            }
        });
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
        
        // اگر دیروز streak افزایش یافته، ادامه دهد
        if (lastUpdate === yesterday.toDateString()) {
            return this.update({
                streakDays: this.streakDays + 1,
                lastStreakUpdate: new Date().toISOString()
            });
        }
        
        // در غیر این صورت reset شود
        return this.update({
            streakDays: 1,
            lastStreakUpdate: new Date().toISOString()
        });
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
            percentage: Math.min(100, (currentXpInLevel / levelXpRange) * 100),
            current: currentXpInLevel,
            total: levelXpRange,
            needed: levelXpRange - currentXpInLevel
        };
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
                accuracyRate: 0
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
                level: { type: 'number', min: 1, max: 10 },
                xp: { type: 'number', min: 0 },
                streakDays: { type: 'number', min: 0 },
                language: { type: 'string', enum: Object.values(LanguageCode) },
                role: { type: 'string', enum: Object.values(UserRole) }
            }
        };
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
    _isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
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
            return `${this.firstName} ${this.lastName}`;
        }
        return this.firstName || this.lastName || this.username;
    }

    /**
     * آواتار پیش‌فرض
     * @private
     */
    _getDefaultAvatar() {
        // استفاده از خدمات آواتار تصادفی
        const colors = ['FF6B6B', '4ECDC4', 'FFD166', '06D6A0', '118AB2', 'EF476F', '073B4C'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const initials = (this.username[0] || 'U').toUpperCase();
        
        return `https://ui-avatars.com/api/?name=${initials}&background=${color}&color=fff&size=128`;
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
                    ...data
                });
                
            case 'admin':
                return new UserModel({
                    role: UserRole.ADMIN,
                    level: UserLevel.MASTER,
                    isVerified: true,
                    isPremium: true,
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
    UserRole,
    UserLevel,
    LanguageCode
};
