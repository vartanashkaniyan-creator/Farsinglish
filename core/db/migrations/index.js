/**
 * @file core/db/migrations/index.js
 * @description
 * Single entry point for database migration steps.
 * Responsible only for registration and safe access.
 *
 * Principles:
 * - KISS
 * - SRP
 * - YAGNI
 * - snake_case
 */

'use strict';

/**
 * @typedef {import('../validators/migration_step_validator.js').MigrationStep} MigrationStep
 */

/** @type {Map<string, MigrationStep>} */
const migration_registry = new Map();

/**
 * Register a migration step.
 * @param {MigrationStep} step
 */
function register_migration(step) {
    if (!step || typeof step !== 'object') {
        throw new TypeError('migration step must be an object');
    }

    const step_id = String(step.step_id);

    if (!step_id) {
        throw new Error('migration step_id is required');
    }

    if (migration_registry.has(step_id)) {
        throw new Error(`duplicate migration step_id: ${step_id}`);
    }

    migration_registry.set(step_id, step);
}

/**
 * Register multiple migration steps.
 * @param {MigrationStep[]} steps
 */
function register_migrations(steps) {
    if (!Array.isArray(steps)) {
        throw new TypeError('migrations must be an array');
    }

    for (const step of steps) {
        register_migration(step);
    }
}

/**
 * Get all registered migrations in insertion order.
 * @returns {MigrationStep[]}
 */
function get_all_migrations() {
    return Array.from(migration_registry.values());
}

/**
 * Check if a migration exists.
 * @param {string} step_id
 * @returns {boolean}
 */
function has_migration(step_id) {
    return migration_registry.has(String(step_id));
}

/**
 * Clear registry (intended for tests only).
 */
function clear_migrations() {
    migration_registry.clear();
}

/**
 * Frozen public API
 */
export const migrations = Object.freeze({
    register_migration,
    register_migrations,
    get_all_migrations,
    has_migration,
    clear_migrations
});
