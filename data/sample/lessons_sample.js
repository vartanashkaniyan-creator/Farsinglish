{
  "metadata": {
    "version": "2.0.0",
    "lastUpdated": "2025-02-16T10:30:00.000Z",
    "schema": "farsinglish-lesson-schema-v2",
    "totalLessons": 5,
    "totalVocabulary": 15,
    "totalExercises": 8,
    "locale": "fa-IR",
    "generatedBy": "farsinglish-data-generator"
  },

  "difficultyLevels": [
    { "level": 1, "name": "مبتدی", "nameEn": "Beginner", "color": "#4CAF50", "minXP": 0 },
    { "level": 2, "name": "پیش‌متوسط", "nameEn": "Pre-Intermediate", "color": "#FF9800", "minXP": 100 },
    { "level": 3, "name": "متوسط", "nameEn": "Intermediate", "color": "#2196F3", "minXP": 250 }
  ],

  "categories": [
    { "id": "general", "name": "عمومی", "icon": "🌍", "color": "#4CAF50" },
    { "id": "business", "name": "تجاری", "icon": "💼", "color": "#2196F3" },
    { "id": "academic", "name": "آکادمیک", "icon": "📚", "color": "#9C27B0" },
    { "id": "travel", "name": "سفر", "icon": "✈️", "color": "#FF9800" },
    { "id": "technology", "name": "تکنولوژی", "icon": "💻", "color": "#607D8B" }
  ],

  "lessons": [
    {
      "id": "lesson_001",
      "title": "سلام و احوالپرسی",
      "titleEn": "Greetings",
      "description": "یادگیری عبارات پایه برای سلام و احوالپرسی در انگلیسی",
      "descriptionEn": "Learn basic greetings and introductions in English",
      "type": "vocabulary",
      "categoryId": "general",
      "tags": ["beginner", "greetings", "basic", "essential"],
      "difficulty": 1,
      "order": 1,
      "isActive": true,
      "isFree": true,
      "isPremium": false,
      "estimatedDuration": 15,
      "maxAttempts": 3,
      "requiredScore": 0,
      "prerequisites": [],
      "unlocks": ["lesson_002"],
      
      "content": {
        "introduction": "در این درس با عبارات پایه سلام و احوالپرسی آشنا می‌شوید. این عبارات برای شروع هر مکالمه‌ای ضروری هستند.",
        "introductionEn": "In this lesson, you will learn basic greetings and expressions essential for starting any conversation.",
        "learningObjectives": [
          "توانایی سلام و احوالپرسی ساده",
          "معرفی خود به انگلیسی",
          "پرسیدن حال دیگران"
        ],
        
        "vocabulary": [
          {
            "id": "vocab_001",
            "word": "hello",
            "translation": "سلام",
            "phonetic": "həˈloʊ",
            "partOfSpeech": "interjection",
            "examples": [
              { "en": "Hello, how are you?", "fa": "سلام، حالتون چطوره؟" },
              { "en": "Hello everyone!", "fa": "سلام به همه!" }
            ],
            "synonyms": ["hi", "hey"],
            "antonyms": ["goodbye"],
            "difficulty": 1,
            "tags": ["basic", "greeting"],
            "images": ["https://example.com/images/hello.jpg"],
            "audioUrl": "https://example.com/audio/hello.mp3"
          },
          {
            "id": "vocab_002",
            "word": "goodbye",
            "translation": "خداحافظ",
            "phonetic": "ɡʊdˈbaɪ",
            "partOfSpeech": "interjection",
            "examples": [
              { "en": "Goodbye, see you tomorrow", "fa": "خداحافظ، فردا می‌بینمت" },
              { "en": "Say goodbye to your friends", "fa": "به دوستانت خداحافظی کن" }
            ],
            "synonyms": ["bye", "farewell"],
            "antonyms": ["hello"],
            "difficulty": 1,
            "tags": ["basic", "farewell"],
            "images": ["https://example.com/images/goodbye.jpg"],
            "audioUrl": "https://example.com/audio/goodbye.mp3"
          },
          {
            "id": "vocab_003",
            "word": "thank you",
            "translation": "متشکرم",
            "phonetic": "θæŋk juː",
            "partOfSpeech": "phrase",
            "examples": [
              { "en": "Thank you for your help", "fa": "ممنون از کمک شما" },
              { "en": "Thank you very much", "fa": "خیلی متشکرم" }
            ],
            "synonyms": ["thanks", "many thanks"],
            "difficulty": 1,
            "tags": ["basic", "politeness"],
            "images": ["https://example.com/images/thanks.jpg"],
            "audioUrl": "https://example.com/audio/thankyou.mp3"
          },
          {
            "id": "vocab_004",
            "word": "please",
            "translation": "لطفا",
            "phonetic": "pliːz",
            "partOfSpeech": "adverb",
            "examples": [
              { "en": "Please sit down", "fa": "لطفا بنشینید" },
              { "en": "Please help me", "fa": "لطفا کمکم کن" }
            ],
            "difficulty": 1,
            "tags": ["basic", "politeness"],
            "images": ["https://example.com/images/please.jpg"],
            "audioUrl": "https://example.com/audio/please.mp3"
          },
          {
            "id": "vocab_005",
            "word": "excuse me",
            "translation": "ببخشید",
            "phonetic": "ɪkˈskjuːs miː",
            "partOfSpeech": "phrase",
            "examples": [
              { "en": "Excuse me, where is the bathroom?", "fa": "ببخشید، دستشویی کجاست؟" },
              { "en": "Excuse me, can you help me?", "fa": "ببخشید، می‌توانید کمکم کنید؟" }
            ],
            "difficulty": 1,
            "tags": ["basic", "politeness", "questions"],
            "images": ["https://example.com/images/excuseme.jpg"],
            "audioUrl": "https://example.com/audio/excuseme.mp3"
          }
        ],

        "exercises": [
          {
            "id": "exercise_001_001",
            "type": "flashcard",
            "title": "فلش کارت لغات",
            "titleEn": "Vocabulary Flashcards",
            "items": [
              { "front": "hello", "back": "سلام" },
              { "front": "goodbye", "back": "خداحافظ" },
              { "front": "thank you", "back": "متشکرم" },
              { "front": "please", "back": "لطفا" },
              { "front": "excuse me", "back": "ببخشید" }
            ],
            "shuffle": true,
            "maxAttempts": 3,
            "difficulty": 1
          },
          {
            "id": "exercise_001_002",
            "type": "multiple_choice",
            "title": "انتخاب معنی صحیح",
            "titleEn": "Choose the Correct Meaning",
            "questions": [
              {
                "id": "q1",
                "question": "معنی کلمه 'hello' چیست؟",
                "options": ["سلام", "خداحافظ", "متشکرم", "ببخشید"],
                "correctAnswer": 0,
                "explanation": "Hello به معنی سلام است",
                "difficulty": 1
              },
              {
                "id": "q2",
                "question": "کدام گزینه معنی 'thank you' است؟",
                "options": ["لطفا", "متشکرم", "ببخشید", "خداحافظ"],
                "correctAnswer": 1,
                "explanation": "Thank you به معنی متشکرم است",
                "difficulty": 1
              }
            ]
          }
        ],

        "media": {
          "images": [
            { "url": "https://example.com/images/greeting1.jpg", "alt": "People greeting", "type": "illustration" }
          ],
          "audio": [
            { "url": "https://example.com/audio/lesson1_intro.mp3", "type": "introduction" }
          ]
        }
      },

      "rewards": {
        "xpReward": 100,
        "coinReward": 10,
        "achievements": [
          { "id": "badge_greeting_master", "name": "استاد سلام", "description": "تمام لغات درس سلام را یادگرفتی" }
        ]
      },

      "srsConfig": {
        "initialEaseFactor": 2.5,
        "initialInterval": 1,
        "maximumInterval": 365,
        "minimumEaseFactor": 1.3,
        "easyBonus": 1.3,
        "hardPenalty": 0.8
      },

      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2025-02-16T10:30:00.000Z",
      "publishedAt": "2024-01-01T00:00:00.000Z"
    },

    {
      "id": "lesson_002",
      "title": "اعداد ۱ تا ۱۰",
      "titleEn": "Numbers 1-10",
      "description": "یادگیری اعداد انگلیسی از یک تا ده",
      "descriptionEn": "Learn English numbers from one to ten",
      "type": "vocabulary",
      "categoryId": "general",
      "tags": ["beginner", "numbers", "counting", "math"],
      "difficulty": 1,
      "order": 2,
      "isActive": true,
      "isFree": true,
      "isPremium": false,
      "estimatedDuration": 20,
      "maxAttempts": 3,
      "requiredScore": 70,
      "prerequisites": ["lesson_001"],
      "unlocks": ["lesson_003"],
      
      "content": {
        "introduction": "در این درس اعداد انگلیسی از یک تا ده را یاد می‌گیرید. اعداد پایه ریاضیات و شمارش هستند.",
        "introductionEn": "In this lesson, you will learn English numbers from one to ten.",
        "learningObjectives": [
          "شمارش از ۱ تا ۱۰ به انگلیسی",
          "تشخیص اعداد در مکالمات ساده",
          "استفاده از اعداد در جملات"
        ],
        
        "vocabulary": [
          {
            "id": "vocab_006",
            "word": "one",
            "translation": "یک",
            "phonetic": "wʌn",
            "partOfSpeech": "numeral",
            "examples": [
              { "en": "I have one brother", "fa": "من یک برادر دارم" },
              { "en": "One apple, please", "fa": "یک سیب لطفا" }
            ],
            "difficulty": 1,
            "tags": ["numbers", "basic"],
            "audioUrl": "https://example.com/audio/one.mp3"
          },
          {
            "id": "vocab_007",
            "word": "two",
            "translation": "دو",
            "phonetic": "tuː",
            "partOfSpeech": "numeral",
            "examples": [
              { "en": "Two apples, please", "fa": "دو تا سیب لطفا" },
              { "en": "I have two hands", "fa": "من دو دست دارم" }
            ],
            "difficulty": 1,
            "tags": ["numbers", "basic"],
            "audioUrl": "https://example.com/audio/two.mp3"
          },
          {
            "id": "vocab_008",
            "word": "three",
            "translation": "سه",
            "phonetic": "θriː",
            "partOfSpeech": "numeral",
            "examples": [
              { "en": "Three cats", "fa": "سه گربه" },
              { "en": "Page three", "fa": "صفحه سه" }
            ],
            "difficulty": 1,
            "tags": ["numbers", "basic"],
            "audioUrl": "https://example.com/audio/three.mp3"
          }
        ],

        "exercises": [
          {
            "id": "exercise_002_001",
            "type": "matching",
            "title": "اتصال عدد به کلمه",
            "titleEn": "Match Number to Word",
            "pairs": [
              { "item": "1", "match": "one" },
              { "item": "2", "match": "two" },
              { "item": "3", "match": "three" }
            ],
            "difficulty": 1
          }
        ]
      },

      "rewards": {
        "xpReward": 120,
        "coinReward": 15,
        "achievements": [
          { "id": "badge_number_beginner", "name": "شمارشگر مبتدی", "description": "اعداد ۱ تا ۳ را یادگرفتی" }
        ]
      },

      "srsConfig": {
        "initialEaseFactor": 2.5,
        "initialInterval": 1,
        "maximumInterval": 365,
        "minimumEaseFactor": 1.3
      },

      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2025-02-16T10:30:00.000Z",
      "publishedAt": "2024-01-01T00:00:00.000Z"
    },

    {
      "id": "lesson_003",
      "title": "اعضای خانواده",
      "titleEn": "Family Members",
      "description": "یادگیری لغات مربوط به اعضای خانواده",
      "descriptionEn": "Learn vocabulary related to family members",
      "type": "vocabulary",
      "categoryId": "general",
      "tags": ["beginner", "family", "relationships", "people"],
      "difficulty": 2,
      "order": 3,
      "isActive": true,
      "isFree": true,
      "isPremium": false,
      "estimatedDuration": 25,
      "maxAttempts": 3,
      "requiredScore": 70,
      "prerequisites": ["lesson_001", "lesson_002"],
      "unlocks": ["lesson_004"],
      
      "content": {
        "introduction": "در این درس با لغات مربوط به اعضای خانواده آشنا می‌شوید.",
        "introductionEn": "In this lesson, you will learn vocabulary about family members.",
        "learningObjectives": [
          "معرفی اعضای خانواده",
          "صحبت درباره خانواده",
          "تشخیص روابط فامیلی"
        ],
        
        "vocabulary": [
          {
            "id": "vocab_009",
            "word": "family",
            "translation": "خانواده",
            "phonetic": "ˈfæməli",
            "partOfSpeech": "noun",
            "examples": [
              { "en": "My family is big", "fa": "خانواده من بزرگ است" },
              { "en": "I love my family", "fa": "خانواده‌ام را دوست دارم" }
            ],
            "difficulty": 2,
            "tags": ["family", "basic"],
            "audioUrl": "https://example.com/audio/family.mp3"
          },
          {
            "id": "vocab_010",
            "word": "mother",
            "translation": "مادر",
            "phonetic": "ˈmʌðər",
            "partOfSpeech": "noun",
            "examples": [
              { "en": "My mother is a teacher", "fa": "مادر من معلم است" },
              { "en": "Hello mother", "fa": "سلام مادر" }
            ],
            "difficulty": 2,
            "tags": ["family", "parents"],
            "audioUrl": "https://example.com/audio/mother.mp3"
          },
          {
            "id": "vocab_011",
            "word": "father",
            "translation": "پدر",
            "phonetic": "ˈfɑːðər",
            "partOfSpeech": "noun",
            "examples": [
              { "en": "My father is a doctor", "fa": "پدر من دکتر است" }
            ],
            "difficulty": 2,
            "tags": ["family", "parents"],
            "audioUrl": "https://example.com/audio/father.mp3"
          }
        ],

        "exercises": [
          {
            "id": "exercise_003_001",
            "type": "multiple_choice",
            "title": "معنی لغات خانواده",
            "titleEn": "Family Vocabulary",
            "questions": [
              {
                "id": "q1",
                "question": "معنی 'mother' چیست؟",
                "options": ["پدر", "مادر", "برادر", "خواهر"],
                "correctAnswer": 1,
                "explanation": "Mother به معنی مادر است",
                "difficulty": 2
              }
            ]
          }
        ]
      },

      "rewards": {
        "xpReward": 150,
        "coinReward": 20,
        "achievements": [
          { "id": "badge_family_expert", "name": "خانواده‌شناس", "description": "لغات پایه خانواده را یادگرفتی" }
        ]
      },

      "srsConfig": {
        "initialEaseFactor": 2.5,
        "initialInterval": 1,
        "maximumInterval": 365,
        "minimumEaseFactor": 1.3
      },

      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2025-02-16T10:30:00.000Z",
      "publishedAt": "2024-01-01T00:00:00.000Z"
    },

    {
      "id": "lesson_004",
      "title": "زمان حال ساده",
      "titleEn": "Simple Present Tense",
      "description": "آموزش زمان حال ساده در گرامر انگلیسی",
      "descriptionEn": "Learn Simple Present Tense in English grammar",
      "type": "grammar",
      "categoryId": "general",
      "tags": ["grammar", "tenses", "beginner", "verbs"],
      "difficulty": 2,
      "order": 4,
      "isActive": true,
      "isFree": false,
      "isPremium": true,
      "estimatedDuration": 30,
      "maxAttempts": 3,
      "requiredScore": 75,
      "prerequisites": ["lesson_001", "lesson_002", "lesson_003"],
      "unlocks": ["lesson_005"],
      
      "content": {
        "introduction": "زمان حال ساده برای بیان عادات، حقایق کلی و برنامه‌های ثابت استفاده می‌شود.",
        "introductionEn": "Simple Present is used for habits, general facts, and fixed schedules.",
        "learningObjectives": [
          "تشکیل جملات حال ساده",
          "افزودن -s به فعل برای سوم شخص مفرد",
          "سوالی و منفی کردن جملات"
        ],
        
        "grammarPoints": [
          {
            "id": "grammar_001",
            "title": "ساختار جملات مثبت",
            "titleEn": "Positive Sentences Structure",
            "rule": "فاعل + فعل اصلی (برای سوم شخص مفرد + s/es)",
            "examples": [
              { "en": "I work every day.", "fa": "من هر روز کار می‌کنم." },
              { "en": "She works in an office.", "fa": "او در یک دفتر کار می‌کند." }
            ]
          },
          {
            "id": "grammar_002",
            "title": "قوانین اضافه کردن s/es",
            "titleEn": "Rules for adding s/es",
            "rule": "برای اکثر افعال s، برای افعال ending with o, ch, sh, ss, x, z: es، برای y بعد از حرف صامت: ies",
            "examples": [
              { "en": "play → plays", "fa": "" },
              { "en": "go → goes", "fa": "" },
              { "en": "study → studies", "fa": "" }
            ]
          }
        ],

        "exercises": [
          {
            "id": "exercise_004_001",
            "type": "fill_blank",
            "title": "پر کردن جای خالی",
            "titleEn": "Fill in the Blanks",
            "questions": [
              {
                "id": "q1",
                "sentence": "She ___ (work) in a hospital.",
                "correctAnswer": "works",
                "hint": "سوم شخص مفرد s می‌گیرد"
              },
              {
                "id": "q2",
                "sentence": "They ___ (play) football every day.",
                "correctAnswer": "play",
                "hint": "جمع s نمی‌گیرد"
              }
            ]
          }
        ]
      },

      "rewards": {
        "xpReward": 200,
        "coinReward": 25,
        "achievements": [
          { "id": "badge_grammar_starter", "name": "آغازگر گرامر", "description": "اولین درس گرامر را گذراندی" }
        ]
      },

      "srsConfig": {
        "initialEaseFactor": 2.5,
        "initialInterval": 1,
        "maximumInterval": 365,
        "minimumEaseFactor": 1.3
      },

      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2025-02-16T10:30:00.000Z",
      "publishedAt": "2024-01-01T00:00:00.000Z"
    },

    {
      "id": "lesson_005",
      "title": "لغات سفر",
      "titleEn": "Travel Vocabulary",
      "description": "یادگیری لغات ضروری برای سفر",
      "descriptionEn": "Learn essential travel vocabulary",
      "type": "vocabulary",
      "categoryId": "travel",
      "tags": ["travel", "intermediate", "useful", "vacation"],
      "difficulty": 3,
      "order": 5,
      "isActive": true,
      "isFree": false,
      "isPremium": true,
      "estimatedDuration": 35,
      "maxAttempts": 3,
      "requiredScore": 80,
      "prerequisites": ["lesson_001", "lesson_002", "lesson_003"],
      "unlocks": [],
      
      "content": {
        "introduction": "در این درس با لغات ضروری برای سفر آشنا می‌شوید.",
        "introductionEn": "In this lesson, you will learn essential travel vocabulary.",
        "learningObjectives": [
          "صحبت درباره سفر",
          "رزرو هتل و بلیط",
          "پرسیدن مسیر"
        ],
        
        "vocabulary": [
          {
            "id": "vocab_012",
            "word": "airport",
            "translation": "فرودگاه",
            "phonetic": "ˈerpɔːrt",
            "partOfSpeech": "noun",
            "examples": [
              { "en": "We need to go to the airport early", "fa": "باید زود به فرودگاه برویم" },
              { "en": "The airport is busy", "fa": "فرودگاه شلوغ است" }
            ],
            "difficulty": 3,
            "tags": ["travel", "transportation"],
            "audioUrl": "https://example.com/audio/airport.mp3"
          },
          {
            "id": "vocab_013",
            "word": "hotel",
            "translation": "هتل",
            "phonetic": "hoʊˈtel",
            "partOfSpeech": "noun",
            "examples": [
              { "en": "I booked a hotel near the beach", "fa": "یک هتل نزدیک ساحل رزرو کردم" },
              { "en": "The hotel has a pool", "fa": "هتل استخر دارد" }
            ],
            "difficulty": 3,
            "tags": ["travel", "accommodation"],
            "audioUrl": "https://example.com/audio/hotel.mp3"
          },
          {
            "id": "vocab_014",
            "word": "ticket",
            "translation": "بلیط",
            "phonetic": "ˈtɪkɪt",
            "partOfSpeech": "noun",
            "examples": [
              { "en": "I bought a plane ticket", "fa": "یک بلیط هواپیما خریدم" },
              { "en": "How much is the ticket?", "fa": "بلیط چنده؟" }
            ],
            "difficulty": 3,
            "tags": ["travel", "booking"],
            "audioUrl": "https://example.com/audio/ticket.mp3"
          },
          {
            "id": "vocab_015",
            "word": "passport",
            "translation": "گذرنامه",
            "phonetic": "ˈpæspɔːrt",
            "partOfSpeech": "noun",
            "examples": [
              { "en": "Don't forget your passport", "fa": "گذرنامه‌ات را فراموش نکن" },
              { "en": "My passport is valid", "fa": "گذرنامه‌ام معتبر است" }
            ],
            "difficulty": 3,
            "tags": ["travel", "documents"],
            "audioUrl": "https://example.com/audio/passport.mp3"
          }
        ],

        "exercises": [
          {
            "id": "exercise_005_001",
            "type": "matching",
            "title": "لغات سفر",
            "titleEn": "Travel Vocabulary",
            "pairs": [
              { "item": "airport", "match": "فرودگاه" },
              { "item": "hotel", "match": "هتل" },
              { "item": "ticket", "match": "بلیط" },
              { "item": "passport", "match": "گذرنامه" }
            ],
            "difficulty": 3
          },
          {
            "id": "exercise_005_002",
            "type": "sentence_builder",
            "title": "ساختن جمله",
            "titleEn": "Sentence Builder",
            "words": ["I", "booked", "a", "hotel", "near", "the", "beach"],
            "correctOrder": ["I", "booked", "a", "hotel", "near", "the", "beach"],
            "translation": "من یک هتل نزدیک ساحل رزرو کردم",
            "difficulty": 3
          }
        ]
      },

      "rewards": {
        "xpReward": 250,
        "coinReward": 30,
        "achievements": [
          { "id": "badge_traveler", "name": "جهانگرد", "description": "لغات ضروری سفر را یادگرفتی" }
        ]
      },

      "srsConfig": {
        "initialEaseFactor": 2.5,
        "initialInterval": 1,
        "maximumInterval": 365,
        "minimumEaseFactor": 1.3
      },

      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2025-02-16T10:30:00.000Z",
      "publishedAt": "2024-01-01T00:00:00.000Z"
    }
  ],

  "statistics": {
    "totalStudents": 0,
    "totalCompletions": 0,
    "averageRating": 0,
    "popularTags": ["beginner", "basic", "greetings", "numbers", "family"],
    "completionRates": {
      "lesson_001": 0,
      "lesson_002": 0,
      "lesson_003": 0,
      "lesson_004": 0,
      "lesson_005": 0
    }
  },

  "schema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "description": "Farsinglish Lesson Data Schema",
    "version": "2.0.0"
  }
                  }
