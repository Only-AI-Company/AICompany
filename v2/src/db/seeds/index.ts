/**
 * AI Company v2 - 种子数据加载器
 *
 * 加载默认员工数据
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { AIDatabase } from '../Database.js';

const __filename = fileURLToPath(import.meta.url);
// 从编译后的 dist/db/seeds/ 定位到 src/db/seeds/
const SEED_DIR = join(dirname(__filename), '../../../src/db/seeds');

/**
 * 加载默认员工
 */
export function seedDefaultEmployees(db: AIDatabase, options?: { force?: boolean }): {
  inserted: number;
  skipped: boolean;
  employees: Array<{ id: string; name: string; role: string }>;
} {
  const result = {
    inserted: 0,
    skipped: false,
    employees: [] as Array<{ id: string; name: string; role: string }>,
  };

  // 检查是否已初始化
  const row = db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number };
  if (row.count > 0 && !options?.force) {
    result.skipped = true;
    return result;
  }

  // 如果强制，先删除现有员工
  if (options?.force) {
    db.exec('DELETE FROM employees');
  }

  // 读取种子数据
  const seedPath = join(SEED_DIR, '001_employees.sql');
  if (!existsSync(seedPath)) {
    console.error('[Seeds] 种子数据文件不存在:', seedPath);
    return result;
  }

  const sql = readFileSync(seedPath, 'utf-8');
  db.exec(sql);

  // 获取插入的员工
  const employees = db.listEmployees({ status: 'active' });
  result.employees = employees;
  result.inserted = employees.length;

  console.log(`[Seeds] 已初始化 ${employees.length} 个员工:`);
  for (const emp of employees) {
    console.log(`  ✅ ${emp.role} - ${emp.name} (${emp.id})`);
  }

  return result;
}

/**
 * 加载默认人类画像
 */
export function seedDefaultHumans(db: AIDatabase, options?: { force?: boolean }): {
  inserted: number;
  skipped: boolean;
  humans: Array<{ id: string; name: string; location: string }>;
} {
  const result = {
    inserted: 0,
    skipped: false,
    humans: [] as Array<{ id: string; name: string; location: string }>,
  };

  // 检查是否已初始化
  const row = db.prepare('SELECT COUNT(*) as count FROM humans').get() as { count: number };
  if (row.count > 0 && !options?.force) {
    result.skipped = true;
    return result;
  }

  // 如果强制，先删除现有数据
  if (options?.force) {
    db.exec('DELETE FROM humans');
  }

  // 读取种子数据
  const seedPath = join(SEED_DIR, '001_humans.sql');
  if (!existsSync(seedPath)) {
    console.error('[Seeds] 人类画像种子数据文件不存在:', seedPath);
    return result;
  }

  const sql = readFileSync(seedPath, 'utf-8');
  db.exec(sql);

  // 获取插入的人类
  const humans = db.prepare('SELECT id, name, location FROM humans').all() as any[];
  result.humans = humans;
  result.inserted = humans.length;

  console.log(`[Seeds] 已初始化 ${humans.length} 个人类画像:`);
  for (const human of humans.slice(0, 5)) {
    console.log(`  👤 ${human.name} (${human.location})`);
  }
  if (humans.length > 5) {
    console.log(`  ... 还有 ${humans.length - 5} 个`);
  }

  return result;
}

/**
 * 初始化种子数据（供外部调用）
 */
export function initSeeds(db: AIDatabase): void {
  const employeeResult = seedDefaultEmployees(db);
  if (employeeResult.skipped) {
    console.log('[Seeds] 员工数据已存在，跳过初始化');
  }

  const humanResult = seedDefaultHumans(db);
  if (humanResult.skipped) {
    console.log('[Seeds] 人类画像数据已存在，跳过初始化');
  }
}
