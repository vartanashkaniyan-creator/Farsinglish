// core/db/schema-v1.js
/**
 * Schema Version 1 - تعریف ساختار اولیه پایگاه داده
 * مسئولیت: تعریف جداول، ایندکس‌ها و نگهداری نسخه‌های اسکیما
 * اصل SRP: فقط تعریف ساختار داده‌ها
 * اصل OCP: قابل گسترش برای نسخه‌های آینده
 * اصل ISP: جداول مستقل با ایندکس‌های خاص
 */

// ============ انواع داده‌های پایه ============
const DataTypes = Object.freeze({
    STRING: 'string',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    OBJECT: 'object',
    ARRAY: 'array',
    DATE: 'date',
    TIMESTAMP: 'timestamp'
});

// ============ جداول اصلی ============
const SchemaV1 = Object.freeze({
    VERSION: 1,
    DB_NAME: 'farsinglish_db',

    // جدول کاربران
    USERS: {
        TABLE_NAME: 'users',
        KEY_PATH: 'id',
        AUTO_INCREMENT: true,
        
        COLUMNS: {
            ID: { type: DataTypes.NUMBER, required: true },
            USERNAME: { type: DataTypes.STRING, required: true, maxLength: 50 },
            EMAIL: { type: DataTypes.STRING, required: true, maxLength: 100 },
            PHONE: { type: DataTypes.STRING, maxLength: 15 },
            AVATAR_URL: { type: DataTypes.STRING, maxLength: 255 },
            LANGUAGE: { type: DataTypes.STRING, defaultValue: 'fa' },
            LEVEL: { type: DataTypes.NUMBER, defaultValue: 1, min: 1, max: 10 },
            XP: { type: DataTypes.NUMBER, defaultValue: 0, min: 0 },
            STREAK_DAYS: { type: DataTypes.NUMBER, defaultValue: 0 },
            LAST_ACTIVE: { type: DataTypes.TIMESTAMP },
            CREATED_AT: { type: DataTypes.TIMESTAMP, required: true },
            UPDATED_AT: { type: DataTypes.TIMESTAMP }
        },

        INDEXES: [
            { name: 'email_idx', keyPath: 'email', options: { unique: true } },
            { name: 'username_idx', keyPath: 'username', options: { unique: true } },
            { name: 'level_idx', keyPath: 'level' },
            { name: 'last_active_idx', keyPath: 'last_active' }
        ]
    },

    // جدول درس‌ها
    LESSONS: {
        TABLE_NAME: 'lessons',
        KEY_PATH: 'id',
        AUTO_INCREMENT: false,
        
        COLUMNS: {
            ID: { type: DataTypes.STRING, required: true, pattern: /^lesson_\d+$/ },
            TITLE: { type: DataTypes.STRING, required: true, maxLength: 100 },
            DESCRIPTION: { type: DataTypes.STRING, maxLength: 500 },
            CATEGORY: { type: DataTypes.STRING, required: true, enum: ['vocabulary', 'grammar', 'listening', 'speaking'] },
            DIFFICULTY: { type: DataTypes.NUMBER, required: true, min: 1, max: 5 },
            ORDER: { type: DataTypes.NUMBER, required: true, min: 1 },
            DURATION: { type: DataTypes.NUMBER, defaultValue: 10 }, // دقیقه
            IS_LOCKED: { type: DataTypes.BOOLEAN, defaultValue: true },
            PREREQUISITES: { type: DataTypes.ARRAY, defaultValue: [] },
            TAGS: { type: DataTypes.ARRAY, defaultValue: [] },
            CONTENT: { type: DataTypes.OBJECT, required: true },
            XP_REWARD: { type: DataTypes.NUMBER, defaultValue: 100 },
            CREATED_AT: { type: DataTypes.TIMESTAMP, required: true },
            UPDATED_AT: { type: DataTypes.TIMESTAMP }
        },

        INDEXES: [
            { name: 'category_idx', keyPath: 'category' },
            { name: 'difficulty_idx', keyPath: 'difficulty' },
            { name: 'order_idx', keyPath: 'order' },
            { name: 'is_locked_idx', keyPath: 'is_locked' },
            { name: 'tags_idx', keyPath: 'tags', options: { multiEntry: true } }
        ]
    },

    // جدول پیشرفت کاربر (User Progress)
    USER_PROGRESS: {
        TABLE_NAME: 'user_progress',
        KEY_PATH: ['user_id', 'lesson_id'], // کلید ترکیبی
        
        COLUMNS: {
            USER_ID: { type: DataTypes.NUMBER, required: true },
            LESSON_ID: { type: DataTypes.STRING, required: true },
            STATUS: { type: DataTypes.STRING, required: true, enum: ['not_started', 'in_progress', 'completed', 'review_pending'] },
            SCORE: { type: DataTypes.NUMBER, defaultValue: 0, min: 0, max: 100 },
            ATTEMPTS: { type: DataTypes.NUMBER, defaultValue: 0 },
            LAST_REVIEWED: { type: DataTypes.TIMESTAMP },
            NEXT_REVIEW_DATE: { type: DataTypes.TIMESTAMP }, // برای SRS
            REVIEW_INTERVAL: { type: DataTypes.NUMBER, defaultValue: 1 }, // روز
            EASE_FACTOR: { type: DataTypes.NUMBER, defaultValue: 2.5 }, // فاکتور سهولت در SRS
            DATA: { type: DataTypes.OBJECT, defaultValue: {} }, // داده‌های اضافی
            COMPLETED_AT: { type: DataTypes.TIMESTAMP },
            CREATED_AT: { type: DataTypes.TIMESTAMP, required: true },
            UPDATED_AT: { type: DataTypes.TIMESTAMP }
        },

        INDEXES: [
            { name: 'user_id_idx', keyPath: 'user_id' },
            { name: 'lesson_id_idx', keyPath: 'lesson_id' },
            { name: 'status_idx', keyPath: 'status' },
            { name: 'next_review_idx', keyPath: 'next_review_date' },
            { name: 'user_lesson_idx', keyPath: ['user_id', 'lesson_id'], options: { unique: true } }
        ]
    },

    // جدول واژگان
    VOCABULARY: {
        TABLE_NAME: 'vocabulary',
        KEY_PATH: 'id',
        AUTO_INCREMENT: false,
        
        COLUMNS: {
            ID: { type: DataTypes.STRING, required: true, pattern: /^vocab_\d+$/ },
            WORD: { type: DataTypes.STRING, required: true, maxLength: 100 },
            TRANSLATION: { type: DataTypes.STRING, required: true, maxLength: 100 },
            PHONETIC: { type: DataTypes.STRING, maxLength: 100 },
            PART_OF_SPEECH: { type: DataTypes.STRING, enum: ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'other'] },
            EXAMPLE: { type: DataTypes.STRING, maxLength: 500 },
            LESSON_ID: { type: DataTypes.STRING, required: true },
            DIFFICULTY: { type: DataTypes.NUMBER, min: 1, max: 5 },
            TAGS: { type: DataTypes.ARRAY, defaultValue: [] },
            AUDIO_URL: { type: DataTypes.STRING, maxLength: 255 },
            IMAGE_URL: { type: DataTypes.STRING, maxLength: 255 },
            CREATED_AT: { type: DataTypes.TIMESTAMP, required: true }
        },

        INDEXES: [
            { name: 'word_idx', keyPath: 'word' },
            { name: 'lesson_id_idx', keyPath: 'lesson_id' },
            { name: 'part_of_speech_idx', keyPath: 'part_of_speech' },
            { name: 'difficulty_idx', keyPath: 'difficulty' },
            { name: 'tags_idx', keyPath: 'tags', options: { multiEntry: true } }
        ]
    },

    // جدول تنظیمات برنامه
    APP_SETTINGS: {
        TABLE_NAME: 'app_settings',
        KEY_PATH: 'key',
        
        COLUMNS: {
            KEY: { type: DataTypes.STRING, required: true },
            VALUE: { type: DataTypes.OBJECT, required: true },
            TYPE: { type: DataTypes.STRING, required: true, enum: ['string', 'number', 'boolean', 'object', 'array'] },
            CATEGORY: { type: DataTypes.STRING, required: true },
            UPDATED_AT: { type: DataTypes.TIMESTAMP, required: true }
        },

        INDEXES: [
            { name: 'category_idx', keyPath: 'category' },
            { name: 'type_idx', keyPath: 'type' }
        ]
    }
});

// ============ Schema Config برای IndexedDB ============
const SchemaConfigV1 = {
    [SchemaV1.USERS.TABLE_NAME]: {
        keyPath: SchemaV1.USERS.KEY_PATH,
        autoIncrement: SchemaV1.USERS.AUTO_INCREMENT,
        indexes: SchemaV1.USERS.INDEXES
    },
    [SchemaV1.LESSONS.TABLE_NAME]: {
        keyPath: SchemaV1.LESSONS.KEY_PATH,
        autoIncrement: SchemaV1.LESSONS.AUTO_INCREMENT,
        indexes: SchemaV1.LESSONS.INDEXES
    },
    [SchemaV1.USER_PROGRESS.TABLE_NAME]: {
        keyPath: SchemaV1.USER_PROGRESS.KEY_PATH,
        indexes: SchemaV1.USER_PROGRESS.INDEXES
    },
    [SchemaV1.VOCABULARY.TABLE_NAME]: {
        keyPath: SchemaV1.VOCABULARY.KEY_PATH,
        autoIncrement: SchemaV1.VOCABULARY.AUTO_INCREMENT,
        indexes: SchemaV1.VOCABULARY.INDEXES
    },
    [SchemaV1.APP_SETTINGS.TABLE_NAME]: {
        keyPath: SchemaV1.APP_SETTINGS.KEY_PATH,
        indexes: SchemaV1.APP_SETTINGS.INDEXES
    }
};

// ============ Migration Helper ============
class SchemaMigrationHelper {
    /**
     * بررسی سازگاری اسکیما
     * @param {number} currentVersion - نسخه فعلی
     * @param {number} targetVersion - نسخه هدف
     * @returns {boolean} - آیا نیاز به migration است
     */
    static needsMigration(currentVersion, targetVersion) {
        return currentVersion < targetVersion;
    }

    /**
     * ایجاد داده‌های اولیه
     * @returns {Object} - داده‌های اولیه برای هر جدول
     */
    static getInitialData() {
        return {
            [SchemaV1.APP_SETTINGS.TABLE_NAME]: [
                {
                    key: 'app_language',
                    value: 'fa',
                    type: 'string',
                    category: 'general',
                    updated_at: new Date().toISOString()
                },
                {
                    key: 'daily_goal',
                    value: 5,
                    type: 'number',
                    category: 'learning',
                    updated_at: new Date().toISOString()
                },
                {
                    key: 'enable_sound',
                    value: true,
                    type: 'boolean',
                    category: 'audio',
                    updated_at: new Date().toISOString()
                },
                {
                    key: 'enable_notifications',
                    value: true,
                    type: 'boolean',
                    category: 'notifications',
                    updated_at: new Date().toISOString()
                },
                {
                    key: 'srs_enabled',
                    value: true,
                    type: 'boolean',
                    category: 'learning',
                    updated_at: new Date().toISOString()
                }
            ]
        };
    }

    /**
     * اعتبارسنجی داده ورودی بر اساس اسکیما
     * @param {string} tableName - نام جدول
     * @param {Object} data - داده برای اعتبارسنجی
     * @returns {Object} - نتیجه اعتبارسنجی
     */
    static validateData(tableName, data) {
        const tableSchema = SchemaV1[tableName.toUpperCase()];
        if (!tableSchema) {
            return { isValid: false, errors: [`جدول ${tableName} یافت نشد`] };
        }

        const errors = [];
        const requiredFields = Object.entries(tableSchema.COLUMNS)
            .filter(([_, config]) => config.required)
            .map(([field]) => field);

        // بررسی فیلدهای اجباری
        requiredFields.forEach(field => {
            if (data[field] === undefined || data[field] === null) {
                errors.push(`فیلد اجباری ${field} پر نشده است`);
            }
        });

        // بررسی نوع داده
        Object.entries(data).forEach(([field, value]) => {
            const columnConfig = tableSchema.COLUMNS[field.toUpperCase()];
            if (!columnConfig) {
                errors.push(`فیلد ${field} در اسکیما تعریف نشده است`);
                return;
            }

            // بررسی نوع
            if (!this._validateType(value, columnConfig.type)) {
                errors.push(`نوع فیلد ${field} نامعتبر است. انتظار ${columnConfig.type}`);
            }

            // بررسی طول برای رشته‌ها
            if (columnConfig.type === DataTypes.STRING && columnConfig.maxLength) {
                if (value.length > columnConfig.maxLength) {
                    errors.push(`طول فیلد ${field} بیشتر از ${columnConfig.maxLength} کاراکتر است`);
                }
            }

            // بررسی مقادیر مجاز
            if (columnConfig.enum && !columnConfig.enum.includes(value)) {
                errors.push(`مقدار ${value} برای فیلد ${field} مجاز نیست`);
            }

            // بررسی محدوده اعداد
            if (columnConfig.type === DataTypes.NUMBER) {
                if (columnConfig.min !== undefined && value < columnConfig.min) {
                    errors.push(`مقدار ${field} کمتر از ${columnConfig.min} است`);
                }
                if (columnConfig.max !== undefined && value > columnConfig.max) {
                    errors.push(`مقدار ${field} بیشتر از ${columnConfig.max} است`);
                }
            }

            // بررسی الگو
            if (columnConfig.pattern && !columnConfig.pattern.test(value)) {
                errors.push(`فرمت ${field} نامعتبر است`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors,
            validatedData: data
        };
    }

    /**
     * اعتبارسنجی نوع داده
     * @private
     */
    static _validateType(value, expectedType) {
        switch (expectedType) {
            case DataTypes.STRING:
                return typeof value === 'string';
            case DataTypes.NUMBER:
                return typeof value === 'number' && !isNaN(value);
            case DataTypes.BOOLEAN:
                return typeof value === 'boolean';
            case DataTypes.OBJECT:
                return typeof value === 'object' && !Array.isArray(value) && value !== null;
            case DataTypes.ARRAY:
                return Array.isArray(value);
            case DataTypes.DATE:
            case DataTypes.TIMESTAMP:
                return !isNaN(Date.parse(value));
            default:
                return true;
        }
    }
}

// ============ خروجی ============
export {
    SchemaV1,
    SchemaConfigV1,
    SchemaMigrationHelper,
    DataTypes
};
