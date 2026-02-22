/**
 * ثبت و مدیریت ژنراتورهای تمرین
 * @template T
 */
export class ExerciseRegistry {
    /**
     * @param {Console} logger - وابستگی تزریقی برای لاگ
     * @param {number} max_generators - حداکثر تعداد ژنراتورهای ثبت‌شده
     */
    constructor(logger = console, max_generators = 20) {
        /** @type {Map<string, T>} */
        this.generators = new Map();

        /** @type {Console} */
        this.logger = logger;

        /** حداکثر تعداد ژنراتورهای ثبت‌شده */
        this.max_generators = max_generators;
    }

    /**
     * ثبت ژنراتور
     * @param {string} type
     * @param {T} generator
     * @throws {Error} وقتی از max_generators عبور شود
     */
    register(type, generator) {
        if (this.generators.has(type)) {
            this.logger.warn(`generator already registered: ${type}`);
            return;
        }
        if (this.generators.size >= this.max_generators) {
            throw new Error(`max_generators (${this.max_generators}) exceeded`);
        }
        this.generators.set(type, generator);
    }

    /**
     * بررسی وجود ژنراتور
     * @param {string} type
     * @returns {boolean}
     */
    has(type) {
        return this.generators.has(type);
    }

    /**
     * دریافت ژنراتور
     * @param {string} type
     * @returns {T|null}
     */
    get(type) {
        if (!this.generators.has(type)) {
            this.logger.warn(`generator not found: ${type}`);
            return null;
        }
        return this.generators.get(type);
    }

    /**
     * لیست تمام ژنراتورهای ثبت‌شده
     * @returns {string[]}
     */
    list() {
        return Array.from(this.generators.keys());
    }

    /**
     * حذف ژنراتور
     * @param {string} type
     */
    remove(type) {
        if (!this.generators.has(type)) {
            this.logger.warn(`cannot remove non-existent generator: ${type}`);
            return;
        }
        this.generators.delete(type);
    }

    /**
     * پاکسازی همه ژنراتورها
     */
    clear() {
        this.generators.clear();
    }
}
