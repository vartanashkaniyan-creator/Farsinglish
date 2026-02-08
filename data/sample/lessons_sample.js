// data/sample/lessons-sample.json
/**
 * Sample Lessons Data - داده‌های نمونه برای درس‌ها و واژگان
 * مسئولیت: ارائه داده‌های اولیه برای توسعه و تست سیستم
 * اصل DRY: ساختارهای تکراری به صورت ثابت تعریف شده‌اند
 * اصل KISS: داده‌ها ساده، واضح و قابل توسعه هستند
 */

// ============ Constants ============
const VOCABULARY_CATEGORIES = {
    GENERAL: 'general',
    BUSINESS: 'business',
    ACADEMIC: 'academic',
    TRAVEL: 'travel',
    TECHNOLOGY: 'technology',
    HEALTH: 'health',
    FOOD: 'food'
};

const GRAMMAR_TOPICS = {
    TENSES: 'tenses',
    ARTICLES: 'articles',
    PREPOSITIONS: 'prepositions',
    CONDITIONALS: 'conditionals',
    PASSIVE_VOICE: 'passive_voice',
    REPORTED_SPEECH: 'reported_speech'
};

// ============ Sample Vocabulary Data ============
const SAMPLE_VOCABULARY = [
    // درس 1 - عمومی
    {
        id: 'vocab_001',
        word: 'hello',
        translation: 'سلام',
        phonetic: 'həˈloʊ',
        partOfSpeech: 'interjection',
        example: 'Hello, how are you? - سلام، حالتون چطوره؟',
        difficulty: 1,
        lessonId: 'lesson_001',
        tags: ['basic', 'greeting']
    },
    {
        id: 'vocab_002',
        word: 'goodbye',
        translation: 'خداحافظ',
        phonetic: 'ɡʊdˈbaɪ',
        partOfSpeech: 'interjection',
        example: 'Goodbye, see you tomorrow - خداحافظ، فردا می‌بینمت',
        difficulty: 1,
        lessonId: 'lesson_001',
        tags: ['basic', 'greeting']
    },
    {
        id: 'vocab_003',
        word: 'thank you',
        translation: 'متشکرم',
        phonetic: 'θæŋk juː',
        partOfSpeech: 'phrase',
        example: 'Thank you for your help - ممنون از کمک شما',
        difficulty: 1,
        lessonId: 'lesson_001',
        tags: ['basic', 'politeness']
    },
    {
        id: 'vocab_004',
        word: 'please',
        translation: 'لطفا',
        phonetic: 'pliːz',
        partOfSpeech: 'adverb',
        example: 'Please sit down - لطفا بنشینید',
        difficulty: 1,
        lessonId: 'lesson_001',
        tags: ['basic', 'politeness']
    },
    {
        id: 'vocab_005',
        word: 'excuse me',
        translation: 'ببخشید',
        phonetic: 'ɪkˈskjuːs miː',
        partOfSpeech: 'phrase',
        example: 'Excuse me, where is the bathroom? - ببخشید، دستشویی کجاست؟',
        difficulty: 1,
        lessonId: 'lesson_001',
        tags: ['basic', 'politeness']
    },

    // درس 2 - اعداد
    {
        id: 'vocab_006',
        word: 'one',
        translation: 'یک',
        phonetic: 'wʌn',
        partOfSpeech: 'numeral',
        example: 'I have one brother - من یک برادر دارم',
        difficulty: 1,
        lessonId: 'lesson_002',
        tags: ['numbers', 'basic']
    },
    {
        id: 'vocab_007',
        word: 'two',
        translation: 'دو',
        phonetic: 'tuː',
        partOfSpeech: 'numeral',
        example: 'Two apples, please - دو تا سیب، لطفا',
        difficulty: 1,
        lessonId: 'lesson_002',
        tags: ['numbers', 'basic']
    },
    {
        id: 'vocab_008',
        word: 'three',
        translation: 'سه',
        phonetic: 'θriː',
        partOfSpeech: 'numeral',
        example: 'The meeting is at three o\'clock - جلسه ساعت سه است',
        difficulty: 1,
        lessonId: 'lesson_002',
        tags: ['numbers', 'basic']
    },

    // درس 3 - خانواده
    {
        id: 'vocab_009',
        word: 'family',
        translation: 'خانواده',
        phonetic: 'ˈfæməli',
        partOfSpeech: 'noun',
        example: 'My family is very important to me - خانواده برای من خیلی مهم است',
        difficulty: 2,
        lessonId: 'lesson_003',
        tags: ['family', 'relationships']
    },
    {
        id: 'vocab_010',
        word: 'mother',
        translation: 'مادر',
        phonetic: 'ˈmʌðər',
        partOfSpeech: 'noun',
        example: 'My mother is a teacher - مادر من معلم است',
        difficulty: 2,
        lessonId: 'lesson_003',
        tags: ['family', 'relationships']
    }
];

// ============ Sample Grammar Points ============
const SAMPLE_GRAMMAR_POINTS = [
    {
        id: 'grammar_001',
        title: 'Present Simple',
        rule: 'برای بیان عادات، حقایق کلی و برنامه‌های ثابت استفاده می‌شود',
        structure: 'Subject + base verb (+s/es for third person singular)',
        example: 'I work every day. She works in an office.',
        difficulty: 2,
        lessonId: 'lesson_004'
    },
    {
        id: 'grammar_002',
        title: 'Articles (a/an/the)',
        rule: 'a/an برای اسامی قابل شمارش مفرد ناشناس، the برای اسامی شناخته شده',
        structure: 'a + consonant sound, an + vowel sound, the + specific noun',
        example: 'I saw a cat. The cat was black. An apple a day keeps the doctor away.',
        difficulty: 3,
        lessonId: 'lesson_004'
    }
];

// ============ Sample Exercises ============
const SAMPLE_EXERCISES = {
    FLASHCARD: [
        {
            id: 'exercise_001',
            type: 'flashcard',
            question: 'hello',
            correctAnswer: 'سلام',
            options: ['خداحافظ', 'متشکرم', 'سلام', 'لطفا'],
            hint: 'greeting',
            difficulty: 1
        }
    ],
    MULTIPLE_CHOICE: [
        {
            id: 'exercise_002',
            type: 'multiple_choice',
            question: 'Choose the correct meaning of "goodbye"',
            correctAnswer: 'خداحافظ',
            options: ['سلام', 'خداحافظ', 'متشکرم', 'ببخشید'],
            difficulty: 1
        }
    ],
    MATCHING: [
        {
            id: 'exercise_003',
            type: 'matching',
            pairs: [
                { english: 'hello', persian: 'سلام' },
                { english: 'thank you', persian: 'متشکرم' },
                { english: 'please', persian: 'لطفا' }
            ],
            difficulty: 1
        }
    ]
};

// ============ Sample Lessons ============
const LESSONS_SAMPLE = [
    {
        id: 'lesson_001',
        title: 'سلام و احوالپرسی',
        description: 'یادگیری عبارات پایه برای سلام و احوالپرسی در انگلیسی',
        type: 'vocabulary',
        category: VOCABULARY_CATEGORIES.GENERAL,
        tags: ['beginner', 'greetings', 'basic'],
        difficulty: 1,
        order: 1,
        
        content: {
            text: 'در این درس با عبارات پایه سلام و احوالپرسی آشنا می‌شوید...',
            vocabulary: SAMPLE_VOCABULARY.filter(v => v.lessonId === 'lesson_001'),
            exercises: SAMPLE_EXERCISES.FLASHCARD.concat(SAMPLE_EXERCISES.MULTIPLE_CHOICE),
            
            // تصاویر و صوت
            images: [
                { url: 'https://example.com/greeting.jpg', alt: 'People greeting each other' }
            ],
            audioUrl: 'https://example.com/audio/lesson1.mp3'
        },
        
        prerequisites: [],
        requiredScore: 0,
        
        rewards: {
            xpReward: 100,
            coinReward: 10,
            unlockables: ['badge_greeting_master']
        },
        
        estimatedDuration: 15, // دقیقه
        maxAttempts: 3,
        
        status: 'unlocked',
        isActive: true,
        isFree: true,
        isPremium: false,
        
        stats: {
            totalAttempts: 0,
            averageScore: 0,
            completionRate: 0,
            averageTimeSpent: 0
        },
        
        srsData: {
            easeFactor: 2.5,
            interval: 1,
            nextReview: null,
            reviewCount: 0,
            lastReviewed: null,
            streak: 0
        },
        
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        publishedAt: '2024-01-01T00:00:00.000Z'
    },
    
    {
        id: 'lesson_002',
        title: 'اعداد ۱ تا ۱۰',
        description: 'یادگیری اعداد انگلیسی از یک تا ده',
        type: 'vocabulary',
        category: VOCABULARY_CATEGORIES.GENERAL,
        tags: ['beginner', 'numbers', 'counting'],
        difficulty: 1,
        order: 2,
        
        content: {
            text: 'در این درس اعداد انگلیسی از یک تا ده را یاد می‌گیرید...',
            vocabulary: SAMPLE_VOCABULARY.filter(v => v.lessonId === 'lesson_002'),
            exercises: [
                {
                    type: 'matching',
                    pairs: [
                        { english: 'one', persian: 'یک' },
                        { english: 'two', persian: 'دو' },
                        { english: 'three', persian: 'سه' }
                    ]
                }
            ]
        },
        
        prerequisites: ['lesson_001'],
        requiredScore: 70,
        
        rewards: {
            xpReward: 120,
            coinReward: 15,
            unlockables: ['badge_number_beginner']
        },
        
        estimatedDuration: 20,
        maxAttempts: 3,
        
        status: 'locked',
        isActive: true,
        isFree: true,
        isPremium: false,
        
        stats: {
            totalAttempts: 0,
            averageScore: 0,
            completionRate: 0,
            averageTimeSpent: 0
        },
        
        srsData: {
            easeFactor: 2.5,
            interval: 1,
            nextReview: null,
            reviewCount: 0,
            lastReviewed: null,
            streak: 0
        },
        
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        publishedAt: '2024-01-01T00:00:00.000Z'
    },
    
    {
        id: 'lesson_003',
        title: 'اعضای خانواده',
        description: 'یادگیری لغات مربوط به اعضای خانواده',
        type: 'vocabulary',
        category: VOCABULARY_CATEGORIES.GENERAL,
        tags: ['beginner', 'family', 'relationships'],
        difficulty: 2,
        order: 3,
        
        content: {
            text: 'در این درس با لغات مربوط به اعضای خانواده آشنا می‌شوید...',
            vocabulary: SAMPLE_VOCABULARY.filter(v => v.lessonId === 'lesson_003'),
            exercises: [
                {
                    type: 'multiple_choice',
                    question: 'What is the meaning of "family"?',
                    options: ['دوست', 'همکار', 'خانواده', 'همسایه'],
                    correctAnswer: 'خانواده',
                    difficulty: 2
                }
            ],
            
            images: [
                { url: 'https://example.com/family.jpg', alt: 'Family photo' }
            ]
        },
        
        prerequisites: ['lesson_001', 'lesson_002'],
        requiredScore: 70,
        
        rewards: {
            xpReward: 150,
            coinReward: 20,
            unlockables: ['badge_family_expert']
        },
        
        estimatedDuration: 25,
        maxAttempts: 3,
        
        status: 'locked',
        isActive: true,
        isFree: true,
        isPremium: false,
        
        stats: {
            totalAttempts: 0,
            averageScore: 0,
            completionRate: 0,
            averageTimeSpent: 0
        },
        
        srsData: {
            easeFactor: 2.5,
            interval: 1,
            nextReview: null,
            reviewCount: 0,
            lastReviewed: null,
            streak: 0
        },
        
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        publishedAt: '2024-01-01T00:00:00.000Z'
    },
    
    {
        id: 'lesson_004',
        title: 'زمان حال ساده',
        description: 'آموزش زمان حال ساده در گرامر انگلیسی',
        type: 'grammar',
        category: VOCABULARY_CATEGORIES.GENERAL,
        tags: ['grammar', 'tenses', 'beginner'],
        difficulty: 2,
        order: 4,
        
        content: {
            text: 'زمان حال ساده برای بیان عادات و حقایق کلی استفاده می‌شود...',
            grammarPoints: SAMPLE_GRAMMAR_POINTS,
            exercises: [
                {
                    type: 'fill_blank',
                    sentence: 'She ___ (work) in a hospital.',
                    correctAnswer: 'works',
                    hint: 'Third person singular adds -s'
                },
                {
                    type: 'sentence_build',
                    words: ['I', 'study', 'English', 'every day'],
                    correctOrder: ['I', 'study', 'English', 'every day']
                }
            ],
            
            examples: [
                'I eat breakfast at 7 AM.',
                'He plays football on weekends.',
                'They live in Tehran.'
            ]
        },
        
        prerequisites: ['lesson_001', 'lesson_002', 'lesson_003'],
        requiredScore: 75,
        
        rewards: {
            xpReward: 200,
            coinReward: 25,
            unlockables: ['badge_grammar_starter']
        },
        
        estimatedDuration: 30,
        maxAttempts: 3,
        
        status: 'locked',
        isActive: true,
        isFree: false,
        isPremium: true,
        
        stats: {
            totalAttempts: 0,
            averageScore: 0,
            completionRate: 0,
            averageTimeSpent: 0
        },
        
        srsData: {
            easeFactor: 2.5,
            interval: 1,
            nextReview: null,
            reviewCount: 0,
            lastReviewed: null,
            streak: 0
        },
        
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        publishedAt: '2024-01-01T00:00:00.000Z'
    },
    
    {
        id: 'lesson_005',
        title: 'لغات سفر',
        description: 'یادگیری لغات ضروری برای سفر',
        type: 'vocabulary',
        category: VOCABULARY_CATEGORIES.TRAVEL,
        tags: ['travel', 'intermediate', 'useful'],
        difficulty: 3,
        order: 5,
        
        content: {
            text: 'در این درس با لغات ضروری برای سفر آشنا می‌شوید...',
            vocabulary: [
                {
                    id: 'vocab_011',
                    word: 'airport',
                    translation: 'فرودگاه',
                    phonetic: 'ˈerpɔːrt',
                    partOfSpeech: 'noun',
                    example: 'We need to go to the airport early - باید زود به فرودگاه برویم',
                    difficulty: 3,
                    tags: ['travel', 'transportation']
                },
                {
                    id: 'vocab_012',
                    word: 'hotel',
                    translation: 'هتل',
                    phonetic: 'hoʊˈtel',
                    partOfSpeech: 'noun',
                    example: 'I booked a hotel near the beach - یک هتل نزدیک ساحل رزرو کردم',
                    difficulty: 3,
                    tags: ['travel', 'accommodation']
                }
            ],
            
            exercises: [
                {
                    type: 'listening',
                    audioUrl: 'https://example.com/audio/travel.mp3',
                    questions: [
                        {
                            question: 'Where does the conversation take place?',
                            options: ['airport', 'hotel', 'restaurant', 'museum'],
                            correctAnswer: 'airport'
                        }
                    ]
                }
            ],
            
            images: [
                { url: 'https://example.com/airport.jpg', alt: 'Airport terminal' },
                { url: 'https://example.com/hotel.jpg', alt: 'Hotel lobby' }
            ],
            audioUrl: 'https://example.com/audio/lesson5.mp3'
        },
        
        prerequisites: ['lesson_001', 'lesson_002', 'lesson_003'],
        requiredScore: 80,
        
        rewards: {
            xpReward: 250,
            coinReward: 30,
            unlockables: ['badge_traveler']
        },
        
        estimatedDuration: 35,
        maxAttempts: 3,
        
        status: 'locked',
        isActive: true,
        isFree: false,
        isPremium: true,
        
        stats: {
            totalAttempts: 0,
            averageScore: 0,
            completionRate: 0,
            averageTimeSpent: 0
        },
        
        srsData: {
            easeFactor: 2.5,
            interval: 1,
            nextReview: null,
            reviewCount: 0,
            lastReviewed: null,
            streak: 0
        },
        
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        publishedAt: '2024-01-01T00:00:00.000Z'
    }
];

// ============ Sample User Progress ============
const USER_PROGRESS_SAMPLE = [
    {
        userId: 'user_001',
        lessonId: 'lesson_001',
        status: 'completed',
        score: 85,
        attempts: 1,
        timeSpent: 12, // دقیقه
        lastReviewed: '2024-01-02T10:30:00.000Z',
        nextReviewDate: '2024-01-09T10:30:00.000Z',
        reviewInterval: 7,
        easeFactor: 2.3,
        completedAt: '2024-01-02T10:30:00.000Z',
        createdAt: '2024-01-02T10:00:00.000Z',
        updatedAt: '2024-01-02T10:30:00.000Z'
    },
    {
        userId: 'user_001',
        lessonId: 'lesson_002',
        status: 'in_progress',
        score: 0,
        attempts: 1,
        timeSpent: 5,
        startedAt: '2024-01-02T11:00:00.000Z',
        createdAt: '2024-01-02T11:00:00.000Z',
        updatedAt: '2024-01-02T11:00:00.000Z'
    }
];

// ============ Export ============
export {
    LESSONS_SAMPLE,
    SAMPLE_VOCABULARY,
    SAMPLE_GRAMMAR_POINTS,
    SAMPLE_EXERCISES,
    USER_PROGRESS_SAMPLE,
    VOCABULARY_CATEGORIES,
    GRAMMAR_TOPICS
};
