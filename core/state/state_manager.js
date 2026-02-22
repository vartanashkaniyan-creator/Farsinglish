
/**
 * @typedef {Object} DispatchOptions
 * @property {AbortSignal} [signal] - سیگنال لغو عملیات
 */

/**
 * @typedef {Object} Snapshot
 * @property {Object} state - نسخه کپی‌شده از state
 * @property {number} timestamp - زمان ایجاد snapshot
 * @property {number} action_count - تعداد اکشن‌ها تا آن لحظه
 * @property {Object} metadata - اطلاعات اضافی
 */

class StateTransaction {
    constructor(manager) {
        this.manager = manager;
        this.initial_state = JSON.parse(JSON.stringify(manager.get_state()));
        this.changes = [];
        this._committed = false;
    }

    add_change(action_type, payload) {
        if (this._committed) throw new Error('Transaction already committed');
        this.changes.push({ type: action_type, payload });
        return this;
    }

    async commit() {
        if (this._committed) throw new Error('Transaction already committed');
        const snapshot_name = this.manager.take_snapshot('transaction_backup');
        try {
            for (const change of this.changes) {
                await this.manager.dispatch(change.type, change.payload);
            }
            this._committed = true;
            return true;
        } catch (error) {
            await this.rollback();
            throw error;
        }
    }

    async rollback() {
        this.manager._state = JSON.parse(JSON.stringify(this.initial_state));
        return true;
    }
}

class StateManager {
    constructor(initial_state = {}, max_history = 50, snapshot_ttl = 3600000) {
        this._state = initial_state;
        this._action_history = [];
        this._middlewares = [];
        this._reducers = new Map();
        this._plugins = [];
        this._snapshots = new Map();
        this._selector_cache = new Map();
        this._cached_deps = [];
        this._listener_refs = new WeakMap();
        this._finalization_registry = new FinalizationRegistry(ref => {
            this._listener_refs.delete(ref);
        });
        this._event_handlers = new Map();
        this._max_history = max_history;
        this._snapshot_ttl = snapshot_ttl;

        // پاکسازی خودکار snapshotهای قدیمی
        setInterval(() => {
            const now = Date.now();
            for (const [name, snap] of this._snapshots) {
                if (now - snap.timestamp > this._snapshot_ttl) {
                    this._snapshots.delete(name);
                }
            }
        }, 60000);
    }

    /** مدیریت event emitter */
    on(event_name, handler) {
        if (!this._event_handlers.has(event_name)) {
            this._event_handlers.set(event_name, new Set());
        }
        this._event_handlers.get(event_name).add(handler);
    }

    emit(event_name, data) {
        this._event_handlers.get(event_name)?.forEach(h => {
            try { h(data); } catch (e) { console.error(e); }
        });
    }

    /** subscription listener */
    subscribe(listener_fn) {
        const wrapped_listener = () => listener_fn(this.get_state());
        this._listener_refs.set(listener_fn, wrapped_listener);
        this._finalization_registry.register(listener_fn, listener_fn);
        return () => this.unsubscribe(listener_fn);
    }

    unsubscribe(listener_fn) {
        this._listener_refs.delete(listener_fn);
        this._event_handlers.forEach(set => set.delete(listener_fn));
    }

    _notify_listeners() {
        this._listener_refs.forEach(wrapped => {
            try { wrapped(); } catch (e) { console.error(e); }
        });
    }

    get_state() {
        return this._state;
    }

    /** ثبت reducer */
    register_reducer(action_type, reducer_fn) {
        this._reducers.set(action_type, reducer_fn);
    }

    /** ثبت middleware */
    add_middleware(middleware_fn) {
        this._middlewares.push(middleware_fn);
    }

    /** ثبت plugin */
    register_plugin(plugin) {
        plugin.install({
            state_manager: this,
            register_reducer: this.register_reducer.bind(this),
            add_middleware: this.add_middleware.bind(this)
        });
        this._plugins.push(plugin);
    }

    /** reducer پایه */
    _reducer(state, action) {
        if (this._reducers.has(action.type)) {
            return this._reducers.get(action.type)(state, action.payload);
        }
        return state;
    }

    /** پشتیبانی از selector cache با dependencies */
    create_selector(selector_fn, dependencies = []) {
        const cache_key = selector_fn.toString();
        return () => {
            this._selector_cache_total = this._selector_cache_total || 0;
            this._selector_cache_hits = this._selector_cache_hits || 0;
            this._selector_cache_total++;

            const cached = this._selector_cache.get(cache_key);
            if (cached && dependencies.every((dep, i) => dep === this._state[dep])) {
                this._selector_cache_hits++;
                return cached.value;
            }

            const value = selector_fn(this.get_state());
            this._selector_cache.set(cache_key, {
                value,
                timestamp: Date.now(),
                dependencies: dependencies.map(dep => this._state[dep])
            });
            return value;
        };
    }

    /** مدیریت dispatch با middleware و abort support */
    async dispatch(type, payload = {}, options = {}) {
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        let current_payload = payload;

        for (const mw of this._middlewares) {
            if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            current_payload = await mw({
                type,
                payload: current_payload,
                state: this.get_state(),
                signal: options.signal,
                next: async () => current_payload
            });
        }

        // تغییر state با reducer
        this._state = this._reducer(this._state, { type, payload: current_payload });

        // ثبت در تاریخچه
        this._action_history.push({ type, payload: current_payload });
        if (this._action_history.length > this._max_history) this._action_history.shift();

        this._notify_listeners();
        return this._state;
    }

    /** زمان‌بندی snapshot */
    take_snapshot(name = `snapshot_${Date.now()}`) {
        const snap = {
            state: JSON.parse(JSON.stringify(this._state)),
            timestamp: Date.now(),
            action_count: this._action_history.length,
            metadata: { version: '1.0.0', created_by: 'user' }
        };
        this._snapshots.set(name, snap);
        return name;
    }

    /** Undo / Redo */
    undo() {
        if (this._action_history.length === 0) return;
        const last_action = this._action_history.pop();
        this._state = this._reducer(this._state, { type: `UNDO_${last_action.type}`, payload: last_action.payload });
        this._notify_listeners();
    }

    redo() {
        // TODO: اضافه کردن redo
    }

    /** Time Travel Debugging */
    start_time_travel() {
        this._time_travel_mode = true;
        this._recorded_actions = [];
        const original_dispatch = this.dispatch.bind(this);
        this.dispatch = async (type, payload, options = {}) => {
            if (this._time_travel_mode) {
                this._recorded_actions.push({ type, payload, timestamp: Date.now() });
                return this.get_state();
            }
            return original_dispatch(type, payload, options);
        };
    }

    export_time_travel() {
        return JSON.stringify({
            actions: this._recorded_actions,
            snapshots: Array.from(this._snapshots.entries())
        });
    }

    /** Web Worker Proxy */
    create_worker_proxy(worker) {
        const handler = {
            get: (_, prop) => async (...args) => {
                worker.postMessage({ method: prop, args });
                return new Promise(resolve => {
                    worker.onmessage = e => resolve(e.data);
                });
            }
        };
        return new Proxy(this, handler);
    }

    /** Performance middleware پیشرفته */
    add_performance_middleware() {
        this.add_middleware(async (ctx) => {
            const start = performance.now();
            const result = await ctx.next?.() ?? ctx.payload;
            const duration = performance.now() - start;
            if (duration > 100) console.warn(`Slow action ${ctx.type}: ${duration}ms`);
            return result;
        });
    }

    /** Validator برای تغییرات state */
    add_validator(validator_fn) {
        this.add_middleware(async (ctx) => {
            const result = await ctx.next?.() ?? ctx.payload;
            if (!validator_fn(this.get_state(), ctx)) {
                console.error('State validation failed', ctx);
            }
            return result;
        });
    }

    /** Transaction */
    begin_transaction() {
        return new StateTransaction(this);
    }

    /** تعریف State Machine */
    define_state_machine(section, states, transitions) {
        this._machines = this._machines || new Map();
        this._machines.set(section, { states, transitions });
        this.add_middleware(async ctx => {
            // TODO: State machine middleware
            return ctx.payload;
        });
    }
            }
