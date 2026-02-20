/**
 * @fileoverview Data Transfer Object و اعتبارسنجی برای چالش‌ها
 * @author Farsinglish Team
 * @version 2.0.0
 * 
 * این ماژول مسئولیت اعتبارسنجی و تبدیل داده‌های چالش را بر عهده دارد
 * و به عنوان لایه محافظ بین ورودی/خروجی و منطق کسب‌وکار عمل می‌کند.
 */

import { Validator } from '../../core/utils/validator.js';
import { Result } from '../../core/utils/result.js';

/**
 * @typedef {Object} ChallengeData
 * @property {string} id - شناسه یکتای چالش
 * @property {string} userId - شناسه کاربر
 * @property {string} title - عنوان چالش
 * @property {string} description - توضیحات چالش
 * @property {('daily'|'weekly'|'special')} type - نوع چالش
 * @property {number} goal - هدف (تعداد مورد نیاز)
 * @property {number} progress - پیشرفت فعلی
 * @property {number} points - امتیاز چالش
 * @property {Date} startDate - تاریخ شروع
 * @property {Date} endDate - تاریخ پایان
 * @property {boolean} isActive - فعال بودن
 * @property {boolean} isCompleted - تکمیل شده
 * @property {Date} createdAt - تاریخ ایجاد
 * @property {Date} updatedAt - تاریخ به‌روزرسانی
 * @property {Date} [completedAt] - تاریخ تکمیل (اختیاری)
 */

/**
 * @typedef {Object} CreateChallengeInput
 * @property {string} userId - شناسه کاربر
 * @property {string} title - عنوان چالش
 * @property {string} description - توضیحات
 * @property {('daily'|'weekly'|'special')} type - نوع چالش
 * @property {number} goal - هدف
 * @property {number} points - امتیاز
 * @property {Date} startDate - تاریخ شروع
 * @property {Date} endDate - تاریخ پایان
 */

/**
 * @typedef {Object} UpdateProgressInput
 * @property {string} challengeId - شناسه چالش
 * @property {number} progress - پیشرفت جدید
 */

/**
 * کلاس DTO چالش با اعتبارسنجی پیشرفته
 * تمام متدها stateless و pure هستند
 */
export class ChallengeDTO {
    
    // ================ ثابت‌های اعتبارسنجی ================

    /** @type {Object} قوانین اعتبارسنجی */
    static VALIDATION_RULES = {
        TITLE: {
            MIN_LENGTH: 3,
            MAX_LENGTH: 100,
            PATTERN: /^[a-zA-Z0-9\u0600-\u06FF\s\-_]+$/ // حروف فارسی، انگلیسی، اعداد و خط تیره
        },
        DESCRIPTION: {
            MAX_LENGTH: 500
        },
        PROGRESS: {
            MIN: 0,
            MAX: 10000 // حداکثر هدف منطقی
        },
        POINTS: {
            MIN: 1,
            MAX: 1000
        },
        GOAL: {
            MIN: 1,
            MAX: 1000
        }
    };

    /** @type {string[]} انواع مجاز چالش */
    static VALID_TYPES = ['daily', 'weekly', 'special'];

    // ================ متدهای اعتبارسنجی خصوصی ================

    /**
     * اعتبارسنجی عنوان چالش
     * @param {unknown} title
     * @returns {Result}
     */
    static #validateTitle(title) {
        // بررسی وجود
        if (!title) {
            return Result.fail('عنوان چالش الزامی است');
        }

        // بررسی نوع
        if (typeof title !== 'string') {
            return Result.fail('عنوان باید متن باشد');
        }

        // بررسی طول
        if (title.length < this.VALIDATION_RULES.TITLE.MIN_LENGTH) {
            return Result.fail(`عنوان باید حداقل ${this.VALIDATION_RULES.TITLE.MIN_LENGTH} کاراکتر باشد`);
        }

        if (title.length > this.VALIDATION_RULES.TITLE.MAX_LENGTH) {
            return Result.fail(`عنوان باید حداکثر ${this.VALIDATION_RULES.TITLE.MAX_LENGTH} کاراکتر باشد`);
        }

        // بررسی الگو (کاراکترهای مجاز)
        if (!this.VALIDATION_RULES.TITLE.PATTERN.test(title)) {
            return Result.fail('عنوان فقط می‌تواند شامل حروف، اعداد، فاصله و خط تیره باشد');
        }

        return Result.ok(title.trim());
    }

    /**
     * اعتبارسنجی توضیحات چالش
     * @param {unknown} description
     * @returns {Result}
     */
    static #validateDescription(description) {
        // توضیحات می‌تواند خالی باشد
        if (!description) {
            return Result.ok('');
        }

        if (typeof description !== 'string') {
            return Result.fail('توضیحات باید متن باشد');
        }

        if (description.length > this.VALIDATION_RULES.DESCRIPTION.MAX_LENGTH) {
            return Result.fail(`توضیحات باید حداکثر ${this.VALIDATION_RULES.DESCRIPTION.MAX_LENGTH} کاراکتر باشد`);
        }

        return Result.ok(description.trim());
    }

    /**
     * اعتبارسنجی نوع چالش
     * @param {unknown} type
     * @returns {Result}
     */
    static #validateType(type) {
        if (!type) {
            return Result.fail('نوع چالش الزامی است');
        }

        if (typeof type !== 'string') {
            return Result.fail('نوع باید متن باشد');
        }

        if (!this.VALID_TYPES.includes(type)) {
            return Result.fail(`نوع چالش باید یکی از مقادیر ${this.VALID_TYPES.join('، ')} باشد`);
        }

        return Result.ok(type);
    }

    /**
     * اعتبارسنجی عددی با محدوده
     * @param {unknown} value - مقدار
     * @param {string} fieldName - نام فیلد
     * @param {number} min - حداقل
     * @param {number} max - حداکثر
     * @returns {Result}
     */
    static #validateNumber(value, fieldName, min, max) {
        if (value === undefined || value === null) {
            return Result.fail(`${fieldName} الزامی است`);
        }

        if (typeof value !== 'number' || isNaN(value)) {
            return Result.fail(`${fieldName} باید عدد باشد`);
        }

        if (value < min) {
            return Result.fail(`${fieldName} نمی‌تواند کمتر از ${min} باشد`);
        }

        if (value > max) {
            return Result.fail(`${fieldName} نمی‌تواند بیشتر از ${max} باشد`);
        }

        // اطمینان از صحت اعشار (برای اعداد صحیح)
        if (Number.isInteger(min) && Number.isInteger(max) && !Number.isInteger(value)) {
            return Result.fail(`${fieldName} باید عدد صحیح باشد`);
        }

        return Result.ok(value);
    }

    /**
     * اعتبارسنجی تاریخ
     * @param {unknown} date
     * @param {string} fieldName
     * @param {Object} options
     * @param {boolean} options.required - الزامی بودن
     * @param {Date} [options.minDate] - حداقل تاریخ
     * @param {Date} [options.maxDate] - حداکثر تاریخ
     * @returns {Result}
     */
    static #validateDate(date, fieldName, options = {}) {
        const { required = true, minDate, maxDate } = options;

        if (!date) {
            if (required) {
                return Result.fail(`${fieldName} الزامی است`);
            }
            return Result.ok(null);
        }

        let dateObj;
        
        // تبدیل به Date اگر string است
        if (typeof date === 'string') {
            dateObj = new Date(date);
            if (isNaN(dateObj.getTime())) {
                return Result.fail(`${fieldName} معتبر نیست`);
            }
        } else if (date instanceof Date) {
            dateObj = date;
            if (isNaN(dateObj.getTime())) {
                return Result.fail(`${fieldName} معتبر نیست`);
            }
        } else {
            return Result.fail(`${fieldName} باید تاریخ باشد`);
        }

        // بررسی حداقل تاریخ
        if (minDate && dateObj < minDate) {
            return Result.fail(`${fieldName} نمی‌تواند قبل از ${minDate.toISOString()} باشد`);
        }

        // بررسی حداکثر تاریخ
        if (maxDate && dateObj > maxDate) {
            return Result.fail(`${fieldName} نمی‌تواند بعد از ${maxDate.toISOString()} باشد`);
        }

        return Result.ok(dateObj);
    }

    // ================ متدهای اصلی DTO ================

    /**
     * اعتبارسنجی و تبدیل ورودی ایجاد چالش
     * @param {unknown} input
     * @returns {Result<CreateChallengeInput>}
     */
    static validateCreateInput(input) {
        // 1. بررسی وجود ورودی
        if (!input || typeof input !== 'object') {
            return Result.fail('ورودی ایجاد چالش معتبر نیست');
        }

        // 2. اعتبارسنجی فیلدها
        const validations = [
            { field: 'userId', fn: (v) => Validator.validateRequired(v, 'شناسه کاربر') },
            { field: 'title', fn: (v) => this.#validateTitle(v) },
            { field: 'description', fn: (v) => this.#validateDescription(v) },
            { field: 'type', fn: (v) => this.#validateType(v) },
            { field: 'goal', fn: (v) => this.#validateNumber(v, 'هدف', this.VALIDATION_RULES.GOAL.MIN, this.VALIDATION_RULES.GOAL.MAX) },
            { field: 'points', fn: (v) => this.#validateNumber(v, 'امتیاز', this.VALIDATION_RULES.POINTS.MIN, this.VALIDATION_RULES.POINTS.MAX) },
            { field: 'startDate', fn: (v) => this.#validateDate(v, 'تاریخ شروع', { required: true }) },
            { field: 'endDate', fn: (v) => this.#validateDate(v, 'تاریخ پایان', { required: true }) }
        ];

        const validatedData = {};
        
        for (const { field, fn } of validations) {
            const result = fn(input[field]);
            if (!result.success) {
                return Result.fail(result.error);
            }
            validatedData[field] = result.data;
        }

        // 3. اعتبارسنجی رابطه‌ای (تاریخ پایان بعد از شروع)
        if (validatedData.endDate < validatedData.startDate) {
            return Result.fail('تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد');
        }

        // 4. **پیشنهاد: اعتبارسنجی تاریخ شروع در آینده**
        const today = new Date();
        today.setHours(0, 0, 0, 0); // تنظیم به ابتدای روز

        if (validatedData.startDate < today) {
            return Result.fail('تاریخ شروع نمی‌تواند در گذشته باشد');
        }

        // 5. اعتبارسنجی منطق کسب‌وکار (مدت زمان چالش)
        const duration = validatedData.endDate - validatedData.startDate;
        const maxDuration = 30 * 24 * 60 * 60 * 1000; // 30 روز

        if (duration > maxDuration) {
            return Result.fail('مدت زمان چالش نمی‌تواند بیشتر از ۳۰ روز باشد');
        }

        return Result.ok(validatedData);
    }

    /**
     * اعتبارسنجی و تبدیل ورودی به‌روزرسانی پیشرفت
     * @param {unknown} input
     * @returns {Result<UpdateProgressInput>}
     */
    static validateUpdateProgress(input) {
        if (!input || typeof input !== 'object') {
            return Result.fail('ورودی به‌روزرسانی معتبر نیست');
        }

        // اعتبارسنجی شناسه چالش
        const challengeIdResult = Validator.validateRequired(input.challengeId, 'شناسه چالش');
        if (!challengeIdResult.success) {
            return challengeIdResult;
        }

        // اعتبارسنجی پیشرفت
        const progressResult = this.#validateNumber(
            input.progress, 
            'پیشرفت', 
            this.VALIDATION_RULES.PROGRESS.MIN, 
            this.VALIDATION_RULES.PROGRESS.MAX
        );

        if (!progressResult.success) {
            return progressResult;
        }

        return Result.ok({
            challengeId: challengeIdResult.data,
            progress: progressResult.data
        });
    }

    /**
     * ایجاد یک نمونه چالش جدید با داده‌های پیش‌فرض
     * @param {CreateChallengeInput} validatedInput
     * @returns {ChallengeData}
     */
    static createNewChallenge(validatedInput) {
        const now = new Date();

        return {
            id: crypto.randomUUID(),
            userId: validatedInput.userId,
            title: validatedInput.title,
            description: validatedInput.description || '',
            type: validatedInput.type,
            goal: validatedInput.goal,
            progress: 0,
            points: validatedInput.points,
            startDate: validatedInput.startDate,
            endDate: validatedInput.endDate,
            isActive: true,
            isCompleted: false,
            createdAt: now,
            updatedAt: now,
            completedAt: null
        };
    }

    /**
     * تبدیل به خروجی امن برای نمایش به کاربر
     * @param {ChallengeData} challenge
     * @returns {Object}
     */
    static toSafeOutput(challenge) {
        // فقط فیلدهای ضروری و امن را برمی‌گرداند
        return {
            id: challenge.id,
            title: challenge.title,
            description: challenge.description,
            type: challenge.type,
            progress: challenge.progress,
            goal: challenge.goal,
            points: challenge.points,
            isCompleted: challenge.isCompleted,
            endDate: challenge.endDate,
            // محاسبه درصد پیشرفت
            progressPercent: Math.min(100, Math.round((challenge.progress / challenge.goal) * 100))
        };
    }

    /**
     * **پیشنهاد: تبدیل به JSON برای سازگاری با JSON.stringify**
     * @param {ChallengeData} challenge
     * @returns {Object}
     */
    static toJSON(challenge) {
        return this.toStorage(challenge);
    }

    /**
     * بررسی تکمیل شدن چالش
     * @param {ChallengeData} challenge
     * @returns {boolean}
     */
    static isCompleted(challenge) {
        return challenge.isCompleted || challenge.progress >= challenge.goal;
    }

    /**
     * بررسی منقضی شدن چالش
     * @param {ChallengeData} challenge
     * @returns {boolean}
     */
    static isExpired(challenge) {
        const now = new Date();
        return !challenge.isCompleted && challenge.endDate < now;
    }

    /**
     * محاسبه امتیاز قابل دریافت
     * @param {ChallengeData} challenge
     * @returns {number}
     */
    static calculateEarnedPoints(challenge) {
        if (!this.isCompleted(challenge)) {
            return 0;
        }

        // امتیاز کامل
        return challenge.points;
    }

    /**
     * تبدیل به فرمت ذخیره‌سازی در دیتابیس
     * @param {ChallengeData} challenge
     * @returns {Object}
     */
    static toStorage(challenge) {
        // تبدیل تاریخ‌ها به ISO string برای ذخیره‌سازی
        return {
            ...challenge,
            startDate: challenge.startDate.toISOString(),
            endDate: challenge.endDate.toISOString(),
            createdAt: challenge.createdAt.toISOString(),
            updatedAt: challenge.updatedAt.toISOString(),
            completedAt: challenge.completedAt?.toISOString() || null
        };
    }

    /**
     * بازیابی از فرمت ذخیره‌سازی
     * @param {Object} storage
     * @returns {ChallengeData}
     */
    static fromStorage(storage) {
        // تبدیل ISO string به Date
        return {
            ...storage,
            startDate: new Date(storage.startDate),
            endDate: new Date(storage.endDate),
            createdAt: new Date(storage.createdAt),
            updatedAt: new Date(storage.updatedAt),
            completedAt: storage.completedAt ? new Date(storage.completedAt) : null
        };
    }
}

// ================ تابع کمکی برای استفاده آسان ================

/**
 * تابع کمکی برای اعتبارسنجی سریع
 * @param {unknown} input
 * @returns {Result}
 */
export const validateChallenge = (input) => {
    return ChallengeDTO.validateCreateInput(input);
};

export default ChallengeDTO;
