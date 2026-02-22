/**
 * Orchestration و مدیریت Lesson
 *
 * اصول:
 * - SRP: فقط orchestration
 * - DIP: وابستگی به abstraction
 * - DI کامل
 */

/**
 * @typedef {Object} Lesson
 * @property {string} id
 * @property {string} title
 * @property {Array<Object>} exercises
 */

export class LessonService {
    /**
     * @param {Object} deps
     * @param {Object} deps.srs_engine
     * @param {Object} deps.exercise_registry
     * @param {Object} deps.cache
     * @param {Object} deps.event_bus
     * @param {Object} deps.user_service
     * @param {Object} deps.lesson_repository
     * @param {Object} deps.logger
     */
    constructor({
        srs_engine,
        exercise_registry,
        cache,
        event_bus,
        user_service,
        lesson_repository,
        logger
    }) {
        const dependencies = {
            srs_engine,
            exercise_registry,
            cache,
            event_bus,
            user_service,
            lesson_repository,
            logger
        };

        Object.entries(dependencies).forEach(([name, dep]) => {
            if (!dep) {
                throw new Error(`LessonService: missing dependency "${name}"`);
            }
        });

        this.srs_engine = srs_engine;
        this.exercise_registry = exercise_registry;
        this.cache = cache;
        this.event_bus = event_bus;
        this.user_service = user_service;
        this.lesson_repository = lesson_repository;
        this.logger = logger;
    }

    /**
     * شروع یک درس
     * @param {string} lesson_id
     * @returns {Promise<Lesson|null>}
     */
    async start_lesson(lesson_id) {
        this._assert_valid_lesson_id(lesson_id);

        const lesson = await this._get_lesson_by_id(lesson_id);
        if (!lesson) return null;

        await this.event_bus.emit('lesson_started', { lesson_id });
        return lesson;
    }

    /**
     * تولید تمرین‌های درس
     * @param {string} lesson_id
     * @param {string} exercise_type
     * @returns {Promise<Array<Object>>}
     */
    async generate_exercises(lesson_id, exercise_type) {
        this._assert_valid_lesson_id(lesson_id);

        const generator = this.exercise_registry.get(exercise_type);
        if (!generator) {
            this.logger.warn(`exercise generator not found: ${exercise_type}`);
            return [];
        }

        const lesson = await this._get_lesson_by_id(lesson_id);
        if (!lesson) return [];

        return generator.generate(lesson);
    }

    /**
     * اتمام درس و محاسبه مرور بعدی
     * @param {string} lesson_id
     * @param {Object} result
     * @returns {Promise<Object|null>}
     */
    async complete_lesson(lesson_id, result) {
        this._assert_valid_lesson_id(lesson_id);

        const lesson = await this._get_lesson_by_id(lesson_id);
        if (!lesson) return null;

        const review = this.srs_engine.calculate_next_review(result);
        const cache_key = this._lesson_review_cache_key(lesson_id);

        await this.cache.set(cache_key, review);
        await this.event_bus.emit('lesson_completed', { lesson_id, review });

        return review;
    }

    /* ================== Private ================== */

    /**
     * @param {string} lesson_id
     * @returns {Promise<Lesson|null>}
     */
    async _get_lesson_by_id(lesson_id) {
        const cache_key = this._lesson_cache_key(lesson_id);

        return this.cache.get_or_fetch(cache_key, () =>
            this.lesson_repository.get_by_id(lesson_id)
        );
    }

    _lesson_cache_key(lesson_id) {
        return `lesson_${lesson_id}`;
    }

    _lesson_review_cache_key(lesson_id) {
        return `lesson_${lesson_id}_review`;
    }

    _assert_valid_lesson_id(lesson_id) {
        if (!lesson_id || typeof lesson_id !== 'string') {
            throw new Error('invalid lesson_id');
        }
    }
}
