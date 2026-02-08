// core/navigation/router.js
/**
 * Router - سیستم مسیریابی پیشرفته برای PWA
 * مسئولیت: مدیریت ناوبری، مسیرهای تو در تو، Middleware و انتقال پارامترها
 * اصل SRP: فقط مدیریت مسیریابی و ناوبری
 * اصل OCP: قابل توسعه برای انواع Route و Middleware
 * اصل DIP: وابستگی به اینترفیس‌های Route و Middleware
 * اصل LSP: قابلیت جایگزینی Routeهای مختلف
 */

// ============ Interfaces ============
class IRoute {
    constructor(path, component, options = {}) {
        this.path = path;
        this.component = component;
        this.name = options.name || '';
        this.meta = options.meta || {};
        this.middlewares = options.middlewares || [];
        this.children = options.children || [];
        this.redirect = options.redirect;
        this.alias = options.alias || [];
    }

    match(currentPath) {}
    getParams(path) {}
    toRouteObject() {}
}

class IMiddleware {
    async beforeEnter(to, from, next) {}
    async afterEnter(to, from) {}
    async beforeLeave(to, from, next) {}
}

class INavigationGuard {
    async canNavigate(to, from) {}
}

// ============ Route Implementation ============
class Route extends IRoute {
    constructor(path, component, options = {}) {
        super(path, component, options);
        this._regex = this._pathToRegex(path);
        this._paramNames = this._extractParamNames(path);
    }

    /**
     * بررسی تطابق مسیر
     */
    match(currentPath) {
        const match = currentPath.match(this._regex);
        if (!match) return null;

        const params = {};
        this._paramNames.forEach((name, index) => {
            params[name] = match[index + 1];
        });

        return {
            route: this,
            params,
            query: this._extractQuery(currentPath),
            hash: this._extractHash(currentPath)
        };
    }

    /**
     * استخراج پارامترها از مسیر
     */
    getParams(path) {
        const match = path.match(this._regex);
        if (!match) return {};

        const params = {};
        this._paramNames.forEach((name, index) => {
            params[name] = match[index + 1];
        });

        return params;
    }

    /**
     * تبدیل به آبجکت استاندارد
     */
    toRouteObject() {
        return {
            path: this.path,
            name: this.name,
            component: this.component,
            meta: this.meta,
            children: this.children.map(child => child.toRouteObject()),
            redirect: this.redirect,
            alias: this.alias
        };
    }

    /**
     * تبدیل مسیر به regex
     * @private
     */
    _pathToRegex(path) {
        const pattern = path
            .replace(/:([^\/]+)/g, '([^\/]+)') // پارامترها
            .replace(/\*/g, '.*'); // wildcard
        
        return new RegExp(`^${pattern}$`);
    }

    /**
     * استخراج نام پارامترها
     * @private
     */
    _extractParamNames(path) {
        const paramNames = [];
        const paramPattern = /:([^\/]+)/g;
        let match;
        
        while ((match = paramPattern.exec(path)) !== null) {
            paramNames.push(match[1]);
        }
        
        return paramNames;
    }

    /**
     * استخراج query string
     * @private
     */
    _extractQuery(path) {
        const query = {};
        const queryIndex = path.indexOf('?');
        
        if (queryIndex !== -1) {
            const queryStr = path.substring(queryIndex + 1);
            const params = new URLSearchParams(queryStr);
            
            params.forEach((value, key) => {
                query[key] = value;
            });
        }
        
        return query;
    }

    /**
     * استخراج hash
     * @private
     */
    _extractHash(path) {
        const hashIndex = path.indexOf('#');
        return hashIndex !== -1 ? path.substring(hashIndex + 1) : '';
    }
}

// ============ Navigation Guards ============
class AuthGuard extends INavigationGuard {
    constructor(authService) {
        super();
        this.authService = authService;
    }

    async canNavigate(to, from) {
        // اگر صفحه نیاز به احراز هویت نداشته باشد
        if (!to.meta?.requiresAuth) {
            return { allowed: true };
        }

        // بررسی وضعیت احراز هویت
        const isAuthenticated = await this.authService.checkAuth();
        
        if (!isAuthenticated) {
            return {
                allowed: false,
                redirect: {
                    name: 'login',
                    query: { redirect: to.fullPath }
                },
                reason: 'نیاز به ورود به سیستم'
            };
        }

        return { allowed: true };
    }
}

class RoleGuard extends INavigationGuard {
    constructor(userService) {
        super();
        this.userService = userService;
    }

    async canNavigate(to, from) {
        const requiredRole = to.meta?.requiredRole;
        
        if (!requiredRole) {
            return { allowed: true };
        }

        // TODO: در پیاده‌سازی واقعی، نقش کاربر از سرویس دریافت شود
        const userRole = 'user'; // مقدار نمونه
        
        if (userRole !== requiredRole) {
            return {
                allowed: false,
                redirect: { name: 'home' },
                reason: 'دسترسی غیرمجاز'
            };
        }

        return { allowed: true };
    }
}

// ============ Middlewares ============
class LoggingMiddleware extends IMiddleware {
    async beforeEnter(to, from, next) {
        console.log(`[Router] Navigating from ${from?.path || '/'} to ${to.path}`);
        console.log(`[Router] Route: ${to.name}, Params:`, to.params, 'Query:', to.query);
        next();
    }

    async afterEnter(to, from) {
        console.log(`[Router] Successfully navigated to ${to.path}`);
    }

    async beforeLeave(to, from, next) {
        console.log(`[Router] Leaving ${from.path} for ${to.path}`);
        next();
    }
}

class LoadingMiddleware extends IMiddleware {
    constructor(stateManager) {
        super();
        this.stateManager = stateManager;
    }

    async beforeEnter(to, from, next) {
        await this.stateManager.dispatch('UI_STATE_CHANGE', {
            isLoading: true,
            loadingMessage: 'در حال بارگذاری...'
        });
        next();
    }

    async afterEnter(to, from) {
        await this.stateManager.dispatch('UI_STATE_CHANGE', {
            isLoading: false,
            loadingMessage: null
        });
    }

    async beforeLeave(to, from, next) {
        // تاخیر کمی برای نمایش انیمیشن خروج
        setTimeout(() => next(), 100);
    }
}

class AnalyticsMiddleware extends IMiddleware {
    async afterEnter(to, from) {
        // ارسال اطلاعات تحلیلی به سرور
        const analyticsData = {
            page: to.name || to.path,
            timestamp: new Date().toISOString(),
            params: to.params,
            query: to.query,
            referrer: from?.path
        };

        // TODO: در پیاده‌سازی واقعی به سرور ارسال شود
        console.log('[Analytics] Page view:', analyticsData);
    }
}

// ============ Router Class ============
class Router {
    constructor(options = {}) {
        this.routes = new Map();
        this.currentRoute = null;
        this.previousRoute = null;
        this.history = [];
        this.mode = options.mode || 'hash'; // 'hash' یا 'history'
        this.base = options.base || '/';
        this.middlewares = options.middlewares || [];
        this.guards = options.guards || [];
        this.isNavigating = false;
        this.maxHistorySize = options.maxHistorySize || 50;

        // رجیستر کردن middlewares پیش‌فرض
        if (options.enableLogging !== false) {
            this.middlewares.push(new LoggingMiddleware());
        }

        // اتصال event listeners
        this._setupEventListeners();
    }

    /**
     * افزودن route جدید
     */
    addRoute(path, component, options = {}) {
        const route = new Route(path, component, options);
        
        // ذخیره با نام اگر وجود داشته باشد
        if (options.name) {
            this.routes.set(options.name, route);
        }
        
        // همچنین با مسیر هم ذخیره شود
        this.routes.set(path, route);
        
        // افزودن routeهای child
        if (options.children) {
            options.children.forEach(child => {
                const childRoute = new Route(
                    child.path,
                    child.component,
                    { ...child, name: child.name }
                );
                route.children.push(childRoute);
            });
        }

        console.log(`Route added: ${path} (${options.name || 'unnamed'})`);
        return this;
    }

    /**
     * شروع مسیریابی
     */
    start() {
        // پردازش مسیر اولیه
        this._processInitialRoute();
        
        // رندر کامپوننت اولیه
        this._renderCurrentRoute();
        
        console.log('Router started in', this.mode, 'mode');
    }

    /**
     * ناوبری به مسیر جدید
     */
    async navigateTo(path, options = {}) {
        if (this.isNavigating) {
            console.warn('Navigation already in progress');
            return false;
        }

        this.isNavigating = true;
        const navigationId = Date.now();

        try {
            // ساخت آبجکت to
            const to = this._resolvePath(path);
            if (!to) {
                throw new Error(`Route not found: ${path}`);
            }

            // بررسی guards
            const guardResult = await this._checkGuards(to, this.currentRoute);
            if (!guardResult.allowed) {
                if (guardResult.redirect) {
                    return await this.navigateTo(this._resolvePath(guardResult.redirect));
                }
                throw new Error(`Navigation blocked: ${guardResult.reason}`);
            }

            // اجرای middlewares قبل از خروج
            await this._runMiddlewares('beforeLeave', this.currentRoute, to);

            // تغییر URL
            this._updateBrowserUrl(to.fullPath, options);

            // ذخیره route قبلی
            this.previousRoute = this.currentRoute;
            this.currentRoute = to;

            // افزودن به تاریخچه
            this._addToHistory(to);

            // اجرای middlewares قبل از ورود
            await this._runMiddlewares('beforeEnter', to, this.previousRoute);

            // رندر کامپوننت جدید
            await this._renderCurrentRoute();

            // اجرای middlewares بعد از ورود
            await this._runMiddlewares('afterEnter', to, this.previousRoute);

            // انتشار event ناوبری
            this._emitNavigationEvent(to, this.previousRoute, navigationId);

            return true;

        } catch (error) {
            console.error('Navigation failed:', error);
            
            // بازگشت به route قبلی در صورت خطا
            if (this.previousRoute) {
                this.currentRoute = this.previousRoute;
                await this._renderCurrentRoute();
            }
            
            return false;
        } finally {
            this.isNavigating = false;
        }
    }

    /**
     * ناوبری با نام route
     */
    async navigateByName(name, params = {}, query = {}) {
        const route = this.routes.get(name);
        if (!route) {
            throw new Error(`Route with name "${name}" not found`);
        }

        // ساخت مسیر با پارامترها
        let path = route.path;
        Object.keys(params).forEach(key => {
            path = path.replace(`:${key}`, params[key]);
        });

        // اضافه کردن query string
        if (Object.keys(query).length > 0) {
            const queryString = new URLSearchParams(query).toString();
            path += `?${queryString}`;
        }

        return await this.navigateTo(path);
    }

    /**
     * بازگشت به صفحه قبل
     */
    async goBack() {
        if (this.history.length > 1) {
            this.history.pop(); // حذف موقعیت فعلی
            const previous = this.history[this.history.length - 1];
            return await this.navigateTo(previous.fullPath, { replace: true });
        }
        
        return await this.navigateTo('/');
    }

    /**
     * دریافت route فعلی
     */
    getCurrentRoute() {
        return this.currentRoute;
    }

    /**
     * دریافت route قبلی
     */
    getPreviousRoute() {
        return this.previousRoute;
    }

    /**
     * بررسی وجود route
     */
    hasRoute(path) {
        return !!this._resolvePath(path);
    }

    /**
     * اضافه کردن middleware
     */
    addMiddleware(middleware) {
        if (!middleware.beforeEnter && !middleware.afterEnter && !middleware.beforeLeave) {
            throw new Error('Middleware must implement at least one hook');
        }
        
        this.middlewares.push(middleware);
        return this;
    }

    /**
     * اضافه کردن guard
     */
    addGuard(guard) {
        if (!guard.canNavigate) {
            throw new Error('Guard must implement canNavigate method');
        }
        
        this.guards.push(guard);
        return this;
    }

    // ============ Private Methods ============

    /**
     * تنظیم event listeners
     * @private
     */
    _setupEventListeners() {
        // رویداد تغییر hash
        window.addEventListener('hashchange', () => {
            if (this.mode === 'hash') {
                const hash = window.location.hash.substring(1) || '/';
                this.navigateTo(hash, { replace: true });
            }
        });

        // رویداد تغییر history
        window.addEventListener('popstate', () => {
            if (this.mode === 'history') {
                const path = window.location.pathname.replace(this.base, '') || '/';
                this.navigateTo(path, { replace: true });
            }
        });

        // جلوگیری از reload صفحه
        window.addEventListener('beforeunload', (event) => {
            if (this.isNavigating) {
                event.preventDefault();
                event.returnValue = 'در حال انتقال به صفحه دیگر...';
            }
        });
    }

    /**
     * پردازش مسیر اولیه
     * @private
     */
    _processInitialRoute() {
        let initialPath = '/';
        
        if (this.mode === 'hash') {
            initialPath = window.location.hash.substring(1) || '/';
        } else if (this.mode === 'history') {
            initialPath = window.location.pathname.replace(this.base, '') || '/';
        }
        
        this.currentRoute = this._resolvePath(initialPath) || this._resolvePath('/');
    }

    /**
     * رندر route فعلی
     * @private
     */
    async _renderCurrentRoute() {
        if (!this.currentRoute?.route?.component) {
            console.error('No component to render');
            return;
        }

        const component = this.currentRoute.route.component;
        
        // یافتن المنت رندر
        const appElement = document.getElementById('app');
        if (!appElement) {
            console.error('App element not found');
            return;
        }

        // پاک کردن محتوای قبلی
        appElement.innerHTML = '';

        // رندر کامپوننت
        if (typeof component === 'function') {
            const renderedComponent = await component(this.currentRoute);
            if (renderedComponent) {
                appElement.appendChild(renderedComponent);
            }
        } else if (component instanceof HTMLElement) {
            appElement.appendChild(component);
        } else if (typeof component === 'string') {
            appElement.innerHTML = component;
        }
    }

    /**
     * resolve کردن مسیر
     * @private
     */
    _resolvePath(path) {
        // حذف base از مسیر
        let cleanPath = path;
        if (this.mode === 'history' && path.startsWith(this.base)) {
            cleanPath = path.substring(this.base.length);
        }

        // جستجوی بین routes
        for (const route of this.routes.values()) {
            const match = route.match(cleanPath);
            if (match) {
                return {
                    ...match,
                    fullPath: path,
                    path: cleanPath
                };
            }
        }

        // جستجوی در routeهای child
        for (const route of this.routes.values()) {
            for (const childRoute of route.children) {
                const match = childRoute.match(cleanPath);
                if (match) {
                    return {
                        ...match,
                        fullPath: path,
                        path: cleanPath
                    };
                }
            }
        }

        return null;
    }

    /**
     * اجرای middlewares
     * @private
     */
    async _runMiddlewares(hook, to, from) {
        for (const middleware of this.middlewares) {
            if (middleware[hook]) {
                try {
                    await middleware[hook](to, from, () => {});
                } catch (error) {
                    console.error(`Middleware error in ${hook}:`, error);
                }
            }
        }
    }

    /**
     * بررسی guards
     * @private
     */
    async _checkGuards(to, from) {
        for (const guard of this.guards) {
            const result = await guard.canNavigate(to, from);
            if (!result.allowed) {
                return result;
            }
        }
        
        return { allowed: true };
    }

    /**
     * به‌روزرسانی URL مرورگر
     * @private
     */
    _updateBrowserUrl(path, options) {
        const fullPath = this.mode === 'hash' 
            ? `#${path}` 
            : `${this.base}${path}`.replace(/\/\//g, '/');

        if (options.replace) {
            window.history.replaceState({}, '', fullPath);
        } else {
            window.history.pushState({}, '', fullPath);
        }
    }

    /**
     * افزودن به تاریخچه
     * @private
     */
    _addToHistory(route) {
        this.history.push({
            path: route.path,
            fullPath: route.fullPath,
            name: route.route.name,
            timestamp: Date.now()
        });

        // حفظ اندازه تاریخچه
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
    }

    /**
     * انتشار event ناوبری
     * @private
     */
    _emitNavigationEvent(to, from, navigationId) {
        const event = new CustomEvent('router:navigation', {
            detail: {
                to,
                from,
                navigationId,
                timestamp: Date.now()
            }
        });
        
        window.dispatchEvent(event);
    }
}

// ============ Router Factory ============
class RouterFactory {
    static create(options = {}) {
        const router = new Router(options);
        
        // اضافه کردن routeهای پیش‌فرض
        if (options.routes) {
            options.routes.forEach(route => {
                router.addRoute(route.path, route.component, route);
            });
        }
        
        // اضافه کردن middlewares پیش‌فرض
        if (options.stateManager) {
            router.addMiddleware(new LoadingMiddleware(options.stateManager));
            router.addMiddleware(new AnalyticsMiddleware());
        }
        
        return router;
    }
}

// ============ Export ============
export {
    Router,
    RouterFactory,
    Route,
    IRoute,
    IMiddleware,
    INavigationGuard,
    AuthGuard,
    RoleGuard,
    LoggingMiddleware,
    LoadingMiddleware,
    AnalyticsMiddleware
};
