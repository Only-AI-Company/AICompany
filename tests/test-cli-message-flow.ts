/**
 * AI Company - CLI 消息流程完整测试
 *
 * 模拟各种 CLI 输入情况，验证消息记录功能
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { AIDatabase } from '../src/infrastructure/database/Database.js';
import { MessageService } from '../src/core/messages/MessageService.js';
import { ToolRouter } from '../src/core/tools/ToolRouter.js';

// 创建临时测试环境
const homeDir = mkdtempSync(join(tmpdir(), 'ai-company-cli-test-'));
process.env.HOME = homeDir;
process.env.AI_COMPANY_DB_PATH = join(homeDir, 'data.db');

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log(`📁 测试目录: ${homeDir}\n`);
console.log('━'.repeat(60));
console.log('🧪 AI Company - CLI 消息流程完整测试');
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

// 加载 seed 数据
const seedSql = readFileSync(join(__dirname, '..', 'src', 'infrastructure', 'database', 'seeds', '001_humans.sql'), 'utf-8');
db.exec(seedSql);
const employeeSeedSql = readFileSync(join(__dirname, '..', 'src', 'infrastructure', 'database', 'seeds', '002_employees.sql'), 'utf-8');
db.exec(employeeSeedSql);

const humanCount = db.prepare('SELECT COUNT(*) as count FROM humans').get() as { count: number };
const employeeCount = db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number };

console.log(`  ✅ Humans: ${humanCount.count} 条`);
console.log(`  ✅ Employees: ${employeeCount.count} 条`);

// 恢复 Config 数据
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
console.log(`  ✅ Config: ${Object.keys(configData).length} 条\n`);

const messageService = new MessageService(db);
const toolRouter = new ToolRouter(db);

// ============================================================================
// 测试场景定义
// ============================================================================

const testUserId = 'cli-user-test-001';
const testSessionId = 'cli-session-test-001';

interface TestScenario {
  name: string;
  category: string;
  description: string;
  input: string;
  expected?: {
    direction?: 'user' | 'company';
    messageType?: string;
    metadataKey?: string;
  };
}

const scenarios: TestScenario[] = [
  // ========== 查询类命令 ==========
  {
    name: '查询任务列表',
    category: '查询',
    description: '用户查询所有任务',
    input: '有哪些任务？',
    expected: { direction: 'user' },
  },
  {
    name: '查询员工列表',
    category: '查询',
    description: '用户查询所有员工',
    input: '有哪些员工？',
    expected: { direction: 'user' },
  },
  {
    name: '查询系统状态',
    category: '查询',
    description: '用户查询系统整体状态',
    input: '系统状态怎么样？',
    expected: { direction: 'user' },
  },
  {
    name: '查询特定员工',
    category: '查询',
    description: '用户查询 CEO 信息',
    input: 'CEO 是谁？',
    expected: { direction: 'user' },
  },
  {
    name: '查询任务详情',
    category: '查询',
    description: '用户查询特定任务详情',
    input: '查看任务 task-123 的详情',
    expected: { direction: 'user' },
  },

  // ========== 执行类命令 ==========
  {
    name: '创建新任务',
    category: '执行',
    description: '用户要求创建新功能',
    input: '帮我做一个登录功能',
    expected: { direction: 'user' },
  },
  {
    name: '执行定时任务',
    category: '执行',
    description: '用户要求执行定时任务',
    input: '执行每天的数据备份',
    expected: { direction: 'user' },
  },
  {
    name: '创建自动化脚本',
    category: '执行',
    description: '用户要求创建自动化',
    input: '帮我创建一个自动发邮件的脚本',
    expected: { direction: 'user' },
  },
  {
    name: '开发功能',
    category: '执行',
    description: '用户要求开发新功能',
    input: '开发一个用户管理页面',
    expected: { direction: 'user' },
  },
  {
    name: '招募新员工',
    category: '执行',
    description: '用户要求招募员工',
    input: '招募一个前端工程师',
    expected: { direction: 'user' },
  },

  // ========== 交互类命令 ==========
  {
    name: '与员工对话',
    category: '交互',
    description: '用户切换到与特定员工对话',
    input: '我想和 CTO 对话',
    expected: { direction: 'user' },
  },
  {
    name: '闲聊',
    category: '交互',
    description: '用户与 CEO 闲聊',
    input: '你好，CEO 在吗？',
    expected: { direction: 'user' },
  },

  // ========== 复杂场景 ==========
  {
    name: '复杂需求描述',
    category: '复杂',
    description: '用户描述复杂的需求',
    input: '我需要一个完整的电商系统，包括商品管理、订单处理、支付集成和用户认证',
    expected: { direction: 'user' },
  },
  {
    name: '多步骤任务',
    category: '复杂',
    description: '用户提出需要多个步骤的任务',
    input: '先做一个需求分析，然后设计数据库，最后开始开发',
    expected: { direction: 'user' },
  },

  // ========== 边界情况 ==========
  {
    name: '空消息',
    category: '边界',
    description: '用户发送空消息',
    input: '',
    expected: { direction: 'user' },
  },
  {
    name: '特殊字符',
    category: '边界',
    description: '用户输入包含特殊字符',
    input: '测试 @#$%^&*() 特殊字符',
    expected: { direction: 'user' },
  },
  {
    name: '超长消息',
    category: '边界',
    description: '用户输入超长消息',
    input: 'A'.repeat(500),
    expected: { direction: 'user' },
  },
  {
    name: '中英文混合',
    category: '边界',
    description: '用户输入中英文混合',
    input: 'Create a new task 创建任务 for login feature 登录功能',
    expected: { direction: 'user' },
  },

  // ========== 系统响应测试 ==========
  {
    name: '系统成功响应',
    category: '响应',
    description: '系统返回成功消息',
    input: '__SYSTEM_RESPONSE__: 任务已创建成功',
    expected: { direction: 'company', messageType: 'success' },
  },
  {
    name: '系统错误响应',
    category: '响应',
    description: '系统返回错误消息',
    input: '__SYSTEM_RESPONSE__: 创建任务失败：权限不足',
    expected: { direction: 'company', messageType: 'error' },
  },
  {
    name: 'CEO 响应',
    category: '响应',
    description: 'CEO 回复用户',
    input: '__CEO_RESPONSE__: 我是陈建国，AI 公司的 CEO。很高兴为你服务！',
    expected: { direction: 'company', metadataKey: 'type' },
  },
  {
    name: '员工响应',
    category: '响应',
    description: '特定员工回复用户',
    input: '__EMPLOYEE_RESPONSE__:emp-cto__: 我是 CTO，这个问题我来解决',
    expected: { direction: 'company', metadataKey: 'employee_id' },
  },
];

// ============================================================================
// 执行测试
// ============================================================================

console.log('━'.repeat(60));
console.log('📊 开始执行测试场景');
console.log('━'.repeat(60) + '\n');

let passed = 0;
let failed = 0;
const results: Array<{
  scenario: string;
  status: 'pass' | 'fail';
  error?: string;
}> = [];

for (const scenario of scenarios) {
  console.log(`\n📝 测试: ${scenario.name}`);
  console.log(`   类别: ${scenario.category}`);
  console.log(`   描述: ${scenario.description}`);
  console.log(`   输入: "${scenario.input.substring(0, 50)}${scenario.input.length > 50 ? '...' : ''}"`);

  try {
    // 模拟用户输入
    if (scenario.input.startsWith('__SYSTEM_RESPONSE__:')) {
      // 系统响应
      const content = scenario.input.replace('__SYSTEM_RESPONSE__:', '');
      const messageType = scenario.expected?.messageType || 'info';

      messageService.saveCompanyResponse({
        content,
        source: 'cli',
        chatId: testSessionId,
        sessionId: testSessionId,
        metadata: {
          type: messageType,
          timestamp: Date.now(),
        },
      });

      console.log(`   ✅ 系统响应已保存`);
    } else if (scenario.input.startsWith('__CEO_RESPONSE__:')) {
      // CEO 响应
      const content = scenario.input.replace('__CEO_RESPONSE__:', '');

      messageService.saveCompanyResponse({
        content,
        source: 'cli',
        chatId: testSessionId,
        sessionId: testSessionId,
        metadata: {
          type: 'ceo_response',
          employee_id: 'emp-ceo',
          employee_name: '陈建国',
          employee_role: 'CEO',
        },
      });

      console.log(`   ✅ CEO 响应已保存`);
    } else if (scenario.input.startsWith('__EMPLOYEE_RESPONSE__:')) {
      // 员工响应
      // 格式: __EMPLOYEE_RESPONSE__:emp-cto__: 我是 CTO，这个问题我来解决
      const parts = scenario.input.split('__:');
      const employeeId = parts[1];
      const content = parts.slice(2).join('__:');

      const employee = db.prepare('SELECT name, role FROM employees WHERE id = ?').get(employeeId) as { name: string; role: string } | undefined;

      messageService.saveCompanyResponse({
        content,
        source: 'cli',
        chatId: testSessionId,
        sessionId: testSessionId,
        metadata: {
          type: 'employee_response',
          employee_id: employeeId,
          employee_name: employee?.name || '未知',
          employee_role: employee?.role || '未知',
        },
      });

      console.log(`   ✅ 员工响应已保存 (${employee?.name || '未知'})`);
    } else {
      // 用户输入
      messageService.saveUserMessage({
        content: scenario.input,
        source: 'cli',
        userId: testUserId,
        sessionId: testSessionId,
        metadata: {
          category: scenario.category,
          test_name: scenario.name,
        },
      });

      console.log(`   ✅ 用户消息已保存`);
    }

    // 验证消息是否正确保存（通过内容匹配来找到刚保存的消息）
    let contentPrefix = scenario.input
      .replace('__SYSTEM_RESPONSE__:', '')
      .replace('__CEO_RESPONSE__:', '');

    // 处理员工响应的特殊格式
    if (contentPrefix.startsWith('__EMPLOYEE_RESPONSE__:')) {
      const parts = contentPrefix.split('__:');
      contentPrefix = parts.slice(2).join('__:');
    }

    contentPrefix = contentPrefix.substring(0, 50);

    const messages = db.prepare(`
      SELECT * FROM chat_messages
      WHERE source = 'cli' AND substr(content, 1, 50) = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(contentPrefix) as any;

    if (messages) {
      const direction = messages.direction;
      const expectedDirection = scenario.expected?.direction || 'user';

      if (direction === expectedDirection) {
        console.log(`   ✅ 验证通过: direction=${direction}`);
        passed++;
        results.push({ scenario: scenario.name, status: 'pass' });
      } else {
        console.log(`   ❌ 验证失败: expected direction=${expectedDirection}, got ${direction}`);
        failed++;
        results.push({ scenario: scenario.name, status: 'fail', error: `direction mismatch` });
      }
    } else {
      console.log(`   ❌ 验证失败: 消息未保存`);
      failed++;
      results.push({ scenario: scenario.name, status: 'fail', error: 'message not saved' });
    }

  } catch (error: any) {
    console.log(`   ❌ 测试失败: ${error.message}`);
    failed++;
    results.push({ scenario: scenario.name, status: 'fail', error: error.message });
  }
}

// ============================================================================
// 统计分析
// ============================================================================

console.log('\n' + '━'.repeat(60));
console.log('📊 统计分析');
console.log('━'.repeat(60) + '\n');

// 按类别统计
const categoryStats = new Map<string, { pass: number; fail: number }>();
for (const result of results) {
  const scenario = scenarios.find(s => s.name === result.scenario);
  if (scenario) {
    const cat = scenario.category;
    if (!categoryStats.has(cat)) {
      categoryStats.set(cat, { pass: 0, fail: 0 });
    }
    const stats = categoryStats.get(cat)!;
    if (result.status === 'pass') stats.pass++;
    else stats.fail++;
  }
}

console.log('按类别统计:');
for (const [category, stats] of categoryStats.entries()) {
  const total = stats.pass + stats.fail;
  const rate = total > 0 ? ((stats.pass / total) * 100).toFixed(1) : '0.0';
  console.log(`  ${category}: ${stats.pass}/${total} 通过 (${rate}%)`);
}

// 消息类型统计
console.log('\n消息类型统计:');
const messageStats = db.prepare(`
  SELECT
    direction,
    COUNT(*) as count,
    COUNT(DISTINCT external_user_id) as unique_users
  FROM chat_messages
  WHERE source = 'cli'
  GROUP BY direction
`).all() as Array<{ direction: string; count: number; unique_users: number }>;

for (const stat of messageStats) {
  const directionName = stat.direction === 'user' ? '用户消息' : '公司消息';
  console.log(`  ${directionName}: ${stat.count} 条`);
}

// 元数据统计
console.log('\n元数据统计:');
const metadataTests = db.prepare(`
  SELECT COUNT(*) as count
  FROM chat_messages
  WHERE source = 'cli'
    AND metadata_json IS NOT NULL
    AND metadata_json != ''
`).get() as { count: number };

console.log(`  有元数据的消息: ${metadataTests.count} 条`);

// 检查员工响应元数据
const empResponses = db.prepare(`
  SELECT COUNT(*) as count
  FROM chat_messages
  WHERE source = 'cli'
    AND metadata_json LIKE '%employee_response%'
`).get() as { count: number };

console.log(`  员工响应消息: ${empResponses.count} 条`);

// ============================================================================
// 显示最新消息记录
// ============================================================================

console.log('\n' + '━'.repeat(60));
console.log('📨 最新消息记录 (最新 10 条)');
console.log('━'.repeat(60) + '\n');

const recentMessages = db.prepare(`
  SELECT
    id,
    direction,
    substr(content, 1, 60) as content_preview,
    created_at,
    metadata_json
  FROM chat_messages
  WHERE source = 'cli'
  ORDER BY created_at DESC
  LIMIT 10
`).all() as Array<{
  id: number;
  direction: string;
  content_preview: string;
  created_at: number;
  metadata_json: string | null;
}>;

for (const msg of recentMessages) {
  const direction = msg.direction === 'user' ? '用户' : '公司';
  const timestamp = new Date(msg.created_at).toLocaleTimeString('zh-CN');
  const metadata = msg.metadata_json ? JSON.parse(msg.metadata_json) : null;
  const metaInfo = metadata ? ` [${Object.keys(metadata).join(', ')}]` : '';

  console.log(`[${direction}] ${timestamp}${metaInfo}`);
  console.log(`  ${msg.content_preview}`);
  console.log('');
}

// ============================================================================
// 测试总结
// ============================================================================

console.log('━'.repeat(60));
console.log('📊 测试总结');
console.log('━'.repeat(60) + '\n');

console.log(`总计: ${scenarios.length} 个场景`);
console.log(`通过: ${passed} 个 (${((passed / scenarios.length) * 100).toFixed(1)}%)`);
console.log(`失败: ${failed} 个 (${((failed / scenarios.length) * 100).toFixed(1)}%)`);

if (failed > 0) {
  console.log('\n❌ 失败的场景:');
  for (const result of results.filter(r => r.status === 'fail')) {
    console.log(`  • ${result.scenario}: ${result.error}`);
  }
}

console.log('\n' + '━'.repeat(60));
if (failed === 0) {
  console.log('✅ 所有测试通过！消息记录功能正常工作');
} else {
  console.log('⚠️  部分测试失败，请检查日志');
}
console.log('━'.repeat(60) + '\n');

// ============================================================================
// 清理
// ============================================================================

db.close();
rmSync(homeDir, { recursive: true, force: true });
console.log('🧹 测试环境已清理\n');

// 退出
process.exit(failed > 0 ? 1 : 0);
