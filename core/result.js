/**
 * @file core/result.js
 * @description Operation Result Contract
 * @version 1.0.0
 */

/**
 * @template T
 */
class Result {
    constructor(ok, data = null, error = null) {
        this.ok = ok;
        this.data = data;
        this.error = error;

        Object.freeze(this);
    }

    /** @returns {boolean} */
    is_ok() {
        return this.ok === true;
    }

    /** @returns {boolean} */
    is_fail() {
        return this.ok === false;
    }
}

/**
 * Success result
 * @template T
 * @param {T} data
 * @returns {Result<T>}
 */
function ok(data) {
    return new Result(true, data, null);
}

/**
 * Failed result
 * @param {string} error_code
 * @param {any} [error_data]
 * @returns {Result<null>}
 */
function fail(error_code, error_data = null) {
    return new Result(false, null, {
        code: error_code,
        data: error_data
    });
}

export { Result, ok, fail };
