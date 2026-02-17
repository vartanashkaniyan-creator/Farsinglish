// ==================================================
// core/auth/session_manager.js
// Session Manager - Enterprise Grade - نسخه کامل ۷۵۰ خطی
// اصول: SOLID, KISS, DRY, YAGNI, Encapsulation, Security
// نسخه: 3.0.0 - نهایی و پیشرفته با تمام ویژگی‌های کاربردی
// ==================================================

import state_manager from '../state/state_manager.js';
import db from '../db/indexeddb_wrapper.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'https://jspm.dev/uuid';

/**
 * @typedef {Object} SessionConfig
 * @property {number} timeout_duration - مدت زمان عدم فعالیت (میلی‌ثانیه)
 * @property {number} absolute_timeout - حداکثر عمر نشست (میلی‌ثانیه)
 * @property {number} rotation_interval - زمان چرخش نشست (میلی‌ثانیه)
 * @property {number} max_concurrent_sessions - حداکثر نشست همزمان
 * @property {boolean} enable_device_fingerprint - فعال‌سازی اثر انگشت دستگاه
 * @property {boolean} enable_geo_tracking - فعال‌سازی موقعیت جغرافیایی
 * @property {boolean} enable_audit_log - فعال‌سازی لاگ حسابرسی
 * @property {boolean} enable_encryption - فعال‌سازی رمزنگاری نشست
 * @property {boolean} enable_cross_tab_sync - همگام‌سازی بین تب‌ها
 * @property {boolean} enable_2fa - فعال‌سازی احراز هویت دو عاملی
 * @property {boolean} enable_adaptive_auth - احراز تطبیقی بر اساس ریسک
 * @property {boolean} remember_me_allowed - اجازه مرا به خاطر بسپار
 * @property {number} max_cache_size - حداکثر اندازه کش نشست
 * @property {boolean} enable_analytics - جمع‌آوری آمار نشست
 * @property {boolean} enable_auto_backup - پشتیبان‌گیری خودکار
 * @property {boolean} enable_anomaly_detection - کشف ناهنجاری
 */

/**
 * @typedef {Object} SessionInfo
 * @property {string} session_id
 * @property {string} user_id
 * @property {Object} user_data
 * @property {number} created_at
 * @property {number} expires_at
 * @property {number} last_activity
 * @property {string} device_fingerprint
 * @property {Object} geo_info
 * @property {string} ip_address
 * @property {string} user_agent
 * @property {boolean} is_valid
 * @property {number} rotation_count
 * @property {boolean} remember_me
 * @property {boolean} two_factor_verified
 * @property {string} risk_level
 * @property {Object} encryption_metadata
 */

class SessionManager {
    /** @type {SessionManager} */
    static #instance = null;

    /** @type {SessionConfig} */
    #config = {
        timeout_duration: 30 * 60 * 1000,        // 30 دقیقه
        absolute_timeout: 12 * 60 * 60 * 1000,   // 12 ساعت
        rotation_interval: 60 * 60 * 1000,       // 1 ساعت
        max_concurrent_sessions: 3,
        enable_device_fingerprint: true,
        enable_geo_tracking: false,
        enable_audit_log: true,
        enable_encryption: true,
        enable_cross_tab_sync: true,
        enable_2fa: false,
        enable_adaptive_auth: true,
        remember_me_allowed: true,
        max_cache_size: 50,
        enable_analytics: true,
        enable_auto_backup: true,
        enable_anomaly_detection: true
    };

    /** @type {string|null} */
    #current_session_id = null;

    /** @type {SessionInfo|null} */
    #session_info = null;

    /** @type {number} */
    #rotation_count = 0;

    /** @type {Map<string, number>} */
    #failed_attempts = new Map();

    /** @type {number} */
    #last_cleanup = Date.now();

    /** @type {Map<string, Object>} */
    #session_cache = new Map();

    /** @type {Map<string, string>} */
    #two_factor_sessions = new Map();

    /** @type {BroadcastChannel|null} */
    #broadcast_channel = null;

    /** @type {CryptoKey|null} */
    #encryption_key = null;

    /** @type {Map<string, Object>} */
    #role_configs = new Map();

    /** @type {Array} */
    #automated_actions = [
        {
            trigger: 'multiple_failed_logins',
            action: 'temporary_lock',
            duration: 15 * 60 * 1000
        },
        {
            trigger: 'suspicious_location',
            action: 'require_2fa',
            duration: 24 * 60 * 60 * 1000
        },
        {
            trigger: 'new_device',
            action: 'notify_user',
            duration: 0
        }
    ];

    /** @type {Object} */
    #analytics_data = {
        total_sessions: 0,
        active_sessions: 0,
        average_duration: 0,
        rotation_count: 0,
        expiry_count: 0,
        anomaly_count: 0,
        hourly_distribution: new Array(24).fill(0)
    };

    /**
     * سازنده خصوصی با تزریق وابستگی
     * @param {Object} deps - وابستگی‌های تزریق شده
     * @param {Object} deps.state_manager
     * @param {Object} deps.db
     * @param {Object} deps.logger
     * @param {Partial<SessionConfig>} config - تنظیمات اختیاری
     */
    constructor(deps, config = {}) {
        if (SessionManager.#instance) {
            return SessionManager.#instance;
        }

        this.state_manager = deps.state_manager;
        this.db = deps.db;
        this.logger = deps.logger;
        
        this.#config = { ...this.#config, ...config };

        SessionManager.#instance = this;
        
        this.#initialize();
        
        this.logger.info('SessionManager initialized with enterprise config', 'session');
    }

    /**
     * دریافت نمونه Singleton
     * @param {Object} deps
     * @param {Partial<SessionConfig>} config
     * @returns {SessionManager}
     */
    static get_instance(deps, config = {}) {
        if (!SessionManager.#instance) {
            SessionManager.#instance = new SessionManager(deps, config);
        }
        return SessionManager.#instance;
    }

    /**
     * راه‌اندازی اولیه
     */
    async #initialize() {
        try {
            if (this.#config.enable_encryption) {
                await this.#init_encryption();
            }
            
            if (this.#config.enable_cross_tab_sync) {
                this.#init_cross_tab_sync();
            }
            
            await this.#restore_session();
            await this.#cleanup_expired_sessions();
            
            if (this.#config.enable_auto_backup) {
                this.#start_auto_backup();
            }
            
            this.#start_periodic_cleanup();
            this.#setup_activity_listener();
            
            if (this.#config.enable_analytics) {
                this.#start_analytics_collection();
            }
            
            this.logger.info('SessionManager fully initialized', 'session');
        } catch (error) {
            this.logger.error(`Initialization failed: ${error.message}`, 'session');
        }
    }

    /**
     * راه‌اندازی رمزنگاری
     */
    async #init_encryption() {
        try {
            const key = await crypto.subtle.generateKey(
                {
                    name: 'AES-GCM',
                    length: 256
                },
                true,
                ['encrypt', 'decrypt']
            );
            this.#encryption_key = key;
        } catch (error) {
            this.logger.error(`Encryption init failed: ${error.message}`, 'session');
            this.#config.enable_encryption = false;
        }
    }

    /**
     * رمزنگاری داده
     * @param {Object} data
     * @returns {Promise<Object>}
     */
    async #encrypt_data(data) {
        if (!this.#config.enable_encryption || !this.#encryption_key) {
            return data;
        }

        try {
            const encoder = new TextEncoder();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            
            const encrypted = await crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv
                },
                this.#encryption_key,
                encoder.encode(JSON.stringify(data))
            );

            return {
                encrypted: true,
                iv: Array.from(iv),
                data: Array.from(new Uint8Array(encrypted)),
                timestamp: Date.now()
            };
        } catch (error) {
            this.logger.error(`Encryption failed: ${error.message}`, 'session');
            return data;
        }
    }

    /**
     * رمزگشایی داده
     * @param {Object} encrypted_data
     * @returns {Promise<Object>}
     */
    async #decrypt_data(encrypted_data) {
        if (!encrypted_data.encrypted || !this.#encryption_key) {
            return encrypted_data;
        }

        try {
            const iv = new Uint8Array(encrypted_data.iv);
            const data = new Uint8Array(encrypted_data.data);
            
            const decrypted = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv
                },
                this.#encryption_key,
                data
            );

            const decoder = new TextDecoder();
            return JSON.parse(decoder.decode(decrypted));
        } catch (error) {
            this.logger.error(`Decryption failed: ${error.message}`, 'session');
            return null;
        }
    }

    /**
     * راه‌اندازی همگام‌سازی بین تب‌ها
     */
    #init_cross_tab_sync() {
        try {
            this.#broadcast_channel = new BroadcastChannel('session_sync');
            
            this.#broadcast_channel.onmessage = (event) => {
                const { type, session_id, data } = event.data;
                
                switch (type) {
                    case 'SESSION_CREATED':
                        this.#handle_remote_session_created(session_id, data);
                        break;
                    case 'SESSION_ENDED':
                        this.#handle_remote_session_ended(session_id);
                        break;
                    case 'SESSION_REFRESHED':
                        this.#handle_remote_session_refreshed(session_id);
                        break;
                    case 'LOGOUT_ALL':
                        this.#handle_remote_logout_all();
                        break;
                }
            };
        } catch (error) {
            this.logger.error(`Cross-tab sync init failed: ${error.message}`, 'session');
        }
    }

    /**
     * ایجاد نشست جدید
     * @param {string} user_id
     * @param {Object} user_data
     * @param {Object} options
     * @returns {Promise<SessionInfo>}
     */
    async create_session(user_id, user_data, options = {}) {
        try {
            this.#validate_input({ user_id, user_data });

            // ارزیابی ریسک لاگین
            if (this.#config.enable_adaptive_auth) {
                const risk_assessment = await this.#assess_login_risk({
                    user_id,
                    device_info: await this.#capture_device_info()
                });
                
                if (risk_assessment.requires_2fa && this.#config.enable_2fa) {
                    return this.#initiate_2fa_session(user_id, user_data);
                }
            }

            // بررسی محدودیت نشست همزمان
            await this.#enforce_concurrent_session_limit(user_id);

            await this.end_session();

            this.#current_session_id = this.#generate_session_id();
            
            const device_info = await this.#capture_device_info();
            const geo_info = this.#config.enable_geo_tracking ? 
                await this.#capture_geo_location() : null;

            // کشف ناهنجاری
            if (this.#config.enable_anomaly_detection) {
                await this.#detect_anomalies({ user_id, device_info });
            }

            this.#session_info = {
                session_id: this.#current_session_id,
                user_id,
                user_data: { ...user_data },
                created_at: Date.now(),
                expires_at: this.#calculate_expiry(options.remember_me),
                last_activity: Date.now(),
                device_fingerprint: device_info.fingerprint,
                geo_info,
                ip_address: device_info.ip_address,
                user_agent: device_info.user_agent,
                is_valid: true,
                rotation_count: 0,
                remember_me: options.remember_me || false,
                two_factor_verified: !this.#config.enable_2fa,
                risk_level: 'low',
                encryption_metadata: {}
            };

            // رمزنگاری داده‌های حساس
            if (this.#config.enable_encryption) {
                this.#session_info.user_data = await this.#encrypt_data(user_data);
            }

            await this.#persist_session();
            this.#update_auth_state(true);

            // کش کردن نشست
            this.#cache_session(this.#current_session_id, this.#session_info);

            // اطلاع به تب‌های دیگر
            if (this.#config.enable_cross_tab_sync) {
                this.#broadcast_channel?.postMessage({
                    type: 'SESSION_CREATED',
                    session_id: this.#current_session_id,
                    data: { user_id, timestamp: Date.now() }
                });
            }

            await this.#audit_log('session_created', {
                user_id,
                session_id: this.#current_session_id,
                risk_level: this.#session_info.risk_level
            });

            // به‌روزرسانی آمار
            if (this.#config.enable_analytics) {
                this.#update_analytics('session_created');
            }

            this.logger.info(`Session created for user: ${user_id}`, 'session');
            
            return this.get_session_info();
        } catch (error) {
            this.logger.error(`Create session failed: ${error.message}`, 'session');
            throw new Error(`SESSION_CREATION_FAILED: ${error.message}`);
        }
    }

    /**
     * احراز هویت دو عاملی
     * @param {string} user_id
     * @param {Object} user_data
     * @returns {Promise<Object>}
     */
    async #initiate_2fa_session(user_id, user_data) {
        const temp_session_id = this.#generate_session_id();
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        this.#two_factor_sessions.set(temp_session_id, {
            user_id,
            user_data,
            code,
            expires: Date.now() + 10 * 60 * 1000, // 10 دقیقه
            attempts: 0
        });

        // ارسال کد از طریق ایمیل/SMS
        await this.#send_2fa_code(user_id, code);

        return {
            requires_2fa: true,
            temp_session_id,
            expires_in: 600,
            message: 'Verification code sent'
        };
    }

    /**
     * تأیید کد دو عاملی
     * @param {string} temp_session_id
     * @param {string} code
     * @returns {Promise<SessionInfo>}
     */
    async verify_2fa_code(temp_session_id, code) {
        const temp_session = this.#two_factor_sessions.get(temp_session_id);
        
        if (!temp_session) {
            throw new Error('INVALID_2FA_SESSION');
        }

        if (Date.now() > temp_session.expires) {
            this.#two_factor_sessions.delete(temp_session_id);
            throw new Error('2FA_CODE_EXPIRED');
        }

        temp_session.attempts++;
        if (temp_session.attempts > 3) {
            this.#two_factor_sessions.delete(temp_session_id);
            throw new Error('TOO_MANY_ATTEMPTS');
        }

        if (temp_session.code !== code) {
            throw new Error('INVALID_2FA_CODE');
        }

        // ایجاد نشست اصلی
        const session = await this.create_session(
            temp_session.user_id,
            temp_session.user_data,
            { two_factor_verified: true }
        );

        this.#two_factor_sessions.delete(temp_session_id);
        
        return session;
    }

    /**
     * پایان نشست جاری
     * @param {string} reason
     * @returns {Promise<boolean>}
     */
    async end_session(reason = 'user_logout') {
        if (!this.#current_session_id) {
            return false;
        }

        try {
            const session_id = this.#current_session_id;
            const user_id = this.#session_info?.user_id;
            const duration = Date.now() - (this.#session_info?.created_at || 0);

            await this.#remove_session();
            
            // حذف از کش
            this.#session_cache.delete(session_id);

            if (this.#config.enable_cross_tab_sync) {
                this.#broadcast_channel?.postMessage({
                    type: 'SESSION_ENDED',
                    session_id
                });
            }

            await this.#audit_log('session_ended', {
                session_id,
                user_id,
                reason,
                duration
            });

            if (this.#config.enable_analytics) {
                this.#update_analytics('session_ended', { duration });
            }

            this.#current_session_id = null;
            this.#session_info = null;
            this.#rotation_count = 0;

            this.#update_auth_state(false);

            this.logger.info(`Session ended: ${reason}`, 'session');
            return true;
        } catch (error) {
            this.logger.error(`End session failed: ${error.message}`, 'session');
            throw error;
        }
    }

    /**
     * پایان همه نشست‌های یک کاربر
     * @param {string} user_id
     * @returns {Promise<number>}
     */
    async end_all_user_sessions(user_id) {
        try {
            const sessions = await this.db.get_all('sessions');
            const user_sessions = sessions.filter(s => s.data.user_id === user_id);
            
            for (const session of user_sessions) {
                await this.db.delete('sessions', session.session_id);
                this.#session_cache.delete(session.session_id);
            }

            if (this.#session_info?.user_id === user_id) {
                await this.end_session('terminated_by_admin');
            }

            if (this.#config.enable_cross_tab_sync) {
                this.#broadcast_channel?.postMessage({
                    type: 'LOGOUT_ALL',
                    user_id
                });
            }

            await this.#audit_log('all_sessions_ended', { user_id });
            
            return user_sessions.length;
        } catch (error) {
            this.logger.error(`End all sessions failed: ${error.message}`, 'session');
            throw error;
        }
    }

    /**
     * بررسی اعتبار نشست جاری
     * @returns {Promise<boolean>}
     */
    async is_valid() {
        if (!this.#current_session_id || !this.#session_info) {
            return false;
        }

        const now = Date.now();

        if (now > this.#session_info.expires_at) {
            this.logger.warn('Session expired (absolute timeout)', 'session');
            await this.end_session('absolute_timeout');
            return false;
        }

        if (now - this.#session_info.last_activity > this.#config.timeout_duration) {
            this.logger.warn('Session expired (inactivity)', 'session');
            await this.end_session('inactivity_timeout');
            return false;
        }

        if (await this.#should_rotate_session()) {
            await this.#rotate_session();
        }

        // کشف ناهنجاری مداوم
        if (this.#config.enable_anomaly_detection) {
            const current_device = await this.#capture_device_info();
            if (current_device.fingerprint !== this.#session_info.device_fingerprint) {
                this.logger.warn('Device fingerprint changed during session', 'session');
                await this.#audit_log('device_changed_during_session', {
                    session_id: this.#current_session_id,
                    old_fingerprint: this.#session_info.device_fingerprint,
                    new_fingerprint: current_device.fingerprint
                });
                
                if (this.#config.enable_adaptive_auth) {
                    await this.#require_2fa_for_suspicious_activity();
                }
            }
        }

        return true;
    }

    /**
     * تمدید نشست
     * @returns {Promise<void>}
     */
    async refresh() {
        if (!this.#current_session_id || !this.#session_info) {
            return;
        }

        this.#session_info.last_activity = Date.now();
        
        if (this.#session_info.remember_me) {
            this.#session_info.expires_at = this.#calculate_expiry(true);
        }

        await this.#persist_session();
        
        // به‌روزرسانی کش
        this.#cache_session(this.#current_session_id, this.#session_info);

        if (this.#config.enable_cross_tab_sync) {
            this.#broadcast_channel?.postMessage({
                type: 'SESSION_REFRESHED',
                session_id: this.#current_session_id
            });
        }

        this.logger.debug('Session refreshed', 'session');
    }

    /**
     * دریافت اطلاعات نشست جاری
     * @returns {SessionInfo|null}
     */
    get_session_info() {
        if (!this.#session_info) {
            return null;
        }

        return JSON.parse(JSON.stringify({
            ...this.#session_info,
            duration: Date.now() - this.#session_info.created_at,
            is_active: true
        }));
    }

    /**
     * دریافت شناسه کاربر جاری
     * @returns {string|null}
     */
    get_user_id() {
        return this.#session_info?.user_id || null;
    }

    /**
     * تنظیم پیکربندی بر اساس نقش
     * @param {string} role
     * @param {Partial<SessionConfig>} config
     */
    set_role_config(role, config) {
        this.#role_configs.set(role, config);
        this.logger.info(`Role config set for: ${role}`, 'session');
    }

    /**
     * دریافت پیکربندی بر اساس نقش کاربر
     * @param {string} role
     * @returns {SessionConfig}
     */
    #get_config_for_role(role) {
        const role_config = this.#role_configs.get(role);
        return role_config ? { ...this.#config, ...role_config } : this.#config;
    }

    /**
     * ارزیابی ریسک لاگین
     * @param {Object} context
     * @returns {Promise<Object>}
     */
    async #assess_login_risk(context) {
        let risk_score = 0;
        const reasons = [];

        // بررسی دستگاه جدید
        const user_sessions = await this.db.get_all('sessions');
        const user_previous_sessions = user_sessions.filter(
            s => s.data.user_id === context.user_id
        );

        if (user_previous_sessions.length > 0) {
            const known_devices = new Set(
                user_previous_sessions.map(s => s.data.device_fingerprint)
            );
            
            if (!known_devices.has(context.device_info.fingerprint)) {
                risk_score += 30;
                reasons.push('new_device');
            }
        }

        // بررسی موقعیت جغرافیایی جدید
        if (context.device_info.ip_address && user_previous_sessions.length > 0) {
            const known_ips = new Set(
                user_previous_sessions.map(s => s.data.ip_address)
            );
            
            if (!known_ips.has(context.device_info.ip_address)) {
                risk_score += 20;
                reasons.push('new_location');
            }
        }

        // بررسی ساعت غیرعادی
        const hour = new Date().getHours();
        const user_activity_hours = user_previous_sessions.map(
            s => new Date(s.data.last_activity).getHours()
        );
        
        if (user_activity_hours.length > 0) {
            const common_hours = user_activity_hours.filter(h => Math.abs(h - hour) <= 3);
            if (common_hours.length < user_activity_hours.length * 0.3) {
                risk_score += 15;
                reasons.push('unusual_hour');
            }
        }

        // بررسی تلاش‌های ناموفق قبلی
        const failed_attempts = this.#failed_attempts.get(context.user_id) || 0;
        if (failed_attempts > 3) {
            risk_score += 25;
            reasons.push('multiple_failures');
        }

        const requires_2fa = risk_score > 50;
        const risk_level = risk_score > 70 ? 'high' : (risk_score > 30 ? 'medium' : 'low');

        // اجرای پاسخ خودکار
        if (this.#config.enable_adaptive_auth) {
            for (const action of this.#automated_actions) {
                if (reasons.includes(action.trigger)) {
                    await this.#execute_automated_response(action, context);
                }
            }
        }

        return {
            score: risk_score,
            level: risk_level,
            requires_2fa,
            reasons
        };
    }

    /**
     * اجرای پاسخ خودکار به رویداد امنیتی
     * @param {Object} action
     * @param {Object} context
     */
    async #execute_automated_response(action, context) {
        this.logger.warn(`Executing automated response: ${action.action}`, 'security');
        
        await this.#audit_log('automated_response', {
            trigger: action.trigger,
            action: action.action,
            context
        });

        switch (action.action) {
            case 'temporary_lock':
                this.#failed_attempts.set(context.user_id, 5);
                setTimeout(() => {
                    this.#failed_attempts.delete(context.user_id);
                }, action.duration);
                break;
                
            case 'require_2fa':
                // ذخیره نیاز به 2FA برای نشست‌های بعدی
                localStorage.setItem(`require_2fa_${context.user_id}`, Date.now() + action.duration);
                break;
                
            case 'notify_user':
                // ارسال نوتیفیکیشن به کاربر
                this.#send_security_notification(context.user_id, context);
                break;
        }
    }

    /**
     * کشف ناهنجاری
     * @param {Object} context
     */
    async #detect_anomalies(context) {
        try {
            const user_sessions = await this.db.get_all('sessions');
            const user_previous_sessions = user_sessions.filter(
                s => s.data.user_id === context.user_id
            );

            if (user_previous_sessions.length < 5) {
                return; // داده کافی برای تحلیل وجود ندارد
            }

            const anomalies = [];

            // تحلیل الگوی زمانی
            const session_times = user_previous_sessions.map(s => s.data.created_at);
            const avg_gap = this.#calculate_average_gap(session_times);
            
            if (avg_gap < 5 * 60 * 1000) { // کمتر از 5 دقیقه
                anomalies.push('unusual_frequency');
            }

            // تحلیل موقعیت جغرافیایی
            const locations = user_previous_sessions
                .map(s => s.data.geo_info)
                .filter(g => g && g.latitude && g.longitude);
            
            if (locations.length > 2) {
                const avg_lat = locations.reduce((sum, l) => sum + l.latitude, 0) / locations.length;
                const avg_lng = locations.reduce((sum, l) => sum + l.longitude, 0) / locations.length;
                
                const current_location = context.device_info.geo_info;
                if (current_location) {
                    const distance = this.#calculate_distance(
                        avg_lat, avg_lng,
                        current_location.latitude, current_location.longitude
                    );
                    
                    if (distance > 1000) { // بیش از 1000 کیلومتر
                        anomalies.push('unusual_location');
                    }
                }
            }

            if (anomalies.length > 0) {
                this.#analytics_data.anomaly_count++;
                
                await this.#audit_log('anomaly_detected', {
                    user_id: context.user_id,
                    anomalies,
                    context
                });

                if (this.#config.enable_adaptive_auth) {
                    await this.#execute_automated_response(
                        { trigger: 'anomaly_detected', action: 'require_2fa' },
                        context
                    );
                }
            }
        } catch (error) {
            this.logger.error(`Anomaly detection failed: ${error.message}`, 'session');
        }
    }

    /**
     * محاسبه میانگین فاصله بین نشست‌ها
     * @param {Array<number>} times
     * @returns {number}
     */
    #calculate_average_gap(times) {
        if (times.length < 2) return Infinity;
        
        const sorted = [...times].sort((a, b) => a - b);
        let total_gap = 0;
        
        for (let i = 1; i < sorted.length; i++) {
            total_gap += sorted[i] - sorted[i-1];
        }
        
        return total_gap / (sorted.length - 1);
    }

    /**
     * محاسبه فاصله بین دو نقطه جغرافیایی
     * @param {number} lat1
     * @param {number} lon1
     * @param {number} lat2
     * @param {number} lon2
     * @returns {number}
     */
    #calculate_distance(lat1, lon1, lat2, lon2) {
        const R = 6371; // شعاع زمین
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    /**
     * تولید شناسه یکتا
     * @returns {string}
     */
    #generate_session_id() {
        return `sess_${uuidv4()}_${Date.now()}`;
    }

    /**
     * محاسبه زمان انقضا
     * @param {boolean} remember_me
     * @returns {number}
     */
    #calculate_expiry(remember_me) {
        if (remember_me && this.#config.remember_me_allowed) {
            return Date.now() + (30 * 24 * 60 * 60 * 1000);
        }
        return Date.now() + this.#config.timeout_duration;
    }

    /**
     * دریافت اطلاعات دستگاه
     * @returns {Promise<Object>}
     */
    async #capture_device_info() {
        const fingerprint = this.#config.enable_device_fingerprint ?
            await this.#generate_device_fingerprint() :
            'disabled';

        return {
            fingerprint,
            user_agent: navigator.userAgent,
            ip_address: await this.#get_client_ip(),
            platform: navigator.platform,
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            screen_resolution: `${screen.width}x${screen.height}`,
            color_depth: screen.colorDepth,
            hardware_concurrency: navigator.hardwareConcurrency,
            device_memory: navigator.deviceMemory,
            touch_support: 'ontouchstart' in window,
            cookies_enabled: navigator.cookieEnabled,
            do_not_track: navigator.doNotTrack
        };
    }

    /**
     * دریافت IP کلاینت
     * @returns {Promise<string>}
     */
    async #get_client_ip() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch {
            return 'unknown';
        }
    }

    /**
     * تولید اثر انگشت دستگاه
     * @returns {Promise<string>}
     */
    async #generate_device_fingerprint() {
        const components = [
            navigator.userAgent,
            navigator.language,
            navigator.platform,
            screen.colorDepth,
            screen.width,
            screen.height,
            new Date().getTimezoneOffset(),
            navigator.hardwareConcurrency,
            navigator.deviceMemory,
            navigator.cookieEnabled
        ];

        const fingerprint_string = components.join('###');
        const encoder = new TextEncoder();
        const data = encoder.encode(fingerprint_string);
        const hash = await crypto.subtle.digest('SHA-256', data);
        
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * دریافت موقعیت جغرافیایی
     * @returns {Promise<Object|null>}
     */
    async #capture_geo_location() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(null);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: position.timestamp
                    });
                },
                () => resolve(null),
                { timeout: 5000, maximumAge: 60000 }
            );
        });
    }

    /**
     * ارسال کد 2FA
     * @param {string} user_id
     * @param {string} code
     */
    async #send_2fa_code(user_id, code) {
        this.logger.info(`2FA code sent to user: ${user_id}`, 'security');
        // در پروژه واقعی، اینجا ایمیل یا SMS ارسال می‌شود
    }

    /**
     * ارسال نوتیفیکیشن امنیتی
     * @param {string} user_id
     * @param {Object} context
     */
    async #send_security_notification(user_id, context) {
        this.logger.warn(`Security notification sent to user: ${user_id}`, 'security');
        // در پروژه واقعی، نوتیفیکیشن ارسال می‌شود
    }

    /**
     * درخواست 2FA برای فعالیت مشکوک
     */
    async #require_2fa_for_suspicious_activity() {
        if (!this.#config.enable_2fa) return;
        
        this.logger.warn('Requiring 2FA for suspicious activity', 'security');
        await this.#audit_log('2fa_required', {
            session_id: this.#current_session_id,
            reason: 'suspicious_activity'
        });
        
        // ذخیره وضعیت برای نشست جاری
        sessionStorage.setItem('require_2fa', 'true');
    }

    /**
     * بررسی نیاز به چرخش نشست
     * @returns {Promise<boolean>}
     */
    async #should_rotate_session() {
        if (!this.#session_info) {
            return false;
        }

        const session_age = Date.now() - this.#session_info.created_at;
        const time_since_last_rotation = Date.now() - (
            this.#session_info.last_rotation || this.#session_info.created_at
        );

        return session_age > this.#config.rotation_interval &&
               time_since_last_rotation > this.#config.rotation_interval;
    }

    /**
     * چرخش نشست
     * @returns {Promise<void>}
     */
    async #rotate_session() {
        if (!this.#session_info) {
            return;
        }

        const old_session_id = this.#current_session_id;
        
        this.#current_session_id = this.#generate_session_id();
        this.#rotation_count++;
        this.#session_info.session_id = this.#current_session_id;
        this.#session_info.last_rotation = Date.now();
        this.#session_info.rotation_count = this.#rotation_count;

        await this.db.delete('sessions', old_session_id);
        this.#session_cache.delete(old_session_id);
        
        await this.#persist_session();
        this.#cache_session(this.#current_session_id, this.#session_info);

        await this.#audit_log('session_rotated', {
            old_session_id,
            new_session_id: this.#current_session_id
        });

        this.logger.info('Session rotated', 'session');
    }

    /**
     * اعمال محدودیت نشست همزمان
     * @param {string} user_id
     */
    async #enforce_concurrent_session_limit(user_id) {
        const sessions = await this.db.get_all('sessions');
        const user_sessions = sessions.filter(s => s.data.user_id === user_id);

        if (user_sessions.length >= this.#config.max_concurrent_sessions) {
            user_sessions.sort((a, b) => a.data.created_at - b.data.created_at);
            const oldest_session = user_sessions[0];
            
            await this.db.delete('sessions', oldest_session.session_id);
            this.#session_cache.delete(oldest_session.session_id);
            
            this.logger.warn(`Removed oldest session for user: ${user_id}`, 'session');
        }
    }

    /**
     * ذخیره در کش
     * @param {string} session_id
     * @param {Object} data
     */
    #cache_session(session_id, data) {
        if (this.#session_cache.size >= this.#config.max_cache_size) {
            const oldest_key = this.#session_cache.keys().next().value;
            this.#session_cache.delete(oldest_key);
        }
        this.#session_cache.set(session_id, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * ذخیره نشست در IndexedDB
     * @returns {Promise<void>}
     */
    async #persist_session() {
        try {
            const session_data = { ...this.#session_info };
            
            if (this.#config.enable_encryption && this.#encryption_key) {
                session_data.user_data = await this.#encrypt_data(session_data.user_data);
            }

            await this.db.put('sessions', {
                session_id: this.#current_session_id,
                data: session_data,
                last_activity: Date.now()
            });
        } catch (error) {
            this.logger.error(`Persist session failed: ${error.message}`, 'session');
            throw error;
        }
    }

    /**
     * حذف نشست از IndexedDB
     * @returns {Promise<void>}
     */
    async #remove_session() {
        if (!this.#current_session_id) {
            return;
        }

        try {
            await this.db.delete('sessions', this.#current_session_id);
        } catch (error) {
            this.logger.error(`Remove session failed: ${error.message}`, 'session');
        }
    }

    /**
     * بازیابی نشست قبلی
     * @returns {Promise<void>}
     */
    async #restore_session() {
        try {
            const sessions = await this.db.get_all('sessions');
            if (!sessions || sessions.length === 0) {
                return;
            }

            sessions.sort((a, b) => b.last_activity - a.last_activity);
            
            for (const session of sessions) {
                this.#current_session_id = session.session_id;
                this.#session_info = session.data;
                
                if (this.#config.enable_encryption && this.#session_info.user_data?.encrypted) {
                    this.#session_info.user_data = await this.#decrypt_data(
                        this.#session_info.user_data
                    );
                }

                if (await this.is_valid()) {
                    this.logger.info('Previous session restored', 'session');
                    this.#update_auth_state(true);
                    this.#cache_session(this.#current_session_id, this.#session_info);
                    
                    if (this.#config.enable_device_fingerprint) {
                        await this.#verify_device_match();
                    }
                    
                    return;
                }
            }

            await this.db.clear('sessions');
            
        } catch (error) {
            this.logger.error(`Restore session failed: ${error.message}`, 'session');
        }
    }

    /**
     * تطابق دستگاه
     */
    async #verify_device_match() {
        if (!this.#session_info) {
            return;
        }

        const current_fingerprint = await this.#generate_device_fingerprint();
        
        if (current_fingerprint !== this.#session_info.device_fingerprint) {
            this.logger.warn('Device fingerprint mismatch', 'session');
            await this.#audit_log('device_mismatch', {
                session_id: this.#current_session_id,
                expected: this.#session_info.device_fingerprint,
                received: current_fingerprint
            });
            
            if (this.#config.enable_adaptive_auth) {
                await this.#require_2fa_for_suspicious_activity();
            }
        }
    }

    /**
     * پاکسازی نشست‌های منقضی
     */
    async #cleanup_expired_sessions() {
        try {
            const sessions = await this.db.get_all('sessions');
            const now = Date.now();
            let cleaned_count = 0;

            for (const session of sessions) {
                if (session.data.expires_at < now) {
                    await this.db.delete('sessions', session.session_id);
                    this.#session_cache.delete(session.session_id);
                    cleaned_count++;
                    
                    if (this.#config.enable_analytics) {
                        this.#analytics_data.expiry_count++;
                    }
                }
            }

            if (cleaned_count > 0) {
                this.logger.info(`Cleaned up ${cleaned_count} expired sessions`, 'session');
            }
        } catch (error) {
            this.logger.error(`Cleanup failed: ${error.message}`, 'session');
        }
    }

    /**
     * شروع پشتیبان‌گیری خودکار
     */
    #start_auto_backup() {
        setInterval(async () => {
            try {
                const sessions = await this.db.get_all('sessions');
                const backup = {
                    timestamp: Date.now(),
                    version: '1.0',
                    sessions: sessions.map(s => ({
                        session_id: s.session_id,
                        user_id: s.data.user_id,
                        created_at: s.data.created_at,
                        expires_at: s.data.expires_at,
                        device_fingerprint: s.data.device_fingerprint
                    }))
                };

                localStorage.setItem('session_backup', JSON.stringify(backup));
                this.logger.info('Auto backup completed', 'session');
            } catch (error) {
                this.logger.error(`Auto backup failed: ${error.message}`, 'session');
            }
        }, 24 * 60 * 60 * 1000); // هر 24 ساعت
    }

    /**
     * شروع پاکسازی دوره‌ای
     */
    #start_periodic_cleanup() {
        setInterval(() => {
            this.#cleanup_expired_sessions();
        }, 60 * 60 * 1000);
    }

    /**
     * راه‌اندازی شنونده فعالیت
     */
    #setup_activity_listener() {
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        
        const activity_handler = () => {
            if (this.#current_session_id) {
                this.refresh().catch(error => {
                    this.logger.error(`Activity refresh failed: ${error.message}`, 'session');
                });
            }
        };

        events.forEach(event => {
            window.addEventListener(event, activity_handler);
        });
    }

    /**
     * شروع جمع‌آوری آمار
     */
    #start_analytics_collection() {
        setInterval(() => {
            this.#save_analytics_snapshot();
        }, 60 * 60 * 1000); // هر ساعت
    }

    /**
     * به‌روزرسانی آمار
     * @param {string} event
     * @param {Object} data
     */
    #update_analytics(event, data = {}) {
        switch (event) {
            case 'session_created':
                this.#analytics_data.total_sessions++;
                this.#analytics_data.active_sessions++;
                this.#analytics_data.hourly_distribution[new Date().getHours()]++;
                break;
                
            case 'session_ended':
                this.#analytics_data.active_sessions--;
                if (data.duration) {
                    const total = this.#analytics_data.average_duration * 
                                 (this.#analytics_data.total_sessions - 1) + data.duration;
                    this.#analytics_data.average_duration = total / this.#analytics_data.total_sessions;
                }
                break;
        }
    }

    /**
     * ذخیره snapshot آمار
     */
    async #save_analytics_snapshot() {
        try {
            const snapshot = {
                timestamp: Date.now(),
                ...this.#analytics_data,
                memory_usage: performance?.memory?.usedJSHeapSize
            };

            await this.db.put('analytics', snapshot);
        } catch (error) {
            this.logger.error(`Analytics snapshot failed: ${error.message}`, 'session');
        }
    }

    /**
     * به‌روزرسانی state احراز هویت
     * @param {boolean} is_authenticated
     */
    #update_auth_state(is_authenticated) {
        this.state_manager.set_state({
            auth: {
                is_authenticated,
                user: is_authenticated ? this.#session_info?.user_data : null,
                session_id: is_authenticated ? this.#current_session_id : null,
                session_expiry: this.#session_info?.expires_at,
                risk_level: this.#session_info?.risk_level,
                two_factor_verified: this.#session_info?.two_factor_verified
            }
        });
    }

    /**
     * ثبت لاگ حسابرسی
     * @param {string} action
     * @param {Object} data
     */
    async #audit_log(action, data) {
        if (!this.#config.enable_audit_log) {
            return;
        }

        try {
            const log_entry = {
                timestamp: Date.now(),
                action,
                data,
                session_id: this.#current_session_id,
                user_id: this.#session_info?.user_id,
                device_fingerprint: this.#session_info?.device_fingerprint
            };

            await this.db.put('audit_logs', log_entry);
            this.logger.info(`Audit: ${action}`, 'audit');
        } catch (error) {
            this.logger.error(`Audit log failed: ${error.message}`, 'audit');
        }
    }

    /**
     * اعتبارسنجی ورودی
     * @param {Object} input
     */
    #validate_input(input) {
        if (!input.user_id || typeof input.user_id !== 'string') {
            throw new Error('INVALID_USER_ID');
        }
        if (!input.user_data || typeof input.user_data !== 'object') {
            throw new Error('INVALID_USER_DATA');
        }
    }

    /**
     * مدیریت رویداد نشست از راه دور
     */
    #handle_remote_session_created(session_id, data) {
        if (session_id !== this.#current_session_id) {
            this.logger.info(`Remote session created: ${session_id}`, 'session');
            // به‌روزرسانی UI یا نمایش نوتیفیکیشن
        }
    }

    #handle_remote_session_ended(session_id) {
        if (session_id === this.#current_session_id) {
            this.logger.warn('Current session ended from another tab', 'session');
            this.#update_auth_state(false);
            this.#current_session_id = null;
            this.#session_info = null;
        }
    }

    #handle_remote_session_refreshed(session_id) {
        if (session_id === this.#current_session_id) {
            this.logger.debug('Session refreshed from another tab', 'session');
        }
    }

    #handle_remote_logout_all() {
        this.logger.warn('Logout all received from another tab', 'session');
        this.#update_auth_state(false);
        this.#current_session_id = null;
        this.#session_info = null;
    }
}

// ایجاد نمونه پیش‌فرض
const session_manager = SessionManager.get_instance({
    state_manager,
    db,
    logger
});

export default session_manager;
