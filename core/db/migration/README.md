# core/db/migrations

## چی هست؟
یک نقطه ورود برای ثبت و مدیریت migration_stepها در پروژه.  
فایل `index.js` در این مسیر، توابع ثبت و دسترسی به migrationها را فراهم می‌کند.

## چیزایی که داره:
- `register_migration(step)` – ثبت یک migration_step جدید
- `register_migrations(steps)` – ثبت چند migration_step به صورت همزمان
- `get_all_migrations()` – گرفتن لیست همه migration_stepها
- `has_migration(step_id)` – بررسی وجود migration_step با شناسه مشخص

## چیزایی که نداره (عمدی):
- خود migration را اجرا نمی‌کند (این کار `db_migrator.js` انجام می‌دهد)
- با دیتابیس مستقیم کار نمی‌کند
- پاک کردن migration‌ها (`clear_migrations`) فقط برای تست است و در این فایل موجود نیست

## مثال استفاده:

```js
import { migrations } from './core/db/migrations/index.js';

// ثبت یک migration_step
migrations.register_migration({
  step_id: 'v1_create_users',
  migrate: async (db) => {
    // عملیات migration روی دیتابیس
  }
});

// ثبت چند migration_step
migrations.register_migrations([
  { step_id: 'v1_add_roles', migrate: async (db) => {...} },
  { step_id: 'v1_add_permissions', migrate: async (db) => {...} }
]);

// گرفتن همه migration_stepها
const all_migrations = migrations.get_all_migrations();

// بررسی وجود migration
const exists = migrations.has_migration('v1_create_users');
