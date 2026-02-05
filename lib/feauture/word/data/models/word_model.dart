import 'package:equatable/equatable.dart';
import '../../domain/entities/word_entity.dart';

/// مدل داده کلمه در لایه Data
/// 
/// رعایت اصول:
/// ۱. LSP: می‌تواند جایگزین WordEntity در لایه Data شود
/// ۲. SRP: فقط مسئولیت نگهداری داده و تبدیل فرمت‌ها
/// ۳. DRY: منطق تبدیل در این کلاس متمرکز شده
class WordModel extends WordEntity {
  /// شناسه یکتای کلمه در دیتابیس
  final int dbId;
  
  /// زمان ایجاد رکورد (میلادی)
  final DateTime createdAt;
  
  /// زمان آخرین به‌روزرسانی (میلادی)
  final DateTime updatedAt;
  
  const WordModel({
    required this.dbId,
    required String english,
    required String persian,
    String? exampleSentence,
    int? reviewCount,
    int? difficultyLevel,
    DateTime? nextReviewDate,
    int? reviewInterval,
    required this.createdAt,
    required this.updatedAt,
  }) : super(
          english: english,
          persian: persian,
          exampleSentence: exampleSentence,
          reviewCount: reviewCount ?? 0,
          difficultyLevel: difficultyLevel ?? 1,
          nextReviewDate: nextReviewDate,
          reviewInterval: reviewInterval ?? 24,
        );
  
  /// تبدیل از Map (دیتابیس) به WordModel
  /// 
  /// رعایت OCP: می‌توان فرمت‌های ورودی دیگر را با اضافه کردن factory اضافه کرد
  factory WordModel.fromMap(Map<String, dynamic> map) {
    return WordModel(
      dbId: map['id'] as int,
      english: map['english_text'] as String,
      persian: map['persian_text'] as String,
      exampleSentence: map['example_sentence'] as String?,
      reviewCount: map['review_count'] as int?,
      difficultyLevel: map['difficulty_level'] as int?,
      nextReviewDate: map['next_review_date'] != null
          ? DateTime.fromMillisecondsSinceEpoch(map['next_review_date'] as int)
          : null,
      reviewInterval: map['review_interval'] as int?,
      createdAt: DateTime.fromMillisecondsSinceEpoch(map['created_at'] as int),
      updatedAt: DateTime.fromMillisecondsSinceEpoch(map['updated_at'] as int),
    );
  }
  
  /// تبدیل WordModel به Map برای ذخیره در دیتابیس
  /// 
  /// رعایت SRP: تنها مسئولیت تبدیل به فرمت دیتابیس
  Map<String, dynamic> toMap() {
    return {
      'id': dbId,
      'english_text': english,
      'persian_text': persian,
      'example_sentence': exampleSentence,
      'review_count': reviewCount,
      'difficulty_level': difficultyLevel,
      'next_review_date': nextReviewDate?.millisecondsSinceEpoch,
      'review_interval': reviewInterval,
      'created_at': createdAt.millisecondsSinceEpoch,
      'updated_at': updatedAt.millisecondsSinceEpoch,
    };
  }
  
  /// ایجاد یک کپی از مدل با فیلدهای به‌روزشده
  /// 
  /// رعایت DRY: منطق کپی کردن در یک مکان متمرکز
  WordModel copyWith({
    int? dbId,
    String? english,
    String? persian,
    String? exampleSentence,
    int? reviewCount,
    int? difficultyLevel,
    DateTime? nextReviewDate,
    int? reviewInterval,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return WordModel(
      dbId: dbId ?? this.dbId,
      english: english ?? this.english,
      persian: persian ?? this.persian,
      exampleSentence: exampleSentence ?? this.exampleSentence,
      reviewCount: reviewCount ?? this.reviewCount,
      difficultyLevel: difficultyLevel ?? this.difficultyLevel,
      nextReviewDate: nextReviewDate ?? this.nextReviewDate,
      reviewInterval: reviewInterval ?? this.reviewInterval,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? DateTime.now(), // بروزرسانی زمان در هر تغییر
    );
  }
  
  /// تبدیل WordEntity به WordModel
  /// 
  /// برای استفاده زمانی که Entity از لایه Domain دریافت می‌شود
  factory WordModel.fromEntity(WordEntity entity, {int? dbId}) {
    final now = DateTime.now();
    return WordModel(
      dbId: dbId ?? 0, // 0 نشان‌دهنده ذخیره نشده در دیتابیس
      english: entity.english,
      persian: entity.persian,
      exampleSentence: entity.exampleSentence,
      reviewCount: entity.reviewCount,
      difficultyLevel: entity.difficultyLevel,
      nextReviewDate: entity.nextReviewDate,
      reviewInterval: entity.reviewInterval,
      createdAt: now,
      updatedAt: now,
    );
  }
  
  @override
  List<Object?> get props => [
        dbId,
        english,
        persian,
        exampleSentence,
        reviewCount,
        difficultyLevel,
        nextReviewDate,
        reviewInterval,
        createdAt,
        updatedAt,
      ];
  
  @override
  bool get stringify => true;
}

/// خطاهای مربوط به مدل Word
abstract class WordModelException implements Exception {
  final String message;
  
  const WordModelException(this.message);
  
  @override
  String toString() => 'WordModelException: $message';
}

/// خطای تبدیل نامعتبر از Map
class InvalidMapConversionException extends WordModelException {
  const InvalidMapConversionException(String fieldName)
      : super('فیلد $fieldName در داده‌های ورودی معتبر نیست.');
}
