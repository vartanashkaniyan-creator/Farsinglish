// core/utils/time_provider.js

/**
 * Time Provider for dependency injection
 * Allows controlled time in tests
 */
export class TimeProvider {
    /**
     * @returns {number} Current timestamp in milliseconds
     */
    now() {
        return Date.now();
    }

    /**
     * @returns {string} Current ISO date string
     */
    toISOString() {
        return new Date().toISOString();
    }

    /**
     * @param {string} dateStr - Date string to parse
     * @returns {Date} Parsed date
     */
    parse(dateStr) {
        return new Date(dateStr);
    }
}
