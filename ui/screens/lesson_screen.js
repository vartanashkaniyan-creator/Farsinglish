/**
 * @file lesson_screen.js
 * @version 4.1.0 (اصلاح شده)
 * @description صفحه نمایش درس و تمرین – کامل و حرفه‌ای با Strategy Pattern، امنیت و پایداری
 * @author Farsinglish Team
 */

// ---------- Types & Constants ----------

/** @enum {string} */
export const ExerciseType = {
  TRANSLATION: 'translation',
  MULTIPLE_CHOICE: 'multiple_choice',
  LISTENING: 'listening',
};

/** @enum {number} */
export const Quality = Object.freeze({
  INCORRECT: 1,
  POOR: 2,
  OK: 3,
  GOOD: 4,
  PERFECT: 5,
});

const DEFAULT_EXERCISE_TYPE = ExerciseType.TRANSLATION;
const FEEDBACK_DURATION = 1500;

// ---------- Utility Classes ----------

class SecurityUtils {
  static escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  static sanitizeInput(value, defaultValue = '') {
    if (value === null || value === undefined) return defaultValue;
    return String(value).trim();
  }
}

class AnswerValidator {
  static validate(exercise, userAnswer) {
    if (!exercise?.correctAnswer || !userAnswer) return false;

    const normalize = (str) =>
      String(str).toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,!?;:]$/g, '');

    const normalizedAnswer = normalize(userAnswer);
    const correctAnswers = Array.isArray(exercise.correctAnswer)
      ? exercise.correctAnswer
      : [exercise.correctAnswer];

    return correctAnswers.some((answer) => normalize(answer) === normalizedAnswer);
  }

  static suggestCorrection(exercise, userAnswer) {
    if (!exercise?.correctAnswer || !userAnswer) return null;

    const normalize = (s) => String(s).toLowerCase().trim();
    const normalizedAnswer = normalize(userAnswer);
    const correctAnswers = Array.isArray(exercise.correctAnswer)
      ? exercise.correctAnswer
      : [exercise.correctAnswer];

    for (const correct of correctAnswers) {
      const normalizedCorrect = normalize(correct);
      if (
        normalizedAnswer.includes(normalizedCorrect) ||
        normalizedCorrect.includes(normalizedAnswer)
      ) {
        return correct;
      }
    }
    return null;
  }
}

// ---------- Exercise Strategy ----------

class ExerciseStrategy {
  constructor(exerciseData) {
    this.exerciseData = exerciseData;
  }

  render() {
    throw new Error('render() must be implemented by subclass');
  }

  async validate(userAnswer) {
    throw new Error('validate() must be implemented by subclass');
  }

  getPlaceholder() {
    return '';
  }

  _escape(text) {
    return SecurityUtils.escapeHtml(text);
  }
}

class TranslationExercise extends ExerciseStrategy {
  render() {
    const question = this._escape(this.exerciseData.question);
    const placeholder = this._escape(this.getPlaceholder());

    return `
      <p class="prompt-text">${question}</p>
      <input type="text"   
             id="answer-input"   
             class="answer-input"   
             placeholder="${placeholder}"   
             autocomplete="off"   
             autofocus   
             aria-label="پاسخ تمرین" />
      <button class="btn btn-primary"   
              data-action="submit-answer"   
              aria-label="بررسی پاسخ">
        بررسی
      </button>
      <div id="feedback-container"   
           class="feedback-container"   
           role="alert"   
           aria-live="polite"></div>
    `;
  }

  getPlaceholder() {
    return 'ترجمه را وارد کنید...';
  }

  async validate(userAnswer) {
    return AnswerValidator.validate(this.exerciseData, userAnswer);
  }
}

class MultipleChoiceExercise extends ExerciseStrategy {
  render() {
    const question = this._escape(this.exerciseData.question);
    const options = this.exerciseData.options || [];

    return `
      <p class="prompt-text">${question}</p>
      <div class="options-container" role="group" aria-label="گزینه‌های پاسخ">
        ${options
          .map(
            (opt, index) => `
          <button class="option-btn"   
                  data-option="${this._escape(opt)}"  
                  aria-label="گزینه ${index + 1}: ${this._escape(opt)}">
            ${this._escape(opt)}
          </button>
        `
          )
          .join('')}
      </div>
      <div id="feedback-container"   
           class="feedback-container"   
           role="alert"   
           aria-live="polite"></div>
    `;
  }

  async validate(userAnswer) {
    return AnswerValidator.validate(this.exerciseData, userAnswer);
  }
}

function createExerciseStrategy(exerciseData) {
  switch (exerciseData.type) {
    case ExerciseType.TRANSLATION:
      return new TranslationExercise(exerciseData);
    case ExerciseType.MULTIPLE_CHOICE:
      return new MultipleChoiceExercise(exerciseData);
    default:
      return new TranslationExercise(exerciseData); // fallback
  }
}

// ---------- Main LessonScreen Class ----------

export class LessonScreen {
  constructor({ lessonService, reviewService, router }) {
    if (!lessonService) throw new Error('lessonService is required');
    if (!reviewService) throw new Error('reviewService is required');
    if (!router) throw new Error('router is required');

    this._lessonService = lessonService;
    this._reviewService = reviewService;
    this._router = router;

    this._container = null;
    this._currentStrategy = null;
    this._abortController = null;
    this._eventHandlers = new Map();
    this._state = {
      userId: null,
      lessonId: null,
      lesson: null,
      exercise: null,
      loading: false,
      error: null,
      answerSubmitted: false,
      isCorrect: false,
    };
  }

  _setState(newState) {
    this._state = { ...this._state, ...newState };
    if (this._container && !this._state.loading) {
      this._render();
    }
  }

  async render(container, userId, lessonId) {
    if (!container || !userId || !lessonId) throw new Error('container, userId and lessonId are required');

    if (this._abortController) this._abortController.abort();
    this._abortController = new AbortController();

    this._container = container;
    this._setState({
      userId: SecurityUtils.sanitizeInput(userId),
      lessonId: SecurityUtils.sanitizeInput(lessonId),
      loading: true,
      error: null,
    });

    await this._loadLesson();
  }

  async _loadLesson() {
    this._renderLoading();

    try {
      const results = await Promise.allSettled([
        this._lessonService.getLesson(this._state.lessonId),
        this._lessonService.generateExercise(this._state.lessonId, { type: DEFAULT_EXERCISE_TYPE }),
      ]);

      if (results[0].status === 'rejected') throw new Error(`بارگذاری درس ناموفق: ${results[0].reason?.message || 'خطای ناشناخته'}`);

      const lesson = results[0].value;
      let exercise;
      if (results[1].status === 'rejected') {
        console.warn('[LessonScreen] Exercise generation failed, using fallback:', results[1].reason);
        exercise = this._createFallbackExercise();
      } else {
        exercise = results[1].value;
      }

      this._currentStrategy = createExerciseStrategy(exercise);
      this._setState({ lesson, exercise, loading: false });

      this._render();
      this._attachEvents();
    } catch (error) {
      console.error('[LessonScreen] Load error:', error);
      this._setState({ loading: false, error: error.message || 'خطا در بارگذاری درس' });
      this._renderError();
    }
  }

  _createFallbackExercise() {
    return { type: ExerciseType.TRANSLATION, question: 'ترجمه کلمه "Hello" چیست؟', correctAnswer: 'سلام', metadata: { isFallback: true } };
  }

  _renderLoading() {
    if (!this._container) return;
    this._container.innerHTML = `
      <div class="loading" role="status" aria-label="در حال بارگذاری">
        <div class="loading-spinner" aria-hidden="true"></div>
        <p>در حال بارگذاری درس...</p>
      </div>
    `;
  }

  _renderError() {
    if (!this._container) return;
    const errorMessage = SecurityUtils.escapeHtml(this._state.error || 'خطای ناشناخته');

    this._container.innerHTML = `
      <div class="error-container" role="alert">
        <p class="error-message">خطا: ${errorMessage}</p>
        <div class="error-actions">
          <button class="btn btn-primary" data-action="back" aria-label="بازگشت به لیست درس‌ها">بازگشت</button>
          <button class="btn btn-outline" data-action="retry" aria-label="تلاش مجدد">تلاش مجدد</button>
        </div>
      </div>
    `;
    this._bindAction('back', () => this._router.navigate('/lessons'));
    this._bindAction('retry', () => this._loadLesson());
  }

  _render() {
    if (!this._container || !this._state.lesson || !this._currentStrategy) return;

    const title = SecurityUtils.escapeHtml(this._state.lesson.title || 'درس');
    const exerciseType = SecurityUtils.escapeHtml(this._state.exercise?.type || 'تمرین');
    const exerciseHtml = this._currentStrategy.render();
    const qualitySelector = this._buildQualitySelector();

    this._container.innerHTML = `
      <div class="lesson-screen" dir="rtl">
        <header class="lesson-header">
          <button class="btn-icon" data-action="back" aria-label="بازگشت" title="بازگشت به لیست درس‌ها">←</button>
          <h2>${title}</h2>
          <span class="badge" aria-label="نوع تمرین: ${exerciseType}">${exerciseType}</span>
        </header>
        <div class="exercise-container">
          ${exerciseHtml}
          ${qualitySelector}
        </div>
      </div>
    `;
    this._attachEvents();
  }

  _buildQualitySelector() {
    if (!this._state.answerSubmitted || !this._state.isCorrect) {
      return '<div id="quality-selector" class="quality-selector hidden" aria-hidden="true"></div>';
    }

    const qualityLabels = {
      [Quality.INCORRECT]: 'نادرست',
      [Quality.POOR]: 'ضعیف',
      [Quality.OK]: 'قابل قبول',
      [Quality.GOOD]: 'خوب',
      [Quality.PERFECT]: 'کامل',
    };

    return `
      <div id="quality-selector" class="quality-selector" role="group" aria-label="انتخاب کیفیت پاسخ">
        <p>کیفیت پاسخ خود را انتخاب کنید:</p>
        <div class="quality-buttons">
          ${Object.entries(qualityLabels)
            .map(
              ([value, label]) => `
            <button class="quality-btn" data-quality="${value}" aria-label="کیفیت ${label} (${value} از ۵)">
              ${value} - ${label}
            </button>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  _bindAction(action, handler) {
    const el = this._container?.querySelector(`[data-action="${action}"]`);
    if (el) {
      el.addEventListener('click', handler);
      this._eventHandlers.set(action, { element: el, handler });
    }
  }

  async _handleAnswerSubmit() {
    const input = this._container?.querySelector('#answer-input');
    if (!input) return;

    const userAnswer = SecurityUtils.sanitizeInput(input.value);
    if (!userAnswer) {
      this._showFeedback('لطفاً پاسخ را وارد کنید.', 'error');
      return;
    }

    const submitBtn = this._container.querySelector('[data-action="submit-answer"]');
    if (submitBtn) submitBtn.disabled = true;
    input.disabled = true;

    try {
      const isCorrect = await this._currentStrategy?.validate(userAnswer) || false;

      if (isCorrect) {
        this._setState({ answerSubmitted: true, isCorrect: true });
        this._render();
        this._attachQualityEvents();
      } else {
        const suggestion = AnswerValidator.suggestCorrection(this._state.exercise, userAnswer);
        const suggestionMsg = suggestion ? `آیا منظور شما "${SecurityUtils.escapeHtml(suggestion)}" بود؟` : '';
        this._showFeedback(`✗ پاسخ نادرست است. ${suggestionMsg}`, 'error');

        if (submitBtn) submitBtn.disabled = false;
        input.disabled = false;
        input.focus();
      }
    } catch (error) {
      console.error('[LessonScreen] Validation error:', error);
      this._showFeedback('خطا در بررسی پاسخ. دوباره تلاش کنید.', 'error');
      if (submitBtn) submitBtn.disabled = false;
      input.disabled = false;
    }
  }

  async _handleMultipleChoiceAnswer(selectedOption) {
    const optionBtns = this._container?.querySelectorAll('.option-btn');
    optionBtns?.forEach((btn) => (btn.disabled = true));

    try {
      const isCorrect = await this._currentStrategy?.validate(selectedOption) || false;

      if (isCorrect) {
        this._setState({ answerSubmitted: true, isCorrect: true });
        this._render();
        this._attachQualityEvents();
      } else {
        const suggestion = AnswerValidator.suggestCorrection(this._state.exercise, selectedOption);
        const suggestionMsg = suggestion ? `آیا منظور شما "${SecurityUtils.escapeHtml(suggestion)}" بود؟` : '';
        this._showFeedback(`✗ پاسخ نادرست است. ${suggestionMsg}`, 'error');
        optionBtns?.forEach((btn) => (btn.disabled = false));
      }
    } catch (error) {
      console.error('[LessonScreen] Validation error:', error);
      this._showFeedback('خطا در بررسی پاسخ.', 'error');
      optionBtns?.forEach((btn) => (btn.disabled = false));
    }
  }

  _showFeedback(message, type = 'info') {
    const feedbackEl = this._container?.querySelector('#feedback-container');
    if (feedbackEl) {
      const safeMessage = SecurityUtils.escapeHtml(message);
      feedbackEl.innerHTML = `<div class="feedback feedback-${type}" role="status">${safeMessage}</div>`;
    }
  }

  _attachQualityEvents() {
    const selector = this._container?.querySelector('#quality-selector');
    if (!selector) return;

    const qualityBtns = selector.querySelectorAll('.quality-btn');
    qualityBtns.forEach((btn) => {
      const handler = async (e) => {
        const quality = parseInt(e.currentTarget.dataset.quality, 10);
        await this._submitReview(quality);
      };
      btn.addEventListener('click', handler);
      this._eventHandlers.set(`quality-${btn.dataset.quality}`, { element: btn, handler });
    });
  }

  async _submitReview(quality) {
    try {
      this._showFeedback('در حال ذخیره پیشرفت...', 'info');

      await this._reviewService.submitReview(this._state.userId, this._state.lessonId, quality);

      this._showFeedback('✅ پیشرفت شما ذخیره شد.', 'success');

      setTimeout(() => {
        const nextPath = this._state.exercise?.metadata?.isFallback ? '/lessons' : '/review-summary';
        this._router.navigate(nextPath);
      }, FEEDBACK_DURATION);
    } catch (error) {
      console.error('[LessonScreen] Submit review error:', error);
      this._showFeedback('خطا در ذخیره پیشرفت. دوباره تلاش کنید.', 'error');
      this._attachQualityEvents();
    }
  }

  destroy() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }

    this._eventHandlers.forEach(({ element, handler }) => {
      element.removeEventListener('click', handler);
      element.removeEventListener('keypress', handler);
    });
    this._eventHandlers.clear();

    if (this._container) this._container.innerHTML = '';
    this._container = null;
    this._currentStrategy = null;
    this._state = {
      userId: null,
      lessonId: null,
      lesson: null,
      exercise: null,
      loading: false,
      error: null,
      answerSubmitted: false,
      isCorrect: false,
    };
  }
}

// ---------- Unit Test Helper ----------
if (typeof window !== 'undefined' && window.VITEST) {
  window.__LESSON_SCREEN__ = {
    LessonScreen,
    AnswerValidator,
    SecurityUtils,
    ExerciseType,
    Quality,
  };
        }
