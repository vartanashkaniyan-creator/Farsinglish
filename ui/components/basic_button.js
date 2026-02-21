/**
 * BasicButton v2.7.1
 * کامپوننت دکمه حرفه‌ای
 * رعایت SOLID، DI، snake_case، Fluent API، RTL و دسترسی‌پذیری
 */

/** @typedef {Object} ButtonOptions
 * @property {string} [text] - متن دکمه
 * @property {string} [variant] - نوع دکمه (primary, secondary, outline, ghost, icon)
 * @property {string} [size] - اندازه (small, medium, large)
 * @property {boolean} [disabled] - غیرفعال بودن
 * @property {boolean} [loading] - حالت در حال بارگذاری
 * @property {string} [icon] - آیکون (Font Awesome یا متن)
 * @property {string} [aria_label] - برچسب دسترسی
 * @property {Function} [on_click] - تابع کلیک
 * @property {boolean} [full_width] - عرض کامل
 */

const DEFAULTS = {
    VARIANT: 'primary',
    SIZE: 'medium',
    CLICK_THRESHOLD: 300
};

export class ButtonState {
    #text = '';
    #disabled = false;
    #loading = false;

    constructor(options = {}) {
        this.#text = options.text || '';
        this.#disabled = options.disabled || false;
        this.#loading = options.loading || false;
    }

    get_state() {
        return { text: this.#text, disabled: this.#disabled, loading: this.#loading };
    }

    set_text(text) { this.#text = text; return this; }
    set_disabled(disabled) { this.#disabled = disabled; return this; }
    set_loading(loading) { this.#loading = loading; return this; }
}

export class ButtonRenderer {
    #state;
    #element = null;
    #doc;
    #click_handler = null;
    #debounce_timeout = null;

    constructor(state, doc = document) {
        this.#state = state;
        this.#doc = doc;
    }

    /** @returns {HTMLButtonElement} */
    render(options = {}) {
        const config = { ...this.#state.get_state(), ...options };
        const button = this.#doc.createElement('button');
        button.type = 'button';
        button.className = this.#build_class_name(config);

        if (config.disabled || config.loading) button.disabled = true;
        if (config.aria_label) button.setAttribute('aria-label', config.aria_label);
        if (config.full_width) button.style.width = '100%';

        // حذف تمام فرزندان (innerHTML جایگزین نشد)
        while (button.firstChild) button.removeChild(button.firstChild);

        // محتوا
        button.appendChild(this.#build_inner_content(config));

        // کلیک با debounce
        if (config.on_click && typeof config.on_click === 'function') {
            const handler = (e) => {
                if (button.disabled) return;
                if (this.#debounce_timeout) return;
                this.#debounce_timeout = setTimeout(() => this.#debounce_timeout = null, DEFAULTS.CLICK_THRESHOLD);
                config.on_click(e);
            };
            button.addEventListener('click', handler);
            this.#click_handler = { element: button, handler };
        }

        // keyboard accessibility
        button.addEventListener('keydown', e => {
            if (button.disabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                button.click();
            }
        });

        this.#element = button;
        return button;
    }

    #build_class_name(config) {
        const classes = ['btn', `btn-${config.variant || DEFAULTS.VARIANT}`, `btn-${config.size || DEFAULTS.SIZE}`];
        if (config.loading) classes.push('btn-loading');
        if (config.icon && !config.text) classes.push('btn-icon-only');
        return classes.join(' ');
    }

    #build_inner_content(config) {
        const fragment = this.#doc.createDocumentFragment();

        if (config.loading) {
            const spinner = this.#doc.createElement('span');
            spinner.className = 'btn-spinner';
            spinner.setAttribute('aria-live', 'polite');
            fragment.appendChild(spinner);
        }

        if (config.icon) {
            const icon_el = config.icon.startsWith('fa-') 
                ? this.#create_fa_icon(config.icon)
                : this.#create_span_icon(config.icon);
            fragment.appendChild(icon_el);
        }

        if (config.text) {
            const text_span = this.#doc.createElement('span');
            text_span.className = 'btn-text';
            text_span.textContent = config.text;
            fragment.appendChild(text_span);
        }

        return fragment;
    }

    #create_fa_icon(icon) {
        const i = this.#doc.createElement('i');
        i.className = `fas ${icon}`;
        return i;
    }

    #create_span_icon(icon) {
        const span = this.#doc.createElement('span');
        span.className = 'btn-icon';
        span.textContent = icon;
        return span;
    }

    set_text(text) {
        if (!this.#element) return this;
        const text_span = this.#element.querySelector('.btn-text');
        if (text_span) text_span.textContent = text;
        else {
            const span = this.#doc.createElement('span');
            span.className = 'btn-text';
            span.textContent = text;
            this.#element.appendChild(span);
        }
        return this;
    }

    set_disabled(disabled) {
        if (!this.#element) return this;
        this.#element.disabled = disabled;
        return this;
    }

    set_loading(loading) {
        if (!this.#element) return this;
        const spinner = this.#element.querySelector('.btn-spinner');
        if (loading && !spinner) {
            const new_spinner = this.#doc.createElement('span');
            new_spinner.className = 'btn-spinner';
            new_spinner.setAttribute('aria-live', 'polite');
            this.#element.prepend(new_spinner);
        } else if (!loading && spinner) spinner.remove();

        this.#element.disabled = loading || this.#element.disabled;
        return this;
    }

    destroy() {
        if (this.#click_handler) {
            const { element, handler } = this.#click_handler;
            element.removeEventListener('click', handler);
            clearTimeout(this.#debounce_timeout);
            this.#debounce_timeout = null;
            this.#click_handler = null;
        }
        if (this.#element) {
            while (this.#element.firstChild) this.#element.removeChild(this.#element.firstChild);
            this.#element.remove();
            this.#element = null;
        }
    }
}

export class BasicButton {
    #state;
    #renderer;

    constructor(options = {}, doc = document) {
        this.#state = new ButtonState(options);
        this.#renderer = new ButtonRenderer(this.#state, doc);
    }

    render(override_options = {}) {
        return this.#renderer.render({ ...this.#state.get_state(), ...override_options });
    }

    set_text(text) { this.#state.set_text(text); this.#renderer.set_text(text); return this; }
    set_disabled(disabled) { this.#state.set_disabled(disabled); this.#renderer.set_disabled(disabled); return this; }
    set_loading(loading) { this.#state.set_loading(loading); this.#renderer.set_loading(loading); return this; }
    get_state() { return this.#state.get_state(); }
    destroy() { this.#renderer.destroy(); }
}
