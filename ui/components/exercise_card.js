// ui/components/exercise_card.js
/**
 * Exercise Card Component - کارت نمایش تمرین
 * مسئولیت: نمایش و مدیریت تعامل کاربر با انواع تمرین‌ها
 * اصل SRP: فقط مسئول نمایش و رویدادهای کارت تمرین
 * اصل DIP: وابسته به DTOها و مدل‌ها، نه پیاده‌سازی خاص
 * اصل OCP: قابل توسعه برای انواع جدید تمرین
 */

// ============ Types and Interfaces ============
class IExerciseCardEvents {
    onAnswer(answer) {}
    onHint() {}
    onSkip() {}
    onComplete(result) {}
    onTimeUpdate(timeLeft) {}
}

class IExerciseCardRenderer {
    render(exercise, state) {}
    updateState(state) {}
    destroy() {}
}

// ============ Enums ============
const CardState = {
    LOADING: 'loading',
    READY: 'ready',
    ANSWERING: 'answering',
    SUBMITTING: 'submitting',
    CORRECT: 'correct',
    WRONG: 'wrong',
    COMPLETED: 'completed',
    HINT_SHOWN: 'hint_shown',
    TIMEOUT: 'timeout',
    SKIPPED: 'skipped'
};

const ExerciseType = {
    MULTIPLE_CHOICE: 'multiple-choice',
    FILL_BLANK: 'fill-blank',
    TRANSLATION: 'translation',
    FLASHCARD: 'flashcard',
    MATCHING: 'matching',
    PRONUNCIATION: 'pronunciation'
};

// ============ DTOs ============
class ExerciseCardConfig {
    constructor(config = {}) {
        this.showHints = config.showHints ?? true;
        this.showSkip = config.showSkip ?? true;
        this.showTimer = config.showTimer ?? true;
        this.autoAdvance = config.autoAdvance ?? true;
        this.autoAdvanceDelay = config.autoAdvanceDelay ?? 2000;
        this.allowRetry = config.allowRetry ?? false;
        this.maxAttempts = config.maxAttempts ?? 3;
        this.animationsEnabled = config.animationsEnabled ?? true;
        this.theme = config.theme || 'light';
        this.rtl = config.rtl ?? true; // برای زبان فارسی
        this.className = config.className || '';
        this.style = config.style || {};
    }

    merge(newConfig) {
        return new ExerciseCardConfig({
            ...this,
            ...newConfig
        });
    }
}

class ExerciseCardState {
    constructor(exercise) {
        this.exercise = exercise;
        this.state = CardState.READY;
        this.userAnswer = null;
        this.attempts = 0;
        this.hintsUsed = 0;
        this.timeSpent = 0;
        this.startTime = Date.now();
        this.result = null;
        this.error = null;
        this.selectedOption = null;
        this.showingHint = false;
        this.showingExplanation = false;
    }

    update(partial) {
        Object.assign(this, partial);
        return this;
    }

    toJSON() {
        return {
            state: this.state,
            attempts: this.attempts,
            hintsUsed: this.hintsUsed,
            timeSpent: this.timeSpent,
            hasResult: !!this.result,
            isCorrect: this.result?.isCorrect || false
        };
    }
}

// ============ Renderers ============
class MultipleChoiceRenderer {
    constructor(container, events) {
        this.container = container;
        this.events = events;
        this.element = null;
        this.options = [];
    }

    render(exercise, state) {
        this.element = this._createElement(exercise, state);
        this.container.appendChild(this.element);
        return this.element;
    }

    updateState(state) {
        if (!this.element) return;

        // به‌روزرسانی کلاس‌ها بر اساس state
        this.element.className = this._getClassNames(state);
        
        // غیرفعال کردن گزینه‌ها در حالت‌های خاص
        const disabled = [CardState.SUBMITTING, CardState.CORRECT, CardState.WRONG].includes(state.state);
        this.options.forEach(btn => {
            btn.disabled = disabled;
        });
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.options = [];
    }

    _createElement(exercise, state) {
        const container = document.createElement('div');
        container.className = this._getClassNames(state);
        container.setAttribute('data-testid', 'exercise-card');
        container.setAttribute('role', 'region');
        container.setAttribute('aria-label', 'تمرین چندگزینه‌ای');

        // سوال
        container.appendChild(this._createQuestion(exercise));

        // گزینه‌ها
        const optionsContainer = this._createOptions(exercise, state);
        container.appendChild(optionsContainer);

        // بازخورد
        if (state.result) {
            container.appendChild(this._createFeedback(state));
        }

        // دکمه‌های عملیات
        container.appendChild(this._createActions(exercise, state));

        return container;
    }

    _createQuestion(exercise) {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'exercise-question';
        questionDiv.setAttribute('aria-live', 'polite');

        const questionText = document.createElement('h3');
        questionText.className = 'question-text';
        questionText.textContent = exercise.question;
        questionDiv.appendChild(questionText);

        if (exercise.media_url) {
            const media = this._createMedia(exercise.media_url);
            questionDiv.appendChild(media);
        }

        return questionDiv;
    }

    _createMedia(url) {
        const mediaDiv = document.createElement('div');
        mediaDiv.className = 'exercise-media';

        if (url.match(/\.(mp4|webm|ogg)$/i)) {
            const video = document.createElement('video');
            video.src = url;
            video.controls = true;
            video.className = 'media-video';
            mediaDiv.appendChild(video);
        } else if (url.match(/\.(mp3|wav)$/i)) {
            const audio = document.createElement('audio');
            audio.src = url;
            audio.controls = true;
            audio.className = 'media-audio';
            mediaDiv.appendChild(audio);
        } else {
            const img = document.createElement('img');
            img.src = url;
            img.alt = 'تصویر تمرین';
            img.className = 'media-image';
            mediaDiv.appendChild(img);
        }

        return mediaDiv;
    }

    _createOptions(exercise, state) {
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'exercise-options';
        optionsDiv.setAttribute('role', 'group');
        optionsDiv.setAttribute('aria-label', 'گزینه‌های پاسخ');

        this.options = [];
        const shuffledOptions = exercise.config?.shuffleOptions ? 
            this._shuffleArray([...exercise.options]) : 
            exercise.options;

        shuffledOptions.forEach((option, index) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.setAttribute('data-option-id', option.id);
            btn.setAttribute('aria-label', `گزینه ${index + 1}: ${option.text}`);
            
            if (state.selectedOption === option.id) {
                btn.classList.add('selected');
            }

            if (state.result) {
                if (option.isCorrect) {
                    btn.classList.add('correct');
                } else if (state.selectedOption === option.id && !option.isCorrect) {
                    btn.classList.add('wrong');
                }
                btn.disabled = true;
            }

            const optionText = document.createElement('span');
            optionText.className = 'option-text';
            optionText.textContent = option.text;
            btn.appendChild(optionText);

            if (option.feedback && state.result) {
                const feedback = document.createElement('small');
                feedback.className = 'option-feedback';
                feedback.textContent = option.feedback;
                btn.appendChild(feedback);
            }

            btn.addEventListener('click', () => {
                if (!btn.disabled) {
                    this._handleOptionClick(option);
                }
            });

            optionsDiv.appendChild(btn);
            this.options.push(btn);
        });

        return optionsDiv;
    }

    _createFeedback(state) {
        const feedbackDiv = document.createElement('div');
        feedbackDiv.className = `exercise-feedback ${state.result.isCorrect ? 'correct' : 'wrong'}`;
        feedbackDiv.setAttribute('role', 'alert');
        feedbackDiv.setAttribute('aria-live', 'assertive');

        const icon = document.createElement('span');
        icon.className = 'feedback-icon';
        icon.textContent = state.result.isCorrect ? '✓' : '✗';
        feedbackDiv.appendChild(icon);

        const message = document.createElement('p');
        message.className = 'feedback-message';
        message.textContent = state.result.feedback || (state.result.isCorrect ? 'پاسخ صحیح است!' : 'پاسخ نادرست است');
        feedbackDiv.appendChild(message);

        if (state.result.score) {
            const score = document.createElement('div');
            score.className = 'feedback-score';
            score.textContent = `امتیاز: ${state.result.score.finalScore}`;
            feedbackDiv.appendChild(score);
        }

        if (state.result.explanation && state.showingExplanation) {
            const explanation = document.createElement('div');
            explanation.className = 'feedback-explanation';
            explanation.textContent = state.result.explanation;
            feedbackDiv.appendChild(explanation);
        }

        return feedbackDiv;
    }

    _createActions(exercise, state) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'exercise-actions';

        // دکمه hint
        if (exercise.config?.showHints && exercise.hint && !state.result) {
            const hintBtn = document.createElement('button');
            hintBtn.className = 'action-btn hint-btn';
            hintBtn.textContent = 'راهنمایی';
            hintBtn.setAttribute('aria-label', 'دریافت راهنمایی');
            hintBtn.disabled = state.hintsUsed >= 2 || state.state === CardState.SUBMITTING;
            
            hintBtn.addEventListener('click', () => {
                this.events.onHint?.();
            });

            if (state.showingHint) {
                const hint = document.createElement('div');
                hint.className = 'hint-text';
                hint.textContent = exercise.hint;
                actionsDiv.appendChild(hint);
            }

            actionsDiv.appendChild(hintBtn);
        }

        // دکمه توضیح
        if (exercise.explanation && state.result && !state.result.isCorrect) {
            const explainBtn = document.createElement('button');
            explainBtn.className = 'action-btn explain-btn';
            explainBtn.textContent = state.showingExplanation ? 'پنهان کردن توضیح' : 'نمایش توضیح';
            
            explainBtn.addEventListener('click', () => {
                state.showingExplanation = !state.showingExplanation;
                this.updateState(state);
            });

            actionsDiv.appendChild(explainBtn);
        }

        // دکمه رد شدن
        if (exercise.config?.showSkip && !state.result) {
            const skipBtn = document.createElement('button');
            skipBtn.className = 'action-btn skip-btn';
            skipBtn.textContent = 'رد کردن';
            skipBtn.setAttribute('aria-label', 'رد کردن این تمرین');
            
            skipBtn.addEventListener('click', () => {
                this.events.onSkip?.();
            });

            actionsDiv.appendChild(skipBtn);
        }

        return actionsDiv;
    }

    _handleOptionClick(option) {
        if (this.events.onAnswer) {
            this.events.onAnswer({
                exerciseId: this._getExerciseId(),
                selectedOptionId: option.id,
                answer: option.text
            });
        }
    }

    _getExerciseId() {
        return this.element?.querySelector('[data-exercise-id]')?.dataset.exerciseId;
    }

    _getClassNames(state) {
        const classes = ['exercise-card', `exercise-type-multiple-choice`, `state-${state.state}`];
        
        if (state.result?.isCorrect) classes.push('answer-correct');
        if (state.result && !state.result.isCorrect) classes.push('answer-wrong');
        if (state.showingHint) classes.push('hint-visible');
        
        return classes.join(' ');
    }

    _shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}

class FillBlankRenderer {
    constructor(container, events) {
        this.container = container;
        this.events = events;
        this.element = null;
        this.input = null;
    }

    render(exercise, state) {
        this.element = this._createElement(exercise, state);
        this.container.appendChild(this.element);
        return this.element;
    }

    updateState(state) {
        if (!this.element) return;

        this.element.className = this._getClassNames(state);
        
        if (this.input) {
            this.input.disabled = [CardState.SUBMITTING, CardState.CORRECT, CardState.WRONG].includes(state.state);
            
            if (state.userAnswer) {
                this.input.value = state.userAnswer;
            }
        }
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.input = null;
    }

    _createElement(exercise, state) {
        const container = document.createElement('div');
        container.className = this._getClassNames(state);
        container.setAttribute('data-testid', 'exercise-card');
        container.setAttribute('role', 'region');
        container.setAttribute('aria-label', 'تمرین جای‌خالی');

        // سوال
        container.appendChild(this._createQuestion(exercise));

        // فیلد پاسخ
        container.appendChild(this._createInput(exercise, state));

        // بازخورد
        if (state.result) {
            container.appendChild(this._createFeedback(state));
        }

        // دکمه‌ها
        container.appendChild(this._createActions(exercise, state));

        return container;
    }

    _createQuestion(exercise) {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'exercise-question';

        const questionText = document.createElement('h3');
        questionText.className = 'question-text';
        
        // نمایش جمله با جای خالی
        if (exercise.question.includes('______')) {
            const parts = exercise.question.split('______');
            questionText.innerHTML = `${parts[0]}<span class="blank-indicator">______</span>${parts[1] || ''}`;
        } else {
            questionText.textContent = exercise.question;
        }
        
        questionDiv.appendChild(questionText);

        return questionDiv;
    }

    _createInput(exercise, state) {
        const inputDiv = document.createElement('div');
        inputDiv.className = 'exercise-input';

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'answer-input';
        this.input.placeholder = 'پاسخ خود را وارد کنید...';
        this.input.setAttribute('aria-label', 'فیلد وارد کردن پاسخ');
        this.input.setAttribute('dir', 'auto');
        
        if (state.userAnswer) {
            this.input.value = state.userAnswer;
        }

        if (state.result) {
            if (state.result.typoAnalysis?.hasTypo) {
                this.input.classList.add('has-typo');
            }
            
            if (!state.result.isCorrect && exercise.correct_answer) {
                const correctSpan = document.createElement('span');
                correctSpan.className = 'correct-answer-hint';
                correctSpan.textContent = `پاسخ صحیح: ${exercise.correct_answer}`;
                inputDiv.appendChild(correctSpan);
            }
        }

        inputDiv.appendChild(this.input);

        if (!state.result) {
            const submitBtn = document.createElement('button');
            submitBtn.className = 'submit-btn';
            submitBtn.textContent = 'بررسی پاسخ';
            submitBtn.addEventListener('click', () => {
                if (this.input.value.trim()) {
                    this.events.onAnswer?.({
                        exerciseId: exercise.id,
                        answer: this.input.value.trim()
                    });
                }
            });
            inputDiv.appendChild(submitBtn);
        }

        return inputDiv;
    }

    _createFeedback(state) {
        const feedbackDiv = document.createElement('div');
        feedbackDiv.className = `exercise-feedback ${state.result.isCorrect ? 'correct' : 'wrong'}`;
        feedbackDiv.setAttribute('role', 'alert');

        const icon = document.createElement('span');
        icon.className = 'feedback-icon';
        icon.textContent = state.result.isCorrect ? '✓' : '✗';
        feedbackDiv.appendChild(icon);

        const message = document.createElement('p');
        message.className = 'feedback-message';
        
        if (state.result.typoAnalysis?.hasTypo && state.result.isCorrect) {
            message.textContent = 'پاسخ تقریباً درست است (اشتباه تایپی)';
            message.classList.add('typo-warning');
        } else {
            message.textContent = state.result.feedback;
        }
        
        feedbackDiv.appendChild(message);

        if (state.result.typoAnalysis?.similarityPercentage) {
            const similarity = document.createElement('small');
            similarity.className = 'similarity-indicator';
            similarity.textContent = `شباهت: ${state.result.typoAnalysis.similarityPercentage}%`;
            feedbackDiv.appendChild(similarity);
        }

        return feedbackDiv;
    }

    _createActions(exercise, state) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'exercise-actions';

        if (exercise.hint && !state.result) {
            const hintBtn = document.createElement('button');
            hintBtn.className = 'action-btn hint-btn';
            hintBtn.textContent = 'راهنمایی';
            
            hintBtn.addEventListener('click', () => {
                this.events.onHint?.();
            });

            actionsDiv.appendChild(hintBtn);
        }

        if (exercise.config?.showSkip && !state.result) {
            const skipBtn = document.createElement('button');
            skipBtn.className = 'action-btn skip-btn';
            skipBtn.textContent = 'رد کردن';
            
            skipBtn.addEventListener('click', () => {
                this.events.onSkip?.();
            });

            actionsDiv.appendChild(skipBtn);
        }

        return actionsDiv;
    }

    _getClassNames(state) {
        const classes = ['exercise-card', `exercise-type-fill-blank`, `state-${state.state}`];
        
        if (state.result?.isCorrect) classes.push('answer-correct');
        if (state.result && !state.result.isCorrect) classes.push('answer-wrong');
        if (state.result?.typoAnalysis?.hasTypo) classes.push('typo-detected');
        
        return classes.join(' ');
    }
}

class TranslationRenderer {
    constructor(container, events) {
        this.container = container;
        this.events = events;
        this.element = null;
        this.input = null;
    }

    // مشابه FillBlankRenderer با تنظیمات خاص ترجمه
    render(exercise, state) {
        const renderer = new FillBlankRenderer(this.container, this.events);
        const element = renderer.render(exercise, state);
        
        // سفارشی‌سازی برای ترجمه
        element.classList.add('exercise-type-translation');
        
        const questionEl = element.querySelector('.question-text');
        if (questionEl) {
            questionEl.innerHTML = `<span class="translation-direction">${exercise.metadata?.direction === 'fa2en' ? 'فارسی به انگلیسی' : 'انگلیسی به فارسی'}</span><br>${exercise.question}`;
        }
        
        return element;
    }
}

class FlashcardRenderer {
    constructor(container, events) {
        this.container = container;
        this.events = events;
        this.element = null;
        this.isFlipped = false;
    }

    render(exercise, state) {
        this.element = this._createElement(exercise, state);
        this.container.appendChild(this.element);
        return this.element;
    }

    updateState(state) {
        if (!this.element) return;

        this.element.className = this._getClassNames(state);
        
        if (state.userAnswer === 'flipped') {
            this._flip(true);
        }
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }

    _createElement(exercise, state) {
        const container = document.createElement('div');
        container.className = this._getClassNames(state);
        container.setAttribute('data-testid', 'exercise-card');
        container.setAttribute('role', 'region');
        container.setAttribute('aria-label', 'فلش کارت');

        const cardInner = document.createElement('div');
        cardInner.className = 'flashcard-inner';

        // روی کارت
        const front = document.createElement('div');
        front.className = 'flashcard-front';
        front.appendChild(this._createFrontContent(exercise));
        
        if (!state.result && !state.userAnswer) {
            front.addEventListener('click', () => this._handleFlip());
        }

        // پشت کارت
        const back = document.createElement('div');
        back.className = 'flashcard-back';
        back.appendChild(this._createBackContent(exercise));
        back.setAttribute('aria-hidden', 'true');

        cardInner.appendChild(front);
        cardInner.appendChild(back);
        container.appendChild(cardInner);

        // دکمه‌های ارزیابی
        if (state.userAnswer === 'flipped') {
            container.appendChild(this._createRatingButtons(exercise));
        }

        return container;
    }

    _createFrontContent(exercise) {
        const content = document.createElement('div');
        content.className = 'flashcard-content';

        if (exercise.front.type === 'image' && exercise.front.media) {
            const img = document.createElement('img');
            img.src = exercise.front.media;
            img.alt = exercise.front.content || 'تصویر فلش کارت';
            content.appendChild(img);
        } else {
            const text = document.createElement('p');
            text.className = 'flashcard-text';
            text.textContent = exercise.front.content;
            content.appendChild(text);
        }

        const hint = document.createElement('small');
        hint.className = 'flashcard-hint';
        hint.textContent = 'برای دیدن معنی کلیک کنید';
        content.appendChild(hint);

        return content;
    }

    _createBackContent(exercise) {
        const content = document.createElement('div');
        content.className = 'flashcard-content';

        if (exercise.back.type === 'image' && exercise.back.media) {
            const img = document.createElement('img');
            img.src = exercise.back.media;
            img.alt = exercise.back.content || 'تصویر پشت کارت';
            content.appendChild(img);
        } else if (exercise.back.type === 'audio' && exercise.back.media) {
            const audio = document.createElement('audio');
            audio.src = exercise.back.media;
            audio.controls = true;
            audio.className = 'flashcard-audio';
            content.appendChild(audio);
            
            const text = document.createElement('p');
            text.textContent = exercise.back.content;
            content.appendChild(text);
        } else {
            const text = document.createElement('p');
            text.className = 'flashcard-text';
            text.textContent = exercise.back.content;
            content.appendChild(text);
        }

        if (exercise.context) {
            const context = document.createElement('p');
            context.className = 'flashcard-context';
            context.textContent = exercise.context;
            content.appendChild(context);
        }

        return content;
    }

    _createRatingButtons(exercise) {
        const ratingDiv = document.createElement('div');
        ratingDiv.className = 'flashcard-rating';
        ratingDiv.setAttribute('role', 'group');
        ratingDiv.setAttribute('aria-label', 'ارزیابی میزان سختی');

        const ratings = [
            { value: 0, label: 'بسیار سخت', emoji: '😓' },
            { value: 1, label: 'سخت', emoji: '😕' },
            { value: 2, label: 'متوسط', emoji: '😐' },
            { value: 3, label: 'آسان', emoji: '🙂' },
            { value: 4, label: 'بسیار آسان', emoji: '😊' }
        ];

        ratings.forEach(rating => {
            const btn = document.createElement('button');
            btn.className = 'rating-btn';
            btn.setAttribute('data-quality', rating.value);
            btn.setAttribute('aria-label', rating.label);
            
            btn.innerHTML = `
                <span class="rating-emoji">${rating.emoji}</span>
                <span class="rating-label">${rating.label}</span>
            `;
            
            btn.addEventListener('click', () => {
                this.events.onAnswer?.({
                    exerciseId: exercise.id,
                    quality: rating.value,
                    answer: 'flipped'
                });
            });

            ratingDiv.appendChild(btn);
        });

        return ratingDiv;
    }

    _handleFlip() {
        if (this.isFlipped) return;
        
        this._flip(true);
        this.events.onAnswer?.({
            exerciseId: this._getExerciseId(),
            answer: 'flipped'
        });
    }

    _flip(flipped) {
        if (!this.element) return;
        
        this.isFlipped = flipped;
        if (flipped) {
            this.element.classList.add('flipped');
        } else {
            this.element.classList.remove('flipped');
        }
    }

    _getExerciseId() {
        return this.element?.dataset.exerciseId;
    }

    _getClassNames(state) {
        const classes = ['exercise-card', 'exercise-type-flashcard', `state-${state.state}`];
        
        if (this.isFlipped) classes.push('flipped');
        if (state.result) classes.push(state.result.isCorrect ? 'answer-correct' : 'answer-wrong');
        
        return classes.join(' ');
    }
}

// ============ Main Component ============
class ExerciseCard {
    constructor(container, events, config = {}) {
        if (!container) {
            throw new Error('Container element is required');
        }

        this.container = typeof container === 'string' 
            ? document.querySelector(container) 
            : container;

        if (!this.container) {
            throw new Error('Container element not found');
        }

        this.events = events || {};
        this.config = new ExerciseCardConfig(config);
        this.state = null;
        this.renderer = null;
        this.timer = null;
        this.timeLeft = 0;
    }

    /**
     * نمایش تمرین جدید
     */
    render(exercise) {
        try {
            this._validateExercise(exercise);
            
            // پاک‌سازی قبلی
            this.destroy();

            // ایجاد state جدید
            this.state = new ExerciseCardState(exercise);
            this.state.config = this.config;

            // تنظیم تایمر
            if (this.config.showTimer && exercise.config?.timeLimit) {
                this._startTimer(exercise.config.timeLimit);
            }

            // انتخاب renderer مناسب
            this.renderer = this._createRenderer(exercise.type);
            
            if (!this.renderer) {
                throw new Error(`Unsupported exercise type: ${exercise.type}`);
            }

            // رندر کردن
            this.renderer.render(exercise, this.state);
            
            // ذخیره reference
            this.container.setAttribute('data-exercise-id', exercise.id);
            this.container.classList.add('exercise-card-container');

            return this;

        } catch (error) {
            console.error('Error rendering exercise:', error);
            this._showError(error.message);
            throw error;
        }
    }

    /**
     * به‌روزرسانی وضعیت
     */
    update(result) {
        if (!this.state || !this.renderer) {
            throw new Error('No exercise is currently rendered');
        }

        // به‌روزرسانی state
        this.state.update({
            result,
            attempts: this.state.attempts + 1,
            timeSpent: Date.now() - this.state.startTime
        });

        if (result.isCorrect) {
            this.state.state = CardState.CORRECT;
            this._stopTimer();
            
            if (this.config.autoAdvance) {
                setTimeout(() => {
                    this.events.onComplete?.(result);
                }, this.config.autoAdvanceDelay);
            }
        } else {
            if (this.state.attempts >= this.config.maxAttempts) {
                this.state.state = CardState.WRONG;
                this._stopTimer();
            } else {
                this.state.state = CardState.READY;
            }
        }

        // به‌روزرسانی renderer
        this.renderer.updateState(this.state);
    }

    /**
     * نمایش راهنمایی
     */
    showHint() {
        if (!this.state || !this.renderer) return;

        this.state.update({
            hintsUsed: this.state.hintsUsed + 1,
            showingHint: true
        });

        this.renderer.updateState(this.state);
        
        this.events.onHint?.({
            exerciseId: this.state.exercise.id,
            hint: this.state.exercise.hint
        });
    }

    /**
     * رد کردن تمرین
     */
    skip() {
        if (!this.state || !this.renderer) return;

        this.state.update({
            state: CardState.SKIPPED
        });

        this.renderer.updateState(this.state);
        this._stopTimer();

        this.events.onSkip?.({
            exerciseId: this.state.exercise.id
        });
    }

    /**
     * دریافت وضعیت فعلی
     */
    getState() {
        return this.state?.toJSON() || null;
    }

    /**
     * پاک‌سازی کامپوننت
     */
    destroy() {
        this._stopTimer();

        if (this.renderer) {
            this.renderer.destroy();
            this.renderer = null;
        }

        this.container.innerHTML = '';
        this.container.removeAttribute('data-exercise-id');
        this.container.classList.remove('exercise-card-container');
        
        this.state = null;
    }

    // ============ Private Methods ============

    _validateExercise(exercise) {
        if (!exercise) {
            throw new Error('Exercise data is required');
        }

        if (!exercise.type) {
            throw new Error('Exercise type is required');
        }

        if (!exercise.question && exercise.type !== ExerciseType.FLASHCARD) {
            throw new Error('Exercise question is required');
        }

        const validTypes = Object.values(ExerciseType);
        if (!validTypes.includes(exercise.type)) {
            throw new Error(`Invalid exercise type: ${exercise.type}`);
        }
    }

    _createRenderer(type) {
        switch (type) {
            case ExerciseType.MULTIPLE_CHOICE:
                return new MultipleChoiceRenderer(this.container, {
                    onAnswer: (answer) => this.events.onAnswer?.(answer),
                    onHint: () => this.showHint(),
                    onSkip: () => this.skip()
                });

            case ExerciseType.FILL_BLANK:
                return new FillBlankRenderer(this.container, {
                    onAnswer: (answer) => this.events.onAnswer?.(answer),
                    onHint: () => this.showHint(),
                    onSkip: () => this.skip()
                });

            case ExerciseType.TRANSLATION:
                return new TranslationRenderer(this.container, {
                    onAnswer: (answer) => this.events.onAnswer?.(answer),
                    onHint: () => this.showHint(),
                    onSkip: () => this.skip()
                });

            case ExerciseType.FLASHCARD:
                return new FlashcardRenderer(this.container, {
                    onAnswer: (answer) => this.events.onAnswer?.(answer),
                    onHint: () => this.showHint(),
                    onSkip: () => this.skip()
                });

            default:
                return null;
        }
    }

    _startTimer(limit) {
        this.timeLeft = limit;
        this._stopTimer();

        this.timer = setInterval(() => {
            this.timeLeft -= 1000;

            if (this.timeLeft <= 0) {
                this._handleTimeout();
            } else {
                this._updateTimerDisplay();
            }
        }, 1000);

        this._updateTimerDisplay();
    }

    _stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    _handleTimeout() {
        this._stopTimer();
        
        if (this.state && this.state.state === CardState.READY) {
            this.state.state = CardState.TIMEOUT;
            this.renderer?.updateState(this.state);
            
            this.events.onTimeUpdate?.(0);
        }
    }

    _updateTimerDisplay() {
        if (!this.container) return;

        const minutes = Math.floor(this.timeLeft / 60000);
        const seconds = Math.floor((this.timeLeft % 60000) / 1000);
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        let timerEl = this.container.querySelector('.exercise-timer');
        if (!timerEl) {
            timerEl = document.createElement('div');
            timerEl.className = 'exercise-timer';
            this.container.insertBefore(timerEl, this.container.firstChild);
        }

        timerEl.textContent = `⏱️ ${timeStr}`;
        
        if (this.timeLeft < 10000) {
            timerEl.classList.add('timer-warning');
        }

        this.events.onTimeUpdate?.(this.timeLeft);
    }

    _showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'exercise-card-error';
        errorDiv.setAttribute('role', 'alert');
        errorDiv.innerHTML = `
            <span class="error-icon">⚠️</span>
            <p class="error-message">${message}</p>
        `;
        this.container.appendChild(errorDiv);
    }
}

// ============ CSS Styles ============
const defaultStyles = `
.exercise-card-container {
    position: relative;
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
}

.exercise-card {
    background: white;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
}

/* RTL Support */
.exercise-card[dir="rtl"],
[lang="fa"] .exercise-card {
    direction: rtl;
    text-align: right;
}

/* States */
.exercise-card.state-loading { opacity: 0.7; }
.exercise-card.state-correct { background: #f0fff4; border: 2px solid #28a745; }
.exercise-card.state-wrong { background: #fff5f5; border: 2px solid #dc3545; }
.exercise-card.state-timer-warning { border-color: #ffc107; }

/* Question */
.exercise-question {
    margin-bottom: 24px;
}

.question-text {
    font-size: 1.25rem;
    font-weight: 500;
    color: #2c3e50;
    line-height: 1.6;
}

.blank-indicator {
    display: inline-block;
    min-width: 100px;
    background: #e9ecef;
    border-radius: 4px;
    padding: 0 8px;
    color: #6c757d;
    font-weight: 600;
}

/* Options */
.exercise-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-bottom: 24px;
}

.option-btn {
    background: #f8f9fa;
    border: 2px solid #dee2e6;
    border-radius: 12px;
    padding: 16px;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
    position: relative;
    overflow: hidden;
}

.option-btn:hover:not(:disabled) {
    background: #e9ecef;
    border-color: #adb5bd;
    transform: translateY(-2px);
}

.option-btn.selected {
    background: #e3f2fd;
    border-color: #2196f3;
}

.option-btn.correct {
    background: #d4edda;
    border-color: #28a745;
}

.option-btn.wrong {
    background: #f8d7da;
    border-color: #dc3545;
}

.option-text {
    display: block;
    margin-bottom: 4px;
}

.option-feedback {
    font-size: 0.85rem;
    color: #6c757d;
}

/* Input */
.exercise-input {
    margin-bottom: 24px;
}

.answer-input {
    width: 100%;
    padding: 14px 16px;
    font-size: 1rem;
    border: 2px solid #dee2e6;
    border-radius: 12px;
    transition: border-color 0.2s;
    direction: auto;
}

.answer-input:focus {
    outline: none;
    border-color: #2196f3;
}

.answer-input.has-typo {
    border-color: #ffc107;
    background: #fff3cd;
}

.correct-answer-hint {
    display: block;
    margin-top: 8px;
    color: #28a745;
    font-size: 0.9rem;
}

.submit-btn {
    width: 100%;
    margin-top: 12px;
    padding: 14px;
    background: #2196f3;
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
}

.submit-btn:hover:not(:disabled) {
    background: #1976d2;
}

/* Flashcard */
.flashcard-inner {
    position: relative;
    width: 100%;
    height: 300px;
    text-align: center;
    transition: transform 0.6s;
    transform-style: preserve-3d;
    cursor: pointer;
}

.exercise-card.flipped .flashcard-inner {
    transform: rotateY(180deg);
}

.flashcard-front,
.flashcard-back {
    position: absolute;
    width: 100%;
    height: 100%;
    backface-visibility: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    border-radius: 16px;
    background: #f8f9fa;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.flashcard-back {
    transform: rotateY(180deg);
    background: #e3f2fd;
}

.flashcard-content {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.flashcard-text {
    font-size: 1.5rem;
    font-weight: 600;
    color: #2c3e50;
    margin-bottom: 16px;
}

.flashcard-hint {
    color: #6c757d;
    font-size: 0.9rem;
}

.flashcard-context {
    margin-top: 16px;
    color: #495057;
    font-size: 0.95rem;
    font-style: italic;
}

.flashcard-rating {
    display: flex;
    justify-content: space-around;
    gap: 8px;
    margin-top: 24px;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 12px;
}

.rating-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 8px;
    border: none;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.rating-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.rating-emoji {
    font-size: 1.5rem;
    margin-bottom: 4px;
}

.rating-label {
    font-size: 0.8rem;
    color: #6c757d;
}

/* Feedback */
.exercise-feedback {
    margin: 20px 0;
    padding: 16px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
}

.exercise-feedback.correct {
    background: #d4edda;
    color: #155724;
}

.exercise-feedback.wrong {
    background: #f8d7da;
    color: #721c24;
}

.feedback-icon {
    font-size: 1.5rem;
    font-weight: bold;
}

.feedback-message {
    flex: 1;
    font-size: 1rem;
    margin: 0;
}

.feedback-score {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 8px;
}

.feedback-explanation {
    margin-top: 12px;
    padding: 12px;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 8px;
    font-size: 0.95rem;
    line-height: 1.6;
}

.typo-warning {
    color: #856404;
    font-weight: 500;
}

.similarity-indicator {
    display: block;
    margin-top: 4px;
    font-size: 0.85rem;
    opacity: 0.8;
}

/* Actions */
.exercise-actions {
    display: flex;
    gap: 12px;
    margin-top: 20px;
    justify-content: flex-end;
}

.action-btn {
    padding: 10px 20px;
    border: 2px solid #dee2e6;
    border-radius: 8px;
    background: white;
    color: #495057;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
    background: #f8f9fa;
    border-color: #adb5bd;
}

.hint-btn {
    color: #17a2b8;
    border-color: #17a2b8;
}

.skip-btn {
    color: #6c757d;
    border-color: #6c757d;
}

.hint-text {
    padding: 12px;
    background: #fff3cd;
    border-radius: 8px;
    color: #856404;
    margin-bottom: 12px;
    font-style: italic;
}

/* Timer */
.exercise-timer {
    position: absolute;
    top: 12px;
    right: 12px;
    padding: 6px 12px;
    background: #f8f9fa;
    border-radius: 20px;
    font-size: 0.9rem;
    font-weight: 600;
    color: #495057;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.exercise-timer.timer-warning {
    background: #fff3cd;
    color: #856404;
    animation: pulse 1s infinite;
}

/* Error */
.exercise-card-error {
    padding: 20px;
    background: #f8d7da;
    border-radius: 12px;
    color: #721c24;
    text-align: center;
}

.error-icon {
    font-size: 2rem;
    margin-bottom: 8px;
}

.error-message {
    font-size: 1rem;
    margin: 0;
}

/* Animations */
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

/* Responsive */
@media (max-width: 480px) {
    .exercise-card {
        padding: 16px;
    }

    .exercise-options {
        grid-template-columns: 1fr;
    }

    .flashcard-rating {
        flex-wrap: wrap;
    }

    .rating-btn {
        min-width: 80px;
    }

    .exercise-timer {
        top: 8px;
        right: 8px;
        font-size: 0.8rem;
    }
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
    .exercise-card {
        background: #2d2d2d;
        color: #e0e0e0;
    }

    .question-text {
        color: #e0e0e0;
    }

    .option-btn {
        background: #3d3d3d;
        border-color: #555;
        color: #e0e0e0;
    }

    .flashcard-front,
    .flashcard-back {
        background: #3d3d3d;
        color: #e0e0e0;
    }

    .flashcard-text {
        color: #e0e0e0;
    }
}
`;

// اضافه کردن استایل‌ها به صفحه
if (typeof document !== 'undefined') {
    const styleId = 'exercise-card-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = defaultStyles;
        document.head.appendChild(style);
    }
}

// ============ Export ============
export {
    ExerciseCard,
    ExerciseCardConfig,
    ExerciseCardState,
    CardState,
    ExerciseType,
    MultipleChoiceRenderer,
    FillBlankRenderer,
    TranslationRenderer,
    FlashcardRenderer,
    defaultStyles
};
