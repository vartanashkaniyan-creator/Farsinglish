// features/exercise/exercise-service.js
/**
 * سرویس مدیریت تمرین‌ها
 * مسئولیت: دریافت تمرین‌های یک درس، اعتبارسنجی پاسخ‌ها
 * وابستگی‌ها از طریق تزریق در سازنده دریافت می‌شوند.
 */

/**
 * @interface Exercise
 * اینترفیس پایه برای انواع تمرین
 * هر نوع تمرین باید این متدها را پیاده‌سازی کند.
 */
// (در JS به صورت قرارداد عمل می‌کنیم، نه اینترفیس صریح)

class ExerciseService {
  /**
   * @param {Object} deps - وابستگی‌ها
   * @param {Object} deps.lessonService - سرویس درس (برای دریافت داده‌های خام تمرین)
   * @param {Object} deps.exerciseFactory - کارخانه‌ای که از روی داده خام، شیء تمرین می‌سازد
   * @param {Object} [deps.progressService] - سرویس پیشرفت (اختیاری، برای ثبت نتایج)
   */
  constructor({ lessonService, exerciseFactory, progressService = null }) {
    this._lessonService = lessonService;
    this._exerciseFactory = exerciseFactory;
    this._progressService = progressService;
  }

  /**
   * دریافت لیست تمرین‌های یک درس
   * @param {string|number} lessonId - شناسه درس
   * @returns {Promise<Array<Exercise>>} آرایه‌ای از اشیاء تمرین
   */
  async getExercisesForLesson(lessonId) {
    // 1. دریافت داده‌های خام درس از سرویس درس
    const lesson = await this._lessonService.getLessonById(lessonId);
    if (!lesson || !Array.isArray(lesson.exercises)) {
      return [];
    }

    // 2. تبدیل هر آیتم خام به شیء تمرین با استفاده از کارخانه
    const exercises = lesson.exercises.map(raw => this._exerciseFactory.createExercise(raw));
    return exercises;
  }

  /**
   * بررسی صحت پاسخ کاربر برای یک تمرین
   * @param {Exercise} exercise - شیء تمرین
   * @param {*} userAnswer - پاسخ داده شده توسط کاربر
   * @returns {boolean} true اگر پاسخ درست باشد
   */
  checkAnswer(exercise, userAnswer) {
    if (!exercise || typeof exercise.isCorrect !== 'function') {
      return false;
    }
    return exercise.isCorrect(userAnswer);
  }

  /**
   * ثبت نتیجه پاسخ (در صورت وجود سرویس پیشرفت)
   * @param {string|number} lessonId - شناسه درس
   * @param {string|number} exerciseId - شناسه تمرین
   * @param {boolean} correct - نتیجه صحت پاسخ
   * @returns {Promise<void>}
   */
  async recordResult(lessonId, exerciseId, correct) {
    if (!this._progressService) {
      return;
    }
    await this._progressService.updateExerciseResult(lessonId, exerciseId, correct);
  }
}

export default ExerciseService;
