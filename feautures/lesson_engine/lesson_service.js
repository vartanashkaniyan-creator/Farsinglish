// features/lesson-engine/lesson-service.js
/**
 * Lesson Service - موتور اصلی سیستم آموزش و مدیریت SRS
 * مسئولیت: مدیریت درس‌ها، تمرین‌ها و الگوریتم مرور هوشمند با جداسازی کامل لایه‌ها
 * اصل SRP: فقط عملیات درس و تمرین
 * اصل DIP: وابستگی به اینترفیس‌ها نه پیاده‌سازی
 * اصل OCP: قابل توسعه با اضافه کردن ژنراتورهای جدید
 */

// ============ Interfaces ============
class ILessonRepository {
    async getLessonById(id) {}
    async getLessonsByFilter(filter) {}
    async saveLesson(lesson) {}
    async updateLessonProgress(userId, lessonId, progress) {}
    async getNextReviewLesson(userId) {}
    async getUserProgress(userId) {}
    async getUserStats(userId) {}
    async updateUserStats(userId, stats) {}
}

class ISRSEngine {
    calculateNextReview(previousInterval, easeFactor, performance) {}
    calculateEaseFactor(currentEase, performance) {}
    getReviewSchedule(difficulty) {}
}

class IExerciseGenerator {
    generateExercise(lesson, count) {}
    validateAnswer(exercise, userAnswer) {}
    calculateScore(exercise, userAnswer, timeSpent) {}
}

class ICacheProvider {
    get(key) {}
    set(key, value, ttl) {}
    invalidate(key) {}
    clear() {}
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
        Object.freeze(this);
    }
}

class ExerciseRequestDTO {
    constructor(data) {
        this.lessonId = data.lessonId;
        this.exerciseType = data.exerciseType;
        this.difficulty = data.difficulty;
        this.count = data.count || 5;
        this.userLevel = data.userLevel || 1;
        Object.freeze(this);
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
        Object.freeze(this);
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
        Object.freeze(this);
    }
}

// ============ Custom Errors ============
class LessonError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'LessonError';
        this.code = code;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

class LessonNotFoundError extends LessonError {
    constructor(lessonId) {
        super(`درس با شناسه ${lessonId} یافت نشد`, 'LESSON_NOT_FOUND', { lessonId });
        this.name = 'LessonNotFoundError';
    }
}

class LessonLockedError extends LessonError {
    constructor(lessonId, prerequisites) {
        super('این درس قفل است. ابتدا درس‌های پیش‌نیاز را کامل کنید.', 
              'LESSON_LOCKED', { lessonId, prerequisites });
        this.name = 'LessonLockedError';
    }
}

class ExerciseGenerationError extends LessonError {
    constructor(lessonId, exerciseType) {
        super(`خطا در تولید تمرین برای نوع ${exerciseType}`, 
              'EXERCISE_GENERATION_FAILED', { lessonId, exerciseType });
        this.name = 'ExerciseGenerationError';
    }
}

// ============ Cache Provider Implementation ============
class MemoryCacheProvider {
    constructor(defaultTTL = 5 * 60 * 1000) { // 5 دقیقه پیش‌فرض
        this.cache = new Map();
        this.defaultTTL = defaultTTL;
        this.stats = { hits: 0, misses: 0, sets: 0 };
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            this.stats.misses++;
            return null;
        }
        
        if (Date.now() > item.expiresAt) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }
        
        this.stats.hits++;
        return item.value;
    }

    set(key, value, ttl = this.defaultTTL) {
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + ttl
        });
        this.stats.sets++;
    }

    invalidate(key) {
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0, sets: 0 };
    }

    getStats() {
        return { ...this.stats, size: this.cache.size };
    }
}

// ============ SRSEngine Implementation ============
class SRSEngineImpl extends ISRSEngine {
    constructor(config = {}) {
        super();
        this.config = {
            initialInterval: config.initialInterval || 1,
            minEaseFactor: config.minEaseFactor || 1.3,
            maxEaseFactor: config.maxEaseFactor || 5.0,
            easeFactorStep: config.easeFactorStep || 0.1,
            intervalModifier: config.intervalModifier || 1.0,
            passingScore: config.passingScore || 60,
            excellentScore: config.excellentScore || 90,
            ...config
        };
    }

    calculateNextReview(previousInterval, easeFactor, performance) {
        const performanceScore = Math.max(0, Math.min(100, performance));
        
        // پاسخ ضعیف - بازگشت به ابتدا
        if (performanceScore < this.config.passingScore) {
            return {
                interval: 1,
                easeFactor: Math.max(
                    this.config.minEaseFactor,
                    easeFactor - this.config.easeFactorStep
                )
            };
        }
        
        // پاسخ متوسط
        if (performanceScore < this.config.excellentScore) {
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
            1: [1, 3, 7, 14, 30, 60, 90],
            2: [1, 2, 5, 10, 21, 40, 70],
            3: [1, 1, 3, 7, 14, 28, 56],
            4: [1, 1, 2, 5, 10, 20, 40],
            5: [1, 1, 1, 3, 7, 14, 28]
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
            id: `flashcard-${Date.now()}-${Math.random()}`,
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
        if (!userAnswer || typeof userAnswer !== 'string') {
            return { isCorrect: false, score: 0 };
        }

        const normalizedUser = userAnswer.trim().toLowerCase();
        const normalizedCorrect = exercise.correctAnswer.trim().toLowerCase();
        
        // تطابق دقیق
        if (normalizedUser === normalizedCorrect) {
            return { isCorrect: true, score: 100 };
        }
        
        // تطابق جزئی برای اشتباهات املایی
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
        
        const timeBonus = Math.max(0, 20 - (timeSpent / 1000));
        const total = Math.min(100, validation.score + timeBonus);
        
        return {
            score: validation.score,
            timeBonus,
            total: Math.round(total)
        };
    }

    _selectRandomItems(array, count) {
        if (!array.length) return [];
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
        
        if (content.vocabulary?.length) {
            const vocabExercises = this._generateVocabularyExercises(
                content.vocabulary,
                Math.min(3, count)
            );
            exercises.push(...vocabExercises);
        }
        
        if (content.grammarPoints?.length && exercises.length < count) {
            const grammarExercises = this._generateGrammarExercises(
                content.grammarPoints,
                count - exercises.length
            );
            exercises.push(...grammarExercises);
        }
        
        return exercises.slice(0, count).map(e => ({
            ...e,
            id: `${e.type}-${Date.now()}-${Math.random()}`
        }));
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
        const timeBonus = Math.max(0, 10 - (timeSpent / 2000));
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

    _selectRandomItems(array, count) {
        if (!array.length) return [];
        const shuffled = [...array].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, array.length));
    }

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
    constructor(lessonRepository, srsEngine, stateManager, logger, cacheProvider = null) {
        if (!lessonRepository || !srsEngine || !stateManager || !logger) {
            throw new LessonError('همه وابستگی‌های LessonService باید ارائه شوند', 
                                 'MISSING_DEPENDENCIES');
        }
        
        this.lessonRepository = lessonRepository;
        this.srsEngine = srsEngine;
        this.stateManager = stateManager;
        this.logger = logger;
        this.cache = cacheProvider || new MemoryCacheProvider();
        
        this.exerciseGenerators = {
            'flashcard': new FlashcardGenerator(),
            'multiple_choice': new MultipleChoiceGenerator()
        };
        
        this.metrics = {
            lessonsStarted: 0,
            lessonsCompleted: 0,
            totalTimeSpent: 0,
            averageScore: 0
        };
    }

    async getLesson(lessonId) {
        try {
            this.logger.info('دریافت درس', { lessonId });
            
            // بررسی کش
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
            
            // ذخیره در کش
            this.cache.set(cacheKey, lesson);
            
            return lesson;
            
        } catch (error) {
            if (error instanceof LessonError) throw error;
            throw new LessonError('خطا در دریافت درس', 'LESSON_FETCH_ERROR', { 
                lessonId, 
                error: error.message 
            });
        }
    }

    async getLessons(request) {
        try {
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
            
            this.cache.set(cacheKey, result, 2 * 60 * 1000); // کش 2 دقیقه
            return result;
                
        } catch (error) {
            throw new LessonError('خطا در دریافت لیست درس‌ها', 'LESSONS_FETCH_ERROR', { 
                request, 
                error: error.message 
            });
        }
    }

    async startLesson(lessonId) {
        try {
            this.logger.info('شروع درس', { lessonId });
            
            const currentState = this.stateManager.getState();
            const user = currentState.auth?.user;
            
            if (!user) {
                throw new LessonError('کاربر وارد سیستم نشده است', 'USER_NOT_AUTHENTICATED');
            }
            
            const lesson = await this.getLesson(lessonId);
            
            // بررسی قفل بودن درس
            await this._checkLessonLock(lesson, user);
            
            const progress = {
                userId: user.id,
                lessonId: lesson.id,
                status: 'in_progress',
                startedAt: new Date().toISOString(),
                attempts: 1,
                srsData: { easeFactor: 2.5, interval: 1, reviewCount: 0 }
            };
            
            await this.lessonRepository.updateLessonProgress(user.id, lesson.id, progress);
            await this.stateManager.dispatch('LESSON_LOAD', { lesson, progress });
            
            this.metrics.lessonsStarted++;
            
            return { lesson, progress };
            
        } catch (error) {
            if (error instanceof LessonError) throw error;
            throw new LessonError('خطا در شروع درس', 'LESSON_START_ERROR', { 
                lessonId, 
                error: error.message 
            });
        }
    }

    async completeLesson(lessonId, score, timeSpent, answers = []) {
        try {
            this.logger.info('تکمیل درس', { lessonId, score, timeSpent });
            
            const currentState = this.stateManager.getState();
            const user = currentState.auth?.user;
            
            if (!user) {
                throw new LessonError('کاربر وارد سیستم نشده است', 'USER_NOT_AUTHENTICATED');
            }
            
            const lesson = await this.getLesson(lessonId);
            const progress = await this._getUserProgress(user.id, lessonId);
            
            if (!progress) {
                throw new LessonError('پیشرفتی برای این درس یافت نشد', 'PROGRESS_NOT_FOUND');
            }
            
            const srsUpdate = this._calculateSRSUpdate(lesson.difficulty, progress.srsData, score);
            
            const updatedProgress = {
                ...progress,
                status: 'completed',
                score: Math.max(progress.score || 0, score),
                completedAt: new Date().toISOString(),
                timeSpent: (progress.timeSpent || 0) + timeSpent,
                answers: [...(progress.answers || []), ...answers],
                srsData: srsUpdate
            };
            
            await this.lessonRepository.updateLessonProgress(user.id, lesson.id, updatedProgress);
            await this._updateUserStats(user.id, lesson, score, timeSpent);
            await this.stateManager.dispatch('LESSON_COMPLETE', {
                lessonId: lesson.id,
                score,
                xpEarned: lesson.xpReward,
                srsUpdate
            });
            
            this._updateMetrics(score, timeSpent);
            
            // اینوالیدیت کش‌های مرتبط
            this.cache.invalidate(`lessons:${user.id}`);
            
            return {
                lesson,
                progress: updatedProgress,
                xpEarned: lesson.xpReward,
                nextReview: srsUpdate.nextReview
            };
            
        } catch (error) {
            if (error instanceof LessonError) throw error;
            throw new LessonError('خطا در تکمیل درس', 'LESSON_COMPLETE_ERROR', { 
                lessonId, 
                error: error.message 
            });
        }
    }

    async generateExercises(lessonId, exerciseType, count = 5) {
        try {
            this.logger.info('تولید تمرین', { lessonId, exerciseType, count });
            
            const lesson = await this.getLesson(lessonId);
            const generator = this.exerciseGenerators[exerciseType];
            
            if (!generator) {
                throw new ExerciseGenerationError(lessonId, exerciseType);
            }
            
            const exercises = generator.generateExercise(lesson, count);
            
            await this.stateManager.dispatch('UI_STATE_CHANGE', {
                currentExercises: exercises,
                exerciseType,
                lessonId
            });
            
            return exercises;
            
        } catch (error) {
            if (error instanceof LessonError) throw error;
            throw new ExerciseGenerationError(lessonId, exerciseType);
        }
    }

    async validateExercise(exerciseId, userAnswer, timeSpent = 0) {
        try {
            this.logger.info('اعتبارسنجی تمرین', { exerciseId, timeSpent });
            
            const currentState = this.stateManager.getState();
            const exercises = currentState.ui?.currentExercises || [];
            
            const exercise = exercises.find(e => e.id === exerciseId);
            if (!exercise) {
                throw new LessonError('تمرین یافت نشد', 'EXERCISE_NOT_FOUND', { exerciseId });
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
            
            return result;
            
        } catch (error) {
            if (error instanceof LessonError) throw error;
            throw new LessonError('خطا در اعتبارسنجی تمرین', 'EXERCISE_VALIDATION_ERROR', { 
                exerciseId, 
                error: error.message 
            });
        }
    }

    async getNextReviewLesson() {
        try {
            this.logger.info('دریافت درس بعدی برای مرور');
            
            const currentState = this.stateManager.getState();
            const user = currentState.auth?.user;
            
            if (!user) {
                throw new LessonError('کاربر وارد سیستم نشده است', 'USER_NOT_AUTHENTICATED');
            }
            
            const nextLesson = await this.lessonRepository.getNextReviewLesson(user.id);
            
            if (!nextLesson) {
                const availableLessons = await this.getLessons({
                    userId: user.id,
                    limit: 10,
                    offset: 0
                });
                
                return availableLessons.find(lesson => 
                    !lesson.userProgress || lesson.userProgress.status === 'not_started'
                ) || null;
            }
            
            return nextLesson;
            
        } catch (error) {
            throw new LessonError('خطا در دریافت درس مرور', 'NEXT_REVIEW_FETCH_ERROR', { 
                error: error.message 
            });
        }
    }

    getMetrics() {
        return { ...this.metrics };
    }

    clearCache() {
        this.cache.clear();
        this.logger.info('کش پاک‌سازی شد');
    }

    // ============ Private Methods ============

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

    _isLessonLocked(lesson, progressMap) {
        if (lesson.status === 'locked') return true;
        
        const prerequisites = lesson.prerequisites || [];
        return prerequisites.some(prereqId => {
            const progress = progressMap.get(prereqId);
            return !progress || progress.status !== 'completed';
        });
    }

    async _checkLessonLock(lesson, user) {
        if (lesson.status === 'locked' && !user.isPremium) {
            throw new LessonLockedError(lesson.id, lesson.prerequisites || []);
        }
    }

    async _getUserProgress(userId, lessonId) {
        const progressList = await this.lessonRepository.getUserProgress(userId);
        return progressList.find(p => p.lessonId === lessonId);
    }

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
            streak: score >= 70 ? (currentSRS?.streak || 0) + 1 : 0
        };
    }

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

    _updateMetrics(score, timeSpent) {
        this.metrics.lessonsCompleted++;
        this.metrics.totalTimeSpent += timeSpent;
        this.metrics.averageScore = (
            (this.metrics.averageScore * (this.metrics.lessonsCompleted - 1) + score) / 
            this.metrics.lessonsCompleted
        );
    }
}

// ============ Service Factory ============
class LessonServiceFactory {
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

    static createWithMock(stateManager, logger, options = {}) {
        const mockRepository = {
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
        
        // اضافه کردن درس‌های نمونه
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
        
        return LessonServiceFactory.create(mockRepository, stateManager, logger, options);
    }
}

// ============ Export ============
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
    LessonRequestDTO,
    ExerciseRequestDTO,
    LessonProgressDTO,
    SRSUpdateDTO,
    LessonError,
    LessonNotFoundError,
    LessonLockedError,
    ExerciseGenerationError
};
