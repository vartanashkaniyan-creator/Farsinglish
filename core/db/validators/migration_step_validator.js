/**
 * @file core/db/validators/migration_step_validator.js
 * @description Validator for individual migration steps in the database
 * @version 1.1.0
 */

import { deep_clone, deep_freeze } from '../../core/utils/clone_utils.js';

/**
 * Checks if the given value is a function
 * @param {*} value
 * @returns {boolean}
 */
export function is_function(value) {
    return typeof value === 'function';
}

/**
 * Validates a single migration step object
 * @param {Object} step - Migration step
 * @param {string|number} step.step_id - Unique identifier
 * @param {Function} step.migrate - Function performing migration
 * @param {Function} [step.rollback] - Optional rollback function
 * @returns {boolean}
 * @throws {Error} Throws error if validation fails
 */
export function validate_migration_step(step) {
    if (!step || typeof step !== 'object') {
        throw new Error('[MigrationStepValidator] Step must be an object');
    }

    // Validate step_id
    if (!step.step_id) {
        throw new Error(`[MigrationStepValidator] Invalid step_id: ${String(step.step_id)}`);
    }

    // Validate migrate function
    if (!is_function(step.migrate)) {
        throw new Error(`[MigrationStepValidator] Migration function is invalid for step_id: ${String(step.step_id)}`);
    }

    // Validate rollback function if provided
    if (step.rollback !== undefined && !is_function(step.rollback)) {
        throw new Error(`[MigrationStepValidator] Rollback function is invalid for step_id: ${String(step.step_id)}`);
    }

    return true;
}

/**
 * Deep clones and freezes a migration step to ensure immutability
 * @param {Object} step
 * @returns {Object} Cloned and frozen step
 */
export function clone_and_freeze_step(step) {
    const cloned_step = deep_clone(step);
    return deep_freeze(cloned_step);
}
