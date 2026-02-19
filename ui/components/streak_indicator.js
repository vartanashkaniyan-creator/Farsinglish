/**
 * @fileoverview کامپوننت نمایش استریک (رکورد پشت سر هم) روزانه کاربر - نسخه Enterprise
 * @module ui/components/streak_indicator
 * @author Farsinglish Development Team
 * @version 2.0.0
 */

// ================================
// ابرداده کامپوننت
// ================================

/**
 * @template T
 * @typedef {Object} Observer
 * @property {function(T): void} next
 * @property {function(Error): void} [error]
 * @property {function(): void} [complete]
 */

/**
 * @typedef {Object} StreakIndicatorConfig
 * @property {number} currentStreak - تعداد روزهای پشت سر هم فعلی
 * @property {number} longestStreak - بیشترین استریک ثبت شده
 * @property {boolean} isActiveToday - آیا امروز فعالیت داشته
 * @property {Date} lastActiveDate - تاریخ آخرین فعالیت
 * @property {string} [theme='light'] - تم نمایش (light/dark)
 * @property {string} [locale='fa'] - زبان نمایش
 * @property {Function} [onShareClick] - رویداد کلیک اشتراک‌گذاری
 * @property {Function} [onReminderClick] - رویداد کلیک یادآور
 */

/**
 * @typedef {Object} StreakMilestone
 * @property {number} day - روز نقطه عطف
 * @property {string} icon - آیکون نمایش
 * @property {string} title - عنوان
 * @property {string} description - توضیحات
 */

// ================================
// ثابت‌های پیش‌فرض (قابل جایگزینی با DI)
// ================================

/** @type {Readonly<StreakMilestone[]>} */
const DEFAULT_MILESTONES = Object.freeze([
  { day: 7, icon: '🔥', title: 'یک هفته', description: '۷ روز پشت سر هم' },
  { day: 30, icon: '⭐', title: 'یک ماه', description: '۳۰ روز پشت سر هم' },
  { day: 100, icon: '🏆', title: '۱۰۰ روز', description: 'سه ماه و نیم' },
  { day: 365, icon: '👑', title: 'یک سال', description: 'یک سال تمام' }
]);

/** @type {Readonly<Record<string, Record<string, string>>>} */
const DEFAULT_MESSAGES = Object.freeze({
  fa: {
    current: 'روز پشت سر هم',
    longest: 'بیشترین رکورد',
    active: 'امروز فعال بوده‌اید',
    inactive: 'امروز هنوز فعالیت نکرده‌اید',
    share: 'اشتراک‌گذاری رکورد',
    reminder: 'یادآور روزانه',
    nextMilestone: 'تا نقطه عطف بعدی',
    daysLeft: 'روز باقیمانده',
    error: 'خطا در نمایش استریک'
  },
  en: {
    current: 'Day streak',
    longest: 'Longest streak',
    active: 'Active today',
    inactive: 'Not active today',
    share: 'Share streak',
    reminder: 'Daily reminder',
    nextMilestone: 'Until next milestone',
    daysLeft: 'days left',
    error: 'Error displaying streak'
  }
});

/** @type {Readonly<Record<string, string>>} */
const CSS_CLASSES = Object.freeze({
  container: 'streak-indicator',
  header: 'streak-header',
  content: 'streak-content',
  counter: 'streak-counter',
  flame: 'streak-flame',
  active: 'streak-active',
  inactive: 'streak-inactive',
  milestone: 'streak-milestone',
  progress: 'streak-progress',
  footer: 'streak-footer',
  button: 'streak-button',
  tooltip: 'streak-tooltip',
  error: 'streak-error'
});

// ================================
// کلاس اصلی کامپوننت
// ================================

/**
 * کلاس نمایش استریک روزانه با قابلیت‌های پیشرفته
 * @class
 */
export class StreakIndicator {
  /** @type {StreakIndicatorConfig} */
  #config;

  /** @type {Readonly<StreakMilestone[]>} */
  #milestones;

  /** @type {Readonly<Record<string, string>>} */
  #messages;

  /** @type {HTMLElement} */
  #element;

  /** @type {Object} */
  #elements = {};

  /** @type {boolean} */
  #isMounted = false;

  /** @type {number|null} */
  #animationFrame = null;

  /** @type {boolean} */
  #animationsEnabled = true;

  /** @type {Map<string, Set<Function>>} */
  #observers = new Map();

  /** @type {Array<Object>} */
  #commandHistory = [];

  /** @type {PerformanceObserver|null} */
  #perfObserver = null;

  /** @type {boolean} */
  #renderScheduled = false;

  /** @type {ProxyHandler} */
  #stateProxy;

  /** @type {Set<Function>} */
  #cleanupFunctions = new Set();

  /** @type {boolean} */
  #isDisposed = false;

  /** @type {Map<string, any>} */
  #cache = new Map();

  /** @type {AbortController} */
  #abortController = new AbortController();

  /** @type {IntersectionObserver|null} */
  #intersectionObserver = null;

  /**
   * @private
   * @type {Map<string, StreakIndicator>}
   */
  static #instances = new Map();

  /**
   * ایجاد یک نمونه جدید از نمایش‌دهنده استریک
   * @param {StreakIndicatorConfig} config - پیکربندی کامپوننت
   * @param {Readonly<StreakMilestone[]>} [milestones=DEFAULT_MILESTONES] - نقاط عطف
   * @param {Readonly<Record<string, Record<string, string>>>} [messages=DEFAULT_MESSAGES] - پیام‌ها
   * @throws {Error} در صورت نامعتبر بودن پیکربندی
   */
  constructor(config, milestones = DEFAULT_MILESTONES, messages = DEFAULT_MESSAGES) {
    // اعتبارسنجی با Error Boundary
    this.#withErrorBoundary(() => {
      this.#validateConfig(config);
      
      // تزریق وابستگی‌ها (DI)
      this.#milestones = Object.freeze([...milestones]);
      this.#messages = Object.freeze({ ...messages[config.locale || 'fa'] });
      
      // ایجاد Proxy برای state (تغییرناپذیری هوشمند)
      this.#setupStateProxy(config);
      
      // ایجاد المان‌ها
      this.#createElements();
      
      // اتصال رویدادها
      this.#attachEvents();
      
      // راه‌اندازی Performance Monitoring
      this.#setupPerformanceMonitoring();
      
      // تنظیم Intersection Observer برای انیمیشن
      this.#setupIntersectionObserver();
      
      // لاگ موفقیت
      this.#perfMark('StreakIndicator:init');
    }, () => {
      throw new Error('خطا در راه‌اندازی StreakIndicator');
    });
  }

  // ================================
  // متدهای خصوصی - هسته اصلی
  // ================================

  /**
   * راه‌اندازی Proxy برای مدیریت state
   * @private
   */
  #setupStateProxy(config) {
    const initialState = this.#normalizeConfig(config);
    
    this.#config = new Proxy(initialState, {
      set: (target, prop, value) => {
        const oldValue = target[prop];
        target[prop] = value;
        
        // انتشار تغییرات به observers
        this.#emit('config:changed', { prop, value, oldValue });
        
        // برنامه‌ریزی رندر مجدد
        this.#scheduleRender();
        
        return true;
      },
      
      get: (target, prop) => {
        // لاگ دسترسی در حالت debug
        if (this.#isDebugMode()) {
          console.debug(`🔍 StreakIndicator: accessing ${String(prop)}`);
        }
        return target[prop];
      }
    });
  }

  /**
   * برنامه‌ریزی رندر مجدد (Debounced)
   * @private
   */
  #scheduleRender() {
    if (this.#renderScheduled || this.#isDisposed) return;
    
    this.#renderScheduled = true;
    
    queueMicrotask(() => {
      if (this.#isDisposed) return;
      this.#render();
      this.#renderScheduled = false;
    });
  }

  /**
   * اعتبارسنجی پیکربندی ورودی
   * @param {StreakIndicatorConfig} config
   * @throws {Error}
   * @private
   */
  #validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('پیکربندی معتبر نیست');
    }

    if (typeof config.currentStreak !== 'number' || config.currentStreak < 0) {
      throw new Error('currentStreak باید عدد مثبت باشد');
    }

    if (typeof config.longestStreak !== 'number' || config.longestStreak < 0) {
      throw new Error('longestStreak باید عدد مثبت باشد');
    }

    if (config.lastActiveDate && !(config.lastActiveDate instanceof Date)) {
      throw new Error('lastActiveDate باید شیء Date باشد');
    }
  }

  /**
   * نرمال‌سازی و تکمیل پیکربندی
   * @param {StreakIndicatorConfig} config
   * @returns {StreakIndicatorConfig}
   * @private
   */
  #normalizeConfig(config) {
    return {
      ...config,
      theme: config.theme || 'light',
      locale: config.locale || 'fa',
      lastActiveDate: config.lastActiveDate || new Date()
    };
  }

  /**
   * ایجاد المان‌های DOM (بدون innerHTML - امن)
   * @private
   */
  #createElements() {
    this.#element = document.createElement('div');
    this.#element.className = `${CSS_CLASSES.container} theme-${this.#config.theme}`;
    this.#element.setAttribute('role', 'region');
    this.#element.setAttribute('aria-label', 'نشان‌دهنده استریک روزانه');
    this.#element.setAttribute('data-testid', 'streak-indicator');
    
    // رندر اولیه
    this.#render();
  }

  /**
   * رندر کردن محتوای کامپوننت (امن - بدون innerHTML مستقیم)
   * @private
   */
  #render() {
    this.#withErrorBoundary(() => {
      this.#perfMeasure('render', () => {
        // پاک کردن محتوای قبلی
        while (this.#element.firstChild) {
          this.#element.removeChild(this.#element.firstChild);
        }
        
        // ساخت المان‌ها با createElement (امن در برابر XSS)
        this.#element.appendChild(this.#createHeader());
        this.#element.appendChild(this.#createContent());
        this.#element.appendChild(this.#createFooter());
        
        // کش کردن المان‌ها برای دسترسی سریع
        this.#cacheElements();
      });
    }, () => {
      this.#renderErrorState();
    });
  }

  /**
   * ایجاد بخش هدر
   * @returns {HTMLElement}
   * @private
   */
  #createHeader() {
    const header = document.createElement('div');
    header.className = CSS_CLASSES.header;
    
    const flame = document.createElement('span');
    flame.className = `${CSS_CLASSES.flame} ${this.#config.isActiveToday ? CSS_CLASSES.active : CSS_CLASSES.inactive}`;
    flame.textContent = this.#config.isActiveToday ? '🔥' : '⏳';
    flame.setAttribute('aria-hidden', 'true');
    
    const counter = document.createElement('h3');
    counter.className = CSS_CLASSES.counter;
    
    const counterText = document.createTextNode(`${this.#config.currentStreak} `);
    const small = document.createElement('small');
    small.textContent = this.#messages.current;
    
    counter.appendChild(counterText);
    counter.appendChild(small);
    
    header.appendChild(flame);
    header.appendChild(counter);
    
    return header;
  }

  /**
   * ایجاد بخش محتوا
   * @returns {HTMLElement}
   * @private
   */
  #createContent() {
    const content = document.createElement('div');
    content.className = CSS_CLASSES.content;
    
    // آمار
    content.appendChild(this.#createStats());
    
    // پیشرفت
    const nextMilestone = this.#findNextMilestone();
    if (nextMilestone) {
      content.appendChild(this.#createProgress(nextMilestone));
    }
    
    // نقاط عطف
    content.appendChild(this.#createMilestones(nextMilestone));
    
    return content;
  }

  /**
   * ایجاد بخش آمار
   * @returns {HTMLElement}
   * @private
   */
  #createStats() {
    const statsContainer = document.createElement('div');
    statsContainer.className = 'streak-stats';
    
    // بیشترین رکورد
    const longestItem = document.createElement('div');
    longestItem.className = 'streak-stat-item';
    
    const longestLabel = document.createElement('span');
    longestLabel.className = 'stat-label';
    longestLabel.textContent = this.#messages.longest;
    
    const longestValue = document.createElement('span');
    longestValue.className = 'stat-value';
    longestValue.textContent = this.#config.longestStreak.toString();
    
    longestItem.appendChild(longestLabel);
    longestItem.appendChild(longestValue);
    
    // وضعیت امروز
    const todayItem = document.createElement('div');
    todayItem.className = 'streak-stat-item';
    
    const todayLabel = document.createElement('span');
    todayLabel.className = 'stat-label';
    todayLabel.textContent = this.#config.isActiveToday ? this.#messages.active : this.#messages.inactive;
    
    const todayValue = document.createElement('span');
    todayValue.className = 'stat-value';
    todayValue.textContent = this.#formatDate(this.#config.lastActiveDate);
    
    todayItem.appendChild(todayLabel);
    todayItem.appendChild(todayValue);
    
    statsContainer.appendChild(longestItem);
    statsContainer.appendChild(todayItem);
    
    return statsContainer;
  }

  /**
   * ایجاد بخش پیشرفت
   * @param {StreakMilestone} milestone
   * @returns {HTMLElement}
   * @private
   */
  #createProgress(milestone) {
    const progress = (this.#config.currentStreak / milestone.day) * 100;
    const daysLeft = milestone.day - this.#config.currentStreak;
    
    const progressContainer = document.createElement('div');
    progressContainer.className = CSS_CLASSES.progress;
    
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = `${Math.min(progress, 100)}%`;
    fill.setAttribute('role', 'progressbar');
    fill.setAttribute('aria-valuenow', Math.min(progress, 100).toString());
    fill.setAttribute('aria-valuemin', '0');
    fill.setAttribute('aria-valuemax', '100');
    
    bar.appendChild(fill);
    
    const text = document.createElement('div');
    text.className = 'progress-text';
    
    const label = document.createElement('span');
    label.textContent = this.#messages.nextMilestone;
    
    const value = document.createElement('strong');
    value.textContent = `${daysLeft} ${this.#messages.daysLeft}`;
    
    text.appendChild(label);
    text.appendChild(value);
    
    progressContainer.appendChild(bar);
    progressContainer.appendChild(text);
    
    return progressContainer;
  }

  /**
   * ایجاد بخش نقاط عطف
   * @param {StreakMilestone|null} nextMilestone
   * @returns {HTMLElement}
   * @private
   */
  #createMilestones(nextMilestone) {
    const container = document.createElement('div');
    container.className = CSS_CLASSES.milestone;
    
    this.#milestones.forEach(milestone => {
      const isReached = this.#config.currentStreak >= milestone.day;
      const isNext = nextMilestone?.day === milestone.day;
      
      const item = document.createElement('div');
      item.className = `milestone-item ${isReached ? 'reached' : ''} ${isNext ? 'next' : ''}`;
      item.dataset.milestone = milestone.day.toString();
      item.setAttribute('aria-label', `${milestone.title}: ${milestone.description}`);
      
      const icon = document.createElement('span');
      icon.className = 'milestone-icon';
      icon.textContent = milestone.icon;
      
      const day = document.createElement('span');
      day.className = 'milestone-day';
      day.textContent = milestone.day.toString();
      
      const tooltip = document.createElement('div');
      tooltip.className = CSS_CLASSES.tooltip;
      tooltip.setAttribute('role', 'tooltip');
      
      const tooltipTitle = document.createElement('strong');
      tooltipTitle.textContent = milestone.title;
      
      const tooltipDesc = document.createElement('small');
      tooltipDesc.textContent = milestone.description;
      
      tooltip.appendChild(tooltipTitle);
      tooltip.appendChild(tooltipDesc);
      
      item.appendChild(icon);
      item.appendChild(day);
      item.appendChild(tooltip);
      
      container.appendChild(item);
    });
    
    return container;
  }

  /**
   * ایجاد بخش فوتر
   * @returns {HTMLElement}
   * @private
   */
  #createFooter() {
    const footer = document.createElement('div');
    footer.className = CSS_CLASSES.footer;
    
    // دکمه اشتراک‌گذاری
    const shareBtn = document.createElement('button');
    shareBtn.className = `${CSS_CLASSES.button} share-button`;
    shareBtn.setAttribute('aria-label', this.#messages.share);
    shareBtn.innerHTML = '📤 <span>' + this.#messages.share + '</span>';
    
    // استفاده از textContent برای جلوگیری از XSS
    const shareSpan = shareBtn.querySelector('span');
    if (shareSpan) shareSpan.textContent = this.#messages.share;
    
    shareBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.#dispatchCustomEvent('streak:share');
    }, { signal: this.#abortController.signal });
    
    // دکمه یادآور
    const reminderBtn = document.createElement('button');
    reminderBtn.className = `${CSS_CLASSES.button} reminder-button`;
    reminderBtn.setAttribute('aria-label', this.#messages.reminder);
    reminderBtn.innerHTML = '🔔 <span>' + this.#messages.reminder + '</span>';
    
    const reminderSpan = reminderBtn.querySelector('span');
    if (reminderSpan) reminderSpan.textContent = this.#messages.reminder;
    
    reminderBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.#dispatchCustomEvent('streak:reminder');
    }, { signal: this.#abortController.signal });
    
    footer.appendChild(shareBtn);
    footer.appendChild(reminderBtn);
    
    return footer;
  }

  /**
   * رندر حالت خطا
   * @private
   */
  #renderErrorState() {
    while (this.#element.firstChild) {
      this.#element.removeChild(this.#element.firstChild);
    }
    
    const errorDiv = document.createElement('div');
    errorDiv.className = CSS_CLASSES.error;
    errorDiv.setAttribute('role', 'alert');
    errorDiv.textContent = this.#messages.error || 'خطا در نمایش';
    
    this.#element.appendChild(errorDiv);
  }

  /**
   * کش کردن المان‌ها برای دسترسی سریع
   * @private
   */
  #cacheElements() {
    this.#elements = {
      flame: this.#element.querySelector(`.${CSS_CLASSES.flame}`),
      counter: this.#element.querySelector(`.${CSS_CLASSES.counter}`),
      progressFill: this.#element.querySelector('.progress-fill')
    };
  }

  /**
   * پیدا کردن نقطه عطف بعدی
   * @returns {StreakMilestone|null}
   * @private
   */
  #findNextMilestone() {
    return this.#milestones.find(m => m.day > this.#config.currentStreak) || null;
  }

  /**
   * فرمت تاریخ به صورت محلی
   * @param {Date} date
   * @returns {string}
   * @private
   */
  #formatDate(date) {
    try {
      return new Intl.DateTimeFormat(this.#config.locale === 'fa' ? 'fa-IR' : 'en-US', {
        month: 'short',
        day: 'numeric'
      }).format(date);
    } catch {
      return date.toLocaleDateString();
    }
  }

  /**
   * اتصال رویدادهای کامپوننت
   * @private
   */
  #attachEvents() {
    const cleanup1 = this.#addEventListener('streak:share', () => this.#handleShare());
    const cleanup2 = this.#addEventListener('streak:reminder', () => this.#handleReminder());
    
    this.#cleanupFunctions.add(cleanup1);
    this.#cleanupFunctions.add(cleanup2);
  }

  /**
   * افزودن شنونده رویداد با قابلیت پاکسازی
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} تابع پاکسازی
   * @private
   */
  #addEventListener(event, handler) {
    const wrappedHandler = (e) => handler(e);
    this.#element.addEventListener(event, wrappedHandler);
    
    return () => this.#element.removeEventListener(event, wrappedHandler);
  }

  /**
   * ارسال رویداد سفارشی
   * @param {string} eventName
   * @param {any} [detail]
   * @private
   */
  #dispatchCustomEvent(eventName, detail = null) {
    const event = new CustomEvent(eventName, {
      bubbles: true,
      composed: true,
      detail
    });
    this.#element.dispatchEvent(event);
  }

  /**
   * مدیریت رویداد اشتراک‌گذاری
   * @private
   */
  #handleShare() {
    this.#withErrorBoundary(() => {
      if (this.#config.onShareClick) {
        this.#config.onShareClick({
          streak: this.#config.currentStreak,
          longest: this.#config.longestStreak
        });
      }
      this.#emit('share:clicked', this.#config);
    });
  }

  /**
   * مدیریت رویداد یادآور
   * @private
   */
  #handleReminder() {
    this.#withErrorBoundary(() => {
      if (this.#config.onReminderClick) {
        this.#config.onReminderClick();
      }
      this.#emit('reminder:clicked');
    });
  }

  /**
   * به‌روزرسانی انیمیشن (قابل تست)
   * @private
   */
  #animate() {
    if (!this.#isMounted || !this.#animationsEnabled || this.#isDisposed) return;
    
    this.#updateFlameAnimation();
    
    this.#animationFrame = requestAnimationFrame(() => this.#animate());
  }

  /**
   * به‌روزرسانی انیمیشن شعله
   * @private
   */
  #updateFlameAnimation() {
    const flame = this.#elements.flame;
    if (!flame || !this.#config.isActiveToday) return;
    
    const scale = 1 + Math.sin(Date.now() / 500) * 0.1;
    flame.style.transform = `scale(${scale})`;
    flame.style.transition = 'transform 0.1s ease';
  }

  /**
   * راه‌اندازی نظارت بر عملکرد
   * @private
   */
  #setupPerformanceMonitoring() {
    if (typeof performance === 'undefined' || !performance.mark) return;
    
    try {
      this.#perfObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure') {
            const duration = entry.duration.toFixed(2);
            if (duration > 16) { // بیشتر از یک فریم (60fps)
              console.warn(`⚠️ عملکرد ضعیف: ${entry.name} took ${duration}ms`);
            }
          }
        }
      });
      
      this.#perfObserver.observe({ entryTypes: ['measure'] });
    } catch {
      // PerformanceObserver پشتیبانی نمی‌شود
    }
  }

  /**
   * ثبت مارک عملکرد
   * @param {string} name
   * @private
   */
  #perfMark(name) {
    if (typeof performance?.mark === 'function') {
      performance.mark(name);
    }
  }

  /**
   * اندازه‌گیری عملکرد
   * @param {string} name
   * @param {Function} fn
   * @returns {any}
   * @private
   */
  #perfMeasure(name, fn) {
    this.#perfMark(`${name}:start`);
    const result = fn();
    this.#perfMark(`${name}:end`);
    
    if (typeof performance?.measure === 'function') {
      try {
        performance.measure(name, `${name}:start`, `${name}:end`);
      } catch {
        // نادیده گرفتن خطای اندازه‌گیری
      }
    }
    
    return result;
  }

  /**
   * بررسی حالت debug
   * @returns {boolean}
   * @private
   */
  #isDebugMode() {
    return typeof process !== 'undefined' 
      ? process.env?.NODE_ENV === 'development'
      : import.meta?.env?.DEV === true;
  }

  /**
   * اجرای تابع با Error Boundary
   * @param {Function} fn
   * @param {Function} [fallback]
   * @returns {any}
   * @private
   */
  #withErrorBoundary(fn, fallback) {
    try {
      return fn();
    } catch (error) {
      console.error('[StreakIndicator Error]', error);
      
      if (this.#isDebugMode()) {
        console.error('🔍 Stack:', error.stack);
      }
      
      if (fallback) {
        return fallback(error);
      }
      
      return null;
    }
  }

  /**
   * انتشار رویداد به observers
   * @param {string} event
   * @param {any} data
   * @private
   */
  #emit(event, data) {
    const observers = this.#observers.get(event);
    if (observers) {
      observers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[StreakIndicator] Error in observer for ${event}:`, error);
        }
      });
    }
  }

  /**
   * تنظیم Intersection Observer برای بهینه‌سازی انیمیشن
   * @private
   */
  #setupIntersectionObserver() {
    if (typeof IntersectionObserver === 'undefined') return;
    
    this.#intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.enableAnimation();
          } else {
            this.disableAnimation();
          }
        });
      },
      { threshold: 0.1 }
    );
  }

  // ================================
  // متدهای عمومی - API رسمی
  // ================================

  /**
   * نصب کامپوننت در DOM
   * @param {HTMLElement} container
   * @returns {this}
   */
  mount(container) {
    return this.#withErrorBoundary(() => {
      if (!container || !(container instanceof HTMLElement)) {
        throw new Error('کانتینر نامعتبر است');
      }

      container.appendChild(this.#element);
      this.#isMounted = true;
      
      // شروع انیمیشن
      this.enableAnimation();
      
      // شروع مشاهده‌گر
      if (this.#intersectionObserver) {
        this.#intersectionObserver.observe(this.#element);
      }
      
      this.#emit('mounted', container);
      
      return this;
    }, () => this);
  }

  /**
   * جدا کردن کامپوننت از DOM
   * @returns {this}
   */
  unmount() {
    return this.#withErrorBoundary(() => {
      if (this.#element.parentNode) {
        this.#element.parentNode.removeChild(this.#element);
      }
      
      this.#isMounted = false;
      this.disableAnimation();
      
      if (this.#intersectionObserver) {
        this.#intersectionObserver.unobserve(this.#element);
      }
      
      this.#emit('unmounted');
      
      return this;
    }, () => this);
  }

  /**
   * فعال کردن انیمیشن
   */
  enableAnimation() {
    if (!this.#animationsEnabled && this.#isMounted && !this.#isDisposed) {
      this.#animationsEnabled = true;
      this.#animate();
    }
  }

  /**
   * غیرفعال کردن انیمیشن (برای تست)
   */
  disableAnimation() {
    this.#animationsEnabled = false;
    if (this.#animationFrame) {
      cancelAnimationFrame(this.#animationFrame);
      this.#animationFrame = null;
    }
  }

  /**
   * به‌روزرسانی پیکربندی
   * @param {Partial<StreakIndicatorConfig>} updates
   * @returns {this}
   */
  update(updates) {
    return this.#withErrorBoundary(() => {
      const newConfig = { ...this.#config, ...updates };
      this.#validateConfig(newConfig);
      
      // به‌روزرسانی از طریق Proxy
      Object.assign(this.#config, this.#normalizeConfig(newConfig));
      
      this.#emit('updated', updates);
      
      return this;
    }, () => this);
  }

  /**
   * دریافت وضعیت فعلی
   * @returns {Readonly<StreakIndicatorConfig>}
   */
  getState() {
    return Object.freeze({ ...this.#config });
  }

  /**
   * اشتراک‌گذاری در رویدادها
   * @param {string} event
   * @param {Function} callback
   * @returns {Function} تابع لغو اشتراک
   */
  subscribe(event, callback) {
    if (!this.#observers.has(event)) {
      this.#observers.set(event, new Set());
    }
    
    this.#observers.get(event).add(callback);
    
    // برگرداندن تابع لغو اشتراک
    return () => {
      const observers = this.#observers.get(event);
      if (observers) {
        observers.delete(callback);
      }
    };
  }

  /**
   * اجرای یک Command
   * @param {Object} command
   * @param {string} command.name
   * @param {Function} command.execute
   * @param {Function} [command.undo]
   */
  executeCommand(command) {
    this.#withErrorBoundary(() => {
      command.execute();
      this.#commandHistory.push(command);
      this.#emit('command:executed', command);
    });
  }

  /**
   * لغو آخرین Command
   */
  undo() {
    const command = this.#commandHistory.pop();
    if (command?.undo) {
      command.undo();
      this.#emit('command:undone', command);
    }
  }

  /**
   * پاکسازی کش
   */
  clearCache() {
    this.#cache.clear();
  }

  /**
   * پاکسازی منابع
   */
  dispose() {
    this.#withErrorBoundary(() => {
      this.#isDisposed = true;
      
      // لغو همه عملیات‌ها
      this.#abortController.abort();
      
      // پاکسازی observers
      this.#observers.clear();
      
      // پاکسازی command history
      this.#commandHistory = [];
      
      // پاکسازی کش
      this.#cache.clear();
      
      // پاکسازی انیمیشن
      this.disableAnimation();
      
      // اجرای توابع پاکسازی
      this.#cleanupFunctions.forEach(fn => fn());
      this.#cleanupFunctions.clear();
      
      // پاکسازی observer
      if (this.#perfObserver) {
        this.#perfObserver.disconnect();
      }
      
      if (this.#intersectionObserver) {
        this.#intersectionObserver.disconnect();
      }
      
      // حذف از DOM
      this.unmount();
      
      // حذف از کش نمونه‌ها
      for (const [id, instance] of StreakIndicator.#instances) {
        if (instance === this) {
          StreakIndicator.#instances.delete(id);
          break;
        }
      }
      
      this.#emit('disposed');
    });
  }

  // ================================
  // متدهای استاتیک
  // ================================

  /**
   * دریافت نمونه با الگوی Factory + Cache
   * @param {string} id
   * @param {StreakIndicatorConfig} config
   * @param {Readonly<StreakMilestone[]>} [milestones]
   * @param {Readonly<Record<string, Record<string, string>>>} [messages]
   * @returns {StreakIndicator}
   */
  static getInstance(id, config, milestones, messages) {
    if (!this.#instances.has(id)) {
      this.#instances.set(id, new StreakIndicator(config, milestones, messages));
    }
    return this.#instances.get(id);
  }

  /**
   * حذف نمونه از کش
   * @param {string} id
   */
  static removeInstance(id) {
    const instance = this.#instances.get(id);
    if (instance) {
      instance.dispose();
      this.#instances.delete(id);
    }
  }

  /**
   * پاکسازی همه نمونه‌ها
   */
  static clearAllInstances() {
    this.#instances.forEach(instance => instance.dispose());
    this.#instances.clear();
  }
}

// ================================
// توابع کمکی
// ================================

/**
 * ایجاد یک نمونه از نمایش‌دهنده استریک با پیکربندی پیش‌فرض
 * @param {Partial<StreakIndicatorConfig>} config
 * @returns {StreakIndicator}
 */
export function createStreakIndicator(config = {}) {
  const defaultConfig = {
    currentStreak: 0,
    longestStreak: 0,
    isActiveToday: false,
    lastActiveDate: new Date(),
    theme: 'light',
    locale: 'fa'
  };

  return new StreakIndicator({ ...defaultConfig, ...config });
}

// ================================
// مثال استفاده
// ================================

/*
import { StreakIndicator, createStreakIndicator } from './ui/components/streak_indicator.js';

// روش 1: Factory با Cache (توصیه شده)
const indicator = StreakIndicator.getInstance('main', {
  currentStreak: 15,
  longestStreak: 42,
  isActiveToday: true,
  onShareClick: (data) => console.log('Share:', data)
});

indicator.mount(document.getElementById('streak'));

// اشتراک در رویدادها
const unsubscribe = indicator.subscribe('config:changed', ({ prop, value }) => {
  console.log(`${prop} changed to ${value}`);
});

// روش 2: سازنده مستقیم
const simpleIndicator = createStreakIndicator({
  currentStreak: 5
});

simpleIndicator.mount(document.getElementById('simple'));

// پاکسازی
// unsubscribe();
// indicator.dispose();
*/
