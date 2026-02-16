
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
        this.environment = typeof process !== 'undefined' && process.env?.NODE_ENV 
            ? process.env.NODE_ENV 
            : 'development';
        this.stackTrace = level >= LogLevel.ERROR ? new Error().stack : null;
        this.metadata = {};
    }

    _generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    withMetadata(metadata) {
        this.metadata = { ...this.metadata, ...metadata };
        return this;
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
            stackTrace: this.stackTrace,
            metadata: this.metadata
        };
    }
}

// ============ Error Classes ============
class LoggerError extends Error {
    constructor(message, cause = null) {
        super(message);
        this.name = 'LoggerError';
        this.cause = cause;
        this.timestamp = new Date().toISOString();
    }
}

class AppenderError extends LoggerError {
    constructor(message, appenderName, cause = null) {
        super(message, cause);
        this.name = 'AppenderError';
        this.appenderName = appenderName;
    }
}

class FilterError extends LoggerError {
    constructor(message, filterName, cause = null) {
        super(message, cause);
        this.name = 'FilterError';
        this.filterName = filterName;
    }
}

// ============ Formatters ============
class JsonFormatter extends ILogFormatter {
    format(logEntry) {
        return JSON.stringify(logEntry.toJSON(), null, 2);
    }
}

class CompactJsonFormatter extends ILogFormatter {
    format(logEntry) {
        return JSON.stringify(logEntry.toJSON());
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
        const metadata = Object.keys(logEntry.metadata).length > 0
            ? ` | meta: ${JSON.stringify(logEntry.metadata)}`
            : '';
        
        return `${time} ${level} ${source} ${logEntry.message}${data}${metadata}`;
    }
}

class PersianFormatter extends ILogFormatter {
    format(logEntry) {
        const persianTime = new Date(logEntry.timestamp).toLocaleTimeString('fa-IR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const persianDate = new Date(logEntry.timestamp).toLocaleDateString('fa-IR');
        const persianLevel = this._getPersianLevel(logEntry.levelName);
        const source = logEntry.source ? `[${logEntry.source}]` : '';
        const data = Object.keys(logEntry.data).length > 0 
            ? ` | 📊 داده‌ها: ${JSON.stringify(logEntry.data, null, 2)}` 
            : '';
        const metadata = Object.keys(logEntry.metadata).length > 0
            ? ` | 📌 فراداده: ${JSON.stringify(logEntry.metadata)}`
            : '';
        
        return `🕒 ${persianDate} ${persianTime} | ${persianLevel} ${source} | ${logEntry.message}${data}${metadata}`;
    }

    _getPersianLevel(level) {
        const levels = {
            'TRACE': '🔍 ردیابی',
            'DEBUG': '🐛 اشکال‌زدایی',
            'INFO': 'ℹ️ اطلاعات',
            'WARN': '⚠️ هشدار',
            'ERROR': '❌ خطا',
            'FATAL': '💀 بحرانی'
        };
        return levels[level] || level;
    }
}

class HtmlFormatter extends ILogFormatter {
    format(logEntry) {
        const levelClass = `log-level-${logEntry.levelName.toLowerCase()}`;
        const time = new Date(logEntry.timestamp).toLocaleString('fa-IR');
        
        return `<div class="log-entry ${levelClass}">
            <span class="log-time">${time}</span>
            <span class="log-level">${logEntry.levelName}</span>
            <span class="log-source">${logEntry.source || 'global'}</span>
            <span class="log-message">${this._escapeHtml(logEntry.message)}</span>
            ${Object.keys(logEntry.data).length ? 
                `<pre class="log-data">${this._escapeHtml(JSON.stringify(logEntry.data, null, 2))}</pre>` : ''}
        </div>`;
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
        const matches = this.pattern.test(logEntry.message) || 
                       this.pattern.test(JSON.stringify(logEntry.data));
        return this.include ? matches : !matches;
    }
}

class TimeWindowFilter extends ILogFilter {
    constructor(startHour, endHour) {
        super();
        this.startHour = startHour;
        this.endHour = endHour;
    }

    shouldLog(logEntry) {
        const hour = new Date(logEntry.timestamp).getHours();
        if (this.startHour <= this.endHour) {
            return hour >= this.startHour && hour <= this.endHour;
        } else {
            return hour >= this.startHour || hour <= this.endHour;
        }
    }
}

class SamplingFilter extends ILogFilter {
    constructor(sampleRate = 0.1) {
        super();
        this.sampleRate = sampleRate;
    }

    shouldLog(logEntry) {
        return Math.random() < this.sampleRate;
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
            showSource: options.showSource !== false,
            groupSimilar: options.groupSimilar || false
        };
        this._setupColors();
        this.recentLogs = new Map();
    }

    write(logEntry) {
        const formatted = this.formatter.format(logEntry);
        const method = this._getConsoleMethod(logEntry.level);
        
        if (this.options.groupSimilar) {
            this._writeGrouped(logEntry, formatted, method);
        } else if (this.options.colors && this.colors[logEntry.level]) {
            const color = this.colors[logEntry.level];
            console[method](`%c${formatted}`, `color: ${color}; font-weight: ${logEntry.level >= LogLevel.ERROR ? 'bold' : 'normal'};`);
        } else {
            console[method](formatted);
        }
    }

    _writeGrouped(logEntry, formatted, method) {
        const key = `${logEntry.source}-${logEntry.level}-${logEntry.message}`;
        
        if (this.recentLogs.has(key)) {
            const count = this.recentLogs.get(key) + 1;
            this.recentLogs.set(key, count);
            
            if (count === 2) {
                console[method](`${formatted} (تکرار شده)`);
            } else if (count > 2) {
                // به‌روزرسانی خط قبلی
                console[method](`${formatted} (${count} بار تکرار)`);
            }
        } else {
            this.recentLogs.set(key, 1);
            console[method](formatted);
        }
        
        // پاک کردن حافظه بعد از 5 ثانیه
        setTimeout(() => this.recentLogs.delete(key), 5000);
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
        this.maxSize = options.maxSize || 5 * 1024 * 1024; // 5MB
        this.logs = this._loadLogs();
        this.totalSize = this._calculateSize();
    }

    write(logEntry) {
        const formatted = this.formatter.format(logEntry);
        const logObj = logEntry.toJSON();
        logObj.formatted = formatted;
        logObj.size = new Blob([JSON.stringify(logObj)]).size;
        
        this.logs.push(logObj);
        this.totalSize += logObj.size;
        
        // اعمال محدودیت‌ها
        this._enforceLimits();
        this._saveLogs();
    }

    _enforceLimits() {
        // محدودیت تعداد
        while (this.logs.length > this.maxLogs) {
            const removed = this.logs.shift();
            this.totalSize -= removed.size || 0;
        }
        
        // محدودیت حجم
        while (this.totalSize > this.maxSize && this.logs.length > 0) {
            const removed = this.logs.shift();
            this.totalSize -= removed.size || 0;
        }
    }

    flush() {
        this._saveLogs();
    }

    clear() {
        this.logs = [];
        this.totalSize = 0;
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
        
        if (filter.limit) {
            filtered = filtered.slice(-filter.limit);
        }
        
        return filtered;
    }

    getStats() {
        return {
            count: this.logs.length,
            size: this.totalSize,
            oldest: this.logs[0]?.timestamp,
            newest: this.logs[this.logs.length - 1]?.timestamp
        };
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

    _calculateSize() {
        return this.logs.reduce((sum, log) => sum + (log.size || 0), 0);
    }
}

class IndexedDBAppender extends ILogAppender {
    constructor(formatter = new JsonFormatter(), options = {}) {
        super();
        this.formatter = formatter;
        this.dbName = options.dbName || 'farsinglish_logs_db';
        this.storeName = options.storeName || 'logs';
        this.maxLogs = options.maxLogs || 10000;
        this.maxAge = options.maxAge || 30 * 24 * 60 * 60 * 1000; // 30 روز
        this.db = null;
        this.initialized = false;
        this.initPromise = this._initDB();
    }

    async _initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 2);
            
            request.onerror = () => {
                reject(new AppenderError('Failed to open IndexedDB', 'IndexedDBAppender', request.error));
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                this.initialized = true;
                this._startCleanupInterval();
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;
                
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, {
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    
                    store.createIndex('idx_timestamp', 'timestamp', { unique: false });
                    store.createIndex('idx_level', 'level', { unique: false });
                    store.createIndex('idx_source', 'source', { unique: false });
                    store.createIndex('idx_userId', 'userId', { unique: false });
                    store.createIndex('idx_composite', ['timestamp', 'level'], { unique: false });
                }
                
                if (oldVersion < 2) {
                    // ارتقاء نسخه
                    const store = event.target.transaction.objectStore(this.storeName);
                    store.createIndex('idx_metadata', 'metadata.type', { unique: false });
                }
            };
        });
    }

    async _ensureConnection() {
        if (!this.initialized) {
            await this.initPromise;
        }
    }

    async write(logEntry) {
        await this._ensureConnection();
        
        const logObj = logEntry.toJSON();
        logObj.formatted = this.formatter.format(logEntry);
        logObj.created_at = Date.now();
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                
                transaction.onerror = () => reject(new AppenderError('Transaction failed', 'IndexedDBAppender', transaction.error));
                transaction.oncomplete = () => resolve();
                
                const request = store.put(logObj);
                
                request.onerror = () => reject(new AppenderError('Failed to write log', 'IndexedDBAppender', request.error));
                request.onsuccess = () => {
                    this._cleanupIfNeeded().catch(console.warn);
                };
            } catch (error) {
                reject(new AppenderError('Failed to write log', 'IndexedDBAppender', error));
            }
        });
    }

    async _cleanupIfNeeded() {
        const count = await this.getCount();
        if (count > this.maxLogs) {
            await this._cleanupOldLogs();
        }
    }

    async getCount() {
        await this._ensureConnection();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const countRequest = store.count();
            
            countRequest.onerror = () => reject(countRequest.error);
            countRequest.onsuccess = () => resolve(countRequest.result);
        });
    }

    async _cleanupOldLogs() {
        await this._ensureConnection();
        
        const cutoff = Date.now() - this.maxAge;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('idx_timestamp');
            
            const range = IDBKeyRange.upperBound(cutoff);
            const request = index.openCursor(range);
            
            let deletedCount = 0;
            
            request.onerror = () => reject(request.error);
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    store.delete(cursor.primaryKey);
                    deletedCount++;
                    cursor.continue();
                }
            };
            
            transaction.oncomplete = () => {
                console.log(`Cleaned up ${deletedCount} old logs from IndexedDB`);
                resolve(deletedCount);
            };
        });
    }

    async flush() {
        // Nothing to flush for IndexedDB
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
            const index = store.index('idx_timestamp');
            
            let range = null;
            if (filter.startDate && filter.endDate) {
                range = IDBKeyRange.bound(
                    new Date(filter.startDate).getTime(),
                    new Date(filter.endDate).getTime()
                );
            } else if (filter.startDate) {
                range = IDBKeyRange.lowerBound(new Date(filter.startDate).getTime());
            } else if (filter.endDate) {
                range = IDBKeyRange.upperBound(new Date(filter.endDate).getTime());
            }
            
            const request = index.getAll(range);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                let logs = request.result;
                logs = this._applyFilters(logs, filter);
                resolve(logs);
            };
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
        
        if (filter.userId) {
            filtered = filtered.filter(log => log.userId === filter.userId);
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

    _startCleanupInterval() {
        setInterval(() => this._cleanupOldLogs(), 60 * 60 * 1000); // هر ساعت
    }
}

class NetworkAppender extends ILogAppender {
    constructor(endpoint, options = {}) {
        super();
        this.endpoint = endpoint;
        this.batchSize = options.batchSize || 10;
        this.flushInterval = options.flushInterval || 5000; // 5 ثانیه
        this.maxRetries = options.maxRetries || 3;
        this.headers = options.headers || {};
        this.timeout = options.timeout || 10000; // 10 ثانیه
        this.queue = [];
        this.failedQueue = [];
        this.isFlushing = false;
        
        this._startFlushTimer();
    }

    async write(logEntry) {
        this.queue.push(logEntry.toJSON());
        
        if (this.queue.length >= this.batchSize) {
            await this.flush();
        }
    }

    async flush() {
        if (this.isFlushing || this.queue.length === 0) return;
        
        this.isFlushing = true;
        const batch = [...this.queue];
        this.queue = [];
        
        try {
            await this._sendBatch(batch);
        } catch (error) {
            console.error('Network log failed, queueing for retry:', error);
            this.failedQueue.push(...batch);
            this._saveToLocal(batch);
        } finally {
            this.isFlushing = false;
        }
    }

    async _sendBatch(batch, retryCount = 0) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        
        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.headers
                },
                body: JSON.stringify({ 
                    logs: batch,
                    timestamp: Date.now(),
                    batchId: this._generateBatchId()
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (retryCount < this.maxRetries) {
                const delay = 1000 * Math.pow(2, retryCount);
                await new Promise(r => setTimeout(r, delay));
                return this._sendBatch(batch, retryCount + 1);
            }
            
            throw error;
        }
    }

    async clear() {
        this.queue = [];
        this.failedQueue = [];
        localStorage.removeItem('failed_logs_queue');
    }

    async getLogs() {
        return this.failedQueue;
    }

    _startFlushTimer() {
        setInterval(() => this.flush(), this.flushInterval);
    }

    _saveToLocal(logs) {
        const key = 'failed_logs_queue';
        try {
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            existing.push(...logs);
            // محدودیت 1000 لاگ
            const trimmed = existing.slice(-1000);
            localStorage.setItem(key, JSON.stringify(trimmed));
        } catch (error) {
            console.error('Failed to save failed logs to localStorage:', error);
        }
    }

    _generateBatchId() {
        return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

class FileAppender extends ILogAppender {
    constructor(formatter = new TextFormatter(), options = {}) {
        super();
        this.formatter = formatter;
        this.filename = options.filename || 'app.log';
        this.maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB
        this.backupCount = options.backupCount || 3;
        this.logs = [];
    }

    write(logEntry) {
        const formatted = this.formatter.format(logEntry);
        this.logs.push(formatted);
        
        // شبیه‌سازی نوشتن در فایل
        console.log(`[FileAppender] Would write to ${this.filename}:`, formatted);
        
        if (this.logs.length > 100) {
            this.flush();
        }
    }

    flush() {
        // شبیه‌سازی flush به فایل
        const content = this.logs.join('\n');
        console.log(`[FileAppender] Flushing ${this.logs.length} logs to ${this.filename}`);
        
        // در مرورگر واقعی، می‌توان از File System Access API استفاده کرد
        this._downloadLogs(content);
        
        this.logs = [];
    }

    _downloadLogs(content) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    clear() {
        this.logs = [];
    }

    getLogs() {
        return this.logs;
    }
}

// ============ Performance Logger ============
class PerformanceLogger {
    constructor(logger, options = {}) {
        this.logger = logger;
        this.marks = new Map();
        this.measures = new Map();
        this.threshold = options.threshold || 100; // ms
        this.enabled = options.enabled !== false;
    }

    startMark(name, metadata = {}) {
        if (!this.enabled) return;
        
        this.marks.set(name, {
            start: performance.now(),
            metadata
        });
    }

    endMark(name, additionalData = {}) {
        if (!this.enabled) return;
        
        const mark = this.marks.get(name);
        if (!mark) {
            this.logger.warn(`Mark "${name}" not found`);
            return null;
        }
        
        const duration = performance.now() - mark.start;
        this.marks.delete(name);
        
        const logData = {
            duration: `${duration.toFixed(2)}ms`,
            ...mark.metadata,
            ...additionalData
        };
        
        if (duration > this.threshold) {
            this.logger.warn(`Performance warning: ${name} took ${duration.toFixed(2)}ms`, logData);
        } else {
            this.logger.debug(`Performance: ${name}`, logData);
        }
        
        return duration;
    }

    measure(name, fn, context = null) {
        const start = performance.now();
        const result = fn.call(context);
        const duration = performance.now() - start;
        
        this.logger.debug(`Measure: ${name}`, {
            duration: `${duration.toFixed(2)}ms`,
            result: result !== undefined ? typeof result : 'void'
        });
        
        return result;
    }

    async measureAsync(name, asyncFn, context = null) {
        const start = performance.now();
        const result = await asyncFn.call(context);
        const duration = performance.now() - start;
        
        this.logger.debug(`Async Measure: ${name}`, {
            duration: `${duration.toFixed(2)}ms`
        });
        
        return result;
    }

    wrap(name, fn) {
        return (...args) => {
            const start = performance.now();
            try {
                const result = fn(...args);
                const duration = performance.now() - start;
                this.logger.debug(`Wrapped: ${name}`, {
                    duration: `${duration.toFixed(2)}ms`,
                    args: args.length
                });
                return result;
            } catch (error) {
                const duration = performance.now() - start;
                this.logger.error(`Wrapped error: ${name}`, {
                    duration: `${duration.toFixed(2)}ms`,
                    error: error.message
                });
                throw error;
            }
        };
    }

    getStats() {
        return {
            activeMarks: this.marks.size,
            marks: Array.from(this.marks.keys())
        };
    }

    clear() {
        this.marks.clear();
        this.measures.clear();
    }
}

// ============ Log Rotation Manager ============
class LogRotationManager {
    constructor(appender, options = {}) {
        this.appender = appender;
        this.maxSize = options.maxSize || 5 * 1024 * 1024; // 5MB
        this.maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 7 روز
        this.checkInterval = options.checkInterval || 60 * 60 * 1000; // 1 ساعت
        this.onRotate = options.onRotate || null;
        
        this._startRotationCheck();
    }

    async checkAndRotate() {
        try {
            const logs = await this.appender.getLogs();
            
            if (!logs || logs.length === 0) return;
            
            // بررسی حجم
            const size = new Blob([JSON.stringify(logs)]).size;
            if (size > this.maxSize) {
                await this._rotateBySize(logs);
            }
            
            // بررسی سن
            const now = Date.now();
            const oldLogs = logs.filter(log => 
                now - new Date(log.timestamp).getTime() > this.maxAge
            );
            
            if (oldLogs.length > 0) {
                await this._rotateByAge(oldLogs);
            }
        } catch (error) {
            console.error('Rotation check failed:', error);
        }
    }

    async _rotateBySize(logs) {
        const keepCount = Math.floor(logs.length * 0.5); // نگه‌داری 50%
        
        await this.appender.clear();
        
        const toKeep = logs.slice(-keepCount);
        for (const log of toKeep) {
            await this.appender.write(log);
        }
        
        if (this.onRotate) {
            this.onRotate('size', {
                removed: logs.length - keepCount,
                kept: keepCount
            });
        }
    }

    async _rotateByAge(oldLogs) {
        for (const log of oldLogs) {
            if (this.appender._deleteLog) {
                await this.appender._deleteLog(log.id);
            }
        }
        
        if (this.onRotate) {
            this.onRotate('age', {
                removed: oldLogs.length
            });
        }
    }

    _startRotationCheck() {
        setInterval(() => this.checkAndRotate(), this.checkInterval);
    }
}

// ============ Log Exporter ============
class LogExporter {
    constructor(logger) {
        this.logger = logger;
    }

    async exportToCSV(filter = {}) {
        const logs = await this.logger.getLogs(filter);
        
        if (logs.length === 0) {
            return 'No logs found';
        }
        
        const headers = ['Timestamp', 'Level', 'Message', 'Source', 'User ID', 'Data'];
        const rows = logs.map(log => [
            log.timestamp,
            log.level,
            this._escapeCSV(log.message),
            log.source || '',
            log.userId || '',
            this._escapeCSV(JSON.stringify(log.data))
        ]);
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');
        
        return csvContent;
    }

    async exportToJSON(filter = {}) {
        const logs = await this.logger.getLogs(filter);
        return JSON.stringify(logs, null, 2);
    }

    async exportToHTML(filter = {}) {
        const logs = await this.logger.getLogs(filter);
        
        const html = `
<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>Farsinglish Logs Export</title>
    <style>
        body { font-family: Vazir, Tahoma, sans-serif; margin: 20px; background: #f5f5f5; }
        .log-entry { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .log-level-TRACE { background: #e0e0e0; }
        .log-level-DEBUG { background: #d1d1d1; }
        .log-level-INFO { background: #bbdefb; }
        .log-level-WARN { background: #ffe0b2; }
        .log-level-ERROR { background: #ffcdd2; }
        .log-level-FATAL { background: #ef9a9a; font-weight: bold; }
        .log-time { color: #666; font-size: 0.8em; }
        .log-source { color: #2196F3; font-weight: bold; }
        pre { background: rgba(0,0,0,0.05); padding: 10px; border-radius: 3px; }
    </style>
</head>
<body>
    <h1>📋 خروجی لاگ‌های Farsinglish</h1>
    <p>تعداد: ${logs.length} | تاریخ: ${new Date().toLocaleString('fa-IR')}</p>
    <hr>
    ${logs.map(log => this._formatLogHTML(log)).join('\n')}
</body>
</html>`;
        
        return html;
    }

    download(filename, content, type = 'text/plain') {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    _escapeCSV(str) {
        if (str === null || str === undefined) return '';
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    _formatLogHTML(log) {
        return `
<div class="log-entry log-level-${log.level}">
    <span class="log-time">${new Date(log.timestamp).toLocaleString('fa-IR')}</span>
    <span class="log-level">[${log.level}]</span>
    <span class="log-source">${log.source || 'global'}</span>
    <p>${log.message}</p>
    ${log.data && Object.keys(log.data).length ? `<pre>${this._escapeHTML(JSON.stringify(log.data, null, 2))}</pre>` : ''}
    ${log.userId ? `<small>کاربر: ${log.userId}</small>` : ''}
</div>`;
    }

    _escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
            deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'node'
        };
        this.context = options.context || {};
        this.performanceLogger = new PerformanceLogger(this, options.performance || {});
    }

    setUserContext(userId, sessionId, extra = {}) {
        this.userContext.userId = userId;
        this.userContext.sessionId = sessionId;
        this.userContext = { ...this.userContext, ...extra };
    }

    clearUserContext() {
        this.userContext.userId = null;
        this.userContext.sessionId = null;
    }

    setContext(key, value) {
        this.context[key] = value;
    }

    enable() {
        this.isEnabled = true;
    }

    disable() {
        this.isEnabled = false;
    }

    addAppender(appender) {
        if (!appender.write) {
            throw new AppenderError('Appender must implement write method', 'Unknown');
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
            throw new FilterError('Filter must implement shouldLog method', 'Unknown');
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
        const promises = this.appenders.map(appender => 
            appender.flush ? appender.flush() : Promise.resolve()
        );
        await Promise.all(promises);
    }

    async clear() {
        const promises = this.appenders.map(appender => 
            appender.clear ? appender.clear() : Promise.resolve()
        );
        await Promise.all(promises);
    }

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

    getPerformanceLogger() {
        return this.performanceLogger;
    }

    child(source) {
        const childLogger = new Logger(source, {
            appenders: this.appenders,
            filters: [...this.filters],
            enabled: this.isEnabled,
            context: { ...this.context }
        });
        childLogger.userContext = { ...this.userContext };
        return childLogger;
    }

    // ============ Private Methods ============
    
    async _log(level, message, data) {
        if (!this.isEnabled) return null;
        
        const logEntry = new LogEntry(level, message, data, this.source);
        
        // اضافه کردن context کاربر
        logEntry.userId = this.userContext.userId;
        logEntry.sessionId = this.userContext.sessionId;
        logEntry.metadata = { ...this.context };
        
        // اعمال فیلترها
        const shouldLog = this.filters.every(filter => {
            try {
                return filter.shouldLog(logEntry);
            } catch (error) {
                console.error('Filter error:', error);
                return true;
            }
        });
        
        if (!shouldLog) return null;
        
        // نوشتن در تمام appenderها
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

// ============ Logger Factory ============
class LoggerFactory {
    static loggers = new Map();
    static defaultOptions = {
        appenders: [new ConsoleAppender()],
        filters: [new LevelFilter(LogLevel.DEBUG)],
        enabled: true
    };
    
    static getLogger(source = '', options = {}) {
        const key = source || 'default';
        
        if (!this.loggers.has(key)) {
            const mergedOptions = { ...this.defaultOptions, ...options };
            const logger = new Logger(source, mergedOptions);
            this.loggers.set(key, logger);
        }
        
        return this.loggers.get(key);
    }
    
    static configure(options) {
        this.defaultOptions = { ...this.defaultOptions, ...options };
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

    static reset() {
        this.loggers.clear();
    }
}

// ============ Logger Config Builder ============
class LoggerConfigBuilder {
    constructor() {
        this.appenders = [];
        this.filters = [];
        this.level = LogLevel.DEBUG;
        this.enabled = true;
        this.context = {};
        this.performanceOptions = {};
    }

    addConsoleAppender(options = {}) {
        this.appenders.push(new ConsoleAppender(
            options.formatter || new TextFormatter(), 
            options
        ));
        return this;
    }

    addLocalStorageAppender(options = {}) {
        this.appenders.push(new LocalStorageAppender(
            options.formatter || new JsonFormatter(), 
            options
        ));
        return this;
    }

    addIndexedDBAppender(options = {}) {
        this.appenders.push(new IndexedDBAppender(
            options.formatter || new JsonFormatter(), 
            options
        ));
        return this;
    }

    addNetworkAppender(endpoint, options = {}) {
        this.appenders.push(new NetworkAppender(endpoint, options));
        return this;
    }

    addFileAppender(options = {}) {
        this.appenders.push(new FileAppender(
            options.formatter || new TextFormatter(),
            options
        ));
        return this;
    }

    setMinLevel(level) {
        this.filters.push(new LevelFilter(level));
        return this;
    }

    allowSources(sources) {
        this.filters.push(new SourceFilter(sources));
        return this;
    }

    filterRegex(pattern, include = true) {
        this.filters.push(new RegexFilter(pattern, include));
        return this;
    }

    timeWindow(startHour, endHour) {
        this.filters.push(new TimeWindowFilter(startHour, endHour));
        return this;
    }

    sampling(sampleRate) {
        this.filters.push(new SamplingFilter(sampleRate));
        return this;
    }

    withContext(key, value) {
        this.context[key] = value;
        return this;
    }

    withPerformanceMonitoring(options = {}) {
        this.performanceOptions = options;
        return this;
    }

    disable() {
        this.enabled = false;
        return this;
    }

    build(source = '') {
        const logger = new Logger(source, {
            appenders: this.appenders,
            filters: this.filters,
            enabled: this.enabled,
            context: this.context,
            performance: this.performanceOptions
        });
        
        return logger;
    }
}

// ============ Decorator for Automatic Logging ============
function LogMethod(level = 'info', options = {}) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const className = target.constructor?.name || 'Unknown';
        const logger = options.logger || LoggerFactory.getLogger(className);
        
        descriptor.value = async function(...args) {
            const start = performance.now();
            
            try {
                logger[level](`▶️ Calling ${className}.${propertyKey}`, {
                    args: args.map(a => {
                        if (a === null) return 'null';
                        if (a === undefined) return 'undefined';
                        if (typeof a === 'object') {
                            if (a.id) return `{id: ${a.id}}`;
                            return `Object(${Object.keys(a).length} keys)`;
                        }
                        return typeof a === 'string' && a.length > 50 
                            ? a.substring(0, 50) + '...' 
                            : a;
                    })
                });
                
                const result = await originalMethod.apply(this, args);
                
                const duration = performance.now() - start;
                logger[level](`✅ Completed ${className}.${propertyKey}`, {
                    duration: `${duration.toFixed(2)}ms`,
                    result: result !== undefined ? (typeof result === 'object' ? 'Object' : result) : 'void'
                });
                
                return result;
            } catch (error) {
                const duration = performance.now() - start;
                logger.error(`❌ Failed ${className}.${propertyKey}`, {
                    duration: `${duration.toFixed(2)}ms`,
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        };
        
        return descriptor;
    };
}

// ============ Utility Functions ============
const LoggerUtils = {
    /**
     * ترکیب چند logger
     */
    combine(...loggers) {
        return {
            debug: (msg, data) => loggers.forEach(l => l.debug(msg, data)),
            info: (msg, data) => loggers.forEach(l => l.info(msg, data)),
            warn: (msg, data) => loggers.forEach(l => l.warn(msg, data)),
            error: (msg, data) => loggers.forEach(l => l.error(msg, data)),
            fatal: (msg, data) => loggers.forEach(l => l.fatal(msg, data)),
            trace: (msg, data) => loggers.forEach(l => l.trace(msg, data))
        };
    },

    /**
     * ایجاد logger با namespace
     */
    namespace(logger, ns) {
        return {
            debug: (msg, data) => logger.debug(`[${ns}] ${msg}`, data),
            info: (msg, data) => logger.info(`[${ns}] ${msg}`, data),
            warn: (msg, data) => logger.warn(`[${ns}] ${msg}`, data),
            error: (msg, data) => logger.error(`[${ns}] ${msg}`, data),
            fatal: (msg, data) => logger.fatal(`[${ns}] ${msg}`, data),
            trace: (msg, data) => logger.trace(`[${ns}] ${msg}`, data)
        };
    },

    /**
     * اندازه لاگ‌ها
     */
    async getSize(logger) {
        const logs = await logger.getLogs();
        return new Blob([JSON.stringify(logs)]).size;
    },

    /**
     * پاک کردن لاگ‌های قدیمی‌تر از تاریخ مشخص
     */
    async cleanOlderThan(logger, days) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        
        const logs = await logger.getLogs({ endDate: date.toISOString() });
        
        // این عملیات به appender وابسته است
        console.warn('cleanOlderThan requires appender-specific implementation');
        return logs.length;
    },

    /**
     * ایجاد snapshot از لاگ‌ها
     */
    async snapshot(logger, filename = 'logs-snapshot.json') {
        const logs = await logger.getLogs();
        const exporter = new LogExporter(logger);
        const json = await exporter.exportToJSON();
        exporter.download(filename, json, 'application/json');
    }
};

// ============ Singleton Accessor ============
const LoggerInstance = (() => {
    let instance = null;
    
    return {
        getInstance: () => {
            if (!instance) {
                instance = LoggerFactory.getLogger('app');
            }
            return instance;
        },
        
        configure: (options) => {
            LoggerFactory.configure(options);
            if (instance) {
                // به‌روزرسانی instance موجود
                instance = LoggerFactory.getLogger('app');
            }
        },
        
        reset: () => {
            instance = null;
            LoggerFactory.reset();
        }
    };
})();

// ============ Global Logger Instance ============
const globalLogger = LoggerFactory.getLogger('global');

// ============ Export ============
export {
    Logger,
    LoggerFactory,
    LoggerInstance,
    globalLogger,
    LogLevel,
    LogEntry,
    ILogger,
    ILogAppender,
    ILogFormatter,
    ILogFilter,
    JsonFormatter,
    CompactJsonFormatter,
    TextFormatter,
    PersianFormatter,
    HtmlFormatter,
    LevelFilter,
    SourceFilter,
    RegexFilter,
    TimeWindowFilter,
    SamplingFilter,
    ConsoleAppender,
    LocalStorageAppender,
    IndexedDBAppender,
    NetworkAppender,
    FileAppender,
    PerformanceLogger,
    LogRotationManager,
    LogExporter,
    LogMethod,
    LoggerConfigBuilder,
    LoggerUtils,
    LoggerError,
    AppenderError,
    FilterError
};
