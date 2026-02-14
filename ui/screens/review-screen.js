```javascript
// ui/screens/review-screen.js
/**
 * Review Screen - صفحه مرور دروس با سیستم SRS
 * مسئولیت: نمایش و مدیریت جلسات مرور هوشمند
 * اصل SRP: فقط مسئول صفحه مرور و تعاملات آن
 * اصل DIP: وابسته به سرویس‌ها از طریق اینترفیس
 * اصل OCP: قابل توسعه برای انواع جدید مرور
 */

// ============ Types and Enums ============
const ReviewState = {
    LOADING: 'loading',
    READY: 'ready',
    IN_PROGRESS: 'in_progress',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    EMPTY: 'empty',
    ERROR: 'error'
};

const ReviewType = {
    DAILY_REVIEW: 'daily_review',
    NEW_CARDS: 'new_cards',
    REVISION: 'revision',
    CUSTOM: 'custom'
};

const AnswerQuality = {
    COMPLETE_BLACKOUT: 0,
    INCORRECT_BUT_RECOGNIZED: 1,
    INCORRECT_EASY: 2,
    CORRECT_DIFFICULT: 3,
    CORRECT_GOOD: 4,
    CORRECT_EASY: 5
};

// ============ DTOs ============
class ReviewSession {
    constructor(data = {}) {
        this.id = data.id || `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.userId = data.userId;
        this.type = data.type || ReviewType.DAILY_REVIEW;
        this.cards = data.cards || [];
        this.currentIndex = data.currentIndex || 0;
        this.results = data.results || [];
        this.stats = {
            totalCards: this.cards.length,
            reviewed: 0,
            correct: 0,
            wrong: 0,
            timeSpent: 0,
            startTime: data.startTime || Date.now(),
            endTime: null,
            ...data.stats
        };
        this.config = data.config || {};
        this.state = data.state || ReviewState.READY;
    }

    get currentCard() {
        return this.cards[this.currentIndex];
    }

    get progress() {
        return this.cards.length > 0 
            ? (this.currentIndex / this.cards.length) * 100 
            : 0;
    }

    get remainingCards() {
        return this.cards.length - this.currentIndex;
    }

    get isLastCard() {
        return this.currentIndex === this.cards.length - 1;
    }

    get isComplete() {
        return this.currentIndex >= this.cards.length;
    }

    addResult(result) {
        this.results.push(result);
        this.stats.reviewed++;
        if (result.isCorrect) {
            this.stats.correct++;
        } else {
            this.stats.wrong++;
        }
    }

    next() {
        if (!this.isComplete) {
            this.currentIndex++;
        }
        return this.currentCard;
    }

    complete() {
        this.state = ReviewState.COMPLETED;
        this.stats.endTime = Date.now();
        this.stats.timeSpent = this.stats.endTime - this.stats.startTime;
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            cards: this.cards.map(c => ({
                id: c.id,
                front: c.front,
                back: c.back
            })),
            stats: this.stats,
            state: this.state,
            progress: this.progress
        };
    }
}

class ReviewResult {
    constructor(data = {}) {
        this.cardId = data.cardId;
        this.quality = data.quality; // 0-5
        this.responseTime = data.responseTime || 0;
        this.timestamp = data.timestamp || Date.now();
        this.isCorrect = this.quality >= 3;
        this.attempts = data.attempts || 1;
        this.hintsUsed = data.hintsUsed || 0;
    }
}

class ReviewStats {
    constructor(data = {}) {
        this.totalReviews = data.totalReviews || 0;
        this.totalCards = data.totalCards || 0;
        this.masteredCards = data.masteredCards || 0;
        this.learningCards = data.learningCards || 0;
        this.dueToday = data.dueToday || 0;
        this.dueThisWeek = data.dueThisWeek || 0;
        this.averageAccuracy = data.averageAccuracy || 0;
        this.averageResponseTime = data.averageResponseTime || 0;
        this.longestStreak = data.longestStreak || 0;
        this.currentStreak = data.currentStreak || 0;
        this.lastReviewed = data.lastReviewed || null;
    }
}

// ============ Review Card Component ============
class ReviewCard {
    constructor(container, events) {
        this.container = container;
        this.events = events;
        this.element = null;
        this.isFlipped = false;
    }

    render(card) {
        this.element = this._createElement(card);
        this.container.appendChild(this.element);
        return this.element;
    }

    flip(showBack = true) {
        if (!this.element) return;

        this.isFlipped = showBack;
        if (showBack) {
            this.element.classList.add('flipped');
        } else {
            this.element.classList.remove('flipped');
        }
    }

    showAnswer() {
        this.flip(true);
        this._showRatingButtons();
    }

    reset() {
        this.flip(false);
        this._hideRatingButtons();
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }

    _createElement(card) {
        const container = document.createElement('div');
        container.className = 'review-card';
        container.setAttribute('data-card-id', card.id);
        container.setAttribute('role', 'article');
        container.setAttribute('aria-label', 'کارت مرور');

        const inner = document.createElement('div');
        inner.className = 'review-card-inner';

        // Front
        const front = document.createElement('div');
        front.className = 'review-card-front';
        front.appendChild(this._createFrontContent(card));

        // Back
        const back = document.createElement('div');
        back.className = 'review-card-back';
        back.appendChild(this._createBackContent(card));

        inner.appendChild(front);
        inner.appendChild(back);
        container.appendChild(inner);

        // Rating buttons (hidden initially)
        const ratingDiv = this._createRatingButtons(card);
        container.appendChild(ratingDiv);

        // Click to flip
        container.addEventListener('click', (e) => {
            if (!e.target.closest('.rating-btn') && !this.isFlipped) {
                this.flip(true);
                this.events.onCardFlip?.(card);
            }
        });

        return container;
    }

    _createFrontContent(card) {
        const content = document.createElement('div');
        content.className = 'review-card-content';

        if (card.front.type === 'image' && card.front.media) {
            const img = document.createElement('img');
            img.src = card.front.media;
            img.alt = card.front.content || 'تصویر کارت';
            img.className = 'card-image';
            content.appendChild(img);
        }

        const text = document.createElement('div');
        text.className = 'card-text';
        text.textContent = card.front.content || card.front;
        content.appendChild(text);

        if (card.front.hint) {
            const hint = document.createElement('div');
            hint.className = 'card-hint';
            hint.textContent = card.front.hint;
            content.appendChild(hint);
        }

        return content;
    }

    _createBackContent(card) {
        const content = document.createElement('div');
        content.className = 'review-card-content';

        if (card.back.type === 'image' && card.back.media) {
            const img = document.createElement('img');
            img.src = card.back.media;
            img.alt = card.back.content || 'تصویر پشت کارت';
            img.className = 'card-image';
            content.appendChild(img);
        }

        const text = document.createElement('div');
        text.className = 'card-text';
        text.textContent = card.back.content || card.back;
        content.appendChild(text);

        if (card.back.example) {
            const example = document.createElement('div');
            example.className = 'card-example';
            example.textContent = card.back.example;
            content.appendChild(example);
        }

        if (card.back.notes) {
            const notes = document.createElement('div');
            notes.className = 'card-notes';
            notes.textContent = card.back.notes;
            content.appendChild(notes);
        }

        return content;
    }

    _createRatingButtons(card) {
        const ratingDiv = document.createElement('div');
        ratingDiv.className = 'rating-buttons hidden';
        ratingDiv.setAttribute('role', 'group');
        ratingDiv.setAttribute('aria-label', 'کیفیت پاسخ');

        const ratings = [
            { value: 0, label: 'اصلاً یادم نبود', emoji: '😓', color: '#dc3545' },
            { value: 1, label: 'اشتباه - اما آشنا بود', emoji: '😕', color: '#fd7e14' },
            { value: 2, label: 'اشتباه - آسان بود', emoji: '😐', color: '#ffc107' },
            { value: 3, label: 'درست - مشکل', emoji: '🙂', color: '#28a745' },
            { value: 4, label: 'درست - خوب', emoji: '😊', color: '#20c997' },
            { value: 5, label: 'درست - آسان', emoji: '🎉', color: '#17a2b8' }
        ];

        ratings.forEach(rating => {
            const btn = document.createElement('button');
            btn.className = 'rating-btn';
            btn.setAttribute('data-quality', rating.value);
            btn.setAttribute('aria-label', rating.label);
            btn.style.backgroundColor = rating.color;

            btn.innerHTML = `
                <span class="rating-emoji">${rating.emoji}</span>
                <span class="rating-label">${rating.label}</span>
            `;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.events.onAnswer?.(card.id, rating.value);
            });

            ratingDiv.appendChild(btn);
        });

        return ratingDiv;
    }

    _showRatingButtons() {
        const ratingDiv = this.element?.querySelector('.rating-buttons');
        if (ratingDiv) {
            ratingDiv.classList.remove('hidden');
        }
    }

    _hideRatingButtons() {
        const ratingDiv = this.element?.querySelector('.rating-buttons');
        if (ratingDiv) {
            ratingDiv.classList.add('hidden');
        }
    }
}

// ============ Progress Indicator ============
class ReviewProgressIndicator {
    constructor(container) {
        this.container = container;
        this.element = null;
        this.bar = null;
        this.text = null;
    }

    render(session) {
        this.element = this._createElement(session);
        this.container.appendChild(this.element);
        return this.element;
    }

    update(session) {
        if (!this.element) return;

        const progress = session.progress;
        this.bar.style.width = `${progress}%`;
        
        const stats = this.element.querySelector('.progress-stats');
        if (stats) {
            stats.innerHTML = `
                <span>${session.currentIndex + 1} / ${session.cards.length}</span>
                <span>✅ ${session.stats.correct}</span>
                <span>❌ ${session.stats.wrong}</span>
            `;
        }

        // تغییر رنگ بر اساس پیشرفت
        if (progress < 30) {
            this.bar.style.background = '#ffc107';
        } else if (progress < 70) {
            this.bar.style.background = '#17a2b8';
        } else {
            this.bar.style.background = '#28a745';
        }
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }

    _createElement(session) {
        const container = document.createElement('div');
        container.className = 'review-progress';

        const header = document.createElement('div');
        header.className = 'progress-header';

        const title = document.createElement('h3');
        title.className = 'progress-title';
        title.textContent = 'پیشرفت مرور';
        header.appendChild(title);

        const stats = document.createElement('div');
        stats.className = 'progress-stats';
        stats.innerHTML = `
            <span>${session.currentIndex + 1} / ${session.cards.length}</span>
            <span>✅ ${session.stats.correct}</span>
            <span>❌ ${session.stats.wrong}</span>
        `;
        header.appendChild(stats);

        container.appendChild(header);

        const barContainer = document.createElement('div');
        barContainer.className = 'progress-bar-container';

        this.bar = document.createElement('div');
        this.bar.className = 'progress-bar';
        this.bar.style.width = `${session.progress}%`;
        barContainer.appendChild(this.bar);

        container.appendChild(barContainer);

        return container;
    }
}

// ============ Stats Display ============
class ReviewStatsDisplay {
    constructor(container) {
        this.container = container;
        this.element = null;
    }

    render(stats) {
        this.element = this._createElement(stats);
        this.container.appendChild(this.element);
        return this.element;
    }

    update(stats) {
        if (!this.element) return;

        const elements = {
            totalReviews: this.element.querySelector('.stat-total-reviews .stat-value'),
            masteredCards: this.element.querySelector('.stat-mastered .stat-value'),
            dueToday: this.element.querySelector('.stat-due-today .stat-value'),
            accuracy: this.element.querySelector('.stat-accuracy .stat-value'),
            streak: this.element.querySelector('.stat-streak .stat-value')
        };

        if (elements.totalReviews) elements.totalReviews.textContent = stats.totalReviews;
        if (elements.masteredCards) elements.masteredCards.textContent = stats.masteredCards;
        if (elements.dueToday) elements.dueToday.textContent = stats.dueToday;
        if (elements.accuracy) elements.accuracy.textContent = `${Math.round(stats.averageAccuracy)}%`;
        if (elements.streak) elements.streak.textContent = `${stats.currentStreak} روز`;
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }

    _createElement(stats) {
        const container = document.createElement('div');
        container.className = 'review-stats';

        const title = document.createElement('h3');
        title.className = 'stats-title';
        title.textContent = 'آمار مرور';
        container.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'stats-grid';

        const statItems = [
            { class: 'total-reviews', icon: '🔄', label: 'کل مرورها', value: stats.totalReviews },
            { class: 'mastered', icon: '🏆', label: 'کارت‌های مسلط', value: stats.masteredCards },
            { class: 'due-today', icon: '📅', label: 'مرور امروز', value: stats.dueToday },
            { class: 'accuracy', icon: '🎯', label: 'دقت', value: `${Math.round(stats.averageAccuracy)}%` },
            { class: 'streak', icon: '🔥', label: 'متدوال', value: `${stats.currentStreak} روز` },
            { class: 'time', icon: '⏱️', label: 'میانگین زمان', value: `${Math.round(stats.averageResponseTime / 1000)}ث` }
        ];

        statItems.forEach(item => {
            const statDiv = document.createElement('div');
            statDiv.className = `stat-item stat-${item.class}`;

            statDiv.innerHTML = `
                <div class="stat-icon">${item.icon}</div>
                <div class="stat-info">
                    <div class="stat-label">${item.label}</div>
                    <div class="stat-value">${item.value}</div>
                </div>
            `;

            grid.appendChild(statDiv);
        });

        container.appendChild(grid);

        if (stats.lastReviewed) {
            const lastReviewed = document.createElement('div');
            lastReviewed.className = 'last-reviewed';
            lastReviewed.innerHTML = `
                <span class="last-reviewed-icon">⏰</span>
                <span>آخرین مرور: ${new Date(stats.lastReviewed).toLocaleDateString('fa-IR')}</span>
            `;
            container.appendChild(lastReviewed);
        }

        return container;
    }
}

// ============ Main Review Screen ============
class ReviewScreen {
    constructor(container, services, options = {}) {
        if (!container) {
            throw new Error('ReviewScreen: Container element is required');
        }

        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        if (!this.container) {
            throw new Error('ReviewScreen: Container element not found');
        }

        this.flashcardService = services.flashcardService;
        this.progressManager = services.progressManager;
        this.stateManager = services.stateManager;
        this.router = services.router;

        this.options = {
            showStats: options.showStats ?? true,
            autoPlay: options.autoPlay ?? false,
            reviewLimit: options.reviewLimit || 20,
            ...options
        };

        this.state = ReviewState.LOADING;
        this.session = null;
        this.currentCard = null;
        this.cardComponent = null;
        this.progressIndicator = null;
        this.statsDisplay = null;
        this.userId = null;

        this.init();
    }

    async init() {
        this._createStructure();
        this._setupEventListeners();
        await this.loadUserData();
        await this.loadReviewStats();
        await this.startReview();
    }

    async loadUserData() {
        const authState = this.stateManager?.getState()?.auth;
        if (authState?.user) {
            this.userId = authState.user.id;
        }
    }

    async loadReviewStats() {
        try {
            if (!this.userId) return;

            const stats = await this.flashcardService?.getStatistics(this.userId);
            
            if (stats && this.options.showStats) {
                const reviewStats = new ReviewStats({
                    totalReviews: stats.totalReviews,
                    masteredCards: stats.masteredCards,
                    dueToday: stats.dueToday,
                    averageAccuracy: stats.averageAccuracy,
                    averageResponseTime: stats.averageResponseTime,
                    currentStreak: stats.currentStreak,
                    lastReviewed: stats.lastReviewed
                });

                this.statsDisplay = new ReviewStatsDisplay(
                    this.container.querySelector('.review-stats-container')
                );
                this.statsDisplay.render(reviewStats);
            }

        } catch (error) {
            console.error('Error loading review stats:', error);
        }
    }

    async startReview() {
        try {
            this.setState(ReviewState.LOADING);
            this._showLoading();

            if (!this.userId) {
                throw new Error('User not authenticated');
            }

            // دریافت کارت‌های نیاز به مرور
            const dueCards = await this.flashcardService?.getDueCards(
                this.userId,
                this.options.reviewLimit
            );

            if (!dueCards || dueCards.length === 0) {
                this.setState(ReviewState.EMPTY);
                this._showEmptyState();
                return;
            }

            // ایجاد جلسه مرور
            this.session = new ReviewSession({
                userId: this.userId,
                cards: dueCards,
                type: ReviewType.DAILY_REVIEW
            });

            // نمایش progress indicator
            this.progressIndicator = new ReviewProgressIndicator(
                this.container.querySelector('.review-progress-container')
            );
            this.progressIndicator.render(this.session);

            // نمایش اولین کارت
            await this.showCurrentCard();

            this.setState(ReviewState.IN_PROGRESS);
            this._hideLoading();

        } catch (error) {
            console.error('Error starting review:', error);
            this.setState(ReviewState.ERROR);
            this._showError(error.message);
        }
    }

    async showCurrentCard() {
        if (!this.session || !this.session.currentCard) return;

        // حذف کارت قبلی
        if (this.cardComponent) {
            this.cardComponent.destroy();
        }

        const card = this.session.currentCard;
        const cardContainer = this.container.querySelector('.review-card-container');

        this.cardComponent = new ReviewCard(cardContainer, {
            onCardFlip: (card) => this.handleCardFlip(card),
            onAnswer: (cardId, quality) => this.handleAnswer(cardId, quality)
        });

        this.cardComponent.render(card);

        // به‌روزرسانی progress
        if (this.progressIndicator) {
            this.progressIndicator.update(this.session);
        }
    }

    async handleAnswer(cardId, quality) {
        try {
            const responseTime = this._calculateResponseTime();

            const result = new ReviewResult({
                cardId,
                quality,
                responseTime
            });

            // ثبت در جلسه
            this.session.addResult(result);

            // ارسال به سرویس
            await this.flashcardService?.submitReview(cardId, {
                quality,
                responseTime
            });

            // به‌روزرسانی progress
            if (this.progressIndicator) {
                this.progressIndicator.update(this.session);
            }

            // حرکت به کارت بعدی
            if (this.session.isLastCard) {
                await this.completeReview();
            } else {
                this.session.next();
                await this.showCurrentCard();
            }

        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    handleCardFlip(card) {
        // ثبت زمان فلپ برای تحلیل
        console.log('Card flipped:', card.id);
    }

    async completeReview() {
        this.session.complete();

        // ذخیره آمار جلسه
        if (this.progressManager) {
            await this.progressManager.trackReview(this.userId, this.session);
        }

        this.setState(ReviewState.COMPLETED);
        this._showCompletion();

        // به‌روزرسانی آمار
        if (this.statsDisplay) {
            await this.loadReviewStats();
        }
    }

    async pauseReview() {
        this.setState(ReviewState.PAUSED);
        // ذخیره وضعیت برای ادامه بعدی
    }

    async resumeReview() {
        if (this.state === ReviewState.PAUSED) {
            this.setState(ReviewState.IN_PROGRESS);
            await this.showCurrentCard();
        }
    }

    async resetReview() {
        if (this.cardComponent) {
            this.cardComponent.destroy();
        }
        if (this.progressIndicator) {
            this.progressIndicator.destroy();
        }

        this.session = null;
        await this.startReview();
    }

    setState(newState) {
        this.state = newState;
        this.container.setAttribute('data-review-state', newState);

        // dispatch رویداد
        const event = new CustomEvent('reviewStateChange', {
            detail: { state: newState }
        });
        this.container.dispatchEvent(event);
    }

    navigateBack() {
        if (this.router) {
            this.router.navigate('/home');
        }
    }

    destroy() {
        if (this.cardComponent) {
            this.cardComponent.destroy();
        }
        if (this.progressIndicator) {
            this.progressIndicator.destroy();
        }
        if (this.statsDisplay) {
            this.statsDisplay.destroy();
        }

        this.container.innerHTML = '';
        this.container.classList.remove('review-screen-initialized');
    }

    // ============ Private Methods ============

    _createStructure() {
        this.container.innerHTML = `
            <div class="review-screen">
                <div class="review-header">
                    <button class="back-button" aria-label="بازگشت">←</button>
                    <h2 class="review-title">مرور هوشمند</h2>
                    <div class="header-actions">
                        <button class="pause-button" aria-label="توقف موقت">⏸️</button>
                        <button class="reset-button" aria-label="شروع مجدد">🔄</button>
                    </div>
                </div>

                <div class="review-stats-container"></div>
                
                <div class="review-progress-container"></div>
                
                <div class="review-card-container"></div>
                
                <div class="review-footer">
                    <div class="keyboard-hint">
                        <span>1-5: کیفیت پاسخ</span>
                        <span>Space: نمایش پاسخ</span>
                    </div>
                </div>

                <div class="review-loading hidden">
                    <div class="spinner"></div>
                    <p>در حال آماده‌سازی مرور...</p>
                </div>

                <div class="review-empty hidden">
                    <div class="empty-icon">🎉</div>
                    <h3>تبریک!</h3>
                    <p>همه کارت‌ها برای امروز مرور شده‌اند</p>
                    <button class="back-home-btn">بازگشت به صفحه اصلی</button>
                </div>

                <div class="review-complete hidden">
                    <div class="complete-icon">🏆</div>
                    <h3>مرور کامل شد!</h3>
                    <div class="complete-stats">
                        <div class="complete-stat">
                            <span class="stat-label">کارت‌ها</span>
                            <span class="stat-value" id="complete-total">0</span>
                        </div>
                        <div class="complete-stat">
                            <span class="stat-label">درست</span>
                            <span class="stat-value" id="complete-correct">0</span>
                        </div>
                        <div class="complete-stat">
                            <span class="stat-label">زمان</span>
                            <span class="stat-value" id="complete-time">0</span>
                        </div>
                    </div>
                    <button class="continue-btn">ادامه</button>
                </div>

                <div class="review-error hidden">
                    <div class="error-icon">⚠️</div>
                    <h3>خطا</h3>
                    <p class="error-message"></p>
                    <button class="retry-btn">تلاش مجدد</button>
                </div>
            </div>
        `;

        this.container.classList.add('review-screen-initialized');
    }

    _setupEventListeners() {
        const backBtn = this.container.querySelector('.back-button');
        backBtn?.addEventListener('click', () => this.navigateBack());

        const pauseBtn = this.container.querySelector('.pause-button');
        pauseBtn?.addEventListener('click', () => {
            if (this.state === ReviewState.IN_PROGRESS) {
                this.pauseReview();
                pauseBtn.textContent = '▶️';
            } else if (this.state === ReviewState.PAUSED) {
                this.resumeReview();
                pauseBtn.textContent = '⏸️';
            }
        });

        const resetBtn = this.container.querySelector('.reset-button');
        resetBtn?.addEventListener('click', () => this.resetReview());

        const backHomeBtn = this.container.querySelector('.back-home-btn');
        backHomeBtn?.addEventListener('click', () => this.navigateBack());

        const continueBtn = this.container.querySelector('.continue-btn');
        continueBtn?.addEventListener('click', () => this.navigateBack());

        const retryBtn = this.container.querySelector('.retry-btn');
        retryBtn?.addEventListener('click', () => this.startReview());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.state !== ReviewState.IN_PROGRESS) return;

            if (e.code === 'Space') {
                e.preventDefault();
                if (this.cardComponent && !this.cardComponent.isFlipped) {
                    this.cardComponent.showAnswer();
                }
            } else if (e.key >= '1' && e.key <= '5') {
                const quality = parseInt(e.key) - 1;
                if (this.cardComponent?.isFlipped && this.session?.currentCard) {
                    this.handleAnswer(this.session.currentCard.id, quality);
                }
            }
        });
    }

    _showLoading() {
        this.container.querySelector('.review-loading').classList.remove('hidden');
    }

    _hideLoading() {
        this.container.querySelector('.review-loading').classList.add('hidden');
    }

    _showEmptyState() {
        this.container.querySelector('.review-empty').classList.remove('hidden');
        this.container.querySelector('.review-card-container').classList.add('hidden');
        this.container.querySelector('.review-progress-container').classList.add('hidden');
    }

    _showCompletion() {
        const completeDiv = this.container.querySelector('.review-complete');
        completeDiv.classList.remove('hidden');

        completeDiv.querySelector('#complete-total').textContent = this.session.cards.length;
        completeDiv.querySelector('#complete-correct').textContent = this.session.stats.correct;
        
        const minutes = Math.floor(this.session.stats.timeSpent / 60000);
        const seconds = Math.floor((this.session.stats.timeSpent % 60000) / 1000);
        completeDiv.querySelector('#complete-time').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        this.container.querySelector('.review-card-container').classList.add('hidden');
        this.container.querySelector('.review-progress-container').classList.add('hidden');
        this.container.querySelector('.review-footer').classList.add('hidden');
    }

    _showError(message) {
        const errorDiv = this.container.querySelector('.review-error');
        errorDiv.classList.remove('hidden');
        errorDiv.querySelector('.error-message').textContent = message;

        this._hideLoading();
    }

    _calculateResponseTime() {
        if (!this.session?.stats?.startTime) return 0;
        return Date.now() - this.session.stats.startTime;
    }
}

// ============ Styles ============
const reviewScreenStyles = `
.review-screen {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    direction: rtl;
}

/* Header */
.review-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
    padding: 12px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.back-button {
    padding: 8px 16px;
    font-size: 1.2rem;
    background: #f8f9fa;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
}

.back-button:hover {
    background: #e9ecef;
}

.review-title {
    margin: 0;
    font-size: 1.5rem;
    color: #2c3e50;
}

.header-actions {
    display: flex;
    gap: 8px;
}

.pause-button,
.reset-button {
    padding: 8px 12px;
    font-size: 1.2rem;
    background: #f8f9fa;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
}

.pause-button:hover,
.reset-button:hover {
    background: #e9ecef;
}

/* Stats Grid */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
}

.stat-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.stat-icon {
    font-size: 2rem;
}

.stat-info {
    flex: 1;
}

.stat-label {
    font-size: 0.85rem;
    color: #6c757d;
    margin-bottom: 4px;
}

.stat-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: #2c3e50;
}

.last-reviewed {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 8px;
    background: #f8f9fa;
    border-radius: 8px;
    color: #6c757d;
    font-size: 0.9rem;
}

/* Progress Bar */
.review-progress {
    margin-bottom: 24px;
}

.progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.progress-title {
    margin: 0;
    font-size: 1rem;
    color: #6c757d;
}

.progress-stats {
    display: flex;
    gap: 12px;
    font-size: 0.9rem;
    color: #2c3e50;
}

.progress-bar-container {
    height: 8px;
    background: #e9ecef;
    border-radius: 4px;
    overflow: hidden;
}

.progress-bar {
    height: 100%;
    background: #17a2b8;
    transition: width 0.3s ease;
}

/* Review Card */
.review-card-container {
    min-height: 300px;
    margin-bottom: 24px;
    perspective: 1000px;
}

.review-card {
    width: 100%;
    height: 300px;
    cursor: pointer;
    position: relative;
}

.review-card-inner {
    position: relative;
    width: 100%;
    height: 100%;
    text-align: center;
    transition: transform 0.6s;
    transform-style: preserve-3d;
}

.review-card.flipped .review-card-inner {
    transform: rotateY(180deg);
}

.review-card-front,
.review-card-back {
    position: absolute;
    width: 100%;
    height: 100%;
    backface-visibility: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: white;
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.review-card-back {
    transform: rotateY(180deg);
    background: #f8f9fa;
}

.card-image {
    max-width: 200px;
    max-height: 150px;
    margin-bottom: 16px;
    border-radius: 8px;
}

.card-text {
    font-size: 1.5rem;
    font-weight: 500;
    color: #2c3e50;
    margin-bottom: 16px;
}

.card-hint {
    font-size: 0.9rem;
    color: #6c757d;
    font-style: italic;
}

.card-example {
    font-size: 1rem;
    color: #495057;
    padding: 12px;
    background: #e9ecef;
    border-radius: 8px;
    margin-top: 12px;
}

.card-notes {
    font-size: 0.9rem;
    color: #6c757d;
    margin-top: 8px;
}

/* Rating Buttons */
.rating-buttons {
    position: absolute;
    bottom: -60px;
    left: 0;
    right: 0;
    display: flex;
    gap: 8px;
    justify-content: center;
    padding: 16px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
    z-index: 10;
}

.rating-buttons.hidden {
    opacity: 0;
    visibility: hidden;
    transform: translateY(10px);
}

.rating-btn {
    flex: 1;
    max-width: 100px;
    padding: 12px 8px;
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

.rating-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.rating-emoji {
    font-size: 1.2rem;
}

.rating-label {
    font-size: 0.75rem;
    white-space: nowrap;
}

/* Footer */
.review-footer {
    margin-top: 80px;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 8px;
}

.keyboard-hint {
    display: flex;
    justify-content: center;
    gap: 24px;
    color: #6c757d;
    font-size: 0.85rem;
}

/* States */
.review-loading,
.review-empty,
.review-complete,
.review-error {
    text-align: center;
    padding: 40px;
    background: white;
    border-radius: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.hidden {
    display: none !important;
}

.spinner {
    width: 50px;
    height: 50px;
    margin: 0 auto 20px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #17a2b8;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.empty-icon,
.complete-icon,
.error-icon {
    font-size: 4rem;
    margin-bottom: 20px;
}

.complete-stats {
    display: flex;
    justify-content: center;
    gap: 24px;
    margin: 24px 0;
}

.complete-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.complete-stat .stat-value {
    font-size: 1.5rem;
    font-weight: 600;
    color: #28a745;
}

.continue-btn,
.back-home-btn,
.retry-btn {
    padding: 12px 24px;
    background: #17a2b8;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
}

.continue-btn:hover,
.back-home-btn:hover,
.retry-btn:hover {
    background: #138496;
}

/* Responsive */
@media (max-width: 768px) {
    .review-screen {
        padding: 12px;
    }

    .review-header {
        flex-wrap: wrap;
    }

    .review-title {
        font-size: 1.2rem;
    }

    .stats-grid {
        grid-template-columns: repeat(2, 1fr);
    }

    .rating-buttons {
        flex-wrap: wrap;
        bottom: -80px;
    }

    .rating-btn {
        max-width: none;
        flex: 1 0 calc(33.333% - 8px);
    }

    .keyboard-hint {
        flex-direction: column;
        align-items: center;
        gap: 8px;
    }
}

@media (max-width: 480px) {
    .rating-btn {
        flex: 1 0 calc(50% - 8px);
    }
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
    .review-header,
    .stat-item,
    .review-card-front,
    .review-card-back,
    .rating-buttons,
    .review-loading,
    .review-empty,
    .review-complete,
    .review-error {
        background: #2d2d2d;
        color: #e0e0e0;
    }

    .review-title,
    .stat-value,
    .card-text {
        color: #e0e0e0;
    }

    .progress-bar-container {
        background: #3d3d3d;
    }

    .review-footer,
    .last-reviewed {
        background: #3d3d3d;
        color: #adb5bd;
    }

    .back-button,
    .pause-button,
    .reset-button {
        background: #3d3d3d;
        color: #e0e0e0;
    }

    .back-button:hover,
    .pause-button:hover,
    .reset-button:hover {
        background: #4d4d4d;
    }
}
`;

// اضافه کردن استایل‌ها
if (typeof document !== 'undefined') {
    const styleId = 'review-screen-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = reviewScreenStyles;
        document.head.appendChild(style);
    }
}

// ============ Export ============
export {
    ReviewScreen,
    ReviewSession,
    ReviewResult,
    ReviewStats,
    ReviewCard,
    ReviewProgressIndicator,
    ReviewStatsDisplay,
    ReviewState,
    ReviewType,
    AnswerQuality
};
```
