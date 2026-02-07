// lib/models.dart

// ============================================
// ENTITIES (Domain Layer)
// ============================================

/// اصلی‌ترین موجودیت برنامه که اصل SRP را رعایت می‌کند:
/// فقط داده‌های یک کلمه و وضعیت یادگیری آن را نگه می‌دارد.
class Word {
  final int id;
  final String english;
  final String persian;
  final String example; // مثال اختیاری (OCP: اضافه شدن فیلد جدید بدون شکستن کد قدیمی)
  final DateTime createdAt;
  final DateTime nextReview; // تاریخ مرور بعدی بر اساس الگوریتم SRS
  final int interval; // فاصله مرور (به روز)
  final double easeFactor; // ضریب آسانی (طبق الگوریتم SM-2)
  final int reviewCount; // تعداد دفعات مرور شده

  Word({
    required this.id,
    required this.english,
    required this.persian,
    this.example = '',
    required this.createdAt,
    required this.nextReview,
    this.interval = 1,
    this.easeFactor = 2.5,
    this.reviewCount = 0,
  });

  /// LSP: ایجاد یک کپی با قابلیت جایگزینی کامل با نمونه اصلی
  Word copyWith({
    int? id,
    String? english,
    String? persian,
    String? example,
    DateTime? createdAt,
    DateTime? nextReview,
    int? interval,
    double? easeFactor,
    int? reviewCount,
  }) {
    return Word(
      id: id ?? this.id,
      english: english ?? this.english,
      persian: persian ?? this.persian,
      example: example ?? this.example,
      createdAt: createdAt ?? this.createdAt,
      nextReview: nextReview ?? this.nextReview,
      interval: interval ?? this.interval,
      easeFactor: easeFactor ?? this.easeFactor,
      reviewCount: reviewCount ?? this.reviewCount,
    );
  }

  /// برای مقایسه دو کلمه (مثلاً در تست‌ها)
  @override
  bool operator ==(Object other) {
    return other is Word &&
        other.id == id &&
        other.english == english &&
        other.persian == persian;
  }

  @override
  int get hashCode => Object.hash(id, english, persian);

  /// محاسبه وضعیت مرور بر اساس تاریخ جاری (قابل تست بودن)
  ReviewStatus get reviewStatus {
    final now = DateTime.now();
    if (now.isBefore(nextReview)) {
      return ReviewStatus.upToDate;
    } else if (now.difference(nextReview).inDays <= 3) {
      return ReviewStatus.dueSoon;
    } else {
      return ReviewStatus.overdue;
    }
  }

  @override
  String toString() => 'Word($id: $english -> $persian)';
}

/// وضعیت مرور کلمه - برای نمایش در UI
enum ReviewStatus { upToDate, dueSoon, overdue }

// ============================================
// REPOSITORY CONTRACTS (Domain Layer)
// ============================================

/// ISP: اینترفیس اصلی برای دسترسی به داده‌های کلمه
/// فقط متدهای ضروری را تعریف می‌کند و از حجیم شدن جلوگیری می‌کند
abstract class WordRepository {
  Future<int> addWord(Word word);
  Future<List<Word>> getAllWords();
  Future<Word?> getWordById(int id);
  Future<void> updateWord(Word word);
  Future<void> deleteWord(int id);
  Future<List<Word>> getWordsDueForReview();
}

/// ISP: اینترفیس جداگانه برای عملیات خاص SRS
/// از تقسیم اینترفیس حجیم به اینترفیس‌های کوچک‌تر پیروی می‌کند
abstract class SrsRepository {
  Future<void> updateReview(Word word, int quality);
  Future<Map<ReviewStatus, int>> getReviewStats();
}

/// ISP: اینترفیس جداگانه برای عملیات جستجو
abstract class SearchRepository {
  Future<List<Word>> searchWords(String query);
}

// ============================================
// VALUE OBJECTS
// ============================================

/// شیء ارزشی برای بازگشت نتیجه عملیات (الگوی Result)
/// اصل SRP: فقط مسئول انتقال نتیجه عملیات است
class Result<T> {
  final T? data;
  final String? error;
  final bool isSuccess;

  Result.success(this.data)
      : error = null,
        isSuccess = true;

  Result.failure(this.error)
      : data = null,
        isSuccess = false;

  bool get hasError => error != null;
}

/// شیء ارزشی برای پارامترهای جستجو (OCP: قابل گسترش)
class SearchParams {
  final String query;
  final bool matchEnglish;
  final bool matchPersian;
  final bool matchExample;

  const SearchParams({
    required this.query,
    this.matchEnglish = true,
    this.matchPersian = true,
    this.matchExample = false,
  });

  /// برای ایجاد تغییرات جزئی (الگوی Builder ساده)
  SearchParams copyWith({
    String? query,
    bool? matchEnglish,
    bool? matchPersian,
    bool? matchExample,
  }) {
    return SearchParams(
      query: query ?? this.query,
      matchEnglish: matchEnglish ?? this.matchEnglish,
      matchPersian: matchPersian ?? this.matchPersian,
      matchExample: matchExample ?? this.matchExample,
    );
  }
}

// ============================================
// FAILURES (Domain Errors)
// ============================================

/// کلاس پایه برای خطاهای دامنه (LSP: همه خطاها می‌توانند جایگزین این شوند)
abstract class Failure {
  final String message;
  final StackTrace? stackTrace;

  const Failure(this.message, {this.stackTrace});

  @override
  String toString() => message;
}

/// خطاهای خاص مربوط به کلمه
class WordNotFoundFailure extends Failure {
  WordNotFoundFailure(int id) : super('Word with id $id not found');
}

class DuplicateWordFailure extends Failure {
  DuplicateWordFailure(String english) : super('"$english" already exists');
}

class InvalidWordDataFailure extends Failure {
  InvalidWordDataFailure(String field) : super('Invalid value for $field');
}

// ============================================
// USE CASE PARAMS
// ============================================

/// پارامترهای use case‌ها برای وضوح بیشتر (SRP)
class AddWordParams {
  final String english;
  final String persian;
  final String example;

  const AddWordParams({
    required this.english,
    required this.persian,
    this.example = '',
  });
}

class UpdateWordParams {
  final int id;
  final String? english;
  final String? persian;
  final String? example;

  const UpdateWordParams({
    required this.id,
    this.english,
    this.persian,
    this.example,
  });
}

/// پارامترهای الگوریتم SRS (محاسبات قابل تست)
class SrsCalculationParams {
  final int currentInterval;
  final double currentEaseFactor;
  final int quality; // 0-5 طبق SM-2

  const SrsCalculationParams({
    required this.currentInterval,
    required this.currentEaseFactor,
    required this.quality,
  });

  /// محاسبه فاصله مرور جدید بر اساس الگوریتم SM-2
  int calculateNewInterval() {
    if (quality < 3) {
      return 1; // بازگشت به شروع
    }
    
    final newInterval = (currentInterval * currentEaseFactor).round();
    return newInterval.clamp(1, 365); // محدود کردن به ۱ تا ۳۶۵ روز
  }

  /// محاسبه ضریب آسانی جدید
  double calculateNewEaseFactor() {
    double newEase = currentEaseFactor +
        (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    
    return newEase.clamp(1.3, 2.5); // محدود کردن طبق SM-2
  }
}
