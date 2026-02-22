/**
 * @file logger.js
 * @description Logger حرفه‌ای با pipeline، middleware، backpressure، batch processing و telemetry
 */

//////////////////////////
// Interfaces & Types
//////////////////////////

/**
 * @interface i_log_appender
 */
class ILogAppender {
  async write(log_entry_object) {
    throw new Error('Method write must be implemented');
  }
  async flush() {}
  async clear() {}
  async get_logs(filter) { return []; }
}

/**
 * @template T
 * @typedef {Object} result
 * @property {boolean} success
 * @property {T} [data]
 * @property {string} [error]
 * @property {Object} [context]
 */

//////////////////////////
// Pipeline
//////////////////////////

class log_pipeline {
  constructor() {
    /** @type {Array<Function>} */
    this.middlewares = [];
  }

  use(middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  async process(entry) {
    let current = entry;
    for (const middleware of this.middlewares) {
      current = await middleware(current);
      if (!current) return null;
    }
    return current;
  }
}

//////////////////////////
// Log Entry
//////////////////////////

class log_entry {
  constructor({ level, message, metadata = {} }) {
    this.id = crypto.randomUUID();
    this.level = level;
    this.message = message;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
  }
}

//////////////////////////
// Appenders
//////////////////////////

class console_appender extends ILogAppender {
  constructor(console_obj = globalThis.console) {
    super();
    this.console = console_obj;
  }

  async write(entry) {
    this.console[entry.level](
      `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`,
      entry.metadata
    );
    return { success: true, data: entry };
  }
}

//////////////////////////
// Metrics (Memory Safe)
//////////////////////////

const metric_cache = new WeakMap();

//////////////////////////
// Logger Core
//////////////////////////

class logger {
  constructor(name, options = {}, storage = localStorage, console_obj = globalThis.console) {
    if (!name || typeof name !== 'string') {
      throw new Error('Logger name must be a non-empty string');
    }

    this.name = name;
    this.storage = storage;
    this.console = console_obj;

    this.appenders = (options.appenders || [new console_appender(console_obj)])
      .filter(a => a instanceof ILogAppender);

    this.pipeline = new log_pipeline();

    // Backpressure
    this.queue = [];
    this.processing = false;
    this.high_water_mark = 1000;
    this.low_water_mark = 100;
    this.dropped_logs = 0;

    metric_cache.set(this, {
      total_logs: 0,
      errors: 0,
      avg_response_time: 0
    });
  }

  use_pipeline(middleware) {
    this.pipeline.use(middleware);
    return this;
  }

  async _check_backpressure() {
    if (this.queue.length >= this.high_water_mark * 2) {
      this.dropped_logs++;
      return false;
    }

    if (this.queue.length >= this.high_water_mark) {
      await this._drain();
    }

    return true;
  }

  async _drain() {
    if (this.processing) return;
    this.processing = true;

    const batch = this.queue.splice(0, this.low_water_mark);
    await Promise.all(batch.map(args => this.log(...args)));

    this.processing = false;

    if (this.queue.length > 0) {
      setTimeout(() => this._drain(), 50);
    }
  }

  async _write_to_appenders(entry) {
    const results = [];
    const metrics = metric_cache.get(this);

    for (const appender of this.appenders) {
      try {
        results.push(await appender.write(entry));
      } catch (error) {
        metrics.errors++;
        results.push({
          success: false,
          error: error.message,
          context: { appender: appender.constructor.name }
        });
      }
    }

    return results;
  }

  /**
   * ثبت لاگ
   * @param {string} level
   * @param {string} message
   * @param {Object} metadata
   * @returns {Promise<result[]>}
   */
  async log(level, message, metadata = {}) {
    const can_process = await this._check_backpressure();
    if (!can_process) {
      return {
        success: false,
        error: 'Backpressure: log dropped',
        context: {
          queue_length: this.queue.length,
          dropped_logs: this.dropped_logs
        }
      };
    }

    const entry = await this.pipeline.process(
      new log_entry({ level, message, metadata })
    );

    if (!entry) {
      return { success: false, error: 'Blocked by pipeline' };
    }

    const metrics = metric_cache.get(this);
    metrics.total_logs++;

    return this._write_to_appenders(entry);
  }

  async info(message, metadata = {}) {
    return this.log('info', message, metadata);
  }

  async warn(message, metadata = {}) {
    return this.log('warn', message, metadata);
  }

  async error(message, metadata = {}) {
    return this.log('error', message, metadata);
  }

  async batch_log(entries) {
    const results = [];
    for (const e of entries) {
      results.push(await this.log(e.level, e.message, e.metadata));
    }
    return results;
  }

  get_metrics() {
    return {
      ...metric_cache.get(this),
      dropped_logs: this.dropped_logs,
      queue_length: this.queue.length
    };
  }
}

//////////////////////////
// Monitored Logger
//////////////////////////

class monitored_logger extends logger {
  async log(level, message, metadata = {}) {
    const start = performance.now();
    const result = await super.log(level, message, metadata);
    const duration = performance.now() - start;

    const metrics = metric_cache.get(this);
    if (metrics.total_logs > 0) {
      metrics.avg_response_time =
        (metrics.avg_response_time * (metrics.total_logs - 1) + duration) /
        metrics.total_logs;
    }

    return result;
  }

  export_metrics() {
    return {
      name: this.name,
      metrics: this.get_metrics(),
      timestamp: new Date().toISOString()
    };
  }
}

//////////////////////////
// Middleware
//////////////////////////

/**
 * Middleware پاک‌سازی اطلاعات حساس
 * @param {log_entry} entry
 * @returns {Promise<log_entry>}
 */
const sanitize_middleware = async (entry) => {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Invalid log entry');
  }

  const sensitive_keys = ['password', 'token', 'secret'];
  const metadata = { ...entry.metadata };

  for (const key of sensitive_keys) {
    if (key in metadata) metadata[key] = '***REDACTED***';
  }

  return { ...entry, metadata };
};

/**
 * Middleware محدودیت نرخ
 * @param {number} max_per_second
 * @returns {Function}
 */
const rate_limit_middleware = (max_per_second = 10) => {
  let count = 0;
  let last_reset = Date.now();

  return async (entry) => {
    const now = Date.now();
    if (now - last_reset > 1000) {
      count = 0;
      last_reset = now;
    }

    count++;
    return count <= max_per_second ? entry : null;
  };
};

//////////////////////////
// Exports
//////////////////////////

export {
  logger,
  monitored_logger,
  log_entry,
  log_pipeline,
  ILogAppender,
  console_appender,
  sanitize_middleware,
  rate_limit_middleware
};
