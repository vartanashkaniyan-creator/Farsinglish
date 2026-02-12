/**
 * صفحه نمایش درس و تمرین
 * مسئول: نمایش محتوای درس، دریافت پاسخ کاربر، اعتبارسنجی و ثبت نتیجه SRS
 * وابستگی: LessonService, ReviewService, Router (تزریق شده)
 * بدون منطق تجاری – فقط نمایش و تعامل کاربر
 */

// ---------- ثابت‌ها ----------
const QUALITY_CORRECT = 4;      // پاسخ صحیح (کیفیت خوب)
const QUALITY_INCORRECT = 1;   // پاسخ غلط (کیفیت پایین)
const DEFAULT_EXERCISE_TYPE = 'translation'; // نوع تمرین پیش‌فرض

/**
 * @typedef {Object} LessonService
 * @property {function(string): Promise<Object>} getLesson - دریافت درس
 * @property {function(string, Object): Promise<Object>} generateExercise - تولید تمرین
 */

/**
 * @typedef {Object} ReviewService
 * @property {function(string, string, number): Promise<Object>} submitReview - ثبت نتیجه مرور
 */

/**
 * @typedef {Object} Router
 * @property {function(string): void} navigate - تغییر صفحه
 */

export class LessonScreen {
    /**
     * @param {Object} deps - وابستگی‌های تزریق شده
     * @param {LessonService} deps.lessonService
     * @param {ReviewService} deps.reviewService
     * @param {Router} deps.router
     */
    constructor(deps) {
        const { lessonService, reviewService, router } = deps || {};

        if (!lessonService) throw new Error('lessonService is required');
        if (!reviewService) throw new Error('reviewService is required');
        if (!router) throw new Error('router is required');

        this._lessonService = lessonService;
        this._reviewService = reviewService;
        this._router = router;

        this._container = null;
        this._currentUserId = null;
        this._currentLessonId = null;
        this._currentExercise = null;
        this._currentLesson = null;
        this._answerHandlers = new Map(); // برای پاکسازی رویدادها
    }

    /**
     * رندر صفحه درس
     * @param {HTMLElement} container - المان والد
     * @param {string} userId - شناسه کاربر
     * @param {string} lessonId - شناسه درس
     */
    async render(container, userId, lessonId) {
        if (!container) throw new Error('container is required');
        if (!userId) throw new Error('userId is required');
        if (!lessonId) throw new Error('lessonId is required');

        this._container = container;
        this._currentUserId = userId;
        this._currentLessonId = lessonId;

        await this._loadAndRender();
    }

    /** @private */
    async _loadAndRender() {
        this._showLoading();

        try {
            // بارگذاری هم‌زمان درس و تمرین
            const [lesson, exercise] = await Promise.all([
                this._lessonService.getLesson(this._currentLessonId),
                this._lessonService.generateExercise(this._currentLessonId, {
                    type: DEFAULT_EXERCISE_TYPE
                })
            ]);

            this._currentLesson = lesson;
            this._currentExercise = exercise;

            const html = this._buildHTML(lesson, exercise);
            this._container.innerHTML = html;
            this._attachEvents();
        } catch (error) {
            console.error('[LessonScreen] Failed to load lesson:', error);
            this._showError(error.message);
        }
    }

    /** @private */
    _showLoading() {
        this._container.innerHTML = `
            <div class="loading">
                <p>در حال بارگذاری درس...</p>
            </div>
        `;
    }

    /** @private */
    _showError(message) {
        this._container.innerHTML = `
            <div class="error-container">
                <p class="error-message">خطا: ${message}</p>
                <button class="btn btn-primary" data-action="back">بازگشت</button>
                <button class="btn btn-outline" data-action="retry">تلاش مجدد</button>
            </div>
        `;
        this._attachErrorEvents();
    }

    /** @private */
    _attachErrorEvents() {
        const backBtn = this._container.querySelector('[data-action="back"]');
        const retryBtn = this._container.querySelector('[data-action="retry"]');

        if (backBtn) {
            backBtn.addEventListener('click', () => this._router.navigate('/lessons'));
        }
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this._loadAndRender());
        }
    }

    /** @private */
    _buildHTML(lesson, exercise) {
        // نمایش ساده برای تمرین ترجمه
        const isTranslation = exercise.type === 'translation';
        const prompt = isTranslation ? exercise.question : 'تمرین آماده نشده است';
        const placeholder = isTranslation ? 'ترجمه را وارد کنید...' : '';

        return `
            <div class="lesson-screen">
                <header class="lesson-header">
                    <button class="btn-icon" data-action="back" aria-label="بازگشت">←</button>
                    <h2>${lesson.title || 'درس'}</h2>
                    <span class="badge">${exercise.type || 'تمرین'}</span>
                </header>

                <div class="exercise-container">
                    <div class="exercise-prompt">
                        <p class="prompt-text">${prompt}</p>
                    </div>

                    <div class="exercise-answer">
                        <input type="text" 
                               id="answer-input" 
                               class="answer-input" 
                               placeholder="${placeholder}"
                               autocomplete="off"
                               autofocus />
                        <button class="btn btn-primary" data-action="submit-answer">
                            بررسی
                        </button>
                    </div>

                    <div id="feedback-container" class="feedback-container"></div>

                    <div id="quality-selector" class="quality-selector hidden">
                        <p>کیفیت پاسخ خود را انتخاب کنید:</p>
                        <div class="quality-buttons">
                            <button class="quality-btn" data-quality="5">۵ - کامل</button>
                            <button class="quality-btn" data-quality="4">۴ - خوب</button>
                            <button class="quality-btn" data-quality="3">۳ - قابل قبول</button>
                            <button class="quality-btn" data-quality="2">۲ - ضعیف</button>
                            <button class="quality-btn" data-quality="1">۱ - خیلی ضعیف</button>
                            <button class="quality-btn" data-quality="0">۰ - نادرست</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /** @private */
    _attachEvents() {
        const backBtn = this._container.querySelector('[data-action="back"]');
        if (backBtn) {
            backBtn.addEventListener('click', () => this._router.navigate('/lessons'));
        }

        const submitBtn = this._container.querySelector('[data-action="submit-answer"]');
        const input = this._container.querySelector('#answer-input');

        if (submitBtn && input) {
            const submitHandler = () => this._handleAnswerSubmit();
            const inputHandler = (e) => {
                if (e.key === 'Enter') this._handleAnswerSubmit();
            };

            submitBtn.addEventListener('click', submitHandler);
            input.addEventListener('keypress', inputHandler);

            // ذخیره برای پاکسازی
            this._answerHandlers.set('submit', { element: submitBtn, handler: submitHandler });
            this._answerHandlers.set('input', { element: input, handler: inputHandler });
        }
    }

    /** @private */
    async _handleAnswerSubmit() {
        const input = this._container.querySelector('#answer-input');
        if (!input) return;

        const userAnswer = input.value.trim();
        if (!userAnswer) {
            this._showFeedback('لطفاً پاسخ را وارد کنید.', 'error');
            return;
        }

        // غیرفعال کردن دکمه و اینپوت در طول بررسی
        const submitBtn = this._container.querySelector('[data-action="submit-answer"]');
        if (submitBtn) submitBtn.disabled = true;
        input.disabled = true;

        try {
            // اعتبارسنجی پاسخ (در این نسخه ساده، مقایسه مستقیم)
            // در نسخه واقعی باید از ExerciseValidator استفاده شود
            const isCorrect = await this._validateAnswer(userAnswer);
            
            if (isCorrect) {
                this._showFeedback('✓ پاسخ صحیح است!', 'success');
                this._showQualitySelector();
            } else {
                this._showFeedback('✗ پاسخ نادرست است. دوباره تلاش کنید.', 'error');
                // فعال کردن مجدد اینپوت
                submitBtn.disabled = false;
                input.disabled = false;
                input.focus();
            }
        } catch (error) {
            console.error('[LessonScreen] Validation error:', error);
            this._showFeedback('خطا در بررسی پاسخ. دوباره تلاش کنید.', 'error');
            submitBtn.disabled = false;
            input.disabled = false;
        }
    }

    /** @private */
    async _validateAnswer(userAnswer) {
        // **نسخه ساده‌شده برای نمایش – در پروژه واقعی از سرویس اختصاصی استفاده کنید**
        if (!this._currentExercise || !this._currentExercise.correctAnswer) {
            return false;
        }

        const correct = this._currentExercise.correctAnswer.toLowerCase().trim();
        const answer = userAnswer.toLowerCase().trim();
        return answer === correct;
    }

    /** @private */
    _showFeedback(message, type = 'info') {
        const feedbackEl = this._container.querySelector('#feedback-container');
        if (feedbackEl) {
            feedbackEl.innerHTML = `<div class="feedback feedback-${type}">${message}</div>`;
        }
    }

    /** @private */
    _showQualitySelector() {
        const selector = this._container.querySelector('#quality-selector');
        if (!selector) return;

        selector.classList.remove('hidden');

        const qualityBtns = selector.querySelectorAll('.quality-btn');
        qualityBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const quality = parseInt(e.currentTarget.dataset.quality, 10);
                this._handleQualitySelection(quality);
            });
        });
    }

    /** @private */
    async _handleQualitySelection(quality) {
        // ثبت نتیجه در SRS
        try {
            await this._reviewService.submitReview(
                this._currentUserId,
                this._currentLessonId,
                quality
            );

            this._showFeedback('✅ پیشرفت شما ذخیره شد.', 'success');

            // انتقال به صفحه بعد (مثلاً خلاصه درس یا صفحه اصلی)
            setTimeout(() => {
                this._router.navigate('/review-summary'); // یا صفحه مناسب
            }, 1500);
        } catch (error) {
            console.error('[LessonScreen] Failed to submit review:', error);
            this._showFeedback('خطا در ذخیره پیشرفت. دوباره تلاش کنید.', 'error');
        }
    }

    /**
     * پاکسازی منابع و شنوندگان رویداد
     */
    destroy() {
        // حذف رویدادهای ذخیره شده
        this._answerHandlers.forEach(({ element, handler }, type) => {
            if (type === 'submit') {
                element.removeEventListener('click', handler);
            } else if (type === 'input') {
                element.removeEventListener('keypress', handler);
            }
        });
        this._answerHandlers.clear();

        if (this._container) {
            this._container.innerHTML = '';
        }
        this._container = null;
        this._currentUserId = null;
        this._currentLessonId = null;
        this._currentExercise = null;
        this._currentLesson = null;
    }
}

// ---------- واحد تست ساده (برای مرورگر) ----------
if (typeof window !== 'undefined' && window.VITEST) {
    window.__LESSON_SCREEN__ = { LessonScreen };
  }
