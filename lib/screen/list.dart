// lib/screens/list.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// ISP: گسترش رابط WordRepository با متدهای مورد نیاز لیست (بدنبال تغییر رابط قبلی)
abstract class WordRepository {
  Future<void> addWord({required String english, required String persian});
  Future<List<Word>> getAllWords();
  Future<void> deleteWord(int id);
}

// LSP: مدل Word که می‌تواند در لیست و سایر بخش‌ها جایگزین شود
class Word {
  final int id;
  final String english;
  final String persian;
  final DateTime createdAt;

  Word({
    required this.id,
    required this.english,
    required this.persian,
    required this.createdAt,
  });

  // جایگزینی ایمن (LSP) با ایجاد کپی با مقادیر جدید
  Word copyWith({
    int? id,
    String? english,
    String? persian,
    DateTime? createdAt,
  }) {
    return Word(
      id: id ?? this.id,
      english: english ?? this.english,
      persian: persian ?? this.persian,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

// Provider به‌روزشده برای لیست
final wordRepositoryProvider = Provider<WordRepository>((ref) {
  return _TempWordRepository();
});

// پیاده‌سازی موقت با قابلیت‌های جدید
class _TempWordRepository implements WordRepository {
  final List<Word> _words = [];
  int _nextId = 1;

  @override
  Future<void> addWord({required String english, required String persian}) async {
    await Future.delayed(const Duration(milliseconds: 200));
    _words.add(Word(
      id: _nextId++,
      english: english,
      persian: persian,
      createdAt: DateTime.now(),
    ));
  }

  @override
  Future<List<Word>> getAllWords() async {
    await Future.delayed(const Duration(milliseconds: 150));
    return List<Word>.from(_words); // بازگرداندن کپی برای ایمنی (LSP)
  }

  @override
  Future<void> deleteWord(int id) async {
    await Future.delayed(const Duration(milliseconds: 100));
    _words.removeWhere((word) => word.id == id);
  }
}

// StateNotifier برای مدیریت حالت لیست (تک‌وظیفگی)
class WordListStateNotifier extends StateNotifier<List<Word>> {
  final WordRepository repository;

  WordListStateNotifier(this.repository) : super([]) {
    loadWords();
  }

  Future<void> loadWords() async {
    try {
      final words = await repository.getAllWords();
      state = words;
    } catch (error) {
      // قابل تست بودن: خطا را می‌توان در تست‌ها شبیه‌سازی کرد
      rethrow;
    }
  }

  Future<void> deleteWord(int id) async {
    await repository.deleteWord(id);
    await loadWords(); // بارگذاری مجدد پس از تغییر
  }
}

// Provider برای StateNotifier
final wordListProvider = StateNotifierProvider<WordListStateNotifier, List<Word>>(
  (ref) {
    final repository = ref.watch(wordRepositoryProvider);
    return WordListStateNotifier(repository);
  },
);

class WordListScreen extends ConsumerWidget {
  const WordListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final words = ref.watch(wordListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Word List'),
        actions: [
          // OCP: می‌توان actions جدید اضافه کرد بدون تغییر ساختار
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(wordListProvider.notifier).loadWords(),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: words.isEmpty
          ? _buildEmptyState()
          : _buildWordList(words, ref, context),
    );
  }

  // SRP: نمایش حالت خالی
  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.list_alt,
            size: 80,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 20),
          const Text(
            'No words yet',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 10),
          const Text(
            'Add your first word using the + button',
            style: TextStyle(color: Colors.grey),
          ),
        ],
      ),
    );
  }

  // DRY: جداسازی منطق ساخت آیتم لیست
  Widget _buildWordList(List<Word> words, WidgetRef ref, BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: words.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final word = words[index];
        return _buildWordCard(word, ref, context);
      },
    );
  }

  Widget _buildWordCard(Word word, WidgetRef ref, BuildContext context) {
    return Dismissible(
      key: Key('word_${word.id}'),
      direction: DismissDirection.endToStart,
      background: Container(
        color: Colors.red,
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        child: const Icon(Icons.delete, color: Colors.white),
      ),
      confirmDismiss: (direction) async {
        // قابل تست بودن: تابع تأیید حذف
        return await _showDeleteConfirmation(context);
      },
      onDismissed: (direction) {
        ref.read(wordListProvider.notifier).deleteWord(word.id);
      },
      child: Card(
        elevation: 2,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      word.english,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  // KISS: نمایش ساده تاریخ
                  Text(
                    _formatDate(word.createdAt),
                    style: const TextStyle(
                      fontSize: 12,
                      color: Colors.grey,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                word.persian,
                style: const TextStyle(fontSize: 16),
              ),
              const SizedBox(height: 4),
              // YAGNI: فعلاً فقط اطلاعات پایه نمایش داده می‌شود
              Row(
                children: [
                  Icon(
                    Icons.circle,
                    size: 12,
                    color: Colors.green[400],
                  ),
                  const SizedBox(width: 6),
                  const Text(
                    'New',
                    style: TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  // DRY: تابع کمکی برای فرمت تاریخ
  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  // SRP: تابع جداگانه برای نمایش دیالوگ تأیید
  Future<bool> _showDeleteConfirmation(BuildContext context) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Word'),
        content: const Text('Are you sure you want to delete this word?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text(
              'Delete',
              style: TextStyle(color: Colors.red),
            ),
          ),
        ],
      ),
    );
    return result ?? false;
  }
}
