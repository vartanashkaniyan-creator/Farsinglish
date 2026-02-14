```javascript
// features/exercise/validator.js
/**
 * Exercise Validator - اعتبارسنجی پاسخ‌های کاربر
 * مسئولیت: بررسی صحت پاسخ‌ها، تحلیل غلط‌های املایی و محاسبه امتیاز
 * اصل SRP: فقط مسئول اعتبارسنجی انواع مختلف تمرین
 * اصل DIP: مستقل از منبع داده و قابل استفاده در لایه‌های مختلف
 * اصل OCP: قابل توسعه برای انواع جدید سوال و قوانین اعتبارسنجی
 */

// ============ Types and Enums ============
const ValidationType = {
    EXACT_MATCH: 'exact_match',
    CASE_INSENSITIVE: 'case_insensitive',
    LEVENSHTEIN: 'levenshtein',
    REGEX: 'regex',
    SEMANTIC: 'semantic',
    NUMERIC: 'numeric',
    MULTIPLE_CHOICE: 'multiple_choice',
    FILL_BLANK: 'fill_blank',
    TRANSLATION: 'translation',
    PRONUNCIATION: 'pronunciation',
    MATCHING: 'matching',
    ORDERING: 'ordering'
};

const DifficultyLevel = {
    BEGINNER: 1,
    ELEMENTARY: 2,
    INTERMEDIATE: 3,
    ADVANCED: 4,
    EXPERT: 5
};

const ScoreWeight = {
    CORRECT: 100,
    PARTIALLY_CORRECT: 70,
    TYPO: 80,
    CLOSE_MATCH: 60,
    INCORRECT: 0,
    TIME_BONUS_MAX: 20,
    HINT_PENALTY_PER_USE: 10,
    ATTEMPT_PENALTY: 5
};

// ============ DTOs ============
class ValidationRequest {
    constructor(data) {
        this.exerciseId = data.exerciseId;
        this.exerciseType = data.exerciseType;
        this.userAnswer = data.userAnswer;
        this.correctAnswer = data.correctAnswer;
        this.options = data.options || [];
        this.metadata = data.metadata || {};
        this.context = data.context || {};
        this.timestamp = data.timestamp || Date.now();
        this.responseTime = data.responseTime || 0;
        this.attemptNumber = data.attemptNumber || 1;
        this.hintsUsed = data.hintsUsed || 0;
    }

    validate() {
        if (!this.exerciseId) throw new Error('Exercise ID is required');
        if (!this.exerciseType) throw new Error('Exercise type is required');
        if (this.userAnswer === undefined) throw new Error('User answer is required');
        return true;
    }
}

class ValidationResult {
    constructor(data) {
        this.isValid = data.isValid || false;
        this.isCorrect = data.isCorrect || false;
        this.score = data.score || 0;
        this.feedback = data.feedback || '';
        this.details = data.details || {};
        this.suggestions = data.suggestions || [];
        this.typoAnalysis = data.typoAnalysis || null;
        this.similarity = data.similarity || 0;
        this.mistakes = data.mistakes || [];
        this.strengths = data.strengths || [];
        this.nextSteps = data.nextSteps || [];
        this.metadata = {
            processingTime: data.processingTime || 0,
            validatorVersion: data.validatorVersion || '1.0.0',
            ...data.metadata
        };
    }

    toJSON() {
        return {
            isValid: this.isValid,
            isCorrect: this.isCorrect,
            score: this.score,
            feedback: this.feedback,
            details: this.details,
            suggestions: this.suggestions,
            typoAnalysis: this.typoAnalysis,
            similarity: this.similarity,
            mistakes: this.mistakes,
            strengths: this.strengths,
            nextSteps: this.nextSteps,
            metadata: this.metadata
        };
    }
}

class TypoAnalysis {
    constructor(data) {
        this.hasTypo = data.hasTypo || false;
        this.distance = data.distance || 0;
        this.similarity = data.similarity || 100;
        this.typoType = data.typoType || null; // 'insertion', 'deletion', 'substitution', 'transposition'
        this.suggestions = data.suggestions || [];
        this.correctedAnswer = data.correctedAnswer || null;
        this.errorPositions = data.errorPositions || [];
        this.commonMistakes = data.commonMistakes || [];
    }
}

// ============ Levenshtein Calculator ============
class LevenshteinCalculator {
    constructor() {
        this.cache = new Map();
    }

    calculate(str1, str2, options = {}) {
        const cacheKey = `${str1}|${str2}|${JSON.stringify(options)}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const normalized1 = this._normalize(str1, options);
        const normalized2 = this._normalize(str2, options);

        const result = this._calculateDistance(normalized1, normalized2);
        const details = this._analyzeDifferences(normalized1, normalized2, result.matrix);

        const output = {
            distance: result.distance,
            similarity: this._calculateSimilarity(result.distance, normalized1.length, normalized2.length),
            operations: result.operations,
            details,
            matrix: options.returnMatrix ? result.matrix : undefined
        };

        this.cache.set(cacheKey, output);
        return output;
    }

    clearCache() {
        this.cache.clear();
    }

    _normalize(text, options) {
        if (!text) return '';

        let normalized = String(text);

        if (options?.caseSensitive === false) {
            normalized = normalized.toLowerCase();
        }

        if (options?.ignoreWhitespace) {
            normalized = normalized.replace(/\s+/g, ' ').trim();
        }

        if (options?.ignoreDiacritics) {
            normalized = this._removeDiacritics(normalized);
        }

        if (options?.ignorePunctuation) {
            normalized = normalized.replace(/[.,!?;:'"()[\]{}<>/\\\-=_+`~@#$%^&*|]/g, '');
        }

        if (options?.persianNormalization) {
            normalized = this._normalizePersian(normalized);
        }

        return normalized;
    }

    _removeDiacritics(text) {
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    _normalizePersian(text) {
        return text
            .replace(/[يى]/g, 'ی')
            .replace(/[ك]/g, 'ک')
            .replace(/[ؤ]/g, 'و')
            .replace(/[ئ]/g, 'ی')
            .replace(/[إأآ]/g, 'ا')
            .replace(/[ة]/g, 'ه')
            .replace(/[ۀ]/g, 'ه')
            .replace(/[َُِّ]/g, ''); // حذف اعراب
    }

    _calculateDistance(str1, str2) {
        const m = str1.length;
        const n = str2.length;
        const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));
        const operations = [];

        // Initialize
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        // Fill dp table
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1, // deletion
                    dp[i][j - 1] + 1, // insertion
                    dp[i - 1][j - 1] + cost // substitution
                );
            }
        }

        // Backtrack to find operations
        let i = m, j = n;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && str1[i - 1] === str2[j - 1]) {
                operations.unshift({ type: 'match', char: str1[i - 1] });
                i--; j--;
            } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
                operations.unshift({ 
                    type: 'substitution', 
                    from: str1[i - 1], 
                    to: str2[j - 1] 
                });
                i--; j--;
            } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
                operations.unshift({ type: 'deletion', char: str1[i - 1] });
                i--;
            } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
                operations.unshift({ type: 'insertion', char: str2[j - 1] });
                j--;
            }
        }

        return {
            distance: dp[m][n],
            operations,
            matrix: dp
        };
    }

    _calculateSimilarity(distance, len1, len2) {
        const maxLen = Math.max(len1, len2);
        if (maxLen === 0) return 100;
        return ((maxLen - distance) / maxLen) * 100;
    }

    _analyzeDifferences(str1, str2, matrix) {
        const details = {
            insertions: 0,
            deletions: 0,
            substitutions: 0,
            matches: 0,
            errorPositions: []
        };

        let i = str1.length;
        let j = str2.length;

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && str1[i - 1] === str2[j - 1]) {
                details.matches++;
                i--; j--;
            } else if (i > 0 && j > 0 && matrix[i][j] === matrix[i - 1][j - 1] + 1) {
                details.substitutions++;
                details.errorPositions.push({ position: i - 1, type: 'substitution' });
                i--; j--;
            } else if (i > 0 && matrix[i][j] === matrix[i - 1][j] + 1) {
                details.deletions++;
                details.errorPositions.push({ position: i - 1, type: 'deletion' });
                i--;
            } else if (j > 0 && matrix[i][j] === matrix[i][j - 1] + 1) {
                details.insertions++;
                details.errorPositions.push({ position: j - 1, type: 'insertion' });
                j--;
            }
        }

        return details;
    }
}

// ============ Pattern Matcher ============
class PatternMatcher {
    constructor() {
        this.patterns = new Map();
        this._registerDefaultPatterns();
    }

    match(text, pattern, options = {}) {
        if (!text || !pattern) return false;

        const patternKey = typeof pattern === 'string' ? pattern : pattern.toString();
        const compiled = this._compilePattern(patternKey, options);

        if (compiled.type === 'regex') {
            return compiled.regex.test(text);
        } else if (compiled.type === 'wildcard') {
            return this._matchWildcard(text, compiled.pattern);
        } else if (compiled.type === 'phonetic') {
            return this._matchPhonetic(text, compiled.pattern);
        }

        return false;
    }

    findMatches(text, patterns) {
        return patterns
            .map(p => ({
                pattern: p,
                matches: this.match(text, p)
            }))
            .filter(r => r.matches);
    }

    _compilePattern(pattern, options) {
        const cacheKey = `${pattern}|${JSON.stringify(options)}`;
        if (this.patterns.has(cacheKey)) {
            return this.patterns.get(cacheKey);
        }

        let compiled;

        if (pattern.startsWith('/') && pattern.endsWith('/')) {
            // regex pattern
            const regexStr = pattern.slice(1, -1);
            const flags = options.caseSensitive ? '' : 'i';
            compiled = {
                type: 'regex',
                regex: new RegExp(regexStr, flags),
                pattern
            };
        } else if (pattern.includes('*') || pattern.includes('?')) {
            // wildcard pattern
            compiled = {
                type: 'wildcard',
                pattern: this._wildcardToRegex(pattern),
                original: pattern
            };
        } else {
            // exact or phonetic
            compiled = {
                type: options.phonetic ? 'phonetic' : 'exact',
                pattern: options.caseSensitive ? pattern : pattern.toLowerCase(),
                original: pattern
            };
        }

        this.patterns.set(cacheKey, compiled);
        return compiled;
    }

    _wildcardToRegex(pattern) {
        return pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
    }

    _matchWildcard(text, regexPattern) {
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(text);
    }

    _matchPhonetic(text, pattern) {
        // پیاده‌سازی ساده matching فونتیک
        // در پروژه واقعی از کتابخانه‌های تخصصی استفاده شود
        const phoneticMap = {
            'ای': ['ی', 'ي'],
            'آ': ['ا', 'أ'],
            'ک': ['ك'],
            'گ': ['گ'],
            'چ': ['چ'],
            'پ': ['پ'],
            'ژ': ['ژ']
        };

        let normalizedText = text;
        let normalizedPattern = pattern;

        Object.entries(phoneticMap).forEach(([key, values]) => {
            values.forEach(value => {
                normalizedText = normalizedText.replace(new RegExp(value, 'g'), key);
                normalizedPattern = normalizedPattern.replace(new RegExp(value, 'g'), key);
            });
        });

        return normalizedText === normalizedPattern;
    }

    _registerDefaultPatterns() {
        // ثبت الگوهای پیش‌فرض
    }
}

// ============ Validator Rules ============
class ValidatorRule {
    constructor(name, fn, weight = 1) {
        this.name = name;
        this.fn = fn;
        this.weight = weight;
    }

    async execute(context) {
        try {
            const result = await this.fn(context);
            return {
                name: this.name,
                passed: result.passed,
                score: result.score || (result.passed ? 100 : 0),
                feedback: result.feedback,
                weight: this.weight,
                metadata: result.metadata || {}
            };
        } catch (error) {
            console.error(`Error executing rule ${this.name}:`, error);
            return {
                name: this.name,
                passed: false,
                score: 0,
                feedback: 'خطا در اجرای قانون اعتبارسنجی',
                weight: this.weight,
                error: error.message
            };
        }
    }
}

class ValidatorRuleSet {
    constructor() {
        this.rules = new Map();
        this._registerDefaultRules();
    }

    addRule(rule) {
        if (!(rule instanceof ValidatorRule)) {
            throw new Error('Rule must be an instance of ValidatorRule');
        }
        this.rules.set(rule.name, rule);
    }

    getRulesForExercise(type, difficulty) {
        const rules = [];
        const baseRules = this._getBaseRules(type);

        baseRules.forEach(ruleName => {
            if (this.rules.has(ruleName)) {
                rules.push(this.rules.get(ruleName));
            }
        });

        // اضافه کردن قوانین بر اساس سطح دشواری
        if (difficulty >= DifficultyLevel.ADVANCED) {
            if (this.rules.has('semantic')) rules.push(this.rules.get('semantic'));
            if (this.rules.has('context')) rules.push(this.rules.get('context'));
        }

        return rules;
    }

    async executeAll(context, rules) {
        const results = [];
        let totalScore = 0;
        let totalWeight = 0;

        for (const rule of rules) {
            const result = await rule.execute(context);
            results.push(result);
            
            if (result.passed) {
                totalScore += result.score * result.weight;
            }
            totalWeight += result.weight;
        }

        const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;

        return {
            results,
            finalScore,
            passed: results.every(r => r.passed),
            summary: this._generateSummary(results)
        };
    }

    _registerDefaultRules() {
        // Exact match rule
        this.addRule(new ValidatorRule('exact_match', async (ctx) => ({
            passed: ctx.userAnswer === ctx.correctAnswer,
            score: ctx.userAnswer === ctx.correctAnswer ? 100 : 0,
            feedback: ctx.userAnswer === ctx.correctAnswer ? 'پاسخ کاملاً صحیح' : 'پاسخ نادرست'
        })));

        // Case insensitive match
        this.addRule(new ValidatorRule('case_insensitive', async (ctx) => {
            const passed = ctx.userAnswer.toLowerCase() === ctx.correctAnswer.toLowerCase();
            return {
                passed,
                score: passed ? 100 : 0,
                feedback: passed ? 'پاسخ صحیح' : 'پاسخ نادرست'
            };
        }));

        // Levenshtein distance rule
        this.addRule(new ValidatorRule('levenshtein', async (ctx) => {
            const levenshtein = new LevenshteinCalculator();
            const result = levenshtein.calculate(ctx.userAnswer, ctx.correctAnswer, {
                caseSensitive: false,
                ignoreWhitespace: true,
                persianNormalization: true
            });

            const passed = result.similarity >= 80;
            const score = result.similarity;

            return {
                passed,
                score,
                feedback: passed ? 'پاسخ نزدیک به صحیح' : 'فاصله زیاد با پاسخ صحیح',
                metadata: { similarity: result.similarity, operations: result.operations }
            };
        }));

        // Length check rule
        this.addRule(new ValidatorRule('length_check', async (ctx) => {
            const lenDiff = Math.abs(ctx.userAnswer.length - ctx.correctAnswer.length);
            const maxLen = Math.max(ctx.userAnswer.length, ctx.correctAnswer.length);
            const score = maxLen > 0 ? ((maxLen - lenDiff) / maxLen) * 100 : 100;

            return {
                passed: lenDiff <= 3,
                score,
                feedback: lenDiff <= 3 ? 'طول پاسخ مناسب است' : 'اختلاف طول پاسخ زیاد است',
                metadata: { lengthDifference: lenDiff }
            };
        }));

        // Pattern match rule
        this.addRule(new ValidatorRule('pattern_match', async (ctx) => {
            if (!ctx.metadata.pattern) {
                return { passed: true, score: 100, feedback: 'الگویی برای بررسی وجود ندارد' };
            }

            const matcher = new PatternMatcher();
            const passed = matcher.match(ctx.userAnswer, ctx.metadata.pattern);

            return {
                passed,
                score: passed ? 100 : 0,
                feedback: passed ? 'مطابق با الگو' : 'عدم تطابق با الگو'
            };
        }));
    }

    _getBaseRules(type) {
        const rulesMap = {
            [ValidationType.EXACT_MATCH]: ['exact_match'],
            [ValidationType.CASE_INSENSITIVE]: ['case_insensitive'],
            [ValidationType.LEVENSHTEIN]: ['levenshtein', 'length_check'],
            [ValidationType.MULTIPLE_CHOICE]: ['exact_match'],
            [ValidationType.FILL_BLANK]: ['levenshtein', 'length_check', 'pattern_match'],
            [ValidationType.TRANSLATION]: ['levenshtein', 'semantic'],
            [ValidationType.PRONUNCIATION]: ['phonetic', 'levenshtein']
        };

        return rulesMap[type] || ['levenshtein'];
    }

    _generateSummary(results) {
        const passedCount = results.filter(r => r.passed).length;
        const totalCount = results.length;

        return {
            passed: passedCount === totalCount,
            passedCount,
            totalCount,
            averageScore: results.reduce((sum, r) => sum + r.score, 0) / totalCount,
            weakestRule: results.reduce((min, r) => r.score < min.score ? r : min, { score: 100 })
        };
    }
}

// ============ Main Validator ============
class ExerciseValidator {
    constructor(config = {}) {
        this.config = {
            caseSensitive: config.caseSensitive ?? false,
            ignoreWhitespace: config.ignoreWhitespace ?? true,
            ignorePunctuation: config.ignorePunctuation ?? true,
            persianNormalization: config.persianNormalization ?? true,
            minSimilarity: config.minSimilarity ?? 70,
            maxLevenshteinRatio: config.maxLevenshteinRatio ?? 0.3,
            enableTypoDetection: config.enableTypoDetection ?? true,
            enableSuggestions: config.enableSuggestions ?? true,
            enablePartialCredit: config.enablePartialCredit ?? true,
            ...config
        };

        this.levenshtein = new LevenshteinCalculator();
        this.patternMatcher = new PatternMatcher();
        this.ruleSet = new ValidatorRuleSet();
        this.stats = {
            totalValidations: 0,
            totalTime: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    /**
     * اعتبارسنجی پاسخ کاربر
     */
    async validate(request) {
        const startTime = performance.now();

        try {
            // اعتبارسنجی درخواست
            request.validate();

            // انتخاب استراتژی مناسب بر اساس نوع تمرین
            let result;
            switch (request.exerciseType) {
                case ValidationType.MULTIPLE_CHOICE:
                    result = this._validateMultipleChoice(request);
                    break;
                case ValidationType.FILL_BLANK:
                    result = this._validateFillBlank(request);
                    break;
                case ValidationType.TRANSLATION:
                    result = await this._validateTranslation(request);
                    break;
                case ValidationType.PRONUNCIATION:
                    result = this._validatePronunciation(request);
                    break;
                case ValidationType.MATCHING:
                    result = this._validateMatching(request);
                    break;
                case ValidationType.ORDERING:
                    result = this._validateOrdering(request);
                    break;
                default:
                    result = await this._validateGeneric(request);
            }

            // محاسبه امتیاز نهایی
            result.score = this._calculateFinalScore(result, request);

            // تحلیل غلط املایی
            if (this.config.enableTypoDetection && !result.isCorrect) {
                result.typoAnalysis = this._analyzeTypo(request);
            }

            // تولید پیشنهادات
            if (this.config.enableSuggestions && !result.isCorrect) {
                result.suggestions = this._generateSuggestions(request, result);
            }

            // زمان پردازش
            const processingTime = performance.now() - startTime;
            result.metadata.processingTime = processingTime;

            // آمار
            this.stats.totalValidations++;
            this.stats.totalTime += processingTime;

            return result;

        } catch (error) {
            console.error('Validation error:', error);
            return new ValidationResult({
                isValid: false,
                isCorrect: false,
                score: 0,
                feedback: 'خطا در اعتبارسنجی پاسخ',
                metadata: { error: error.message }
            });
        }
    }

    /**
     * اعتبارسنجی دسته‌ای
     */
    async validateBatch(requests) {
        const results = [];
        for (const request of requests) {
            const result = await this.validate(request);
            results.push(result);
        }
        return results;
    }

    /**
     * دریافت آمار اعتبارسنجی
     */
    getStats() {
        return {
            ...this.stats,
            averageTime: this.stats.totalValidations > 0 
                ? this.stats.totalTime / this.stats.totalValidations 
                : 0,
            cacheHitRate: this.stats.totalValidations > 0
                ? (this.stats.cacheHits / this.stats.totalValidations) * 100
                : 0
        };
    }

    /**
     * پاک‌سازی کش
     */
    clearCache() {
        this.levenshtein.clearCache();
        this.stats.cacheHits = 0;
        this.stats.cacheMisses = 0;
    }

    // ============ Validation Strategies ============

    _validateMultipleChoice(request) {
        const isCorrect = request.userAnswer === request.correctAnswer;
        
        return new ValidationResult({
            isValid: true,
            isCorrect,
            feedback: isCorrect ? '✓ پاسخ صحیح' : '✗ پاسخ نادرست',
            details: {
                selectedOption: request.userAnswer,
                correctOption: request.correctAnswer,
                options: request.options
            }
        });
    }

    _validateFillBlank(request) {
        const normalizedUser = this._normalizeText(request.userAnswer);
        const normalizedCorrect = this._normalizeText(request.correctAnswer);

        const levenshteinResult = this.levenshtein.calculate(
            normalizedUser, 
            normalizedCorrect,
            {
                caseSensitive: this.config.caseSensitive,
                ignoreWhitespace: this.config.ignoreWhitespace,
                persianNormalization: this.config.persianNormalization
            }
        );

        const isCorrect = levenshteinResult.similarity >= this.config.minSimilarity;
        const isExact = normalizedUser === normalizedCorrect;

        return new ValidationResult({
            isValid: true,
            isCorrect,
            similarity: levenshteinResult.similarity,
            feedback: this._generateFillBlankFeedback(isCorrect, isExact, levenshteinResult),
            details: {
                normalizedUser,
                normalizedCorrect,
                distance: levenshteinResult.distance,
                operations: levenshteinResult.operations
            }
        });
    }

    async _validateTranslation(request) {
        const normalizedUser = this._normalizeText(request.userAnswer);
        const normalizedCorrect = this._normalizeText(request.correctAnswer);
        
        // بررسی تطابق دقیق
        if (normalizedUser === normalizedCorrect) {
            return new ValidationResult({
                isValid: true,
                isCorrect: true,
                similarity: 100,
                feedback: '✓ ترجمه دقیق',
                details: { matchType: 'exact' }
            });
        }

        // بررسی با Levenshtein
        const levenshteinResult = this.levenshtein.calculate(
            normalizedUser,
            normalizedCorrect,
            {
                caseSensitive: false,
                ignoreWhitespace: true,
                persianNormalization: true
            }
        );

        // بررسی مترادف‌ها
        let synonymMatch = false;
        if (request.metadata.synonyms) {
            synonymMatch = request.metadata.synonyms.some(syn => 
                this.levenshtein.calculate(
                    normalizedUser,
                    this._normalizeText(syn),
                    { persianNormalization: true }
                ).similarity >= this.config.minSimilarity
            );
        }

        const isCorrect = levenshteinResult.similarity >= this.config.minSimilarity || synonymMatch;
        const similarity = synonymMatch ? 90 : levenshteinResult.similarity;

        return new ValidationResult({
            isValid: true,
            isCorrect,
            similarity,
            feedback: this._generateTranslationFeedback(isCorrect, similarity, synonymMatch),
            details: {
                levenshtein: levenshteinResult,
                synonymMatch,
                normalizedUser,
                normalizedCorrect
            }
        });
    }

    _validatePronunciation(request) {
        // در پروژه واقعی از Web Speech API یا کتابخانه تخصصی استفاده شود
        const phoneticSimilarity = this._calculatePhoneticSimilarity(
            request.userAnswer,
            request.correctAnswer
        );

        const isCorrect = phoneticSimilarity >= 70;

        return new ValidationResult({
            isValid: true,
            isCorrect,
            similarity: phoneticSimilarity,
            feedback: isCorrect ? '✓ تلفظ خوب است' : '✗ تلفظ دقیق نیست',
            details: {
                phoneticSimilarity,
                userPhonetic: this._toPhonetic(request.userAnswer),
                correctPhonetic: this._toPhonetic(request.correctAnswer)
            }
        });
    }

    _validateMatching(request) {
        if (!Array.isArray(request.userAnswer) || !Array.isArray(request.correctAnswer)) {
            return new ValidationResult({
                isValid: false,
                isCorrect: false,
                feedback: 'فرمت پاسخ نامعتبر است'
            });
        }

        const matches = request.correctAnswer.map(correct => {
            const userMatch = request.userAnswer.find(u => 
                u.left === correct.left && u.right === correct.right
            );
            return !!userMatch;
        });

        const correctCount = matches.filter(Boolean).length;
        const totalCount = request.correctAnswer.length;
        const isCorrect = correctCount === totalCount;
        const score = (correctCount / totalCount) * 100;

        return new ValidationResult({
            isValid: true,
            isCorrect,
            score,
            feedback: `${correctCount} از ${totalCount} مورد صحیح`,
            details: {
                correctCount,
                totalCount,
                matches,
                accuracy: score
            }
        });
    }

    _validateOrdering(request) {
        if (!Array.isArray(request.userAnswer) || !Array.isArray(request.correctAnswer)) {
            return new ValidationResult({
                isValid: false,
                isCorrect: false,
                feedback: 'فرمت پاسخ نامعتبر است'
            });
        }

        // محاسبه تعداد جفت‌های درست مرتب شده
        let correctPairs = 0;
        for (let i = 0; i < Math.min(request.userAnswer.length, request.correctAnswer.length); i++) {
            if (request.userAnswer[i] === request.correctAnswer[i]) {
                correctPairs++;
            }
        }

        const totalPairs = request.correctAnswer.length;
        const isCorrect = correctPairs === totalPairs;
        const score = (correctPairs / totalPairs) * 100;

        // محاسبه inversions برای سنجش نظم
        const inversions = this._countInversions(request.userAnswer);

        return new ValidationResult({
            isValid: true,
            isCorrect,
            score,
            feedback: `${correctPairs} از ${totalPairs} مورد در جای درست`,
            details: {
                correctPairs,
                totalPairs,
                inversions,
                accuracy: score
            }
        });
    }

    async _validateGeneric(request) {
        // استفاده از rule set برای اعتبارسنجی عمومی
        const rules = this.ruleSet.getRulesForExercise(
            request.exerciseType,
            request.metadata.difficulty || DifficultyLevel.INTERMEDIATE
        );

        const context = {
            userAnswer: request.userAnswer,
            correctAnswer: request.correctAnswer,
            metadata: request.metadata,
            options: request.options
        };

        const ruleResults = await this.ruleSet.executeAll(context, rules);

        return new ValidationResult({
            isValid: true,
            isCorrect: ruleResults.passed,
            score: ruleResults.finalScore,
            feedback: this._generateGenericFeedback(ruleResults),
            details: { ruleResults: ruleResults.results }
        });
    }

    // ============ Helper Methods ============

    _normalizeText(text) {
        if (!text) return '';

        let normalized = String(text);

        if (!this.config.caseSensitive) {
            normalized = normalized.toLowerCase();
        }

        if (this.config.ignoreWhitespace) {
            normalized = normalized.replace(/\s+/g, ' ').trim();
        }

        if (this.config.ignorePunctuation) {
            normalized = normalized.replace(/[.,!?;:'"()[\]{}<>/\\\-=_+`~@#$%^&*|]/g, '');
        }

        if (this.config.persianNormalization) {
            normalized = normalized
                .replace(/[يى]/g, 'ی')
                .replace(/[ك]/g, 'ک')
                .replace(/[ؤ]/g, 'و')
                .replace(/[ئ]/g, 'ی')
                .replace(/[إأآ]/g, 'ا')
                .replace(/[ةۀ]/g, 'ه');
        }

        return normalized;
    }

    _analyzeTypo(request) {
        const normalizedUser = this._normalizeText(request.userAnswer);
        const normalizedCorrect = this._normalizeText(request.correctAnswer);

        const levenshteinResult = this.levenshtein.calculate(
            normalizedUser,
            normalizedCorrect,
            { returnMatrix: true }
        );

        const typoType = this._determineTypoType(levenshteinResult.operations);
        const suggestions = this._generateTypoSuggestions(
            request.userAnswer,
            request.correctAnswer,
            levenshteinResult
        );

        return new TypoAnalysis({
            hasTypo: levenshteinResult.distance > 0,
            distance: levenshteinResult.distance,
            similarity: levenshteinResult.similarity,
            typoType,
            suggestions,
            correctedAnswer: request.correctAnswer,
            errorPositions: levenshteinResult.details?.errorPositions || [],
            commonMistakes: this._findCommonMistakes(request.userAnswer, request.correctAnswer)
        });
    }

    _determineTypoType(operations) {
        if (!operations || operations.length === 0) return null;

        const types = operations.map(op => op.type);
        
        if (types.every(t => t === 'insertion')) return 'insertion';
        if (types.every(t => t === 'deletion')) return 'deletion';
        if (types.every(t => t === 'substitution')) return 'substitution';
        
        const insertionCount = types.filter(t => t === 'insertion').length;
        const deletionCount = types.filter(t => t === 'deletion').length;
        
        if (insertionCount === 1 && deletionCount === 1) return 'transposition';
        
        return 'mixed';
    }

    _generateTypoSuggestions(userAnswer, correctAnswer, levenshteinResult) {
        const suggestions = [];

        if (levenshteinResult.similarity >= 80) {
            suggestions.push({
                type: 'minor_typo',
                message: 'اشتباه تایپی جزئی',
                correction: correctAnswer
            });
        } else if (levenshteinResult.similarity >= 60) {
            suggestions.push({
                type: 'major_typo',
                message: 'اشتباه تایپی قابل توجه',
                correction: correctAnswer,
                hint: 'به املای کلمه دقت کنید'
            });
        }

        // پیشنهاد بر اساس نوع اشتباه
        const typoType = this._determineTypoType(levenshteinResult.operations);
        switch (typoType) {
            case 'insertion':
                suggestions.push({
                    type: 'typo_hint',
                    message: 'به نظر می‌رسد حرف اضافه تایپ کرده‌اید'
                });
                break;
            case 'deletion':
                suggestions.push({
                    type: 'typo_hint',
                    message: 'به نظر می‌رسد یک حرف را جا انداخته‌اید'
                });
                break;
            case 'substitution':
                suggestions.push({
                    type: 'typo_hint',
                    message: 'حرفی را اشتباه تایپ کرده‌اید'
                });
                break;
        }

        return suggestions;
    }

    _findCommonMistakes(userAnswer, correctAnswer) {
        // در پروژه واقعی از دیتابیس اشتباهات رایج استفاده شود
        const commonMistakes = [
            { wrong: 'teh', correct: 'the' },
            { wrong: 'recieve', correct: 'receive' },
            { wrong: 'seperate', correct: 'separate' }
        ];

        return commonMistakes
            .filter(m => m.wrong === userAnswer.toLowerCase())
            .map(m => ({
                mistake: m.wrong,
                correction: m.correct,
                frequency: 'high'
            }));
    }

    _generateSuggestions(request, result) {
        const suggestions = [];

        if (result.similarity < 50) {
            suggestions.push('پاسخ شما بسیار دور از پاسخ صحیح است');
            suggestions.push('مجدید lesson را مرور کنید');
        } else if (result.similarity < 70) {
            suggestions.push('نزدیک به پاسخ صحیح هستید');
            suggestions.push('به املای کلمه دقت کنید');
        }

        if (request.attemptNumber > 2) {
            suggestions.push('تعداد تلاش‌ها زیاد است. از hint استفاده کنید');
        }

        if (request.hintsUsed === 0 && !result.isCorrect) {
            suggestions.push('می‌توانید از دکمه راهنمایی استفاده کنید');
        }

        return suggestions;
    }

    _calculateFinalScore(result, request) {
        let score = result.score || (result.isCorrect ? ScoreWeight.CORRECT : ScoreWeight.INCORRECT);

        // امتیاز بر اساس similarity
        if (result.similarity) {
            score = result.similarity;
        }

        // پنالتی تعداد تلاش
        if (request.attemptNumber > 1) {
            score -= (request.attemptNumber - 1) * ScoreWeight.ATTEMPT_PENALTY;
        }

        // پنالتی استفاده از hint
        if (request.hintsUsed > 0) {
            score -= request.hintsUsed * ScoreWeight.HINT_PENALTY_PER_USE;
        }

        // پاداش زمان
        if (request.responseTime && request.metadata.expectedTime) {
            if (request.responseTime < request.metadata.expectedTime * 0.5) {
                score += ScoreWeight.TIME_BONUS_MAX;
            } else if (request.responseTime < request.metadata.expectedTime) {
                score += ScoreWeight.TIME_BONUS_MAX / 2;
            }
        }

        // محدود کردن بین ۰ تا ۱۰۰
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    _generateFillBlankFeedback(isCorrect, isExact, levenshteinResult) {
        if (isExact) return '✓ پاسخ کاملاً صحیح';
        if (isCorrect) return '✓ پاسخ قابل قبول (اشتباه تایپی)';
        
        if (levenshteinResult.similarity >= 50) {
            return 'نزدیک به پاسخ صحیح هستید';
        }
        
        return '✗ پاسخ نادرست';
    }

    _generateTranslationFeedback(isCorrect, similarity, synonymMatch) {
        if (isCorrect) {
            if (synonymMatch) return '✓ ترجمه با مترادف قابل قبول';
            if (similarity >= 95) return '✓ ترجمه بسیار دقیق';
            return '✓ ترجمه قابل قبول';
        }
        
        if (similarity >= 70) {
            return 'نزدیک به ترجمه صحیح';
        }
        
        return '✗ ترجمه نادرست';
    }

    _generateGenericFeedback(ruleResults) {
        if (ruleResults.passed) return '✓ پاسخ صحیح';
        
        const failedRules = ruleResults.results.filter(r => !r.passed);
        if (failedRules.length > 0) {
            return failedRules[0].feedback || '✗ پاسخ نادرست';
        }
        
        return '✗ پاسخ نادرست';
    }

    _calculatePhoneticSimilarity(str1, str2) {
        // پیاده‌سازی ساده - در پروژه واقعی از کتابخانه تخصصی استفاده شود
        const phonetic1 = this._toPhonetic(str1);
        const phonetic2 = this._toPhonetic(str2);
        
        const result = this.levenshtein.calculate(phonetic1, phonetic2);
        return result.similarity;
    }

    _toPhonetic(text) {
        // تبدیل ساده به فونتیک - در پروژه واقعی از mapping دقیق استفاده شود
        return text
            .toLowerCase()
            .replace(/[aeiou]/g, '')
            .replace(/[^a-z]/g, '');
    }

    _countInversions(array) {
        let inversions = 0;
        for (let i = 0; i < array.length; i++) {
            for (let j = i + 1; j < array.length; j++) {
                if (array[i] > array[j]) inversions++;
            }
        }
        return inversions;
    }
}

// ============ Factory ============
class ValidatorFactory {
    static createValidator(config = {}) {
        return new ExerciseValidator(config);
    }

    static createForExerciseType(type, config = {}) {
        const validator = new ExerciseValidator(config);
        
        // تنظیمات خاص برای هر نوع تمرین
        switch (type) {
            case ValidationType.TRANSLATION:
                return new ExerciseValidator({
                    ...config,
                    minSimilarity: 75,
                    enableTypoDetection: true,
                    enableSuggestions: true
                });
            case ValidationType.PRONUNCIATION:
                return new ExerciseValidator({
                    ...config,
                    minSimilarity: 70,
                    enableTypoDetection: false
                });
            case ValidationType.FILL_BLANK:
                return new ExerciseValidator({
                    ...config,
                    minSimilarity: 80,
                    ignorePunctuation: true,
                    persianNormalization: true
                });
            default:
                return validator;
        }
    }
}

// ============ Export ============
export {
    ExerciseValidator,
    ValidatorFactory,
    ValidationType,
    DifficultyLevel,
    ScoreWeight,
    ValidationRequest,
    ValidationResult,
    TypoAnalysis,
    LevenshteinCalculator,
    PatternMatcher,
    ValidatorRule,
    ValidatorRuleSet
};
```
