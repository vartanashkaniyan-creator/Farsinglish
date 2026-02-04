// lib/core/constants/app_constants.dart

/// ثابت‌های مرکزی و تنظیمات پایه اپلیکیشن
/// برای جلوگیری از مقادیر جادویی (Magic Numbers/Strings) و یکسان‌سازی تغییرات

class AppConstants {
  // نسخه و اطلاعات پایه
  static const String appName = 'English Learning';
  static const String appVersion = '1.0.0';

  // دیتابیس
  static const String databaseName = 'english_learning.db';
  static const int databaseVersion = 1;

  // جداول دیتابیس (اسامی)
  static const String wordsTable = 'words';
  static const String usersTable = 'users'; // برای آینده

  // تنظیمات SRS (سیستم مرور هوشمند) - مقادیر اولیه
  static const List<int> srsInitialIntervals = [1, 3, 7, 14, 30]; // فواصل مرور بر اساس روز
  static const double srsEasyFactor = 1.3; // ضریب آسانی
  static const double srsHardFactor = 0.8; // ضریب سختی

  // کلیدهای ذخیره‌سازی امن (Secure Storage Keys)
  static const String keyFirstLaunch = 'is_first_launch';
  static const String keyUserToken = 'user_token';

  // مسیرهای API (اگر در آینده اضافه شد)
  static const String baseUrl = 'https://api.example.com'; // نمونه
  static const String apiLogin = '/auth/login';
  static const String apiSyncWords = '/words/sync';

  // محدودیت‌ها
  static const int maxWordsPerDay = 50;
  static const int maxWordLength = 100;

  // قالب تاریخ
  static const String dateFormat = 'yyyy-MM-dd';
}
