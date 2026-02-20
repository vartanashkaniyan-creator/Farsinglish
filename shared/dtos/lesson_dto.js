/**
 * @fileoverview Data Transfer Object (DTO) برای مدل درس
 * 
 * این ماژول مسئولیت اعتبارسنجی، تبدیل و تضمین یکپارچگی داده‌های درس را بر عهده دارد.
 * با جداسازی لایه DTO، امنیت و پایداری داده‌ها در سراسر پروژه تضمین می‌شود.
 * 
 * @author Farsinglish Team
 * @version 2.0.0
 * @module shared/dtos/lesson_dto
 */

/**
 * @typedef {Object} LessonData
 * @property {string} id - شناسه یکتای درس
 * @property {string} title - عنوان درس
 * @property {string} description - توضیحات درس
 * @property {string} level - سطح درس (beginner/intermediate/advanced)
 * @property {Array<string>} tags - برچسب‌های درس
 * @property {number} orderIndex - ترتیب درس
 * @property {boolean} isActive - وضعیت فعال بودن
 * @property {Object} content - محتوای درس
 * @property {Array<Object>} content.vocabulary - لغات جدید
 * @property {Array<Object>} content.examples - مثال‌ها
 * @property {Date} createdAt - تاریخ ایجاد
 * @property {Date} updatedAt - تاریخ به‌روزرسانی
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid
 * @property {Array<{code: string, message: string, field?: string}>} errors
 * @property {LessonData} [sanitized]
 */

/**
 * @typedef {Object} FieldSchema
 * @property {string} type
 * @property {RegExp} [pattern]
 * @property {number} [min]
 * @property {number} [max]
 * @property {Array} [enum]
 * @property {boolean} required
 * @property {Function} [validate]
 */

/**
 * کلاس DTO درس با قابلیت اعتبارسنجی و تبدیل پیشرفته
 * @final
 */
export class LessonDTO {
    /**
     * کدهای خطای استاندارد
     * @type {Object}
     */
    static #errors = {
        INVALID_INPUT: { code: 'ERR_001', message: 'داده ورودی نامعتبر است' },
        ID_REQUIRED: { code: 'ERR_002', message: 'شناسه الزامی است' },
        ID_INVALID: { code: 'ERR_003', message: 'فرمت شناسه نامعتبر است' },
        TITLE_REQUIRED: { code: 'ERR_004', message: 'عنوان درس الزامی است' },
        TITLE_TYPE: { code: 'ERR_005', message: 'عنوان باید رشته باشد' },
        TITLE_MIN: { code: 'ERR_006', message: 'عنوان باید حداقل {min} کاراکتر باشد' },
        TITLE_MAX: { code: 'ERR_007', message: 'عنوان باید حداکثر {max} کاراکتر باشد' },
        TITLE_PATTERN: { code: 'ERR_008', message: 'عنوان شامل کاراکترهای غیرمجاز است' },
        LEVEL_REQUIRED: { code: 'ERR_009', message: 'سطح درس الزامی است' },
        LEVEL_TYPE: { code: 'ERR_010', message: 'سطح باید رشته باشد' },
        LEVEL_INVALID: { code: 'ERR_011', message: 'سطح باید یکی از beginner, intermediate, advanced باشد' },
        TAGS_TYPE: { code: 'ERR_012', message: 'برچسب‌ها باید آرایه باشند' },
        TAGS_MAX: { code: 'ERR_013', message: 'حداکثر {max} برچسب مجاز است' },
        TAG_INVALID: { code: 'ERR_014', message: 'برچسب "{tag}" نامعتبر است' },
        ORDER_INDEX_TYPE: { code: 'ERR_015', message: 'ترتیب درس باید عدد باشد' },
        ORDER_INDEX_NEGATIVE: { code: 'ERR_016', message: 'ترتیب درس نمی‌تواند منفی باشد' },
        CONTENT_TYPE: { code: 'ERR_017', message: 'محتوای درس باید شیء باشد' },
        VOCAB_TYPE: { code: 'ERR_018', message: 'لغات باید آرایه باشند' },
        VOCAB_MAX: { code: 'ERR_019', message: 'حداکثر {max} لغت مجاز است' },
        VOCAB_INVALID: { code: 'ERR_020', message: 'لغت {index}: کلمه و معنی الزامی است' },
        EXAMPLES_TYPE: { code: 'ERR_021', message: 'مثال‌ها باید آرایه باشند' },
        DATE_INVALID: { code: 'ERR_022', message: 'تاریخ نامعتبر است' }
    };

    /**
     * الگوهای اعتبارسنجی ثابت
     * @type {Object}
     */
    static #patterns = {
        id: /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,
        title: /^[\u0600-\u06FF\s\w\-]{3,100}$/,
        tag: /^[\w\-]{2,30}$/i
    };

    /**
     * اسکیماهای اعتبارسنجی
     * @type {Object.<string, FieldSchema>}
     */
    static #schema = {
        id: {
            type: 'string',
            pattern: this.#patterns.id,
            required: false,
            validate: (value) => typeof value === 'string'
        },
        title: {
            type: 'string',
            min: 3,
            max: 100,
            pattern: this.#patterns.title,
            required: true,
            validate: (value) => typeof value === 'string' && value.trim().length > 0
        },
        description: {
            type: 'string',
            max: 500,
            required: false
        },
        level: {
            type: 'string',
            enum: ['beginner', 'intermediate', 'advanced'],
            required: true
        },
        tags: {
            type: 'array',
            max: 10,
            required: false,
            validate: (value) => Array.isArray(value) && value.every(tag => this.#patterns.tag.test(tag))
        },
        orderIndex: {
            type: 'number',
            min: 0,
            required: false,
            validate: (value) => typeof value === 'number' && !isNaN(value) && value >= 0
        },
        isActive: {
            type: 'boolean',
            required: false
        }
    };

    /**
     * مقادیر پیش‌فرض
     * @type {Object}
     */
    static #defaults = {
        isActive: true,
        tags: [],
        orderIndex: 0,
        content: {
            vocabulary: [],
            examples: []
        }
    };

    /**
     * محدودیت‌ها
     * @type {Object}
     */
    static #constraints = {
        maxVocabularyItems: 50
    };

    /**
     * کش اعتبارسنجی برای بهبود عملکرد
     * @type {Map<string, ValidationResult>}
     */
    static #validationCache = new Map();

    /**
     * @private
     */
    constructor() {
        throw new Error('LessonDTO is a static class and cannot be instantiated');
    }

    /**
     * اعتبارسنجی بر اساس اسکیما
     * @param {string} field 
     * @param {*} value 
     * @returns {{isValid: boolean, error: Object|null}}
     */
    static #validateField(field, value) {
        const schema = this.#schema[field];
        if (!schema) return { isValid: true, error: null };

        // بررسی required
        if (schema.required && (value === undefined || value === null)) {
            const error = this.#errors[`${field.toUpperCase()}_REQUIRED`] || this.#errors.INVALID_INPUT;
            return { isValid: false, error: { ...error, field } };
        }

        if (value === undefined || value === null) {
            return { isValid: true, error: null };
        }

        // بررسی type
        if (schema.type === 'array' && !Array.isArray(value)) {
            const error = this.#errors[`${field.toUpperCase()}_TYPE`] || this.#errors.INVALID_INPUT;
            return { isValid: false, error: { ...error, field } };
        }

        if (schema.type !== 'array' && typeof value !== schema.type) {
            const error = this.#errors[`${field.toUpperCase()}_TYPE`] || this.#errors.INVALID_INPUT;
            return { isValid: false, error: { ...error, field } };
        }

        // بررسی min/max
        if (schema.type === 'string' && schema.min && value.length < schema.min) {
            const error = this.#errors[`${field.toUpperCase()}_MIN`] || this.#errors.INVALID_INPUT;
            return { 
                isValid: false, 
                error: { 
                    ...error, 
                    field,
                    message: error.message.replace('{min}', schema.min)
                } 
            };
        }

        if (schema.type === 'string' && schema.max && value.length > schema.max) {
            const error = this.#errors[`${field.toUpperCase()}_MAX`] || this.#errors.INVALID_INPUT;
            return { 
                isValid: false, 
                error: { 
                    ...error, 
                    field,
                    message: error.message.replace('{max}', schema.max)
                } 
            };
        }

        if (schema.type === 'number' && schema.min !== undefined && value < schema.min) {
            return { 
                isValid: false, 
                error: { 
                    code: 'ERR_016',
                    message: schema.min === 0 ? 'مقدار نمی‌تواند منفی باشد' : `مقدار باید حداقل ${schema.min} باشد`,
                    field 
                } 
            };
        }

        // بررسی enum
        if (schema.enum && !schema.enum.includes(value)) {
            const error = this.#errors[`${field.toUpperCase()}_INVALID`] || this.#errors.INVALID_INPUT;
            return { isValid: false, error: { ...error, field } };
        }

        // بررسی pattern
        if (schema.pattern && !schema.pattern.test(value)) {
            const error = this.#errors[`${field.toUpperCase()}_PATTERN`] || this.#errors.INVALID_INPUT;
            return { isValid: false, error: { ...error, field } };
        }

        // بررسی custom validate
        if (schema.validate && !schema.validate(value)) {
            const error = this.#errors[`${field.toUpperCase()}_INVALID`] || this.#errors.INVALID_INPUT;
            return { isValid: false, error: { ...error, field } };
        }

        return { isValid: true, error: null };
    }

    /**
     * اعتبارسنجی و پالایش داده‌های درس
     * @param {unknown} input - داده ورودی
     * @param {Object} [options] - گزینه‌های اعتبارسنجی
     * @param {boolean} [options.useCache=true] - استفاده از کش
     * @returns {ValidationResult}
     */
    static validate(input, options = { useCache: true }) {
        const cacheKey = JSON.stringify(input);
        
        if (options.useCache && this.#validationCache.has(cacheKey)) {
            return this.#validationCache.get(cacheKey);
        }

        /** @type {Array<{code: string, message: string, field?: string}>} */
        const errors = [];

        // بررسی وجود داده
        if (!input || typeof input !== 'object') {
            const result = {
                isValid: false,
                errors: [{ ...this.#errors.INVALID_INPUT }],
                sanitized: null
            };
            this.#validationCache.set(cacheKey, result);
            return result;
        }

        // ایجاد کپی برای جلوگیری از تغییر داده اصلی
        const data = { ...this.#defaults, ...input };

        // اعتبارسنجی فیلدهای پایه
        for (const [field, schema] of Object.entries(this.#schema)) {
            const { isValid, error } = this.#validateField(field, data[field]);
            if (!isValid && error) {
                errors.push(error);
            }
        }

        // اعتبارسنجی id (اگر وجود داشته باشد)
        if (data.id !== undefined) {
            const { isValid, error } = this.#validateField('id', data.id);
            if (!isValid && error) errors.push(error);
        }

        // اعتبارسنجی content
        if (data.content) {
            if (typeof data.content !== 'object') {
                errors.push({ ...this.#errors.CONTENT_TYPE, field: 'content' });
            } else {
                // اعتبارسنجی vocabulary
                if (data.content.vocabulary) {
                    if (!Array.isArray(data.content.vocabulary)) {
                        errors.push({ ...this.#errors.VOCAB_TYPE, field: 'content.vocabulary' });
                    } else if (data.content.vocabulary.length > this.#constraints.maxVocabularyItems) {
                        errors.push({ 
                            ...this.#errors.VOCAB_MAX, 
                            field: 'content.vocabulary',
                            message: this.#errors.VOCAB_MAX.message.replace('{max}', this.#constraints.maxVocabularyItems)
                        });
                    } else {
                        for (let i = 0; i < data.content.vocabulary.length; i++) {
                            const vocab = data.content.vocabulary[i];
                            if (!vocab?.word || !vocab?.meaning) {
                                errors.push({ 
                                    ...this.#errors.VOCAB_INVALID, 
                                    field: `content.vocabulary[${i}]`,
                                    message: this.#errors.VOCAB_INVALID.message.replace('{index}', i + 1)
                                });
                            }
                        }
                    }
                }

                // اعتبارسنجی examples
                if (data.content.examples && !Array.isArray(data.content.examples)) {
                    errors.push({ ...this.#errors.EXAMPLES_TYPE, field: 'content.examples' });
                }
            }
        }

        // اعتبارسنجی تاریخ‌ها
        if (data.createdAt) {
            const date = data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt);
            if (isNaN(date.getTime())) {
                errors.push({ ...this.#errors.DATE_INVALID, field: 'createdAt' });
            }
        }

        if (data.updatedAt) {
            const date = data.updatedAt instanceof Date ? data.updatedAt : new Date(data.updatedAt);
            if (isNaN(date.getTime())) {
                errors.push({ ...this.#errors.DATE_INVALID, field: 'updatedAt' });
            }
        }

        const result = {
            isValid: errors.length === 0,
            errors,
            sanitized: errors.length === 0 ? this.#sanitize(data) : null
        };

        this.#validationCache.set(cacheKey, result);
        return result;
    }

    /**
     * اعتبارسنجی دسته‌ای چند درس
     * @param {Array<unknown>} lessons
     * @returns {Array<ValidationResult>}
     */
    static batchValidate(lessons) {
        if (!Array.isArray(lessons)) {
            return [{
                isValid: false,
                errors: [{ ...this.#errors.INVALID_INPUT, message: 'ورودی باید آرایه باشد' }],
                sanitized: null
            }];
        }
        return lessons.map(lesson => this.validate(lesson));
    }

    /**
     * پالایش نهایی داده‌ها
     * @param {LessonData} data 
     * @returns {LessonData}
     */
    static #sanitize(data) {
        return {
            id: data.id,
            title: data.title?.trim(),
            description: data.description?.trim() || '',
            level: data.level,
            tags: data.tags ? [...new Set(data.tags.map(t => t.trim().toLowerCase()))] : [],
            orderIndex: data.orderIndex ?? 0,
            isActive: data.isActive ?? true,
            content: {
                vocabulary: (data.content?.vocabulary || []).map(v => ({
                    word: v.word?.trim(),
                    meaning: v.meaning?.trim(),
                    example: v.example?.trim() || ''
                })),
                examples: (data.content?.examples || []).map(e => ({
                    text: e.text?.trim(),
                    translation: e.translation?.trim() || ''
                }))
            },
            createdAt: this.#toDate(data.createdAt) || new Date(),
            updatedAt: new Date()
        };
    }

    /**
     * تبدیل به تاریخ
     * @param {any} value 
     * @returns {Date|null}
     */
    static #toDate(value) {
        if (!value) return null;
        if (value instanceof Date) return value;
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
    }

    /**
     * تبدیل داده به فرمت ذخیره‌سازی
     * @param {LessonData} data 
     * @returns {Object}
     */
    static toStorage(data) {
        const validated = this.validate(data, { useCache: false });
        if (!validated.isValid) {
            throw new Error(`Invalid lesson data: ${validated.errors.map(e => e.message).join(', ')}`);
        }

        return {
            ...validated.sanitized,
            createdAt: validated.sanitized.createdAt.toISOString(),
            updatedAt: validated.sanitized.updatedAt.toISOString()
        };
    }

    /**
     * تبدیل داده از فرمت ذخیره‌سازی
     * @param {Object} storage 
     * @returns {LessonData}
     */
    static fromStorage(storage) {
        return {
            ...storage,
            createdAt: new Date(storage.createdAt),
            updatedAt: new Date(storage.updatedAt)
        };
    }

    /**
     * ایجاد یک درس جدید با مقادیر پیش‌فرض
     * @param {Partial<LessonData>} data 
     * @returns {LessonData}
     */
    static create(data = {}) {
        const newLesson = {
            id: crypto.randomUUID(),
            title: '',
            description: '',
            level: 'beginner',
            tags: [],
            orderIndex: 0,
            isActive: true,
            content: {
                vocabulary: [],
                examples: []
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data
        };

        const validated = this.validate(newLesson, { useCache: false });
        if (!validated.isValid) {
            throw new Error(`Invalid lesson data: ${validated.errors.map(e => e.message).join(', ')}`);
        }

        return validated.sanitized;
    }

    /**
     * ایجاد دسته‌ای چند درس
     * @param {Array<Partial<LessonData>>} lessonsData
     * @returns {Array<LessonData>}
     */
    static batchCreate(lessonsData) {
        return lessonsData.map(data => this.create(data));
    }

    /**
     * به‌روزرسانی جزئی درس
     * @param {LessonData} original 
     * @param {Partial<LessonData>} updates 
     * @returns {LessonData}
     */
    static update(original, updates) {
        const merged = {
            ...original,
            ...updates,
            updatedAt: new Date()
        };

        const validated = this.validate(merged, { useCache: false });
        if (!validated.isValid) {
            throw new Error(`Invalid update data: ${validated.errors.map(e => e.message).join(', ')}`);
        }

        return validated.sanitized;
    }

    /**
     * به‌روزرسانی جزئی با فیلدهای مجاز
     * @param {LessonData} original 
     * @param {Partial<LessonData>} updates 
     * @returns {LessonData}
     */
    static updatePartial(original, updates) {
        const allowedFields = ['title', 'description', 'tags', 'level', 'content', 'isActive'];
        const filteredUpdates = Object.fromEntries(
            Object.entries(updates).filter(([key]) => allowedFields.includes(key))
        );
        return this.update(original, filteredUpdates);
    }

    /**
     * بررسی برابری دو درس
     * @param {LessonData} a 
     * @param {LessonData} b 
     * @returns {boolean}
     */
    static equals(a, b) {
        return a.id === b.id &&
               a.title === b.title &&
               a.level === b.level &&
               JSON.stringify(a.tags) === JSON.stringify(b.tags);
    }

    /**
     * مقایسه و تشخیص تغییرات
     * @param {LessonData} original 
     * @param {LessonData} updated 
     * @returns {Object}
     */
    static diff(original, updated) {
        const changes = {};
        const allKeys = new Set([...Object.keys(original), ...Object.keys(updated)]);
        
        for (const key of allKeys) {
            if (key === 'updatedAt') continue;
            
            const originalValue = original[key];
            const updatedValue = updated[key];
            
            if (JSON.stringify(originalValue) !== JSON.stringify(updatedValue)) {
                changes[key] = {
                    from: originalValue,
                    to: updatedValue
                };
            }
        }
        
        return changes;
    }

    /**
     * خلاصه درس برای نمایش در لیست‌ها
     * @param {LessonData} lesson 
     * @returns {Object}
     */
    static summary(lesson) {
        return {
            id: lesson.id,
            title: lesson.title,
            level: lesson.level,
            orderIndex: lesson.orderIndex,
            isActive: lesson.isActive,
            vocabularyCount: lesson.content?.vocabulary?.length || 0,
            lastUpdated: lesson.updatedAt
        };
    }

    /**
     * شبیه‌سازی یک درس برای تست
     * @param {Partial<LessonData>} [overrides]
     * @returns {LessonData}
     */
    static mock(overrides = {}) {
        return this.create({
            id: crypto.randomUUID(),
            title: 'درس نمونه',
            description: 'توضیحات درس نمونه',
            level: 'beginner',
            tags: ['آموزشی', 'مقدماتی'],
            orderIndex: 1,
            content: {
                vocabulary: [
                    { word: 'hello', meaning: 'سلام', example: 'Hello world' }
                ],
                examples: [
                    { text: 'This is a sample', translation: 'این یک نمونه است' }
                ]
            },
            ...overrides
        });
    }

    /**
     * پاکسازی کش اعتبارسنجی
     */
    static clearCache() {
        this.#validationCache.clear();
    }
}

// جلوگیری از افزودن خصوصیات جدید به شیء
Object.freeze(LessonDTO);
