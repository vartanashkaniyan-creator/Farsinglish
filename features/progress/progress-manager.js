```javascript
// features/progress/progress-manager.js
/**
 * Progress Manager - مدیریت پیشرفت کاربر
 * مسئولیت: ردیابی، محاسبه و ذخیره پیشرفت کاربر در یادگیری
 * اصل SRP: فقط مسئول مدیریت پیشرفت و آمار
 * اصل DIP: وابسته به Repository Interface نه پیاده‌سازی
 * اصل OCP: قابل توسعه برای انواع جدید آمار و محاسبات
 */

// ============ Types and Enums ============
const ProgressEvent = {
    LESSON_STARTED: 'lesson_started',
    LESSON_COMPLETED: 'lesson_completed',
    EXERCISE_ANSWERED: 'exercise_answered',
    EXERCISE_CORRECT: 'exercise_correct',
    EXERCISE_WRONG: 'exercise_wrong',
    STREAK_UPDATED: 'streak_updated',
    LEVEL_UP: 'level_up',
    ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',
    MASTERY_UPDATED: 'mastery_updated',
    REVIEW_COMPLETED: 'review_completed',
    DAILY_GOAL_REACHED: 'daily_goal_reached'
};

const TimeFrame = {
    TODAY: 'today',
    THIS_WEEK: 'this_week',
    THIS_MONTH: 'this_month',
    ALL_TIME: 'all_time'
};

const MasteryLevel = {
    NOT_STARTED: 0,
    LEARNING: 1,
    FAMILIAR: 2,
    PROFICIENT: 3,
    MASTERED: 4
};

// ============ DTOs ============
class ProgressData {
    constructor(data = {}) {
        this.userId = data.userId;
        this.totalXp = data.totalXp || 0;
        this.level = data.level || 1;
        this.streakDays = data.streakDays || 0;
        this.longestStreak = data.longestStreak || 0;
        this.lastActiveDate = data.lastActiveDate || null;
        this.lessonsStarted = data.lessonsStarted || 0;
        this.lessonsCompleted = data.lessonsCompleted || 0;
        this.exercisesAnswered = data.exercisesAnswered || 0;
        this.correctAnswers = data.correctAnswers || 0;
        this.wrongAnswers = data.wrongAnswers || 0;
        this.totalTimeSpent = data.totalTimeSpent || 0; // دقیقه
        this.dailyGoals = data.dailyGoals || {};
        this.masteryByCategory = data.masteryByCategory || {};
        this.achievements = data.achievements || [];
        this.lessonProgress = data.lessonProgress || [];
        this.lastUpdated = data.lastUpdated || new Date().toISOString();
    }

    get accuracy() {
        return this.exercisesAnswered > 0 
            ? (this.correctAnswers / this.exercisesAnswered) * 100 
            : 0;
    }

    get completionRate() {
        return this.lessonsStarted > 0
            ? (this.lessonsCompleted / this.lessonsStarted) * 100
            : 0;
    }

    get xpToNextLevel() {
        return this._calculateXpForLevel(this.level + 1) - this.totalXp;
    }

    _calculateXpForLevel(level) {
        return Math.floor(100 * Math.pow(1.5, level - 1));
    }
}

class LessonProgress {
    constructor(data = {}) {
        this.lessonId = data.lessonId;
        this.title = data.title;
        this.category = data.category;
        this.difficulty = data.difficulty || 1;
        this.status = data.status || 'not_started'; // not_started, in_progress, completed
        this.progress = data.progress || 0; // 0-100
        this.exercisesCompleted = data.exercisesCompleted || 0;
        this.totalExercises = data.totalExercises || 0;
        this.correctAnswers = data.correctAnswers || 0;
        this.wrongAnswers = data.wrongAnswers || 0;
        this.timeSpent = data.timeSpent || 0;
        this.mastery = data.mastery || 0;
        this.lastAccessed = data.lastAccessed || null;
        this.completedAt = data.completedAt || null;
        this.notes = data.notes || '';
    }

    updateProgress(exercisesDone, correct, wrong) {
        this.exercisesCompleted = exercisesDone;
        this.correctAnswers = correct;
        this.wrongAnswers = wrong;
        
        if (this.totalExercises > 0) {
            this.progress = (this.exercisesCompleted / this.totalExercises) * 100;
        }

        if (this.exercisesCompleted >= this.totalExercises) {
            this.status = 'completed';
            this.completedAt = new Date().toISOString();
            this.progress = 100;
        } else if (this.exercisesCompleted > 0) {
            this.status = 'in_progress';
        }

        // محاسبه mastery بر اساس درصد پاسخ‌های صحیح
        if (this.exercisesCompleted > 0) {
            this.mastery = (this.correctAnswers / this.exercisesCompleted) * 100;
        }

        this.lastAccessed = new Date().toISOString();
    }
}

class DailyGoal {
    constructor(data = {}) {
        this.id = data.id || `goal_${Date.now()}`;
        this.type = data.type || 'xp'; // xp, lessons, exercises, time
        this.target = data.target || 0;
        this.current = data.current || 0;
        this.date = data.date || new Date().toISOString().split('T')[0];
        this.completed = data.completed || false;
        this.reward = data.reward || 0;
        this.bonus = data.bonus || false;
    }

    addProgress(amount) {
        this.current += amount;
        if (this.current >= this.target && !this.completed) {
            this.completed = true;
            return true; // goal just completed
        }
        return false;
    }

    get progress() {
        return Math.min(100, (this.current / this.target) * 100);
    }

    get remaining() {
        return Math.max(0, this.target - this.current);
    }
}

class Achievement {
    constructor(data = {}) {
        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.category = data.category;
        this.rarity = data.rarity || 'common'; // common, rare, epic, legendary
        this.condition = data.condition; // تابع یا شرط
        this.progress = data.progress || 0;
        this.target = data.target || 1;
        this.unlocked = data.unlocked || false;
        this.unlockedAt = data.unlockedAt || null;
        this.icon = data.icon || '🏆';
        this.xpReward = data.xpReward || 0;
    }

    updateProgress(value) {
        this.progress = Math.min(this.target, value);
        if (this.progress >= this.target && !this.unlocked) {
            this.unlocked = true;
            this.unlockedAt = new Date().toISOString();
            return true;
        }
        return false;
    }

    get progressPercentage() {
        return (this.progress / this.target) * 100;
    }
}

// ============ XP Calculator ============
class XPCalculator {
    constructor(config = {}) {
        this.config = {
            baseXP: config.baseXP || 10,
            correctBonus: config.correctBonus || 5,
            streakMultiplier: config.streakMultiplier || 0.1,
            timeBonusThreshold: config.timeBonusThreshold || 30, // ثانیه
            timeBonusMultiplier: config.timeBonusMultiplier || 2,
            levelFormula: config.levelFormula || 'exponential', // linear, exponential, fibonacci
            ...config
        };
    }

    calculateForExercise(result, metadata = {}) {
        let xp = 0;

        // XP پایه
        xp += this.config.baseXP;

        // پاداش پاسخ صحیح
        if (result.isCorrect) {
            xp += this.config.correctBonus;
            
            // پاداش سرعت
            if (metadata.responseTime && metadata.responseTime < this.config.timeBonusThreshold * 1000) {
                xp += this.config.baseXP * this.config.timeBonusMultiplier;
            }
        }

        // ضریب Streak
        if (metadata.streakDays && metadata.streakDays > 0) {
            xp *= (1 + (metadata.streakDays * this.config.streakMultiplier));
        }

        // پاداش اولین پاسخ صحیح روز
        if (metadata.firstCorrectOfDay) {
            xp *= 1.5;
        }

        // جریمه تلاش‌های متعدد
        if (metadata.attemptNumber && metadata.attemptNumber > 1) {
            xp *= Math.max(0.5, 1 - (metadata.attemptNumber - 1) * 0.2);
        }

        return Math.round(xp);
    }

    calculateForLesson(lesson, performance) {
        let xp = lesson.difficulty * 50;

        // پاداش بر اساس دقت
        if (performance.accuracy > 80) {
            xp *= 1.5;
        } else if (performance.accuracy > 60) {
            xp *= 1.2;
        }

        // پاداش اتمام کامل
        if (performance.completedAll) {
            xp *= 1.3;
        }

        return Math.round(xp);
    }

    calculateLevel(xp) {
        switch (this.config.levelFormula) {
            case 'linear':
                return Math.floor(xp / 100) + 1;
            case 'fibonacci':
                return this._fibonacciLevel(xp);
            case 'exponential':
            default:
                return Math.floor(Math.log2(xp / 100 + 1)) + 1;
        }
    }

    calculateXpForLevel(level) {
        switch (this.config.levelFormula) {
            case 'linear':
                return (level - 1) * 100;
            case 'fibonacci':
                return this._fibonacciSum(level);
            case 'exponential':
            default:
                return Math.floor(100 * Math.pow(2, level - 1));
        }
    }

    _fibonacciLevel(xp) {
        let sum = 0;
        let a = 0, b = 1;
        let level = 1;

        while (sum <= xp) {
            sum += b;
            [a, b] = [b, a + b];
            level++;
        }

        return level - 1;
    }

    _fibonacciSum(n) {
        let sum = 0;
        let a = 0, b = 1;
        
        for (let i = 1; i < n; i++) {
            sum += b;
            [a, b] = [b, a + b];
        }
        
        return sum;
    }
}

// ============ Streak Manager ============
class StreakManager {
    constructor() {
        this.streakData = new Map();
    }

    updateStreak(userId, lastActiveDate) {
        const today = new Date().toISOString().split('T')[0];
        const lastActive = lastActiveDate ? new Date(lastActiveDate) : null;
        const current = this.streakData.get(userId) || { current: 0, longest: 0, lastDate: null };

        if (!lastActive) {
            // اولین فعالیت
            current.current = 1;
        } else {
            const lastDateStr = lastActive.toISOString().split('T')[0];
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            if (lastDateStr === yesterdayStr) {
                // فعالیت دیروز - افزایش streak
                current.current++;
            } else if (lastDateStr === today) {
                // قبلاً امروز فعالیت داشته - تغییری نمی‌کنیم
                // current保持不变
            } else {
                // وقفه افتاده - reset streak
                current.current = 1;
            }
        }

        // به‌روزرسانی طولانی‌ترین streak
        if (current.current > current.longest) {
            current.longest = current.current;
        }

        current.lastDate = today;
        this.streakData.set(userId, current);

        return {
            currentStreak: current.current,
            longestStreak: current.longest,
            isNewRecord: current.current > current.longest
        };
    }

    getStreak(userId) {
        return this.streakData.get(userId) || { current: 0, longest: 0, lastDate: null };
    }

    getStreakStatus(userId) {
        const streak = this.getStreak(userId);
        const today = new Date().toISOString().split('T')[0];
        
        if (!streak.lastDate) return 'inactive';
        if (streak.lastDate === today) return 'active';
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        return streak.lastDate === yesterdayStr ? 'at_risk' : 'broken';
    }
}

// ============ Mastery Tracker ============
class MasteryTracker {
    constructor() {
        this.masteryData = new Map();
        this.decayRate = 0.05; // کاهش mastery در روز
    }

    updateMastery(userId, category, performance) {
        const key = `${userId}:${category}`;
        let mastery = this.masteryData.get(key) || {
            level: MasteryLevel.NOT_STARTED,
            score: 0,
            totalAttempts: 0,
            correctAttempts: 0,
            lastPracticed: null,
            history: []
        };

        // به‌روزرسانی آمار
        mastery.totalAttempts++;
        if (performance.isCorrect) {
            mastery.correctAttempts++;
        }

        // محاسبه score جدید
        const accuracy = mastery.correctAttempts / mastery.totalAttempts;
        const recency = this._calculateRecency(performance.responseTime);
        const difficulty = performance.difficulty || 1;

        mastery.score = Math.min(100, 
            (accuracy * 70) + 
            (recency * 20) + 
            (difficulty * 10)
        );

        // تعیین level بر اساس score
        if (mastery.score >= 90) {
            mastery.level = MasteryLevel.MASTERED;
        } else if (mastery.score >= 75) {
            mastery.level = MasteryLevel.PROFICIENT;
        } else if (mastery.score >= 50) {
            mastery.level = MasteryLevel.FAMILIAR;
        } else if (mastery.score >= 25) {
            mastery.level = MasteryLevel.LEARNING;
        } else {
            mastery.level = MasteryLevel.NOT_STARTED;
        }

        mastery.lastPracticed = new Date().toISOString();
        mastery.history.push({
            date: mastery.lastPracticed,
            score: mastery.score,
            level: mastery.level,
            performance
        });

        // محدود کردن تاریخچه
        if (mastery.history.length > 100) {
            mastery.history = mastery.history.slice(-100);
        }

        this.masteryData.set(key, mastery);
        return mastery;
    }

    getMastery(userId, category) {
        const key = `${userId}:${category}`;
        const mastery = this.masteryData.get(key);

        if (!mastery) {
            return {
                level: MasteryLevel.NOT_STARTED,
                score: 0,
                totalAttempts: 0,
                correctAttempts: 0,
                lastPracticed: null
            };
        }

        // اعمال decay اگر مدت زیادی گذشته
        if (mastery.lastPracticed) {
            const daysSince = this._daysSince(mastery.lastPracticed);
            if (daysSince > 1) {
                mastery.score = Math.max(0, mastery.score - (daysSince * this.decayRate * 100));
                mastery.level = this._recalculateLevel(mastery.score);
            }
        }

        return mastery;
    }

    getAllMastery(userId) {
        const result = {};
        for (const [key, value] of this.masteryData) {
            if (key.startsWith(`${userId}:`)) {
                const category = key.split(':')[1];
                result[category] = this.getMastery(userId, category);
            }
        }
        return result;
    }

    _calculateRecency(responseTime) {
        // پاسخ سریعتر = recency بالاتر
        if (!responseTime) return 0.5;
        const maxTime = 30000; // 30 ثانیه
        return Math.max(0, 1 - (responseTime / maxTime));
    }

    _daysSince(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    _recalculateLevel(score) {
        if (score >= 90) return MasteryLevel.MASTERED;
        if (score >= 75) return MasteryLevel.PROFICIENT;
        if (score >= 50) return MasteryLevel.FAMILIAR;
        if (score >= 25) return MasteryLevel.LEARNING;
        return MasteryLevel.NOT_STARTED;
    }
}

// ============ Progress Manager ============
class ProgressManager {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.xpCalculator = options.xpCalculator || new XPCalculator();
        this.streakManager = options.streakManager || new StreakManager();
        this.masteryTracker = options.masteryTracker || new MasteryTracker();
        this.stateManager = options.stateManager;
        
        this.progressCache = new Map();
        this.listeners = new Map();
        this.dailyGoals = new Map();
        this.achievements = new Map();
        
        this._loadAchievements();
    }

    /**
     * ثبت پیشرفت درس
     */
    async trackLessonProgress(userId, lessonId, progress) {
        try {
            const userProgress = await this._getUserProgress(userId);
            const lessonProgress = await this._getLessonProgress(userId, lessonId);

            // به‌روزرسانی پیشرفت درس
            lessonProgress.updateProgress(
                progress.exercisesCompleted,
                progress.correctAnswers,
                progress.wrongAnswers
            );

            // ذخیره درس در لیست درس‌های کاربر
            const existingIndex = userProgress.lessonProgress.findIndex(
                lp => lp.lessonId === lessonId
            );

            if (existingIndex >= 0) {
                userProgress.lessonProgress[existingIndex] = lessonProgress;
            } else {
                userProgress.lessonProgress.push(lessonProgress);
            }

            // به‌روزرسانی آمار کلی
            if (progress.completed) {
                userProgress.lessonsCompleted++;
                this._emit(ProgressEvent.LESSON_COMPLETED, { userId, lessonId });
            }

            if (progress.exercisesCompleted > 0) {
                userProgress.exercisesAnswered += progress.exercisesCompleted;
                userProgress.correctAnswers += progress.correctAnswers;
                userProgress.wrongAnswers += progress.wrongAnswers;
                userProgress.totalTimeSpent += progress.timeSpent || 0;
            }

            userProgress.lastUpdated = new Date().toISOString();

            // ذخیره در مخزن
            await this.repository.saveProgress(userProgress);
            
            // به‌روزرسانی کش
            this.progressCache.set(userId, userProgress);

            return lessonProgress;

        } catch (error) {
            console.error('Error tracking lesson progress:', error);
            throw error;
        }
    }

    /**
     * ثبت نتیجه تمرین
     */
    async trackExerciseResult(userId, exerciseId, result, metadata = {}) {
        try {
            const userProgress = await this._getUserProgress(userId);
            const now = new Date();

            // محاسبه XP
            const xpEarned = this.xpCalculator.calculateForExercise(result, {
                ...metadata,
                streakDays: userProgress.streakDays
            });

            // به‌روزرسانی XP و level
            userProgress.totalXp += xpEarned;
            const newLevel = this.xpCalculator.calculateLevel(userProgress.totalXp);
            
            if (newLevel > userProgress.level) {
                this._emit(ProgressEvent.LEVEL_UP, {
                    userId,
                    oldLevel: userProgress.level,
                    newLevel
                });
                userProgress.level = newLevel;
            }

            // به‌روزرسانی streak
            const streakUpdate = this.streakManager.updateStreak(
                userId, 
                userProgress.lastActiveDate
            );
            
            userProgress.streakDays = streakUpdate.currentStreak;
            userProgress.longestStreak = streakUpdate.longestStreak;
            userProgress.lastActiveDate = now.toISOString();

            // به‌روزرسانی mastery برای category
            if (metadata.category) {
                const masteryUpdate = this.masteryTracker.updateMastery(
                    userId,
                    metadata.category,
                    {
                        isCorrect: result.isCorrect,
                        responseTime: metadata.responseTime,
                        difficulty: metadata.difficulty
                    }
                );

                userProgress.masteryByCategory[metadata.category] = masteryUpdate;
            }

            // به‌روزرسانی daily goals
            await this._updateDailyGoals(userId, {
                type: 'exercise',
                xp: xpEarned,
                result
            });

            // بررسی achievements
            await this._checkAchievements(userId, userProgress);

            userProgress.lastUpdated = now.toISOString();

            // ذخیره
            await this.repository.saveProgress(userProgress);
            this.progressCache.set(userId, userProgress);

            // emit رویداد
            this._emit(ProgressEvent.EXERCISE_ANSWERED, {
                userId,
                exerciseId,
                result,
                xpEarned
            });

            if (result.isCorrect) {
                this._emit(ProgressEvent.EXERCISE_CORRECT, { userId, exerciseId });
            } else {
                this._emit(ProgressEvent.EXERCISE_WRONG, { userId, exerciseId });
            }

            return {
                xpEarned,
                newLevel: userProgress.level,
                streak: userProgress.streakDays,
                mastery: metadata.category ? 
                    this.masteryTracker.getMastery(userId, metadata.category) : null
            };

        } catch (error) {
            console.error('Error tracking exercise result:', error);
            throw error;
        }
    }

    /**
     * دریافت پیشرفت کاربر
     */
    async getUserProgress(userId) {
        return this._getUserProgress(userId);
    }

    /**
     * دریافت پیشرفت درس
     */
    async getLessonProgress(userId, lessonId) {
        return this._getLessonProgress(userId, lessonId);
    }

    /**
     * دریافت آمار کلی
     */
    async getStatistics(userId, timeFrame = TimeFrame.ALL_TIME) {
        const progress = await this._getUserProgress(userId);
        
        const stats = {
            overview: {
                level: progress.level,
                totalXp: progress.totalXp,
                xpToNextLevel: progress.xpToNextLevel,
                streakDays: progress.streakDays,
                longestStreak: progress.longestStreak,
                accuracy: progress.accuracy,
                completionRate: progress.completionRate
            },
            lessons: {
                started: progress.lessonsStarted,
                completed: progress.lessonsCompleted,
                inProgress: progress.lessonProgress.filter(l => l.status === 'in_progress').length
            },
            exercises: {
                total: progress.exercisesAnswered,
                correct: progress.correctAnswers,
                wrong: progress.wrongAnswers,
                accuracy: progress.accuracy
            },
            time: {
                totalMinutes: progress.totalTimeSpent,
                averagePerDay: this._calculateAveragePerDay(progress)
            },
            mastery: this.masteryTracker.getAllMastery(userId),
            achievements: {
                total: progress.achievements.length,
                unlocked: progress.achievements.filter(a => a.unlocked).length
            }
        };

        // فیلتر بر اساس بازه زمانی
        if (timeFrame !== TimeFrame.ALL_TIME) {
            stats.recent = await this._getRecentStats(userId, timeFrame);
        }

        return stats;
    }

    /**
     * تنظیم هدف روزانه
     */
    async setDailyGoal(userId, goal) {
        const dailyGoal = new DailyGoal({
            ...goal,
            date: new Date().toISOString().split('T')[0]
        });

        const key = `${userId}:${dailyGoal.date}`;
        this.dailyGoals.set(key, dailyGoal);

        await this.repository.saveDailyGoal(userId, dailyGoal);
        
        return dailyGoal;
    }

    /**
     * دریافت هدف روزانه
     */
    async getDailyGoal(userId) {
        const today = new Date().toISOString().split('T')[0];
        const key = `${userId}:${today}`;
        
        let goal = this.dailyGoals.get(key);
        
        if (!goal) {
            goal = await this.repository.getDailyGoal(userId, today);
            if (goal) {
                this.dailyGoals.set(key, goal);
            }
        }

        return goal;
    }

    /**
     * دریافت achievements کاربر
     */
    async getUserAchievements(userId) {
        const progress = await this._getUserProgress(userId);
        return progress.achievements;
    }

    /**
     * اضافه کردن listener
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    /**
     * حذف listener
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    /**
     * پاک‌سازی کش
     */
    clearCache() {
        this.progressCache.clear();
        this.dailyGoals.clear();
    }

    // ============ Private Methods ============

    async _getUserProgress(userId) {
        // بررسی کش
        if (this.progressCache.has(userId)) {
            return this.progressCache.get(userId);
        }

        // دریافت از مخزن
        let progress = await this.repository.getProgress(userId);
        
        if (!progress) {
            progress = new ProgressData({ userId });
            await this.repository.saveProgress(progress);
        }

        this.progressCache.set(userId, progress);
        return progress;
    }

    async _getLessonProgress(userId, lessonId) {
        const userProgress = await this._getUserProgress(userId);
        
        let lessonProgress = userProgress.lessonProgress.find(
            lp => lp.lessonId === lessonId
        );

        if (!lessonProgress) {
            lessonProgress = new LessonProgress({ lessonId });
        }

        return lessonProgress;
    }

    async _updateDailyGoals(userId, activity) {
        const goal = await this.getDailyGoal(userId);
        
        if (goal) {
            let completed = false;
            
            switch (goal.type) {
                case 'xp':
                    completed = goal.addProgress(activity.xp || 0);
                    break;
                case 'exercises':
                    completed = goal.addProgress(1);
                    break;
                case 'correct':
                    if (activity.result?.isCorrect) {
                        completed = goal.addProgress(1);
                    }
                    break;
                case 'lessons':
                    if (activity.type === 'lesson_completed') {
                        completed = goal.addProgress(1);
                    }
                    break;
            }

            if (completed) {
                this._emit(ProgressEvent.DAILY_GOAL_REACHED, {
                    userId,
                    goal
                });
            }

            await this.repository.saveDailyGoal(userId, goal);
            this.dailyGoals.set(`${userId}:${goal.date}`, goal);
        }
    }

    async _checkAchievements(userId, progress) {
        const unlockedAchievements = [];

        for (const [id, achievement] of this.achievements) {
            if (!progress.achievements.some(a => a.id === id)) {
                let progressValue = 0;

                // محاسبه پیشرفت بر اساس شرط
                if (typeof achievement.condition === 'function') {
                    progressValue = achievement.condition(progress);
                } else {
                    progressValue = this._evaluateAchievementCondition(achievement.condition, progress);
                }

                if (progressValue >= achievement.target) {
                    const newAchievement = new Achievement({
                        ...achievement,
                        unlocked: true,
                        unlockedAt: new Date().toISOString(),
                        progress: achievement.target
                    });

                    progress.achievements.push(newAchievement);
                    progress.totalXp += achievement.xpReward;
                    unlockedAchievements.push(newAchievement);

                    this._emit(ProgressEvent.ACHIEVEMENT_UNLOCKED, {
                        userId,
                        achievement: newAchievement
                    });
                } else {
                    // به‌روزرسانی پیشرفت
                    const existing = progress.achievements.find(a => a.id === id);
                    if (existing) {
                        existing.progress = progressValue;
                    } else {
                        progress.achievements.push(new Achievement({
                            ...achievement,
                            progress: progressValue
                        }));
                    }
                }
            }
        }

        return unlockedAchievements;
    }

    _evaluateAchievementCondition(condition, progress) {
        // شرط‌های پیش‌فرض
        switch (condition) {
            case 'lessons_completed':
                return progress.lessonsCompleted;
            case 'exercises_correct':
                return progress.correctAnswers;
            case 'streak_days':
                return progress.streakDays;
            case 'total_xp':
                return progress.totalXp;
            case 'mastery_count':
                return Object.values(progress.masteryByCategory)
                    .filter(m => m.level >= MasteryLevel.MASTERED).length;
            default:
                return 0;
        }
    }

    _loadAchievements() {
        // بارگذاری achievements پیش‌فرض
        const defaultAchievements = [
            {
                id: 'first_lesson',
                name: 'اولین قدم',
                description: 'اولین درس خود را کامل کنید',
                category: 'lessons',
                rarity: 'common',
                condition: 'lessons_completed',
                target: 1,
                icon: '📚',
                xpReward: 50
            },
            {
                id: 'perfect_10',
                name: 'ده تایی',
                description: '۱۰ درس را کامل کنید',
                category: 'lessons',
                rarity: 'common',
                condition: 'lessons_completed',
                target: 10,
                icon: '🌟',
                xpReward: 200
            },
            {
                id: 'century',
                name: 'صد تایی',
                description: '۱۰۰ درس را کامل کنید',
                category: 'lessons',
                rarity: 'epic',
                condition: 'lessons_completed',
                target: 100,
                icon: '🏆',
                xpReward: 1000
            },
            {
                id: 'streak_7',
                name: 'هفته طلایی',
                description: '۷ روز متوالی تمرین کنید',
                category: 'streak',
                rarity: 'rare',
                condition: 'streak_days',
                target: 7,
                icon: '🔥',
                xpReward: 150
            },
            {
                id: 'streak_30',
                name: 'یک ماه عالی',
                description: '۳۰ روز متوالی تمرین کنید',
                category: 'streak',
                rarity: 'legendary',
                condition: 'streak_days',
                target: 30,
                icon: '⚡',
                xpReward: 500
            },
            {
                id: 'master_of_masters',
                name: 'استاد استادان',
                description: 'در ۵ دسته مختلف به سطح استادی برسید',
                category: 'mastery',
                rarity: 'legendary',
                condition: 'mastery_count',
                target: 5,
                icon: '👑',
                xpReward: 1000
            }
        ];

        defaultAchievements.forEach(ach => {
            this.achievements.set(ach.id, ach);
        });
    }

    _calculateAveragePerDay(progress) {
        if (!progress.lastActiveDate || !progress.createdAt) return 0;

        const start = new Date(progress.createdAt);
        const now = new Date();
        const daysDiff = Math.max(1, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));

        return progress.totalTimeSpent / daysDiff;
    }

    async _getRecentStats(userId, timeFrame) {
        const progress = await this._getUserProgress(userId);
        const now = new Date();
        let startDate;

        switch (timeFrame) {
            case TimeFrame.TODAY:
                startDate = new Date(now.setHours(0, 0, 0, 0));
                break;
            case TimeFrame.THIS_WEEK:
                startDate = new Date(now.setDate(now.getDate() - now.getDay()));
                startDate.setHours(0, 0, 0, 0);
                break;
            case TimeFrame.THIS_MONTH:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            default:
                return null;
        }

        // فیلتر تاریخچه بر اساس بازه زمانی
        const recentHistory = progress.history?.filter(h => 
            new Date(h.date) >= startDate
        ) || [];

        return {
            exercisesDone: recentHistory.length,
            correctCount: recentHistory.filter(h => h.isCorrect).length,
            totalTime: recentHistory.reduce((sum, h) => sum + (h.timeSpent || 0), 0),
            averageAccuracy: recentHistory.length > 0
                ? (recentHistory.filter(h => h.isCorrect).length / recentHistory.length) * 100
                : 0
        };
    }

    _emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${event} listener:`, error);
                }
            });
        }

        // به‌روزرسانی state manager
        if (this.stateManager) {
            this.stateManager.dispatch(`PROGRESS_${event.toUpperCase()}`, data);
        }
    }
}

// ============ Factory ============
class ProgressManagerFactory {
    static create(repository, options = {}) {
        const xpCalculator = new XPCalculator(options.xpConfig);
        const streakManager = new StreakManager();
        const masteryTracker = new MasteryTracker();

        return new ProgressManager(
            repository,
            {
                xpCalculator,
                streakManager,
                masteryTracker,
                stateManager: options.stateManager
            }
        );
    }

    static createWithCustomCalculators(repository, calculators) {
        return new ProgressManager(
            repository,
            calculators
        );
    }
}

// ============ Export ============
export {
    ProgressManager,
    ProgressManagerFactory,
    ProgressData,
    LessonProgress,
    DailyGoal,
    Achievement,
    ProgressEvent,
    TimeFrame,
    MasteryLevel,
    XPCalculator,
    StreakManager,
    MasteryTracker
};
```
