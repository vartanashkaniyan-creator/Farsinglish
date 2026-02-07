// lib/providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'models.dart';
import 'repo.dart';

// ============================================
// STATE CLASSES (SRP: هر State یک مسئولیت دارد)
// ============================================

/// حالت لیست کلمات - فقط داده‌های مربوط به لیست را نگه می‌دارد
class WordListState {
  final List<Word> words;
  final bool isLoading;
  final String? error;

  const WordListState({
    this.words = const [],
    this.isLoading = false,
    this.error,
  });

  /// LSP: ایجاد state جدید با حفظ قابلیت جایگزینی
  WordListState copyWith({
    List<Word>? words,
    bool? isLoading,
    String? error,
  }) {
    return WordListState(
      words: words ?? this.words,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

/// حالت جستجو - SRP: فقط مدیریت وضعیت جستجو
class SearchState {
  final List<Word> results;
  final bool isSearching;
  final String query;

  const SearchState({
    this.results = const [],
    this.isSearching = false,
    this.query = '',
  });

  SearchState copyWith({
    List<Word>? results,
    bool? isSearching,
    String? query,
  }) {
    return SearchState(
      results: results ?? this.results,
      isSearching: isSearching ?? this.isSearching,
      query: query ?? this.query,
    );
  }
}

/// حالت مرور SRS - قابل تست بودن: state جدا از منطق
class ReviewState {
  final List<Word> dueWords;
  final Word? currentWord;
  final bool isReviewing;
  final int reviewedCount;

  const ReviewState({
    this.dueWords = const [],
    this.currentWord,
    this.isReviewing = false,
    this.reviewedCount = 0,
  });

  ReviewState copyWith({
    List<Word>? dueWords,
    Word? currentWord,
    bool? isReviewing,
    int? reviewedCount,
  }) {
    return ReviewState(
      dueWords: dueWords ?? this.dueWords,
      currentWord: currentWord ?? this.currentWord,
      isReviewing: isReviewing ?? this.isReviewing,
      reviewedCount: reviewedCount ?? this.reviewedCount,
    );
  }
}

// ============================================
// STATENOTIFIERS (OCP: باز برای گسترش)
// ============================================

/// ISP: StateNotifier برای مدیریت لیست کلمات
class WordListNotifier extends StateNotifier<WordListState> {
  final WordRepository _repository;

  /// DIP: وابستگی از طریق constructor تزریق می‌شود
  WordListNotifier(this._repository) : super(const WordListState()) {
    loadWords();
  }

  Future<void> loadWords() async {
    state = state.copyWith(isLoading: true, error: null);
    
    try {
      final words = await _repository.getAllWords();
      state = state.copyWith(words: words, isLoading: false);
    } on Failure catch (e) {
      state = state.copyWith(error: e.message, isLoading: false);
    }
  }

  Future<void> addWord(AddWordParams params) async {
    final newWord = Word(
      id: 0, // توسط دیتابیس پر می‌شود
      english: params.english,
      persian: params.persian,
      example: params.example,
      createdAt: DateTime.now(),
      nextReview: DateTime.now(),
      interval: 1,
      easeFactor: 2.5,
      reviewCount: 0,
    );

    try {
      await _repository.addWord(newWord);
      await loadWords(); // DRY: استفاده مجدد از منطق بارگذاری
    } on Failure catch (e) {
      state = state.copyWith(error: e.message);
      rethrow;
    }
  }

  Future<void> deleteWord(int id) async {
    try {
      await _repository.deleteWord(id);
      final newWords = state.words.where((w) => w.id != id).toList();
      state = state.copyWith(words: newWords);
    } on Failure catch (e) {
      state = state.copyWith(error: e.message);
      rethrow;
    }
  }

  Future<void> updateWord(UpdateWordParams params) async {
    try {
      final existingWord = state.words.firstWhere((w) => w.id == params.id);
      final updatedWord = existingWord.copyWith(
        english: params.english,
        persian: params.persian,
        example: params.example,
      );
      
      await _repository.updateWord(updatedWord);
      await loadWords();
    } on Failure catch (e) {
      state = state.copyWith(error: e.message);
      rethrow;
    }
  }
}

/// ISP: StateNotifier جداگانه برای جستجو
class SearchNotifier extends StateNotifier<SearchState> {
  final SearchRepository _repository;

  SearchNotifier(this._repository) : super(const SearchState());

  Future<void> search(String query) async {
    if (query.isEmpty) {
      state = const SearchState();
      return;
    }

    state = state.copyWith(isSearching: true, query: query);
    
    try {
      final results = await _repository.searchWords(query);
      state = state.copyWith(results: results, isSearching: false);
    } on Failure catch (e) {
      state = state.copyWith(isSearching: false);
      rethrow;
    }
  }

  void clearSearch() {
    state = const SearchState();
  }
}

/// ISP: StateNotifier جداگانه برای مرور SRS
class ReviewNotifier extends StateNotifier<ReviewState> {
  final SrsRepository _repository;
  final WordRepository _wordRepository;

  ReviewNotifier(this._repository, this._wordRepository)
      : super(const ReviewState()) {
    loadDueWords();
  }

  Future<void> loadDueWords() async {
    try {
      final dueWords = await _wordRepository.getWordsDueForReview();
      state = state.copyWith(dueWords: dueWords);
    } on Failure catch (e) {
      // قابل تست بودن: خطاها throw می‌شوند
      rethrow;
    }
  }

  Future<void> startReview() async {
    final dueWords = state.dueWords;
    if (dueWords.isEmpty) return;

    state = state.copyWith(
      currentWord: dueWords.first,
      isReviewing: true,
    );
  }

  Future<void> submitReview(int quality) async {
    final currentWord = state.currentWord;
    if (currentWord == null) return;

    try {
      await _repository.updateReview(currentWord, quality);
      
      final updatedDueWords = state.dueWords.skip(1).toList();
      final nextWord = updatedDueWords.isNotEmpty ? updatedDueWords.first : null;
      
      state = state.copyWith(
        dueWords: updatedDueWords,
        currentWord: nextWord,
        reviewedCount: state.reviewedCount + 1,
        isReviewing: nextWord != null,
      );
    } on Failure catch (e) {
      rethrow;
    }
  }

  void endReview() {
    state = state.copyWith(
      isReviewing: false,
      currentWord: null,
    );
  }
}

// ============================================
// PROVIDERS (DIP: وابستگی به انتزاع‌ها)
// ============================================

final wordListNotifierProvider = StateNotifierProvider<WordListNotifier, WordListState>(
  (ref) {
    // DIP: وابستگی به WordRepository انتزاعی
    final repository = ref.watch(wordRepositoryProvider);
    return WordListNotifier(repository);
  },
);

final searchNotifierProvider = StateNotifierProvider<SearchNotifier, SearchState>(
  (ref) {
    // ISP: فقط به SearchRepository مورد نیاز وابسته است
    final repository = ref.watch(searchRepositoryProvider);
    return SearchNotifier(repository);
  },
);

final reviewNotifierProvider = StateNotifierProvider<ReviewNotifier, ReviewState>(
  (ref) {
    // DIP: وابستگی به دو انتزاع مختلف
    final srsRepository = ref.watch(srsRepositoryProvider);
    final wordRepository = ref.watch(wordRepositoryProvider);
    return ReviewNotifier(srsRepository, wordRepository);
  },
);

// ============================================
// UTILITY PROVIDERS (برای computed values)
// ============================================

/// DRY: Provider برای آمار مرور - از داده‌های موجود استفاده می‌کند
final reviewStatsProvider = FutureProvider<Map<ReviewStatus, int>>(
  (ref) async {
    final repository = ref.watch(srsRepositoryProvider);
    return await repository.getReviewStats();
  },
);

/// Provider برای کلمات نیازمند مرور فوری
final urgentReviewWordsProvider = Provider<List<Word>>(
  (ref) {
    final wordListState = ref.watch(wordListNotifierProvider);
    
    return wordListState.words.where((word) {
      return word.reviewStatus == ReviewStatus.overdue;
    }).toList();
  },
);

/// Provider برای تعداد کل کلمات
final totalWordsCountProvider = Provider<int>(
  (ref) {
    final wordListState = ref.watch(wordListNotifierProvider);
    return wordListState.words.length;
  },
);
