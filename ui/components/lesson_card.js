/**
 * کامپوننت کارت نمایش درس
 * مسئول: نمایش اطلاعات خلاصه یک درس و وضعیت پیشرفت کاربر
 * بدون وابستگی مستقیم به سرویس‌ها – فقط دریافت داده و رویداد
 */

// ---------- ثابت‌های ظاهری ----------
const MASTERY_COLORS = {
    0: '#f44336', // قرمز - شروع نشده
    1: '#ff9800', // نارنجی - آشنایی اولیه
    2: '#ffc107', // زرد - در حال یادگیری
    3: '#8bc34a', // سبز روشن - تسلط متوسط
    4: '#4caf50', // سبز - تسلط خوب
    5: '#2e7d32'  // سبز تیره - تسلط کامل
};

const MASTERY_LABELS = {
    0: 'شروع نشده',
    1: 'آشنایی',
    2: 'در حال یادگیری',
    3: 'متوسط',
    4: 'خوب',
    5: 'عالی'
};

/**
 * @typedef {Object} Lesson
 * @property {string} id - شناسه درس
 * @property {string} title - عنوان درس
 * @property {string} description - توضیح کوتاه
 * @property {number} wordCount - تعداد واژگان
 */

/**
 * @typedef {Object} Progress
 * @property {number} masteryLevel - سطح تسلط (۰ تا ۵)
 * @property {boolean} isDue - نیاز به مرور امروز
 * @property {number} interval - فاصله مرور (روز)
 */

export class LessonCard {
    /**
     * @param {Object} deps - وابستگی‌ها
     * @param {Object} deps.router - مسیریاب (اختیاری – برای ناوبری خودکار)
     */
    constructor(deps = {}) {
        this._router = deps.router || null;
        this._element = null;
        this._lesson = null;
        this._progress = null;
        this._onClick = null;
    }

    /**
     * ایجاد و رندر کارت درس
     * @param {Lesson} lesson - اطلاعات درس
     * @param {Progress} [progress] - پیشرفت کاربر (اختیاری)
     * @param {Object} [options] - گزینه‌ها
     * @param {Function} [options.onClick] - callback هنگام کلیک (جایگزین router)
     * @returns {HTMLElement} - المان کارت
     */
    render(lesson, progress = null, options = {}) {
        if (!lesson || !lesson.id) {
            throw new Error('Lesson with id is required');
        }

        this._lesson = lesson;
        this._progress = progress;
        this._onClick = options.onClick || null;

        // ایجاد کارت
        const card = document.createElement('div');
        card.className = 'lesson-card';
        card.dataset.lessonId = lesson.id;
        card.dataset.mastery = progress?.masteryLevel ?? 0;

        // محتوای کارت
        card.innerHTML = this._buildHTML(lesson, progress);

        // ثبت رویداد کلیک
        this._attachEvents(card);

        this._element = card;
        return card;
    }

    /**
     * به‌روزرسانی کارت با پیشرفت جدید
     * @param {Progress} progress - پیشرفت به‌روز شده
     */
    updateProgress(progress) {
        if (!this._element) {
            console.warn('[LessonCard] Cannot update progress: card not rendered');
            return;
        }
        this._progress = progress;
        
        // به‌روزرسانی ظاهر کارت
        const masteryEl = this._element.querySelector('.mastery-badge');
        const dueIndicator = this._element.querySelector('.due-indicator');
        const progressBar = this._element.querySelector('.progress-bar-fill');

        if (masteryEl) {
            const level = progress?.masteryLevel ?? 0;
            masteryEl.textContent = MASTERY_LABELS[level] || 'نامشخص';
            masteryEl.style.backgroundColor = MASTERY_COLORS[level] || '#9e9e9e';
        }

        if (dueIndicator) {
            if (progress?.isDue) {
                dueIndicator.classList.add('visible');
            } else {
                dueIndicator.classList.remove('visible');
            }
        }

        if (progressBar) {
            const percent = (progress?.masteryLevel ?? 0) * 20; // 0->0% , 5->100%
            progressBar.style.width = `${percent}%`;
        }

        this._element.dataset.mastery = progress?.masteryLevel ?? 0;
    }

    /** @private */
    _buildHTML(lesson, progress) {
        const level = progress?.masteryLevel ?? 0;
        const isDue = progress?.isDue || false;
        const percent = level * 20; // 0-100
        const masteryLabel = MASTERY_LABELS[level] || 'شروع نشده';
        const masteryColor = MASTERY_COLORS[level] || '#9e9e9e';

        return `
            <div class="lesson-card-header">
                <h3 class="lesson-title">${lesson.title || 'بدون عنوان'}</h3>
                ${isDue ? '<span class="due-indicator visible" title="نیاز به مرور">🔔</span>' : ''}
            </div>
            <p class="lesson-description">${lesson.description || ''}</p>
            
            <div class="lesson-meta">
                <span class="word-count">📘 ${lesson.wordCount || 0} واژه</span>
                <span class="mastery-badge" style="background-color: ${masteryColor}">
                    ${masteryLabel}
                </span>
            </div>

            <div class="progress-container">
                <div class="progress-bar">
                    <div class="progress-bar-fill" style="width: ${percent}%;"></div>
                </div>
                <span class="progress-text">${percent}%</span>
            </div>
        `;
    }

    /** @private */
    _attachEvents(card) {
        const handleClick = (e) => {
            // جلوگیری از رویداد روی دکمه‌های داخلی (اگر بعداً اضافه شد)
            if (e.target.closest('.btn, button, a')) return;

            if (this._onClick) {
                this._onClick(this._lesson, this._progress);
            } else if (this._router) {
                this._router.navigate(`/lesson/${this._lesson.id}`);
            }
        };

        card.addEventListener('click', handleClick);
        // ذخیره برای پاکسازی
        this._clickHandler = { element: card, handler: handleClick };
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
            this._element.remove(); // حذف از DOM
            this._element = null;
        }
        this._lesson = null;
        this._progress = null;
        this._onClick = null;
    }
}

// ---------- واحد تست ساده (برای مرورگر) ----------
if (typeof window !== 'undefined' && window.VITEST) {
    window.__LESSON_CARD__ = { LessonCard, MASTERY_COLORS, MASTERY_LABELS };
}
