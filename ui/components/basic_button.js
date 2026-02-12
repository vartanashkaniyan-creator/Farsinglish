/**
 * کامپوننت دکمه پایه
 * مسئول: نمایش دکمه با استایل‌ها و حالت‌های مختلف
 * بدون وابستگی خارجی – کاملاً مستقل و قابل استفاده مجدد
 */

// ---------- ثابت‌های ظاهری ----------
const VARIANTS = {
    PRIMARY: 'primary',
    SECONDARY: 'secondary',
    OUTLINE: 'outline',
    GHOST: 'ghost',
    ICON: 'icon'
};

const SIZES = {
    SMALL: 'small',
    MEDIUM: 'medium',
    LARGE: 'large'
};

const DEFAULT_VARIANT = VARIANTS.PRIMARY;
const DEFAULT_SIZE = SIZES.MEDIUM;

export class BasicButton {
    /**
     * @param {Object} options - تنظیمات دکمه
     * @param {string} [options.text] - متن دکمه
     * @param {string} [options.variant] - نوع دکمه (primary, secondary, outline, ghost, icon)
     * @param {string} [options.size] - اندازه (small, medium, large)
     * @param {boolean} [options.disabled] - غیرفعال بودن
     * @param {boolean} [options.loading] - حالت در حال بارگذاری
     * @param {string} [options.icon] - آیکون (کلاس Font Awesome یا متن)
     * @param {string} [options.ariaLabel] - برچسب دسترسی
     * @param {Function} [options.onClick] - تابع کلیک
     * @param {boolean} [options.fullWidth] - عرض کامل
     */
    constructor(options = {}) {
        this._options = this._mergeWithDefaults(options);
        this._element = null;
        this._clickHandler = null;
        this._currentText = this._options.text || '';
        this._isLoading = this._options.loading || false;
        this._isDisabled = this._options.disabled || false;
    }

    /** @private */
    _mergeWithDefaults(options) {
        return {
            text: options.text || '',
            variant: options.variant || DEFAULT_VARIANT,
            size: options.size || DEFAULT_SIZE,
            disabled: options.disabled || false,
            loading: options.loading || false,
            icon: options.icon || null,
            ariaLabel: options.ariaLabel || null,
            onClick: options.onClick || null,
            fullWidth: options.fullWidth || false
        };
    }

    /**
     * رندر دکمه
     * @param {Object} [overrideOptions] - تنظیمات موقت برای این رندر
     * @returns {HTMLElement} - المان button
     */
    render(overrideOptions = {}) {
        const config = { ...this._options, ...overrideOptions };
        this._isLoading = config.loading;
        this._isDisabled = config.disabled;
        this._currentText = config.text;

        const button = document.createElement('button');
        button.className = this._buildClassName(config);
        
        if (config.disabled || config.loading) {
            button.disabled = true;
        }

        if (config.ariaLabel) {
            button.setAttribute('aria-label', config.ariaLabel);
        }

        if (config.fullWidth) {
            button.style.width = '100%';
        }

        // محتوای داخلی
        button.innerHTML = this._buildInnerHTML(config);

        // رویداد کلیک
        if (config.onClick && typeof config.onClick === 'function') {
            const handler = (e) => {
                if (!button.disabled) {
                    config.onClick(e);
                }
            };
            button.addEventListener('click', handler);
            this._clickHandler = { element: button, handler };
        }

        this._element = button;
        return button;
    }

    /** @private */
    _buildClassName(config) {
        const classes = [
            'btn',
            `btn-${config.variant}`,
            `btn-${config.size}`
        ];
        if (config.loading) {
            classes.push('btn-loading');
        }
        if (config.icon && !config.text) {
            classes.push('btn-icon-only');
        }
        return classes.join(' ');
    }

    /** @private */
    _buildInnerHTML(config) {
        let html = '';

        // آیکون
        if (config.icon) {
            // پشتیبانی از Font Awesome یا ایموجی
            const iconEl = config.icon.startsWith('fa-') 
                ? `<i class="fas ${config.icon}"></i>` 
                : `<span class="btn-icon">${config.icon}</span>`;
            html += iconEl;
        }

        // متن
        if (config.text) {
            html += `<span class="btn-text">${config.text}</span>`;
        }

        // اسپینر بارگذاری
        if (config.loading) {
            const spinner = '<span class="btn-spinner"></span>';
            html = spinner + html; // اضافه کردن قبل
        }

        return html;
    }

    /**
     * به‌روزرسانی متن دکمه
     * @param {string} text - متن جدید
     */
    setText(text) {
        if (!this._element) return;
        this._currentText = text;
        const textSpan = this._element.querySelector('.btn-text');
        if (textSpan) {
            textSpan.textContent = text;
        } else if (text) {
            // اگر span وجود ندارد، اضافه کن
            const icon = this._element.querySelector('.btn-icon, i');
            if (icon) {
                icon.insertAdjacentHTML('afterend', `<span class="btn-text">${text}</span>`);
            } else {
                this._element.innerHTML = `<span class="btn-text">${text}</span>`;
            }
        }
    }

    /**
     * فعال/غیرفعال کردن دکمه
     * @param {boolean} disabled 
     */
    setDisabled(disabled) {
        if (!this._element) return;
        this._isDisabled = disabled;
        this._element.disabled = disabled;
    }

    /**
     * تنظیم حالت بارگذاری
     * @param {boolean} loading 
     */
    setLoading(loading) {
        if (!this._element) return;
        this._isLoading = loading;
        
        if (loading) {
            this._element.disabled = true;
            this._element.classList.add('btn-loading');
            // افزودن اسپینر اگر وجود ندارد
            if (!this._element.querySelector('.btn-spinner')) {
                const spinner = document.createElement('span');
                spinner.className = 'btn-spinner';
                this._element.prepend(spinner);
            }
        } else {
            this._element.disabled = this._isDisabled;
            this._element.classList.remove('btn-loading');
            const spinner = this._element.querySelector('.btn-spinner');
            if (spinner) spinner.remove();
        }
    }

    /**
     * دریافت وضعیت دکمه
     * @returns {Object}
     */
    getState() {
        return {
            text: this._currentText,
            disabled: this._isDisabled,
            loading: this._isLoading
        };
    }

    /**
     * پاکسازی رویدادها و حذف المان
     */
    destroy() {
        if (this._clickHandler) {
            const { element, handler } = this._clickHandler;
            element.removeEventListener('click', handler);
            this._clickHandler = null;
        }
        if (this._element) {
            this._element.remove();
            this._element = null;
        }
    }
}

// ---------- واحد تست ساده (برای مرورگر) ----------
if (typeof window !== 'undefined' && window.VITEST) {
    window.__BASIC_BUTTON__ = { BasicButton, VARIANTS, SIZES };
}
