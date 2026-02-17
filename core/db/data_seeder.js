/**
 * data_seeder_ultimate.js - موتور فوق پیشرفته پرکردن داده
 * 
 * اصول رعایت شده: SOLID, KISS, DRY, YAGNI, DI, Singleton, Pipeline, 
 * Dependency Graph, Multi-Environment, Progress Stream, Snapshot,
 * Performance Budget, Integrity Validation
 * 
 * @version 2.0.0
 * @author Farsinglish Team
 * @license MIT
 */

// ==================== Core Interfaces & Types ====================

/**
 * @interface database_adapter
 * قرارداد انتزاعی دیتابیس (DIP)
 */
class database_adapter {
    async get(store, key) { throw new Error('not_implemented'); }
    async get_all(store) { throw new Error('not_implemented'); }
    async put(store, value) { throw new Error('not_implemented'); }
    async delete(store, key) { throw new Error('not_implemented'); }
    async clear(store) { throw new Error('not_implemented'); }
    async transaction(store, type, callback) { throw new Error('not_implemented'); }
}

/**
 * @interface logger_interface
 */
class logger_interface {
    info(...args) { console.log('[INFO]', ...args); }
    warn(...args) { console.warn('[WARN]', ...args); }
    error(...args) { console.error('[ERROR]', ...args); }
    debug(...args) { console.debug('[DEBUG]', ...args); }
}

// ==================== Utility Classes ====================

/**
 * کلید ساز یکتا
 */
class id_generator {
    static #counter = 0;
    
    static generate(prefix = 'seed') {
        return `${prefix}_${Date.now()}_${++this.#counter}`;
    }
    
    static reset() { this.#counter = 0; }
}

/**
 * مدیریت زمان و مهلت
 */
class timeout_controller {
    #timeout_ms;
    #start_time;
    
    constructor(timeout_ms = 5000) {
        this.#timeout_ms = timeout_ms;
        this.#start_time = Date.now();
    }
    
    check() {
        if (Date.now() - this.#start_time > this.#timeout_ms) {
            throw new Error(`operation_timeout_after_${this.#timeout_ms}ms`);
        }
    }
    
    remaining() {
        return Math.max(0, this.#timeout_ms - (Date.now() - this.#start_time));
    }
}

/**
 * متریک‌های عملکرد
 */
class performance_metrics {
    #metrics = new Map();
    #start_time = null;
    
    start() {
        this.#start_time = performance.now();
        return this;
    }
    
    record(name, duration, metadata = {}) {
        if (!this.#metrics.has(name)) {
            this.#metrics.set(name, []);
        }
        this.#metrics.get(name).push({ duration, ...metadata, timestamp: Date.now() });
    }
    
    summarize() {
        const summary = {};
        for (const [name, records] of this.#metrics) {
            const durations = records.map(r => r.duration);
            summary[name] = {
                count: records.length,
                avg: durations.reduce((a, b) => a + b, 0) / records.length,
                min: Math.min(...durations),
                max: Math.max(...durations),
                total: durations.reduce((a, b) => a + b, 0),
                failures: records.filter(r => r.failed).length
            };
        }
        return summary;
    }
}

// ==================== Progress & Event System ====================

/**
 * جریان پیشرفت实时
 */
class progress_stream {
    #listeners = new Set();
    #state = {
        total: 0,
        current: 0,
        phase: 'idle',
        seeder: null,
        error: null,
        start_time: null
    };
    
    subscribe(callback) {
        this.#listeners.add(callback);
        return () => this.#listeners.delete(callback);
    }
    
    emit(update) {
        this.#state = { ...this.#state, ...update };
        for (const listener of this.#listeners) {
            try { listener(this.#state); } catch (e) { /* ignore */ }
        }
    }
    
    get_state() { return { ...this.#state }; }
    
    reset() {
        this.#state = {
            total: 0,
            current: 0,
            phase: 'idle',
            seeder: null,
            error: null,
            start_time: null
        };
        this.emit({});
    }
}

// ==================== Dependency Management ====================

/**
 * گراف وابستگی سیدرها
 */
class dependency_graph {
    #nodes = new Map(); // name -> { dependencies, seeder }
    #sorted = null;
    
    register(name, seeder, dependencies = []) {
        this.#nodes.set(name, { seeder, dependencies });
        this.#sorted = null; // invalidate cache
        return this;
    }
    
    #resolve_order() {
        const visited = new Set();
        const temp = new Set();
        const order = [];
        
        const visit = (name) => {
            if (temp.has(name)) throw new Error(`circular_dependency_${name}`);
            if (visited.has(name)) return;
            
            temp.add(name);
            const node = this.#nodes.get(name);
            if (node) {
                for (const dep of node.dependencies) {
                    if (!this.#nodes.has(dep)) {
                        throw new Error(`missing_dependency_${dep}_for_${name}`);
                    }
                    visit(dep);
                }
            }
            temp.delete(name);
            visited.add(name);
            order.push(name);
        };
        
        for (const name of this.#nodes.keys()) {
            if (!visited.has(name)) visit(name);
        }
        
        return order;
    }
    
    get_execution_order() {
        if (!this.#sorted) {
            this.#sorted = this.#resolve_order();
        }
        return [...this.#sorted];
    }
    
    get_seeder(name) {
        return this.#nodes.get(name)?.seeder;
    }
    
    size() { return this.#nodes.size; }
}

// ==================== Pipeline Architecture ====================

/**
 * میدلور پایپلاین
 */
class pipeline_middleware {
    async process(data, context) { return data; }
}

/**
 * اعتبارسنج داده
 */
class validation_middleware extends pipeline_middleware {
    #validators;
    
    constructor(validators = {}) {
        super();
        this.#validators = validators;
    }
    
    async process(data, context) {
        const { type } = context;
        const validator = this.#validators[type];
        
        if (validator) {
            const result = await validator(data);
            if (!result.valid) {
                throw new Error(`validation_failed_${type}: ${result.errors.join(', ')}`);
            }
        }
        
        return data;
    }
}

/**
 * پردازشگر دسته‌ای
 */
class batch_processor_middleware extends pipeline_middleware {
    #batch_size;
    
    constructor(batch_size = 50) {
        super();
        this.#batch_size = batch_size;
    }
    
    async process(data, context) {
        if (!Array.isArray(data)) return data;
        
        const batches = [];
        for (let i = 0; i < data.length; i += this.#batch_size) {
            batches.push(data.slice(i, i + this.#batch_size));
        }
        
        context.batches = batches.length;
        context.batch_size = this.#batch_size;
        
        return data; // داده کامل، batch processing در اجرا انجام می‌شه
    }
}

/**
 * پایپلاین اصلی
 */
class data_pipeline {
    #middlewares = [];
    #context = {};
    
    use(middleware) {
        this.#middlewares.push(middleware);
        return this;
    }
    
    set_context(key, value) {
        this.#context[key] = value;
        return this;
    }
    
    async execute(data) {
        let result = data;
        const context = { ...this.#context };
        
        for (const middleware of this.#middlewares) {
            result = await middleware.process(result, context);
        }
        
        return { result, context };
    }
    
    clear() {
        this.#middlewares = [];
        this.#context = {};
        return this;
    }
}

// ==================== Environment Profiles ====================

/**
 * پروفایل محیط‌های مختلف
 */
class environment_profiles {
    #profiles = new Map();
    #active = 'development';
    
    constructor() {
        this.#profiles.set('development', {
            clear_existing: true,
            validate: true,
            batch_size: 25,
            stop_on_error: false,
            counts: { users: 10, lessons: 20, vocabulary: 50 }
        });
        
        this.#profiles.set('test', {
            clear_existing: true,
            validate: true,
            batch_size: 10,
            stop_on_error: true,
            counts: { users: 3, lessons: 5, vocabulary: 10 }
        });
        
        this.#profiles.set('production', {
            clear_existing: false,
            validate: false,
            batch_size: 100,
            stop_on_error: true,
            counts: { users: 100, lessons: 200, vocabulary: 1000 }
        });
    }
    
    register(name, config) {
        this.#profiles.set(name, config);
        return this;
    }
    
    use(name) {
        if (!this.#profiles.has(name)) {
            throw new Error(`profile_not_found_${name}`);
        }
        this.#active = name;
        return this.get_active();
    }
    
    get_active() {
        return {
            name: this.#active,
            config: { ...this.#profiles.get(this.#active) }
        };
    }
    
    override(overrides) {
        const active = this.#profiles.get(this.#active);
        Object.assign(active, overrides);
        return this;
    }
}

// ==================== Snapshot & Rollback ====================

/**
 * مدیریت عکس‌های فوری
 */
class snapshot_manager {
    #snapshots = new Map(); // id -> { data, timestamp, metadata }
    #db;
    #logger;
    
    constructor(db, logger) {
        this.#db = db;
        this.#logger = logger;
    }
    
    async create(metadata = {}) {
        const id = id_generator.generate('snapshot');
        const stores = ['users', 'lessons', 'vocabulary', 'exercises', 'progress', 'achievements'];
        const snapshot = {};
        
        for (const store of stores) {
            try {
                snapshot[store] = await this.#db.get_all(store);
            } catch (e) {
                this.#logger.warn(`failed_to_snapshot_${store}`, e);
            }
        }
        
        const entry = {
            id,
            data: snapshot,
            timestamp: Date.now(),
            metadata,
            version: '2.0.0'
        };
        
        this.#snapshots.set(id, entry);
        await this.#db.put('snapshots', entry);
        
        this.#logger.info(`snapshot_created: ${id}`);
        return id;
    }
    
    async restore(id) {
        let entry = this.#snapshots.get(id);
        if (!entry) {
            entry = await this.#db.get('snapshots', id);
        }
        
        if (!entry) throw new Error(`snapshot_not_found_${id}`);
        
        for (const [store, items] of Object.entries(entry.data)) {
            if (Array.isArray(items) && items.length > 0) {
                await this.#db.clear(store);
                for (const item of items) {
                    await this.#db.put(store, item);
                }
            }
        }
        
        this.#logger.info(`snapshot_restored: ${id}`);
        return true;
    }
    
    list() {
        return Array.from(this.#snapshots.values())
            .map(({ id, timestamp, metadata }) => ({ id, timestamp, metadata }));
    }
}

// ==================== Performance Budget ====================

/**
 * کنترل بودجه عملکرد
 */
class performance_budget {
    #budgets;
    #violations = [];
    
    constructor(budgets = {}) {
        this.#budgets = {
            max_time_ms: budgets.max_time_ms || 10000,
            max_rows: budgets.max_rows || 5000,
            max_batch_size: budgets.max_batch_size || 100,
            min_success_rate: budgets.min_success_rate || 0.95,
            ...budgets
        };
    }
    
    check_time(elapsed_ms) {
        if (elapsed_ms > this.#budgets.max_time_ms) {
            this.#violations.push({
                type: 'time_exceeded',
                value: elapsed_ms,
                budget: this.#budgets.max_time_ms
            });
            return false;
        }
        return true;
    }
    
    check_rows(total_rows) {
        if (total_rows > this.#budgets.max_rows) {
            this.#violations.push({
                type: 'rows_exceeded',
                value: total_rows,
                budget: this.#budgets.max_rows
            });
            return false;
        }
        return true;
    }
    
    check_success_rate(success, total) {
        const rate = success / total;
        if (rate < this.#budgets.min_success_rate) {
            this.#violations.push({
                type: 'success_rate_low',
                value: rate,
                budget: this.#budgets.min_success_rate
            });
            return false;
        }
        return true;
    }
    
    get_violations() { return [...this.#violations]; }
    clear() { this.#violations = []; }
}

// ==================== Integrity Validator ====================

/**
 * اعتبارسنج یکپارچگی داده
 */
class integrity_validator {
    #db;
    #logger;
    
    constructor(db, logger) {
        this.#db = db;
        this.#logger = logger;
    }
    
    async validate_all() {
        const issues = [];
        
        // بررسی روابط کاربر-پیشرفت
        const users = new Set((await this.#db.get_all('users')).map(u => u.id));
        const progress = await this.#db.get_all('progress');
        
        for (const p of progress) {
            if (!users.has(p.userId)) {
                issues.push({
                    type: 'orphan_progress',
                    userId: p.userId,
                    lessonId: p.lessonId
                });
            }
        }
        
        // بررسی روابط درس-واژگان
        const lessons = new Set((await this.#db.get_all('lessons')).map(l => l.id));
        const vocabulary = await this.#db.get_all('vocabulary');
        
        for (const v of vocabulary) {
            if (!lessons.has(v.lessonId)) {
                issues.push({
                    type: 'orphan_vocabulary',
                    word: v.word,
                    lessonId: v.lessonId
                });
            }
        }
        
        // بررسی داده‌های تکراری
        const seen = new Map();
        for (const user of users) {
            if (seen.has(user)) {
                issues.push({ type: 'duplicate_user', id: user });
            }
            seen.set(user, true);
        }
        
        return {
            valid: issues.length === 0,
            issues,
            counts: {
                users: users.size,
                lessons: lessons.size,
                progress: progress.length,
                vocabulary: vocabulary.length
            }
        };
    }
    
    async repair() {
        const issues = (await this.validate_all()).issues;
        const repairs = [];
        
        for (const issue of issues) {
            if (issue.type === 'orphan_progress') {
                await this.#db.delete('progress', `${issue.userId}_${issue.lessonId}`);
                repairs.push({ fixed: 'deleted_orphan_progress', issue });
            }
        }
        
        return repairs;
    }
}

// ==================== Main Seeder Class ====================

/**
 * سیدر اصلی داده - هسته مرکزی
 */
class ultimate_data_seeder {
    static #instance = null;
    
    #db;
    #logger;
    #graph;
    #pipeline;
    #profiles;
    #progress;
    #snapshots;
    #budget;
    #validator;
    #metrics;
    #config;
    #is_seeding = false;
    
    constructor(db, logger = new logger_interface(), config = {}) {
        if (ultimate_data_seeder.#instance) {
            return ultimate_data_seeder.#instance;
        }
        
        this.#db = db;
        this.#logger = logger;
        this.#config = {
            batch_size: config.batch_size || 50,
            timeout_ms: config.timeout_ms || 5000,
            retry_count: config.retry_count || 3,
            ...config
        };
        
        // زیرسیستم‌ها
        this.#graph = new dependency_graph();
        this.#pipeline = new data_pipeline();
        this.#profiles = new environment_profiles();
        this.#progress = new progress_stream();
        this.#metrics = new performance_metrics();
        this.#snapshots = new snapshot_manager(db, logger);
        this.#validator = new integrity_validator(db, logger);
        this.#budget = new performance_budget(config.budgets);
        
        // تنظیم پایپلاین پیش‌فرض
        this.#pipeline
            .use(new validation_middleware({
                users: (data) => ({ valid: Array.isArray(data) }),
                lessons: (data) => ({ valid: Array.isArray(data) })
            }))
            .use(new batch_processor_middleware(this.#config.batch_size));
        
        // ثبت سیدرهای پیش‌فرض
        this.#register_default_seeders();
        
        ultimate_data_seeder.#instance = this;
    }
    
    static get_instance(db, logger, config) {
        if (!ultimate_data_seeder.#instance) {
            ultimate_data_seeder.#instance = new ultimate_data_seeder(db, logger, config);
        }
        return ultimate_data_seeder.#instance;
    }
    
    static reset_instance() {
        ultimate_data_seeder.#instance = null;
        id_generator.reset();
    }
    
    // ==================== Private Methods ====================
    
    #register_default_seeders() {
        this.#graph.register('users', this.#seed_users.bind(this), []);
        this.#graph.register('lessons', this.#seed_lessons.bind(this), []);
        this.#graph.register('vocabulary', this.#seed_vocabulary.bind(this), ['lessons']);
        this.#graph.register('exercises', this.#seed_exercises.bind(this), ['lessons']);
        this.#graph.register('progress', this.#seed_progress.bind(this), ['users', 'lessons']);
        this.#graph.register('achievements', this.#seed_achievements.bind(this), []);
        this.#graph.register('settings', this.#seed_settings.bind(this), []);
    }
    
    async #seed_users() {
        const profile = this.#profiles.get_active();
        const count = profile.config.counts.users || 5;
        
        return Array.from({ length: count }, (_, i) => ({
            id: id_generator.generate('user'),
            username: `user_${i + 1}`,
            email: `user${i + 1}@example.com`,
            xp: Math.floor(Math.random() * 1000),
            level: Math.floor(Math.random() * 10),
            created_at: new Date().toISOString()
        }));
    }
    
    async #seed_lessons() {
        const profile = this.#profiles.get_active();
        const count = profile.config.counts.lessons || 10;
        
        return Array.from({ length: count }, (_, i) => ({
            id: id_generator.generate('lesson'),
            title: `Lesson ${i + 1}`,
            difficulty: (i % 5) + 1,
            prerequisites: i > 0 ? [`lesson_${i}`] : [],
            created_at: new Date().toISOString()
        }));
    }
    
    async #seed_vocabulary(context) {
        const lessons = context?.lessons || [];
        const vocab_per_lesson = 5;
        const vocabulary = [];
        
        for (const lesson of lessons.slice(0, 5)) {
            for (let j = 0; j < vocab_per_lesson; j++) {
                vocabulary.push({
                    id: id_generator.generate('vocab'),
                    lessonId: lesson.id,
                    word: `word_${j + 1}`,
                    translation: `ترجمه_${j + 1}`,
                    pronunciation: `/word${j + 1}/`
                });
            }
        }
        
        return vocabulary;
    }
    
    async #seed_exercises(context) {
        const lessons = context?.lessons || [];
        const exercises = [];
        
        for (const lesson of lessons.slice(0, 5)) {
            exercises.push({
                id: id_generator.generate('exercise'),
                lessonId: lesson.id,
                type: 'multiple_choice',
                question: `Question for ${lesson.title}`,
                options: ['option1', 'option2', 'option3'],
                correct: 0
            });
        }
        
        return exercises;
    }
    
    async #seed_progress(context) {
        const users = context?.users || [];
        const lessons = context?.lessons || [];
        const progress = [];
        
        for (const user of users.slice(0, 3)) {
            for (const lesson of lessons.slice(0, 3)) {
                progress.push({
                    userId: user.id,
                    lessonId: lesson.id,
                    stage: Math.floor(Math.random() * 5),
                    ease_factor: 2.5,
                    interval: 1,
                    next_review: Date.now() + 86400000,
                    review_count: Math.floor(Math.random() * 10)
                });
            }
        }
        
        return progress;
    }
    
    async #seed_achievements() {
        return [
            { id: 'first_lesson', name: 'First Steps', xp_reward: 50 },
            { id: 'seven_day_streak', name: 'Weekly Warrior', xp_reward: 200 }
        ];
    }
    
    async #seed_settings() {
        return [
            { key: 'app_version', value: '2.0.0' },
            { key: 'theme', value: 'system' }
        ];
    }
    
    async #execute_with_retry(operation, name) {
        let last_error;
        for (let i = 0; i < this.#config.retry_count; i++) {
            try {
                return await Promise.race([
                    operation(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('timeout')), this.#config.timeout_ms)
                    )
                ]);
            } catch (error) {
                last_error = error;
                this.#logger.warn(`retry_${i + 1}_${name}:`, error);
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
            }
        }
        throw new Error(`failed_after_${this.#config.retry_count}_retries: ${last_error.message}`);
    }
    
    // ==================== Public API ====================
    
    register_seeder(name, seeder, dependencies = []) {
        this.#graph.register(name, seeder, dependencies);
        return this;
    }
    
    use_middleware(middleware) {
        this.#pipeline.use(middleware);
        return this;
    }
    
    on_progress(callback) {
        this.#progress.subscribe(callback);
        return this;
    }
    
    profile(name) {
        this.#profiles.use(name);
        return this;
    }
    
    async seed(options = {}) {
        if (this.#is_seeding) {
            throw new Error('seeder_already_running');
        }
        
        this.#is_seeding = true;
        this.#metrics.start();
        this.#progress.emit({ phase: 'starting', total: this.#graph.size() });
        
        const snapshot_id = options.backup ? await this.#snapshots.create({ reason: 'pre_seed' }) : null;
        const profile = this.#profiles.get_active();
        const order = this.#graph.get_execution_order();
        const results = {};
        
        try {
            this.#progress.emit({ phase: 'seeding', total: order.length, current: 0 });
            
            for (let i = 0; i < order.length; i++) {
                const name = order[i];
                const seeder = this.#graph.get_seeder(name);
                
                this.#progress.emit({
                    current: i + 1,
                    seeder: name,
                    phase: `seeding_${name}`
                });
                
                try {
                    const start = performance.now();
                    const context = { results: { ...results } };
                    
                    const data = await this.#execute_with_retry(
                        () => seeder(context),
                        name
                    );
                    
                    const processed = await this.#pipeline.execute(data);
                    
                    if (!options.dry_run) {
                        await this.#db.put(name, processed.result);
                    }
                    
                    const duration = performance.now() - start;
                    this.#metrics.record(name, duration, { count: data?.length || 0 });
                    
                    results[name] = {
                        success: true,
                        count: data?.length || 0,
                        duration
                    };
                    
                    this.#logger.info(`seeder_completed: ${name}`, results[name]);
                } catch (error) {
                    this.#metrics.record(name, 0, { failed: true, error: error.message });
                    
                    results[name] = {
                        success: false,
                        error: error.message
                    };
                    
                    this.#logger.error(`seeder_failed: ${name}`, error);
                    
                    if (profile.config.stop_on_error) {
                        throw error;
                    }
                }
            }
            
            // اعتبارسنجی نهایی
            const integrity = options.validate ? await this.#validator.validate_all() : null;
            
            // بررسی بودجه عملکرد
            const total_time = performance.now() - this.#metrics.start()?._start_time || 0;
            const total_rows = Object.values(results).reduce((s, r) => s + (r.count || 0), 0);
            
            this.#budget.check_time(total_time);
            this.#budget.check_rows(total_rows);
            
            this.#progress.emit({
                phase: 'complete',
                results,
                integrity,
                violations: this.#budget.get_violations()
            });
            
            return {
                success: true,
                duration: total_time,
                results,
                integrity,
                snapshot: snapshot_id,
                metrics: this.#metrics.summarize()
            };
            
        } catch (error) {
            this.#progress.emit({ phase: 'error', error: error.message });
            
            if (snapshot_id && options.rollback_on_error) {
                await this.#snapshots.restore(snapshot_id);
                this.#logger.info(`rolled_back_to: ${snapshot_id}`);
            }
            
            throw error;
        } finally {
            this.#is_seeding = false;
        }
    }
    
    async validate() {
        return this.#validator.validate_all();
    }
    
    async create_snapshot(metadata = {}) {
        return this.#snapshots.create(metadata);
    }
    
    async restore_snapshot(id) {
        return this.#snapshots.restore(id);
    }
    
    get_status() {
        return {
            is_seeding: this.#is_seeding,
            seeder_count: this.#graph.size(),
            profile: this.#profiles.get_active(),
            progress: this.#progress.get_state()
        };
    }
    
    get_metrics() {
        return this.#metrics.summarize();
    }
}

// ==================== Factory Function ====================

export function create_ultimate_seeder(db, logger, config = {}) {
    return ultimate_data_seeder.get_instance(db, logger, config);
}

// ==================== Example Usage ====================

if (typeof require !== 'undefined' && require.main === module) {
    class mock_db extends database_adapter {
        async put(store, value) { 
            console.log(`[MOCK] put ${store}:`, value);
            return value;
        }
        async get_all() { return []; }
        async clear() { return true; }
    }
    
    const seeder = create_ultimate_seeder(new mock_db(), null, {
        batch_size: 25,
        timeout_ms: 3000
    });
    
    seeder
        .profile('development')
        .on_progress(state => console.log('PROGRESS:', state))
        .seed({ dry_run: false, backup: true })
        .then(console.log)
        .catch(console.error);
}

export default ultimate_data_seeder;
