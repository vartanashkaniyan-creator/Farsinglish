// lib/screens/add.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// اینترفیس قرارداد برای Repository (ISP: جداسازی رابط)
abstract class WordRepository {
  Future<void> addWord({required String english, required String persian});
}

// Provider موقت تا فایل providers.dart ایجاد شود (DIP: وابستگی به انتزاع)
final wordRepositoryProvider = Provider<WordRepository>((ref) {
  // TODO: بعداً با پیاده‌سازی واقعی جایگزین شود
  return _TempWordRepository();
});

// پیاده‌سازی موقت (در فایل جداگانه قرار خواهد گرفت)
class _TempWordRepository implements WordRepository {
  @override
  Future<void> addWord({required String english, required String persian}) async {
    // TODO: بعداً با SQFlite جایگزین شود
    await Future.delayed(const Duration(milliseconds: 300));
    print('کلمه ذخیره شد: $english -> $persian');
  }
}

class AddWordScreen extends ConsumerStatefulWidget {
  const AddWordScreen({super.key});

  @override
  ConsumerState<AddWordScreen> createState() => _AddWordScreenState();
}

class _AddWordScreenState extends ConsumerState<AddWordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _englishController = TextEditingController();
  final _persianController = TextEditingController();

  @override
  void dispose() {
    // حافظه را آزاد کن (اصل کیفیت کد)
    _englishController.dispose();
    _persianController.dispose();
    super.dispose();
  }

  Future<void> _submitForm() async {
    if (!_formKey.currentState!.validate()) return;

    try {
      final repository = ref.read(wordRepositoryProvider);
      await repository.addWord(
        english: _englishController.text.trim(),
        persian: _persianController.text.trim(),
      );

      // پس از موفقیت، فرم را پاک کن و بازگرد
      if (mounted) {
        _formKey.currentState!.reset();
        Navigator.pop(context);
      }
    } catch (error) {
      // مدیریت خطا (قابل تست بودن)
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('خطا در ذخیره‌سازی: $error'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  // DRY: تابع اعتبارسنجی مشترک
  String? _requiredValidator(String? value, String fieldName) {
    if (value == null || value.trim().isEmpty) {
      return 'لطفاً $fieldName را وارد کنید';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Add New Word'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              // SRP: هر TextFormField یک مسئولیت دارد
              TextFormField(
                controller: _englishController,
                decoration: const InputDecoration(
                  labelText: 'English Word',
                  prefixIcon: Icon(Icons.language),
                  border: OutlineInputBorder(),
                ),
                validator: (value) => _requiredValidator(value, 'کلمه انگلیسی'),
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 20),
              TextFormField(
                controller: _persianController,
                decoration: const InputDecoration(
                  labelText: 'Persian Meaning',
                  prefixIcon: Icon(Icons.translate),
                  border: OutlineInputBorder(),
                ),
                validator: (value) => _requiredValidator(value, 'معنی فارسی'),
              ),
              const SizedBox(height: 30),
              // OCP: می‌توان دکمه‌های بیشتری اضافه کرد بدون تغییر ساختار
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _submitForm,
                  icon: const Icon(Icons.save),
                  label: const Text('Save Word'),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              // KISS: راهنمای ساده
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(12.0),
                  child: Text(
                    '💡 Tip: Enter the exact English word and its most common Persian meaning.',
                    style: TextStyle(fontSize: 14),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
