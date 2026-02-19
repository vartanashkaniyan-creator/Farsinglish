/**
 * مدل داده دستاوردها و نشان‌ها (Achievement Model) - نسخه نهایی
 * مسئولیت: تعریف ساختار داده برای دستاوردها، نشان‌ها و پیشرفت کاربر
 * 
 * اصول رعایت شده:
 * - تک‌وظیفگی (SRP): فقط تعریف ساختار داده و متدهای کمکی مرتبط
 * - Immutable: ایجاد نمونه‌های جدید به جای تغییر مستقیم
 * - اعتبارسنجی: بررسی صحت داده‌ها در زمان ساخت
 * - مستندسازی: JSDoc کامل برای همه فیلدها و متدها
 * - نوع‌دهی: تعریف دقیق تایپ‌ها با JSDoc
 * - متدهای کمکی: توابع مفید برای کار با مدل
 * - قابلیت توسعه: Serialization, Event System, Computed Properties, Deep Clone
 */

// ================ Enums و ثابت‌ها ================

/**
 * @readonly
 * @enum {string}
 */
export const ACHIEVEMENT_TYPES = {
    BADGE: 'badge',                 // نشان
    TROPHY: 'trophy',               // جام
    MILESTONE: 'milestone',         // نقطه عطف
    CHALLENGE: 'challenge'          // چالش
};

/**
 * @readonly
 * @enum {string}
 */
export const ACHIEVEMENT_TIERS = {
    BRONZE: 'bronze',               // برنز
    SILVER: 'silver',               // نقره
    GOLD: 'gold',                   // طلا
    PLATINUM: 'platinum',           // پلاتین
    DIAMOND: 'diamond'              // الماس
};

/**
 * @readonly
 * @enum {string}
 */
export const ACHIEVEMENT_CATEGORIES = {
    LEARNING: 'learning',           // یادگیری
    STREAK: 'streak',               // استریک
    PERFECTION: 'perfection',       // عالی
    EXPLORATION: 'exploration',     // کاوشگری
    SOCIAL: 'social',               // اجتماعی
    SPECIAL: 'special'              // ویژه
};

/**
 * @readonly
 * @enum {string}
 */
export const ACHIEVEMENT_STATUS = {
    LOCKED: 'locked',               // قفل شده
    IN_PROGRESS: 'in_progress',     // در حال پیشرفت
    COMPLETED: 'completed',         // تکمیل شده
    CLAIMED: 'claimed'              // دریافت شده
};

/**
 * @readonly
 * @enum {string}
 */
export const ACHIEVEMENT_VISIBILITY = {
    HIDDEN: 'hidden',               // مخفی تا زمان کشف
    VISIBLE: 'visible',             // قابل مشاهده
    SECRET: 'secret'                // رازآلود (بعد از دریافت مشخص می‌شود)
};

// ================ Type Definitions ================

/**
 * @typedef {Object} AchievementCriteria
 * @property {string} type - نوع معیار (مثلاً 'lessons_completed')
 * @property {number} target - مقدار هدف
 * @property {string} [operator] - عملگر مقایسه (>=, >, =, etc)
 * @property {Object} [metadata] - فراداده اضافی
 */

/**
 * @typedef {Object} AchievementReward
 * @property {number} [points] - امتیاز جایزه
 * @property {number} [experience] - تجربه جایزه
 * @property {string[]} [badges] - نشان‌های جایزه
 * @property {Object} [unlocks] - آیتم‌های باز شده
 */

/**
 * @typedef {Object} AchievementProgress
 * @property {number} current - مقدار فعلی
 * @property {number} target - مقدار هدف
 * @property {number} percent - درصد پیشرفت
 * @property {Date} last_updated - آخرین بروزرسانی
 * @property {Array} history - تاریخچه تغییرات
 */

/**
 * @typedef {Object} Achievement
 * @property {string} id - شناسه یکتای دستاورد
 * @property {keyof ACHIEVEMENT_TYPES} type - نوع دستاورد
 * @property {keyof ACHIEVEMENT_TIERS} tier - سطح دستاورد
 * @property {keyof ACHIEVEMENT_CATEGORIES} category - دسته‌بندی
 * @property {string} name - نام دستاورد
 * @property {string} description - توضیحات
 * @property {string} [short_description] - توضیح کوتاه
 * @property {string} icon - آیکون
 * @property {string} [icon_color] - رنگ آیکون
 * @property {keyof ACHIEVEMENT_VISIBILITY} visibility - وضعیت نمایش
 * @property {AchievementCriteria[]} criteria - معیارهای دریافت
 * @property {AchievementReward} rewards - جوایز
 * @property {string[]} prerequisites - پیش‌نیازها (آیدی دستاوردها)
 * @property {number} order - ترتیب نمایش
 * @property {Object} metadata - فراداده
 * @property {Object} timestamps - زمان‌ها
 */

/**
 * @typedef {Object} UserAchievement
 * @property {string} user_id - شناسه کاربر
 * @property {string} achievement_id - شناسه دستاورد
 * @property {keyof ACHIEVEMENT_STATUS} status - وضعیت
 * @property {AchievementProgress} progress - پیشرفت
 * @property {Date} [started_at] - زمان شروع
 * @property {Date} [completed_at] - زمان تکمیل
 * @property {Date} [claimed_at] - زمان دریافت جایزه
 * @property {Object} metadata - فراداده
 */

// ================ Simple Event Emitter (internal) ================

class SimpleEventEmitter {
    constructor() {
        this._events = new Map();
    }

    /**
     * ثبت شنونده رویداد
     * @param {string} event 
     * @param {Function} listener 
     */
    on(event, listener) {
        if (!this._events.has(event)) {
            this._events.set(event, []);
        }
        this._events.get(event).push(listener);
    }

    /**
     * حذف شنونده رویداد
     * @param {string} event 
     * @param {Function} listener 
     */
    off(event, listener) {
        if (this._events.has(event)) {
            const listeners = this._events.get(event);
            const index = listeners.indexOf(listener);
            if (index !== -1) listeners.splice(index, 1);
        }
    }

    /**
     * انتشار رویداد
     * @param {string} event 
     * @param {*} data 
     */
    emit(event, data) {
        if (this._events.has(event)) {
            this._events.get(event).forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    console.error('Event listener error:', error);
                }
            });
        }
    }
}

// ================ کلاس اصلی AchievementModel ================

class AchievementModel extends SimpleEventEmitter {
    /** @type {Achievement} */
    #data;

    /**
     * ایجاد نمونه جدید از دستاورد
     * @param {Achievement} data - داده‌های دستاورد
     * @throws {Error} در صورت نامعتبر بودن داده‌ها
     */
    constructor(data) {
        super();
        this.#validate(data);
        this.#data = this.#freeze(this.#normalize(data));
    }

    /**
     * اعتبارسنجی داده‌های ورودی
     * @private
     */
    #validate(data) {
        const errors = [];

        // فیلدهای اجباری
        const required_fields = ['id', 'name', 'description', 'type', 'tier', 'category', 'criteria'];
        for (const field of required_fields) {
            if (!data[field]) {
                errors.push(`field "${field}" is required`);
            }
        }

        // اعتبارسنجی type
        if (data.type && !Object.values(ACHIEVEMENT_TYPES).includes(data.type)) {
            errors.push(`invalid type: ${data.type}`);
        }

        // اعتبارسنجی tier
        if (data.tier && !Object.values(ACHIEVEMENT_TIERS).includes(data.tier)) {
            errors.push(`invalid tier: ${data.tier}`);
        }

        // اعتبارسنجی category
        if (data.category && !Object.values(ACHIEVEMENT_CATEGORIES).includes(data.category)) {
            errors.push(`invalid category: ${data.category}`);
        }

        // اعتبارسنجی visibility
        if (data.visibility && !Object.values(ACHIEVEMENT_VISIBILITY).includes(data.visibility)) {
            errors.push(`invalid visibility: ${data.visibility}`);
        }

        // اعتبارسنجی criteria
        if (data.criteria) {
            if (!Array.isArray(data.criteria)) {
                errors.push('criteria must be an array');
            } else {
                data.criteria.forEach((c, index) => {
                    if (!c.type || !c.target) {
                        errors.push(`criteria[${index}] must have type and target`);
                    }
                });
            }
        }

        if (errors.length > 0) {
            throw new Error(`Achievement validation failed: ${errors.join(', ')}`);
        }
    }

    /**
     * نرمال‌سازی داده‌ها (مقادیر پیش‌فرض)
     * @private
     */
    #normalize(data) {
        return {
            ...data,
            visibility: data.visibility || ACHIEVEMENT_VISIBILITY.VISIBLE,
            prerequisites: data.prerequisites || [],
            rewards: data.rewards || { points: 0, experience: 0, badges: [] },
            metadata: data.metadata || {},
            timestamps: {
                created_at: data.timestamps?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...data.timestamps
            }
        };
    }

    /**
     * ثابت کردن آبجکت (غیرقابل تغییر)
     * @private
     */
    #freeze(obj) {
        return Object.freeze(obj);
    }

    // ================ Getters ================

    /** @returns {string} */
    get id() { return this.#data.id; }

    /** @returns {keyof ACHIEVEMENT_TYPES} */
    get type() { return this.#data.type; }

    /** @returns {keyof ACHIEVEMENT_TIERS} */
    get tier() { return this.#data.tier; }

    /** @returns {keyof ACHIEVEMENT_CATEGORIES} */
    get category() { return this.#data.category; }

    /** @returns {string} */
    get name() { return this.#data.name; }

    /** @returns {string} */
    get description() { return this.#data.description; }

    /** @returns {string} */
    get icon() { return this.#data.icon; }

    /** @returns {keyof ACHIEVEMENT_VISIBILITY} */
    get visibility() { return this.#data.visibility; }

    /** @returns {AchievementCriteria[]} */
    get criteria() { return this.#data.criteria; }

    /** @returns {AchievementReward} */
    get rewards() { return this.#data.rewards; }

    /** @returns {string[]} */
    get prerequisites() { return this.#data.prerequisites; }

    /** @returns {Object} */
    get metadata() { return this.#data.metadata; }

    /** @returns {Object} */
    get timestamps() { return this.#data.timestamps; }

    /** @returns {Achievement} */
    to_json() { return { ...this.#data }; }

    // ================ متدهای کمکی ================

    /**
     * آیا دستاورد مخفی است؟
     * @returns {boolean}
     */
    is_hidden() {
        return this.#data.visibility === ACHIEVEMENT_VISIBILITY.HIDDEN;
    }

    /**
     * آیا دستاورد رازآلود است؟
     * @returns {boolean}
     */
    is_secret() {
        return this.#data.visibility === ACHIEVEMENT_VISIBILITY.SECRET;
    }

    /**
     * دریافت سطح عددی (برای مقایسه)
     * @returns {number}
     */
    get_tier_level() {
        const levels = {
            [ACHIEVEMENT_TIERS.BRONZE]: 1,
            [ACHIEVEMENT_TIERS.SILVER]: 2,
            [ACHIEVEMENT_TIERS.GOLD]: 3,
            [ACHIEVEMENT_TIERS.PLATINUM]: 4,
            [ACHIEVEMENT_TIERS.DIAMOND]: 5
        };
        return levels[this.#data.tier] || 0;
    }

    /**
     * دریافت امتیاز پایه بر اساس سطح
     * @returns {number}
     */
    get_base_points() {
        const points = {
            [ACHIEVEMENT_TIERS.BRONZE]: 10,
            [ACHIEVEMENT_TIERS.SILVER]: 25,
            [ACHIEVEMENT_TIERS.GOLD]: 50,
            [ACHIEVEMENT_TIERS.PLATINUM]: 100,
            [ACHIEVEMENT_TIERS.DIAMOND]: 200
        };
        return points[this.#data.tier] || 0;
    }

    /**
     * بررسی تساوی با دستاورد دیگر
     * @param {AchievementModel} other 
     * @returns {boolean}
     */
    equals(other) {
        if (!(other instanceof AchievementModel)) return false;
        return this.id === other.id;
    }

    // ================ Serialization ================

    /**
     * تبدیل به فرمت ذخیره‌سازی در دیتابیس
     * @returns {Object}
     */
    to_db() {
        return {
            id: this.id,
            type: this.type,
            tier: this.tier,
            category: this.category,
            name: this.name,
            description: this.description,
            short_description: this.#data.short_description,
            icon: this.icon,
            icon_color: this.#data.icon_color,
            visibility: this.visibility,
            criteria: this.criteria,
            rewards: this.rewards,
            prerequisites: this.prerequisites,
            order: this.#data.order,
            metadata: this.metadata,
            timestamps: this.timestamps
        };
    }

    /**
     * ساخت نمونه از روی داده دیتابیس
     * @param {Object} db_data 
     * @returns {AchievementModel}
     */
    static from_db(db_data) {
        return new AchievementModel(db_data);
    }

    // ================ Computed Properties (محاسبات هوشمند) ================

    /**
     * تخمین زمان مورد نیاز برای تکمیل (بر اساس معیارها)
     * @returns {number|null} زمان تخمینی به دقیقه یا null
     */
    get estimated_time_minutes() {
        // اینجا می‌توان بر اساس نوع معیارها تخمین زد
        // برای سادگی، یک مقدار ثابت بر اساس tier برمی‌گردانیم
        const time_map = {
            [ACHIEVEMENT_TIERS.BRONZE]: 30,
            [ACHIEVEMENT_TIERS.SILVER]: 120,
            [ACHIEVEMENT_TIERS.GOLD]: 300,
            [ACHIEVEMENT_TIERS.PLATINUM]: 600,
            [ACHIEVEMENT_TIERS.DIAMOND]: 1200
        };
        return time_map[this.tier] || null;
    }

    /**
     * نرخ دشواری (۱-۱۰)
     * @returns {number}
     */
    get difficulty_rating() {
        const base = this.get_tier_level() * 2; // 2,4,6,8,10
        const criteria_count = this.criteria.length;
        return Math.min(base + criteria_count, 10);
    }

    /**
     * آیا این دستاورد زنجیره‌ای است (دارای پیش‌نیاز)
     * @returns {boolean}
     */
    get is_chainable() {
        return this.prerequisites.length > 0;
    }

    // ================ Deep Clone ================

    /**
     * ایجاد کپی عمیق از نمونه
     * @returns {AchievementModel}
     */
    clone() {
        // استفاده از structuredClone اگر موجود باشد، وگرنه JSON parse/stringify
        if (typeof structuredClone === 'function') {
            return new AchievementModel(structuredClone(this.#data));
        }
        return new AchievementModel(JSON.parse(JSON.stringify(this.#data)));
    }

    // ================ Event Helpers ================

    /**
     * انتشار رویداد تغییر (برای استفاده توسط سرویس‌ها)
     * @protected
     */
    _emit_change() {
        this.emit('achievement:changed', { id: this.id, data: this.to_json() });
    }
}

// ================ کلاس UserAchievementModel ================

class UserAchievementModel extends SimpleEventEmitter {
    /** @type {UserAchievement} */
    #data;

    /**
     * ایجاد نمونه جدید از دستاورد کاربر
     * @param {UserAchievement} data - داده‌ها
     */
    constructor(data) {
        super();
        this.#validate(data);
        this.#data = this.#freeze(this.#normalize(data));
    }

    /**
     * اعتبارسنجی داده‌ها
     * @private
     */
    #validate(data) {
        if (!data.user_id) throw new Error('user_id is required');
        if (!data.achievement_id) throw new Error('achievement_id is required');

        if (data.status && !Object.values(ACHIEVEMENT_STATUS).includes(data.status)) {
            throw new Error(`invalid status: ${data.status}`);
        }
    }

    /**
     * نرمال‌سازی داده‌ها
     * @private
     */
    #normalize(data) {
        const now = new Date().toISOString();

        return {
            user_id: data.user_id,
            achievement_id: data.achievement_id,
            status: data.status || ACHIEVEMENT_STATUS.LOCKED,
            progress: {
                current: data.progress?.current || 0,
                target: data.progress?.target || 0,
                percent: data.progress?.percent || 0,
                last_updated: data.progress?.last_updated || now,
                history: data.progress?.history || []
            },
            started_at: data.started_at || (data.status === ACHIEVEMENT_STATUS.IN_PROGRESS ? now : null),
            completed_at: data.completed_at || null,
            claimed_at: data.claimed_at || null,
            metadata: data.metadata || {}
        };
    }

    /**
     * ثابت کردن آبجکت
     * @private
     */
    #freeze(obj) {
        return Object.freeze(obj);
    }

    // ================ Getters ================

    /** @returns {string} */
    get user_id() { return this.#data.user_id; }

    /** @returns {string} */
    get achievement_id() { return this.#data.achievement_id; }

    /** @returns {keyof ACHIEVEMENT_STATUS} */
    get status() { return this.#data.status; }

    /** @returns {AchievementProgress} */
    get progress() { return { ...this.#data.progress }; }

    /** @returns {Date} */
    get started_at() { return this.#data.started_at; }

    /** @returns {Date} */
    get completed_at() { return this.#data.completed_at; }

    /** @returns {Date} */
    get claimed_at() { return this.#data.claimed_at; }

    /** @returns {Object} */
    to_json() { return { ...this.#data }; }

    // ================ متدهای کمکی ================

    /**
     * بروزرسانی پیشرفت
     * @param {number} new_value - مقدار جدید
     * @returns {UserAchievementModel} نمونه جدید با پیشرفت بروزرسانی شده
     */
    update_progress(new_value) {
        const target = this.#data.progress.target;
        const old_value = this.#data.progress.current;

        const new_progress = {
            current: Math.min(new_value, target),
            target,
            percent: target > 0 ? Math.min(Math.round((new_value / target) * 100), 100) : 0,
            last_updated: new Date().toISOString(),
            history: [
                ...this.#data.progress.history,
                { value: new_value, timestamp: new Date().toISOString() }
            ].slice(-10) // نگه‌داری آخرین 10 تغییر
        };

        let new_status = this.#data.status;

        // تغییر وضعیت بر اساس پیشرفت
        if (new_progress.percent >= 100) {
            new_status = ACHIEVEMENT_STATUS.COMPLETED;
        } else if (new_progress.current > 0 && this.#data.status === ACHIEVEMENT_STATUS.LOCKED) {
            new_status = ACHIEVEMENT_STATUS.IN_PROGRESS;
        }

        const new_data = {
            ...this.#data,
            status: new_status,
            progress: new_progress,
            completed_at: new_progress.percent >= 100 && !this.#data.completed_at
                ? new Date().toISOString()
                : this.#data.completed_at
        };

        const new_instance = new UserAchievementModel(new_data);
        new_instance._emit_change(); // انتشار رویداد تغییر
        return new_instance;
    }

    /**
     * دریافت جایزه
     * @returns {UserAchievementModel} نمونه جدید با وضعیت CLAIMED
     */
    claim() {
        if (this.#data.status !== ACHIEVEMENT_STATUS.COMPLETED) {
            throw new Error('Cannot claim incomplete achievement');
        }

        const new_data = {
            ...this.#data,
            status: ACHIEVEMENT_STATUS.CLAIMED,
            claimed_at: new Date().toISOString()
        };

        const new_instance = new UserAchievementModel(new_data);
        new_instance._emit_change();
        return new_instance;
    }

    /**
     * آیا قابل دریافت است؟
     * @returns {boolean}
     */
    is_claimable() {
        return this.#data.status === ACHIEVEMENT_STATUS.COMPLETED && !this.#data.claimed_at;
    }

    /**
     * آیا در حال پیشرفت است؟
     * @returns {boolean}
     */
    is_in_progress() {
        return this.#data.status === ACHIEVEMENT_STATUS.IN_PROGRESS;
    }

    /**
     * آیا تکمیل شده؟
     * @returns {boolean}
     */
    is_completed() {
        return this.#data.status === ACHIEVEMENT_STATUS.COMPLETED ||
               this.#data.status === ACHIEVEMENT_STATUS.CLAIMED;
    }

    // ================ Serialization ================

    /**
     * تبدیل به فرمت ذخیره‌سازی در دیتابیس
     * @returns {Object}
     */
    to_db() {
        return {
            user_id: this.user_id,
            achievement_id: this.achievement_id,
            status: this.status,
            progress: this.progress,
            started_at: this.started_at,
            completed_at: this.completed_at,
            claimed_at: this.claimed_at,
            metadata: this.metadata
        };
    }

    /**
     * ساخت نمونه از روی داده دیتابیس
     * @param {Object} db_data 
     * @returns {UserAchievementModel}
     */
    static from_db(db_data) {
        return new UserAchievementModel(db_data);
    }

    // ================ Computed Properties ================

    /**
     * درصد پیشرفت به صورت اعشاری (۰-۱)
     * @returns {number}
     */
    get progress_ratio() {
        return this.progress.percent / 100;
    }

    /**
     * مقدار باقی‌مانده تا تکمیل
     * @returns {number}
     */
    get remaining_value() {
        return Math.max(0, this.progress.target - this.progress.current);
    }

    /**
     * آیا در ۲۴ ساعت اخیر تغییری داشته؟
     * @returns {boolean}
     */
    get recently_updated() {
        const last = new Date(this.progress.last_updated);
        const now = new Date();
        const diff_hours = (now - last) / (1000 * 60 * 60);
        return diff_hours < 24;
    }

    // ================ Deep Clone ================

    /**
     * ایجاد کپی عمیق
     * @returns {UserAchievementModel}
     */
    clone() {
        if (typeof structuredClone === 'function') {
            return new UserAchievementModel(structuredClone(this.#data));
        }
        return new UserAchievementModel(JSON.parse(JSON.stringify(this.#data)));
    }

    // ================ Event Helpers ================

    /**
     * انتشار رویداد تغییر
     * @protected
     */
    _emit_change() {
        this.emit('user_achievement:changed', {
            user_id: this.user_id,
            achievement_id: this.achievement_id,
            status: this.status,
            progress: this.progress
        });
    }
}

// ================ Factory Functions ================

/**
 * ایجاد نمونه Achievement از روی داده
 * @param {Achievement} data 
 * @returns {AchievementModel}
 */
export function create_achievement(data) {
    return new AchievementModel(data);
}

/**
 * ایجاد نمونه UserAchievement از روی داده
 * @param {UserAchievement} data 
 * @returns {UserAchievementModel}
 */
export function create_user_achievement(data) {
    return new UserAchievementModel(data);
}

/**
 * ایجاد یک Achievement پیش‌فرض برای تست
 * @returns {AchievementModel}
 */
export function create_sample_achievement() {
    return new AchievementModel({
        id: 'sample_achievement_001',
        type: ACHIEVEMENT_TYPES.BADGE,
        tier: ACHIEVEMENT_TIERS.BRONZE,
        category: ACHIEVEMENT_CATEGORIES.LEARNING,
        name: 'شروع کننده',
        description: 'اولین درس خود را کامل کنید',
        short_description: 'یک درس را تمام کن',
        icon: '🎯',
        icon_color: '#FFD700',
        visibility: ACHIEVEMENT_VISIBILITY.VISIBLE,
        criteria: [
            { type: 'lessons_completed', target: 1, operator: '>=' }
        ],
        rewards: {
            points: 10,
            experience: 50,
            badges: ['beginner_badge']
        },
        prerequisites: [],
        order: 1,
        metadata: {},
        timestamps: {
            created_at: new Date().toISOString()
        }
    });
}

// ================ Utility Functions ================

/**
 * مقایسه دو Achievement بر اساس سطح
 * @param {AchievementModel} a 
 * @param {AchievementModel} b 
 * @returns {number}
 */
export function compare_by_tier(a, b) {
    return b.get_tier_level() - a.get_tier_level();
}

/**
 * گروه‌بندی Achievement‌ها بر اساس دسته
 * @param {AchievementModel[]} achievements 
 * @returns {Object}
 */
export function group_by_category(achievements) {
    return achievements.reduce((acc, achievement) => {
        const category = achievement.category;
        if (!acc[category]) acc[category] = [];
        acc[category].push(achievement);
        return acc;
    }, {});
}

/**
 * فیلتر Achievement‌های قابل دریافت برای کاربر
 * @param {AchievementModel[]} all_achievements 
 * @param {UserAchievementModel[]} user_achievements 
 * @returns {AchievementModel[]}
 */
export function get_available_achievements(all_achievements, user_achievements) {
    const user_achievement_ids = new Set(
        user_achievements.map(ua => ua.achievement_id)
    );
    return all_achievements.filter(a => !user_achievement_ids.has(a.id));
}

// ================ Export ================

export {
    AchievementModel,
    UserAchievementModel
};

export default {
    AchievementModel,
    UserAchievementModel,
    ACHIEVEMENT_TYPES,
    ACHIEVEMENT_TIERS,
    ACHIEVEMENT_CATEGORIES,
    ACHIEVEMENT_STATUS,
    ACHIEVEMENT_VISIBILITY,
    create_achievement,
    create_user_achievement,
    create_sample_achievement,
    compare_by_tier,
    group_by_category,
    get_available_achievements
};
