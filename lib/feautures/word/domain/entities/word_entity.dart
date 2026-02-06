import 'package:equatable/equatable.dart';

/// موجودیت کلمه در لایه Domain
/// 
/// رعایت اصول:
/// ۱. SRP: تعریف خالص‌ترین شکل داده کلمه بدون وابستگی به فریم‌ورک
/// ۲. DIP: لایه‌های دیگر به این انتزاع وابسته‌اند
/// ۳. ISP: فقط ویژگی‌های اصلی کسب‌وکار را تعریف می‌کند
abstract class WordEntity extends Equatable {
  /// متن انگلیسی کلمه
  final String english;
  
  /// معنی فارسی کلمه
  final String persian;
  
  /// مثال کاربردی کلمه
  final String? exampleSentence;
  
  /// تعداد دفعات مرور شده
  final int reviewCount;
  
  /// سطح دشواری (۱ تا ۵)
  final int difficultyLevel;
  
  /// تاریخ مرور بعدی
  final DateTime? nextReviewDate;
  
  /// فاصله مرور بعدی (به ساعت)
  final int reviewInterval;
  
  const WordEntity({
    required this.english,
    required this.persian,
    this.exampleSentence,
    this.reviewCount = 0,
    this.difficultyLevel = 1,
    this.nextReviewDate,
    this.reviewInterval = 24,
  });
  
  /// بررسی معتبر بودن موجودیت
  /// 
  /// رعایت SRP: منطق اعتبارسنجی کسب‌وکار در Entity
  bool get isValid {
    return english.trim().isNotEmpty &&
        persian.trim().isNotEmpty &&
        difficultyLevel >= 1 &&
        difficultyLevel <= 5 &&
        reviewInterval > 0;
  }
  
  /// محاسبه تاریخ مرور بعدی بر اساس الگوریتم SRS
  /// 
  /// @param answeredCorrectly: آیا کاربر به درستی پاسخ داده
  /// @return تاریخ مرور بعدی محاسبه شده
  DateTime calculateNextReviewDate(bool answeredCorrectly) {
    final now = DateTime.now();
    
    if (!answeredCorrectly) {
      // اگر پاسخ نادرست بود، مرور در ۱ ساعت دیگر
      return now.add(const Duration(hours: 1));
    }
    
    // محاسبه فاصله مرور جدید بر اساس پاسخ صحیح
    final newInterval = _calculateNewInterval(reviewInterval);
    
    // تاریخ مرور بعدی
    return now.add(Duration(hours: newInterval));
  }
  
  /// محاسبه فاصله مرور جدید با الگوریتم SRS ساده
  int _calculateNewInterval(int currentInterval) {
    if (reviewCount == 0) return 24; // اولین مرور
    if (reviewCount == 1) return 72; // دومین مرور
    if (reviewCount == 2) return 168; // سومین مرور
    
    // بعد از مرور سوم، فاصله را ۲ برابر کن
    return (currentInterval * 2).clamp(168, 720); // بین ۱ هفته و ۱ ماه
  }
  
  @override
  List<Object?> get props => [
        english,
        persian,
        exampleSentence,
        reviewCount,
        difficultyLevel,
        nextReviewDate,
        reviewInterval,
      ];
}
