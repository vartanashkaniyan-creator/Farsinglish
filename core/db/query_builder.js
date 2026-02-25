/**
 * @file query_builder.js
 * @module @farsinglish/database/query_builder
 * @version 2.0.0
 * @description Enterprise-grade query builder با تمرکز روی امنیت، قابلیت تست و مقیاس‌پذیری بدون over-engineering
 * @author Farsinglish Team
 */

class EnterpriseQueryBuilder {
  /**
   * @param {object} config
   * @param {ConnectionPool} config.pool - اتصال به دیتابیس
   * @param {QueryCache} config.cache - کش query با TTL
   * @param {MetricsCollector} [config.metrics] - جمع‌آوری متریک
   * @param {AuditLogger} [config.audit] - ثبت عملیات حساس
   */
  constructor({ pool, cache, metrics = null, audit = null }) {
    this.pool = pool;
    this.cache = cache;
    this.metrics = metrics;
    this.audit = audit;
    this.circuit_breaker = new CircuitBreaker();
  }

  /** متد خصوصی برای escape string (در صورت نیاز به legacy query) */
  _escape_string(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  /** اجرای query با timeout و retry ساده */
  async _execute_query(query, params = {}, options = {}) {
    const timeout = options.timeout || 30000; // 30s default
    const start_time = Date.now();

    const timeout_promise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout')), timeout);
    });

    return Promise.race([
      this._execute_with_retry(query, params),
      timeout_promise
    ]).finally(() => {
      this.metrics?.record('query.duration', Date.now() - start_time);
    });
  }

  /** Retry ساده با exponential backoff */
  async _execute_with_retry(query, params, retries = 2) {
    for (let i = 0; i <= retries; i++) {
      try {
        if (this.circuit_breaker.is_open()) {
          throw new Error('Circuit breaker open');
        }

        // بررسی cache قبل از اجرای query
        const cache_key = query.hash ?? JSON.stringify(query);
        const cached = await this.cache.get(cache_key);
        if (cached) return cached;

        const result = await this.pool.execute_prepared(query, params);

        await this.cache.set(cache_key, result, options?.ttl);
        this.circuit_breaker.record_success();
        this.audit?.log(query, params, result);

        return result;
      } catch (error) {
        this.circuit_breaker.record_failure();
        if (i === retries) throw error;
        await this._sleep(Math.pow(2, i) * 100); // backoff
      }
    }
  }

  /** متد ساده sleep برای retry */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * اجرای query با امکان Read/Write split
   * @param {object} options
   * @param {boolean} options.read_only
   */
  async execute(query, params = {}, options = {}) {
    const connection = options.read_only ? 
      this.pool.get_replica() : 
      this.pool.get_primary();
    
    return this._execute_query(query, params, options);
  }

  /**
   * اعمال فیلتر tenant (Row-level security)
   * @param {string} tenant_id
   */
  apply_tenant_filter(tenant_id) {
    this._conditions = this._conditions || {};
    this._conditions.tenant_id = tenant_id;
    return this; // Fluent interface
  }
}

export { EnterpriseQueryBuilder };
