/**
 * @file core/events.js
 * @description Minimal Event Bus (sync, predictable, testable)
 * @version 1.0.0
 */

/**
 * @typedef {(payload:any)=>void} EventHandler
 */

class EventBus {
    constructor() {
        /** @type {Map<string, Set<EventHandler>>} */
        this._listeners = new Map();
    }

    /**
     * Register event listener
     * @param {string} event_name
     * @param {EventHandler} handler
     */
    on(event_name, handler) {
        if (typeof event_name !== 'string' || typeof handler !== 'function') {
            return;
        }

        if (!this._listeners.has(event_name)) {
            this._listeners.set(event_name, new Set());
        }

        this._listeners.get(event_name).add(handler);
    }

    /**
     * Remove event listener
     * @param {string} event_name
     * @param {EventHandler} handler
     */
    off(event_name, handler) {
        const handlers = this._listeners.get(event_name);
        if (!handlers) return;

        handlers.delete(handler);

        if (handlers.size === 0) {
            this._listeners.delete(event_name);
        }
    }

    /**
     * Emit event (sync)
     * @param {string} event_name
     * @param {any} payload
     */
    emit(event_name, payload) {
        const handlers = this._listeners.get(event_name);
        if (!handlers) return;

        // copy to prevent mutation during emit
        [...handlers].forEach(handler => {
            try {
                handler(payload);
            } catch (error) {
                // deliberately silent — logging handled by caller
            }
        });
    }

    /**
     * Clear all listeners (useful for tests)
     */
    clear() {
        this._listeners.clear();
    }
}

export const event_bus = new EventBus();
export { EventBus };
