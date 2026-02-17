// ui/screens/review_screen_final.js
/**
 * @file صفحه مرور هوشمند نهایی (ادغام دو فایل قبلی)
 * @module ui/screens/review_screen_final
 * 
 * @description این صفحه ترکیبی از نقاط قوت هر دو فایل است:
 * - از فایل قدیمی: UI غنی، کامپوننت‌ها، استایل‌ها، کیبورد
 * - از فایل جدید: معماری لایه‌ای، EventBus, Telemetry, AbortController
 * 
 * @requires ../../core/state/state_manager.js
 * @requires ../../core/navigation/router.js
 * @requires ../../core/utils/logger.js
 * @requires ../../core/events/event_bus.js
 * @requires ../../core/telemetry/performance_decorator.js
 * @requires ../../features/review/domain/review_entity.js
 * @requires ../../features/review/domain/review_enums.js
 * @requires ../../features/review/data/review_repository.js
 * @requires ../components/review/review_card.js
 * @requires ../components/review/progress_indicator.js
 * @requires ../components/review/stats_display.js
 */

import { stateManager } from '../../core/state/state_manager.js';
import { router } from '../../core/navigation/router.js';
import { logger } from '../../core/utils/logger.js';
import { eventBus } from '../../core/events/event_bus.js';
import { measure } from '../../core/telemetry/performance_decorator.js';
import { ReviewEntity } from '../../features/review/domain/review_entity.js';
import { ReviewState, ReviewType, AnswerQuality } from '../../features/review/domain/review_enums.js';
import { ReviewRepository } from '../../features/review/data/review_repository.js';
import { ReviewCardComponent } from '../components/review/review_card.js';
import { ReviewProgressIndicator } from '../components/review/progress_indicator.js';
import { ReviewStatsDisplay } from '../components/review/stats_display.js';

export class ReviewScreen {
    /** @type {HTMLElement|null} */
    #container = null;
    
    /** @type {Function|null} */
    #unsubscribe = null;
    
    /** @type {ReviewEntity[]} */
    #dueLessons = [];
    
    /** @type {string} */
    #state = ReviewState.LOADING;
    
    /** @type {string|null} */
    #error = null;
    
    /** @type {AbortController|null} */
    #abortController = null;
    
    /** @type {ReviewRepository} */
    #repository = null;
    
    /** @type {ReviewCardComponent|null} */
    #cardComponent = null;
    
    /** @type {ReviewProgressIndicator|null} */
    #progressIndicator = null;
    
    /** @type {ReviewStatsDisplay|null} */
    #statsDisplay = null;
    
    /** @type {Object} */
    #session = null;
    
    /** @type {string|null} */
    #userId = null;

    constructor() {
        this.#repository = new ReviewRepository();
        this._handleStateChange = this._handleStateChange.bind(this);
        this._handleRetry = this._handleRetry.bind(this);
        this._handleStartLesson = this._handleStartLesson.bind(this);
        this._handleReviewCompleted = this._handleReviewCompleted.bind(this);
        this._handleKeyDown = this._handleKeyDown.bind(this);
    }

    /**
     * مقداردهی اولیه صفحه
     * @param {Object} config
     * @param {HTMLElement} config.container - المان میزبان
     * @param {Object} config.options - گزینه‌های نمایش
     */
    async init({ container, options = {} }) {
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('ReviewScreen: container must be a valid HTMLElement');
        }

        this.#container = container;
        this.options = {
            showStats: options.showStats ?? true,
            autoPlay: options.autoPlay ?? false,
            reviewLimit: options.reviewLimit || 20,
            ...options
        };

        this.#unsubscribe = stateManager.subscribe(this._handleStateChange);
        eventBus.on('review:completed', this._handleReviewCompleted);
        document.addEventListener('keydown', this._handleKeyDown);

        await this._loadUserData();
        this._createStructure();
        
        if (this.options.showStats) {
            await this._loadReviewStats();
        }
        
        await this._startReview();
    }

    /**
     * پاکسازی منابع
     */
    destroy() {
        this.#abortController?.abort();
        this.#unsubscribe?.();
        eventBus.off('review:completed', this._handleReviewCompleted);
        document.removeEventListener('keydown', this._handleKeyDown);
        
        this.#cardComponent?.destroy();
        this.#progressIndicator?.destroy();
        this.#statsDisplay?.destroy();
        
        if (this.#container) {
            this.#container.innerHTML = '';
        }
        
        this.#resetState();
        logger.info('ReviewScreen: destroyed');
    }

    /**
     * بارگذاری داده‌های کاربر
     */
    async _loadUserData() {
        const authState = stateManager.getState()?.auth;
        this.#userId = authState?.user?.id || null;
    }

    /**
     * بارگذاری آمار مرور
     */
    @measure('ReviewScreen', '_loadReviewStats')
    async _loadReviewStats() {
        try {
            if (!this.#userId) return;

            const stats = await this.#repository.getStatistics(this.#userId);
            
            if (stats && this.options.showStats) {
                this.#statsDisplay = new ReviewStatsDisplay(
                    this.#container.querySelector('.review_stats_container')
                );
                this.#statsDisplay.render(stats);
            }
        } catch (error) {
            logger.error('Error loading review stats:', error);
        }
    }

    /**
     * شروع جلسه مرور
     */
    @measure('ReviewScreen', '_startReview')
    async _startReview() {
        try {
            this._setState(ReviewState.LOADING);
            this._showLoading();

            if (!this.#userId) {
                throw new Error('User not authenticated');
            }

            this.#abortController = new AbortController();

            const dueCards = await this.#repository.getDueCards(
                this.#userId,
                this.options.reviewLimit,
                { signal: this.#abortController.signal }
            );

            if (!dueCards || dueCards.length === 0) {
                this._setState(ReviewState.EMPTY);
                this._showEmptyState();
                return;
            }

            this.#dueLessons = dueCards.map(card => new ReviewEntity(card));
            
            this.#session = {
                id: `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                userId: this.#userId,
                cards: this.#dueLessons,
                currentIndex: 0,
                results: [],
                stats: {
                    totalCards: this.#dueLessons.length,
                    reviewed: 0,
                    correct: 0,
                    wrong: 0,
                    startTime: Date.now()
                }
            };

            this.#progressIndicator = new ReviewProgressIndicator(
                this.#container.querySelector('.review_progress_container')
            );
            this.#progressIndicator.render(this.#session);

            await this._showCurrentCard();

            this._setState(ReviewState.IN_PROGRESS);
            this._hideLoading();

            eventBus.emit('review:started', {
                userId: this.#userId,
                count: this.#dueLessons.length
            });

        } catch (error) {
            if (error.name === 'AbortError') return;
            
            logger.error('Error starting review:', error);
            this._setState(ReviewState.ERROR);
            this._showError(error.message);
        }
    }

    /**
     * نمایش کارت فعلی
     */
    async _showCurrentCard() {
        if (!this.#session || !this.#session.cards[this.#session.currentIndex]) return;

        this.#cardComponent?.destroy();

        const card = this.#session.cards[this.#session.currentIndex];
        const cardContainer = this.#container.querySelector('.review_card_container');

        this.#cardComponent = new ReviewCardComponent(cardContainer, {
            onFlip: (card) => this._handleCardFlip(card),
            onAnswer: (quality) => this._handleAnswer(quality)
        });

        this.#cardComponent.render(card);
        this.#progressIndicator?.update(this.#session);
    }

    /**
     * مدیریت پاسخ کاربر
     * @param {number} quality - کیفیت پاسخ (0-5)
     */
    @measure('ReviewScreen', '_handleAnswer')
    async _handleAnswer(quality) {
        try {
            const currentCard = this.#session.cards[this.#session.currentIndex];
            const responseTime = Date.now() - this.#session.stats.startTime;

            const result = {
                cardId: currentCard.id,
                quality,
                responseTime,
                timestamp: Date.now(),
                isCorrect: quality >= 3
            };

            this.#session.results.push(result);
            this.#session.stats.reviewed++;
            
            if (result.isCorrect) {
                this.#session.stats.correct++;
            } else {
                this.#session.stats.wrong++;
            }

            await this.#repository.submitReview(currentCard.id, {
                quality,
                responseTime
            });

            this.#progressIndicator?.update(this.#session);

            if (this.#session.currentIndex >= this.#session.cards.length - 1) {
                await this._completeReview();
            } else {
                this.#session.currentIndex++;
                await this._showCurrentCard();
            }

            eventBus.emit('review:answered', {
                userId: this.#userId,
                cardId: currentCard.id,
                quality
            });

        } catch (error) {
            logger.error('Error handling answer:', error);
        }
    }

    /**
     * تکمیل جلسه مرور
     */
    async _completeReview() {
        this.#session.stats.endTime = Date.now();
        this.#session.stats.timeSpent = this.#session.stats.endTime - this.#session.stats.startTime;

        await this.#repository.saveSession(this.#session);

        this._setState(ReviewState.COMPLETED);
        this._showCompletion();

        eventBus.emit('review:completed', {
            userId: this.#userId,
            stats: this.#session.stats
        });

        if (this.#statsDisplay) {
            await this._loadReviewStats();
        }
    }

    /**
     * مدیریت کلیدهای میانبر
     */
    _handleKeyDown(e) {
        if (this.#state !== ReviewState.IN_PROGRESS) return;

        if (e.code === 'Space') {
            e.preventDefault();
            this.#cardComponent?.showAnswer();
        } else if (e.key >= '1' && e.key <= '5') {
            const quality = parseInt(e.key) - 1;
            if (this.#cardComponent?.isFlipped) {
                this._handleAnswer(quality);
            }
        }
    }

    /**
     * تغییر وضعیت صفحه
     */
    _setState(newState) {
        this.#state = newState;
        this.#container?.setAttribute('data-review-state', newState);
        
        const event = new CustomEvent('reviewStateChange', {
            detail: { state: newState }
        });
        this.#container?.dispatchEvent(event);
    }

    /**
     * بازگشت به خانه
     */
    _navigateBack() {
        router.navigate('/home');
    }

    /**
     * تلاش مجدد
     */
    _handleRetry() {
        this._startReview();
    }

    /**
     * شروع مرور درس
     */
    _handleStartLesson(lessonId) {
        router.navigate('/lesson', { lessonId });
    }

    /**
     * واکنش به تغییر state
     */
    _handleStateChange(newState) {
        const newUserId = newState?.auth?.user?.id;
        if (newUserId && newUserId !== this.#userId) {
            this.#userId = newUserId;
            this._startReview();
        }
    }

    /**
     * واکنش به اتمام مرور
     */
    _handleReviewCompleted(data) {
        if (data.userId === this.#userId) {
            this._startReview();
        }
    }

    /**
     * واکنش به فلپ کارت
     */
    _handleCardFlip(card) {
        logger.debug('Card flipped:', card.id);
    }

    /**
     * بازنشانی state
     */
    #resetState() {
        this.#dueLessons = [];
        this.#state = ReviewState.LOADING;
        this.#error = null;
        this.#session = null;
    }

    /**
     * ایجاد ساختار DOM
     */
    _createStructure() {
        this.#container.innerHTML = `
            <div class="review_screen">
                <div class="review_header">
                    <button class="back_button" aria-label="بازگشت">←</button>
                    <h2 class="review_title">مرور هوشمند</h2>
                    <div class="header_actions">
                        <button class="pause_button" aria-label="توقف موقت">⏸️</button>
                        <button class="reset_button" aria-label="شروع مجدد">🔄</button>
                    </div>
                </div>

                <div class="review_stats_container"></div>
                <div class="review_progress_container"></div>
                <div class="review_card_container"></div>

                <div class="review_footer">
                    <div class="keyboard_hint">
                        <span>1-5: کیفیت پاسخ</span>
                        <span>Space: نمایش پاسخ</span>
                    </div>
                </div>

                <div class="review_loading hidden">
                    <div class="spinner"></div>
                    <p>در حال آماده‌سازی مرور...</p>
                </div>

                <div class="review_empty hidden">
                    <div class="empty_icon">🎉</div>
                    <h3>تبریک!</h3>
                    <p>همه کارت‌ها برای امروز مرور شده‌اند</p>
                    <button class="back_home_btn">بازگشت به صفحه اصلی</button>
                </div>

                <div class="review_complete hidden">
                    <div class="complete_icon">🏆</div>
                    <h3>مرور کامل شد!</h3>
                    <div class="complete_stats">
                        <div class="complete_stat">
                            <span class="stat_label">کارت‌ها</span>
                            <span class="stat_value" id="complete_total">0</span>
                        </div>
                        <div class="complete_stat">
                            <span class="stat_label">درست</span>
                            <span class="stat_value" id="complete_correct">0</span>
                        </div>
                        <div class="complete_stat">
                            <span class="stat_label">زمان</span>
                            <span class="stat_value" id="complete_time">0</span>
                        </div>
                    </div>
                    <button class="continue_btn">ادامه</button>
                </div>

                <div class="review_error hidden">
                    <div class="error_icon">⚠️</div>
                    <h3>خطا</h3>
                    <p class="error_message"></p>
                    <button class="retry_btn">تلاش مجدد</button>
                </div>
            </div>
        `;

        this._attachEventListeners();
    }

    /**
     * اتصال event listeners
     */
    _attachEventListeners() {
        const backBtn = this.#container.querySelector('.back_button');
        backBtn?.addEventListener('click', () => this._navigateBack());

        const pauseBtn = this.#container.querySelector('.pause_button');
        pauseBtn?.addEventListener('click', () => {
            // TODO: پیاده‌سازی pause
        });

        const resetBtn = this.#container.querySelector('.reset_button');
        resetBtn?.addEventListener('click', () => this._startReview());

        const backHomeBtn = this.#container.querySelector('.back_home_btn');
        backHomeBtn?.addEventListener('click', () => this._navigateBack());

        const continueBtn = this.#container.querySelector('.continue_btn');
        continueBtn?.addEventListener('click', () => this._navigateBack());

        const retryBtn = this.#container.querySelector('.retry_btn');
        retryBtn?.addEventListener('click', () => this._handleRetry());
    }

    /**
     * نمایش حالت بارگذاری
     */
    _showLoading() {
        this.#container.querySelector('.review_loading').classList.remove('hidden');
    }

    /**
     * مخفی کردن حالت بارگذاری
     */
    _hideLoading() {
        this.#container.querySelector('.review_loading').classList.add('hidden');
    }

    /**
     * نمایش حالت خالی
     */
    _showEmptyState() {
        this.#container.querySelector('.review_empty').classList.remove('hidden');
        this.#container.querySelector('.review_card_container').classList.add('hidden');
        this.#container.querySelector('.review_progress_container').classList.add('hidden');
    }

    /**
     * نمایش حالت تکمیل
     */
    _showCompletion() {
        const completeDiv = this.#container.querySelector('.review_complete');
        completeDiv.classList.remove('hidden');

        completeDiv.querySelector('#complete_total').textContent = this.#session.cards.length;
        completeDiv.querySelector('#complete_correct').textContent = this.#session.stats.correct;
        
        const minutes = Math.floor(this.#session.stats.timeSpent / 60000);
        const seconds = Math.floor((this.#session.stats.timeSpent % 60000) / 1000);
        completeDiv.querySelector('#complete_time').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        this.#container.querySelector('.review_card_container').classList.add('hidden');
        this.#container.querySelector('.review_progress_container').classList.add('hidden');
        this.#container.querySelector('.review_footer').classList.add('hidden');
    }

    /**
     * نمایش خطا
     */
    _showError(message) {
        const errorDiv = this.#container.querySelector('.review_error');
        errorDiv.classList.remove('hidden');
        errorDiv.querySelector('.error_message').textContent = message;
        this._hideLoading();
    }
    }
