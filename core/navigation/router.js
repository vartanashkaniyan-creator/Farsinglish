/**
 * @fileoverview سیستم مسیریابی پیشرفته و مقیاس‌پذیر برای PWA
 * @author Farsinglish Team
 * @version 2.0.0
 * @module core/navigation/router
 * 
 * @description این ماژول یک سیستم مسیریابی حرفه‌ای با پشتیبانی از:
 * - State Machine برای مدیریت دقیق وضعیت‌ها
 * - WeakMap برای کش بهینه و بدون Memory Leak
 * - AbortController برای لغو درخواست‌های نیمه‌کاره
 * - Symbol برای ثابت‌های امن
 * - Meta Inheritance برای کاهش کد تکراری
 */

// ============ Symbol Constants ============
/**
 * @readonly
 * @enum {Symbol}
 */
const ROUTER_SYMBOLS = {
    /** @type {Symbol} وضعیت فعلی مسیریاب */
    STATE: Symbol('router:state'),
    /** @type {Symbol} کش مسیرها */
    CACHE: Symbol('router:cache'),
    /** @type {Symbol} کنترل‌کننده‌های لغو */
    ABORT_CONTROLLERS: Symbol('router:abort_controllers'),
    /** @type {Symbol} صف تراکنش‌ها */
    TRANSACTION_QUEUE: Symbol('router:transaction_queue'),
    /** @type {Symbol} تاریخچه ناوبری */
    HISTORY: Symbol('router:history'),
    /** @type {Symbol} وضعیت قفل */
    LOCK_STATE: Symbol('router:lock_state')
};

// ============ Type Definitions ============

/**
 * @typedef {Object} RouteConfig
 * @property {string} path - مسیر
 * @property {Function|string|HTMLElement} component - کامپوننت
 * @property {string} [name] - نام مسیر
 * @property {Object} [meta] - متادیتا
 * @property {Function[]} [middlewares] - middlewareها
 * @property {RouteConfig[]} [children] - مسیرهای فرزند
 * @property {string} [redirect] - مسیر هدایت
 * @property {string[]} [alias] - نام‌های مستعار
 */

/**
 * @typedef {Object} RouteMatch
 * @property {Route} route - مسیر تطابق یافته
 * @property {Object.<string, string>} params - پارامترها
 * @property {Object.<string, string>} query - query string
 * @property {string} hash - hash
 * @property {string} full_path - مسیر کامل
 */

/**
 * @typedef {Object} NavigationResult
 * @property {boolean} success - موفقیت
 * @property {RouteMatch} [to] - مسیر مقصد
 * @property {RouteMatch} [from] - مسیر مبدأ
 * @property {string} [error] - خطا
 * @property {number} navigation_id - شناسه ناوبری
 */

/**
 * @typedef {('idle'|'navigating'|'loading'|'error'|'locked')} RouterState
 */

// ============ Router State Machine ============

/**
 * ماشین حالت مسیریاب
 * @class RouterStateMachine
 */
class RouterStateMachine {
    /** @type {RouterState} */
    #state = 'idle';
    /** @type {Map<RouterState, Set<RouterState>>} */
    #transitions = new Map();
    /** @type {Set<Function>} */
    #listeners = new Set();

    constructor() {
        this.#initializeTransitions();
    }

    /**
     * مقداردهی اولیه transitions مجاز
     * @private
     */
    #initializeTransitions() {
        this.#transitions.set('idle', new Set(['navigating', 'locked']));
        this.#transitions.set('navigating', new Set(['loading', 'error', 'idle']));
        this.#transitions.set('loading', new Set(['idle', 'error']));
        this.#transitions.set('error', new Set(['idle', 'locked']));
        this.#transitions.set('locked', new Set(['idle']));
    }

    /**
     * تغییر حالت
     * @param {RouterState} new_state - حالت جدید
     * @param {*} [context] - context تغییر
     * @returns {boolean} موفقیت تغییر
     */
    transition(new_state, context = null) {
        const allowed = this.#transitions.get(this.#state)?.has(new_state);
        
        if (!allowed) {
            console.warn(`⚠️ Transition forbidden: ${this.#state} → ${new_state}`);
            return false;
        }

        const old_state = this.#state;
        this.#state = new_state;
        this.#notifyListeners(old_state, new_state, context);
        
        return true;
    }

    /**
     * دریافت حالت فعلی
     * @returns {RouterState}
     */
    get state() {
        return this.#state;
    }

    /**
     * بررسی وضعیت
     * @param {RouterState} state - حالت مورد نظر
     * @returns {boolean}
     */
    is(state) {
        return this.#state === state;
    }

    /**
     * افزودن شنونده تغییر حالت
     * @param {Function} listener - تابع شنونده
     * @returns {Function} تابع حذف شنونده
     */
    onStateChange(listener) {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    /**
     * اطلاع‌رسانی به شنونده‌ها
     * @private
     */
    #notifyListeners(old_state, new_state, context) {
        this.#listeners.forEach(listener => {
            try {
                listener(old_state, new_state, context);
            } catch (error) {
                console.error('❌ State listener error:', error);
            }
        });
    }
}

// ============ Enhanced Route Cache with WeakMap ============

/**
 * @typedef {Object} CachedRoute
 * @property {Node} element - المان کش شده
 * @property {number} timestamp - زمان کش
 * @property {number} access_count - تعداد دسترسی
 * @property {AbortController} abort_controller - کنترل‌کننده لغو
 */

/**
 * کش پیشرفته مسیرها با WeakMap
 * @class RouteCache
 */
class RouteCache {
    /** @type {WeakMap<object, CachedRoute>} */
    #cache = new WeakMap();
    /** @type {Map<string, {ref: object, size: number}>} */
    #key_map = new Map();
    /** @type {number} */
    #max_size;
    /** @type {number} */
    #ttl;

    /**
     * @param {number} max_size - حداکثر اندازه کش
     * @param {number} ttl - زمان زندگی (ms)
     */
    constructor(max_size = 15, ttl = 300000) { // 5 دقیقه پیش‌فرض
        this.#max_size = max_size;
        this.#ttl = ttl;
    }

    /**
     * ایجاد کلید یکتا برای کش
     * @param {string} key - کلید اصلی
     * @returns {object} کلید WeakMap
     */
    #createWeakKey(key) {
        return { key };
    }

    /**
     * ذخیره در کش
     * @param {string} key - کلید
     * @param {Node} element - المان
     * @param {AbortController} abort_controller - کنترل‌کننده لغو
     */
    set(key, element, abort_controller) {
        // پاکسازی کش قدیمی اگر لازم باشد
        if (this.#key_map.size >= this.#max_size) {
            this.#evictOldest();
        }

        const weak_key = this.#createWeakKey(key);
        const cached = {
            element: element.cloneNode(true),
            timestamp: Date.now(),
            access_count: 1,
            abort_controller
        };

        this.#cache.set(weak_key, cached);
        this.#key_map.set(key, { ref: weak_key, size: this.#calculateSize(element) });
    }

    /**
     * دریافت از کش
     * @param {string} key - کلید
     * @returns {Node|null} المان کش شده یا null
     */
    get(key) {
        const entry = this.#key_map.get(key);
        if (!entry) return null;

        const cached = this.#cache.get(entry.ref);
        if (!cached) {
            this.#key_map.delete(key);
            return null;
        }

        // بررسی TTL
        if (Date.now() - cached.timestamp > this.#ttl) {
            this.delete(key);
            return null;
        }

        cached.access_count++;
        return cached.element.cloneNode(true);
    }

    /**
     * حذف از کش
     * @param {string} key - کلید
     */
    delete(key) {
        const entry = this.#key_map.get(key);
        if (entry) {
            const cached = this.#cache.get(entry.ref);
            if (cached?.abort_controller) {
                cached.abort_controller.abort();
            }
            this.#cache.delete(entry.ref);
            this.#key_map.delete(key);
        }
    }

    /**
     * پاکسازی کامل کش
     */
    clear() {
        for (const [key, entry] of this.#key_map) {
            const cached = this.#cache.get(entry.ref);
            if (cached?.abort_controller) {
                cached.abort_controller.abort();
            }
        }
        this.#cache = new WeakMap();
        this.#key_map.clear();
    }

    /**
     * محاسبه اندازه تقریبی المان
     * @private
     */
    #calculateSize(element) {
        return element.innerHTML?.length || 0;
    }

    /**
     * حذف قدیمی‌ترین کش
     * @private
     */
    #evictOldest() {
        let oldest_key = null;
        let oldest_time = Infinity;

        for (const [key, entry] of this.#key_map) {
            const cached = this.#cache.get(entry.ref);
            if (cached && cached.timestamp < oldest_time) {
                oldest_time = cached.timestamp;
                oldest_key = key;
            }
        }

        if (oldest_key) {
            this.delete(oldest_key);
        }
    }
}

// ============ Enhanced Route with Meta Inheritance ============

/**
 * مسیر پیشرفته با قابلیت‌های اضافی
 * @class Route
 */
class Route {
    /** @type {string} */
    path;
    /** @type {Function|string|HTMLElement} */
    component;
    /** @type {string} */
    name;
    /** @type {Object} */
    meta;
    /** @type {Function[]} */
    middlewares;
    /** @type {Route[]} */
    children;
    /** @type {string} */
    redirect;
    /** @type {string[]} */
    alias;
    
    /** @type {RegExp} */
    #regex;
    /** @type {string[]} */
    #param_names;
    /** @type {*} */
    #loaded_component = null;
    /** @type {Promise|null} */
    #loading_promise = null;
    /** @type {Set<AbortController>} */
    #abort_controllers = new Set();

    /**
     * @param {string} path - مسیر
     * @param {RouteConfig['component']} component - کامپوننت
     * @param {RouteConfig} [options] - گزینه‌ها
     */
    constructor(path, component, options = {}) {
        this.path = path;
        this.component = component;
        this.name = options.name || '';
        this.meta = this.#inheritMeta(options.meta, options.parent_meta);
        this.middlewares = options.middlewares || [];
        this.children = (options.children || []).map(child => 
            new Route(child.path, child.component, {
                ...child,
                parent_meta: this.meta
            })
        );
        this.redirect = options.redirect;
        this.alias = options.alias || [];

        this.#regex = this.#pathToRegex(path);
        this.#param_names = this.#extractParamNames(path);
    }

    /**
     * ارث‌بری meta از والد
     * @private
     */
    #inheritMeta(meta = {}, parent_meta = {}) {
        return {
            ...parent_meta,
            ...meta,
            // ترکیب آرایه‌ها به جای بازنویسی
            guards: [
                ...(parent_meta.guards || []),
                ...(meta.guards || [])
            ],
            permissions: [
                ...(parent_meta.permissions || []),
                ...(meta.permissions || [])
            ]
        };
    }

    /**
     * بارگذاری کامپوننت با قابلیت لغو
     * @param {AbortController} [parent_controller] - کنترل‌کننده والد
     * @returns {Promise<*>}
     */
    async loadComponent(parent_controller = null) {
        if (this.#loaded_component) return this.#loaded_component;
        if (this.#loading_promise) return this.#loading_promise;

        const abort_controller = new AbortController();
        this.#abort_controllers.add(abort_controller);

        if (parent_controller) {
            parent_controller.signal.addEventListener('abort', () => {
                abort_controller.abort();
            });
        }

        this.#loading_promise = (async () => {
            try {
                if (typeof this.component === 'function' && this.component.name === 'lazyLoader') {
                    // بررسی وضعیت لغو قبل از بارگذاری
                    if (abort_controller.signal.aborted) {
                        throw new Error('Loading cancelled');
                    }

                    const module = await Promise.race([
                        this.component(),
                        new Promise((_, reject) => {
                            abort_controller.signal.addEventListener('abort', () => {
                                reject(new Error('Loading cancelled'));
                            });
                        })
                    ]);

                    // بررسی مجدد بعد از بارگذاری
                    if (abort_controller.signal.aborted) {
                        throw new Error('Loading cancelled after completion');
                    }

                    this.#loaded_component = module.default || module;
                } else {
                    this.#loaded_component = this.component;
                }

                return this.#loaded_component;
            } catch (error) {
                if (error.message === 'Loading cancelled') {
                    console.log(`⏸️ Loading cancelled for route: ${this.path}`);
                } else {
                    console.error(`❌ Error loading route ${this.path}:`, error);
                }
                throw error;
            } finally {
                this.#abort_controllers.delete(abort_controller);
                this.#loading_promise = null;
            }
        })();

        return this.#loading_promise;
    }

    /**
     * لغو بارگذاری
     */
    abort() {
        this.#abort_controllers.forEach(controller => controller.abort());
        this.#abort_controllers.clear();
    }

    /**
     * پاکسازی منابع
     */
    dispose() {
        this.abort();
        this.#loaded_component = null;
        this.#loading_promise = null;
        this.children.forEach(child => child.dispose?.());
    }

    // ... سایر متدهای موجود ...
    #pathToRegex(path) {
        const pattern = path
            .replace(/:([^/]+)/g, '([^/?#]+)')
            .replace(/\*/g, '.*');
        return new RegExp(`^${pattern}$`);
    }

    #extractParamNames(path) {
        const param_names = [];
        const param_pattern = /:([^/]+)/g;
        let match;
        while ((match = param_pattern.exec(path)) !== null) {
            param_names.push(match[1]);
        }
        return param_names;
    }

    match(current_path) {
        const [path_without_query] = current_path.split('?');
        const match = path_without_query.match(this.#regex);
        
        if (!match) return null;

        const params = {};
        this.#param_names.forEach((name, index) => {
            params[name] = decodeURIComponent(match[index + 1] || '');
        });

        return {
            route: this,
            params,
            query: this.#extractQuery(current_path),
            hash: this.#extractHash(current_path)
        };
    }

    #extractQuery(path) {
        const query = {};
        const query_index = path.indexOf('?');
        if (query_index !== -1) {
            const query_str = path.substring(query_index + 1).split('#')[0];
            const params = new URLSearchParams(query_str);
            params.forEach((value, key) => { query[key] = value; });
        }
        return query;
    }

    #extractHash(path) {
        const hash_index = path.indexOf('#');
        return hash_index !== -1 ? path.substring(hash_index + 1) : '';
    }
}

// ============ Enhanced Router with All Features ============

/**
 * مسیریاب اصلی با قابلیت‌های پیشرفته
 * @class Router
 * @fires router:navigation - هنگام ناوبری
 * @fires router:error - هنگام خطا
 * @fires router:state_change - هنگام تغییر وضعیت
 */
class Router {
    /** @type {Map<string, Route>} */
    #routes = new Map();
    /** @type {RouteMatch|null} */
    #current_route = null;
    /** @type {RouteMatch|null} */
    #previous_route = null;
    /** @type {string} */
    #mode;
    /** @type {string} */
    #base;
    /** @type {Function[]} */
    #middlewares = [];
    /** @type {Function[]} */
    #guards = [];
    /** @type {RouteCache} */
    [ROUTER_SYMBOLS.CACHE];
    /** @type {RouterStateMachine} */
    [ROUTER_SYMBOLS.STATE];
    /** @type {Set<AbortController>} */
    [ROUTER_SYMBOLS.ABORT_CONTROLLERS] = new Set();
    /** @type {Array} */
    [ROUTER_SYMBOLS.TRANSACTION_QUEUE] = [];
    /** @type {Array} */
    [ROUTER_SYMBOLS.HISTORY] = [];
    /** @type {boolean} */
    [ROUTER_SYMBOLS.LOCK_STATE] = false;

    /**
     * @param {Object} options - گزینه‌ها
     * @param {string} [options.mode='hash'] - حالت مسیریاب
     * @param {string} [options.base='/'] - مسیر پایه
     * @param {number} [options.cache_size=15] - اندازه کش
     */
    constructor(options = {}) {
        this.#mode = options.mode || 'hash';
        this.#base = options.base || '/';
        this[ROUTER_SYMBOLS.CACHE] = new RouteCache(options.cache_size || 15);
        this[ROUTER_SYMBOLS.STATE] = new RouterStateMachine();
        
        this.#setupEventListeners();
        this.#setupStateListeners();
    }

    /**
     * تنظیم شنونده‌های وضعیت
     * @private
     */
    #setupStateListeners() {
        this[ROUTER_SYMBOLS.STATE].onStateChange((old_state, new_state, context) => {
            const event = new CustomEvent('router:state_change', {
                detail: { old_state, new_state, context }
            });
            window.dispatchEvent(event);
        });
    }

    /**
     * ایجاد lazy loader با قابلیت لغو
     * @param {Function} loader - تابع بارگذاری
     * @returns {Function} lazy loader
     */
    lazy(loader) {
        const lazy_loader = async () => {
            const abort_controller = new AbortController();
            this[ROUTER_SYMBOLS.ABORT_CONTROLLERS].add(abort_controller);

            try {
                const result = await Promise.race([
                    loader(),
                    new Promise((_, reject) => {
                        abort_controller.signal.addEventListener('abort', () => {
                            reject(new Error('Lazy loading cancelled'));
                        });
                    })
                ]);
                return result;
            } finally {
                this[ROUTER_SYMBOLS.ABORT_CONTROLLERS].delete(abort_controller);
            }
        };
        
        Object.defineProperty(lazy_loader, 'name', { value: 'lazyLoader' });
        return lazy_loader;
    }

    /**
     * ناوبری به مسیر با transaction
     * @param {string} path - مسیر مقصد
     * @param {Object} [options] - گزینه‌ها
     * @returns {Promise<NavigationResult>}
     */
    async navigateTo(path, options = {}) {
        const navigation_id = Date.now();
        
        // بررسی قفل
        if (this[ROUTER_SYMBOLS.LOCK_STATE]) {
            this[ROUTER_SYMBOLS.TRANSACTION_QUEUE].push({ path, options, navigation_id });
            return { success: false, navigation_id, error: 'Router locked' };
        }

        // بررسی وضعیت
        if (!this[ROUTER_SYMBOLS.STATE].transition('navigating', { path, navigation_id })) {
            return { success: false, navigation_id, error: 'Invalid state transition' };
        }

        try {
            const abort_controller = new AbortController();
            this[ROUTER_SYMBOLS.ABORT_CONTROLLERS].add(abort_controller);

            const to = this.#resolvePath(path);
            
            if (!to) {
                throw new Error(`Route not found: ${path}`);
            }

            // بررسی guards
            const guard_result = await this.#checkGuards(to, this.#current_route);
            if (!guard_result.allowed) {
                if (guard_result.redirect) {
                    return this.navigateTo(guard_result.redirect);
                }
                throw new Error(`Navigation blocked: ${guard_result.reason}`);
            }

            // اجرای middlewareهای قبل از خروج
            await this.#runMiddlewares('beforeLeave', this.#current_route, to, abort_controller);

            this.#previous_route = this.#current_route;
            this.#current_route = to;

            // به‌روزرسانی URL
            this.#updateBrowserUrl(to.full_path, options);

            // اجرای middlewareهای قبل از ورود
            await this.#runMiddlewares('beforeEnter', to, this.#previous_route, abort_controller);

            // رندر
            const render_result = await this.#renderCurrentRoute(abort_controller);
            if (!render_result) {
                throw new Error('Failed to render route');
            }

            // اجرای middlewareهای بعد از ورود
            await this.#runMiddlewares('afterEnter', to, this.#previous_route, abort_controller);

            // افزودن به تاریخچه
            this.#addToHistory(to);

            // تغییر وضعیت به idle
            this[ROUTER_SYMBOLS.STATE].transition('idle', { success: true });

            // انتشار رویداد
            this.#emitNavigationEvent(to, this.#previous_route, navigation_id);

            return {
                success: true,
                to,
                from: this.#previous_route,
                navigation_id
            };

        } catch (error) {
            console.error('❌ Navigation failed:', error);
            
            this[ROUTER_SYMBOLS.STATE].transition('error', { error });
            
            const error_event = new CustomEvent('router:error', {
                detail: { error, navigation_id }
            });
            window.dispatchEvent(error_event);

            return {
                success: false,
                navigation_id,
                error: error.message
            };

        } finally {
            this[ROUTER_SYMBOLS.ABORT_CONTROLLERS].clear();
        }
    }

    /**
     * اجرای تراکنش‌های معلق
     * @returns {Promise<void>}
     */
    async processTransactionQueue() {
        if (this[ROUTER_SYMBOLS.TRANSACTION_QUEUE].length === 0) return;

        this[ROUTER_SYMBOLS.LOCK_STATE] = true;
        
        const queue = [...this[ROUTER_SYMBOLS.TRANSACTION_QUEUE]];
        this[ROUTER_SYMBOLS.TRANSACTION_QUEUE] = [];

        for (const item of queue) {
            await this.navigateTo(item.path, item.options);
        }

        this[ROUTER_SYMBOLS.LOCK_STATE] = false;
    }

    /**
     * قفل کردن مسیریاب
     */
    lock() {
        this[ROUTER_SYMBOLS.LOCK_STATE] = true;
        this[ROUTER_SYMBOLS.STATE].transition('locked');
    }

    /**
     * باز کردن قفل
     */
    unlock() {
        this[ROUTER_SYMBOLS.LOCK_STATE] = false;
        this[ROUTER_SYMBOLS.STATE].transition('idle');
        this.processTransactionQueue();
    }

    /**
     * پاکسازی کامل منابع
     */
    dispose() {
        // لغو همه درخواست‌ها
        this[ROUTER_SYMBOLS.ABORT_CONTROLLERS].forEach(controller => controller.abort());
        this[ROUTER_SYMBOLS.ABORT_CONTROLLERS].clear();

        // پاکسازی کش
        this[ROUTER_SYMBOLS.CACHE].clear();

        // پاکسازی routeها
        this.#routes.forEach(route => route.dispose?.());
        this.#routes.clear();

        // پاکسازی تاریخچه
        this[ROUTER_SYMBOLS.HISTORY] = [];
        this[ROUTER_SYMBOLS.TRANSACTION_QUEUE] = [];

        console.log('✅ Router disposed');
    }

    // ... سایر متدهای کمکی ...

    #resolvePath(path) {
        let clean_path = path;
        if (this.#mode === 'history' && path.startsWith(this.#base)) {
            clean_path = path.substring(this.#base.length);
        }

        const path_without_hash = clean_path.split('#')[0];
        const path_without_query = path_without_hash.split('?')[0];

        for (const route of this.#routes.values()) {
            const match = route.match(clean_path);
            if (match) {
                return {
                    ...match,
                    full_path: clean_path,
                    path: path_without_query
                };
            }
        }

        return null;
    }

    async #runMiddlewares(hook, to, from, abort_controller) {
        const all_middlewares = [
            ...this.#middlewares,
            ...(to?.route?.middlewares || [])
        ];

        for (const middleware of all_middlewares) {
            if (abort_controller.signal.aborted) {
                throw new Error('Navigation cancelled');
            }

            if (middleware[hook]) {
                await middleware[hook](to, from);
            }
        }
    }

    async #checkGuards(to, from) {
        const all_guards = [
            ...this.#guards,
            ...(to?.route?.meta?.guards || [])
        ];

        for (const guard of all_guards) {
            const result = await guard.canNavigate(to, from);
            if (!result.allowed) {
                return result;
            }
        }
        
        return { allowed: true };
    }

    async #renderCurrentRoute(abort_controller) {
        if (!this.#current_route?.route) return false;

        const app_element = document.getElementById('app');
        if (!app_element) return false;

        try {
            const cache_key = this.#current_route.full_path;
            
            // بررسی کش
            const cached = this[ROUTER_SYMBOLS.CACHE].get(cache_key);
            if (cached) {
                app_element.innerHTML = '';
                app_element.appendChild(cached);
                return true;
            }

            // بارگذاری کامپوننت با قابلیت لغو
            const component = await this.#current_route.route.loadComponent(abort_controller);
            
            if (abort_controller.signal.aborted) {
                throw new Error('Render cancelled');
            }

            // رندر
            app_element.innerHTML = '';
            
            let rendered;
            if (typeof component === 'function') {
                rendered = await component(this.#current_route);
            } else if (component instanceof HTMLElement) {
                rendered = component.cloneNode(true);
            } else if (typeof component === 'string') {
                app_element.innerHTML = component;
                rendered = app_element.firstChild;
            }

            if (rendered) {
                if (!(rendered instanceof Node)) {
                    const temp = document.createElement('div');
                    temp.innerHTML = rendered;
                    rendered = temp.firstChild;
                }
                
                app_element.appendChild(rendered);
                
                // ذخیره در کش
                this[ROUTER_SYMBOLS.CACHE].set(cache_key, rendered, abort_controller);
            }

            return true;

        } catch (error) {
            if (error.message === 'Render cancelled') {
                console.log('⏸️ Render cancelled');
                return false;
            }
            throw error;
        }
    }

    #updateBrowserUrl(path, options) {
        const full_path = this.#mode === 'hash' 
            ? `#${path}` 
            : `${this.#base}${path}`.replace(/\/+/g, '/');

        if (options.replace) {
            window.history.replaceState({}, '', full_path);
        } else {
            window.history.pushState({}, '', full_path);
        }
    }

    #addToHistory(route) {
        this[ROUTER_SYMBOLS.HISTORY].push({
            path: route.path,
            full_path: route.full_path,
            name: route.route.name,
            timestamp: Date.now()
        });

        if (this[ROUTER_SYMBOLS.HISTORY].length > 50) {
            this[ROUTER_SYMBOLS.HISTORY].shift();
        }
    }

    #emitNavigationEvent(to, from, navigation_id) {
        const event = new CustomEvent('router:navigation', {
            detail: { to, from, navigation_id, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    }

    #setupEventListeners() {
        window.addEventListener('hashchange', () => {
            if (this.#mode === 'hash' && !this[ROUTER_SYMBOLS.STATE].is('navigating')) {
                const hash = window.location.hash.substring(1) || '/';
                this.navigateTo(hash, { replace: true });
            }
        });

        window.addEventListener('popstate', () => {
            if (this.#mode === 'history' && !this[ROUTER_SYMBOLS.STATE].is('navigating')) {
                const path = window.location.pathname.replace(this.#base, '') || '/';
                this.navigateTo(path, { replace: true });
            }
        });

        window.addEventListener('beforeunload', () => {
            this.dispose();
        });
    }

    // API عمومی
    addRoute(path, component, options = {}) {
        const route = new Route(path, component, options);
        if (options.name) this.#routes.set(options.name, route);
        this.#routes.set(path, route);
        return this;
    }

    addRoutes(routes) {
        routes.forEach(route => this.addRoute(route.path, route.component, route));
        return this;
    }

    start() {
        this.#processInitialRoute();
        this.#renderCurrentRoute(new AbortController());
        console.log('🚀 Router started in', this.#mode, 'mode');
        return this;
    }

    #processInitialRoute() {
        let initial_path = '/';
        if (this.#mode === 'hash') {
            initial_path = window.location.hash.substring(1) || '/';
        } else if (this.#mode === 'history') {
            initial_path = window.location.pathname.replace(this.#base, '') || '/';
        }
        this.#current_route = this.#resolvePath(initial_path) || this.#resolvePath('/');
    }

    getCurrentRoute() {
        return this.#current_route;
    }

    getState() {
        return this[ROUTER_SYMBOLS.STATE].state;
    }

    clearCache() {
        this[ROUTER_SYMBOLS.CACHE].clear();
    }
}

// ============ Factory برای ساخت آسان ============

/**
 * @class RouterFactory
 */
class RouterFactory {
    /**
     * ایجاد مسیریاب با تنظیمات پیش‌فرض
     * @param {Object} options - گزینه‌ها
     * @returns {Router}
     */
    static create(options = {}) {
        return new Router({
            mode: options.mode || 'hash',
            base: options.base || '/',
            cache_size: options.cache_size || 15
        });
    }

    /**
     * ایجاد مسیریاب مخصوص PWA
     * @param {Object} options - گزینه‌ها
     * @returns {Router}
     */
    static createForPWA(options = {}) {
        return RouterFactory.create({
            mode: 'hash',
            cache_size: 20,
            ...options
        });
    }
}

// ============ Export ============
export {
    Router,
    RouterFactory,
    Route,
    RouterStateMachine,
    RouteCache,
    ROUTER_SYMBOLS
};
