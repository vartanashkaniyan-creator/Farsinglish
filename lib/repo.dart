// lib/repo.dart
import 'dart:async';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart' as path;
import 'models.dart';

// ============================================
// DATABASE HELPER (SRP: فقط مدیریت دیتابیس)
// ============================================

class DatabaseHelper {
  static const _databaseName = 'english_learning.db';
  static const _databaseVersion = 1;

  // DIP: وابستگی به singleton برای سادگی (در پروژه بزرگ‌تر از تزریق استفاده می‌شد)
  static final DatabaseHelper instance = DatabaseHelper._internal();
  DatabaseHelper._internal();
  
  Database? _database;

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  // OCP: می‌توان جدول‌های جدید اضافه کرد بدون تغییر این متد
  Future<Database> _initDatabase() async {
    final dbPath = await getDatabasesPath();
    final fullPath = path.join(dbPath, _databaseName);
    
    return await openDatabase(
      fullPath,
      version: _databaseVersion,
      onCreate: _onCreate,
      onConfigure: _onConfigure,
    );
  }

  // کانفیگ اولیه دیتابیس
  Future<void> _onConfigure(Database db) async {
    await db.execute('PRAGMA foreign_keys = ON');
  }

  // ایجاد جدول‌ها (DRY: اسامی ستون‌ها ثابت تعریف شده)
  Future<void> _onCreate(Database db, int version) async {
    const idType = 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const textType = 'TEXT NOT NULL';
    const integerType = 'INTEGER NOT NULL';
    const realType = 'REAL NOT NULL';
    const timestampType = 'INTEGER NOT NULL';
    const optionalTextType = 'TEXT';

    await db.execute('''
      CREATE TABLE words (
        id $idType,
        english $textType,
        persian $textType,
        example $optionalTextType,
        createdAt $timestampType,
        nextReview $timestampType,
        interval $integerType,
        easeFactor $realType,
        reviewCount $integerType
      )
    ''');

    // OCP: اضافه کردن ایندکس برای بهبود عملکرد
    await db.execute('CREATE INDEX idx_next_review ON words(nextReview)');
    await db.execute('CREATE INDEX idx_english ON words(english)');
  }

  // SRP: بستن تمیز دیتابیس
  Future<void> close() async {
    if (_database != null) {
      await _database!.close();
      _database = null;
    }
  }
}

// ============================================
// DATA TRANSFER OBJECTS (برای لایه Data)
// ============================================

/// DTO برای تبدیل بین Entity و جدول دیتابیس (SRP)
class WordDto {
  final int id;
  final String english;
  final String persian;
  final String example;
  final DateTime createdAt;
  final DateTime nextReview;
  final int interval;
  final double easeFactor;
  final int reviewCount;

  WordDto({
    required this.id,
    required this.english,
    required this.persian,
    required this.example,
    required this.createdAt,
    required this.nextReview,
    required this.interval,
    required this.easeFactor,
    required this.reviewCount,
  });

  // تبدیل Entity به DTO
  factory WordDto.fromEntity(Word word) {
    return WordDto(
      id: word.id,
      english: word.english,
      persian: word.persian,
      example: word.example,
      createdAt: word.createdAt,
      nextReview: word.nextReview,
      interval: word.interval,
      easeFactor: word.easeFactor,
      reviewCount: word.reviewCount,
    );
  }

  // تبدیل DTO به Entity
  Word toEntity() {
    return Word(
      id: id,
      english: english,
      persian: persian,
      example: example,
      createdAt: createdAt,
      nextReview: nextReview,
      interval: interval,
      easeFactor: easeFactor,
      reviewCount: reviewCount,
    );
  }

  // تبدیل به Map برای Sqflite
  Map<String, dynamic> toMap() {
    return {
      'id': id == 0 ? null : id, // برای autoincrement
      'english': english,
      'persian': persian,
      'example': example,
      'createdAt': createdAt.millisecondsSinceEpoch,
      'nextReview': nextReview.millisecondsSinceEpoch,
      'interval': interval,
      'easeFactor': easeFactor,
      'reviewCount': reviewCount,
    };
  }

  // تبدیل از Map دریافتی از Sqflite
  factory WordDto.fromMap(Map<String, dynamic> map) {
    return WordDto(
      id: map['id'] as int,
      english: map['english'] as String,
      persian: map['persian'] as String,
      example: map['example'] as String,
      createdAt: DateTime.fromMillisecondsSinceEpoch(map['createdAt'] as int),
      nextReview: DateTime.fromMillisecondsSinceEpoch(map['nextReview'] as int),
      interval: map['interval'] as int,
      easeFactor: map['easeFactor'] as double,
      reviewCount: map['reviewCount'] as int,
    );
  }
}

// ============================================
// REPOSITORY IMPLEMENTATIONS (لایه Data)
// ============================================

/// ISP: پیاده‌سازی WordRepository با مسئولیت واحد
class WordRepositoryImpl implements WordRepository, SrsRepository {
  final DatabaseHelper dbHelper;

  // DIP: وابستگی از طریق constructor تزریق می‌شود
  WordRepositoryImpl({required this.dbHelper});

  @override
  Future<int> addWord(Word word) async {
    // بررسی تکراری نبودن کلمه
    final existing = await _findWordByEnglish(word.english);
    if (existing != null) {
      throw DuplicateWordFailure(word.english);
    }

    final db = await dbHelper.database;
    final dto = WordDto.fromEntity(word);
    
    try {
      final id = await db.insert('words', dto.toMap());
      return id;
    } on DatabaseException catch (e) {
      throw Failure('Failed to add word: ${e.message}');
    }
  }

  @override
  Future<List<Word>> getAllWords() async {
    final db = await dbHelper.database;
    
    try {
      final maps = await db.query(
        'words',
        orderBy: 'nextReview ASC',
      );
      
      return maps
          .map((map) => WordDto.fromMap(map).toEntity())
          .toList();
    } on DatabaseException catch (e) {
      throw Failure('Failed to get words: ${e.message}');
    }
  }

  @override
  Future<Word?> getWordById(int id) async {
    final db = await dbHelper.database;
    
    try {
      final maps = await db.query(
        'words',
        where: 'id = ?',
        whereArgs: [id],
      );
      
      if (maps.isEmpty) return null;
      return WordDto.fromMap(maps.first).toEntity();
    } on DatabaseException catch (e) {
      throw Failure('Failed to get word: ${e.message}');
    }
  }

  @override
  Future<void> updateWord(Word word) async {
    final db = await dbHelper.database;
    final dto = WordDto.fromEntity(word);
    
    try {
      final rows = await db.update(
        'words',
        dto.toMap(),
        where: 'id = ?',
        whereArgs: [word.id],
      );
      
      if (rows == 0) {
        throw WordNotFoundFailure(word.id);
      }
    } on DatabaseException catch (e) {
      throw Failure('Failed to update word: ${e.message}');
    }
  }

  @override
  Future<void> deleteWord(int id) async {
    final db = await dbHelper.database;
    
    try {
      final rows = await db.delete(
        'words',
        where: 'id = ?',
        whereArgs: [id],
      );
      
      if (rows == 0) {
        throw WordNotFoundFailure(id);
      }
    } on DatabaseException catch (e) {
      throw Failure('Failed to delete word: ${e.message}');
    }
  }

  @override
  Future<List<Word>> getWordsDueForReview() async {
    final db = await dbHelper.database;
    final now = DateTime.now().millisecondsSinceEpoch;
    
    try {
      final maps = await db.query(
        'words',
        where: 'nextReview <= ?',
        whereArgs: [now],
        orderBy: 'nextReview ASC',
      );
      
      return maps
          .map((map) => WordDto.fromMap(map).toEntity())
          .toList();
    } on DatabaseException catch (e) {
      throw Failure('Failed to get due words: ${e.message}');
    }
  }

  @override
  Future<void> updateReview(Word word, int quality) async {
    // قابل تست بودن: منطق محاسبه SRS جداگانه
    final params = SrsCalculationParams(
      currentInterval: word.interval,
      currentEaseFactor: word.easeFactor,
      quality: quality,
    );
    
    final newInterval = params.calculateNewInterval();
    final newEaseFactor = params.calculateNewEaseFactor();
    
    final updatedWord = word.copyWith(
      interval: newInterval,
      easeFactor: newEaseFactor,
      nextReview: DateTime.now().add(Duration(days: newInterval)),
      reviewCount: word.reviewCount + 1,
    );
    
    await updateWord(updatedWord);
  }

  @override
  Future<Map<ReviewStatus, int>> getReviewStats() async {
    final allWords = await getAllWords();
    final now = DateTime.now();
    
    int upToDate = 0;
    int dueSoon = 0;
    int overdue = 0;
    
    for (final word in allWords) {
      final status = word.reviewStatus;
      switch (status) {
        case ReviewStatus.upToDate:
          upToDate++;
          break;
        case ReviewStatus.dueSoon:
          dueSoon++;
          break;
        case ReviewStatus.overdue:
          overdue++;
          break;
      }
    }
    
    return {
      ReviewStatus.upToDate: upToDate,
      ReviewStatus.dueSoon: dueSoon,
      ReviewStatus.overdue: overdue,
    };
  }

  // DRY: متد کمکی برای جلوگیری از تکرار
  Future<Word?> _findWordByEnglish(String english) async {
    final db = await dbHelper.database;
    
    final maps = await db.query(
      'words',
      where: 'LOWER(english) = LOWER(?)',
      whereArgs: [english.trim()],
    );
    
    if (maps.isEmpty) return null;
    return WordDto.fromMap(maps.first).toEntity();
  }
}

/// ISP: پیاده‌سازی جداگانه برای جستجو
class SearchRepositoryImpl implements SearchRepository {
  final DatabaseHelper dbHelper;

  SearchRepositoryImpl({required this.dbHelper});

  @override
  Future<List<Word>> searchWords(String query) async {
    if (query.trim().isEmpty) {
      return [];
    }
    
    final db = await dbHelper.database;
    final searchTerm = '%${query.trim()}%';
    
    try {
      // SRP: فقط منطق جستجو را پیاده می‌کند
      final maps = await db.rawQuery('''
        SELECT * FROM words 
        WHERE LOWER(english) LIKE LOWER(?) 
           OR LOWER(persian) LIKE LOWER(?)
           OR LOWER(example) LIKE LOWER(?)
        ORDER BY 
          CASE WHEN LOWER(english) LIKE LOWER(?) THEN 1
               WHEN LOWER(persian) LIKE LOWER(?) THEN 2
               ELSE 3
          END
      ''', [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]);
      
      return maps
          .map((map) => WordDto.fromMap(map).toEntity())
          .toList();
    } on DatabaseException catch (e) {
      throw Failure('Failed to search words: ${e.message}');
    }
  }
}

// ============================================
// PROVIDERS (برای Riverpod)
// ============================================

// DIP: Providerها به انتزاع DatabaseHelper وابسته‌اند
final databaseHelperProvider = Provider<DatabaseHelper>((ref) {
  return DatabaseHelper.instance;
});

final wordRepositoryProvider = Provider<WordRepository>((ref) {
  final dbHelper = ref.watch(databaseHelperProvider);
  return WordRepositoryImpl(dbHelper: dbHelper);
});

final srsRepositoryProvider = Provider<SrsRepository>((ref) {
  final dbHelper = ref.watch(databaseHelperProvider);
  return WordRepositoryImpl(dbHelper: dbHelper);
});

final searchRepositoryProvider = Provider<SearchRepository>((ref) {
  final dbHelper = ref.watch(databaseHelperProvider);
  return SearchRepositoryImpl(dbHelper: dbHelper);
});
