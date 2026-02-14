
```javascript
// features/exercise/types/multiple-choice.js
/**
 * Multiple Choice Exercise - تمرین چندگزینه‌ای
 * مسئولیت: ایجاد و مدیریت تمرین‌های چندگزینه‌ای
 * اصل SRP: فقط مسئول تمرین چندگزینه‌ای
 * اصل OCP: قابل توسعه برای انواع مختلف چندگزینه‌ای
 * اصل LSP: قابل جایگزینی با سایر انواع تمرین
 */

// ============ Types ============
class MultipleChoiceOption {
    constructor(id, text, isCorrect, feedback = null) {
        this.id = id;
        this.text = text;
        this.isCorrect = isCorrect;
        this.feedback = feedback;
        this.selectedCount = 0;
        this.isDisabled = false;
    }

    select() {
        this.selectedCount++;
        return this;
    }

    disable() {
        this.isDisabled = true;
        return this;
    }

    toJSON() {
        return {
            id: this.id,
            text: this.text,
            isCorrect: this.isCorrect,
            feedback: this.feedback,
            isDisabled: this.isDisabled
        };
    }
}

class MultipleChoiceConfig {
    constructor(config = {}) {
        this.shuffleOptions = config.shuffleOptions ?? true;
        this.showFeedback = config.showFeedback ?? true;
        this.allowMultipleCorrect = config.allowMultipleCorrect ?? false;
        this.minOptions = config.minOptions ?? 3;
        this.maxOptions = config.maxOptions ?? 6;
        this.timeLimit = config.timeLimit ?? 0;
        this.pointsPerCorrect = config.pointsPerCorrect ?? 10;
        this.penaltyPerWrong = config.penaltyPerWrong ?? 2;
        this.hintCost = config.hintCost ?? 5;
    }

    validate() {
        if (this.minOptions < 2) {
            throw new Error('حداقل گزینه‌ها باید ۲ باشد');
        }
        if (this.maxOptions > 10) {
            throw new Error('حداکثر گزینه‌ها نمی‌تواند بیش از ۱۰ باشد');
        }
        return true;
    }
}

class MultipleChoiceResult {
    constructor(exerciseId, selectedOptionId, isCorrect, responseTime) {
        this.exerciseId = exerciseId;
        this.selectedOptionId = selectedOptionId;
        this.isCorrect = isCorrect;
        this.responseTime = responseTime;
        this.timestamp = new Date().toISOString();
        this.hintsUsed = 0;
        this.attempts = 1;
    }

    addHint() {
        this.hintsUsed++;
        return this;
    }

    incrementAttempt() {
        this.attempts++;
        return this;
    }

    calculateScore(config) {
        let score = 0;
        
        if (this.isCorrect) {
            score = config.pointsPerCorrect;
            
            // پنالتی برای استفاده از hint
            score -= this.hintsUsed * config.hintCost;
            
            // پاداش زمان سریع
            if (config.timeLimit > 0 && this.responseTime < config.timeLimit * 0.3) {
                score += 5; // پاداش سرعت
            }
        } else {
            score = -config.penaltyPerWrong;
        }
        
        // پنالتی برای تلاش‌های متعدد
        score -= (this.attempts - 1) * 2;
        
        return Math.max(0, score);
    }
}

// ============ DTOs ============
class MultipleChoiceExerciseDTO {
    constructor(data) {
        this.id = data.id || `mc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.lessonId = data.lessonId;
        this.type = 'multiple-choice';
        this.difficulty = data.difficulty || 'intermediate';
        this.question = data.question;
        this.category = data.category || 'vocabulary';
        this.tags = data.tags || [];
        this.config = new MultipleChoiceConfig(data.config);
        this.metadata = data.metadata || {};
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
    }

    addOption(option) {
        if (!this.options) this.options = [];
        if (this.options.length >= this.config.maxOptions) {
            throw new Error(`حداکثر ${this.config.maxOptions} گزینه مجاز است`);
        }
        this.options.push(option);
        return this;
    }

    setOptions(options) {
        if (options.length < this.config.minOptions) {
            throw new Error(`حداقل ${this.config.minOptions} گزینه نیاز است`);
        }
        if (options.length > this.config.maxOptions) {
            throw new Error(`حداکثر ${this.config.maxOptions} گزینه مجاز است`);
        }
        
        this.options = options.map((opt, index) => {
            if (opt instanceof MultipleChoiceOption) {
                return opt;
            }
            return new MultipleChoiceOption(
                opt.id || `opt_${index + 1}`,
                opt.text,
                opt.isCorrect,
                opt.feedback
            );
        });
        
        return this;
    }

    validate() {
        if (!this.question) {
            throw new Error('سوال تمرین الزامی است');
        }
        
        if (!this.options || this.options.length < this.config.minOptions) {
            throw new Error(`حداقل ${this.config.minOptions} گزینه نیاز است`);
        }
        
        const correctCount = this.options.filter(opt => opt.isCorrect).length;
        
        if (!this.config.allowMultipleCorrect && correctCount !== 1) {
            throw new Error('در حالت عادی باید دقیقاً یک گزینه صحیح باشد');
        }
        
        if (this.config.allowMultipleCorrect && correctCount < 1) {
            throw new Error('حداقل یک گزینه صحیح باید وجود داشته باشد');
        }
        
        this.config.validate();
        
        return true;
    }

    toJSON() {
        return {
            id: this.id,
            lessonId: this.lessonId,
            type: this.type,
            difficulty: this.difficulty,
            question: this.question,
            category: this.category,
            tags: this.tags,
            options: this.options?.map(opt => opt.toJSON()),
            config: this.config,
            metadata: this.metadata,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

// ============ Generators ============
class MultipleChoiceGenerator {
    constructor(validator) {
        this.validator = validator;
        this.templates = new Map();
        this._registerDefaultTemplates();
    }

    /**
     * تولید تمرین چندگزینه‌ای از روی لغت
     */
    generateFromVocabulary(vocab, options = {}) {
        const template = options.template || 'standard';
        const generator = this.templates.get(template);
        
        if (!generator) {
            throw new Error(`قالب ${template} یافت نشد`);
        }
        
        return generator(vocab, options);
    }

    /**
     * تولید تمرین از روی جمله
     */
    generateFromSentence(sentence, vocab, options = {}) {
        const exercise = new MultipleChoiceExerciseDTO({
            lessonId: options.lessonId,
            difficulty: options.difficulty || 'intermediate',
            question: sentence.replace(vocab.word, '______'),
            category: 'grammar',
            tags: ['sentence', 'context'],
            config: options.config
        });

        // تولید گزینه‌ها
        const correctOption = new MultipleChoiceOption(
            'correct',
            vocab.word,
            true,
            '✓ پاسخ صحیح'
        );

        const wrongOptions = this._generateWrongOptions(
            vocab.word,
            options.wrongOptionsCount || 3,
            options.wrongOptionsSource || []
        );

        exercise.setOptions([correctOption, ...wrongOptions]);

        if (options.shuffleOptions) {
            exercise.options = this._shuffleArray(exercise.options);
        }

        return exercise;
    }

    /**
     * تولید تمرین از روی تعریف
     */
    generateFromDefinition(vocab, options = {}) {
        const exercise = new MultipleChoiceExerciseDTO({
            lessonId: options.lessonId,
            difficulty: options.difficulty || 'intermediate',
            question: `کدام گزینه معنی "${vocab.definition || vocab.fa}" است؟`,
            category: 'definition',
            tags: ['definition', 'meaning'],
            config: options.config
        });

        const correctOption = new MultipleChoiceOption(
            'correct',
            vocab.word,
            true,
            '✓ معنی صحیح'
        );

        const wrongOptions = this._generateWrongOptions(
            vocab.word,
            options.wrongOptionsCount || 3,
            options.wrongOptionsSource || []
        );

        exercise.setOptions([correctOption, ...wrongOptions]);

        return exercise;
    }

    /**
     * تولید تمرین از روی تصویر
     */
    generateFromImage(vocab, imageUrl, options = {}) {
        const exercise = new MultipleChoiceExerciseDTO({
            lessonId: options.lessonId,
            difficulty: options.difficulty || 'intermediate',
            question: 'کدام گزینه تصویر را توصیف می‌کند؟',
            category: 'image',
            tags: ['visual', 'image'],
            config: options.config,
            metadata: {
                imageUrl,
                imageAlt: vocab.fa || vocab.word
            }
        });

        const correctOption = new MultipleChoiceOption(
            'correct',
            vocab.word,
            true,
            '✓ توصیف صحیح'
        );

        const wrongOptions = this._generateWrongOptions(
            vocab.word,
            options.wrongOptionsCount || 3,
            options.wrongOptionsSource || []
        );

        exercise.setOptions([correctOption, ...wrongOptions]);

        return exercise;
    }

    /**
     * ثبت قالب جدید
     */
    registerTemplate(name, generator) {
        if (typeof generator !== 'function') {
            throw new Error('Generator باید یک تابع باشد');
        }
        this.templates.set(name, generator);
    }

    // ============ Private Methods ============

    _registerDefaultTemplates() {
        // قالب استاندارد
        this.templates.set('standard', (vocab, options) => {
            const exercise = new MultipleChoiceExerciseDTO({
                lessonId: options.lessonId,
                difficulty: options.difficulty || 'intermediate',
                question: `معنی کلمه "${vocab.word}" چیست؟`,
                category: 'vocabulary',
                tags: ['standard', 'word'],
                config: options.config
            });

            const correctOption = new MultipleChoiceOption(
                'correct',
                vocab.fa || vocab.translation,
                true,
                '✓ ترجمه صحیح'
            );

            const wrongOptions = this._generateWrongOptions(
                vocab.fa || vocab.translation,
                options.wrongOptionsCount || 3,
                options.wrongOptionsSource || []
            );

            exercise.setOptions([correctOption, ...wrongOptions]);

            return exercise;
        });

        // قالب عکس
        this.templates.set('opposite', (vocab, options) => {
            const opposite = vocab.opposite || this._findOpposite(vocab);
            
            const exercise = new MultipleChoiceExerciseDTO({
                lessonId: options.lessonId,
                difficulty: 'advanced',
                question: `متضاد کلمه "${vocab.word}" کدام است؟`,
                category: 'opposite',
                tags: ['antonym', 'opposite'],
                config: options.config
            });

            const correctOption = new MultipleChoiceOption(
                'correct',
                opposite,
                true,
                '✓ متضاد صحیح'
            );

            const wrongOptions = this._generateWrongOptions(
                opposite,
                options.wrongOptionsCount || 3,
                options.wrongOptionsSource || []
            );

            exercise.setOptions([correctOption, ...wrongOptions]);

            return exercise;
        });

        // قالب مترادف
        this.templates.set('synonym', (vocab, options) => {
            const synonym = vocab.synonym || this._findSynonym(vocab);
            
            const exercise = new MultipleChoiceExerciseDTO({
                lessonId: options.lessonId,
                difficulty: 'advanced',
                question: `مترادف کلمه "${vocab.word}" کدام است؟`,
                category: 'synonym',
                tags: ['synonym', 'similar'],
                config: options.config
            });

            const correctOption = new MultipleChoiceOption(
                'correct',
                synonym,
                true,
                '✓ مترادف صحیح'
            );

            const wrongOptions = this._generateWrongOptions(
                synonym,
                options.wrongOptionsCount || 3,
                options.wrongOptionsSource || []
            );

            exercise.setOptions([correctOption, ...wrongOptions]);

            return exercise;
        });
    }

    _generateWrongOptions(correctAnswer, count, source) {
        const wrongOptions = [];
        const usedOptions = new Set([correctAnswer]);

        for (let i = 0; i < count; i++) {
            if (source.length > 0) {
                // استفاده از منبع مشخص شده
                const availableSource = source.filter(s => !usedOptions.has(s));
                if (availableSource.length === 0) break;
                
                const randomIndex = Math.floor(Math.random() * availableSource.length);
                const option = availableSource[randomIndex];
                
                wrongOptions.push(new MultipleChoiceOption(
                    `wrong_${i + 1}`,
                    option,
                    false,
                    '✗ گزینه نادرست'
                ));
                usedOptions.add(option);
            } else {
                // تولید گزینه تصادفی
                wrongOptions.push(new MultipleChoiceOption(
                    `wrong_${i + 1}`,
                    this._generateRandomOption(),
                    false,
                    '✗ گزینه نادرست'
                ));
            }
        }

        return wrongOptions;
    }

    _generateRandomOption() {
        const randomWords = [
            'سلام', 'خداحافظ', 'متشکرم', 'لطفاً', 'بله', 'خیر',
            'ممکن', 'غیرممکن', 'خوب', 'بد', 'بزرگ', 'کوچک'
        ];
        return randomWords[Math.floor(Math.random() * randomWords.length)];
    }

    _findOpposite(vocab) {
        // در پروژه واقعی از دیکشنری متضادها استفاده شود
        const opposites = {
            'بزرگ': 'کوچک',
            'خوب': 'بد',
            'سریع': 'کند',
            'گرم': 'سرد'
        };
        return opposites[vocab.fa] || 'متضاد نامشخص';
    }

    _findSynonym(vocab) {
        // در پروژه واقعی از دیکشنری مترادف‌ها استفاده شود
        const synonyms = {
            'زیبا': 'قشنگ',
            'خوب': 'عالی',
            'سریع': 'تیز'
        };
        return synonyms[vocab.fa] || 'مترادف نامشخص';
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

// ============ Validator ============
class MultipleChoiceValidator {
    constructor() {
        this.rules = new Map();
        this._registerDefaultRules();
    }

    validateAnswer(exercise, selectedOptionId) {
        if (!exercise || !exercise.options) {
            return {
                isValid: false,
                isCorrect: false,
                error: 'تمرین نامعتبر است'
            };
        }

        const selectedOption = exercise.options.find(opt => opt.id === selectedOptionId);
        
        if (!selectedOption) {
            return {
                isValid: false,
                isCorrect: false,
                error: 'گزینه انتخاب شده نامعتبر است'
            };
        }

        const isCorrect = selectedOption.isCorrect;

        // اجرای قوانین اضافی
        const ruleResults = this._applyRules(exercise, selectedOption);

        return {
            isValid: true,
            isCorrect,
            selectedOption,
            correctOptions: exercise.options.filter(opt => opt.isCorrect),
            feedback: this._generateFeedback(selectedOption, isCorrect, ruleResults),
            ruleResults,
            metadata: {
                hasMultipleCorrect: exercise.options.filter(opt => opt.isCorrect).length > 1,
                selectedAt: new Date().toISOString()
            }
        };
    }

    analyzeResponse(validation, responseTime) {
        const analysis = {
            isCorrect: validation.isCorrect,
            responseTime,
            confidence: this._calculateConfidence(validation, responseTime),
            needsReview: false,
            suggestions: []
        };

        // تحلیل کیفیت پاسخ
        if (!validation.isCorrect) {
            analysis.needsReview = true;
            analysis.suggestions.push('این مبحث نیاز به مرور دارد');
        } else if (responseTime > 10000) { // بیشتر از ۱۰ ثانیه
            analysis.suggestions.push('تمرین بیشتری برای افزایش سرعت نیاز دارید');
        }

        // تحلیل اشتباهات رایج
        if (validation.ruleResults?.length > 0) {
            const failedRules = validation.ruleResults.filter(r => !r.passed);
            failedRules.forEach(rule => {
                analysis.suggestions.push(rule.suggestion);
            });
        }

        return analysis;
    }

    addRule(name, rule) {
        if (typeof rule !== 'function') {
            throw new Error('Rule باید یک تابع باشد');
        }
        this.rules.set(name, rule);
    }

    // ============ Private Methods ============

    _registerDefaultRules() {
        // قانون عدم انتخاب چندگزینه
        this.rules.set('noMultipleSelection', (exercise, selectedOption) => {
            // این قانون در کلاینت چک می‌شود
            return { passed: true };
        });

        // قانون زمان پاسخگویی
        this.rules.set('responseTime', (exercise, selectedOption, context) => {
            if (context.responseTime > 30000) { // بیشتر از ۳۰ ثانیه
                return {
                    passed: false,
                    message: 'زمان پاسخگویی طولانی بود',
                    suggestion: 'سعی کنید سریع‌تر پاسخ دهید'
                };
            }
            return { passed: true };
        });

        // قانون عدم تغییر پاسخ
        this.rules.set('noAnswerChange', (exercise, selectedOption, context) => {
            if (context.attempts > 1) {
                return {
                    passed: false,
                    message: 'پاسخ خود را تغییر دادید',
                    suggestion: 'به اولین انتخاب خود اعتماد کنید'
                };
            }
            return { passed: true };
        });
    }

    _applyRules(exercise, selectedOption, context = {}) {
        const results = [];
        
        for (const [name, rule] of this.rules) {
            try {
                const result = rule(exercise, selectedOption, context);
                results.push({
                    name,
                    ...result
                });
            } catch (error) {
                console.error(`خطا در اجرای قانون ${name}:`, error);
            }
        }
        
        return results;
    }

    _generateFeedback(selectedOption, isCorrect, ruleResults) {
        if (isCorrect && selectedOption.feedback) {
            return selectedOption.feedback;
        }

        if (!isCorrect) {
            // پیدا کردن بازخورد مناسب
            const correctOption = selectedOption.isCorrect ? 
                selectedOption : 
                null;
            
            if (correctOption?.feedback) {
                return correctOption.feedback;
            }

            // بررسی نتایج قوانین
            const failedRule = ruleResults.find(r => !r.passed);
            if (failedRule?.message) {
                return failedRule.message;
            }

            return 'گزینه اشتباه است. دوباره تلاش کنید.';
        }

        return '✓ پاسخ صحیح';
    }

    _calculateConfidence(validation, responseTime) {
        let confidence = 0.5; // پایه

        if (validation.isCorrect) {
            confidence += 0.3;
            
            if (responseTime < 5000) { // کمتر از ۵ ثانیه
                confidence += 0.2;
            } else if (responseTime < 10000) { // بین ۵ تا ۱۰ ثانیه
                confidence += 0.1;
            }
        } else {
            confidence -= 0.2;
        }

        // محدود کردن بین ۰ تا ۱
        return Math.max(0, Math.min(1, confidence));
    }
}

// ============ Statistics ============
class MultipleChoiceStatistics {
    constructor(exerciseId) {
        this.exerciseId = exerciseId;
        this.totalAttempts = 0;
        this.correctAttempts = 0;
        this.wrongAttempts = 0;
        this.optionStats = new Map();
        this.averageResponseTime = 0;
        this.totalResponseTime = 0;
        this.lastAttemptAt = null;
    }

    addResult(result) {
        this.totalAttempts++;
        this.totalResponseTime += result.responseTime;
        this.averageResponseTime = this.totalResponseTime / this.totalAttempts;
        this.lastAttemptAt = result.timestamp;

        if (result.isCorrect) {
            this.correctAttempts++;
        } else {
            this.wrongAttempts++;
        }

        // آمار گزینه‌ها
        const optionId = result.selectedOptionId;
        const currentStat = this.optionStats.get(optionId) || {
            selectedCount: 0,
            correctCount: 0
        };
        
        currentStat.selectedCount++;
        if (result.isCorrect) {
            currentStat.correctCount++;
        }
        
        this.optionStats.set(optionId, currentStat);
    }

    getAccuracy() {
        return this.totalAttempts > 0 
            ? (this.correctAttempts / this.totalAttempts) * 100 
            : 0;
    }

    getOptionAccuracy(optionId) {
        const stat = this.optionStats.get(optionId);
        if (!stat || stat.selectedCount === 0) return 0;
        return (stat.correctCount / stat.selectedCount) * 100;
    }

    getMostSelectedWrongOption() {
        let mostSelected = null;
        let maxCount = 0;

        for (const [optionId, stat] of this.optionStats) {
            if (stat.correctCount === 0 && stat.selectedCount > maxCount) {
                mostSelected = optionId;
                maxCount = stat.selectedCount;
            }
        }

        return mostSelected;
    }

    toJSON() {
        return {
            exerciseId: this.exerciseId,
            totalAttempts: this.totalAttempts,
            correctAttempts: this.correctAttempts,
            wrongAttempts: this.wrongAttempts,
            accuracy: this.getAccuracy(),
            averageResponseTime: this.averageResponseTime,
            lastAttemptAt: this.lastAttemptAt,
            optionStats: Array.from(this.optionStats.entries()).map(([id, stat]) => ({
                optionId: id,
                ...stat,
                accuracy: this.getOptionAccuracy(id)
            }))
        };
    }
}

// ============ Factory ============
class MultipleChoiceFactory {
    static createExercise(data) {
        const exercise = new MultipleChoiceExerciseDTO(data);
        
        if (data.options) {
            exercise.setOptions(data.options);
        }
        
        exercise.validate();
        return exercise;
    }

    static createGenerator(validator) {
        return new MultipleChoiceGenerator(validator);
    }

    static createValidator() {
        return new MultipleChoiceValidator();
    }

    static createStatistics(exerciseId) {
        return new MultipleChoiceStatistics(exerciseId);
    }

    static createFromTemplate(template, data) {
        const generator = new MultipleChoiceGenerator();
        const vocab = data.vocab;
        const options = data.options || {};

        switch (template) {
            case 'vocabulary':
                return generator.generateFromVocabulary(vocab, options);
            case 'sentence':
                return generator.generateFromSentence(data.sentence, vocab, options);
            case 'definition':
                return generator.generateFromDefinition(vocab, options);
            case 'image':
                return generator.generateFromImage(vocab, data.imageUrl, options);
            default:
                throw new Error(`قالب ${template} پشتیبانی نمی‌شود`);
        }
    }
}

// ============ Export ============
export {
    MultipleChoiceOption,
    MultipleChoiceConfig,
    MultipleChoiceResult,
    MultipleChoiceExerciseDTO,
    MultipleChoiceGenerator,
    MultipleChoiceValidator,
    MultipleChoiceStatistics,
    MultipleChoiceFactory
};
```
