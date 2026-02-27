# AI Company v2

从零开始的简化实现，专注核心功能。

## 架构设计

### 核心理念

1. **事件驱动** - 所有组件通过 EventBus 通信
2. **分层清晰** - 核心层、基础设施层、接口层
3. **类型安全** - 完整的 TypeScript 类型定义
4. **透明可审计** - 完整的日志记录

### 目录结构

```
v2/
├── src/
│   ├── core/               # 核心业务逻辑
│   │   ├── Event.ts            # 事件系统 (EventBus)
│   │   ├── Orchestrator.ts     # 核心编排器
│   │   ├── Input.ts            # 输入收集与分类
│   │   │   ├── InputCollector   # 输入收集
│   │   │   └── InputClassifier  # 输入分类
│   │   ├── Intent.ts           # 意图分析 (LLM + 降级)
│   │   ├── Execute.ts          # 执行引擎
│   │   ├── Goal.ts             # 目标管理
│   │   └── CronScheduler.ts    # Cron 调度器
│   ├── db/                 # 数据库层
│   │   └── Database.ts
│   ├── ai/                 # AI 集成
│   │   └── AI.ts
│   ├── cli/                # 命令行接口
│   │   └── index.ts
│   └── types.ts            # 类型定义
├── data/                   # 数据目录
├── dist/                   # 编译输出
├── schema.sql              # 数据库架构
├── package.json
├── tsconfig.json
└── README.md
```

### 核心流程

```
用户输入 "每天10点给我科技日报"
   ↓
Orchestrator.submitInput()
   ↓
InputCollector.collect()
   ├─ 保存到 chat_messages 表
   └─ 发布 INPUT_RECEIVED 事件
   ↓
Orchestrator.handleInput()
   ↓
IntentionAnalyzer.analyze()
   ├─ LLM 分析 (Claude API)
   └─ 降级规则 (LLL 失败时)
   ↓
意图: create_goal + recurring
   ↓
Orchestrator.executeIntent()
   ↓
GoalManager.createGoal()
   ├─ 创建 goal 记录
   ├─ 生成 Cron 表达式 (0 10 * * *)
   └─ linkGoalToCron()
   ↓
CronScheduler.scheduleJob()
   ↓
每天 10:00 触发 → ExecutionEngine.execute()
   ↓
返回结果
```

### 事件类型

| 事件 | 说明 |
|------|------|
| `INPUT_RECEIVED` | 接收到输入 |
| `INTENT_ANALYZED` | 意图分析完成 |
| `EXECUTION_STARTED` | 开始执行 |
| `EXECUTION_PROGRESS` | 执行进度 |
| `EXECUTION_COMPLETED` | 执行完成 |
| `EXECUTION_FAILED` | 执行失败 |
| `GOAL_CREATED` | 目标创建 |
| `GOAL_PLAN_CREATED` | 目标计划创建 |
| `GOAL_STATUS_CHANGED` | 目标状态变更 |
| `GOAL_COMPLETED` | 目标完成 |
| `CRON_CREATED` | Cron 任务创建 |
| `CRON_TRIGGERED` | Cron 任务触发 |
| `RESPONSE_READY` | 响应准备就绪 |

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm 或 pnpm

### 安装

```bash
cd v2
npm install
npm run build
```

### 环境变量

```bash
# Anthropic API Key (必需)
export ANTHROPIC_API_KEY="your-api-key"
```

### CLI 命令

```bash
# 执行需求
node dist/cli/index.js run "每天10点给我科技日报"
node dist/cli/index.js run "创建任务：写一个Hello World"

# 交互模式
node dist/cli/index.js chat

# 查看状态
node dist/cli/index.js status

# 目标管理
node dist/cli/index.js goal list
node dist/cli/index.js goal show <goalId>

# 数据库管理
node dist/cli/index.js db init
node dist/cli/index.js db reset
node dist/cli/index.js db stats

# Cron 管理
node dist/cli/index.js cron list

# 查看日志
node dist/cli/index.js logs

# 启动服务
node dist/cli/index.js start
```

## 意图类型

| 意图 | 说明 | 示例 |
|------|------|------|
| `create_task` | 创建一次性任务 | "创建任务：写代码" |
| `create_goal` | 创建目标 | "目标：完成项目" |
| `create_script` | 创建自动化脚本 | "自动化：每天备份" |
| `query_status` | 查询状态 | "状态"、"查看状态" |
| `query_tasks` | 查询任务 | "任务列表" |
| `query_goals` | 查询目标 | "目标列表" |
| `chat` | 普通对话 | "你好" |

## 数据库设计

### 核心表 (11张)

| 表名 | 说明 |
|------|------|
| `config` | 配置 (namespace + JSON) |
| `goals` | 目标 |
| `goal_plans` | 目标计划 |
| `tasks` | 任务 |
| `crontab` | 定时任务 |
| `cron_executions` | Cron 执行记录 |
| `goal_cron_mapping` | 目标-Cron 关联 |
| `activity_logs` | 活动日志 |
| `intent_logs` | 意图日志 |
| `chat_messages` | 聊天记录 |
| `employees` | AI 员工 |
| `milestone_reports` | 里程碑报告 |

### 时间戳

- 统一使用 **毫秒** (JavaScript Date.now())
- 数据库 trigger 已更新为毫秒

## API 使用

### 编程方式调用

```typescript
import { getOrchestrator } from './dist/index.js';

const orchestrator = getOrchestrator();
await orchestrator.start();

// 提交输入
await orchestrator.submitInput({
  content: '每天10点给我科技日报',
  source: 'cli',
});

// 等待响应
const event = await waitFor('RESPONSE_READY');
console.log(event.data.response.message);

await orchestrator.stop();
```

### 事件监听

```typescript
import { getEventBus, EventType } from './dist/index.js';

const bus = getEventBus();

// 监听目标创建
bus.on(EventType.GOAL_CREATED, (event) => {
  console.log('目标已创建:', event.data.goal);
});

// 监听执行完成
bus.on(EventType.EXECUTION_COMPLETED, (event) => {
  console.log('执行完成:', event.data.result);
});
```

## 配置

### AI Provider

数据库配置 (namespace: `ai_provider`):

```json
{
  "active": "anthropic",
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-xxx",
      "baseURL": "https://api.anthropic.com",
      "model": "claude-sonnet-4-20250514"
    }
  }
}
```

**默认行为**: 如果数据库中没有配置，会使用环境变量 `ANTHROPIC_API_KEY`。

## 开发状态

### 已完成 ✅

- [x] 事件系统 (EventBus)
- [x] 核心编排器 (Orchestrator)
- [x] 输入收集 (InputCollector)
- [x] 意图分析 (IntentionAnalyzer)
- [x] 执行引擎 (ExecutionEngine)
- [x] 目标管理 (GoalManager)
- [x] Cron 调度器 (CronScheduler)
- [x] 数据库层 (AIDatabase)
- [x] AI 集成 (AIProvider)
- [x] CLI 接口

### 待实现 🚧

- [ ] Telegram Bot 集成
- [ ] Web 管理界面
- [ ] 员工系统
- [ ] 工具系统
- [ ] 知识库

## 实现细节

详见: [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)

## 许可证

MIT
