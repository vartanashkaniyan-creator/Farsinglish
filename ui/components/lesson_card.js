/**
 * @file lesson_card.js
 * @module components/lesson_card
 * @description کارت درس حرفه‌ای با قابلیت توسعه، RTL داینامیک، event_bus امن، memoization و configurable thresholds
 * @version 2.4.0
 * @author Farsinglish Team
 * @license MIT
 */

/** ثابت‌های پیکربندی */
const DEFAULTS = {
    CACHE_SIZE: 100,
    CLICK_THRESHOLD: 300,
    USE_RAF: true
};

/** رنگ‌های سطح تسلط */
const MASTERY_COLORS = {
    0: '#f44336',
    1: '#ff9800',
    2: '#ffc107',
    3: '#8bc34a',
    4: '#4caf50',
    5: '#2e7d32'
};

/** برچسب‌های سطح تسلط */
const MASTERY_LABELS = {
    0: 'شروع نشده',
    1: 'آشنایی',
    2: 'در حال یادگیری',
    3: 'متوسط',
    4: 'خوب',
    5: 'عالی'
};

/** کلاس‌های CSS */
const CSS_CLASSES = {
    CARD: 'lesson-card',
    CARD_COMPACT: 'lesson-card--compact',
    HEADER: 'lesson-card-header',
    TITLE: 'lesson-title',
    DESCRIPTION: 'lesson-description',
    META: 'lesson-meta',
    WORD_COUNT: 'word-count',
    MASTERY_BADGE: 'mastery-badge',
    MASTERY_BADGE_LEVEL_PREFIX: 'mastery-badge--level-',
    DUE_INDICATOR: 'due-indicator',
    DUE_INDICATOR_VISIBLE: 'due-indicator--visible',
    PROGRESS_CONTAINER: 'progress-container',
    PROGRESS_BAR: 'progress-bar',
    PROGRESS_FILL: 'progress-bar-fill',
    PROGRESS_FILL_PREFIX: 'progress-bar-fill--',
    PROGRESS_TEXT: 'progress-text',
    PROGRESS_TEXT_ELLIPSIS: 'progress-text--ellipsis'
};

/**
 * @typedef {Object} Lesson
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {number} word_count
 * @property {string} [icon]
 * @property {string} [color]
 */

/**
 * @typedef {Object} Progress
 * @property {number} mastery_level
 * @property {boolean} is_due
 * @property {number} [interval]
 * @property {Date} [last_review]
 * @property {Date} [next_review]
 */

/**
 * @typedef {Object} Formatters
 * @property {Function} mastery_label
 * @property {Function} mastery_color
 * @property {Function} progress_percent
 * @property {Function} word_count_label
 */

/**
 * @typedef {Object} CardOptions
 * @property {Function} [on_click]
 * @property {boolean} [show_due_indicator=true]
 * @property {boolean} [show_progress_bar=true]
 * @property {boolean} [compact_mode=false]
 * @property {boolean} [rtl=false]
 * @property {number} [click_threshold=DEFAULTS.CLICK_THRESHOLD]
 */

/**
 * @typedef {Object} Router
 * @property {Function} navigate
 */

/**
 * @typedef {Object} EventBus
 * @property {Function} emit
 * @property {Function} on
 * @property {Function} off
 */

/**
 * @typedef {Object} CardDependencies
 * @property {Router} [router]
 * @property {EventBus} [event_bus]
 * @property {Object} [logger]
 * @property {Formatters} [formatters]
 * @property {boolean} [use_raf=DEFAULTS.USE_RAF]
 */

export class LessonCard {
    #abort_controller = null;
    #element = null;
    #lesson = null;
    #progress = null;
    #on_click = null;
    #formatters = null;
    #memoized_formatters = new Map();
    #event_bus = null;
    #logger = null;
    #router = null;
    #rtl = false;
    #escape_cache = new Map();
    #registered_events = new Set();
    #use_raf = DEFAULTS.USE_RAF;
    #last_click_time = 0;
    #click_threshold = DEFAULTS.CLICK_THRESHOLD;
    #is_destroyed = false;

    constructor(deps = {}) {
        this.#validate_dependencies(deps);

        this.#router = deps.router ?? null;
        this.#event_bus = deps.event_bus ?? null;
        this.#logger = deps.logger ?? console;
        this.#use_raf = deps.use_raf ?? DEFAULTS.USE_RAF;
        this.#formatters = this.#create_safe_formatters(deps.formatters);

        this.#handle_pointer_event = this.#handle_pointer_event.bind(this);
        this.#handle_mouse_enter = this.#handle_mouse_enter.bind(this);
        this.#handle_key_down = this.#handle_key_down.bind(this);
    }

    #validate_dependencies(deps) {
        if (deps.router && typeof deps.router.navigate !== 'function') {
            throw new TypeError('Router must have navigate method');
        }
        if (deps.formatters && typeof deps.formatters !== 'object') {
            throw new TypeError('Formatters must be object');
        }
        if (deps.event_bus) {
            if (typeof deps.event_bus.emit !== 'function') {
                throw new TypeError('EventBus must have emit method');
            }
            if (deps.event_bus.on && typeof deps.event_bus.on !== 'function') {
                throw new TypeError('EventBus.on must be function');
            }
            if (deps.event_bus.off && typeof deps.event_bus.off !== 'function') {
                throw new TypeError('EventBus.off must be function');
            }
        }
    }

    #create_safe_formatters(user_formatters = {}) {
        const defaults = {
            mastery_label: (level) => MASTERY_LABELS[level] ?? 'نامشخص',
            mastery_color: (level) => MASTERY_COLORS[level] ?? '#9e9e9e',
            progress_percent: (level) => Math.min(100, Math.max(0, (level ?? 0) * 20)),
            word_count_label: (count) => `📘 ${count?.toLocaleString('fa-IR') ?? 0} واژه`
        };

        const combined = { ...defaults, ...user_formatters };

        return {
            mastery_label: (level) => this.#memoize_formatter('mastery_label', level, combined.mastery_label, defaults.mastery_label),
            mastery_color: (level) => this.#memoize_formatter('mastery_color', level, combined.mastery_color, defaults.mastery_color),
            progress_percent: (level) => this.#memoize_formatter('progress_percent', level, combined.progress_percent, defaults.progress_percent),
            word_count_label: (count) => this.#memoize_formatter('word_count_label', count, combined.word_count_label, defaults.word_count_label)
        };
    }

    #memoize_formatter(name, key, fn, fallback) {
        const map = this.#memoized_formatters;
        const cache_key = `${name}_${key}`;
        if (map.has(cache_key)) return map.get(cache_key);
        try {
            const result = fn(key);
            map.set(cache_key, result);
            return result;
        } catch {
            return fallback(key);
        }
    }

    #validate_options(options = {}) {
        return {
            on_click: typeof options.on_click === 'function' ? options.on_click : null,
            show_due_indicator: options.show_due_indicator !== false,
            show_progress_bar: options.show_progress_bar !== false,
            compact_mode: Boolean(options.compact_mode),
            rtl: Boolean(options.rtl),
            click_threshold: Number(options.click_threshold) || DEFAULTS.CLICK_THRESHOLD
        };
    }

    #validate_lesson(lesson) {
        if (!lesson?.id?.trim()) throw new Error('Lesson must have valid id');
        return {
            id: String(lesson.id).trim(),
            title: lesson.title?.trim() ?? 'بدون عنوان',
            description: lesson.description?.trim() ?? '',
            word_count: Math.max(0, Number(lesson.word_count) || 0),
            icon: lesson.icon?.trim(),
            color: lesson.color?.trim()
        };
    }

    #validate_progress(progress) {
        if (!progress || typeof progress !== 'object') return { mastery_level: 0, is_due: false };
        return {
            mastery_level: Math.min(5, Math.max(0, Number(progress.mastery_level) || 0)),
            is_due: Boolean(progress.is_due),
            interval: Math.max(0, Number(progress.interval) || 0),
            last_review: progress.last_review instanceof Date ? progress.last_review : null,
            next_review: progress.next_review instanceof Date ? progress.next_review : null
        };
    }

    render(lesson, progress = null, options = {}) {
        const opts = this.#validate_options(options);
        this.#lesson = this.#validate_lesson(lesson);
        this.#progress = this.#validate_progress(progress);
        this.#on_click = opts.on_click;
        this.#rtl = opts.rtl;
        this.#click_threshold = opts.click_threshold;

        this.#abort_controller = new AbortController();
        this.#element = this.#create_card_element(opts);
        this.#attach_events(this.#element, opts);

        this.#emit('card_rendered', { lesson_id: this.#lesson.id, mastery_level: this.#progress.mastery_level });
        return this.#element;
    }

    #create_card_element(opts) {
        const card = document.createElement('div');
        card.className = CSS_CLASSES.CARD;
        card.dataset.lesson_id = this.#lesson.id;
        card.dataset.mastery_level = String(this.#progress.mastery_level);
        card.dir = this.#rtl ? 'rtl' : 'ltr';

        if (opts.compact_mode) card.classList.add(CSS_CLASSES.CARD_COMPACT);
        card.setAttribute('role', 'article');
        card.setAttribute('aria-labelledby', `lesson_title_${this.#lesson.id}`);
        card.setAttribute('tabindex', '0');
        card.innerHTML = this.#build_html(opts);
        return card;
    }

    #build_html(opts) {
        const mastery_level = this.#progress.mastery_level;
        const percent = this.#formatters.progress_percent(mastery_level);
        const title = this.#escape_html(this.#lesson.title);
        const description = this.#escape_html(this.#lesson.description);
        const mastery_label = this.#escape_html(this.#formatters.mastery_label(mastery_level));
        const word_label = this.#escape_html(this.#formatters.word_count_label(this.#lesson.word_count));
        const mastery_color = this.#formatters.mastery_color(mastery_level);

        const due_indicator = opts.show_due_indicator && this.#progress.is_due
            ? `<span class="${CSS_CLASSES.DUE_INDICATOR} ${CSS_CLASSES.DUE_INDICATOR_VISIBLE}" title="نیاز به مرور" role="status" aria-label="نیاز به مرور">🔔</span>`
            : '';

        const progress_bar = opts.show_progress_bar
            ? `<div class="${CSS_CLASSES.PROGRESS_CONTAINER}">
                    <div class="${CSS_CLASSES.PROGRESS_BAR}" role="presentation">
                        <div class="${CSS_CLASSES.PROGRESS_FILL} ${CSS_CLASSES.PROGRESS_FILL_PREFIX}${mastery_level}" 
                             style="width: ${percent}%; background-color:${mastery_color};" 
                             role="progressbar" 
                             aria-valuenow="${percent}" 
                             aria-valuemin="0" 
                             aria-valuemax="100"></div>
                    </div>
                    <span class="${CSS_CLASSES.PROGRESS_TEXT} ${CSS_CLASSES.PROGRESS_TEXT_ELLIPSIS}">${percent}%</span>
               </div>`
            : '';

        return `<div class="${CSS_CLASSES.HEADER}">
                    <h3 class="${CSS_CLASSES.TITLE}" id="lesson_title_${this.#lesson.id}">${title}</h3>
                    ${due_indicator}
                </div>
                <p class="${CSS_CLASSES.DESCRIPTION}">${description}</p>
                <div class="${CSS_CLASSES.META}">
                    <span class="${CSS_CLASSES.WORD_COUNT}">${word_label}</span>
                    <span class="${CSS_CLASSES.MASTERY_BADGE} ${CSS_CLASSES.MASTERY_BADGE_LEVEL_PREFIX}${mastery_level}" 
                          style="background-color:${mastery_color};">${mastery_label}</span>
                </div>
                ${progress_bar}`;
    }

    #escape_html(text) {
        if (!text) return '';
        if (this.#escape_cache.has(text)) return this.#escape_cache.get(text);

        const div = document.createElement('div');
        div.textContent = text;
        const escaped = div.innerHTML;

        if (this.#escape_cache.size >= DEFAULTS.CACHE_SIZE) {
            const first_key = this.#escape_cache.keys().next().value;
            this.#escape_cache.delete(first_key);
        }

        this.#escape_cache.set(text, escaped);
        return escaped;
    }

    #attach_events(card, opts) {
        const { signal } = this.#abort_controller;
        card.addEventListener('pointerdown', this.#handle_pointer_event, { signal });
        card.addEventListener('keydown', this.#handle_key_down, { signal });
        card.addEventListener('mouseenter', this.#handle_mouse_enter, { signal });
        this.#registered_events.add('pointerdown');
        this.#registered_events.add('keydown');
        this.#registered_events.add('mouseenter');
    }

    #handle_pointer_event(e) {
        const now = Date.now();
        if (now - this.#last_click_time < this.#click_threshold) {
            e.preventDefault();
            return;
        }
        this.#last_click_time = now;

        if (e.button !== 0 && e.pointerType !== 'touch') return;
        if (e.target.closest('.btn, button, a, .no-click')) return;

        e.preventDefault();
        this.#handle_activation();
    }

    #handle_key_down(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.#handle_activation();
        }
    }

    #handle_activation() {
        this.#emit('card_activated', { lesson_id: this.#lesson.id, mastery_level: this.#progress.mastery_level });
        if (this.#on_click) this.#on_click({ ...this.#lesson }, { ...this.#progress });
        else if (this.#router) this.#router.navigate(`/lesson/${this.#lesson.id}`);
    }

    #handle_mouse_enter = () => {
        this.#emit('card_hover', { lesson_id: this.#lesson.id });
    };

    update_progress(progress) {
        if (!this.#element) {
            this.#logger.warn?.('[LessonCard] Cannot update progress: card not rendered');
            return false;
        }

        try {
            const old_progress = { ...this.#progress };
            this.#progress = this.#validate_progress(progress);
            this.#update_mastery_badge(old_progress);
            this.#update_progress_bar(old_progress);
            this.#update_due_indicator(old_progress);
            this.#update_dataset(old_progress);
            this.#emit('card_progress_updated', { old_progress, new_progress: this.#progress, lesson_id: this.#lesson.id });
            return true;
        } catch (err) {
            this.#logger.error?.('[LessonCard] Failed to update progress:', err);
            return false;
        }
    }

    #update_dataset(old_progress) {
        if (!this.#element) return;
        if (old_progress.mastery_level !== this.#progress.mastery_level)
            this.#element.dataset.mastery_level = String(this.#progress.mastery_level);
    }

    #update_mastery_badge(old_progress) {
        if (!this.#element) return;
        const mastery_level = this.#progress.mastery_level;
        if (old_progress.mastery_level === mastery_level) return;
        const mastery_el = this.#element.querySelector(`.${CSS_CLASSES.MASTERY_BADGE}`);
        if (!mastery_el) return;

        const update_fn = () => {
            mastery_el.textContent = this.#escape_html(this.#formatters.mastery_label(mastery_level));
            mastery_el.style.backgroundColor = this.#formatters.mastery_color(mastery_level);
            mastery_el.className = `${CSS_CLASSES.MASTERY_BADGE} ${CSS_CLASSES.MASTERY_BADGE_LEVEL_PREFIX}${mastery_level}`;
        };

        if (this.#use_raf) requestAnimationFrame(update_fn);
        else update_fn();
    }

    #update_progress_bar(old_progress) {
        if (!this.#element) return;
        const mastery_level = this.#progress.mastery_level;
        if (old_progress.mastery_level === mastery_level) return;
        const percent = this.#formatters.progress_percent(mastery_level);
        const progress_fill = this.#element.querySelector(`.${CSS_CLASSES.PROGRESS_FILL}`);
        const progress_text = this.#element.querySelector(`.${CSS_CLASSES.PROGRESS_TEXT}`);

        const update_fn = () => {
            if (progress_fill) {
                progress_fill.style.width = `${percent}%`;
                progress_fill.setAttribute('aria-valuenow', percent);
                progress_fill.className = `${CSS_CLASSES.PROGRESS_FILL} ${CSS_CLASSES.PROGRESS_FILL_PREFIX}${mastery_level}`;
            }
            if (progress_text) progress_text.textContent = `${percent}%`;
        };

        if (this.#use_raf) requestAnimationFrame(update_fn);
        else update_fn();
    }

    #update_due_indicator(old_progress) {
        if (!this.#element) return;
        if (old_progress.is_due === this.#progress.is_due) return;
        const due_indicator = this.#element.querySelector(`.${CSS_CLASSES.DUE_INDICATOR}`);
        if (!due_indicator) return;
        if (this.#progress.is_due) due_indicator.classList.add(CSS_CLASSES.DUE_INDICATOR_VISIBLE);
        else due_indicator.classList.remove(CSS_CLASSES.DUE_INDICATOR_VISIBLE);
    }

    get element() { return this.#element; }
    get lesson_data() { return this.#lesson ? { ...this.#lesson } : null; }
    get progress_data() { return this.#progress ? { ...this.#progress } : null; }

    is_rendered() { return this.#element !== null && !this.#is_destroyed; }

    reset() {
        this.destroy();
        this.#escape_cache.clear();
        this.#registered_events.clear();
        this.#last_click_time = 0;
    }

    destroy() {
        try {
            this.#abort_controller?.abort();
            this.#abort_controller = null;
            this.#registered_events.forEach(ev => this.#event_bus?.off?.(this.#format_event_name(ev)));
            this.#registered_events.clear();

            if (this.#element?.parentNode) this.#element.remove();
