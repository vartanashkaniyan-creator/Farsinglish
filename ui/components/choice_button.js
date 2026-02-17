```javascript
// ui/components/choice-button.js
/**
 * Choice Button Component - دکمه انتخاب گزینه
 * مسئولیت: نمایش و مدیریت دکمه‌های انتخاب با حالت‌های مختلف
 * اصل SRP: فقط مسئول نمایش و رویدادهای یک دکمه انتخاب
 * اصل DIP: مستقل از نوع تمرین و قابل استفاده در جاهای مختلف
 * اصل OCP: قابل توسعه با حالت‌ها و استایل‌های جدید
 */

// ============ Types and Enums ============
const ButtonState = {
    DEFAULT: 'default',
    SELECTED: 'selected',
    CORRECT: 'correct',
    WRONG: 'wrong',
    DISABLED: 'disabled',
    HOVER: 'hover',
    FOCUS: 'focus',
    LOADING: 'loading',
    SUCCESS: 'success',
    ERROR: 'error'
};

const ButtonSize = {
    SMALL: 'small',
    MEDIUM: 'medium',
    LARGE: 'large'
};

const ButtonVariant = {
    PRIMARY: 'primary',
    SECONDARY: 'secondary',
    SUCCESS: 'success',
    DANGER: 'danger',
    WARNING: 'warning',
    INFO: 'info',
    OUTLINE: 'outline',
    GHOST: 'ghost'
};

const ButtonAnimation = {
    NONE: 'none',
    PULSE: 'pulse',
    BOUNCE: 'bounce',
    SHAKE: 'shake',
    GLOW: 'glow',
    RIPPLE: 'ripple'
};

// ============ Config Class ============
class ChoiceButtonConfig {
    constructor(config = {}) {
        // اندازه و ظاهر
        this.size = config.size || ButtonSize.MEDIUM;
        this.variant = config.variant || ButtonVariant.PRIMARY;
        this.state = config.state || ButtonState.DEFAULT;
        this.animation = config.animation || ButtonAnimation.RIPPLE;
        
        // محتوا
        this.text = config.text || '';
        this.icon = config.icon || null;
        this.iconPosition = config.iconPosition || 'left'; // left, right, top
        this.secondaryText = config.secondaryText || '';
        
        // قابلیت‌ها
        this.disabled = config.disabled || false;
        this.loading = config.loading || false;
        this.fullWidth = config.fullWidth || false;
        this.rounded = config.rounded ?? true;
        this.outlined = config.outlined || false;
        
        // استایل
        this.backgroundColor = config.backgroundColor || '';
        this.textColor = config.textColor || '';
        this.borderColor = config.borderColor || '';
        this.customClass = config.customClass || '';
        this.customStyle = config.customStyle || {};
        
        // رفتار
        this.ripple = config.ripple ?? true;
        this.rippleColor = config.rippleColor || 'rgba(255, 255, 255, 0.3)';
        this.hapticFeedback = config.hapticFeedback ?? false; // برای موبایل
        this.autoFocus = config.autoFocus || false;
        
        // accessibility
        this.ariaLabel = config.ariaLabel || '';
        this.ariaDescribedBy = config.ariaDescribedBy || '';
        this.role = config.role || 'button';
        this.tabIndex = config.tabIndex || 0;
        
        // رویدادها
        this.onClick = config.onClick || null;
        this.onHover = config.onHover || null;
        this.onFocus = config.onFocus || null;
        this.onBlur = config.onBlur || null;
        this.onKeyDown = config.onKeyDown || null;
        
        // data attributes
        this.dataAttributes = config.dataAttributes || {};
    }

    merge(newConfig) {
        return new ChoiceButtonConfig({
            ...this,
            ...newConfig
        });
    }

    validate() {
        if (!this.text && !this.icon) {
            console.warn('ChoiceButton: Neither text nor icon provided');
        }
        return true;
    }
}

// ============ State Manager ============
class ChoiceButtonState {
    constructor(initialState = ButtonState.DEFAULT) {
        this.currentState = initialState;
        this.previousState = null;
        this.stateStack = [];
        this.stateHistory = [];
        this.transitioning = false;
    }

    setState(newState) {
        if (this.currentState === newState) return false;
        
        this.previousState = this.currentState;
        this.stateStack.push(this.currentState);
        this.stateHistory.push({
            from: this.currentState,
            to: newState,
            timestamp: Date.now()
        });
        
        this.currentState = newState;
        this.transitioning = true;
        
        setTimeout(() => {
            this.transitioning = false;
        }, 300);
        
        return true;
    }

    revert() {
        if (this.stateStack.length === 0) return false;
        
        const previousState = this.stateStack.pop();
        this.setState(previousState);
        return true;
    }

    is(state) {
        return this.currentState === state;
    }

    canTransitionTo(state) {
        const validTransitions = {
            [ButtonState.DEFAULT]: [ButtonState.SELECTED, ButtonState.HOVER, ButtonState.FOCUS, ButtonState.DISABLED],
            [ButtonState.SELECTED]: [ButtonState.CORRECT, ButtonState.WRONG, ButtonState.DEFAULT, ButtonState.DISABLED],
            [ButtonState.CORRECT]: [ButtonState.DEFAULT, ButtonState.DISABLED],
            [ButtonState.WRONG]: [ButtonState.DEFAULT, ButtonState.DISABLED],
            [ButtonState.DISABLED]: [ButtonState.DEFAULT],
            [ButtonState.HOVER]: [ButtonState.SELECTED, ButtonState.DEFAULT, ButtonState.FOCUS],
            [ButtonState.FOCUS]: [ButtonState.SELECTED, ButtonState.DEFAULT, ButtonState.HOVER],
            [ButtonState.LOADING]: [ButtonState.DEFAULT, ButtonState.SUCCESS, ButtonState.ERROR],
            [ButtonState.SUCCESS]: [ButtonState.DEFAULT],
            [ButtonState.ERROR]: [ButtonState.DEFAULT]
        };
        
        return validTransitions[this.currentState]?.includes(state) || false;
    }

    getStateClass() {
        return `choice-button-state-${this.currentState}`;
    }

    getStateInfo() {
        return {
            current: this.currentState,
            previous: this.previousState,
            transitioning: this.transitioning,
            history: this.stateHistory.slice(-5) // آخرین 5 تغییر
        };
    }
}

// ============ Animation Manager ============
class ButtonAnimationManager {
    constructor(element, config) {
        this.element = element;
        this.config = config;
        this.animations = new Map();
        this.runningAnimations = new Set();
    }

    play(animationType = null) {
        const type = animationType || this.config.animation;
        if (type === ButtonAnimation.NONE) return;

        const animation = this._getAnimation(type);
        if (animation) {
            this._stopRunningAnimations();
            animation.play();
            this.runningAnimations.add(type);
        }
    }

    stop(animationType = null) {
        if (animationType) {
            const animation = this.animations.get(animationType);
            if (animation) {
                animation.stop();
                this.runningAnimations.delete(animationType);
            }
        } else {
            this._stopAllAnimations();
        }
    }

    createRipple(event) {
        if (!this.config.ripple) return;

        const ripple = document.createElement('span');
        const diameter = Math.max(this.element.clientWidth, this.element.clientHeight);
        const radius = diameter / 2;

        ripple.style.width = ripple.style.height = `${diameter}px`;
        ripple.style.left = `${event.offsetX - radius}px`;
        ripple.style.top = `${event.offsetY - radius}px`;
        ripple.style.position = 'absolute';
        ripple.style.borderRadius = '50%';
        ripple.style.backgroundColor = this.config.rippleColor;
        ripple.style.transform = 'scale(0)';
        ripple.style.animation = 'ripple 0.6s linear';
        ripple.style.pointerEvents = 'none';

        this.element.style.position = 'relative';
        this.element.style.overflow = 'hidden';
        this.element.appendChild(ripple);

        setTimeout(() => {
            ripple.remove();
        }, 600);
    }

    _getAnimation(type) {
        if (this.animations.has(type)) {
            return this.animations.get(type);
        }

        let animation;
        switch (type) {
            case ButtonAnimation.PULSE:
                animation = this._createPulseAnimation();
                break;
            case ButtonAnimation.BOUNCE:
                animation = this._createBounceAnimation();
                break;
            case ButtonAnimation.SHAKE:
                animation = this._createShakeAnimation();
                break;
            case ButtonAnimation.GLOW:
                animation = this._createGlowAnimation();
                break;
            default:
                return null;
        }

        if (animation) {
            this.animations.set(type, animation);
        }

        return animation;
    }

    _createPulseAnimation() {
        let running = false;
        
        return {
            play: () => {
                if (running) return;
                running = true;
                this.element.style.animation = 'pulse 1s infinite';
            },
            stop: () => {
                running = false;
                this.element.style.animation = '';
            }
        };
    }

    _createBounceAnimation() {
        let running = false;
        
        return {
            play: () => {
                if (running) return;
                running = true;
                this.element.style.animation = 'bounce 0.5s ease';
            },
            stop: () => {
                running = false;
                this.element.style.animation = '';
            }
        };
    }

    _createShakeAnimation() {
        let running = false;
        
        return {
            play: () => {
                if (running) return;
                running = true;
                this.element.style.animation = 'shake 0.3s ease-in-out';
                setTimeout(() => this.stop(), 300);
            },
            stop: () => {
                running = false;
                this.element.style.animation = '';
            }
        };
    }

    _createGlowAnimation() {
        let running = false;
        
        return {
            play: () => {
                if (running) return;
                running = true;
                this.element.style.animation = 'glow 1.5s infinite alternate';
            },
            stop: () => {
                running = false;
                this.element.style.animation = '';
            }
        };
    }

    _stopRunningAnimations() {
        this.runningAnimations.forEach(type => {
            const anim = this.animations.get(type);
            if (anim) anim.stop();
        });
        this.runningAnimations.clear();
    }

    _stopAllAnimations() {
        this.animations.forEach(anim => anim.stop());
        this.runningAnimations.clear();
        this.element.style.animation = '';
    }
}

// ============ Icon Manager ============
class IconManager {
    constructor(element, config) {
        this.element = element;
        this.config = config;
        this.iconElement = null;
    }

    render() {
        if (!this.config.icon) return null;

        this.iconElement = document.createElement('span');
        this.iconElement.className = `choice-button-icon icon-position-${this.config.iconPosition}`;
        
        if (typeof this.config.icon === 'string') {
            // آیکون متنی (emoji یا حرف)
            this.iconElement.textContent = this.config.icon;
        } else if (this.config.icon instanceof HTMLElement) {
            // آیکون HTML
            this.iconElement.appendChild(this.config.icon);
        } else if (this.config.icon.url) {
            // آیکون تصویری
            const img = document.createElement('img');
            img.src = this.config.icon.url;
            img.alt = this.config.icon.alt || 'icon';
            img.className = 'choice-button-icon-img';
            this.iconElement.appendChild(img);
        }

        return this.iconElement;
    }

    update(icon) {
        this.config.icon = icon;
        if (this.iconElement) {
            this.iconElement.remove();
            this.render();
        }
    }

    remove() {
        if (this.iconElement) {
            this.iconElement.remove();
            this.iconElement = null;
        }
    }
}

// ============ Main Component ============
class ChoiceButton {
    constructor(container, config = {}) {
        if (!container) {
            throw new Error('ChoiceButton: Container element is required');
        }

        this.container = typeof container === 'string' 
            ? document.querySelector(container) 
            : container;

        if (!this.container) {
            throw new Error('ChoiceButton: Container element not found');
        }

        this.config = new ChoiceButtonConfig(config);
        this.config.validate();

        this.state = new ChoiceButtonState(this.config.state);
        this.element = null;
        this.textElement = null;
        this.secondaryTextElement = null;
        this.iconManager = null;
        this.animationManager = null;

        this.init();
    }

    init() {
        this.create();
        this.setupEventListeners();
        this.applyAccessibility();
        
        if (this.config.autoFocus) {
            this.focus();
        }
    }

    create() {
        this.element = document.createElement('button');
        this.element.className = this._getClassNames();
        
        // اعمال استایل‌های سفارشی
        this._applyCustomStyles();

        // ایجاد محتوا
        this._createContent();

        // اضافه کردن به DOM
        this.container.appendChild(this.element);

        // ایجاد animation manager
        this.animationManager = new ButtonAnimationManager(this.element, this.config);
    }

    _createContent() {
        // آیکون
        if (this.config.icon) {
            this.iconManager = new IconManager(this.element, this.config);
            const iconEl = this.iconManager.render();
            if (iconEl) this.element.appendChild(iconEl);
        }

        // متن اصلی
        if (this.config.text) {
            this.textElement = document.createElement('span');
            this.textElement.className = 'choice-button-text';
            this.textElement.textContent = this.config.text;
            this.element.appendChild(this.textElement);
        }

        // متن ثانویه
        if (this.config.secondaryText) {
            this.secondaryTextElement = document.createElement('small');
            this.secondaryTextElement.className = 'choice-button-secondary-text';
            this.secondaryTextElement.textContent = this.config.secondaryText;
            this.element.appendChild(this.secondaryTextElement);
        }

        // loading indicator
        if (this.config.loading) {
            this._showLoading();
        }
    }

    _applyCustomStyles() {
        const styles = this.config.customStyle;
        
        if (this.config.backgroundColor) {
            this.element.style.backgroundColor = this.config.backgroundColor;
        }
        if (this.config.textColor) {
            this.element.style.color = this.config.textColor;
        }
        if (this.config.borderColor) {
            this.element.style.borderColor = this.config.borderColor;
        }
        
        Object.keys(styles).forEach(key => {
            this.element.style[key] = styles[key];
        });
    }

    setupEventListeners() {
        if (!this.element) return;

        // کلیک
        this.element.addEventListener('click', (event) => {
            if (this.config.disabled || this.config.loading) {
                event.preventDefault();
                return;
            }

            if (this.config.ripple) {
                this.animationManager.createRipple(event);
            }

            if (this.config.hapticFeedback && window.navigator?.vibrate) {
                window.navigator.vibrate(10);
            }

            this.config.onClick?.(event, this);
        });

        // hover
        this.element.addEventListener('mouseenter', () => {
            if (!this.config.disabled && !this.config.loading) {
                this.setState(ButtonState.HOVER);
                this.config.onHover?.(true);
            }
        });

        this.element.addEventListener('mouseleave', () => {
            if (this.state.is(ButtonState.HOVER) || this.state.is(ButtonState.SELECTED)) {
                this.setState(ButtonState.DEFAULT);
                this.config.onHover?.(false);
            }
        });

        // focus
        this.element.addEventListener('focus', () => {
            if (!this.config.disabled && !this.config.loading) {
                this.setState(ButtonState.FOCUS);
                this.config.onFocus?.();
            }
        });

        this.element.addEventListener('blur', () => {
            if (this.state.is(ButtonState.FOCUS)) {
                this.setState(ButtonState.DEFAULT);
                this.config.onBlur?.();
            }
        });

        // keyboard
        this.element.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.element.click();
            }
            this.config.onKeyDown?.(event);
        });
    }

    applyAccessibility() {
        if (!this.element) return;

        this.element.setAttribute('role', this.config.role);
        this.element.setAttribute('tabindex', this.config.disabled ? -1 : this.config.tabIndex);
        
        if (this.config.ariaLabel) {
            this.element.setAttribute('aria-label', this.config.ariaLabel);
        }
        
        if (this.config.ariaDescribedBy) {
            this.element.setAttribute('aria-describedby', this.config.ariaDescribedBy);
        }

        if (this.config.disabled) {
            this.element.setAttribute('aria-disabled', 'true');
        }

        if (this.config.loading) {
            this.element.setAttribute('aria-busy', 'true');
        }

        // data attributes
        Object.entries(this.config.dataAttributes).forEach(([key, value]) => {
            this.element.setAttribute(`data-${key}`, value);
        });
    }

    // ============ Public Methods ============

    setState(newState) {
        if (!this.state.canTransitionTo(newState)) {
            console.warn(`Invalid state transition: ${this.state.currentState} -> ${newState}`);
            return false;
        }

        const oldState = this.state.currentState;
        this.state.setState(newState);
        
        this.element.classList.remove(`choice-button-state-${oldState}`);
        this.element.classList.add(`choice-button-state-${newState}`);
        
        // انیمیشن بر اساس state جدید
        if (newState === ButtonState.CORRECT) {
            this.animationManager.play(ButtonAnimation.BOUNCE);
        } else if (newState === ButtonState.WRONG) {
            this.animationManager.play(ButtonAnimation.SHAKE);
        }

        // dispatch رویداد
        this.element.dispatchEvent(new CustomEvent('stateChange', {
            detail: { oldState, newState }
        }));

        return true;
    }

    setText(text) {
        this.config.text = text;
        if (this.textElement) {
            this.textElement.textContent = text;
        }
    }

    setSecondaryText(text) {
        this.config.secondaryText = text;
        if (this.secondaryTextElement) {
            this.secondaryTextElement.textContent = text;
        }
    }

    setIcon(icon) {
        if (this.iconManager) {
            this.iconManager.update(icon);
        } else {
            this.config.icon = icon;
            this.iconManager = new IconManager(this.element, this.config);
            const iconEl = this.iconManager.render();
            if (iconEl) {
                if (this.textElement) {
                    this.element.insertBefore(iconEl, this.textElement);
                } else {
                    this.element.appendChild(iconEl);
                }
            }
        }
    }

    setDisabled(disabled) {
        this.config.disabled = disabled;
        
        if (disabled) {
            this.setState(ButtonState.DISABLED);
            this.element.setAttribute('aria-disabled', 'true');
            this.element.tabIndex = -1;
        } else {
            this.setState(ButtonState.DEFAULT);
            this.element.removeAttribute('aria-disabled');
            this.element.tabIndex = this.config.tabIndex;
        }
    }

    setLoading(loading) {
        this.config.loading = loading;
        
        if (loading) {
            this._showLoading();
            this.setState(ButtonState.LOADING);
            this.element.setAttribute('aria-busy', 'true');
        } else {
            this._hideLoading();
            this.setState(ButtonState.DEFAULT);
            this.element.removeAttribute('aria-busy');
        }
    }

    setSelected(selected) {
        if (selected) {
            this.setState(ButtonState.SELECTED);
        } else {
            this.setState(ButtonState.DEFAULT);
        }
    }

    setCorrect(animate = true) {
        this.setState(ButtonState.CORRECT);
    }

    setWrong(animate = true) {
        this.setState(ButtonState.WRONG);
    }

    focus() {
        this.element?.focus();
    }

    blur() {
        this.element?.blur();
    }

    click() {
        this.element?.click();
    }

    playAnimation(animationType) {
        this.animationManager.play(animationType);
    }

    stopAnimation() {
        this.animationManager.stop();
    }

    getState() {
        return this.state.getStateInfo();
    }

    getElement() {
        return this.element;
    }

    destroy() {
        this.animationManager?.stop();
        this.iconManager?.remove();
        
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        
        this.element = null;
        this.textElement = null;
        this.secondaryTextElement = null;
        this.iconManager = null;
        this.animationManager = null;
    }

    // ============ Private Methods ============

    _getClassNames() {
        const classes = [
            'choice-button',
            `choice-button-size-${this.config.size}`,
            `choice-button-variant-${this.config.variant}`,
            `choice-button-state-${this.state.currentState}`,
            this.config.customClass
        ];

        if (this.config.fullWidth) {
            classes.push('choice-button-full-width');
        }

        if (this.config.rounded) {
            classes.push('choice-button-rounded');
        }

        if (this.config.outlined) {
            classes.push('choice-button-outlined');
        }

        if (this.config.disabled) {
            classes.push('choice-button-disabled');
        }

        if (this.config.loading) {
            classes.push('choice-button-loading');
        }

        if (this.config.icon && !this.config.text) {
            classes.push('choice-button-icon-only');
        }

        return classes.filter(Boolean).join(' ');
    }

    _showLoading() {
        if (!this.element) return;

        const spinner = document.createElement('span');
        spinner.className = 'choice-button-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            dot.className = 'spinner-dot';
            spinner.appendChild(dot);
        }

        this.element.appendChild(spinner);
    }

    _hideLoading() {
        const spinner = this.element?.querySelector('.choice-button-spinner');
        if (spinner) {
            spinner.remove();
        }
    }
}

// ============ Factory ============
class ChoiceButtonFactory {
    static create(container, config = {}) {
        return new ChoiceButton(container, config);
    }

    static createPrimary(container, text, onClick) {
        return new ChoiceButton(container, {
            text,
            variant: ButtonVariant.PRIMARY,
            onClick
        });
    }

    static createSecondary(container, text, onClick) {
        return new ChoiceButton(container, {
            text,
            variant: ButtonVariant.SECONDARY,
            onClick
        });
    }

    static createSuccess(container, text, onClick) {
        return new ChoiceButton(container, {
            text,
            variant: ButtonVariant.SUCCESS,
            onClick
        });
    }

    static createDanger(container, text, onClick) {
        return new ChoiceButton(container, {
            text,
            variant: ButtonVariant.DANGER,
            onClick
        });
    }

    static createOutline(container, text, onClick) {
        return new ChoiceButton(container, {
            text,
            variant: ButtonVariant.OUTLINE,
            outlined: true,
            onClick
        });
    }

    static createIcon(container, icon, onClick, config = {}) {
        return new ChoiceButton(container, {
            icon,
            variant: ButtonVariant.GHOST,
            rounded: true,
            onClick,
            ...config
        });
    }
}

// ============ Styles ============
const buttonStyles = `
.choice-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-weight: 500;
    transition: all 0.2s ease;
    position: relative;
    user-select: none;
    white-space: nowrap;
}

/* Sizes */
.choice-button-size-small {
    padding: 6px 12px;
    font-size: 0.875rem;
    min-height: 32px;
}

.choice-button-size-medium {
    padding: 10px 20px;
    font-size: 1rem;
    min-height: 40px;
}

.choice-button-size-large {
    padding: 14px 28px;
    font-size: 1.125rem;
    min-height: 48px;
}

/* Variants */
.choice-button-variant-primary {
    background: #2196f3;
    color: white;
}

.choice-button-variant-primary:hover:not(:disabled) {
    background: #1976d2;
}

.choice-button-variant-secondary {
    background: #6c757d;
    color: white;
}

.choice-button-variant-secondary:hover:not(:disabled) {
    background: #5a6268;
}

.choice-button-variant-success {
    background: #28a745;
    color: white;
}

.choice-button-variant-success:hover:not(:disabled) {
    background: #218838;
}

.choice-button-variant-danger {
    background: #dc3545;
    color: white;
}

.choice-button-variant-danger:hover:not(:disabled) {
    background: #c82333;
}

.choice-button-variant-warning {
    background: #ffc107;
    color: #212529;
}

.choice-button-variant-info {
    background: #17a2b8;
    color: white;
}

/* Outline */
.choice-button-outlined {
    background: transparent;
    border: 2px solid currentColor;
}

.choice-button-variant-primary.choice-button-outlined {
    color: #2196f3;
    border-color: #2196f3;
}

.choice-button-variant-primary.choice-button-outlined:hover:not(:disabled) {
    background: #2196f3;
    color: white;
}

/* Ghost */
.choice-button-variant-ghost {
    background: transparent;
    color: inherit;
}

.choice-button-variant-ghost:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
}

/* States */
.choice-button-state-selected {
    transform: scale(0.98);
}

.choice-button-state-correct {
    background: #28a745 !important;
    color: white !important;
    animation: bounce 0.5s;
}

.choice-button-state-wrong {
    background: #dc3545 !important;
    color: white !important;
    animation: shake 0.3s;
}

.choice-button-state-disabled,
.choice-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
}

.choice-button-state-loading {
    cursor: wait;
    opacity: 0.8;
}

/* Full width */
.choice-button-full-width {
    width: 100%;
}

/* Rounded */
.choice-button-rounded {
    border-radius: 8px;
}

/* Icon */
.choice-button-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.choice-button-icon.position-left { order: -1; }
.choice-button-icon.position-right { order: 1; }
.choice-button-icon.position-top {
    flex-direction: column;
}

.icon-position-top {
    flex-direction: column;
}

.choice-button-icon-img {
    width: 20px;
    height: 20px;
    object-fit: contain;
}

.choice-button-icon-only {
    padding: 8px;
    border-radius: 50%;
}

/* Secondary text */
.choice-button-secondary-text {
    display: block;
    font-size: 0.75rem;
    opacity: 0.8;
    margin-top: 2px;
}

/* Spinner */
.choice-button-spinner {
    display: flex;
    gap: 4px;
    margin-right: 8px;
}

.spinner-dot {
    width: 6px;
    height: 6px;
    background: currentColor;
    border-radius: 50%;
    animation: dotPulse 1s infinite;
}

.spinner-dot:nth-child(2) { animation-delay: 0.2s; }
.spinner-dot:nth-child(3) { animation-delay: 0.4s; }

/* Animations */
@keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
}

@keyframes bounce {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
}

@keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
}

@keyframes glow {
    from { box-shadow: 0 0 5px rgba(33, 150, 243, 0.3); }
    to { box-shadow: 0 0 20px rgba(33, 150, 243, 0.6); }
}

@keyframes ripple {
    to { transform: scale(4); opacity: 0; }
}

@keyframes dotPulse {
    0%, 100% { opacity: 0.3; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.2); }
}

/* RTL Support */
[dir="rtl"] .choice-button-icon.position-left {
    margin-left: 8px;
    margin-right: 0;
}

[dir="rtl"] .choice-button-icon.position-right {
    margin-right: 8px;
    margin-left: 0;
}

[dir="rtl"] .choice-button-spinner {
    margin-right: 0;
    margin-left: 8px;
}

/* Mobile Optimizations */
@media (max-width: 768px) {
    .choice-button {
        min-height: 44px; /* minimum touch target size */
    }
    
    .choice-button-size-small {
        min-height: 40px;
    }
    
    .choice-button-size-large {
        min-height: 52px;
    }
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
    .choice-button-variant-ghost {
        color: #e0e0e0;
    }
    
    .choice-button-variant-ghost:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1);
    }
    
    .choice-button-outlined {
        background: transparent;
    }
}
`;

// اضافه کردن استایل‌ها
if (typeof document !== 'undefined') {
    const styleId = 'choice-button-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = buttonStyles;
        document.head.appendChild(style);
    }
}

// ============ Export ============
export {
    ChoiceButton,
    ChoiceButtonConfig,
    ChoiceButtonState,
    ChoiceButtonFactory,
    ButtonState,
    ButtonSize,
    ButtonVariant,
    ButtonAnimation
};
```
