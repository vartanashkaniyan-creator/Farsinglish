// ui/screens/achievements_screen.js
/**
 * @fileoverview صفحه نمایش دستاوردها و نشان‌های کاربر
 * @module AchievementsScreen
 * @version 2.0.0
 * 
 * ویژگی‌های پیشرفته:
 * - Virtual Scrolling با Windowing
 * - Web Worker برای پردازش سنگین
 * - Background Sync با Service Worker
 * - Feature Flags برای کنترل تدریجی
 * - Progressive Enhancement
 */

import { StateManager } from '../../core/state/state_manager.js';
import { GamificationService } from '../../features/gamification/gamification_service.js';
import { StatsCalculator } from '../../features/stats/stats_calculator.js';
import { Logger } from '../../core/utils/logger.js';
import { OfflineManager } from '../../core/offline/offline_manager.js';
import { ErrorHandler } from '../../core/utils/error_handler.js';
import { FeatureFlags } from '../../core/config/feature_flags.js';
import { CacheManager } from '../../core/cache/cache_manager.js';

/**
 * @typedef {Object} AchievementDisplayData
 * @property {string} id - شناسه دستاورد
 * @property {string} title - عنوان نمایشی
 * @property {string} description - توضیحات
 * @property {string} icon - آیکون دستاورد
 * @property {number} progress - درصد پیشرفت (0-100)
 * @property {number} currentValue - مقدار فعلی
 * @property {number} targetValue - مقدار هدف
 * @property {Date} unlockedAt - تاریخ دریافت (اگر دریافت شده)
 * @property {boolean} isUnlocked - آیا دریافت شده
 * @property {string} rarity - ندرت (common, rare, epic, legendary)
 */

/**
 * @typedef {Object} BadgeDisplayData
 * @property {string} id - شناسه نشان
 * @property {string} name - نام نشان
 * @property {string} icon - آیکون نشان
 * @property {string} description - توضیحات
 * @property {boolean} isEarned - آیا کسب شده
 * @property {Date} earnedAt - تاریخ کسب
 */

/**
 * @typedef {Object} AchievementsScreenState
 * @property {Array<AchievementDisplayData>} achievements - لیست دستاوردها
 * @property {Array<BadgeDisplayData>} badges - لیست نشان‌ها
 * @property {Object} stats - آمار کلی
 * @property {boolean} isLoading - وضعیت بارگذاری
 * @property {string|null} error - خطای احتمالی
 * @property {boolean} isOffline - وضعیت آفلاین
 * @property {string} filterType - فیلتر نمایش (all, unlocked, locked)
 * @property {string} sortBy - مرتب‌سازی (rarity, progress, date)
 * @property {number} visibleRangeStart - برای virtual scrolling
 * @property {number} visibleRangeEnd - برای virtual scrolling
 */

class AchievementsScreen {
    #stateManager;
    #gamificationService;
    #statsCalculator;
    #logger;
    #offlineManager;
    #errorHandler;
    #containerElement;
    #unsubscribeState;
    #unsubscribeOffline;
    #currentState;
    #debouncedRender;
    #cacheManager;
    #worker = null;
    #virtualScroller = null;
    #intersectionObserver = null;
    #processedAchievements = [];
    #featureFlags;

    /**
     * ایجاد صفحه دستاوردها
     * @param {Object} dependencies - وابستگی‌های تزریق شده
     * @param {HTMLElement} containerElement - المان کانتینر صفحه
     */
    constructor(dependencies, containerElement) {
        this.#validateDependencies(dependencies);
        this.#validateContainer(containerElement);

        // تزریق وابستگی‌ها (DIP)
        this.#stateManager = dependencies.stateManager || StateManager.getInstance();
        this.#gamificationService = dependencies.gamificationService || GamificationService.getInstance();
        this.#statsCalculator = dependencies.statsCalculator || StatsCalculator.getInstance();
        this.#logger = dependencies.logger || new Logger('AchievementsScreen');
        this.#offlineManager = dependencies.offlineManager || OfflineManager.getInstance();
        this.#errorHandler = dependencies.errorHandler || ErrorHandler.getInstance();
        this.#cacheManager = dependencies.cacheManager || new CacheManager('achievements_cache', 5 * 60 * 1000);
        this.#featureFlags = FeatureFlags.getInstance();

        this.#containerElement = containerElement;
        this.#currentState = this.#getInitialState();
        
        // بهینه‌سازی رندر با debounce (Performance)
        this.#debouncedRender = this.#debounce(() => this.#render(), 100);

        this.#init();
    }

    /**
     * اعتبارسنجی وابستگی‌ها
     * @private
     */
    #validateDependencies(dependencies) {
        if (!dependencies || typeof dependencies !== 'object') {
            throw new Error(' dependencies must be an object');
        }
    }

    /**
     * اعتبارسنجی کانتینر
     * @private
     */
    #validateContainer(container) {
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('container must be a valid HTMLElement');
        }
    }

    /**
     * وضعیت اولیه صفحه
     * @private
     * @returns {AchievementsScreenState}
     */
    #getInitialState() {
        return {
            achievements: [],
            badges: [],
            stats: {
                totalPoints: 0,
                achievementsUnlocked: 0,
                totalAchievements: 0,
                currentStreak: 0,
                longestStreak: 0,
                totalStudyTime: 0
            },
            isLoading: true,
            error: null,
            isOffline: false,
            filterType: 'all',
            sortBy: 'progress',
            visibleRangeStart: 0,
            visibleRangeEnd: 20
        };
    }

    /**
     * مقداردهی اولیه صفحه
     * @private
     */
    async #init() {
        try {
            this.#logger.info('Initializing achievements screen');

            // اشتراک در وضعیت (State Management)
            this.#unsubscribeState = this.#stateManager.subscribe(
                state => state.achievements,
                this.#handleStateChange.bind(this)
            );

            // پایش وضعیت آفلاین (Offline First)
            this.#unsubscribeOffline = this.#offlineManager.onStatusChange(
                this.#handleOfflineChange.bind(this)
            );

            // راه‌اندازی قابلیت‌های پیشرفته با Feature Flags
            await this.#setupAdvancedFeatures();

            // بارگذاری اولیه داده‌ها
            await this.#loadData();

            // ثبت رویداد مشاهده صفحه (Telemetry)
            this.#trackScreenView();

        } catch (error) {
            this.#handleError('Failed to initialize achievements screen', error);
        }
    }

    /**
     * راه‌اندازی قابلیت‌های پیشرفته با Progressive Enhancement
     * @private
     */
    async #setupAdvancedFeatures() {
        // 1️⃣ Virtual Scrolling (Feature Flag: VIRTUAL_SCROLL)
        if (this.#featureFlags.isEnabled('VIRTUAL_SCROLL')) {
            await this.#setupVirtualScrolling();
        }

        // 2️⃣ Web Worker (Feature Flag: WEB_WORKER)
        if (this.#featureFlags.isEnabled('WEB_WORKER') && window.Worker) {
            await this.#setupWebWorker();
        }

        // 3️⃣ Background Sync (Feature Flag: BACKGROUND_SYNC)
        if (this.#featureFlags.isEnabled('BACKGROUND_SYNC') && 'serviceWorker' in navigator) {
            await this.#setupBackgroundSync();
        }

        // 4️⃣ Intersection Observer (همیشه فعال - Progressive Enhancement)
        if (window.IntersectionObserver) {
            await this.#setupIntersectionObserver();
        }
    }

    /**
     * 1️⃣ راه‌اندازی Virtual Scrolling
     * @private
     */
    async #setupVirtualScrolling() {
        try {
            this.#logger.info('Setting up virtual scrolling');
            
            // Dynamic Import برای کاهش bundle size
            const { VirtualScroller } = await import(
                /* webpackChunkName: "virtual-scroller" */
                '../../core/ui/virtual_scroller.js'
            );

            this.#virtualScroller = new VirtualScroller(this.#containerElement, {
                itemHeight: 120,
                overscan: 5,
                initialRender: 20,
                onRangeChange: (start, end) => {
                    this.#updateState({
                        visibleRangeStart: start,
                        visibleRangeEnd: end
                    });
                }
            });

            this.#logger.debug('Virtual scrolling initialized');

        } catch (error) {
            this.#logger.warn('Virtual scrolling failed to initialize', error);
            // Progressive Enhancement: اگر failed، بدون virtual scrolling کار می‌کنه
        }
    }

    /**
     * 2️⃣ راه‌اندازی Web Worker
     * @private
     */
    async #setupWebWorker() {
        try {
            this.#logger.info('Setting up web worker');

            this.#worker = new Worker('/workers/achievement_processor.js');
            
            this.#worker.onmessage = (event) => {
                const { type, data } = event.data;
                
                if (type === 'PROCESSED_ACHIEVEMENTS') {
                    this.#processedAchievements = data;
                    this.#debouncedRender();
                    
                    this.#logger.debug('Achievements processed by worker', {
                        count: data.length
                    });
                }
            };

            this.#worker.onerror = (error) => {
                this.#logger.error('Web worker error', error);
                this.#worker?.terminate();
                this.#worker = null;
            };

        } catch (error) {
            this.#logger.warn('Web worker failed to initialize', error);
            this.#worker = null; // Progressive Enhancement
        }
    }

    /**
     * 3️⃣ راه‌اندازی Background Sync
     * @private
     */
    async #setupBackgroundSync() {
        try {
            if (!('serviceWorker' in navigator) || !('SyncManager' in window)) {
                this.#logger.debug('Background sync not supported');
                return;
            }

            const registration = await navigator.serviceWorker.ready;
            
            // ثبت برای sync
            await registration.sync.register('sync-achievements');
            
            this.#logger.info('Background sync registered');

            // گوش دادن به رویدادهای sync
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data?.type === 'SYNC_COMPLETED') {
                    this.#logger.debug('Background sync completed');
                    if (!this.#currentState.isOffline) {
                        this.#loadData(); // ریفرش داده‌ها بعد از sync
                    }
                }
            });

        } catch (error) {
            this.#logger.warn('Background sync failed to register', error);
            // Progressive Enhancement: بدون sync هم کار می‌کنه
        }
    }

    /**
     * 4️⃣ راه‌اندازی Intersection Observer (Progressive Enhancement)
     * @private
     */
    async #setupIntersectionObserver() {
        try {
            const options = {
                threshold: 0.1,
                rootMargin: '100px'
            };

            this.#intersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const element = entry.target;
                        
                        // Lazy load badge images
                        if (element.dataset.badgeId && !element.querySelector('img')) {
                            this.#loadBadgeImage(element);
                        }
                        
                        // Track view for analytics
                        if (element.dataset.achievementId) {
                            this.#trackAchievementView(element.dataset.achievementId);
                        }
                        
                        this.#intersectionObserver?.unobserve(element);
                    }
                });
            }, options);

            this.#logger.debug('Intersection observer initialized');

        } catch (error) {
            this.#logger.warn('Intersection observer failed', error);
            // Progressive Enhancement: بدون observer هم کار می‌کنه
        }
    }

    /**
     * بارگذاری داده‌ها با Cache First Strategy
     * @private
     */
    async #loadData() {
        this.#updateState({ isLoading: true, error: null });

        try {
            // تلاش برای دریافت از کش (Cache First)
            const cachedData = await this.#getCachedData();
            
            if (cachedData) {
                this.#processAndUpdateData(cachedData);
                
                // اگر آنلاین هستیم، داده‌های تازه رو بگیر (Background Update)
                if (!this.#currentState.isOffline) {
                    this.#fetchFreshData();
                }
            } else {
                // اگر کش نداریم، مستقیم از سرور بگیر
                await this.#fetchFreshData();
            }

        } catch (error) {
            this.#updateState({
                isLoading: false,
                error: 'Failed to load achievements. Please try again.'
            });
            throw error;
        }
    }

    /**
     * دریافت داده از کش
     * @private
     */
    async #getCachedData() {
        try {
            const [achievements, badges, stats] = await Promise.all([
                this.#cacheManager.get('achievements'),
                this.#cacheManager.get('badges'),
                this.#cacheManager.get('stats')
            ]);

            if (achievements && badges && stats) {
                this.#logger.debug('Loaded data from cache');
                return { achievements, badges, stats };
            }

            return null;

        } catch (error) {
            this.#logger.warn('Failed to load from cache', error);
            return null;
        }
    }

    /**
     * دریافت داده تازه از سرور
     * @private
     */
    async #fetchFreshData() {
        try {
            const [achievements, badges, stats] = await Promise.all([
                this.#loadAchievementsWithRetry(),
                this.#loadBadges(),
                this.#loadStats()
            ]);

            // ذخیره در کش
            await Promise.all([
                this.#cacheManager.set('achievements', achievements),
                this.#cacheManager.set('badges', badges),
                this.#cacheManager.set('stats', stats)
            ]);

            this.#processAndUpdateData({ achievements, badges, stats });

        } catch (error) {
            this.#logger.error('Failed to fetch fresh data', error);
            
            // اگر داده‌ای در state نیست و خطا خوردیم، خطا نشون بده
            if (this.#currentState.achievements.length === 0) {
                throw error;
            }
        }
    }

    /**
     * پردازش و به‌روزرسانی داده‌ها
     * @private
     */
    #processAndUpdateData({ achievements, badges, stats }) {
        // اگر Web Worker فعاله، پردازش رو به اون بسپار
        if (this.#worker && this.#featureFlags.isEnabled('WEB_WORKER')) {
            this.#worker.postMessage({
                type: 'PROCESS_ACHIEVEMENTS',
                data: {
                    achievements,
                    filterType: this.#currentState.filterType,
                    sortBy: this.#currentState.sortBy
                }
            });
        }

        // پردازش نهایی و به‌روزرسانی state
        const processedAchievements = this.#processAchievements(achievements);
        const processedBadges = this.#processBadges(badges);
        const processedStats = this.#processStats(stats);

        this.#updateState({
            achievements: processedAchievements,
            badges: processedBadges,
            stats: processedStats,
            isLoading: false
        });

        this.#logger.debug('Data updated successfully', {
            achievementsCount: achievements.length,
            badgesCount: badges.length
        });
    }

    /**
     * بارگذاری دستاوردها با Retry mechanism
     * @private
     */
    async #loadAchievementsWithRetry(retries = 3) {
        let lastError;

        for (let i = 0; i < retries; i++) {
            try {
                return await this.#gamificationService.getAllAchievements();
            } catch (error) {
                lastError = error;
                this.#logger.warn(`Retry ${i + 1}/${retries} loading achievements`);
                await this.#delay(1000 * Math.pow(2, i));
            }
        }

        throw lastError;
    }

    /**
     * بارگذاری نشان‌ها
     * @private
     */
    async #loadBadges() {
        return this.#gamificationService.getUserBadges();
    }

    /**
     * بارگذاری آمار
     * @private
     */
    async #loadStats() {
        const stats = await this.#statsCalculator.calculateUserStats();
        return {
            totalPoints: stats.totalPoints,
            achievementsUnlocked: stats.achievementsUnlocked,
            totalAchievements: stats.totalAchievements,
            currentStreak: stats.currentStreak,
            longestStreak: stats.longestStreak,
            totalStudyTime: stats.totalStudyTime
        };
    }

    /**
     * پردازش دستاوردها برای نمایش
     * @private
     */
    #processAchievements(achievements) {
        return achievements
            .map(achievement => ({
                ...achievement,
                progress: this.#calculateProgress(achievement),
                rarity: this.#determineRarity(achievement)
            }))
            .filter(achievement => this.#applyFilter(achievement))
            .sort((a, b) => this.#applySort(a, b));
    }

    /**
     * محاسبه درصد پیشرفت
     * @private
     */
    #calculateProgress(achievement) {
        if (achievement.isUnlocked) return 100;
        if (!achievement.targetValue) return 0;
        
        const progress = (achievement.currentValue / achievement.targetValue) * 100;
        return Math.min(100, Math.max(0, progress));
    }

    /**
     * تعیین سطح ندرت
     * @private
     */
    #determineRarity(achievement) {
        if (achievement.isUnlocked) {
            if (achievement.targetValue > 1000) return 'legendary';
            if (achievement.targetValue > 500) return 'epic';
            if (achievement.targetValue > 100) return 'rare';
        }
        return 'common';
    }

    /**
     * پردازش نشان‌ها
     * @private
     */
    #processBadges(badges) {
        return badges.sort((a, b) => {
            if (a.isEarned && !b.isEarned) return -1;
            if (!a.isEarned && b.isEarned) return 1;
            return 0;
        });
    }

    /**
     * پردازش آمار
     * @private
     */
    #processStats(stats) {
        return stats;
    }

    /**
     * مدیریت تغییر وضعیت
     * @private
     */
    #handleStateChange(newAchievementsState) {
        this.#logger.debug('State changed', newAchievementsState);
        this.#debouncedRender();
    }

    /**
     * مدیریت تغییر وضعیت آفلاین
     * @private
     */
    #handleOfflineChange(isOffline) {
        this.#updateState({ isOffline });
        
        if (!isOffline && this.#currentState.error) {
            this.#loadData();
        }
    }

    /**
     * به‌روزرسانی وضعیت (Immutability)
     * @private
     */
    #updateState(newState) {
        this.#currentState = {
            ...this.#currentState,
            ...newState
        };
        this.#debouncedRender();
    }

    /**
     * اعمال فیلتر
     * @private
     */
    #applyFilter(achievement) {
        switch (this.#currentState.filterType) {
            case 'unlocked':
                return achievement.isUnlocked;
            case 'locked':
                return !achievement.isUnlocked;
            default:
                return true;
        }
    }

    /**
     * اعمال مرتب‌سازی
     * @private
     */
    #applySort(a, b) {
        switch (this.#currentState.sortBy) {
            case 'rarity':
                const rarityWeight = { legendary: 4, epic: 3, rare: 2, common: 1 };
                return rarityWeight[b.rarity] - rarityWeight[a.rarity];
            
            case 'progress':
                return b.progress - a.progress;
            
            case 'date':
                if (a.unlockedAt && b.unlockedAt) {
                    return b.unlockedAt - a.unlockedAt;
                }
                if (a.unlockedAt) return -1;
                if (b.unlockedAt) return 1;
                return 0;
            
            default:
                return 0;
        }
    }

    /**
     * رندر صفحه با Virtual DOM ساده
     * @private
     */
    #render() {
        try {
            this.#logger.debug('Rendering achievements screen');

            const html = this.#generateHTML();
            this.#containerElement.innerHTML = html;
            
            this.#attachEventListeners();
            this.#renderSkeletonIfLoading();
            
            // مشاهده آیتم‌ها برای Intersection Observer
            if (this.#intersectionObserver) {
                this.#observeItems();
            }

        } catch (error) {
            this.#handleError('Failed to render achievements screen', error);
        }
    }

    /**
     * مشاهده آیتم‌ها برای Lazy Loading
     * @private
     */
    #observeItems() {
        const items = this.#containerElement.querySelectorAll('[data-achievement-id], [data-badge-id]');
        items.forEach(item => this.#intersectionObserver?.observe(item));
    }

    /**
     * بارگذاری تصویر نشان
     * @private
     */
    #loadBadgeImage(element) {
        const badgeId = element.dataset.badgeId;
        if (!badgeId) return;

        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = `/assets/badges/${badgeId}.svg`;
        img.alt = element.querySelector('.badge-name')?.textContent || 'Badge';
        
        element.querySelector('.badge-icon')?.appendChild(img);
    }

    /**
     * تولید HTML با قالب‌بندی
     * @private
     */
    #generateHTML() {
        const { isLoading, error, isOffline, stats, achievements, badges } = this.#currentState;

        if (error) {
            return this.#getErrorTemplate(error);
        }

        if (isLoading) {
            return this.#getSkeletonTemplate();
        }

        // اگر Virtual Scrolling فعاله، فقط آیتم‌های محدوده رو رندر کن
        let achievementsToRender = achievements;
        if (this.#virtualScroller && this.#featureFlags.isEnabled('VIRTUAL_SCROLL')) {
            const { visibleRangeStart, visibleRangeEnd } = this.#currentState;
            achievementsToRender = achievements.slice(visibleRangeStart, visibleRangeEnd);
        }

        return `
            <div class="achievements-screen" dir="rtl">
                ${this.#getOfflineBanner(isOffline)}
                ${this.#getStatsHeader(stats)}
                ${this.#getFilterBar()}
                ${this.#getBadgesSection(badges)}
                ${this.#getAchievementsSection(achievementsToRender)}
                ${this.#getVirtualScrollSentinel()}
            </div>
        `;
    }

    /**
     * قالب بنر آفلاین
     * @private
     */
    #getOfflineBanner(isOffline) {
        if (!isOffline) return '';
        
        return `
            <div class="offline-banner" role="alert">
                <span class="icon">📴</span>
                <span>شما در حالت آفلاین هستید. داده‌ها ممکن است به‌روز نباشند.</span>
            </div>
        `;
    }

    /**
     * قالب هدر آمار
     * @private
     */
    #getStatsHeader(stats) {
        return `
            <header class="stats-header">
                <div class="stat-card">
                    <span class="stat-value">${stats.totalPoints}</span>
                    <span class="stat-label">امتیاز کل</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${stats.achievementsUnlocked}/${stats.totalAchievements}</span>
                    <span class="stat-label">دستاوردها</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${stats.currentStreak}</span>
                    <span class="stat-label">روزهای پیاپی</span>
                </div>
            </header>
        `;
    }

    /**
     * قالب نوار فیلتر
     * @private
     */
    #getFilterBar() {
        return `
            <div class="filter-bar">
                <select class="filter-select" aria-label="فیلتر دستاوردها" data-filter="filterType">
                    <option value="all" ${this.#currentState.filterType === 'all' ? 'selected' : ''}>همه</option>
                    <option value="unlocked" ${this.#currentState.filterType === 'unlocked' ? 'selected' : ''}>دریافت شده</option>
                    <option value="locked" ${this.#currentState.filterType === 'locked' ? 'selected' : ''}>دریافت نشده</option>
                </select>
                
                <select class="sort-select" aria-label="مرتب‌سازی" data-filter="sortBy">
                    <option value="progress" ${this.#currentState.sortBy === 'progress' ? 'selected' : ''}>براساس پیشرفت</option>
                    <option value="rarity" ${this.#currentState.sortBy === 'rarity' ? 'selected' : ''}>براساس کمیابی</option>
                    <option value="date" ${this.#currentState.sortBy === 'date' ? 'selected' : ''}>براساس تاریخ</option>
                </select>
            </div>
        `;
    }

    /**
     * قالب بخش نشان‌ها
     * @private
     */
    #getBadgesSection(badges) {
        if (!badges.length) return '';

        return `
            <section class="badges-section">
                <h2 class="section-title">نشان‌های من</h2>
                <div class="badges-grid">
                    ${badges.map(badge => this.#getBadgeCard(badge)).join('')}
                </div>
            </section>
        `;
    }

    /**
     * قالب کارت نشان
     * @private
     */
    #getBadgeCard(badge) {
        const earnedClass = badge.isEarned ? 'earned' : 'locked';
        const earnedLabel = badge.isEarned ? 
            `دریافت شده در ${new Date(badge.earnedAt).toLocaleDateString('fa-IR')}` : 
            'دریافت نشده';

        return `
            <div class="badge-card ${earnedClass}" role="article" data-badge-id="${badge.id}">
                <div class="badge-icon">${badge.icon}</div>
                <div class="badge-info">
                    <h3 class="badge-name">${badge.name}</h3>
                    <p class="badge-description">${badge.description}</p>
                    <span class="badge-date">${earnedLabel}</span>
                </div>
            </div>
        `;
    }

    /**
     * قالب بخش دستاوردها
     * @private
     */
    #getAchievementsSection(achievements) {
        return `
            <section class="achievements-section">
                <h2 class="section-title">دستاوردها</h2>
                <div class="achievements-list">
                    ${achievements.map(achievement => this.#getAchievementCard(achievement)).join('')}
                </div>
            </section>
        `;
    }

    /**
     * قالب کارت دستاورد
     * @private
     */
    #getAchievementCard(achievement) {
        const unlockedClass = achievement.isUnlocked ? 'unlocked' : 'locked';
        const progressBarStyle = `width: ${achievement.progress}%`;

        return `
            <div class="achievement-card ${unlockedClass} rarity-${achievement.rarity}" 
                 role="article" 
                 data-achievement-id="${achievement.id}"
                 data-achievement-progress="${achievement.progress}">
                <div class="achievement-header">
                    <div class="achievement-icon">${achievement.icon}</div>
                    <div class="achievement-title">
                        <h3>${achievement.title}</h3>
                        <span class="achievement-rarity">${this.#getRarityLabel(achievement.rarity)}</span>
                    </div>
                </div>
                
                <p class="achievement-description">${achievement.description}</p>
                
                <div class="achievement-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="${progressBarStyle}"></div>
                    </div>
                    <span class="progress-text">
                        ${achievement.currentValue}/${achievement.targetValue} (${Math.round(achievement.progress)}%)
                    </span>
                </div>
                
                ${achievement.isUnlocked ? `
                    <span class="unlocked-date">
                        دریافت شده در ${new Date(achievement.unlockedAt).toLocaleDateString('fa-IR')}
                    </span>
                ` : ''}
            </div>
        `;
    }

    /**
     * سنتینل برای Virtual Scrolling
     * @private
     */
    #getVirtualScrollSentinel() {
        if (!this.#virtualScroller || !this.#featureFlags.isEnabled('VIRTUAL_SCROLL')) {
            return '';
        }

        return `
            <div class="scroll-sentinel" data-scroll-sentinel></div>
            ${this.#currentState.visibleRangeEnd < this.#currentState.achievements.length ? `
                <div class="loading-more">در حال بارگذاری بیشتر...</div>
            ` : ''}
        `;
    }

    /**
     * دریافت برچسب فارسی برای ندرت
     * @private
     */
    #getRarityLabel(rarity) {
        const labels = {
            common: 'معمولی',
            rare: 'کمیاب',
            epic: 'حماسی',
            legendary: 'افسانه‌ای'
        };
        return labels[rarity] || rarity;
    }

    /**
     * قالب خطا
     * @private
     */
    #getErrorTemplate(error) {
        return `
            <div class="error-container" role="alert">
                <span class="error-icon">⚠️</span>
                <p class="error-message">${error}</p>
                <button class="retry-button" onclick="window.location.reload()">
                    تلاش مجدد
                </button>
            </div>
        `;
    }

    /**
     * قالب Skeleton برای حالت بارگذاری
     * @private
     */
    #getSkeletonTemplate() {
        return `
            <div class="skeleton-screen">
                <div class="skeleton-stats">
                    ${Array(3).fill().map(() => `
                        <div class="skeleton-stat">
                            <div class="skeleton-value"></div>
                            <div class="skeleton-label"></div>
                        </div>
                    `).join('')}
                </div>
                <div class="skeleton-badges">
                    ${Array(4).fill().map(() => `
                        <div class="skeleton-badge"></div>
                    `).join('')}
                </div>
                <div class="skeleton-achievements">
                    ${Array(3).fill().map(() => `
                        <div class="skeleton-achievement">
                            <div class="skeleton-icon"></div>
                            <div class="skeleton-content"></div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * رندر Skeleton در حالت بارگذاری
     * @private
     */
    #renderSkeletonIfLoading() {
        if (this.#currentState.isLoading) {
            const style = document.createElement('style');
            style.textContent = `
                @keyframes shimmer {
                    0% { background-position: -1000px 0; }
                    100% { background-position: 1000px 0; }
                }
                .skeleton-screen > * {
                    animation: shimmer 2s infinite linear;
                    background: linear-gradient(to right, #f0f0f0 8%, #e0e0e0 18%, #f0f0f0 33%);
                    background-size: 2000px 100%;
                }
            `;
            this.#containerElement.appendChild(style);
        }
    }

    /**
     * اتصال رویدادها (Separation of Concerns)
     * @private
     */
    #attachEventListeners() {
        // فیلترها
        const filterSelects = this.#containerElement.querySelectorAll('[data-filter]');
        filterSelects.forEach(select => {
            select.addEventListener('change', (event) => {
                const filterName = event.target.dataset.filter;
                const filterValue = event.target.value;
                
                this.#updateState({ [filterName]: filterValue });
                this.#trackFilterUsage(filterName, filterValue);
            });
        });

        // کلیک روی کارت‌ها برای جزئیات
        const achievementCards = this.#containerElement.querySelectorAll('.achievement-card');
        achievementCards.forEach(card => {
            card.addEventListener('click', this.#handleAchievementClick.bind(this));
        });

        // Scroll sentinel برای virtual scrolling
        const sentinel = this.#containerElement.querySelector('[data-scroll-sentinel]');
        if (sentinel && this.#virtualScroller) {
            const observer = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    this.#virtualScroller.loadMore();
                }
            });
            observer.observe(sentinel);
        }
    }

    /**
     * مدیریت کلیک روی دستاورد
     * @private
     */
    #handleAchievementClick(event) {
        const card = event.currentTarget;
        const achievementId = card.dataset.achievementId;
        
        if (achievementId) {
            this.#trackAchievementView(achievementId);
        }
    }

    /**
     * ثبت رویداد مشاهده صفحه (Telemetry)
     * @private
     */
    #trackScreenView() {
        if (window.analytics) {
            window.analytics.track('screen_view', {
                screen_name: 'achievements',
                timestamp: new Date().toISOString(),
                features: {
                    virtualScroll: this.#featureFlags.isEnabled('VIRTUAL_SCROLL'),
                    webWorker: this.#featureFlags.isEnabled('WEB_WORKER'),
                    backgroundSync: this.#featureFlags.isEnabled('BACKGROUND_SYNC')
                }
            });
        }
    }

    /**
     * ثبت رویداد استفاده از فیلتر
     * @private
     */
    #trackFilterUsage(filterName, filterValue) {
        if (window.analytics) {
            window.analytics.track('filter_used', {
                filter_name: filterName,
                filter_value: filterValue,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * ثبت رویداد مشاهده دستاورد
     * @private
     */
    #trackAchievementView(achievementId) {
        if (window.analytics) {
            window.analytics.track('achievement_viewed', {
                achievement_id: achievementId,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * مدیریت خطاها (Error Handling)
     * @private
     */
    #handleError(context, error) {
        this.#logger.error(context, error);
        
        this.#errorHandler.handle(error, {
            context,
            screen: 'achievements',
            fatal: false
        });

        this.#updateState({
            error: 'متأسفانه خطایی رخ داد. لطفاً دوباره تلاش کنید.',
            isLoading: false
        });
    }

    /**
     * تاخیر برای Retry mechanism
     * @private
     */
    #delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Debounce برای بهینه‌سازی رندر
     * @private
     */
    #debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    /**
     * پاکسازی منابع (Lifecycle Management)
     */
    destroy() {
        this.#logger.info('Destroying achievements screen');

        if (this.#unsubscribeState) {
            this.#unsubscribeState();
        }

        if (this.#unsubscribeOffline) {
            this.#unsubscribeOffline();
        }

        if (this.#worker) {
            this.#worker.terminate();
            this.#worker = null;
        }

        if (this.#virtualScroller) {
            this.#virtualScroller.destroy();
            this.#virtualScroller = null;
        }

        if (this.#intersectionObserver) {
            this.#intersectionObserver.disconnect();
            this.#intersectionObserver = null;
        }

        this.#containerElement.innerHTML = '';
        this.#currentState = null;
    }
}

// core/config/feature_flags.js
/**
 * @fileoverview مدیریت فیچر فلگ‌های برنامه
 * @module FeatureFlags
 */

export class FeatureFlags {
    static #instance;
    #flags = new Map();
    #listeners = new Set();

    constructor() {
        if (FeatureFlags.#instance) {
            return FeatureFlags.#instance;
        }

        this.#loadFlags();
        FeatureFlags.#instance = this;
    }

    static getInstance() {
        if (!FeatureFlags.#instance) {
            FeatureFlags.#instance = new FeatureFlags();
        }
        return FeatureFlags.#instance;
    }

    #loadFlags() {
        // فیچر فلگ‌های پیش‌فرض
        const defaultFlags = {
            // قابلیت‌های اصلی
            VIRTUAL_SCROLL: true,      // Virtual scrolling برای لیست‌های بلند
            WEB_WORKER: true,           // Web Worker برای پردازش سنگین
            BACKGROUND_SYNC: true,      // Background sync برای آفلاین
            
            // قابلیت‌های آزمایشی (۵۰٪ کاربران)
            ANIMATED_BADGES: Math.random() > 0.5,
            CONFETTI_ON_UNLOCK: Math.random() > 0.5,
            
            // همیشه فعال
            OFFLINE_FIRST: true,
            ANALYTICS: true
        };

        // تلاش برای دریافت از localStorage
        try {
            const saved = localStorage.getItem('feature_flags');
            if (saved) {
                const parsed = JSON.parse(saved);
                Object.keys(defaultFlags).forEach(key => {
                    this.#flags.set(key, parsed[key] ?? defaultFlags[key]);
                });
            } else {
                Object.keys(defaultFlags).forEach(key => {
                    this.#flags.set(key, defaultFlags[key]);
                });
            }
        } catch {
            Object.keys(defaultFlags).forEach(key => {
                this.#flags.set(key, defaultFlags[key]);
            });
        }
    }

    isEnabled(flagName) {
        return this.#flags.get(flagName) ?? false;
    }

    setFlag(flagName, value) {
        this.#flags.set(flagName, value);
        this.#saveToStorage();
        this.#notifyListeners(flagName, value);
    }

    #saveToStorage() {
        try {
            const flags = {};
            this.#flags.forEach((value, key) => {
                flags[key] = value;
            });
            localStorage.setItem('feature_flags', JSON.stringify(flags));
        } catch (error) {
            console.error('Failed to save feature flags:', error);
        }
    }

    subscribe(listener) {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    #notifyListeners(flagName, value) {
        this.#listeners.forEach(listener => {
            try {
                listener(flagName, value);
            } catch (error) {
                console.error('Listener error:', error);
            }
        });
    }

    getAllFlags() {
        const flags = {};
        this.#flags.forEach((value, key) => {
            flags[key] = value;
        });
        return flags;
    }
}

export default AchievementsScreen;
