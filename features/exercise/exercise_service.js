// features/exercise/exercise-service.js
/**
 * Exercise Service - مدیریت تمرین‌های آموزشی
 * مسئولیت: تولید، اعتبارسنجی و مدیریت تمرین‌های مختلف زبان
 * اصل SRP: فقط عملیات مرتبط با تمرین‌ها
 * اصل DIP: وابستگی به Repository Interface نه پیاده‌سازی
 * اصل ISP: اینترفیس‌های مجزا برای هر نوع تمرین
 * اصل OCP: قابلیت اضافه کردن انواع جدید تمرین بدون تغییر کد موجود
 */

// ============ Interfaces ============
class IExerciseRepository {
    async getExerciseById(exerciseId) {}
    async getExercisesByLessonId(lessonId, limit, offset) {}
    async saveExerciseResult(userId, exerciseId, result) {}
    async getExerciseStats(userId, exerciseId) {}
    async getExerciseHistory(userId, limit) {}
}

class IExerciseGenerator {
    generateExercise(lesson, options) {}
    generateMultipleExercises(lesson, count, options) {}
}

class IExerciseValidator {
    validateAnswer(exercise, userAnswer) {}
    calculateScore(exercise, userAnswer, responseTime) {}
    getHint(exercise) {}
    getExplanation(exercise) {}
}

class ITypoAnalyzer {
    analyzeTypo(userAnswer, correctAnswer) {}
    calculateLevenshteinDistance(str1, str2) {}
    getSimilarityPercentage(str1, str2) {}
    suggestCorrection(userAnswer, correctAnswer) {}
}

// ============ DTOs (Data Transfer Objects) ============
class ExerciseRequestDTO {
    constructor(data) {
        this.lessonId = data.lessonId || '';
        this.type = data.type || 'multiple-choice';
        this.difficulty = data.difficulty || 'intermediate';
        this.count = data.count || 1;
        this.excludeExercises = data.excludeExercises || [];
        this.options = data.options || {};
    }

    toExerciseParams() {
        return {
            lesson_id: this.lessonId,
            type: this.type,
            difficulty: this.difficulty,
            count: this.count,
            exclude_ids: this.excludeExercises,
            shuffle: this.options.shuffle !== false,
            include_media: this.options.include_media || false,
            time_limit: this.options.time_limit || 0
        };
    }
}

class ExerciseResponseDTO {
    constructor(exercise) {
        this.id = exercise.id;
        this.lesson_id = exercise.lesson_id;
        this.type = exercise.type;
        this.difficulty = exercise.difficulty;
        this.question = exercise.question;
        this.options = exercise.options || [];
        this.correct_answer = exercise.correct_answer;
        this.explanation = exercise.explanation || '';
        this.hint = exercise.hint || '';
        this.media_url = exercise.media_url || '';
        this.tags = exercise.tags || [];
        this.metadata = exercise.metadata || {};
    }

    static fromExerciseModel(exercise) {
        return new ExerciseResponseDTO(exercise);
    }
}

class ExerciseResultDTO {
    constructor(data) {
        this.exerciseId = data.exerciseId;
        this.userId = data.userId;
        this.userAnswer = data.userAnswer;
        this.isCorrect = data.isCorrect;
        this.responseTime = data.responseTime || 0;
        this.attempts = data.attempts || 1;
        this.hintsUsed = data.hintsUsed || 0;
        this.score = data.score || 0;
        this.completedAt = data.completedAt || new Date().toISOString();
    }

    toExerciseHistory() {
        return {
            exercise_id: this.exerciseId,
            user_id: this.userId,
            user_answer: this.userAnswer,
            is_correct: this.isCorrect,
            response_time_ms: this.responseTime,
            attempts: this.attempts,
            hints_used: this.hintsUsed,
            score: this.score,
            completed_at: this.completedAt
        };
    }
}

class ExerciseStatsDTO {
    constructor(stats) {
        this.totalAttempts = stats.totalAttempts || 0;
        this.correctAttempts = stats.correctAttempts || 0;
        this.accuracyRate = stats.accuracyRate || 0;
        this.averageResponseTime = stats.averageResponseTime || 0;
        this.lastAttemptAt = stats.lastAttemptAt || null;
        this.streak = stats.streak || 0;
        this.masteryLevel = stats.masteryLevel || 0;
    }

    static fromRawData(data) {
        const accuracy = data.totalAttempts > 0 
            ? (data.correctAttempts / data.totalAttempts) * 100 
            : 0;
            
        return new ExerciseStatsDTO({
            totalAttempts: data.totalAttempts,
            correctAttempts: data.correctAttempts,
            accuracyRate: Math.round(accuracy * 100) / 100,
            averageResponseTime: data.averageResponseTime || 0,
            lastAttemptAt: data.lastAttemptAt,
            streak: data.streak || 0,
            masteryLevel: ExerciseStatsDTO.calculateMasteryLevel(
                accuracy, 
                data.totalAttempts
            )
        });
    }

    static calculateMasteryLevel(accuracy, attempts) {
        if (attempts < 5) return 0; // Beginner
        if (accuracy >= 90) return 5; // Master
        if (accuracy >= 75) return 4; // Advanced
        if (accuracy >= 60) return 3; // Intermediate
        if (accuracy >= 40) return 2; // Basic
        return 1; // Learning
    }
}

// ============ Typo Analyzer ============
class LevenshteinTypoAnalyzer {
    /**
     * محاسبه فاصله لوناشتاین بین دو رشته
     */
    calculateLevenshteinDistance(str1, str2) {
        const normalized1 = this._normalizeText(str1);
        const normalized2 = this._normalizeText(str2);
        
        const matrix = Array(normalized2.length + 1).fill(null).map(
            () => Array(normalized1.length + 1).fill(null)
        );

        for (let i = 0; i <= normalized1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= normalized2.length; j++) matrix[j][0] = j;

        for (let j = 1; j <= normalized2.length; j++) {
            for (let i = 1; i <= normalized1.length; i++) {
                const indicator = normalized1[i - 1] === normalized2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1, // deletion
                    matrix[j - 1][i] + 1, // insertion
                    matrix[j - 1][i - 1] + indicator // substitution
                );
            }
        }

        return matrix[normalized2.length][normalized1.length];
    }

    /**
     * تحلیل غلط املایی کاربر
     */
    analyzeTypo(userAnswer, correctAnswer) {
        const distance = this.calculateLevenshteinDistance(userAnswer, correctAnswer);
        const maxLength = Math.max(userAnswer.length, correctAnswer.length);
        const similarity = maxLength === 0 ? 100 : ((maxLength - distance) / maxLength) * 100;
        
        return {
            hasTypo: distance > 0 && similarity >= 70,
            distance,
            similarityPercentage: Math.round(similarity * 100) / 100,
            isExactMatch: distance === 0,
            suggestions: this.suggestCorrection(userAnswer, correctAnswer, similarity)
        };
    }

    /**
     * دریافت درصد شباهت
     */
    getSimilarityPercentage(str1, str2) {
        const distance = this.calculateLevenshteinDistance(str1, str2);
        const maxLength = Math.max(str1.length, str2.length);
        return maxLength === 0 ? 100 : ((maxLength - distance) / maxLength) * 100;
    }

    /**
     * پیشنهاد تصحیح
     */
    suggestCorrection(userAnswer, correctAnswer, similarity) {
        if (similarity >= 80) {
            return {
                type: 'minor_typo',
                message: 'اشتباه تایپی جزئی',
                correction: correctAnswer
            };
        } else if (similarity >= 60) {
            return {
                type: 'major_typo',
                message: 'اشتباه تایپی قابل توجه',
                correction: correctAnswer,
                explanation: 'به املای کلمه دقت کنید'
            };
        }
        return null;
    }

    /**
     * نرمال‌سازی متن برای مقایسه
     * @private
     */
    _normalizeText(text) {
        if (!text) return '';
        
        return text
            .toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[؟?،,.;:!]/g, '') // حذف علائم نگارشی
            .replace(/[آا]/g, 'ا') // یکسان‌سازی الف
            .replace(/[يى]/g, 'ی') // یکسان‌سازی ی
            .replace(/[ؤ]/g, 'و') // یکسان‌سازی و
            .replace(/[ك]/g, 'ک') // یکسان‌سازی ک
            .replace(/[ة]/g, 'ه'); // یکسان‌سازی ه
    }
}

// ============ Exercise Validator ============
class ExerciseValidatorImpl {
    constructor(typoAnalyzer) {
        this.typoAnalyzer = typoAnalyzer || new LevenshteinTypoAnalyzer();
    }

    validateAnswer(exercise, userAnswer) {
        if (!exercise || !userAnswer) {
            return {
                isValid: false,
                isCorrect: false,
                error: 'تمرین یا پاسخ نامعتبر است'
            };
        }

        const normalizedUserAnswer = this._normalizeAnswer(userAnswer);
        const normalizedCorrectAnswer = this._normalizeAnswer(exercise.correct_answer);

        switch (exercise.type) {
            case 'multiple-choice':
                return this._validateMultipleChoice(
                    normalizedUserAnswer, 
                    normalizedCorrectAnswer,
                    exercise.options
                );
                
            case 'fill-blank':
                return this._validateFillBlank(
                    normalizedUserAnswer,
                    normalizedCorrectAnswer
                );
                
            case 'translation':
                return this._validateTranslation(
                    normalizedUserAnswer,
                    normalizedCorrectAnswer,
                    exercise.acceptable_variations || []
                );
                
            case 'pronunciation':
                return this._validatePronunciation(
                    userAnswer,
                    exercise.correct_answer
                );
                
            case 'matching':
                return this._validateMatching(
                    userAnswer,
                    exercise.correct_matches
                );
                
            default:
                return this._validateDefault(
                    normalizedUserAnswer,
                    normalizedCorrectAnswer
                );
        }
    }

    calculateScore(exercise, userAnswer, responseTime) {
        const validation = this.validateAnswer(exercise, userAnswer);
        let baseScore = 0;

        if (validation.isCorrect) {
            baseScore = 100;
        } else if (validation.typoAnalysis?.hasTypo) {
            baseScore = 70; // نمره برای پاسخ با غلط تایپی
        } else {
            baseScore = 0;
        }

        // امتیاز بر اساس زمان پاسخ
        const timeBonus = this._calculateTimeBonus(responseTime, exercise.expected_time || 30);

        // جریمه برای استفاده از hint
        const hintPenalty = exercise.hintsUsed ? (exercise.hintsUsed * 5) : 0;

        // امتیاز نهایی
        let finalScore = baseScore + timeBonus - hintPenalty;
        finalScore = Math.max(0, Math.min(100, finalScore)); // محدود کردن بین ۰ تا ۱۰۰

        return {
            baseScore,
            timeBonus,
            hintPenalty,
            finalScore,
            isPerfect: finalScore === 100,
            feedback: this._generateScoreFeedback(finalScore, validation)
        };
    }

    getHint(exercise) {
        if (!exercise.hint) {
            // تولید hint هوشمند اگر وجود نداشته باشد
            return this._generateSmartHint(exercise);
        }
        return exercise.hint;
    }

    getExplanation(exercise) {
        return exercise.explanation || this._generateDefaultExplanation(exercise);
    }

    // ============ Validation Methods ============

    _validateMultipleChoice(userAnswer, correctAnswer, options) {
        const isCorrect = userAnswer === correctAnswer;
        
        return {
            isValid: true,
            isCorrect,
            selectedOption: userAnswer,
            correctOption: correctAnswer,
            feedback: isCorrect 
                ? 'پاسخ صحیح است ✓' 
                : 'پاسخ نادرست است ✗'
        };
    }

    _validateFillBlank(userAnswer, correctAnswer) {
        const typoAnalysis = this.typoAnalyzer.analyzeTypo(userAnswer, correctAnswer);
        const isCorrect = userAnswer === correctAnswer || typoAnalysis.hasTypo;

        return {
            isValid: true,
            isCorrect,
            typoAnalysis,
            userAnswer,
            correctAnswer,
            feedback: isCorrect
                ? typoAnalysis.hasTypo
                    ? 'پاسخ تقریباً درست است (اشتباه تایپی)' 
                    : 'پاسخ کاملاً صحیح است ✓'
                : 'پاسخ نادرست است. به املای کلمه دقت کنید'
        };
    }

    _validateTranslation(userAnswer, correctAnswer, acceptableVariations) {
        const similarity = this.typoAnalyzer.getSimilarityPercentage(userAnswer, correctAnswer);
        const isExactMatch = userAnswer === correctAnswer;
        const isAcceptableVariation = acceptableVariations.some(
            v => this.typoAnalyzer.getSimilarityPercentage(userAnswer, v) >= 80
        );
        
        const isCorrect = isExactMatch || isAcceptableVariation || similarity >= 85;

        return {
            isValid: true,
            isCorrect,
            similarityPercentage: Math.round(similarity * 100) / 100,
            isExactMatch,
            isAcceptableVariation,
            userAnswer,
            correctAnswer,
            feedback: isCorrect
                ? 'ترجمه شما قابل قبول است ✓'
                : 'ترجمه دقیق نیست. به معنی کلمه دقت کنید'
        };
    }

    _validatePronunciation(userAnswer, correctAnswer) {
        // شبیه‌سازی بررسی تلفظ - در پروژه واقعی با Web Speech API
        const similarity = this.typoAnalyzer.getSimilarityPercentage(userAnswer, correctAnswer);
        const isCorrect = similarity >= 70;

        return {
            isValid: true,
            isCorrect,
            similarityPercentage: Math.round(similarity * 100) / 100,
            userPhonetic: userAnswer,
            correctPhonetic: correctAnswer,
            feedback: isCorrect
                ? 'تلفظ شما خوب است ✓'
                : 'تلفظ دقیق نیست. به فایل صوتی گوش دهید'
        };
    }

    _validateMatching(userAnswer, correctMatches) {
        if (!Array.isArray(userAnswer) || !Array.isArray(correctMatches)) {
            return { isValid: false, isCorrect: false, error: 'فرمت پاسخ نامعتبر است' };
        }

        const matchedCount = userAnswer.filter(
            (pair, index) => pair.left === correctMatches[index]?.left && 
                          pair.right === correctMatches[index]?.right
        ).length;

        const isCorrect = matchedCount === correctMatches.length;

        return {
            isValid: true,
            isCorrect,
            matchedCount,
            totalMatches: correctMatches.length,
            accuracyPercentage: (matchedCount / correctMatches.length) * 100,
            feedback: isCorrect
                ? 'همه موارد به درستی تطبیق داده شدند ✓'
                : `${matchedCount} از ${correctMatches.length} مورد صحیح است`
        };
    }

    _validateDefault(userAnswer, correctAnswer) {
        const isCorrect = userAnswer === correctAnswer;

        return {
            isValid: true,
            isCorrect,
            userAnswer,
            correctAnswer,
            feedback: isCorrect ? 'صحیح ✓' : 'نادرست ✗'
        };
    }

    // ============ Helper Methods ============

    _normalizeAnswer(answer) {
        if (answer === null || answer === undefined) return '';
        
        return answer
            .toString()
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[آا]/g, 'ا')
            .replace(/[يى]/g, 'ی');
    }

    _calculateTimeBonus(responseTime, expectedTime) {
        if (!responseTime || responseTime <= 0) return 0;
        
        if (responseTime <= expectedTime * 0.5) return 15; // خیلی سریع
        if (responseTime <= expectedTime) return 10; // در زمان انتظار
        if (responseTime <= expectedTime * 1.5) return 5; // کمی دیرتر
        return 0; // خیلی دیر
    }

    _generateScoreFeedback(score, validation) {
        if (score === 100) return '🎉 عالی! پاسخ کاملاً صحیح';
        if (score >= 80) return '✓ خوب است. کمی دقت بیشتر';
        if (score >= 60) return '✓ قابل قبول. نیاز به تمرین بیشتر';
        return '✗ نیاز به مرور مجدد این مبحث';
    }

    _generateSmartHint(exercise) {
        // تولید hint هوشمند بر اساس نوع تمرین
        switch (exercise.type) {
            case 'multiple-choice':
                return 'به شباهت گزینه‌ها دقت کنید';
            case 'fill-blank':
                return 'به تعداد حروف و حروف اول کلمه توجه کنید';
            case 'translation':
                return 'به context جمله دقت کنید';
            default:
                return 'سعی کنید با دقت بیشتری پاسخ دهید';
        }
    }

    _generateDefaultExplanation(exercise) {
        return `پاسخ صحیح: ${exercise.correct_answer}`;
    }
}

// ============ Exercise Generator ============
class ExerciseGenerator {
    constructor(validator) {
        this.validator = validator;
    }

    generateExercise(lesson, options = {}) {
        if (!lesson || !lesson.vocabulary || lesson.vocabulary.length === 0) {
            throw new Error('داده‌های درس برای تولید تمرین کافی نیست');
        }

        const type = options.type || this._selectRandomType();
        const difficulty = options.difficulty || lesson.difficulty || 'intermediate';

        switch (type) {
            case 'multiple-choice':
                return this._generateMultipleChoice(lesson, difficulty);
            case 'fill-blank':
                return this._generateFillBlank(lesson, difficulty);
            case 'translation':
                return this._generateTranslation(lesson, difficulty);
            default:
                return this._generateMultipleChoice(lesson, difficulty);
        }
    }

    generateMultipleExercises(lesson, count, options = {}) {
        const exercises = [];
        const usedIds = new Set();

        for (let i = 0; i < count; i++) {
            try {
                const exercise = this.generateExercise(lesson, {
                    ...options,
                    excludeIds: Array.from(usedIds)
                });

                if (exercise && exercise.id && !usedIds.has(exercise.id)) {
                    exercises.push(exercise);
                    usedIds.add(exercise.id);
                }
            } catch (error) {
                console.warn('خطا در تولید تمرین:', error);
            }
        }

        return exercises;
    }

    // ============ Generation Methods ============

    _generateMultipleChoice(lesson, difficulty) {
        const vocabList = lesson.vocabulary;
        const targetVocab = this._selectRandomVocab(vocabList, lesson.excludeIds);
        
        if (!targetVocab) return null;

        const correctAnswer = targetVocab[lesson.targetLanguage || 'en'];
        const options = this._generateOptions(
            correctAnswer,
            vocabList,
            lesson.targetLanguage || 'en',
            3 // تعداد گزینه‌های اضافی
        );

        return {
            id: `mc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            lesson_id: lesson.id,
            type: 'multiple-choice',
            difficulty,
            question: `معنی "${targetVocab.fa || targetVocab.word}" چیست؟`,
            options: this._shuffleArray([correctAnswer, ...options]),
            correct_answer: correctAnswer,
            explanation: targetVocab.example || 'این کلمه در جمله‌های زیر کاربرد دارد...',
            hint: 'به ریشه کلمه توجه کنید',
            tags: targetVocab.tags || ['vocabulary'],
            metadata: {
                sourceVocab: targetVocab,
                difficulty
            }
        };
    }

    _generateFillBlank(lesson, difficulty) {
        const vocabList = lesson.vocabulary;
        const targetVocab = this._selectRandomVocab(vocabList, lesson.excludeIds);
        
        if (!targetVocab || !targetVocab.example) return null;

        const sentence = targetVocab.example;
        const blankedSentence = sentence.replace(
            new RegExp(targetVocab[lesson.targetLanguage || 'en'], 'i'),
            '______'
        );

        return {
            id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            lesson_id: lesson.id,
            type: 'fill-blank',
            difficulty,
            question: blankedSentence,
            correct_answer: targetVocab[lesson.targetLanguage || 'en'],
            explanation: targetVocab.fa || targetVocab.translation,
            hint: `این کلمه به معنای "${targetVocab.fa}" است`,
            tags: targetVocab.tags || ['vocabulary', 'grammar'],
            metadata: {
                sourceVocab: targetVocab,
                difficulty
            }
        };
    }

    _generateTranslation(lesson, difficulty) {
        const vocabList = lesson.vocabulary;
        const targetVocab = this._selectRandomVocab(vocabList, lesson.excludeIds);
        
        if (!targetVocab) return null;

        const direction = Math.random() > 0.5 ? 'fa2en' : 'en2fa';
        const question = direction === 'fa2en' 
            ? `معنی "${targetVocab.fa || targetVocab.translation}" به انگلیسی چیست؟`
            : `ترجمه "${targetVocab.en || targetVocab.word}" به فارسی چیست؟`;

        return {
            id: `tr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            lesson_id: lesson.id,
            type: 'translation',
            difficulty,
            question,
            correct_answer: direction === 'fa2en' 
                ? targetVocab.en || targetVocab.word
                : targetVocab.fa || targetVocab.translation,
            acceptable_variations: targetVocab.synonyms || [],
            explanation: targetVocab.example || 'کاربرد این کلمه در جمله...',
            hint: direction === 'fa2en' 
                ? 'به حروف اول کلمه انگلیسی دقت کنید'
                : 'به معنی کلمه در جمله دقت کنید',
            tags: targetVocab.tags || ['translation'],
            metadata: {
                sourceVocab: targetVocab,
                direction,
                difficulty
            }
        };
    }

    // ============ Helper Methods ============

    _selectRandomType() {
        const types = ['multiple-choice', 'fill-blank', 'translation'];
        const weights = [0.5, 0.3, 0.2]; // احتمال وقوع هر نوع
        
        const random = Math.random();
        let cumulativeWeight = 0;
        
        for (let i = 0; i < types.length; i++) {
            cumulativeWeight += weights[i];
            if (random < cumulativeWeight) {
                return types[i];
            }
        }
        
        return 'multiple-choice';
    }

    _selectRandomVocab(vocabList, excludeIds = []) {
        const availableVocab = vocabList.filter(v => !excludeIds.includes(v.id));
        if (availableVocab.length === 0) return null;
        
        const randomIndex = Math.floor(Math.random() * availableVocab.length);
        return availableVocab[randomIndex];
    }

    _generateOptions(correctAnswer, vocabList, language, count) {
        const otherVocab = vocabList
            .filter(v => v[language] !== correctAnswer)
            .map(v => v[language]);
        
        const options = [];
        const usedOptions = new Set([correctAnswer]);

        while (options.length < count && options.length < otherVocab.length) {
            const randomIndex = Math.floor(Math.random() * otherVocab.length);
            const option = otherVocab[randomIndex];
            
            if (!usedOptions.has(option) && option) {
                options.push(option);
                usedOptions.add(option);
            }
        }

        return options;
    }

    _shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}

// ============ Exercise Service ============
class ExerciseService {
    constructor(exerciseRepository, generator, validator, stateManager, typoAnalyzer) {
        if (!exerciseRepository || !generator || !validator || !stateManager) {
            throw new Error('همه وابستگی‌های ExerciseService باید ارائه شوند');
        }

        this.exerciseRepository = exerciseRepository;
        this.generator = generator;
        this.validator = validator;
        this.stateManager = stateManager;
        this.typoAnalyzer = typoAnalyzer || new LevenshteinTypoAnalyzer();
        this.currentExercises = new Map();
    }

    /**
     * دریافت تمرین‌های یک درس
     */
    async getExercisesForLesson(request) {
        try {
            const exerciseRequest = new ExerciseRequestDTO(request);
            const params = exerciseRequest.toExerciseParams();

            // تلاش برای دریافت از ریپازیتوری
            let exercises = await this.exerciseRepository.getExercisesByLessonId(
                params.lesson_id,
                params.count,
                0
            );

            // اگر تمرین کافی نبود، تولید کن
            if (exercises.length < params.count) {
                const lesson = await this._getLessonById(params.lesson_id);
                const newExercises = this.generator.generateMultipleExercises(
                    lesson,
                    params.count - exercises.length,
                    {
                        type: params.type,
                        difficulty: params.difficulty,
                        excludeExercises: params.exclude_ids
                    }
                );
                
                exercises = [...exercises, ...newExercises];
            }

            // shuffle اگر نیاز باشد
            if (params.shuffle) {
                exercises = this._shuffleArray(exercises);
            }

            // ذخیره در کش
            exercises.forEach(ex => {
                this.currentExercises.set(ex.id, ex);
            });

            return exercises.map(ex => ExerciseResponseDTO.fromExerciseModel(ex));

        } catch (error) {
            console.error('خطا در دریافت تمرین‌ها:', error);
            throw error;
        }
    }

    /**
     * ثبت نتیجه تمرین
     */
    async submitExerciseResult(exerciseId, userAnswer, metadata = {}) {
        try {
            const currentState = this.stateManager.getState();
            const userId = currentState.auth.user?.id;

            if (!userId) {
                throw new Error('کاربر وارد سیستم نشده است');
            }

            const exercise = this.currentExercises.get(exerciseId) || 
                           await this.exerciseRepository.getExerciseById(exerciseId);

            if (!exercise) {
                throw new Error('تمرین یافت نشد');
            }

            // اعتبارسنجی پاسخ
            const validation = this.validator.validateAnswer(exercise, userAnswer);

            // محاسبه امتیاز
            const score = this.validator.calculateScore(
                exercise, 
                userAnswer, 
                metadata.responseTime
            );

            // ایجاد نتیجه
            const result = new ExerciseResultDTO({
                exerciseId,
                userId,
                userAnswer,
                isCorrect: validation.isCorrect,
                responseTime: metadata.responseTime || 0,
                attempts: metadata.attempts || 1,
                hintsUsed: metadata.hintsUsed || 0,
                score: score.finalScore,
                completedAt: new Date().toISOString()
            });

            // ذخیره نتیجه
            await this.exerciseRepository.saveExerciseResult(
                userId,
                exerciseId,
                result.toExerciseHistory()
            );

            // به‌روزرسانی state
            await this.stateManager.dispatch('EXERCISE_COMPLETED', {
                exerciseId,
                result: validation,
                score: score.finalScore
            });

            // دریافت آمار به‌روز
            const stats = await this.getExerciseStats(exerciseId);

            return {
                validation,
                score,
                stats,
                feedback: this._generateFeedback(validation, score, exercise)
            };

        } catch (error) {
            console.error('خطا در ثبت نتیجه تمرین:', error);
            throw error;
        }
    }

    /**
     * دریافت آمار تمرین
     */
    async getExerciseStats(exerciseId) {
        try {
            const currentState = this.stateManager.getState();
            const userId = currentState.auth.user?.id;

            if (!userId) {
                return null;
            }

            const rawStats = await this.exerciseRepository.getExerciseStats(userId, exerciseId);
            return ExerciseStatsDTO.fromRawData(rawStats);

        } catch (error) {
            console.error('خطا در دریافت آمار تمرین:', error);
            return null;
        }
    }

    /**
     * دریافت تاریخچه تمرین‌ها
     */
    async getExerciseHistory(limit = 20) {
        try {
            const currentState = this.stateManager.getState();
            const userId = currentState.auth.user?.id;

            if (!userId) {
                return [];
            }

            return await this.exerciseRepository.getExerciseHistory(userId, limit);

        } catch (error) {
            console.error('خطا در دریافت تاریخچه:', error);
            return [];
        }
    }

    /**
     * درخواست hint برای تمرین
     */
    async getHint(exerciseId) {
        try {
            const exercise = this.currentExercises.get(exerciseId) ||
                           await this.exerciseRepository.getExerciseById(exerciseId);

            if (!exercise) {
                throw new Error('تمرین یافت نشد');
            }

            const hint = this.validator.getHint(exercise);

            // ثبت استفاده از hint
            await this.stateManager.dispatch('EXERCISE_HINT_USED', {
                exerciseId,
                hint
            });

            return hint;

        } catch (error) {
            console.error('خطا در دریافت hint:', error);
            throw error;
        }
    }

    /**
     * دریافت توضیحات تمرین
     */
    async getExplanation(exerciseId) {
        try {
            const exercise = this.currentExercises.get(exerciseId) ||
                           await this.exerciseRepository.getExerciseById(exerciseId);

            if (!exercise) {
                throw new Error('تمرین یافت نشد');
            }

            return this.validator.getExplanation(exercise);

        } catch (error) {
            console.error('خطا در دریافت توضیحات:', error);
            throw error;
        }
    }

    /**
     * پاک‌سازی کش تمرین‌ها
     */
    clearCache() {
        this.currentExercises.clear();
        console.log('کش تمرین‌ها پاک‌سازی شد');
    }

    // ============ Private Methods ============

    async _getLessonById(lessonId) {
        // TODO: دریافت درس از Lesson Service
        // اینجا شبیه‌سازی شده است
        return {
            id: lessonId,
            vocabulary: [
                { id: 1, en: 'hello', fa: 'سلام', example: 'Hello, how are you?' },
                { id: 2, en: 'goodbye', fa: 'خداحافظ', example: 'Goodbye, see you later' },
                { id: 3, en: 'thanks', fa: 'متشکرم', example: 'Thanks for your help' },
                { id: 4, en: 'please', fa: 'لطفاً', example: 'Please sit down' },
                { id: 5, en: 'sorry', fa: 'متأسفم', example: 'Sorry, I am late' }
            ],
            difficulty: 'intermediate',
            targetLanguage: 'en'
        };
    }

    _generateFeedback(validation, score, exercise) {
        if (validation.isCorrect && score.finalScore === 100) {
            return '🎉 عالی! پاسخ کاملاً درست';
        } else if (validation.isCorrect) {
            return '✓ پاسخ شما درست است';
        } else if (validation.typoAnalysis?.hasTypo) {
            return `✎ اشتباه تایپی: "${validation.typoAnalysis.suggestions?.correction}"`;
        } else {
            return `✗ پاسخ نادرست. ${exercise.hint || 'دوباره تلاش کنید'}`;
        }
    }

    _shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}

// ============ Factory برای ایجاد ExerciseService ============
class ExerciseServiceFactory {
    static create(exerciseRepository, stateManager, options = {}) {
        const typoAnalyzer = options.typoAnalyzer || new LevenshteinTypoAnalyzer();
        const validator = new ExerciseValidatorImpl(typoAnalyzer);
        const generator = new ExerciseGenerator(validator);
        
        return new ExerciseService(
            exerciseRepository,
            generator,
            validator,
            stateManager,
            typoAnalyzer
        );
    }
}

// ============ Export ============
export {
    ExerciseService,
    ExerciseServiceFactory,
    IExerciseRepository,
    IExerciseGenerator,
    IExerciseValidator,
    ITypoAnalyzer,
    ExerciseRequestDTO,
    ExerciseResponseDTO,
    ExerciseResultDTO,
    ExerciseStatsDTO,
    ExerciseValidatorImpl,
    ExerciseGenerator,
    LevenshteinTypoAnalyzer
};
