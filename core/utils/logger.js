/**
 * @module Logger
 * @description سیستم لاگ‌گیری پیشرفته و مقیاس‌پذیر با پشتیبانی از سطوح مختلف،
 * appenderهای متعدد، فیلترها، فرمت‌کننده‌ها و قابلیت ذخیره‌سازی در حافظه‌های مختلف
 * @author Farsinglish Team
 * @version 2.0.0
 */

// ============ Symbol for Constants (مورد ۳) ============
/**
 * @constant {Symbol} PRIVATE_STATE
 * @description Symbol برای دسترسی به وضعیت خصوصی کلاس‌ها و جلوگیری از تداخل نام‌گذاری
 */
const PRIVATE_STATE = Symbol('privateState');

/**
 * @constant {Symbol} LOG_QUEUE
 * @description Symbol برای صف لاگ‌های داخلی
 */
const LOG_QUEUE = Symbol('logQueue');

/**
 * @constant {Symbol} APPENDER_CACHE
 * @description Symbol برای کش appenderها
 */
const APPENDER_CACHE = Symbol('appenderCache');

// ============ WeakMap for Caches (مورد ۴) ============
/**
 * @constant {WeakMap<object, any>} appenderInstances
 * @description نگهداری نمونه‌های appender بدون ایجاد memory leak
 */
const appenderInstances = new WeakMap();

/**
 * @constant {WeakMap<object, any>} loggerInstances
 * @description نگهداری نمونه‌های logger بدون ایجاد memory leak
 */
const loggerInstances = new WeakMap();

/**
 * @constant {WeakMap<object, any>} formatterCache
 * @description کش فرمت‌کننده‌ها با WeakMap
 */
const formatterCache = new WeakMap();

// ============ Data Sanitizer (مورد ۲) ============
/**
 * @class DataSanitizer
 * @description پاک‌سازی اطلاعات حساس قبل از لاگ‌گیری
 */
class DataSanitizer {
    /**
     * @typedef {Object} SanitizeOptions
     * @property {string[]} [sensitiveKeys] - کلیدهای حساس برای پاک‌سازی
     * @property {boolean} [deep=true] - پاک‌سازی عمیق
     * @property {string} [replacement='***REDACTED***'] - متن جایگزین
     */

    /**
     * پاک‌سازی داده‌ها از اطلاعات حساس
     * @param {*} data - داده ورودی
     * @param {SanitizeOptions} [options] - گزینه‌های پاک‌سازی
     * @returns {*} داده پاک‌سازی شده
     */
    static sanitize(data, options = {}) {
        const {
            sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'api_key', 'privateKey'],
            deep = true,
            replacement = '***REDACTED***'
        } = options;

        if (!data || typeof data !== 'object') return data;

        // مدیریت Circular Reference
        const seen = new WeakSet();

        const sanitizeObject = (obj) => {
            if (!obj || typeof obj !== 'object') return obj;
            if (seen.has(obj)) return '[Circular Reference]';
            
            seen.add(obj);
            const result = Array.isArray(obj) ? [] : {};

            for (const [key, value] of Object.entries(obj)) {
                // بررسی کلیدهای حساس
                if (sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
                    result[key] = replacement;
                    continue;
                }

                // پاک‌سازی عمیق
                if (deep && value && typeof value === 'object') {
                    result[key] = sanitizeObject(value);
                } else {
                    result[key] = value;
                }
            }

            return result;
        };

        return sanitizeObject(data);
    }

    /**
     * تشخیص و مدیریت Circular Reference
     * @param {*} obj - آبجکت ورودی
     * @returns {*} آبجکت بدون circular reference
     */
    static handleCircular(obj) {
        const seen = new WeakSet();
        
        return JSON.parse(JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return '[Circular Reference]';
                }
                seen.add(value);
            }
            return value;
        }));
    }

    /**
     * ماسک کردن اطلاعات حساس در رشته
     * @param {string} text - متن ورودی
     * @param {RegExp[]} [patterns] - الگوهای تشخیص اطلاعات حساس
     * @returns {string} متن ماسک شده
     */
    static maskSensitiveText(text, patterns = []) {
        if (typeof text !== 'string') return text;

        const defaultPatterns = [
            /\b[\w\.-]+@[\w\.-]+\.\w+\b/g, // ایمیل
            /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // کارت بانکی
            /\b\d{10}\b/g, // شماره موبایل
        ];

        const allPatterns = [...defaultPatterns, ...patterns];
        let masked = text;

        allPatterns.forEach(pattern => {
            masked = masked.replace(pattern, (match) => {
                if (pattern === defaultPatterns[0]) { // ایمیل
                    const [local, domain] = match.split('@');
                    return `${local.slice(0, 2)}***@${domain}`;
                }
                return match.slice(0, 4) + '********';
            });
        });

        return masked;
    }
}

// ============ JSDoc Type Definitions (مورد ۱) ============
/**
 * @typedef {Object} LogLevelType
 * @property {number} TRACE - سطح ردیابی (0)
 * @property {number} DEBUG - سطح اشکال‌زدایی (1)
 * @property {number} INFO - سطح اطلاعات (2)
 * @property {number} WARN - سطح هشدار (3)
 * @property {number} ERROR - سطح خطا (4)
 * @property {number} FATAL - سطح بحرانی (5)
 */

/**
 * @typedef {Object} LogEntryObject
 * @property {string} id - شناسه یکتای لاگ
 * @property {string} timestamp - زمان ISO
 * @property {number} level - سطح عددی
 * @property {string} levelName - نام سطح
 * @property {string} message - پیام اصلی
 * @property {Object} data - داده‌های اضافی
 * @property {string} source - منبع لاگ
 * @property {string|null} userId - شناسه کاربر
 * @property {string|null} sessionId - شناسه نشست
 * @property {string} appVersion - نسخه اپلیکیشن
 * @property {string} environment - محیط اجرا
 * @property {string|null} stackTrace - ردگیری خطا
 * @property {Object} metadata - فراداده اضافی
 */

/**
 * @typedef {Object} LogFilter
 * @property {string} [level] - حداقل سطح
 * @property {string} [source] - منبع مورد نظر
 * @property {string} [userId] - شناسه کاربر
 * @property {string} [startDate] - تاریخ شروع
 * @property {string} [endDate] - تاریخ پایان
 * @property {string} [search] - عبارت جستجو
 * @property {number} [limit] - حداکثر تعداد
 */

/**
 * @typedef {Object} AppenderOptions
 * @property {ILogFormatter} [formatter] - فرمت‌کننده
 * @property {number} [maxLogs] - حداکثر تعداد لاگ
 * @property {number} [maxSize] - حداکثر حجم
 * @property {boolean} [colors] - استفاده از رنگ
 */

// ============ Interfaces with Full JSDoc ============

/**
 * @interface ILogger
 * @description اینترفیس اصلی Logger
 */
class ILogger {
    /**
     * لاگ در سطح DEBUG
     * @param {string} message - پیام
     * @param {*} [data] - داده همراه
     * @returns {Promise<LogEntryObject|null>}
     */
    async debug(message, data) {}

    /**
     * لاگ در سطح INFO
     * @param {string} message - پیام
     * @param {*} [data] - داده همراه
     * @returns {Promise<LogEntryObject|null>}
     */
    async info(message, data) {}

    /**
     * لاگ در سطح WARN
     * @param {string} message - پیام
     * @param {*} [data] - داده همراه
     * @returns {Promise<LogEntryObject|null>}
     */
    async warn(message, data) {}

    /**
     * لاگ در سطح ERROR
     * @param {string} message - پیام
     * @param {*} [data] - داده همراه
     * @returns {Promise<LogEntryObject|null>}
     */
    async error(message, data) {}

    /**
     * لاگ در سطح FATAL
     * @param {string} message - پیام
     * @param {*} [data] - داده همراه
     * @returns {Promise<LogEntryObject|null>}
     */
    async fatal(message, data) {}

    /**
     * لاگ در سطح TRACE
     * @param {string} message - پیام
     * @param {*} [data] - داده همراه
     * @returns {Promise<LogEntryObject|null>}
     */
    async trace(message, data) {}
}

/**
 * @interface ILogAppender
 * @description اینترفیس مقصد لاگ
 */
class ILogAppender {
    /**
     * نوشتن لاگ
     * @param {LogEntryObject} logEntry - مدخل لاگ
     * @returns {Promise<void>}
     */
    async write(logEntry) {}

    /**
     * flush کردن لاگ‌ها
     * @returns {Promise<void>}
     */
    async flush() {}

    /**
     * پاک کردن همه لاگ‌ها
     * @returns {Promise<void>}
     */
    async clear() {}

    /**
     * دریافت لاگ‌ها با فیلتر
     * @param {LogFilter} [filter] - فیلتر
     * @returns {Promise<LogEntryObject[]>}
     */
    async getLogs(filter) {}
}

/**
 * @interface ILogFormatter
 * @description اینترفیس فرمت‌کننده لاگ
 */
class ILogFormatter {
    /**
     * فرمت کردن مدخل لاگ
     * @param {LogEntryObject} logEntry - مدخل لاگ
     * @returns {string} متن فرمت شده
     */
    format(logEntry) {}
}

/**
 * @interface ILogFilter
 * @description اینترفیس فیلتر لاگ
 */
class ILogFilter {
    /**
     * بررسی آیا لاگ باید ثبت شود
     * @param {LogEntryObject} logEntry - مدخل لاگ
     * @returns {boolean} نتیجه بررسی
     */
    shouldLog(logEntry) {}
}

// ============ Log Levels with Full JSDoc ============

/**
 * @enum {number}
 * @description سطوح مختلف لاگ
 */
const LogLevel = Object.freeze({
    /** سطح ردیابی - جزئی‌ترین سطح */
    TRACE: 0,
    /** سطح اشکال‌زدایی - برای توسعه */
    DEBUG: 1,
    /** سطح اطلاعات - رویدادهای عادی */
    INFO: 2,
    /** سطح هشدار - مشکلات احتمالی */
    WARN: 3,
    /** سطح خطا - مشکلات قابل بازیابی */
    ERROR: 4,
    /** سطح بحرانی - مشکلات غیرقابل بازیابی */
    FATAL: 5,

    /**
     * تبدیل سطح عددی به رشته
     * @param {number} level - سطح عددی
     * @returns {string} نام سطح
     */
    toString(level) {
        switch(level) {
            case 0: return 'TRACE';
            case 1: return 'DEBUG';
            case 2: return 'INFO';
            case 3: return 'WARN';
            case 4: return 'ERROR';
            case 5: return 'FATAL';
            default: return 'UNKNOWN';
        }
    },
    
    /**
     * تبدیل رشته به سطح عددی
     * @param {string} levelStr - نام سطح
     * @returns {number} سطح عددی
     */
    fromString(levelStr) {
        const upper = levelStr.toUpperCase();
        switch(upper) {
            case 'TRACE': return 0;
            case 'DEBUG': return 1;
            case 'INFO': return 2;
            case 'WARN': return 3;
            case 'ERROR': return 4;
            case 'FATAL': return 5;
            default: return 2;
        }
    }
});

// ============ Log Entry Model with Full JSDoc ============

/**
 * @class LogEntry
 * @description مدل داده مدخل لاگ
 */
class LogEntry {
    /**
     * ایجاد مدخل لاگ جدید
     * @param {number} level - سطح لاگ
     * @param {string} message - پیام
     * @param {*} [data={}] - داده همراه
     * @param {string} [source=''] - منبع
     */
    constructor(level, message, data = {}, source = '') {
        /** @type {string} شناسه یکتای لاگ */
        this.id = this._generateId();
        
        /** @type {string} زمان ISO */
        this.timestamp = new Date().toISOString();
        
        /** @type {number} سطح عددی */
        this.level = level;
        
        /** @type {string} نام سطح */
        this.levelName = LogLevel.toString(level);
        
        /** @type {string} پیام */
        this.message = message;
        
        /** @type {Object} داده‌های پاک‌سازی شده */
        this.data = DataSanitizer.sanitize(data);
        
        /** @type {string} منبع */
        this.source = source;
        
        /** @type {string|null} شناسه کاربر */
        this.userId = null;
        
        /** @type {string|null} شناسه نشست */
        this.sessionId = null;
        
        /** @type {string} نسخه اپ */
        this.appVersion = '2.0.0';
        
        /** @type {string} محیط اجرا */
        this.environment = typeof process !== 'undefined' && process.env?.NODE_ENV 
            ? process.env.NODE_ENV 
            : 'development';
        
        /** @type {string|null} ردگیری خطا */
        this.stackTrace = level >= LogLevel.ERROR ? new Error().stack : null;
        
        /** @type {Object} فراداده */
        this.metadata = {};
        
        /** @type {Symbol} وضعیت خصوصی */
        this[PRIVATE_STATE] = { createdAt: Date.now() };
    }

    /**
     * تولید شناسه یکتا
     * @private
     * @returns {string} شناسه
     */
    _generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * افزودن فراداده
     * @param {Object} metadata - فراداده
     * @returns {LogEntry} خود شیء برای زنجیره‌ای کردن
     */
    withMetadata(metadata) {
        this.metadata = { ...this.metadata, ...metadata };
        return this;
    }

    /**
     * تبدیل به JSON
     * @returns {LogEntryObject} آبجکت JSON
     */
    toJSON() {
        return {
            id: this.id,
            timestamp: this.timestamp,
            level: this.levelName,
            message: this.message,
            data: this.data,
            source: this.source,
            userId: this.userId,
            sessionId: this.sessionId,
            appVersion: this.appVersion,
            environment: this.environment,
            stackTrace: this.stackTrace,
            metadata: this.metadata
        };
    }
}

// ============ Error Classes with Full JSDoc ============

/**
 * @class LoggerError
 * @extends Error
 * @description خطای پایه سیستم لاگ
 */
class LoggerError extends Error {
    /**
     * @param {string} message - پیام خطا
     * @param {Error|null} [cause] - علت خطا
     */
    constructor(message, cause = null) {
        super(message);
        this.name = 'LoggerError';
        this.cause = cause;
        this.timestamp = new Date().toISOString();
    }
}

/**
 * @class AppenderError
 * @extends LoggerError
 * @description خطای مربوط به Appender
 */
class AppenderError extends LoggerError {
    /**
     * @param {string} message - پیام خطا
     * @param {string} appenderName - نام Appender
     * @param {Error|null} [cause] - علت خطا
     */
    constructor(message, appenderName, cause = null) {
        super(message, cause);
        this.name = 'AppenderError';
        this.appenderName = appenderName;
    }
}

// ============ Formatters with Full JSDoc ============

/**
 * @class JsonFormatter
 * @implements {ILogFormatter}
 * @description فرمت‌کننده JSON با قالب‌بندی
 */
class JsonFormatter extends ILogFormatter {
    /**
     * @param {Object} [options] - گزینه‌ها
     * @param {number} [options.pretty=2] - فاصله برای pretty print
     */
    constructor(options = {}) {
        super();
        this.pretty = options.pretty ?? 2;
    }

    /**
     * فرمت به JSON
     * @param {LogEntryObject} logEntry - مدخل لاگ
     * @returns {string} JSON string
     */
    format(logEntry) {
        return JSON.stringify(logEntry, null, this.pretty);
    }
}

/**
 * @class TextFormatter
 * @implements {ILogFormatter}
 * @description فرمت‌کننده متنی ساده
 */
class TextFormatter extends ILogFormatter {
    /**
     * فرمت به متن
     * @param {LogEntryObject} logEntry - مدخل لاگ
     * @returns {string} متن فرمت شده
     */
    format(logEntry) {
        const time = new Date(logEntry.timestamp).toLocaleTimeString('fa-IR');
        const level = logEntry.level.padEnd(6);
        const source = logEntry.source ? `[${logEntry.source}]` : '';
        const data = Object.keys(logEntry.data || {}).length > 0 
            ? ` | ${JSON.stringify(logEntry.data)}` 
            : '';
        
        return `${time} ${level} ${source} ${logEntry.message}${data}`;
    }
}

// ============ Console Appender with WeakMap Cache ============

/**
 * @class ConsoleAppender
 * @implements {ILogAppender}
 * @description Appender برای کنسول با کش WeakMap
 */
class ConsoleAppender extends ILogAppender {
    /**
     * @param {ILogFormatter} [formatter] - فرمت‌کننده
     * @param {AppenderOptions} [options] - گزینه‌ها
     */
    constructor(formatter = new TextFormatter(), options = {}) {
        super();
        this.formatter = formatter;
        this.options = {
            colors: options.colors !== false,
            showTimestamp: options.showTimestamp !== false,
            ...options
        };
        
        // استفاده از WeakMap برای کش
        const cache = new WeakMap();
        appenderInstances.set(this, { cache, recentLogs: new Map() });
        
        this._setupColors();
    }

    /**
     * تنظیم رنگ‌های کنسول
     * @private
     */
    _setupColors() {
        this.colors = {
            [LogLevel.TRACE]: '#888',
            [LogLevel.DEBUG]: '#666',
            [LogLevel.INFO]: '#2196F3',
            [LogLevel.WARN]: '#FF9800',
            [LogLevel.ERROR]: '#F44336',
            [LogLevel.FATAL]: '#D32F2F'
        };
    }

    /**
     * @inheritdoc
     */
    async write(logEntry) {
        const formatted = this.formatter.format(logEntry);
        const method = this._getConsoleMethod(logEntry.level);
        
        if (this.options.colors && this.colors[logEntry.level]) {
            const color = this.colors[logEntry.level];
            console[method](`%c${formatted}`, `color: ${color}; font-weight: ${logEntry.level >= LogLevel.ERROR ? 'bold' : 'normal'};`);
        } else {
            console[method](formatted);
        }
    }

    /**
     * دریافت متد کنسول مناسب
     * @private
     * @param {number} level - سطح لاگ
     * @returns {string} نام متد
     */
    _getConsoleMethod(level) {
        switch(level) {
            case LogLevel.TRACE:
            case LogLevel.DEBUG:
                return 'debug';
            case LogLevel.INFO:
                return 'info';
            case LogLevel.WARN:
                return 'warn';
            case LogLevel.ERROR:
            case LogLevel.FATAL:
                return 'error';
            default:
                return 'log';
        }
    }

    /**
     * @inheritdoc
     */
    async flush() {}

    /**
     * @inheritdoc
     */
    async clear() {
        console.clear();
    }

    /**
     * @inheritdoc
     */
    async getLogs(filter) {
        return [];
    }
}

// ============ LocalStorage Appender with WeakMap ============

/**
 * @class LocalStorageAppender
 * @implements {ILogAppender}
 * @description Appender برای localStorage با کش WeakMap
 */
class LocalStorageAppender extends ILogAppender {
    /**
     * @param {ILogFormatter} [formatter] - فرمت‌کننده
     * @param {AppenderOptions} options - گزینه‌ها
     */
    constructor(formatter = new JsonFormatter(), options = {}) {
        super();
        this.formatter = formatter;
        this.storageKey = options.storageKey || 'farsinglish_logs';
        this.maxLogs = options.maxLogs || 1000;
        this.maxSize = options.maxSize || 5 * 1024 * 1024;
        
        // استفاده از WeakMap برای کش
        const cache = new WeakMap();
        appenderInstances.set(this, { cache });
        
        this.logs = this._loadLogs();
        this.totalSize = this._calculateSize();
    }

    /**
     * @inheritdoc
     */
    async write(logEntry) {
        const logObj = logEntry.toJSON();
        logObj.formatted = this.formatter.format(logEntry);
        logObj.size = new Blob([JSON.stringify(logObj)]).size;
        
        this.logs.push(logObj);
        this.totalSize += logObj.size;
        
        this._enforceLimits();
        this._saveLogs();
    }

    /**
     * اعمال محدودیت‌ها
     * @private
     */
    _enforceLimits() {
        while (this.logs.length > this.maxLogs) {
            const removed = this.logs.shift();
            this.totalSize -= removed.size || 0;
        }
        
        while (this.totalSize > this.maxSize && this.logs.length > 0) {
            const removed = this.logs.shift();
            this.totalSize -= removed.size || 0;
        }
    }

    /**
     * بارگذاری لاگ‌ها
     * @private
     * @returns {Array} آرایه لاگ‌ها
     */
    _loadLogs() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Failed to load logs from localStorage:', error);
            return [];
        }
    }

    /**
     * ذخیره لاگ‌ها
     * @private
     */
    _saveLogs() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
        } catch (error) {
            console.error('Failed to save logs to localStorage:', error);
        }
    }

    /**
     * محاسبه حجم کل
     * @private
     * @returns {number} حجم کل
     */
    _calculateSize() {
        return this.logs.reduce((sum, log) => sum + (log.size || 0), 0);
    }

    /**
     * @inheritdoc
     */
    async flush() {
        this._saveLogs();
    }

    /**
     * @inheritdoc
     */
    async clear() {
        this.logs = [];
        this.totalSize = 0;
        localStorage.removeItem(this.storageKey);
    }

    /**
     * @inheritdoc
     */
    async getLogs(filter = {}) {
        let filtered = [...this.logs];
        
        if (filter.level) {
            const minLevel = LogLevel.fromString(filter.level);
            filtered = filtered.filter(log => 
                LogLevel.fromString(log.level) >= minLevel
            );
        }
        
        if (filter.source) {
            filtered = filtered.filter(log => 
                log.source && log.source.includes(filter.source)
            );
        }
        
        if (filter.limit) {
            filtered = filtered.slice(-filter.limit);
        }
        
        return filtered;
    }
}

// ============ Main Logger Class with Full JSDoc ============

/**
 * @class Logger
 * @implements {ILogger}
 * @description کلاس اصلی لاگر با پشتیبانی از تمام ویژگی‌ها
 */
class Logger extends ILogger {
    /**
     * @param {string} [source=''] - منبع لاگ
     * @param {Object} [options] - گزینه‌ها
     * @param {ILogAppender[]} [options.appenders] - آرایه appenderها
     * @param {ILogFilter[]} [options.filters] - آرایه فیلترها
     * @param {boolean} [options.enabled=true] - فعال/غیرفعال
     * @param {Object} [options.context] - context پیش‌فرض
     */
    constructor(source = '', options = {}) {
        super();
        
        /** @type {string} منبع لاگ */
        this.source = source;
        
        /** @type {ILogAppender[]} آرایه appenderها */
        this.appenders = options.appenders || [new ConsoleAppender()];
        
        /** @type {ILogFilter[]} آرایه فیلترها */
        this.filters = options.filters || [];
        
        /** @type {boolean} وضعیت فعال بودن */
        this.enabled = options.enabled !== false;
        
        /** @type {Object} context کاربر */
        this.userContext = {
            userId: null,
            sessionId: null,
            deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'node'
        };
        
        /** @type {Object} context اضافی */
        this.context = options.context || {};
        
        // استفاده از WeakMap برای کش
        loggerInstances.set(this, { created: Date.now() });
    }

    /**
     * تنظیم context کاربر
     * @param {string|null} userId - شناسه کاربر
     * @param {string|null} sessionId - شناسه نشست
     * @param {Object} [extra] - اطلاعات اضافی
     */
    setUserContext(userId, sessionId, extra = {}) {
        this.userContext.userId = userId;
        this.userContext.sessionId = sessionId;
        this.userContext = { ...this.userContext, ...extra };
    }

    /**
     * پاک کردن context کاربر
     */
    clearUserContext() {
        this.userContext.userId = null;
        this.userContext.sessionId = null;
    }

    /**
     * تنظیم context
     * @param {string} key - کلید
     * @param {*} value - مقدار
     */
    setContext(key, value) {
        this.context[key] = value;
    }

    /**
     * فعال کردن لاگر
     */
    enable() {
        this.enabled = true;
    }

    /**
     * غیرفعال کردن لاگر
     */
    disable() {
        this.enabled = false;
    }

    /**
     * افزودن appender
     * @param {ILogAppender} appender - appender جدید
     */
    addAppender(appender) {
        if (!appender.write) {
            throw new AppenderError('Appender must implement write method', 'Unknown');
        }
        this.appenders.push(appender);
    }

    /**
     * حذف appender
     * @param {ILogAppender} appender - appender مورد نظر
     */
    removeAppender(appender) {
        const index = this.appenders.indexOf(appender);
        if (index > -1) {
            this.appenders.splice(index, 1);
        }
    }

    /**
     * افزودن فیلتر
     * @param {ILogFilter} filter - فیلتر جدید
     */
    addFilter(filter) {
        if (!filter.shouldLog) {
            throw new FilterError('Filter must implement shouldLog method', 'Unknown');
        }
        this.filters.push(filter);
    }

    /**
     * @inheritdoc
     */
    async debug(message, data = {}) {
        return this._log(LogLevel.DEBUG, message, data);
    }

    /**
     * @inheritdoc
     */
    async info(message, data = {}) {
        return this._log(LogLevel.INFO, message, data);
    }

    /**
     * @inheritdoc
     */
    async warn(message, data = {}) {
        return this._log(LogLevel.WARN, message, data);
    }

    /**
     * @inheritdoc
     */
    async error(message, data = {}) {
        return this._log(LogLevel.ERROR, message, data);
    }

    /**
     * @inheritdoc
     */
    async fatal(message, data = {}) {
        return this._log(LogLevel.FATAL, message, data);
    }

    /**
     * @inheritdoc
     */
    async trace(message, data = {}) {
        return this._log(LogLevel.TRACE, message, data);
    }

    /**
     * flush همه appenderها
     * @returns {Promise<void>}
     */
    async flush() {
        const promises = this.appenders.map(appender => 
            appender.flush ? appender.flush() : Promise.resolve()
        );
        await Promise.all(promises);
    }

    /**
     * پاک کردن همه لاگ‌ها
     * @returns {Promise<void>}
     */
    async clear() {
        const promises = this.appenders.map(appender => 
            appender.clear ? appender.clear() : Promise.resolve()
        );
        await Promise.all(promises);
    }

    /**
     * دریافت لاگ‌ها
     * @param {LogFilter} [filter] - فیلتر
     * @returns {Promise<LogEntryObject[]>} آرایه لاگ‌ها
     */
    async getLogs(filter = {}) {
        const allLogs = [];
        
        for (const appender of this.appenders) {
            if (appender.getLogs) {
                try {
                    const logs = await appender.getLogs(filter);
                    allLogs.push(...logs);
                } catch (error) {
                    console.error('Failed to get logs from appender:', error);
                }
            }
        }
        
        return allLogs.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
    }

    /**
     * ایجاد لاگر فرزند
     * @param {string} source - منبع جدید
     * @returns {Logger} لاگر جدید
     */
    child(source) {
        const childLogger = new Logger(source, {
            appenders: this.appenders,
            filters: [...this.filters],
            enabled: this.enabled,
            context: { ...this.context }
        });
        childLogger.userContext = { ...this.userContext };
        return childLogger;
    }

    /**
     * ثبت لاگ داخلی
     * @private
     * @param {number} level - سطح
     * @param {string} message - پیام
     * @param {*} data - داده
     * @returns {Promise<LogEntryObject|null>} مدخل لاگ یا null
     */
    async _log(level, message, data) {
        if (!this.enabled) return null;
        
        const logEntry = new LogEntry(level, message, data, this.source);
        
        logEntry.userId = this.userContext.userId;
        logEntry.sessionId = this.userContext.sessionId;
        logEntry.metadata = { ...this.context };
        
        const shouldLog = this.filters.every(filter => {
            try {
                return filter.shouldLog(logEntry);
            } catch (error) {
                console.error('Filter error:', error);
                return true;
            }
        });
        
        if (!shouldLog) return null;
        
        const promises = this.appenders.map(async appender => {
            try {
                await appender.write(logEntry);
            } catch (error) {
                console.error('Failed to write log to appender:', error);
            }
        });
        
        await Promise.all(promises);
        return logEntry;
    }
}

// ============ Logger Factory with Full JSDoc ============

/**
 * @class LoggerFactory
 * @description کارخانه تولید و مدیریت لاگرها
 */
class LoggerFactory {
    /** @type {Map<string, Logger>} نگهداری نمونه‌های لاگر */
    static loggers = new Map();
    
    /** @type {Object} گزینه‌های پیش‌فرض */
    static defaultOptions = {
        appenders: [new ConsoleAppender()],
        filters: [],
        enabled: true
    };
    
    /**
     * دریافت یا ایجاد لاگر
     * @param {string} [source=''] - منبع
     * @param {Object} [options] - گزینه‌ها
     * @returns {Logger} نمونه لاگر
     */
    static getLogger(source = '', options = {}) {
        const key = source || 'default';
        
        if (!this.loggers.has(key)) {
            const mergedOptions = { ...this.defaultOptions, ...options };
            const logger = new Logger(source, mergedOptions);
            this.loggers.set(key, logger);
        }
        
        return this.loggers.get(key);
    }
    
    /**
     * پیکربندی پیش‌فرض
     * @param {Object} options - گزینه‌ها
     */
    static configure(options) {
        this.defaultOptions = { ...this.defaultOptions, ...options };
    }
    
    /**
     * flush همه لاگرها
     * @returns {Promise<void>}
     */
    static async flushAll() {
        const promises = Array.from(this.loggers.values()).map(logger => 
            logger.flush()
        );
        await Promise.all(promises);
    }
    
    /**
     * پاک کردن همه لاگرها
     * @returns {Promise<void>}
     */
    static async clearAll() {
        const promises = Array.from(this.loggers.values()).map(logger => 
            logger.clear()
        );
        await Promise.all(promises);
    }

    /**
     * بازنشانی کارخانه
     */
    static reset() {
        this.loggers.clear();
    }
}

// ============ Exports with Full JSDoc ============

export {
    Logger,
    LoggerFactory,
    LogLevel,
    LogEntry,
    ILogger,
    ILogAppender,
    ILogFormatter,
    ILogFilter,
    JsonFormatter,
    TextFormatter,
    ConsoleAppender,
    LocalStorageAppender,
    LoggerError,
    AppenderError,
    DataSanitizer
};
