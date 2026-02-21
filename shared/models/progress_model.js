/**
 * سرویس مدیریت پیشرفت کاربر در درس‌ها
 * مسئول: به‌روزرسانی و محاسبات پیشرفت با رویکرد SRS
 * @version 4.0.0
 * @module services/progress_service
 */

// ========== ثابت‌های ماژول ==========

/**
 * @typedef {Object} ProgressConstants
 * @property {Object} MASTERY - تنظیمات سطوح تسلط
 * @property {Object} SRS - تنظیمات الگوریتم SRS
 * @property {Object} REVIEW - تنظیمات مرور
 */

export const PROGRESS_CONSTANTS = /** @type {const} */ ({
  MASTERY: {
    MIN: 0,
    MAX: 5,
    DEFAULT: 0,
    LEVELS: {
      1: { minRepetition: 1, minAccuracy: 0.5 },
      2: { minRepetition: 2, minAccuracy: 0.6 },
      3: { minRepetition: 3, minAccuracy: 0.7 },
      4: { minRepetition: 4, minAccuracy: 0.8 },
      5: { minRepetition: 5, minAccuracy: 0.9 }
    }
  },
  SRS: {
    MIN_EASE_FACTOR: 1.3,
    MAX_EASE_FACTOR: 4.0,
    DEFAULT_EASE_FACTOR: 2.5,
    MIN_INTERVAL_DAYS: 0,
    MAX_INTERVAL_DAYS: 365
  },
  REVIEW: {
    MIN_HOURS_BETWEEN: 4,
    MAX_HISTORY_ITEMS: 30
  }
});

// ========== انواع داده ==========

/**
 * @typedef {Object} ReviewHistoryItem
 * @property {string} date - تاریخ مرور (ISO string)
 * @property {boolean} correct - صحیح یا غلط بودن پاسخ
 * @property {number} easeFactor - ضریب آسانی در آن مرور
 * @property {number} interval - فاصله زمانی (روز)
 * @property {number} responseTime - زمان پاسخ‌گویی (میلی‌ثانیه)
 */

/**
 * @typedef {Object} ProgressData
 * @property {string} userId - شناسه کاربر
 * @property {string} lessonId - شناسه درس
 * @property {number} repetition - تکرار موفق پشت‌سر هم
 * @property {number} easeFactor - ضریب آسانی (≥1.3)
 * @property {number} interval - فاصله کنونی (روز)
 * @property {string} nextReviewDate - تاریخ مرور بعدی (ISO string)
 * @property {number} masteryLevel - سطح تسلط (۰ تا ۵)
 * @property {number} totalReviews - تعداد کل مرورها
 * @property {number} correctCount - تعداد پاسخ‌های صحیح
 * @property {number} incorrectCount - تعداد پاسخ‌های غلط
 * @property {string|null} lastReviewedAt - آخرین زمان مرور (ISO string)
 * @property {number} streak - تعداد پاسخ‌های صحیح متوالی
 * @property {ReviewHistoryItem[]} reviewHistory - تاریخچه مرورها
 * @property {Object} runningAverage - میانگین در حال اجرا (الگوریتم Welford)
 * @property {number} runningAverage.mean - میانگین فعلی
 * @property {number} runningAverage.count - تعداد نمونه‌ها
 * @property {number} runningAverage.m2 - توان دوم برای محاسبه واریانس
 * @property {string} version - نسخه مدل
 */

/**
 * @typedef {Object} UserAnswer
 * @property {boolean} isCorrect - آیا پاسخ صحیح است؟
 * @property {number} responseTime - زمان پاسخ‌گویی (میلی‌ثانیه)
 * @property {string} [answerText] - متن پاسخ (اختیاری)
 */

/**
 * @typedef {Object} SRSUpdate
 * @property {number} repetition - تکرار جدید
 * @property {number} easeFactor - ضریب آسانی جدید
 * @property {number} interval - فاصله جدید (روز)
 */

// ========== TimeProvider ==========

/**
 * @typedef {Object} TimeProvider
 * @property {() => Date} now - دریافت زمان جاری
 * @property {(date?: Date) => string} toISO - تبدیل به ISO string
 * @property {(date: string) => boolean} isValidISO - اعتبارسنجی ISO string
 */

/**
 * TimeProvider پیش‌فرض
 * @type {TimeProvider}
 */
export const DefaultTimeProvider = {
  now: () => new Date(),
  toISO: (date) => (date || new Date()).toISOString(),
  isValidISO: (dateString) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) && dateString === date.toISOString();
  }
};

// ========== ابزارهای clone بهینه (جایگزین JSON.stringify) - بهبود ۳ ==========

/**
 * clone عمیق برای ProgressData
 * @param {ProgressData} progress 
 * @returns {ProgressData}
 */
function cloneProgress(progress) {
  if (!progress) return progress;
  
  // استفاده از structuredClone اگر موجود باشد
  if (typeof structuredClone !== 'undefined') {
    return structuredClone(progress);
  }
  
  // clone دستی برای مرورگرهای قدیمی
  return {
    ...progress,
    reviewHistory: progress.reviewHistory?.map(item => ({ ...item })) || [],
    runningAverage: { ...progress.runningAverage }
  };
}

// ========== اعتبارسنجی سبک (بهبود ۷) ==========

/**
 * @enum {number}
 */
export const ValidationLevel = {
  NONE: 0,      // بدون اعتبارسنجی (توسعه)
  BASIC: 1,     // فقط فیلدهای اجباری (پیش‌فرض)
  STRICT: 2     // اعتبارسنجی کامل (production)
};

/**
 * اعتبارسنجی سریع فیلدهای اجباری
 * @param {any} progress 
 * @returns {{isValid: boolean, error?: string}}
 */
function quickValidate(progress) {
  if (!progress || typeof progress !== 'object') {
    return { isValid: false, error: 'Progress must be an object' };
  }
  if (!progress.userId || typeof progress.userId !== 'string') {
    return { isValid: false, error: 'userId required' };
  }
  if (!progress.lessonId || typeof progress.lessonId !== 'string') {
    return { isValid: false, error: 'lessonId required' };
  }
  return { isValid: true };
}

/**
 * اعتبارسنجی کامل (در صورت نیاز)
 * @param {any} progress 
 * @param {TimeProvider} timeProvider 
 * @returns {{isValid: boolean, errors: string[]}}
 */
function fullValidate(progress, timeProvider = DefaultTimeProvider) {
  const errors = [];
  
  // اعتبارسنجی اعداد
  if (progress.easeFactor < PROGRESS_CONSTANTS.SRS.MIN_EASE_FACTOR) {
    errors.push(`easeFactor must be ≥ ${PROGRESS_CONSTANTS.SRS.MIN_EASE_FACTOR}`);
  }
  
  if (progress.masteryLevel < 0 || progress.masteryLevel > 5) {
    errors.push('masteryLevel must be 0-5');
  }
  
  // اعتبارسنجی تاریخ‌ها
  if (progress.nextReviewDate && !timeProvider.isValidISO(progress.nextReviewDate)) {
    errors.push('nextReviewDate must be valid ISO date');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// ========== توابع اصلی ==========

/**
 * ایجاد نمونه جدید پیشرفت
 * @param {string} userId 
 * @param {string} lessonId 
 * @param {Object} [options] 
 * @param {number} [options.initialEaseFactor=2.5]
 * @param {TimeProvider} [options.timeProvider=DefaultTimeProvider]
 * @param {ValidationLevel} [options.validationLevel=ValidationLevel.BASIC]
 * @returns {ProgressData}
 */
export function createInitialProgress(userId, lessonId, options = {}) {
  const {
    initialEaseFactor = PROGRESS_CONSTANTS.SRS.DEFAULT_EASE_FACTOR,
    timeProvider = DefaultTimeProvider,
    validationLevel = ValidationLevel.BASIC
  } = options;

  // اعتبارسنجی سریع
  if (validationLevel >= ValidationLevel.BASIC) {
    if (!userId || !lessonId) {
      throw new Error('userId and lessonId are required');
    }
  }

  const now = timeProvider.toISO();

  return {
    userId,
    lessonId,
    repetition: 0,
    easeFactor: initialEaseFactor,
    interval: 0,
    nextReviewDate: now,
    masteryLevel: PROGRESS_CONSTANTS.MASTERY.DEFAULT,
    totalReviews: 0,
    correctCount: 0,
    incorrectCount: 0,
    lastReviewedAt: null,
    streak: 0,
    reviewHistory: [],
    runningAverage: { mean: 0, count: 0, m2: 0 },
    version: '4.0.0'
  };
}

/**
 * به‌روزرسانی پیشرفت با پاسخ مستقیم کاربر (بهبود ۲)
 * @param {ProgressData} progress - پیشرفت فعلی
 * @param {UserAnswer} userAnswer - پاسخ کاربر
 * @param {SRSUpdate} srsUpdate - خروجی موتور SRS
 * @param {Object} [options]
 * @param {TimeProvider} [options.timeProvider=DefaultTimeProvider]
 * @param {ValidationLevel} [options.validationLevel=ValidationLevel.BASIC]
 * @returns {ProgressData} پیشرفت به‌روز شده
 */
export function updateProgressWithAnswer(progress, userAnswer, srsUpdate, options = {}) {
  const {
    timeProvider = DefaultTimeProvider,
    validationLevel = ValidationLevel.BASIC
  } = options;

  // اعتبارسنجی بر اساس سطح
  if (validationLevel >= ValidationLevel.BASIC) {
    const quick = quickValidate(progress);
    if (!quick.isValid) throw new Error(quick.error);
    
    if (!userAnswer || typeof userAnswer.isCorrect !== 'boolean') {
      throw new Error('userAnswer with isCorrect is required');
    }
  }

  if (validationLevel >= ValidationLevel.STRICT) {
    const full = fullValidate(progress, timeProvider);
    if (!full.isValid) throw new Error(`Invalid progress: ${full.errors.join(', ')}`);
  }

  const wasCorrect = userAnswer.isCorrect; // مستقیم از کاربر
  const responseTime = userAnswer.responseTime || 0;
  
  // محاسبه streak
  const newStreak = wasCorrect ? (progress.streak || 0) + 1 : 0;
  
  // ایجاد آیتم تاریخچه
  /** @type {ReviewHistoryItem} */
  const historyItem = {
    date: timeProvider.toISO(),
    correct: wasCorrect,
    easeFactor: srsUpdate.easeFactor,
    interval: srsUpdate.interval,
    responseTime
  };
  
  // به‌روزرسانی تاریخچه (FIFO)
  const newHistory = [
    historyItem,
    ...(progress.reviewHistory || [])
  ].slice(0, PROGRESS_CONSTANTS.REVIEW.MAX_HISTORY_ITEMS);
  
  // به‌روزرسانی میانگین با الگوریتم Welford
  const newRunningAverage = updateRunningAverage(
    progress.runningAverage || { mean: 0, count: 0, m2: 0 },
    responseTime
  );
  
  const newTotalReviews = (progress.totalReviews || 0) + 1;
  
  // محاسبه سطح تسلط
  const newMasteryLevel = calculateMasteryLevel({
    repetition: srsUpdate.repetition,
    correctCount: wasCorrect ? progress.correctCount + 1 : progress.correctCount,
    totalReviews: newTotalReviews,
    streak: newStreak
  });

  // ایجاد نمونه جدید با clone بهینه
  const updated = cloneProgress({
    ...progress,
    repetition: srsUpdate.repetition,
    easeFactor: srsUpdate.easeFactor,
    interval: srsUpdate.interval,
    nextReviewDate: srsUpdate.nextReviewDate || timeProvider.toISO(),
    totalReviews: newTotalReviews,
    correctCount: wasCorrect ? progress.correctCount + 1 : progress.correctCount,
    incorrectCount: wasCorrect ? progress.incorrectCount : progress.incorrectCount + 1,
    lastReviewedAt: timeProvider.toISO(),
    masteryLevel: newMasteryLevel,
    streak: newStreak,
    reviewHistory: newHistory,
    runningAverage: newRunningAverage,
    version: '4.0.0'
  });

  return updated;
}

/**
 * به‌روزرسانی میانگین با الگوریتم Welford
 * @param {Object} avg - میانگین فعلی
 * @param {number} avg.mean
 * @param {number} avg.count
 * @param {number} avg.m2
 * @param {number} newValue - مقدار جدید
 * @returns {Object} میانگین به‌روز شده
 */
function updateRunningAverage(avg, newValue) {
  const { mean, count, m2 } = avg;
  const newCount = count + 1;
  
  if (newCount === 1) {
    return { mean: newValue, count: 1, m2: 0 };
  }
  
  const delta = newValue - mean;
  const newMean = mean + delta / newCount;
  const delta2 = newValue - newMean;
  const newM2 = m2 + delta * delta2;
  
  return {
    mean: newMean,
    count: newCount,
    m2: newM2
  };
}

/**
 * محاسبه سطح تسلط (ساده و سبک)
 * @param {Object} params
 * @param {number} params.repetition
 * @param {number} params.correctCount
 * @param {number} params.totalReviews
 * @param {number} params.streak
 * @returns {number}
 */
function calculateMasteryLevel({ repetition, correctCount, totalReviews, streak }) {
  if (totalReviews === 0) return 0;
  
  const accuracy = correctCount / totalReviews;
  
  // الگوریتم ساده و قابل فهم
  if (repetition >= 5 && accuracy > 0.9) return 5;
  if (repetition >= 4 && accuracy > 0.8) return 4;
  if (repetition >= 3 && accuracy > 0.7) return 3;
  if (repetition >= 2 && accuracy > 0.6) return 2;
  if (repetition >= 1) return 1;
  
  return 0;
}

/**
 * بررسی وضعیت مرور
 * @param {ProgressData} progress
 * @param {Object} [options]
 * @param {Date} [options.now]
 * @param {TimeProvider} [options.timeProvider=DefaultTimeProvider]
 * @returns {{
 *   isDue: boolean,
 *   reason: string,
 *   urgency: number,
 *   recommended: boolean
 * }}
 */
export function getDueStatus(progress, options = {}) {
  const {
    now = new Date(),
    timeProvider = DefaultTimeProvider
  } = options;

  const result = {
    isDue: false,
    reason: 'not-due',
    urgency: 0,
    recommended: false
  };

  if (!progress?.nextReviewDate) {
    result.isDue = true;
    result.reason = 'no-review-date';
    return result;
  }

  const nextReview = new Date(progress.nextReviewDate);
  const hoursUntilDue = (nextReview - now) / (1000 * 60 * 60);
  
  // منطق کامل isDue
  if (hoursUntilDue <= 0) {
    result.isDue = true;
    result.reason = 'overdue';
    result.urgency = Math.min(100, Math.abs(hoursUntilDue) * 5);
  }
  
  // بررسی حداقل فاصله
  if (progress.lastReviewedAt) {
    const hoursSinceLast = (now - new Date(progress.lastReviewedAt)) / (1000 * 60 * 60);
    if (hoursSinceLast < PROGRESS_CONSTANTS.REVIEW.MIN_HOURS_BETWEEN) {
      result.isDue = false;
      result.reason = 'minimum-interval-not-met';
      return result;
    }
  }
  
  // پیشنهاد مرور زودهنگام برای سطوح پایین
  if (progress.masteryLevel < 3 && hoursUntilDue < 24 && hoursUntilDue > 0) {
    result.recommended = true;
    result.reason = 'recommended-for-low-mastery';
  }

  return result;
}

/**
 * دریافت آمار خلاصه
 * @param {ProgressData} progress
 * @returns {Object}
 */
export function getProgressSummary(progress) {
  if (!progress) return { error: 'No progress data' };

  const accuracy = progress.totalReviews > 0
    ? (progress.correctCount / progress.totalReviews) * 100
    : 0;

  const dueStatus = getDueStatus(progress);

  return {
    masteryLevel: progress.masteryLevel,
    accuracy: Math.round(accuracy * 100) / 100,
    totalReviews: progress.totalReviews,
    streak: progress.streak,
    nextReview: progress.nextReviewDate,
    isDue: dueStatus.isDue,
    dueReason: dueStatus.reason,
    recommended: dueStatus.recommended,
    averageResponseTime: Math.round(progress.runningAverage?.mean || 0),
    reviewCount: progress.reviewHistory?.length || 0,
    version: progress.version
  };
}

/**
 * مهاجرت از نسخه قدیم
 * @param {any} oldProgress 
 * @returns {ProgressData}
 */
export function migrateProgress(oldProgress) {
  if (!oldProgress) return null;
  
  // اگر نسخه جدید است
  if (oldProgress.version === '4.0.0') return oldProgress;
  
  // مهاجرت از نسخه ۳ به ۴
  const migrated = {
    ...oldProgress,
    streak: oldProgress.streak || 0,
    reviewHistory: oldProgress.reviewHistory || [],
    runningAverage: oldProgress.runningAverage || { mean: 0, count: 0, m2: 0 },
    version: '4.0.0'
  };
  
  // اگر averageResponseTime قدیمی بود، به runningAverage تبدیل کن
  if (oldProgress.averageResponseTime && !oldProgress.runningAverage) {
    migrated.runningAverage = {
      mean: oldProgress.averageResponseTime,
      count: oldProgress.totalReviews || 1,
      m2: 0
    };
  }
  
  return migrated;
}

// ========== ابزارهای تست ==========

/**
 * ایجاد نمونه تستی
 * @param {Partial<ProgressData>} overrides
 * @returns {ProgressData}
 */
export function createTestProgress(overrides = {}) {
  const base = createInitialProgress('test-user', 'test-lesson');
  return {
    ...base,
    ...overrides,
    reviewHistory: overrides.reviewHistory || []
  };
}
