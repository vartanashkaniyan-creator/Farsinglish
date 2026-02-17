// ==================== core/offline/offline-manager.js ====================
// singleton, enterprise-grade, plugin-ready, conflict-resilient, event-sourced
// =========================================================================

/**
 * @file مدیریت آفلاین پیشرفته با قابلیت‌های: Connection Monitoring,
 * Request Queue, Sync Engine, Storage Strategy, Plugin System,
 * Conflict Resolution, Adaptive Sync, Performance Monitoring, Event Sourcing.
 */

// -------------------- وابستگی‌های خارجی (تزریق‌پذیر) --------------------
// در صورت نبود، از نمونه‌های پیش‌فرض استفاده می‌شود (DIP)
const defaultEventBus = {
  on: (event, cb) => { /* no-op */ },
  emit: (event, data) => { /* no-op */ }
};
const defaultLogger = {
  info: console.log.bind(console, '[INFO]'),
  warn: console.warn.bind(console, '[WARN]'),
  error: console.error.bind(console, '[ERROR]')
};

// -------------------- وضعیت‌های اتصال (Enum) --------------------
const ConnectionStatus = Object.freeze({
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  RECONNECTING: 'RECONNECTING',
  SYNCING: 'SYNCING'
});

// ==================== لایه Storage Strategy (ISP, Strategy Pattern) ====================
/**
 * @interface StorageStrategy
 * قرارداد ذخیره‌سازی برای صف درخواست‌ها
 */
class StorageStrategy {
  async save(key, data) { throw new Error('Not implemented'); }
  async load(key) { throw new Error('Not implemented'); }
  async clear(key) { throw new Error('Not implemented'); }
}

/**
 * ذخیره‌سازی در حافظه (برای تست یا موقتی)
 */
class MemoryStorage extends StorageStrategy {
  constructor() { super(); this._store = new Map(); }
  async save(key, data) { this._store.set(key, data); }
  async load(key) { return this._store.get(key) || null; }
  async clear(key) { this._store.delete(key); }
}

/**
 * ذخیره‌سازی با localStorage (Fallback)
 */
class LocalStorageStrategy extends StorageStrategy {
  async save(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
  async load(key) { const item = localStorage.getItem(key); return item ? JSON.parse(item) : null; }
  async clear(key) { localStorage.removeItem(key); }
}

/**
 * ذخیره‌سازی با IndexedDB (پیش‌فرض)
 */
class IndexedDBStorage extends StorageStrategy {
  constructor(dbName = 'OfflineManagerDB', storeName = 'queue') {
    super();
    this.dbName = dbName;
    this.storeName = storeName;
    this.db = null;
  }

  async _getDB() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onerror = (e) => reject(e);
    });
  }

  async save(key, data) {
    const db = await this._getDB();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    await new Promise((resolve, reject) => {
      const req = store.put({ id: key, ...data });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async load(key) {
    const db = await this._getDB();
    const tx = db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async clear(key) {
    const db = await this._getDB();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    await new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

// ==================== Connection Monitor (SRP) ====================
/**
 * پایش وضعیت اتصال و مدیریت reconnect با استراتژی exponential backoff
 */
class ConnectionMonitor {
  constructor(config = {}, eventBus = defaultEventBus, logger = defaultLogger) {
    this.config = {
      reconnectAttempts: 5,
      reconnectDelay: 2000,
      maxReconnectDelay: 30000,
      ...config
    };
    this.eventBus = eventBus;
    this.logger = logger;
    this._status = navigator.onLine ? ConnectionStatus.ONLINE : ConnectionStatus.OFFLINE;
    this._listeners = new Set();
    this._reconnectTimer = null;
    this._setupEventListeners();
  }

  _setupEventListeners() {
    window.addEventListener('online', () => this._changeStatus(true));
    window.addEventListener('offline', () => this._changeStatus(false));
  }

  _changeStatus(isOnline) {
    const newStatus = isOnline ? ConnectionStatus.ONLINE : ConnectionStatus.OFFLINE;
    if (this._status === newStatus) return;
    this._status = newStatus;
    this._notify();
    this.eventBus.emit('connection:change', this._status);
    if (isOnline) this._handleReconnect();
  }

  async _handleReconnect() {
    if (this._status === ConnectionStatus.RECONNECTING) return;
    this._status = ConnectionStatus.RECONNECTING;
    this._notify();
    let attempts = 0;
    const tryReconnect = async () => {
      attempts++;
      const delay = Math.min(
        this.config.reconnectDelay * Math.pow(2, attempts - 1),
        this.config.maxReconnectDelay
      );
      return new Promise(resolve => {
        this._reconnectTimer = setTimeout(async () => {
          const online = await this.checkConnection(true);
          if (online) {
            this._status = ConnectionStatus.ONLINE;
            this._reconnectTimer = null;
            this._notify();
            this.eventBus.emit('connection:reconnected');
            resolve(true);
          } else if (attempts < this.config.reconnectAttempts) {
            resolve(await tryReconnect());
          } else {
            this._status = ConnectionStatus.OFFLINE;
            this._reconnectTimer = null;
            this._notify();
            this.logger.warn('Max reconnect attempts reached');
            resolve(false);
          }
        }, delay);
      });
    };
    await tryReconnect();
  }

  async checkConnection(fetchPing = false) {
    if (!fetchPing) return navigator.onLine;
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);
      const res = await fetch('/ping', { method: 'HEAD', cache: 'no-store', signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    }
  }

  get status() { return this._status; }
  get isOnline() { return this._status === ConnectionStatus.ONLINE; }
  get isOffline() { return this._status === ConnectionStatus.OFFLINE; }

  subscribe(callback) {
    this._listeners.add(callback);
    callback(this._status);
    return () => this._listeners.delete(callback);
  }
  _notify() { this._listeners.forEach(cb => { try { cb(this._status); } catch { } }); }

  disconnect() {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    window.removeEventListener('online', this._changeStatus);
    window.removeEventListener('offline', this._changeStatus);
  }
}

// ==================== Request Queue (SRP) ====================
/**
 * مدل آیتم صف
 */
class QueueItem {
  constructor(url, method, data = null, id = null, retryCount = 0) {
    this.id = id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.url = url;
    this.method = method.toUpperCase();
    this.data = data;
    this.timestamp = Date.now();
    this.retryCount = retryCount;
    this.lastAttempt = null;
  }
}

/**
 * مدیریت صف درخواست‌ها با قابلیت ذخیره‌سازی
 */
class RequestQueue {
  constructor(storage, logger = defaultLogger) {
    this.storage = storage;
    this.logger = logger;
    this._queue = []; // cache in memory
    this._init();
  }

  async _init() {
    const saved = await this.storage.load('offline_queue');
    this._queue = saved ? (saved.items || []) : [];
  }

  async _persist() {
    await this.storage.save('offline_queue', { items: this._queue });
  }

  enqueue(url, method, data) {
    const item = new QueueItem(url, method, data);
    this._queue.push(item);
    this._persist();
    return item.id;
  }

  dequeue(id) {
    const index = this._queue.findIndex(i => i.id === id);
    if (index !== -1) {
      const removed = this._queue.splice(index, 1)[0];
      this._persist();
      return removed;
    }
    return null;
  }

  peek() { return [...this._queue]; }
  get length() { return this._queue.length; }
  clear() { this._queue = []; this._persist(); }

  update(item) {
    const index = this._queue.findIndex(i => i.id === item.id);
    if (index !== -1) {
      this._queue[index] = item;
      this._persist();
    }
  }
}

// ==================== Sync Engine (SRP) ====================
/**
 * همگام‌سازی با سرور، دارای circuit breaker و conflict resolver
 */
class SyncEngine {
  constructor(config = {}, logger = defaultLogger) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };
    this.logger = logger;
    this.circuitBreaker = new CircuitBreaker({ threshold: 3, resetTimeout: 30000 });
    this.conflictResolver = new ConflictResolver();
  }

  async send(item) {
    return this.circuitBreaker.call(async () => {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: item.data ? JSON.stringify(item.data) : undefined
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        item.retryCount++;
        item.lastAttempt = Date.now();
        throw err;
      }
    });
  }

  async syncItems(items, onProgress = null) {
    const success = [], failed = [];
    for (const item of items) {
      try {
        await this.send(item);
        success.push(item.id);
      } catch (err) {
        failed.push(item.id);
        this.logger.error('Sync failed for item', item.id, err);
      }
      if (onProgress) onProgress(success.length, failed.length);
      await new Promise(r => setTimeout(r, 100)); // throttle
    }
    return { success, failed };
  }
}

/**
 * Circuit Breaker (پیشرفته)
 */
class CircuitBreaker {
  constructor(options) {
    this.failureThreshold = options.threshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.failures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }

  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttempt) this.state = 'HALF_OPEN';
      else throw new Error('Circuit breaker OPEN');
    }
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }
  _onSuccess() { this.failures = 0; this.state = 'CLOSED'; }
  _onFailure() {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }
}

/**
 * حل تعارضات (ساده شده)
 */
class ConflictResolver {
  resolve(clientData, serverData, strategy = 'client-wins') {
    switch (strategy) {
      case 'client-wins': return clientData;
      case 'server-wins': return serverData;
      case 'last-write-wins': return (clientData.timestamp > serverData.timestamp) ? clientData : serverData;
      default: return clientData;
    }
  }
}

// ==================== Performance Monitor (Decorator) ====================
/**
 * دکوریتور برای اندازه‌گیری زمان اجرا
 */
class PerformanceMonitor {
  constructor(component) {
    this.component = component;
  }

  async enqueue(...args) {
    const start = performance.now();
    const result = await this.component.enqueue(...args);
    const duration = performance.now() - start;
    defaultLogger.info(`[Performance] enqueue took ${duration.toFixed(2)}ms`);
    return result;
  }

  async sync(...args) {
    const start = performance.now();
    const result = await this.component.sync(...args);
    const duration = performance.now() - start;
    defaultLogger.info(`[Performance] sync took ${duration.toFixed(2)}ms`);
    return result;
  }

  // سایر متدها به همین ترتیب...
}

// ==================== Event Sourcing (Mixin-like) ====================
/**
 * کلاس پایه برای ثبت رویدادها
 */
class EventSourced {
  constructor() { this._eventLog = []; }
  _logEvent(type, payload) {
    this._eventLog.push({ type, payload, timestamp: Date.now() });
  }
  getEventLog() { return [...this._eventLog]; }
  replay(fromTime = 0) {
    return this._eventLog.filter(e => e.timestamp >= fromTime);
  }
}

// ==================== Plugin System (اختیاری) ====================
class PluginManager {
  constructor() { this.plugins = new Map(); }
  register(name, plugin) { this.plugins.set(name, plugin); }
  getHooks() {
    const hooks = {
      beforeEnqueue: [], afterEnqueue: [],
      beforeSync: [], afterSync: [],
      onStatusChange: []
    };
    for (const plugin of this.plugins.values()) {
      if (plugin.beforeEnqueue) hooks.beforeEnqueue.push(plugin.beforeEnqueue);
      if (plugin.afterEnqueue) hooks.afterEnqueue.push(plugin.afterEnqueue);
      if (plugin.beforeSync) hooks.beforeSync.push(plugin.beforeSync);
      if (plugin.afterSync) hooks.afterSync.push(plugin.afterSync);
      if (plugin.onStatusChange) hooks.onStatusChange.push(plugin.onStatusChange);
    }
    return hooks;
  }
}

// ==================== Adaptive Sync (پیشرفته) ====================
class AdaptiveSync {
  static async shouldSync(queueLength) {
    // باتری
    if (navigator.getBattery) {
      const battery = await navigator.getBattery();
      if (battery.level < 0.2 && !battery.charging) return false;
    }
    // نوع شبکه
    if (navigator.connection) {
      const conn = navigator.connection;
      if (conn.type === 'cellular' && conn.downlink < 0.5) return false;
      if (conn.saveData) return false;
    }
    // حجم صف
    if (queueLength > 100) return 'chunked';
    return true;
  }
}

// ==================== کلاس اصلی OfflineManager (Facade, Singleton) ====================
class OfflineManager extends EventSourced {
  constructor(dependencies = {}) {
    super();
    if (OfflineManager.instance) return OfflineManager.instance;

    // وابستگی‌های تزریقی (DIP)
    const {
      eventBus = defaultEventBus,
      logger = defaultLogger,
      storage = new IndexedDBStorage(), // پیش‌فرض IndexedDB
      connectionConfig = {},
      syncConfig = {}
    } = dependencies;

    this.eventBus = eventBus;
    this.logger = logger;

    // زیرسیستم‌ها
    this.monitor = new ConnectionMonitor(connectionConfig, eventBus, logger);
    this.storage = storage;
    this.queue = new RequestQueue(storage, logger);
    this.syncEngine = new SyncEngine(syncConfig, logger);
    this.pluginManager = new PluginManager();

    // وضعیت
    this._syncInProgress = false;

    // listen to connection changes
    this.monitor.subscribe((status) => {
      this._logEvent('statusChange', status);
      this._runPlugins('onStatusChange', status);
    });

    OfflineManager.instance = this;
  }

  static getInstance(deps) { return new OfflineManager(deps); }

  // ----- Public API (Facade) -----
  get status() { return this.monitor.status; }
  get isOnline() { return this.monitor.isOnline; }
  get isOffline() { return this.monitor.isOffline; }
  get queueLength() { return this.queue.length; }

  async enqueue(url, method, data = null) {
    this._logEvent('enqueue:before', { url, method });
    await this._runPlugins('beforeEnqueue', { url, method, data });

    const id = this.queue.enqueue(url, method, data);

    this._logEvent('enqueue:after', { id });
    await this._runPlugins('afterEnqueue', { id });

    if (this.isOnline) this.sync(); // تلاش فوری
    return id;
  }

  async sync() {
    if (this._syncInProgress || !this.isOnline) return { success: [], failed: [] };
    this._syncInProgress = true;
    this._logEvent('sync:start');

    await this._runPlugins('beforeSync');

    const items = this.queue.peek();
    if (items.length === 0) {
      this._syncInProgress = false;
      return { success: [], failed: [] };
    }

    // adaptive sync
    const should = await AdaptiveSync.should(items.length);
    if (should === false) {
      this.logger.warn('Sync cancelled by adaptive rules');
      this._syncInProgress = false;
      return { success: [], failed: [] };
    }

    const processItems = should === 'chunked' ? this._chunk(items, 10) : [items];
    let success = [], failed = [];

    for (const chunk of processItems) {
      const result = await this.syncEngine.syncItems(chunk, (s, f) => {
        this._logEvent('sync:progress', { s, f });
      });
      success = success.concat(result.success);
      failed = failed.concat(result.failed);

      // حذف موارد موفق از صف
      result.success.forEach(id => this.queue.dequeue(id));
      // به‌روزرسانی موارد ناموفق (افزایش retry)
      result.failed.forEach(id => {
        const item = this.queue._queue.find(i => i.id === id);
        if (item) this.queue.update(item);
      });

      if (processItems.length > 1) await new Promise(r => setTimeout(r, 1000));
    }

    this._syncInProgress = false;
    this._logEvent('sync:end', { success, failed });
    await this._runPlugins('afterSync', { success, failed });

    return { success, failed };
  }

  _chunk(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  }

  clearQueue() {
    this.queue.clear();
    this._logEvent('queueCleared');
  }

  // ----- Plugin Management -----
  registerPlugin(name, plugin) {
    this.pluginManager.register(name, plugin);
  }

  async _runPlugins(hookName, payload) {
    const hooks = this.pluginManager.getHooks()[hookName];
    if (!hooks) return;
    for (const fn of hooks) {
      try { await fn(payload, this); } catch (e) { this.logger.error('Plugin error', hookName, e); }
    }
  }

  // ----- Manual connection check -----
  async checkConnection(forcePing = false) {
    return this.monitor.checkConnection(forcePing);
  }

  // ----- Cleanup -----
  dispose() {
    this.monitor.disconnect();
  }
}

// نمونه Singleton برای export
const offlineManager = new OfflineManager();
export default offlineManager;
