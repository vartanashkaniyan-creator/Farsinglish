// shared/constants/achievement_constants.js

/**
 * @fileoverview Achievement constants and utilities
 * @module achievement_constants
 */

///////////////////////////////
// Achievement Enums
///////////////////////////////

/**
 * @readonly
 * @enum {string}
 */
export const ACHIEVEMENT_TYPE = Object.freeze({
  LESSON_COMPLETION: 'lesson_completion',
  DAILY_STREAK: 'daily_streak',
  QUIZ_MASTER: 'quiz_master',
  BONUS_POINTS: 'bonus_points'
});

/**
 * @readonly
 * @enum {string}
 */
export const ACHIEVEMENT_RARITY = Object.freeze({
  COMMON: 'common',
  RARE: 'rare',
  EPIC: 'epic',
  LEGENDARY: 'legendary'
});

/**
 * @readonly
 * @enum {string}
 */
export const ACHIEVEMENT_ERROR = Object.freeze({
  INVALID_TYPE: 'INVALID_TYPE',
  INVALID_RARITY: 'INVALID_RARITY',
  MISSING_FIELDS: 'MISSING_FIELDS',
  INVALID_DESCRIPTION: 'INVALID_DESCRIPTION',
  INVALID_POINTS: 'INVALID_POINTS',
  INVALID_UNLOCKED: 'INVALID_UNLOCKED',
  INVALID_DATE: 'INVALID_DATE'
});

///////////////////////////////
// Default Achievement
///////////////////////////////

const DEFAULT_ACHIEVEMENT = Object.freeze({
  type: ACHIEVEMENT_TYPE.BONUS_POINTS,
  title: 'Default Achievement',
  description: 'Default description',
  rarity: ACHIEVEMENT_RARITY.COMMON,
  points: 5,
  unlocked: false,
  unlocked_at: null,
  created_at: new Date(),
  toJSON() {
    return {
      ...this,
      created_at: this.created_at.toISOString(),
      unlocked_at: this.unlocked_at?.toISOString() || null
    };
  }
});

///////////////////////////////
// Deep Freeze (Iterative)
///////////////////////////////

/**
 * Deep freeze an object, preserves Date objects
 * @template T
 * @param {T} obj
 * @returns {T}
 */
export function deep_freeze_achievement(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const stack = [obj];
  while (stack.length) {
    const current = stack.pop();
    Object.getOwnPropertyNames(current).forEach(key => {
      const value = current[key];
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        stack.push(value);
      }
    });
    Object.freeze(current);
  }
  return obj;
}

///////////////////////////////
// Validation
///////////////////////////////

/**
 * Check if an object is a valid Achievement
 * @param {*} obj
 * @returns {obj is AchievementProps}
 */
export function is_valid_achievement(obj) {
  if (!obj || typeof obj !== 'object') return false;

  const required = ['type', 'title', 'description', 'rarity', 'points', 'unlocked', 'created_at', 'unlocked_at'];
  if (!required.every(k => k in obj)) return false;

  if (!Object.values(ACHIEVEMENT_TYPE).includes(obj.type)) return false;
  if (!Object.values(ACHIEVEMENT_RARITY).includes(obj.rarity)) return false;

  if (typeof obj.title !== 'string' || obj.title.trim() === '') return false;
  if (typeof obj.description !== 'string' || obj.description.trim() === '') return false;
  if (typeof obj.points !== 'number' || obj.points < 0) return false;
  if (typeof obj.unlocked !== 'boolean') return false;
  if (!(obj.created_at instanceof Date)) return false;
  if (!(obj.unlocked_at instanceof Date) && obj.unlocked_at !== null) return false;

  return true;
}

/**
 * Assert achievement validity or throw descriptive error
 * @param {*} obj
 * @throws {Error}
 */
export function assert_valid_achievement(obj) {
  if (!is_valid_achievement(obj)) {
    const errors = [];
    if (!obj?.type || !Object.values(ACHIEVEMENT_TYPE).includes(obj.type))
      errors.push(ACHIEVEMENT_ERROR.INVALID_TYPE);
    if (!obj?.rarity || !Object.values(ACHIEVEMENT_RARITY).includes(obj.rarity))
      errors.push(ACHIEVEMENT_ERROR.INVALID_RARITY);
    if (!obj?.title || typeof obj.title !== 'string' || obj.title.trim() === '')
      errors.push(ACHIEVEMENT_ERROR.MISSING_FIELDS);
    if (!obj?.description || typeof obj.description !== 'string' || obj.description.trim() === '')
      errors.push(ACHIEVEMENT_ERROR.INVALID_DESCRIPTION);
    if (typeof obj?.points !== 'number' || obj.points < 0)
      errors.push(ACHIEVEMENT_ERROR.INVALID_POINTS);
    if (typeof obj?.unlocked !== 'boolean')
      errors.push(ACHIEVEMENT_ERROR.INVALID_UNLOCKED);
    if (!(obj?.created_at instanceof Date))
      errors.push(ACHIEVEMENT_ERROR.INVALID_DATE);
    if (!(obj?.unlocked_at instanceof Date) && obj?.unlocked_at !== null)
      errors.push(ACHIEVEMENT_ERROR.INVALID_DATE);

    throw new Error(`Achievement validation failed: ${errors.join(', ')}`);
  }
}

///////////////////////////////
// Factory
///////////////////////////////

const ACHIEVEMENT_POINTS = {
  [ACHIEVEMENT_TYPE.LESSON_COMPLETION]: 10,
  [ACHIEVEMENT_TYPE.DAILY_STREAK]: 5,
  [ACHIEVEMENT_TYPE.QUIZ_MASTER]: 50,
  [ACHIEVEMENT_TYPE.BONUS_POINTS]: 5
};

/**
 * Achievement Factory - static methods for creating achievements
 */
export const AchievementFactory = Object.freeze({
  /**
   * @param {string} title
   * @returns {AchievementProps}
   */
  create_lesson_completion(title) {
    const achievement = {
      ...DEFAULT_ACHIEVEMENT,
      type: ACHIEVEMENT_TYPE.LESSON_COMPLETION,
      title,
      rarity: ACHIEVEMENT_RARITY.COMMON,
      points: ACHIEVEMENT_POINTS[ACHIEVEMENT_TYPE.LESSON_COMPLETION],
      created_at: new Date()
    };
    assert_valid_achievement(achievement);
    return deep_freeze_achievement(achievement);
  },

  /**
   * @param {number} days
   * @returns {AchievementProps}
   */
  create_daily_streak(days) {
    const rarities = [ACHIEVEMENT_RARITY.COMMON, ACHIEVEMENT_RARITY.RARE, ACHIEVEMENT_RARITY.EPIC];
    const rarity = rarities[Math.min(days, 3) - 1] || ACHIEVEMENT_RARITY.LEGENDARY;

    const achievement = {
      ...DEFAULT_ACHIEVEMENT,
      type: ACHIEVEMENT_TYPE.DAILY_STREAK,
      title: `${days} Day Streak!`,
      description: `Maintained a streak for ${days} days`,
      rarity,
      points: days * ACHIEVEMENT_POINTS[ACHIEVEMENT_TYPE.DAILY_STREAK],
      created_at: new Date()
    };
    assert_valid_achievement(achievement);
    return deep_freeze_achievement(achievement);
  },

  /**
   * @param {string} quiz_name
   * @returns {AchievementProps}
   */
  create_quiz_master(quiz_name) {
    const achievement = {
      ...DEFAULT_ACHIEVEMENT,
      type: ACHIEVEMENT_TYPE.QUIZ_MASTER,
      title: `Quiz Master: ${quiz_name}`,
      description: `Completed quiz ${quiz_name} successfully`,
      rarity: ACHIEVEMENT_RARITY.EPIC,
      points: ACHIEVEMENT_POINTS[ACHIEVEMENT_TYPE.QUIZ_MASTER],
      created_at: new Date()
    };
    assert_valid_achievement(achievement);
    return deep_freeze_achievement(achievement);
  },

  /**
   * @param {number} points
   * @returns {AchievementProps}
   */
  create_bonus_points(points) {
    const achievement = {
      ...DEFAULT_ACHIEVEMENT,
      type: ACHIEVEMENT_TYPE.BONUS_POINTS,
      title: `Bonus Points`,
      description: `Awarded ${points} bonus points`,
      points,
      created_at: new Date()
    };
    assert_valid_achievement(achievement);
    return deep_freeze_achievement(achievement);
  }
});

///////////////////////////////
// Achievement creation utility
///////////////////////////////

/**
 * Create an achievement with overrides
 * @param {Partial<AchievementProps>} overrides
 * @returns {AchievementProps}
 */
export function create_achievement(overrides = {}) {
  const achievement = {
    ...DEFAULT_ACHIEVEMENT,
    ...overrides,
    created_at: overrides.created_at || new Date(),
    toJSON() {
      return {
        ...this,
        created_at: this.created_at.toISOString(),
        unlocked_at: this.unlocked_at?.toISOString() || null
      };
    }
  };

  try {
    assert_valid_achievement(achievement);
  } catch (err) {
    if (typeof console !== 'undefined') console.warn('[Achievement] Invalid achievement:', achievement);
    deep_freeze_achievement(DEFAULT_ACHIEVEMENT);
    return DEFAULT_ACHIEVEMENT;
  }

  return deep_freeze_achievement(achievement);
}
