// features/user/user_achievements.js
/**
 * @fileoverview مدیریت Achievement های یک کاربر و Factory استاندارد برای ایجاد achievementها
 * @module user_achievements
 */

import EventEmitter from 'events';
import { structuredClone } from '@ungap/structured-clone'; // Polyfill برای environments قدیمی

/**
 * @typedef {Object} UserAchievementProps
 * @property {string} type
 * @property {string} title
 * @property {string} description
 * @property {string} rarity
 * @property {number} points
 * @property {boolean} unlocked
 * @property {Date|null} unlocked_at
 * @property {Function} [toJSON] - برای ذخیره‌سازی در IndexedDB
 */

/**
 * کلاس مدیریت Achievement های کاربر
 * @extends EventEmitter
 */
export class UserAchievements extends EventEmitter {
  #user_id;
  #achievements;
  #factory;

  constructor(user_id, initial = [], dependencies = {}) {
    super();
    if (!user_id) throw new Error('User ID is required');
    this.#user_id = user_id;
    this.#achievements = Array.isArray(initial) ? structuredClone(initial) : [];
    this.#factory = dependencies.factory;
  }

  get_all() {
    return this.#achievements.map(a => structuredClone(a));
  }

  get_by_type(type) {
    return this.#achievements.filter(a => a.type === type).map(a => structuredClone(a));
  }

  has_achievement(type) {
    return this.#achievements.some(a => a.type === type);
  }

  add_factory_achievement(type, params = {}) {
    if (!this.#factory) {
      this.emit('achievement:error', { type, error: 'Factory not provided' });
      return null;
    }
    const achievement = this.#factory.create(type, params);
    return this.add_achievement(achievement) ? achievement : null;
  }

  add_achievement(achievement) {
    try {
      if (!achievement || !achievement.type) return false;
      if (this.has_achievement(achievement.type)) return false;

      const ach = structuredClone(achievement);
      if (!ach.unlocked_at) ach.unlocked_at = ach.unlocked ? new Date() : null;

      this.#achievements.push(ach);
      this.emit('achievement:added', { user_id: this.#user_id, achievement: ach });
      return true;
    } catch (error) {
      const logger = console ?? { warn: () => {} };
      logger.warn('[UserAchievements] add_achievement failed:', error);
      return false;
    }
  }

  unlock_achievement(type, unlocked_at = new Date()) {
    const achievement = this.#achievements.find(a => a.type === type);
    if (!achievement || achievement.unlocked) return false;

    const ach = structuredClone(achievement);
    ach.unlocked = true;
    ach.unlocked_at = unlocked_at;

    const index = this.#achievements.findIndex(a => a.type === type);
    this.#achievements[index] = ach;

    this.emit('achievement:unlocked', { user_id: this.#user_id, achievement: ach });
    return true;
  }

  add_achievements(achievements) {
    if (!Array.isArray(achievements)) return 0;
    let count = 0;
    for (const a of achievements) if (this.add_achievement(a)) count++;
    return count;
  }

  *[Symbol.iterator]() {
    for (const a of this.#achievements) yield structuredClone(a);
  }

  subscribe(callback) {
    const handler = () => callback(this.get_all());
    this.on('achievement:added', handler);
    this.on('achievement:unlocked', handler);
    return () => { this.off('achievement:added', handler); this.off('achievement:unlocked', handler); };
  }

  save_state() { return structuredClone(this.#achievements); }
  restore_state(state) { this.#achievements = structuredClone(state); this.emit('achievements:restored'); }

  toDB() {
    return {
      user_id: this.#user_id,
      achievements: this.#achievements.map(a => ({ ...a, unlocked_at: a.unlocked_at?.toISOString() || null }))
    };
  }

  static fromDB(data, factory) {
    const achievements = (data.achievements || []).map(a => ({
      ...a,
      unlocked_at: a.unlocked_at ? new Date(a.unlocked_at) : null
    }));
    return new UserAchievements(data.user_id, achievements, { factory });
  }

  static is_valid_achievement(achievement) {
    if (!achievement) return false;
    if (!achievement.type || typeof achievement.type !== 'string') return false;
    if (!achievement.title || typeof achievement.title !== 'string') return false;
    if (!achievement.description || typeof achievement.description !== 'string') return false;
    if (typeof achievement.points !== 'number' || achievement.points < 0) return false;
    if (typeof achievement.unlocked !== 'boolean') return false;
    if (achievement.unlocked_at && !(achievement.unlocked_at instanceof Date) && achievement.unlocked_at !== null) return false;
    return true;
  }
}

/**
 * AchievementFactory استاندارد پروژه
 */
export const AchievementFactory = {
  create(type, params = {}) {
    const points_map = {
      lesson_completion: 10,
      daily_streak: 5,
      quiz_master: 50,
      bonus_points: 5
    };

    switch(type) {
      case 'lesson_completion':
        return {
          type,
          title: params.title || 'Lesson Completed',
          description: params.description || 'User completed a lesson',
          rarity: params.rarity || 'common',
          points: points_map[type],
          unlocked: params.unlocked || false,
          unlocked_at: params.unlocked_at || null,
          toJSON() { return { ...this, unlocked_at: this.unlocked_at?.toISOString() || null }; }
        };
      case 'daily_streak':
        return {
          type,
          title: params.title || `${params.days || 1} Day Streak`,
          description: params.description || `User maintained a streak for ${params.days || 1} days`,
          rarity: params.rarity || 'rare',
          points: points_map[type] * (params.days || 1),
          unlocked: params.unlocked || false,
          unlocked_at: params.unlocked_at || null,
          toJSON() { return { ...this, unlocked_at: this.unlocked_at?.toISOString() || null }; }
        };
      case 'quiz_master':
        return {
          type,
          title: params.title || 'Quiz Master',
          description: params.description || 'User scored perfectly on a quiz',
          rarity: params.rarity || 'epic',
          points: points_map[type],
          unlocked: params.unlocked || false,
          unlocked_at: params.unlocked_at || null,
          toJSON() { return { ...this, unlocked_at: this.unlocked_at?.toISOString() || null }; }
        };
      case 'bonus_points':
        return {
          type,
          title: params.title || 'Bonus Points',
          description: params.description || 'User received bonus points',
          rarity: params.rarity || 'common',
          points: points_map[type],
          unlocked: params.unlocked || false,
          unlocked_at: params.unlocked_at || null,
          toJSON() { return { ...this, unlocked_at: this.unlocked_at?.toISOString() || null }; }
        };
      default:
        throw new Error(`Unknown achievement type: ${type}`);
    }
  }
};
