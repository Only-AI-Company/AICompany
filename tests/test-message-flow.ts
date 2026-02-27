/**
 * AI Company - 消息流程快速测试
 *
 * 测试 ToolRouter 意图识别和 MessageService 消息持久化
 */

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { AIDatabase } from '../src/infrastructure/database/Database.js';
import { ToolRouter } from '../src/core/tools/ToolRouter.js';
import { MessageService } from '../src/core/messages/MessageService.js';

// 创建临时测试环境
const homeDir = mkdtempSync(join(tmpdir(), 'ai-company-msg-test-'));
process.env.HOME = homeDir;
process.env.AI_COMPANY_DB_PATH = join(homeDir, 'data.db');
console.log(`📁 测试目录: ${homeDir}\n`);

// 使用 drizzle-kit push 初始化数据库
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
console.log('🔧 正在初始化数据库...');
try {
  execSync(`npx drizzle-kit push`, {
    cwd: projectRoot,
    env: { ...process.env, AI_COMPANY_DB_PATH: join(homeDir, 'data.db') },
    stdio: 'inherit'
  });
  console.log('✅ 数据库初始化完成\n');
} catch (error) {
  console.error('❌ 数据库初始化失败');
  process.exit(1);
}

// 初始化数据库连接（使用临时数据库路径）
const dbPath = join(homeDir, 'data.db');
const db = new AIDatabase();

// 由于 drizzle-kit 使用配置文件中的路径，我们需要将数据库移动到正确位置
// 或者直接使用 AIDatabase 创建表结构

// 读取 Drizzle schema 并转换为 SQL
const { sql } = await import('../src/infrastructure/database/drizzle/schema.js');

// 使用 Drizzle 的 push 功能
import { drizzle } from '../src/infrastructure/database/drizzle/index.js';
import { betterSqlite } from 'drizzle-orm/better-sqlite3';

const sqlite = new (await import('better-sqlite3')).default(dbPath);
const drizzleDb = drizzle(sqlite);

// 手动创建表结构（简化版）
const createTables = `
-- humans 表
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

-- employees 表
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

-- tasks 表
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

-- chat_messages 表
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

-- crontab 表
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
console.log('✅ 数据库表创建完成\n');

// 加载 seed 数据（直接执行 SQL）
const seedSql = readFileSync(join(__dirname, '..', 'src', 'infrastructure', 'database', 'seeds', '001_humans.sql'), 'utf-8');
db.exec(seedSql);
const employeeSeedSql = readFileSync(join(__dirname, '..', 'src', 'infrastructure', 'database', 'seeds', '002_employees.sql'), 'utf-8');
db.exec(employeeSeedSql);
console.log('✅ Seed 数据加载完成\n');

const messageService = new MessageService(db);
const toolRouter = new ToolRouter(db);

// ============================================================================
// 测试用例
// ============================================================================

interface TestCase {
  name: string;
  fn: () => Promise<void>;
}

const tests: TestCase[] = [];

const test = (name: string, fn: () => Promise<void>) => {
  tests.push({ name, fn });
};

// Test 1: 消息服务 - 保存用户消息
test('MessageService - 保存用户消息', async () => {
  messageService.saveUserMessage({
    content: '测试用户消息',
    source: 'cli',
    userId: 'test-user-1',
    username: 'testuser',
  });

  const history = messageService.getChatHistory({ source: 'cli', limit: 10 });
  if (history.length !== 1) throw new Error('期望 1 条消息');
  if (history[0].content !== '测试用户消息') throw new Error('消息内容不匹配');
  if (history[0].direction !== 'user') throw new Error('方向应该是 user');
});

// Test 2: 消息服务 - 保存公司响应
test('MessageService - 保存公司响应', async () => {
  messageService.saveCompanyResponse({
    content: '测试公司响应',
    source: 'cli',
    chatId: 'test-chat-1',
  });

  const history = messageService.getChatHistory({ source: 'cli', limit: 10 });
  const companyMsg = history.find(m => m.direction === 'company');
  if (!companyMsg) throw new Error('未找到公司响应消息');
  if (companyMsg.content !== '测试公司响应') throw new Error('响应内容不匹配');
});

// Test 3: ToolRouter - list_tasks 意图识别
test('ToolRouter - list_tasks 意图识别', async () => {
  const result = await toolRouter.route('有哪些任务？');
  if (!result.toolCalls || result.toolCalls.length === 0) {
    throw new Error('期望调用 list_tasks 工具');
  }
  if (result.toolCalls[0].tool !== 'list_tasks') {
    throw new Error(`期望 list_tasks，实际: ${result.toolCalls[0].tool}`);
  }
});

// Test 4: ToolRouter - list_employees 意图识别
test('ToolRouter - list_employees 意图识别', async () => {
  const result = await toolRouter.route('有哪些员工？');
  if (!result.toolCalls || result.toolCalls.length === 0) {
    throw new Error('期望调用 list_employees 工具');
  }
  if (result.toolCalls[0].tool !== 'list_employees') {
    throw new Error(`期望 list_employees，实际: ${result.toolCalls[0].tool}`);
  }
});

// Test 5: ToolRouter - get_status 意图识别
test('ToolRouter - get_status 意图识别', async () => {
  const result = await toolRouter.route('系统状态怎么样？');
  if (!result.toolCalls || result.toolCalls.length === 0) {
    throw new Error('期望调用 get_status 工具');
  }
  if (result.toolCalls[0].tool !== 'get_status') {
    throw new Error(`期望 get_status，实际: ${result.toolCalls[0].tool}`);
  }
});

// Test 6: ToolRouter - create_task 意图识别
test('ToolRouter - create_task 意图识别', async () => {
  const result = await toolRouter.route('帮我做一个登录功能');
  if (!result.toolCalls || result.toolCalls.length === 0) {
    throw new Error('期望调用 create_task 工具');
  }
  if (result.toolCalls[0].tool !== 'create_task') {
    throw new Error(`期望 create_task，实际: ${result.toolCalls[0].tool}`);
  }
});

// Test 7: ToolRouter - chat 意图识别（闲聊）
test('ToolRouter - chat 意图识别（闲聊）', async () => {
  const result = await toolRouter.route('你好，CEO');
  if (!result.toolCalls || result.toolCalls.length === 0) {
    throw new Error('期望调用 chat 工具');
  }
  if (result.toolCalls[0].tool !== 'chat') {
    throw new Error(`期望 chat，实际: ${result.toolCalls[0].tool}`);
  }
});

// Test 8: ToolRouter - get_employee 意图识别
test('ToolRouter - get_employee 意图识别', async () => {
  const result = await toolRouter.route('CEO 是谁？');
  if (!result.toolCalls || result.toolCalls.length === 0) {
    throw new Error('期望调用 get_employee 工具');
  }
  if (result.toolCalls[0].tool !== 'get_employee') {
    throw new Error(`期望 get_employee，实际: ${result.toolCalls[0].tool}`);
  }
});

// Test 9: 消息统计
test('MessageService - 消息统计', async () => {
  const stats = messageService.getSourceStats();
  if (!Array.isArray(stats)) throw new Error('期望返回数组');
  const cliStats = stats.find(s => s.source === 'cli');
  if (!cliStats) throw new Error('期望有 cli 统计');
  if (cliStats.count < 2) throw new Error('cli 消息数应该至少 2 条');
});

// Test 10: 员工对话元数据验证
test('MessageService - 员工对话元数据', async () => {
  messageService.saveCompanyResponse({
    content: '这是员工的回复',
    source: 'tg',
    chatId: '123456',
    metadata: {
      type: 'employee_response',
      employee_id: 'emp-cto',
      employee_name: '林拓海',
      employee_role: 'CTO',
    },
  });

  const history = messageService.getChatHistory({ source: 'tg', limit: 10 });
  const empMsg = history.find(m => {
    const meta = m.metadata_json ? JSON.parse(m.metadata_json) : {};
    return meta.type === 'employee_response';
  });

  if (!empMsg) throw new Error('未找到员工响应消息');
  const meta = JSON.parse(empMsg.metadata_json || '{}');
  if (meta.employee_id !== 'emp-cto') throw new Error('员工 ID 不匹配');
  if (meta.employee_name !== '林拓海') throw new Error('员工姓名不匹配');
});

// ============================================================================
// 运行测试
// ============================================================================

console.log('🧪 开始运行测试...\n');
console.log('━'.repeat(50));

let passed = 0;
let failed = 0;
const failedTests: Array<{ name: string; error: string }> = [];

for (const t of tests) {
  try {
    await t.fn();
    console.log(`✅ ${t.name}`);
    passed++;
  } catch (error: any) {
    console.log(`❌ ${t.name}`);
    console.error(`   ${error.message}`);
    failed++;
    failedTests.push({ name: t.name, error: error.message });
  }
}

console.log('━'.repeat(50));
console.log(`\n📊 测试结果: ${passed} 通过, ${failed} 失败\n`);

if (failedTests.length > 0) {
  console.log('❌ 失败的测试:');
  failedTests.forEach(t => {
    console.log(`   • ${t.name}: ${t.error}`);
  });
}

// 清理
db.close();
rmSync(homeDir, { recursive: true, force: true });
console.log(`\n🧹 测试环境已清理`);

// 退出
process.exit(failed > 0 ? 1 : 0);
