// ui/screens/review_screen.js
/**
 * @file صفحه مرور خالص (فقط دروس due)
 * @module ui/screens/review_screen
 * 
 * @description این صفحه فقط مسئولیت نمایش UI را دارد.
 * منطق تجاری در entity و دسترسی به داده در repository جداسازی شده است.
 * 
 * @requires ../../features/review/domain/review_entity.js
 * @requires ../../features/review/data/review_repository.js
 * @requires ../../core/state/state_manager.js
 * @requires ../../core/navigation/router.js
 * @requires ../../core/utils/logger.js
 * @requires ../../core/events/event_bus.js
 * @requires ../components/lesson_card.js
 * @requires ../components/basic_button.js
 * @requires ../components/skeleton_card.js
 */

import { stateManager } from '../../core/state/state_manager.js';
import { router } from '../../core/navigation/router.js';
import { logger } from '../../core/utils/logger.js';
import { eventBus } from '../../core/events/event_bus.js';
import { ReviewEntity } from '../../features/review/domain/review_entity.js';
import { ReviewRepository } from '../../features/review/data/review_repository.js';
import { createLessonCard } from '../components/lesson_card.js';
import { createButton } from '../components/basic_button.js';
import { createSkeletonCard } from '../components/skeleton_card.js';

export class ReviewScreen {
    /** @type {HTMLElement|null} */
    #container = null;
    
    /** @type {Function|null} */
    #unsubscribe = null;
    
    /** @type {ReviewEntity[]} */
    #dueLessons = [];
    
    /** @type {boolean} */
    #isLoading = false;
    
    /** @type {string|null} */
    #error = null;
    
    /** @type {AbortController|null} */
    #abortController = null;
    
    /** @type {ReviewRepository} */
    #repository = null;

    constructor() {
        this.#repository = new ReviewRepository();
        this._handleStateChange = this._handleStateChange.bind(this);
        this._handleRetry = this._handleRetry.bind(this);
        this._handleStartLesson = this._handleStartLesson.bind(this);
        this._handleReviewCompleted = this._handleReviewCompleted.bind(this);
    }

    /**
     * مقداردهی اولیه صفحه و رندر
     * @param {Object} config
     * @param {HTMLElement} config.container - المان میزبان (الزامی)
     * @param {string} [config.userId] - شناسه کاربر (اختیاری، از state گرفته می‌شود)
     * @throws {Error} اگر container معتبر نباشد
     */
    async init({ container, userId }) {
        if (!container || !(container instanceof HTMLElement)) {
            const error = new Error('ReviewScreen: container must be a valid HTMLElement');
            logger.error(error.message);
            throw error;
        }

        this.#container = container;
        this.#unsubscribe = stateManager.subscribe(this._handleStateChange);
        
        // اشتراک در رویدادهای مرتبط
        eventBus.on('review:completed', this._handleReviewCompleted);
        
        const targetUserId = userId || stateManager.getState()?.user?.id;
        await this._loadDueLessons(targetUserId);
    }

    /**
     * پاکسازی منابع هنگام خروج از صفحه
     */
    destroy() {
        // لغو درخواست‌های ناتمام
        this.#abortController?.abort();
        
        if (this.#unsubscribe) {
            this.#unsubscribe();
        }
        
        eventBus.off('review:completed', this._handleReviewCompleted);
        
        if (this.#container) {
            this.#container.innerHTML = '';
        }
        
        this.#container = null;
        this.#dueLessons = [];
        this.#isLoading = false;
        this.#error = null;
        this.#repository = null;
        
        logger.info('ReviewScreen: destroyed');
    }

    /**
     * واکنش به تغییرات state
     * @param {Object} newState
     * @private
     */
    _handleStateChange(newState) {
        // اگر کاربر تغییر کرد، لیست را دوباره بارگذاری کن
        const currentUser = stateManager.getState()?.user;
        if (currentUser?.id) {
            this._loadDueLessons(currentUser.id);
        }
    }

    /**
     * واکنش به اتمام مرور یک درس
     * @param {Object} data
     * @private
     */
    _handleReviewCompleted(data) {
        logger.debug('ReviewScreen: review completed event', data);
        // اگر درس مربوط به همین کاربر بود، لیست را به‌روز کن
        const currentUser = stateManager.getState()?.user;
        if (currentUser?.id === data.userId) {
            this._loadDueLessons(currentUser.id);
        }
    }

    /**
     * بارگذاری لیست درس‌های due از repository
     * @param {string} userId
     * @returns {Promise<void>}
     * @private
     */
    async _loadDueLessons(userId) {
        if (!userId) {
            this.#error = 'کاربر وارد نشده است';
            this.#isLoading = false;
            this._render();
            return;
        }

        // لغو درخواست قبلی اگر ناتمام است
        this.#abortController?.abort();
        this.#abortController = new AbortController();

        this.#isLoading = true;
        this.#error = null;
        this._render();

        const startTime = performance.now();

        try {
            const lessons = await this.#repository.getDueLessons(userId, {
                signal: this.#abortController.signal
            });

            // تبدیل به Entity برای استفاده از منطق تجاری
            this.#dueLessons = lessons.map(lesson => new ReviewEntity({
                lessonId: lesson.id,
                title: lesson.title,
                dueDate: lesson.dueDate,
                interval: lesson.interval,
                easeFactor: lesson.easeFactor
            }));

            const duration = performance.now() - startTime;
            logger.performance('ReviewScreen._loadDueLessons', duration);
            
            if (duration > 200) {
                logger.warn(`ReviewScreen: slow operation (${duration.toFixed(0)}ms)`);
            }

            logger.info(`ReviewScreen: ${this.#dueLessons.length} due lessons loaded`);

            // انتشار رویداد برای سایر ماژول‌ها
            eventBus.emit('review:list-loaded', {
                userId,
                count: this.#dueLessons.length
            });

        } catch (err) {
            if (err.name === 'AbortError') {
                logger.debug('ReviewScreen: request aborted');
                return;
            }

            this.#error = err.message || 'خطا در بارگذاری درس‌های مرور';
            logger.error('ReviewScreen: error loading due lessons', err);
            
            eventBus.emit('review:load-error', {
                userId,
                error: this.#error
            });

        } finally {
            this.#isLoading = false;
            this._render();
        }
    }

    /**
     * شروع مرور یک درس
     * @param {string} lessonId
     * @private
     */
    _handleStartLesson(lessonId) {
        const lesson = this.#dueLessons.find(l => l.lessonId === lessonId);
        if (lesson) {
            logger.info(`ReviewScreen: starting lesson ${lessonId}`);
            router.navigate('/lesson', { lessonId });
        } else {
            logger.warn(`ReviewScreen: lesson ${lessonId} not found in due list`);
        }
    }

    /**
     * تلاش مجدد برای بارگذاری
     * @private
     */
    _handleRetry() {
        const user = stateManager.getState()?.user;
        this._loadDueLessons(user?.id);
    }

    /**
     * رندر صفحه بر اساس وضعیت فعلی
     * @private
     */
    _render() {
        if (!this.#container) return;

        if (this.#isLoading) {
            this._renderLoading();
        } else if (this.#error) {
            this._renderError();
        } else if (this.#dueLessons.length === 0) {
            this._renderEmpty();
        } else {
            this._renderList();
        }
    }

    /**
     * نمایش حالت بارگذاری با اسکلتون
     * @private
     */
    _renderLoading() {
        const skeletonCards = Array(3).fill().map(() => createSkeletonCard()).join('');

        this.#container.innerHTML = `
            <div class="review-screen" role="region" aria-label="مرور امروز">
                <h1 class="review-screen__title">مرور امروز</h1>
                <div class="review-screen__skeleton" aria-busy="true" aria-label="در حال بارگذاری">
                    ${skeletonCards}
                </div>
            </div>
        `;
    }

    /**
     * نمایش خطا
     * @private
     */
    _renderError() {
        const retryButton = createButton({
            text: 'تلاش مجدد',
            onClick: this._handleRetry,
            className: 'review-screen__retry-btn',
            ariaLabel: 'تلاش مجدد برای بارگذاری'
        });

        this.#container.innerHTML = `
            <div class="review-screen review-screen--error" role="alert">
                <h1 class="review-screen__title">مرور امروز</h1>
                <p class="review-screen__error-message">${this.#error}</p>
                <div class="review-screen__retry-container"></div>
            </div>
        `;

        const retryContainer = this.#container.querySelector('.review-screen__retry-container');
        if (retryContainer) {
            retryContainer.appendChild(retryButton);
        }
    }

    /**
     * نمایش پیام خالی (بدون درس due)
     * @private
     */
    _renderEmpty() {
        const homeButton = createButton({
            text: 'برو به خانه',
            onClick: () => router.navigate('/home'),
            className: 'review-screen__home-btn',
            ariaLabel: 'بازگشت به صفحه اصلی'
        });

        this.#container.innerHTML = `
            <div class="review-screen review-screen--empty">
                <h1 class="review-screen__title">مرور امروز</h1>
                <p class="review-screen__empty-message">همه درس‌ها مرور شده‌اند. به صفحه اصلی بروید.</p>
                <div class="review-screen__home-container"></div>
            </div>
        `;

        const homeContainer = this.#container.querySelector('.review-screen__home-container');
        if (homeContainer) {
            homeContainer.appendChild(homeButton);
        }
    }

    /**
     * نمایش لیست درس‌های due
     * @private
     */
    _renderList() {
        const container = this.#container;
        
        // مرتب‌سازی بر اساس اولویت (overdue اولویت بالاتر)
        const sortedLessons = [...this.#dueLessons].sort((a, b) => {
            if (a.isOverdue() && !b.isOverdue()) return -1;
            if (!a.isOverdue() && b.isOverdue()) return 1;
            return a.calculatePriority() - b.calculatePriority();
        });

        container.innerHTML = `
            <div class="review-screen">
                <h1 class="review-screen__title">
                    مرور امروز
                    <span class="review-screen__count">${sortedLessons.length}</span>
                </h1>
                <div class="review-screen__list" id="review-lessons-list" role="list"></div>
            </div>
        `;

        const listEl = container.querySelector('#review-lessons-list');
        if (!listEl) return;

        // ایجاد کارت برای هر درس
        sortedLessons.forEach(lesson => {
            const card = createLessonCard({
                title: lesson.title,
                dueCount: lesson.dueCount,
                isOverdue: lesson.isOverdue(),
                priority: lesson.calculatePriority(),
                onStart: () => this._handleStartLesson(lesson.lessonId)
            });
            listEl.appendChild(card);
        });

        logger.debug(`ReviewScreen: rendered ${sortedLessons.length} lessons`);
    }
          }
