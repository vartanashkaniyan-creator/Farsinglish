/**
 * سرویس مدیریت امتیازدهی پیشرفته
 * مسئولیت: محاسبه، ثبت و بازیابی امتیازات کاربر با قابلیت‌های idempotency، anti-cheat و atomic transactions
 * 
 * اصول رعایت شده:
 * - SRP: فقط مسئولیت امتیازدهی
 * - OCP: استراتژی‌ها درون فایل اما قابل توسعه
 * - DIP: وابسته به انتزاع repository
 * - KISS: توابع کوچک و خوانا
 * - DRY: منطق مشترک در یک مکان
 * - نام‌گذاری: snake_case برای فایل‌ها، camelCase برای متغیرها
 */

import { event_bus } from '../../core/events/event_bus.js';
import { logger } from '../../core/utils/logger.js';

// ==================== ثابت‌ها و تنظیمات ====================

const CACHE_TTL = 60000; // ۱ دقیقه
const MAX_RETRY_ATTEMPTS = 3;
const IDEMPOTENCY_WINDOW = 86400000; // ۲۴ ساعت

// استراتژی‌های محاسبه امتیاز
const POINT_STRATEGIES = {
  LESSON_COMPLETE: (difficulty = 1) => 10 * difficulty,
  EXERCISE_CORRECT: (streak_count = 1) => 5 + (streak_count * 2),
  EXERCISE_WRONG: () => 1,
  STREAK_MILESTONE: (days) => days * 20,
  DAILY_LOGIN: () => 3,
  CHALLENGE_COMPLETE: (difficulty) => 15 * difficulty,
  PERFECT_LESSON: () => 25,
  QUICK_RESPONSE: (time_seconds) => time_seconds < 3 ? 5 : 0,
  LEVEL_UP_BONUS: (bonus) => bonus,
  SHARE_ACHIEVEMENT: () => 10,
  INVITE_FRIEND: () => 50
};

// سطوح امتیاز
const LEVEL_THRESHOLDS = [
  { level: 1, min_points: 0, bonus: 0, title: 'مبتدی' },
  { level: 2, min_points: 100, bonus: 50, title: 'هنرجو' },
  { level: 3, min_points: 250, bonus: 100, title: 'فعال' },
  { level: 4, min_points: 500, bonus: 200, title: 'پیشرو' },
  { level: 5, min_points: 1000, bonus: 400, title: 'حرفه‌ای' },
  { level: 6, min_points: 2000, bonus: 800, title: 'کارشناس' },
  { level: 7, min_points: 4000, bonus: 1600, title: 'استاد' }
];

// پاداش‌های زمانی
const TIME_BONUSES = {
  MORNING_BONUS: {
    type: 'hourly',
    start: 5,
    end: 8,
    multiplier: 1.5,
    description: 'صبح زود'
  },
  WEEKEND_BONUS: {
    type: 'daily',
    days: [4, 5], // پنجشنبه و جمعه
    multiplier: 1.2,
    description: 'آخر هفته'
  },
  NIGHT_OWL: {
    type: 'hourly',
    start: 22,
    end: 23,
    multiplier: 1.3,
    description: 'شب‌زنده‌دار'
  }
};

// ==================== سرویس‌های کمکی داخلی ====================

/**
 * سرویس Idempotency داخلی
 */
class IdempotencyService {
  #storage = new Map();
  #window_ms;

  constructor(window_ms = IDEMPOTENCY_WINDOW) {
    this.#window_ms = window_ms;
    this.#start_cleanup_interval();
  }

  async get_result(request_id) {
    const item = this.#storage.get(request_id);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.#window_ms) {
      this.#storage.delete(request_id);
      return null;
    }
    
    return item.result;
  }

  async save_result(request_id, result) {
    this.#storage.set(request_id, {
      result,
      timestamp: Date.now()
    });
  }

  #start_cleanup_interval() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.#storage.entries()) {
        if (now - value.timestamp > this.#window_ms) {
          this.#storage.delete(key);
        }
      }
    }, 60000); // پاکسازی هر دقیقه
  }
}

/**
 * سرویس Anti-Cheat داخلی
 */
class AntiCheatService {
  #activity_log = new Map();
  #suspicious_patterns = new Map();

  async validate_activity(user_id, activity_type, context) {
    // بررسی فعالیت غیرعادی
    if (this.#is_suspicious_activity(user_id, activity_type)) {
      throw new Error('Suspicious activity detected');
    }

    // بررسی محدودیت روزانه
    if (this.#is_daily_limit_exceeded(user_id, activity_type)) {
      throw new Error('Daily limit exceeded');
    }

    // ثبت فعالیت
    this.#log_activity(user_id, activity_type, context);
  }

  #is_suspicious_activity(user_id, activity_type) {
    const key = `${user_id}:${activity_type}`;
    const now = Date.now();
    const recent = this.#activity_log.get(key) || [];
    
    // اگر بیش از ۲۰ فعالیت در ۵ دقیقه باشد
    const recent_count = recent.filter(t => now - t < 300000).length;
    return recent_count > 20;
  }

  #is_daily_limit_exceeded(user_id, activity_type) {
    const limits = { LESSON_COMPLETE: 20, EXERCISE_CORRECT: 100 };
    if (!limits[activity_type]) return false;

    const key = `${user_id}:${activity_type}:daily`;
    const today = new Date().toDateString();
    const count = this.#suspicious_patterns.get(key)?.get(today) || 0;
    
    return count >= limits[activity_type];
  }

  #log_activity(user_id, activity_type, context) {
    const key = `${user_id}:${activity_type}`;
    const now = Date.now();
    
    if (!this.#activity_log.has(key)) {
      this.#activity_log.set(key, []);
    }
    this.#activity_log.get(key).push(now);

    // محدود کردن حجم log
    if (this.#activity_log.get(key).length > 100) {
      this.#activity_log.get(key).shift();
    }
  }
}

/**
 * سرویس صف آفلاین داخلی
 */
class OfflineQueueService {
  #queue = [];
  #storage_key = 'points_offline_queue';

  constructor() {
    this.#load_from_storage();
  }

  async enqueue(type, data) {
    const item = {
      id: `offline_${Date.now()}_${Math.random().toString(36)}`,
      type,
      data,
      timestamp: Date.now(),
      retry_count: 0
    };
    
    this.#queue.push(item);
    this.#save_to_storage();
    return item;
  }

  async get_items(type) {
    return this.#queue.filter(item => item.type === type);
  }

  async remove_item(id) {
    this.#queue = this.#queue.filter(item => item.id !== id);
    this.#save_to_storage();
  }

  async increment_retry(id) {
    const item = this.#queue.find(i => i.id === id);
    if (item) {
      item.retry_count++;
      this.#save_to_storage();
    }
  }

  async mark_as_failed(id) {
    const item = this.#queue.find(i => i.id === id);
    if (item) {
      item.failed = true;
      this.#save_to_storage();
    }
  }

  #save_to_storage() {
    try {
      localStorage.setItem(this.#storage_key, JSON.stringify(this.#queue));
    } catch (error) {
      logger.error('Failed to save offline queue', { error: error.message });
    }
  }

  #load_from_storage() {
    try {
      const saved = localStorage.getItem(this.#storage_key);
      if (saved) {
        this.#queue = JSON.parse(saved);
      }
    } catch (error) {
      logger.error('Failed to load offline queue', { error: error.message });
    }
  }
}

/**
 * سرویس Telemetry داخلی
 */
class TelemetryService {
  track_event(event_name, data) {
    // در محیط واقعی، به سرویس آنالیتیکس ارسال می‌شود
    logger.debug('Telemetry event', { event_name, ...data });
    
    // ذخیره در localStorage برای ارسال بعدی
    this.#save_to_storage(event_name, data);
  }

  track_error(error_name, data) {
    logger.error('Telemetry error', { error_name, ...data });
    this.#save_to_storage('error', { error_name, ...data, timestamp: Date.now() });
  }

  #save_to_storage(event_name, data) {
    try {
      const key = 'telemetry_events';
      const events = JSON.parse(localStorage.getItem(key) || '[]');
      events.push({ event_name, data, timestamp: Date.now() });
      
      // نگه‌داری فقط ۱۰۰ رویداد آخر
      if (events.length > 100) events.shift();
      
      localStorage.setItem(key, JSON.stringify(events));
    } catch (error) {
      // سکوت در صورت خطای ذخیره‌سازی
    }
  }
}

// ==================== ویژگی‌های پیشرفته جدید ====================

/**
 * ویژگی‌های یادگیری اجتماعی (Social Learning)
 */
class SocialLearningFeatures {
  #user_repository;

  constructor(user_repository) {
    this.#user_repository = user_repository;
  }

  /**
   * مقایسه با همسالان (هم‌سطح‌ها)
   */
  async compare_with_peers(user_id) {
    try {
      const current_user = await this.#user_repository.find_by_id(user_id);
      if (!current_user) return null;

      const all_users = await this.#user_repository.get_all_users() || [];
      const same_level_users = all_users.filter(u => u.level === current_user.level);
      
      if (same_level_users.length === 0) {
        return {
          rank_percentile: 100,
          peer_average: current_user.points,
          gap_to_next_level: this.#calculate_gap_to_next_level(current_user)
        };
      }

      const sorted_points = same_level_users.map(u => u.points).sort((a, b) => b - a);
      const user_rank = sorted_points.findIndex(p => p <= current_user.points) + 1;
      const percentile = Math.round((user_rank / same_level_users.length) * 100);
      
      const peer_average = Math.round(
        same_level_users.reduce((sum, u) => sum + u.points, 0) / same_level_users.length
      );

      return {
        rank_percentile: percentile,
        peer_average,
        gap_to_next_level: this.#calculate_gap_to_next_level(current_user),
        total_peers: same_level_users.length,
        user_rank
      };
    } catch (error) {
      logger.error('compare_with_peers failed', { user_id, error: error.message });
      return null;
    }
  }

  /**
   * ایجاد چالش گروهی
   */
  async create_group_challenge(group_id, target_points, duration_days) {
    try {
      const challenge = {
        id: `challenge_${Date.now()}`,
        group_id,
        target_points,
        duration_days,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + duration_days * 86400000).toISOString(),
        participants: [],
        progress: {}
      };

      await this.#user_repository.save_group_challenge(challenge);
      
      return challenge;
    } catch (error) {
      logger.error('create_group_challenge failed', { group_id, error: error.message });
      return null;
    }
  }

  /**
   * محاسبه امتیاز مربی‌گری
   */
  async calculate_mentor_points(mentor_id, student_id) {
    try {
      const student_progress = await this.#user_repository.get_user_progress(student_id);
      const mentor_bonus = Math.round(student_progress.improvement_rate * 10);
      
      return {
        mentor_id,
        student_id,
        bonus_points: mentor_bonus,
        reason: 'student_improvement'
      };
    } catch (error) {
      logger.error('calculate_mentor_points failed', { mentor_id, student_id, error: error.message });
      return 0;
    }
  }

  #calculate_gap_to_next_level(user) {
    const next_level = LEVEL_THRESHOLDS.find(l => l.level === user.level + 1);
    if (!next_level) return 0;
    return Math.max(0, next_level.min_points - user.points);
  }
}

/**
 * ویژگی‌های هوش هیجانی (Emotional Intelligence)
 */
class EmotionalIntelligenceFeatures {
  #user_repository;

  constructor(user_repository) {
    this.#user_repository = user_repository;
  }

  /**
   * تشخیص ناامیدی از روی الگوی فعالیت
   */
  async detect_frustration(user_id, recent_activities = null) {
    try {
      const activities = recent_activities || 
        await this.#user_repository.get_recent_activities(user_id, 20);
      
      if (!activities || activities.length < 5) return { frustrated: false };

      // بررسی پاسخ‌های متوالی اشتباه
      const last_5 = activities.slice(-5);
      const consecutive_wrong = last_5.filter(a => !a.correct).length;
      
      // بررسی زمان بین فعالیت‌ها
      const time_pattern = this.#analyze_time_pattern(activities);
      
      // بررسی کاهش سرعت پاسخگویی
      const speed_decrease = this.#check_response_speed_decrease(activities);

      const frustration_score = (
        (consecutive_wrong > 3 ? 0.4 : 0) +
        (time_pattern.hesitation ? 0.3 : 0) +
        (speed_decrease ? 0.3 : 0)
      );

      const frustrated = frustration_score > 0.6;

      if (frustrated) {
        await this.#suggest_break_or_easier_content(user_id, frustration_score);
      }

      return {
        frustrated,
        score: frustration_score,
        indicators: {
          consecutive_wrong: consecutive_wrong > 3,
          hesitation: time_pattern.hesitation,
          speed_decrease
        },
        suggestion: frustrated ? this.#get_frustration_suggestion(frustration_score) : null
      };
    } catch (error) {
      logger.error('detect_frustration failed', { user_id, error: error.message });
      return { frustrated: false };
    }
  }

  /**
   * تنظیم لحن بازخورد بر اساس حالت هیجانی
   */
  async tone_adjust_feedback(user_id, feedback_type) {
    try {
      const emotional_state = await this.detect_frustration(user_id);
      
      if (emotional_state.frustrated) {
        return {
          ...feedback_type,
          tone: 'gentle',
          encouragement: true,
          message: 'نگران نباش! ادامه بده عالیه 👏'
        };
      }

      return {
        ...feedback_type,
        tone: 'normal',
        encouragement: false
      };
    } catch (error) {
      return feedback_type;
    }
  }

  /**
   * پیشنهاد استراحت یا محتوای آسان‌تر
   */
  async #suggest_break_or_easier_content(user_id, frustration_score) {
    const suggestion = {
      user_id,
      timestamp: new Date().toISOString(),
      type: frustration_score > 0.8 ? 'break' : 'easier_content',
      duration: frustration_score > 0.8 ? 15 : null, // 15 دقیقه استراحت
      message: frustration_score > 0.8 
        ? 'به نظر میرسد خسته شده‌اید. کمی استراحت کنید.' 
        : 'می‌خواهید درس آسان‌تری را امتحان کنید؟'
    };

    await event_bus.emit('user_frustration_detected', suggestion);
    return suggestion;
  }

  #analyze_time_pattern(activities) {
    if (activities.length < 3) return { hesitation: false };
    
    const time_gaps = [];
    for (let i = 1; i < activities.length; i++) {
      const gap = new Date(activities[i].timestamp) - new Date(activities[i-1].timestamp);
      time_gaps.push(gap);
    }
    
    const avg_gap = time_gaps.reduce((a, b) => a + b, 0) / time_gaps.length;
    const recent_gap = time_gaps[time_gaps.length - 1];
    
    return {
      hesitation: recent_gap > avg_gap * 1.5,
      avg_gap,
      recent_gap
    };
  }

  #check_response_speed_decrease(activities) {
    if (activities.length < 6) return false;
    
    const first_3 = activities.slice(0, 3).map(a => a.response_time || 0);
    const last_3 = activities.slice(-3).map(a => a.response_time || 0);
    
    const first_avg = first_3.reduce((a, b) => a + b, 0) / 3;
    const last_avg = last_3.reduce((a, b) => a + b, 0) / 3;
    
    return last_avg > first_avg * 1.3; // 30% کندتر
  }

  #get_frustration_suggestion(score) {
    if (score > 0.8) {
      return 'پیشنهاد استراحت ۱۵ دقیقه‌ای';
    } else if (score > 0.6) {
      return 'پیشنهاد درس آسان‌تر یا مرور';
    }
    return null;
  }
}

/**
 * ویژگی‌های فیلترینگ مشارکتی (Collaborative Filtering)
 */
class CollaborativeFilteringFeatures {
  #user_repository;

  constructor(user_repository) {
    this.#user_repository = user_repository;
  }

  /**
   * یافتن کاربران با الگوی یادگیری مشابه
   */
  async find_similar_learners(user_id, limit = 5) {
    try {
      const current_user = await this.#user_repository.find_by_id(user_id);
      if (!current_user) return [];

      const all_users = await this.#user_repository.get_all_users() || [];
      const user_pattern = await this.#extract_learning_pattern(user_id);
      
      const similarities = await Promise.all(
        all_users
          .filter(u => u.id !== user_id)
          .map(async u => ({
            user: u,
            similarity: await this.#calculate_similarity(user_pattern, u.id)
          }))
      );

      return similarities
        .filter(s => s.similarity > 0.3)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(s => ({
          user_id: s.user.id,
          similarity: Math.round(s.similarity * 100),
          common_strengths: s.common_strengths || [],
          shared_weaknesses: s.shared_weaknesses || []
        }));
    } catch (error) {
      logger.error('find_similar_learners failed', { user_id, error: error.message });
      return [];
    }
  }

  /**
   * جمع‌آوری نکات جامعه برای یک درس
   */
  async aggregate_community_tips(lesson_id) {
    try {
      const all_users = await this.#user_repository.get_all_users() || [];
      const all_tips = [];

      for (const user of all_users) {
        const user_tips = await this.#user_repository.get_user_tips(user.id, lesson_id);
        if (user_tips && user_tips.length) {
          all_tips.push(...user_tips.map(tip => ({
            ...tip,
            user_level: user.level
          })));
        }
      }

      // رتبه‌بندی بر اساس مفید بودن
      const ranked_tips = all_tips
        .sort((a, b) => (b.helpful_count || 0) - (a.helpful_count || 0))
        .slice(0, 10);

      return {
        lesson_id,
        total_tips: all_tips.length,
        top_tips: ranked_tips,
        categories: this.#categorize_tips(ranked_tips)
      };
    } catch (error) {
      logger.error('aggregate_community_tips failed', { lesson_id, error: error.message });
      return { lesson_id, total_tips: 0, top_tips: [] };
    }
  }

  /**
   * دریافت بازخورد همتایان برای تمرین
   */
  async collect_peer_feedback(exercise_id, user_id) {
    try {
      const similar_users = await this.find_similar_learners(user_id, 3);
      const feedback = [];

      for (const similar of similar_users) {
        const user_feedback = await this.#user_repository.get_exercise_feedback(
          similar.user_id, 
          exercise_id
        );
        if (user_feedback) {
          feedback.push({
            ...user_feedback,
            from_user: similar.user_id,
            similarity: similar.similarity
          });
        }
      }

      return {
        exercise_id,
        feedback_count: feedback.length,
        feedback,
        consensus: this.#calculate_consensus(feedback)
      };
    } catch (error) {
      logger.error('collect_peer_feedback failed', { exercise_id, error: error.message });
      return { exercise_id, feedback_count: 0, feedback: [] };
    }
  }

  async #extract_learning_pattern(user_id) {
    const history = await this.#user_repository.get_points_history(user_id, 500);
    
    return {
      strengths: this.#identify_patterns(history.filter(h => h.points_earned > 0)),
      weaknesses: this.#identify_patterns(history.filter(h => h.points_earned === 0)),
      pace: this.#calculate_learning_pace(history),
      preferred_times: this.#analyze_preferred_times(history)
    };
  }

  async #calculate_similarity(pattern, other_user_id) {
    const other_pattern = await this.#extract_learning_pattern(other_user_id);
    
    let similarity = 0;
    
    // مقایسه نقاط قوت
    const common_strengths = pattern.strengths.filter(s => 
      other_pattern.strengths.includes(s)
    ).length;
    similarity += common_strengths * 0.2;
    
    // مقایسه نقاط ضعف
    const common_weaknesses = pattern.weaknesses.filter(w => 
      other_pattern.weaknesses.includes(w)
    ).length;
    similarity += common_weaknesses * 0.15;
    
    // مقایسه pace یادگیری
    const pace_diff = Math.abs(pattern.pace - other_pattern.pace);
    similarity += Math.max(0, 0.25 - pace_diff * 0.05);
    
    return Math.min(1, similarity);
  }

  #identify_patterns(history) {
    const patterns = [];
    const activity_count = {};
    
    history.forEach(h => {
      const type = h.activity_type;
      activity_count[type] = (activity_count[type] || 0) + 1;
    });
    
    Object.entries(activity_count)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([type]) => patterns.push(type));
    
    return patterns;
  }

  #calculate_learning_pace(history) {
    if (history.length < 2) return 1;
    
    const first = new Date(history[0].created_at);
    const last = new Date(history[history.length - 1].created_at);
    const days = Math.max(1, (last - first) / 86400000);
    
    return history.length / days;
  }

  #analyze_preferred_times(history) {
    const hours = history.map(h => new Date(h.created_at).getHours());
    const hour_counts = Array(24).fill(0);
    
    hours.forEach(h => hour_counts[h]++);
    
    const max_count = Math.max(...hour_counts);
    const preferred_hour = hour_counts.indexOf(max_count);
    
    return {
      preferred_hour,
      distribution: hour_counts
    };
  }

  #categorize_tips(tips) {
    const categories = {};
    
    tips.forEach(tip => {
      const cat = tip.category || 'general';
      if (!categories[cat]) {
        categories[cat] = [];
      }
      categories[cat].push(tip);
    });
    
    return categories;
  }

  #calculate_consensus(feedback) {
    if (feedback.length === 0) return null;
    
    const correct_count = feedback.filter(f => f.correct).length;
    const total = feedback.length;
    
    return {
      percentage: Math.round((correct_count / total) * 100),
      agreement: correct_count > total / 2 ? 'majority' : 'split',
      confidence: Math.abs(correct_count - total / 2) / total
    };
  }
}

/**
 * ویژگی‌های تحلیل پیش‌بینی‌کننده (Predictive Analytics)
 */
class PredictiveAnalyticsFeatures {
  #user_repository;

  constructor(user_repository) {
    this.#user_repository = user_repository;
  }

  /**
   * پیش‌بینی زمان رسیدن به سطح بعدی
   */
  async predict_next_milestone(user_id, current_points = null) {
    try {
      const user = await this.#user_repository.find_by_id(user_id);
      if (!user) return null;

      const points = current_points || user.points;
      const history = await this.#user_repository.get_points_history(user_id, 100);
      
      const daily_rate = this.#calculate_average_daily_points(history);
      const next_level = LEVEL_THRESHOLDS.find(l => l.level === user.level + 1);
      
      if (!next_level || daily_rate === 0) {
        return {
          estimated_date: null,
          confidence: 0,
          recommended_pace: 10
        };
      }

      const points_needed = next_level.min_points - points;
      const days_needed = Math.ceil(points_needed / daily_rate);
      
      // محاسبه ضریب اطمینان
      const confidence = this.#calculate_prediction_confidence(history, daily_rate);
      
      // پیشنهاد pace بهینه
      const optimal_pace = this.#calculate_optimal_pace(user, history);

      return {
        current_points: points,
        target_level: user.level + 1,
        target_points: next_level.min_points,
        points_needed,
        daily_rate: Math.round(daily_rate * 10) / 10,
        estimated_days: days_needed,
        estimated_date: new Date(Date.now() + days_needed * 86400000).toISOString().split('T')[0],
        confidence: Math.round(confidence * 100),
        recommended_pace: Math.round(optimal_pace * 10) / 10,
        motivation_message: this.#generate_motivation_message(days_needed, points_needed)
      };
    } catch (error) {
      logger.error('predict_next_milestone failed', { user_id, error: error.message });
      return null;
    }
  }

  /**
   * پیش‌بینی نرخ ماندگاری لغات
   */
  async predict_retention_rate(user_id, vocabulary_set) {
    try {
      const history = await this.#user_repository.get_review_history(user_id, vocabulary_set);
      
      const retention_predictions = vocabulary_set.map(vocab => {
        const vocab_history = history.filter(h => h.vocab_id === vocab.id);
        const predicted_rate = this.#calculate_predicted_retention(vocab_history);
        
        return {
          vocab_id: vocab.id,
          word: vocab.word,
          current_retention: this.#calculate_current_retention(vocab_history),
          predicted_retention: predicted_rate,
          next_review_recommendation: this.#recommend_next_review(vocab_history, predicted_rate)
        };
      });

      const average_retention = Math.round(
        retention_predictions.reduce((sum, v) => sum + v.predicted_retention, 0) / 
        retention_predictions.length
      );

      return {
        average_retention,
        predictions: retention_predictions,
        weak_points: retention_predictions.filter(v => v.predicted_retention < 50),
        strong_points: retention_predictions.filter(v => v.predicted_retention > 80)
      };
    } catch (error) {
      logger.error('predict_retention_rate failed', { user_id, error: error.message });
      return null;
    }
  }

  /**
   * محاسبه سرعت یادگیری (Learning Velocity)
   */
  async calculate_learning_velocity(user_id, time_period_days = 30) {
    try {
      const cutoff = new Date(Date.now() - time_period_days * 86400000);
      const history = await this.#user_repository.get_points_history(user_id, 1000);
      
      const period_history = history.filter(h => new Date(h.created_at) > cutoff);
      
      if (period_history.length < 2) {
        return {
          velocity: 0,
          acceleration: 0,
          trend: 'insufficient_data'
        };
      }

      // محاسبه سرعت (امتیاز در روز)
      const total_points = period_history.reduce((sum, h) => sum + (h.points_earned || 0), 0);
      const velocity = total_points / time_period_days;
      
      // محاسبه شتاب (تغییر سرعت)
      const mid_point = Math.floor(period_history.length / 2);
      const first_half = period_history.slice(0, mid_point);
      const second_half = period_history.slice(mid_point);
      
      const first_velocity = first_half.reduce((sum, h) => sum + (h.points_earned || 0), 0) / 
        (time_period_days / 2);
      const second_velocity = second_half.reduce((sum, h) => sum + (h.points_earned || 0), 0) / 
        (time_period_days / 2);
      
      const acceleration = second_velocity - first_velocity;
      
      // تشخیص روند
      let trend = 'stable';
      if (acceleration > 1) trend = 'accelerating';
      else if (acceleration < -1) trend = 'decelerating';

      return {
        velocity: Math.round(velocity * 10) / 10,
        acceleration: Math.round(acceleration * 10) / 10,
        trend,
        total_activities: period_history.length,
        active_days: new Set(period_history.map(h => h.created_at.split('T')[0])).size,
        consistency_score: this.#calculate_consistency_score(period_history)
      };
    } catch (error) {
      logger.error('calculate_learning_velocity failed', { user_id, error: error.message });
      return null;
    }
  }

  /**
   * محاسبه ریسک ترک یادگیری
   */
  async calculate_dropout_risk(user_id) {
    try {
      const user = await this.#user_repository.find_by_id(user_id);
      const history = await this.#user_repository.get_points_history(user_id, 200);
      const recent = history.slice(-20);
      
      if (recent.length === 0) {
        return { risk: 'high', score: 0.9, reason: 'no_activity' };
      }

      let risk_score = 0;
      const factors = [];

      // عامل ۱: کاهش تعداد فعالیت‌ها
      if (recent.length < 10) {
        risk_score += 0.2;
        factors.push('low_activity_count');
      }

      // عامل ۲: افزایش فاصله بین فعالیت‌ها
      const gaps = this.#calculate_activity_gaps(recent);
      const avg_gap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (avg_gap > 3 * 86400000) { // بیشتر از ۳ روز
        risk_score += 0.3;
        factors.push('increasing_gaps');
      }

      // عامل ۳: کاهش امتیازات
      const points_trend = this.#calculate_points_trend(recent);
      if (points_trend < -0.2) {
        risk_score += 0.25;
        factors.push('decreasing_points');
      }

      // عامل ۴: عدم پیشرفت سطح
      if (user && user.level === 1 && user.points < 50) {
        risk_score += 0.25;
        factors.push('no_level_progress');
      }

      // عامل ۵: پاسخ‌های اشتباه متوالی
      const wrong_answers = recent.filter(h => h.points_earned === 0).length;
      if (wrong_answers > recent.length * 0.7) {
        risk_score += 0.2;
        factors.push('high_failure_rate');
      }

      risk_score = Math.min(1, risk_score);

      return {
        risk: risk_score > 0.6 ? 'high' : risk_score > 0.3 ? 'medium' : 'low',
        score: Math.round(risk_score * 100),
        factors,
        recommendations: this.#generate_retention_recommendations(risk_score, factors),
        next_action: risk_score > 0.5 ? 'send_reminder' : 'monitor'
      };
    } catch (error) {
      logger.error('calculate_dropout_risk failed', { user_id, error: error.message });
      return { risk: 'unknown', score: 0.5 };
    }
  }

  #calculate_average_daily_points(history) {
    if (!history || history.length === 0) return 0;
    
    const first = new Date(history[0].created_at);
    const last = new Date(history[history.length - 1].created_at);
    const days = Math.max(1, (last - first) / 86400000);
    
    const total_points = history.reduce((sum, h) => sum + (h.points_earned || 0), 0);
    return total_points / days;
  }

  #calculate_prediction_confidence(history, daily_rate) {
    if (history.length < 10) return 0.3;
    if (history.length < 30) return 0.5;
    if (history.length < 100) return 0.7;
    
    // محاسبه انحراف معیار برای دقت بیشتر
    const points = history.map(h => h.points_earned || 0);
    const mean = points.reduce((a, b) => a + b, 0) / points.length;
    const variance = points.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / points.length;
    const std_dev = Math.sqrt(variance);
    
    const consistency = 1 - Math.min(1, std_dev / (mean || 1));
    
    return Math.min(0.95, 0.5 + (history.length / 200) + (consistency * 0.2));
  }

  #calculate_optimal_pace(user, history) {
    const current_pace = this.#calculate_average_daily_points(history);
    const user_level = user?.level || 1;
    
    // افزایش تدریجی pace متناسب با سطح
    const target_multiplier = 1 + (user_level * 0.1);
    
    return current_pace * target_multiplier;
  }

  #generate_motivation_message(days_needed, points_needed) {
    if (days_needed <= 1) {
      return 'فقط یک قدم تا سطح بعدی مونده! عالی کار میکنی ✨';
    } else if (days_needed <= 3) {
      return 'خیلی نزدیکی! با همین روند ادامه بده 💪';
    } else if (days_needed <= 7) {
      return 'یک هفته تا سطح بعدی. میتونی! 🚀';
    } else {
      return `با ${points_needed} امتیاز دیگه به سطح بعدی میرسی. ادامه بده! 🌟`;
    }
  }

  #calculate_predicted_retention(history) {
    if (!history || history.length === 0) return 50;
    
    const reviews = history.length;
    const correct_reviews = history.filter(h => h.correct).length;
    const success_rate = correct_reviews / reviews;
    
    // مدل ساده Ebbinghaus forgetting curve
    const time_factor = Math.exp(-reviews * 0.1);
    const predicted = 100 * (success_rate * (1 - time_factor) + 0.2 * time_factor);
    
    return Math.min(100, Math.max(0, Math.round(predicted)));
  }

  #calculate_current_retention(history) {
    if (!history || history.length === 0) return 0;
    
    const last_3 = history.slice(-3);
    const correct_last_3 = last_3.filter(h => h.correct).length;
    
    return Math.round((correct_last_3 / last_3.length) * 100);
  }

  #recommend_next_review(history, predicted_retention) {
    if (predicted_retention > 80) {
      return { interval: '7_days', priority: 'low' };
    } else if (predicted_retention > 60) {
      return { interval: '3_days', priority: 'medium' };
    } else if (predicted_retention > 40) {
      return { interval: '1_day', priority: 'high' };
    } else {
      return { interval: 'now', priority: 'critical' };
    }
  }

  #calculate_consistency_score(history) {
    if (history.length < 7) return 50;
    
    const dates = history.map(h => h.created_at.split('T')[0]);
    const unique_dates = new Set(dates);
    
    const coverage = (unique_dates.size / 30) * 100;
    
    return Math.min(100, Math.round(coverage));
  }

  #calculate_activity_gaps(history) {
    const gaps = [];
    for (let i = 1; i < history.length; i++) {
      const gap = new Date(history[i].created_at) - new Date(history[i-1].created_at);
      gaps.push(gap);
    }
    return gaps;
  }

  #calculate_points_trend(history) {
    if (history.length < 2) return 0;
    
    const first_half = history.slice(0, Math.floor(history.length / 2));
    const second_half = history.slice(Math.floor(history.length / 2));
    
    const first_avg = first_half.reduce((sum, h) => sum + (h.points_earned || 0), 0) / first_half.length;
    const second_avg = second_half.reduce((sum, h) => sum + (h.points_earned || 0), 0) / second_half.length;
    
    return (second_avg - first_avg) / (first_avg || 1);
  }

  #generate_retention_recommendations(risk_score, factors) {
    const recommendations = [];
    
    if (factors.includes('low_activity_count')) {
      recommendations.push('روزانه حداقل ۱۰ دقیقه تمرین کن');
    }
    if (factors.includes('increasing_gaps')) {
      recommendations.push('یادآور روزانه تنظیم کن');
    }
    if (factors.includes('decreasing_points')) {
      recommendations.push('درس‌های قبلی رو مرور کن');
    }
    if (factors.includes('no_level_progress')) {
      recommendations.push('از درس‌های ساده‌تر شروع کن');
    }
    if (factors.includes('high_failure_rate')) {
      recommendations.push('تمرین‌های مشابه رو بیشتر کار کن');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('به همین روند عالی ادامه بده!');
    }
    
    return recommendations;
  }
}

// ==================== سرویس اصلی ====================

class PointsService {
  #user_repository;
  #points_cache = new Map();
  #listeners = new Set();
  #idempotency_service;
  #anti_cheat_service;
  #offline_queue;
  #telemetry_service;
  #request_counter = new Map();
  
  // ویژگی‌های پیشرفته جدید
  #social_learning;
  #emotional_intelligence;
  #collaborative_filtering;
  #predictive_analytics;

  constructor(user_repository) {
    if (!user_repository) {
      throw new Error('user_repository is required');
    }
    
    this.#user_repository = user_repository;
    this.#idempotency_service = new IdempotencyService();
    this.#anti_cheat_service = new AntiCheatService();
    this.#offline_queue = new OfflineQueueService();
    this.#telemetry_service = new TelemetryService();
    
    // راه‌اندازی ویژگی‌های پیشرفته
    this.#social_learning = new SocialLearningFeatures(user_repository);
    this.#emotional_intelligence = new EmotionalIntelligenceFeatures(user_repository);
    this.#collaborative_filtering = new CollaborativeFilteringFeatures(user_repository);
    this.#predictive_analytics = new PredictiveAnalyticsFeatures(user_repository);
    
    this.#init_event_listeners();
    this.#init_offline_support();
  }

  /**
   * ثبت رویداد و محاسبه امتیاز (با پشتیبانی idempotency)
   */
  async award_points(user_id, activity_type, context = {}) {
    const request_id = context.request_id || this.#generate_request_id();
    const start_time = Date.now();

    try {
      this.#validate_input({ user_id, activity_type, context });

      const existing_result = await this.#idempotency_service.get_result(request_id);
      if (existing_result) {
        logger.debug('Idempotent request detected', { request_id, user_id, activity_type });
        return existing_result;
      }

      await this.#check_rate_limit(user_id, activity_type);
      await this.#anti_cheat_service.validate_activity(user_id, activity_type, context);

      const base_points = this.#calculate_points(activity_type, context);
      const time_multiplier = this.#get_time_multiplier();
      const points_earned = Math.round(base_points * time_multiplier);

      if (points_earned === 0) {
        return this.#create_empty_result();
      }

      const result = await this.#execute_points_transaction(
        user_id, 
        activity_type, 
        points_earned, 
        context,
        request_id
      );

      await this.#idempotency_service.save_result(request_id, result);

      this.#telemetry_service.track_event('points_awarded', {
        user_id,
        activity_type,
        points_earned,
        duration: Date.now() - start_time
      });

      return result;

    } catch (error) {
      return this.#handle_error(error, { user_id, activity_type, request_id });
    }
  }

  /**
   * ثبت امتیاز در حالت آفلاین
   */
  async award_points_offline(user_id, activity_type, context = {}) {
    if (navigator.onLine) {
      return this.award_points(user_id, activity_type, context);
    }

    const offline_data = {
      user_id,
      activity_type,
      context,
      timestamp: Date.now(),
      request_id: this.#generate_request_id()
    };

    await this.#offline_queue.enqueue('award_points', offline_data);
    
    logger.info('Points activity queued offline', { user_id, activity_type });
    
    return {
      queued: true,
      message: 'Activity will be synced when online',
      offline_data: offline_data
    };
  }

  /**
   * همگام‌سازی فعالیت‌های آفلاین
   */
  async sync_offline_activities() {
    const queue = await this.#offline_queue.get_items('award_points');
    
    for (const item of queue) {
      try {
        await this.award_points(
          item.data.user_id,
          item.data.activity_type,
          { ...item.data.context, request_id: item.data.request_id }
        );
        await this.#offline_queue.remove_item(item.id);
      } catch (error) {
        logger.error('Failed to sync offline activity', { 
          item_id: item.id, 
          error: error.message 
        });
        
        if (item.retry_count >= MAX_RETRY_ATTEMPTS) {
          await this.#offline_queue.mark_as_failed(item.id);
        } else {
          await this.#offline_queue.increment_retry(item.id);
        }
      }
    }
  }

  /**
   * اجرای atomic transaction
   */
  async #execute_points_transaction(user_id, activity_type, points_earned, context, request_id) {
    return await this.#user_repository.transaction(async (transaction) => {
      let user = await this.#user_repository.find_by_id(user_id, { transaction });
      if (!user) {
        user = await this.#create_user_with_defaults(user_id, { transaction });
      }

      const old_points = user.points || 0;
      const new_points = old_points + points_earned;
      
      const old_level = this.#calculate_level(old_points);
      const new_level = this.#calculate_level(new_points);
      const level_up = new_level > old_level;

      await this.#user_repository.add_points_history({
        user_id,
        activity_type,
        points_earned,
        old_points,
        new_points,
        context: JSON.stringify(context),
        request_id,
        created_at: new Date().toISOString()
      }, { transaction });

      const updated_user = await this.#user_repository.update(user_id, {
        points: new_points,
        level: new_level,
        last_activity: new Date().toISOString(),
        total_points_earned: (user.total_points_earned || 0) + points_earned,
        version: (user.version || 0) + 1
      }, { transaction });

      this.#update_cache(user_id, {
        points: new_points,
        level: new_level,
        timestamp: Date.now()
      });

      const result = {
        points_earned,
        level_up,
        old_level,
        new_level,
        total_points: new_points,
        request_id,
        time_multiplier: this.#get_time_multiplier()
      };

      transaction.afterCommit(async () => {
        await this.#emit_point_event({
          ...result,
          user_id,
          activity_type,
          old_total: old_points,
          new_total: new_points,
          timestamp: new Date().toISOString()
        });

        if (level_up) {
          await this.#handle_level_up(user_id, new_level, context);
        }
      });

      return result;
    });
  }

  /**
   * دریافت امتیاز کل کاربر
   */
  async get_user_points(user_id) {
    try {
      const cached = this.#points_cache.get(user_id);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.points;
      }

      const user = await this.#user_repository.find_by_id(user_id);
      return user?.points || 0;

    } catch (error) {
      logger.error('get_user_points failed', { user_id, error: error.message });
      return 0;
    }
  }

  /**
   * دریافت تاریخچه امتیازات
   */
  async get_points_history(user_id, limit = 50, offset = 0) {
    try {
      return await this.#user_repository.get_points_history(user_id, limit, offset);
    } catch (error) {
      logger.error('get_points_history failed', { user_id, error: error.message });
      return [];
    }
  }

  // ==================== ویژگی‌های پیشرفته عمومی ====================

  /**
   * مقایسه با همسالان (Social Learning)
   */
  async compare_with_peers(user_id) {
    return this.#social_learning.compare_with_peers(user_id);
  }

  /**
   * ایجاد چالش گروهی
   */
  async create_group_challenge(group_id, target_points, duration_days) {
    return this.#social_learning.create_group_challenge(group_id, target_points, duration_days);
  }

  /**
   * محاسبه امتیاز مربی‌گری
   */
  async calculate_mentor_points(mentor_id, student_id) {
    return this.#social_learning.calculate_mentor_points(mentor_id, student_id);
  }

  /**
   * تشخیص ناامیدی کاربر (Emotional Intelligence)
   */
  async detect_frustration(user_id, recent_activities = null) {
    return this.#emotional_intelligence.detect_frustration(user_id, recent_activities);
  }

  /**
   * تنظیم لحن بازخورد بر اساس حالت هیجانی
   */
  async tone_adjust_feedback(user_id, feedback_type) {
    return this.#emotional_intelligence.tone_adjust_feedback(user_id, feedback_type);
  }

  /**
   * یافتن کاربران با الگوی یادگیری مشابه (Collaborative Filtering)
   */
  async find_similar_learners(user_id, limit = 5) {
    return this.#collaborative_filtering.find_similar_learners(user_id, limit);
  }

  /**
   * جمع‌آوری نکات جامعه برای یک درس
   */
  async aggregate_community_tips(lesson_id) {
    return this.#collaborative_filtering.aggregate_community_tips(lesson_id);
  }

  /**
   * دریافت بازخورد همتایان برای تمرین
   */
  async collect_peer_feedback(exercise_id, user_id) {
    return this.#collaborative_filtering.collect_peer_feedback(exercise_id, user_id);
  }

  /**
   * پیش‌بینی زمان رسیدن به سطح بعدی (Predictive Analytics)
   */
  async predict_next_milestone(user_id) {
    return this.#predictive_analytics.predict_next_milestone(user_id);
  }

  /**
   * پیش‌بینی نرخ ماندگاری لغات
   */
  async predict_retention_rate(user_id, vocabulary_set) {
    return this.#predictive_analytics.predict_retention_rate(user_id, vocabulary_set);
  }

  /**
   * محاسبه سرعت یادگیری
   */
  async calculate_learning_velocity(user_id, time_period_days = 30) {
    return this.#predictive_analytics.calculate_learning_velocity(user_id, time_period_days);
  }

  /**
   * محاسبه ریسک ترک یادگیری
   */
  async calculate_dropout_risk(user_id) {
    return this.#predictive_analytics.calculate_dropout_risk(user_id);
  }

  // ==================== متدهای کمکی ====================

  /**
   * محاسبه امتیاز بر اساس نوع فعالیت
   */
  #calculate_points(activity_type, context) {
    const strategy = POINT_STRATEGIES[activity_type];
    
    if (!strategy) {
      logger.warn('Unknown activity type', { activity_type });
      return 0;
    }

    try {
      switch (activity_type) {
        case 'LESSON_COMPLETE':
          return strategy(context.difficulty || 1);
        case 'EXERCISE_CORRECT':
          return strategy(context.streak_count || 1);
        case 'STREAK_MILESTONE':
          return strategy(context.days || 1);
        case 'QUICK_RESPONSE':
          return strategy(context.response_time || 999);
        default:
          return strategy();
      }
    } catch (error) {
      logger.error('Points calculation failed', { activity_type, context, error: error.message });
      return 0;
    }
  }

  /**
   * دریافت ضریب زمانی
   */
  #get_time_multiplier() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    for (const config of Object.values(TIME_BONUSES)) {
      if (config.type === 'hourly' && hour >= config.start && hour <= config.end) {
        return config.multiplier;
      }
      if (config.type === 'daily' && config.days.includes(day)) {
        return config.multiplier;
      }
    }

    return 1.0;
  }

  /**
   * محاسبه سطح بر اساس امتیاز
   */
  #calculate_level(points) {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (points >= LEVEL_THRESHOLDS[i].min_points) {
        return LEVEL_THRESHOLDS[i].level;
      }
    }
    return 1;
  }

  /**
   * بررسی rate limiting
   */
  async #check_rate_limit(user_id, activity_type) {
    const key = `${user_id}:${activity_type}`;
    const now = Date.now();
    const window_start = now - 60000;
    
    const requests = this.#request_counter.get(key) || [];
    const recent_requests = requests.filter(t => t > window_start);
    
    if (recent_requests.length >= 10) {
      throw new Error('Rate limit exceeded');
    }
    
    recent_requests.push(now);
    this.#request_counter.set(key, recent_requests);
  }

  /**
   * مدیریت سطح‌آپ
   */
  async #handle_level_up(user_id, new_level, context) {
    const level_data = LEVEL_THRESHOLDS.find(l => l.level === new_level);
    
    if (level_data?.bonus > 0) {
      await this.award_points(user_id, 'LEVEL_UP_BONUS', {
        bonus: level_data.bonus,
        ...context,
        request_id: this.#generate_request_id('level_up')
      });
    }

    await event_bus.emit('user_level_up', {
      user_id,
      new_level,
      bonus: level_data?.bonus || 0,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * ایجاد کاربر پیش‌فرض
   */
  async #create_user_with_defaults(user_id, options = {}) {
    return await this.#user_repository.create({
      id: user_id,
      points: 0,
      level: 1,
      total_points_earned: 0,
      version: 1,
      created_at: new Date().toISOString()
    }, options);
  }

  /**
   * به‌روزرسانی کش
   */
  #update_cache(user_id, data) {
    this.#points_cache.set(user_id, {
      ...data,
      timestamp: Date.now()
    });
  }

  /**
   * تولید request_id یکتا
   */
  #generate_request_id(prefix = 'pts') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * اعتبارسنجی ورودی
   */
  #validate_input({ user_id, activity_type, context }) {
    if (!user_id || typeof user_id !== 'string') {
      throw new Error('Invalid user_id');
    }
    if (!activity_type || typeof activity_type !== 'string') {
      throw new Error('Invalid activity_type');
    }
    if (context && typeof context !== 'object') {
      throw new Error('Invalid context');
    }
  }

  /**
   * ایجاد نتیجه خالی
   */
  #create_empty_result() {
    return {
      points_earned: 0,
      level_up: false,
      total_points: null
    };
  }

  /**
   * مدیریت خطا
   */
  #handle_error(error, context) {
    logger.error('award_points failed', {
      ...context,
      error: error.message,
      stack: error.stack
    });

    this.#telemetry_service.track_error('points_service_error', {
      ...context,
      error_type: error.name
    });

    throw error;
  }

  /**
   * ارسال رویداد امتیاز
   */
  async #emit_point_event(event_data) {
    await event_bus.emit('points_awarded', event_data);

    this.#listeners.forEach(listener => {
      try {
        listener(event_data);
      } catch (error) {
        logger.error('Point listener failed', { error: error.message });
      }
    });
  }

  /**
   * راه‌اندازی event listeners
   */
  #init_event_listeners() {
    event_bus.on('lesson_completed', async (data) => {
      await this.award_points_offline(data.user_id, 'LESSON_COMPLETE', {
        difficulty: data.lesson_difficulty,
        request_id: `lesson_${data.lesson_id}_${Date.now()}`
      });
    });

    event_bus.on('exercise_answered', async (data) => {
      if (data.correct) {
        await this.award_points_offline(data.user_id, 'EXERCISE_CORRECT', {
          streak_count: data.streak_count,
          request_id: `exercise_${data.exercise_id}_${Date.now()}`
        });
      } else {
        await this.award_points_offline(data.user_id, 'EXERCISE_WRONG', {
          request_id: `exercise_wrong_${data.exercise_id}_${Date.now()}`
        });
      }
    });
  }

  /**
   * راه‌اندازی پشتیبانی آفلاین
   */
  #init_offline_support() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.sync_offline_activities();
      });
    }
  }

  /**
   * ثبت listener برای رویدادهای امتیاز
   */
  on_points_awarded(callback) {
    this.#listeners.add(callback);
    return () => this.#listeners.delete(callback);
  }

  /**
   * دریافت آمار کلی امتیازات
   */
  async get_points_statistics(user_id) {
    try {
      const user = await this.#user_repository.find_by_id(user_id);
      if (!user) return null;

      const history = await this.get_points_history(user_id, 1000);
      
      const seven_days_ago = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const recent_activities = history.filter(h => 
        new Date(h.created_at).getTime() > seven_days_ago
      );

      const daily_average = recent_activities.length / 7;

      return {
        total_points: user.points,
        level: user.level,
        next_level_points: this.#get_next_level_threshold(user.level),
        points_to_next_level: this.#get_points_to_next_level(user.points, user.level),
        daily_average: Math.round(daily_average * 10) / 10,
        total_activities: history.length,
        last_activity: user.last_activity
      };

    } catch (error) {
      logger.error('get_points_statistics failed', { user_id, error: error.message });
      return null;
    }
  }

  /**
   * دریافت آستانه سطح بعدی
   */
  #get_next_level_threshold(current_level) {
    const next_level = LEVEL_THRESHOLDS.find(l => l.level === current_level + 1);
    return next_level?.min_points || Infinity;
  }

  /**
   * محاسبه امتیاز مورد نیاز تا سطح بعدی
   */
  #get_points_to_next_level(current_points, current_level) {
    const next_threshold = this.#get_next_level_threshold(current_level);
    if (next_threshold === Infinity) return 0;
    return Math.max(0, next_threshold - current_points);
  }

  /**
   * پاکسازی کش (برای تست)
   */
  clear_cache() {
    this.#points_cache.clear();
    this.#request_counter.clear();
  }
}

// ==================== Factory functions ====================

export const create_points_service = (user_repository) => {
  return new PointsService(user_repository);
};

let points_service_instance = null;

export const get_points_service = (user_repository) => {
  if (!points_service_instance && user_repository) {
    points_service_instance = new PointsService(user_repository);
  }
  return points_service_instance;
};

export default PointsService;
