/**
 * @file core/utils/clone_utils.js
 * @description مجموعه ابزار پیشرفته برای clone, freeze, merge و اعتبارسنجی اشیاء
 * @version 1.0.0
 */

"use strict";

/**
 * بررسی اینکه یک مقدار object واقعی است
 * @param {*} value هر مقدار
 * @returns {boolean} آیا object است؟
 */
export function is_object(value) {
    return value !== null && typeof value === 'object';
}

/**
 * شناسایی دقیق نوع شی
 * @param {*} value هر مقدار
 * @returns {string} نام نوع (Array, Date, Map, Set, Object, ...)
 */
function get_type(value) {
    return Object.prototype.toString.call(value).slice(8, -1);
}

/**
 * کلون عمیق یک شی
 * @param {*} source شی یا مقدار
 * @param {WeakMap} [seen=new WeakMap()] برای حل حلقه‌ها
 * @returns {*} کلون شده
 */
export function deep_clone(source, seen = new WeakMap()) {
    if (!is_object(source)) return source;
    if (seen.has(source)) return seen.get(source);

    const type = get_type(source);
    let cloned;

    switch (type) {
        case 'Date':
            cloned = new Date(source.getTime());
            break;
        case 'RegExp':
            cloned = new RegExp(source.source, source.flags);
            break;
        case 'Map':
            cloned = new Map();
            seen.set(source, cloned);
            source.forEach((value, key) => cloned.set(deep_clone(key, seen), deep_clone(value, seen)));
            break;
        case 'Set':
            cloned = new Set();
            seen.set(source, cloned);
            source.forEach(value => cloned.add(deep_clone(value, seen)));
            break;
        case 'Array':
            cloned = [];
            seen.set(source, cloned);
            for (let i = 0; i < source.length; i++) cloned[i] = deep_clone(source[i], seen);
            break;
        default:
            cloned = Object.create(Object.getPrototypeOf(source));
            seen.set(source, cloned);

            // clone تمام propertyها، شامل enumerable, non-enumerable و Symbol
            Reflect.ownKeys(source).forEach(key => {
                const desc = Object.getOwnPropertyDescriptor(source, key);
                if (desc) {
                    if ('value' in desc) desc.value = deep_clone(desc.value, seen);
                    Object.defineProperty(cloned, key, desc);
                }
            });
            break;
    }

    return cloned;
}

/**
 * freeze عمیق یک شی
 * @param {*} source شی
 * @param {WeakSet} [seen=new WeakSet()] برای جلوگیری از حلقه‌ها
 * @returns {*} شی freeze شده
 */
export function deep_freeze(source, seen = new WeakSet()) {
    if (!is_object(source) || seen.has(source)) return source;
    seen.add(source);

    Reflect.ownKeys(source).forEach(key => {
        const desc = Object.getOwnPropertyDescriptor(source, key);
        if (desc && 'value' in desc && is_object(desc.value)) {
            deep_freeze(desc.value, seen);
        }
    });

    return Object.freeze(source);
}

/**
 * ادغام عمیق چند شیء
 * @param {...Object} sources منابع برای merge
 * @returns {Object} شی ادغام شده
 */
export function deep_merge(...sources) {
    const result = {};
    sources.forEach(source => {
        if (!is_object(source)) return;
        Reflect.ownKeys(source).forEach(key => {
            const val = source[key];
            if (is_object(val) && is_object(result[key])) {
                result[key] = deep_merge(result[key], val);
            } else {
                result[key] = val;
            }
        });
    });
    return result;
}

/**
 * اعتبارسنجی ساختار شی
 * @param {Object} obj شی ورودی
 * @param {Object} shape الگوی مورد انتظار
 * @returns {boolean} آیا ساختار مطابق است؟
 */
export function validate_object_shape(obj, shape) {
    if (!is_object(obj) || !is_object(shape)) return false;
    return Reflect.ownKeys(shape).every(key => {
        if (!(key in obj)) return false;
        const expected_type = shape[key];
        const actual_type = get_type(obj[key]);
        return expected_type === actual_type || (typeof expected_type === 'string' && expected_type === typeof obj[key]);
    });
}

// نسخه پیش‌فرض export
export default { deep_clone, deep_freeze, deep_merge, validate_object_shape };
