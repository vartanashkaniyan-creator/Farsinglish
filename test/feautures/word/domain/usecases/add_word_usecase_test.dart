import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:english_learning_app/features/word/domain/usecases/add_word_usecase.dart';
import 'package:english_learning_app/features/word/domain/repositories/word_repository.dart';
import 'package:english_learning_app/features/word/domain/entities/word_entity.dart';
import 'add_word_usecase_test.mocks.dart';

@GenerateMocks([WordRepository])
void main() {
  late MockWordRepository mockWordRepository;
  late AddWordUseCase addWordUseCase;

  setUp(() {
    mockWordRepository = MockWordRepository();
    addWordUseCase = AddWordUseCase(mockWordRepository);
  });

  group('افزودن کلمه موفقیت‌آمیز', () {
    test('باید کلمه را با داده معتبر به ریپازیتوری اضافه کند', () async {
      // Arrange
      const testId = 1;
      when(mockWordRepository.addWord(any)).thenAnswer((_) async => testId);

      // Act
      final result = await addWordUseCase.execute(
        english: 'hello',
        persian: 'سلام',
      );

      // Assert
      expect(result, testId);
      verify(mockWordRepository.addWord(any)).called(1);
      
      // بررسی اینکه WordEntity صحیح ایجاد شده
      final capturedWord = verify(mockWordRepository.addWord(captureAny)).captured[0] as WordEntity;
      expect(capturedWord.english, 'hello');
      expect(capturedWord.persian, 'سلام');
      expect(capturedWord.difficultyLevel, 1); // مقدار پیش‌فرض
      expect(capturedWord.isValid, isTrue);
    });

    test('باید کلمه را با مثال و سطح دشواری اضافه کند', () async {
      // Arrange
      when(mockWordRepository.addWord(any)).thenAnswer((_) async => 2);

      // Act
      final result = await addWordUseCase.execute(
        english: 'book',
        persian: 'کتاب',
        exampleSentence: 'I read a book',
        difficultyLevel: 3,
      );

      // Assert
      expect(result, 2);
      final capturedWord = verify(mockWordRepository.addWord(captureAny)).captured[0] as WordEntity;
      expect(capturedWord.exampleSentence, 'I read a book');
      expect(capturedWord.difficultyLevel, 3);
    });
  });

  group('اعتبارسنجی ورودی‌ها', () {
    test('باید برای متن انگلیسی خالی خطا بدهد', () {
      // Act & Assert
      expect(
        () async => await addWordUseCase.execute(english: '', persian: 'سلام'),
        throwsA(isA<AddWordException>()),
      );
    });

    test('باید برای متن فارسی خالی خطا بدهد', () {
      expect(
        () async => await addWordUseCase.execute(english: 'hello', persian: ''),
        throwsA(isA<AddWordException>()),
      );
    });

    test('باید برای متن انگلیسی طولانی خطا بدهد', () {
      final longText = 'a' * 101;
      expect(
        () async => await addWordUseCase.execute(english: longText, persian: 'سلام'),
        throwsA(isA<AddWordException>()),
      );
    });

    test('باید برای متن فارسی طولانی خطا بدهد', () {
      final longText = 'ب' * 151;
      expect(
        () async => await addWordUseCase.execute(english: 'hello', persian: longText),
        throwsA(isA<AddWordException>()),
      );
    });

    test('باید برای سطح دشواری کمتر از 1 خطا بدهد', () {
      expect(
        () async => await addWordUseCase.execute(
          english: 'hello',
          persian: 'سلام',
          difficultyLevel: 0,
        ),
        throwsA(isA<AddWordException>()),
      );
    });

    test('باید برای سطح دشواری بیشتر از 5 خطا بدهد', () {
      expect(
        () async => await addWordUseCase.execute(
          english: 'hello',
          persian: 'سلام',
          difficultyLevel: 6,
        ),
        throwsA(isA<AddWordException>()),
      );
    });
  });

  group('خطاهای ریپازیتوری', () {
    test('باید خطای DuplicateWordException را به AddWordException تبدیل کند', () {
      // Arrange
      when(mockWordRepository.addWord(any)).thenThrow(
        const DuplicateWordException('hello'),
      );

      // Act & Assert
      expect(
        () async => await addWordUseCase.execute(english: 'hello', persian: 'سلام'),
        throwsA(
          predicate<AddWordException>((e) => e.toString().contains('از قبل وجود دارد')),
        ),
      );
    });

    test('باید خطای InvalidWordDataException را به AddWordException تبدیل کند', () {
      when(mockWordRepository.addWord(any)).thenThrow(
        const InvalidWordDataException('english'),
      );

      expect(
        () async => await addWordUseCase.execute(english: 'hello', persian: 'سلام'),
        throwsA(isA<AddWordException>()),
      );
    });

    test('باید خطاهای عمومی ریپازیتوری را به AddWordException تبدیل کند', () {
      when(mockWordRepository.addWord(any)).thenThrow(
        Exception('خطای دیتابیس'),
      );

      expect(
        () async => await addWordUseCase.execute(english: 'hello', persian: 'سلام'),
        throwsA(
          predicate<AddWordException>((e) => e.toString().contains('خطا در افزودن کلمه')),
        ),
      );
    });
  });

  group('تریم کردن فضاهای خالی', () {
    test('باید فضاهای خالی ابتدا و انتهای متن را تریم کند', () async {
      // Arrange
      when(mockWordRepository.addWord(any)).thenAnswer((_) async => 1);

      // Act
      await addWordUseCase.execute(
        english: '  hello  ',
        persian: '  سلام  ',
        exampleSentence: '  example  ',
      );

      // Assert
      final capturedWord = verify(mockWordRepository.addWord(captureAny)).captured[0] as WordEntity;
      expect(capturedWord.english, 'hello');
      expect(capturedWord.persian, 'سلام');
      expect(capturedWord.exampleSentence, 'example');
    });
  });
}
