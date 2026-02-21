// multiple_choice.js

/**
 * @module multiple_choice
 * @description مدیریت تمرین‌های چندگزینه‌ای با رعایت اصول X/Y، DI، Event و Logging
 */

import EventEmitter from 'events';
import { createLogger } from '../core/utils/logger.js';
import { createError, ErrorCodes } from '../core/errors.js';
import { MULTIPLE_CHOICE_DEFAULTS } from './config/exercise_config.js';

const logger = createLogger('MultipleChoice');

/** @typedef {Object} Vocabulary
 * @property {string} word
 * @property {string} fa
 */

/** @typedef {Object} GenerationOptions
 * @property {number} [wrong_options_count]
 * @property {boolean} [shuffle_options]
 * @property {string} [template]
 */

/** @typedef {Object} ValidationResult
 * @property {boolean} is_valid
 * @property {boolean} is_correct
 * @property {string} [error]
 * @property {MultipleChoiceOption} [selected_option]
 * @property {Array<MultipleChoiceOption>} correct_options
 * @property {string} feedback
 */

class MultipleChoiceOption {
    constructor(id, text, is_correct, feedback = null, selected_count = 0, is_disabled = false) {
        this.id = id;
        this.text = text;
        this.is_correct = is_correct;
        this.feedback = feedback;
        this.selected_count = selected_count;
        this.is_disabled = is_disabled;
    }

    select() {
        return new MultipleChoiceOption(
            this.id,
            this.text,
            this.is_correct,
            this.feedback,
            this.selected_count + 1,
            this.is_disabled
        );
    }

    disable() {
        return new MultipleChoiceOption(
            this.id,
            this.text,
            this.is_correct,
            this.feedback,
            this.selected_count,
            true
        );
    }

    toJSON() {
        return { ...this };
    }
}

class MultipleChoiceConfig {
    constructor(config = {}, configProvider = MULTIPLE_CHOICE_DEFAULTS) {
        this._configProvider = configProvider;
        this._init(config);
    }

    _init(config) {
        const defaults = this._configProvider.getDefaults?.() ?? this._configProvider;
        this.min_options = config.min_options ?? defaults.MIN_OPTIONS;
        this.max_options = config.max_options ?? defaults.MAX_OPTIONS;
        this.shuffle_options = config.shuffle_options ?? defaults.SHUFFLE_OPTIONS;
        this.time_limit = config.time_limit ?? defaults.TIME_LIMIT;
        this.scoring = config.scoring ?? defaults.SCORING;
    }

    validate() {
        if (this.min_options < 2) {
            throw createError(ErrorCodes.INVALID_CONFIG, 'حداقل گزینه‌ها باید ۲ باشد', { min_options: this.min_options });
        }
        if (this.max_options > 10) {
            throw createError(ErrorCodes.INVALID_CONFIG, 'حداکثر گزینه‌ها نمی‌تواند بیش از ۱۰ باشد', { max_options: this.max_options });
        }
        return true;
    }
}

class MultipleChoiceExerciseDTO {
    constructor(data, config = new MultipleChoiceConfig()) {
        if (!data.lesson_id) throw createError(ErrorCodes.MISSING_PARAM, 'lesson_id الزامی است');
        if (!data.question) throw createError(ErrorCodes.MISSING_PARAM, 'سوال تمرین الزامی است');

        this.id = data.id || `mc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.lesson_id = data.lesson_id;
        this.type = 'multiple_choice';
        this.difficulty = data.difficulty ?? 'intermediate';
        this.question = data.question;
        this.category = data.category ?? 'vocabulary';
        this.tags = data.tags ?? [];
        this.config = config;
        this.metadata = {
            version: '1.0.0',
            created_by: 'system',
            last_modified_by: null,
            stats: { times_used: 0, avg_response_time: 0, success_rate: 0 },
            ...data.metadata
        };
        this.options = [];
        if (data.options) this.setOptions(data.options);

        this.config.validate();
    }

    addOption(option) {
        logger.debug('Adding option', { currentCount: this.options.length, maxOptions: this.config.max_options });
        if (this.options.length >= this.config.max_options) {
            logger.warn('Max options exceeded', { limit: this.config.max_options });
            throw createError(ErrorCodes.MAX_OPTIONS_EXCEEDED, 'حداکثر گزینه‌ها مجاز نیست', { max_options: this.config.max_options });
        }
        this.options.push(option instanceof MultipleChoiceOption ? option : new MultipleChoiceOption(option.id, option.text, option.is_correct, option.feedback));
        logger.info('Option added', { optionId: option.id });
        return this;
    }

    setOptions(options) {
        if (options.length < this.config.min_options) throw createError(ErrorCodes.MIN_OPTIONS_NOT_MET, `حداقل ${this.config.min_options} گزینه لازم است`);
        if (options.length > this.config.max_options) throw createError(ErrorCodes.MAX_OPTIONS_EXCEEDED, `حداکثر ${this.config.max_options} گزینه مجاز است`);
        this.options = options.map((opt, idx) => opt instanceof MultipleChoiceOption ? opt : new MultipleChoiceOption(opt.id || `opt_${idx + 1}`, opt.text, opt.is_correct, opt.feedback));
        return this;
    }

    validate() {
        const correct_count = this.options.filter(o => o.is_correct).length;
        if (correct_count < 1) throw createError(ErrorCodes.INVALID_EXERCISE, 'حداقل یک گزینه صحیح لازم است');
        return true;
    }

    toJSON() {
        return {
            id: this.id,
            lesson_id: this.lesson_id,
            type: this.type,
            difficulty: this.difficulty,
            question: this.question,
            category: this.category,
            tags: this.tags,
            options: this.options.map(o => o.toJSON()),
            config: this.config,
            metadata: this.metadata
        };
    }
}

/** @interface IExerciseGenerator */
export const IExerciseGenerator = {
    /** @param {Vocabulary} vocab @param {GenerationOptions} options @returns {MultipleChoiceExerciseDTO} */
    generate() {}
};

/** @implements {IExerciseGenerator} */
class MultipleChoiceGenerator {
    constructor(configProvider = MULTIPLE_CHOICE_DEFAULTS) {
        this.configProvider = configProvider;
    }

    generate(vocab, options = {}) {
        const config = new MultipleChoiceConfig(options, this.configProvider);
        const exercise = new MultipleChoiceExerciseDTO({
            lesson_id: options.lesson_id ?? 'default',
            question: vocab.word,
            options: [
                { text: vocab.fa, is_correct: true },
                { text: 'گزینه غلط ۱', is_correct: false },
                { text: 'گزینه غلط ۲', is_correct: false }
            ]
        }, config);
        logger.info('Exercise generated', { exerciseId: exercise.id });
        return exercise;
    }
}

/** @interface IExerciseValidator */
export const IExerciseValidator = {
    /** @param {MultipleChoiceExerciseDTO} exercise @param {string} answerId @returns {ValidationResult} */
    validate() {}
};

class MultipleChoiceValidator {
    constructor(rules = []) {
        this.rules = rules;
    }

    validate(exercise, selected_option_id) {
        logger.debug('Validating exercise', { exerciseId: exercise.id, selected_option_id });
        let result = { is_valid: true, is_correct: false, selected_option: null, correct_options: exercise.options.filter(o => o.is_correct), feedback: '' };
        try {
            const selected = exercise.options.find(o => o.id === selected_option_id);
            if (!selected) throw createError(ErrorCodes.INVALID_SELECTION, 'گزینه انتخابی معتبر نیست');
            result.selected_option = selected;
            result.is_correct = selected.is_correct;
            result.feedback = selected.feedback ?? (result.is_correct ? 'صحیح' : 'غلط');
        } catch (err) {
            result.is_valid = false;
            result.error = err.message;
            logger.error('Validation failed', { error: err, exerciseId: exercise.id });
        }
        return result;
    }
}

class MultipleChoiceExercise extends EventEmitter {
    constructor(dto, validator = new MultipleChoiceValidator()) {
        super();
        this.dto = dto;
        this.validator = validator;
    }

    answer(optionId) {
        const result = this.validator.validate(this.dto, optionId);
        this.emit('answered', { exerciseId: this.dto.id, optionId, isCorrect: result.is_correct });
        return result;
    }
}

// Builder Pattern
class MultipleChoiceExerciseBuilder {
    constructor() { this.data = {}; }
    setLessonId(id) { this.data.lesson_id = id; return this; }
    setQuestion(q) { this.data.question = q; return this; }
    addOption(opt) { if (!this.data.options) this.data.options = []; this.data.options.push(opt); return this; }
    setMetadata(meta) { this.data.metadata = meta; return this; }
    build(config) { return new MultipleChoiceExerciseDTO(this.data, config); }
}

export {
    MultipleChoiceOption,
    MultipleChoiceConfig,
    MultipleChoiceExerciseDTO,
    MultipleChoiceGenerator,
    MultipleChoiceValidator,
    MultipleChoiceExercise,
    MultipleChoiceExerciseBuilder
};
