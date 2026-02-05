/// کلاس ثابت‌های اصلی برنامه
/// 
/// رعایت اصول:
/// ۱. SOLID-SRP: تنها مسئولیت نگهداری ثابت‌های برنامه
/// ۲. KISS: ساختار ساده و مستقیم
/// ۳. DRY: مرجع متمرکز برای تمام ثابت‌ها
/// ۴. نام‌گذاری: قرارداد صحیح Dart برای ثابت‌ها (snake_case با پیشوند k)
class AppConstants {
  // جلوگیری از نمونه‌سازی
  AppConstants._();

  // ============================
  // بخش: دیتابیس
  // ============================
  
  /// نام فایل دیتابیس
  static const String kDatabaseName = 'english_learning.db';
  
  /// نسخه دیتابیس (برای migrations)
  static const int kDatabaseVersion = 1;
  
  // ============================
  // بخش: ذخیره‌سازی امن
  // ============================
  
  /// کلید ذخیره توکن احراز هویت
  static const String kAuthTokenKey = 'auth_token';
  
  /// کلید ذخیره وضعیت اولیه برنامه
  static const String kFirstLaunchKey = 'is_first_launch';
  
  // ============================
  // بخش: تنظیمات برنامه
  // ============================
  
  /// نام نمایشی برنامه
  static const String kAppDisplayName = 'English Learning';
  
  /// پیشوند جدول‌های دیتابیس برای جلوگیری از تداخل
  static const String kTablePrefix = 'app_';
  
  // ============================
  // بخش: تنظیمات SRS (سیستم مرور هوشمند)
  // ============================
  
  /// بازه‌های اولیه مرور (به ساعت)
  static const List<int> kDefaultReviewIntervals = [24, 72, 168, 336, 672];
  
  /// حداکثر تعداد کلمات برای مرور روزانه
  static const int kMaxDailyReviews = 50;
  
  // ============================
  // بخش: اعتبارسنجی
  // ============================
  
  /// حداقل طول رمز عبور
  static const int kMinPasswordLength = 6;
  
  /// حداکثر طول نام کاربری
  static const int kMaxUsernameLength = 30;
  
  /// حداقل طول نام کاربری
  static const int kMinUsernameLength = 3;
}

/// ثابت‌های مخصوص جداول دیتابیس
/// 
/// رعایت ISP: جداسازی ثابت‌های جداول از ثابت‌های عمومی
class TableNames {
  TableNames._();
  
  static const String words = 'app_words';
  static const String users = 'app_users';
  static const String reviews = 'app_reviews';
}

/// کلیدهای ستون‌های مشترک در جداول
/// 
/// رعایت DRY: جلوگیری از تکرار نام ستون‌های مشترک
class ColumnNames {
  ColumnNames._();
  
  static const String id = 'id';
  static const String createdAt = 'created_at';
  static const String updatedAt = 'updated_at';
}
