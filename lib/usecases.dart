// lib/usecases.dart

// ============================================
// BASE USE CASE (OCP: باز برای گسترش)
// ============================================

/// پایه انتزاعی برای همه UseCaseها (DIP: وابستگی به این انتزاع)
abstract class UseCase<Type, Params> {
  Future<Result<Type>> execute(Params params);
}

/// برای UseCaseهایی که نیازی به پارامتر ندارند
abstract class NoParamUseCase<Type> {
  Future<Result<Type>> execute();
}

// ============================================
// PARAM CLASSES (SRP: فقط نگهداری پارامترها)
// ============================================

/// پارامترهای خاص AddWordUseCase
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

/// پارامترهای خاص UpdateWordUseCase
class UpdateWordParams {
  final int id;
  final String english;
  final String persian;
  final String example;

  const UpdateWordParams({
    required this.id,
    required this.english,
    required this.persian,
    this.example = '',
  });
}

/// پارامترهای خاص UpdateReviewUseCase
class UpdateReviewParams {
  final int wordId;
  final int quality; // 0-5 طبق الگوریتم SM-2

  const UpdateReviewParams({
    required this.wordId,
    required this.quality,
  });
}

/// پارامترهای خاص SearchWordsUseCase
class SearchWordsParams {
  final String query;
  final bool matchEnglish;
  final bool matchPersian;
  final bool matchExample;

  const SearchWordsParams({
    required this.query,
    this.matchEnglish = true,
    this.matchPersian = true,
    this.matchExample = false,
  });
}

// ============================================
// USE CASE IMPLEMENTATIONS (یک مسئولیت هر UseCase)
// ============================================

/// SRP: فقط اضافه کردن کلمه جدید
class AddWordUseCase implements UseCase<int, AddWordParams> {
  final WordRepository repository;

  /// DIP: وابستگی از طریق constructor تزریق می‌شود
  AddWordUseCase(this.repository);

  @override
  Future<Result<int>> execute(AddWordParams params) async {
    try {
      // اعتبارسنجی کسب‌وکار (قابل تست بودن)
      if (params.english.trim().isEmpty) {
        return Result.failure('کلمه انگلیسی نمی‌تواند خالی باشد');
      }

      if (params.persian.trim().isEmpty) {
        return Result.failure('معنی فارسی نمی‌تواند خالی باشد');
      }

      // ایجاد موجودیت جدید
      final word = Word(
        id: 0,
        english: params.english.trim(),
        persian: params.persian.trim(),
        example: params.example.trim(),
        createdAt: DateTime.now(),
        nextReview: DateTime.now(),
        interval: 1,
        easeFactor: 2.5,
        reviewCount: 0,
      );

      final id = await repository.addWord(word);
      return Result.success(id);
    } on Failure catch (e) {
      return Result.failure(e.message);
    } catch (e) {
      return Result.failure('خطای ناشناخته: $e');
    }
  }
}

/// SRP: فقط دریافت تمام کلمات
class GetAllWordsUseCase implements NoParamUseCase<List<Word>> {
  final WordRepository repository;

  GetAllWordsUseCase(this.repository);

  @override
  Future<Result<List<Word>>> execute() async {
    try {
      final words = await repository.getAllWords();
      return Result.success(words);
    } on Failure catch (e) {
      return Result.failure(e.message);
    }
  }
}

/// SRP: فقط دریافت کلمه بر اساس ID
class GetWordByIdUseCase implements UseCase<Word, int> {
  final WordRepository repository;

  GetWordByIdUseCase(this.repository);

  @override
  Future<Result<Word>> execute(int params) async {
    try {
      final word = await repository.getWordById(params);
      if (word == null) {
        return Result.failure('کلمه پیدا نشد');
      }
      return Result.success(word);
    } on Failure catch (e) {
      return Result.failure(e.message);
    }
  }
}

/// SRP: فقط به‌روزرسانی کلمه
class UpdateWordUseCase implements UseCase<void, UpdateWordParams> {
  final WordRepository repository;

  UpdateWordUseCase(this.repository);

  @override
  Future<Result<void>> execute(UpdateWordParams params) async {
    try {
      // دریافت کلمه موجود
      final currentWord = await repository.getWordById(params.id);
      if (currentWord == null) {
        return Result.failure('کلمه برای به‌روزرسانی پیدا نشد');
      }

      // اعتبارسنجی
      if (params.english.trim().isEmpty) {
        return Result.failure('کلمه انگلیسی نمی‌تواند خالی باشد');
      }

      if (params.persian.trim().isEmpty) {
        return Result.failure('معنی فارسی نمی‌تواند خالی باشد');
      }

      // ایجاد نسخه به‌روزشده
      final updatedWord = currentWord.copyWith(
        english: params.english.trim(),
        persian: params.persian.trim(),
        example: params.example.trim(),
      );

      await repository.updateWord(updatedWord);
      return const Result.success(null);
    } on Failure catch (e) {
      return Result.failure(e.message);
    }
  }
}

/// SRP: فقط حذف کلمه
class DeleteWordUseCase implements UseCase<void, int> {
  final WordRepository repository;

  DeleteWordUseCase(this.repository);

  @override
  Future<Result<void>> execute(int params) async {
    try {
      await repository.deleteWord(params);
      return const Result.success(null);
    } on Failure catch (e) {
      return Result.failure(e.message);
    }
  }
}

/// SRP: فقط دریافت کلمات نیازمند مرور
class GetWordsDueForReviewUseCase implements NoParamUseCase<List<Word>> {
  final WordRepository repository;

  GetWordsDueForReviewUseCase(this.repository);

  @override
  Future<Result<List<Word>>> execute() async {
    try {
      final words = await repository.getWordsDueForReview();
      return Result.success(words);
    } on Failure catch (e) {
      return Result.failure(e.message);
    }
  }
}

/// SRP: فقط به‌روزرسانی مرور کلمه (SRS)
class UpdateReviewUseCase implements UseCase<void, UpdateReviewParams> {
  final SrsRepository repository;

  UpdateReviewUseCase(this.repository);

  @override
  Future<Result<void>> execute(UpdateReviewParams params) async {
    try {
      // اعتبارسنجی کیفیت (0-5)
      if (params.quality < 0 || params.quality > 5) {
        return Result.failure('کیفیت باید بین ۰ تا ۵ باشد');
      }

      // در پروژه واقعی، کلمه باید دریافت شود
      // فعلاً فقط برای نشان دادن ساختار
      return Result.failure('این use case نیاز به تکمیل دارد');
    } on Failure catch (e) {
      return Result.failure(e.message);
    }
  }
}

/// SRP: فقط دریافت آمار مرور
class GetReviewStatsUseCase implements NoParamUseCase<Map<ReviewStatus, int>> {
  final SrsRepository repository;

  GetReviewStatsUseCase(this.repository);

  @override
  Future<Result<Map<ReviewStatus, int>>> execute() async {
    try {
      final stats = await repository.getReviewStats();
      return Result.success(stats);
    } on Failure catch (e) {
      return Result.failure(e.message);
    }
  }
}

/// SRP: فقط جستجوی کلمات
class SearchWordsUseCase implements UseCase<List<Word>, SearchWordsParams> {
  final SearchRepository repository;

  SearchWordsUseCase(this.repository);

  @override
  Future<Result<List<Word>>> execute(SearchWordsParams params) async {
    try {
      if (params.query.trim().isEmpty) {
        return Result.success([]);
      }

      final words = await repository.searchWords(params.query);
      return Result.success(words);
    } on Failure catch (e) {
      return Result.failure(e.message);
    }
  }
}

// ============================================
// USE CASE PROVIDERS (DIP: وابستگی به انتزاع‌ها)
// ============================================

final addWordUseCaseProvider = Provider<AddWordUseCase>((ref) {
  final repository = ref.watch(wordRepositoryProvider);
  return AddWordUseCase(repository);
});

final getAllWordsUseCaseProvider = Provider<GetAllWordsUseCase>((ref) {
  final repository = ref.watch(wordRepositoryProvider);
  return GetAllWordsUseCase(repository);
});

final getWordByIdUseCaseProvider = Provider<GetWordByIdUseCase>((ref) {
  final repository = ref.watch(wordRepositoryProvider);
  return GetWordByIdUseCase(repository);
});

final updateWordUseCaseProvider = Provider<UpdateWordUseCase>((ref) {
  final repository = ref.watch(wordRepositoryProvider);
  return UpdateWordUseCase(repository);
});

final deleteWordUseCaseProvider = Provider<DeleteWordUseCase>((ref) {
  final repository = ref.watch(wordRepositoryProvider);
  return DeleteWordUseCase(repository);
});

final getWordsDueForReviewUseCaseProvider = Provider<GetWordsDueForReviewUseCase>((ref) {
  final repository = ref.watch(wordRepositoryProvider);
  return GetWordsDueForReviewUseCase(repository);
});

final updateReviewUseCaseProvider = Provider<UpdateReviewUseCase>((ref) {
  final repository = ref.watch(srsRepositoryProvider);
  return UpdateReviewUseCase(repository);
});

final getReviewStatsUseCaseProvider = Provider<GetReviewStatsUseCase>((ref) {
  final repository = ref.watch(srsRepositoryProvider);
  return GetReviewStatsUseCase(repository);
});

final searchWordsUseCaseProvider = Provider<SearchWordsUseCase>((ref) {
  final repository = ref.watch(searchRepositoryProvider);
  return SearchWordsUseCase(repository);
});
