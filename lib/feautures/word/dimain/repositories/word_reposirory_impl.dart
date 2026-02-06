import 'package:flutter/foundation.dart';
import '../../domain/entities/word_entity.dart';
import '../../domain/repositories/word_repository.dart';
import '../models/word_model.dart';
import '../../../core/utils/database_helper.dart';

/// پیاده‌سازی واقعی WordRepository با استفاده از SQFlite
/// 
/// رعایت اصول:
/// ۱. DIP: پیاده‌سازی انتزاع WordRepository، وابسته به انتزاع DatabaseHelper
/// ۲. SRP: فقط تبدیل Entity/Model و فراخوانی عملیات دیتابیس
/// ۳. LSP: می‌تواند جایگزین هر پیاده‌سازی دیگری از WordRepository شود
class WordRepositoryImpl implements WordRepository {
  final DatabaseHelper _databaseHelper;
  
  /// تزریق وابستگی DatabaseHelper
  WordRepositoryImpl(this._databaseHelper);
  
  // ============================
  // عملیات CRUD پایه
  // ============================
  
  @override
  Future<int> addWord(WordEntity word) async {
    try {
      // تبدیل Entity به Model برای ذخیره
      final wordModel = WordModel.fromEntity(word);
      
      // آماده‌سازی داده برای دیتابیس
      final data = wordModel.toMap();
      data.remove('id'); // شناسه توسط دیتابیس تولید می‌شود
      
      // ذخیره در دیتابیس
      final id = await _databaseHelper.executeWrite(
        table: 'app_words',
        data: data,
      );
      
      return id;
    } catch (error) {
      if (error.toString().contains('UNIQUE constraint failed')) {
        throw const DuplicateWordException('english_text');
      }
      throw WordDatabaseOperationException('افزودن کلمه', error);
    }
  }
  
  @override
  Future<WordEntity?> getWordById(int id) async {
    try {
      final results = await _databaseHelper.executeRead(
        table: 'app_words',
        where: 'id = ?',
        whereArgs: [id],
      );
      
      if (results.isEmpty) return null;
      
      return WordModel.fromMap(results.first);
    } catch (error) {
      throw WordDatabaseOperationException('دریافت کلمه با شناسه $id', error);
    }
  }
  
  @override
  Future<void> updateWord(WordEntity word) async {
    try {
      if (word is! WordModel) {
        throw InvalidWordDataException('نوع داده کلمه برای به‌روزرسانی نامعتبر است');
      }
      
      await _databaseHelper.executeWrite(
        table: 'app_words',
        data: word.toMap(),
        where: 'id = ?',
        whereArgs: [(word as WordModel).dbId],
      );
    } catch (error) {
      throw WordDatabaseOperationException('به‌روزرسانی کلمه', error);
    }
  }
  
  @override
  Future<void> deleteWord(int id) async {
    try {
      await _databaseHelper.executeWrite(
        table: 'app_words',
        data: {}, // داده‌ای نیاز نیست
        where: 'id = ?',
        whereArgs: [id],
      );
    } catch (error) {
      throw WordDatabaseOperationException('حذف کلمه با شناسه $id', error);
    }
  }
  
  // ============================
  // عملیات بازیابی مجموعه‌ای
  // ============================
  
  @override
  Future<List<WordEntity>> getAllWords() async {
    try {
      final results = await _databaseHelper.executeRead(
        table: 'app_words',
        orderBy: 'created_at DESC',
      );
      
      return results.map((map) => WordModel.fromMap(map)).toList();
    } catch (error) {
      throw WordDatabaseOperationException('دریافت تمام کلمات', error);
    }
  }
  
  @override
  Future<List<WordEntity>> getWordsDueForReview() async {
    try {
      final now = DateTime.now().millisecondsSinceEpoch;
      
      final results = await _databaseHelper.executeRead(
        table: 'app_words',
        where: 'next_review_date <= ? OR next_review_date IS NULL',
        whereArgs: [now],
        orderBy: 'next_review_date ASC',
      );
      
      return results.map((map) => WordModel.fromMap(map)).toList();
    } catch (error) {
      throw WordDatabaseOperationException('دریافت کلمات نیازمند مرور', error);
    }
  }
  
  @override
  Future<List<WordEntity>> searchWords(String query) async {
    try {
      final searchTerm = '%$query%';
      
      final results = await _databaseHelper.executeRead(
        table: 'app_words',
        where: 'english_text LIKE ? OR persian_text LIKE ?',
        whereArgs: [searchTerm, searchTerm],
        orderBy: 'english_text ASC',
      );
      
      return results.map((map) => WordModel.fromMap(map)).toList();
    } catch (error) {
      throw WordDatabaseOperationException('جستجوی کلمات', error);
    }
  }
  
  @override
  Future<List<WordEntity>> getWordsByDifficulty(int difficultyLevel) async {
    try {
      final results = await _databaseHelper.executeRead(
        table: 'app_words',
        where: 'difficulty_level = ?',
        whereArgs: [difficultyLevel],
        orderBy: 'review_count ASC',
      );
      
      return results.map((map) => WordModel.fromMap(map)).toList();
    } catch (error) {
      throw WordDatabaseOperationException(
        'دریافت کلمات با سطح دشواری $difficultyLevel', 
        error,
      );
    }
  }
  
  // ============================
  // عملیات ویژه SRS
  // ============================
  
  @override
  Future<WordEntity> recordReview(int wordId, bool answeredCorrectly) async {
    await _databaseHelper.beginTransaction();
    
    try {
      // دریافت کلمه فعلی
      final word = await getWordById(wordId);
      if (word == null) {
        throw WordNotFoundException(wordId);
      }
      
      // محاسبه تغییرات SRS
      final nextReviewDate = word.calculateNextReviewDate(answeredCorrectly);
      final newReviewCount = word.reviewCount + 1;
      
      // افزایش فاصله مرور در صورت پاسخ صحیح
      int newReviewInterval = word.reviewInterval;
      if (answeredCorrectly) {
        newReviewInterval = _calculateNextInterval(word.reviewInterval, newReviewCount);
      } else {
        // اگر پاسخ غلط بود، فاصله را نصف کن (حداقل 1 ساعت)
        newReviewInterval = (word.reviewInterval ~/ 2).clamp(1, 24);
      }
      
      // ایجاد مدل به‌روزشده
      final updatedModel = WordModel.fromEntity(
        word,
        dbId: (word as WordModel).dbId,
      ).copyWith(
        reviewCount: newReviewCount,
        nextReviewDate: nextReviewDate,
        reviewInterval: newReviewInterval,
      );
      
      // ذخیره در دیتابیس
      await updateWord(updatedModel);
      
      await _databaseHelper.commitTransaction();
      return updatedModel;
    } catch (error) {
      await _databaseHelper.rollbackTransaction();
      if (error is WordRepositoryException) {
        rethrow;
      }
      throw WordDatabaseOperationException('ثبت نتیجه مرور', error);
    }
  }
  
  @override
  Future<int> getDueReviewCount() async {
    try {
      final words = await getWordsDueForReview();
      return words.length;
    } catch (error) {
      throw WordDatabaseOperationException('شمارش کلمات نیازمند مرور', error);
    }
  }
  
  @override
  Future<void> resetReviewProgress(int wordId) async {
    try {
      final word = await getWordById(wordId);
      if (word == null) {
        throw WordNotFoundException(wordId);
      }
      
      final resetModel = WordModel.fromEntity(
        word,
        dbId: (word as WordModel).dbId,
      ).copyWith(
        reviewCount: 0,
        nextReviewDate: null,
        reviewInterval: 24,
      );
      
      await updateWord(resetModel);
    } catch (error) {
      throw WordDatabaseOperationException('بازنشانی پیشرفت مرور', error);
    }
  }
  
  // ============================
  // متدهای کمکی خصوصی
  // ============================
  
  /// محاسبه فاصله مرور بعدی بر اساس الگوریتم SRS بهبودیافته
  int _calculateNextInterval(int currentInterval, int reviewCount) {
    // الگوریتم SRS ساده: فاصله‌ها به صورت تصاعدی افزایش می‌یابند
    const intervalMultiplier = 2.5;
    const maxIntervalHours = 30 * 24; // 30 روز
    
    if (reviewCount <= 1) return 24; // اولین مرور: 1 روز
    if (reviewCount == 2) return 72; // دومین مرور: 3 روز
    
    // محاسبه فاصله جدید
    final newInterval = (currentInterval * intervalMultiplier).toInt();
    
    // محدود کردن به حداکثر 30 روز
    return newInterval.clamp(24, maxIntervalHours);
  }
  
  @visibleForTesting
  DatabaseHelper get databaseHelper => _databaseHelper;
}
