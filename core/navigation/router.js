// core/navigation/router.js
/**
 * Router - سیستم مسیریابی پیشرفته برای PWA
 * مسئولیت: مدیریت ناوبری، مسیرهای تو در تو، Middleware، Lazy Loading، Cache، Transition و پارامترها
 * اصل SRP: فقط مدیریت مسیریابی و ناوبری
 * اصل OCP: قابل توسعه برای انواع Route و Middleware
 * اصل DIP: وابستگی به اینترفیس‌های Route و Middleware
 * اصل LSP: قابلیت جایگزینی Routeهای مختلف
 * اصل ISP: اینترفیس‌های کوچک و مجزا
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
    async loadComponent() {}
    unloadComponent() {}
}

class IMiddleware {
    async beforeEnter(to, from, next) {}
    async afterEnter(to, from) {}
    async beforeLeave(to, from, next) {}
}

class INavigationGuard {
    async canNavigate(to, from) {}
}

// ============ Route Validator ============
class RouteValidator {
    static validateRoute(route) {
        const errors = [];

        if (!route.path) {
            errors.push('مسیر نمی‌تواند خالی باشد');
        }

        if (!route.component) {
            errors.push('کامپوننت الزامی است');
        } else if (typeof route.component !== 'function' && 
                   !(route.component instanceof HTMLElement) && 
                   typeof route.component !== 'string' &&
                   !(route.component?.name === 'lazyLoader')) {
            errors.push('کامپوننت باید تابع، المان HTML، رشته یا lazy loader باشد');
        }

        if (route.name && typeof route.name !== 'string') {
            errors.push('نام مسیر باید رشته باشد');
        }

        if (route.children && !Array.isArray(route.children)) {
            errors.push('children باید آرایه باشد');
        }

        if (route.path.includes(':')) {
            const paramPattern = /:([^/]+)/g;
            let match;
            const params = new Set();
            
            while ((match = paramPattern.exec(route.path)) !== null) {
                const paramName = match[1];
                if (params.has(paramName)) {
                    errors.push(`پارامتر تکراری ${paramName} در مسیر`);
                }
                params.add(paramName);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    static validateRoutes(routes) {
        const results = [];
        routes.forEach(route => {
            results.push({
                path: route.path,
                ...this.validateRoute(route)
            });
        });
        return results;
    }
}

// ============ Route Cache ============
class RouteCache {
    constructor(maxSize = 10) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.accessOrder = [];
    }

    get(key) {
        if (this.cache.has(key)) {
            this.accessOrder = this.accessOrder.filter(k => k !== key);
            this.accessOrder.push(key);
            return this.cache.get(key);
        }
        return null;
    }

    set(key, component) {
        if (this.cache.size >= this.maxSize) {
            const oldest = this.accessOrder.shift();
            if (oldest && this.cache.has(oldest)) {
                const oldRoute = this.cache.get(oldest);
                if (oldRoute?.unloadComponent) {
                    oldRoute.unloadComponent();
                }
                this.cache.delete(oldest);
            }
        }

        this.cache.set(key, component);
        this.accessOrder = this.accessOrder.filter(k => k !== key);
        this.accessOrder.push(key);
    }

    clear() {
        for (const [key, route] of this.cache.entries()) {
            if (route?.unloadComponent) {
                route.unloadComponent();
            }
        }
        this.cache.clear();
        this.accessOrder = [];
    }

    has(key) {
        return this.cache.has(key);
    }

    size() {
        return this.cache.size;
    }
}

// ============ Route Implementation ============
class Route extends IRoute {
    constructor(path, component, options = {}) {
        // اعتبارسنجی
        const validation = RouteValidator.validateRoute({ path, component, ...options });
        if (!validation.isValid) {
            throw new Error(`مسیر نامعتبر: ${validation.errors.join(', ')}`);
        }

        super(path, component, options);
        this._regex = this._pathToRegex(path);
        this._paramNames = this._extractParamNames(path);
        this._loadedComponent = null;
        this._loadingPromise = null;
        this._children = (options.children || []).map(child => 
            new Route(child.path, child.component, child)
        );
    }

    /**
     * بررسی تطابق مسیر
     */
    match(currentPath) {
        const [pathWithoutQuery] = currentPath.split('?');
        const match = pathWithoutQuery.match(this._regex);
        
        if (!match) return null;

        const params = {};
        this._paramNames.forEach((name, index) => {
            params[name] = decodeURIComponent(match[index + 1] || '');
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
        const [pathWithoutQuery] = path.split('?');
        const match = pathWithoutQuery.match(this._regex);
        if (!match) return {};

        const params = {};
        this._paramNames.forEach((name, index) => {
            params[name] = decodeURIComponent(match[index + 1] || '');
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
            children: this._children.map(child => child.toRouteObject()),
            redirect: this.redirect,
            alias: this.alias
        };
    }

    /**
     * بارگذاری کامپوننت (با پشتیبانی از lazy loading)
     */
    async loadComponent() {
        if (this._loadedComponent) return this._loadedComponent;
        if (this._loadingPromise) return this._loadingPromise;

        this._loadingPromise = (async () => {
            try {
                if (typeof this.component === 'function' && this.component.name === 'lazyLoader') {
                    const module = await this.component();
                    this._loadedComponent = module.default || module;
                } else {
                    this._loadedComponent = this.component;
                }
                return this._loadedComponent;
            } catch (error) {
                console.error(`❌ خطا در بارگذاری کامپوننت مسیر ${this.path}:`, error);
                throw error;
            } finally {
                this._loadingPromise = null;
            }
        })();

        return this._loadingPromise;
    }

    /**
     * پاک کردن کامپوننت بارگذاری شده
     */
    unloadComponent() {
        this._loadedComponent = null;
        this._loadingPromise = null;
    }

    /**
     * بررسی lazy بودن کامپوننت
     */
    isLazy() {
        return typeof this.component === 'function' && this.component.name === 'lazyLoader';
    }

    /**
     * دریافت فرزندان
     */
    get children() {
        return this._children;
    }

    /**
     * تبدیل مسیر به regex
     */
    _pathToRegex(path) {
        const pattern = path
            .replace(/:([^\/]+)/g, '([^/?#]+)')
            .replace(/\*/g, '.*');
        
        return new RegExp(`^${pattern}$`);
    }

    /**
     * استخراج نام پارامترها
     */
    _extractParamNames(path) {
        const paramNames = [];
        const paramPattern = /:([^/]+)/g;
        let match;
        
        while ((match = paramPattern.exec(path)) !== null) {
            paramNames.push(match[1]);
        }
        
        return paramNames;
    }

    /**
     * استخراج query string
     */
    _extractQuery(path) {
        const query = {};
        const queryIndex = path.indexOf('?');
        
        if (queryIndex !== -1) {
            const queryStr = path.substring(queryIndex + 1).split('#')[0];
            const params = new URLSearchParams(queryStr);
            
            params.forEach((value, key) => {
                query[key] = value;
            });
        }
        
        return query;
    }

    /**
     * استخراج hash
     */
    _extractHash(path) {
        const hashIndex = path.indexOf('#');
        return hashIndex !== -1 ? path.substring(hashIndex + 1) : '';
    }
}

// ============ Scroll Behavior ============
class ScrollBehavior {
    constructor(options = {}) {
        this.scrollToTop = options.scrollToTop ?? true;
        this.smoothScroll = options.smoothScroll ?? true;
        this.saveScrollPosition = options.saveScrollPosition ?? true;
        this.scrollPositions = new Map();
        this.scrollDelay = options.scrollDelay || 100;
    }

    async handleScroll(to, from) {
        if (this.saveScrollPosition && from) {
            const scrollY = window.scrollY;
            const scrollX = window.scrollX;
            this.scrollPositions.set(from.fullPath, { x: scrollX, y: scrollY });
        }

        // تاخیر کوتاه برای اطمینان از رندر کامل صفحه
        await new Promise(resolve => setTimeout(resolve, this.scrollDelay));

        if (this.saveScrollPosition && this.scrollPositions.has(to.fullPath)) {
            const { x, y } = this.scrollPositions.get(to.fullPath);
            window.scrollTo({
                top: y,
                left: x,
                behavior: this.smoothScroll ? 'smooth' : 'auto'
            });
        } 
        else if (this.scrollToTop) {
            const focusedElement = document.querySelector(':focus');
            if (focusedElement) {
                focusedElement.blur();
            }
            
            window.scrollTo({
                top: 0,
                left: 0,
                behavior: this.smoothScroll ? 'smooth' : 'auto'
            });

            const appElement = document.getElementById('app');
            if (appElement) {
                appElement.setAttribute('tabindex', '-1');
                appElement.focus({ preventScroll: true });
            }
        }
    }

    clearPosition(path) {
        this.scrollPositions.delete(path);
    }

    clearAll() {
        this.scrollPositions.clear();
    }
}

// ============ Breadcrumb Manager ============
class BreadcrumbManager {
    constructor() {
        this.breadcrumbs = [];
        this.updateCallbacks = [];
        this.routes = null;
    }

    generateBreadcrumbs(route, routes) {
        if (routes) this.routes = routes;
        
        const breadcrumbs = [];
        let currentPath = '';
        
        const pathSegments = route.path.split('/').filter(Boolean);
        
        for (let i = 0; i < pathSegments.length; i++) {
            const segment = pathSegments[i];
            currentPath += `/${segment}`;
            
            const matchedRoute = this._findMatchingRoute(currentPath);
            
            breadcrumbs.push({
                name: matchedRoute?.route?.meta?.breadcrumb || this._formatSegment(segment),
                path: currentPath,
                params: this._extractParamsForSegment(matchedRoute, segment, i),
                isClickable: !!matchedRoute
            });
        }

        this.breadcrumbs = breadcrumbs;
        this._notifyUpdate();
        
        return breadcrumbs;
    }

    getBreadcrumbs() {
        return this.breadcrumbs;
    }

    onUpdate(callback) {
        this.updateCallbacks.push(callback);
        return () => {
            this.updateCallbacks = this.updateCallbacks.filter(cb => cb !== callback);
        };
    }

    _notifyUpdate() {
        this.updateCallbacks.forEach(cb => cb(this.breadcrumbs));
    }

    _findMatchingRoute(path) {
        if (!this.routes) return null;
        
        for (const route of this.routes.values()) {
            const match = route.match(path);
            if (match) return match;
            
            for (const childRoute of route.children) {
                const childMatch = childRoute.match(path);
                if (childMatch) return childMatch;
            }
        }
        return null;
    }

    _formatSegment(segment) {
        return segment
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    _extractParamsForSegment(route, segment, index) {
        const params = {};
        if (route?.route?._paramNames && route.route._paramNames.length > index) {
            params[route.route._paramNames[index]] = segment;
        }
        return params;
    }
}

// ============ Navigation Guards ============
class AuthGuard extends INavigationGuard {
    constructor(authService) {
        super();
        this.authService = authService;
    }

    async canNavigate(to, from) {
        if (!to.route.meta?.requiresAuth) {
            return { allowed: true };
        }

        try {
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
        } catch (error) {
            console.error('خطا در بررسی احراز هویت:', error);
            return {
                allowed: false,
                redirect: { name: 'error' },
                reason: 'خطا در بررسی احراز هویت'
            };
        }
    }
}

class RoleGuard extends INavigationGuard {
    constructor(userService) {
        super();
        this.userService = userService;
    }

    async canNavigate(to, from) {
        const requiredRole = to.route.meta?.requiredRole;
        
        if (!requiredRole) {
            return { allowed: true };
        }

        try {
            const userRole = await this._getUserRole();
            
            if (userRole !== requiredRole) {
                return {
                    allowed: false,
                    redirect: { name: 'forbidden' },
                    reason: 'دسترسی غیرمجاز'
                };
            }

            return { allowed: true };
        } catch (error) {
            console.error('خطا در بررسی نقش کاربر:', error);
            return {
                allowed: false,
                redirect: { name: 'error' },
                reason: 'خطا در بررسی سطح دسترسی'
            };
        }
    }

    async _getUserRole() {
        // TODO: پیاده‌سازی واقعی دریافت نقش کاربر
        return 'user';
    }
}

class PermissionGuard extends INavigationGuard {
    constructor(permissionService) {
        super();
        this.permissionService = permissionService;
    }

    async canNavigate(to, from) {
        const requiredPermissions = to.route.meta?.permissions || [];
        
        if (requiredPermissions.length === 0) {
            return { allowed: true };
        }

        try {
            const hasPermission = await this._checkPermissions(requiredPermissions);
            
            if (!hasPermission) {
                return {
                    allowed: false,
                    redirect: { name: 'forbidden' },
                    reason: 'شما مجوز دسترسی به این صفحه را ندارید'
                };
            }

            return { allowed: true };
        } catch (error) {
            console.error('خطا در بررسی مجوزها:', error);
            return {
                allowed: false,
                redirect: { name: 'error' },
                reason: 'خطا در بررسی مجوزهای دسترسی'
            };
        }
    }

    async _checkPermissions(permissions) {
        // TODO: پیاده‌سازی واقعی بررسی مجوزها
        return true;
    }
}

// ============ Middlewares ============
class LoggingMiddleware extends IMiddleware {
    async beforeEnter(to, from, next) {
        console.group(`🚦 [Router] Navigation from ${from?.path || '/'} to ${to.path}`);
        console.log(`📌 Route: ${to.route.name || 'unnamed'}`);
        console.log(`📊 Params:`, to.params);
        console.log(`🔍 Query:`, to.query);
        console.log(`🏷️ Meta:`, to.route.meta);
        console.groupEnd();
        next();
    }

    async afterEnter(to, from) {
        console.log(`✅ [Router] Successfully navigated to ${to.path}`);
    }

    async beforeLeave(to, from, next) {
        console.log(`👋 [Router] Leaving ${from.path} for ${to.path}`);
        next();
    }
}

class LoadingMiddleware extends IMiddleware {
    constructor(stateManager) {
        super();
        this.stateManager = stateManager;
        this.startTime = null;
    }

    async beforeEnter(to, from, next) {
        this.startTime = Date.now();
        
        await this.stateManager?.dispatch('UI_STATE_CHANGE', {
            isLoading: true,
            loadingMessage: 'در حال بارگذاری...',
            loadingProgress: 0
        });
        
        next();
    }

    async afterEnter(to, from) {
        const loadTime = Date.now() - (this.startTime || Date.now());
        
        await this.stateManager?.dispatch('UI_STATE_CHANGE', {
            isLoading: false,
            loadingMessage: null,
            loadingProgress: 100,
            lastLoadTime: loadTime
        });

        if (loadTime > 500) {
            console.warn(`⚠️ بارگذاری صفحه ${to.path} ${loadTime}ms طول کشید`);
        }
    }

    async beforeLeave(to, from, next) {
        setTimeout(() => next(), 50);
    }
}

class TransitionMiddleware extends IMiddleware {
    constructor(options = {}) {
        super();
        this.duration = options.duration || 300;
        this.easing = options.easing || 'ease-in-out';
        this.animationClass = options.animationClass || 'page-transition';
    }

    async beforeLeave(to, from, next) {
        const appElement = document.getElementById('app');
        if (appElement) {
            appElement.style.transition = `opacity ${this.duration}ms ${this.easing}`;
            appElement.style.opacity = '0';
            appElement.classList.add(this.animationClass, 'page-exit');
            
            await new Promise(resolve => setTimeout(resolve, this.duration));
        }
        next();
    }

    async afterEnter(to, from) {
        const appElement = document.getElementById('app');
        if (appElement) {
            appElement.style.transition = `opacity ${this.duration}ms ${this.easing}`;
            appElement.style.opacity = '1';
            appElement.classList.add(this.animationClass, 'page-enter');
            
            setTimeout(() => {
                appElement.classList.remove(this.animationClass, 'page-enter', 'page-exit');
                appElement.style.transition = '';
            }, this.duration);
        }
    }
}

class TitleMiddleware extends IMiddleware {
    constructor(options = {}) {
        super();
        this.defaultTitle = options.defaultTitle || 'Farsinglish';
        this.titleSeparator = options.titleSeparator || ' | ';
        this.appendDefault = options.appendDefault ?? true;
    }

    async afterEnter(to, from) {
        let title = to.route.meta?.title || '';
        
        if (title) {
            Object.keys(to.params || {}).forEach(key => {
                title = title.replace(`:${key}`, to.params[key]);
            });
        }

        if (this.appendDefault && title) {
            title = `${title}${this.titleSeparator}${this.defaultTitle}`;
        } else if (!title) {
            title = this.defaultTitle;
        }

        document.title = title;

        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription && to.route.meta?.description) {
            metaDescription.setAttribute('content', to.route.meta.description);
        }

        const metaKeywords = document.querySelector('meta[name="keywords"]');
        if (metaKeywords && to.route.meta?.keywords) {
            metaKeywords.setAttribute('content', to.route.meta.keywords.join(', '));
        }

        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical && to.route.meta?.canonical) {
            canonical.setAttribute('href', to.route.meta.canonical);
        }
    }
}

class AnalyticsMiddleware extends IMiddleware {
    constructor(analyticsService) {
        super();
        this.analyticsService = analyticsService;
    }

    async afterEnter(to, from) {
        const analyticsData = {
            page: to.route.name || to.path,
            title: document.title,
            timestamp: new Date().toISOString(),
            params: to.params,
            query: to.query,
            referrer: from?.fullPath || document.referrer,
            loadTime: performance.now()
        };

        if (this.analyticsService) {
            await this.analyticsService.trackPageView(analyticsData);
        } else {
            console.log('[Analytics] Page view:', analyticsData);
        }
    }
}

// ============ Router Class ============
class Router {
    constructor(options = {}) {
        this.routes = new Map();
        this.currentRoute = null;
        this.previousRoute = null;
        this.history = [];
        this.mode = options.mode || 'hash';
        this.base = options.base || '/';
        this.middlewares = [...(options.middlewares || [])];
        this.guards = [...(options.guards || [])];
        this.isNavigating = false;
        this.maxHistorySize = options.maxHistorySize || 50;
        this.routeCache = new RouteCache(options.cacheSize || 10);
        this.cacheEnabled = options.cacheEnabled ?? true;
        this.scrollBehavior = options.scrollBehavior || new ScrollBehavior();
        this.breadcrumbManager = new BreadcrumbManager();
        this.notFoundRoute = options.notFoundRoute || null;
        this.errorHandler = options.errorHandler || null;

        // اضافه کردن middleware پیش‌فرض
        if (options.enableLogging !== false) {
            this.middlewares.push(new LoggingMiddleware());
        }

        this._setupEventListeners();
    }

    /**
     * ایجاد lazy loader
     */
    lazy(loader) {
        const lazyLoader = async () => {
            try {
                const module = await loader();
                return module.default || module;
            } catch (error) {
                console.error('❌ خطا در lazy loading:', error);
                throw error;
            }
        };
        
        Object.defineProperty(lazyLoader, 'name', { value: 'lazyLoader' });
        return lazyLoader;
    }

    /**
     * افزودن route جدید
     */
    addRoute(path, component, options = {}) {
        try {
            const route = new Route(path, component, options);
            
            if (options.name) {
                if (this.routes.has(options.name)) {
                    console.warn(`⚠️ Route با نام ${options.name} از قبل وجود دارد و بازنویسی می‌شود`);
                }
                this.routes.set(options.name, route);
            }
            
            this.routes.set(path, route);
            
            console.log(`✅ Route added: ${path} (${options.name || 'unnamed'})`);
            
            return this;
        } catch (error) {
            console.error(`❌ خطا در افزودن route ${path}:`, error);
            if (this.errorHandler) {
                this.errorHandler(error);
            }
            return this;
        }
    }

    /**
     * افزودن چند route به صورت همزمان
     */
    addRoutes(routes) {
        routes.forEach(route => {
            this.addRoute(route.path, route.component, route);
        });
        return this;
    }

    /**
     * شروع مسیریابی
     */
    start() {
        try {
            this._processInitialRoute();
            this._renderCurrentRoute();
            
            // اتصال breadcrumb manager به routes
            this.breadcrumbManager.routes = this.routes;
            
            console.log('🚀 Router started in', this.mode, 'mode');
            
            return this;
        } catch (error) {
            console.error('❌ خطا در شروع مسیریابی:', error);
            if (this.errorHandler) {
                this.errorHandler(error);
            }
            return this;
        }
    }

    /**
     * ناوبری به مسیر جدید
     */
    async navigateTo(path, options = {}) {
        if (this.isNavigating) {
            console.warn('⚠️ Navigation already in progress');
            return false;
        }

        this.isNavigating = true;
        const navigationId = Date.now();

        try {
            const to = this._resolvePath(path);
            
            if (!to) {
                if (this.notFoundRoute) {
                    return await this.navigateTo(this.notFoundRoute);
                }
                throw new Error(`Route not found: ${path}`);
            }

            const guardResult = await this._checkGuards(to, this.currentRoute);
            if (!guardResult.allowed) {
                if (guardResult.redirect) {
                    return await this.navigateTo(
                        typeof guardResult.redirect === 'string' 
                            ? guardResult.redirect 
                            : this._buildPathFromRoute(guardResult.redirect)
                    );
                }
                throw new Error(`Navigation blocked: ${guardResult.reason}`);
            }

            await this._runMiddlewares('beforeLeave', this.currentRoute, to);

            this.previousRoute = this.currentRoute;
            this.currentRoute = to;

            this._updateBrowserUrl(to.fullPath, options);
            this._addToHistory(to);

            await this._runMiddlewares('beforeEnter', to, this.previousRoute);

            const renderSuccess = await this._renderCurrentRoute();
            if (!renderSuccess) {
                throw new Error('Failed to render route');
            }

            await this.scrollBehavior.handleScroll(to, this.previousRoute);
            
            await this._runMiddlewares('afterEnter', to, this.previousRoute);

            this._emitNavigationEvent(to, this.previousRoute, navigationId);

            return true;

        } catch (error) {
            console.error('❌ Navigation failed:', error);
            
            if (this.previousRoute) {
                this.currentRoute = this.previousRoute;
                await this._renderCurrentRoute();
            }
            
            if (this.errorHandler) {
                this.errorHandler(error);
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

        let path = route.path;
        Object.keys(params).forEach(key => {
            path = path.replace(`:${key}`, encodeURIComponent(params[key]));
        });

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
            this.history.pop();
            const previous = this.history[this.history.length - 1];
            return await this.navigateTo(previous.fullPath, { replace: true });
        }
        
        return await this.navigateTo('/');
    }

    /**
     * رفتن به جلو در تاریخچه
     */
    async goForward() {
        // TODO: پیاده‌سازی forward
        return false;
    }

    /**
     * بازگشت به تعداد مشخصی صفحه
     */
    async go(delta) {
        const targetIndex = this.history.length - 1 + delta;
        if (targetIndex >= 0 && targetIndex < this.history.length) {
            const target = this.history[targetIndex];
            return await this.navigateTo(target.fullPath, { replace: true });
        }
        return false;
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
     * دریافت route با نام
     */
    getRouteByName(name) {
        return this.routes.get(name) || null;
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

    /**
     * دریافت breadcrumbs
     */
    getBreadcrumbs() {
        return this.breadcrumbManager.getBreadcrumbs();
    }

    /**
     * پاک کردن کش
     */
    clearCache() {
        this.routeCache.clear();
    }

    /**
     * بازنشانی مسیریاب
     */
    reset() {
        this.currentRoute = null;
        this.previousRoute = null;
        this.history = [];
        this.routeCache.clear();
        this.isNavigating = false;
        
        this._processInitialRoute();
        this._renderCurrentRoute();
    }

    // ============ Private Methods ============

    /**
     * تنظیم event listeners
     */
    _setupEventListeners() {
        window.addEventListener('hashchange', () => {
            if (this.mode === 'hash' && !this.isNavigating) {
                const hash = window.location.hash.substring(1) || '/';
                this.navigateTo(hash, { replace: true });
            }
        });

        window.addEventListener('popstate', () => {
            if (this.mode === 'history' && !this.isNavigating) {
                const path = window.location.pathname.replace(this.base, '') || '/';
                this.navigateTo(path, { replace: true });
            }
        });

        window.addEventListener('beforeunload', (event) => {
            if (this.isNavigating) {
                event.preventDefault();
                event.returnValue = 'در حال انتقال به صفحه دیگر...';
            }
        });

        window.addEventListener('offline', () => {
            console.warn('⚠️ اتصال به اینترنت قطع شد');
        });

        window.addEventListener('online', () => {
            console.log('✅ اتصال به اینترنت برقرار شد');
            // TODO: می‌توان route فعلی را مجدداً بارگذاری کرد
        });
    }

    /**
     * پردازش مسیر اولیه
     */
    _processInitialRoute() {
        let initialPath = '/';
        
        if (this.mode === 'hash') {
            initialPath = window.location.hash.substring(1) || '/';
        } else if (this.mode === 'history') {
            initialPath = window.location.pathname.replace(this.base, '') || '/';
        }
        
        this.currentRoute = this._resolvePath(initialPath) || this._resolvePath('/');
        
        if (!this.currentRoute && this.notFoundRoute) {
            this.currentRoute = this._resolvePath(this.notFoundRoute);
        }
    }

    /**
     * رندر route فعلی
     */
    async _renderCurrentRoute() {
        if (!this.currentRoute?.route) {
            console.error('❌ No route to render');
            return false;
        }

        const appElement = document.getElementById('app');
        if (!appElement) {
            console.error('❌ App element (#app) not found');
            return false;
        }

        try {
            const cacheKey = this.currentRoute.fullPath;
            
            // بررسی کش
            if (this.cacheEnabled) {
                const cached = this.routeCache.get(cacheKey);
                if (cached) {
                    appElement.innerHTML = '';
                    
                    if (cached instanceof Node) {
                        appElement.appendChild(cached.cloneNode(true));
                    } else {
                        appElement.appendChild(cached);
                    }
                    
                    this.breadcrumbManager.generateBreadcrumbs(this.currentRoute, this.routes);
                    return true;
                }
            }

            // بارگذاری کامپوننت
            const component = await this.currentRoute.route.loadComponent();
            
            // پاک کردن محتوای قبلی
            appElement.innerHTML = '';

            // رندر کامپوننت
            let renderedComponent;
            
            if (typeof component === 'function') {
                renderedComponent = await component(this.currentRoute);
            } else if (component instanceof HTMLElement) {
                renderedComponent = component.cloneNode(true);
            } else if (typeof component === 'string') {
                appElement.innerHTML = component;
                renderedComponent = appElement.firstChild;
            }

            if (renderedComponent) {
                if (!(renderedComponent instanceof Node)) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = renderedComponent;
                    renderedComponent = tempDiv.firstChild;
                }
                
                appElement.appendChild(renderedComponent);
                
                // ذخیره در کش
                if (this.cacheEnabled) {
                    this.routeCache.set(cacheKey, renderedComponent.cloneNode(true));
                }
            }

            // تولید breadcrumbs
            this.breadcrumbManager.generateBreadcrumbs(this.currentRoute, this.routes);

            return true;

        } catch (error) {
            console.error('❌ خطا در رندر route:', error);
            
            appElement.innerHTML = `
                <div class="error-container">
                    <h2>خطا در بارگذاری صفحه</h2>
                    <p>${error.message}</p>
                    <button onclick="window.location.reload()">تلاش مجدد</button>
                </div>
            `;
            
            return false;
        }
    }

    /**
     * resolve کردن مسیر
     */
    _resolvePath(path) {
        let cleanPath = path;
        
        if (this.mode === 'history' && path.startsWith(this.base)) {
            cleanPath = path.substring(this.base.length);
        }

        // حذف hash و query برای تطابق
        const pathWithoutHash = cleanPath.split('#')[0];
        const pathWithoutQuery = pathWithoutHash.split('?')[0];

        for (const route of this.routes.values()) {
            const match = route.match(cleanPath);
            if (match) {
                return {
                    ...match,
                    fullPath: cleanPath,
                    path: pathWithoutQuery
                };
            }
        }

        for (const route of this.routes.values()) {
            for (const childRoute of route.children) {
                const match = childRoute.match(cleanPath);
                if (match) {
                    return {
                        ...match,
                        fullPath: cleanPath,
                        path: pathWithoutQuery
                    };
                }
            }
        }

        return null;
    }

    /**
     * ساخت مسیر از آبجکت route
     */
    _buildPathFromRoute(routeConfig) {
        if (typeof routeConfig === 'string') return routeConfig;
        
        const route = this.routes.get(routeConfig.name);
        if (!route) return '/';
        
        let path = route.path;
        if (routeConfig.params) {
            Object.keys(routeConfig.params).forEach(key => {
                path = path.replace(`:${key}`, encodeURIComponent(routeConfig.params[key]));
            });
        }
        
        if (routeConfig.query) {
            const queryString = new URLSearchParams(routeConfig.query).toString();
            path += `?${queryString}`;
        }
        
        return path;
    }

    /**
     * اجرای middlewares
     */
    async _runMiddlewares(hook, to, from) {
        const allMiddlewares = [
            ...this.middlewares,
            ...(to?.route?.middlewares || [])
        ];

        for (const middleware of allMiddlewares) {
            if (middleware[hook]) {
                try {
                    await new Promise((resolve, reject) => {
                        const next = (error) => {
                            if (error) reject(error);
                            else resolve();
                        };
                        
                        Promise.resolve(middleware[hook](to, from, next))
                            .then(resolve)
                            .catch(reject);
                    });
                } catch (error) {
                    console.error(`❌ Middleware error in ${hook}:`, error);
                    if (hook === 'beforeLeave' || hook === 'beforeEnter') {
                        throw error;
                    }
                }
            }
        }
    }

    /**
     * بررسی guards
     */
    async _checkGuards(to, from) {
        const allGuards = [
            ...this.guards,
            ...(to?.route?.meta?.guards || [])
        ];

        for (const guard of allGuards) {
            try {
                const result = await guard.canNavigate(to, from);
                if (!result.allowed) {
                    return result;
                }
            } catch (error) {
                console.error('❌ Guard error:', error);
                return {
                    allowed: false,
                    redirect: { name: 'error' },
                    reason: error.message
                };
            }
        }
        
        return { allowed: true };
    }

    /**
     * به‌روزرسانی URL مرورگر
     */
    _updateBrowserUrl(path, options) {
        const fullPath = this.mode === 'hash' 
            ? `#${path}` 
            : `${this.base}${path}`.replace(/\/+/g, '/');

        if (options.replace) {
            window.history.replaceState({}, '', fullPath);
        } else {
            window.history.pushState({}, '', fullPath);
        }
    }

    /**
     * افزودن به تاریخچه
     */
    _addToHistory(route) {
        this.history.push({
            path: route.path,
            fullPath: route.fullPath,
            name: route.route.name,
            timestamp: Date.now()
        });

        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
    }

    /**
     * انتشار event ناوبری
     */
    _emitNavigationEvent(to, from, navigationId) {
        const event = new CustomEvent('router:navigation', {
            detail: {
                to,
                from,
                navigationId,
                timestamp: Date.now(),
                historySize: this.history.length
            },
            bubbles: true,
            cancelable: true
        });
        
        window.dispatchEvent(event);
    }
}

// ============ Router Factory ============
class RouterFactory {
    static create(options = {}) {
        const router = new Router(options);
        
        if (options.routes) {
            router.addRoutes(options.routes);
        }
        
        if (options.stateManager) {
            router.addMiddleware(new LoadingMiddleware(options.stateManager));
        }
        
        if (options.analyticsService) {
            router.addMiddleware(new AnalyticsMiddleware(options.analyticsService));
        }
        
        if (options.authService) {
            router.addGuard(new AuthGuard(options.authService));
        }
        
        if (options.titleMiddleware !== false) {
            router.addMiddleware(new TitleMiddleware({
                defaultTitle: options.defaultTitle,
                appendDefault: options.appendDefaultTitle
            }));
        }
        
        if (options.transitions !== false) {
            router.addMiddleware(new TransitionMiddleware(options.transitionOptions));
        }
        
        return router;
    }

    static createForPWA(options = {}) {
        return RouterFactory.create({
            mode: 'hash',
            enableLogging: false,
            cacheEnabled: true,
            cacheSize: 15,
            ...options
        });
    }

    static createForWeb(options = {}) {
        return RouterFactory.create({
            mode: 'history',
            enableLogging: true,
            cacheEnabled: true,
            ...options
        });
    }
}

// ============ Export ============
export {
    Router,
    RouterFactory,
    Route,
    RouteValidator,
    RouteCache,
    ScrollBehavior,
    BreadcrumbManager,
    IRoute,
    IMiddleware,
    INavigationGuard,
    AuthGuard,
    RoleGuard,
    PermissionGuard,
    LoggingMiddleware,
    LoadingMiddleware,
    TransitionMiddleware,
    TitleMiddleware,
    AnalyticsMiddleware
};
