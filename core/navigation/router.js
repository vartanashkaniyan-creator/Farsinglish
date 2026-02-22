
/**
 * @file router.js
 * @description Router حرفه‌ای مطابق با SOLID، امن و قابل توسعه
 * @version 2.0.0
 */

//////////////////////
// RouterError Class //
//////////////////////
class RouterError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     * @param {Object} [details]
     */
    constructor(code, message, details = {}) {
        super(`[RouterError:${code}] ${message}`);
        this.code = code;
        this.details = details;
        this.timestamp = Date.now();
    }
}

//////////////////////
// RouterCache Class //
//////////////////////
class RouterCache {
    #store = new Map();
    #max_age = 5 * 60 * 1000; // 5 دقیقه

    /**
     * @param {string} key
     * @param {any} data
     * @param {AbortSignal} [signal]
     */
    set_cache(key, data, signal) {
        if (!this.#is_serializable(data)) return;
        this.#store.set(key, {
            data: structuredClone(data),
            timestamp: Date.now(),
            signal
        });
    }

    /**
     * @param {string} key
     * @returns {any|null}
     */
    get_cache(key) {
        const entry = this.#store.get(key);
        if (!entry) return null;

        if (Date.now() - entry.timestamp > this.#max_age || entry.signal?.aborted) {
            this.#store.delete(key);
            return null;
        }

        return structuredClone(entry.data);
    }

    /**
     * پاکسازی کش منقضی شده
     */
    clean_expired() {
        const now = Date.now();
        for (const [key, entry] of this.#store) {
            if (now - entry.timestamp > this.#max_age) {
                this.#store.delete(key);
            }
        }
    }

    #is_serializable(obj) {
        try {
            structuredClone(obj);
            return true;
        } catch {
            return false;
        }
    }
}

/////////////////////////
// RouterHistory Class //
/////////////////////////
class RouterHistory {
    #entries = [];

    /**
     * @param {string} path
     * @param {Object} [state]
     */
    push(path, state = {}) {
        this.#entries.push({ path, state, timestamp: Date.now() });
    }

    /**
     * @returns {Array<{path:string,state:Object,timestamp:number}>}
     */
    get_entries() {
        return [...this.#entries];
    }

    /**
     * Async Iterator برای پیمایش تاریخچه
     * @returns {AsyncIterator<{path:string,state:Object,timestamp:number}>}
     */
    [Symbol.asyncIterator]() {
        let index = 0;
        const entries = this.#entries;

        return {
            async next() {
                if (index < entries.length) {
                    return { value: entries[index++], done: false };
                }
                return { done: true };
            }
        };
    }
}

/////////////////////////////
// MiddlewareManager Class //
/////////////////////////////
class MiddlewareManager {
    #middlewares = [];

    /**
     * @param {Function} fn - Middleware function
     */
    use(fn) {
        if (typeof fn !== 'function') throw new RouterError('INVALID_MIDDLEWARE', 'Middleware must be a function');
        this.#middlewares.push(fn);
    }

    /**
     * اجرای Middlewareها
     * @param {Object} context
     * @returns {Promise<boolean>}
     */
    async execute(context) {
        for (const fn of this.#middlewares) {
            const result = await fn(context);
            if (result === false) return false;
        }
        return true;
    }
}

/////////////////////
// Router Class //
/////////////////////
class Router extends EventTarget {
    #routes = new Map();
    #history = new RouterHistory();
    #cache = new RouterCache();
    #middleware_manager = new MiddlewareManager();

    #abort_controller = new AbortController();
    #navigation_count = new Map();
    #rate_limit_window = 60000; // 1 دقیقه
    #max_navigation = 30;
    #metrics = {
        navigation_count: 0,
        errors_count: 0,
        cache_hits: 0,
        cache_misses: 0,
        avg_navigation_time: 0
    };
    #prefetch_queue = [];
    #prefetching = false;

    /**
     * افزودن مسیر جدید
     * @param {string} path
     * @param {Function|Object} component
     * @param {Object} [options]
     */
    add_route(path, component, options = {}) {
        if (!path || !component) throw new RouterError('INVALID_ROUTE', 'Path and component required');
        this.#routes.set(path, { component, options });
    }

    /**
     * گروه‌بندی مسیرها
     * @param {string} prefix
     * @param {Function} callback
     * @param {Object} [options]
     */
    group_routes(prefix, callback, options = {}) {
        const group_router = new Router();
        callback(group_router);

        for (const [path, route] of group_router.#routes) {
            const full_path = `${prefix}${path}`;
            this.add_route(full_path, route.component, { ...route.options, ...options });
        }
    }

    /**
     * پیمایش مسیر
     * @param {string} path
     */
    async navigate_to(path) {
        const start = performance.now();
        const signal = this.#abort_controller.signal;

        if (signal.aborted) throw new RouterError('ABORTED', 'Router has been aborted');

        this.#check_rate_limit(path);

        try {
            const cached = this.#cache.get_cache(path);
            if (cached) {
                this.#metrics.cache_hits++;
                this.#history.push(path, { cached: true });
                this.dispatchEvent(new CustomEvent('cache_hit', { detail: { path } }));
                return cached;
            } else {
                this.#metrics.cache_misses++;
            }

            const route = this.#routes.get(path);
            if (!route) throw new RouterError('ROUTE_NOT_FOUND', `No route for path ${path}`);

            const context = { from: this.#history.get_entries().slice(-1)[0]?.path || null, to: path, params: {}, signal };
            const proceed = await this.#middleware_manager.execute(context);
            if (!proceed) throw new RouterError('NAVIGATION_BLOCKED', 'Blocked by middleware');

            // اجرای component (اگر تابع lazy باشد)
            let result = route.component;
            if (typeof route.component === 'function') result = await route.component(signal);

            this.#history.push(path, { cached: false });
            this.#cache.set_cache(path, result, signal);

            this.#metrics.navigation_count++;
            this.#metrics.avg_navigation_time = (this.#metrics.avg_navigation_time * (this.#metrics.navigation_count - 1) + (performance.now() - start)) / this.#metrics.navigation_count;

            this.dispatchEvent(new CustomEvent('navigate', { detail: { path, duration: performance.now() - start, success: true } }));

            return result;
        } catch (error) {
            this.#metrics.errors_count++;
            this.dispatchEvent(new CustomEvent('error', { detail: { path, error } }));
            throw error;
        }
    }

    /**
     * لغو همه عملیات در حال اجرا
     */
    abort_all() {
        this.#abort_controller.abort();
        this.#abort_controller = new AbortController();
    }

    /**
     * افزودن Middleware
     * @param {Function} fn
     */
    use_middleware(fn) {
        this.#middleware_manager.use(fn);
    }

    /**
     * پیش‌بارگذاری مسیرها
     * @param {string[]} paths
     */
    prefetch_routes(paths) {
        this.#prefetch_queue.push(...paths);
        if (!this.#prefetching) this.#process_prefetch_queue();
    }

    async #process_prefetch_queue() {
        this.#prefetching = true;
        while (this.#prefetch_queue.length) {
            const path = this.#prefetch_queue.shift();
            try {
                const route = this.#routes.get(path);
                if (route && typeof route.component === 'function') {
                    await route.component(new AbortController().signal);
                }
            } catch (err) {
                console.warn(`Prefetch failed for ${path}:`, err);
            }
            await new Promise(r => setTimeout(r, 100));
        }
        this.#prefetching = false;
    }

    /**
     * بررسی محدودیت نرخ ناوبری
     * @param {string} path
     */
    #check_rate_limit(path) {
        const now = Date.now();
        const attempts = this.#navigation_count.get(path) || [];
        const recent = attempts.filter(t => now - t < this.#rate_limit_window);

        if (recent.length >= this.#max_navigation) {
            throw new RouterError('RATE_LIMIT', 'Too many navigation attempts');
        }

        recent.push(now);
        this.#navigation_count.set(path, recent);
    }

    /**
     * دریافت Metrics عملکرد
     * @returns {Object}
     */
    get_metrics() {
        return { ...this.#metrics };
    }

    /**
     * Serialization کامل
     * @returns {Object}
     */
    serialize() {
        return {
            routes: Array.from(this.#routes.entries()),
            history: this.#history.get_entries(),
            version: '2.0.0'
        };
    }

    /**
     * Deserialization کامل
     * @param {Object} data
     */
    deserialize(data) {
        if (data.version !== '2.0.0') throw new RouterError('VERSION_MISMATCH', 'Router version mismatch');
        this.#routes = new Map(data.routes);
        data.history.forEach(entry => this.#history.push(entry.path, entry.state));
    }

    /**
     * پارس مسیر و Query Parameters
     * @param {string} path
     * @returns {{path:string, params:Object, query:Object}}
     */
    parse_route(path) {
        const [base_path, query_string] = path.split('?');
        const query = {};

        if (query_string) {
            query_string.split('&').forEach(param => {
                const [key, value] = param.split('=');
                query[decodeURIComponent(key)] = decodeURIComponent(value || '');
            });
        }

        return { path: base_path, params: {}, query };
    }
}

/////////////////////////
// Export Module //
/////////////////////////
export { Router, RouterCache, RouterHistory, MiddlewareManager, RouterError };
