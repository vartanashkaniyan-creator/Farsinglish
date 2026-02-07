import '../entities/word_entity.dart';
import '../repositories/word_repository.dart';

/// Use Case برای افزودن کلمه جدید
class AddWordUseCase {
  final WordRepository _wordRepository;

  const AddWordUseCase(this._wordRepository);

  Future<int> execute({
    required String english,
    required String persian,
    String? exampleSentence,
    int difficultyLevel = 1,
  }) async {
    // اعتبارسنجی
    _validateInput(
      english: english,
      persian: persian,
      exampleSentence: exampleSentence,
      difficultyLevel: difficultyLevel,
    );

    // ایجاد موجودیت
    final wordEntity = WordEntity(
      english: english.trim(),
      persian: persian.trim(),
      exampleSentence: exampleSentence?.trim(),
      difficultyLevel: difficultyLevel,
    );

    if (!wordEntity.isValid) {
      throw const AddWordException('داده‌های کلمه معتبر نیستند');
    }

    try {
      return await _wordRepository.addWord(wordEntity);
    } on DuplicateWordException {
      // این خطا را مستقیم پاس می‌دهیم تا تست آن را بگیرد
      rethrow;
    } catch (error) {
      throw AddWordException('خطا در افزودن کلمه: $error');
    }
  }

  void _validateInput({
    required String english,
    required String persian,
    String? exampleSentence,
    required int difficultyLevel,
  }) {
    final errors = <String>[];

    if (english.trim().isEmpty) {
      errors.add('متن انگلیسی نمی‌تواند خالی باشد');
    } else if (english.trim().length > 100) {
      errors.add('متن انگلیسی نمی‌تواند بیش از ۱۰۰ کاراکتر باشد');
    }

    if (persian.trim().isEmpty) {
      errors.add('معنی فارسی نمی‌تواند خالی باشد');
    } else if (persian.trim().length > 200) {
      errors.add('معنی فارسی نمی‌تواند بیش از ۲۰۰ کاراکتر باشد');
    }

    if (difficultyLevel < 1 || difficultyLevel > 5) {
      errors.add('سطح دشواری باید بین ۱ تا ۵ باشد');
    }

    if (exampleSentence != null && exampleSentence!.trim().length > 500) {
      errors.add('جمله مثال نمی‌تواند بیش از ۵۰۰ کاراکتر باشد');
    }

    if (errors.isNotEmpty) {
      throw AddWordException('خطاهای اعتبارسنجی: ${errors.join(', ')}');
    }
  }
}

class AddWordException implements Exception {
  final String message;
  const AddWordException(this.message);
  @override
  String toString() => 'AddWordException: $message';
}
