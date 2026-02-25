/**
 * MigrationProgressUI
 * نمایش پیشرفت عملیات مهاجرت با Event-Driven و immutable updates
 * @version 1.0.0
 */
export class MigrationProgressUI {
  #container
  #progress_bar
  #progress_text
  #current_task = ''
  #listeners = []

  /**
   * @param {HTMLElement} container عنصر اصلی container
   */
  constructor(container) {
    if (!(container instanceof HTMLElement)) throw new Error('Invalid container element')
    this.#container = container

    this.#progress_bar = container.querySelector('.migration-progress-bar')
    this.#progress_text = container.querySelector('.migration-progress-text')
  }

  /**
   * افزودن listener برای رویداد تغییر پیشرفت
   * @param {Function} fn callback({percent, task})
   */
  add_listener(fn) {
    if (typeof fn === 'function') this.#listeners.push(fn)
  }

  /**
   * حذف تمام listenerها و پاکسازی container
   */
  destroy() {
    this.#listeners.length = 0
    this.#progress_bar = null
    this.#progress_text = null
    this.#container = null
  }

  /**
   * به‌روزرسانی پیشرفت
   * @param {number} percent درصد پیشرفت 0–100
   * @param {string} task_text متن وظیفه جاری
   */
  update_progress(percent, task_text = '') {
    const clamped_percent = Math.min(100, Math.max(0, percent))
    this.#current_task = task_text

    // Reset classes
    this.#progress_bar.className = 'migration-progress-bar'

    // اعمال کلاس سطح (progress-level-0 تا progress-level-100)
    const level = Math.floor(clamped_percent / 10) * 10 // 0,10,20,...,100
    const level_class = `progress-level-${level}`
    this.#progress_bar.classList.add(level_class)

    if (clamped_percent >= 100) {
      this.#progress_bar.classList.add('progress-completed')
    }

    this.#progress_text.textContent = task_text || `${clamped_percent}%`

    this.#listeners.forEach(fn => {
      try {
        fn({ percent: clamped_percent, task: task_text })
      } catch (err) {
        console.error('MigrationProgressUI listener error:', err)
      }
    })
  }
}
