```javascript
// features/exercise/types/flashcard.js
/**
 * Flashcard Exercise - تمرین فلش کارت
 * مسئولیت: ایجاد و مدیریت فلش کارت‌های آموزشی
 * اصل SRP: فقط مسئول فلش کارت و عملیات مرتبط
 * اصل OCP: قابل توسعه برای انواع مختلف فلش کارت
 * اصل LSP: قابل جایگزینی با سایر انواع تمرین
 */

// ============ Types ============
class FlashcardSide {
    constructor(content, type = 'text', media = null) {
        this.id = `side_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.content = content;
        this.type = type; // text, image, audio, video
        this.media = media;
        this.style = {};
        this.isRevealed = false;
    }

    setStyle(style) {
        this.style = { ...this.style, ...style };
        return this;
    }

    reveal() {
        this.isRevealed = true;
        return this;
    }

    hide() {
        this.isRevealed = false;
        return this;
    }

    toJSON() {
        return {
            id: this.id,
            content: this.content,
            type: this.type,
            media: this.media,
            style: this.style,
            isRevealed: this.isRevealed
        };
    }
}

class FlashcardMetadata {
    constructor(data = {}) {
        this.difficulty = data.difficulty || 1; // 1-5
        this.mastery = data.mastery || 0; // 0-100
        this.reviewCount = data.reviewCount || 0;
        this.correctCount = data.correctCount || 0;
        this.wrongCount = data.wrongCount || 0;
        this.lastReviewed = data.lastReviewed || null;
        this.nextReview = data.nextReview || null;
        this.interval = data.interval || 1; // روز
        this.easeFactor = data.easeFactor || 2.5; // عامل سهولت SM-2
        this.tags = data.tags || [];
        this.notes = data.notes || '';
    }

    update(result, quality) {
        this.reviewCount++;
        
        if (result) {
            this.correctCount++;
        } else {
            this.wrongCount++;
        }

        this.lastReviewed = new Date().toISOString();
        this.mastery = (this.correctCount / this.reviewCount) * 100;

        // الگوریتم SM-2 برای تنظیم فاصله مرور
        if (result) {
            if (quality >= 3) {
                if (this.reviewCount === 1) {
                    this.interval = 1;
                } else if (this.reviewCount === 2) {
                    this.interval = 6;
                } else {
                    this.interval = Math.round(this.interval * this.easeFactor);
                }
                this.easeFactor = this.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
            } else {
                this.interval = 1;
                this.easeFactor = Math.max(1.3, this.easeFactor - 0.2);
            }
        } else {
            this.interval = 1;
            this.easeFactor = Math.max(1.3, this.easeFactor - 0.2);
        }

        // محاسبه تاریخ مرور بعدی
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + this.interval);
        this.nextReview = nextDate.toISOString();

        return this;
    }

    toJSON() {
        return {
            difficulty: this.difficulty,
            mastery: Math.round(this.mastery * 100) / 100,
            reviewCount: this.reviewCount,
            correctCount: this.correctCount,
            wrongCount: this.wrongCount,
            lastReviewed: this.lastReviewed,
            nextReview: this.nextReview,
            interval: this.interval,
            easeFactor: Math.round(this.easeFactor * 100) / 100,
            tags: this.tags,
            notes: this.notes
        };
    }
}

class FlashcardConfig {
    constructor(config = {}) {
        this.showBothSides = config.showBothSides ?? false;
        this.autoFlip = config.autoFlip ?? false;
        this.flipDelay = config.flipDelay ?? 3000; // میلی‌ثانیه
        this.allowShuffle = config.allowShuffle ?? true;
        this.maxReviewsPerDay = config.maxReviewsPerDay ?? 20;
        this.newCardsPerDay = config.newCardsPerDay ?? 10;
        this.learningSteps = config.learningSteps || [1, 10, 60]; // دقیقه
        this.graduatingInterval = config.graduatingInterval ?? 1; // روز
        this.easyInterval = config.easyInterval ?? 4; // روز
    }

    validate() {
        if (this.maxReviewsPerDay < 1) {
            throw new Error('حداکثر مرور روزانه باید حداقل ۱ باشد');
        }
        if (this.newCardsPerDay < 1) {
            throw new Error('کارت جدید روزانه باید حداقل ۱ باشد');
        }
        return true;
    }
}

// ============ DTOs ============
class FlashcardDTO {
    constructor(data) {
        this.id = data.id || `fc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.lessonId = data.lessonId;
        this.deckId = data.deckId;
        this.type = 'flashcard';
        this.front = data.front instanceof FlashcardSide ? data.front : new FlashcardSide(data.front);
        this.back = data.back instanceof FlashcardSide ? data.back : new FlashcardSide(data.back);
        this.metadata = new FlashcardMetadata(data.metadata);
        this.config = new FlashcardConfig(data.config);
        this.context = data.context || null;
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
    }

    setFront(content, type = 'text', media = null) {
        this.front = new FlashcardSide(content, type, media);
        return this;
    }

    setBack(content, type = 'text', media = null) {
        this.back = new FlashcardSide(content, type, media);
        return this;
    }

    addContext(context) {
        this.context = context;
        return this;
    }

    validate() {
        if (!this.front || !this.front.content) {
            throw new Error('وجه جلوی فلش کارت الزامی است');
        }
        if (!this.back || !this.back.content) {
            throw new Error('وجه پشت فلش کارت الزامی است');
        }
        this.config.validate();
        return true;
    }

    toJSON() {
        return {
            id: this.id,
            lessonId: this.lessonId,
            deckId: this.deckId,
            type: this.type,
            front: this.front.toJSON(),
            back: this.back.toJSON(),
            metadata: this.metadata.toJSON(),
            config: this.config,
            context: this.context,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

class FlashcardReviewDTO {
    constructor(data) {
        this.cardId = data.cardId;
        this.userId = data.userId;
        this.quality = data.quality; // 0-5 (SM-2 quality)
        this.responseTime = data.responseTime || 0;
        this.answeredAt = data.answeredAt || new Date().toISOString();
    }

    validate() {
        if (this.quality < 0 || this.quality > 5) {
            throw new Error('کیفیت پاسخ باید بین ۰ تا ۵ باشد');
        }
        return true;
    }
}

class FlashcardDeckDTO {
    constructor(data) {
        this.id = data.id || `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.name = data.name;
        this.description = data.description;
        this.cards = data.cards || [];
        this.metadata = {
            cardCount: this.cards.length,
            newCount: 0,
            reviewCount: 0,
            mastery: 0,
            ...data.metadata
        };
        this.config = new FlashcardConfig(data.config);
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
    }

    addCard(card) {
        this.cards.push(card);
        this.metadata.cardCount = this.cards.length;
        this.updatedAt = new Date().toISOString();
        return this;
    }

    removeCard(cardId) {
        this.cards = this.cards.filter(c => c.id !== cardId);
        this.metadata.cardCount = this.cards.length;
        this.updatedAt = new Date().toISOString();
        return this;
    }

    getDueCards(limit = 10) {
        const now = new Date();
        return this.cards
            .filter(card => !card.metadata.nextReview || new Date(card.metadata.nextReview) <= now)
            .sort((a, b) => {
                // اولویت با کارت‌های دارای مرور
                if (a.metadata.nextReview && !b.metadata.nextReview) return -1;
                if (!a.metadata.nextReview && b.metadata.nextReview) return 1;
                return 0;
            })
            .slice(0, limit);
    }

    getNewCards(limit = 5) {
        return this.cards
            .filter(card => card.metadata.reviewCount === 0)
            .slice(0, limit);
    }

    getStats() {
        const totalCards = this.cards.length;
        const reviewedCards = this.cards.filter(c => c.metadata.reviewCount > 0).length;
        const dueCards = this.getDueCards().length;
        const newCards = this.getNewCards().length;
        
        const totalMastery = this.cards.reduce((sum, card) => sum + card.metadata.mastery, 0);
        const avgMastery = totalCards > 0 ? totalMastery / totalCards : 0;

        return {
            totalCards,
            reviewedCards,
            dueCards,
            newCards,
            averageMastery: Math.round(avgMastery * 100) / 100,
            cardsByDifficulty: this._groupByDifficulty()
        };
    }

    _groupByDifficulty() {
        const groups = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        this.cards.forEach(card => {
            groups[card.metadata.difficulty]++;
        });
        return groups;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            cards: this.cards.map(c => c.toJSON()),
            metadata: this.metadata,
            config: this.config,
            stats: this.getStats(),
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

// ============ Generators ============
class FlashcardGenerator {
    constructor() {
        this.templates = new Map();
        this._registerDefaultTemplates();
    }

    /**
     * تولید فلش کارت از روی لغت
     */
    generateFromVocabulary(vocab, options = {}) {
        const template = options.template || 'standard';
        const generator = this.templates.get(template);
        
        if (!generator) {
            throw new Error(`قالب ${template} یافت نشد`);
        }
        
        return generator(vocab, options);
    }

    /**
     * تولید دسته‌ای فلش کارت
     */
    generateDeck(name, vocabList, options = {}) {
        const deck = new FlashcardDeckDTO({
            name,
            description: options.description || `فلش کارت‌های ${name}`,
            config: options.config
        });

        vocabList.forEach((vocab, index) => {
            const card = this.generateFromVocabulary(vocab, {
                ...options,
                lessonId: options.lessonId,
                deckId: deck.id,
                id: `card_${index + 1}`
            });
            deck.addCard(card);
        });

        return deck;
    }

    /**
     * ثبت قالب جدید
     */
    registerTemplate(name, generator) {
        if (typeof generator !== 'function') {
            throw new Error('Generator باید یک تابع باشد');
        }
        this.templates.set(name, generator);
    }

    // ============ Private Methods ============

    _registerDefaultTemplates() {
        // قالب استاندارد (کلمه -> معنی)
        this.templates.set('standard', (vocab, options) => {
            const card = new FlashcardDTO({
                id: options.id,
                lessonId: options.lessonId,
                deckId: options.deckId,
                metadata: {
                    difficulty: options.difficulty || 3,
                    tags: options.tags || ['vocabulary']
                },
                config: options.config
            });

            // ایجاد وجه جلوی کارت (کلمه)
            if (options.includePronunciation) {
                const frontContent = `${vocab.word}\n[${vocab.pronunciation || ''}]`;
                card.setFront(frontContent, 'text');
            } else {
                card.setFront(vocab.word, 'text');
            }

            // ایجاد وجه پشت کارت (معنی + مثال)
            let backContent = vocab.fa || vocab.translation;
            if (options.includeExample && vocab.example) {
                backContent += `\n\nمثال:\n${vocab.example}`;
            }
            if (options.includeImage && vocab.image) {
                card.setBack(backContent, 'image', vocab.image);
            } else {
                card.setBack(backContent, 'text');
            }

            // اضافه کردن context
            if (vocab.context) {
                card.addContext(vocab.context);
            }

            return card;
        });

        // قالب عکس
        this.templates.set('image', (vocab, options) => {
            const card = new FlashcardDTO({
                id: options.id,
                lessonId: options.lessonId,
                deckId: options.deckId,
                metadata: {
                    difficulty: options.difficulty || 2,
                    tags: ['image', 'visual']
                },
                config: options.config
            });

            // وجه جلوی کارت: تصویر
            card.setFront('', 'image', vocab.image || options.defaultImage);

            // وجه پشت کارت: کلمه + معنی
            const backContent = `${vocab.word}\n${vocab.fa || vocab.translation}`;
            card.setBack(backContent, 'text');

            return card;
        });

        // قالب جمله
        this.templates.set('sentence', (vocab, options) => {
            const card = new FlashcardDTO({
                id: options.id,
                lessonId: options.lessonId,
                deckId: options.deckId,
                metadata: {
                    difficulty: options.difficulty || 4,
                    tags: ['sentence', 'context']
                },
                config: options.config
            });

            // وجه جلوی کارت: جمله انگلیسی
            const sentence = vocab.example || `${vocab.word} is used in context.`;
            card.setFront(sentence, 'text');

            // وجه پشت کارت: ترجمه جمله
            const translation = vocab.translation || `معنی جمله: ${vocab.fa}`;
            card.setBack(translation, 'text');

            return card;
        });

        // قالب تلفظ
        this.templates.set('pronunciation', (vocab, options) => {
            const card = new FlashcardDTO({
                id: options.id,
                lessonId: options.lessonId,
                deckId: options.deckId,
                metadata: {
                    difficulty: options.difficulty || 3,
                    tags: ['pronunciation', 'audio']
                },
                config: options.config
            });

            // وجه جلوی کارت: کلمه
            card.setFront(vocab.word, 'text');

            // وجه پشت کارت: تلفظ صوتی
            if (options.audioUrl || vocab.audio) {
                card.setBack('برای گوش دادن کلیک کنید', 'audio', options.audioUrl || vocab.audio);
            } else {
                card.setBack(vocab.pronunciation || vocab.word, 'text');
            }

            return card;
        });
    }
}

// ============ SRS Manager ============
class FlashcardSRSManager {
    constructor(config) {
        this.config = config || new FlashcardConfig();
    }

    /**
     * پردازش نتیجه مرور با الگوریتم SM-2
     */
    processReview(card, review) {
        review.validate();
        
        const metadata = { ...card.metadata };
        const quality = review.quality;

        // به‌روزرسانی آمار
        metadata.reviewCount++;
        if (quality >= 3) {
            metadata.correctCount++;
        } else {
            metadata.wrongCount++;
        }

        // محاسبه فاصله مرور بعدی (الگوریتم SM-2)
        if (quality >= 3) {
            // پاسخ صحیح
            if (metadata.reviewCount === 1) {
                metadata.interval = 1; // روز
            } else if (metadata.reviewCount === 2) {
                metadata.interval = 6; // روز
            } else {
                metadata.interval = Math.round(metadata.interval * metadata.easeFactor);
            }
            
            // به‌روزرسانی ease factor
            metadata.easeFactor = metadata.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        } else {
            // پاسخ نادرست
            metadata.interval = 1;
            metadata.easeFactor = Math.max(1.3, metadata.easeFactor - 0.2);
        }

        // محدود کردن ease factor
        metadata.easeFactor = Math.max(1.3, Math.min(2.5, metadata.easeFactor));

        // محاسبه تاریخ مرور بعدی
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + metadata.interval);
        metadata.nextReview = nextDate.toISOString();
        metadata.lastReviewed = review.answeredAt;

        // به‌روزرسانی mastery
        metadata.mastery = (metadata.correctCount / metadata.reviewCount) * 100;

        return metadata;
    }

    /**
     * دریافت کارت‌های نیاز به مرور
     */
    getDueCards(cards, limit = 10) {
        const now = new Date();
        
        return cards
            .filter(card => {
                if (!card.metadata.nextReview) return true; // کارت جدید
                return new Date(card.metadata.nextReview) <= now;
            })
            .sort((a, b) => {
                // اولویت با کارت‌های قدیمی‌تر
                const dateA = a.metadata.nextReview ? new Date(a.metadata.nextReview) : new Date(0);
                const dateB = b.metadata.nextReview ? new Date(b.metadata.nextReview) : new Date(0);
                return dateA - dateB;
            })
            .slice(0, limit);
    }

    /**
     * دریافت کارت‌های جدید
     */
    getNewCards(cards, limit = 5) {
        return cards
            .filter(card => card.metadata.reviewCount === 0)
            .slice(0, limit);
    }

    /**
     * برنامه‌ریزی مرور روزانه
     */
    planDailyReview(cards) {
        const dueCards = this.getDueCards(cards, this.config.maxReviewsPerDay);
        const newCards = this.getNewCards(cards, this.config.newCardsPerDay);

        return {
            dueCards,
            newCards,
            totalCards: dueCards.length + newCards.length,
            dueCount: dueCards.length,
            newCount: newCards.length,
            canReview: dueCards.length + newCards.length > 0
        };
    }
}

// ============ Statistics ============
class FlashcardStatistics {
    constructor(deckId) {
        this.deckId = deckId;
        this.totalReviews = 0;
        this.correctReviews = 0;
        this.wrongReviews = 0;
        this.totalTime = 0;
        this.reviewsByDate = new Map();
        this.cardsByDifficulty = new Map();
        this.masteryHistory = [];
    }

    addReview(cardId, review, metadata) {
        this.totalReviews++;
        this.totalTime += review.responseTime;

        if (review.quality >= 3) {
            this.correctReviews++;
        } else {
            this.wrongReviews++;
        }

        // آمار روزانه
        const date = review.answeredAt.split('T')[0];
        const dailyStats = this.reviewsByDate.get(date) || { total: 0, correct: 0 };
        dailyStats.total++;
        if (review.quality >= 3) dailyStats.correct++;
        this.reviewsByDate.set(date, dailyStats);

        // آمار بر اساس سطح دشواری
        const difficulty = metadata.difficulty;
        const diffStats = this.cardsByDifficulty.get(difficulty) || { total: 0, correct: 0 };
        diffStats.total++;
        if (review.quality >= 3) diffStats.correct++;
        this.cardsByDifficulty.set(difficulty, diffStats);

        // تاریخچه mastery
        this.masteryHistory.push({
            date: review.answeredAt,
            mastery: metadata.mastery
        });
    }

    getAccuracy() {
        return this.totalReviews > 0 
            ? (this.correctReviews / this.totalReviews) * 100 
            : 0;
    }

    getAverageResponseTime() {
        return this.totalReviews > 0 
            ? this.totalTime / this.totalReviews 
            : 0;
    }

    getDailyStreak() {
        const dates = Array.from(this.reviewsByDate.keys()).sort();
        if (dates.length === 0) return 0;

        let streak = 1;
        const today = new Date().toISOString().split('T')[0];

        for (let i = dates.length - 1; i > 0; i--) {
            const current = new Date(dates[i]);
            const prev = new Date(dates[i - 1]);
            
            const diffDays = Math.floor((current - prev) / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
                streak++;
            } else if (dates[i] === today && diffDays <= 1) {
                // امروز هم مرور داشته
                continue;
            } else {
                break;
            }
        }

        return streak;
    }

    getDifficultyBreakdown() {
        const breakdown = [];
        for (const [difficulty, stats] of this.cardsByDifficulty) {
            breakdown.push({
                difficulty,
                total: stats.total,
                correct: stats.correct,
                accuracy: (stats.correct / stats.total) * 100
            });
        }
        return breakdown.sort((a, b) => a.difficulty - b.difficulty);
    }

    toJSON() {
        return {
            deckId: this.deckId,
            totalReviews: this.totalReviews,
            correctReviews: this.correctReviews,
            wrongReviews: this.wrongReviews,
            accuracy: this.getAccuracy(),
            averageResponseTime: this.getAverageResponseTime(),
            dailyStreak: this.getDailyStreak(),
            difficultyBreakdown: this.getDifficultyBreakdown(),
            masteryHistory: this.masteryHistory.slice(-30) // آخرین 30 روز
        };
    }
}

// ============ Service ============
class FlashcardService {
    constructor(repository, srsManager, stateManager) {
        this.repository = repository;
        this.srsManager = srsManager;
        this.stateManager = stateManager;
        this.decks = new Map();
    }

    /**
     * ایجاد فلش کارت جدید
     */
    async createFlashcard(cardData) {
        try {
            const card = new FlashcardDTO(cardData);
            card.validate();

            // ذخیره در ریپازیتوری
            const savedCard = await this.repository.saveCard(card);

            // به‌روزرسانی کش
            const deck = this.decks.get(card.deckId);
            if (deck) {
                deck.addCard(savedCard);
            }

            // dispatch رویداد
            await this.stateManager.dispatch('FLASHCARD_CREATED', {
                cardId: savedCard.id,
                deckId: savedCard.deckId
            });

            return savedCard;

        } catch (error) {
            console.error('خطا در ایجاد فلش کارت:', error);
            throw error;
        }
    }

    /**
     * ایجاد دسته فلش کارت
     */
    async createDeck(deckData) {
        try {
            const deck = new FlashcardDeckDTO(deckData);
            
            // ذخیره در ریپازیتوری
            const savedDeck = await this.repository.saveDeck(deck);

            // ذخیره در کش
            this.decks.set(savedDeck.id, savedDeck);

            return savedDeck;

        } catch (error) {
            console.error('خطا در ایجاد دسته:', error);
            throw error;
        }
    }

    /**
     * دریافت کارت‌های نیاز به مرور
     */
    async getDueCards(deckId, limit = 10) {
        try {
            const deck = await this.getDeck(deckId);
            if (!deck) {
                throw new Error('دسته یافت نشد');
            }

            const dueCards = this.srsManager.getDueCards(deck.cards, limit);
            
            return dueCards.map(card => ({
                ...card.toJSON(),
                front: card.front.toJSON(),
                back: card.back.toJSON()
            }));

        } catch (error) {
            console.error('خطا در دریافت کارت‌های نیاز به مرور:', error);
            throw error;
        }
    }

    /**
     * ثبت نتیجه مرور
     */
    async submitReview(cardId, reviewData) {
        try {
            const review = new FlashcardReviewDTO(reviewData);
            review.validate();

            // دریافت کارت
            const card = await this.repository.getCard(cardId);
            if (!card) {
                throw new Error('کارت یافت نشد');
            }

            // پردازش با SRS
            const updatedMetadata = this.srsManager.processReview(card, review);

            // به‌روزرسانی کارت
            card.metadata = updatedMetadata;
            card.updatedAt = new Date().toISOString();

            // ذخیره در ریپازیتوری
            await this.repository.updateCard(card);

            // به‌روزرسانی آمار
            const stats = await this.getStatistics(card.deckId);
            stats.addReview(cardId, review, updatedMetadata);

            // dispatch رویداد
            await this.stateManager.dispatch('FLASHCARD_REVIEWED', {
                cardId,
                review,
                updatedMetadata
            });

            return {
                card: card.toJSON(),
                metadata: updatedMetadata,
                nextReview: updatedMetadata.nextReview,
                stats: stats.toJSON()
            };

        } catch (error) {
            console.error('خطا در ثبت مرور:', error);
            throw error;
        }
    }

    /**
     * دریافت برنامه مرور روزانه
     */
    async getDailyPlan(deckId) {
        try {
            const deck = await this.getDeck(deckId);
            if (!deck) {
                throw new Error('دسته یافت نشد');
            }

            return this.srsManager.planDailyReview(deck.cards);

        } catch (error) {
            console.error('خطا در دریافت برنامه مرور:', error);
            throw error;
        }
    }

    /**
     * دریافت آمار دسته
     */
    async getStatistics(deckId) {
        try {
            const deck = await this.getDeck(deckId);
            if (!deck) {
                throw new Error('دسته یافت نشد');
            }

            const stats = new FlashcardStatistics(deckId);
            
            // جمع‌آوری آمار از کارت‌ها
            deck.cards.forEach(card => {
                if (card.metadata.lastReviewed) {
                    // شبیه‌سازی مرورهای قبلی
                    // در پروژه واقعی از تاریخچه مرورها استفاده شود
                }
            });

            return stats;

        } catch (error) {
            console.error('خطا در دریافت آمار:', error);
            throw error;
        }
    }

    /**
     * دریافت دسته
     */
    async getDeck(deckId) {
        // بررسی کش
        if (this.decks.has(deckId)) {
            return this.decks.get(deckId);
        }

        // دریافت از ریپازیتوری
        const deck = await this.repository.getDeck(deckId);
        if (deck) {
            this.decks.set(deckId, deck);
        }

        return deck;
    }

    /**
     * دریافت تمام دسته‌ها
     */
    async getAllDecks() {
        return await this.repository.getAllDecks();
    }

    /**
     * پاک‌سازی کش
     */
    clearCache() {
        this.decks.clear();
        console.log('کش فلش کارت‌ها پاک‌سازی شد');
    }
}

// ============ Factory ============
class FlashcardFactory {
    static createCard(data) {
        return new FlashcardDTO(data);
    }

    static createDeck(data) {
        return new FlashcardDeckDTO(data);
    }

    static createGenerator() {
        return new FlashcardGenerator();
    }

    static createSRSManager(config) {
        return new FlashcardSRSManager(config);
    }

    static createService(repository, stateManager) {
        const srsManager = this.createSRSManager();
        return new FlashcardService(repository, srsManager, stateManager);
    }

    static createStatistics(deckId) {
        return new FlashcardStatistics(deckId);
    }

    static createFromVocabulary(vocabList, options = {}) {
        const generator = this.createGenerator();
        return generator.generateDeck(
            options.deckName || 'Vocabulary Deck',
            vocabList,
            options
        );
    }
}

// ============ Export ============
export {
    FlashcardSide,
    FlashcardMetadata,
    FlashcardConfig,
    FlashcardDTO,
    FlashcardReviewDTO,
    FlashcardDeckDTO,
    FlashcardGenerator,
    FlashcardSRSManager,
    FlashcardStatistics,
    FlashcardService,
    FlashcardFactory
};
```
