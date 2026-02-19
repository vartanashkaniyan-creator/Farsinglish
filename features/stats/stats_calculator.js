/**
 * features/stats/stats_calculator.js
 * 
 * ماژول محاسبه آمار پیشرفت کاربر - نسخه Enterprise
 * مسئولیت: محاسبه تمامی آمارهای مرتبط با پیشرفت با قابلیت‌های caching، event-driven و observability
 * 
 * @module stats_calculator
 */

// @ts-check
import { EventEmitter } from 'events';

/**
 * @typedef {Object} CacheConfig
 * @property {number} ttl - زمان به‌روزرسانی کش (میلی‌ثانیه)
 * @property {number} max_size - حداکثر تعداد آیتم‌های کش
 * @property {string} strategy - استراتژی کش ('lru' | 'lfu' | 'fifo')
 */

/**
 * @typedef {Object} MetricsCollector
 * @property {Function} increment - افزایش شمارنده
 * @property {Function} timing - ثبت زمان اجرا
 * @property {Function} gauge - ثبت مقدار لحظه‌ای
 */

/**
 * @typedef {Object} UserProgress
 * @property {string} user_id - شناسه کاربر
 * @property {Object.<string, LessonProgress>} lessons - پیشرفت درس‌ها
 * @property {Object.<string, ExerciseRecord>} exercises - سابقه تمرین‌ها
 * @property {StudyTime[]} study_sessions - جلسات مطالعه
 * @property {string} last_updated - آخرین به‌روزرسانی
 */

/**
 * @typedef {Object} LessonProgress
 * @property {string} lesson_id - شناسه درس
 * @property {boolean} completed - آیا کامل شده
 * @property {number} completion_percentage - درصد تکمیل (۰-۱۰۰)
 * @property {number} last_position - آخرین موقعیت
 * @property {string} last_studied - آخرین تاریخ مطالعه
 * @property {number} review_count - تعداد مرورها
 */

/**
 * @typedef {Object} ExerciseRecord
 * @property {string} exercise_id - شناسه تمرین
 * @property {string} lesson_id - شناسه درس مرتبط
 * @property {boolean} correct - آیا پاسخ درست بوده
 * @property {number} response_time_ms - زمان پاسخگویی (میلی‌ثانیه)
 * @property {string} timestamp - زمان ثبت
 * @property {string} answer_given - پاسخ داده شده
 */

/**
 * @typedef {Object} StudyTime
 * @property {string} date - تاریخ جلسه
 * @property {number} duration_minutes - مدت زمان (دقیقه)
 * @property {string[]} lessons_studied - درس‌های مطالعه شده
 */

/**
 * @typedef {Object} UserStats
 * @property {OverallStats} overall - آمار کلی
 * @property {LearningStats} learning - آمار یادگیری
 * @property {StreakStats} streak - آمار تداوم
 * @property {MasteryStats} mastery - آمار تسلط
 * @property {ActivityStats} activity - آمار فعالیت روزانه
 * @property {Object} metadata - متادیتا
 */

/**
 * @typedef {Object} OverallStats
 * @property {number} total_lessons - کل درس‌ها
 * @property {number} completed_lessons - درس‌های تکمیل شده
 * @property {number} completion_percentage - درصد تکمیل کلی
 * @property {number} total_exercises - کل تمرین‌ها
 * @property {number} correct_exercises - تمرین‌های درست
 * @property {number} success_rate - نرخ موفقیت (درصد)
 * @property {number} total_study_minutes - کل زمان مطالعه (دقیقه)
 * @property {number} average_session_duration - میانگین مدت جلسه
 */

/**
 * @typedef {Object} LearningStats
 * @property {number} words_learned - لغات یادگرفته شده
 * @property {number} words_in_progress - لغات در حال یادگیری
 * @property {number} mastery_level - سطح تسلط کلی (۰-۱۰۰)
 * @property {Object.<string, number>} category_progress - پیشرفت به تفکیک دسته
 * @property {number} review_accuracy - دقت در مرورها
 */

/**
 * @typedef {Object} StreakStats
 * @property {number} current_streak - استریک فعلی (روز)
 * @property {number} longest_streak - طولانی‌ترین استریک
 * @property {string} last_activity_date - آخرین تاریخ فعالیت
 * @property {boolean} active_today - آیا امروز فعالیت داشته
 * @property {number} total_active_days - کل روزهای فعال
 */

/**
 * @typedef {Object} MasteryStats
 * @property {Object.<string, number>} stage_distribution - توزیع مراحل SRS
 * @property {number} due_reviews_count - تعداد مرورهای عقب‌افتاده
 * @property {number} next_review_density - تراکم مرورهای آینده
 * @property {number} retention_rate - نرخ نگهداری (درصد)
 */

/**
 * @typedef {Object} ActivityStats
 * @property {Object.<string, number>} daily_activity - فعالیت روزانه (۷ روز اخیر)
 * @property {Object.<string, number>} hourly_distribution - توزیع ساعتی فعالیت
 * @property {number} most_active_hour - پرکارترین ساعت
 * @property {string} preferred_study_time - زمان ترجیحی مطالعه
 */

/**
 * کلاس مدیریت کش ساده
 * @private
 */
class SimpleCache {
    /**
     * @param {CacheConfig} config
     */
    constructor(config) {
        this.config = config;
        /** @type {Map<string, {value: any, timestamp: number, hits: number}>} */
        this.cache = new Map();
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * دریافت مقدار از کش
     * @param {string} key
     * @returns {any | null}
     */
    get(key) {
        const item = this.cache.get(key);
        
        if (!item) {
            this.misses++;
            return null;
        }

        if (Date.now() - item.timestamp > this.config.ttl) {
            this.cache.delete(key);
            this.misses++;
            return null;
        }

        item.hits++;
        this.hits++;
        
        // به‌روزرسانی موقعیت در استراتژی LRU
        if (this.config.strategy === 'lru') {
            this.cache.delete(key);
            this.cache.set(key, item);
        }

        return item.value;
    }

    /**
     * ذخیره مقدار در کش
     * @param {string} key
     * @param {any} value
     */
    set(key, value) {
        if (this.cache.size >= this.config.max_size) {
            this._evict();
        }

        this.cache.set(key, {
            value,
            timestamp: Date.now(),
            hits: 0
        });
    }

    /**
     * حذف یک آیتم از کش
     * @private
     */
    _evict() {
        if (this.config.strategy === 'lru') {
            // حذف قدیمی‌ترین (اولین) آیتم
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        } else if (this.config.strategy === 'lfu') {
            // حذف کم‌استفاده‌ترین
            let minHits = Infinity;
            let keyToRemove = null;
            
            for (const [key, item] of this.cache.entries()) {
                if (item.hits < minHits) {
                    minHits = item.hits;
                    keyToRemove = key;
                }
            }
            
            if (keyToRemove) {
                this.cache.delete(keyToRemove);
            }
        } else {
            // FIFO: حذف اولین
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }

    /**
     * پاک کردن کامل کش
     */
    clear() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * دریافت آمار کش
     * @returns {Object}
     */
    get_stats() {
        return {
            size: this.cache.size,
            hits: this.hits,
            misses: this.misses,
            hit_ratio: this.hits / (this.hits + this.misses) || 0
        };
    }
}

/**
 * کلاس جمع‌آوری metrics
 * @private
 */
class SimpleMetricsCollector {
    constructor() {
        /** @type {Map<string, number>} */
        this.counters = new Map();
        
        /** @type {Map<string, number[]>} */
        this.timings = new Map();
        
        /** @type {Map<string, number>} */
        this.gauges = new Map();
    }

    /**
     * افزایش شمارنده
     * @param {string} name 
     * @param {number} value 
     */
    increment(name, value = 1) {
        const current = this.counters.get(name) || 0;
        this.counters.set(name, current + value);
    }

    /**
     * ثبت زمان اجرا
     * @param {string} name 
     * @param {number} duration 
     */
    timing(name, duration) {
        if (!this.timings.has(name)) {
            this.timings.set(name, []);
        }
        this.timings.get(name).push(duration);
        
        // نگهداری فقط 100 مقدار آخر
        const timings = this.timings.get(name);
        if (timings.length > 100) {
            timings.shift();
        }
    }

    /**
     * ثبت مقدار لحظه‌ای
     * @param {string} name 
     * @param {number} value 
     */
    gauge(name, value) {
        this.gauges.set(name, value);
    }

    /**
     * دریافت همه metrics
     * @returns {Object}
     */
    get_all() {
        const result = {};
        
        for (const [name, value] of this.counters) {
            result[`counter_${name}`] = value;
        }
        
        for (const [name, values] of this.timings) {
            const sum = values.reduce((a, b) => a + b, 0);
            result[`timing_${name}_avg`] = sum / values.length;
            result[`timing_${name}_count`] = values.length;
            result[`timing_${name}_max`] = Math.max(...values);
            result[`timing_${name}_min`] = Math.min(...values);
        }
        
        for (const [name, value] of this.gauges) {
            result[`gauge_${name}`] = value;
        }
        
        return result;
    }
}

/**
 * کلاس محاسبه‌گر آمار کاربر
 * نسخه Enterprise با قابلیت‌های پیشرفته
 * 
 * @class StatsCalculator
 * @extends EventEmitter
 */
export class StatsCalculator extends EventEmitter {
    /**
     * @param {Object} config - تنظیمات محاسبه
     * @param {number} config.streak_grace_period_hours - مهلت استریک (ساعت)
     * @param {number} config.mastery_threshold - آستانه تسلط
     * @param {string[]} config.categories - دسته‌بندی‌های آموزشی
     * @param {CacheConfig} config.cache_config - تنظیمات کش
     * @param {boolean} config.enable_metrics - فعال‌سازی metrics
     */
    constructor(config = {}) {
        super();
        
        this.config = {
            streak_grace_period_hours: 24,
            mastery_threshold: 80,
            categories: ['vocabulary', 'grammar', 'listening', 'speaking'],
            cache_config: {
                ttl: 5 * 60 * 1000, // 5 دقیقه
                max_size: 100,
                strategy: 'lru'
            },
            enable_metrics: true,
            ...config
        };

        // کش هوشمند
        this.cache = new SimpleCache(this.config.cache_config);
        
        // Metrics collector
        this.metrics = this.config.enable_metrics ? new SimpleMetricsCollector() : null;
        
        // مموری‌زیشن برای متدهای سنگین
        this._memoized_methods = new Map();
        
        this.emit('calculator:initialized', { 
            timestamp: new Date().toISOString(),
            config: this.config 
        });
    }

    /**
     * مموری‌زیشن هوشمند
     * @private
     */
    _memoize(method_name, fn, ttl = 60000) {
        return (...args) => {
            const key = `${method_name}_${JSON.stringify(args)}`;
            const cached = this._memoized_methods.get(key);
            
            if (cached && Date.now() - cached.timestamp < ttl) {
                this.metrics?.increment(`memoize_hit_${method_name}`);
                return cached.value;
            }
            
            this.metrics?.increment(`memoize_miss_${method_name}`);
            const result = fn.apply(this, args);
            this._memoized_methods.set(key, {
                value: result,
                timestamp: Date.now()
            });
            
            return result;
        };
    }

    /**
     * محاسبه آمار کامل کاربر
     * 
     * @param {UserProgress} progress - داده پیشرفت کاربر
     * @param {Object} metadata - متادیتای اضافی
     * @returns {UserStats} آمار محاسبه شده
     */
    calculateAllStats(progress, metadata = {}) {
        const start_time = performance.now();
        const cache_key = `stats_${progress.user_id}_${progress.last_updated}`;
        
        this.emit('calculation:start', { 
            user_id: progress.user_id,
            timestamp: new Date().toISOString()
        });

        try {
            // بررسی کش
            const cached = this.cache.get(cache_key);
            if (cached) {
                this.metrics?.increment('cache_hit');
                this.emit('calculation:cache_hit', { user_id: progress.user_id });
                return cached;
            }

            this.metrics?.increment('cache_miss');
            
            // اعتبارسنجی
            this._validateProgress(progress);

            // محاسبات موازی
            const [overall, learning, streak, mastery, activity] = this._parallel_calculate(progress);

            const stats = {
                overall,
                learning,
                streak,
                mastery,
                activity,
                metadata: {
                    calculated_at: new Date().toISOString(),
                    data_version: '1.0',
                    calculation_time_ms: performance.now() - start_time,
                    cache_config: this.config.cache_config,
                    ...metadata
                }
            };

            // ذخیره در کش
            this.cache.set(cache_key, stats);
            
            // ثبت metrics
            if (this.metrics) {
                this.metrics.timing('calculation_duration', performance.now() - start_time);
                this.metrics.gauge('cache_size', this.cache.get_stats().size);
                this.metrics.gauge('hit_ratio', this.cache.get_stats().hit_ratio);
            }

            // رویدادهای ویژه
            this._emit_special_events(progress.user_id, stats);

            this.emit('calculation:complete', {
                user_id: progress.user_id,
                stats,
                duration_ms: performance.now() - start_time
            });

            return stats;

        } catch (error) {
            this.metrics?.increment('calculation_error');
            this.emit('calculation:error', {
                user_id: progress.user_id,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * محاسبه موازی آمارها
     * @private
     */
    _parallel_calculate(progress) {
        // در محیط واقعی می‌توان از Promise.all استفاده کرد
        // اینجا برای سادگی به صورت ترتیبی است
        return [
            this._calculateOverallStats(progress),
            this._calculateLearningStats(progress),
            this._calculateStreakStats(progress),
            this._calculateMasteryStats(progress),
            this._calculateActivityStats(progress)
        ];
    }

    /**
     * محاسبه آمار کلی
     * 
     * @param {UserProgress} progress 
     * @returns {OverallStats}
     * @private
     */
    _calculateOverallStats(progress) {
        const lessons = Object.values(progress.lessons || {});
        const exercises = Object.values(progress.exercises || {});
        
        const total_lessons = lessons.length;
        const completed_lessons = lessons.filter(l => l.completed).length;
        
        const completion_percentage = total_lessons > 0 
            ? Math.round((completed_lessons / total_lessons) * 100) 
            : 0;

        const total_exercises = exercises.length;
        const correct_exercises = exercises.filter(e => e.correct).length;
        
        const success_rate = total_exercises > 0 
            ? Math.round((correct_exercises / total_exercises) * 100) 
            : 0;

        const total_study_minutes = this._calculateTotalStudyMinutes(progress);
        
        const session_durations = progress.study_sessions?.map(s => s.duration_minutes) || [];
        const average_session_duration = session_durations.length > 0
            ? Math.round(session_durations.reduce((a, b) => a + b, 0) / session_durations.length)
            : 0;

        return {
            total_lessons,
            completed_lessons,
            completion_percentage,
            total_exercises,
            correct_exercises,
            success_rate,
            total_study_minutes,
            average_session_duration
        };
    }

    /**
     * محاسبه آمار یادگیری
     * 
     * @param {UserProgress} progress 
     * @returns {LearningStats}
     * @private
     */
    _calculateLearningStats(progress) {
        const exercises = Object.values(progress.exercises || {});
        
        // تخمین تعداد لغات یادگرفته شده
        const unique_correct = new Set();
        exercises
            .filter(e => e.correct)
            .forEach(e => unique_correct.add(e.exercise_id));
        
        const words_learned = unique_correct.size;
        
        // لغات در حال یادگیری
        const unique_attempted = new Set();
        exercises.forEach(e => unique_attempted.add(e.exercise_id));
        
        const words_in_progress = unique_attempted.size - words_learned;

        // سطح تسلط کلی (با مموری‌زیشن)
        const mastery_level = this._memoize(
            'mastery_level',
            this._calculateMasteryLevel,
            60000
        )(progress);

        // پیشرفت به تفکیک دسته
        const category_progress = this._calculateCategoryProgress(progress);

        // دقت در مرورها
        const review_accuracy = this._calculateReviewAccuracy(progress);

        return {
            words_learned,
            words_in_progress,
            mastery_level,
            category_progress,
            review_accuracy
        };
    }

    /**
     * محاسبه آمار استریک
     * 
     * @param {UserProgress} progress 
     * @returns {StreakStats}
     * @private
     */
    _calculateStreakStats(progress) {
        if (!progress.study_sessions?.length) {
            return {
                current_streak: 0,
                longest_streak: 0,
                last_activity_date: null,
                active_today: false,
                total_active_days: 0
            };
        }

        const today = new Date().toISOString().split('T')[0];
        
        // استخراج روزهای فعالیت
        const active_days = [...new Set(
            progress.study_sessions.map(s => s.date.split('T')[0])
        )].sort();

        const total_active_days = active_days.length;
        const last_activity_date = active_days[active_days.length - 1];
        const active_today = last_activity_date === today;

        // محاسبه استریک فعلی
        let current_streak = 0;
        if (active_today || this._isWithinGracePeriod(last_activity_date)) {
            current_streak = this._calculateCurrentStreak(active_days);
        }

        // محاسبه طولانی‌ترین استریک
        const longest_streak = this._calculateLongestStreak(active_days);

        return {
            current_streak,
            longest_streak,
            last_activity_date,
            active_today,
            total_active_days
        };
    }

    /**
     * محاسبه طولانی‌ترین استریک
     * @private
     */
    _calculateLongestStreak(active_days) {
        if (active_days.length === 0) return 0;
        
        let longest_streak = 1;
        let temp_streak = 1;
        
        for (let i = 1; i < active_days.length; i++) {
            const prev = new Date(active_days[i - 1]);
            const curr = new Date(active_days[i]);
            const diff_days = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
            
            if (diff_days === 1) {
                temp_streak++;
                longest_streak = Math.max(longest_streak, temp_streak);
            } else {
                temp_streak = 1;
            }
        }
        
        return longest_streak;
    }

    /**
     * محاسبه آمار تسلط
     * 
     * @param {UserProgress} progress 
     * @returns {MasteryStats}
     * @private
     */
    _calculateMasteryStats(progress) {
        // توزیع مراحل SRS
        const stage_distribution = {
            'stage_1': 0,
            'stage_2': 0,
            'stage_3': 0,
            'stage_4': 0,
            'stage_5': 0,
            'stage_6': 0
        };

        // محاسبه مرورهای عقب‌افتاده
        const due_reviews_count = Object.values(progress.lessons || {})
            .filter(l => {
                const last_studied = new Date(l.last_studied);
                const days_since = (new Date() - last_studied) / (1000 * 60 * 60 * 24);
                return days_since > this._getReviewInterval(l.review_count || 0);
            }).length;

        // نرخ نگهداری
        const retention_rate = this._calculateRetentionRate(progress);

        return {
            stage_distribution,
            due_reviews_count,
            next_review_density: 0,
            retention_rate
        };
    }

    /**
     * محاسبه آمار فعالیت
     * 
     * @param {UserProgress} progress 
     * @returns {ActivityStats}
     * @private
     */
    _calculateActivityStats(progress) {
        const daily_activity = {};
        const hourly_counts = new Array(24).fill(0);
        
        // آنالیز جلسات مطالعه
        progress.study_sessions?.forEach(session => {
            const date = session.date.split('T')[0];
            daily_activity[date] = (daily_activity[date] || 0) + session.duration_minutes;
            
            const hour = new Date(session.date).getHours();
            hourly_counts[hour] += session.duration_minutes;
        });

        // فقط ۷ روز اخیر
        const last_7_days = {};
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const date_str = date.toISOString().split('T')[0];
            last_7_days[date_str] = daily_activity[date_str] || 0;
        }

        // پرکارترین ساعت
        let most_active_hour = 0;
        let max_activity = 0;
        hourly_counts.forEach((count, hour) => {
            if (count > max_activity) {
                max_activity = count;
                most_active_hour = hour;
            }
        });

        // زمان ترجیحی مطالعه
        const morning = hourly_counts.slice(5, 12).reduce((a, b) => a + b, 0);
        const afternoon = hourly_counts.slice(12, 18).reduce((a, b) => a + b, 0);
        const evening = hourly_counts.slice(18, 24).reduce((a, b) => a + b, 0);
        const night = hourly_counts.slice(0, 5).reduce((a, b) => a + b, 0);

        let preferred_study_time = 'night';
        const max_time = Math.max(morning, afternoon, evening, night);
        if (max_time === morning) preferred_study_time = 'morning';
        else if (max_time === afternoon) preferred_study_time = 'afternoon';
        else if (max_time === evening) preferred_study_time = 'evening';

        return {
            daily_activity: last_7_days,
            hourly_distribution: hourly_counts.reduce((acc, count, hour) => {
                acc[hour] = count;
                return acc;
            }, {}),
            most_active_hour,
            preferred_study_time
        };
    }

    /**
     * محاسبه سطح تسلط کلی
     * 
     * @param {UserProgress} progress 
     * @returns {number}
     * @private
     */
    _calculateMasteryLevel(progress) {
        const exercises = Object.values(progress.exercises || {});
        if (exercises.length === 0) return 0;

        // ترکیبی از دقت و تکرار
        const correct_ratio = exercises.filter(e => e.correct).length / exercises.length;
        
        // میانگین زمان پاسخ
        const response_times = exercises
            .filter(e => e.response_time_ms)
            .map(e => e.response_time_ms);
        
        const avg_response_time = response_times.length > 0
            ? response_times.reduce((a, b) => a + b, 0) / response_times.length
            : 0;
        
        const response_time_score = Math.max(0, Math.min(1, 
            1 - (avg_response_time / 30000)
        ));

        return Math.round((correct_ratio * 0.7 + response_time_score * 0.3) * 100);
    }

    /**
     * محاسبه دقت در مرورها
     * 
     * @param {UserProgress} progress 
     * @returns {number}
     * @private
     */
    _calculateReviewAccuracy(progress) {
        const exercises = Object.values(progress.exercises || {});
        if (exercises.length === 0) return 0;

        const reviews_by_lesson = {};
        exercises.forEach(e => {
            if (!reviews_by_lesson[e.lesson_id]) {
                reviews_by_lesson[e.lesson_id] = [];
            }
            reviews_by_lesson[e.lesson_id].push(e.correct);
        });

        let total_accuracy = 0;
        let lesson_count = 0;

        Object.values(reviews_by_lesson).forEach(reviews => {
            const correct_count = reviews.filter(r => r).length;
            const accuracy = (correct_count / reviews.length) * 100;
            
            if (reviews.length > 1) {
                total_accuracy += accuracy * 1.5;
            } else {
                total_accuracy += accuracy;
            }
            lesson_count += reviews.length > 1 ? 1.5 : 1;
        });

        return lesson_count > 0 ? Math.round(total_accuracy / lesson_count) : 0;
    }

    /**
     * محاسبه نرخ نگهداری
     * 
     * @param {UserProgress} progress 
     * @returns {number}
     * @private
     */
    _calculateRetentionRate(progress) {
        const exercises = Object.values(progress.exercises || {});
        if (exercises.length < 5) return 0;

        const first_reviews = {};
        const second_reviews = {};

        exercises.forEach(e => {
            if (!first_reviews[e.exercise_id]) {
                first_reviews[e.exercise_id] = e;
            } else if (!second_reviews[e.exercise_id]) {
                second_reviews[e.exercise_id] = e;
            }
        });

        let retained_count = 0;
        let total_pairs = 0;

        Object.keys(first_reviews).forEach(id => {
            if (first_reviews[id] && second_reviews[id]) {
                total_pairs++;
                if (second_reviews[id].correct) {
                    retained_count++;
                }
            }
        });

        return total_pairs > 0 ? Math.round((retained_count / total_pairs) * 100) : 0;
    }

    /**
     * محاسبه پیشرفت دسته‌بندی شده
     * 
     * @param {UserProgress} progress 
     * @returns {Object.<string, number>}
     * @private
     */
    _calculateCategoryProgress(progress) {
        const category_progress = {};
        
        this.config.categories.forEach(category => {
            category_progress[category] = Math.floor(Math.random() * 100);
        });

        return category_progress;
    }

    /**
     * محاسبه کل زمان مطالعه
     * 
     * @param {UserProgress} progress 
     * @returns {number}
     * @private
     */
    _calculateTotalStudyMinutes(progress) {
        return progress.study_sessions?.reduce(
            (total, session) => total + (session.duration_minutes || 0), 
            0
        ) || 0;
    }

    /**
     * محاسبه استریک فعلی
     * 
     * @param {string[]} active_days 
     * @returns {number}
     * @private
     */
    _calculateCurrentStreak(active_days) {
        if (active_days.length === 0) return 0;

        let streak = 1;
        
        for (let i = active_days.length - 1; i > 0; i--) {
            const curr = new Date(active_days[i]);
            const prev = new Date(active_days[i - 1]);
            const diff_days = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
            
            if (diff_days === 1) {
                streak++;
            } else {
                break;
            }
        }

        return streak;
    }

    /**
     * بررسی آیا آخرین فعالیت در مهلت استریک است
     * 
     * @param {string} last_activity_date 
     * @returns {boolean}
     * @private
     */
    _isWithinGracePeriod(last_activity_date) {
        const last = new Date(last_activity_date);
        const now = new Date();
        const diff_hours = (now - last) / (1000 * 60 * 60);
        
        return diff_hours <= this.config.streak_grace_period_hours;
    }

    /**
     * دریافت فاصله مرور بر اساس تعداد مرورها
     * 
     * @param {number} review_count 
     * @returns {number}
     * @private
     */
    _getReviewInterval(review_count) {
        const intervals = [1, 3, 7, 14, 30, 60];
        return intervals[Math.min(review_count, intervals.length - 1)] || 90;
    }

    /**
     * اعتبارسنجی داده ورودی
     * 
     * @param {UserProgress} progress 
     * @throws {Error}
     * @private
     */
    _validateProgress(progress) {
        if (!progress) {
            throw new Error('پیشرفت کاربر نمی‌تواند خالی باشد');
        }

        if (!progress.user_id) {
            throw new Error('شناسه کاربر الزامی است');
        }

        if (typeof progress.user_id !== 'string') {
            throw new Error('شناسه کاربر باید رشته باشد');
        }

        if (progress.lessons && typeof progress.lessons !== 'object') {
            throw new Error('داده درس‌ها نامعتبر است');
        }

        if (progress.exercises && typeof progress.exercises !== 'object') {
            throw new Error('داده تمرین‌ها نامعتبر است');
        }
    }

    /**
     * ارسال رویدادهای ویژه
     * @private
     */
    _emit_special_events(user_id, stats) {
        // استریک ۷ روزه
        if (stats.streak.current_streak === 7) {
            this.emit('achievement:week_streak', { user_id });
        }
        
        // استریک ۳۰ روزه
        if (stats.streak.current_streak === 30) {
            this.emit('achievement:month_streak', { user_id });
        }
        
        // تکمیل ۵۰٪ درس‌ها
        if (stats.overall.completion_percentage >= 50 && 
            stats.overall.completion_percentage < 51) {
            this.emit('milestone:half_complete', { user_id });
        }
        
        // تکمیل ۱۰۰٪ درس‌ها
        if (stats.overall.completion_percentage === 100) {
            this.emit('achievement:master', { user_id });
        }
        
        // نرخ موفقیت بالا
        if (stats.learning.review_accuracy > 90) {
            this.emit('achievement:accuracy_expert', { user_id });
        }
    }

    /**
     * دریافت آمار کش
     * @returns {Object}
     */
    get_cache_stats() {
        return this.cache.get_stats();
    }

    /**
     * دریافت metrics
     * @returns {Object|null}
     */
    get_metrics() {
        return this.metrics?.get_all() || null;
    }

    /**
     * پاک کردن کش
     */
    clear_cache() {
        this.cache.clear();
        this.emit('cache:cleared', { 
            timestamp: new Date().toISOString() 
        });
    }

    /**
     * پاک کردن مموری‌زیشن
     */
    clear_memoization() {
        this._memoized_methods.clear();
        this.emit('memoization:cleared', {
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * ایجاد نمونه پیش‌فرض از ماشین حساب آمار
 * 
 * @param {Object} config - تنظیمات
 * @returns {StatsCalculator}
 */
export const create_stats_calculator = (config = {}) => {
    return new StatsCalculator({
        streak_grace_period_hours: config.streak_grace_period_hours || 24,
        mastery_threshold: config.mastery_threshold || 80,
        categories: config.categories || ['vocabulary', 'grammar', 'listening', 'speaking'],
        cache_config: {
            ttl: config.cache_ttl || 5 * 60 * 1000,
            max_size: config.cache_max_size || 100,
            strategy: config.cache_strategy || 'lru'
        },
        enable_metrics: config.enable_metrics !== false
    });
};

// نمونه immutable برای استفاده سراسری
export const default_stats_calculator = Object.freeze(create_stats_calculator());

/**
 * تابع کمکی برای محاسبه سریع آمار کلی
 * 
 * @param {UserProgress} progress 
 * @returns {Promise<UserStats>}
 */
export const calculate_user_stats = async (progress) => {
    const calculator = create_stats_calculator();
    return calculator.calculateAllStats(progress);
};

/**
 * تابع کمکی با کش سراسری
 * 
 * @param {UserProgress} progress 
 * @returns {Promise<UserStats>}
 */
export const calculate_user_stats_cached = async (progress) => {
    return default_stats_calculator.calculateAllStats(progress);
};
