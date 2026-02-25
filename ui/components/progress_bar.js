
/**
 * Progress Bar Component
 * @module progress_bar
 * @version 2.3.2
 */

const DEFAULTS = Object.freeze({
    height: '8px',
    background_color: '#e0e0e0',
    fill_color: '#4caf50',
    border_radius: '4px',
    animation_duration: '0.3s',
    animation_easing: 'ease-in-out',
    label_font: '12px sans-serif',
    label_color: '#000000',
    label_padding: '8px',
    min_percent: 0,
    max_percent: 100
});

const SUPPORTED_EVENTS = Object.freeze([
    'update',
    'complete',
    'reset',
    'destroy'
]);

export class ProgressBar {
    #options;
    #container;
    #fill;
    #label;
    #state;
    #listeners;
    #update_lock = false;
    #last_width = null;

    constructor(user_config = {}) {
        this.#options = this.#deep_merge({
            animated: true,
            show_label: false,
            silent: false,
            direction: 'ltr',
            class_name: '',
            label_styles: {}
        }, user_config);

        this.#state = {
            mounted: false,
            percent: 0,
            last_update: Date.now()
        };

        this.#listeners = new Map();
        SUPPORTED_EVENTS.forEach(e => this.#listeners.set(e, []));
    }

    /* ===================== Public API ===================== */

    render(initial_percent = 0) {
        this.#assert_valid_percent(initial_percent);

        this.#container = document.createElement('div');
        this.#fill = document.createElement('div');

        this.#container.className = 'progress_bar_container';
        this.#fill.className = 'progress_bar_fill';

        if (this.#options.class_name) {
            this.#container.classList.add(...this.#options.class_name.split(' '));
        }

        this.#container.appendChild(this.#fill);

        if (this.#options.show_label) {
            this.#label = document.createElement('span');
            this.#label.className = 'progress_bar_label';
            this.#container.appendChild(this.#label);
        }

        this.#state.percent = this.#clamp_percent(initial_percent);
        this.#apply_styles();
        this.#update_dom(true);

        this.#apply_aria();

        this.#state.mounted = true;
        return this.#container;
    }

    update_percent(percent) {
        if (!this.#state.mounted || this.#update_lock) return false;

        this.#assert_valid_percent(percent);

        const next = this.#clamp_percent(percent);
        if (next === this.#state.percent) return true;

        this.#update_lock = true;

        const prev = this.#state.percent;
        this.#state.percent = next;
        this.#state.last_update = Date.now();

        this.#update_dom();

        this.#emit('update', { previous: prev, current: next });

        if (next === DEFAULTS.max_percent) {
            this.#emit('complete', next);
        }

        this.#update_lock = false;
        return true;
    }

    reset(silent = false) {
        this.update_percent(0);
        if (!silent) this.#emit('reset');
        return this;
    }

    on(event, callback) {
        if (!this.#listeners.has(event)) return this;
        this.#listeners.get(event).push(callback);
        return this;
    }

    off(event, callback) {
        if (!this.#listeners.has(event)) return this;
        if (!callback) {
            this.#listeners.set(event, []);
        } else {
            const list = this.#listeners.get(event);
            const idx = list.indexOf(callback);
            if (idx !== -1) list.splice(idx, 1);
        }
        return this;
    }

    destroy() {
        if (this.#container) {
            this.#container.remove();
        }

        this.#listeners.clear();
        this.#state.mounted = false;
        this.#emit('destroy');

        this.#container = null;
        this.#fill = null;
        this.#label = null;
    }

    /* ===================== Internals ===================== */

    #apply_styles() {
        Object.assign(this.#container.style, {
            height: DEFAULTS.height,
            backgroundColor: this.#options.background_color ?? DEFAULTS.background_color,
            borderRadius: DEFAULTS.border_radius,
            overflow: 'hidden',
            position: 'relative',
            direction: this.#options.direction
        });

        Object.assign(this.#fill.style, {
            height: '100%',
            backgroundColor: this.#options.fill_color ?? DEFAULTS.fill_color,
            transition: this.#options.animated
                ? `width ${DEFAULTS.animation_duration} ${DEFAULTS.animation_easing}`
                : 'none',
            willChange: this.#options.animated ? 'width' : 'auto'
        });

        if (this.#label) {
            Object.assign(this.#label.style, {
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                font: DEFAULTS.label_font,
                color: DEFAULTS.label_color,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                ...(this.#options.direction === 'rtl'
                    ? { left: DEFAULTS.label_padding }
                    : { right: DEFAULTS.label_padding })
            });
        }
    }

    #update_dom(force = false) {
        const width = `${this.#state.percent}%`;
        if (!force && width === this.#last_width) return;

        this.#fill.style.width = width;
        if (this.#label) {
            this.#label.textContent = `${Math.round(this.#state.percent)}%`;
        }

        this.#last_width = width;
        this.#apply_aria();
    }

    #apply_aria() {
        if (!this.#container) return;
        this.#container.setAttribute('role', 'progressbar');
        this.#container.setAttribute('aria-valuemin', DEFAULTS.min_percent);
        this.#container.setAttribute('aria-valuemax', DEFAULTS.max_percent);
        this.#container.setAttribute('aria-valuenow', this.#state.percent);
    }

    #emit(event, payload) {
        const list = this.#listeners.get(event);
        if (!list) return;

        list.forEach(fn => {
            try {
                fn(payload);
            } catch (err) {
                if (!this.#options.silent) {
                    console.error('[ProgressBar]', err);
                }
            }
        });
    }

    #assert_valid_percent(value) {
        if (typeof value !== 'number' || !isFinite(value)) {
            throw new Error('percent must be a finite number');
        }
        if (value < DEFAULTS.min_percent || value > DEFAULTS.max_percent) {
            throw new Error(`percent must be between ${DEFAULTS.min_percent} and ${DEFAULTS.max_percent}`);
        }
    }

    #clamp_percent(value) {
        return Math.min(DEFAULTS.max_percent, Math.max(DEFAULTS.min_percent, value));
    }

    #deep_merge(target, source) {
        const output = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                output[key] = this.#deep_merge(target[key] || {}, source[key]);
            } else {
                output[key] = source[key];
            }
        }
        return output;
    }
}

export default ProgressBar;
