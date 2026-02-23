/**
 * @file lesson_orchestrator.js
 * @description Orchestrator برای مدیریت جریان درس‌ها، resilient و scalable
 */

 /* ===== typedefs ===== */
 
/**
 * @typedef {Object} PartialFlowResult
 * @property {boolean} success
 * @property {Object} data
 * @property {Array<string>} failed_steps
 * @property {Object} partial_data
 */

/**
 * @typedef {Object} CircuitBreakerInterface
 * @property {function(Function): Promise<*>} call
 */

/* ===== LessonOrchestrator Class ===== */

class LessonOrchestrator {
    /* ===== Private Properties ===== */
    #lesson_service;
    #exercise_service;
    #logger;
    #metrics = {
        start_lesson: { count: 0, window_times: [], window_avg: 0, daily_total: 0 },
        complete_lesson: { count: 0, window_times: [], window_avg: 0, daily_total: 0 },
        errors: 0
    };
    #lesson_cache = new Map();
    #cache_max_size = 100;
    #concurrency_limit = 10;
    #active_operations = 0;
    #pending_operations = [];
    #circuit_breakers = new Map();
    #circuit_last_used = new Map();

    /* ===== Constructor ===== */
    constructor({ lesson_service, exercise_service, logger }) {
        this.#lesson_service = lesson_service;
        this.#exercise_service = exercise_service;
        this.#logger = logger;
    }

    /* ===== Private Methods ===== */

    #set_cache(key, value) {
        if (this.#lesson_cache.size >= this.#cache_max_size) {
            const first_key = this.#lesson_cache.keys().next().value;
            this.#lesson_cache.delete(first_key);
        }
        this.#lesson_cache.set(key, { data: value, timestamp: Date.now() });
    }

    async #get_lesson_with_cache(lesson_id, signal) {
        const cached = this.#lesson_cache.get(lesson_id);
        if (cached) return cached.data;
        const lesson = await this.#lesson_service.get_lesson_by_id(lesson_id, signal);
        if (lesson) this.#set_cache(lesson_id, lesson);
        return lesson;
    }

    #record_metric(operation_name, duration) {
        const metric = this.#metrics[operation_name];
        if (!metric) return;
        metric.count++;
        metric.daily_total += duration;
        metric.window_times.push(duration);
        if (metric.window_times.length > 100) metric.window_times.shift();
        metric.window_avg = metric.window_times.reduce((a, b) => a + b, 0) / metric.window_times.length;
    }

    async #with_concurrency_limit(operation) {
        if (this.#active_operations < this.#concurrency_limit) {
            this.#active_operations++;
            try { return await operation(); } 
            finally { this.#active_operations--; this.#process_pending(); }
        }
        return new Promise((resolve, reject) => {
            this.#pending_operations.push({ operation, resolve, reject });
        });
    }

    #process_pending() {
        while (this.#pending_operations.length && this.#active_operations < this.#concurrency_limit) {
            const { operation, resolve, reject } = this.#pending_operations.shift();
            this.#with_concurrency_limit(operation).then(resolve).catch(reject);
        }
    }

    async #with_timeout(promise, timeout_ms = 5000, error_message = 'operation timeout') {
        let timeout_id;
        const timeout_promise = new Promise((_, reject) => {
            timeout_id = setTimeout(() => reject(new Error(error_message)), timeout_ms);
        });
        try {
            const result = await Promise.race([promise, timeout_promise]);
            clearTimeout(timeout_id);
            return result;
        } catch (error) {
            clearTimeout(timeout_id);
            throw error;
        }
    }

    async #with_retry(operation, max_retries = 3, signal) {
        for (let attempt = 1; attempt <= max_retries; attempt++) {
            try { return await operation(signal); } 
            catch (error) {
                if (attempt === max_retries || signal?.aborted) throw error;
                const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
                this.#logger.warn('retry_operation', { attempt, delay, error: error.message });
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    #get_circuit_breaker(name) {
        this.#circuit_last_used.set(name, Date.now());
        if (!this.#circuit_breakers.has(name)) this.#circuit_breakers.set(name, new CircuitBreaker());
        return this.#circuit_breakers.get(name);
    }

    #cleanup_circuit_breakers() {
        const now = Date.now();
        for (const [name, last_used] of this.#circuit_last_used) {
            if (now - last_used > 3600000) {
                this.#circuit_breakers.delete(name);
                this.#circuit_last_used.delete(name);
            }
        }
    }

    async #with_transaction(lesson_id, operations, signal) {
        const executed = [];
        const failed_steps = [];
        const partial_data = {};

        for (const { name, exec, rollback, optional = false } of operations) {
            try {
                const result = await exec(signal);
                executed.push({ name, rollback });
                partial_data[name] = result;
            } catch (error) {
                if (!optional) {
                    await this.#rollback_all(executed);
                    throw error;
                }
                failed_steps.push(name);
                this.#logger.warn('optional_step_failed', { name, error: error.message });
            }
        }

        return { success: failed_steps.length === 0, data: partial_data, failed_steps, partial_data };
    }

    async #rollback_all(executed) {
        for (const { name, rollback } of executed.reverse()) {
            try { rollback?.(); } 
            catch (e) { this.#logger.error(`rollback_failed_${name}`, { error: e.message }); }
        }
    }

    /* ===== Public Methods ===== */

    /**
     * @param {string} lesson_id
     * @param {AbortSignal} [signal]
     * @returns {Promise<PartialFlowResult>}
     */
    async start_lesson_flow(lesson_id, signal) {
        const start_time = Date.now();
        const flow_state = { lesson_started: false, exercises_created: [], cache_updated: false };
        const circuit_breaker = this.#get_circuit_breaker('start_lesson');

        try {
            return await this.#with_concurrency_limit(() => 
                this.#with_timeout(
                    this.#with_retry(async (signal) => 
                        circuit_breaker.call(async () => {
                            const lesson = await this.#get_lesson_with_cache(lesson_id, signal);
                            flow_state.cache_updated = true;
                            const started = await this.#lesson_service.start_lesson(lesson_id, signal);
                            flow_state.lesson_started = true;
                            const exercises = await this.#exercise_service.get_exercises_for_lesson(lesson_id, signal);
                            flow_state.exercises_created = exercises.map(e => e.id);
                            return { lesson, started, exercises };
                        })
                    , 3, signal)
                , 8000, 'start_lesson_flow timeout')
            );
        } catch (error) {
            await this.#rollback_all([
                { name: 'start_lesson', rollback: () => this.#lesson_service.rollback_start(lesson_id) },
                { name: 'exercises', rollback: () => this.#exercise_service.rollback_exercises(lesson_id, flow_state.exercises_created) }
            ]);
            this.#metrics.errors++;
            throw error;
        } finally {
            this.#record_metric('start_lesson', Date.now() - start_time);
        }
    }

    /**
     * Batch Start Lessons
     * @param {Array<string>} lesson_ids
     * @param {AbortSignal} [signal]
     * @returns {Promise<{succeeded: Array, failed: Array}>}
     */
    async start_lessons_batch(lesson_ids, signal) {
        const results = await Promise.allSettled(lesson_ids.map(id => this.start_lesson_flow(id, signal)));
        return {
            succeeded: results.filter(r => r.status === 'fulfilled').map(r => r.value),
            failed: results.filter(r => r.status === 'rejected').map(r => r.reason)
        };
    }
}

/* ===== CircuitBreaker Class ===== */
class CircuitBreaker {
    constructor(failure_threshold = 5, timeout_ms = 30000) {
        this.failure_count = 0;
        this.failure_threshold = failure_threshold;
        this.state = 'CLOSED';
        this.next_attempt = null;
        this.timeout_ms = timeout_ms;
    }

    async call(operation) {
        if (this.state === 'OPEN') {
            if (Date.now() > this.next_attempt) {
                this.state = 'HALF_OPEN';
                return this.#test_request(operation);
            }
            throw new Error('circuit breaker is OPEN');
        }

        try {
            const result = await operation();
            if (this.state === 'HALF_OPEN') {
                this.state = 'CLOSED';
                this.failure_count = 0;
            }
            return result;
        } catch (error) {
            this.failure_count++;
            if (this.failure_count >= this.failure_threshold) {
                this.state = 'OPEN';
                this.next_attempt = Date.now() + this.timeout_ms;
            }
            throw error;
        }
    }

    async #test_request(operation) {
        try {
            const result = await operation();
            this.state = 'CLOSED';
            this.failure_count = 0;
            return result;
        } catch (error) {
            this.state = 'OPEN';
            this.next_attempt = Date.now() + this.timeout_ms;
            throw error;
        }
    }
}

export default LessonOrchestrator;
