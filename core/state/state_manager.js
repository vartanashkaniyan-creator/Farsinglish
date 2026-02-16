// core/state/state-manager.js
/**
 * State Manager - مدیریت متمرکز وضعیت برنامه
 * مسئولیت: نگهداری و به‌روزرسانی state مرکزی با الگوی Pub/Sub
 * اصل SRP: فقط مدیریت state و انتشار تغییرات
 * اصل OCP: قابلیت افزودن middleware بدون تغییر کد اصلی
 * اصل DIP: وابستگی به Interface نه پیاده‌سازی
 * اصل LSP: تمام middlewareها و listenerها قابل جایگزینی هستند
 * اصل ISP: اینترفیس‌های کوچک و مجزا
 */

// ============ Interfaces ============
class IStateListener {
    onStateChanged(state, prevState, action) {}
}

class IStateMiddleware {
    beforeUpdate(state, action) {}
    afterUpdate(state, prevState, action) {}
}

// ============ Action Types ============
const ActionTypes = Object.freeze({
    // Auth Actions
    USER_LOGIN: 'USER_LOGIN',
    USER_LOGOUT: 'USER_LOGOUT',
    USER_UPDATE: 'USER_UPDATE',
    USER_REGISTER: 'USER_REGISTER',
    
    // Learning Actions
    LESSON_LOAD: 'LESSON_LOAD',
    LESSON_COMPLETE: 'LESSON_COMPLETE',
    LESSON_PROGRESS: 'LESSON_PROGRESS',
    
    // Progress Actions
    PROGRESS_UPDATE: 'PROGRESS_UPDATE',
    XP_UPDATE: 'XP_UPDATE',
    LEVEL_UPDATE: 'LEVEL_UPDATE',
    STREAK_UPDATE: 'STREAK_UPDATE',
    
    // Settings Actions
    SETTINGS_CHANGE: 'SETTINGS_CHANGE',
    THEME_CHANGE: 'THEME_CHANGE',
    LANGUAGE_CHANGE: 'LANGUAGE_CHANGE',
    
    // UI Actions
    UI_STATE_CHANGE: 'UI_STATE_CHANGE',
    SCREEN_CHANGE: 'SCREEN_CHANGE',
    MODAL_TOGGLE: 'MODAL_TOGGLE',
    TOAST_SHOW: 'TOAST_SHOW',
    TOAST_HIDE: 'TOAST_HIDE',
    
    // Internal Actions
    BATCH_UPDATE: 'BATCH_UPDATE',
    SECTION_LOADED: 'SECTION_LOADED',
    UNDO: 'UNDO',
    REDO: 'REDO',
    RESET: 'RESET',
    SNAPSHOT_RESTORE: 'SNAPSHOT_RESTORE',
    TRANSACTION_ROLLBACK: 'TRANSACTION_ROLLBACK'
});

// ============ Initial State ============
const initialState = Object.freeze({
    // Authentication
    auth: {
        isAuthenticated: false,
        isLoading: false,
        error: null,
        user: null,
        token: null,
        lastLogin: null,
        sessionId: null
    },
    
    // Learning Data
    learning: {
        currentLesson: null,
        lessons: [],
        vocabulary: [],
        completedLessons: [],
        streakDays: 0,
        dailyGoal: 5,
        xp: 0,
        level: 1,
        lastReview: null
    },
    
    // Progress Tracking
    progress: {
        currentProgress: {},
        todayProgress: {
            lessonsCompleted: 0,
            xpEarned: 0,
            timeSpent: 0,
            correctAnswers: 0,
            totalAnswers: 0
        },
        weeklyStats: {
            totalLessons: 0,
            totalXP: 0,
            averageScore: 0,
            bestStreak: 0
        },
        achievements: []
    },
    
    // App Settings
    settings: {
        language: 'fa',
        theme: 'light',
        soundEnabled: true,
        notificationsEnabled: true,
        srsEnabled: true,
        autoPlayAudio: false,
        fontSize: 'medium',
        showHints: true,
        reduceAnimations: false,
        highContrast: false
    },
    
    // UI State
    ui: {
        currentScreen: 'home',
        isLoading: false,
        error: null,
        modal: null,
        sidebarOpen: false,
        toast: null,
        focusedElement: null,
        scrollPosition: {}
    },
    
    // Metadata
    meta: {
        lastUpdated: null,
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    }
});

// ============ State Manager Class ============
class StateManager {
    constructor(options = {}) {
        if (StateManager.instance) {
            return StateManager.instance;
        }
        
        this.state = this._deepClone(initialState);
        this.previousState = this._deepClone(initialState);
        this.listeners = new Set();
        this.middlewares = [];
        this.isUpdating = false;
        
        // History for time travel
        this.history = {
            past: [],  // Previous states
            future: [] // Undone states
        };
        this.maxHistory = options.maxHistory || 50;
        
        // Action history for debugging
        this.actionHistory = [];
        this.maxActionHistory = options.maxActionHistory || 100;
        
        // Computed values
        this.computedValues = new Map();
        this.computedDependencies = new Map();
        
        // Snapshots
        this.snapshots = new Map();
        
        // Selector cache
        this.selectorCache = new Map();
        
        // Batch mode
        this.batchMode = false;
        this.batchedActions = [];
        
        // Lazy loading
        this.loadedSections = new Set();
        this.loadingPromises = new Map();
        
        StateManager.instance = this;
        
        // Add default middlewares in development
        if (options.enableLogging !== false) {
            this.addMiddleware(new PerformanceLoggingMiddleware());
        }
        
        if (options.enablePersistence) {
            this.addMiddleware(new PersistenceMiddleware(options.storageKey));
        }
        
        if (process.env.NODE_ENV === 'development' && options.enableValidation) {
            this.addMiddleware(new DevStateValidator(this));
        }
        
        console.log('State Manager initialized');
    }

    /**
     * دریافت state فعلی (immutable)
     */
    getState() {
        return Object.freeze(this._deepClone(this.state));
    }

    /**
     * دریافت state قبلی
     */
    getPreviousState() {
        return Object.freeze(this._deepClone(this.previousState));
    }

    /**
     * بررسی تغییر state در مسیر مشخص
     */
    hasChanged(path) {
        const [currentValue, previousValue] = this._getValuesByPath(path);
        return !this._isEqual(currentValue, previousValue);
    }

    /**
     * ایجاد selector برای دسترسی بهینه به state
     */
    createSelector(selectorFn) {
        let lastState = null;
        let lastResult = null;
        let lastHash = null;
        
        return () => {
            const currentState = this.state;
            
            // محاسبه hash سریع برای تشخیص تغییر
            const hash = this._quickHash(currentState);
            
            if (currentState !== lastState || hash !== lastHash) {
                lastResult = selectorFn(currentState);
                lastState = currentState;
                lastHash = hash;
            }
            
            return Object.freeze(this._deepClone(lastResult));
        };
    }

    /**
     * انتخاب مستقیم بخشی از state
     */
    select(selectorFn) {
        return Object.freeze(this._deepClone(selectorFn(this.state)));
    }

    /**
     * انتخاب چند بخش از state به صورت همزمان
     */
    selectMany(selectors) {
        const result = {};
        for (const [key, selector] of Object.entries(selectors)) {
            result[key] = this.select(selector);
        }
        return result;
    }

    /**
     * تعریف مقدار محاسبه‌شده
     */
    defineComputed(key, computeFn, dependencies) {
        this.computedValues.set(key, {
            fn: computeFn,
            dependencies,
            value: null,
            lastState: null,
            lastHash: null
        });
        
        this.computedDependencies.set(key, dependencies);
        this._updateComputed(key);
        
        return this;
    }

    /**
     * دریافت مقدار محاسبه‌شده
     */
    getComputed(key) {
        const computed = this.computedValues.get(key);
        if (!computed) {
            throw new Error(`Computed value '${key}' not defined`);
        }
        
        if (this._shouldUpdateComputed(key)) {
            this._updateComputed(key);
        }
        
        return computed.value;
    }

    /**
     * حذف مقدار محاسبه‌شده
     */
    removeComputed(key) {
        this.computedValues.delete(key);
        this.computedDependencies.delete(key);
        return this;
    }

    /**
     * شروع دسته‌ای از تغییرات
     */
    beginBatch() {
        this.batchMode = true;
        this.batchedActions = [];
        return this;
    }

    /**
     * پایان دسته تغییرات
     */
    async endBatch() {
        if (!this.batchMode) {
            console.warn('No batch in progress');
            return this.getState();
        }
        
        this.batchMode = false;
        const actions = [...this.batchedActions];
        this.batchedActions = [];
        
        if (actions.length === 0) {
            return this.getState();
        }
        
        this.isUpdating = true;
        
        try {
            this.previousState = this._deepClone(this.state);
            
            for (const action of actions) {
                this.state = this._reducer(this.state, action);
            }
            
            // اعتبارسنجی
            if (!this._validateState(this.state)) {
                throw new Error('Invalid state after batch update');
            }
            
            // ذخیره در تاریخچه
            this._addToHistory({ type: ActionTypes.BATCH_UPDATE, payload: actions });
            
            // اجرای middlewareها
            for (const middleware of this.middlewares) {
                if (middleware.afterUpdate) {
                    await middleware.afterUpdate(this.state, this.previousState, {
                        type: ActionTypes.BATCH_UPDATE,
                        payload: actions
                    });
                }
            }
            
            // به‌روزرسانی computed values
            this._updateAllComputed();
            
            // اطلاع‌رسانی
            this._notifyListeners({ type: ActionTypes.BATCH_UPDATE, payload: actions });
            
            return this.getState();
            
        } catch (error) {
            console.error('Batch update failed:', error);
            throw error;
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * ایجاد تراکنش برای تغییرات اتمیک
     */
    createTransaction() {
        return new StateTransaction(this);
    }

    /**
     * انتشار action
     */
    async dispatch(type, payload = {}) {
        // بررسی batch mode
        if (this.batchMode) {
            this.batchedActions.push({ type, payload, timestamp: Date.now() });
            return this.getState();
        }
        
        if (this.isUpdating) {
            console.warn('State update already in progress');
            return this.getState();
        }

        this.isUpdating = true;
        const action = { type, payload, timestamp: Date.now() };

        try {
            // قبل از update - middlewareها
            for (const middleware of this.middlewares) {
                if (middleware.beforeUpdate) {
                    await middleware.beforeUpdate(this.state, action);
                }
            }

            // ذخیره state قبلی
            this.previousState = this._deepClone(this.state);
            
            // ذخیره در history برای undo
            if (type !== ActionTypes.UNDO && type !== ActionTypes.REDO && type !== ActionTypes.RESET) {
                this.history.past.push(this._deepClone(this.state));
                if (this.history.past.length > this.maxHistory) {
                    this.history.past.shift();
                }
                // پاک کردن future بعد از action جدید
                this.history.future = [];
            }
            
            // اعمال تغییرات
            const newState = this._reducer(this.state, action);
            
            // اعتبارسنجی
            if (!this._validateState(newState)) {
                throw new Error('Invalid state after update');
            }
            
            this.state = newState;
            
            // ذخیره در تاریخچه اکشن‌ها
            this._addToHistory(action);
            
            // به‌روزرسانی computed values
            this._updateAllComputed();
            
            // بعد از update - middlewareها
            for (const middleware of this.middlewares) {
                if (middleware.afterUpdate) {
                    await middleware.afterUpdate(this.state, this.previousState, action);
                }
            }
            
            // اطلاع‌رسانی
            this._notifyListeners(action);
            
            return this.getState();
            
        } catch (error) {
            console.error('State update failed:', error);
            throw error;
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * بازگشت به state قبلی
     */
    undo() {
        if (this.history.past.length === 0) {
            return { 
                success: false, 
                message: 'No more actions to undo',
                canUndo: false,
                canRedo: this.history.future.length > 0
            };
        }

        // ذخیره state فعلی در future
        this.history.future.unshift(this._deepClone(this.state));
        
        // بازیابی آخرین state از past
        const previousState = this.history.past.pop();
        this.previousState = this._deepClone(this.state);
        this.state = previousState;
        
        this._notifyListeners({ type: ActionTypes.UNDO, payload: null });
        
        // به‌روزرسانی computed values
        this._updateAllComputed();
        
        return { 
            success: true, 
            message: 'Undo successful',
            canUndo: this.history.past.length > 0,
            canRedo: this.history.future.length > 0,
            pastCount: this.history.past.length,
            futureCount: this.history.future.length
        };
    }

    /**
     * جلو رفتن به state بعدی
     */
    redo() {
        if (this.history.future.length === 0) {
            return { 
                success: false, 
                message: 'No more actions to redo',
                canUndo: this.history.past.length > 0,
                canRedo: false
            };
        }

        // ذخیره state فعلی در past
        this.history.past.push(this._deepClone(this.state));
        
        // بازیابی اولین state از future
        const nextState = this.history.future.shift();
        this.previousState = this._deepClone(this.state);
        this.state = nextState;
        
        this._notifyListeners({ type: ActionTypes.REDO, payload: null });
        
        // به‌روزرسانی computed values
        this._updateAllComputed();
        
        return { 
            success: true, 
            message: 'Redo successful',
            canUndo: this.history.past.length > 0,
            canRedo: this.history.future.length > 0,
            pastCount: this.history.past.length,
            futureCount: this.history.future.length
        };
    }

    /**
     * دریافت وضعیت تاریخچه
     */
    getHistoryInfo() {
        return {
            canUndo: this.history.past.length > 0,
            canRedo: this.history.future.length > 0,
            pastCount: this.history.past.length,
            futureCount: this.history.future.length,
            lastAction: this.actionHistory[this.actionHistory.length - 1] || null
        };
    }

    /**
     * ایجاد snapshot
     */
    takeSnapshot(name) {
        const snapshotName = name || `snapshot-${Date.now()}`;
        this.snapshots.set(snapshotName, {
            state: this._deepClone(this.state),
            timestamp: Date.now(),
            history: this._deepClone(this.actionHistory),
            past: this._deepClone(this.history.past),
            future: this._deepClone(this.history.future)
        });
        
        console.log(`📸 Snapshot '${snapshotName}' taken`);
        return snapshotName;
    }

    /**
     * بازگشت به snapshot
     */
    restoreSnapshot(name) {
        const snapshot = this.snapshots.get(name);
        if (!snapshot) {
            throw new Error(`Snapshot '${name}' not found`);
        }
        
        this.previousState = this._deepClone(this.state);
        this.state = this._deepClone(snapshot.state);
        this.actionHistory = this._deepClone(snapshot.history);
        this.history.past = this._deepClone(snapshot.past);
        this.history.future = this._deepClone(snapshot.future);
        
        this._updateAllComputed();
        this._notifyListeners({ type: ActionTypes.SNAPSHOT_RESTORE, payload: { name } });
        
        console.log(`📸 Snapshot '${name}' restored`);
        return true;
    }

    /**
     * دریافت لیست snapshots
     */
    listSnapshots() {
        return Array.from(this.snapshots.entries()).map(([name, data]) => ({
            name,
            timestamp: data.timestamp,
            timeAgo: this._timeAgo(data.timestamp)
        }));
    }

    /**
     * حذف snapshot
     */
    deleteSnapshot(name) {
        return this.snapshots.delete(name);
    }

    /**
     * ثبت listener
     */
    subscribe(listener) {
        if (typeof listener !== 'function' && !listener.onStateChanged) {
            throw new Error('Listener must be a function or implement IStateListener');
        }
        
        this.listeners.add(listener);
        
        return () => this.unsubscribe(listener);
    }

    /**
     * حذف listener
     */
    unsubscribe(listener) {
        this.listeners.delete(listener);
    }

    /**
     * افزودن middleware
     */
    addMiddleware(middleware) {
        if (!middleware.beforeUpdate && !middleware.afterUpdate) {
            throw new Error('Middleware must implement beforeUpdate or afterUpdate');
        }
        
        this.middlewares.push(middleware);
        return this;
    }

    /**
     * حذف middleware
     */
    removeMiddleware(middleware) {
        const index = this.middlewares.indexOf(middleware);
        if (index > -1) {
            this.middlewares.splice(index, 1);
        }
        return this;
    }

    /**
     * پاک‌سازی state
     */
    reset() {
        this.state = this._deepClone(initialState);
        this.previousState = this._deepClone(initialState);
        this.actionHistory = [];
        this.history = { past: [], future: [] };
        this.computedValues.clear();
        this.selectorCache.clear();
        
        this._notifyListeners({ type: ActionTypes.RESET, payload: null });
        console.log('State reset to initial');
        
        return this.getState();
    }

    /**
     * بارگذاری تنبل بخشی از state
     */
    async loadSection(section, loader) {
        if (this.loadedSections.has(section)) {
            return this.select(state => state[section]);
        }
        
        if (this.loadingPromises.has(section)) {
            return this.loadingPromises.get(section);
        }
        
        const promise = (async () => {
            try {
                const data = await loader();
                await this.dispatch(ActionTypes.SECTION_LOADED, {
                    section,
                    data
                });
                this.loadedSections.add(section);
                return data;
            } finally {
                this.loadingPromises.delete(section);
            }
        })();
        
        this.loadingPromises.set(section, promise);
        return promise;
    }

    // ============ Private Methods ============

    /**
     * Reducer اصلی
     */
    _reducer(state, action) {
        const newState = this._deepClone(state);
        
        switch (action.type) {
            // Auth Actions
            case ActionTypes.USER_LOGIN:
            case ActionTypes.USER_REGISTER:
                newState.auth = {
                    ...newState.auth,
                    isAuthenticated: true,
                    isLoading: false,
                    error: null,
                    user: action.payload.user,
                    token: action.payload.token,
                    sessionId: action.payload.sessionId,
                    lastLogin: new Date().toISOString()
                };
                break;
                
            case ActionTypes.USER_LOGOUT:
                newState.auth = {
                    ...initialState.auth,
                    lastLogin: state.auth.lastLogin
                };
                break;
                
            case ActionTypes.USER_UPDATE:
                if (newState.auth.user) {
                    newState.auth.user = {
                        ...newState.auth.user,
                        ...action.payload
                    };
                }
                break;
                
            // Learning Actions
            case ActionTypes.LESSON_LOAD:
                newState.learning.currentLesson = action.payload.lesson;
                newState.ui.currentScreen = 'lesson';
                break;
                
            case ActionTypes.LESSON_COMPLETE:
                const { lessonId, score, xpEarned, timeSpent } = action.payload;
                
                if (!newState.learning.completedLessons.includes(lessonId)) {
                    newState.learning.completedLessons.push(lessonId);
                }
                
                newState.learning.xp += xpEarned;
                newState.learning.level = this._calculateLevel(newState.learning.xp);
                
                newState.progress.todayProgress.lessonsCompleted += 1;
                newState.progress.todayProgress.xpEarned += xpEarned;
                newState.progress.todayProgress.timeSpent += timeSpent || 0;
                
                break;
                
            case ActionTypes.LESSON_PROGRESS:
                if (newState.learning.currentLesson) {
                    newState.learning.currentLesson.progress = action.payload.progress;
                }
                break;
                
            // Progress Actions
            case ActionTypes.XP_UPDATE:
                newState.learning.xp = action.payload.xp;
                newState.learning.level = this._calculateLevel(newState.learning.xp);
                break;
                
            case ActionTypes.STREAK_UPDATE:
                newState.learning.streakDays = action.payload.streak;
                if (action.payload.streak > newState.progress.weeklyStats.bestStreak) {
                    newState.progress.weeklyStats.bestStreak = action.payload.streak;
                }
                break;
                
            // Settings Actions
            case ActionTypes.SETTINGS_CHANGE:
            case ActionTypes.THEME_CHANGE:
            case ActionTypes.LANGUAGE_CHANGE:
                newState.settings = {
                    ...newState.settings,
                    ...action.payload
                };
                break;
                
            // UI Actions
            case ActionTypes.UI_STATE_CHANGE:
                newState.ui = {
                    ...newState.ui,
                    ...action.payload
                };
                break;
                
            case ActionTypes.SCREEN_CHANGE:
                newState.ui.currentScreen = action.payload.screen;
                newState.ui.scrollPosition[action.payload.screen] = 0;
                break;
                
            case ActionTypes.MODAL_TOGGLE:
                newState.ui.modal = action.payload.modal || null;
                break;
                
            case ActionTypes.TOAST_SHOW:
                newState.ui.toast = {
                    message: action.payload.message,
                    type: action.payload.type || 'info',
                    duration: action.payload.duration || 3000,
                    timestamp: Date.now()
                };
                break;
                
            case ActionTypes.TOAST_HIDE:
                newState.ui.toast = null;
                break;
                
            // Internal Actions
            case ActionTypes.SECTION_LOADED:
                newState[action.payload.section] = {
                    ...newState[action.payload.section],
                    ...action.payload.data
                };
                break;
                
            case ActionTypes.RESET:
                return this._deepClone(initialState);
                
            default:
                // ناشناخته بودن action خطا نیست، فقط نادیده می‌گیریم
                break;
        }
        
        newState.meta.lastUpdated = new Date().toISOString();
        
        return newState;
    }

    /**
     * اطلاع‌رسانی به listeners
     */
    _notifyListeners(action) {
        const currentState = this.getState();
        const previousState = this.getPreviousState();
        
        this.listeners.forEach(listener => {
            try {
                if (typeof listener === 'function') {
                    listener(currentState, previousState, action);
                } else if (listener.onStateChanged) {
                    listener.onStateChanged(currentState, previousState, action);
                }
            } catch (error) {
                console.error('Error in state listener:', error);
            }
        });
    }

    /**
     * افزودن به تاریخچه اکشن‌ها
     */
    _addToHistory(action) {
        this.actionHistory.push({
            ...action,
            stateAfter: this._deepClone(this.state)
        });
        
        if (this.actionHistory.length > this.maxActionHistory) {
            this.actionHistory.shift();
        }
    }

    /**
     * به‌روزرسانی تمام مقادیر محاسبه‌شده
     */
    _updateAllComputed() {
        for (const key of this.computedValues.keys()) {
            if (this._shouldUpdateComputed(key)) {
                this._updateComputed(key);
            }
        }
    }

    /**
     * به‌روزرسانی یک مقدار محاسبه‌شده
     */
    _updateComputed(key) {
        const computed = this.computedValues.get(key);
        if (!computed) return;
        
        computed.value = computed.fn(this.state);
    }

    /**
     * بررسی نیاز به به‌روزرسانی مقدار محاسبه‌شده
     */
    _shouldUpdateComputed(key) {
        const computed = this.computedValues.get(key);
        if (!computed || !computed.dependencies) return true;
        
        for (const dep of computed.dependencies) {
            const [current, previous] = this._getValuesByPath(dep);
            if (!this._isEqual(current, previous)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * دریافت مقادیر از مسیر مشخص
     */
    _getValuesByPath(path) {
        const getValue = (obj, path) => {
            return path.split('.').reduce((acc, part) => acc && acc[part], obj);
        };
        
        return [
            getValue(this.state, path),
            getValue(this.previousState, path)
        ];
    }

    /**
     * کلون عمیق
     */
    _deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof RegExp) return new RegExp(obj);
        if (obj instanceof Map) return new Map(obj);
        if (obj instanceof Set) return new Set(obj);
        
        try {
            return structuredClone(obj);
        } catch {
            // Fallback for older browsers
            return JSON.parse(JSON.stringify(obj));
        }
    }

    /**
     * مقایسه عمیق
     */
    _isEqual(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (typeof a !== typeof b) return false;
        
        try {
            return JSON.stringify(a) === JSON.stringify(b);
        } catch {
            return false;
        }
    }

    /**
     * هش سریع برای تشخیص تغییر
     */
    _quickHash(obj) {
        try {
            const str = JSON.stringify(obj);
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return hash.toString(36);
        } catch {
            return Date.now().toString();
        }
    }

    /**
     * محاسبه سطح بر اساس XP
     */
    _calculateLevel(xp) {
        const levels = [
            0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500,
            6600, 7800, 9100, 10500, 12000, 13600, 15300, 17100, 19000
        ];
        
        for (let i = levels.length - 1; i >= 0; i--) {
            if (xp >= levels[i]) {
                return i + 1;
            }
        }
        return 1;
    }

    /**
     * اعتبارسنجی state
     */
    _validateState(state) {
        const requiredKeys = ['auth', 'learning', 'progress', 'settings', 'ui', 'meta'];
        
        for (const key of requiredKeys) {
            if (!state[key] || typeof state[key] !== 'object') {
                console.error(`Invalid state: missing ${key}`);
                return false;
            }
        }
        
        // Type validations
        if (typeof state.auth.isAuthenticated !== 'boolean') return false;
        if (typeof state.learning.xp !== 'number' || state.learning.xp < 0) return false;
        if (typeof state.learning.level !== 'number' || state.learning.level < 1) return false;
        if (typeof state.settings.language !== 'string') return false;
        if (typeof state.ui.currentScreen !== 'string') return false;
        
        return true;
    }

    /**
     * فرمت زمان نسبی
     */
    _timeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        
        if (seconds < 60) return `${seconds} seconds ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        return `${Math.floor(seconds / 86400)} days ago`;
    }
}

// ============ State Transaction ============
class StateTransaction {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.originalState = null;
        this.changes = [];
        this.committed = false;
    }

    begin() {
        this.originalState = this.stateManager._deepClone(this.stateManager.state);
        this.changes = [];
        this.committed = false;
        return this;
    }

    addChange(type, payload) {
        if (this.committed) {
            throw new Error('Transaction already committed');
        }
        this.changes.push({ type, payload });
        return this;
    }

    async commit() {
        if (!this.originalState) {
            throw new Error('Transaction not started');
        }
        
        if (this.committed) {
            throw new Error('Transaction already committed');
        }
        
        try {
            this.stateManager.beginBatch();
            
            for (const change of this.changes) {
                await this.stateManager.dispatch(change.type, change.payload);
            }
            
            await this.stateManager.endBatch();
            
            this.committed = true;
            this.originalState = null;
            
            return true;
        } catch (error) {
            await this.rollback();
            throw error;
        }
    }

    async rollback() {
        if (!this.originalState || this.committed) {
            return false;
        }
        
        this.stateManager.state = this.stateManager._deepClone(this.originalState);
        this.stateManager._updateAllComputed();
        this.stateManager._notifyListeners({ 
            type: ActionTypes.TRANSACTION_ROLLBACK, 
            payload: null 
        });
        
        this.originalState = null;
        this.committed = true;
        
        return true;
    }

    getChanges() {
        return [...this.changes];
    }
}

// ============ Middleware Classes ============

/**
 * Logging Middleware با قابلیت اندازه‌گیری performance
 */
class PerformanceLoggingMiddleware {
    constructor(options = {}) {
        this.slowActionThreshold = options.slowActionThreshold || 100; // ms
        this.performanceMarks = new Map();
        this.enabled = options.enabled !== false;
    }
    
    async beforeUpdate(state, action) {
        if (!this.enabled) return;
        
        this.performanceMarks.set(action.type, performance.now());
        
        console.group(`🚀 Action: ${action.type}`);
        console.log('Payload:', action.payload);
        console.log('Timestamp:', new Date(action.timestamp).toLocaleTimeString());
    }
    
    async afterUpdate(state, prevState, action) {
        if (!this.enabled) return;
        
        const startTime = this.performanceMarks.get(action.type);
        if (startTime) {
            const duration = performance.now() - startTime;
            this.performanceMarks.delete(action.type);
            
            if (duration > this.slowActionThreshold) {
                console.warn(`⚠️ Slow action: ${duration.toFixed(2)}ms`);
            } else {
                console.log(`✅ Completed: ${duration.toFixed(2)}ms`);
            }
        }
        
        const changes = this._findChanges(state, prevState);
        if (changes.length > 0) {
            console.log(`📊 Changes: ${changes.length} paths modified`);
        }
        
        console.groupEnd();
    }
    
    _findChanges(newState, oldState, path = '') {
        const changes = [];
        
        for (const key in newState) {
            const currentPath = path ? `${path}.${key}` : key;
            
            if (typeof newState[key] === 'object' && newState[key] !== null) {
                changes.push(...this._findChanges(newState[key], oldState[key], currentPath));
            } else if (newState[key] !== oldState[key]) {
                changes.push(currentPath);
            }
        }
        
        return changes;
    }
}

/**
 * Persistence Middleware برای ذخیره در localStorage
 */
class PersistenceMiddleware {
    constructor(storageKey = 'farsinglish_state', options = {}) {
        this.storageKey = storageKey;
        this.saveDelay = options.saveDelay || 500; // ms
        this.saveTimeout = null;
        this.persistedSections = options.persistedSections || ['auth', 'learning', 'settings'];
    }
    
    async beforeUpdate(state, action) {
        // بارگذاری state ذخیره شده
        if (action.type === 'APP_INIT') {
            const savedState = localStorage.getItem(this.storageKey);
            if (savedState) {
                try {
                    const parsed = JSON.parse(savedState);
                    Object.assign(state, parsed);
                    console.log('📦 State loaded from persistence');
                } catch (error) {
                    console.error('Failed to load state:', error);
                }
            }
        }
    }
    
    async afterUpdate(state, prevState, action) {
        // ذخیره با debounce
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        this.saveTimeout = setTimeout(() => {
            try {
                const stateToSave = {};
                for (const section of this.persistedSections) {
                    if (state[section]) {
                        stateToSave[section] = state[section];
                    }
                }
                
                localStorage.setItem(this.storageKey, JSON.stringify(stateToSave));
                console.log('📦 State saved to persistence');
            } catch (error) {
                console.error('Failed to save state:', error);
            }
            
            this.saveTimeout = null;
        }, this.saveDelay);
    }
}

/**
 * Dev State Validator برای بررسی نوع داده‌ها
 */
class DevStateValidator {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.schema = {
            auth: {
                isAuthenticated: 'boolean',
                isLoading: 'boolean',
                user: ['object', 'null'],
                token: ['string', 'null']
            },
            learning: {
                xp: 'number',
                level: 'number',
                streakDays: 'number',
                dailyGoal: 'number'
            },
            settings: {
                language: 'string',
                theme: 'string',
                soundEnabled: 'boolean'
            }
        };
    }
    
    afterUpdate(state) {
        const errors = this._validateState(state);
        if (errors.length > 0) {
            console.warn('⚠️ State validation warnings:', errors);
        }
    }
    
    _validateState(state, schema = this.schema, path = '') {
        const errors = [];
        
        for (const [key, expectedType] of Object.entries(schema)) {
            const value = state[key];
            const currentPath = path ? `${path}.${key}` : key;
            
            if (value === undefined) {
                errors.push(`${currentPath}: missing`);
                continue;
            }
            
            if (Array.isArray(expectedType)) {
                if (!expectedType.some(type => this._checkType(value, type))) {
                    errors.push(`${currentPath}: expected [${expectedType.join(', ')}], got ${typeof value}`);
                }
            } else if (typeof expectedType === 'object') {
                if (typeof value !== 'object' || value === null) {
                    errors.push(`${currentPath}: expected object, got ${typeof value}`);
                } else {
                    errors.push(...this._validateState(value, expectedType, currentPath));
                }
            } else {
                if (!this._checkType(value, expectedType)) {
                    errors.push(`${currentPath}: expected ${expectedType}, got ${typeof value}`);
                }
            }
        }
        
        return errors;
    }
    
    _checkType(value, expectedType) {
        if (expectedType === 'null') return value === null;
        if (expectedType === 'array') return Array.isArray(value);
        if (expectedType === 'object') return typeof value === 'object' && value !== null;
        return typeof value === expectedType;
    }
}

// ============ Singleton Instance ============
const stateManager = new StateManager({
    enableLogging: true,
    enablePersistence: true,
    enableValidation: process.env.NODE_ENV === 'development',
    storageKey: 'farsinglish_state',
    maxHistory: 50
});

// ============ Export ============
export {
    StateManager,
    stateManager,
    ActionTypes,
    IStateListener,
    IStateMiddleware,
    StateTransaction,
    PerformanceLoggingMiddleware,
    PersistenceMiddleware,
    DevStateValidator
};
