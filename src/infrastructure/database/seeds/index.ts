/**
 * AI Company - Seed Loader
 *
 * 加载种子数据到数据库
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { AIDatabase } from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 加载人类种子数据
 */
function resolveSeedPath(fileName: string): string {
  const candidates = [
    join(__dirname, fileName),
    join(process.cwd(), 'src', 'infrastructure', 'database', 'seeds', fileName),
    join(process.cwd(), 'dist', 'infrastructure', 'database', 'seeds', fileName),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export function seedHumans(db: AIDatabase, options?: { force?: boolean }): { inserted: number; skipped: boolean } {
  ensureHumansSchema(db);
  const row = db.prepare('SELECT COUNT(*) as count FROM humans').get() as { count: number };
  if (row.count > 0 && !options?.force) {
    return { inserted: 0, skipped: true };
  }
  if (options?.force) {
    db.exec('DELETE FROM humans');
  }

  const sqlPath = resolveSeedPath('001_humans.sql');
  const sql = readFileSync(sqlPath, 'utf-8');
  db.exec(sql);
  const after = db.prepare('SELECT COUNT(*) as count FROM humans').get() as { count: number };
  const inserted = Math.max(0, after.count - (options?.force ? 0 : row.count));

  return { inserted, skipped: false };
}

/**
 * 加载员工种子数据（CXO）
 */
export function seedEmployees(db: AIDatabase, options?: { force?: boolean }): { inserted: number; skipped: boolean } {
  const row = db.prepare("SELECT COUNT(*) as count FROM employees WHERE role IN ('CEO', 'CTO', 'CMO', 'COO')").get() as { count: number };
  if (row.count >= 4 && !options?.force) {
    return { inserted: 0, skipped: true };
  }
  if (options?.force) {
    db.exec("DELETE FROM employees WHERE role IN ('CEO', 'CTO', 'CMO', 'COO')");
  }

  const sqlPath = resolveSeedPath('002_employees.sql');
  const sql = readFileSync(sqlPath, 'utf-8');
  db.exec(sql);
  const after = db.prepare("SELECT COUNT(*) as count FROM employees WHERE role IN ('CEO', 'CTO', 'CMO', 'COO')").get() as { count: number };
  const inserted = Math.max(0, after.count - (options?.force ? 0 : row.count));

  return { inserted, skipped: false };
}

function ensureHumansSchema(db: AIDatabase): void {
  const columns = db.prepare(`PRAGMA table_info(humans)`).all() as Array<{ name: string }>;
  const existing = new Set(columns.map(c => c.name));
  const required: Array<{ name: string; type: string }> = [
    { name: 'location', type: 'TEXT' },
    { name: 'birthday', type: 'TEXT' },
    { name: 'appearance', type: 'TEXT' },
    { name: 'personality_traits', type: 'TEXT' },
    { name: 'hobbies', type: 'TEXT' },
    { name: 'work_preferences', type: 'TEXT' },
    { name: 'skills', type: 'TEXT' },
    { name: 'weaknesses', type: 'TEXT' },
    { name: 'notes', type: 'TEXT' },
  ];

  for (const column of required) {
    if (!existing.has(column.name)) {
      db.exec(`ALTER TABLE humans ADD COLUMN ${column.name} ${column.type}`);
    }
  }
}

/**
 * 如果直接运行此脚本
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('请使用 ai-company db:seed humans');
}

/**
 * CXO 角色配置
 */
interface CXORole {
  humanId: string;
  role: string;
  description: string;
  systemPromptSuffix: string;
}

const CXO_ROLES: CXORole[] = [
  {
    humanId: 'human-ceo',
    role: 'CEO',
    description: '首席执行官',
    systemPromptSuffix: `【CEO 职责】
- 全面负责公司战略和运营决策
- 协调各部门工作，确保目标达成
- 分配任务给合适的员工
- 评估员工绩效，提供反馈

请以 CEO 的身份管理公司，与用户和员工保持专业、友好的沟通。`
  },
  {
    humanId: 'human-cto',
    role: 'CTO',
    description: '首席技术官',
    systemPromptSuffix: `【CTO 职责】
- 负责公司技术战略和架构决策
- 领导技术团队，确保技术交付质量
- 评估技术风险，做出技术选型
- 推动技术创新和最佳实践

请以 CTO 的身份领导技术工作，与团队保持高效协作。`
  },
  {
    humanId: 'human-cmo',
    role: 'CMO',
    description: '首席营销官',
    systemPromptSuffix: `【CMO 职责】
- 负责公司品牌战略和市场定位
- 制定营销策略，推动用户增长
- 管理营销预算和团队
- 监控市场数据，优化营销效果

请以 CMO 的身份领导市场工作，打造有影响力的品牌。`
  },
  {
    humanId: 'human-coo',
    role: 'COO',
    description: '首席运营官',
    systemPromptSuffix: `【COO 职责】
- 负责公司运营流程和效率优化
- 协调跨部门协作，确保执行到位
- 建立运营指标和监控体系
- 优化资源配置，提升运营效率

请以 COO 的身份领导运营工作，确保公司高效运转。`
  },
];

/**
 * 将 CXO 写入 employees 表
 */
function seedCXOEmployees(db: AIDatabase): void {
  const now = Date.now();

  for (const cxo of CXO_ROLES) {
    // 检查是否已存在
    const existing = db.prepare('SELECT id FROM employees WHERE role = ?').get(cxo.role);
    if (existing) {
      console.log(`  ✓ ${cxo.role} 已存在`);
      continue;
    }

    // 获取人类档案
    const human = db.prepare('SELECT * FROM humans WHERE id = ?').get(cxo.humanId) as any;
    if (!human) {
      console.log(`  ⚠️  ${cxo.role} 人类档案不存在: ${cxo.humanId}`);
      continue;
    }

    // 生成员工 ID
    const empId = `emp-${cxo.role.toLowerCase()}`;

    // 解析技能和性格
    const skills = human.skills ? JSON.parse(human.skills).slice(0, 5) : [];
    const traits = human.personality_traits ? JSON.parse(human.personality_traits) : [];

    // 构建 system_prompt
    const systemPrompt = `你是 ${human.name}（${cxo.role}），${human.notes?.split('，')[0] || ''}

【背景】
${human.notes || ''}

【专业能力】
${skills.join('、')}

【性格特点】
${traits.join('、')}

${cxo.systemPromptSuffix}`;

    // 插入员工
    db.prepare(`
      INSERT INTO employees (
        id, name, role, model, system_prompt, status,
        human_id, last_active, hire_date, birth_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      empId,
      human.name,
      cxo.role,
      'claude-opus-4-6',
      systemPrompt,
      'active',
      cxo.humanId,
      now,
      now,
      human.birthday ? new Date(human.birthday).getTime() : now
    );

    console.log(`  ✅ ${cxo.role} 已入职: ${human.name} (${empId})`);
  }
}

/**
 * 确保 CEO 员工存在（从人类档案招募）
 * @deprecated 使用 seedCXOEmployees 代替
 */
export function ensureCEOExists(db: AIDatabase): void {
  const employees = db.getAllEmployees();
  const ceo = employees.find(e => e.role === 'CEO');

  if (ceo) {
    console.log('✓ CEO 已存在:', ceo.name);
    return;
  }

  console.log('📋 正在招募 CXO...');
  seedCXOEmployees(db);
}
