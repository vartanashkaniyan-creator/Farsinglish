/**
 * @file step_v3_to_v4.js
 * @description Migration script: IndexedDB step from version 3 to version 4
 * @version 1.2.0
 */

import { runTransaction } from '../transaction_runner.js';
import { validateDifficulty } from '../validators/difficulty_validator.js';
import { logError } from '../../utils/logger.js';
import { validateLessonStructure } from '../validators/lesson_validator.js';
import { recordMigrationMetric } from '../metrics/migration_metrics.js';

/** Transaction timeout (ms) */
const TX_TIMEOUT = 30000; // 30 seconds

/**
 * @typedef {Object} MigrationContext
 * @property {IDBDatabase} db
 * @property {Function} reportProgress
 */

/**
 * @typedef {Object} MigrationResult
 * @property {number} processed
 * @property {number} failed
 * @property {number} total
 */

/** Default SRS configuration for migrated lessons */
const DEFAULT_SRS_CONFIG = Object.freeze({
  interval: 0,
  easeFactor: 2.5,
  repetition: 0,
  lastReview: null,
});

/** Helper: Count total records in store */
const countStore = (store) =>
  new Promise((resolve, reject) => {
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/**
 * Migrate all lessons from v3 to v4
 * @param {MigrationContext} context
 * @returns {Promise<MigrationResult>}
 */
export async function migrateLessonsToV4({ db, reportProgress }) {
  if (!db) throw new Error('Database instance required');

  const storeName = 'lessons';
  let totalCount = 0;
  let processedCount = 0;
  let failedCount = 0;
  const batchSize = 100;

  try {
    return await Promise.race([
      runTransaction(db, storeName, 'readwrite', async (tx, store) => {
        totalCount = await countStore(store);

        const cursorReq = store.openCursor();
        await new Promise((resolve, reject) => {
          cursorReq.onsuccess = async (event) => {
            const cursor = event.target.result;
            if (!cursor) return resolve();

            const lesson = structuredClone(cursor.value);

            try {
              // Advanced validation
              if (!validateLessonStructure(lesson)) {
                throw new Error('Invalid lesson structure');
              }

              await migrateLessonRecordToV4(lesson);
              await cursor.update(lesson);
              processedCount++;
            } catch (err) {
              failedCount++;
              logError(err, { context: 'migrateLessonsToV4', lessonId: lesson.id });
            }

            // Progress reporting
            if (processedCount % batchSize === 0 && reportProgress) {
              reportProgress({
                processed: processedCount,
                total: totalCount,
                failed: failedCount,
              });
            }

            cursor.advance(batchSize); // batch processing
          };
          cursorReq.onerror = (e) => reject(e.target.error);
        });

        // Final progress report
        if (reportProgress) {
          reportProgress({ processed: processedCount, total: totalCount, failed: failedCount });
        }

        // Metric collection
        recordMigrationMetric('v3_to_v4', processedCount, failedCount);

        return { processed: processedCount, failed: failedCount, total: totalCount };
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Migration timeout after 30s')), TX_TIMEOUT)
      )
    ]);
  } catch (err) {
    logError(err, { context: 'migrateLessonsToV4' });
    return { processed: processedCount, failed: failedCount, total: totalCount };
  }
}

/**
 * Migrate a single lesson record to v4 format
 * @param {Object} lesson
 */
async function migrateLessonRecordToV4(lesson) {
  if (!lesson) throw new Error('Invalid lesson record');

  // Normalize difficulty
  lesson.difficulty = validateDifficulty(lesson.difficulty);

  // SRS data
  lesson.srsData = { ...DEFAULT_SRS_CONFIG, ...lesson.srsData };

  // Migration flag
  lesson.migratedToV4 = true;

  // Optional: Additional transformations can be added here
}
