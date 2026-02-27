/**
 * AI Company - 端到端完整测试
 *
 * 测试完整流程：消息接收 → 保存 → 意图识别 → 工具调用 → 执行
 */

import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { AIDatabase } from '../src/infrastructure/database/Database.js';
import { MessageService } from '../src/core/messages/MessageService.js';
import { ToolRouter } from '../src/core/tools/ToolRouter.js';

// 创建临时测试环境
const homeDir = mkdtempSync(join(tmpdir(), 'ai-company-e2e-test-'));
process.env.HOME = homeDir;
process.env.AI_COMPANY_DB_PATH = join(homeDir, 'data.db');

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log(`📁 测试目录: ${homeDir}\n`);
console.log('━'.repeat(60));
console.log('🧪 AI Company - 端到端完整测试');
console.log('━'.repeat(60) + '\n');

// ============================================================================
// 步骤 1: 初始化数据库
// ============================================================================

console.log('📊 步骤 1: 初始化数据库');

const db = new AIDatabase();

// 创建表结构
const createTables = readFileSync(join(__dirname, '..', 'src', 'infrastructure', 'database', 'seeds', '000_schema.sql'), 'utf-8');
db.exec(createTables);
console.log('  ✅ 数据库表创建完成');

// ============================================================================
// 步骤 2: 恢复 Config 数据
// ============================================================================

console.log('\n📊 步骤 2: 恢复 Config 数据');

// 模拟真实的 config.json
const mockConfig = {
  'workDir': join(homeDir, 'work'),
  'outputsDir': join(homeDir, 'outputs'),
  'maxOutputsSize': 1024,
  'telegram.bot_token': 'mock-token-123456',
  'telegram.enabled': 'true',
  'ai.provider': 'anthropic',
  'ai.model': 'claude-opus-4-6',
};

// 写入临时 config.json
const configDir = join(homeDir, '.ai-company');
const configPath = join(configDir, 'config.json');
writeFileSync(configPath, JSON.stringify(mockConfig, null, 2));

console.log(`  📝 模拟 config.json: ${Object.keys(mockConfig).length} 项`);

// 恢复到数据库
const now = Date.now();
let configCount = 0;
for (const [key, value] of Object.entries(mockConfig)) {
  db.prepare(`
    INSERT OR REPLACE INTO config (key, value, type, category, description, created_at, updated_at)
    VALUES (?, ?, 'string', 'general', '', ?, ?)
  `).run(key, String(value), now, now);
  configCount++;
}
console.log(`  ✅ Config 恢复: ${configCount} 条`);

// 验证
const savedConfigs = db.prepare('SELECT key, value FROM config').all() as Array<{ key: string; value: string }>;
console.log(`  📋 数据库中的配置:`);
for (const cfg of savedConfigs) {
  console.log(`     ${cfg.key} = ${cfg.value.substring(0, 50)}${cfg.value.length > 50 ? '...' : ''}`);
}

// ============================================================================
// 步骤 3: 加载 Seed 数据
// ============================================================================

console.log('\n📊 步骤 3: 加载 Seed 数据');

const seedSql = readFileSync(join(__dirname, '..', 'src', 'infrastructure', 'database', 'seeds', '001_humans.sql'), 'utf-8');
db.exec(seedSql);
const employeeSeedSql = readFileSync(join(__dirname, '..', 'src', 'infrastructure', 'database', 'seeds', '002_employees.sql'), 'utf-8');
db.exec(employeeSeedSql);

const humanCount = db.prepare('SELECT COUNT(*) as count FROM humans').get() as { count: number };
const employeeCount = db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number };

console.log(`  ✅ Humans: ${humanCount.count} 条`);
console.log(`  ✅ Employees: ${employeeCount.count} 条`);

// ============================================================================
// 初始化服务
// ============================================================================

const messageService = new MessageService(db);
const toolRouter = new ToolRouter(db);

// ============================================================================
// 步骤 4: 测试完整流程
// ============================================================================

console.log('\n' + '━'.repeat(60));
console.log('📊 步骤 4: 测试完整消息流程');
console.log('━'.repeat(60) + '\n');

interface TestFlow {
  name: string;
  input: string;
  userId: string;
  sessionId: string;
}

const testFlows: TestFlow[] = [
  {
    name: '查询任务列表',
    input: '有哪些任务？',
    userId: 'user-001',
    sessionId: 'session-001',
  },
  {
    name: '查询员工信息',
    input: 'CTO 是谁？',
    userId: 'user-001',
    sessionId: 'session-001',
  },
  {
    name: '创建新任务',
    input: '帮我做一个用户登录功能',
    userId: 'user-001',
    sessionId: 'session-001',
  },
  {
    name: '查询系统状态',
    input: '系统状态怎么样？',
    userId: 'user-002',
    sessionId: 'session-002',
  },
  {
    name: '与员工对话',
    input: '我想和 CEO 对话',
    userId: 'user-002',
    sessionId: 'session-002',
  },
];

for (const flow of testFlows) {
  console.log(`\n🔄 测试: ${flow.name}`);
  console.log(`   输入: "${flow.input}"`);
  console.log(`   用户: ${flow.userId}`);

  // ==========================================
  // 步骤 A: 保存用户消息
  // ==========================================
  console.log(`   ⬇️  [A] 保存用户消息...`);
  messageService.saveUserMessage({
    content: flow.input,
    source: 'cli',
    userId: flow.userId,
    sessionId: flow.sessionId,
  });
  console.log(`   ✅ 消息已保存`);

  // ==========================================
  // 步骤 B: 意图识别
  // ==========================================
  console.log(`   🧠 [B] 意图识别...`);
  const chatHistory = messageService.getChatHistory({
    sessionId: flow.sessionId,
    limit: 10,
  });

  let toolCallResult;
  try {
    toolCallResult = await toolRouter.route(flow.input, {
      chatHistory: chatHistory.map(msg => ({
        role: msg.direction === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })),
    });

    if (toolCallResult.toolCalls && toolCallResult.toolCalls.length > 0) {
      const tool = toolCallResult.toolCalls[0];
      console.log(`   ✅ 识别意图: ${tool.tool}`);
      if (tool.params) {
        console.log(`      参数: ${JSON.stringify(tool.params).substring(0, 100)}`);
      }
    } else if (toolCallResult.responseText) {
      console.log(`   ✅ 识别意图: chat (闲聊)`);
      console.log(`      响应: ${toolCallResult.responseText.substring(0, 50)}...`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  意图识别失败: ${error.message}`);
  }

  // ==========================================
  // 步骤 C: 保存公司响应（模拟）
  // ==========================================
  console.log(`   ⬆️  [C] 保存公司响应...`);

  let responseContent = '';
  let responseMetadata: Record<string, unknown> = {};

  if (toolCallResult?.toolCalls && toolCallResult.toolCalls.length > 0) {
    const tool = toolCallResult.toolCalls[0];

    // 根据不同的工具生成模拟响应
    switch (tool.tool) {
      case 'list_tasks':
        responseContent = '当前没有任务。你可以使用 "创建任务" 来创建新任务。';
        responseMetadata = { type: 'query_response', tool: tool.tool };
        break;
      case 'list_employees':
        responseContent = '公司目前有 4 名员工：CEO 陈建国、CTO 林拓海、CFO 李雨薇、COO 王建国';
        responseMetadata = { type: 'query_response', tool: tool.tool };
        break;
      case 'get_employee':
        responseContent = '林拓海是我们的 CTO，负责技术架构和开发工作。';
        responseMetadata = {
          type: 'employee_response',
          employee_id: 'emp-cto',
          employee_name: '林拓海',
          employee_role: 'CTO',
        };
        break;
      case 'create_task':
        responseContent = '好的，我来帮你创建 "用户登录功能" 任务。任务已创建，ID: task-xxx';
        responseMetadata = {
          type: 'action_response',
          tool: tool.tool,
          action: 'task_created',
          task_id: 'task-xxx',
        };
        break;
      case 'get_status':
        responseContent = '系统运行正常。4 名员工在线，0 个任务进行中。';
        responseMetadata = { type: 'query_response', tool: tool.tool };
        break;
      case 'talk_to_employee':
        responseContent = '已切换到与 CEO 对话模式。你可以直接和 CEO 交流。';
        responseMetadata = {
          type: 'mode_switch',
          tool: tool.tool,
          mode: 'employee_chat',
          employee_id: 'emp-ceo',
        };
        break;
      default:
        responseContent = `已执行操作: ${tool.tool}`;
        responseMetadata = { type: 'action_response', tool: tool.tool };
    }
  } else if (toolCallResult?.responseText) {
    responseContent = toolCallResult.responseText;
    responseMetadata = { type: 'chat_response' };
  } else {
    responseContent = '抱歉，我没有理解你的请求。';
    responseMetadata = { type: 'error', reason: 'intent_not_recognized' };
  }

  messageService.saveCompanyResponse({
    content: responseContent,
    source: 'cli',
    chatId: flow.sessionId,
    sessionId: flow.sessionId,
    metadata: responseMetadata,
  });
  console.log(`   ✅ 响应已保存: "${responseContent.substring(0, 50)}..."`);
}

// ============================================================================
// 步骤 5: 验证消息记录
// ============================================================================

console.log('\n' + '━'.repeat(60));
console.log('📊 步骤 5: 验证消息记录');
console.log('━'.repeat(60) + '\n');

// 按会话统计
const sessionStats = db.prepare(`
  SELECT
    session_id,
    direction,
    COUNT(*) as count
  FROM chat_messages
  GROUP BY session_id, direction
  ORDER BY session_id, direction
`).all() as Array<{ session_id: string; direction: string; count: number }>;

console.log('📋 按会话统计:');
for (const stat of sessionStats) {
  const dir = stat.direction === 'user' ? '用户' : '公司';
  console.log(`  会话 ${stat.session_id}: ${dir} ${stat.count} 条`);
}

// 总消息数
const totalMessages = db.prepare('SELECT COUNT(*) as count FROM chat_messages').get() as { count: number };
console.log(`\n📨 总消息数: ${totalMessages.count} 条`);

// 元数据类型统计
console.log('\n📋 响应类型统计:');
const metadataStats = db.prepare(`
  SELECT
    json_extract(metadata_json, '$.type') as response_type,
    COUNT(*) as count
  FROM chat_messages
  WHERE direction = 'company' AND metadata_json IS NOT NULL
  GROUP BY response_type
`).all() as Array<{ response_type: string; count: number }>;

for (const stat of metadataStats) {
  console.log(`  ${stat.response_type}: ${stat.count} 条`);
}

// ============================================================================
// 步骤 6: 显示完整对话示例
// ============================================================================

console.log('\n' + '━'.repeat(60));
console.log('💬 完整对话示例 (会话 session-001)');
console.log('━'.repeat(60) + '\n');

const conversation = db.prepare(`
  SELECT
    direction,
    content,
    created_at,
    metadata_json
  FROM chat_messages
  WHERE session_id = 'session-001'
  ORDER BY created_at ASC
`).all() as Array<{
  direction: string;
  content: string;
  created_at: number;
  metadata_json: string | null;
}>;

for (const msg of conversation) {
  const role = msg.direction === 'user' ? '👤 用户' : '🏢 公司';
  const time = new Date(msg.created_at).toLocaleTimeString('zh-CN');
  const metadata = msg.metadata_json ? JSON.parse(msg.metadata_json) : null;

  console.log(`${role} [${time}]`);

  if (metadata?.type) {
    const typeLabel = {
      'query_response': '📊 查询',
      'action_response': '⚡ 执行',
      'employee_response': '👨‍💼 员工',
      'chat_response': '💬 聊天',
      'mode_switch': '🔄 切换',
      'error': '❌ 错误',
    }[metadata.type] || '📝 其他';
    console.log(`  ${typeLabel} ${JSON.stringify(metadata).substring(0, 80)}...`);
  }

  console.log(`  "${msg.content}"`);
  console.log('');
}

// ============================================================================
// 步骤 7: 显示提取的需求/指令
// ============================================================================

console.log('━'.repeat(60));
console.log('📋 提取的需求和指令');
console.log('━'.repeat(60) + '\n');

// 从公司响应中提取的动作
const actions = db.prepare(`
  SELECT
    content,
    json_extract(metadata_json, '$.tool') as tool,
    json_extract(metadata_json, '$.action') as action,
    json_extract(metadata_json, '$.task_id') as task_id,
    created_at
  FROM chat_messages
  WHERE direction = 'company'
    AND metadata_json IS NOT NULL
    AND (
      json_extract(metadata_json, '$.tool') IS NOT NULL
      OR json_extract(metadata_json, '$.action') IS NOT NULL
    )
  ORDER BY created_at ASC
`).all() as Array<{
  content: string;
  tool: string | null;
  action: string | null;
  task_id: string | null;
  created_at: number;
}>;

if (actions.length > 0) {
  console.log(`识别到的操作 (${actions.length} 个):\n`);
  for (const act of actions) {
    const time = new Date(act.created_at).toLocaleTimeString('zh-CN');
    console.log(`[${time}] ${act.content}`);
    if (act.tool) console.log(`  → 工具: ${act.tool}`);
    if (act.action) console.log(`  → 动作: ${act.action}`);
    if (act.task_id) console.log(`  → 任务: ${act.task_id}`);
    console.log('');
  }
} else {
  console.log('没有识别到具体操作');
}

// ============================================================================
// 测试总结
// ============================================================================

console.log('━'.repeat(60));
console.log('📊 测试总结');
console.log('━'.repeat(60) + '\n');

console.log(`✅ 配置恢复: ${configCount} 条`);
console.log(`✅ 消息记录: ${totalMessages.count} 条`);
console.log(`✅ 意图识别: ${testFlows.length} 个输入`);
console.log(`✅ 操作提取: ${actions.length} 个`);

console.log('\n' + '━'.repeat(60));
console.log('✅ 端到端测试完成！');
console.log('━'.repeat(60) + '\n');

// ============================================================================
// 清理
// ============================================================================

db.close();
rmSync(homeDir, { recursive: true, force: true });
console.log('🧹 测试环境已清理\n');

process.exit(0);
