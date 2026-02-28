/**
 * Migration Step: v2 -> v3
 * ----------------------------------------
 * - Transaction-safe
 * - Batch processing with cursor.advance
 * - Progress reporting
 * - Fully aligned with Alpha Principles
 *
 * @version 3.0.0
 */

import { run_transaction } from '../../transaction_runner.js';
import { validate_difficulty } from '../../validators/difficulty_validator.js';

/**
 * @typedef {Object} Migration_context
 * @property {IDBDatabase} db
 * @property {function(Object):void} report_progress
 * @property {Object} logger
 */

/**
 * Migration entry point
 * @param {Migration_context} context
 * @returns {Promise<void>}
 */
export async function step_v2_to_v3(context) {
    const { db, report_progress, logger } = context;

    if (!db) {
        throw new Error('migration_context.db is required');
    }

    logger?.info?.('[migration:v2_to_v3] started');

    await run_transaction(db, ['lessons'], 'readwrite', async (tx) => {
        const store = tx.objectStore('lessons');
        const total_count = await count_records(store);

        let processed = 0;
        let batch_size = 100;
        let cursor = await open_cursor(store);

        while (cursor) {
            const updated = migrate_lesson_record(cursor.value, logger);

            if (updated) {
                cursor.update(updated);
            }

            processed++;

            if (processed % batch_size === 0) {
                report_progress?.({
                    phase: 'migrating',
                    processed,
                    total: total_count,
                    percent: Math.round((processed / total_count) * 100),
                });

                cursor.advance(batch_size);
            } else {
                cursor.continue();
            }

            cursor = await next_cursor(cursor);
        }
    });

    logger?.info?.('[migration:v2_to_v3] completed');
}

/* ------------------------------------------------------------------ */
/* ------------------------- INTERNAL HELPERS ------------------------ */
/* ------------------------------------------------------------------ */

/**
 * @param {IDBObjectStore} store
 * @returns {Promise<number>}
 */
function count_records(store) {
    return new Promise((resolve, reject) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * @param {IDBObjectStore} store
 * @returns {Promise<IDBCursorWithValue|null>}
 */
function open_cursor(store) {
    return new Promise((resolve, reject) => {
        const req = store.openCursor();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * @param {IDBCursorWithValue} cursor
 * @returns {Promise<IDBCursorWithValue|null>}
 */
function next_cursor(cursor) {
    return new Promise((resolve, reject) => {
        cursor.request.onsuccess = () => resolve(cursor.request.result);
        cursor.request.onerror = () => reject(cursor.request.error);
    });
}

/**
 * Applies v3 normalization rules to lesson record
 * Immutable-safe (clone based)
 *
 * @param {Object} lesson
 * @param {Object} logger
 * @returns {Object|null}
 */
function migrate_lesson_record(lesson, logger) {
    try {
        const cloned = structuredClone(lesson);

        if ('difficulty' in cloned) {
            cloned.difficulty = validate_difficulty(cloned.difficulty);
        }

        // example structural upgrade
        if (!cloned.metadata) {
            cloned.metadata = { migrated_to_v3: true };
        } else {
            cloned.metadata.migrated_to_v3 = true;
        }

        return cloned;
    } catch (error) {
        logger?.error?.('[migration:v2_to_v3] record failed', {
            error,
            lesson_id: lesson?.id,
        });
        return null;
    }
}
