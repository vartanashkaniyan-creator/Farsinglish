/**
 * @fileoverview کامپوننت نمایش نشان‌های کسب شده کاربر - نسخه Enterprise
 * @module ui/components/badge_display
 */

import { AchievementModel } from '../../shared/models/achievement_model.js';
import { Logger } from '../../core/utils/logger.js';

/**
 * @typedef {Object} BadgeDisplayConfig
 * @property {string} containerId - شناسه المان container
 * @property {Function} onBadgeClick - callback کلیک روی نشان
 * @property {boolean} showUnlocked - نمایش نشان‌های قفل شده
 * @property {string} theme - تم نمایش (light/dark)
 * @property {number} retryCount - تعداد تلاش مجدد برای بارگذاری تصویر
 * @property {number} virtualItemHeight - ارتفاع آیتم برای virtual scrolling
 */

/**
 * @typedef {Object} BadgeRenderOptions
 * @property {boolean} compact - حالت فشرده
 * @property {boolean} animate - انیمیشن نمایش
 * @property {string} size - اندازه (sm/md/lg)
 */

/**
 * کامپوننت نمایش نشان‌ها با قابلیت‌های پیشرفته
 * @class
 */
export class BadgeDisplay {
    /** @type {Logger} */
    #logger;
    
    /** @type {HTMLElement} */
    #container;
    
    /** @type {BadgeDisplayConfig} */
    #config;
    
    /** @type {Map<string, HTMLElement>} */
    #badgeElements = new Map();
    
    /** @type {IntersectionObserver} */
    #intersectionObserver;
    
    /** @type {ResizeObserver} */
    #resizeObserver;
    
    /** @type {string} */
    #state = 'idle'; // idle | loading | error
    
    /** @type {Map<string, HTMLElement>} */
    #renderCache = new Map();
    
    /** @type {HTMLElement} */
    #liveRegion;
    
    /** @type {Object} */
    #visibleRange = { start: 0, end: 10 };
    
    /** @type {AchievementModel[]} */
    #currentBadges = [];
    
    /** @type {BadgeRenderOptions} */
    #currentOptions = {};

    /**
     * ایجاد کامپوننت نمایش نشان‌ها
     * @param {BadgeDisplayConfig} config - تنظیمات کامپوننت
     */
    constructor(config) {
        this.#validateConfig(config);
        this.#config = this.#mergeWithDefaults(config);
        this.#logger = new Logger('BadgeDisplay');
        this.#init();
    }

    /**
     * اعتبارسنجی تنظیمات ورودی
     * @param {BadgeDisplayConfig} config 
     * @private
     */
    #validateConfig(config) {
        if (!config?.containerId) {
            throw new Error('BadgeDisplay: containerId الزامی است');
        }
    }

    /**
     * ادغام با تنظیمات پیش‌فرض
     * @param {BadgeDisplayConfig} config 
     * @returns {BadgeDisplayConfig}
     * @private
     */
    #mergeWithDefaults(config) {
        return {
            showUnlocked: true,
            theme: 'light',
            retryCount: 3,
            virtualItemHeight: 80,
            onBadgeClick: () => {},
            ...config
        };
    }

    /**
     * مقداردهی اولیه کامپوننت
     * @private
     */
    #init() {
        this.#findContainer();
        this.#setupObservers();
        this.#setupAccessibility();
        this.#applyTheme();
        this.#setupScrollListener();
        this.#logger.info('BadgeDisplay initialized', { 
            containerId: this.#config.containerId 
        });
    }

    /**
     * یافتن المان container
     * @private
     */
    #findContainer() {
        this.#container = document.getElementById(this.#config.containerId);
        if (!this.#container) {
            throw new Error(`Container with id "${this.#config.containerId}" not found`);
        }
        this.#container.classList.add('badge-display', `theme-${this.#config.theme}`);
    }

    /**
     * تنظیم observers برای بهینه‌سازی
     * @private
     */
    #setupObservers() {
        this.#intersectionObserver = new IntersectionObserver(
            (entries) => this.#onIntersection(entries),
            { threshold: 0.1, rootMargin: '50px' }
        );

        this.#resizeObserver = new ResizeObserver(
            (entries) => this.#onResize(entries)
        );
        this.#resizeObserver.observe(this.#container);
    }

    /**
     * تنظیم قابلیت‌های دسترسی
     * @private
     */
    #setupAccessibility() {
        this.#setupKeyboardNav();
        this.#liveRegion = this.#createLiveRegion();
        this.#container.setAttribute('role', 'grid');
        this.#container.setAttribute('aria-label', 'نشان‌های کسب شده');
    }

    /**
     * ایجاد منطقه زنده برای screen reader
     * @returns {HTMLElement}
     * @private
     */
    #createLiveRegion() {
        const region = document.createElement('div');
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'true');
        region.className = 'badge-display__live-region sr-only';
        this.#container.appendChild(region);
        return region;
    }

    /**
     * اعلام پیام به screen reader
     * @param {string} message 
     * @private
     */
    #announce(message) {
        if (this.#liveRegion) {
            this.#liveRegion.textContent = message;
        }
    }

    /**
     * تنظیم ناوبری صفحه کلید
     * @private
     */
    #setupKeyboardNav() {
        this.#container.addEventListener('keydown', (e) => {
            const items = Array.from(this.#badgeElements.values());
            const currentIndex = items.findIndex(el => el === document.activeElement);
            
            switch(e.key) {
                case 'ArrowRight':
                case 'ArrowDown':
                    e.preventDefault();
                    if (currentIndex < items.length - 1) {
                        items[currentIndex + 1]?.focus();
                        this.#announce(`نشان ${currentIndex + 2} از ${items.length}`);
                    }
                    break;
                case 'ArrowLeft':
                case 'ArrowUp':
                    e.preventDefault();
                    if (currentIndex > 0) {
                        items[currentIndex - 1]?.focus();
                        this.#announce(`نشان ${currentIndex} از ${items.length}`);
                    }
                    break;
                case 'Home':
                    e.preventDefault();
                    items[0]?.focus();
                    this.#announce(`نشان اول از ${items.length}`);
                    break;
                case 'End':
                    e.preventDefault();
                    items[items.length - 1]?.focus();
                    this.#announce(`نشان آخر از ${items.length}`);
                    break;
            }
        });
    }

    /**
     * تنظیم شنونده اسکرول برای virtual scrolling
     * @private
     */
    #setupScrollListener() {
        this.#container.addEventListener('scroll', () => {
            this.#updateVisibleRange();
        }, { passive: true });
    }

    /**
     * به‌روزرسانی محدوده قابل مشاهده
     * @private
     */
    #updateVisibleRange() {
        const { scrollTop, clientHeight } = this.#container;
        const start = Math.max(0, Math.floor(scrollTop / this.#config.virtualItemHeight) - 2);
        const end = Math.min(
            this.#currentBadges.length,
            Math.ceil((scrollTop + clientHeight) / this.#config.virtualItemHeight) + 2
        );
        
        this.#visibleRange = { start, end };
        this.#renderVisibleBadges();
    }

    /**
     * رندر فقط نشان‌های قابل مشاهده
     * @private
     */
    #renderVisibleBadges() {
        Array.from(this.#badgeElements.values()).forEach(el => {
            const index = parseInt(el.dataset.index);
            if (index >= this.#visibleRange.start && index < this.#visibleRange.end) {
                el.style.display = 'flex';
            } else {
                el.style.display = 'none';
            }
        });
    }

    /**
     * تأخیر با backoff
     * @param {number} ms 
     * @returns {Promise}
     * @private
     */
    #delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * اجرای تابع با تلاش مجدد
     * @param {Function} fn 
     * @param {number} retries 
     * @returns {Promise}
     * @private
     */
    async #withRetry(fn, retries = this.#config.retryCount) {
        let lastError;
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (i === retries - 1) break;
                await this.#delay(1000 * Math.pow(2, i)); // exponential backoff
            }
        }
        throw lastError;
    }

    /**
     * تنظیم state
     * @param {string} newState 
     * @private
     */
    #setState(newState) {
        const validTransitions = {
            'idle': ['loading'],
            'loading': ['idle', 'error'],
            'error': ['idle']
        };
        
        if (validTransitions[this.#state]?.includes(newState)) {
            this.#state = newState;
            this.#container.setAttribute('data-state', newState);
            this.#logger.debug('State changed', { from: this.#state, to: newState });
        }
    }

    /**
     * دریافت از کش
     * @param {string} badgeId 
     * @param {BadgeRenderOptions} options 
     * @returns {HTMLElement|null}
     * @private
     */
    #getCachedBadge(badgeId, options) {
        const key = `${badgeId}-${JSON.stringify(options)}`;
        return this.#renderCache.get(key) || null;
    }

    /**
     * ذخیره در کش
     * @param {string} badgeId 
     * @param {BadgeRenderOptions} options 
     * @param {HTMLElement} element 
     * @private
     */
    #cacheBadge(badgeId, options, element) {
        const key = `${badgeId}-${JSON.stringify(options)}`;
        this.#renderCache.set(key, element.cloneNode(true));
        
        // محدودیت حجم کش
        if (this.#renderCache.size > 100) {
            const firstKey = this.#renderCache.keys().next().value;
            this.#renderCache.delete(firstKey);
        }
    }

    /**
     * رندر نشان‌ها در کامپوننت
     * @param {AchievementModel[]} badges - آرایه نشان‌ها
     * @param {BadgeRenderOptions} options - گزینه‌های رندر
     * @returns {Promise<void>}
     */
    async render(badges, options = {}) {
        this.#setState('loading');
        this.#currentBadges = badges;
        this.#currentOptions = this.#normalizeRenderOptions(options);
        
        try {
            if (!Array.isArray(badges)) {
                throw new Error('badges must be an array');
            }

            this.#clearContainer();
            
            if (badges.length === 0) {
                this.#renderEmptyState();
                this.#setState('idle');
                return;
            }

            const filteredBadges = this.#filterBadges(badges);
            await this.#renderBadges(filteredBadges, this.#currentOptions);
            this.#updateVisibleRange();
            
            this.#announce(`${filteredBadges.length} نشان با موفقیت نمایش داده شد`);
            this.#setState('idle');
            
            this.#logger.debug('Badges rendered', { 
                count: filteredBadges.length,
                options: this.#currentOptions 
            });
        } catch (error) {
            this.#setState('error');
            this.#logger.error('Failed to render badges', { error });
            this.#renderError(error);
        }
    }

    /**
     * نرمال‌سازی گزینه‌های رندر
     * @param {BadgeRenderOptions} options 
     * @returns {BadgeRenderOptions}
     * @private
     */
    #normalizeRenderOptions(options) {
        return {
            compact: false,
            animate: true,
            size: 'md',
            ...options
        };
    }

    /**
     * پاکسازی container
     * @private
     */
    #clearContainer() {
        this.#container.innerHTML = '';
        this.#badgeElements.clear();
    }

    /**
     * رندر حالت خالی
     * @private
     */
    #renderEmptyState() {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'badge-display__empty';
        emptyEl.setAttribute('role', 'status');
        emptyEl.setAttribute('aria-label', 'نشانی برای نمایش وجود ندارد');
        emptyEl.innerHTML = `
            <span class="badge-display__empty-icon" aria-hidden="true">🏆</span>
            <p class="badge-display__empty-text">هنوز نشانی کسب نکرده‌اید</p>
        `;
        this.#container.appendChild(emptyEl);
    }

    /**
     * رندر خطا
     * @param {Error} error 
     * @private
     */
    #renderError(error) {
        const errorEl = document.createElement('div');
        errorEl.className = 'badge-display__error';
        errorEl.setAttribute('role', 'alert');
        errorEl.innerHTML = `
            <span class="badge-display__error-icon" aria-hidden="true">⚠️</span>
            <p class="badge-display__error-text">خطا در نمایش نشان‌ها</p>
            <button class="badge-display__retry-btn" aria-label="تلاش مجدد">🔄</button>
        `;
        
        errorEl.querySelector('.badge-display__retry-btn')?.addEventListener('click', () => {
            this.render(this.#currentBadges, this.#currentOptions);
        });
        
        this.#container.appendChild(errorEl);
    }

    /**
     * فیلتر نشان‌ها بر اساس تنظیمات
     * @param {AchievementModel[]} badges 
     * @returns {AchievementModel[]}
     * @private
     */
    #filterBadges(badges) {
        if (this.#config.showUnlocked) {
            return badges;
        }
        return badges.filter(badge => badge.isUnlocked());
    }

    /**
     * رندر نشان‌ها
     * @param {AchievementModel[]} badges 
     * @param {BadgeRenderOptions} options 
     * @returns {Promise<void>}
     * @private
     */
    async #renderBadges(badges, options) {
        const fragment = document.createDocumentFragment();
        
        for (let i = 0; i < badges.length; i++) {
            const badge = badges[i];
            
            // بررسی کش
            const cached = this.#getCachedBadge(badge.getId(), options);
            if (cached) {
                const cloned = cached.cloneNode(true);
                cloned.dataset.index = i.toString();
                fragment.appendChild(cloned);
                continue;
            }
            
            const element = await this.#createBadgeElement(badge, options, i);
            fragment.appendChild(element);
            
            if (!options.compact) {
                this.#badgeElements.set(badge.getId(), element);
                this.#cacheBadge(badge.getId(), options, element);
            }
        }
        
        this.#container.appendChild(fragment);
    }

    /**
     * ایجاد المان نشان
     * @param {AchievementModel} badge 
     * @param {BadgeRenderOptions} options 
     * @param {number} index 
     * @returns {Promise<HTMLElement>}
     * @private
     */
    async #createBadgeElement(badge, options, index) {
        const element = document.createElement('div');
        element.className = `badge-display__item size-${options.size}`;
        element.setAttribute('data-badge-id', badge.getId());
        element.setAttribute('data-index', index.toString());
        element.setAttribute('role', 'gridcell');
        element.setAttribute('tabindex', '0');
        element.setAttribute('aria-label', badge.getName('fa'));
        element.setAttribute('aria-describedby', `badge-desc-${badge.getId()}`);

        if (!badge.isUnlocked()) {
            element.classList.add('badge-display__item--locked');
            element.setAttribute('aria-disabled', 'true');
        }

        const icon = await this.#withRetry(() => this.#loadIcon(badge.getIcon(), options));
        element.appendChild(icon);

        if (!options.compact) {
            this.#addBadgeDetails(element, badge);
        }

        element.addEventListener('click', (e) => {
            e.stopPropagation();
            this.#onBadgeClick(badge);
        });

        if (options.animate && badge.isUnlocked()) {
            this.#addUnlockAnimation(element);
        }

        return element;
    }

    /**
     * بارگذاری آیکون نشان
     * @param {string} iconPath 
     * @param {BadgeRenderOptions} options 
     * @returns {Promise<HTMLElement>}
     * @private
     */
    async #loadIcon(iconPath, options) {
        return new Promise((resolve, reject) => {
            const icon = document.createElement('img');
            icon.className = 'badge-display__icon';
            icon.alt = '';
            icon.loading = 'lazy';
            
            icon.onload = () => resolve(icon);
            icon.onerror = () => reject(new Error(`Failed to load icon: ${iconPath}`));
            
            this.#intersectionObserver.observe(icon);
            icon.src = iconPath;
        });
    }

    /**
     * افزودن جزئیات نشان
     * @param {HTMLElement} element 
     * @param {AchievementModel} badge 
     * @private
     */
    #addBadgeDetails(element, badge) {
        const details = document.createElement('div');
        details.className = 'badge-display__details';

        const name = document.createElement('h4');
        name.className = 'badge-display__name';
        name.textContent = badge.getName('fa');

        const description = document.createElement('p');
        description.className = 'badge-display__description';
        description.id = `badge-desc-${badge.getId()}`;
        description.textContent = badge.getDescription('fa');

        const meta = document.createElement('div');
        meta.className = 'badge-display__meta';

        if (badge.isUnlocked()) {
            const unlockDate = document.createElement('span');
            unlockDate.className = 'badge-display__date';
            unlockDate.textContent = this.#formatDate(badge.getUnlockedAt());
            meta.appendChild(unlockDate);
        } else {
            const requirement = document.createElement('span');
            requirement.className = 'badge-display__requirement';
            requirement.textContent = badge.getRequirementText('fa');
            meta.appendChild(requirement);
        }

        details.appendChild(name);
        details.appendChild(description);
        details.appendChild(meta);
        element.appendChild(details);
    }

    /**
     * فرمت تاریخ
     * @param {Date} date 
     * @returns {string}
     * @private
     */
    #formatDate(date) {
        if (!date) return '';
        
        return new Intl.DateTimeFormat('fa-IR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(date);
    }

    /**
     * افزودن انیمیشن باز شدن
     * @param {HTMLElement} element 
     * @private
     */
    #addUnlockAnimation(element) {
        element.style.animation = 'badge-unlock 0.5s ease-out';
        
        element.addEventListener('animationend', () => {
            element.style.animation = '';
        }, { once: true });
    }

    /**
     * رویداد کلیک روی نشان
     * @param {AchievementModel} badge 
     * @private
     */
    #onBadgeClick(badge) {
        try {
            this.#config.onBadgeClick(badge);
            this.#announce(`نشان ${badge.getName('fa')} انتخاب شد`);
            this.#logger.debug('Badge clicked', { badgeId: badge.getId() });
        } catch (error) {
            this.#logger.error('Error in badge click handler', { error });
        }
    }

    /**
     * Handler برای IntersectionObserver
     * @param {IntersectionObserverEntry[]} entries 
     * @private
     */
    #onIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.target instanceof HTMLImageElement) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                }
                this.#intersectionObserver.unobserve(img);
            }
        });
    }

    /**
     * Handler برای ResizeObserver
     * @param {ResizeObserverEntry[]} entries 
     * @private
     */
    #onResize(entries) {
        entries.forEach(entry => {
            const { width } = entry.contentRect;
            
            if (width < 300) {
                this.#container.classList.add('badge-display--compact');
            } else {
                this.#container.classList.remove('badge-display--compact');
            }
        });
    }

    /**
     * اعمال تم
     * @private
     */
    #applyTheme() {
        this.#container.classList.remove('theme-light', 'theme-dark');
        this.#container.classList.add(`theme-${this.#config.theme}`);
    }

    /**
     * به‌روزرسانی تم
     * @param {string} theme 
     */
    setTheme(theme) {
        if (theme !== 'light' && theme !== 'dark') {
            throw new Error('Invalid theme. Must be "light" or "dark"');
        }
        
        this.#config.theme = theme;
        this.#applyTheme();
        this.#logger.debug('Theme updated', { theme });
    }

    /**
     * به‌روزرسانی یک نشان خاص
     * @param {AchievementModel} badge 
     * @returns {Promise<void>}
     */
    async updateBadge(badge) {
        const existingElement = this.#badgeElements.get(badge.getId());
        
        if (existingElement) {
            const index = parseInt(existingElement.dataset.index || '0');
            const newElement = await this.#createBadgeElement(badge, {
                compact: existingElement.classList.contains('size-compact'),
                animate: true,
                size: this.#getSizeFromElement(existingElement)
            }, index);
            
            existingElement.replaceWith(newElement);
            this.#badgeElements.set(badge.getId(), newElement);
            this.#cacheBadge(badge.getId(), this.#currentOptions, newElement);
            
            this.#logger.debug('Badge updated', { badgeId: badge.getId() });
        }
    }

    /**
     * استخراج اندازه از المان
     * @param {HTMLElement} element 
     * @returns {string}
     * @private
     */
    #getSizeFromElement(element) {
        if (element.classList.contains('size-sm')) return 'sm';
        if (element.classList.contains('size-lg')) return 'lg';
        return 'md';
    }

    /**
     * پاکسازی منابع
     */
    destroy() {
        this.#intersectionObserver?.disconnect();
        this.#resizeObserver?.disconnect();
        this.#badgeElements.clear();
        this.#renderCache.clear();
        this.#container.innerHTML = '';
        this.#logger.info('BadgeDisplay destroyed');
    }

    /**
     * دریافت عناصر نشان برای تست
     * @returns {Map<string, HTMLElement>}
     */
    getBadgeElements() {
        return new Map(this.#badgeElements);
    }
}

// استایل‌های پیشنهادی
export const BADGE_DISPLAY_STYLES = `
.badge-display {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    border-radius: 0.5rem;
    transition: all 0.3s ease;
    position: relative;
    overflow-y: auto;
    max-height: 600px;
}

.badge-display[data-state="loading"] {
    opacity: 0.7;
    pointer-events: none;
}

.badge-display[data-state="error"] {
    border: 1px solid #dc3545;
}

.badge-display.theme-light {
    background: #f5f5f5;
    color: #333;
}

.badge-display.theme-dark {
    background: #333;
    color: #f5f5f5;
}

.badge-display--compact {
    gap: 0.5rem;
}

.badge-display__item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.badge-display.theme-dark .badge-display__item {
    background: #444;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.badge-display__item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
}

.badge-display__item:focus-visible {
    outline: 2px solid #007bff;
    outline-offset: 2px;
}

.badge-display__item--locked {
    opacity: 0.5;
    filter: grayscale(1);
}

.badge-display__icon {
    width: 48px;
    height: 48px;
    object-fit: contain;
}

.size-sm .badge-display__icon {
    width: 32px;
    height: 32px;
}

.size-lg .badge-display__icon {
    width: 64px;
    height: 64px;
}

.badge-display__details {
    flex: 1;
}

.badge-display__name {
    margin: 0 0 0.25rem 0;
    font-size: 1rem;
    font-weight: 600;
}

.badge-display__description {
    margin: 0 0 0.25rem 0;
    font-size: 0.875rem;
    opacity: 0.8;
}

.badge-display__meta {
    font-size: 0.75rem;
    opacity: 0.6;
}

.badge-display__empty,
.badge-display__error {
    text-align: center;
    padding: 2rem;
    opacity: 0.7;
}

.badge-display__retry-btn {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.25rem;
    background: #007bff;
    color: white;
    cursor: pointer;
    font-size: 1rem;
}

.badge-display__retry-btn:hover {
    background: #0056b3;
}

.badge-display__live-region {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
}

@keyframes badge-unlock {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
}

/* RTL Support */
[dir="rtl"] .badge-display__item {
    text-align: right;
}

/* Responsive */
@media (max-width: 768px) {
    .badge-display__item {
        flex-direction: column;
        text-align: center;
    }
    
    .badge-display__details {
        text-align: center;
    }
}
`;

/**
 * @license
 * Farsinglish - Badge Display Component (Enterprise Edition)
 * Released under MIT License
 */
