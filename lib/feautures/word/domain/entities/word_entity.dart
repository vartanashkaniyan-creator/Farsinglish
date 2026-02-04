// lib/features/word/domain/entities/word_entity.dart

/// موجودیت (Entity) کلمه در لایه Domain
/// این کلاس خالص ترین شکل داده کسب‌وکار است و وابستگی به هیچ فریم‌ورک خارجی ندارد
class WordEntity {
  final int? id;
  final String english;
  final String persian;
  final String? exampleSentence;
  final int difficultyLevel; // 1=آسان, 2=متوسط, 3=سخت
  final DateTime nextReviewDate;
  final int reviewInterval; // تعداد روز تا مرور بعدی
  final int correctReviews;
  final int wrongReviews;
  final DateTime createdAt;
  final DateTime? updatedAt;

  WordEntity({
    this.id,
    required this.english,
    required this.persian,
    this.exampleSentence,
    this.difficultyLevel = 1,
    required this.nextReviewDate,
    this.reviewInterval = 1,
    this.correctReviews = 0,
    this.wrongReviews = 0,
    DateTime? createdAt,
    this.updatedAt,
  }) : createdAt = createdAt ?? DateTime.now();

  // 1. فکتوری برای ایجاد موجودیت جدید (اولین بار)
  factory WordEntity.createNew({
    required String english,
    required String persian,
    String? exampleSentence,
    int difficultyLevel = 1,
  }) {
    final now = DateTime.now();
    // اولین مرور: فردا
    final firstReviewDate = now.add(const Duration(days: 1));
    
    return WordEntity(
      english: english.trim(),
      persian: persian.trim(),
      exampleSentence: exampleSentence?.trim(),
      difficultyLevel: difficultyLevel.clamp(1, 3),
      nextReviewDate: firstReviewDate,
      reviewInterval: 1,
      correctReviews: 0,
      wrongReviews: 0,
      createdAt: now,
    );
  }

  // 2. منطق SRS: محاسبه تاریخ مرور بعدی (منطق خالص دامنه)
  WordEntity calculateNextReview({required bool wasCorrect, double easyFactor = 1.3, double hardFactor = 0.8}) {
    final now = DateTime.now();
    int newInterval;
    DateTime newNextReviewDate;

    if (wasCorrect) {
      newInterval = (reviewInterval * easyFactor).ceil();
    } else {
      newInterval = (reviewInterval * hardFactor).ceil();
      newInterval = newInterval.clamp(1, 365); // محدود کردن
    }

    newNextReviewDate = now.add(Duration(days: newInterval));

    return WordEntity(
      id: id,
      english: english,
      persian: persian,
      exampleSentence: exampleSentence,
      difficultyLevel: difficultyLevel,
      nextReviewDate: newNextReviewDate,
      reviewInterval: newInterval,
      correctReviews: wasCorrect ? correctReviews + 1 : correctReviews,
      wrongReviews: wasCorrect ? wrongReviews : wrongReviews + 1,
      createdAt: createdAt,
      updatedAt: now,
    );
  }

  // 3. بررسی نیاز به مرور (منطق خالص دامنه)
  bool isDueForReview() {
    final now = DateTime.now();
    return now.isAfter(nextReviewDate) || now.isAtSameMomentAs(nextReviewDate);
  }

  // 4. محاسبه تسلط (درصد موفقیت)
  double get masteryPercentage {
    final totalReviews = correctReviews + wrongReviews;
    if (totalReviews == 0) return 0.0;
    return (correctReviews / totalReviews) * 100;
  }

  // 5. سطح تسلط بر اساس درصد
  String get masteryLevel {
    final percentage = masteryPercentage;
    if (percentage >= 90) return 'عالی';
    if (percentage >= 70) return 'خوب';
    if (percentage >= 50) return 'متوسط';
    return 'نیاز به تمرین';
  }

  // 6. کپی با تغییرات جزئی
  WordEntity copyWith({
    int? id,
    String? english,
    String? persian,
    String? exampleSentence,
    int? difficultyLevel,
    DateTime? nextReviewDate,
    int? reviewInterval,
    int? correctReviews,
    int? wrongReviews,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return WordEntity(
      id: id ?? this.id,
      english: english ?? this.english,
      persian: persian ?? this.persian,
      exampleSentence: exampleSentence ?? this.exampleSentence,
      difficultyLevel: difficultyLevel ?? this.difficultyLevel,
      nextReviewDate: nextReviewDate ?? this.nextReviewDate,
      reviewInterval: reviewInterval ?? this.reviewInterval,
      correctReviews: correctReviews ?? this.correctReviews,
      wrongReviews: wrongReviews ?? this.wrongReviews,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  // 7. اعتبارسنجی داده‌ها
  List<String> validate() {
    final errors = <String>[];
    
    if (english.isEmpty) errors.add('کلمه انگلیسی نمی‌تواند خالی باشد');
    if (english.length > 100) errors.add('کلمه انگلیسی خیلی طولانی است');
    if (persian.isEmpty) errors.add('معنی فارسی نمی‌تواند خالی باشد');
    if (exampleSentence != null && exampleSentence!.length > 500) {
      errors.add('مثال خیلی طولانی است');
    }
    
    return errors;
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is WordEntity &&
        other.id == id &&
        other.english == english &&
        other.persian == persian;
  }

  @override
  int get hashCode => id.hashCode ^ english.hashCode ^ persian.hashCode;

  @override
  String toString() {
    return 'WordEntity(id: $id, "$english" -> "$persian", next: $nextReviewDate, mastery: ${masteryPercentage.toStringAsFixed(1)}%)';
  }
}
