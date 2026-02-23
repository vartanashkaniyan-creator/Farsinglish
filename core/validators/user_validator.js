/**
 * @typedef {Object} ValidationResult
 * @property {boolean} is_valid
 * @property {Object.<string, string[]>} field_errors
 * @property {string[]} global_errors
 */

/**
 * @callback TranslateFn
 * @param {string} msg
 * @returns {string}
 */

/**
 * @abstract
 */
class BaseValidatorRule {
    #logger;

    /**
     * @param {Object} options
     * @param {TranslateFn} [options.t] - تابع ترجمه
     * @param {Object} [options.logger=console] - Logger تزریقی
     */
    constructor({ t = (msg) => msg, logger = console } = {}) {
        if (new.target === BaseValidatorRule) {
            throw new Error('BaseValidatorRule is abstract');
        }
        this.t = t;
        this.#logger = logger;
    }

    /**
     * نام فیلد را از نام کلاس استخراج می‌کند
     * @returns {string}
     */
    get_field_name() {
        return this.constructor.name.replace(/ValidatorRule$/, '').toLowerCase();
    }

    /**
     * @abstract
     * @param {Object} data
     * @param {Object} [context]
     * @returns {ValidationResult}
     */
    validate(data, context) {
        throw new Error('validate() must be implemented by subclass');
    }

    /**
     * Logger getter
     * @returns {Object}
     */
    get logger() {
        return this.#logger;
    }
}

/**
 * اعتبارسنجی ایمیل
 */
class EmailValidatorRule extends BaseValidatorRule {
    #email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    /**
     * @param {Object} options
     * @param {TranslateFn} [options.t]
     * @param {Object} [options.logger]
     */
    constructor(options = {}) {
        super(options);
    }

    /**
     * @param {Object} data
     * @param {Object} [context]
     * @returns {ValidationResult}
     */
    validate(data, context) {
        const result = { is_valid: true, field_errors: {}, global_errors: [] };
        const field = this.get_field_name();

        if (!data?.email) {
            result.is_valid = false;
            result.field_errors[field] = [this.t('email is required')];
        } else if (!this.#email_regex.test(data.email)) {
            result.is_valid = false;
            result.field_errors[field] = [this.t('invalid email format')];
        }

        return result;
    }

    /**
     * @deprecated استفاده از quick_validate توصیه نمی‌شود
     */
    quick_validate(data, context) {
        return this.validate(data, context);
    }
}

/**
 * اعتبارسنجی نام کاربری
 */
class UsernameValidatorRule extends BaseValidatorRule {
    #min_length = 3;
    #max_length = 30;
    #pattern = /^[a-zA-Z0-9_]+$/;

    validate(data, context) {
        const result = { is_valid: true, field_errors: {}, global_errors: [] };
        const field = this.get_field_name();

        if (!data?.username) {
            result.is_valid = false;
            result.field_errors[field] = [this.t('username is required')];
        } else if (data.username.length < this.#min_length) {
            result.is_valid = false;
            result.field_errors[field] = [this.t(`minimum ${this.#min_length} characters required`)];

        } else if (data.username.length > this.#max_length) {
            result.is_valid = false;
            result.field_errors[field] = [this.t(`maximum ${this.#max_length} characters allowed`)];

        } else if (!this.#pattern.test(data.username)) {
            result.is_valid = false;
            result.field_errors[field] = [this.t('invalid username format')];
        }

        return result;
    }
}

/**
 * اعتبارسنجی سطح کاربر
 */
class LevelValidatorRule extends BaseValidatorRule {
    #min_level;
    #max_level;

    /**
     * @param {Object} options
     * @param {number} [options.min_level=1]
     * @param {number} [options.max_level=10]
     * @param {TranslateFn} [options.t]
     * @param {Object} [options.logger]
     */
    constructor({ min_level = 1, max_level = 10, t, logger } = {}) {
        super({ t, logger });
        this.#min_level = min_level;
        this.#max_level = max_level;
    }

    validate(data, context) {
        const result = { is_valid: true, field_errors: {}, global_errors: [] };
        const field = this.get_field_name();

        if (data?.level == null) {
            result.is_valid = false;
            result.field_errors[field] = [this.t('level is required')];
        } else if (!Number.isInteger(data.level) || data.level < this.#min_level || data.level > this.#max_level) {
            result.is_valid = false;
            result.field_errors[field] = [this.t(`level must be between ${this.#min_level} and ${this.#max_level}`)];
        }

        return result;
    }
}

/**
 * Validator نهایی کاربر
 */
class UserValidator {
    #rules = new Map();
    #logger;

    /**
     * @param {Object} options
     * @param {TranslateFn} [options.t]
     * @param {Object} [options.logger=console]
     */
    constructor({ t = (msg) => msg, logger = console } = {}) {
        this.#logger = logger;

        // Rules پیش‌فرض
        this.add_rule(new EmailValidatorRule({ t, logger }));
        this.add_rule(new UsernameValidatorRule({ t, logger }));
        this.add_rule(new LevelValidatorRule({ t, logger }));
    }

    /**
     * اضافه کردن Rule
     * @param {BaseValidatorRule} rule
     */
    add_rule(rule) {
        const field = rule.get_field_name();
        this.#rules.set(field, rule);
    }

    /**
     * حذف Rule
     * @param {string} field_name
     */
    remove_rule(field_name) {
        this.#rules.delete(field_name.toLowerCase());
    }

    /**
     * اعتبارسنجی داده‌ها
     * @param {Object} data
     * @param {Object} [context]
     * @returns {ValidationResult}
     */
    validate(data, context) {
        const result = { is_valid: true, field_errors: {}, global_errors: [] };

        for (const [field, rule] of this.#rules.entries()) {
            try {
                const rule_result = rule.validate(data, context);

                // Merge خطاها: append اگر چند خطا برای یک فیلد باشد
                if (rule_result.field_errors[field]) {
                    if (!result.field_errors[field]) result.field_errors[field] = [];
                    result.field_errors[field].push(...rule_result.field_errors[field]);
                }

                if (rule_result.global_errors?.length) {
                    result.global_errors.push(...rule_result.global_errors);
                }

                if (!rule_result.is_valid) {
                    result.is_valid = false;
                }

            } catch (err) {
                this.#logger.error(`[UserValidator] Error in rule ${field}:`, err);
                result.is_valid = false;
                result.global_errors.push(`[${field}] internal validation error`);
            }
        }

        return result;
    }
}

export {
    BaseValidatorRule,
    EmailValidatorRule,
    UsernameValidatorRule,
    LevelValidatorRule,
    UserValidator
};
