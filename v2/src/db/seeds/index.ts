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
// 从编译后的 dist/src/db/seeds/ 定位到 src/db/seeds/
// 需要向上 4 级: dist/src/db/seeds/ -> dist/src/db/ -> dist/src/ -> dist/ -> src/db/seeds/
const SEED_DIR = join(dirname(__filename), '../../../../src/db/seeds');

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
 * 加载默认 Agent Prompts
 */
export function seedDefaultAgentPrompts(db: AIDatabase, options?: { force?: boolean }): {
  inserted: number;
  skipped: boolean;
  prompts: Array<{ id: string; name: string; type: string }>;
} {
  const result = {
    inserted: 0,
    skipped: false,
    prompts: [] as Array<{ id: string; name: string; type: string }>,
  };

  // 检查是否已初始化
  const row = db.prepare('SELECT COUNT(*) as count FROM employee_agents').get() as { count: number };
  if (row.count > 0 && !options?.force) {
    result.skipped = true;
    return result;
  }

  // 如果强制，先删除现有数据
  if (options?.force) {
    db.exec('DELETE FROM employee_agents');
  }

  // 读取种子数据
  const seedPath = join(SEED_DIR, '002_agent_prompts.sql');
  if (!existsSync(seedPath)) {
    console.error('[Seeds] Agent prompts 种子数据文件不存在:', seedPath);
    return result;
  }

  const sql = readFileSync(seedPath, 'utf-8');
  db.exec(sql);

  // 获取插入的 prompts
  const prompts = db.prepare('SELECT id, agent_name, task_type FROM employee_agents').all() as any[];
  result.prompts = prompts.map(p => ({ id: p.id, name: p.agent_name, type: p.task_type }));
  result.inserted = prompts.length;

  console.log(`[Seeds] 已初始化 ${prompts.length} 个 Agent Prompts:`);
  for (const prompt of prompts) {
    console.log(`  🤖 ${prompt.name} (${prompt.type})`);
  }

  return result;
}

/**
 * 初始化种子数据（供外部调用）
 */
export function initSeeds(db: AIDatabase): void {
  // 先初始化人类画像（因为 employees 有外键引用 humans）
  const humanResult = seedDefaultHumans(db);
  if (humanResult.skipped) {
    console.log('[Seeds] 人类画像数据已存在，跳过初始化');
  }

  // 再初始化员工数据
  const employeeResult = seedDefaultEmployees(db);
  if (employeeResult.skipped) {
    console.log('[Seeds] 员工数据已存在，跳过初始化');
  }

  // 最后初始化 Agent Prompts
  const promptResult = seedDefaultAgentPrompts(db);
  if (promptResult.skipped) {
    console.log('[Seeds] Agent Prompts 数据已存在，跳过初始化');
  }
}

/**
 * 应用迁移脚本
 */
export function applyMigration(db: AIDatabase, migrationFile: string): boolean {
  try {
    const seedPath = join(SEED_DIR, migrationFile);
    if (!existsSync(seedPath)) {
      console.error(`[Seeds] 迁移文件不存在: ${seedPath}`);
      return false;
    }

    const sql = readFileSync(seedPath, 'utf-8');
    db.exec(sql);

    console.log(`[Seeds] ✅ 迁移已应用: ${migrationFile}`);
    return true;
  } catch (error: any) {
    console.error(`[Seeds] ❌ 迁移失败: ${error.message}`);
    return false;
  }
}
