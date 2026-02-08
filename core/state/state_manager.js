// core/state/state-manager.js
/**
 * State Manager - مدیریت متمرکز وضعیت برنامه
 * مسئولیت: نگهداری و به‌روزرسانی state مرکزی با الگوی Pub/Sub
 * اصل SRP: فقط مدیریت state و انتشار تغییرات
 * اصل OCP: قابلیت افزودن middleware بدون تغییر کد اصلی
 * اصل DIP: وابستگی به Interface نه پیاده‌سازی
 */

// ============ Interfaces ============
class IStateListener {
    onStateChanged(state, prevState) {}
}

class IStateMiddleware {
    beforeUpdate(state, action) {}
    afterUpdate(state, prevState, action) {}
}

// ============ Action Types ============
const ActionTypes = Object.freeze({
    USER_LOGIN: 'USER_LOGIN',
    USER_LOGOUT: 'USER_LOGOUT',
    USER_UPDATE: 'USER_UPDATE',
    LESSON_LOAD: 'LESSON_LOAD',
    LESSON_COMPLETE: 'LESSON_COMPLETE',
    PROGRESS_UPDATE: 'PROGRESS_UPDATE',
    SETTINGS_CHANGE: 'SETTINGS_CHANGE',
    UI_STATE_CHANGE: 'UI_STATE_CHANGE'
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
        lastLogin: null
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
        level: 1
    },
    
    // Progress Tracking
    progress: {
        currentProgress: {},
        todayProgress: {
            lessonsCompleted: 0,
            xpEarned: 0,
            timeSpent: 0 // in minutes
        },
        weeklyStats: {
            totalLessons: 0,
            totalXP: 0,
            averageScore: 0
        }
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
        showHints: true
    },
    
    // UI State
    ui: {
        currentScreen: 'home',
        isLoading: false,
        error: null,
        modal: null,
        sidebarOpen: false,
        toast: null
    }
});

// ============ State Manager Class ============
class StateManager {
    constructor() {
        if (StateManager.instance) {
            return StateManager.instance;
        }
        
        this.state = structuredClone(initialState);
        this.previousState = structuredClone(initialState);
        this.listeners = new Set();
        this.middlewares = [];
        this.isUpdating = false;
        this.actionHistory = [];
        this.maxHistorySize = 50;
        
        StateManager.instance = this;
        console.log('State Manager initialized');
    }

    /**
     * دریافت state فعلی (immutable)
     * @returns {Object} - state فعلی
     */
    getState() {
        return Object.freeze(structuredClone(this.state));
    }

    /**
     * دریافت state قبلی
     * @returns {Object} - state قبلی
     */
    getPreviousState() {
        return Object.freeze(structuredClone(this.previousState));
    }

    /**
     * بررسی تغییر state
     * @param {string} path - مسیر state (مثلاً 'auth.user')
     * @returns {boolean} - آیا تغییر کرده است
     */
    hasChanged(path) {
        const [currentValue, previousValue] = this._getValuesByPath(path);
        return !this._isEqual(currentValue, previousValue);
    }

    /**
     * انتشار action برای تغییر state
     * @param {string} type - نوع action
     * @param {Object} payload - داده‌های action
     * @returns {Promise<Object>} - state جدید
     */
    async dispatch(type, payload = {}) {
        if (this.isUpdating) {
            console.warn('State update already in progress');
            return this.getState();
        }

        this.isUpdating = true;
        const action = { type, payload, timestamp: Date.now() };

        try {
            // اجرای middlewares قبل از update
            for (const middleware of this.middlewares) {
                if (middleware.beforeUpdate) {
                    await middleware.beforeUpdate(this.state, action);
                }
            }

            // ذخیره state قبلی
            this.previousState = structuredClone(this.state);
            
            // تولید state جدید
            const newState = this._reducer(this.state, action);
            
            // اعتبارسنجی state جدید
            if (!this._validateState(newState)) {
                throw new Error('Invalid state after update');
            }
            
            // به‌روزرسانی state
            this.state = newState;
            
            // ذخیره در تاریخچه
            this._addToHistory(action);
            
            // اجرای middlewares بعد از update
            for (const middleware of this.middlewares) {
                if (middleware.afterUpdate) {
                    await middleware.afterUpdate(this.state, this.previousState, action);
                }
            }
            
            // اطلاع‌رسانی به listeners
            this._notifyListeners(action);
            
            console.log(`State updated: ${type}`, payload);
            return this.getState();
            
        } catch (error) {
            console.error('State update failed:', error);
            throw error;
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * ثبت listener برای تغییرات state
     * @param {IStateListener|Function} listener - listener
     * @returns {Function} - تابع unsubscribe
     */
    subscribe(listener) {
        if (typeof listener !== 'function' && !listener.onStateChanged) {
            throw new Error('Listener must be a function or implement IStateListener');
        }
        
        this.listeners.add(listener);
        console.log('New listener subscribed');
        
        return () => this.unsubscribe(listener);
    }

    /**
     * حذف listener
     * @param {IStateListener|Function} listener - listener
     */
    unsubscribe(listener) {
        this.listeners.delete(listener);
    }

    /**
     * افزودن middleware
     * @param {IStateMiddleware} middleware - middleware
     */
    addMiddleware(middleware) {
        if (!middleware.beforeUpdate && !middleware.afterUpdate) {
            throw new Error('Middleware must implement beforeUpdate or afterUpdate');
        }
        
        this.middlewares.push(middleware);
        console.log('Middleware added');
    }

    /**
     * بازگشت به state قبلی
     * @returns {boolean} - موفقیت‌آمیز بودن
     */
    undo() {
        if (this.actionHistory.length === 0) {
            console.warn('No actions to undo');
            return false;
        }
        
        const lastAction = this.actionHistory.pop();
        console.log('Undoing action:', lastAction.type);
        
        // TODO: Implement proper undo logic based on action types
        // For now, just restore previous state
        if (this.actionHistory.length > 0) {
            // Simulate undo by restoring state before last action
            this.state = structuredClone(this.previousState);
            this._notifyListeners({ type: 'UNDO', payload: lastAction });
            return true;
        }
        
        return false;
    }

    /**
     * پاک‌سازی state (برای تست)
     */
    reset() {
        this.state = structuredClone(initialState);
        this.previousState = structuredClone(initialState);
        this.actionHistory = [];
        this._notifyListeners({ type: 'RESET', payload: null });
        console.log('State reset to initial');
    }

    /**
     * Reducer اصلی برای مدیریت actionها
     * @private
     */
    _reducer(state, action) {
        const newState = structuredClone(state);
        
        switch (action.type) {
            // Authentication Actions
            case ActionTypes.USER_LOGIN:
                newState.auth = {
                    isAuthenticated: true,
                    isLoading: false,
                    error: null,
                    user: action.payload.user,
                    token: action.payload.token,
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
                const { lessonId, score, xpEarned } = action.payload;
                
                // Add to completed lessons
                if (!newState.learning.completedLessons.includes(lessonId)) {
                    newState.learning.completedLessons.push(lessonId);
                }
                
                // Update XP and level
                newState.learning.xp += xpEarned;
                newState.learning.level = this._calculateLevel(newState.learning.xp);
                
                // Update today's progress
                newState.progress.todayProgress.lessonsCompleted += 1;
                newState.progress.todayProgress.xpEarned += xpEarned;
                
                break;
                
            // Settings Actions
            case ActionTypes.SETTINGS_CHANGE:
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
                
            default:
                console.warn(`Unknown action type: ${action.type}`);
        }
        
        return newState;
    }

    /**
     * اطلاع‌رسانی به listeners
     * @private
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
     * افزودن action به تاریخچه
     * @private
     */
    _addToHistory(action) {
        this.actionHistory.push(action);
        
        // حفظ اندازه تاریخچه
        if (this.actionHistory.length > this.maxHistorySize) {
            this.actionHistory.shift();
        }
    }

    /**
     * محاسبه سطح بر اساس XP
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
     * دریافت مقدار از مسیر
     * @private
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
     * مقایسه عمیق دو مقدار
     * @private
     */
    _isEqual(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (typeof a !== typeof b) return false;
        
        return JSON.stringify(a) === JSON.stringify(b);
    }

    /**
     * اعتبارسنجی state
     * @private
     */
    _validateState(state) {
        // بررسی وجود ساختارهای ضروری
        const requiredKeys = ['auth', 'learning', 'progress', 'settings', 'ui'];
        for (const key of requiredKeys) {
            if (!state[key] || typeof state[key] !== 'object') {
                console.error(`Invalid state: missing ${key}`);
                return false;
            }
        }
        
        // اعتبارسنجی نوع داده‌ها
        if (typeof state.auth.isAuthenticated !== 'boolean') return false;
        if (typeof state.learning.xp !== 'number' || state.learning.xp < 0) return false;
        if (typeof state.learning.level !== 'number' || state.learning.level < 1) return false;
        
        return true;
    }
}

// ============ Middlewareهای پیش‌فرض ============
class LoggingMiddleware {
    async beforeUpdate(state, action) {
        console.log(`[${new Date().toISOString()}] Action: ${action.type}`, action.payload);
    }
    
    async afterUpdate(state, prevState, action) {
        const changes = this._findChanges(state, prevState);
        if (changes.length > 0) {
            console.log(`State changed in: ${changes.join(', ')}`);
        }
    }
    
    _findChanges(newState, oldState) {
        const changes = [];
        const compare = (obj1, obj2, path = '') => {
            for (const key in obj1) {
                const currentPath = path ? `${path}.${key}` : key;
                if (!this._isEqual(obj1[key], obj2[key])) {
                    changes.push(currentPath);
                }
                if (typeof obj1[key] === 'object' && obj1[key] !== null) {
                    compare(obj1[key], obj2[key], currentPath);
                }
            }
        };
        
        compare(newState, oldState);
        return changes;
    }
    
    _isEqual(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
}

class PersistenceMiddleware {
    constructor(storageKey = 'farsinglish_state') {
        this.storageKey = storageKey;
    }
    
    async beforeUpdate(state, action) {
        // بارگذاری state ذخیره شده اگر وجود دارد
        const savedState = localStorage.getItem(this.storageKey);
        if (savedState) {
            try {
                const parsed = JSON.parse(savedState);
                Object.assign(state, parsed);
                console.log('State loaded from persistence');
            } catch (error) {
                console.error('Failed to load state from persistence:', error);
            }
        }
    }
    
    async afterUpdate(state, prevState, action) {
        // ذخیره state در localStorage
        try {
            const stateToSave = {
                auth: state.auth,
                learning: state.learning,
                settings: state.settings
            };
            localStorage.setItem(this.storageKey, JSON.stringify(stateToSave));
        } catch (error) {
            console.error('Failed to save state:', error);
        }
    }
}

// ============ Singleton Instance ============
const stateManager = new StateManager();

// اضافه کردن middlewareهای پیش‌فرض
stateManager.addMiddleware(new LoggingMiddleware());
stateManager.addMiddleware(new PersistenceMiddleware());

// ============ Export ============
export {
    StateManager,
    stateManager,
    ActionTypes,
    IStateListener,
    IStateMiddleware,
    LoggingMiddleware,
    PersistenceMiddleware
};
