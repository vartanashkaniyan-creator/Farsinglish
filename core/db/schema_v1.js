
// core/db/schema-v1.js
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
// Total Lines: ~650 (with comprehensive comments and features)

// ============================================================
// INTERFACES & ABSTRACTIONS
// ============================================================

/**
 * @interface IValidator
 * Contract for all validators
 */
class IValidator {
  validate(data) { throw new Error('Must implement validate()'); }
  getErrors() { throw new Error('Must implement getErrors()'); }
}

/**
 * @interface IMigration
 * Contract for migration strategies
 */
class IMigration {
  migrate(oldData, oldVersion) { throw new Error('Must implement migrate()'); }
  getVersion() { throw new Error('Must implement getVersion()'); }
}

/**
 * @interface IIndexDefinition
 * Contract for index definitions
 */
class IIndexDefinition {
  getName() { throw new Error('Must implement getName()'); }
  getKeyPath() { throw new Error('Must implement getKeyPath()'); }
  getOptions() { throw new Error('Must implement getOptions()'); }
}

// ============================================================
// VALIDATION STRATEGIES
// ============================================================

/**
 * Base Validator Class
 * Implements common validation functionality
 */
class BaseValidator extends IValidator {
  constructor() {
    super();
    this.errors = [];
    this.warnings = [];
  }

  validate(data) {
    this.errors = [];
    this.warnings = [];
    return this._validateInternal(data);
  }

  getErrors() { return [...this.errors]; }
  getWarnings() { return [...this.warnings]; }
  hasErrors() { return this.errors.length > 0; }
  
  _addError(field, message, code = 'VALIDATION_ERROR') {
    this.errors.push({ field, message, code, timestamp: Date.now() });
  }

  _addWarning(field, message, code = 'VALIDATION_WARNING') {
    this.warnings.push({ field, message, code, timestamp: Date.now() });
  }

  _validateInternal(data) { return true; } // To be overridden
}

/**
 * User Validator - Comprehensive validation for user data
 */
class UserValidator extends BaseValidator {
  _validateInternal(user) {
    if (!user) {
      this._addError('root', 'User object cannot be null or undefined', 'REQUIRED');
      return false;
    }

    // ID Validation
    if (!user.id) {
      this._addError('id', 'User ID is required', 'REQUIRED');
    } else if (typeof user.id !== 'string') {
      this._addError('id', 'User ID must be a string', 'INVALID_TYPE');
    } else if (!this._isValidUUID(user.id)) {
      this._addWarning('id', 'User ID should be a valid UUID', 'FORMAT_SUGGESTION');
    }

    // Email Validation (comprehensive)
    if (!user.email) {
      this._addError('email', 'Email is required', 'REQUIRED');
    } else if (typeof user.email !== 'string') {
      this._addError('email', 'Email must be a string', 'INVALID_TYPE');
    } else {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(user.email)) {
        this._addError('email', 'Email format is invalid', 'INVALID_FORMAT');
      }
      if (user.email.length > 255) {
        this._addError('email', 'Email exceeds maximum length of 255 characters', 'MAX_LENGTH_EXCEEDED');
      }
    }

    // Username Validation
    if (!user.username) {
      this._addError('username', 'Username is required', 'REQUIRED');
    } else if (typeof user.username !== 'string') {
      this._addError('username', 'Username must be a string', 'INVALID_TYPE');
    } else {
      if (user.username.length < 3) {
        this._addError('username', 'Username must be at least 3 characters', 'MIN_LENGTH');
      }
      if (user.username.length > 50) {
        this._addError('username', 'Username cannot exceed 50 characters', 'MAX_LENGTH_EXCEEDED');
      }
      if (!/^[a-zA-Z0-9_]+$/.test(user.username)) {
        this._addError('username', 'Username can only contain letters, numbers, and underscores', 'INVALID_CHARS');
      }
    }

    // Password Hash Validation
    if (!user.passwordHash) {
      this._addError('passwordHash', 'Password hash is required', 'REQUIRED');
    } else if (typeof user.passwordHash !== 'string') {
      this._addError('passwordHash', 'Password hash must be a string', 'INVALID_TYPE');
    } else if (user.passwordHash.length < 60) {
      this._addWarning('passwordHash', 'Password hash seems too short for bcrypt', 'SECURITY_WARNING');
    }

    // Profile Data Validation
    if (user.profile) {
      if (typeof user.profile !== 'object') {
        this._addError('profile', 'Profile must be an object', 'INVALID_TYPE');
      } else {
        if (user.profile.fullName && typeof user.profile.fullName !== 'string') {
          this._addError('profile.fullName', 'Full name must be a string', 'INVALID_TYPE');
        }
        if (user.profile.age && (typeof user.profile.age !== 'number' || user.profile.age < 0 || user.profile.age > 150)) {
          this._addError('profile.age', 'Age must be a number between 0 and 150', 'INVALID_RANGE');
        }
        if (user.profile.nativeLanguage && typeof user.profile.nativeLanguage !== 'string') {
          this._addError('profile.nativeLanguage', 'Native language must be a string', 'INVALID_TYPE');
        }
      }
    }

    // Stats Validation
    if (user.stats) {
      if (typeof user.stats !== 'object') {
        this._addError('stats', 'Stats must be an object', 'INVALID_TYPE');
      } else {
        const validStats = ['level', 'xp', 'streak', 'totalLessons', 'totalReviews', 'accuracy'];
        for (const stat of validStats) {
          if (user.stats[stat] !== undefined && typeof user.stats[stat] !== 'number') {
            this._addError(`stats.${stat}`, `${stat} must be a number`, 'INVALID_TYPE');
          }
        }
        if (user.stats.xp < 0) {
          this._addError('stats.xp', 'XP cannot be negative', 'INVALID_RANGE');
        }
        if (user.stats.streak < 0) {
          this._addError('stats.streak', 'Streak cannot be negative', 'INVALID_RANGE');
        }
        if (user.stats.accuracy && (user.stats.accuracy < 0 || user.stats.accuracy > 100)) {
          this._addError('stats.accuracy', 'Accuracy must be between 0 and 100', 'INVALID_RANGE');
        }
      }
    }

    // Settings Validation
    if (user.settings) {
      if (typeof user.settings !== 'object') {
        this._addError('settings', 'Settings must be an object', 'INVALID_TYPE');
      } else {
        if (user.settings.theme && !['light', 'dark', 'system'].includes(user.settings.theme)) {
          this._addError('settings.theme', 'Theme must be light, dark, or system', 'INVALID_VALUE');
        }
        if (user.settings.notifications !== undefined && typeof user.settings.notifications !== 'boolean') {
          this._addError('settings.notifications', 'Notifications must be a boolean', 'INVALID_TYPE');
        }
        if (user.settings.audioEnabled !== undefined && typeof user.settings.audioEnabled !== 'boolean') {
          this._addError('settings.audioEnabled', 'Audio enabled must be a boolean', 'INVALID_TYPE');
        }
      }
    }

    // Timestamps Validation
    if (user.createdAt) {
      if (!this._isValidDate(user.createdAt)) {
        this._addError('createdAt', 'Created at must be a valid date', 'INVALID_DATE');
      }
    } else {
      this._addWarning('createdAt', 'Created at timestamp is missing', 'MISSING_FIELD');
    }

    if (user.updatedAt) {
      if (!this._isValidDate(user.updatedAt)) {
        this._addError('updatedAt', 'Updated at must be a valid date', 'INVALID_DATE');
      }
    }

    return this.errors.length === 0;
  }

  _isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  _isValidDate(date) {
    const d = new Date(date);
    return d instanceof Date && !isNaN(d);
  }
}

/**
 * Lesson Validator - Validates lesson data integrity
 */
class LessonValidator extends BaseValidator {
  _validateInternal(lesson) {
    if (!lesson) {
      this._addError('root', 'Lesson object cannot be null or undefined', 'REQUIRED');
      return false;
    }

    // ID Validation
    if (!lesson.id) {
      this._addError('id', 'Lesson ID is required', 'REQUIRED');
    } else if (typeof lesson.id !== 'string') {
      this._addError('id', 'Lesson ID must be a string', 'INVALID_TYPE');
    } else if (!/^lesson-[a-zA-Z0-9_-]+$/.test(lesson.id)) {
      this._addWarning('id', 'Lesson ID should follow pattern "lesson-{name}"', 'FORMAT_SUGGESTION');
    }

    // Title Validation
    if (!lesson.title) {
      this._addError('title', 'Lesson title is required', 'REQUIRED');
    } else if (typeof lesson.title !== 'string') {
      this._addError('title', 'Lesson title must be a string', 'INVALID_TYPE');
    } else {
      if (lesson.title.length < 3) {
        this._addError('title', 'Lesson title must be at least 3 characters', 'MIN_LENGTH');
      }
      if (lesson.title.length > 200) {
        this._addError('title', 'Lesson title cannot exceed 200 characters', 'MAX_LENGTH_EXCEEDED');
      }
    }

    // Description Validation
    if (lesson.description && typeof lesson.description !== 'string') {
      this._addError('description', 'Description must be a string', 'INVALID_TYPE');
    }

    // Level Validation
    if (lesson.level === undefined) {
      this._addError('level', 'Lesson level is required', 'REQUIRED');
    } else if (typeof lesson.level !== 'number') {
      this._addError('level', 'Lesson level must be a number', 'INVALID_TYPE');
    } else if (lesson.level < 1 || lesson.level > 100) {
      this._addError('level', 'Lesson level must be between 1 and 100', 'INVALID_RANGE');
    }

    // Order Validation
    if (lesson.order === undefined) {
      this._addError('order', 'Lesson order is required', 'REQUIRED');
    } else if (typeof lesson.order !== 'number') {
      this._addError('order', 'Lesson order must be a number', 'INVALID_TYPE');
    } else if (lesson.order < 0) {
      this._addError('order', 'Lesson order cannot be negative', 'INVALID_RANGE');
    }

    // Duration Validation
    if (lesson.duration !== undefined) {
      if (typeof lesson.duration !== 'number') {
        this._addError('duration', 'Duration must be a number', 'INVALID_TYPE');
      } else if (lesson.duration < 0) {
        this._addError('duration', 'Duration cannot be negative', 'INVALID_RANGE');
      } else if (lesson.duration > 3600) {
        this._addWarning('duration', 'Duration exceeds 1 hour, verify', 'UNUSUAL_VALUE');
      }
    }

    // Tags Validation
    if (lesson.tags) {
      if (!Array.isArray(lesson.tags)) {
        this._addError('tags', 'Tags must be an array', 'INVALID_TYPE');
      } else {
        for (let i = 0; i < lesson.tags.length; i++) {
          if (typeof lesson.tags[i] !== 'string') {
            this._addError(`tags[${i}]`, 'Each tag must be a string', 'INVALID_TYPE');
          }
        }
      }
    }

    // Prerequisites Validation
    if (lesson.prerequisites) {
      if (!Array.isArray(lesson.prerequisites)) {
        this._addError('prerequisites', 'Prerequisites must be an array', 'INVALID_TYPE');
      } else {
        for (let i = 0; i < lesson.prerequisites.length; i++) {
          if (typeof lesson.prerequisites[i] !== 'string') {
            this._addError(`prerequisites[${i}]`, 'Each prerequisite must be a lesson ID string', 'INVALID_TYPE');
          }
        }
      }
    }

    // Content Structure Validation
    if (!lesson.content) {
      this._addError('content', 'Lesson content is required', 'REQUIRED');
    } else if (typeof lesson.content !== 'object') {
      this._addError('content', 'Content must be an object', 'INVALID_TYPE');
    } else {
      if (!lesson.content.vocabulary || !Array.isArray(lesson.content.vocabulary)) {
        this._addError('content.vocabulary', 'Vocabulary must be an array', 'REQUIRED');
      } else {
        this._validateVocabulary(lesson.content.vocabulary);
      }
      
      if (!lesson.content.exercises || !Array.isArray(lesson.content.exercises)) {
        this._addError('content.exercises', 'Exercises must be an array', 'REQUIRED');
      } else {
        this._validateExercises(lesson.content.exercises);
      }
    }

    return this.errors.length === 0;
  }

  _validateVocabulary(vocab) {
    for (let i = 0; i < Math.min(vocab.length, 100); i++) {
      const item = vocab[i];
      if (!item.word || typeof item.word !== 'string') {
        this._addError(`content.vocabulary[${i}].word`, 'Word is required and must be string', 'INVALID');
      }
      if (!item.translation || typeof item.translation !== 'string') {
        this._addError(`content.vocabulary[${i}].translation`, 'Translation is required and must be string', 'INVALID');
      }
      if (item.pronunciation && typeof item.pronunciation !== 'string') {
        this._addError(`content.vocabulary[${i}].pronunciation`, 'Pronunciation must be string', 'INVALID');
      }
    }
  }

  _validateExercises(exercises) {
    for (let i = 0; i < Math.min(exercises.length, 50); i++) {
      const ex = exercises[i];
      if (!ex.id || typeof ex.id !== 'string') {
        this._addError(`content.exercises[${i}].id`, 'Exercise ID is required and must be string', 'INVALID');
      }
      if (!ex.type || !['multiple-choice', 'fill-blank', 'matching', 'pronunciation'].includes(ex.type)) {
        this._addError(`content.exercises[${i}].type`, 'Valid exercise type is required', 'INVALID');
      }
      if (!ex.question || typeof ex.question !== 'string') {
        this._addError(`content.exercises[${i}].question`, 'Question is required and must be string', 'INVALID');
      }
    }
  }
}

/**
 * Progress Validator - Ensures progress data integrity
 */
class ProgressValidator extends BaseValidator {
  _validateInternal(progress) {
    if (!progress) {
      this._addError('root', 'Progress object cannot be null or undefined', 'REQUIRED');
      return false;
    }

    // User ID Validation
    if (!progress.userId) {
      this._addError('userId', 'User ID is required', 'REQUIRED');
    } else if (typeof progress.userId !== 'string') {
      this._addError('userId', 'User ID must be a string', 'INVALID_TYPE');
    }

    // Lesson ID Validation
    if (!progress.lessonId) {
      this._addError('lessonId', 'Lesson ID is required', 'REQUIRED');
    } else if (typeof progress.lessonId !== 'string') {
      this._addError('lessonId', 'Lesson ID must be a string', 'INVALID_TYPE');
    }

    // SRS Data Validation
    if (!progress.srsData) {
      this._addError('srsData', 'SRS data is required', 'REQUIRED');
    } else if (typeof progress.srsData !== 'object') {
      this._addError('srsData', 'SRS data must be an object', 'INVALID_TYPE');
    } else {
      // Stage validation (0-10 for SM-2 algorithm)
      if (progress.srsData.stage === undefined) {
        this._addError('srsData.stage', 'SRS stage is required', 'REQUIRED');
      } else if (typeof progress.srsData.stage !== 'number') {
        this._addError('srsData.stage', 'SRS stage must be a number', 'INVALID_TYPE');
      } else if (progress.srsData.stage < 0 || progress.srsData.stage > 10) {
        this._addError('srsData.stage', 'SRS stage must be between 0 and 10', 'INVALID_RANGE');
      }

      // Easiness factor validation (1.3 - 5.0 for SM-2)
      if (progress.srsData.easinessFactor === undefined) {
        this._addError('srsData.easinessFactor', 'Easiness factor is required', 'REQUIRED');
      } else if (typeof progress.srsData.easinessFactor !== 'number') {
        this._addError('srsData.easinessFactor', 'Easiness factor must be a number', 'INVALID_TYPE');
      } else if (progress.srsData.easinessFactor < 1.3 || progress.srsData.easinessFactor > 5.0) {
        this._addError('srsData.easinessFactor', 'Easiness factor must be between 1.3 and 5.0', 'INVALID_RANGE');
      }

      // Interval validation (days)
      if (progress.srsData.interval === undefined) {
        this._addError('srsData.interval', 'Interval is required', 'REQUIRED');
      } else if (typeof progress.srsData.interval !== 'number') {
        this._addError('srsData.interval', 'Interval must be a number', 'INVALID_TYPE');
      } else if (progress.srsData.interval < 0) {
        this._addError('srsData.interval', 'Interval cannot be negative', 'INVALID_RANGE');
      } else if (progress.srsData.interval > 365) {
        this._addWarning('srsData.interval', 'Interval exceeds 1 year, verify', 'UNUSUAL_VALUE');
      }

      // Review count validation
      if (progress.srsData.reviewCount !== undefined) {
        if (typeof progress.srsData.reviewCount !== 'number') {
          this._addError('srsData.reviewCount', 'Review count must be a number', 'INVALID_TYPE');
        } else if (progress.srsData.reviewCount < 0) {
          this._addError('srsData.reviewCount', 'Review count cannot be negative', 'INVALID_RANGE');
        }
      }

      // Lapse count validation
      if (progress.srsData.lapseCount !== undefined) {
        if (typeof progress.srsData.lapseCount !== 'number') {
          this._addError('srsData.lapseCount', 'Lapse count must be a number', 'INVALID_TYPE');
        } else if (progress.srsData.lapseCount < 0) {
          this._addError('srsData.lapseCount', 'Lapse count cannot be negative', 'INVALID_RANGE');
        }
      }
    }

    // Next review date validation
    if (!progress.nextReview) {
      this._addError('nextReview', 'Next review date is required', 'REQUIRED');
    } else {
      const reviewDate = new Date(progress.nextReview);
      if (isNaN(reviewDate.getTime())) {
        this._addError('nextReview', 'Next review must be a valid date', 'INVALID_DATE');
      }
    }

    // Last reviewed date validation
    if (progress.lastReviewed) {
      const lastDate = new Date(progress.lastReviewed);
      if (isNaN(lastDate.getTime())) {
        this._addError('lastReviewed', 'Last reviewed must be a valid date', 'INVALID_DATE');
      }
    }

    // Score validation (0-100)
    if (progress.score !== undefined) {
      if (typeof progress.score !== 'number') {
        this._addError('score', 'Score must be a number', 'INVALID_TYPE');
      } else if (progress.score < 0 || progress.score > 100) {
        this._addError('score', 'Score must be between 0 and 100', 'INVALID_RANGE');
      }
    }

    // Completion status validation
    if (progress.completed !== undefined && typeof progress.completed !== 'boolean') {
      this._addError('completed', 'Completed must be a boolean', 'INVALID_TYPE');
    }

    // Metadata validation
    if (progress.metadata && typeof progress.metadata !== 'object') {
      this._addError('metadata', 'Metadata must be an object', 'INVALID_TYPE');
    }

    return this.errors.length === 0;
  }
}

// ============================================================
// INDEX DEFINITIONS
// ============================================================

/**
 * Base Index Definition
 */
class BaseIndex extends IIndexDefinition {
  constructor(name, keyPath, options = {}) {
    super();
    this.name = name;
    this.keyPath = keyPath;
    this.options = options;
  }

  getName() { return this.name; }
  getKeyPath() { return this.keyPath; }
  getOptions() { return { ...this.options }; }
}

/**
 * Users Store Indexes
 */
class UsersStoreIndexes {
  static getPrimaryKey() { return 'id'; }
  
  static getAll() {
    return [
      new BaseIndex('email', 'email', { unique: true }),
      new BaseIndex('username', 'username', { unique: true }),
      new BaseIndex('createdAt', 'createdAt', { unique: false }),
      new BaseIndex('level', 'stats.level', { unique: false }),
      new BaseIndex('streak', 'stats.streak', { unique: false })
    ];
  }
}

/**
 * Lessons Store Indexes
 */
class LessonsStoreIndexes {
  static getPrimaryKey() { return 'id'; }
  
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
  static getPrimaryKey() { return 'id'; }
  static getAutoIncrement() { return true; }
  
  static getAll() {
    return [
      new BaseIndex('userId', 'userId', { unique: false }),
      new BaseIndex('lessonId', 'lessonId', { unique: false }),
      new BaseIndex('nextReview', 'nextReview', { unique: false }),
      new BaseIndex('user_lesson', ['userId', 'lessonId'], { unique: true }),
      new BaseIndex('completed', 'completed', { unique: false }),
      new BaseIndex('score', 'score', { unique: false }),
      new BaseIndex('stage', 'srsData.stage', { unique: false })
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
  constructor(version) {
    super();
    this.version = version;
  }

  getVersion() { return this.version; }
  
  migrate(oldData, oldVersion) {
    // Base implementation - to be overridden
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

  migrate(oldData, oldVersion) {
    if (oldVersion >= 1) return oldData;
    
    // Handle legacy data formats
    if (oldData && !oldData.id && oldData._id) {
      oldData.id = oldData._id;
      delete oldData._id;
    }
    
    // Add default timestamps if missing
    if (!oldData.createdAt) {
      oldData.createdAt = new Date().toISOString();
    }
    
    return oldData;
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

  getLatestVersion() {
    return Math.max(...this.migrations.map(m => m.getVersion()));
  }

  migrate(data, oldVersion, newVersion) {
    let currentData = { ...data };
    
    for (const migration of this.migrations.sort((a, b) => a.getVersion() - b.getVersion())) {
      if (migration.getVersion() > oldVersion && migration.getVersion() <= newVersion) {
        try {
          currentData = migration.migrate(currentData, oldVersion);
        } catch (error) {
          console.error(`Migration to version ${migration.getVersion()} failed:`, error);
          throw new Error(`Migration failed: ${error.message}`);
        }
      }
    }
    
    return currentData;
  }
}

// ============================================================
// MAIN SCHEMA CLASS
// ============================================================

/**
 * Advanced Database Schema - Version 1
 * Complete schema definition with validation, migrations, and utilities
 */
export class DatabaseSchemaV1 {
  constructor() {
    // Store names as constants
    this.storeNames = {
      USERS: 'users',
      LESSONS: 'lessons',
      PROGRESS: 'progress'
    };

    // Version number
    this.version = 1;

    // Validators for each store
    this.validators = {
      [this.storeNames.USERS]: new UserValidator(),
      [this.storeNames.LESSONS]: new LessonValidator(),
      [this.storeNames.PROGRESS]: new ProgressValidator()
    };

    // Index definitions for each store
    this.indexes = {
      [this.storeNames.USERS]: UsersStoreIndexes.getAll(),
      [this.storeNames.LESSONS]: LessonsStoreIndexes.getAll(),
      [this.storeNames.PROGRESS]: ProgressStoreIndexes.getAll()
    };

    // Primary keys
    this.primaryKeys = {
      [this.storeNames.USERS]: UsersStoreIndexes.getPrimaryKey(),
      [this.storeNames.LESSONS]: LessonsStoreIndexes.getPrimaryKey(),
      [this.storeNames.PROGRESS]: ProgressStoreIndexes.getPrimaryKey()
    };

    // Auto-increment settings
    this.autoIncrement = {
      [this.storeNames.USERS]: false,
      [this.storeNames.LESSONS]: false,
      [this.storeNames.PROGRESS]: ProgressStoreIndexes.getAutoIncrement()
    };

    // Migration manager
    this.migrationManager = new MigrationManager();

    // Schema metadata
    this.metadata = {
      name: 'Farsinglish Database',
      description: 'Main application database for Farsinglish PWA',
      author: 'Farsinglish Team',
      created: '2026-02-16',
      version: this.version,
      stores: Object.keys(this.storeNames).length
    };

    // Validation statistics
    this.stats = {
      totalValidations: 0,
      failedValidations: 0,
      lastValidation: null
    };
  }

  /**
   * Applies the schema to an IndexedDB instance
   * @param {IDBDatabase} db - Database instance
   */
  upgrade(db) {
    // Create users store
    this._createStore(db, this.storeNames.USERS, {
      keyPath: this.primaryKeys[this.storeNames.USERS],
      autoIncrement: this.autoIncrement[this.storeNames.USERS]
    });

    // Create lessons store
    this._createStore(db, this.storeNames.LESSONS, {
      keyPath: this.primaryKeys[this.storeNames.LESSONS],
      autoIncrement: this.autoIncrement[this.storeNames.LESSONS]
    });

    // Create progress store
    this._createStore(db, this.storeNames.PROGRESS, {
      keyPath: this.primaryKeys[this.storeNames.PROGRESS],
      autoIncrement: this.autoIncrement[this.storeNames.PROGRESS]
    });

    // Log successful upgrade
    console.log(`[Schema] Database upgraded to version ${this.version}`);
  }

  /**
   * Creates a store with all its indexes
   * @private
   */
  _createStore(db, storeName, options) {
    if (db.objectStoreNames.contains(storeName)) {
      console.warn(`[Schema] Store ${storeName} already exists, deleting...`);
      db.deleteObjectStore(storeName);
    }

    const store = db.createObjectStore(storeName, options);
    
    // Create all indexes for this store
    const storeIndexes = this.indexes[storeName] || [];
    for (const index of storeIndexes) {
      try {
        store.createIndex(index.getName(), index.getKeyPath(), index.getOptions());
      } catch (error) {
        console.error(`[Schema] Failed to create index ${index.getName()}:`, error);
      }
    }

    return store;
  }

  /**
   * Validates data against schema rules
   * @param {string} storeName - Name of the store
   * @param {Object} data - Data to validate
   * @returns {Object} Validation result
   */
  validate(storeName, data) {
    this.stats.totalValidations++;
    
    const validator = this.validators[storeName];
    if (!validator) {
      return {
        isValid: false,
        errors: [{ field: 'store', message: `No validator for store: ${storeName}` }],
        warnings: []
      };
    }

    const isValid = validator.validate(data);
    const errors = validator.getErrors();
    const warnings = validator.getWarnings();

    if (!isValid) {
      this.stats.failedValidations++;
    }

    this.stats.lastValidation = {
      timestamp: Date.now(),
      store: storeName,
      isValid,
      errorCount: errors.length
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
   * @returns {Object} Migrated data
   */
  migrate(data, oldVersion) {
    return this.migrationManager.migrate(data, oldVersion, this.version);
  }

  /**
   * Gets store configuration
   * @param {string} storeName - Store name
   * @returns {Object} Store configuration
   */
  getStoreConfig(storeName) {
    return {
      name: storeName,
      primaryKey: this.primaryKeys[storeName],
      autoIncrement: this.autoIncrement[storeName],
      indexes: this.indexes[storeName]?.map(idx => ({
        name: idx.getName(),
        keyPath: idx.getKeyPath(),
        options: idx.getOptions()
      })) || []
    };
  }

  /**
   * Gets all store names
   * @returns {Array<string>} List of store names
   */
  getStoreNames() {
    return Object.values(this.storeNames);
  }

  /**
   * Gets schema statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Validates if a store exists
   * @param {string} storeName - Store name
   * @returns {boolean} True if exists
   */
  hasStore(storeName) {
    return Object.values(this.storeNames).includes(storeName);
  }

  /**
   * Gets schema metadata
   * @returns {Object} Metadata
   */
  getMetadata() {
    return { ...this.metadata };
  }

  /**
   * Creates a sample data template for a store
   * @param {string} storeName - Store name
   * @returns {Object} Sample data template
   */
  getSampleData(storeName) {
    switch (storeName) {
      case this.storeNames.USERS:
        return {
          id: 'user_' + Date.now(),
          email: 'example@email.com',
          username: 'learner',
          passwordHash: '$2b$10$...',
          profile: {
            fullName: 'John Doe',
            age: 25,
            nativeLanguage: 'fa'
          },
          stats: {
            level: 1,
            xp: 0,
            streak: 0,
            totalLessons: 0,
            accuracy: 0
          },
          settings: {
            theme: 'system',
            notifications: true,
            audioEnabled: true
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

      case this.storeNames.LESSONS:
        return {
          id: 'lesson-sample-1',
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
                type: 'multiple-choice',
                question: 'What does "hello" mean?',
                options: ['سلام', 'خداحافظ', 'صبح بخیر', 'شب بخیر'],
                correctAnswer: 0
              }
            ]
          }
        };

      case this.storeNames.PROGRESS:
        return {
          userId: 'user_123',
          lessonId: 'lesson-1',
          srsData: {
            stage: 0,
            easinessFactor: 2.5,
            interval: 0,
            reviewCount: 0,
            lapseCount: 0
          },
          nextReview: new Date().toISOString(),
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
const schemaV1 = new DatabaseSchemaV1();
Object.freeze(schemaV1);

export default schemaV1;
