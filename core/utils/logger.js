// core/utils/logger.js
/**
 * Logger Service - سیستم لاگ‌گیری پیشرفته و قابل تنظیم
 * مسئولیت: مدیریت لاگ‌ها در سطوح مختلف، ذخیره‌سازی و گزارش‌دهی
 * اصل SRP: فقط مدیریت لاگ‌گیری و گزارش‌دهی
 * اصل OCP: قابلیت افزودن Appenderهای جدید بدون تغییر کد اصلی
 * اصل DIP: وابستگی به اینترفیس‌های Logger و Appender
 * اصل ISP: اینترفیس‌های مجزا برای سطوح مختلف لاگ
 * اصل LSP: Appenderهای مختلف قابل جایگزینی
 */

// ============ Interfaces ============
class ILogger {
    debug(message, data) {}
    info(message, data) {}
    warn(message, data) {}
    error(message, data) {}
    fatal(message, data) {}
    trace(message, data) {}
}

class ILogAppender {
    write(logEntry) {}
    flush() {}
    clear() {}
    getLogs(filter) {}
}

class ILogFormatter {
    format(logEntry) {}
}

class ILogFilter {
    shouldLog(logEntry) {}
}

// ============ Log Levels ============
const LogLevel = Object.freeze({
    TRACE: 0,
    DEBUG: 1,
    INFO: 2,
    WARN: 3,
    ERROR: 4,
    FATAL: 5,
    
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
    
    fromString(levelStr) {
        const upper = levelStr.toUpperCase();
        switch(upper) {
            case 'TRACE': return 0;
            case 'DEBUG': return 1;
            case 'INFO': return 2;
            case 'WARN': return 3;
            case 'ERROR': return 4;
            case 'FATAL': return 5;
            default: return 2; // INFO as default
        }
    }
});

// ============ Log Entry Model ============
class LogEntry {
    constructor(level, message, data = {}, source = '') {
        this.id = this._generateId();
        this.timestamp = new Date().toISOString();
        this.level = level;
        this.levelName = LogLevel.toString(level);
        this.message = message;
        this.data = data;
        this.source = source;
        this.userId = null;
        this.sessionId = null;
        this.appVersion = '1.0.0';
        this.environment = process.env.NODE_ENV || 'development';
        this.stackTrace = level >= LogLevel.ERROR ? new Error().stack : null;
    }

    _generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

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
            stackTrace: this.stackTrace
        };
    }
}

// ============ Formatters ============
class JsonFormatter extends ILogFormatter {
    format(logEntry) {
        return JSON.stringify(logEntry.toJSON(), null, 2);
    }
}

class TextFormatter extends ILogFormatter {
    format(logEntry) {
        const time = new Date(logEntry.timestamp).toLocaleTimeString('fa-IR');
        const level = logEntry.levelName.padEnd(6);
        const source = logEntry.source ? `[${logEntry.source}]` : '';
        const data = Object.keys(logEntry.data).length > 0 
            ? ` | ${JSON.stringify(logEntry.data)}` 
            : '';
        
        return `${time} ${level} ${source} ${logEntry.message}${data}`;
    }
}

class PersianFormatter extends ILogFormatter {
    format(logEntry) {
        const persianTime = new Date(logEntry.timestamp).toLocaleTimeString('fa-IR');
        const persianLevel = this._getPersianLevel(logEntry.levelName);
        const source = logEntry.source ? `[${logEntry.source}]` : '';
        const data = Object.keys(logEntry.data).length > 0 
            ? ` | داده‌ها: ${JSON.stringify(logEntry.data, null, 2)}` 
            : '';
        
        return `⏰ ${persianTime} | ${persianLevel} ${source} | ${logEntry.message}${data}`;
    }

    _getPersianLevel(level) {
        const levels = {
            'TRACE': 'ردیابی',
            'DEBUG': 'اشکال‌زدایی',
            'INFO': 'اطلاعات',
            'WARN': 'هشدار',
            'ERROR': 'خطا',
            'FATAL': 'بحرانی'
        };
        return levels[level] || level;
    }
}

// ============ Filters ============
class LevelFilter extends ILogFilter {
    constructor(minLevel = LogLevel.INFO) {
        super();
        this.minLevel = minLevel;
    }

    shouldLog(logEntry) {
        return logEntry.level >= this.minLevel;
    }
}

class SourceFilter extends ILogFilter {
    constructor(allowedSources = []) {
        super();
        this.allowedSources = new Set(allowedSources.map(s => s.toLowerCase()));
    }

    shouldLog(logEntry) {
        if (this.allowedSources.size === 0) return true;
        return this.allowedSources.has(logEntry.source.toLowerCase());
    }
}

class RegexFilter extends ILogFilter {
    constructor(pattern, include = true) {
        super();
        this.pattern = new RegExp(pattern);
        this.include = include;
    }

    shouldLog(logEntry) {
        const matches = this.pattern.test(logEntry.message);
        return this.include ? matches : !matches;
    }
}

// ============ Appenders ============
class ConsoleAppender extends ILogAppender {
    constructor(formatter = new TextFormatter(), options = {}) {
        super();
        this.formatter = formatter;
        this.options = {
            colors: options.colors !== false,
            showTimestamp: options.showTimestamp !== false,
            showSource: options.showSource !== false
        };
        this._setupColors();
    }

    write(logEntry) {
        const formatted = this.formatter.format(logEntry);
        const method = this._getConsoleMethod(logEntry.level);
        
        if (this.options.colors && this.colors[logEntry.level]) {
            const color = this.colors[logEntry.level];
            console[method](`%c${formatted}`, `color: ${color}`);
        } else {
            console[method](formatted);
        }
    }

    flush() {
        // Nothing to flush for console
    }

    clear() {
        console.clear();
    }

    getLogs(filter) {
        console.warn('ConsoleAppender does not support retrieving logs');
        return [];
    }

    _getConsoleMethod(level) {
        switch(level) {
            case LogLevel.TRACE: return 'debug';
            case LogLevel.DEBUG: return 'debug';
            case LogLevel.INFO: return 'info';
            case LogLevel.WARN: return 'warn';
            case LogLevel.ERROR: return 'error';
            case LogLevel.FATAL: return 'error';
            default: return 'log';
        }
    }

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
}

class LocalStorageAppender extends ILogAppender {
    constructor(formatter = new JsonFormatter(), options = {}) {
        super();
        this.formatter = formatter;
        this.storageKey = options.storageKey || 'farsinglish_logs';
        this.maxLogs = options.maxLogs || 1000;
        this.logs = this._loadLogs();
    }

    write(logEntry) {
        const formatted = this.formatter.format(logEntry);
        const logObj = logEntry.toJSON();
        logObj.formatted = formatted;
        
        this.logs.push(logObj);
        
        // حفظ اندازه logs
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }
        
        this._saveLogs();
    }

    flush() {
        this._saveLogs();
    }

    clear() {
        this.logs = [];
        localStorage.removeItem(this.storageKey);
    }

    getLogs(filter = {}) {
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
        
        if (filter.startDate) {
            filtered = filtered.filter(log => 
                new Date(log.timestamp) >= new Date(filter.startDate)
            );
        }
        
        if (filter.endDate) {
            filtered = filtered.filter(log => 
                new Date(log.timestamp) <= new Date(filter.endDate)
            );
        }
        
        if (filter.search) {
            const search = filter.search.toLowerCase();
            filtered = filtered.filter(log => 
                log.message.toLowerCase().includes(search) ||
                JSON.stringify(log.data).toLowerCase().includes(search)
            );
        }
        
        return filtered;
    }

    _loadLogs() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Failed to load logs from localStorage:', error);
            return [];
        }
    }

    _saveLogs() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
        } catch (error) {
            console.error('Failed to save logs to localStorage:', error);
        }
    }
}

class IndexedDBAppender extends ILogAppender {
    constructor(formatter = new JsonFormatter(), options = {}) {
        super();
        this.formatter = formatter;
        this.dbName = options.dbName || 'farsinglish_logs_db';
        this.storeName = options.storeName || 'logs';
        this.maxLogs = options.maxLogs || 10000;
        this.db = null;
        this._initDB();
    }

    async _initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, {
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    
                    store.createIndex('timestamp_idx', 'timestamp');
                    store.createIndex('level_idx', 'level');
                    store.createIndex('source_idx', 'source');
                }
            };
        });
    }

    async write(logEntry) {
        await this._ensureConnection();
        
        const logObj = logEntry.toJSON();
        logObj.formatted = this.formatter.format(logEntry);
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.put(logObj);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = async () => {
                // حذف logs قدیمی اگر بیش از حد مجاز باشند
                await this._cleanupOldLogs();
                resolve();
            };
        });
    }

    async flush() {
        // Nothing to flush
    }

    async clear() {
        await this._ensureConnection();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.clear();
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async getLogs(filter = {}) {
        await this._ensureConnection();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp_idx');
            
            const request = index.getAll();
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                let logs = request.result;
                
                // اعمال فیلترها
                logs = this._applyFilters(logs, filter);
                
                resolve(logs);
            };
        });
    }

    async _cleanupOldLogs() {
        const logs = await this.getLogs({ limit: this.maxLogs * 2 });
        
        if (logs.length > this.maxLogs) {
            const toDelete = logs.slice(0, logs.length - this.maxLogs);
            
            for (const log of toDelete) {
                await this._deleteLog(log.id);
            }
        }
    }

    async _deleteLog(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.delete(id);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    _applyFilters(logs, filter) {
        let filtered = [...logs];
        
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
        
        if (filter.startDate) {
            filtered = filtered.filter(log => 
                new Date(log.timestamp) >= new Date(filter.startDate)
            );
        }
        
        if (filter.endDate) {
            filtered = filtered.filter(log => 
                new Date(log.timestamp) <= new Date(filter.endDate)
            );
        }
        
        if (filter.search) {
            const search = filter.search.toLowerCase();
            filtered = filtered.filter(log => 
                log.message.toLowerCase().includes(search) ||
                (log.data && JSON.stringify(log.data).toLowerCase().includes(search))
            );
        }
        
        if (filter.limit) {
            filtered = filtered.slice(-filter.limit);
        }
        
        return filtered;
    }

    async _ensureConnection() {
        if (!this.db) {
            await this._initDB();
        }
    }
}

// ============ Logger Class ============
class Logger extends ILogger {
    constructor(source = '', options = {}) {
        super();
        this.source = source;
        this.appenders = options.appenders || [new ConsoleAppender()];
        this.filters = options.filters || [new LevelFilter(LogLevel.DEBUG)];
        this.isEnabled = options.enabled !== false;
        this.userContext = {
            userId: null,
            sessionId: null,
            deviceInfo: navigator.userAgent
        };
    }

    setUserContext(userId, sessionId) {
        this.userContext.userId = userId;
        this.userContext.sessionId = sessionId;
    }

    clearUserContext() {
        this.userContext.userId = null;
        this.userContext.sessionId = null;
    }

    enable() {
        this.isEnabled = true;
    }

    disable() {
        this.isEnabled = false;
    }

    addAppender(appender) {
        if (!appender.write) {
            throw new Error('Appender must implement write method');
        }
        this.appenders.push(appender);
    }

    removeAppender(appender) {
        const index = this.appenders.indexOf(appender);
        if (index > -1) {
            this.appenders.splice(index, 1);
        }
    }

    addFilter(filter) {
        if (!filter.shouldLog) {
            throw new Error('Filter must implement shouldLog method');
        }
        this.filters.push(filter);
    }

    clearFilters() {
        this.filters = [new LevelFilter(LogLevel.DEBUG)];
    }

    async debug(message, data = {}) {
        return this._log(LogLevel.DEBUG, message, data);
    }

    async info(message, data = {}) {
        return this._log(LogLevel.INFO, message, data);
    }

    async warn(message, data = {}) {
        return this._log(LogLevel.WARN, message, data);
    }

    async error(message, data = {}) {
        return this._log(LogLevel.ERROR, message, data);
    }

    async fatal(message, data = {}) {
        return this._log(LogLevel.FATAL, message, data);
    }

    async trace(message, data = {}) {
        return this._log(LogLevel.TRACE, message, data);
    }

    async flush() {
        for (const appender of this.appenders) {
            if (appender.flush) {
                await appender.flush();
            }
        }
    }

    async clear() {
        for (const appender of this.appenders) {
            if (appender.clear) {
                await appender.clear();
            }
        }
    }

    async getLogs(filter = {}) {
        const allLogs = [];
        
        for (const appender of this.appenders) {
            if (appender.getLogs) {
                const logs = await appender.getLogs(filter);
                allLogs.push(...logs);
            }
        }
        
        return allLogs.sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
        );
    }

    // ============ Private Methods ============
    
    async _log(level, message, data) {
        if (!this.isEnabled) return;
        
        const logEntry = new LogEntry(level, message, data, this.source);
        
        // اضافه کردن context کاربر
        logEntry.userId = this.userContext.userId;
        logEntry.sessionId = this.userContext.sessionId;
        
        // اعمال فیلترها
        const shouldLog = this.filters.every(filter => filter.shouldLog(logEntry));
        if (!shouldLog) return;
        
        // نوشتن در تمام appenderها
        const promises = this.appenders.map(appender => {
            try {
                return appender.write(logEntry);
            } catch (error) {
                console.error('Failed to write log:', error);
                return Promise.resolve();
            }
        });
        
        await Promise.all(promises);
        return logEntry;
    }
}

// ============ Logger Factory ============
class LoggerFactory {
    static loggers = new Map();
    
    static getLogger(source = '', options = {}) {
        const key = source || 'default';
        
        if (!this.loggers.has(key)) {
            const logger = new Logger(source, options);
            this.loggers.set(key, logger);
        }
        
        return this.loggers.get(key);
    }
    
    static configure(options) {
        this.defaultOptions = options;
    }
    
    static async flushAll() {
        const promises = Array.from(this.loggers.values()).map(logger => 
            logger.flush()
        );
        await Promise.all(promises);
    }
    
    static async clearAll() {
        const promises = Array.from(this.loggers.values()).map(logger => 
            logger.clear()
        );
        await Promise.all(promises);
    }
}

// ============ Global Logger Instance ============
const globalLogger = LoggerFactory.getLogger('global');

// ============ Export ============
export {
    Logger,
    LoggerFactory,
    globalLogger,
    LogLevel,
    LogEntry,
    ILogger,
    ILogAppender,
    ILogFormatter,
    ILogFilter,
    JsonFormatter,
    TextFormatter,
    PersianFormatter,
    LevelFilter,
    SourceFilter,
    RegexFilter,
    ConsoleAppender,
    LocalStorageAppender,
    IndexedDBAppender
};
