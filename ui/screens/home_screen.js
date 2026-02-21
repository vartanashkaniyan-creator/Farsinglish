/**
 * @file home_screen.js
 * @version 1.6.0
 * @description Home Dashboard Screen (Balanced Architecture)
 * JavaScript + Full JSDoc – Ready for TypeScript Migration
 */

/* =========================
   Types & Constants
========================= */

/**
 * @enum {string}
 */
export const ScreenState = {
    LOADING: 'loading',
    READY: 'ready',
    ERROR: 'error'
};

/**
 * @enum {string}
 */
export const ActionType = {
    START_REVIEW: 'start-review',
    BROWSE_LESSONS: 'browse-lessons',
    RETRY: 'retry',
    SHOW_PROFILE: 'show-profile'
};

/**
 * @typedef {Object} UserData
 * @property {string} id
 * @property {string} name
 * @property {number} level
 */

/**
 * @typedef {Object} DashboardData
 * @property {number} dueCount
 * @property {UserData} user
 */

/**
 * @typedef {Object} ReviewService
 * @property {(userId:string)=>Promise<number>} count_due
 */

/**
 * @typedef {Object} UserService
 * @property {(userId:string)=>Promise<Object>} get_user
 */

/**
 * @typedef {Object} Router
 * @property {(path:string)=>void} navigate
 */

/**
 * @typedef {Object} AnalyticsService
 * @property {(event:string, payload:Object)=>void} track
 */

/**
 * @typedef {Object} ServiceDependencies
 * @property {ReviewService} reviewService
 * @property {UserService} userService
 * @property {Router} router
 * @property {AnalyticsService} [analytics]
 */

/**
 * @typedef {Object} HomeScreenOptions
 * @property {string} [userId]
 */

/* =========================
   Templates (Pure / Stateless)
========================= */

const Templates = {
    /**
     * @returns {string}
     */
    loading() {
        return `
            <div class="home loading" role="status">
                <p>در حال بارگذاری...</p>
            </div>
        `;
    },

    /**
     * @param {string} message
     * @returns {string}
     */
    error(message) {
        return `
            <div class="home error" role="alert">
                <p>${message}</p>
                <button data-action="${ActionType.RETRY}" class="btn btn-primary">
                    تلاش مجدد
                </button>
            </div>
        `;
    },

    /**
     * @param {DashboardData} data
     * @returns {string}
     */
    dashboard(data) {
        const hasDue = data.dueCount > 0;

        return `
            <div class="home ready" role="main">
                <header class="home-header">
                    <h1>${data.user.name}</h1>
                    <span class="level-badge">سطح ${data.user.level}</span>
                </header>

                <section class="due-section">
                    ${
                        hasDue
                            ? `📚 ${data.dueCount} مرور در انتظار`
                            : '✅ همه درس‌ها به‌روز هستند'
                    }
                </section>

                <section class="actions">
                    <button
                        data-action="${ActionType.START_REVIEW}"
                        class="btn btn-primary"
                        ${!hasDue ? 'disabled aria-disabled="true"' : ''}
                    >
                        شروع مرور
                    </button>

                    <button
                        data-action="${ActionType.BROWSE_LESSONS}"
                        class="btn btn-outline"
                    >
                        همه درس‌ها
                    </button>
                </section>

                <button
                    data-action="${ActionType.SHOW_PROFILE}"
                    class="btn-icon"
                    aria-label="پروفایل"
                >
                    👤
                </button>
            </div>
        `;
    }
};

/* =========================
   Base Screen
========================= */

/**
 * @abstract
 */
class BaseScreen {
    /**
     * @param {HTMLElement} container
     */
    constructor(container) {
        if (!container) throw new Error('container is required');

        /** @protected */
        this.container = container;

        /** @protected @type {ScreenState} */
        this.state = ScreenState.LOADING;

        /** @private */
        this._handlers = new Map();

        this._onClick = this._onClick.bind(this);
        container.addEventListener('click', this._onClick);
    }

    /**
     * @param {ActionType} action
     * @param {(e:Event)=>void} handler
     */
    on(action, handler) {
        this._handlers.set(action, handler);
    }

    /**
     * @param {string} html
     */
    render(html) {
        this.container.innerHTML = html;
    }

    /**
     * @param {Event} e
     * @private
     */
    _onClick(e) {
        const el = /** @type {HTMLElement} */ (e.target).closest('[data-action]');
        if (!el) return;

        const action = el.dataset.action;
        const handler = this._handlers.get(action);
        if (handler) handler(e);
    }

    destroy() {
        this.container.removeEventListener('click', this._onClick);
        this.container.innerHTML = '';
        this._handlers.clear();
    }
}

/* =========================
   Home Screen
========================= */

export class HomeScreen extends BaseScreen {
    /**
     * @param {HTMLElement} container
     * @param {ServiceDependencies} deps
     * @param {HomeScreenOptions} [options]
     */
    constructor(container, deps, options = {}) {
        super(container);

        if (!deps.reviewService || !deps.userService || !deps.router) {
            throw new Error('Missing required dependencies');
        }

        /** @private */
        this.reviewService = deps.reviewService;

        /** @private */
        this.userService = deps.userService;

        /** @private */
        this.router = deps.router;

        /** @private */
        this.analytics = deps.analytics;

        /** @private */
        this.userId = options.userId || null;

        /** @private @type {DashboardData|null} */
        this.data = null;

        this._registerActions();
    }

    /**
     * @private
     */
    _registerActions() {
        this.on(ActionType.START_REVIEW, () => {
            this.analytics?.track?.('review_start', { userId: this.userId });
            this.router.navigate('/review');
        });

        this.on(ActionType.BROWSE_LESSONS, () => {
            this.router.navigate('/lessons');
        });

        this.on(ActionType.RETRY, () => {
            this.load();
        });

        this.on(ActionType.SHOW_PROFILE, () => {
            this.router.navigate('/profile');
        });
    }

    /**
     * @param {string} [userId]
     * @returns {Promise<void>}
     */
    async load(userId) {
        if (userId) this.userId = userId;
        if (!this.userId) throw new Error('userId is required');

        this.state = ScreenState.LOADING;
        this.render(Templates.loading());

        try {
            const [dueCount, rawUser] = await Promise.all([
                this.reviewService.count_due(this.userId),
                this.userService.get_user(this.userId)
            ]);

            this.data = {
                dueCount,
                user: this._normalizeUser(rawUser)
            };

            this.state = ScreenState.READY;
            this.render(Templates.dashboard(this.data));

            this.analytics?.track?.('dashboard_loaded', {
                userId: this.userId,
                dueCount
            });
        } catch (err) {
            this._handleError(err);
        }
    }

    /**
     * @param {Partial<DashboardData>} partial
     */
    update(partial) {
        if (!this.data || this.state !== ScreenState.READY) return;

        this.data = { ...this.data, ...partial };
        this.render(Templates.dashboard(this.data));
    }

    /**
     * @param {Object} user
     * @returns {UserData}
     * @private
     */
    _normalizeUser(user) {
        return {
            id: String(user?.id || ''),
            name: user?.name || 'کاربر',
            level: Number(user?.level) || 1
        };
    }

    /**
     * @param {Error} error
     * @private
     */
    _handleError(error) {
        this.state = ScreenState.ERROR;

        console.error('[HomeScreen]', error);
        this.analytics?.track?.('dashboard_error', {
            userId: this.userId,
            message: error.message
        });

        this.render(Templates.error('خطا در دریافت اطلاعات'));
    }

    destroy() {
        this.analytics?.track?.('dashboard_closed', { userId: this.userId });
        super.destroy();

        this.reviewService = null;
        this.userService = null;
        this.router = null;
        this.analytics = null;
        this.userId = null;
        this.data = null;
    }
}

export default HomeScreen;
