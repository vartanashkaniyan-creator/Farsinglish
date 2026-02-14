// features/exercise/types/multiple-choice.js
/**
 * @file پیاده‌سازی نوع تمرین چندگزینه‌ای
 * مسئولیت: مدل کردن یک تمرین با چند گزینه و تشخیص پاسخ صحیح
 */

class MultipleChoiceExercise {
  /**
   * @param {Object} data - داده‌های خام تمرین
   * @param {string|number} data.id - شناسه یکتا
   * @param {string} data.question - متن سوال
   * @param {string[]} data.options - آرایه‌ای از گزینه‌ها
   * @param {string|number} data.correctAnswer - پاسخ صحیح (می‌تواند متن یا اندیس باشد)
   * @param {string} [data.feedback] - بازخورد اختیاری
   */
  constructor({ id, question, options, correctAnswer, feedback = '' }) {
    this.id = id;
    this.question = question;
    this.options = Array.isArray(options) ? options : [];
    this._correctAnswer = correctAnswer;
    this.feedback = feedback;
    this.type = 'multiple-choice';
  }

  /**
   * بررسی درستی پاسخ کاربر
   * @param {string|number} userAnswer - پاسخ کاربر (می‌تواند متن گزینه یا اندیس آن باشد)
   * @returns {boolean}
   */
  isCorrect(userAnswer) {
    // پشتیبانی از اندیس عددی یا متن گزینه
    if (typeof userAnswer === 'number' && userAnswer >= 0 && userAnswer < this.options.length) {
      // اگر اندیس داده شده، آن را با گزینه متناظر مقایسه می‌کنیم
      const optionText = this.options[userAnswer];
      return optionText === this._correctAnswer || userAnswer === this._correctAnswer;
    }
    // اگر متن داده شده، مستقیماً مقایسه شود (مقایسه حساس به بزرگی کوچکی)
    return userAnswer === this._correctAnswer;
  }

  /**
   * دریافت گزینه‌ها (برای نمایش)
   * @returns {string[]}
   */
  getOptions() {
    return [...this.options]; // کپی برای جلوگیری از تغییر ناخواسته
  }

  /**
   * دریافت پاسخ صحیح (برای موارد خاص مثل نمایش)
   * @returns {string|number}
   */
  getCorrectAnswer() {
    return this._correctAnswer;
  }
}

export default MultipleChoiceExercise;
