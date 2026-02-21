/**
 * @file flashcard.js
 * @description فایل اصلی Flashcard، شامل مدل‌ها، الگوریتم SRS، DTO و Validator
 *              طراحی شده بر اساس اصول X و Y و رعایت snake_case
 */

// ========================
// constants & enums
// ========================
export const SIDE_TYPE = {
    TEXT: 'text',
    IMAGE: 'image',
    AUDIO: 'audio',
    VIDEO: 'video'
};

export const SRS_CONFIG = {
    PASSING_QUALITY: 3,
    MIN_EASE_FACTOR: 1.3,
    MAX_EASE_FACTOR: 2.5,
    INITIAL_EASE_FACTOR: 2.5,
    EASE_PENALTY: 0.2
};

// ========================
// errors
// ========================
export class FlashcardError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

export class ValidationError extends FlashcardError {
    constructor(errors = []) {
        super('Validation failed', 'VALIDATION_ERROR');
        this.errors = errors;
    }
}

// ========================
// validator
// ========================
export class Validator {
    static required(value, field) {
        if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
            throw new ValidationError([`${field}_required`]);
        }
    }

    static range(value, min, max, field) {
        if (typeof value !== 'number' || value < min || value > max) {
            throw new ValidationError([`${field}_out_of_range`]);
        }
    }

    static enum(value, allowed, field) {
        if (!Object.values(allowed).includes(value)) {
            throw new ValidationError([`${field}_invalid`]);
        }
    }
}

// ========================
// models: side & metadata
// ========================
export class FlashcardSide {
    /**
     * @param {string} content - محتوای کارت
     * @param {string} type - نوع محتوا (text/image/audio/video)
     */
    constructor(content, type = SIDE_TYPE.TEXT) {
        Validator.required(content, 'content');
        Validator.enum(type, SIDE_TYPE, 'type');
        this.content = content.trim();
        this.type = type;
        this.style = {};
    }

    /**
     * @param {Object} style - استایل جدید
     * @returns {FlashcardSide} نمونه جدید با سبک به‌روز شده
     */
    set_style(style) {
        const new_side = Object.create(this);
        new_side.style = { ...this.style, ...style };
        return new_side;
    }

    /**
     * @returns {Object} representation for JSON
     */
    to_json() {
        return {
            content: this.content,
            type: this.type,
            style: this.style
        };
    }
}

export class FlashcardMetadata {
    /**
     * @param {Object} data
     * @param {number} [data.difficulty=1]
     * @param {number} [data.mastery=0]
     * @param {number} [data.review_count=0]
     * @param {number} [data.ease_factor=2.5]
     * @param {number} [data.interval=0]
     */
    constructor(data = {}) {
        this.difficulty = data.difficulty ?? 1;
        this.mastery = data.mastery ?? 0;
        this.review_count = data.review_count ?? 0;
        this.ease_factor = data.ease_factor ?? SRS_CONFIG.INITIAL_EASE_FACTOR;
        this.interval = data.interval ?? 0;
    }

    /**
     * @param {number} quality - کیفیت پاسخ (0-5)
     * @throws {ValidationError}
     */
    _update_interval(quality) {
        Validator.range(quality, 0, 5, 'quality');
        if (quality < SRS_CONFIG.PASSING_QUALITY) {
            this.interval = 1;
            this.ease_factor = Math.max(SRS_CONFIG.MIN_EASE_FACTOR, this.ease_factor - SRS_CONFIG.EASE_PENALTY);
        } else {
            this.interval = Math.ceil(this.interval * this.ease_factor);
        }
        this.review_count += 1;
    }

    /**
     * @param {number} quality
     */
    apply_review(quality) {
        this._update_interval(quality);
        return this;
    }

    to_json() {
        return {
            difficulty: this.difficulty,
            mastery: this.mastery,
            review_count: this.review_count,
            ease_factor: this.ease_factor,
            interval: this.interval
        };
    }
}

// ========================
// SRS Algorithm
// ========================
export class SRSAlgorithm {
    /**
     * @param {FlashcardMetadata} metadata
     * @param {number} quality
     * @returns {FlashcardMetadata} metadata updated
     */
    static process(metadata, quality) {
        return metadata.apply_review(quality);
    }
}

// ========================
// DTO
// ========================
export class FlashcardDTO {
    /**
     * @param {Object} data
     * @param {string} data.id
     * @param {FlashcardSide} data.front
     * @param {FlashcardSide} data.back
     * @param {FlashcardMetadata} [data.metadata]
     */
    constructor(data) {
        Validator.required(data.front, 'front');
        Validator.required(data.back, 'back');

        this.id = data.id ?? null;
        this.front = data.front instanceof FlashcardSide ? data.front : new FlashcardSide(data.front.content, data.front.type);
        this.back = data.back instanceof FlashcardSide ? data.back : new FlashcardSide(data.back.content, data.back.type);
        this.metadata = data.metadata instanceof FlashcardMetadata ? data.metadata : new FlashcardMetadata(data.metadata);
    }

    /**
     * @param {number} quality
     * @returns {FlashcardDTO} نمونه جدید با metadata به‌روز شده
     */
    review_flashcard(quality) {
        const new_metadata = SRSAlgorithm.process(this.metadata, quality);
        const new_card = Object.create(this);
        new_card.metadata = new_metadata;
        return new_card;
    }

    /**
     * @returns {Object} representation for JSON
     */
    to_json() {
        return {
            id: this.id,
            front: this.front.to_json(),
            back: this.back.to_json(),
            metadata: this.metadata.to_json()
        };
    }

    /**
     * @param {Object} json
     * @returns {FlashcardDTO}
     */
    static from_json(json) {
        return new FlashcardDTO({
            id: json.id,
            front: new FlashcardSide(json.front.content, json.front.type),
            back: new FlashcardSide(json.back.content, json.back.type),
            metadata: new FlashcardMetadata(json.metadata)
        });
    }
}

// ========================
// Export central
// ========================
export {
    FlashcardSide,
    FlashcardMetadata,
    FlashcardDTO,
    SRSAlgorithm,
    Validator,
    FlashcardError,
    ValidationError,
    SIDE_TYPE,
    SRS_CONFIG
};
