// shared/models/user_model.js

import { Result } from '../../core/result.js';
import { EmailVO, UsernameVO } from '../value-objects/index.js';

/**
 * @typedef {Object} UserProps
 * @property {string} id
 * @property {UsernameVO|string} username
 * @property {EmailVO|string} email
 * @property {string} [avatar]
 * @property {Object} [settings]
 */

/**
 * @typedef {'user.created'|'user.updated'|'user.settings_changed'} UserDomainEvent
 */

/**
 * کلاس User - مدیریت موجودیت کاربر
 */
export class User {
  // ====================== Private Fields ======================
  #id;
  #username;
  #email;
  #avatar;
  #settings;
  #validator;
  #metrics_collector;
  #event_bus;

  // ====================== Constructor ======================
  /**
   * @param {UserProps} props
   * @param {Object} deps
   * @param {Object} [deps.validator]
   * @param {Object} [deps.metrics_collector]
   * @param {Object} [deps.event_bus]
   */
  constructor(props, deps = {}) {
    if (!props?.id) throw new Error('User id is required');

    this.#id = props.id;
    this.#username = this.#create_username(props.username);
    this.#email = this.#create_email(props.email);
    this.#avatar = props.avatar || null;
    this.#settings = this.#deep_freeze({ ...(props.settings || {}) });

    this.#validator = deps?.validator || null;
    this.#metrics_collector = deps?.metrics_collector || null;
    this.#event_bus = deps?.event_bus || null;
  }

  // ====================== Public Getters ======================
  /** @readonly */
  get id() { return this.#id; }

  /** @readonly */
  get username() { return this.#username; }

  /** @readonly */
  get email() { return this.#email; }

  /** @readonly */
  get avatar() { return this.#avatar; }

  /** @readonly */
  get settings() {
    return this.#settings && Object.keys(this.#settings).length > 0
      ? JSON.parse(JSON.stringify(this.#settings))
      : {};
  }

  // ====================== Public Methods ======================
  /**
   * Factory method امن برای ایجاد کاربر
   * @param {UserProps} raw
   * @param {Object} deps
   * @returns {Result<User, Error>}
   */
  static create(raw, deps = {}) {
    try {
      if (!raw?.id) return Result.fail(new Error('User creation failed: id is required'));
      if (!raw?.email) return Result.fail(new Error('User creation failed: email is required'));
      const user = new User(raw, deps);
      return Result.ok(user);
    } catch (error) {
      error.message = `User creation failed: ${error.message}`;
      return Result.fail(error);
    }
  }

  /**
   * به‌روزرسانی پروفایل با بازگشت نمونه جدید
   * @param {Object} payload
   * @returns {Result<User, Error>}
   */
  update_profile(payload) {
    if (!payload || typeof payload !== 'object') {
      return Result.fail(new Error('Invalid payload'));
    }

    if (this.#validator) {
      const validation = this.#validator.validate_update_profile(payload);
      if (!validation.success) return Result.fail(validation.error);
    }

    try {
      const new_username = payload.username 
        ? this.#create_username(payload.username)
        : this.#username;
        
      const new_email = payload.email
        ? this.#create_email(payload.email)
        : this.#email;

      const updated_user = new User({
        id: this.#id,
        username: new_username,
        email: new_email,
        avatar: payload.avatar ?? this.#avatar,
        settings: this.#settings
      }, this.#get_dependencies());

      this.#dispatch_domain_event('user.updated', updated_user.to_json());
      this.#track_metric('user_profile_updated', { user_id: this.#id });

      return Result.ok(updated_user);
    } catch (error) {
      return Result.fail(error);
    }
  }

  /**
   * به‌روزرسانی تنظیمات با اعتبارسنجی و Immutability
   * @param {Object} new_settings
   * @returns {Result<User, Error>}
   */
  update_settings(new_settings) {
    if (!new_settings || typeof new_settings !== 'object') {
      return Result.fail(new Error('Invalid settings'));
    }

    if (this.#validator) {
      const validation = this.#validator.validate_settings(new_settings);
      if (!validation.success) return Result.fail(validation.error);
    }

    const merged_settings = this.#deep_merge(this.#settings, new_settings);
    const updated_user = new User({
      ...this.to_json(),
      settings: merged_settings
    }, this.#get_dependencies());

    this.#dispatch_domain_event('user.settings_changed', updated_user.to_json());
    return Result.ok(updated_user);
  }

  /**
   * تبدیل به JSON (Deep Clone)
   * @returns {Object}
   */
  to_json() {
    return {
      id: this.#id,
      username: this.#username.value,
      email: this.#email.value,
      avatar: this.#avatar,
      settings: JSON.parse(JSON.stringify(this.#settings))
    };
  }

  /**
   * بررسی اعتبار کاربر
   * @returns {boolean}
   */
  is_valid() {
    try {
      return !!(this.#id && this.#username?.value && this.#email?.value);
    } catch {
      return false;
    }
  }

  /**
   * مقایسه دو User بر اساس Value
   * @param {User} other
   * @returns {boolean}
   */
  equals(other) {
    if (!(other instanceof User)) return false;
    return this.#id === other.#id &&
           this.#username.value === other.#username.value &&
           this.#email.value === other.#email.value;
  }

  // ====================== Private Methods ======================
  #create_username(value) {
    return value instanceof UsernameVO ? value : new UsernameVO(value || '');
  }

  #create_email(value) {
    return value instanceof EmailVO ? value : new EmailVO(value);
  }

  #deep_freeze(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      if (typeof value === 'object' && value !== null) {
        this.#deep_freeze(value);
      }
    });
    return Object.freeze(obj);
  }

  #deep_merge(target, source) {
    const output = { ...target };
    Object.keys(source).forEach(key => {
      if (this.#is_object(target[key]) && this.#is_object(source[key])) {
        output[key] = this.#deep_merge(target[key], source[key]);
      } else {
        output[key] = source[key];
      }
    });
    return output;
  }

  #is_object(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  #get_dependencies() {
    return {
      validator: this.#validator,
      metrics_collector: this.#metrics_collector,
      event_bus: this.#event_bus
    };
  }

  #dispatch_domain_event(event_type, data) {
    if (!this.#event_bus) return;
    const event = {
      type: event_type,
      payload: data,
      metadata: {
        timestamp: Date.now(),
        user_id: this.#id,
        version: '1.0.0'
      }
    };
    this.#event_bus.emit(`user:${event_type}`, event);
  }

  #track_metric(metric_name, data) {
    if (!this.#metrics_collector) return;
    this.#metrics_collector.track(metric_name, data);
  }
    }
