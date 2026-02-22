// features/lesson/events/lesson_events.js

/**
 * @typedef {function} lesson_event_listener
 * @template T
 * @param {T} data - داده‌ای که هنگام انتشار رویداد ارسال می‌شود
 */

/**
 * @enum {string} نام رویدادهای درس
 */
export const LESSON_EVENTS = Object.freeze({
    LOADED: 'lesson:loaded',
    STARTED: 'lesson:started',
    COMPLETED: 'lesson:completed',
    ERROR: 'lesson:error'
});

/**
 * EventBus برای مدیریت رویدادهای Lesson
 */
export class LessonEventBus {
    /**
     * @param {Console} logger - وابستگی تزریقی برای لاگ‌ها
     */
    constructor(logger = console) {
        /** @type {Object<string, lesson_event_listener[]>} */
        this.listeners = {};

        /** @type {Console} */
        this.logger = logger;

        /** حداکثر تعداد listener برای هر رویداد */
        this.max_listeners = 10;
    }

    /**
     * ثبت listener برای یک رویداد
     * @param {string} event_name
     * @param {lesson_event_listener} callback
     */
    on(event_name, callback) {
        if (!this.listeners[event_name]) this.listeners[event_name] = [];

        // جلوگیری از ثبت callback تکراری
        if (!this.listeners[event_name].includes(callback)) {
            this.listeners[event_name].push(callback);

            if (this.listeners[event_name].length > this.max_listeners) {
                this.logger.warn(
                    `max_listeners (${this.max_listeners}) exceeded for event: ${event_name}`
                );
            }
        }
    }

    /**
     * ثبت listener یک‌بار مصرف
     * @param {string} event_name
     * @param {lesson_event_listener} callback
     */
    once(event_name, callback) {
        const once_callback = (data) => {
            this.off(event_name, once_callback);
            callback(data);
        };
        this.on(event_name, once_callback);
    }

    /**
     * حذف listener از یک رویداد
     * @param {string} event_name
     * @param {lesson_event_listener} callback
     */
    off(event_name, callback) {
        if (!this.listeners[event_name]) return;

        this.listeners[event_name] = this.listeners[event_name].filter(
            (cb) => cb !== callback
        );
    }

    /**
     * انتشار رویداد با داده
     * @param {string} event_name
     * @param {any} data
     */
    emit(event_name, data) {
        if (!this.listeners[event_name]) return;

        try {
            this.listeners[event_name].forEach((cb) => cb(data));
        } catch (error) {
            this.logger.error(`error emitting event "${event_name}":`, error);
        }
    }

    /**
     * پاکسازی همه listenerها (مثلاً برای تست)
     */
    clear() {
        this.listeners = {};
    }
}
