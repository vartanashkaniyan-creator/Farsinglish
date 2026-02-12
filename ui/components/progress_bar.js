/**
 * کامپوننت نوار پیشرفت
 * مسئول: نمایش درصد پیشرفت به صورت نوار افقی
 * بدون وابستگی خارجی – کاملاً مستقل و قابل استفاده مجدد
 */

// ---------- ثابت‌های ظاهری ----------
const DEFAULT_HEIGHT = '8px';
const DEFAULT_BACKGROUND = '#e0e0e0';
const DEFAULT_FILL_COLOR = '#4caf50';
const DEFAULT_ANIMATION_DURATION = '0.3s';
const MIN_PERCENT = 0;
const MAX_PERCENT = 100;

export class ProgressBar {
    /**
     * @param {Object} options - تنظیمات اولیه
     * @param {string} [options.height] - ارتفاع نوار (مثل '8px')
     * @param {string} [options.backgroundColor] - رنگ پس‌زمینه
     * @param {string} [options.fillColor] - رنگ نوار پیشرفت
     * @param {boolean} [options.animated] - آیا انیمیشن داشته باشد؟
     * @param {boolean} [options.showLabel] - نمایش درصد به صورت متن؟
     */
    constructor(options = {}) {
        this._options = {
            height: options.height || DEFAULT_HEIGHT,
            backgroundColor: options.backgroundColor || DEFAULT_BACKGROUND,
            fillColor: options.fillColor || DEFAULT_FILL_COLOR,
            animated: options.animated ?? true,
            showLabel: options.showLabel ?? false
        };

        this._element = null;
        this._fillElement = null;
        this._labelElement = null;
        this._currentPercent = 0;
    }

    /**
     * رندر نوار پیشرفت
     * @param {number} percent - درصد پیشرفت (۰ تا ۱۰۰)
     * @param {Object} [options] - تنظیمات موقت (جایگزین تنظیمات سازنده)
     * @returns {HTMLElement} - المان نوار پیشرفت
     */
    render(percent = 0, options = {}) {
        this._validatePercent(percent);
        this._currentPercent = percent;

        // ادغام تنظیمات
        const config = { ...this._options, ...options };

        // ایجاد المان اصلی
        const container = document.createElement('div');
        container.className = 'progress-bar-container';
        container.style.height = config.height;
        container.style.backgroundColor = config.backgroundColor;
        container.style.borderRadius = '4px';
        container.style.overflow = 'hidden';
        container.style.position = 'relative';

        // ایجاد نوار پرکننده
        const fill = document.createElement('div');
        fill.className = 'progress-bar-fill';
        fill.style.width = `${percent}%`;
        fill.style.height = '100%';
        fill.style.backgroundColor = config.fillColor;
        fill.style.borderRadius = '4px';
        fill.style.transition = config.animated 
            ? `width ${DEFAULT_ANIMATION_DURATION} ease` 
            : 'none';
        
        // ایجاد برچسب درصد (در صورت نیاز)
        let label = null;
        if (config.showLabel) {
            label = document.createElement('span');
            label.className = 'progress-bar-label';
            label.textContent = `${Math.round(percent)}%`;
            label.style.position = 'absolute';
            label.style.right = '8px';
            label.style.top = '50%';
            label.style.transform = 'translateY(-50%)';
            label.style.color = '#000';
            label.style.fontSize = '12px';
            label.style.fontWeight = 'bold';
            label.style.textShadow = '0 1px 2px rgba(255,255,255,0.5)';
            container.style.position = 'relative';
        }

        // اضافه کردن به DOM
        container.appendChild(fill);
        if (label) {
            container.appendChild(label);
            this._labelElement = label;
        }

        this._element = container;
        this._fillElement = fill;

        return container;
    }

    /**
     * به‌روزرسانی درصد پیشرفت
     * @param {number} percent - درصد جدید (۰ تا ۱۰۰)
     * @param {Object} [options] - تنظیمات موقت برای این به‌روزرسانی
     */
    update(percent, options = {}) {
        if (!this._fillElement) {
            console.warn('[ProgressBar] Cannot update: not rendered yet');
            return;
        }

        this._validatePercent(percent);
        this._currentPercent = percent;

        const config = { ...this._options, ...options };
        const width = `${percent}%`;

        // به‌روزرسانی عرض
        this._fillElement.style.width = width;
        this._fillElement.style.transition = config.animated 
            ? `width ${DEFAULT_ANIMATION_DURATION} ease` 
            : 'none';

        // به‌روزرسانی برچسب
        if (this._labelElement) {
            this._labelElement.textContent = `${Math.round(percent)}%`;
        }
    }

    /**
     * دریافت درصد فعلی
     * @returns {number}
     */
    getPercent() {
        return this._currentPercent;
    }

    /**
     * پاکسازی و حذف المان
     */
    destroy() {
        if (this._element) {
            this._element.remove();
            this._element = null;
            this._fillElement = null;
            this._labelElement = null;
        }
    }

    /** @private */
    _validatePercent(percent) {
        if (typeof percent !== 'number' || isNaN(percent)) {
            throw new Error('Percent must be a number');
        }
        if (percent < MIN_PERCENT || percent > MAX_PERCENT) {
            throw new Error(`Percent must be between ${MIN_PERCENT} and ${MAX_PERCENT}`);
        }
    }
}

// ---------- واحد تست ساده (برای مرورگر) ----------
if (typeof window !== 'undefined' && window.VITEST) {
    window.__PROGRESS_BAR__ = { ProgressBar };
}
