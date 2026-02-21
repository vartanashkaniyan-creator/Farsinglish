/**
 * کامپوننت نوار پیشرفت
 * @module progress-bar
 * @version 2.2.0
 */

const DEFAULTS = {
    HEIGHT: '8px',
    BACKGROUND_COLOR: '#e0e0e0',
    FILL_COLOR: '#4caf50',
    ANIMATION_DURATION: '0.3s',
    BORDER_RADIUS: '4px',
    LABEL_FONT: '12px sans-serif',
    LABEL_COLOR: '#000000',
    MIN_PERCENT: 0,
    MAX_PERCENT: 100
};

const SUPPORTED_EVENTS = ['complete', 'update', 'destroy'];

export class ProgressBar {
    #options;
    #element;
    #fillElement;
    #labelElement;
    #state;
    #eventListeners;
    #instanceId;

    constructor(userConfig = {}) {
        this.#instanceId = `progress-bar-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.#options = this.#mergeWithDefaults(userConfig);
        this.#element = null;
        this.#fillElement = null;
        this.#labelElement = null;
        this.#state = { mounted: false, lastUpdate: Date.now(), currentPercent: 0, elementId: this.#instanceId };
        this.#eventListeners = new Map();
        SUPPORTED_EVENTS.forEach(e => this.#eventListeners.set(e, []));
        this.update = this.update.bind(this);
        this.destroy = this.destroy.bind(this);
        this.reset = this.reset.bind(this);
    }

    get percent() { return this.#state.currentPercent; }
    get isMounted() { return this.#state.mounted; }
    get id() { return this.#instanceId; }

    render(initialPercent = 0, renderConfig = {}) {
        const validation = this.#validatePercent(initialPercent);
        if (!validation.valid && !this.#options.silent) throw new Error(`[ProgressBar] ${validation.error}`);
        const config = this.#mergeConfigs(renderConfig);
        this.#state.currentPercent = this.#clampPercent(initialPercent);
        const elements = this.#createElements(config);
        this.#element = elements.container;
        this.#fillElement = elements.fill;
        this.#labelElement = elements.label;
        this.#applyStyles(config);
        if (config.className) this.#element.classList.add(...config.className.split(' '));
        this.#state.mounted = true;
        this.#state.lastUpdate = Date.now();

        // WAI-ARIA
        this.#element.setAttribute('role', 'progressbar');
        this.#element.setAttribute('aria-valuemin', DEFAULTS.MIN_PERCENT);
        this.#element.setAttribute('aria-valuemax', DEFAULTS.MAX_PERCENT);
        this.#element.setAttribute('aria-valuenow', this.#state.currentPercent);
        this.#element.setAttribute('aria-valuetext', `${this.#state.currentPercent}%`);

        if (this.#state.currentPercent === DEFAULTS.MAX_PERCENT) this.#emit('complete', this.#state.currentPercent);

        return this.#element;
    }

    update(percent, updateConfig = {}) {
        if (!this.#state.mounted || !this.#fillElement) {
            if (this.#options.silent) return false;
            throw new Error('[ProgressBar] Cannot update: component not rendered');
        }
        const validation = this.#validatePercent(percent);
        if (!validation.valid) {
            if (this.#options.silent) { console.warn(`[ProgressBar] ${validation.error}`); return false; }
            throw new Error(`[ProgressBar] ${validation.error}`);
        }

        const clampedPercent = this.#clampPercent(percent);
        const oldPercent = this.#state.currentPercent;
        if (oldPercent === clampedPercent && Object.keys(updateConfig).length === 0) return true;

        this.#state.currentPercent = clampedPercent;
        this.#state.lastUpdate = Date.now();
        const config = this.#mergeConfigs(updateConfig);
        this.#applyStyles(config);
        this.#fillElement.style.width = `${clampedPercent}%`;
        if (this.#labelElement) this.#labelElement.textContent = `${Math.round(clampedPercent)}%`;

        // WAI-ARIA update
        if (this.#element) {
            this.#element.setAttribute('aria-valuenow', clampedPercent);
            this.#element.setAttribute('aria-valuetext', `${clampedPercent}%`);
        }

        // RTL label overflow fix
        if (this.#labelElement) {
            this.#labelElement.style.maxWidth = 'calc(100% - 16px)';
            this.#labelElement.style.overflow = 'hidden';
            this.#labelElement.style.textOverflow = 'ellipsis';
        }

        this.#emit('update', { oldPercent, newPercent: clampedPercent, timestamp: this.#state.lastUpdate });
        if (clampedPercent === DEFAULTS.MAX_PERCENT && oldPercent !== DEFAULTS.MAX_PERCENT) {
            this.#emit('complete', clampedPercent);
            if (typeof config.onComplete === 'function') config.onComplete(clampedPercent);
        }
        return true;
    }

    setColors({ fill, background }) {
        if (fill) { this.#options.fillColor = fill; if (this.#fillElement) this.#fillElement.style.backgroundColor = fill; }
        if (background) { this.#options.backgroundColor = background; if (this.#element) this.#element.style.backgroundColor = background; }
        return this;
    }

    reset(silent = false) {
        if (!this.#state.mounted) return false;
        const success = this.update(0, { animated: false });
        if (success && !silent) this.#emit('reset', { timestamp: Date.now() });
        return success;
    }

    on(event, callback) {
        if (!SUPPORTED_EVENTS.includes(event) && event !== 'reset') { console.warn(`[ProgressBar] Unsupported event: ${event}`); return this; }
        if (!this.#eventListeners.has(event)) this.#eventListeners.set(event, []);
        this.#eventListeners.get(event).push(callback);
        return this;
    }

    off(event, callback) {
        if (!this.#eventListeners.has(event)) return this;
        if (callback) {
            const listeners = this.#eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index !== -1) listeners.splice(index, 1);
        } else this.#eventListeners.set(event, []);
        return this;
    }

    destroy() {
        if (this.#element?.parentNode) this.#element.parentNode.removeChild(this.#element);
        this.#element = this.#fillElement = this.#labelElement = null;
        this.#state.mounted = false;
        this.#state.lastUpdate = Date.now();
        this.#eventListeners.clear();
        this.#emit('destroy', { instanceId: this.#instanceId });
    }

    getState() { return { ...this.#state }; }

    #mergeWithDefaults(config) {
        return {
            height: config.height || DEFAULTS.HEIGHT,
            backgroundColor: config.backgroundColor || DEFAULTS.BACKGROUND_COLOR,
            fillColor: config.fillColor || DEFAULTS.FILL_COLOR,
            animated: config.animated ?? true,
            showLabel: config.showLabel ?? false,
            className: config.className || '',
            onComplete: config.onComplete || null,
            direction: config.direction || 'ltr',
            borderRadius: config.borderRadius || DEFAULTS.BORDER_RADIUS,
            silent: config.silent ?? false,
            labelStyles: {
                color: config.labelStyles?.color || DEFAULTS.LABEL_COLOR,
                font: config.labelStyles?.font || DEFAULTS.LABEL_FONT,
                textShadow: config.labelStyles?.textShadow || 'none'
            }
        };
    }

    #mergeConfigs(newConfig) {
        return { ...this.#options, ...newConfig, labelStyles: { ...this.#options.labelStyles, ...(newConfig.labelStyles || {}) } };
    }

    #createElements(config) {
        const container = document.createElement('div');
        container.className = 'progress-bar-container';
        container.dataset.testid = 'progress-bar';
        container.dataset.instance = this.#instanceId;

        const fill = document.createElement('div');
        fill.className = 'progress-bar-fill';
        fill.dataset.testid = 'progress-bar-fill';

        let label = null;
        if (config.showLabel) {
            label = document.createElement('span');
            label.className = 'progress-bar-label';
            label.dataset.testid = 'progress-bar-label';
            label.textContent = `${Math.round(this.#state.currentPercent)}%`;
        }
        return { container, fill, label };
    }

    #applyStyles(config) {
        if (!this.#element || !this.#fillElement) return;
        Object.assign(this.#element.style, { height: config.height, backgroundColor: config.backgroundColor, borderRadius: config.borderRadius, overflow: 'hidden', position: 'relative', direction: config.direction });
        Object.assign(this.#fillElement.style, { width: `${this.#state.currentPercent}%`, height: '100%', backgroundColor: config.fillColor, borderRadius: config.borderRadius, transition: config.animated ? `width ${DEFAULTS.ANIMATION_DURATION} ease-in-out` : 'none', willChange: config.animated ? 'width' : 'auto' });

        if (this.#labelElement) {
            const labelStyles = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', color: config.labelStyles.color, font: config.labelStyles.font, textShadow: config.labelStyles.textShadow, pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap', maxWidth: 'calc(100% - 16px)', overflow: 'hidden', textOverflow: 'ellipsis' };
            if (config.direction === 'rtl') labelStyles.left = '8px'; else labelStyles.right = '8px';
            Object.assign(this.#labelElement.style, labelStyles);
        }
    }

    #validatePercent(percent) {
        const result = { valid: true, error: null };
        if (percent === null || percent === undefined) { result.valid = false; result.error = 'Percent cannot be null or undefined'; }
        else if (typeof percent !== 'number') { result.valid = false; result.error = `Percent must be a number, got ${typeof percent}`; }
        else if (isNaN(percent)) { result.valid = false; result.error = 'Percent cannot be NaN'; }
        else if (!isFinite(percent)) { result.valid = false; result.error = 'Percent must be finite'; }
        else if (percent < DEFAULTS.MIN_PERCENT || percent > DEFAULTS.MAX_PERCENT) { result.valid = false; result.error = `Percent must be between ${DEFAULTS.MIN_PERCENT} and ${DEFAULTS.MAX_PERCENT}`; }
        return result;
    }

    #clampPercent(percent) { return Math.min(DEFAULTS.MAX_PERCENT, Math.max(DEFAULTS.MIN_PERCENT, percent)); }

    #emit(event, data) {
        if (!this.#eventListeners.has(event)) return;
        this.#eventListeners.get(event).forEach(cb => { try { cb(data); } catch (err) { console.error(`[ProgressBar] Error in ${event} listener:`, err); } });
    }
}

// استاتیک
ProgressBar.create = (config = {}) => new ProgressBar(config);
ProgressBar.defaults = { ...DEFAULTS };
ProgressBar.events = [...SUPPORTED_EVENTS, 'reset'];
if (typeof window !== 'undefined' && window.VITEST) window.__PROGRESS_BAR_V2__ = { ProgressBar };
export default ProgressBar;
