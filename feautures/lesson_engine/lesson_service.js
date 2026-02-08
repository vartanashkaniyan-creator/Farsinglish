// features/lesson-engine/lesson-service.js
/**
 * Lesson Service - موتور اصلی سیستم آموزش و مدیریت SRS
 * مسئولیت: مدیریت درس‌ها، تمرین‌ها و الگوریتم مرور هوشمند با جداسازی کامل لایه‌ها
 */

// ============ Interfaces ============
class ILessonRepository {
    async getLessonById(id) {}
    async getLessonsByFilter(filter) {}
    async saveLesson(lesson) {}
    async updateLessonProgress(userId, lessonId, progress) {}
    async getNextReviewLesson(userId) {}
    async getUserProgress(userId) {}
}

class ISRSEngine {
    calculateNextReview(previousInterval, easeFactor, performance) {}
    calculateEaseFactor(currentEase, performance) {}
    getReviewSchedule(difficulty) {}
}

class IExerciseGenerator {
    generateExercise(lesson, type) {}
    validateAnswer(exercise, userAnswer) {}
    calculateScore(exercise, userAnswer, timeSpent) {}
}

// ============ DTOs ============
class LessonRequestDTO {
    constructor(data) {
        this.userId = data.userId;
        this.lessonId = data.lessonId;
        this.type = data.type;
        this.difficulty = data.difficulty;
        this.category = data.category;
        this.limit = data.limit || 10;
        this.offset = data.offset || 0;
    }
}

class ExerciseRequestDTO {
    constructor(data) {
        this.lessonId = data.lessonId;
        this.exerciseType = data.exerciseType;
        this.difficulty = data.difficulty;
        this.count = data.count || 5;
        this.userLevel = data.userLevel || 1;
    }
}

class LessonProgressDTO {
    constructor(data) {
        this.userId = data.userId;
        this.lessonId = data.lessonId;
        this.score = data.score;
        this.timeSpent = data.timeSpent;
        this.answers = data.answers || [];
        this.completedAt = data.completedAt || new Date().toISOString();
    }
}

class SRSUpdateDTO {
    constructor(data) {
        this.easeFactor = data.easeFactor;
        this.interval = data.interval;
        this.nextReview = data.nextReview;
        this.reviewCount = data.reviewCount;
        this.streak = data.streak;
        this.performance = data.performance;
    }
}

// ============ SRSEngine Implementation ============
class SRSEngineImpl extends ISRSEngine {
    constructor(config = {}) {
        super();
        this.config = {
            initialInterval: config.initialInterval || 1, // روز
            minEaseFactor: config.minEaseFactor || 1.3,
            maxEaseFactor: config.maxEaseFactor || 5.0,
            easeFactorStep: config.easeFactorStep || 0.1,
            intervalModifier: config.intervalModifier || 1.0,
            ...config
        };
    }

    calculateNextReview(previousInterval, easeFactor, performance) {
        const performanceScore = Math.max(0, Math.min(100, performance));
        const quality = performanceScore / 100;
        
        if (quality < 0.6) {
            // پاسخ ضعیف - بازگشت به ابتدا
            return {
                interval: 1,
                easeFactor: Math.max(
                    this.config.minEaseFactor,
                    easeFactor - this.config.easeFactorStep
                )
            };
        }
        
        if (quality < 0.8) {
            // پاسخ متوسط
            const newInterval = Math.max(
                1,
                Math.round(previousInterval * easeFactor * 0.7)
            );
            return {
                interval: newInterval,
                easeFactor: Math.min(
                    this.config.maxEaseFactor,
                    easeFactor + (this.config.easeFactorStep * 0.5)
                )
            };
        }
        
        // پاسخ عالی
        const newInterval = Math.max(
            1,
            Math.round(previousInterval * easeFactor * this.config.intervalModifier)
        );
        return {
            interval: newInterval,
            easeFactor: Math.min(
                this.config.maxEaseFactor,
                easeFactor + this.config.easeFactorStep
            )
        };
    }

    calculateEaseFactor(currentEase, performance) {
        const performanceScore = Math.max(0, Math.min(100, performance));
        
        if (performanceScore >= 90) {
            return Math.min(
                this.config.maxEaseFactor,
                currentEase + this.config.easeFactorStep
            );
        } else if (performanceScore >= 70) {
            return currentEase;
        } else if (performanceScore >= 50) {
            return Math.max(
                this.config.minEaseFactor,
                currentEase - (this.config.easeFactorStep * 0.5)
            );
        } else {
            return Math.max(
                this.config.minEaseFactor,
                currentEase - this.config.easeFactorStep
            );
        }
    }

    getReviewSchedule(difficulty) {
        const schedules = {
            1: [1, 3, 7, 14, 30, 60, 90],    // آسان
            2: [1, 2, 5, 10, 21, 40, 70],    // متوسط
            3: [1, 1, 3, 7, 14, 28, 56],     // سخت
            4: [1, 1, 2, 5, 10, 20, 40],     // پیشرفته
            5: [1, 1, 1, 3, 7, 14, 28]       // متخصص
        };
        
        return schedules[difficulty] || schedules[2];
    }
}

// ============ Exercise Generators ============
class FlashcardGenerator extends IExerciseGenerator {
    generateExercise(lesson, count = 5) {
        const vocabulary = lesson.content?.vocabulary || [];
        const selected = this._selectRandomItems(vocabulary, count);
        
        return selected.map(item => ({
            type: 'flashcard',
            question: item.word,
            correctAnswer: item.translation,
            options: this._generateOptions(vocabulary, item.translation),
            hint: item.phonetic,
            example: item.example,
            metadata: {
                partOfSpeech: item.partOfSpeech,
                difficulty: item.difficulty || lesson.difficulty
            }
        }));
    }

    validateAnswer(exercise, userAnswer) {
        const normalizedUser = userAnswer.trim().toLowerCase();
        const normalizedCorrect = exercise.correctAnswer.trim().toLowerCase();
        
        // تطابق دقیق
        if (normalizedUser === normalizedCorrect) {
            return { isCorrect: true, score: 100 };
        }
        
        // تطابق جزئی (برای اشتباهات املایی)
        const similarity = this._calculateSimilarity(normalizedUser, normalizedCorrect);
        if (similarity > 0.8) {
            return { isCorrect: true, score: Math.round(similarity * 100) };
        }
        
        return { isCorrect: false, score: 0 };
    }

    calculateScore(exercise, userAnswer, timeSpent) {
        const validation = this.validateAnswer(exercise, userAnswer);
        if (!validation.isCorrect) {
            return { score: 0, timeBonus: 0, total: 0 };
        }
        
        const timeBonus = Math.max(0, 20 - (timeSpent / 1000)); // ثانیه
        const total = Math.min(100, validation.score + timeBonus);
        
        return {
            score: validation.score,
            timeBonus,
            total: Math.round(total)
        };
    }

    _selectRandomItems(array, count) {
        const shuffled = [...array].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, array.length));
    }

    _generateOptions(vocabulary, correctAnswer, count = 4) {
        const incorrect = vocabulary
            .filter(item => item.translation !== correctAnswer)
            .map(item => item.translation);
        
        const shuffledIncorrect = [...incorrect]
            .sort(() => 0.5 - Math.random())
            .slice(0, count - 1);
        
        const options = [...shuffledIncorrect, correctAnswer];
        return options.sort(() => 0.5 - Math.random());
    }

    _calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this._levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / parseFloat(longer.length);
    }

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

class MultipleChoiceGenerator extends IExerciseGenerator {
    generateExercise(lesson, count = 5) {
        const content = lesson.content;
        const exercises = [];
        
        // تولید سوالات واژگان
        if (content.vocabulary && content.vocabulary.length > 0) {
            const vocabExercises = this._generateVocabularyExercises(
                content.vocabulary,
                Math.min(3, count)
            );
            exercises.push(...vocabExercises);
        }
        
        // تولید سوالات گرامر
        if (content.grammarPoints && content.grammarPoints.length > 0) {
            const grammarExercises = this._generateGrammarExercises(
                content.grammarPoints,
                Math.min(2, count - exercises.length)
            );
            exercises.push(...grammarExercises);
        }
        
        return exercises.slice(0, count);
    }

    validateAnswer(exercise, userAnswer) {
        const userChoice = parseInt(userAnswer);
        if (isNaN(userChoice) || userChoice < 0 || userChoice >= exercise.options.length) {
            return { isCorrect: false, score: 0 };
        }
        
        const isCorrect = exercise.options[userChoice] === exercise.correctAnswer;
        return { isCorrect, score: isCorrect ? 100 : 0 };
    }

    calculateScore(exercise, userAnswer, timeSpent) {
        const validation = this.validateAnswer(exercise, userAnswer);
        const timeBonus = Math.max(0, 10 - (timeSpent / 2000)); // ثانیه
        const total = validation.score + timeBonus;
        
        return {
            score: validation.score,
            timeBonus,
            total: Math.min(100, Math.round(total))
        };
    }

    _generateVocabularyExercises(vocabulary, count) {
        const selected = this._selectRandomItems(vocabulary, count);
        
        return selected.map(item => ({
            type: 'multiple_choice_vocab',
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

    _generateGrammarExercises(grammarPoints, count) {
        const selected = this._selectRandomItems(grammarPoints, count);
        
        return selected.map(point => ({
            type: 'multiple_choice_grammar',
            question: point.question || `کدام گزینه درست است؟`,
            correctAnswer: point.correctAnswer,
            options: point.options || this._generateGrammarOptions(point),
            hint: point.rule,
            metadata: {
                grammarPoint: point.title,
                difficulty: point.difficulty
            }
        }));
    }

    _selectRandomItems(array, count) {
        const shuffled = [...array].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, array.length));
    }

    _generateOptions(items, correctAnswer, optionCount = 4) {
        const otherItems = items.filter(item => 
            item.translation !== correctAnswer && 
            item.translation !== undefined
        );
        
        const incorrect = [...otherItems]
            .sort(() => 0.5 - Math.random())
            .slice(0, optionCount - 1)
            .map(item => item.translation);
        
        const options = [...incorrect, correctAnswer];
        return options.sort(() => 0.5 - Math.random());
    }

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
class LessonService {
    constructor(lessonRepository, srsEngine, stateManager, logger) {
        if (!lessonRepository || !srsEngine || !stateManager || !logger) {
            throw new Error('تمام وابستگی‌های LessonService باید ارائه شوند');
        }
        
        this.lessonRepository = lessonRepository;
        this.srsEngine = srsEngine;
        this.stateManager = stateManager;
        this.logger = logger;
        
        this.exerciseGenerators = {
            'flashcard': new FlashcardGenerator(),
            'multiple_choice': new MultipleChoiceGenerator()
        };
    }

    /**
     * دریافت درس بر اساس شناسه
     */
    async getLesson(lessonId) {
        try {
            this.logger.info('دریافت درس', { lessonId });
            
            const lesson = await this.lessonRepository.getLessonById(lessonId);
            if (!lesson) {
                throw new Error(`درس با شناسه ${lessonId} یافت نشد`);
            }
            
            // بررسی قفل بودن درس
            const currentState = this.stateManager.getState();
            const user = currentState.auth.user;
            
            if (lesson.status === 'locked' && !user?.isPremium) {
                // بررسی پیش‌نیازها
                const prerequisites = lesson.prerequisites || [];
                const userProgress = await this.lessonRepository.getUserProgress(user.id);
                
                const unlocked = prerequisites.every(prereqId => 
                    userProgress.some(progress => 
                        progress.lessonId === prereqId && 
                        progress.status === 'completed'
                    )
                );
                
                if (!unlocked) {
                    throw new Error('این درس قفل است. ابتدا درس‌های پیش‌نیاز را کامل کنید.');
                }
            }
            
            return lesson;
            
        } catch (error) {
            this.logger.error('خطا در دریافت درس', { lessonId, error: error.message });
            throw error;
        }
    }

    /**
     * دریافت لیست درس‌های موجود
     */
    async getLessons(request) {
        try {
            this.logger.info('دریافت لیست درس‌ها', request);
            
            const filter = {
                type: request.type,
                difficulty: request.difficulty,
                category: request.category,
                isActive: true
            };
            
            const lessons = await this.lessonRepository.getLessonsByFilter(filter);
            
            // فیلتر کردن بر اساس وضعیت کاربر
            const currentState = this.stateManager.getState();
            const user = currentState.auth.user;
            
            if (!user) {
                return lessons.slice(0, request.limit);
            }
            
            const userProgress = await this.lessonRepository.getUserProgress(user.id);
            const progressMap = new Map(
                userProgress.map(p => [p.lessonId, p])
            );
            
            const enrichedLessons = lessons.map(lesson => {
                const progress = progressMap.get(lesson.id);
                
                return {
                    ...lesson,
                    userProgress: progress || null,
                    isLocked: this._isLessonLocked(lesson, progressMap, user)
                };
            });
            
            // مرتب‌سازی: اول درس‌های در حال پیشرفت، سپس درس‌های جدید
            enrichedLessons.sort((a, b) => {
                if (a.userProgress?.status === 'in_progress') return -1;
                if (b.userProgress?.status === 'in_progress') return 1;
                if (!a.userProgress && b.userProgress) return -1;
                if (a.userProgress && !b.userProgress) return 1;
                return a.order - b.order;
            });
            
            return enrichedLessons
                .slice(request.offset, request.offset + request.limit);
                
        } catch (error) {
            this.logger.error('خطا در دریافت لیست درس‌ها', { 
                request, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * شروع یک درس
     */
    async startLesson(lessonId) {
        try {
            this.logger.info('شروع درس', { lessonId });
            
            const currentState = this.stateManager.getState();
            const user = currentState.auth.user;
            
            if (!user) {
                throw new Error('کاربر وارد سیستم نشده است');
            }
            
            const lesson = await this.getLesson(lessonId);
            
            // به‌روزرسانی پیشرفت کاربر
            const progress = {
                userId: user.id,
                lessonId: lesson.id,
                status: 'in_progress',
                startedAt: new Date().toISOString(),
                attempts: 1
            };
            
            await this.lessonRepository.updateLessonProgress(
                user.id,
                lesson.id,
                progress
            );
            
            // به‌روزرسانی state
            await this.stateManager.dispatch('LESSON_LOAD', {
                lesson: lesson,
                progress: progress
            });
            
            this.logger.info('درس با موفقیت شروع شد', { 
                userId: user.id, 
                lessonId 
            });
            
            return {
                lesson,
                progress
            };
            
        } catch (error) {
            this.logger.error('خطا در شروع درس', { 
                lessonId, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * تکمیل یک درس
     */
    async completeLesson(lessonId, score, timeSpent, answers = []) {
        try {
            this.logger.info('تکمیل درس', { lessonId, score, timeSpent });
            
            const currentState = this.stateManager.getState();
            const user = currentState.auth.user;
            
            if (!user) {
                throw new Error('کاربر وارد سیستم نشده است');
            }
            
            const lesson = await this.getLesson(lessonId);
            const progress = await this.lessonRepository.getUserProgress(user.id)
                .then(progressList => 
                    progressList.find(p => p.lessonId === lessonId)
                );
            
            if (!progress) {
                throw new Error('پیشرفتی برای این درس یافت نشد');
            }
            
            // محاسبه SRS
            const srsUpdate = this._calculateSRSUpdate(
                lesson.difficulty,
                progress.srsData || { easeFactor: 2.5, interval: 1, reviewCount: 0 },
                score
            );
            
            // به‌روزرسانی پیشرفت
            const updatedProgress = {
                ...progress,
                status: 'completed',
                score: Math.max(progress.score || 0, score),
                completedAt: new Date().toISOString(),
                timeSpent: (progress.timeSpent || 0) + timeSpent,
                answers: [...(progress.answers || []), ...answers],
                srsData: srsUpdate
            };
            
            await this.lessonRepository.updateLessonProgress(
                user.id,
                lesson.id,
                updatedProgress
            );
            
            // به‌روزرسانی آمار کاربر
            await this._updateUserStats(user.id, lesson, score, timeSpent);
            
            // به‌روزرسانی state
            await this.stateManager.dispatch('LESSON_COMPLETE', {
                lessonId: lesson.id,
                score: score,
                xpEarned: lesson.xpReward,
                srsUpdate: srsUpdate
            });
            
            this.logger.info('درس با موفقیت تکمیل شد', { 
                userId: user.id, 
                lessonId, 
                score 
            });
            
            return {
                lesson,
                progress: updatedProgress,
                xpEarned: lesson.xpReward,
                nextReview: srsUpdate.nextReview
            };
            
        } catch (error) {
            this.logger.error('خطا در تکمیل درس', { 
                lessonId, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * تولید تمرین‌های یک درس
     */
    async generateExercises(lessonId, exerciseType, count = 5) {
        try {
            this.logger.info('تولید تمرین', { lessonId, exerciseType, count });
            
            const lesson = await this.getLesson(lessonId);
            const generator = this.exerciseGenerators[exerciseType];
            
            if (!generator) {
                throw new Error(`ژنراتور تمرین برای نوع ${exerciseType} یافت نشد`);
            }
            
            const exercises = generator.generateExercise(lesson, count);
            
            // ذخیره تمرین‌ها در state برای اعتبارسنجی بعدی
            const currentState = this.stateManager.getState();
            await this.stateManager.dispatch('UI_STATE_CHANGE', {
                currentExercises: exercises,
                exerciseType: exerciseType,
                lessonId: lessonId
            });
            
            return exercises;
            
        } catch (error) {
            this.logger.error('خطا در تولید تمرین', { 
                lessonId, 
                exerciseType, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * اعتبارسنجی پاسخ تمرین
     */
    async validateExercise(exerciseId, userAnswer, timeSpent = 0) {
        try {
            this.logger.info('اعتبارسنجی تمرین', { exerciseId, timeSpent });
            
            const currentState = this.stateManager.getState();
            const exercises = currentState.ui.currentExercises || [];
            
            const exercise = exercises.find(e => 
                e.question === exerciseId || 
                e.metadata?.word === exerciseId
            );
            
            if (!exercise) {
                throw new Error('تمرین یافت نشد');
            }
            
            const generator = this.exerciseGenerators[exercise.type];
            if (!generator) {
                throw new Error(`ژنراتور برای نوع ${exercise.type} یافت نشد`);
            }
            
            const result = generator.calculateScore(exercise, userAnswer, timeSpent);
            
            this.logger.info('نتیجه اعتبارسنجی', { 
                exerciseId, 
                isCorrect: result.total > 0,
                score: result.total 
            });
            
            return result;
            
        } catch (error) {
            this.logger.error('خطا در اعتبارسنجی تمرین', { 
                exerciseId, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * دریافت درس بعدی برای مرور
     */
    async getNextReviewLesson() {
        try {
            this.logger.info('دریافت درس بعدی برای مرور');
            
            const currentState = this.stateManager.getState();
            const user = currentState.auth.user;
            
            if (!user) {
                throw new Error('کاربر وارد سیستم نشده است');
            }
            
            const nextLesson = await this.lessonRepository.getNextReviewLesson(user.id);
            
            if (!nextLesson) {
                // اگر درس برای مرور نبود، درس جدید پیشنهاد بده
                const availableLessons = await this.getLessons({
                    userId: user.id,
                    limit: 10,
                    offset: 0
                });
                
                const nextNewLesson = availableLessons.find(lesson => 
                    !lesson.userProgress || 
                    lesson.userProgress.status === 'not_started'
                );
                
                return nextNewLesson || null;
            }
            
            return nextLesson;
            
        } catch (error) {
            this.logger.error('خطا در دریافت درس مرور', { 
                error: error.message 
            });
            throw error;
        }
    }

    // ============ Private Methods ============

    /**
     * بررسی قفل بودن درس
     * @private
     */
    _isLessonLocked(lesson, progressMap, user) {
        if (lesson.status === 'locked' && !user.isPremium) {
            return true;
        }
        
        const prerequisites = lesson.prerequisites || [];
        return prerequisites.some(prereqId => {
            const progress = progressMap.get(prereqId);
            return !progress || progress.status !== 'completed';
        });
    }

    /**
     * محاسبه به‌روزرسانی SRS
     * @private
     */
    _calculateSRSUpdate(difficulty, currentSRS, score) {
        const performance = score;
        const schedule = this.srsEngine.getReviewSchedule(difficulty);
        
        const currentReviewCount = currentSRS.reviewCount || 0;
        const nextScheduleIndex = Math.min(currentReviewCount, schedule.length - 1);
        
        const baseInterval = schedule[nextScheduleIndex] || 1;
        const srsResult = this.srsEngine.calculateNextReview(
            baseInterval,
            currentSRS.easeFactor || 2.5,
            performance
        );
        
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + srsResult.interval);
        
        return {
            easeFactor: srsResult.easeFactor,
            interval: srsResult.interval,
            nextReview: nextReview.toISOString(),
            reviewCount: currentReviewCount + 1,
            lastReviewed: new Date().toISOString(),
            streak: performance >= 70 ? (currentSRS.streak || 0) + 1 : 0
        };
    }

    /**
     * به‌روزرسانی آمار کاربر
     * @private
     */
    async _updateUserStats(userId, lesson, score, timeSpent) {
        try {
            // در اینجا باید به User Repository وصل شویم
            // فعلاً فقط لاگ می‌کنیم
            this.logger.info('به‌روزرسانی آمار کاربر', {
                userId,
                lessonId: lesson.id,
                score,
                timeSpent,
                xpReward: lesson.xpReward
            });
            
            // TODO: اتصال به UserService برای به‌روزرسانی XP و آمار
        } catch (error) {
            this.logger.error('خطا در به‌روزرسانی آمار کاربر', { 
                userId, 
                error: error.message 
            });
        }
    }
}

// ============ Service Factory ============
class LessonServiceFactory {
    static create(lessonRepository, stateManager, logger, options = {}) {
        const srsEngine = new SRSEngineImpl(options.srsConfig);
        return new LessonService(lessonRepository, srsEngine, stateManager, logger);
    }
}

// ============ Export ============
export {
    LessonService,
    LessonServiceFactory,
    ILessonRepository,
    ISRSEngine,
    IExerciseGenerator,
    SRSEngineImpl,
    FlashcardGenerator,
    MultipleChoiceGenerator,
    LessonRequestDTO,
    ExerciseRequestDTO,
    LessonProgressDTO,
    SRSUpdateDTO
};
