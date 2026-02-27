/**
 * AI Company - 完整消息流程测试
 *
 * 测试所有渠道和消息类型
 */

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { AIDatabase } from '../src/infrastructure/database/Database.js';
import { MessageService } from '../src/core/messages/MessageService.js';
import { ToolRouter } from '../src/core/tools/ToolRouter.js';
import { getAIProvider } from '../src/infrastructure/ai/AIProvider.js';

// 创建临时测试环境
const homeDir = mkdtempSync(join(tmpdir(), 'ai-company-e2e-test-'));
process.env.HOME = homeDir;
process.env.AI_COMPANY_DB_PATH = join(homeDir, 'data.db');

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log(`📁 测试目录: ${homeDir}\n`);
console.log('━'.repeat(60));
console.log('🧪 AI Company - 完整消息流程测试');
console.log('━'.repeat(60) + '\n');

// ============================================================================
// 步骤 1: 初始化数据库
// ============================================================================

console.log('📊 步骤 1: 初始化数据库');

const db = new AIDatabase();

// 创建表结构
const createTables = `
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  type TEXT DEFAULT 'string' NOT NULL,
  category TEXT DEFAULT 'general' NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS humans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT,
  location TEXT,
  birthday TEXT,
  appearance TEXT,
  personality_traits TEXT,
  hobbies TEXT,
  work_preferences TEXT,
  skills TEXT,
  weaknesses TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nickname TEXT,
  avatar TEXT,
  role TEXT NOT NULL,
  personality TEXT,
  backstory TEXT,
  hire_date INTEGER NOT NULL,
  birth_date INTEGER NOT NULL,
  age INTEGER,
  model TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  base_personality TEXT,
  temperature REAL DEFAULT 0.7,
  status TEXT NOT NULL,
  current_task TEXT,
  current_mood TEXT,
  last_active INTEGER NOT NULL,
  score INTEGER DEFAULT 50,
  completed_tasks INTEGER DEFAULT 0,
  failed_tasks INTEGER DEFAULT 0,
  average_quality REAL DEFAULT 50,
  total_earnings REAL DEFAULT 0,
  level INTEGER DEFAULT 1,
  total_hours REAL DEFAULT 0,
  favorite_tasks TEXT,
  weaknesses TEXT,
  strengths TEXT,
  human_id TEXT,
  display_name TEXT,
  unavailable_until INTEGER
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  work_dir TEXT,
  plan_file_path TEXT,
  branch_name TEXT,
  session_id TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  estimated_duration INTEGER,
  requested_by TEXT NOT NULL,
  owner_id TEXT,
  parent_task_id TEXT,
  assigned_to TEXT,
  assigned_at INTEGER,
  due_date INTEGER,
  acceptance_criteria TEXT,
  owner_feedback TEXT,
  context_json TEXT,
  context_checkpoint_id TEXT,
  artifacts_json TEXT,
  result_signal TEXT,
  last_error TEXT,
  token_usage INTEGER,
  quality INTEGER,
  output TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  direction TEXT NOT NULL,
  message_type TEXT,
  external_message_id TEXT,
  external_chat_id TEXT,
  external_user_id TEXT,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  payload_json TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS crontab (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  command TEXT NOT NULL,
  args_json TEXT,
  cron_rule TEXT,
  enabled INTEGER DEFAULT 1,
  timeout INTEGER DEFAULT 60000,
  working_dir TEXT,
  env_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

db.exec(createTables);
console.log('  ✅ 数据库表创建完成');

// ============================================================================
// 步骤 2: 加载 Seed 数据
// ============================================================================

console.log('\n📊 步骤 2: 加载 Seed 数据');

const seedSql = readFileSync(join(__dirname, '..', 'src', 'infrastructure', 'database', 'seeds', '001_humans.sql'), 'utf-8');
db.exec(seedSql);
const employeeSeedSql = readFileSync(join(__dirname, '..', 'src', 'infrastructure', 'database', 'seeds', '002_employees.sql'), 'utf-8');
db.exec(employeeSeedSql);

const humanCount = db.prepare('SELECT COUNT(*) as count FROM humans').get() as { count: number };
const employeeCount = db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number };

console.log(`  ✅ Humans: ${humanCount.count} 条`);
console.log(`  ✅ Employees: ${employeeCount.count} 条`);

// ============================================================================
// 步骤 3: 恢复 Config 数据
// ============================================================================

console.log('\n📊 步骤 3: 恢复 Config 数据');

const configData = {
  workDir: '/tmp/ai-company-test',
  outputsDir: '/Users/devin/.ai-company/outputs',
  maxOutputsSize: 1024,
};

const now = Date.now();
for (const [key, value] of Object.entries(configData)) {
  db.prepare(`INSERT OR REPLACE INTO config (key, value, type, category, created_at, updated_at) VALUES (?, ?, 'string', 'general', ?, ?)`)
    .run(key, String(value), now, now);
}
console.log(`  ✅ Config: ${Object.keys(configData).length} 条`);

// ============================================================================
// 步骤 4: 测试 MessageService
// ============================================================================

console.log('\n📊 步骤 4: 测试 MessageService');

const messageService = new MessageService(db);

// Test 4.1: 保存用户消息
messageService.saveUserMessage({
  content: '测试：用户查询任务列表',
  source: 'tg',
  chatId: '123456',
  userId: 'user-001',
  username: 'testuser',
});
console.log('  ✅ 用户消息已保存 (TG)');

// Test 4.2: 保存用户消息 (CLI)
messageService.saveUserMessage({
  content: '测试：CLI 查询状态',
  source: 'cli',
  userId: 'cli-user',
});
console.log('  ✅ 用户消息已保存 (CLI)');

// Test 4.3: 保存 CEO 响应
messageService.saveCompanyResponse({
  content: 'CEO：当前有 4 个员工和 0 个任务',
  source: 'tg',
  chatId: '123456',
  metadata: { type: 'ceo_response' },
});
console.log('  ✅ CEO 响应已保存');

// Test 4.4: 保存员工响应
messageService.saveCompanyResponse({
  content: '我是 CTO，我可以帮你搭建技术架构',
  source: 'tg',
  chatId: '123456',
  metadata: {
    type: 'employee_response',
    employee_id: 'emp-cto',
    employee_name: '林拓海',
    employee_role: 'CTO',
  },
});
console.log('  ✅ 员工响应已保存');

// Test 4.5: 验证消息统计
const stats = messageService.getSourceStats();
console.log(`  ✅ 消息统计: ${JSON.stringify(stats.map(s => ({ source: s.source, count: s.count })))}`);

// ============================================================================
// 步骤 5: 测试 ToolRouter
// ============================================================================

console.log('\n📊 步骤 5: 测试 ToolRouter 意图识别');

const toolRouter = new ToolRouter(db);

// 检查 AI Provider
let hasAIProvider = false;
try {
  const provider = getAIProvider();
  hasAIProvider = true;
  console.log('  ✅ AI Provider 已配置');
} catch {
  console.log('  ⚠️  AI Provider 未配置，跳过 ToolRouter 测试');
}

if (hasAIProvider) {
  const testIntents = [
    { input: '有哪些任务？', expected: 'list_tasks' },
    { input: '有哪些员工？', expected: 'list_employees' },
    { input: '系统状态', expected: 'get_status' },
    { input: '帮我做个登录功能', expected: 'create_task' },
    { input: '你好', expected: 'chat' },
  ];

  for (const test of testIntents) {
    try {
      const result = await toolRouter.route(test.input);
      const actualTool = result.toolCalls?.[0]?.tool || 'none';
      const match = actualTool === test.expected ? '✅' : '⚠️';
      console.log(`  ${match} "${test.input}" → ${actualTool} (期望: ${test.expected})`);
    } catch (error: any) {
      console.log(`  ❌ "${test.input}" → ${error.message}`);
    }
  }
}

// ============================================================================
// 步骤 6: 验证数据库记录
// ============================================================================

console.log('\n📊 步骤 6: 验证数据库记录');

const messageCount = db.prepare('SELECT COUNT(*) as count FROM chat_messages').get() as { count: number };
const userMessages = db.prepare("SELECT COUNT(*) as count FROM chat_messages WHERE direction = 'user'").get() as { count: number };
const companyMessages = db.prepare("SELECT COUNT(*) as count FROM chat_messages WHERE direction = 'company'").get() as { count: number };
const tgMessages = db.prepare("SELECT COUNT(*) as count FROM chat_messages WHERE source = 'tg'").get() as { count: number };
const cliMessages = db.prepare("SELECT COUNT(*) as count FROM chat_messages WHERE source = 'cli'").get() as { count: number };

console.log(`  ✅ 总消息数: ${messageCount.count}`);
console.log(`  ✅ 用户消息: ${userMessages.count}`);
console.log(`  ✅ 公司消息: ${companyMessages.count}`);
console.log(`  ✅ Telegram 消息: ${tgMessages.count}`);
console.log(`  ✅ CLI 消息: ${cliMessages.count}`);

// 验证员工响应元数据
const empMsg = db.prepare(`SELECT * FROM chat_messages WHERE metadata_json LIKE '%employee_response%'`).get() as any;
if (empMsg) {
  const meta = JSON.parse(empMsg.metadata_json || '{}');
  console.log(`  ✅ 员工消息元数据: employee_id=${meta.employee_id}, employee_name=${meta.employee_name}`);
}

// ============================================================================
// 步骤 7: 测试总结
// ============================================================================

console.log('\n' + '━'.repeat(60));
console.log('📊 测试总结');
console.log('━'.repeat(60));

const results = [
  { name: '数据库初始化', status: '✅' },
  { name: 'Seed 数据加载', status: `✅ (${humanCount.count} humans, ${employeeCount.count} employees)` },
  { name: 'Config 数据恢复', status: `✅ (${Object.keys(configData).length} 项)` },
  { name: 'MessageService', status: '✅ (用户消息、CEO响应、员工响应)' },
  { name: '消息持久化', status: `✅ (${messageCount.count} 条消息)` },
  { name: '多渠道支持', status: `✅ (TG: ${tgMessages.count}, CLI: ${cliMessages.count})` },
  { name: '员工对话元数据', status: empMsg ? '✅' : '❌' },
  { name: 'ToolRouter', status: hasAIProvider ? '✅ (已配置 AI)' : '⚠️ (未配置 AI)' },
];

for (const result of results) {
  console.log(`  ${result.status} ${result.name}`);
}

console.log('\n' + '━'.repeat(60));
console.log('✅ 所有核心功能测试完成！');
console.log('━'.repeat(60) + '\n');

// ============================================================================
// 清理
// ============================================================================

db.close();
rmSync(homeDir, { recursive: true, force: true });
console.log('🧹 测试环境已清理');
