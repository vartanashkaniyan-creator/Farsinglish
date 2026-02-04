import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// این ایمپورت بعداً جایگزین می‌شود وقتی صفحه اصلی را ساختیم
// import 'features/word/presentation/screens/word_list_screen.dart';
import 'core/constants/app_constants.dart';

void main() {
  // خط زیر برای جلوگیری از خطاهای SQFlite در وب ضروری است
  WidgetsFlutterBinding.ensureInitialized();
  
  runApp(
    // ProviderScope ریشه Riverpod است. همه Providers درون آن کار می‌کنند.
    const ProviderScope(
      child: MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      // از ثابتی که بعداً در app_constants.dart تعریف می‌کنیم استفاده می‌کند
      title: kAppName, // kAppName در فایل بعدی ساخته می‌شود
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      // صفحه اول موقت - بعداً WordListScreen جایگزین می‌شود
      home: const Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.language, size: 64, color: Colors.blue),
              SizedBox(height: 20),
              Text(
                'اپلیکیشن آموزش زبان',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              SizedBox(height: 10),
              Text(
                'هسته پروژه راه‌اندازی شد!',
                style: TextStyle(fontSize: 16, color: Colors.grey),
              ),
              SizedBox(height: 30),
              CircularProgressIndicator(), // نشانگر پیشرفت
            ],
          ),
        ),
      ),
    );
  }
}
