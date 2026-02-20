/**
 * @fileoverview پیاده‌سازی الگوی Result برای مدیریت یکپارچه خطاها
 * @author Farsinglish Team
 * @version 2.0.0
 * 
 * @description
 * این ماژول یک پیاده‌سازی حرفه‌ای از الگوی Result (یا Either) ارائه می‌دهد
 * که جایگزین مناسبی برای try/catch سنتی است و امکان زنجیره‌سازی عملیات،
 * ترکیب نتایج، و مدیریت declarative خطاها را فراهم می‌کند.
 * 
 * @example
 * // موفقیت
 * const success = Result.ok({ id: 1, name: 'test' });
 * 
 * // خطا
 * const failure = Result.fail('خطا در دریافت داده', 'NOT_FOUND');
 * 
 * // زنجیره‌سازی
 * Result.ok(5)
 *   .map(x => x * 2)
 *   .flatMap(x => Result.ok(x + 1))
 *   .match({
 *     ok: value => console.log(value),
 *     fail: error => console.error(error)
 *   });
 */

/**
 * @template T
 * @typedef {Object} SuccessResult
 * @property {true} success
 * @property {T} data
 * @property {null} error
 * @property {null} errorCode
 * @property {number} timestamp
 */

/**
 * @template T
 * @typedef {Object} FailureResult
 * @property {false} success
 * @property {null} data
 * @property {string} error
 * @property {string} [errorCode]
 * @property {*} [details]
 * @property {number} timestamp
 */

/**
 * @template T
 * @typedef {SuccessResult<T> | FailureResult} Result
 */

/**
 * @template T
 * @typedef {Object} MatchPatterns
 * @property {function(T): *} ok
 * @property {function(string, string?, *?): *} fail
 */

/**
 * کلاس Result با متدهای زنجیره‌پذیر
 * @template T
 */
export class Result {
    /** @type {boolean} */
    #success;

    /** @type {T | null} */
    #data;

    /** @type {string | null} */
    #error;

    /** @type {string | null} */
    #errorCode;

    /** @type {*} */
    #details;

    /** @type {number} */
    #timestamp;

    /**
     * @private
     * @param {boolean} success
     * @param {T | null} data
     * @param {string | null} error
     * @param {string | null} errorCode
     * @param {*} details
     */
    constructor(success, data, error, errorCode = null, details = null) {
        this.#success = success;
        this.#data = data;
        this.#error = error;
        this.#errorCode = errorCode;
        this.#details = details;
        this.#timestamp = Date.now();

        // ایمن‌سازی در برابر تغییر
        Object.freeze(this);
    }

    /**
     * ایجاد نتیجه موفق
     * @template U
     * @param {U} data - داده موفقیت
     * @returns {Result<U>} نتیجه موفق
     */
    static ok(data) {
        return new Result(true, data, null, null, null);
    }

    /**
     * ایجاد نتیجه ناموفق
     * @param {string} error - پیام خطا
     * @param {string} [errorCode] - کد خطا
     * @param {*} [details] - جزئیات خطا
     * @returns {Result<never>} نتیجه ناموفق
     */
    static fail(error, errorCode = null, details = null) {
        return new Result(false, null, error, errorCode, details);
    }

    /**
     * اجرای تابع و برگرداندن Result
     * @template U
     * @param {function(): U} fn - تابعی که اجرا می‌شود
     * @param {string} [errorMessage] - پیام خطای پیش‌فرض
     * @returns {Result<U>} نتیجه اجرای تابع
     */
    static try(fn, errorMessage = 'خطای ناشناخته') {
        try {
            const result = fn();
            return Result.ok(result);
        } catch (error) {
            return Result.fail(
                errorMessage,
                'EXECUTION_ERROR',
                { originalError: error.message, stack: error.stack }
            );
        }
    }

    /**
     * اجرای تابع ناهمگام و برگرداندن Result
     * @template U
     * @param {Promise<U> | Promise<U>} promise - پرامیس
     * @param {string} [errorMessage] - پیام خطای پیش‌فرض
     * @returns {Promise<Result<U>>} نتیجه اجرای پرامیس
     */
    static async tryAsync(promise, errorMessage = 'خطای ناشناخته') {
        try {
            const data = await promise;
            return Result.ok(data);
        } catch (error) {
            return Result.fail(
                errorMessage,
                'ASYNC_ERROR',
                { originalError: error.message, stack: error.stack }
            );
        }
    }

    /**
     * ترکیب چند Result با هم (همه باید موفق باشند)
     * @template U
     * @param {Array<Result<U>>} results - آرایه‌ای از Resultها
     * @returns {Result<Array<U>>} نتیجه ترکیبی
     */
    static combine(results) {
        const data = [];
        
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            
            if (!result.isOk()) {
                return Result.fail(
                    `ترکیب نتایج شکست خورد در ایندکس ${i}`,
                    'COMBINE_FAILED',
                    { index: i, error: result.getError() }
                );
            }
            
            data.push(result.getValue());
        }
        
        return Result.ok(data);
    }

    /**
     * بررسی موفقیت‌آمیز بودن نتیجه
     * @returns {boolean} true اگر موفق باشد
     */
    isOk() {
        return this.#success;
    }

    /**
     * بررسی ناموفق بودن نتیجه
     * @returns {boolean} true اگر ناموفق باشد
     */
    isFail() {
        return !this.#success;
    }

    /**
     * دریافت داده نتیجه (پرتاب خطا اگر ناموفق باشد)
     * @returns {T} داده
     * @throws {Error} اگر نتیجه ناموفق باشد
     */
    getValue() {
        if (this.isFail()) {
            throw new Error(`تلاش برای دریافت داده از نتیجه ناموفق: ${this.#error}`);
        }
        return this.#data;
    }

    /**
     * دریافت داده نتیجه با مقدار پیش‌فرض
     * @param {T} defaultValue - مقدار پیش‌فرض در صورت خطا
     * @returns {T} داده یا مقدار پیش‌فرض
     */
    getValueOrDefault(defaultValue) {
        return this.isOk() ? this.#data : defaultValue;
    }

    /**
     * دریافت خطا (پرتاب خطا اگر موفق باشد)
     * @returns {string} پیام خطا
     * @throws {Error} اگر نتیجه موفق باشد
     */
    getError() {
        if (this.isOk()) {
            throw new Error('تلاش برای دریافت خطا از نتیجه موفق');
        }
        return this.#error;
    }

    /**
     * دریافت کد خطا
     * @returns {string | null} کد خطا
     */
    getErrorCode() {
        return this.#errorCode;
    }

    /**
     * دریافت جزئیات خطا
     * @returns {*} جزئیات خطا
     */
    getDetails() {
        return this.#details;
    }

    /**
     * دریافت timestamp ایجاد نتیجه
     * @returns {number} timestamp
     */
    getTimestamp() {
        return this.#timestamp;
    }

    /**
     * اعمال تابع روی داده موفق
     * @template U
     * @param {function(T): U} fn - تابع تبدیل
     * @returns {Result<U>} نتیجه جدید
     */
    map(fn) {
        if (this.isFail()) {
            return Result.fail(this.#error, this.#errorCode, this.#details);
        }
        
        try {
            const newData = fn(this.#data);
            return Result.ok(newData);
        } catch (error) {
            return Result.fail(
                'خطا در تابع map',
                'MAP_ERROR',
                { originalError: error.message, stack: error.stack }
            );
        }
    }

    /**
     * اعمال تابع Result-برگردان روی داده موفق
     * @template U
     * @param {function(T): Result<U>} fn - تابعی که Result برمی‌گرداند
     * @returns {Result<U>} نتیجه تابع
     */
    flatMap(fn) {
        if (this.isFail()) {
            return Result.fail(this.#error, this.#errorCode, this.#details);
        }
        
        try {
            return fn(this.#data);
        } catch (error) {
            return Result.fail(
                'خطا در تابع flatMap',
                'FLAT_MAP_ERROR',
                { originalError: error.message, stack: error.stack }
            );
        }
    }

    /**
     * اعمال تابع روی خطا
     * @param {function(string, string?, *?): string} fn - تابع تبدیل خطا
     * @returns {Result<T>} نتیجه جدید
     */
    mapError(fn) {
        if (this.isOk()) {
            return Result.ok(this.#data);
        }
        
        try {
            const newError = fn(this.#error, this.#errorCode, this.#details);
            return Result.fail(newError, this.#errorCode, this.#details);
        } catch (error) {
            return Result.fail(
                'خطا در تابع mapError',
                'MAP_ERROR_ERROR',
                { originalError: error.message }
            );
        }
    }

    /**
     * اجرای یکی از توابع بر اساس وضعیت نتیجه
     * @template U
     * @param {MatchPatterns<T>} patterns - الگوهای matching
     * @returns {U} نتیجه تابع اجرا شده
     */
    match(patterns) {
        if (this.isOk()) {
            return patterns.ok(this.#data);
        } else {
            return patterns.fail(this.#error, this.#errorCode, this.#details);
        }
    }

    /**
     * اجرای تابع در صورت موفقیت
     * @param {function(T): void} fn - تابع اجرا شده در صورت موفقیت
     * @returns {Result<T>} خود Result برای زنجیره‌سازی
     */
    ifOk(fn) {
        if (this.isOk()) {
            try {
                fn(this.#data);
            } catch (error) {
                console.error('خطا در ifOk:', error);
            }
        }
        return this;
    }

    /**
     * اجرای تابع در صورت خطا
     * @param {function(string, string?, *?): void} fn - تابع اجرا شده در صورت خطا
     * @returns {Result<T>} خود Result برای زنجیره‌سازی
     */
    ifFail(fn) {
        if (this.isFail()) {
            try {
                fn(this.#error, this.#errorCode, this.#details);
            } catch (error) {
                console.error('خطا در ifFail:', error);
            }
        }
        return this;
    }

    /**
     * تبدیل Result به پرامیس
     * @returns {Promise<T>} پرامیس داده در صورت موفقیت، خطا در صورت شکست
     */
    toPromise() {
        return new Promise((resolve, reject) => {
            if (this.isOk()) {
                resolve(this.#data);
            } else {
                const error = new Error(this.#error);
                error.code = this.#errorCode;
                error.details = this.#details;
                reject(error);
            }
        });
    }

    /**
     * تبدیل Result به آبجکت ساده
     * @returns {SuccessResult<T> | FailureResult} آبجکت ساده
     */
    toObject() {
        if (this.isOk()) {
            return {
                success: true,
                data: this.#data,
                error: null,
                errorCode: null,
                timestamp: this.#timestamp
            };
        } else {
            return {
                success: false,
                data: null,
                error: this.#error,
                errorCode: this.#errorCode,
                details: this.#details,
                timestamp: this.#timestamp
            };
        }
    }

    /**
     * تبدیل به JSON
     * @returns {Object} JSON object
     */
    toJSON() {
        return this.toObject();
    }

    /**
     * نمایش رشته‌ای Result
     * @returns {string} نمایش رشته‌ای
     */
    toString() {
        if (this.isOk()) {
            return `Result.ok(${JSON.stringify(this.#data)})`;
        } else {
            return `Result.fail("${this.#error}"${this.#errorCode ? `, "${this.#errorCode}"` : ''})`;
        }
    }

    /**
     * بررسی برابری دو Result
     * @param {Result<T>} other - Result دیگر
     * @returns {boolean} true اگر برابر باشند
     */
    equals(other) {
        if (!(other instanceof Result)) {
            return false;
        }
        
        if (this.isOk() !== other.isOk()) {
            return false;
        }
        
        if (this.isOk()) {
            return this.#data === other.#data;
        } else {
            return this.#error === other.#error && 
                   this.#errorCode === other.#errorCode;
        }
    }

    /**
     * دریافت مقدار یا پرتاب خطای ذخیره شده
     * @returns {T} داده
     * @throws {Error} خطای ذخیره شده
     */
    unwrap() {
        if (this.isFail()) {
            const error = new Error(this.#error);
            error.code = this.#errorCode;
            error.details = this.#details;
            throw error;
        }
        return this.#data;
    }

    /**
     * دریافت مقدار یا مقدار پیش‌فرض
     * @param {T} defaultValue - مقدار پیش‌فرض
     * @returns {T} داده یا مقدار پیش‌فرض
     */
    unwrapOr(defaultValue) {
        return this.isOk() ? this.#data : defaultValue;
    }

    /**
     * دریافت مقدار یا اجرای تابع برای تولید مقدار پیش‌فرض
     * @param {function(): T} fn - تابع تولید مقدار پیش‌فرض
     * @returns {T} داده یا نتیجه تابع
     */
    unwrapOrElse(fn) {
        return this.isOk() ? this.#data : fn();
    }
}

/**
 * @template T
 * @typedef {Result<T>} ResultType
 */

// Export default برای سهولت استفاده
export default Result;

// Export توابع کمکی
export const ok = Result.ok;
export const fail = Result.fail;
export const try_ = Result.try;
export const tryAsync = Result.tryAsync;
export const combine = Result.combine;
