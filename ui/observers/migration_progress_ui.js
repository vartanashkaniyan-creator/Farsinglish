/**
 * @file migration_progress_ui.js
 * @description مدیریت رابط کاربری پیشرفت مهاجرت با اصول آلفا و Event-driven
 * @version 1.0.0
 */

export class MigrationProgressUI {
  // 🔒 Private Fields
  #container
  #progress_bar
  #progress_text
  #listeners
  #current_task = ''

  /**
   * @param {HTMLElement} container_element - المان والد برای نوار پیشرفت
   */
  constructor(container_element) {
    if (!(container_element instanceof HTMLElement)) {
      throw new TypeError('container_element باید HTMLElement باشد')
    }

    this.#container = container_element
    this.#progress_bar = this.#container.querySelector('.migration-progress-bar')
    this.#progress_text = this.#container.querySelector('.migration-progress-text')
    this.#listeners = []

    this._init()
  }

  /**
   * مقداردهی اولیه
   * @private
   */
  _init() {
    this.#progress_bar.className = 'migration-progress-bar'
    this.#progress_text.textContent = '0%'
  }

  /**
   * ثبت listener جدید برای دریافت رویداد پیشرفت
   * @param {(data: {percent: number, task: string}) => void} fn
   */
  on_progress(fn) {
    if (typeof fn !== 'function') throw new TypeError('listener باید تابع باشد')
    this.#listeners.push(fn)
  }

  /**
   * حذف همه listenerها
   */
  destroy() {
    this.#listeners.length = 0
  }

  /**
   * بروزرسانی درصد پیشرفت
   * @param {number} percent - مقدار پیشرفت بین 0 تا 100
   * @param {string} [task_text=''] - متن وظیفه فعلی
   */
  update_progress(percent, task_text = '') {
    const clamped_percent = Math.min(100, Math.max(0, percent))
    this.#current_task = task_text

    // Reset کلاس‌ها
    this.#progress_bar.className = 'migration-progress-bar'

    // تعیین سطح پیشرفت از 0 تا 100
    const level = Math.floor(clamped_percent / 10) * 10 // 0,10,20,...,100
    const level_class = `progress-level-${level}`
    this.#progress_bar.classList.add(level_class)

    if (clamped_percent >= 100) {
      this.#progress_bar.classList.add('progress-completed')
    }

    this.#progress_text.textContent = task_text || `${clamped_percent}%`

    // انتشار رویداد به همه listenerها
    this.#listeners.forEach(fn => {
      try {
        fn({ percent: clamped_percent, task: task_text })
      } catch (err) {
        console.error('MigrationProgressUI listener error:', err)
      }
    })
  }

  /**
   * دریافت وظیفه فعلی
   * @returns {string}
   */
  get_current_task() {
    return this.#current_task
  }
}
