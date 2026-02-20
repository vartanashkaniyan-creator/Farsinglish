/**
 * @fileoverview مدیریت متمرکز وضعیت برنامه با الگوی Pub/Sub
 * @author Farsinglish Team
 * @version 1.0.0
 */

// ============ Type Definitions ============

/**
 * @typedef {Object} AuthState
 * @property {boolean} isAuthenticated - وضعیت احراز هویت
 * @property {boolean} isLoading - وضعیت بارگذاری
 * @property {Object|null} user - اطلاعات کاربر
 * @property {string|null} token - توکن احراز هویت
 * @property {string|null} sessionId - شناسه نشست
 * @property {string|null} lastLogin - آخرین زمان ورود
 */

/**
 * @typedef {Object} LearningState
 * @property {Object|null} currentLesson - درس فعلی
 * @property {Array<Object>} lessons - لیست درس‌ها
 * @property {Array<string>} completedLessons - درس‌های تکمیل شده
 * @property {number} xp - امتیاز تجربه
 * @property {number} level - سطح کاربر
 * @property {number} streakDays - روزهای پشت سر هم
 * @property {number} dailyGoal - هدف روزانه
 * @property {string|null} lastReview - آخرین زمان مرور
 */

/**
 * @typedef {Object} ProgressState
 * @property {Object} currentProgress - پیشرفت جاری
 * @property {Object} todayProgress - پیشرفت امروز
 * @property {number} todayProgress.lessonsCompleted - درس‌های تکمیل شده امروز
 * @property {number} todayProgress.xpEarned - XP کسب شده امروز
 * @property {number} todayProgress.timeSpent - زمان صرف شده امروز
 * @property {Object} weeklyStats - آمار هفتگی
 * @property {Array<Object>} achievements - دستاوردها
 */

/**
 * @typedef {Object} SettingsState
 * @property {string} language - زبان برنامه
 * @property {string} theme - تم برنامه
 * @property {boolean} soundEnabled - وضعیت صدا
 * @property {boolean} notificationsEnabled - وضعیت اعلان‌ها
 * @property {boolean} srsEnabled - وضعیت SRS
 * @property {boolean} autoPlayAudio - پخش خودکار صدا
 */

/**
 * @typedef {Object} UIState
 * @property {string} currentScreen - صفحه فعلی
 * @property {boolean} isLoading - وضعیت بارگذاری UI
 * @property {string|null} error - خطای UI
 * @property {string|null} modal - مودال فعال
 * @property {boolean} sidebarOpen - وضعیت سایدبار
 * @property {Object|null} toast - اعلان موقت
 */

/**
 * @typedef {Object} MetaState
 * @property {string|null} lastUpdated - آخرین زمان به‌روزرسانی
 * @property {string} version - نسخه برنامه
 * @property {string} environment - محیط اجرا
 */

/**
 * @typedef {Object} AppState
 * @property {AuthState} auth - وضعیت احراز هویت
 * @property {LearningState} learning - وضعیت یادگیری
 * @property {ProgressState} progress - وضعیت پیشرفت
 * @property {SettingsState} settings - تنظیمات
 * @property {UIState} ui - وضعیت رابط کاربری
 * @property {MetaState} meta - فراداده
 */

/**
 * @typedef {Object} Action
 * @property {string} type - نوع اکشن
 * @property {*} [payload] - داده‌های اکشن
 * @property {number} timestamp - زمان اجرا
 */

/**
 * @typedef {Object} HistoryInfo
 * @property {boolean} canUndo - قابلیت بازگشت
 * @property {boolean} canRedo - قابلیت جلو رفتن
 * @property {number} pastCount - تعداد stateهای گذشته
 * @property {number} futureCount - تعداد stateهای آینده
 * @property {Action|null} lastAction - آخرین اکشن
 */

/**
 * @typedef {Object} BatchItem
 * @property {string} type - نوع اکشن
 * @property {*} payload - داده‌ها
 * @property {number} priority - اولویت (0-10)
 */

/**
 * @typedef {Object} CacheEntry
 * @property {*} value - مقدار کش شده
 * @property {number} timestamp - زمان ایجاد
 */

// ============ Interfaces ============

/**
 * @interface IStateListener
 */
class IStateListener {
    /**
     * @param {AppState} state - state فعلی
     * @param {AppState} prevState - state قبلی
     * @param {Action} action - اکشن اجرا شده
     */
    onStateChanged(state, prevState, action) {}
}

/**
 * @interface IStateMiddleware
 */
class IStateMiddleware {
    /**
     * @param {AppState} state - state فعلی
     * @param {Action} action - اکشن در حال اجرا
     * @returns {Promise<boolean|void>} false برای توقف زنجیره
     */
    beforeUpdate(state, action) {}
    
    /**
     * @param {AppState} state - state جدید
     * @param {AppState} prevState - state قبلی
     * @param {Action} action - اکشن اجرا شده
     */
    afterUpdate(state, prevState, action) {}
}

// ============ Action Types ============

/** @enum {string} */
export const ActionTypes = Object.freeze({
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
    TRANSACTION_ROLLBACK: 'TRANSACTION_ROLLBACK',
    TIME_TRAVEL: 'TIME_TRAVEL'
});

// ============ Initial State ============

/** @type {Readonly<AppState>} */
const INITIAL_STATE = Object.freeze({
    auth: {
        isAuthenticated: false,
        isLoading: false,
        error: null,
        user: null,
        token: null,
        sessionId: null,
        lastLogin: null
    },
    
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
    
    meta: {
        lastUpdated: null,
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    }
});

// ============ State Manager Class ============

/**
 * مدیریت متمرکز وضعیت برنامه
 * @class
 * @implements {IStateListener}
 */
class StateManager {
    /**
     * @constructor
     * @param {Object} options - گزینه‌های پیکربندی
     * @param {number} [options.maxHistory=50] - حداکثر تعداد state در تاریخچه
     * @param {number} [options.maxActionHistory=100] - حداکثر تعداد اکشن در تاریخچه
     * @param {boolean} [options.enableLogging=true] - فعال‌سازی لاگ
     * @param {boolean} [options.enablePersistence=false] - فعال‌سازی ذخیره‌سازی
     * @param {string} [options.storageKey='farsinglish_state'] - کلید ذخیره‌سازی
     */
    constructor(options = {}) {
        if (StateManager.instance) {
            return StateManager.instance;
        }
        
        // State
        /** @private @type {AppState} */
        this.state = this._deepClone(INITIAL_STATE);
        
        /** @private @type {AppState} */
        this.previousState = this._deepClone(INITIAL_STATE);
        
        // Listeners - بهبود ۲: WeakMap برای listenerها
        /** @private @type {WeakMap<Object, Function>} */
        this.listenerRefs = new WeakMap();
        
        /** @private @type {Set<Function>} */
        this.listenerFunctions = new Set();
        
        // Middlewares
        /** @private @type {Array<IStateMiddleware>} */
        this.middlewares = [];
        
        // State management
        /** @private @type {boolean} */
        this.isUpdating = false;
        
        // بهبود ۴: Lock Manager
        /** @private @type {boolean} */
        this._lock = false;
        
        /** @private @type {Array<Function>} */
        this._queue = [];
        
        // History
        /** @private @type {{past: AppState[], future: AppState[]}} */
        this.history = {
            past: [],
            future: []
        };
        
        /** @private @type {number} */
        this.maxHistory = options.maxHistory || 50;
        
        // Action history
        /** @private @type {Array<{action: Action, stateAfter: AppState}>} */
        this.actionHistory = [];
        
        /** @private @type {number} */
        this.maxActionHistory = options.maxActionHistory || 100;
        
        // Computed values
        /** @private @type {Map<string, {fn: Function, dependencies: string[], value: any, lastState: AppState|null}>} */
        this.computedValues = new Map();
        
        /** @private @type {Map<string, string[]>} */
        this.computedDependencies = new Map();
        
        // Snapshots
        /** @private @type {Map<string, {state: AppState, timestamp: number, history: Array, past: AppState[], future: AppState[]}>} */
        this.snapshots = new Map();
        
        // بهبود ۵: Selector Cache
        /** @private @type {Map<string, CacheEntry>} */
        this.selectorCache = new Map();
        
        /** @private @type {number} */
        this.cacheTTL = 5000; // 5 ثانیه
        
        // Batch mode
        /** @private @type {boolean} */
        this.batchMode = false;
        
        /** @private @type {BatchItem[]} */
        this.batchedActions = [];
        
        /** @private @type {BatchItem[]} */
        this.priorityQueue = [];
        
        // Lazy loading
        /** @private @type {Set<string>} */
        this.loadedSections = new Set();
        
        /** @private @type {Map<string, Promise<any>>} */
        this.loadingPromises = new Map();
        
        // بهبود ۱: Throttle برای notifier
        /** @private @type {Function} */
        this._throttledNotify = this._throttle(this._notifyListeners.bind(this), 16);
        
        StateManager.instance = this;
        
        // Add default middlewares
        if (options.enableLogging !== false) {
            this.addMiddleware(new PerformanceLoggingMiddleware());
        }
        
        if (options.enablePersistence) {
            this.addMiddleware(new PersistenceMiddleware(options.storageKey));
        }
        
        if (process.env.NODE_ENV === 'development' && options.enableValidation !== false) {
            this.addMiddleware(new DevStateValidator(this));
        }
        
        console.log('State Manager initialized');
    }

    /**
     * دریافت state فعلی (immutable)
     * @returns {Readonly<AppState>}
     */
    getState() {
        return Object.freeze(this._deepClone(this.state));
    }

    /**
     * دریافت state قبلی
     * @returns {Readonly<AppState>}
     */
    getPreviousState() {
        return Object.freeze(this._deepClone(this.previousState));
    }

    /**
     * دریافت مقدار از مسیر مشخص
     * @param {string} path - مسیر با نقطه (مثال: 'auth.user.name')
     * @returns {*}
     * @private
     */
    _getValueByPath(path) {
        return path.split('.').reduce((acc, part) => acc && acc[part], this.state);
    }

    /**
     * بررسی تغییر state در مسیر مشخص
     * @param {string} path - مسیر با نقطه
     * @returns {boolean}
     */
    hasChanged(path) {
        const current = this._getValueByPath(path);
        const previous = this._getValueByPath.call({ state: this.previousState }, path);
        return !this._isEqual(current, previous);
    }

    /**
     * ایجاد selector با کش
     * @template T
     * @param {function(AppState): T} selectorFn - تابع انتخاب‌گر
     * @param {number} [ttl=5000] - زمان اعتبار کش (میلی‌ثانیه)
     * @returns {function(): T}
     */
    createSelector(selectorFn, ttl = this.cacheTTL) {
        const cacheKey = `selector_${this._quickHash(selectorFn.toString())}`;
        
        return () => {
            const now = Date.now();
            const cached = this.selectorCache.get(cacheKey);
            
            if (cached && (now - cached.timestamp) < ttl) {
                return cached.value;
            }
            
            const value = selectorFn(this.state);
            this.selectorCache.set(cacheKey, { value, timestamp: now });
            
            // پاکسازی خودکار کش قدیمی
            if (this.selectorCache.size > 100) {
                const oldest = [...this.selectorCache.entries()]
                    .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
                this.selectorCache.delete(oldest[0]);
            }
            
            return value;
        };
    }

    /**
     * انتخاب مستقیم بخشی از state
     * @template T
     * @param {function(AppState): T} selectorFn - تابع انتخاب‌گر
     * @returns {T}
     */
    select(selectorFn) {
        return this._deepClone(selectorFn(this.state));
    }

    /**
     * انتخاب چند بخش از state به صورت همزمان
     * @param {Object.<string, function(AppState): *>} selectors - آبجکت انتخاب‌گرها
     * @returns {Object.<string, *>}
     */
    selectMany(selectors) {
        /** @type {Object.<string, *>} */
        const result = {};
        for (const [key, selector] of Object.entries(selectors)) {
            result[key] = this.select(selector);
        }
        return result;
    }

    /**
     * شروع دسته‌ای از تغییرات
     * @returns {this}
     */
    beginBatch() {
        this.batchMode = true;
        this.batchedActions = [];
        return this;
    }

    /**
     * پایان دسته تغییرات
     * @returns {Promise<AppState>}
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
        
        return this._withLock(async () => {
            this.isUpdating = true;
            
            try {
                this.previousState = this._deepClone(this.state);
                
                // مرتب‌سازی بر اساس اولویت
                actions.sort((a, b) => (b.priority || 0) - (a.priority || 0));
                
                for (const action of actions) {
                    this.state = this._reducer(this.state, action);
                }
                
                if (!this._validateState(this.state)) {
                    throw new Error('Invalid state after batch update');
                }
                
                this._addToHistory({ type: ActionTypes.BATCH_UPDATE, payload: actions });
                
                for (const middleware of this.middlewares) {
                    if (middleware.afterUpdate) {
                        await middleware.afterUpdate(this.state, this.previousState, {
                            type: ActionTypes.BATCH_UPDATE,
                            payload: actions
                        });
                    }
                }
                
                this._updateAllComputed();
                this._throttledNotify({ type: ActionTypes.BATCH_UPDATE, payload: actions });
                
                return this.getState();
                
            } catch (error) {
                console.error('Batch update failed:', error);
                throw error;
            } finally {
                this.isUpdating = false;
            }
        });
    }

    /**
     * انتشار action با اولویت
     * @param {string} type - نوع اکشن
     * @param {*} [payload] - داده‌ها
     * @param {number} [priority=0] - اولویت (0-10)
     * @returns {Promise<AppState>}
     */
    async dispatchWithPriority(type, payload = {}, priority = 0) {
        if (this.batchMode) {
            this.priorityQueue.push({ type, payload, priority });
            this.priorityQueue.sort((a, b) => b.priority - a.priority);
            return this.getState();
        }
        return this.dispatch(type, payload);
    }

    /**
     * انتشار action
     * @param {string} type - نوع اکشن
     * @param {*} [payload] - داده‌ها
     * @returns {Promise<AppState>}
     * @throws {Error} در صورت خطا در به‌روزرسانی
     */
    async dispatch(type, payload = {}) {
        if (this.batchMode) {
            this.batchedActions.push({ type, payload, priority: 0, timestamp: Date.now() });
            return this.getState();
        }
        
        return this._withLock(async () => {
            if (this.isUpdating) {
                console.warn('State update already in progress');
                return this.getState();
            }

            this.isUpdating = true;
            /** @type {Action} */
            const action = { type, payload, timestamp: Date.now() };

            try {
                // Before middleware
                for (const middleware of this.middlewares) {
                    if (middleware.beforeUpdate) {
                        const result = await middleware.beforeUpdate(this.state, action);
                        if (result === false) return this.getState();
                    }
                }

                this.previousState = this._deepClone(this.state);
                
                // History management
                if (![ActionTypes.UNDO, ActionTypes.REDO, ActionTypes.RESET].includes(type)) {
                    this.history.past.push(this._deepClone(this.state));
                    if (this.history.past.length > this.maxHistory) {
                        this.history.past.shift();
                    }
                    this.history.future = [];
                }
                
                const newState = this._reducer(this.state, action);
                
                if (!this._validateState(newState)) {
                    throw new Error('Invalid state after update');
                }
                
                this.state = newState;
                this._addToHistory(action);
                this._updateAllComputed();
                
                // After middleware
                for (const middleware of this.middlewares) {
                    if (middleware.afterUpdate) {
                        await middleware.afterUpdate(this.state, this.previousState, action);
                    }
                }
                
                this._throttledNotify(action);
                
                return this.getState();
                
            } catch (error) {
                console.error('State update failed:', error);
                throw error;
            } finally {
                this.isUpdating = false;
            }
        });
    }

    /**
     * اجرای تابع با قفل (Lock Manager)
     * @param {Function} fn - تابع برای اجرا
     * @returns {Promise<any>}
     * @private
     */
    async _withLock(fn) {
        if (this._lock) {
            await new Promise(resolve => this._queue.push(resolve));
        }
        
        this._lock = true;
        try {
            return await fn();
        } finally {
            this._lock = false;
            if (this._queue.length) {
                const next = this._queue.shift();
                next();
            }
        }
    }

    /**
     * بازگشت به state قبلی
     * @returns {HistoryInfo}
     */
    undo() {
        if (this.history.past.length === 0) {
            return { 
                success: false, 
                message: 'No more actions to undo',
                canUndo: false,
                canRedo: this.history.future.length > 0,
                pastCount: this.history.past.length,
                futureCount: this.history.future.length,
                lastAction: this.actionHistory[this.actionHistory.length - 1]?.action || null
            };
        }

        this.history.future.unshift(this._deepClone(this.state));
        const previousState = this.history.past.pop();
        this.previousState = this._deepClone(this.state);
        this.state = previousState;
        
        this._throttledNotify({ type: ActionTypes.UNDO, payload: null });
        this._updateAllComputed();
        
        return { 
            success: true, 
            message: 'Undo successful',
            canUndo: this.history.past.length > 0,
            canRedo: this.history.future.length > 0,
            pastCount: this.history.past.length,
            futureCount: this.history.future.length,
            lastAction: this.actionHistory[this.actionHistory.length - 1]?.action || null
        };
    }

    /**
     * جلو رفتن به state بعدی
     * @returns {HistoryInfo}
     */
    redo() {
        if (this.history.future.length === 0) {
            return { 
                success: false, 
                message: 'No more actions to redo',
                canUndo: this.history.past.length > 0,
                canRedo: false,
                pastCount: this.history.past.length,
                futureCount: 0,
                lastAction: this.actionHistory[this.actionHistory.length - 1]?.action || null
            };
        }

        this.history.past.push(this._deepClone(this.state));
        const nextState = this.history.future.shift();
        this.previousState = this._deepClone(this.state);
        this.state = nextState;
        
        this._throttledNotify({ type: ActionTypes.REDO, payload: null });
        this._updateAllComputed();
        
        return { 
            success: true, 
            message: 'Redo successful',
            canUndo: this.history.past.length > 0,
            canRedo: this.history.future.length > 0,
            pastCount: this.history.past.length,
            futureCount: this.history.future.length,
            lastAction: this.actionHistory[this.actionHistory.length - 1]?.action || null
        };
    }

    /**
     * دریافت وضعیت تاریخچه
     * @returns {HistoryInfo}
     */
    getHistoryInfo() {
        return {
            canUndo: this.history.past.length > 0,
            canRedo: this.history.future.length > 0,
            pastCount: this.history.past.length,
            futureCount: this.history.future.length,
            lastAction: this.actionHistory[this.actionHistory.length - 1]?.action || null
        };
    }

    /**
     * جستجو در تاریخچه
     * @param {Object} query - معیارهای جستجو
     * @returns {Array<{state: AppState, action: Action}>}
     */
    searchHistory(query) {
        return this.actionHistory
            .filter(item => {
                return Object.entries(query).every(([key, value]) => 
                    item.action[key] === value
                );
            })
            .map(item => ({
                state: item.stateAfter,
                action: item.action
            }));
    }

    /**
     * رفتن به ایندکس مشخص در تاریخچه
     * @param {number} index - ایندکس
     * @returns {boolean}
     */
    goToHistoryIndex(index) {
        if (index < 0 || index >= this.actionHistory.length) {
            return false;
        }

        const targetState = this.actionHistory[index].stateAfter;
        this.state = this._deepClone(targetState);
        this._throttledNotify({ type: ActionTypes.TIME_TRAVEL, payload: { index } });
        this._updateAllComputed();
        return true;
    }

    /**
     * ایجاد snapshot
     * @param {string} [name] - نام snapshot
     * @returns {string}
     */
    takeSnapshot(name) {
        const snapshotName = name || `snapshot_${Date.now()}`;
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
     * @param {string} name - نام snapshot
     * @returns {boolean}
     * @throws {Error} در صورت عدم وجود snapshot
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
        this._throttledNotify({ type: ActionTypes.SNAPSHOT_RESTORE, payload: { name } });
        
        console.log(`📸 Snapshot '${name}' restored`);
        return true;
    }

    /**
     * دریافت لیست snapshots
     * @returns {Array<{name: string, timestamp: number, timeAgo: string}>}
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
     * @param {string} name - نام snapshot
     * @returns {boolean}
     */
    deleteSnapshot(name) {
        return this.snapshots.delete(name);
    }

    /**
     * بارگذاری تنبل بخشی از state
     * @param {string} section - نام بخش
     * @param {Function} loader - تابع بارگذاری
     * @returns {Promise<*>}
     */
    async loadSection(section, loader) {
        if (this.loadedSections.has(section)) {
            return this.select(state => state[section]);
        }
        
        if (this.loadingPromises.has(section)) {
            return this.loadingPromises.get(section);
        }
        
        /** @type {Promise<any>} */
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

    /**
     * بارگذاری state ذخیره شده (Partial Hydration)
     * @param {Object} persistedState - state ذخیره شده
     * @returns {Promise<void>}
     */
    async hydrate(persistedState) {
        const critical = ['auth', 'settings'];
        
        for (const section of critical) {
            if (persistedState[section]) {
                this.state[section] = {
                    ...this.state[section],
                    ...persistedState[section]
                };
            }
        }
        
        // غیر بحرانی با delay
        setTimeout(() => {
            const nonCritical = ['learning', 'progress', 'ui'];
            for (const section of nonCritical) {
                if (persistedState[section]) {
                    this.state[section] = {
                        ...this.state[section],
                        ...persistedState[section]
                    };
                }
            }
            this._updateAllComputed();
        }, 100);
    }

    /**
     * ثبت listener با قابلیت فیلتر
     * @param {Function|IStateListener} listener - تابع یا شیء listener
     * @param {string|Function} [filter] - فیلتر برای تغییرات خاص
     * @returns {Function} تابع لغو اشتراک
     */
    subscribe(listener, filter) {
        if (typeof listener !== 'function' && !listener.onStateChanged) {
            throw new Error('Listener must be a function or implement IStateListener');
        }

        /** @type {Function} */
        let wrappedListener;

        if (filter) {
            /** @type {Function} */
            let predicate;

            if (typeof filter === 'string') {
                predicate = (state) => this._getValueByPath.call({ state }, filter);
            } else {
                predicate = filter;
            }

            wrappedListener = (state, prevState, action) => {
                if (predicate(state) !== predicate(prevState)) {
                    if (typeof listener === 'function') {
                        listener(state, prevState, action);
                    } else {
                        listener.onStateChanged(state, prevState, action);
                    }
                }
            };
        } else {
            wrappedListener = (state, prevState, action) => {
                if (typeof listener === 'function') {
                    listener(state, prevState, action);
                } else {
                    listener.onStateChanged(state, prevState, action);
                }
            };
        }

        // بهبود ۲: استفاده از WeakMap برای اشیاء
        if (typeof listener === 'object' && listener !== null) {
            this.listenerRefs.set(listener, wrappedListener);
        } else {
            this.listenerFunctions.add(wrappedListener);
        }

        return () => this.unsubscribe(listener);
    }

    /**
     * حذف listener
     * @param {Function|IStateListener} listener - listener برای حذف
     */
    unsubscribe(listener) {
        if (typeof listener === 'object' && listener !== null) {
            const wrapped = this.listenerRefs.get(listener);
            if (wrapped) {
                this.listenerFunctions.delete(wrapped);
                this.listenerRefs.delete(listener);
            }
        } else {
            this.listenerFunctions.delete(listener);
        }
    }

    /**
     * افزودن middleware
     * @param {IStateMiddleware} middleware - middleware
     * @returns {this}
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
     * @param {IStateMiddleware} middleware - middleware
     * @returns {this}
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
     * @returns {AppState}
     */
    reset() {
        this.state = this._deepClone(INITIAL_STATE);
        this.previousState = this._deepClone(INITIAL_STATE);
        this.actionHistory = [];
        this.history = { past: [], future: [] };
        this.computedValues.clear();
        this.selectorCache.clear();
        this.priorityQueue = [];
        
        this._throttledNotify({ type: ActionTypes.RESET, payload: null });
        console.log('State reset to initial');
        
        return this.getState();
    }

    // ============ Private Methods ============

    /**
     * Reducer اصلی
     * @param {AppState} state - state فعلی
     * @param {Action} action - اکشن
     * @returns {AppState} state جدید
     * @private
     */
    _reducer(state, action) {
        /** @type {AppState} */
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
                    ...INITIAL_STATE.auth,
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
                const { lessonId, xpEarned, timeSpent } = action.payload;
                
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
                return this._deepClone(INITIAL_STATE);
                
            default:
                // Unknown actions are ignored
                break;
        }
        
        newState.meta.lastUpdated = new Date().toISOString();
        
        return newState;
    }

    /**
     * اطلاع‌رسانی به listeners (با throttle)
     * @param {Action} action - اکشن
     * @private
     */
    _notifyListeners(action) {
        const currentState = this.getState();
        const previousState = this.getPreviousState();
        
        this.listenerFunctions.forEach(listener => {
            try {
                listener(currentState, previousState, action);
            } catch (error) {
                console.error('Error in state listener:', error);
            }
        });
    }

    /**
     * تابع throttle
     * @param {Function} fn - تابع
     * @param {number} limit - محدودیت زمانی
     * @returns {Function}
     * @private
     */
    _throttle(fn, limit) {
        /** @type {boolean} */
        let inThrottle;
        
        return (...args) => {
            if (!inThrottle) {
                fn(...args);
                inThrottle = true;
                setTimeout(() => {
                    inThrottle = false;
                }, limit);
            }
        };
    }

    /**
     * افزودن به تاریخچه اکشن‌ها
     * @param {Action} action - اکشن
     * @private
     */
    _addToHistory(action) {
        this.actionHistory.push({
            action,
            stateAfter: this._deepClone(this.state)
        });
        
        if (this.actionHistory.length > this.maxActionHistory) {
            this.actionHistory.shift();
        }
    }

    /**
     * به‌روزرسانی تمام مقادیر محاسبه‌شده
     * @private
     */
    _updateAllComputed() {
        for (const key of this.computedValues.keys()) {
            this._updateComputed(key);
        }
    }

    /**
     * به‌روزرسانی یک مقدار محاسبه‌شده
     * @param {string} key - کلید
     * @private
     */
    _updateComputed(key) {
        const computed = this.computedValues.get(key);
        if (!computed) return;
        
        computed.value = computed.fn(this.state);
    }

    /**
     * کلون عمیق
     * @param {*} obj - آبجکت
     * @returns {*}
     * @private
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
            return JSON.parse(JSON.stringify(obj));
        }
    }

    /**
     * مقایسه عمیق
     * @param {*} a - مقدار اول
     * @param {*} b - مقدار دوم
     * @returns {boolean}
     * @private
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
     * هش سریع
     * @param {*} obj - آبجکت
     * @returns {string}
     * @private
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
     * @param {number} xp - امتیاز تجربه
     * @returns {number}
     * @private
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
     * @param {AppState} state - state
     * @returns {boolean}
     * @private
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
     * @param {number} timestamp - زمان
     * @returns {string}
     * @private
     */
    _timeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        
        if (seconds < 60) return `${seconds} seconds ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        return `${Math.floor(seconds / 86400)} days ago`;
    }

    /**
     * دیباگ
     * @returns {Object}
     */
    debug() {
        return {
            state: this.getState(),
            historySize: this.actionHistory.length,
            listenersCount: this.listenerFunctions.size,
            middlewaresCount: this.middlewares.length,
            lastAction: this.actionHistory[this.actionHistory.length - 1]?.action || null,
            computedKeys: Array.from(this.computedValues.keys()),
            snapshots: this.listSnapshots(),
            queueLength: this._queue.length,
            cacheSize: this.selectorCache.size
        };
    }

    /**
     * ردیابی تغییرات یک مسیر
     * @param {string} path - مسیر
     * @returns {Array<{action: string, value: *, timestamp: number}>}
     */
    trace(path) {
        return this.actionHistory
            .map(item => ({
                action: item.action.type,
                value: this._getValueByPath.call({ state: item.stateAfter }, path),
                timestamp: item.action.timestamp
            }));
    }
}

// ============ State Transaction ============

/**
 * تراکنش state برای تغییرات اتمیک
 * @class
 */
class StateTransaction {
    /**
     * @constructor
     * @param {StateManager} stateManager - مدیریت state
     */
    constructor(stateManager) {
        /** @private @type {StateManager} */
        this.stateManager = stateManager;
        
        /** @private @type {AppState|null} */
        this.originalState = null;
        
        /** @private @type {Array<Action>} */
        this.changes = [];
        
        /** @private @type {boolean} */
        this.committed = false;
    }

    /**
     * شروع تراکنش
     * @returns {this}
     */
    begin() {
        this.originalState = this.stateManager._deepClone(this.stateManager.state);
        this.changes = [];
        this.committed = false;
        return this;
    }

    /**
     * افزودن تغییر
     * @param {string} type - نوع اکشن
     * @param {*} [payload] - داده‌ها
     * @returns {this}
     */
    addChange(type, payload) {
        if (this.committed) {
            throw new Error('Transaction already committed');
        }
        this.changes.push({ type, payload, timestamp: Date.now() });
        return this;
    }

    /**
     * اعمال تراکنش
     * @returns {Promise<boolean>}
     */
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

    /**
     * بازگشت از تراکنش
     * @returns {Promise<boolean>}
     */
    async rollback() {
        if (!this.originalState || this.committed) {
            return false;
        }
        
        this.stateManager.state = this.stateManager._deepClone(this.originalState);
        this.stateManager._updateAllComputed();
        this.stateManager._throttledNotify({ 
            type: ActionTypes.TRANSACTION_ROLLBACK, 
            payload: null 
        });
        
        this.originalState = null;
        this.committed = true;
        
        return true;
    }

    /**
     * دریافت تغییرات
     * @returns {Array<Action>}
     */
    getChanges() {
        return [...this.changes];
    }
}

// ============ Middleware Classes ============

/**
 * Middleware لاگ‌گیری با اندازه‌گیری performance
 * @implements {IStateMiddleware}
 */
class PerformanceLoggingMiddleware {
    /**
     * @constructor
     * @param {Object} options - گزینه‌ها
     * @param {number} [options.slowActionThreshold=100] - آستانه action کند (ms)
     * @param {boolean} [options.enabled=true] - فعال بودن
     */
    constructor(options = {}) {
        /** @private @type {number} */
        this.slowActionThreshold = options.slowActionThreshold || 100;
        
        /** @private @type {Map<string, number>} */
        this.performanceMarks = new Map();
        
        /** @private @type {boolean} */
        this.enabled = options.enabled !== false;
    }
    
    /**
     * قبل از به‌روزرسانی
     * @param {AppState} state - state فعلی
     * @param {Action} action - اکشن
     */
    async beforeUpdate(state, action) {
        if (!this.enabled) return;
        
        this.performanceMarks.set(action.type, performance.now());
        
        console.group(`🚀 Action: ${action.type}`);
        console.log('Payload:', action.payload);
        console.log('Timestamp:', new Date(action.timestamp).toLocaleTimeString());
    }
    
    /**
     * بعد از به‌روزرسانی
     * @param {AppState} state - state جدید
     * @param {AppState} prevState - state قبلی
     * @param {Action} action - اکشن
     */
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
    
    /**
     * پیدا کردن تغییرات
     * @param {Object} newState - state جدید
     * @param {Object} oldState - state قبلی
     * @param {string} [path=''] - مسیر جاری
     * @returns {Array<string>}
     * @private
     */
    _findChanges(newState, oldState, path = '') {
        /** @type {Array<string>} */
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
 * Middleware ذخیره‌سازی در localStorage
 * @implements {IStateMiddleware}
 */
class PersistenceMiddleware {
    /**
     * @constructor
     * @param {string} [storageKey='farsinglish_state'] - کلید ذخیره‌سازی
     * @param {Object} options - گزینه‌ها
     * @param {number} [options.saveDelay=500] - تأخیر ذخیره (ms)
     * @param {Array<string>} [options.persistedSections] - بخش‌های ذخیره‌شونده
     */
    constructor(storageKey = 'farsinglish_state', options = {}) {
        /** @private @type {string} */
        this.storageKey = storageKey;
        
        /** @private @type {number} */
        this.saveDelay = options.saveDelay || 500;
        
        /** @private @type {Array<string>} */
        this.persistedSections = options.persistedSections || ['auth', 'learning', 'settings'];
        
        /** @private @type {number|null} */
        this.saveTimeout = null;
    }
    
    /**
     * قبل از به‌روزرسانی
     * @param {AppState} state - state فعلی
     * @param {Action} action - اکشن
     */
    async beforeUpdate(state, action) {
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
    
    /**
     * بعد از به‌روزرسانی
     * @param {AppState} state - state جدید
     * @param {AppState} prevState - state قبلی
     * @param {Action} action - اکشن
     */
    async afterUpdate(state, prevState, action) {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        this.saveTimeout = setTimeout(() => {
            try {
                /** @type {Object} */
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
 * Middleware اعتبارسنجی state در محیط توسعه
 * @implements {IStateMiddleware}
 */
class DevStateValidator {
    /**
     * @constructor
     * @param {StateManager} stateManager - مدیریت state
     */
    constructor(stateManager) {
        /** @private @type {StateManager} */
        this.stateManager = stateManager;
        
        /** @private @type {Object} */
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
    
    /**
     * بعد از به‌روزرسانی
     * @param {AppState} state - state جدید
     */
    afterUpdate(state) {
        const errors = this._validateState(state);
        if (errors.length > 0) {
            console.warn('⚠️ State validation warnings:', errors);
        }
    }
    
    /**
     * اعتبارسنجی state
     * @param {Object} state - state
     * @param {Object} [schema] - schema
     * @param {string} [path=''] - مسیر
     * @returns {Array<string>}
     * @private
     */
    _validateState(state, schema = this.schema, path = '') {
        /** @type {Array<string>} */
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
    
    /**
     * بررسی نوع
     * @param {*} value - مقدار
     * @param {string} expectedType - نوع مورد انتظار
     * @returns {boolean}
     * @private
     */
    _checkType(value, expectedType) {
        if (expectedType === 'null') return value === null;
        if (expectedType === 'array') return Array.isArray(value);
        if (expectedType === 'object') return typeof value === 'object' && value !== null;
        return typeof value === expectedType;
    }
}

// ============ Singleton Instance ============

/** @type {StateManager} */
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
