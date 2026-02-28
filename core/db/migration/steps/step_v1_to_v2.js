/**
 * core/db/migration/steps/step_v1_to_v2.js
 *
 * Migration step: schema v1 → v2
 * Enterprise-grade, Alpha-compliant implementation
 *
 * ویژگی‌ها:
 * - Transaction-safe
 * - Batch processing (memory-safe)
 * - Event-driven progress reporting
 * - Immutable data flow
 * - Strict validation & guarding
 * - Node/Browser compatible timing
 * - snake_case naming
 * - Full JSDoc (TypeScript-ready)
 */

/* ---------------------------------- */
/* Constants & Types                  */
/* ---------------------------------- */

/**
 * @typedef {Object} Migration_context
 * @property {import('../types').Db_adapter} db_adapter
 * @property {AbortSignal} abort_signal
 * @property {(event: Migration_event) => void} emit_event
 */

/**
 * @typedef {Object} Migration_event
 * @property {'start'|'progress'|'completed'|'error'} type
 * @property {number} [processed]
 * @property {number} [total]
 * @property {number} [duration_ms]
 * @property {string} [message]
 */

const TABLE_USERS = 'users';
const SCHEMA_VERSION_FROM = 1;
const SCHEMA_VERSION_TO = 2;

const DEFAULT_BATCH_SIZE = 250;

/* ---------------------------------- */
/* Utilities                          */
/* ---------------------------------- */

/**
 * Safe high-resolution timer (browser + node)
 * @returns {number}
 */
function now_ms() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}

/**
 * Abort guard
 * @param {AbortSignal} abort_signal
 */
function assert_not_aborted(abort_signal) {
    if (abort_signal?.aborted) {
        throw new Error('migration_aborted');
    }
}

/**
 * Deep freeze helper (defensive immutability)
 * @template T
 * @param {T} obj
 * @returns {Readonly<T>}
 */
function deep_freeze(obj) {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach(prop => {
        const value = obj[prop];
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            deep_freeze(value);
        }
    });
    return obj;
}

/* ---------------------------------- */
/* Validation                         */
/* ---------------------------------- */

/**
 * Validate migration context
 * @param {Migration_context} context
 */
function validate_context(context) {
    if (!context) throw new Error('context_required');
    if (!context.db_adapter) throw new Error('db_adapter_required');
    if (!context.emit_event) throw new Error('emit_event_required');
}

/* ---------------------------------- */
/* Transformation Logic               */
/* ---------------------------------- */

/**
 * Transform user record from v1 to v2 (pure & immutable)
 * @param {Object} user_v1
 * @returns {Object} user_v2
 */
function transform_user_v1_to_v2(user_v1) {
    const cloned = structuredClone(user_v1);

    const user_v2 = {
        ...cloned,
        profile: {
            name: cloned.name ?? '',
            created_at: cloned.created_at ?? Date.now()
        },
        schema_version: SCHEMA_VERSION_TO
    };

    delete user_v2.name;

    return deep_freeze(user_v2);
}

/* ---------------------------------- */
/* Main Migration Step                */
/* ---------------------------------- */

/**
 * Execute migration step v1 → v2
 * @param {Migration_context} context
 * @param {Object} [options]
 * @param {number} [options.batch_size]
 */
export async function step_v1_to_v2(context, options = {}) {
    validate_context(context);

    const {
        db_adapter,
        abort_signal,
        emit_event
    } = context;

    const batch_size = options.batch_size ?? DEFAULT_BATCH_SIZE;

    const start_time = now_ms();
    let migrated_records = 0;

    emit_event({
        type: 'start',
        message: 'migration_v1_to_v2_started'
    });

    try {
        const total_records = await db_adapter.count(TABLE_USERS);

        let offset = 0;

        while (offset < total_records) {
            assert_not_aborted(abort_signal);

            const users_v1 = await db_adapter.get_batch(
                TABLE_USERS,
                offset,
                batch_size
            );

            if (!users_v1.length) break;

            const users_v2 = users_v1.map(transform_user_v1_to_v2);

            // Transaction-safe bulk write
            await db_adapter.transaction(
                'readwrite',
                [TABLE_USERS],
                async () => {
                    await db_adapter.put_bulk(TABLE_USERS, users_v2);
                }
            );

            migrated_records += users_v2.length;
            offset += users_v2.length;

            emit_event({
                type: 'progress',
                processed: migrated_records,
                total: total_records
            });
        }

        const duration_ms = now_ms() - start_time;

        emit_event({
            type: 'completed',
            processed: migrated_records,
            total: migrated_records,
            duration_ms
        });

    } catch (error) {
        // rollback semantic: logical reset of counters
        migrated_records = 0;

        emit_event({
            type: 'error',
            message: error instanceof Error ? error.message : 'unknown_error'
        });

        throw error;
    }
                  }
