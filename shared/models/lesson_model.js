/**
 * @fileoverview مدل داده درس برای سیستم آموزش زبان Farsinglish
 * @author Farsinglish Team
 * @version 1.0.0
 */

/**
 * @typedef {Object} LessonContent
 * @property {string} text - متن اصلی درس
 * @property {string|null} audioUrl - آدرس فایل صوتی
 * @property {string|null} videoUrl - آدرس فایل ویدیویی
 * @property {Array<string>} images - لیست تصاویر
 * @property {Array<Exercise>} exercises - لیست تمرین‌ها
 * @property {Array<Vocabulary>} vocabulary - لیست لغات
 * @property {Array<string>} grammarPoints - نکات گرامری
 */

/**
 * @typedef {Object} Vocabulary
 * @property {string} id - شناسه کلمه
 * @property {string} term - کلمه به انگلیسی
 * @property {string} meaning - معنی فارسی
 * @property {Array<string>} examples - مثال‌ها
 * @property {boolean} mastered - آیا مسلط شده
 */

/**
 * @typedef {Object} Exercise
 * @property {string} id - شناسه تمرین
 * @property {string} type - نوع تمرین
 * @property {string} title - عنوان تمرین
 * @property {Array<Object>} questions - سوالات
 * @property {boolean} completed - تکمیل شده؟
 */

/**
 * @typedef {Object} SRSData
 * @property {number} easeFactor - فاکتور آسانی (۱.۳ تا ۵.۰)
 * @property {number} interval - فاصله مرور بر حسب روز
 * @property {string|null} nextReview - تاریخ مرور بعدی
 * @property {number} reviewCount - تعداد مرورها
 * @property {string|null} lastReviewed - آخرین مرور
 * @property {number} streak - تعداد پاسخ‌های پشت سر هم صحیح
 * @property {number} lastQuality - کیفیت آخرین پاسخ (۰-۵)
 * @property {number} totalReviews - کل مرورها
 */

/**
 * @typedef {Object} LessonStats
 * @property {number} totalAttempts - کل تلاش‌ها
 * @property {number} averageScore - میانگین نمرات
 * @property {number} completionRate - درصد تکمیل
 * @property {number} averageTimeSpent - میانگین زمان صرف شده
 * @property {number} bestScore - بهترین نمره
 * @property {number} totalTimeSpent - کل زمان صرف شده
 */

/**
 * @typedef {Object} LessonMetadata
 * @property {number} version - نسخه درس
 * @property {string} locale - زبان (fa/en)
 * @property {string} createdBy - ایجاد کننده
 */

/**
 * @typedef {Object} LessonValidationResult
 * @property {boolean} isValid - معتبر بودن
 * @property {Array<Object>} errors - لیست خطاها
 * @property {LessonModel} model - مدل درس
 */

/**
 * @typedef {Object} LessonWarning
 * @property {string} field - فیلد مرتبط
 * @property {string} message - پیام اخطار
 */

/**
 * @typedef {Object} LessonSummary
 * @property {string} id - شناسه درس
 * @property {string} title - عنوان درس
 * @property {string} type - نوع درس
 * @property {number} difficulty - سطح سختی
 * @property {number} order - ترتیب
 * @property {string} status - وضعیت
 * @property {number} xpReward - جایزه XP
 * @property {number} estimatedDuration - زمان تخمینی
 * @property {boolean} isAvailable - قابل دسترسی؟
 * @property {number} progress - درصد پیشرفت
 * @property {boolean} dueForReview - نیاز به مرور؟
 */

/**
 * @typedef {Object} SRSStats
 * @property {boolean} mastered - مسلط شده؟
 * @property {boolean} due - نیاز به مرور؟
 * @property {number} progress - درصد پیشرفت
 * @property {number} retention - نرخ نگهداری
 * @property {string} stage - مرحله SRS
 * @property {string|null} nextReview - مرور بعدی
 * @property {number} reviewCount - تعداد مرورها
 * @property {number} interval - فاصله مرور
 * @property {number} easeFactor - فاکتور آسانی
 * @property {number} streak - رکورد پشت سر هم
 */

/**
 * @typedef {Object} DetailedStats
 * @property {Object} general - آمار عمومی
 * @property {SRSStats} srs - آمار SRS
 * @property {Object} vocabulary - آمار لغات
 * @property {Object} exercises - آمار تمرین‌ها
 * @property {string} mastery - سطح تسلط
 * @property {number} progress - درصد پیشرفت
 */

/**
 * @typedef {Object} ReviewRecommendation
 * @property {string} action - اقدام پیشنهادی
 * @property {string} message - پیام
 * @property {string} priority - اولویت
 * @property {string} reason - دلیل
 */

/**
 * @typedef {Object} MasteryPrediction
 * @property {number} remainingReviews - مرورهای باقیمانده
 * @property {number} estimatedMinutes - زمان تخمینی (دقیقه)
 * @property {number} estimatedDays - روزهای تخمینی
 * @property {number} confidence - درصد اطمینان
 */

/**
 * @typedef {Object} LessonDiff
 * @property {boolean} hasChanges - آیا تغییری داشته؟
 * @property {Array<Object>} changes - لیست تغییرات
 * @property {string} timestamp - زمان مقایسه
 */

// ============ Constants ============

/**
 * انواع درس
 * @readonly
 * @enum {string}
 */
const LessonType = Object.freeze({
    /** درس لغت و واژگان */
    VOCABULARY: 'vocabulary',
    /** درس دستور زبان */
    GRAMMAR: 'grammar',
    /** درس شنیداری */
    LISTENING: 'listening',
    /** درس گفتاری */
    SPEAKING: 'speaking',
    /** درس خواندن */
    READING: 'reading',
    /** درس نوشتاری */
    WRITING: 'writing',
    /** درس ترکیبی */
    MIXED: 'mixed'
});

/**
 * سطح سختی درس
 * @readonly
 * @enum {number}
 */
const DifficultyLevel = Object.freeze({
    /** آسان */
    EASY: 1,
    /** متوسط */
    MEDIUM: 2,
    /** سخت */
    HARD: 3,
    /** پیشرفته */
    ADVANCED: 4,
    /** خبره */
    EXPERT: 5
});

/**
 * وضعیت درس
 * @readonly
 * @enum {string}
 */
const LessonStatus = Object.freeze({
    /** قفل شده */
    LOCKED: 'locked',
    /** باز شده */
    UNLOCKED: 'unlocked',
    /** در حال انجام */
    IN_PROGRESS: 'in_progress',
    /** تکمیل شده */
    COMPLETED: 'completed',
    /** نیاز به مرور */
    REVIEW_PENDING: 'review_pending',
    /** مسلط شده */
    MASTERED: 'mastered'
});

/**
 * سطح تسلط
 * @readonly
 * @enum {string}
 */
const MasteryLevel = Object.freeze({
    /** تازه کار */
    NOVICE: 'novice',
    /** مبتدی */
    BEGINNER: 'beginner',
    /** متوسط */
    INTERMEDIATE: 'intermediate',
    /** پیشرفته */
    ADVANCED: 'advanced',
    /** خبره */
    EXPERT: 'expert'
});

/**
 * فواصل مرور SRS بر اساس سطح سختی
 * @readonly
 * @enum {Array<number>}
 */
const SRSIntervals = Object.freeze({
    [DifficultyLevel.EASY]: [1, 3, 7, 14, 30, 60, 90, 180],
    [DifficultyLevel.MEDIUM]: [1, 2, 5, 10, 21, 40, 70, 120],
    [DifficultyLevel.HARD]: [1, 1, 3, 7, 14, 28, 56, 100],
    [DifficultyLevel.ADVANCED]: [1, 1, 2, 5, 10, 20, 40, 80],
    [DifficultyLevel.EXPERT]: [1, 1, 1, 3, 7, 14, 28, 56]
});

// ============ Error Classes ============

/**
 * خطای پایه مدل درس
 * @extends Error
 */
class LessonModelError extends Error {
    /**
     * @param {string} message - پیام خطا
     * @param {string|null} [field=null] - فیلد مرتبط با خطا
     * @param {Error|null} [cause=null] - خطای اصلی
     */
    constructor(message, field = null, cause = null) {
        super(message);
        this.name = 'LessonModelError';
        /** @type {string|null} */
        this.field = field;
        /** @type {Error|null} */
        this.cause = cause;
        /** @type {string} */
        this.timestamp = new Date().toISOString();
    }
}

/**
 * خطای اعتبارسنجی درس
 * @extends LessonModelError
 */
class LessonValidationError extends LessonModelError {
    /**
     * @param {Array<Object>} errors - لیست خطاهای اعتبارسنجی
     */
    constructor(errors) {
        super('اعتبارسنجی درس با خطا مواجه شد');
        this.name = 'LessonValidationError';
        /** @type {Array<Object>} */
        this.errors = errors;
    }
}

// ============ Lesson Model Class ============

/**
 * کلاس اصلی مدل درس
 * @class
 * @classdesc مدیریت داده‌های درس با پشتیبانی کامل از SRS
 */
class LessonModel {
    /**
     * ایجاد یک نمونه جدید از درس
     * @param {Object} data - داده‌های اولیه درس
     * @param {string} [data.id] - شناسه درس (تولید خودکار در صورت عدم وجود)
     * @param {string} [data.courseId=null] - شناسه دوره
     * @param {string} [data.moduleId=null] - شناسه ماژول
     * @param {string} data.title - عنوان درس
     * @param {string} [data.description=''] - توضیحات درس
     * @param {LessonType} [data.type=LessonType.VOCABULARY] - نوع درس
     * @param {string} [data.category='general'] - دسته‌بندی
     * @param {Array<string>} [data.tags=[]] - برچسب‌ها
     * @param {DifficultyLevel} [data.difficulty=DifficultyLevel.MEDIUM] - سطح سختی
     * @param {number} [data.order=1] - ترتیب درس
     * @param {LessonContent} [data.content={}] - محتوای درس
     * @throws {LessonModelError} در صورت خطا در ساخت
     */
    constructor(data = {}) {
        try {
            // شناسه‌ها
            this.id = data.id || this._generateId();
            this.courseId = data.courseId || null;
            this.moduleId = data.moduleId || null;
            
            // اطلاعات اصلی
            this.title = data.title || '';
            this.description = data.description || '';
            this.type = this._validateType(data.type || LessonType.VOCABULARY);
            this.category = data.category || 'general';
            this.tags = Array.isArray(data.tags) ? [...data.tags] : [];
            this.difficulty = this._validateDifficulty(data.difficulty || DifficultyLevel.MEDIUM);
            this.order = Math.max(1, data.order || 1);
            
            // محتوا
            this.content = {
                text: data.content?.text || '',
                audioUrl: data.content?.audioUrl || null,
                videoUrl: data.content?.videoUrl || null,
                images: Array.isArray(data.content?.images) ? [...data.content.images] : [],
                exercises: Array.isArray(data.content?.exercises) ? this._validateExercises(data.content.exercises) : [],
                vocabulary: Array.isArray(data.content?.vocabulary) ? this._validateVocabulary(data.content.vocabulary) : [],
                grammarPoints: Array.isArray(data.content?.grammarPoints) ? [...data.content.grammarPoints] : [],
                ...data.content
            };
            
            // پیش‌نیازها
            this.prerequisites = Array.isArray(data.prerequisites) ? [...data.prerequisites] : [];
            this.requiredScore = Math.max(0, data.requiredScore || 0);
            
            // پاداش‌ها
            this.xpReward = Math.max(0, data.xpReward || 100);
            this.coinReward = Math.max(0, data.coinReward || 10);
            this.unlockables = Array.isArray(data.unlockables) ? [...data.unlockables] : [];
            
            // زمان‌بندی
            this.estimatedDuration = Math.max(1, data.estimatedDuration || 10);
            this.maxAttempts = Math.max(1, data.maxAttempts || 3);
            
            // وضعیت
            this.status = this._validateStatus(data.status || LessonStatus.LOCKED);
            this.isActive = data.isActive !== false;
            this.isFree = data.isFree !== false;
            this.isPremium = data.isPremium || false;
            
            // آمار
            this.stats = {
                totalAttempts: Math.max(0, data.stats?.totalAttempts || 0),
                averageScore: Math.max(0, Math.min(100, data.stats?.averageScore || 0)),
                completionRate: Math.max(0, Math.min(100, data.stats?.completionRate || 0)),
                averageTimeSpent: Math.max(0, data.stats?.averageTimeSpent || 0),
                bestScore: Math.max(0, Math.min(100, data.stats?.bestScore || 0)),
                totalTimeSpent: Math.max(0, data.stats?.totalTimeSpent || 0),
                ...data.stats
            };
            
            // SRS Data
            this.srsData = {
                easeFactor: this._validateEaseFactor(data.srsData?.easeFactor || 2.5),
                interval: Math.max(0, data.srsData?.interval || 1),
                nextReview: data.srsData?.nextReview || null,
                reviewCount: Math.max(0, data.srsData?.reviewCount || 0),
                lastReviewed: data.srsData?.lastReviewed || null,
                streak: Math.max(0, data.srsData?.streak || 0),
                lastQuality: Math.max(0, Math.min(5, data.srsData?.lastQuality || 0)),
                totalReviews: Math.max(0, data.srsData?.totalReviews || 0),
                ...data.srsData
            };
            
            // زمان‌ها
            this.createdAt = data.createdAt || new Date().toISOString();
            this.updatedAt = new Date().toISOString();
            this.publishedAt = data.publishedAt || null;
            
            // فراداده
            this.metadata = {
                version: data.metadata?.version || 1,
                locale: data.metadata?.locale || 'fa',
                createdBy: data.metadata?.createdBy || 'system',
                ...data.metadata
            };
            
            // اعتبارسنجی اولیه
            this._validate();
            
        } catch (error) {
            throw new LessonModelError('خطا در ساخت درس: ' + error.message, null, error);
        }
    }

    // ============ Computed Properties (Getters) ============

    /**
     * درصد پیشرفت درس
     * @type {number}
     */
    get progress() {
        return this.getProgress();
    }

    /**
     * آیا درس قفل است؟
     * @type {boolean}
     */
    get isLocked() {
        return this.status === LessonStatus.LOCKED;
    }

    /**
     * آیا درس باز است؟
     * @type {boolean}
     */
    get isUnlocked() {
        return this.status === LessonStatus.UNLOCKED;
    }

    /**
     * آیا درس در حال انجام است؟
     * @type {boolean}
     */
    get isInProgress() {
        return this.status === LessonStatus.IN_PROGRESS;
    }

    /**
     * آیا درس تکمیل شده است؟
     * @type {boolean}
     */
    get isCompleted() {
        return this.status === LessonStatus.COMPLETED;
    }

    /**
     * آیا درس نیاز به مرور دارد؟
     * @type {boolean}
     */
    get isReviewPending() {
        return this.status === LessonStatus.REVIEW_PENDING;
    }

    /**
     * آیا درس مسلط شده است؟
     * @type {boolean}
     */
    get isMastered() {
        return this.status === LessonStatus.MASTERED;
    }

    /**
     * آیا درس برای مرور آماده است؟
     * @type {boolean}
     */
    get isAvailable() {
        return this.isAvailableForReview();
    }

    /**
     * نرخ نگهداری
     * @type {number}
     */
    get retention() {
        return this._calculateRetentionRate();
    }

    /**
     * مرحله SRS
     * @type {string}
     */
    get srsStage() {
        return this._getSRSStage();
    }

    // ============ Public Methods ============

    /**
     * تبدیل به آبجکت ساده
     * @returns {Object} آبجکت ساده شده با تمام فیلدها
     */
    toObject() {
        return {
            id: this.id,
            courseId: this.courseId,
            moduleId: this.moduleId,
            title: this.title,
            description: this.description,
            type: this.type,
            category: this.category,
            tags: [...this.tags],
            difficulty: this.difficulty,
            order: this.order,
            content: { ...this.content },
            prerequisites: [...this.prerequisites],
            requiredScore: this.requiredScore,
            xpReward: this.xpReward,
            coinReward: this.coinReward,
            unlockables: [...this.unlockables],
            estimatedDuration: this.estimatedDuration,
            maxAttempts: this.maxAttempts,
            status: this.status,
            isActive: this.isActive,
            isFree: this.isFree,
            isPremium: this.isPremium,
            stats: { ...this.stats },
            srsData: { ...this.srsData },
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            publishedAt: this.publishedAt,
            metadata: { ...this.metadata }
        };
    }

    /**
     * تبدیل به JSON (برای JSON.stringify)
     * @returns {Object} آبجکت قابل تبدیل به JSON
     */
    toJSON() {
        return this.toObject();
    }

    /**
     * تبدیل به فرمت مناسب برای IndexedDB
     * @returns {Object} آبجکت مناسب برای ذخیره در دیتابیس
     */
    toDBFormat() {
        const obj = this.toObject();
        // حذف فیلدهای محاسباتی
        delete obj.stats.averageScore;
        return obj;
    }

    /**
     * تبدیل به فرمت مناسب برای API
     * @returns {Object} آبجکت مناسب برای ارسال به سرور
     */
    toAPIFormat() {
        const obj = this.toObject();
        // حذف فیلدهای داخلی
        delete obj.stats;
        delete obj.srsData.easeFactor;
        delete obj.metadata;
        return obj;
    }

    /**
     * ایجاد خلاصه درس (برای لیست‌ها)
     * @returns {LessonSummary} خلاصه درس
     */
    toSummary() {
        return {
            id: this.id,
            title: this.title,
            type: this.type,
            difficulty: this.difficulty,
            order: this.order,
            status: this.status,
            xpReward: this.xpReward,
            estimatedDuration: this.estimatedDuration,
            isAvailable: this.isAvailableForReview(),
            progress: this.getProgress(),
            dueForReview: this.isAvailableForReview()
        };
    }

    /**
     * ایجاد کش از درس
     * @returns {Object} آبجکت مناسب برای کش
     */
    toCache() {
        return {
            id: this.id,
            title: this.title,
            type: this.type,
            difficulty: this.difficulty,
            order: this.order,
            status: this.status,
            srsData: {
                nextReview: this.srsData.nextReview,
                reviewCount: this.srsData.reviewCount
            },
            cachedAt: new Date().toISOString()
        };
    }

    /**
     * بررسی معتبر بودن کش
     * @param {number} maxAge - حداکثر سن مجاز بر حسب میلی‌ثانیه
     * @returns {boolean} آیا کش معتبر است؟
     */
    isCacheValid(maxAge = 3600000) { // 1 ساعت پیش‌فرض
        const cache = this.toCache();
        if (!cache.cachedAt) return false;
        
        const cacheAge = Date.now() - new Date(cache.cachedAt).getTime();
        return cacheAge < maxAge;
    }

    /**
     * ایجاد کپی عمیق از درس
     * @returns {LessonModel} کپی جدید از درس
     */
    clone() {
        return new LessonModel(this.toObject());
    }

    /**
     * مقایسه با درس دیگر
     * @param {LessonModel} other - درس دیگر برای مقایسه
     * @returns {boolean} آیا برابر هستند؟
     */
    equals(other) {
        if (!(other instanceof LessonModel)) return false;
        return this.id === other.id &&
               this.updatedAt === other.updatedAt &&
               JSON.stringify(this.srsData) === JSON.stringify(other.srsData);
    }

    /**
     * به‌روزرسانی با حفظ Immutability
     * @param {Object} updates - تغییرات مورد نظر
     * @returns {LessonModel} نمونه جدید با اعمال تغییرات
     */
    with(updates) {
        return new LessonModel({
            ...this.toObject(),
            ...updates,
            updatedAt: new Date().toISOString()
        });
    }

    /**
     * به‌روزرسانی همزمان چند فیلد
     * @param {Object} updates - تغییرات
     * @returns {LessonModel} نمونه جدید
     */
    updateBatch(updates) {
        return this.with(updates);
    }

    /**
     * اعتبارسنجی پایه
     * @returns {LessonValidationResult} نتیجه اعتبارسنجی
     */
    validate() {
        const errors = [];
        
        if (!this.title?.trim()) errors.push({ field: 'title', message: 'عنوان درس الزامی است' });
        if (!this.description?.trim()) errors.push({ field: 'description', message: 'توضیحات درس الزامی است' });
        if (this.difficulty < 1 || this.difficulty > 5) errors.push({ field: 'difficulty', message: 'سطح سختی نامعتبر است' });
        if (this.order < 1) errors.push({ field: 'order', message: 'ترتیب درس نامعتبر است' });
        if (this.xpReward < 0) errors.push({ field: 'xpReward', message: 'پاداش XP نامعتبر است' });
        if (this.estimatedDuration < 1) errors.push({ field: 'estimatedDuration', message: 'زمان تخمینی نامعتبر است' });
        
        return {
            isValid: errors.length === 0,
            errors,
            model: this
        };
    }

    /**
     * اعتبارسنجی عمیق محتوا
     * @returns {Object} نتیجه اعتبارسنجی با اخطارها
     */
    validateDeep() {
        const basicValidation = this.validate();
        const contentErrors = [];
        const warnings = this._getWarnings();
        
        // اعتبارسنجی exercises
        if (Array.isArray(this.content.exercises)) {
            this.content.exercises.forEach((exercise, index) => {
                if (!exercise.id) {
                    contentErrors.push({ field: `exercises[${index}]`, message: 'تمرین شناسه ندارد' });
                }
                if (!exercise.type) {
                    contentErrors.push({ field: `exercises[${index}]`, message: 'تمرین نوع ندارد' });
                }
                if (exercise.questions && !Array.isArray(exercise.questions)) {
                    contentErrors.push({ field: `exercises[${index}]`, message: 'سوالات باید آرایه باشند' });
                }
            });
        }
        
        // اعتبارسنجی vocabulary
        if (Array.isArray(this.content.vocabulary)) {
            this.content.vocabulary.forEach((word, index) => {
                if (!word.term) {
                    contentErrors.push({ field: `vocabulary[${index}]`, message: 'کلمه ندارد' });
                }
                if (!word.meaning) {
                    contentErrors.push({ field: `vocabulary[${index}]`, message: 'معنی ندارد' });
                }
            });
        }
        
        return {
            isValid: basicValidation.isValid && contentErrors.length === 0,
            errors: [...basicValidation.errors, ...contentErrors],
            warnings
        };
    }

    /**
     * به‌روزرسانی درس
     * @param {Object} updates - تغییرات
     * @returns {LessonModel} نمونه جدید
     */
    update(updates) {
        return this.with(updates);
    }

    /**
     * باز کردن درس
     * @returns {LessonModel} نمونه جدید با وضعیت باز
     */
    unlock() {
        if (this.status === LessonStatus.LOCKED) {
            return this.with({
                status: LessonStatus.UNLOCKED
            });
        }
        return this;
    }

    /**
     * شروع درس
     * @returns {LessonModel} نمونه جدید با وضعیت در حال انجام
     */
    start() {
        return this.with({
            status: LessonStatus.IN_PROGRESS,
            stats: {
                ...this.stats,
                totalAttempts: this.stats.totalAttempts + 1
            }
        });
    }

    /**
     * تکمیل درس
     * @param {number} [score=100] - نمره کسب شده
     * @param {number} [timeSpent=0] - زمان صرف شده
     * @returns {LessonModel} نمونه جدید با وضعیت تکمیل
     */
    complete(score = 100, timeSpent = 0) {
        const completedScore = Math.max(0, Math.min(100, score));
        
        return this.with({
            status: completedScore >= 70 ? LessonStatus.COMPLETED : LessonStatus.IN_PROGRESS,
            stats: {
                ...this.stats,
                averageScore: this._calculateAverageScore(completedScore),
                bestScore: Math.max(this.stats.bestScore, completedScore),
                completionRate: this._calculateCompletionRate(),
                totalTimeSpent: this.stats.totalTimeSpent + timeSpent,
                averageTimeSpent: this._calculateAverageTime(timeSpent)
            }
        });
    }

    /**
     * اعمال الگوریتم SM-2 برای SRS
     * @param {number} quality - کیفیت پاسخ (۰ تا ۵)
     * @returns {LessonModel} نمونه جدید با SRS به‌روز شده
     */
    applySM2(quality) {
        // اعتبارسنجی quality (0-5)
        const q = Math.max(0, Math.min(5, Math.round(quality)));
        
        let { easeFactor, interval, reviewCount, streak, totalReviews } = this.srsData;
        
        if (q >= 3) {
            // پاسخ صحیح
            switch (reviewCount) {
                case 0:
                    interval = 1;
                    break;
                case 1:
                    interval = 6;
                    break;
                default:
                    interval = Math.round(interval * easeFactor);
            }
            
            reviewCount++;
            streak++;
            
            // محاسبه ease factor جدید
            easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
            
        } else {
            // پاسخ اشتباه
            reviewCount = 0;
            interval = 1;
            streak = 0;
            
            // کاهش ease factor
            easeFactor = Math.max(1.3, easeFactor - 0.2);
        }
        
        // محدود کردن ease factor
        easeFactor = this._validateEaseFactor(easeFactor);
        
        // محاسبه تاریخ مرور بعدی
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + interval);
        
        return this.with({
            srsData: {
                easeFactor,
                interval,
                nextReview: nextReview.toISOString(),
                reviewCount,
                lastReviewed: new Date().toISOString(),
                streak,
                lastQuality: q,
                totalReviews: totalReviews + 1
            }
        });
    }

    /**
     * محاسبه مرور بعدی با فرمول SRS ساده
     * @param {number} performance - عملکرد (۰-۱۰۰)
     * @returns {LessonModel} نمونه جدید
     */
    calculateNextReview(performance) {
        const performanceScore = Math.max(0, Math.min(100, performance));
        const quality = Math.round(performanceScore / 20); // 0-5
        
        return this.applySM2(quality);
    }

    /**
     * بررسی آماده بودن برای مرور
     * @returns {boolean} آیا برای مرور آماده است؟
     */
    isAvailableForReview() {
        if (!this.srsData.nextReview) return false;
        
        const now = new Date();
        const reviewDate = new Date(this.srsData.nextReview);
        
        return now >= reviewDate;
    }

    /**
     * دریافت زمان تخمینی تا مرور بعدی
     * @returns {string|null} زمان تخمینی به صورت متنی
     */
    getEstimatedReviewTime() {
        if (!this.srsData.nextReview) return null;
        
        const now = new Date();
        const reviewDate = new Date(this.srsData.nextReview);
        
        if (now >= reviewDate) return 'هم اکنون';
        
        const diffMs = reviewDate - now;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        if (diffDays > 0) {
            return `${diffDays} روز و ${diffHours} ساعت`;
        }
        if (diffHours > 0) {
            return `${diffHours} ساعت و ${diffMinutes} دقیقه`;
        }
        return `${diffMinutes} دقیقه`;
    }

    /**
     * دریافت آمار SRS
     * @returns {SRSStats} آمار کامل SRS
     */
    getSRSStats() {
        const mastered = this.srsData.reviewCount >= 5 && this.srsData.interval >= 30;
        const due = this.isAvailableForReview();
        const progress = this.getProgress();
        const retention = this._calculateRetentionRate();
        
        return {
            mastered,
            due,
            progress,
            retention,
            stage: this._getSRSStage(),
            nextReview: this.srsData.nextReview,
            reviewCount: this.srsData.reviewCount,
            interval: this.srsData.interval,
            easeFactor: this.srsData.easeFactor,
            streak: this.srsData.streak
        };
    }

    /**
     * دریافت پیشرفت درس (۰-۱۰۰)
     * @returns {number} درصد پیشرفت
     */
    getProgress() {
        return Math.min(100, Math.round((this.srsData.reviewCount / 10) * 100));
    }

    /**
     * دریافت سطح تسلط
     * @returns {string} سطح تسلط
     */
    getMasteryLevel() {
        const vocabStats = this._getVocabularyStats();
        const exerciseStats = this._getExerciseStats();
        const srsStats = this.getSRSStats();
        
        const vocabScore = vocabStats.percentage * 0.3;
        const exerciseScore = exerciseStats.percentage * 0.3;
        const srsScore = srsStats.progress * 0.4;
        
        const total = Math.round(vocabScore + exerciseScore + srsScore);
        
        if (total >= 90) return MasteryLevel.EXPERT;
        if (total >= 70) return MasteryLevel.ADVANCED;
        if (total >= 50) return MasteryLevel.INTERMEDIATE;
        if (total >= 25) return MasteryLevel.BEGINNER;
        return MasteryLevel.NOVICE;
    }

    /**
     * دریافت آمار کامل درس
     * @returns {DetailedStats} آمار تفصیلی درس
     */
    getDetailedStats() {
        return {
            general: {
                attempts: this.stats.totalAttempts,
                avgScore: this.stats.averageScore,
                bestScore: this.stats.bestScore,
                completionRate: this.stats.completionRate,
                avgTime: this.stats.averageTimeSpent,
                totalTime: this.stats.totalTimeSpent
            },
            srs: this.getSRSStats(),
            vocabulary: this._getVocabularyStats(),
            exercises: this._getExerciseStats(),
            mastery: this.getMasteryLevel(),
            progress: this.getProgress()
        };
    }

    /**
     * پیش‌بینی زمان مورد نیاز برای تسلط
     * @returns {MasteryPrediction} پیش‌بینی زمان تسلط
     */
    predictMasteryTime() {
        const srsStats = this.getSRSStats();
        const remainingReviews = Math.max(0, 10 - this.srsData.reviewCount);
        
        // تخمین زمان هر مرور
        const avgReviewTime = this.estimatedDuration * 0.3; // 30% زمان اولیه
        const estimatedTotalTime = remainingReviews * avgReviewTime;
        
        return {
            remainingReviews,
            estimatedMinutes: Math.round(estimatedTotalTime),
            estimatedDays: Math.round(estimatedTotalTime / (24 * 60)),
            confidence: Math.min(100, Math.round(70 + (this.srsData.reviewCount * 3)))
        };
    }

    /**
     * دریافت توصیه برای مرور بعدی
     * @returns {ReviewRecommendation} توصیه مرور
     */
    getReviewRecommendation() {
        if (!this.isAvailableForReview()) {
            const timeUntil = this.getEstimatedReviewTime();
            if (timeUntil === 'هم اکنون') {
                return {
                    action: 'review_now',
                    message: 'همین الان مرور کنید',
                    priority: 'high',
                    reason: 'زمان مرور فرا رسیده است'
                };
            }
            
            return {
                action: 'wait',
                message: `${timeUntil} دیگر مرور کنید`,
                priority: 'low',
                reason: 'هنوز زمان مرور نرسیده است'
            };
        }
        
        const retention = this._calculateRetentionRate();
        
        if (retention < 50) {
            return {
                action: 'review_now',
                message: 'مرور فوری توصیه می‌شود',
                priority: 'high',
                reason: 'نرخ نگهداری پایین است'
            };
        }
        
        if (retention < 70) {
            return {
                action: 'review_soon',
                message: 'به زودی مرور کنید',
                priority: 'medium',
                reason: 'نرخ نگهداری در حال کاهش است'
            };
        }
        
        return {
            action: 'optional',
            message: 'در وضعیت خوبی هستید',
            priority: 'low',
            reason: 'نرخ نگهداری مناسب است'
        };
    }

    /**
     * مقایسه با درس دیگر
     * @param {LessonModel} other - درس دیگر
     * @returns {number} نتیجه مقایسه
     */
    compareTo(other) {
        if (!(other instanceof LessonModel)) {
            throw new LessonModelError('مقایسه فقط با LessonModel امکان‌پذیر است');
        }
        
        if (this.order !== other.order) {
            return this.order - other.order;
        }
        return this.id.localeCompare(other.id);
    }

    /**
     * ایجاد Diff بین دو نسخه
     * @param {LessonModel} other - درس دیگر
     * @returns {LessonDiff} تفاوت‌ها
     */
    diff(other) {
        const changes = [];
        
        if (this.title !== other.title) changes.push({ field: 'title', old: this.title, new: other.title });
        if (this.description !== other.description) changes.push({ field: 'description', old: this.description, new: other.description });
        if (this.difficulty !== other.difficulty) changes.push({ field: 'difficulty', old: this.difficulty, new: other.difficulty });
        if (this.status !== other.status) changes.push({ field: 'status', old: this.status, new: other.status });
        
        // بررسی تغییرات SRS
        if (this.srsData.nextReview !== other.srsData.nextReview) {
            changes.push({ field: 'srs.nextReview', old: this.srsData.nextReview, new: other.srsData.nextReview });
        }
        if (this.srsData.reviewCount !== other.srsData.reviewCount) {
            changes.push({ field: 'srs.reviewCount', old: this.srsData.reviewCount, new: other.srsData.reviewCount });
        }
        
        return {
            hasChanges: changes.length > 0,
            changes,
            timestamp: new Date().toISOString()
        };
    }

    // ============ Static Methods ============

    /**
     * ایجاد درس پیش‌فرض
     * @returns {LessonModel} درس پیش‌فرض
     */
    static createDefault() {
        return new LessonModel({
            title: 'درس جدید',
            description: 'توضیحات درس',
            type: LessonType.VOCABULARY,
            difficulty: DifficultyLevel.MEDIUM,
            order: 1,
            xpReward: 100,
            estimatedDuration: 10
        });
    }

    /**
     * ایجاد از داده خام
     * @param {Object} data - داده خام
     * @returns {LessonModel} نمونه درس
     */
    static fromRawData(data) {
        return new LessonModel(data);
    }

    /**
     * بازسازی از فرمت DB
     * @param {Object} dbData - داده دیتابیس
     * @returns {LessonModel} نمونه درس
     */
    static fromDBFormat(dbData) {
        return new LessonModel(dbData);
    }

    /**
     * بازسازی از کش
     * @param {Object} cacheData - داده کش
     * @returns {Object} خلاصه درس
     */
    static fromCache(cacheData) {
        return {
            id: cacheData.id,
            title: cacheData.title,
            type: cacheData.type,
            difficulty: cacheData.difficulty,
            order: cacheData.order,
            status: cacheData.status,
            isDue: cacheData.srsData?.nextReview 
                ? new Date(cacheData.srsData.nextReview) <= new Date()
                : false,
            progress: cacheData.srsData?.reviewCount 
                ? Math.min(100, Math.round((cacheData.srsData.reviewCount / 10) * 100))
                : 0
        };
    }

    /**
     * دریافت اسکیما
     * @returns {Object} اسکیما
     */
    static getSchema() {
        return {
            fields: {
                id: { type: 'string', required: true },
                title: { type: 'string', required: true, minLength: 3, maxLength: 200 },
                type: { type: 'string', enum: Object.values(LessonType) },
                difficulty: { type: 'number', min: 1, max: 5 },
                order: { type: 'number', min: 1 },
                xpReward: { type: 'number', min: 0 }
            }
        };
    }

    /**
     * مرتب‌سازی بر اساس اولویت مرور
     * @param {Array<LessonModel>} lessons - لیست درس‌ها
     * @returns {Array<LessonModel>} لیست مرتب شده
     */
    static sortByReviewPriority(lessons) {
        return [...lessons].sort((a, b) => {
            // اولویت با درس‌های آماده مرور
            const aDue = a.isAvailableForReview();
            const bDue = b.isAvailableForReview();
            
            if (aDue && !bDue) return -1;
            if (!aDue && bDue) return 1;
            
            // سپس بر اساس تاریخ مرور
            if (a.srsData.nextReview && b.srsData.nextReview) {
                return new Date(a.srsData.nextReview) - new Date(b.srsData.nextReview);
            }
            
            // سپس بر اساس ترتیب
            return a.order - b.order;
        });
    }

    /**
     * مرتب‌سازی بر اساس وضعیت
     * @param {Array<LessonModel>} lessons - لیست درس‌ها
     * @returns {Array<LessonModel>} لیست مرتب شده
     */
    static sortByStatus(lessons) {
        const statusPriority = {
            [LessonStatus.IN_PROGRESS]: 1,
            [LessonStatus.REVIEW_PENDING]: 2,
            [LessonStatus.UNLOCKED]: 3,
            [LessonStatus.COMPLETED]: 4,
            [LessonStatus.MASTERED]: 5,
            [LessonStatus.LOCKED]: 6
        };
        
        return [...lessons].sort((a, b) => 
            (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99)
        );
    }

    // ============ Private Methods ============

    /**
     * اعتبارسنجی اولیه
     * @private
     */
    _validate() {
        if (!this.id) throw new LessonModelError('شناسه درس الزامی است', 'id');
        if (!this.title?.trim()) throw new LessonModelError('عنوان درس الزامی است', 'title');
    }

    /**
     * اعتبارسنجی نوع درس
     * @private
     * @param {string} type - نوع درس
     * @returns {string} نوع معتبر
     */
    _validateType(type) {
        return Object.values(LessonType).includes(type) 
            ? type 
            : LessonType.VOCABULARY;
    }

    /**
     * اعتبارسنجی سطح سختی
     * @private
     * @param {number} difficulty - سطح سختی
     * @returns {number} سطح معتبر
     */
    _validateDifficulty(difficulty) {
        const diffNum = parseInt(difficulty);
        return diffNum >= 1 && diffNum <= 5 
            ? diffNum 
            : DifficultyLevel.MEDIUM;
    }

    /**
     * اعتبارسنجی وضعیت
     * @private
     * @param {string} status - وضعیت
     * @returns {string} وضعیت معتبر
     */
    _validateStatus(status) {
        return Object.values(LessonStatus).includes(status) 
            ? status 
            : LessonStatus.LOCKED;
    }

    /**
     * اعتبارسنجی فاکتور آسانی
     * @private
     * @param {number} easeFactor - فاکتور آسانی
     * @returns {number} فاکتور معتبر
     */
    _validateEaseFactor(easeFactor) {
        return Math.max(1.3, Math.min(5.0, easeFactor));
    }

    /**
     * اعتبارسنجی تمرین‌ها
     * @private
     * @param {Array} exercises - لیست تمرین‌ها
     * @returns {Array} تمرین‌های معتبر
     */
    _validateExercises(exercises) {
        return exercises.map(ex => ({
            id: ex.id || this._generateId(),
            type: ex.type || 'unknown',
            title: ex.title || '',
            questions: Array.isArray(ex.questions) ? ex.questions : [],
            ...ex
        }));
    }

    /**
     * اعتبارسنجی لغات
     * @private
     * @param {Array} vocabulary - لیست لغات
     * @returns {Array} لغات معتبر
     */
    _validateVocabulary(vocabulary) {
        return vocabulary.map(v => ({
            id: v.id || this._generateId(),
            term: v.term || '',
            meaning: v.meaning || '',
            examples: Array.isArray(v.examples) ? v.examples : [],
            mastered: v.mastered || false,
            ...v
        }));
    }

    /**
     * تولید شناسه یکتا
     * @private
     * @returns {string} شناسه یکتا
     */
    _generateId() {
        return `lesson_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * محاسبه میانگین نمرات
     * @private
     * @param {number} newScore - نمره جدید
     * @returns {number} میانگین جدید
     */
    _calculateAverageScore(newScore) {
        if (this.stats.totalAttempts === 0) {
            return newScore;
        }
        
        return Math.round(
            (this.stats.averageScore * this.stats.totalAttempts + newScore) / 
            (this.stats.totalAttempts + 1)
        );
    }

    /**
     * محاسبه درصد تکمیل
     * @private
     * @returns {number} درصد تکمیل
     */
    _calculateCompletionRate() {
        if (!this.content.exercises?.length) return 0;
        
        const completed = this.content.exercises.filter(e => e.completed).length;
        return Math.round((completed / this.content.exercises.length) * 100);
    }

    /**
     * محاسبه میانگین زمان
     * @private
     * @param {number} newTime - زمان جدید
     * @returns {number} میانگین جدید
     */
    _calculateAverageTime(newTime) {
        if (this.stats.totalAttempts === 0) return newTime;
        
        return Math.round(
            (this.stats.averageTimeSpent * this.stats.totalAttempts + newTime) / 
            (this.stats.totalAttempts + 1)
        );
    }

    /**
     * محاسبه نرخ نگهداری
     * @private
     * @returns {number} نرخ نگهداری
     */
    _calculateRetentionRate() {
        if (!this.srsData.lastReviewed) return 0;
        
        const now = new Date();
        const lastReview = new Date(this.srsData.lastReviewed);
        const daysSinceReview = Math.floor((now - lastReview) / (1000 * 60 * 60 * 24));
        
        if (daysSinceReview === 0) return 100;
        
        // مدل ساده فراموشی (منحنی Ebbinghaus)
        const retention = 100 * Math.exp(-daysSinceReview / (this.srsData.interval || 1));
        return Math.round(retention);
    }

    /**
     * دریافت مرحله SRS
     * @private
     * @returns {string} مرحله SRS
     */
    _getSRSStage() {
        const { interval, reviewCount } = this.srsData;
        
        if (interval <= 1) return 'learning';
        if (interval <= 7) return 'reviewing';
        if (interval <= 30) return 'consolidating';
        return 'mastered';
    }

    /**
     * دریافت آمار لغات
     * @private
     * @returns {Object} آمار لغات
     */
    _getVocabularyStats() {
        const vocab = this.content.vocabulary || [];
        const learned = vocab.filter(v => v.mastered).length;
        
        return {
            total: vocab.length,
            learned,
            percentage: vocab.length ? Math.round((learned / vocab.length) * 100) : 0
        };
    }

    /**
     * دریافت آمار تمرین‌ها
     * @private
     * @returns {Object} آمار تمرین‌ها
     */
    _getExerciseStats() {
        const exercises = this.content.exercises || [];
        const completed = exercises.filter(e => e.completed).length;
        
        return {
            total: exercises.length,
            completed,
            percentage: exercises.length ? Math.round((completed / exercises.length) * 100) : 0
        };
    }

    /**
     * دریافت اخطارها
     * @private
     * @returns {Array<LessonWarning>} لیست اخطارها
     */
    _getWarnings() {
        const warnings = [];
        
        if (this.description.length < 50) {
            warnings.push({ field: 'description', message: 'توضیحات درس کوتاه است (کمتر از ۵۰ کاراکتر)' });
        }
        
        if (!this.content.audioUrl && this.type === LessonType.LISTENING) {
            warnings.push({ field: 'content.audioUrl', message: 'درس Listening بدون فایل صوتی است' });
        }
        
        if (!this.content.videoUrl && this.type === LessonType.SPEAKING) {
            warnings.push({ field: 'content.videoUrl', message: 'درس Speaking بدون فایل ویدیویی است' });
        }
        
        if (this.content.exercises.length === 0) {
            warnings.push({ field: 'content.exercises', message: 'درس تمرین ندارد' });
        }
        
        if (this.prerequisites.length === 0 && this.order > 1) {
            warnings.push({ field: 'prerequisites', message: 'درس دارای پیش‌نیاز نیست' });
        }
        
        return warnings;
    }
}

// ============ Lesson Factory ============

/**
 * کارخانه ساخت درس
 * @class
 */
class LessonFactory {
    /**
     * ایجاد درس بر اساس نوع
     * @param {string} type - نوع درس
     * @param {Object} data - داده‌های اضافی
     * @returns {LessonModel} نمونه درس
     */
    static create(type, data = {}) {
        const baseData = {
            title: data.title || `درس ${type} جدید`,
            type: type,
            ...data
        };

        switch(type) {
            case LessonType.VOCABULARY:
                return new LessonModel({
                    estimatedDuration: 15,
                    xpReward: 120,
                    content: {
                        vocabulary: data.vocabulary || [],
                        exercises: data.exercises || ['flashcard', 'matching', 'multiple_choice']
                    },
                    ...baseData
                });
                
            case LessonType.GRAMMAR:
                return new LessonModel({
                    estimatedDuration: 20,
                    xpReward: 150,
                    content: {
                        grammarPoints: data.grammarPoints || [],
                        exercises: data.exercises || ['fill_blank', 'sentence_build', 'correction']
                    },
                    ...baseData
                });
                
            case LessonType.LISTENING:
                return new LessonModel({
                    estimatedDuration: 25,
                    xpReward: 180,
                    content: {
                        audioUrl: data.audioUrl || null,
                        exercises: data.exercises || ['comprehension', 'dictation', 'shadowing']
                    },
                    ...baseData
                });
                
            case LessonType.SPEAKING:
                return new LessonModel({
                    estimatedDuration: 30,
                    xpReward: 200,
                    content: {
                        exercises: data.exercises || ['pronunciation', 'dialogue', 'recording']
                    },
                    ...baseData
                });
                
            case LessonType.READING:
                return new LessonModel({
                    estimatedDuration: 25,
                    xpReward: 160,
                    content: {
                        text: data.text || '',
                        exercises: data.exercises || ['comprehension', 'summary', 'vocabulary']
                    },
                    ...baseData
                });
                
            case LessonType.WRITING:
                return new LessonModel({
                    estimatedDuration: 30,
                    xpReward: 190,
                    content: {
                        exercises: data.exercises || ['essay', 'correction', 'translation']
                    },
                    ...baseData
                });
                
            default:
                return new LessonModel(baseData);
        }
    }

    /**
     * ایجاد درس واژگان
     * @param {Array} words - لیست کلمات
     * @param {Object} options - گزینه‌های اضافی
     * @returns {LessonModel} درس واژگان
     */
    static createVocabularyLesson(words, options = {}) {
        return this.create(LessonType.VOCABULARY, {
            vocabulary: words.map(w => ({
                term: w.term,
                meaning: w.meaning,
                examples: w.examples || []
            })),
            ...options
        });
    }

    /**
     * ایجاد درس گرامر
     * @param {Array} points - نکات گرامری
     * @param {Object} options - گزینه‌های اضافی
     * @returns {LessonModel} درس گرامر
     */
    static createGrammarLesson(points, options = {}) {
        return this.create(LessonType.GRAMMAR, {
            grammarPoints: points,
            ...options
        });
    }

    /**
     * ایجاد Builder برای درس
     * @returns {LessonBuilder} نمونه LessonBuilder
     */
    static builder() {
        return new LessonBuilder();
    }
}

// ============ Lesson Builder ============

/**
 * Builder برای ساخت گام‌به‌گام درس
 * @class
 */
class LessonBuilder {
    constructor() {
        /** @private */
        this.data = {
            content: {},
            tags: [],
            prerequisites: [],
            unlockables: []
        };
    }

    /**
     * تنظیم اطلاعات پایه
     * @param {string} title - عنوان درس
     * @param {string} description - توضیحات
     * @returns {LessonBuilder} نمونه Builder
     */
    setBasicInfo(title, description) {
        this.data.title = title;
        this.data.description = description;
        return this;
    }

    /**
     * تنظیم نوع درس
     * @param {string} type - نوع درس
     * @returns {LessonBuilder} نمونه Builder
     */
    setType(type) {
        this.data.type = type;
        return this;
    }

    /**
     * تنظیم سطح سختی
     * @param {number} difficulty - سطح سختی
     * @returns {LessonBuilder} نمونه Builder
     */
    setDifficulty(difficulty) {
        this.data.difficulty = difficulty;
        return this;
    }

    /**
     * تنظیم ترتیب
     * @param {number} order - ترتیب
     * @returns {LessonBuilder} نمونه Builder
     */
    setOrder(order) {
        this.data.order = order;
        return this;
    }

    /**
     * تنظیم پاداش‌ها
     * @param {number} xp - جایزه XP
     * @param {number} [coins=10] - جایزه سکه
     * @returns {LessonBuilder} نمونه Builder
     */
    setRewards(xp, coins = 10) {
        this.data.xpReward = xp;
        this.data.coinReward = coins;
        return this;
    }

    /**
     * تنظیم زمان تخمینی
     * @param {number} minutes - زمان بر حسب دقیقه
     * @returns {LessonBuilder} نمونه Builder
     */
    setDuration(minutes) {
        this.data.estimatedDuration = minutes;
        return this;
    }

    /**
     * افزودن لغات
     * @param {Array} vocabList - لیست لغات
     * @returns {LessonBuilder} نمونه Builder
     */
    addVocabulary(vocabList) {
        if (!this.data.content.vocabulary) {
            this.data.content.vocabulary = [];
        }
        this.data.content.vocabulary.push(...vocabList);
        return this;
    }

    /**
     * افزودن تمرین‌ها
     * @param {Array} exerciseList - لیست تمرین‌ها
     * @returns {LessonBuilder} نمونه Builder
     */
    addExercises(exerciseList) {
        if (!this.data.content.exercises) {
            this.data.content.exercises = [];
        }
        this.data.content.exercises.push(...exerciseList);
        return this;
    }

    /**
     * تنظیم پیش‌نیازها
     * @param {Array} prereqs - لیست پیش‌نیازها
     * @returns {LessonBuilder} نمونه Builder
     */
    setPrerequisites(prereqs) {
        this.data.prerequisites = prereqs;
        return this;
    }

    /**
     * افزودن برچسب
     * @param {string} tag - برچسب
     * @returns {LessonBuilder} نمونه Builder
     */
    addTag(tag) {
        this.data.tags.push(tag);
        return this;
    }

    /**
     * تنظیم محتوا
     * @param {Object} content - محتوای درس
     * @returns {LessonBuilder} نمونه Builder
     */
    setContent(content) {
        this.data.content = { ...this.data.content, ...content };
        return this;
    }

    /**
     * تنظیم پریمیوم بودن
     * @param {boolean} isPremium - آیا پریمیوم است؟
     * @returns {LessonBuilder} نمونه Builder
     */
    setPremium(isPremium) {
        this.data.isPremium = isPremium;
        return this;
    }

    /**
     * ساخت درس نهایی
     * @returns {LessonModel} نمونه درس ساخته شده
     */
    build() {
        return new LessonModel(this.data);
    }
}

// ============ Export ============
export {
    LessonModel,
    LessonFactory,
    LessonBuilder,
    LessonType,
    DifficultyLevel,
    LessonStatus,
    MasteryLevel,
    SRSIntervals,
    LessonModelError,
    LessonValidationError
};
