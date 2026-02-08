// shared/models/lesson-model.js
/**
 * Lesson Model - مدل داده درس برای سیستم آموزش زبان
 * مسئولیت: نمایش، اعتبارسنجی و مدیریت داده‌های درس با پشتیبانی از SRS
 */

// ============ Constants ============
const LessonType = Object.freeze({
    VOCABULARY: 'vocabulary',
    GRAMMAR: 'grammar',
    LISTENING: 'listening',
    SPEAKING: 'speaking',
    READING: 'reading',
    WRITING: 'writing',
    MIXED: 'mixed'
});

const DifficultyLevel = Object.freeze({
    EASY: 1,
    MEDIUM: 2,
    HARD: 3,
    ADVANCED: 4,
    EXPERT: 5
});

const LessonStatus = Object.freeze({
    LOCKED: 'locked',
    UNLOCKED: 'unlocked',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    REVIEW_PENDING: 'review_pending',
    MASTERED: 'mastered'
});

// ============ SRS Configuration ============
const SRSIntervals = Object.freeze({
    [DifficultyLevel.EASY]: [1, 3, 7, 14, 30, 60, 90, 180],
    [DifficultyLevel.MEDIUM]: [1, 2, 5, 10, 21, 40, 70, 120],
    [DifficultyLevel.HARD]: [1, 1, 3, 7, 14, 28, 56, 100],
    [DifficultyLevel.ADVANCED]: [1, 1, 2, 5, 10, 20, 40, 80],
    [DifficultyLevel.EXPERT]: [1, 1, 1, 3, 7, 14, 28, 56]
});

// ============ Lesson Model Class ============
class LessonModel {
    constructor(data = {}) {
        // شناسه‌ها
        this.id = data.id || this._generateId();
        this.courseId = data.courseId || null;
        this.moduleId = data.moduleId || null;
        
        // اطلاعات اصلی
        this.title = data.title || '';
        this.description = data.description || '';
        this.type = this._validateType(data.type || LessonType.VOCABULARY);
        this.category = data.category || 'general';
        this.tags = Array.isArray(data.tags) ? data.tags : [];
        this.difficulty = this._validateDifficulty(data.difficulty || DifficultyLevel.MEDIUM);
        this.order = Math.max(1, data.order || 1);
        
        // محتوا
        this.content = {
            text: data.content?.text || '',
            audioUrl: data.content?.audioUrl || null,
            videoUrl: data.content?.videoUrl || null,
            images: Array.isArray(data.content?.images) ? data.content.images : [],
            exercises: Array.isArray(data.content?.exercises) ? data.content.exercises : [],
            vocabulary: Array.isArray(data.content?.vocabulary) ? data.content.vocabulary : [],
            grammarPoints: Array.isArray(data.content?.grammarPoints) ? data.content.grammarPoints : [],
            ...data.content
        };
        
        // پیش‌نیازها
        this.prerequisites = Array.isArray(data.prerequisites) ? data.prerequisites : [];
        this.requiredScore = Math.max(0, data.requiredScore || 0);
        
        // پاداش‌ها
        this.xpReward = Math.max(0, data.xpReward || 100);
        this.coinReward = Math.max(0, data.coinReward || 10);
        this.unlockables = Array.isArray(data.unlockables) ? data.unlockables : [];
        
        // زمان‌بندی
        this.estimatedDuration = Math.max(1, data.estimatedDuration || 10); // دقیقه
        this.maxAttempts = data.maxAttempts || 3;
        
        // وضعیت
        this.status = data.status || LessonStatus.LOCKED;
        this.isActive = data.isActive !== false;
        this.isFree = data.isFree !== false;
        this.isPremium = data.isPremium || false;
        
        // آمار
        this.stats = {
            totalAttempts: data.stats?.totalAttempts || 0,
            averageScore: data.stats?.averageScore || 0,
            completionRate: data.stats?.completionRate || 0,
            averageTimeSpent: data.stats?.averageTimeSpent || 0,
            ...data.stats
        };
        
        // SRS Data
        this.srsData = {
            easeFactor: data.srsData?.easeFactor || 2.5,
            interval: data.srsData?.interval || 1, // روز
            nextReview: data.srsData?.nextReview || null,
            reviewCount: data.srsData?.reviewCount || 0,
            lastReviewed: data.srsData?.lastReviewed || null,
            streak: data.srsData?.streak || 0,
            ...data.srsData
        };
        
        // زمان‌ها
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
        this.publishedAt = data.publishedAt || null;
        
        // اعتبارسنجی اولیه
        this._validate();
    }

    // ============ Public Methods ============

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
            publishedAt: this.publishedAt
        };
    }

    toJSON() {
        return this.toObject();
    }

    validate() {
        const errors = [];
        
        if (!this.title.trim()) errors.push('عنوان درس الزامی است');
        if (!this.description.trim()) errors.push('توضیحات درس الزامی است');
        if (this.difficulty < 1 || this.difficulty > 5) errors.push('سطح سختی نامعتبر است');
        if (this.order < 1) errors.push('ترتیب درس نامعتبر است');
        if (this.xpReward < 0) errors.push('پاداش XP نامعتبر است');
        if (this.estimatedDuration < 1) errors.push('زمان تخمینی نامعتبر است');
        
        return {
            isValid: errors.length === 0,
            errors,
            model: this
        };
    }

    update(updates) {
        return new LessonModel({
            ...this.toObject(),
            ...updates,
            updatedAt: new Date().toISOString()
        });
    }

    unlock() {
        return this.update({
            status: LessonStatus.UNLOCKED
        });
    }

    start() {
        return this.update({
            status: LessonStatus.IN_PROGRESS,
            stats: {
                ...this.stats,
                totalAttempts: this.stats.totalAttempts + 1
            }
        });
    }

    complete(score = 100) {
        const completedScore = Math.max(0, Math.min(100, score));
        
        return this.update({
            status: LessonStatus.COMPLETED,
            stats: {
                ...this.stats,
                averageScore: this._calculateAverageScore(completedScore),
                completionRate: 100
            }
        });
    }

    calculateNextReview(performance) {
        const performanceScore = Math.max(0, Math.min(100, performance));
        const quality = performanceScore / 100;
        
        let newEaseFactor = this.srsData.easeFactor;
        let newInterval = this.srsData.interval;
        let newStreak = this.srsData.streak;
        
        if (quality >= 0.6) {
            // پاسخ صحیح
            newStreak++;
            
            if (newStreak === 1) {
                newInterval = 1;
            } else if (newStreak === 2) {
                newInterval = 3;
            } else {
                newInterval = Math.round(this.srsData.interval * newEaseFactor);
            }
            
            // افزایش ease factor برای عملکرد خوب
            if (quality > 0.9) {
                newEaseFactor += 0.1;
            }
        } else {
            // پاسخ اشتباه
            newStreak = 0;
            newInterval = 1;
            newEaseFactor = Math.max(1.3, this.srsData.easeFactor - 0.2);
        }
        
        // محدود کردن ease factor
        newEaseFactor = Math.max(1.3, Math.min(5.0, newEaseFactor));
        
        // محاسبه تاریخ مرور بعدی
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + newInterval);
        
        return this.update({
            srsData: {
                easeFactor: newEaseFactor,
                interval: newInterval,
                nextReview: nextReview.toISOString(),
                reviewCount: this.srsData.reviewCount + 1,
                lastReviewed: new Date().toISOString(),
                streak: newStreak
            }
        });
    }

    isAvailableForReview() {
        if (!this.srsData.nextReview) return false;
        
        const now = new Date();
        const reviewDate = new Date(this.srsData.nextReview);
        
        return now >= reviewDate;
    }

    getEstimatedReviewTime() {
        if (!this.srsData.nextReview) return null;
        
        const now = new Date();
        const reviewDate = new Date(this.srsData.nextReview);
        const diffMs = reviewDate - now;
        
        if (diffMs <= 0) return 'هم اکنون';
        
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        if (diffDays > 0) {
            return `${diffDays} روز ${diffHours > 0 ? `و ${diffHours} ساعت` : ''}`;
        }
        
        return `${diffHours} ساعت`;
    }

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

    static fromRawData(data) {
        return new LessonModel(data);
    }

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

    // ============ Private Methods ============

    _validate() {
        this.updatedAt = new Date().toISOString();
    }

    _validateType(type) {
        return Object.values(LessonType).includes(type) 
            ? type 
            : LessonType.VOCABULARY;
    }

    _validateDifficulty(difficulty) {
        const diffNum = parseInt(difficulty);
        return diffNum >= 1 && diffNum <= 5 
            ? diffNum 
            : DifficultyLevel.MEDIUM;
    }

    _generateId() {
        return `lesson_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    _calculateAverageScore(newScore) {
        if (this.stats.totalAttempts === 0) {
            return newScore;
        }
        
        return Math.round(
            (this.stats.averageScore * this.stats.totalAttempts + newScore) / 
            (this.stats.totalAttempts + 1)
        );
    }
}

// ============ Lesson Factory ============
class LessonFactory {
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
                        vocabulary: [],
                        exercises: ['flashcard', 'matching', 'multiple_choice']
                    },
                    ...baseData
                });
                
            case LessonType.GRAMMAR:
                return new LessonModel({
                    estimatedDuration: 20,
                    xpReward: 150,
                    content: {
                        grammarPoints: [],
                        exercises: ['fill_blank', 'sentence_build', 'correction']
                    },
                    ...baseData
                });
                
            case LessonType.LISTENING:
                return new LessonModel({
                    estimatedDuration: 25,
                    xpReward: 180,
                    content: {
                        audioUrl: null,
                        exercises: ['comprehension', 'dictation', 'shadowing']
                    },
                    ...baseData
                });
                
            case LessonType.SPEAKING:
                return new LessonModel({
                    estimatedDuration: 30,
                    xpReward: 200,
                    content: {
                        exercises: ['pronunciation', 'dialogue', 'recording']
                    },
                    ...baseData
                });
                
            default:
                return new LessonModel(baseData);
        }
    }
}

// ============ Export ============
export {
    LessonModel,
    LessonFactory,
    LessonType,
    DifficultyLevel,
    LessonStatus,
    SRSIntervals
};
