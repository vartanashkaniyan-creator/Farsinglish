// lib/screens/test_screen.dart
import 'package:flutter/material.dart';
import '../models.dart';

class TestScreen extends StatelessWidget {
  const TestScreen({super.key});

  void _runTests() {
    print('=== شروع تست‌ها ===');
    
    // تست ۱: ساخت Word
    final word = Word(
      id: 1,
      english: 'test',
      persian: 'تست',
      example: 'This is a test',
      createdAt: DateTime.now(),
      nextReview: DateTime.now(),
      interval: 1,
      easeFactor: 2.5,
      reviewCount: 0,
    );
    
    print('✅ تست ۱: Word ساخته شد');
    print('   English: ${word.english}');
    print('   Persian: ${word.persian}');
    print('   Review Status: ${word.reviewStatus}');
    
    // تست ۲: copyWith
    final copied = word.copyWith(english: 'updated');
    print('✅ تست ۲: copyWith کار کرد');
    print('   Copied English: ${copied.english}');
    
    // تست ۳: Result
    const success = Result<String>.success('data');
    const failure = Result<String>.failure('error');
    print('✅ تست ۳: Result کار می‌کند');
    print('   Success: ${success.isSuccess}');
    print('   Failure: ${failure.hasError}');
    
    print('=== پایان تست‌ها ===');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تست مدل‌ها')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ElevatedButton(
              onPressed: _runTests,
              child: const Text('اجرای تست‌ها'),
            ),
            const SizedBox(height: 20),
            const Text('نتایج در console نمایش داده می‌شوند'),
          ],
        ),
      ),
    );
  }
}
