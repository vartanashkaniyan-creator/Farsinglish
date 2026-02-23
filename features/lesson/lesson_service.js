/**
 * Lesson orchestration service
 * مسئول هماهنگی بین lesson, exercises, srs, cache و events
 */

/* ======================= */
/* ======= TYPEDEFS ====== */
/* ======================= */

/**
 * @typedef {Object} Lesson
 * @property {string} id
 * @property {string} title
 * @property {Array<Exercise>} exercises
 */

/**
 * @typedef {Object} Exercise
 * @property {string} id
 * @property {string} type
 */

/**
 * @typedef {Object} LessonReviewResult
 * @property {number} interval
 * @property {number} repetitions
 * @property {number} ease_factor
 */

/* ======================= */
/* ======= CONSTANTS ===== */
/* ======================= */

export const LESSON_EVENTS = Object.freeze({
    STARTED: 'lesson_started',
    COMPLETED: 'lesson_completed',
    ERROR: 'lesson_error'
});

/* ======================= */
/* ======= SERVICE ======= */
/* ======================= */

export class LessonService {
    static DEFAULT_EXERCISE_COUNT = 5;
    static MIN_EXERCISE_COUNT = 1;
    static MAX_EXERCISE_COUNT = 20;

    /**
     * @param {Object} deps
     * @param {*} deps.srs_engine
     * @param {*} deps.exercise_registry
     * @param {*} deps.cache
     * @param {*} deps.event_bus
     * @param {*} deps.lesson_repository
     * @param {*} deps.logger
     */
    constructor(deps) {
        this.#assert_dependencies(deps);

        this._srs_engine = deps.srs_engine;
        this._exercise_registry = deps.exercise_registry;
        this._cache = deps.cache;
        this._event_bus = deps.event_bus;
        this._lesson_repository = deps.lesson_repository;
        this._logger = deps.logger;
    }

    /* ======================= */
    /* ======= PUBLIC ======== */
    /* ======================= */

    /**
     * شروع یک درس
     * @param {string} lesson_id
     * @param {AbortSignal} [signal]
     * @returns {Promise<Lesson|null>}
     */
    async start_lesson(lesson_id, signal) {
        return this.#with_valid_lesson(
            lesson_id,
            async (lesson) => {
                await this._emit_event(LESSON_EVENTS.STARTED, { lesson_id });
                return lesson;
            },
            signal
        );
    }

    /**
     * تولید تمرین
     * @param {string} lesson_id
     * @param {string} exercise_type
     * @param {number} [count]
     * @param {AbortSignal} [signal]
     * @returns {Promise<Exercise[]>}
     */
    async generate_exercises(
        lesson_id,
        exercise_type,
        count = LessonService.DEFAULT_EXERCISE_COUNT,
        signal
    ) {
        const valid_count = this.#validate_count(count);
        const generator = this._exercise_registry.get(exercise_type);

        if (!generator?.generate || typeof generator.generate !== 'function') {
            this._logger.warn('invalid exercise generator', { exercise_type });
            return [];
        }

        const result = await this.#with_valid_lesson(
            lesson_id,
            (lesson) => generator.generate(lesson, valid_count),
            signal
        );

        return result ?? [];
    }

    /**
     * تکمیل درس و ثبت نتیجه SRS
     * @param {string} lesson_id
     * @param {LessonReviewResult} review_result
     * @param {AbortSignal} [signal]
     * @returns {Promise<LessonReviewResult|null>}
     */
    async complete_lesson(lesson_id, review_result, signal) {
        if (!this.#is_valid_review_result(review_result)) {
            this._logger.warn('invalid review result', { lesson_id });
            return null;
        }

        return this.#with_valid_lesson(
            lesson_id,
            async () => {
                const next_review =
                    this._srs_engine.calculate_next_review(review_result);

                await this._cache.set(
                    this.#review_cache_key(lesson_id),
                    next_review
                );

                await this._emit_event(LESSON_EVENTS.COMPLETED, {
                    lesson_id,
                    next_review
                });

                return next_review;
            },
            signal
        );
    }

    /* ======================= */
    /* ======= PRIVATE ======= */
    /* ======================= */

    async #with_valid_lesson(lesson_id, operation, signal) {
        this.#assert_valid_lesson_id(lesson_id);

        try {
            const lesson = await this.#get_lesson_by_id(lesson_id, signal);
            if (!lesson) {
                this._logger.warn('lesson not found', { lesson_id });
                return null;
            }
            return await operation(lesson);
        } catch (error) {
            if (error.name === 'AbortError') throw error;

            this._logger.error('lesson operation failed', {
                lesson_id,
                error: error.message
            });

            await this._emit_event(LESSON_EVENTS.ERROR, {
                lesson_id,
                error: error.message
            });

            return null;
        }
    }

    async #get_lesson_by_id(lesson_id, signal) {
        return this._cache.get_or_fetch(
            this.#lesson_cache_key(lesson_id),
            () => this._lesson_repository.get_by_id(lesson_id, signal),
            { signal }
        );
    }

    async _emit_event(event_name, payload) {
        try {
            await this._event_bus.emit(event_name, payload);
        } catch (error) {
            this._logger.error('event emission failed', {
                event_name,
                error: error.message
            });
        }
    }

    #lesson_cache_key(lesson_id) {
        return `lesson_${lesson_id}`;
    }

    #review_cache_key(lesson_id) {
        return `lesson_${lesson_id}_review`;
    }

    #validate_count(count) {
        const value = Number(count);
        if (!Number.isInteger(value)) return LessonService.MIN_EXERCISE_COUNT;
        if (value < LessonService.MIN_EXERCISE_COUNT)
            return LessonService.MIN_EXERCISE_COUNT;
        if (value > LessonService.MAX_EXERCISE_COUNT)
            return LessonService.MAX_EXERCISE_COUNT;
        return value;
    }

    #assert_valid_lesson_id(lesson_id) {
        if (!lesson_id || typeof lesson_id !== 'string' || !lesson_id.trim()) {
            throw new Error('invalid lesson_id');
        }
    }

    #is_valid_review_result(result) {
        return (
            result &&
            typeof result.interval === 'number' &&
            typeof result.repetitions === 'number' &&
            typeof result.ease_factor === 'number'
        );
    }

    #assert_dependencies(deps) {
        const required = [
            'srs_engine',
            'exercise_registry',
            'cache',
            'event_bus',
            'lesson_repository',
            'logger'
        ];

        for (const key of required) {
            if (!deps[key]) {
                throw new Error(`missing dependency: ${key}`);
            }
        }
    }
}
