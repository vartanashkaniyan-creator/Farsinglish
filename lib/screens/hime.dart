// lib/screens/home.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'add.dart';
import 'list.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('English Learning App'),
        elevation: 4,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // SRP: این بخش فقط UI را نمایش می‌دهد، منطق کسب‌وکار ندارد
            _buildFeatureCard(
              context,
              icon: Icons.add_circle,
              title: 'Add New Word',
              subtitle: 'Add English words with Persian meanings',
              onTap: () => _navigateToAddScreen(context),
            ),
            const SizedBox(height: 16),
            _buildFeatureCard(
              context,
              icon: Icons.list_alt,
              title: 'Word List',
              subtitle: 'View and manage your word collection',
              onTap: () => _navigateToListScreen(context),
            ),
            const SizedBox(height: 16),
            _buildFeatureCard(
              context,
              icon: Icons.repeat,
              title: 'Review',
              subtitle: 'Practice with SRS algorithm',
              onTap: () => _showComingSoon(context),
            ),
          ],
        ),
      ),
      // KISS: تنها یک floating action button ساده برای دسترسی سریع
      floatingActionButton: FloatingActionButton(
        onPressed: () => _navigateToAddScreen(context),
        child: const Icon(Icons.add),
      ),
    );
  }

  // DRY: تابع helper برای ایجاد کارت‌های یکسان
  Widget _buildFeatureCard(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Card(
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            children: [
              Icon(icon, size: 40, color: Theme.of(context).primaryColor),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: Colors.grey[600],
                          ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.grey),
            ],
          ),
        ),
      ),
    );
  }

  // SRP: هر تابع یک وظیفه مشخص دارد
  void _navigateToAddScreen(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => const AddWordScreen()),
    );
  }

  void _navigateToListScreen(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => const WordListScreen()),
    );
  }

  void _showComingSoon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Review feature coming soon!'),
        duration: Duration(seconds: 2),
      ),
    );
  }
}
