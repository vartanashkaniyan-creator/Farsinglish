/**
 * @fileoverview سرویس اصلی مدیریت درس‌ها و موتور SRS
 * @author Farsinglish Team
 * @version 1.0.0
 */

// ============ Constants & Enums ============

/** @enum {number} */
const SCORE_THRESHOLDS = Object.freeze({
    EXCELLENT: 90,
    GOOD: 70,
    PASSING: 60,
    MINIMUM: 50
});

/** @enum {string} */
const EXERCISE_TYPE = Object.freeze({
    FLASHCARD: 'flashcard',
    MULTIPLE_CHOICE: 'multiple_choice',
    FILL_BLANK: 'fill_blank',
    MATCHING: 'matching'
});

/** @enum {string} */
const LESSON_STATUS = Object.freeze({
    LOCKED: 'locked',
    AVAILABLE: 'available',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed'
});

/** @enum {string} */
const PERFORMANCE_LEVEL = Object.freeze({
    POOR: 'poor',
    FAIR: 'fair',
    GOOD: 'good',
    EXCELLENT: 'excellent'
});

/** @constant {Object} */
const SRS_CONFIG = Object.freeze({
    INITIAL_INTERVAL: 1,
    MIN_EASE_FACTOR: 1.3,
    MAX_EASE_FACTOR: 5.0,
    EASE_FACTOR_STEP: 0.1,
    INTERVAL_MODIFIER: 1.0,
    PASSING_SCORE: 60,
    EXCELLENT_SCORE: 90,
    STREAK_BONUS_THRESHOLD: 3
});

/** @constant {Object} */
const CACHE_CONFIG = Object.freeze({
    DEFAULT_TTL: 5 * 60 * 1000, // 5 دقیقه
    LESSON_TTL: 10 * 60 * 1000, // 10 دقیقه
    MAX_SIZE: 100
});

/** @constant {Object.<number, number[]>} */
const REVIEW_SCHEDULES = Object.freeze({
    1: [1, 3, 7, 14, 30, 60, 90],
    2: [1, 2, 5, 10, 21, 40, 70],
    3: [1, 1, 3, 7, 14, 28, 56],
    4: [1, 1, 2, 5, 10, 20, 40],
    5: [1, 1, 1, 3, 7, 14, 28]
});

// ============ Type Definitions (JSDoc) ============

/**
 * @typedef {Object} Lesson
 * @property {string} id - شناسه یکتای درس
 * @property {string} title - عنوان درس
 * @property {number} difficulty - سطح دشواری (1-5)
 * @property {number} xpReward - امتیاز تجربه
 * @property {LessonContent} content - محتوای درس
 * @property {string[]} [prerequisites] - شناسه درس‌های پیش‌نیاز
 * @property {LESSON_STATUS} [status] - وضعیت درس
 */

/**
 * @typedef {Object} LessonContent
 * @property {VocabularyItem[]} vocabulary - لیست لغات
 * @property {GrammarPoint[]} [grammarPoints] - نکات گرامری
 * @property {string[]} [examples] - مثال‌ها
 */

/**
 * @typedef {Object} VocabularyItem
 * @property {string} word - کلمه انگلیسی
 * @property {string} translation - ترجمه فارسی
 * @property {string} [phonetic] - تلفظ
 * @property {string} [example] - مثال
 * @property {string} [partOfSpeech] - نقش دستوری
 * @property {number} [difficulty] - سطح دشواری کلمه
 */

/**
 * @typedef {Object} GrammarPoint
 * @property {string} title - عنوان
 * @property {string} rule - قاعده
 * @property {string} correctAnswer - پاسخ صحیح
 * @property {string[]} [distractors] - گزینه‌های اشتباه
 * @property {number} difficulty - سطح دشواری
 */

/**
 * @typedef {Object} UserProgress
 * @property {string} userId - شناسه کاربر
 * @property {string} lessonId - شناسه درس
 * @property {LESSON_STATUS} status - وضعیت
 * @property {number} score - امتیاز
 * @property {number} timeSpent - زمان صرف شده (میلی‌ثانیه)
 * @property {Answer[]} answers - پاسخ‌ها
 * @property {SRSData} srsData - داده‌های SRS
 * @property {string} startedAt - زمان شروع
 * @property {string} [completedAt] - زمان تکمیل
 */

/**
 * @typedef {Object} SRSData
 * @property {number} easeFactor - ضریب آسانی
 * @property {number} interval - فاصله مرور (روز)
 * @property {string} nextReview - زمان مرور بعدی
 * @property {number} reviewCount - تعداد مرورها
 * @property {number} streak - رکورد پشت سر هم
 * @property {string} lastReviewed - آخرین مرور
 */

/**
 * @typedef {Object} Answer
 * @property {string} exerciseId - شناسه تمرین
 * @property {string} userAnswer - پاسخ کاربر
 * @property {boolean} isCorrect - صحت پاسخ
 * @property {number} score - امتیاز
 * @property {number} timeSpent - زمان صرف شده
 * @property {string} timestamp - زمان ثبت
 */

/**
 * @typedef {Object} Exercise
 * @property {string} id - شناسه تمرین
 * @property {EXERCISE_TYPE} type - نوع تمرین
 * @property {string} question - سوال
 * @property {string} correctAnswer - پاسخ صحیح
 * @property {string[]} options - گزینه‌ها
 * @property {string} [hint] - راهنمایی
 * @property {Object} metadata - اطلاعات اضافی
 */

// ============ Interfaces (Abstract Classes) ============

/**
 * @interface ILessonRepository
 */
class ILessonRepository {
    /**
     * @param {string} id
     * @returns {Promise<Lesson|null>}
     */
    async getLessonById(id) { throw new Error('Not implemented'); }

    /**
     * @param {Object} filter
     * @returns {Promise<Lesson[]>}
     */
    async getLessonsByFilter(filter) { throw new Error('Not implemented'); }

    /**
     * @param {string} userId
     * @param {string} lessonId
     * @param {UserProgress} progress
     * @returns {Promise<UserProgress>}
     */
    async updateLessonProgress(userId, lessonId, progress) { throw new Error('Not implemented'); }

    /**
     * @param {string} userId
     * @returns {Promise<UserProgress[]>}
     */
    async getUserProgress(userId) { throw new Error('Not implemented'); }

    /**
     * @param {string} userId
     * @returns {Promise<UserProgress|null>}
     */
    async getNextReviewLesson(userId) { throw new Error('Not implemented'); }
}

/**
 * @interface ISRSEngine
 */
class ISRSEngine {
    /**
     * @param {number} previousInterval
     * @param {number} easeFactor
     * @param {number} performance
     * @returns {{interval: number, easeFactor: number}}
     */
    calculateNextReview(previousInterval, easeFactor, performance) { throw new Error('Not implemented'); }

    /**
     * @param {number} difficulty
     * @returns {number[]}
     */
    getReviewSchedule(difficulty) { throw new Error('Not implemented'); }

    /**
     * @param {number} performance
     * @returns {PERFORMANCE_LEVEL}
     */
    getPerformanceLevel(performance) { throw new Error('Not implemented'); }
}

/**
 * @interface IExerciseGenerator
 */
class IExerciseGenerator {
    /**
     * @param {Lesson} lesson
     * @param {number} count
     * @returns {Exercise[]}
     */
    generateExercise(lesson, count) { throw new Error('Not implemented'); }

    /**
     * @param {Exercise} exercise
     * @param {string} userAnswer
     * @returns {{isCorrect: boolean, score: number}}
     */
    validateAnswer(exercise, userAnswer) { throw new Error('Not implemented'); }

    /**
     * @param {Exercise} exercise
     * @param {string} userAnswer
     * @param {number} timeSpent
     * @returns {{score: number, timeBonus: number, total: number}}
     */
    calculateScore(exercise, userAnswer, timeSpent) { throw new Error('Not implemented'); }
}

/**
 * @interface ICacheProvider
 * @template T
 */
class ICacheProvider {
    /**
     * @param {string} key
     * @returns {T|null}
     */
    get(key) { throw new Error('Not implemented'); }

    /**
     * @param {string} key
     * @param {T} value
     * @param {number} ttl
     */
    set(key, value, ttl) { throw new Error('Not implemented'); }

    /**
     * @param {string} key
     * @returns {boolean}
     */
    invalidate(key) { throw new Error('Not implemented'); }

    /** */
    clear() { throw new Error('Not implemented'); }
}

// ============ DTOs with Validation ============

/**
 * @typedef {Object} LessonRequestData
 * @property {string} userId
 * @property {string} [lessonId]
 * @property {string} [type]
 * @property {number} [difficulty]
 * @property {string} [category]
 * @property {number} [limit]
 * @property {number} [offset]
 */

class LessonRequestDTO {
    /**
     * @param {LessonRequestData} data
     * @throws {LessonError}
     */
    constructor(data) {
        this._validate(data);
        
        this.userId = data.userId;
        this.lessonId = data.lessonId;
        this.type = data.type;
        this.difficulty = data.difficulty;
        this.category = data.category;
        this.limit = data.limit || 10;
        this.offset = data.offset || 0;
        
        Object.freeze(this);
    }

    /**
     * @param {LessonRequestData} data
     * @throws {LessonError}
     * @private
     */
    _validate(data) {
        if (!data?.userId) {
            throw new LessonError('userId الزامی است', 'VALIDATION_ERROR');
        }
        if (data.limit && (data.limit < 1 || data.limit > 100)) {
            throw new LessonError('limit باید بین 1 تا 100 باشد', 'VALIDATION_ERROR');
        }
        if (data.offset && data.offset < 0) {
            throw new LessonError('offset نمی‌تواند منفی باشد', 'VALIDATION_ERROR');
        }
    }
}

/**
 * @typedef {Object} ExerciseRequestData
 * @property {string} lessonId
 * @property {EXERCISE_TYPE} exerciseType
 * @property {number} [difficulty]
 * @property {number} [count]
 * @property {number} [userLevel]
 */

class ExerciseRequestDTO {
    /**
     * @param {ExerciseRequestData} data
     * @throws {LessonError}
     */
    constructor(data) {
        this._validate(data);
        
        this.lessonId = data.lessonId;
        this.exerciseType = data.exerciseType;
        this.difficulty = data.difficulty;
        this.count = data.count || 5;
        this.userLevel = data.userLevel || 1;
        
        Object.freeze(this);
    }

    /**
     * @param {ExerciseRequestData} data
     * @throws {LessonError}
     * @private
     */
    _validate(data) {
        if (!data?.lessonId) {
            throw new LessonError('lessonId الزامی است', 'VALIDATION_ERROR');
        }
        if (!Object.values(EXERCISE_TYPE).includes(data.exerciseType)) {
            throw new LessonError('نوع تمرین نامعتبر است', 'VALIDATION_ERROR');
        }
        if (data.count && (data.count < 1 || data.count > 20)) {
            throw new LessonError('count باید بین 1 تا 20 باشد', 'VALIDATION_ERROR');
        }
    }
}

/**
 * @typedef {Object} ProgressData
 * @property {string} userId
 * @property {string} lessonId
 * @property {number} score
 * @property {number} timeSpent
 * @property {Answer[]} answers
 */

class LessonProgressDTO {
    /**
     * @param {ProgressData} data
     * @throws {LessonError}
     */
    constructor(data) {
        this._validate(data);
        
        this.userId = data.userId;
        this.lessonId = data.lessonId;
        this.score = data.score;
        this.timeSpent = data.timeSpent;
        this.answers = data.answers || [];
        this.completedAt = new Date().toISOString();
        
        Object.freeze(this);
    }

    /**
     * @param {ProgressData} data
     * @throws {LessonError}
     * @private
     */
    _validate(data) {
        if (!data?.userId || !data?.lessonId) {
            throw new LessonError('userId و lessonId الزامی هستند', 'VALIDATION_ERROR');
        }
        if (data.score && (data.score < 0 || data.score > 100)) {
            throw new LessonError('score باید بین 0 تا 100 باشد', 'VALIDATION_ERROR');
        }
        if (data.timeSpent && data.timeSpent < 0) {
            throw new LessonError('timeSpent نمی‌تواند منفی باشد', 'VALIDATION_ERROR');
        }
    }
}

// ============ Custom Errors ============

/**
 * @class LessonError
 * @extends Error
 */
class LessonError extends Error {
    /**
     * @param {string} message
     * @param {string} code
     * @param {Object} [details]
     */
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'LessonError';
        this.code = code;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

/**
 * @class LessonNotFoundError
 * @extends LessonError
 */
class LessonNotFoundError extends LessonError {
    /**
     * @param {string} lessonId
     */
    constructor(lessonId) {
        super(`درس با شناسه ${lessonId} یافت نشد`, 'LESSON_NOT_FOUND', { lessonId });
        this.name = 'LessonNotFoundError';
    }
}

/**
 * @class LessonLockedError
 * @extends LessonError
 */
class LessonLockedError extends LessonError {
    /**
     * @param {string} lessonId
     * @param {string[]} prerequisites
     */
    constructor(lessonId, prerequisites) {
        super('این درس قفل است. ابتدا درس‌های پیش‌نیاز را کامل کنید.', 
              'LESSON_LOCKED', { lessonId, prerequisites });
        this.name = 'LessonLockedError';
    }
}

/**
 * @class ExerciseGenerationError
 * @extends LessonError
 */
class ExerciseGenerationError extends LessonError {
    /**
     * @param {string} lessonId
     * @param {EXERCISE_TYPE} exerciseType
     */
    constructor(lessonId, exerciseType) {
        super(`خطا در تولید تمرین برای نوع ${exerciseType}`, 
              'EXERCISE_GENERATION_FAILED', { lessonId, exerciseType });
        this.name = 'ExerciseGenerationError';
    }
}

/**
 * @class ExerciseValidationError
 * @extends LessonError
 */
class ExerciseValidationError extends LessonError {
    /**
     * @param {string} exerciseId
     */
    constructor(exerciseId) {
        super(`خطا در اعتبارسنجی تمرین ${exerciseId}`, 'EXERCISE_VALIDATION_ERROR', { exerciseId });
        this.name = 'ExerciseValidationError';
    }
}

/**
 * @class UserAuthenticationError
 * @extends LessonError
 */
class UserAuthenticationError extends LessonError {
    constructor() {
        super('کاربر وارد سیستم نشده است', 'USER_NOT_AUTHENTICATED');
        this.name = 'UserAuthenticationError';
    }
}

/**
 * @class ProgressNotFoundError
 * @extends LessonError
 */
class ProgressNotFoundError extends LessonError {
    /**
     * @param {string} userId
     * @param {string} lessonId
     */
    constructor(userId, lessonId) {
        super('پیشرفتی برای این درس یافت نشد', 'PROGRESS_NOT_FOUND', { userId, lessonId });
        this.name = 'ProgressNotFoundError';
    }
}

// ============ Simple Event Bus ============

/**
 * @class EventBus
 */
class EventBus {
    /** */
    constructor() {
        /** @type {Object.<string, Function[]>} */
        this.listeners = {};
    }

    /**
     * @param {string} event
     * @param {Function} callback
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    /**
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
        const callbacks = this.listeners[event] || [];
        callbacks.forEach(cb => {
            try {
                cb(data);
            } catch (error) {
                console.error(`Error in event listener for ${event}:`, error);
            }
        });
    }

    /**
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    /** */
    clear() {
        this.listeners = {};
    }
}

// ============ Cache Provider Implementation ============

/**
 * @class MemoryCacheProvider
 * @implements {ICacheProvider}
 * @template T
 */
class MemoryCacheProvider {
    /**
     * @param {number} defaultTTL
     */
    constructor(defaultTTL = CACHE_CONFIG.DEFAULT_TTL) {
        /** @type {Map<string, {value: T, expiresAt: number}>} */
        this.cache = new Map();
        this.defaultTTL = defaultTTL;
        this.stats = { hits: 0, misses: 0, sets: 0 };
    }

    /**
     * @param {string} key
     * @returns {T|null}
     */
    get(key) {
        this._cleanExpired();
        
        const item = this.cache.get(key);
        if (!item) {
            this.stats.misses++;
            return null;
        }
        
        this.stats.hits++;
        return item.value;
    }

    /**
     * @param {string} key
     * @param {T} value
     * @param {number} ttl
     */
    set(key, value, ttl = this.defaultTTL) {
        if (this.cache.size >= CACHE_CONFIG.MAX_SIZE) {
            this._evictOldest();
        }
        
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + ttl
        });
        this.stats.sets++;
    }

    /**
     * @param {string} key
     * @returns {boolean}
     */
    invalidate(key) {
        return this.cache.delete(key);
    }

    /** */
    clear() {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0, sets: 0 };
    }

    /**
     * @returns {Object}
     */
    getStats() {
        this._cleanExpired();
        return { 
            ...this.stats, 
            size: this.cache.size,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };
    }

    /** @private */
    _cleanExpired() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiresAt) {
                this.cache.delete(key);
            }
        }
    }

    /** @private */
    _evictOldest() {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }
}

// ============ SRSEngine Implementation ============

/**
 * @class SRSEngineImpl
 * @implements {ISRSEngine}
 */
class SRSEngineImpl {
    /**
     * @param {Object} config
     */
    constructor(config = {}) {
        this.config = {
            initialInterval: SRS_CONFIG.INITIAL_INTERVAL,
            minEaseFactor: SRS_CONFIG.MIN_EASE_FACTOR,
            maxEaseFactor: SRS_CONFIG.MAX_EASE_FACTOR,
            easeFactorStep: SRS_CONFIG.EASE_FACTOR_STEP,
            intervalModifier: SRS_CONFIG.INTERVAL_MODIFIER,
            ...config
        };
    }

    /**
     * @param {number} previousInterval
     * @param {number} easeFactor
     * @param {number} performance
     * @returns {{interval: number, easeFactor: number}}
     */
    calculateNextReview(previousInterval, easeFactor, performance) {
        const level = this.getPerformanceLevel(performance);
        
        switch (level) {
            case PERFORMANCE_LEVEL.POOR:
                return {
                    interval: 1,
                    easeFactor: Math.max(
                        this.config.minEaseFactor,
                        easeFactor - this.config.easeFactorStep
                    )
                };
                
            case PERFORMANCE_LEVEL.FAIR:
                return {
                    interval: Math.max(1, Math.round(previousInterval * 0.5)),
                    easeFactor: Math.max(
                        this.config.minEaseFactor,
                        easeFactor - (this.config.easeFactorStep * 0.5)
                    )
                };
                
            case PERFORMANCE_LEVEL.GOOD:
                return {
                    interval: Math.max(1, Math.round(previousInterval * easeFactor * 0.7)),
                    easeFactor: Math.min(
                        this.config.maxEaseFactor,
                        easeFactor + (this.config.easeFactorStep * 0.5)
                    )
                };
                
            case PERFORMANCE_LEVEL.EXCELLENT:
                return {
                    interval: Math.max(1, Math.round(previousInterval * easeFactor * this.config.intervalModifier)),
                    easeFactor: Math.min(
                        this.config.maxEaseFactor,
                        easeFactor + this.config.easeFactorStep
                    )
                };
        }
    }

    /**
     * @param {number} performance
     * @returns {PERFORMANCE_LEVEL}
     */
    getPerformanceLevel(performance) {
        if (performance < SCORE_THRESHOLDS.PASSING) return PERFORMANCE_LEVEL.POOR;
        if (performance < SCORE_THRESHOLDS.GOOD) return PERFORMANCE_LEVEL.FAIR;
        if (performance < SCORE_THRESHOLDS.EXCELLENT) return PERFORMANCE_LEVEL.GOOD;
        return PERFORMANCE_LEVEL.EXCELLENT;
    }

    /**
     * @param {number} difficulty
     * @returns {number[]}
     */
    getReviewSchedule(difficulty) {
        return REVIEW_SCHEDULES[difficulty] || REVIEW_SCHEDULES[2];
    }
}

// ============ Exercise Generators ============

/**
 * @class FlashcardGenerator
 * @implements {IExerciseGenerator}
 */
class FlashcardGenerator {
    /**
     * @param {Lesson} lesson
     * @param {number} count
     * @returns {Exercise[]}
     */
    generateExercise(lesson, count = 5) {
        const vocabulary = lesson.content?.vocabulary || [];
        const selected = this._selectRandomItems(vocabulary, count);
        
        return selected.map(item => ({
            id: `flashcard-${Date.now()}-${Math.random()}`,
            type: EXERCISE_TYPE.FLASHCARD,
            question: item.word,
            correctAnswer: item.translation,
            options: this._generateOptions(vocabulary, item.translation),
            hint: item.phonetic,
            metadata: {
                partOfSpeech: item.partOfSpeech,
                difficulty: item.difficulty || lesson.difficulty,
                example: item.example
            }
        }));
    }

    /**
     * @param {Exercise} exercise
     * @param {string} userAnswer
     * @returns {{isCorrect: boolean, score: number}}
     */
    validateAnswer(exercise, userAnswer) {
        if (!userAnswer || typeof userAnswer !== 'string') {
            return { isCorrect: false, score: 0 };
        }

        const normalizedUser = userAnswer.trim().toLowerCase();
        const normalizedCorrect = exercise.correctAnswer.trim().toLowerCase();
        
        if (normalizedUser === normalizedCorrect) {
            return { isCorrect: true, score: 100 };
        }
        
        const similarity = this._calculateSimilarity(normalizedUser, normalizedCorrect);
        if (similarity > 0.8) {
            return { isCorrect: true, score: Math.round(similarity * 100) };
        }
        
        return { isCorrect: false, score: 0 };
    }

    /**
     * @param {Exercise} exercise
     * @param {string} userAnswer
     * @param {number} timeSpent
     * @returns {{score: number, timeBonus: number, total: number}}
     */
    calculateScore(exercise, userAnswer, timeSpent) {
        const validation = this.validateAnswer(exercise, userAnswer);
        if (!validation.isCorrect) {
            return { score: 0, timeBonus: 0, total: 0 };
        }
        
        const timeBonus = Math.max(0, 20 - (timeSpent / 1000));
        const total = Math.min(100, validation.score + timeBonus);
        
        return {
            score: validation.score,
            timeBonus,
            total: Math.round(total)
        };
    }

    /**
     * @param {any[]} array
     * @param {number} count
     * @returns {any[]}
     * @private
     */
    _selectRandomItems(array, count) {
        if (!array.length) return [];
        const shuffled = [...array].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, array.length));
    }

    /**
     * @param {VocabularyItem[]} vocabulary
     * @param {string} correctAnswer
     * @param {number} optionCount
     * @returns {string[]}
     * @private
     */
    _generateOptions(vocabulary, correctAnswer, optionCount = 4) {
        const incorrect = vocabulary
            .filter(item => item.translation !== correctAnswer)
            .map(item => item.translation);
        
        const shuffledIncorrect = [...incorrect]
            .sort(() => 0.5 - Math.random())
            .slice(0, optionCount - 1);
        
        const options = [...shuffledIncorrect, correctAnswer];
        return options.sort(() => 0.5 - Math.random());
    }

    /**
     * @param {string} str1
     * @param {string} str2
     * @returns {number}
     * @private
     */
    _calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this._levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / parseFloat(longer.length);
    }

    /**
     * @param {string} a
     * @param {string} b
     * @returns {number}
     * @private
     */
    _levenshteinDistance(a, b) {
        const matrix = Array(b.length + 1).fill(null).map(() => 
            Array(a.length + 1).fill(null)
        );
        
        for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
        
        for (let j = 1; j <= b.length; j++) {
            for (let i = 1; i <= a.length; i++) {
                const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + indicator
                );
            }
        }
        
        return matrix[b.length][a.length];
    }
}

/**
 * @class MultipleChoiceGenerator
 * @implements {IExerciseGenerator}
 */
class MultipleChoiceGenerator {
    /**
     * @param {Lesson} lesson
     * @param {number} count
     * @returns {Exercise[]}
     */
    generateExercise(lesson, count = 5) {
        const content = lesson.content;
        const exercises = [];
        
        if (content.vocabulary?.length) {
            const vocabCount = Math.min(3, count);
            const vocabExercises = this._generateVocabularyExercises(content.vocabulary, vocabCount);
            exercises.push(...vocabExercises);
        }
        
        if (content.grammarPoints?.length && exercises.length < count) {
            const grammarCount = count - exercises.length;
            const grammarExercises = this._generateGrammarExercises(content.grammarPoints, grammarCount);
            exercises.push(...grammarExercises);
        }
        
        return exercises.slice(0, count).map(e => ({
            ...e,
            id: `${e.type}-${Date.now()}-${Math.random()}`
        }));
    }

    /**
     * @param {Exercise} exercise
     * @param {string} userAnswer
     * @returns {{isCorrect: boolean, score: number}}
     */
    validateAnswer(exercise, userAnswer) {
        const userChoice = parseInt(userAnswer);
        if (isNaN(userChoice) || userChoice < 0 || userChoice >= exercise.options.length) {
            return { isCorrect: false, score: 0 };
        }
        
        const isCorrect = exercise.options[userChoice] === exercise.correctAnswer;
        return { isCorrect, score: isCorrect ? 100 : 0 };
    }

    /**
     * @param {Exercise} exercise
     * @param {string} userAnswer
     * @param {number} timeSpent
     * @returns {{score: number, timeBonus: number, total: number}}
     */
    calculateScore(exercise, userAnswer, timeSpent) {
        const validation = this.validateAnswer(exercise, userAnswer);
        const timeBonus = Math.max(0, 10 - (timeSpent / 2000));
        const total = validation.score + timeBonus;
        
        return {
            score: validation.score,
            timeBonus,
            total: Math.min(100, Math.round(total))
        };
    }

    /**
     * @param {VocabularyItem[]} vocabulary
     * @param {number} count
     * @returns {Exercise[]}
     * @private
     */
    _generateVocabularyExercises(vocabulary, count) {
        const selected = this._selectRandomItems(vocabulary, count);
        
        return selected.map(item => ({
            type: EXERCISE_TYPE.MULTIPLE_CHOICE,
            question: `معنی "${item.word}" چیست؟`,
            correctAnswer: item.translation,
            options: this._generateOptions(vocabulary, item.translation),
            hint: item.partOfSpeech,
            metadata: {
                word: item.word,
                phonetic: item.phonetic,
                example: item.example
            }
        }));
    }

    /**
     * @param {GrammarPoint[]} grammarPoints
     * @param {number} count
     * @returns {Exercise[]}
     * @private
     */
    _generateGrammarExercises(grammarPoints, count) {
        const selected = this._selectRandomItems(grammarPoints, count);
        
        return selected.map(point => ({
            type: EXERCISE_TYPE.MULTIPLE_CHOICE,
            question: point.question || 'کدام گزینه درست است؟',
            correctAnswer: point.correctAnswer,
            options: point.options || this._generateGrammarOptions(point),
            hint: point.rule,
            metadata: {
                grammarPoint: point.title,
                difficulty: point.difficulty
            }
        }));
    }

    /**
     * @param {any[]} array
     * @param {number} count
     * @returns {any[]}
     * @private
     */
    _selectRandomItems(array, count) {
        if (!array.length) return [];
        const shuffled = [...array].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, array.length));
    }

    /**
     * @param {VocabularyItem[]} items
     * @param {string} correctAnswer
     * @param {number} optionCount
     * @returns {string[]}
     * @private
     */
    _generateOptions(items, correctAnswer, optionCount = 4) {
        const otherItems = items.filter(item => 
            item.translation !== correctAnswer && item.translation
        );
        
        const incorrect = [...otherItems]
            .sort(() => 0.5 - Math.random())
            .slice(0, optionCount - 1)
            .map(item => item.translation);
        
        const options = [...incorrect, correctAnswer];
        return options.sort(() => 0.5 - Math.random());
    }

    /**
     * @param {GrammarPoint} grammarPoint
     * @returns {string[]}
     * @private
     */
    _generateGrammarOptions(grammarPoint) {
        const options = [grammarPoint.correctAnswer];
        if (grammarPoint.distractors) {
            options.push(...grammarPoint.distractors);
        }
        while (options.length < 4) {
            options.push(`گزینه ${options.length + 1}`);
        }
        return options.sort(() => 0.5 - Math.random());
    }
}

// ============ Lesson Service ============

/**
 * @class LessonService
 */
class LessonService {
    /**
     * @param {ILessonRepository} lessonRepository
     * @param {ISRSEngine} srsEngine
     * @param {Object} stateManager
     * @param {Object} logger
     * @param {ICacheProvider} [cacheProvider]
     * @throws {LessonError}
     */
    constructor(lessonRepository, srsEngine, stateManager, logger, cacheProvider = null) {
        this._validateDependencies(lessonRepository, srsEngine, stateManager, logger);
        
        this.lessonRepository = lessonRepository;
        this.srsEngine = srsEngine;
        this.stateManager = stateManager;
        this.logger = logger;
        this.cache = cacheProvider || new MemoryCacheProvider();
        this.events = new EventBus();
        
        /** @type {Object.<string, IExerciseGenerator>} */
        this.exerciseGenerators = {
            [EXERCISE_TYPE.FLASHCARD]: new FlashcardGenerator(),
            [EXERCISE_TYPE.MULTIPLE_CHOICE]: new MultipleChoiceGenerator()
        };
        
        this.metrics = {
            lessonsStarted: 0,
            lessonsCompleted: 0,
            totalTimeSpent: 0,
            averageScore: 0
        };
    }

    /**
     * @param {ILessonRepository} lessonRepository
     * @param {ISRSEngine} srsEngine
     * @param {Object} stateManager
     * @param {Object} logger
     * @throws {LessonError}
     * @private
     */
    _validateDependencies(lessonRepository, srsEngine, stateManager, logger) {
        if (!lessonRepository || !srsEngine || !stateManager || !logger) {
            throw new LessonError('همه وابستگی‌های LessonService باید ارائه شوند', 
                                 'MISSING_DEPENDENCIES');
        }
    }

    /**
     * @param {string} lessonId
     * @returns {Promise<Lesson>}
     * @throws {LessonNotFoundError}
     * @throws {LessonError}
     */
    async getLesson(lessonId) {
        this.logger.info('دریافت درس', { lessonId });
        
        const cacheKey = `lesson:${lessonId}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached) {
            this.logger.debug('درس از کش بازیابی شد', { lessonId });
            return cached;
        }
        
        const lesson = await this.lessonRepository.getLessonById(lessonId);
        
        if (!lesson) {
            throw new LessonNotFoundError(lessonId);
        }
        
        this.cache.set(cacheKey, lesson, CACHE_CONFIG.LESSON_TTL);
        this.events.emit('lesson:loaded', { lessonId });
        
        return lesson;
    }

    /**
     * @param {LessonRequestDTO} request
     * @returns {Promise<Lesson[]>}
     * @throws {LessonError}
     */
    async getLessons(request) {
        this.logger.info('دریافت لیست درس‌ها', request);
        
        const cacheKey = `lessons:${JSON.stringify(request)}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached) return cached;
        
        const filter = {
            type: request.type,
            difficulty: request.difficulty,
            category: request.category,
            isActive: true
        };
        
        const lessons = await this.lessonRepository.getLessonsByFilter(filter);
        const enrichedLessons = await this._enrichLessonsWithProgress(lessons, request.userId);
        
        const result = enrichedLessons
            .slice(request.offset, request.offset + request.limit);
        
        this.cache.set(cacheKey, result, CACHE_CONFIG.DEFAULT_TTL);
        this.events.emit('lessons:loaded', { count: result.length });
        
        return result;
    }

    /**
     * @param {string} lessonId
     * @returns {Promise<{lesson: Lesson, progress: UserProgress}>}
     * @throws {UserAuthenticationError}
     * @throws {LessonLockedError}
     * @throws {LessonError}
     */
    async startLesson(lessonId) {
        this.logger.info('شروع درس', { lessonId });
        
        const user = this._getCurrentUser();
        const lesson = await this.getLesson(lessonId);
        
        await this._checkLessonLock(lesson, user);
        
        const progress = this._createInitialProgress(user.id, lesson.id);
        await this.lessonRepository.updateLessonProgress(user.id, lesson.id, progress);
        
        this.events.emit('lesson:started', { lessonId, userId: user.id });
        this.metrics.lessonsStarted++;
        
        return { lesson, progress };
    }

    /**
     * @param {string} lessonId
     * @param {number} score
     * @param {number} timeSpent
     * @param {Answer[]} answers
     * @returns {Promise<{lesson: Lesson, progress: UserProgress, xpEarned: number, nextReview: string}>}
     * @throws {UserAuthenticationError}
     * @throws {ProgressNotFoundError}
     * @throws {LessonError}
     */
    async completeLesson(lessonId, score, timeSpent, answers = []) {
        this.logger.info('تکمیل درس', { lessonId, score, timeSpent });
        
        const user = this._getCurrentUser();
        const lesson = await this.getLesson(lessonId);
        const progress = await this._getUserProgress(user.id, lessonId);
        
        if (!progress) {
            throw new ProgressNotFoundError(user.id, lessonId);
        }
        
        const srsUpdate = this._calculateSRSUpdate(lesson.difficulty, progress.srsData, score);
        const updatedProgress = this._updateProgress(progress, score, timeSpent, answers, srsUpdate);
        
        await this.lessonRepository.updateLessonProgress(user.id, lesson.id, updatedProgress);
        await this._updateUserStats(user.id, lesson, score, timeSpent);
        
        this.cache.invalidate(`lessons:${user.id}`);
        this.events.emit('lesson:completed', { lessonId, score, xpEarned: lesson.xpReward });
        this._updateMetrics(score, timeSpent);
        
        return {
            lesson,
            progress: updatedProgress,
            xpEarned: lesson.xpReward,
            nextReview: srsUpdate.nextReview
        };
    }

    /**
     * @param {string} lessonId
     * @param {EXERCISE_TYPE} exerciseType
     * @param {number} count
     * @returns {Promise<Exercise[]>}
     * @throws {ExerciseGenerationError}
     */
    async generateExercises(lessonId, exerciseType, count = 5) {
        this.logger.info('تولید تمرین', { lessonId, exerciseType, count });
        
        const lesson = await this.getLesson(lessonId);
        const generator = this.exerciseGenerators[exerciseType];
        
        if (!generator) {
            throw new ExerciseGenerationError(lessonId, exerciseType);
        }
        
        const exercises = generator.generateExercise(lesson, count);
        this.events.emit('exercises:generated', { lessonId, count: exercises.length });
        
        return exercises;
    }

    /**
     * @param {string} exerciseId
     * @param {string} userAnswer
     * @param {number} timeSpent
     * @returns {Promise<{score: number, timeBonus: number, total: number}>}
     * @throws {ExerciseValidationError}
     */
    async validateExercise(exerciseId, userAnswer, timeSpent = 0) {
        this.logger.info('اعتبارسنجی تمرین', { exerciseId, timeSpent });
        
        const exercise = this._getCurrentExercise(exerciseId);
        
        if (!exercise) {
            throw new ExerciseValidationError(exerciseId);
        }
        
        const generator = this.exerciseGenerators[exercise.type];
        
        if (!generator) {
            throw new LessonError('ژنراتور یافت نشد', 'GENERATOR_NOT_FOUND', { 
                type: exercise.type 
            });
        }
        
        const result = generator.calculateScore(exercise, userAnswer, timeSpent);
        
        this.logger.info('نتیجه اعتبارسنجی', { 
            exerciseId, 
            isCorrect: result.total > 0,
            score: result.total 
        });
        
        this.events.emit('exercise:validated', { exerciseId, result });
        
        return result;
    }

    /**
     * @returns {Promise<Lesson|null>}
     * @throws {UserAuthenticationError}
     */
    async getNextReviewLesson() {
        this.logger.info('دریافت درس بعدی برای مرور');
        
        const user = this._getCurrentUser();
        const nextLesson = await this.lessonRepository.getNextReviewLesson(user.id);
        
        if (!nextLesson) {
            return this._getFirstAvailableLesson(user.id);
        }
        
        return nextLesson;
    }

    /**
     * @returns {Object}
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /** */
    clearCache() {
        this.cache.clear();
        this.logger.info('کش پاک‌سازی شد');
    }

    // ============ Private Methods ============

    /**
     * @returns {Object}
     * @throws {UserAuthenticationError}
     * @private
     */
    _getCurrentUser() {
        const currentState = this.stateManager.getState();
        const user = currentState.auth?.user;
        
        if (!user) {
            throw new UserAuthenticationError();
        }
        
        return user;
    }

    /**
     * @param {Lesson[]} lessons
     * @param {string} userId
     * @returns {Promise<Lesson[]>}
     * @private
     */
    async _enrichLessonsWithProgress(lessons, userId) {
        if (!userId) return lessons;
        
        const userProgress = await this.lessonRepository.getUserProgress(userId);
        const progressMap = new Map(userProgress.map(p => [p.lessonId, p]));
        
        return lessons.map(lesson => ({
            ...lesson,
            userProgress: progressMap.get(lesson.id) || null,
            isLocked: this._isLessonLocked(lesson, progressMap)
        }));
    }

    /**
     * @param {Lesson} lesson
     * @param {Map<string, UserProgress>} progressMap
     * @returns {boolean}
     * @private
     */
    _isLessonLocked(lesson, progressMap) {
        if (lesson.status === LESSON_STATUS.LOCKED) return true;
        
        const prerequisites = lesson.prerequisites || [];
        return prerequisites.some(prereqId => {
            const progress = progressMap.get(prereqId);
            return !progress || progress.status !== LESSON_STATUS.COMPLETED;
        });
    }

    /**
     * @param {Lesson} lesson
     * @param {Object} user
     * @throws {LessonLockedError}
     * @private
     */
    async _checkLessonLock(lesson, user) {
        if (lesson.status === LESSON_STATUS.LOCKED && !user.isPremium) {
            throw new LessonLockedError(lesson.id, lesson.prerequisites || []);
        }
    }

    /**
     * @param {string} userId
     * @param {string} lessonId
     * @returns {UserProgress}
     * @private
     */
    _createInitialProgress(userId, lessonId) {
        return {
            userId,
            lessonId,
            status: LESSON_STATUS.IN_PROGRESS,
            startedAt: new Date().toISOString(),
            attempts: 1,
            srsData: {
                easeFactor: 2.5,
                interval: 1,
                reviewCount: 0,
                streak: 0,
                lastReviewed: new Date().toISOString(),
                nextReview: new Date().toISOString()
            }
        };
    }

    /**
     * @param {string} userId
     * @param {string} lessonId
     * @returns {Promise<UserProgress|null>}
     * @private
     */
    async _getUserProgress(userId, lessonId) {
        const progressList = await this.lessonRepository.getUserProgress(userId);
        return progressList.find(p => p.lessonId === lessonId);
    }

    /**
     * @param {number} difficulty
     * @param {SRSData} currentSRS
     * @param {number} score
     * @returns {SRSData}
     * @private
     */
    _calculateSRSUpdate(difficulty, currentSRS, score) {
        const schedule = this.srsEngine.getReviewSchedule(difficulty);
        const currentReviewCount = currentSRS?.reviewCount || 0;
        const nextScheduleIndex = Math.min(currentReviewCount, schedule.length - 1);
        
        const baseInterval = schedule[nextScheduleIndex] || 1;
        const srsResult = this.srsEngine.calculateNextReview(
            baseInterval,
            currentSRS?.easeFactor || 2.5,
            score
        );
        
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + srsResult.interval);
        
        return {
            easeFactor: srsResult.easeFactor,
            interval: srsResult.interval,
            nextReview: nextReview.toISOString(),
            reviewCount: currentReviewCount + 1,
            lastReviewed: new Date().toISOString(),
            streak: score >= SCORE_THRESHOLDS.GOOD ? (currentSRS?.streak || 0) + 1 : 0
        };
    }

    /**
     * @param {UserProgress} progress
     * @param {number} score
     * @param {number} timeSpent
     * @param {Answer[]} answers
     * @param {SRSData} srsUpdate
     * @returns {UserProgress}
     * @private
     */
    _updateProgress(progress, score, timeSpent, answers, srsUpdate) {
        return {
            ...progress,
            status: LESSON_STATUS.COMPLETED,
            score: Math.max(progress.score || 0, score),
            completedAt: new Date().toISOString(),
            timeSpent: (progress.timeSpent || 0) + timeSpent,
            answers: [...(progress.answers || []), ...answers],
            srsData: srsUpdate
        };
    }

    /**
     * @param {string} userId
     * @param {Lesson} lesson
     * @param {number} score
     * @param {number} timeSpent
     * @returns {Promise<void>}
     * @private
     */
    async _updateUserStats(userId, lesson, score, timeSpent) {
        try {
            const stats = await this.lessonRepository.getUserStats(userId) || {
                totalXp: 0,
                completedLessons: 0,
                averageScore: 0,
                totalTimeSpent: 0
            };
            
            stats.totalXp += lesson.xpReward || 0;
            stats.completedLessons += 1;
            stats.totalTimeSpent += timeSpent;
            stats.averageScore = (
                (stats.averageScore * (stats.completedLessons - 1) + score) / 
                stats.completedLessons
            );
            
            await this.lessonRepository.updateUserStats(userId, stats);
            
        } catch (error) {
            this.logger.error('خطا در به‌روزرسانی آمار کاربر', { userId, error: error.message });
        }
    }

    /**
     * @param {number} score
     * @param {number} timeSpent
     * @private
     */
    _updateMetrics(score, timeSpent) {
        this.metrics.lessonsCompleted++;
        this.metrics.totalTimeSpent += timeSpent;
        this.metrics.averageScore = (
            (this.metrics.averageScore * (this.metrics.lessonsCompleted - 1) + score) / 
            this.metrics.lessonsCompleted
        );
    }

    /**
     * @param {string} exerciseId
     * @returns {Exercise|null}
     * @private
     */
    _getCurrentExercise(exerciseId) {
        const currentState = this.stateManager.getState();
        const exercises = currentState.ui?.currentExercises || [];
        return exercises.find(e => e.id === exerciseId) || null;
    }

    /**
     * @param {string} userId
     * @returns {Promise<Lesson|null>}
     * @private
     */
    async _getFirstAvailableLesson(userId) {
        const availableLessons = await this.getLessons(
            new LessonRequestDTO({ userId, limit: 10, offset: 0 })
        );
        
        return availableLessons.find(lesson => 
            !lesson.userProgress || lesson.userProgress.status === LESSON_STATUS.AVAILABLE
        ) || null;
    }
}

// ============ Service Factory ============

/**
 * @class LessonServiceFactory
 */
class LessonServiceFactory {
    /**
     * @param {ILessonRepository} lessonRepository
     * @param {Object} stateManager
     * @param {Object} logger
     * @param {Object} options
     * @returns {LessonService}
     */
    static create(lessonRepository, stateManager, logger, options = {}) {
        const srsEngine = new SRSEngineImpl(options.srsConfig);
        const cacheProvider = options.cacheProvider || new MemoryCacheProvider(options.cacheTTL);
        
        return new LessonService(
            lessonRepository,
            srsEngine,
            stateManager,
            logger,
            cacheProvider
        );
    }

    /**
     * @param {Object} stateManager
     * @param {Object} logger
     * @param {Object} options
     * @returns {LessonService}
     */
    static createWithMock(stateManager, logger, options = {}) {
        const mockRepository = this._createMockRepository();
        this._seedMockData(mockRepository);
        
        return LessonServiceFactory.create(mockRepository, stateManager, logger, options);
    }

    /**
     * @returns {Object}
     * @private
     */
    static _createMockRepository() {
        return {
            lessons: new Map(),
            progress: new Map(),
            stats: new Map(),
            
            async getLessonById(id) {
                return this.lessons.get(id) || null;
            },
            
            async getLessonsByFilter(filter) {
                return Array.from(this.lessons.values())
                    .filter(l => !filter.isActive || l.isActive);
            },
            
            async updateLessonProgress(userId, lessonId, progress) {
                const key = `${userId}:${lessonId}`;
                this.progress.set(key, progress);
                return progress;
            },
            
            async getUserProgress(userId) {
                return Array.from(this.progress.values())
                    .filter(p => p.userId === userId);
            },
            
            async getNextReviewLesson(userId) {
                const now = new Date();
                const userProgress = await this.getUserProgress(userId);
                
                return userProgress
                    .filter(p => p.srsData?.nextReview && new Date(p.srsData.nextReview) <= now)
                    .sort((a, b) => new Date(a.srsData.nextReview) - new Date(b.srsData.nextReview))[0];
            },
            
            async getUserStats(userId) {
                return this.stats.get(userId) || null;
            },
            
            async updateUserStats(userId, stats) {
                this.stats.set(userId, stats);
                return stats;
            }
        };
    }

    /**
     * @param {Object} mockRepository
     * @private
     */
    static _seedMockData(mockRepository) {
        mockRepository.lessons.set('lesson-1', {
            id: 'lesson-1',
            title: 'درس نمونه ۱',
            difficulty: 2,
            xpReward: 50,
            content: {
                vocabulary: [
                    { word: 'hello', translation: 'سلام', phonetic: 'هلو' },
                    { word: 'book', translation: 'کتاب', phonetic: 'بوک' },
                    { word: 'pen', translation: 'خودکار', phonetic: 'پن' }
                ]
            }
        });
    }
}

// ============ Exports ============

export {
    LessonService,
    LessonServiceFactory,
    ILessonRepository,
    ISRSEngine,
    IExerciseGenerator,
    ICacheProvider,
    SRSEngineImpl,
    FlashcardGenerator,
    MultipleChoiceGenerator,
    MemoryCacheProvider,
    EventBus,
    LessonRequestDTO,
    ExerciseRequestDTO,
    LessonProgressDTO,
    LessonError,
    LessonNotFoundError,
    LessonLockedError,
    ExerciseGenerationError,
    ExerciseValidationError,
    UserAuthenticationError,
    ProgressNotFoundError,
    SCORE_THRESHOLDS,
    EXERCISE_TYPE,
    LESSON_STATUS,
    PERFORMANCE_LEVEL,
    SRS_CONFIG,
    CACHE_CONFIG,
    REVIEW_SCHEDULES
};
