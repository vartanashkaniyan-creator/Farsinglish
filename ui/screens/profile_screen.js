// ==============================================
// ui/screens/profile-screen.js
// ==============================================
// صفحه پروفایل کاربر: نمایش اطلاعات، آمار و تنظیمات
// اصول رعایت شده: SRP, Encapsulation, Modular, Snake Case
// وابستگی‌ها: state-manager, user-model, stats-service
// ویژگی‌های اضافه: Skeleton Loading, Cache آمار, مدیریت خطا, Pull to Refresh
// ==============================================

import { state_manager } from '../../core/state/state-manager.js';
import { user_model } from '../../shared/models/user-model.js';
import { stats_service } from '../../features/stats/stats-service.js';
import { logger } from '../../core/utils/logger.js';

/**
 * @class ProfileScreen
 * @description مدیریت صفحه پروفایل کاربر - مسئولیت: نمایش و تعاملات پروفایل
 * اصل SRP: این کلاس فقط برای مدیریت صفحه پروفایل تغییر می‌کند
 */
class ProfileScreen {
    #container = null;          // عنصر اصلی صفحه (کپسوله‌سازی)
    #user_data = null;          // داده‌های کاربر (کپسوله‌سازی)
    #stats_data = null;         // داده‌های آماری (کپسوله‌سازی)
    #cached_stats = null;       // کش آمار برای کاهش محاسبات
    #cache_time = 0;            // زمان آخرین به‌روزرسانی کش
    #cache_ttl = 5 * 60 * 1000; // ۵ دقیقه اعتبار کش
    #unsubscribe_state = null;  // تابع لغو اشتراک state
    #is_loading = true;         // وضعیت بارگذاری
    #pull_to_refresh_start = 0; // موقعیت شروع Pull to Refresh

    /**
     * @constructor
     * @param {HTMLElement} container - عنصر DOM برای رندر صفحه
     */
    constructor(container) {
        if (!container) {
            throw new Error('Container element is required for ProfileScreen');
        }
        this.#container = container;
        this.#safe_init();
    }

    // ==============================================
    // متدهای خصوصی با مدیریت خطا
    // ==============================================

    /**
     * @private
     * @description مقداردهی اولیه با مدیریت خطا
     */
    #safe_init() {
        try {
            this.#render_loading();
            this.#load_user_data();
            this.#setup_state_listener();
            this.#setup_pull_to_refresh();
            this.#render();
            logger.info('ProfileScreen initialized');
        } catch (error) {
            logger.error('ProfileScreen initialization failed', error);
            this.#render_error('خطا در بارگذاری پروفایل');
        }
    }

    /**
     * @private
     * @description بارگذاری داده‌های کاربر از state
     */
    #load_user_data() {
        const state = state_manager.get_state();
        this.#user_data = state?.user || null;
        
        if (this.#user_data) {
            this.#stats_data = this.#get_cached_stats();
        }
        
        logger.debug('User data loaded', { user_id: this.#user_data?.id });
    }

    /**
     * @private
     * @description دریافت آمار با کش (کاهش محاسبات تکراری)
     * @returns {Object} داده‌های آماری
     */
    #get_cached_stats() {
        if (!this.#user_data) return null;

        // اگر کش معتبر است، همان را برگردان
        if (this.#cached_stats && (Date.now() - this.#cache_time) < this.#cache_ttl) {
            logger.debug('Using cached stats');
            return this.#cached_stats;
        }

        // محاسبه مجدد و ذخیره در کش
        try {
            this.#cached_stats = stats_service.calculate_user_stats(this.#user_data.id);
            this.#cache_time = Date.now();
            logger.debug('Stats recalculated and cached');
            return this.#cached_stats;
        } catch (error) {
            logger.error('Failed to calculate stats', error);
            return this.#cached_stats || {}; // برگرداندن کش قدیمی در صورت خطا
        }
    }

    /**
     * @private
     * @description تنظیم شنونده برای تغییرات state
     */
    #setup_state_listener() {
        this.#unsubscribe_state = state_manager.subscribe((new_state) => {
            try {
                if (JSON.stringify(new_state.user) !== JSON.stringify(this.#user_data)) {
                    this.#user_data = new_state.user;
                    if (this.#user_data) {
                        this.#invalidate_cache(); // باطل کردن کش قدیمی
                        this.#stats_data = this.#get_cached_stats();
                    }
                    this.#update_display();
                    logger.debug('Profile screen updated due to state change');
                }
            } catch (error) {
                logger.error('State listener error', error);
            }
        });
    }

    /**
     * @private
     * @description باطل کردن کش آمار
     */
    #invalidate_cache() {
        this.#cached_stats = null;
        this.#cache_time = 0;
    }

    /**
     * @private
     * @description تنظیم Pull to Refresh
     */
    #setup_pull_to_refresh() {
        if (!this.#container) return;

        const touch_start_handler = (e) => {
            this.#pull_to_refresh_start = e.touches[0].clientY;
        };

        const touch_end_handler = (e) => {
            const end_y = e.changedTouches[0].clientY;
            const distance = end_y - this.#pull_to_refresh_start;
            
            // اگر بیش از ۱۰۰ پیکسل به پایین کشیده شده باشد
            if (distance > 100 && window.scrollY === 0) {
                this.#handle_pull_to_refresh();
            }
        };

        this.#container.addEventListener('touchstart', touch_start_handler);
        this.#container.addEventListener('touchend', touch_end_handler);

        // ذخیره برای پاکسازی بعدی
        this.#pull_to_refresh_cleanup = () => {
            this.#container.removeEventListener('touchstart', touch_start_handler);
            this.#container.removeEventListener('touchend', touch_end_handler);
        };
    }

    /**
     * @private
     * @description اجرای Pull to Refresh
     */
    #handle_pull_to_refresh() {
        logger.info('Pull to refresh triggered');
        
        // نمایش نشانگر به‌روزرسانی
        const refresh_indicator = document.createElement('div');
        refresh_indicator.className = 'profile-refresh-indicator';
        refresh_indicator.textContent = 'در حال به‌روزرسانی...';
        this.#container.prepend(refresh_indicator);

        // به‌روزرسانی داده‌ها
        setTimeout(() => {
            this.#invalidate_cache();
            this.#load_user_data();
            this.#update_display();
            refresh_indicator.remove();
        }, 500); // تأخیر مصنوعی برای نمایش بهتر
    }

    // ==============================================
    // متدهای رندر
    // ==============================================

    /**
     * @private
     * @description نمایش Skeleton Loading
     */
    #render_loading() {
        this.#is_loading = true;
        this.#container.innerHTML = `
            <div class="profile-screen">
                <div class="profile-skeleton">
                    <div class="skeleton-header"></div>
                    <div class="skeleton-avatar"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-grid">
                        <div class="skeleton-card"></div>
                        <div class="skeleton-card"></div>
                        <div class="skeleton-card"></div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * @private
     * @description نمایش خطا با UI مناسب
     * @param {string} message - پیام خطا
     */
    #render_error(message) {
        this.#container.innerHTML = `
            <div class="profile-screen profile-error">
                <div class="error-icon">⚠️</div>
                <p class="error-message">${message}</p>
                <button class="error-retry-button" onclick="location.reload()">
                    تلاش مجدد
                </button>
            </div>
        `;
    }

    /**
     * @private
     * @description رندر اولیه صفحه
     */
    #render() {
        try {
            this.#is_loading = false;
            this.#container.innerHTML = '';
            this.#container.appendChild(this.#create_profile_layout());
        } catch (error) {
            logger.error('Render failed', error);
            this.#render_error('خطا در نمایش پروفایل');
        }
    }

    /**
     * @private
     * @description به‌روزرسانی نمایش بدون رندر مجدد کامل
     */
    #update_display() {
        try {
            const user_info_element = this.#container.querySelector('.profile-user-info');
            const stats_grid = this.#container.querySelector('.profile-stats-grid');
            const actions = this.#container.querySelector('.profile-actions');

            if (user_info_element) {
                user_info_element.replaceWith(this.#create_user_info());
            }
            if (stats_grid) {
                stats_grid.replaceWith(this.#create_stats_grid());
            }
            if (actions) {
                actions.replaceWith(this.#create_action_buttons());
            }
        } catch (error) {
            logger.error('Update display failed', error);
        }
    }

    /**
     * @private
     * @description ایجاد ساختار اصلی صفحه
     * @returns {HTMLElement}
     */
    #create_profile_layout() {
        const layout = document.createElement('div');
        layout.className = 'profile-screen';

        layout.appendChild(this.#create_header());
        layout.appendChild(this.#create_user_info());
        layout.appendChild(this.#create_stats_grid());
        layout.appendChild(this.#create_action_buttons());

        return layout;
    }

    /**
     * @private
     * @description ایجاد هدر صفحه
     * @returns {HTMLElement}
     */
    #create_header() {
        const header = document.createElement('header');
        header.className = 'profile-header';

        const title = document.createElement('h1');
        title.className = 'profile-title';
        title.textContent = 'پروفایل کاربری';
        title.setAttribute('dir', 'rtl');

        const back_button = document.createElement('button');
        back_button.className = 'profile-back-button';
        back_button.textContent = 'بازگشت';
        back_button.setAttribute('aria-label', 'بازگشت به صفحه قبل');
        back_button.addEventListener('click', () => this.#handle_back_navigation());

        header.appendChild(back_button);
        header.appendChild(title);

        return header;
    }

    /**
     * @private
     * @description ایجاد بخش اطلاعات کاربر
     * @returns {HTMLElement}
     */
    #create_user_info() {
        const section = document.createElement('section');
        section.className = 'profile-user-info';

        if (!this.#user_data) {
            const login_prompt = document.createElement('div');
            login_prompt.className = 'profile-login-prompt';
            login_prompt.textContent = 'لطفاً وارد حساب کاربری خود شوید.';
            section.appendChild(login_prompt);
            return section;
        }

        const avatar = document.createElement('div');
        avatar.className = 'profile-avatar';
        avatar.textContent = this.#user_data.name?.charAt(0).toUpperCase() || '?';

        const details = document.createElement('div');
        details.className = 'profile-details';

        const name = document.createElement('h2');
        name.className = 'profile-name';
        name.textContent = this.#user_data.name || 'کاربر';

        const email = document.createElement('p');
        email.className = 'profile-email';
        email.textContent = this.#user_data.email || '';

        const level = document.createElement('p');
        level.className = 'profile-level';
        level.textContent = `سطح ${this.#user_data.level || 1} · XP: ${this.#user_data.xp || 0}`;

        details.appendChild(name);
        details.appendChild(email);
        details.appendChild(level);

        section.appendChild(avatar);
        section.appendChild(details);

        return section;
    }

    /**
     * @private
     * @description ایجاد گرید آمار کاربر
     * @returns {HTMLElement}
     */
    #create_stats_grid() {
        const grid = document.createElement('div');
        grid.className = 'profile-stats-grid';

        if (!this.#stats_data) {
            const empty = document.createElement('p');
            empty.textContent = 'آماری برای نمایش وجود ندارد.';
            grid.appendChild(empty);
            return grid;
        }

        const stats_items = [
            { label: 'درس‌های تکمیل شده', value: this.#stats_data.completed_lessons || 0 },
            { label: 'مرورهای امروز', value: this.#stats_data.today_reviews || 0 },
            { label: 'نمره متوسط', value: this.#stats_data.average_score?.toFixed(1) || '۰' },
            { label: 'روزهای متوالی', value: this.#stats_data.streak_days || 0 },
            { label: 'کل مرورها', value: this.#stats_data.total_reviews || 0 },
            { label: 'دقت', value: `${this.#stats_data.accuracy_percent || 0}%` }
        ];

        stats_items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'profile-stat-card';

            const label = document.createElement('span');
            label.className = 'profile-stat-label';
            label.textContent = item.label;

            const value = document.createElement('span');
            value.className = 'profile-stat-value';
            value.textContent = item.value;

            card.appendChild(label);
            card.appendChild(value);
            grid.appendChild(card);
        });

        return grid;
    }

    /**
     * @private
     * @description ایجاد دکمه‌های عملیات
     * @returns {HTMLElement}
     */
    #create_action_buttons() {
        const actions = document.createElement('div');
        actions.className = 'profile-actions';

        const edit_button = document.createElement('button');
        edit_button.className = 'profile-action-button';
        edit_button.textContent = 'ویرایش پروفایل';
        edit_button.addEventListener('click', () => this.#handle_edit_profile());

        const logout_button = document.createElement('button');
        logout_button.className = 'profile-action-button profile-logout-button';
        logout_button.textContent = 'خروج از حساب';
        logout_button.addEventListener('click', () => this.#handle_logout());

        actions.appendChild(edit_button);
        actions.appendChild(logout_button);

        return actions;
    }

    // ==============================================
    // مدیریت رویدادها
    // ==============================================

    /**
     * @private
     * @description بازگشت به صفحه قبل
     */
    #handle_back_navigation() {
        try {
            const event = new CustomEvent('navigation:back');
            document.dispatchEvent(event);
            logger.info('Back navigation triggered from profile');
        } catch (error) {
            logger.error('Back navigation failed', error);
        }
    }

    /**
     * @private
     * @description ویرایش پروفایل
     */
    #handle_edit_profile() {
        try {
            const event = new CustomEvent('navigation:edit-profile');
            document.dispatchEvent(event);
            logger.info('Edit profile triggered');
        } catch (error) {
            logger.error('Edit profile failed', error);
        }
    }

    /**
     * @private
     * @description خروج از حساب
     */
    #handle_logout() {
        try {
            const event = new CustomEvent('auth:logout');
            document.dispatchEvent(event);
            logger.info('Logout triggered from profile');
        } catch (error) {
            logger.error('Logout failed', error);
        }
    }

    // ==============================================
    // متدهای عمومی
    // ==============================================

    /**
     * @public
     * @description به‌روزرسانی اجباری صفحه
     */
    refresh() {
        try {
            this.#invalidate_cache();
            this.#load_user_data();
            this.#render();
            logger.info('Profile screen refreshed manually');
        } catch (error) {
            logger.error('Manual refresh failed', error);
        }
    }

    /**
     * @public
     * @description پاکسازی منابع قبل از حذف صفحه
     */
    destroy() {
        try {
            if (this.#unsubscribe_state) {
                this.#unsubscribe_state();
            }
            if (this.#pull_to_refresh_cleanup) {
                this.#pull_to_refresh_cleanup();
            }
            this.#container.innerHTML = '';
            this.#invalidate_cache();
            logger.info('ProfileScreen destroyed');
        } catch (error) {
            logger.error('Destroy failed', error);
        }
    }
}

// ==============================================
// تابع کارخانه
// ==============================================

/**
 * @function create_profile_screen
 * @description ایجاد و مقداردهی صفحه پروفایل
 * @param {HTMLElement} container - عنصر DOM برای رندر
 * @returns {ProfileScreen} نمونه صفحه پروفایل
 */
export function create_profile_screen(container) {
    return new ProfileScreen(container);
}

export default ProfileScreen;
