/**
 * صفحه اصلی (داشبورد)
 * مسئول: نمایش خلاصه پیشرفت، تعداد مرورهای امروز و هدایت کاربر
 * وابستگی: ReviewService, UserService, Router (تزریق شده)
 * بدون منطق تجاری – فقط نمایش و تعامل با کاربر
 */

// ---------- ثابت‌های UI ----------
const LOADING_MESSAGE = 'در حال بارگذاری...';
const ERROR_GENERIC = 'خطا در دریافت اطلاعات';
const DEFAULT_WELCOME = 'خوش آمدید!';

/**
 * @typedef {Object} UserService
 * @property {function(string): Promise<Object>} getUser - دریافت اطلاعات کاربر
 */

/**
 * @typedef {Object} ReviewService
 * @property {function(string): Promise<number>} countDue - تعداد مرورهای امروز
 * @property {function(string, Object): Promise<Array>} getReviewsDue - دریافت لیست مرورها
 */

/**
 * @typedef {Object} Router
 * @property {function(string): void} navigate - تغییر صفحه
 */

export class HomeScreen {
    /**
     * @param {Object} deps - وابستگی‌های تزریق شده
     * @param {ReviewService} deps.reviewService
     * @param {UserService} deps.userService
     * @param {Router} deps.router
     */
    constructor(deps) {
        const { reviewService, userService, router } = deps || {};

        if (!reviewService) throw new Error('reviewService is required');
        if (!userService) throw new Error('userService is required');
        if (!router) throw new Error('router is required');

        this._reviewService = reviewService;
        this._userService = userService;
        this._router = router;
        this._container = null;
        this._currentUserId = null;
    }

    /**
     * رندر صفحه اصلی در المان container
     * @param {HTMLElement} container - المان والد
     * @param {string} userId - شناسه کاربر جاری
     */
    async render(container, userId) {
        if (!container) throw new Error('container is required');
        if (!userId) throw new Error('userId is required');

        this._container = container;
        this._currentUserId = userId;

        await this._loadAndRender();
    }

    /** @private */
    async _loadAndRender() {
        this._showLoading();

        try {
            const [dueCount, user] = await Promise.all([
                this._reviewService.countDue(this._currentUserId),
                this._userService.getUser(this._currentUserId)
            ]);

            const html = this._buildHTML({ dueCount, user });
            this._container.innerHTML = html;
            this._attachEvents();
        } catch (error) {
            console.error('[HomeScreen] Failed to load data:', error);
            this._showError(error.message || ERROR_GENERIC);
        }
    }

    /** @private */
    _showLoading() {
        this._container.innerHTML = `<div class="loading">${LOADING_MESSAGE}</div>`;
    }

    /** @private */
    _showError(message) {
        this._container.innerHTML = `
            <div class="error-container">
                <p class="error-message">${message}</p>
                <button class="btn btn-primary" data-action="retry">تلاش مجدد</button>
            </div>
        `;
        this._attachRetry();
    }

    /** @private */
    _attachRetry() {
        const retryBtn = this._container.querySelector('[data-action="retry"]');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this._loadAndRender());
        }
    }

    /** @private */
    _buildHTML(data) {
        const { dueCount, user } = data;
        const userName = user?.name || DEFAULT_WELCOME;
        const level = user?.level || 1;
        const xp = user?.xp || 0;
        const nextLevelXp = user?.nextLevelXp || 100;

        const xpProgress = Math.min(100, (xp / nextLevelXp) * 100);
        const dueBadge = dueCount > 0 
            ? `<span class="badge badge-warning">${dueCount} نیاز به مرور</span>`
            : '<span class="badge badge-success">همه درس‌ها به‌روزند</span>';

        return `
            <div class="home-screen">
                <header class="home-header">
                    <h1>${userName}</h1>
                    <p>سطح ${level} · امتیاز ${xp}</p>
                    ${dueBadge}
                </header>

                <div class="progress-section">
                    <div class="progress-label">
                        <span>پیشرفت تا سطح ${level + 1}</span>
                        <span>${xp} / ${nextLevelXp}</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${xpProgress}%;"></div>
                    </div>
                </div>

                <div class="action-buttons">
                    <button class="btn btn-large btn-primary" data-action="start-review">
                        ${dueCount > 0 ? 'شروع مرور' : 'مرور جدیدی نیست'}
                    </button>
                    <button class="btn btn-outline" data-action="browse-lessons">
                        همه درس‌ها
                    </button>
                </div>

                ${dueCount > 0 ? `
                    <div class="tip-card">
                        <p>✨ امروز ${dueCount} درس برای مرور داری. هرچه زودتر شروع کنی، بهتر یاد می‌گیری!</p>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /** @private */
    _attachEvents() {
        const startBtn = this._container.querySelector('[data-action="start-review"]');
        const browseBtn = this._container.querySelector('[data-action="browse-lessons"]');

        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this._router.navigate('/review');
            });
        }

        if (browseBtn) {
            browseBtn.addEventListener('click', () => {
                this._router.navigate('/lessons');
            });
        }
    }

    /**
     * پاکسازی منابع (در صورت نیاز)
     */
    destroy() {
        // برای جلوگیری از memory leak
        if (this._container) {
            this._container.innerHTML = '';
        }
        this._container = null;
        this._currentUserId = null;
    }
}

// ---------- واحد تست ساده (برای مرورگر) ----------
if (typeof window !== 'undefined' && window.VITEST) {
    window.__HOME_SCREEN__ = { HomeScreen };
}
