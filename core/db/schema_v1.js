// core/db/schema_v1.js
// ============================================================
// Advanced Database Schema Definition - Version 1
// ============================================================
// This file defines the complete structure of IndexedDB object stores,
// indexes, validation rules, migration strategies, and data integrity constraints.
// It is designed as the single source of truth for database schema.
//
// SOLID Principles Applied:
// - SRP: This class only handles schema definition and validation
// - OCP: New versions extend this class without modifying it
// - LSP: Subclasses can safely replace parent
// - ISP: Interfaces are separated into validation, migration, schema
// - DIP: Depends on abstractions (interfaces) not concretions
//
// Design Patterns: Singleton, Strategy (for validation), Factory (for stores)
//
// @version 1.0.0
// @since 2026-02-20
// @author Farsinglish Team
// ============================================================

import { TimeProvider } from '../core/utils/time_provider.js';
import { 
    SRS_CONSTANTS, 
    USER_CONSTANTS, 
    LESSON_CONSTANTS,
    VALIDATION_CODES 
} from '../core/constants/validation_constants.js';

// ============================================================
// TYPES DEFINITIONS (JSDoc)
// ============================================================

/**
 * @typedef {Object} ValidationError
 * @property {string} field - The field that caused the error
 * @property {string} message - Error description
 * @property {string} code - Error code from VALIDATION_CODES
 * @property {number} timestamp - When the error occurred
 */

/**
 * @typedef {Object} ValidationWarning
 * @property {string} field - The field that caused the warning
 * @property {string} message - Warning description
 * @property {string} code - Warning code from VALIDATION_CODES
 * @property {number} timestamp - When the warning occurred
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether validation passed
 * @property {Array<ValidationError>} errors - List of validation errors
 * @property {Array<ValidationWarning>} warnings - List of validation warnings
 */

/**
 * @typedef {Object} UserProfile
 * @property {string} [full_name] - User's full name
 * @property {number} [age] - User's age (0-150)
 * @property {string} [native_language] - User's native language code
 */

/**
 * @typedef {Object} UserStats
 * @property {number} [level] - User level (default: 1)
 * @property {number} [xp] - Experience points (default: 0)
 * @property {number} [streak] - Current streak in days (default: 0)
 * @property {number} [total_lessons] - Total lessons completed (default: 0)
 * @property {number} [total_reviews] - Total reviews done (default: 0)
 * @property {number} [accuracy] - Overall accuracy percentage (0-100)
 */

/**
 * @typedef {Object} UserSettings
 * @property {('light'|'dark'|'system')} [theme] - UI theme preference
 * @property {boolean} [notifications] - Enable notifications
 * @property {boolean} [audio_enabled] - Enable audio
 */

/**
 * @typedef {Object} UserObject
 * @property {string} id - Unique user identifier
 * @property {string} email - User email address
 * @property {string} username - Unique username
 * @property {string} password_hash - Bcrypt password hash
 * @property {UserProfile} [profile] - User profile information
 * @property {UserStats} [stats] - User statistics
 * @property {UserSettings} [settings] - User preferences
 * @property {string} created_at - ISO timestamp of creation
 * @property {string} updated_at - ISO timestamp of last update
 */

/**
 * @typedef {Object} VocabularyItem
 * @property {string} word - The word in target language
 * @property {string} translation - Translation in native language
 * @property {string} [pronunciation] - Pronunciation guide
 * @property {Array<string>} [examples] - Example sentences
 * @property {string} [image_url] - Optional image URL
 */

/**
 * @typedef {Object} ExerciseBase
 * @property {string} id - Exercise identifier
 * @property {('multiple_choice'|'fill_blank'|'matching'|'pronunciation')} type - Exercise type
 * @property {string} question - The question text
 * @property {number} [difficulty] - Difficulty level (1-5)
 */

/**
 * @typedef {ExerciseBase & {options: Array<string>, correct_answer: number}} MultipleChoiceExercise
 */

/**
 * @typedef {ExerciseBase & {correct_answer: string}} FillBlankExercise
 */

/**
 * @typedef {ExerciseBase & {pairs: Array<{left: string, right: string}>}} MatchingExercise
 */

/**
 * @typedef {MultipleChoiceExercise|FillBlankExercise|MatchingExercise} Exercise
 */

/**
 * @typedef {Object} LessonContent
 * @property {Array<VocabularyItem>} vocabulary - Vocabulary items
 * @property {Array<Exercise>} exercises - Practice exercises
 */

/**
 * @typedef {Object} LessonObject
 * @property {string} id - Lesson identifier (pattern: lesson_{name})
 * @property {string} title - Lesson title
 * @property {string} [description] - Optional description
 * @property {number} level - Difficulty level (1-100)
 * @property {number} order - Display order
 * @property {number} [duration] - Estimated duration in seconds
 * @property {Array<string>} [tags] - Categorization tags
 * @property {Array<string>} [prerequisites] - Required lesson IDs
 * @property {LessonContent} content - Lesson content
 */

/**
 * @typedef {Object} SRSData
 * @property {number} stage - SRS stage (0-10 for SM-2 algorithm)
 * @property {number} easiness_factor - Easiness factor (1.3-5.0)
 * @property {number} interval - Interval in days
 * @property {number} review_count - Number of times reviewed
 * @property {number} lapse_count - Number of times forgotten
 */

/**
 * @typedef {Object} ProgressObject
 * @property {number} [id] - Auto-incremented ID
 * @property {string} user_id - User ID
 * @property {string} lesson_id - Lesson ID
 * @property {SRSData} srs_data - SRS algorithm data
 * @property {string} next_review - ISO timestamp for next review
 * @property {string} [last_reviewed] - ISO timestamp of last review
 * @property {number} [score] - Last score (0-100)
 * @property {boolean} [completed] - Whether lesson is completed
 * @property {Object} [metadata] - Additional metadata
 */

// ============================================================
// INTERFACES & ABSTRACTIONS
// ============================================================

/**
 * @interface IValidator
 * Contract for all validators
 */
class IValidator {
    /**
     * @param {*} data - Data to validate
     * @returns {boolean} - True if validation passes
     */
    validate(data) { throw new Error('Must implement validate()'); }
    
    /**
     * @returns {Array<ValidationError>} - List of errors
     */
    getErrors() { throw new Error('Must implement getErrors()'); }
    
    /**
     * @returns {Array<ValidationWarning>} - List of warnings
     */
    getWarnings() { throw new Error('Must implement getWarnings()'); }
    
    /**
     * @returns {boolean} - True if there are errors
     */
    hasErrors() { throw new Error('Must implement hasErrors()'); }
}

/**
 * @interface IMigration
 * Contract for migration strategies
 */
class IMigration {
    /**
     * @param {*} oldData - Data to migrate
     * @param {number} oldVersion - Source version
     * @returns {*} - Migrated data
     */
    migrate(oldData, oldVersion) { throw new Error('Must implement migrate()'); }
    
    /**
     * @returns {number} - Target version
     */
    getVersion() { throw new Error('Must implement getVersion()'); }
}

/**
 * @interface IIndexDefinition
 * Contract for index definitions
 */
class IIndexDefinition {
    /**
     * @returns {string} - Index name
     */
    getName() { throw new Error('Must implement getName()'); }
    
    /**
     * @returns {string|Array<string>} - Key path(s)
     */
    getKeyPath() { throw new Error('Must implement getKeyPath()'); }
    
    /**
     * @returns {Object} - Index options
     */
    getOptions() { throw new Error('Must implement getOptions()'); }
}

// ============================================================
// BASE VALIDATOR CLASS
// ============================================================

/**
 * Base Validator Class
 * Implements common validation functionality with dependency injection
 */
class BaseValidator extends IValidator {
    /**
     * @param {TimeProvider} timeProvider - Time provider for testing
     */
    constructor(timeProvider = new TimeProvider()) {
        super();
        this.errors = [];
        this.warnings = [];
        this.timeProvider = timeProvider;
    }

    /**
     * Validate data
     * @param {*} data - Data to validate
     * @returns {boolean} - True if validation passes
     */
    validate(data) {
        this.errors = [];
        this.warnings = [];
        return this._validateInternal(data);
    }

    /**
     * @returns {Array<ValidationError>}
     */
    getErrors() { return [...this.errors]; }

    /**
     * @returns {Array<ValidationWarning>}
     */
    getWarnings() { return [...this.warnings]; }

    /**
     * @returns {boolean}
     */
    hasErrors() { return this.errors.length > 0; }

    /**
     * Add validation error
     * @param {string} field - Field name
     * @param {string} message - Error message
     * @param {string} code - Error code
     * @protected
     */
    _addError(field, message, code = VALIDATION_CODES.REQUIRED) {
        this.errors.push({ 
            field, 
            message, 
            code, 
            timestamp: this.timeProvider.now() 
        });
    }

    /**
     * Add validation warning
     * @param {string} field - Field name
     * @param {string} message - Warning message
     * @param {string} code - Warning code
     * @protected
     */
    _addWarning(field, message, code = VALIDATION_CODES.FORMAT_WARNING) {
        this.warnings.push({ 
            field, 
            message, 
            code, 
            timestamp: this.timeProvider.now() 
        });
    }

    /**
     * Internal validation method to be overridden
     * @param {*} data - Data to validate
     * @returns {boolean}
     * @protected
     */
    _validateInternal(data) { return true; }

    /**
     * Validate UUID format
     * @param {string} uuid - UUID to check
     * @returns {boolean}
     * @protected
     */
    _isValidUUID(uuid) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }

    /**
     * Validate date string
     * @param {string} dateStr - Date string to check
     * @returns {boolean}
     * @protected
     */
    _isValidDate(dateStr) {
        const date = new Date(dateStr);
        return date instanceof Date && !isNaN(date);
    }
}

// ============================================================
// USER VALIDATOR
// ============================================================

/**
 * User Validator - Comprehensive validation for user data
 */
class UserValidator extends BaseValidator {
    /**
     * @param {TimeProvider} timeProvider - Time provider
     */
    constructor(timeProvider) {
        super(timeProvider);
    }

    /**
     * @param {UserObject} user - User data to validate
     * @returns {boolean}
     * @protected
     */
    _validateInternal(user) {
        if (!user) {
            this._addError('root', 'User object cannot be null or undefined', VALIDATION_CODES.REQUIRED);
            return false;
        }

        this._validateId(user.id);
        this._validateEmail(user.email);
        this._validateUsername(user.username);
        this._validatePasswordHash(user.password_hash);
        this._validateProfile(user.profile);
        this._validateStats(user.stats);
        this._validateSettings(user.settings);
        this._validateTimestamps(user.created_at, user.updated_at);

        return this.errors.length === 0;
    }

    /**
     * @param {string} id - User ID
     * @private
     */
    _validateId(id) {
        if (!id) {
            this._addError('id', 'User ID is required', VALIDATION_CODES.REQUIRED);
        } else if (typeof id !== 'string') {
            this._addError('id', 'User ID must be a string', VALIDATION_CODES.INVALID_TYPE);
        } else if (!this._isValidUUID(id)) {
            this._addWarning('id', 'User ID should be a valid UUID', VALIDATION_CODES.FORMAT_WARNING);
        }
    }

    /**
     * @param {string} email - User email
     * @private
     */
    _validateEmail(email) {
        if (!email) {
            this._addError('email', 'Email is required', VALIDATION_CODES.REQUIRED);
        } else if (typeof email !== 'string') {
            this._addError('email', 'Email must be a string', VALIDATION_CODES.INVALID_TYPE);
        } else {
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(email)) {
                this._addError('email', 'Email format is invalid', VALIDATION_CODES.INVALID_FORMAT);
            }
            if (email.length > USER_CONSTANTS.MAX_EMAIL_LENGTH) {
                this._addError('email', `Email exceeds maximum length of ${USER_CONSTANTS.MAX_EMAIL_LENGTH} characters`, VALIDATION_CODES.MAX_LENGTH_EXCEEDED);
            }
        }
    }

    /**
     * @param {string} username - Username
     * @private
     */
    _validateUsername(username) {
        if (!username) {
            this._addError('username', 'Username is required', VALIDATION_CODES.REQUIRED);
        } else if (typeof username !== 'string') {
            this._addError('username', 'Username must be a string', VALIDATION_CODES.INVALID_TYPE);
        } else {
            if (username.length < USER_CONSTANTS.MIN_USERNAME_LENGTH) {
                this._addError('username', `Username must be at least ${USER_CONSTANTS.MIN_USERNAME_LENGTH} characters`, VALIDATION_CODES.MIN_LENGTH);
            }
            if (username.length > USER_CONSTANTS.MAX_USERNAME_LENGTH) {
                this._addError('username', `Username cannot exceed ${USER_CONSTANTS.MAX_USERNAME_LENGTH} characters`, VALIDATION_CODES.MAX_LENGTH_EXCEEDED);
            }
            if (!/^[a-zA-Z0-9_\u0600-\u06FF]+$/.test(username)) {
                this._addError('username', 'Username can only contain letters, numbers, and underscores', VALIDATION_CODES.INVALID_CHARS);
            }
        }
    }

    /**
     * @param {string} passwordHash - Password hash
     * @private
     */
    _validatePasswordHash(passwordHash) {
        if (!passwordHash) {
            this._addError('password_hash', 'Password hash is required', VALIDATION_CODES.REQUIRED);
        } else if (typeof passwordHash !== 'string') {
            this._addError('password_hash', 'Password hash must be a string', VALIDATION_CODES.INVALID_TYPE);
        } else if (passwordHash.length < 60) {
            this._addWarning('password_hash', 'Password hash seems too short for bcrypt', VALIDATION_CODES.SECURITY_WARNING);
        }
    }

    /**
     * @param {UserProfile} profile - User profile
     * @private
     */
    _validateProfile(profile) {
        if (!profile) return;

        if (typeof profile !== 'object') {
            this._addError('profile', 'Profile must be an object', VALIDATION_CODES.INVALID_TYPE);
            return;
        }

        if (profile.full_name && typeof profile.full_name !== 'string') {
            this._addError('profile.full_name', 'Full name must be a string', VALIDATION_CODES.INVALID_TYPE);
        }

        if (profile.age !== undefined) {
            if (typeof profile.age !== 'number' || profile.age < 0 || profile.age > 150) {
                this._addError('profile.age', 'Age must be a number between 0 and 150', VALIDATION_CODES.INVALID_RANGE);
            }
        }

        if (profile.native_language && typeof profile.native_language !== 'string') {
            this._addError('profile.native_language', 'Native language must be a string', VALIDATION_CODES.INVALID_TYPE);
        }
    }

    /**
     * @param {UserStats} stats - User statistics
     * @private
     */
    _validateStats(stats) {
        if (!stats) return;

        if (typeof stats !== 'object') {
            this._addError('stats', 'Stats must be an object', VALIDATION_CODES.INVALID_TYPE);
            return;
        }

        const validStats = ['level', 'xp', 'streak', 'total_lessons', 'total_reviews', 'accuracy'];
        for (const stat of validStats) {
            if (stats[stat] !== undefined && typeof stats[stat] !== 'number') {
                this._addError(`stats.${stat}`, `${stat} must be a number`, VALIDATION_CODES.INVALID_TYPE);
            }
        }

        if (stats.xp < 0) {
            this._addError('stats.xp', 'XP cannot be negative', VALIDATION_CODES.INVALID_RANGE);
        }

        if (stats.streak < 0) {
            this._addError('stats.streak', 'Streak cannot be negative', VALIDATION_CODES.INVALID_RANGE);
        }

        if (stats.accuracy !== undefined && (stats.accuracy < 0 || stats.accuracy > 100)) {
            this._addError('stats.accuracy', 'Accuracy must be between 0 and 100', VALIDATION_CODES.INVALID_RANGE);
        }
    }

    /**
     * @param {UserSettings} settings - User settings
     * @private
     */
    _validateSettings(settings) {
        if (!settings) return;

        if (typeof settings !== 'object') {
            this._addError('settings', 'Settings must be an object', VALIDATION_CODES.INVALID_TYPE);
            return;
        }

        if (settings.theme && !['light', 'dark', 'system'].includes(settings.theme)) {
            this._addError('settings.theme', 'Theme must be light, dark, or system', VALIDATION_CODES.INVALID_VALUE);
        }

        if (settings.notifications !== undefined && typeof settings.notifications !== 'boolean') {
            this._addError('settings.notifications', 'Notifications must be a boolean', VALIDATION_CODES.INVALID_TYPE);
        }

        if (settings.audio_enabled !== undefined && typeof settings.audio_enabled !== 'boolean') {
            this._addError('settings.audio_enabled', 'Audio enabled must be a boolean', VALIDATION_CODES.INVALID_TYPE);
        }
    }

    /**
     * @param {string} createdAt - Creation timestamp
     * @param {string} updatedAt - Update timestamp
     * @private
     */
    _validateTimestamps(createdAt, updatedAt) {
        if (!createdAt) {
            this._addWarning('created_at', 'Created at timestamp is missing', VALIDATION_CODES.MISSING_FIELD);
        } else if (!this._isValidDate(createdAt)) {
            this._addError('created_at', 'Created at must be a valid date', VALIDATION_CODES.INVALID_DATE);
        }

        if (updatedAt && !this._isValidDate(updatedAt)) {
            this._addError('updated_at', 'Updated at must be a valid date', VALIDATION_CODES.INVALID_DATE);
        }
    }
}

// ============================================================
// LESSON VALIDATOR
// ============================================================

/**
 * Lesson Validator - Validates lesson data integrity
 */
class LessonValidator extends BaseValidator {
    /**
     * @param {TimeProvider} timeProvider - Time provider
     */
    constructor(timeProvider) {
        super(timeProvider);
    }

    /**
     * @param {LessonObject} lesson - Lesson data to validate
     * @returns {boolean}
     * @protected
     */
    _validateInternal(lesson) {
        if (!lesson) {
            this._addError('root', 'Lesson object cannot be null or undefined', VALIDATION_CODES.REQUIRED);
            return false;
        }

        this._validateId(lesson.id);
        this._validateTitle(lesson.title);
        this._validateDescription(lesson.description);
        this._validateLevel(lesson.level);
        this._validateOrder(lesson.order);
        this._validateDuration(lesson.duration);
        this._validateTags(lesson.tags);
        this._validatePrerequisites(lesson.prerequisites);
        this._validateContent(lesson.content);

        return this.errors.length === 0;
    }

    /**
     * @param {string} id - Lesson ID
     * @private
     */
    _validateId(id) {
        if (!id) {
            this._addError('id', 'Lesson ID is required', VALIDATION_CODES.REQUIRED);
        } else if (typeof id !== 'string') {
            this._addError('id', 'Lesson ID must be a string', VALIDATION_CODES.INVALID_TYPE);
        } else if (!/^lesson_[a-zA-Z0-9_-]+$/.test(id)) {
            this._addWarning('id', 'Lesson ID should follow pattern "lesson_{name}"', VALIDATION_CODES.FORMAT_WARNING);
        }
    }

    /**
     * @param {string} title - Lesson title
     * @private
     */
    _validateTitle(title) {
        if (!title) {
            this._addError('title', 'Lesson title is required', VALIDATION_CODES.REQUIRED);
        } else if (typeof title !== 'string') {
            this._addError('title', 'Lesson title must be a string', VALIDATION_CODES.INVALID_TYPE);
        } else {
            if (title.length < LESSON_CONSTANTS.MIN_TITLE_LENGTH) {
                this._addError('title', `Lesson title must be at least ${LESSON_CONSTANTS.MIN_TITLE_LENGTH} characters`, VALIDATION_CODES.MIN_LENGTH);
            }
            if (title.length > LESSON_CONSTANTS.MAX_TITLE_LENGTH) {
                this._addError('title', `Lesson title cannot exceed ${LESSON_CONSTANTS.MAX_TITLE_LENGTH} characters`, VALIDATION_CODES.MAX_LENGTH_EXCEEDED);
            }
        }
    }

    /**
     * @param {string} description - Lesson description
     * @private
     */
    _validateDescription(description) {
        if (description && typeof description !== 'string') {
            this._addError('description', 'Description must be a string', VALIDATION_CODES.INVALID_TYPE);
        }
    }

    /**
     * @param {number} level - Difficulty level
     * @private
     */
    _validateLevel(level) {
        if (level === undefined) {
            this._addError('level', 'Lesson level is required', VALIDATION_CODES.REQUIRED);
        } else if (typeof level !== 'number') {
            this._addError('level', 'Lesson level must be a number', VALIDATION_CODES.INVALID_TYPE);
        } else if (level < LESSON_CONSTANTS.MIN_LEVEL || level > LESSON_CONSTANTS.MAX_LEVEL) {
            this._addError('level', `Lesson level must be between ${LESSON_CONSTANTS.MIN_LEVEL} and ${LESSON_CONSTANTS.MAX_LEVEL}`, VALIDATION_CODES.INVALID_RANGE);
        }
    }

    /**
     * @param {number} order - Display order
     * @private
     */
    _validateOrder(order) {
        if (order === undefined) {
            this._addError('order', 'Lesson order is required', VALIDATION_CODES.REQUIRED);
        } else if (typeof order !== 'number') {
            this._addError('order', 'Lesson order must be a number', VALIDATION_CODES.INVALID_TYPE);
        } else if (order < 0) {
            this._addError('order', 'Lesson order cannot be negative', VALIDATION_CODES.INVALID_RANGE);
        }
    }

    /**
     * @param {number} duration - Duration in seconds
     * @private
     */
    _validateDuration(duration) {
        if (duration === undefined) return;

        if (typeof duration !== 'number') {
            this._addError('duration', 'Duration must be a number', VALIDATION_CODES.INVALID_TYPE);
        } else if (duration < 0) {
            this._addError('duration', 'Duration cannot be negative', VALIDATION_CODES.INVALID_RANGE);
        } else if (duration > LESSON_CONSTANTS.MAX_DURATION) {
            this._addWarning('duration', `Duration exceeds ${LESSON_CONSTANTS.MAX_DURATION / 60} minutes, verify`, VALIDATION_CODES.UNUSUAL_VALUE);
        }
    }

    /**
     * @param {Array<string>} tags - Lesson tags
     * @private
     */
    _validateTags(tags) {
        if (!tags) return;

        if (!Array.isArray(tags)) {
            this._addError('tags', 'Tags must be an array', VALIDATION_CODES.INVALID_TYPE);
        } else {
            for (let i = 0; i < tags.length; i++) {
                if (typeof tags[i] !== 'string') {
                    this._addError(`tags[${i}]`, 'Each tag must be a string', VALIDATION_CODES.INVALID_TYPE);
                }
            }
        }
    }

    /**
     * @param {Array<string>} prerequisites - Prerequisite lesson IDs
     * @private
     */
    _validatePrerequisites(prerequisites) {
        if (!prerequisites) return;

        if (!Array.isArray(prerequisites)) {
            this._addError('prerequisites', 'Prerequisites must be an array', VALIDATION_CODES.INVALID_TYPE);
        } else {
            for (let i = 0; i < prerequisites.length; i++) {
                if (typeof prerequisites[i] !== 'string') {
                    this._addError(`prerequisites[${i}]`, 'Each prerequisite must be a lesson ID string', VALIDATION_CODES.INVALID_TYPE);
                }
            }
        }
    }

    /**
     * @param {LessonContent} content - Lesson content
     * @private
     */
    _validateContent(content) {
        if (!content) {
            this._addError('content', 'Lesson content is required', VALIDATION_CODES.REQUIRED);
        } else if (typeof content !== 'object') {
            this._addError('content', 'Content must be an object', VALIDATION_CODES.INVALID_TYPE);
        } else {
            this._validateVocabulary(content.vocabulary);
            this._validateExercises(content.exercises);
        }
    }

    /**
     * @param {Array<VocabularyItem>} vocab - Vocabulary items
     * @private
     */
    _validateVocabulary(vocab) {
        if (!vocab || !Array.isArray(vocab)) {
            this._addError('content.vocabulary', 'Vocabulary must be an array', VALIDATION_CODES.REQUIRED);
            return;
        }

        const seenWords = new Set();
        for (let i = 0; i < vocab.length; i++) {
            const item = vocab[i];

            if (!item.word || typeof item.word !== 'string') {
                this._addError(`content.vocabulary[${i}].word`, 'Word is required and must be string', VALIDATION_CODES.INVALID);
            } else {
                const wordLower = item.word.toLowerCase();
                if (seenWords.has(wordLower)) {
                    this._addWarning(`content.vocabulary[${i}]`, `Duplicate word: ${item.word}`, VALIDATION_CODES.DUPLICATE);
                }
                seenWords.add(wordLower);
            }

            if (!item.translation || typeof item.translation !== 'string') {
                this._addError(`content.vocabulary[${i}].translation`, 'Translation is required and must be string', VALIDATION_CODES.INVALID);
            }

            if (item.pronunciation && typeof item.pronunciation !== 'string') {
                this._addError(`content.vocabulary[${i}].pronunciation`, 'Pronunciation must be string', VALIDATION_CODES.INVALID);
            }

            if (item.examples && !Array.isArray(item.examples)) {
                this._addError(`content.vocabulary[${i}].examples`, 'Examples must be an array', VALIDATION_CODES.INVALID_TYPE);
            }

            if (item.image_url && typeof item.image_url !== 'string') {
                this._addError(`content.vocabulary[${i}].image_url`, 'Image URL must be a string', VALIDATION_CODES.INVALID_TYPE);
            } else if (item.image_url && !item.image_url.startsWith('http')) {
                this._addWarning(`content.vocabulary[${i}].image_url`, 'Image URL should start with http', VALIDATION_CODES.FORMAT_WARNING);
            }
        }
    }

    /**
     * @param {Array<Exercise>} exercises - Exercise items
     * @private
     */
    _validateExercises(exercises) {
        if (!exercises || !Array.isArray(exercises)) {
            this._addError('content.exercises', 'Exercises must be an array', VALIDATION_CODES.REQUIRED);
            return;
        }

        for (let i = 0; i < exercises.length; i++) {
            const ex = exercises[i];

            if (!ex.id || typeof ex.id !== 'string') {
                this._addError(`content.exercises[${i}].id`, 'Exercise ID is required and must be string', VALIDATION_CODES.INVALID);
            }

            if (!ex.type || !['multiple_choice', 'fill_blank', 'matching', 'pronunciation'].includes(ex.type)) {
                this._addError(`content.exercises[${i}].type`, 'Valid exercise type is required', VALIDATION_CODES.INVALID);
            }

            if (!ex.question || typeof ex.question !== 'string') {
                this._addError(`content.exercises[${i}].question`, 'Question is required and must be string', VALIDATION_CODES.INVALID);
            }

            // Validate based on exercise type
            switch (ex.type) {
                case 'multiple_choice':
                    if (!ex.options || !Array.isArray(ex.options) || ex.options.length < 2) {
                        this._addError(`content.exercises[${i}].options`, 'Multiple choice needs at least 2 options', VALIDATION_CODES.INVALID);
                    }
                    if (ex.correct_answer === undefined || ex.correct_answer < 0 || ex.correct_answer >= ex.options?.length) {
                        this._addError(`content.exercises[${i}].correct_answer`, 'Valid correct answer index required', VALIDATION_CODES.INVALID);
                    }
                    break;

                case 'fill_blank':
                    if (!ex.correct_answer || typeof ex.correct_answer !== 'string') {
                        this._addError(`content.exercises[${i}].correct_answer`, 'Fill blank needs a correct answer string', VALIDATION_CODES.INVALID);
                    }
                    break;

                case 'matching':
                    if (!ex.pairs || !Array.isArray(ex.pairs) || ex.pairs.length < 2) {
                        this._addError(`content.exercises[${i}].pairs`, 'Matching needs at least 2 pairs', VALIDATION_CODES.INVALID);
                    }
                    break;
            }

            if (ex.difficulty !== undefined) {
                if (typeof ex.difficulty !== 'number' || ex.difficulty < 1 || ex.difficulty > 5) {
                    this._addError(`content.exercises[${i}].difficulty`, 'Difficulty must be 1-5', VALIDATION_CODES.INVALID_RANGE);
                }
            }
        }
    }
}

// ============================================================
// PROGRESS VALIDATOR
// ============================================================

/**
 * Progress Validator - Ensures progress data integrity
 */
class ProgressValidator extends BaseValidator {
    /**
     * @param {TimeProvider} timeProvider - Time provider
     */
    constructor(timeProvider) {
        super(timeProvider);
    }

    /**
     * @param {ProgressObject} progress - Progress data to validate
     * @returns {boolean}
     * @protected
     */
    _validateInternal(progress) {
        if (!progress) {
            this._addError('root', 'Progress object cannot be null or undefined', VALIDATION_CODES.REQUIRED);
            return false;
        }

        this._validateUserAndLesson(progress.user_id, progress.lesson_id);
        this._validateSRSData(progress.srs_data);
        this._validateDates(progress.next_review, progress.last_reviewed);
        this._validateScore(progress.score);
        this._validateCompletion(progress.completed);
        this._validateMetadata(progress.metadata);

        return this.errors.length === 0;
    }

    /**
     * @param {string} userId - User ID
     * @param {string} lessonId - Lesson ID
     * @private
     */
    _validateUserAndLesson(userId, lessonId) {
        if (!userId) {
            this._addError('user_id', 'User ID is required', VALIDATION_CODES.REQUIRED);
        } else if (typeof userId !== 'string') {
            this._addError('user_id', 'User ID must be a string', VALIDATION_CODES.INVALID_TYPE);
        }

        if (!lessonId) {
            this._addError('lesson_id', 'Lesson ID is required', VALIDATION_CODES.REQUIRED);
        } else if (typeof lessonId !== 'string') {
            this._addError('lesson_id', 'Lesson ID must be a string', VALIDATION_CODES.INVALID_TYPE);
        }
    }

    /**
     * @param {SRSData} srsData - SRS algorithm data
     * @private
     */
    _validateSRSData(srsData) {
        if (!srsData) {
            this._addError('srs_data', 'SRS data is required', VALIDATION_CODES.REQUIRED);
            return;
        }

        if (typeof srsData !== 'object') {
            this._addError('srs_data', 'SRS data must be an object', VALIDATION_CODES.INVALID_TYPE);
            return;
        }

        // Stage validation (0-10 for SM-2 algorithm)
        if (srsData.stage === undefined) {
            this._addError('srs_data.stage', 'SRS stage is required', VALIDATION_CODES.REQUIRED);
        } else if (typeof srsData.stage !== 'number') {
            this._addError('srs_data.stage', 'SRS stage must be a number', VALIDATION_CODES.INVALID_TYPE);
        } else if (srsData.stage < SRS_CONSTANTS.MIN_STAGE || srsData.stage > SRS_CONSTANTS.MAX_STAGE) {
            this._addError('srs_data.stage', `SRS stage must be between ${SRS_CONSTANTS.MIN_STAGE} and ${SRS_CONSTANTS.MAX_STAGE}`, VALIDATION_CODES.INVALID_RANGE);
        }

        // Easiness factor validation (1.3 - 5.0 for SM-2)
        if (srsData.easiness_factor === undefined) {
            this._addError('srs_data.easiness_factor', 'Easiness factor is required', VALIDATION_CODES.REQUIRED);
        } else if (typeof srsData.easiness_factor !== 'number') {
            this._addError('srs_data.easiness_factor', 'Easiness factor must be a number', VALIDATION_CODES.INVALID_TYPE);
        } else if (srsData.easiness_factor < SRS_CONSTANTS.MIN_EF || srsData.easiness_factor > SRS_CONSTANTS.MAX_EF) {
            this._addError('srs_data.easiness_factor', `Easiness factor must be between ${SRS_CONSTANTS.MIN_EF} and ${SRS_CONSTANTS.MAX_EF}`, VALIDATION_CODES.INVALID_RANGE);
        }

        // Interval validation (days)
        if (srsData.interval === undefined) {
            this._addError('srs_data.interval', 'Interval is required', VALIDATION_CODES.REQUIRED);
        } else if (typeof srsData.interval !== 'number') {
            this._addError('srs_data.interval', 'Interval must be a number', VALIDATION_CODES.INVALID_TYPE);
        } else if (srsData.interval < 0) {
            this._addError('srs_data.interval', 'Interval cannot be negative', VALIDATION_CODES.INVALID_RANGE);
        } else if (srsData.interval > SRS_CONSTANTS.MAX_INTERVAL) {
            this._addWarning('srs_data.interval', `Interval exceeds ${SRS_CONSTANTS.MAX_INTERVAL} days, verify`, VALIDATION_CODES.UNUSUAL_VALUE);
        }

        // Review count validation
        if (srsData.review_count !== undefined) {
            if (typeof srsData.review_count !== 'number') {
                this._addError('srs_data.review_count', 'Review count must be a number', VALIDATION_CODES.INVALID_TYPE);
            } else if (srsData.review_count < 0) {
                this._addError('srs_data.review_count', 'Review count cannot be negative', VALIDATION_CODES.INVALID_RANGE);
            }
        }

        // Lapse count validation
        if (srsData.lapse_count !== undefined) {
            if (typeof srsData.lapse_count !== 'number') {
                this._addError('srs_data.lapse_count', 'Lapse count must be a number', VALIDATION_CODES.INVALID_TYPE);
            } else if (srsData.lapse_count < 0) {
                this._addError('srs_data.lapse_count', 'Lapse count cannot be negative', VALIDATION_CODES.INVALID_RANGE);
            }
        }
    }

    /**
     * @param {string} nextReview - Next review timestamp
     * @param {string} lastReviewed - Last reviewed timestamp
     * @private
     */
    _validateDates(nextReview, lastReviewed) {
        if (!nextReview) {
            this._addError('next_review', 'Next review date is required', VALIDATION_CODES.REQUIRED);
        } else if (!this._isValidDate(nextReview)) {
            this._addError('next_review', 'Next review must be a valid date', VALIDATION_CODES.INVALID_DATE);
        }

        if (lastReviewed && !this._isValidDate(lastReviewed)) {
            this._addError('last_reviewed', 'Last reviewed must be a valid date', VALIDATION_CODES.INVALID_DATE);
        }
    }

    /**
     * @param {number} score - Score value
     * @private
     */
    _validateScore(score) {
        if (score === undefined) return;

        if (typeof score !== 'number') {
            this._addError('score', 'Score must be a number', VALIDATION_CODES.INVALID_TYPE);
        } else if (score < 0 || score > 100) {
            this._addError('score', 'Score must be between 0 and 100', VALIDATION_CODES.INVALID_RANGE);
        }
    }

    /**
     * @param {boolean} completed - Completion status
     * @private
     */
    _validateCompletion(completed) {
        if (completed !== undefined && typeof completed !== 'boolean') {
            this._addError('completed', 'Completed must be a boolean', VALIDATION_CODES.INVALID_TYPE);
        }
    }

    /**
     * @param {Object} metadata - Additional metadata
     * @private
     */
    _validateMetadata(metadata) {
        if (metadata && typeof metadata !== 'object') {
            this._addError('metadata', 'Metadata must be an object', VALIDATION_CODES.INVALID_TYPE);
        }
    }
}

// ============================================================
// INDEX DEFINITIONS
// ============================================================

/**
 * Base Index Definition
 */
class BaseIndex extends IIndexDefinition {
    /**
     * @param {string} name - Index name
     * @param {string|Array<string>} keyPath - Key path(s)
     * @param {Object} options - Index options
     */
    constructor(name, keyPath, options = {}) {
        super();
        this.name = name;
        this.keyPath = keyPath;
        this.options = options;
    }

    /** @returns {string} */
    getName() { return this.name; }

    /** @returns {string|Array<string>} */
    getKeyPath() { return this.keyPath; }

    /** @returns {Object} */
    getOptions() { return { ...this.options }; }
}

/**
 * Users Store Indexes
 */
class UsersStoreIndexes {
    /** @returns {string} */
    static getPrimaryKey() { return 'id'; }

    /** @returns {Array<BaseIndex>} */
    static getAll() {
        return [
            new BaseIndex('email', 'email', { unique: true }),
            new BaseIndex('username', 'username', { unique: true }),
            new BaseIndex('created_at', 'created_at', { unique: false }),
            new BaseIndex('level', 'stats.level', { unique: false }),
            new BaseIndex('streak', 'stats.streak', { unique: false })
        ];
    }
}

/**
 * Lessons Store Indexes
 */
class LessonsStoreIndexes {
    /** @returns {string} */
    static getPrimaryKey() { return 'id'; }

    /** @returns {Array<BaseIndex>} */
    static getAll() {
        return [
            new BaseIndex('level', 'level', { unique: false }),
            new BaseIndex('title', 'title', { unique: false }),
            new BaseIndex('order', 'order', { unique: false }),
            new BaseIndex('duration', 'duration', { unique: false }),
            new BaseIndex('tags', 'tags', { unique: false, multiEntry: true })
        ];
    }
}

/**
 * Progress Store Indexes
 */
class ProgressStoreIndexes {
    /** @returns {string} */
    static getPrimaryKey() { return 'id'; }

    /** @returns {boolean} */
    static getAutoIncrement() { return true; }

    /** @returns {Array<BaseIndex>} */
    static getAll() {
        return [
            new BaseIndex('user_id', 'user_id', { unique: false }),
            new BaseIndex('lesson_id', 'lesson_id', { unique: false }),
            new BaseIndex('next_review', 'next_review', { unique: false }),
            new BaseIndex('user_lesson', ['user_id', 'lesson_id'], { unique: true }),
            new BaseIndex('completed', 'completed', { unique: false }),
            new BaseIndex('score', 'score', { unique: false }),
            new BaseIndex('stage', 'srs_data.stage', { unique: false })
        ];
    }
}

// ============================================================
// MIGRATION STRATEGIES
// ============================================================

/**
 * Base Migration Class
 */
class BaseMigration extends IMigration {
    /**
     * @param {number} version - Target version
     */
    constructor(version) {
        super();
        this.version = version;
    }

    /** @returns {number} */
    getVersion() { return this.version; }

    /**
     * @param {*} oldData - Data to migrate
     * @param {number} oldVersion - Source version
     * @returns {*} - Migrated data
     */
    migrate(oldData, oldVersion) {
        return oldData;
    }
}

/**
 * Migration from v0 to v1 (initial schema)
 */
class MigrationV0ToV1 extends BaseMigration {
    constructor() {
        super(1);
    }

    /**
     * @param {*} oldData - Data to migrate
     * @param {number} oldVersion - Source version
     * @returns {*} - Migrated data
     * @throws {Error} If migration fails
     */
    migrate(oldData, oldVersion) {
        if (oldVersion >= 1) return oldData;

        try {
            // Handle legacy data formats
            if (oldData && !oldData.id && oldData._id) {
                oldData.id = oldData._id;
                delete oldData._id;
            }

            // Add default timestamps if missing
            if (!oldData.created_at) {
                oldData.created_at = new Date().toISOString();
            }

            return oldData;
        } catch (error) {
            throw new Error(`Migration failed: ${error.message}`);
        }
    }
}

/**
 * Migration Manager - Handles all migrations
 */
class MigrationManager {
    constructor() {
        this.migrations = [
            new MigrationV0ToV1()
        ];
    }

    /**
     * @returns {number} - Latest version number
     */
    getLatestVersion() {
        return Math.max(...this.migrations.map(m => m.getVersion()));
    }

    /**
     * @param {*} data - Data to migrate
     * @param {number} oldVersion - Current version
     * @param {number} newVersion - Target version
     * @returns {*} - Migrated data
     * @throws {Error} If migration fails
     */
    migrate(data, oldVersion, newVersion) {
        let currentData = { ...data };

        for (const migration of this.migrations.sort((a, b) => a.getVersion() - b.getVersion())) {
            if (migration.getVersion() > oldVersion && migration.getVersion() <= newVersion) {
                currentData = migration.migrate(currentData, oldVersion);
            }
        }

        return currentData;
    }

    /**
     * Migrates multiple items in batch
     * @param {Array<*>} items - Items to migrate
     * @param {number} oldVersion - Current version
     * @param {Function} [onProgress] - Progress callback
     * @returns {Object} - Migration results
     */
    migrateBatch(items, oldVersion, onProgress) {
        const migrated = [];
        const failed = [];

        for (let i = 0; i < items.length; i++) {
            try {
                const migratedItem = this.migrate(items[i], oldVersion, this.getLatestVersion());
                migrated.push(migratedItem);

                if (onProgress) {
                    onProgress({
                        current: i + 1,
                        total: items.length,
                        success: true,
                        item: items[i]
                    });
                }
            } catch (error) {
                failed.push({
                    item: items[i],
                    error: error.message
                });

                if (onProgress) {
                    onProgress({
                        current: i + 1,
                        total: items.length,
                        success: false,
                        error: error.message
                    });
                }
            }
        }

        return {
            migrated,
            failed,
            total_migrated: migrated.length,
            total_failed: failed.length
        };
    }
}

// ============================================================
// MAIN SCHEMA CLASS
// ============================================================

/**
 * Advanced Database Schema - Version 1
 * Complete schema definition with validation, migrations, and utilities
 */
class DatabaseSchema_V1 {
    /**
     * @param {TimeProvider} [timeProvider] - Time provider for testing
     */
    constructor(timeProvider = new TimeProvider()) {
        // Store names as constants
        this.store_names = {
            USERS: 'users',
            LESSONS: 'lessons',
            PROGRESS: 'progress'
        };

        // Version number
        this.version = 1;

        // Time provider
        this.timeProvider = timeProvider;

        // Validators for each store
        this.validators = {
            [this.store_names.USERS]: new UserValidator(this.timeProvider),
            [this.store_names.LESSONS]: new LessonValidator(this.timeProvider),
            [this.store_names.PROGRESS]: new ProgressValidator(this.timeProvider)
        };

        // Index definitions for each store
        this.indexes = {
            [this.store_names.USERS]: UsersStoreIndexes.getAll(),
            [this.store_names.LESSONS]: LessonsStoreIndexes.getAll(),
            [this.store_names.PROGRESS]: ProgressStoreIndexes.getAll()
        };

        // Primary keys
        this.primary_keys = {
            [this.store_names.USERS]: UsersStoreIndexes.getPrimaryKey(),
            [this.store_names.LESSONS]: LessonsStoreIndexes.getPrimaryKey(),
            [this.store_names.PROGRESS]: ProgressStoreIndexes.getPrimaryKey()
        };

        // Auto-increment settings
        this.auto_increment = {
            [this.store_names.USERS]: false,
            [this.store_names.LESSONS]: false,
            [this.store_names.PROGRESS]: ProgressStoreIndexes.getAutoIncrement()
        };

        // Migration manager
        this.migration_manager = new MigrationManager();

        // Schema metadata
        this.metadata = {
            name: 'Farsinglish Database',
            description: 'Main application database for Farsinglish PWA',
            author: 'Farsinglish Team',
            created: '2026-02-20',
            version: this.version,
            stores: Object.keys(this.store_names).length
        };

        // Validation statistics
        this.stats = {
            total_validations: 0,
            failed_validations: 0,
            last_validation: null
        };
    }

    /**
     * Applies the schema to an IndexedDB instance
     * @param {IDBDatabase} db - Database instance
     */
    upgrade(db) {
        this._createStore(db, this.store_names.USERS, {
            keyPath: this.primary_keys[this.store_names.USERS],
            autoIncrement: this.auto_increment[this.store_names.USERS]
        });

        this._createStore(db, this.store_names.LESSONS, {
            keyPath: this.primary_keys[this.store_names.LESSONS],
            autoIncrement: this.auto_increment[this.store_names.LESSONS]
        });

        this._createStore(db, this.store_names.PROGRESS, {
            keyPath: this.primary_keys[this.store_names.PROGRESS],
            autoIncrement: this.auto_increment[this.store_names.PROGRESS]
        });

        console.log(`[Schema] Database upgraded to version ${this.version}`);
    }

    /**
     * Creates a store with all its indexes
     * @param {IDBDatabase} db - Database instance
     * @param {string} storeName - Store name
     * @param {Object} options - Store options
     * @private
     */
    _createStore(db, storeName, options) {
        if (db.objectStoreNames.contains(storeName)) {
            console.warn(`[Schema] Store ${storeName} already exists, deleting...`);
            db.deleteObjectStore(storeName);
        }

        const store = db.createObjectStore(storeName, options);

        const storeIndexes = this.indexes[storeName] || [];
        for (const index of storeIndexes) {
            try {
                store.createIndex(index.getName(), index.getKeyPath(), index.getOptions());
            } catch (error) {
                console.error(`[Schema] Failed to create index ${index.getName()}:`, error);
            }
        }
    }

    /**
     * Validates data against schema rules
     * @param {string} storeName - Name of the store
     * @param {Object} data - Data to validate
     * @returns {ValidationResult} - Validation result
     */
    validate(storeName, data) {
        this.stats.total_validations++;

        const validator = this.validators[storeName];
        if (!validator) {
            return {
                isValid: false,
                errors: [{ field: 'store', message: `No validator for store: ${storeName}`, code: VALIDATION_CODES.INVALID, timestamp: this.timeProvider.now() }],
                warnings: []
            };
        }

        const isValid = validator.validate(data);
        const errors = validator.getErrors();
        const warnings = validator.getWarnings();

        if (!isValid) {
            this.stats.failed_validations++;
        }

        this.stats.last_validation = {
            timestamp: this.timeProvider.now(),
            store: storeName,
            isValid,
            error_count: errors.length
        };

        return {
            isValid,
            errors,
            warnings
        };
    }

    /**
     * Migrates data from old version to current
     * @param {Object} data - Data to migrate
     * @param {number} oldVersion - Old version number
     * @returns {Object} - Migrated data
     * @throws {Error} - If migration fails
     */
    migrate(data, oldVersion) {
        return this.migration_manager.migrate(data, oldVersion, this.version);
    }

    /**
     * Migrates multiple items in batch
     * @param {Array<Object>} items - Items to migrate
     * @param {number} oldVersion - Old version number
     * @param {Function} onProgress - Progress callback
     * @returns {Object} - Migration results
     */
    migrateBatch(items, oldVersion, onProgress) {
        return this.migration_manager.migrateBatch(items, oldVersion, onProgress);
    }

    /**
     * Gets store configuration
     * @param {string} storeName - Store name
     * @returns {Object} - Store configuration
     */
    getStoreConfig(storeName) {
        return {
            name: storeName,
            primary_key: this.primary_keys[storeName],
            auto_increment: this.auto_increment[storeName],
            indexes: this.indexes[storeName]?.map(idx => ({
                name: idx.getName(),
                key_path: idx.getKeyPath(),
                options: idx.getOptions()
            })) || []
        };
    }

    /**
     * Gets all store names
     * @returns {Array<string>} - List of store names
     */
    getStoreNames() {
        return Object.values(this.store_names);
    }

    /**
     * Gets schema statistics
     * @returns {Object} - Statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Validates if a store exists
     * @param {string} storeName - Store name
     * @returns {boolean} - True if exists
     */
    hasStore(storeName) {
        return Object.values(this.store_names).includes(storeName);
    }

    /**
     * Gets schema metadata
     * @returns {Object} - Metadata
     */
    getMetadata() {
        return { ...this.metadata };
    }

    /**
     * Gets query optimization hints for each store
     * @param {string} storeName - Store name
     * @returns {Object|null} - Query hints
     */
    getQueryHints(storeName) {
        const hints = {
            [this.store_names.USERS]: {
                preferred_indexes: ['email', 'username'],
                coverage: ['email', 'username', 'stats.level', 'created_at'],
                full_text_search: false
            },
            [this.store_names.LESSONS]: {
                preferred_indexes: ['level', 'order', 'tags'],
                coverage: ['level', 'order', 'tags', 'title'],
                full_text_search: true,
                searchable_fields: ['title', 'description']
            },
            [this.store_names.PROGRESS]: {
                preferred_indexes: ['user_id', 'next_review', 'user_lesson'],
                coverage: ['user_id', 'lesson_id', 'next_review', 'completed'],
                compound_queries: ['user_id+next_review', 'user_id+completed']
            }
        };

        return hints[storeName] || null;
    }

    /**
     * Gets query plan for common operations
     * @param {string} storeName - Store name
     * @param {string} operation - Operation name
     * @param {Object} params - Operation parameters
     * @returns {Object|null} - Query plan
     */
    getQueryPlan(storeName, operation, params = {}) {
        const plans = {
            [this.store_names.USERS]: {
                findByEmail: { index: 'email', unique: true },
                findByUsername: { index: 'username', unique: true },
                findByLevel: { index: 'level', range: true }
            },
            [this.store_names.LESSONS]: {
                findByLevel: { index: 'level', range: true },
                findByOrder: { index: 'order', range: true },
                findByTag: { index: 'tags', multiEntry: true }
            },
            [this.store_names.PROGRESS]: {
                findByUser: { index: 'user_id', unique: false },
                findDueReviews: { index: 'next_review', range: true },
                findUserLesson: { index: 'user_lesson', unique: true },
                findByStage: { index: 'stage', range: true }
            }
        };

        return plans[storeName]?.[operation] || null;
    }

    /**
     * Compares with another schema version
     * @param {DatabaseSchema_V1} otherSchema - Other schema to compare
     * @returns {Object} - Differences
     */
    compareWith(otherSchema) {
        const differences = {
            added: [],
            removed: [],
            modified: []
        };

        const thisStores = this.getStoreNames();
        const otherStores = otherSchema.getStoreNames();

        // Find added/removed stores
        for (const store of thisStores) {
            if (!otherStores.includes(store)) {
                differences.added.push({ type: 'store', name: store });
            }
        }

        for (const store of otherStores) {
            if (!thisStores.includes(store)) {
                differences.removed.push({ type: 'store', name: store });
            }
        }

        // Compare indexes for common stores
        for (const store of thisStores.filter(s => otherStores.includes(s))) {
            const thisIndexes = this.indexes[store] || [];
            const otherIndexes = otherSchema.indexes[store] || [];

            const thisIndexNames = thisIndexes.map(i => i.getName());
            const otherIndexNames = otherIndexes.map(i => i.getName());

            for (const index of thisIndexes) {
                if (!otherIndexNames.includes(index.getName())) {
                    differences.added.push({ type: 'index', store, name: index.getName() });
                }
            }

            for (const index of otherIndexes) {
                if (!thisIndexNames.includes(index.getName())) {
                    differences.removed.push({ type: 'index', store, name: index.getName() });
                }
            }
        }

        return differences;
    }

    /**
     * Exports schema as JSON
     * @returns {Object} - JSON representation
     */
    toJSON() {
        return {
            version: this.version,
            metadata: this.metadata,
            stores: this.getStoreNames().map(name => this.getStoreConfig(name)),
            validators: Object.keys(this.validators).map(name => ({
                store: name,
                rules: Object.getOwnPropertyNames(Object.getPrototypeOf(this.validators[name]))
                    .filter(p => p.startsWith('_validate') || p === 'validate')
            }))
        };
    }

    /**
     * Creates a sample data template for a store
     * @param {string} storeName - Store name
     * @returns {Object|null} - Sample data template
     */
    getSampleData(storeName) {
        switch (storeName) {
            case this.store_names.USERS:
                return {
                    id: 'user_' + Date.now(),
                    email: 'example@email.com',
                    username: 'learner',
                    password_hash: '$2b$10$...',
                    profile: {
                        full_name: 'John Doe',
                        age: 25,
                        native_language: 'fa'
                    },
                    stats: {
                        level: 1,
                        xp: 0,
                        streak: 0,
                        total_lessons: 0,
                        accuracy: 0
                    },
                    settings: {
                        theme: 'system',
                        notifications: true,
                        audio_enabled: true
                    },
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

            case this.store_names.LESSONS:
                return {
                    id: 'lesson_sample_1',
                    title: 'Sample Lesson',
                    description: 'This is a sample lesson',
                    level: 1,
                    order: 1,
                    duration: 300,
                    tags: ['beginner', 'vocabulary'],
                    prerequisites: [],
                    content: {
                        vocabulary: [
                            { word: 'hello', translation: 'سلام', pronunciation: '/həˈləʊ/' }
                        ],
                        exercises: [
                            {
                                id: 'ex1',
                                type: 'multiple_choice',
                                question: 'What does "hello" mean?',
                                options: ['سلام', 'خداحافظ', 'صبح بخیر', 'شب بخیر'],
                                correct_answer: 0
                            }
                        ]
                    }
                };

            case this.store_names.PROGRESS:
                return {
                    user_id: 'user_123',
                    lesson_id: 'lesson_1',
                    srs_data: {
                        stage: 0,
                        easiness_factor: 2.5,
                        interval: 0,
                        review_count: 0,
                        lapse_count: 0
                    },
                    next_review: new Date().toISOString(),
                    completed: false,
                    score: 0,
                    metadata: {}
                };

            default:
                return null;
        }
    }
}

// ============================================================
// EXPORT SINGLETON INSTANCE
// ============================================================

// Create and freeze the singleton instance
const schema_v1 = new DatabaseSchema_V1();
Object.freeze(schema_v1);

export { DatabaseSchema_V1 };
export default schema_v1;
