/**
 * @fileoverview هسته اعتبارسنجی داده‌ها با پشتیبانی از انواع مختلف
 * @author Farsinglish Team
 * @version 3.0.0
 */

/**
 * @template T
 * @typedef {Object} ValidationResult
 * @property {boolean} success - نتیجه اعتبارسنجی
 * @property {T} [value] - مقدار اعتبارسنجی شده (در صورت success)
 * @property {string[]} [errors] - لیست خطاها (در صورت failure)
 * @property {Object} [details] - جزئیات بیشتر خطا
 */

/**
 * @typedef {Object} ValidationRule
 * @property {string} field - نام فیلد
 * @property {string} type - نوع داده (string, number, boolean, array, object)
 * @property {boolean} [required] - اجباری بودن
 * @property {number} [min] - حداقل مقدار (برای number) یا طول (برای string/array)
 * @property {number} [max] - حداکثر مقدار (برای number) یا طول (برای string/array)
 * @property {RegExp} [pattern] - الگوی regex (برای string)
 * @property {Function} [custom] - تابع اعتبارسنجی سفارشی
 * @property {string} [message] - پیام خطای سفارشی
 * @property {any[]} [enum] - مقادیر مجاز
 * @property {ValidationSchema} [schema] - اسکیما برای objectهای تو در تو
 */

/**
 * @typedef {Object} ValidationSchema
 * @property {Record<string, ValidationRule>} fields - قوانین فیلدها
 */

/**
 * @typedef {Object} ValidationError
 * @property {string} field - نام فیلد
 * @property {string} message - پیام خطا
 * @property {string} rule - قانون نقض شده
 * @property {Object} [details] - جزئیات بیشتر
 * @property {number} timestamp - زمان خطا
 */

/**
 * کلاس اصلی اعتبارسنجی با قابلیت زنجیره‌سازی
 * @template T
 */
export class Validator {
    /** @type {ValidationResult<T>} */
    #result;

    /** @type {ValidationError[]} */
    #errors = [];

    /** @type {any} */
    #data;

    /** @type {Map<string, Function>} */
    #customTypes = new Map();

    /**
     * @param {any} data - داده ورودی برای اعتبارسنجی
     */
    constructor(data) {
        this.#data = this.#deepClone(data);
        this.#result = {
            success: true,
            value: this.#data,
            errors: []
        };
    }

    /**
     * ایجاد نمونه جدید Validator
     * @template T
     * @param {any} data
     * @returns {Validator<T>}
     */
    static of(data) {
        return new Validator(data);
    }

    /**
     * کلون عمیق برای جلوگیری از تغییرات ناخواسته
     * @param {any} obj
     * @returns {any}
     */
    #deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj);
        if (Array.isArray(obj)) return obj.map(item => this.#deepClone(item));
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, this.#deepClone(value)])
        );
    }

    /**
     * ثبت نوع داده سفارشی
     * @param {string} typeName
     * @param {Function} validator
     * @returns {this}
     */
    registerCustomType(typeName, validator) {
        this.#customTypes.set(typeName, validator);
        return this;
    }

    // ================ قوانین پایه ================

    /**
     * بررسی وجود فیلد
     * @param {string} field
     * @param {Object} options
     * @param {string} [options.message]
     * @returns {this}
     */
    required(field, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (value === undefined || value === null || value === '') {
            this.#addError(
                field,
                options.message || `فیلد ${field} اجباری است`,
                'required'
            );
        }

        return this;
    }

    /**
     * بررسی نوع داده
     * @param {string} field
     * @param {string} type
     * @param {Object} options
     * @param {string} [options.message]
     * @returns {this}
     */
    type(field, type, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (value === undefined || value === null) {
            return this;
        }

        let isValid = false;
        let actualType = typeof value;

        // بررسی نوع‌های استاندارد
        switch (type) {
            case 'string':
                isValid = typeof value === 'string';
                break;
            case 'number':
                isValid = typeof value === 'number' && !isNaN(value) && isFinite(value);
                break;
            case 'boolean':
                isValid = typeof value === 'boolean';
                break;
            case 'array':
                isValid = Array.isArray(value);
                actualType = 'array';
                break;
            case 'object':
                isValid = value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
                actualType = 'object';
                break;
            case 'date':
                isValid = value instanceof Date && !isNaN(value.getTime());
                actualType = value instanceof Date ? 'date' : typeof value;
                break;
            case 'email':
                isValid = typeof value === 'string' && 
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
                actualType = 'email';
                break;
            case 'uuid':
                isValid = typeof value === 'string' &&
                    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
                actualType = 'uuid';
                break;
            case 'url':
                isValid = typeof value === 'string' &&
                    /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(value);
                actualType = 'url';
                break;
            case 'phone':
                isValid = typeof value === 'string' &&
                    /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/.test(value);
                actualType = 'phone';
                break;
            default:
                // بررسی نوع سفارشی
                const customValidator = this.#customTypes.get(type);
                if (customValidator) {
                    isValid = customValidator(value);
                    actualType = type;
                } else {
                    isValid = true;
                }
        }

        if (!isValid) {
            this.#addError(
                field,
                options.message || `فیلد ${field} باید از نوع ${type} باشد`,
                'type',
                { expected: type, actual: actualType }
            );
        }

        return this;
    }

    // ================ قوانین عددی ================

    /**
     * بررسی حداقل مقدار
     * @param {string} field
     * @param {number} min
     * @param {Object} options
     * @param {string} [options.message]
     * @returns {this}
     */
    min(field, min, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (value === undefined || value === null) {
            return this;
        }

        let isValid = false;
        let actual = value;

        if (typeof value === 'number') {
            isValid = value >= min;
        } else if (typeof value === 'string' || Array.isArray(value)) {
            isValid = value.length >= min;
            actual = value.length;
        }

        if (!isValid) {
            this.#addError(
                field,
                options.message || `فیلد ${field} باید حداقل ${min} باشد`,
                'min',
                { min, actual }
            );
        }

        return this;
    }

    /**
     * بررسی حداکثر مقدار
     * @param {string} field
     * @param {number} max
     * @param {Object} options
     * @param {string} [options.message]
     * @returns {this}
     */
    max(field, max, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (value === undefined || value === null) {
            return this;
        }

        let isValid = false;
        let actual = value;

        if (typeof value === 'number') {
            isValid = value <= max;
        } else if (typeof value === 'string' || Array.isArray(value)) {
            isValid = value.length <= max;
            actual = value.length;
        }

        if (!isValid) {
            this.#addError(
                field,
                options.message || `فیلد ${field} باید حداکثر ${max} باشد`,
                'max',
                { max, actual }
            );
        }

        return this;
    }

    /**
     * بررسی محدوده عددی
     * @param {string} field
     * @param {number} min
     * @param {number} max
     * @param {Object} options
     * @returns {this}
     */
    range(field, min, max, options = {}) {
        return this
            .min(field, min, options)
            .max(field, max, options);
    }

    /**
     * بررسی مثبت بودن عدد
     * @param {string} field
     * @param {Object} options
     * @returns {this}
     */
    positive(field, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (typeof value === 'number' && value <= 0) {
            this.#addError(
                field,
                options.message || `فیلد ${field} باید مثبت باشد`,
                'positive',
                { value }
            );
        }

        return this;
    }

    /**
     * بررسی صحیح بودن عدد
     * @param {string} field
     * @param {Object} options
     * @returns {this}
     */
    integer(field, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (typeof value === 'number' && !Number.isInteger(value)) {
            this.#addError(
                field,
                options.message || `فیلد ${field} باید عدد صحیح باشد`,
                'integer',
                { value }
            );
        }

        return this;
    }

    // ================ قوانین رشته‌ای ================

    /**
     * بررسی الگوی regex
     * @param {string} field
     * @param {RegExp} pattern
     * @param {Object} options
     * @param {string} [options.message]
     * @returns {this}
     */
    pattern(field, pattern, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (value === undefined || value === null || typeof value !== 'string') {
            return this;
        }

        if (!pattern.test(value)) {
            this.#addError(
                field,
                options.message || `فیلد ${field} با الگوی مورد نظر مطابقت ندارد`,
                'pattern',
                { pattern: pattern.toString() }
            );
        }

        return this;
    }

    /**
     * بررسی طول دقیق رشته
     * @param {string} field
     * @param {number} length
     * @param {Object} options
     * @returns {this}
     */
    length(field, length, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (typeof value === 'string' && value.length !== length) {
            this.#addError(
                field,
                options.message || `فیلد ${field} باید دقیقاً ${length} کاراکتر باشد`,
                'length',
                { expected: length, actual: value.length }
            );
        }

        return this;
    }

    /**
     * بررسی ایمیل
     * @param {string} field
     * @param {Object} options
     * @returns {this}
     */
    email(field, options = {}) {
        return this.type(field, 'email', options);
    }

    /**
     * بررسی UUID
     * @param {string} field
     * @param {Object} options
     * @returns {this}
     */
    uuid(field, options = {}) {
        return this.type(field, 'uuid', options);
    }

    /**
     * بررسی URL
     * @param {string} field
     * @param {Object} options
     * @returns {this}
     */
    url(field, options = {}) {
        return this.type(field, 'url', options);
    }

    // ================ قوانین آرایه‌ای ================

    /**
     * اعتبارسنجی آیتم‌های آرایه
     * @param {string} field
     * @param {Function} itemValidator
     * @param {Object} options
     * @param {Function} [arrayValidator]
     * @returns {this}
     */
    arrayOf(field, itemValidator, options = {}, arrayValidator) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (!Array.isArray(value)) {
            if (value !== undefined && value !== null) {
                this.#addError(
                    field,
                    options.message || `فیلد ${field} باید آرایه باشد`,
                    'arrayOf',
                    { expected: 'array', actual: typeof value }
                );
            }
            return this;
        }

        // اعتبارسنجی هر آیتم
        value.forEach((item, index) => {
            const result = itemValidator(item, index, value);
            if (result === false || (result && result.success === false)) {
                this.#addError(
                    `${field}[${index}]`,
                    result?.message || `آیتم ${index} نامعتبر است`,
                    'arrayItem',
                    { index, value: item, details: result?.details }
                );
            }
        });

        // اعتبارسنجی کل آرایه
        if (arrayValidator) {
            const arrayResult = arrayValidator(value);
            if (arrayResult === false || (arrayResult && arrayResult.success === false)) {
                this.#addError(
                    field,
                    arrayResult?.message || `آرایه ${field} نامعتبر است`,
                    'arrayValidator',
                    { details: arrayResult?.details }
                );
            }
        }

        return this;
    }

    /**
     * بررسی اندازه آرایه
     * @param {string} field
     * @param {number} size
     * @param {Object} options
     * @returns {this}
     */
    arraySize(field, size, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (Array.isArray(value) && value.length !== size) {
            this.#addError(
                field,
                options.message || `آرایه ${field} باید دقیقاً ${size} آیتم داشته باشد`,
                'arraySize',
                { expected: size, actual: value.length }
            );
        }

        return this;
    }

    /**
     * بررسی یکتا بودن آیتم‌های آرایه
     * @param {string} field
     * @param {Object} options
     * @returns {this}
     */
    unique(field, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (Array.isArray(value)) {
            const duplicates = value.filter((item, index) => 
                value.indexOf(item) !== index
            );
            
            if (duplicates.length > 0) {
                this.#addError(
                    field,
                    options.message || `آرایه ${field} دارای مقادیر تکراری است`,
                    'unique',
                    { duplicates: [...new Set(duplicates)] }
                );
            }
        }

        return this;
    }

    // ================ قوانین شیء ================

    /**
     * اعتبارسنجی شیء تو در تو
     * @param {string} field
     * @param {ValidationSchema} schema
     * @param {Object} options
     * @returns {this}
     */
    object(field, schema, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            if (value !== undefined && value !== null) {
                this.#addError(
                    field,
                    options.message || `فیلد ${field} باید شیء باشد`,
                    'object'
                );
            }
            return this;
        }

        const nestedValidator = Validator.of(value).schema(schema);
        if (!nestedValidator.isValid()) {
            nestedValidator.getErrors().forEach(error => {
                this.#addError(
                    `${field}.${error.field}`,
                    error.message,
                    'nested',
                    error.details
                );
            });
        }

        return this;
    }

    // ================ قوانین تاریخ ================

    /**
     * اعتبارسنجی تاریخ
     * @param {string} field
     * @param {Object} options
     * @returns {this}
     */
    date(field, options = {}) {
        return this.type(field, 'date', options);
    }

    /**
     * بررسی محدوده تاریخ
     * @param {string} field
     * @param {Date|string} minDate
     * @param {Date|string} maxDate
     * @param {Object} options
     * @param {string} [options.format] - فرمت تاریخ (iso, timestamp, persian)
     * @returns {this}
     */
    dateRange(field, minDate, maxDate, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (!value) return this;

        const date = this.#parseDate(value, options.format);
        const min = this.#parseDate(minDate, options.format);
        const max = this.#parseDate(maxDate, options.format);

        if (!date || !min || !max) {
            this.#addError(
                field,
                'تاریخ نامعتبر است',
                'dateRange',
                { value, min: minDate, max: maxDate }
            );
            return this;
        }

        if (date < min || date > max) {
            this.#addError(
                field,
                options.message || `تاریخ باید بین ${this.#formatDate(min)} و ${this.#formatDate(max)} باشد`,
                'dateRange',
                { min: min.toISOString(), max: max.toISOString(), actual: date.toISOString() }
            );
        }

        return this;
    }

    /**
     * بررسی تاریخ آینده
     * @param {string} field
     * @param {Object} options
     * @returns {this}
     */
    future(field, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (!value) return this;

        const date = this.#parseDate(value);
        const now = new Date();

        if (!date) {
            this.#addError(field, 'تاریخ نامعتبر است', 'future');
            return this;
        }

        if (date <= now) {
            this.#addError(
                field,
                options.message || 'تاریخ باید در آینده باشد',
                'future',
                { date: date.toISOString() }
            );
        }

        return this;
    }

    /**
     * بررسی تاریخ گذشته
     * @param {string} field
     * @param {Object} options
     * @returns {this}
     */
    past(field, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (!value) return this;

        const date = this.#parseDate(value);
        const now = new Date();

        if (!date) {
            this.#addError(field, 'تاریخ نامعتبر است', 'past');
            return this;
        }

        if (date >= now) {
            this.#addError(
                field,
                options.message || 'تاریخ باید در گذشته باشد',
                'past',
                { date: date.toISOString() }
            );
        }

        return this;
    }

    /**
     * تبدیل رشته به تاریخ
     * @param {string|Date} value
     * @param {string} [format]
     * @returns {Date|null}
     */
    #parseDate(value, format = 'iso') {
        if (value instanceof Date) return value;
        
        if (typeof value === 'string') {
            if (format === 'persian') {
                // تبدیل تاریخ شمسی به میلادی (پیاده‌سازی ساده)
                const parts = value.split('/');
                if (parts.length === 3) {
                    // اینجا باید تبدیل واقعی انجام شود
                    return new Date(`${parts[0]}/${parts[1]}/${parts[2]}`);
                }
            }
            const date = new Date(value);
            return isNaN(date.getTime()) ? null : date;
        }
        
        return null;
    }

    /**
     * فرمت تاریخ برای نمایش
     * @param {Date} date
     * @returns {string}
     */
    #formatDate(date) {
        return date.toLocaleDateString('fa-IR');
    }

    // ================ قوانین شرطی ================

    /**
     * اعتبارسنجی شرطی
     * @param {string} field
     * @param {Function} condition
     * @param {Function} thenRules
     * @param {Function} [elseRules]
     * @returns {this}
     */
    when(field, condition, thenRules, elseRules) {
        const value = this.#getNestedValue(this.#data, field);
        const conditionResult = condition(value, this.#data);

        if (conditionResult) {
            thenRules(this);
        } else if (elseRules) {
            elseRules(this);
        }

        return this;
    }

    /**
     * اعتبارسنجی وابسته به فیلد دیگر
     * @param {string} field
     * @param {string} dependsOn
     * @param {Function} validator
     * @param {Object} options
     * @returns {this}
     */
    dependsOn(field, dependsOn, validator, options = {}) {
        const dependsValue = this.#getNestedValue(this.#data, dependsOn);
        
        if (dependsValue !== undefined && dependsValue !== null) {
            const value = this.#getNestedValue(this.#data, field);
            const result = validator(value, dependsValue, this.#data);
            
            if (result === false || (result && result.success === false)) {
                this.#addError(
                    field,
                    options.message || result?.message || `فیلد ${field} وابسته به ${dependsOn} نامعتبر است`,
                    'dependsOn',
                    { dependsOn, dependsValue, details: result?.details }
                );
            }
        }

        return this;
    }

    /**
     * فیلد اختیاری (اگر وجود داشت اعتبارسنجی کن)
     * @param {string} field
     * @param {Function} rules
     * @returns {this}
     */
    optional(field, rules) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (value !== undefined && value !== null && value !== '') {
            rules(this);
        }

        return this;
    }

    // ================ قوانین مقادیر مجاز ================

    /**
     * بررسی مقادیر مجاز
     * @param {string} field
     * @param {any[]} allowedValues
     * @param {Object} options
     * @param {string} [options.message]
     * @returns {this}
     */
    enum(field, allowedValues, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (value === undefined || value === null) {
            return this;
        }

        if (!allowedValues.includes(value)) {
            this.#addError(
                field,
                options.message || `فیلد ${field} باید یکی از مقادیر ${allowedValues.join(', ')} باشد`,
                'enum',
                { allowed: allowedValues, actual: value }
            );
        }

        return this;
    }

    // ================ قوانین سفارشی ================

    /**
     * بررسی با تابع سفارشی
     * @param {string} field
     * @param {Function} validatorFn
     * @param {Object} options
     * @param {string} [options.message]
     * @returns {this}
     */
    custom(field, validatorFn, options = {}) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (value === undefined || value === null) {
            return this;
        }

        try {
            const result = validatorFn(value, this.#data);
            if (result === false || (result && result.success === false)) {
                this.#addError(
                    field,
                    options.message || result?.message || `اعتبارسنجی سفارشی برای فیلد ${field} ناموفق بود`,
                    'custom',
                    { details: result?.details }
                );
            } else if (result && result.value !== undefined) {
                // اجازه تبدیل مقدار
                this.#setNestedValue(field, result.value);
            }
        } catch (error) {
            this.#addError(
                field,
                options.message || `خطا در اعتبارسنجی سفارشی فیلد ${field}: ${error.message}`,
                'custom',
                { error: error.message }
            );
        }

        return this;
    }

    /**
     * تبدیل خودکار نوع
     * @param {string} field
     * @param {Function} transformer
     * @returns {this}
     */
    transform(field, transformer) {
        const value = this.#getNestedValue(this.#data, field);
        
        if (value !== undefined && value !== null) {
            try {
                const transformed = transformer(value);
                this.#setNestedValue(field, transformed);
            } catch (error) {
                this.#addError(
                    field,
                    `خطا در تبدیل فیلد ${field}: ${error.message}`,
                    'transform'
                );
            }
        }

        return this;
    }

    // ================ اعتبارسنجی بر اساس اسکیما ================

    /**
     * اعتبارسنجی بر اساس اسکیما
     * @param {ValidationSchema} schema
     * @returns {this}
     */
    schema(schema) {
        for (const [field, rule] of Object.entries(schema.fields)) {
            // Required
            if (rule.required) {
                this.required(field, { message: rule.message });
            }

            // Type
            if (rule.type) {
                this.type(field, rule.type, { message: rule.message });
            }

            // Min
            if (rule.min !== undefined) {
                this.min(field, rule.min, { message: rule.message });
            }

            // Max
            if (rule.max !== undefined) {
                this.max(field, rule.max, { message: rule.message });
            }

            // Pattern
            if (rule.pattern) {
                this.pattern(field, rule.pattern, { message: rule.message });
            }

            // Enum
            if (rule.enum) {
                this.enum(field, rule.enum, { message: rule.message });
            }

            // Custom
            if (rule.custom) {
                this.custom(field, rule.custom, { message: rule.message });
            }

            // Nested schema
            if (rule.schema) {
                this.object(field, rule.schema, { message: rule.message });
            }
        }

        return this;
    }

    // ================ متدهای کمکی ================

    /**
     * دریافت مقدار تو در تو با path (مثل 'user.address.city')
     * @param {Object} obj
     * @param {string} path
     * @returns {any}
     */
    #getNestedValue(obj, path) {
        if (!obj || typeof obj !== 'object') return undefined;
        
        return path.split('.').reduce((current, key) => {
            if (current && typeof current === 'object' && key in current) {
                return current[key];
            }
            return undefined;
        }, obj);
    }

    /**
     * تنظیم مقدار تو در تو
     * @param {string} path
     * @param {any} value
     */
    #setNestedValue(path, value) {
        const parts = path.split('.');
        const last = parts.pop();
        const target = parts.reduce((obj, key) => {
            if (!obj[key] || typeof obj[key] !== 'object') {
                obj[key] = {};
            }
            return obj[key];
        }, this.#data);
        
        if (last) {
            target[last] = value;
        }
    }

    /**
     * اضافه کردن خطا
     * @param {string} field
     * @param {string} message
     * @param {string} rule
     * @param {Object} [details]
     */
    #addError(field, message, rule, details) {
        this.#result.success = false;
        
        /** @type {ValidationError} */
        const error = {
            field,
            message,
            rule,
            timestamp: Date.now()
        };
        
        if (details) {
            error.details = details;
        }
        
        this.#errors.push(error);
    }

    /**
     * گروه‌بندی خطاها بر اساس فیلد
     * @returns {Object}
     */
    groupErrors() {
        return this.#errors.reduce((groups, error) => {
            if (!groups[error.field]) {
                groups[error.field] = [];
            }
            groups[error.field].push(error);
            return groups;
        }, {});
    }

    /**
     * بررسی معتبر بودن
     * @returns {boolean}
     */
    isValid() {
        return this.#result.success;
    }

    /**
     * دریافت نتیجه
     * @returns {ValidationResult<T>}
     */
    getResult() {
        if (this.#result.success) {
            return {
                success: true,
                value: this.#data,
                errors: []
            };
        }

        return {
            success: false,
            errors: this.#errors.map(e => e.message),
            details: this.#errors
        };
    }

    /**
     * دریافت اولین خطا
     * @returns {string|null}
     */
    getFirstError() {
        return this.#errors[0]?.message || null;
    }

    /**
     * دریافت تمام خطاها
     * @returns {ValidationError[]}
     */
    getErrors() {
        return this.#errors;
    }

    /**
     * دریافت داده اعتبارسنجی شده
     * @returns {T}
     */
    getValue() {
        return this.#data;
    }

    /**
     * پرتاب خطا در صورت نامعتبر بودن
     * @throws {ValidationError}
     */
    throwIfInvalid() {
        if (!this.#result.success) {
            throw new ValidationError(
                'Validation failed',
                this.#errors
            );
        }
    }
}

/**
 * خطای اعتبارسنجی سفارشی
 */
export class ValidationError extends Error {
    /** @param {string} message @param {ValidationError[]} errors */
    constructor(message, errors) {
        super(message);
        this.name = 'ValidationError';
        this.errors = errors;
        this.timestamp = Date.now();
    }
}

/**
 * توابع کمکی برای اعتبارسنجی سریع
 */
export const validators = {
    /**
     * اعتبارسنجی ایمیل
     * @param {string} email
     * @returns {boolean}
     */
    isEmail: (email) => {
        return Validator.of({ email })
            .type('email', 'email')
            .isValid();
    },

    /**
     * اعتبارسنجی UUID
     * @param {string} uuid
     * @returns {boolean}
     */
    isUUID: (uuid) => {
        return Validator.of({ uuid })
            .type('uuid', 'uuid')
            .isValid();
    },

    /**
     * اعتبارسنجی URL
     * @param {string} url
     * @returns {boolean}
     */
    isURL: (url) => {
        return Validator.of({ url })
            .type('url', 'url')
            .isValid();
    },

    /**
     * اعتبارسنجی محدوده عددی
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @returns {boolean}
     */
    isInRange: (value, min, max) => {
        return Validator.of({ value })
            .type('value', 'number')
            .min('value', min)
            .max('value', max)
            .isValid();
    },

    /**
     * اعتبارسنجی تاریخ معتبر
     * @param {Date|string} date
     * @returns {boolean}
     */
    isValidDate: (date) => {
        return Validator.of({ date })
            .type('date', 'date')
            .isValid();
    },

    /**
     * اعتبارسنجی تاریخ آینده
     * @param {Date|string} date
     * @returns {boolean}
     */
    isFuture: (date) => {
        return Validator.of({ date })
            .future('date')
            .isValid();
    },

    /**
     * اعتبارسنجی تاریخ گذشته
     * @param {Date|string} date
     * @returns {boolean}
     */
    isPast: (date) => {
        return Validator.of({ date })
            .past('date')
            .isValid();
    },

    /**
     * اعتبارسنجی آرایه
     * @param {Array} arr
     * @param {Function} itemValidator
     * @returns {boolean}
     */
    isValidArray: (arr, itemValidator) => {
        return Validator.of({ arr })
            .arrayOf('arr', itemValidator)
            .isValid();
    },

    /**
     * اعتبارسنجی با اسکیما
     * @template T
     * @param {any} data
     * @param {ValidationSchema} schema
     * @returns {ValidationResult<T>}
     */
    validate: (data, schema) => {
        return Validator.of(data).schema(schema).getResult();
    },

    /**
     * ایجاد نمونه جدید Validator
     * @param {any} data
     * @returns {Validator}
     */
    of: (data) => Validator.of(data)
};

// ============================================
// مثال استفاده:
// ============================================
/*
import { Validator, validators } from './core/utils/validator.js';

// اعتبارسنجی ساده
const result = Validator.of({ email: 'test@example.com' })
    .required('email')
    .email('email')
    .getResult();

// اعتبارسنجی پیشرفته با شرط
const userData = {
    name: 'علی',
    age: 25,
    role: 'admin',
    tags: ['premium', 'active'],
    settings: { theme: 'dark' }
};

const validation = Validator.of(userData)
    .required('name')
    .type('name', 'string')
    .min('name', 2)
    .max('name', 50)
    .required('age')
    .type('age', 'number')
    .range('age', 18, 120)
    .enum('role', ['admin', 'user', 'guest'])
    .arrayOf('tags', tag => typeof tag === 'string' && tag.length > 0)
    .unique('tags')
    .object('settings', {
        fields: {
            theme: { type: 'string', enum: ['light', 'dark'] }
        }
    })
    .when('role', 
        role => role === 'admin',
        v => v.required('settings')
    )
    .getResult();

// استفاده از توابع کمکی
if (validators.isEmail('test@example.com')) {
    console.log('ایمیل معتبر است');
}

const schema = {
    fields: {
        id: { type: 'uuid', required: true },
        name: { type: 'string', required: true, min: 2, max: 50 }
    }
};

const result2 = validators.validate(userData, schema);
*/
