# AI Company - TS 项目架构完整分析

> 分析日期：2026-02-27
> 分析范围：表设计、项目结构、流程、Input、Notification

---

## 一、项目结构分析

### 1.1 目录结构

```
src/
├── application/              # 应用服务层（业务逻辑）
│   ├── builder/             # ScriptBuilder - 脚本构建器
│   ├── Daemon.ts            # 守护进程
│   └── services/            # 业务服务
│       ├── CompanyService.ts
│       ├── CronService.ts
│       ├── EmployeeAgentService.ts   # Employee ↔ Agent 映射
│       ├── EmployeeService.ts
│       ├── ExecutionTracker.ts
│       ├── GoalService.ts
│       ├── HumanService.ts           # 人类档案管理
│       ├── RecruitmentService.ts     # 动态招募
│       ├── TaskExecutor.ts
│       └── TaskService.ts
│
├── core/                    # 核心业务层
│   ├── agents/              # Agent 系统
│   │   ├── EmployeeManagerAgent.ts   # 员工绩效分析、智能招募建议
│   │   ├── Orchestrator.ts           # 主流程编排器
│   │   ├── ReviewerAgent.ts          # 自动验收
│   │   └── TaskManagerAgent.ts       # 任务分析、员工匹配
│   ├── messages/            # MessageService.ts - 消息持久化
│   ├── planning/            # TaskPlanner.ts - 任务规划
│   ├── runtime/             # EventBus, HookSystem
│   ├── swarm/               # 多 Agent 协作
│   │   ├── AgentSwarmManager.ts      # Swarm 模式执行
│   │   └── AutonomousLoopExecutor.ts # 自主循环执行
│   ├── tools/               # ToolRouter
│   └── types/               # Orchestrator 类型
│
├── infrastructure/          # 基础设施层
│   ├── ai/                  # AIProvider.ts
│   ├── claude/              # Claude 集成
│   │   ├── ClaudeClient.ts          # API 模式调用
│   │   ├── ClaudeCLIManager.ts      # CLI 模式调用
│   │   ├── PTYExecutor.ts           # PTY 会话劫持
│   │   └── Watchdog.ts
│   ├── config/              # ConfigService, Paths
│   ├── cron/                # CronRepository, utils
│   ├── database/            # Database.ts, drizzle schema
│   ├── env/                 # EnvVarService
│   ├── logging/             # Logger, IntentLogService
│   ├── notifications/       # 通知系统
│   └── queue/               # QueueService
│
├── interfaces/              # 接口层
│   ├── cli/                 # CLI 命令
│   ├── formatters/          # 输出格式化
│   ├── gateway/             # InputService, SchedulerService
│   └── integrations/        # Telegram Bot
│
└── types/                   # 类型定义
    ├── human.ts
    └── index.ts
```

### 1.2 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│                      接口层 (interfaces)                    │
│  CLI Commands | Telegram Bot | (未来: Web API)              │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    应用服务层 (application)                  │
│  Service 层：TaskService, EmployeeService, Recruitment等     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      核心层 (core)                          │
│  Agent 层：Orchestrator, TaskManagerAgent, Swarm等          │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  基础设施层 (infrastructure)                │
│  Database, Claude, Config, Queue, Notification等            │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、数据库表设计分析

### 2.1 表清单（16 个核心表）

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| **humans** | 人类档案（个人属性） | name, gender, personality_traits, skills, hobbies |
| **employees** | 员工（公司属性） | name, role, status, model, system_prompt, human_id |
| **employee_agents** | Employee ↔ Agent 映射 | employee_id, agent_name, scope, config_path |
| **skills** | 技能定义 | name, category, system_prompt |
| **tasks** | 任务 | description, status, work_dir, acceptance_criteria |
| **task_employees** | 任务 ↔ 员工关联 | task_id, employee_id, assigned_part |
| **task_executions** | 任务执行记录 | task_id, employee_id, output, quality |
| **task_interactions** | 任务交互（需用户确认） | type, question, options, channel |
| **goals** | 目标 | title, status, owner_id |
| **goal_plans** | 目标方案 | goal_id, version, content |
| **memories** | 记忆 | employee_id, type, content, importance |
| **conversations** | 对话记录 | session_id, employee_id, role, content |
| **chat_messages** | 用户与公司对话 | source, direction, external_chat_id |
| **crontab** | 定时任务 | command, cron_rule, enabled, next_run |
| **cron_executions** | 定时任务执行记录 | cron_id, started_at, exit_code |
| **config** | 配置 | key, value, category |

### 2.2 核心关系图

```
humans (1) ──< (N) employees
                  │
                  ├─ (1:N) ─> employee_agents
                  ├─ (1:N) ─< task_employees ─> (N:1) tasks
                  ├─ (1:N) ─> task_executions ─> (N:1) tasks
                  ├─ (1:N) ─> memories
                  └─ (1:N) ─> conversations

tasks (1) ──< (N) task_employees ──> (N:1) employees
tasks (1) ──< (N) task_executions ──> (N:1) employees
tasks (1) ──< (N) task_interactions

goals (1) ──< (N) goal_plans

crontab (1) ──< (N) cron_executions
crontab (N:1) ──> tasks (可选)
```

### 2.3 设计特点

#### 优点
1. **Human 与 Employee 分离** - 个人属性与公司属性清晰分离
2. **任务执行记录完整** - task_executions 记录每次执行详情
3. **支持多 Agent 协作** - task_employees 支持一个任务多个员工
4. **交互系统完善** - task_interactions 支持用户确认/选择/输入
5. **定时任务集成** - crontab 表支持定时触发

#### 待改进
1. **缺少 outputs 表** - 无法追踪任务产出文件
2. **缺少 publications 表** - 无法追踪发布记录
3. **缺少 reviews 表** - 验收结果存在 tasks.quality，不够结构化
4. **缺少 events 表** - 无法支持事件驱动架构

---

## 三、业务流程分析

### 3.1 主流程：Orchestrator.processRequirement()

```
用户需求
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  1. 查询现有资源 (queryExistingResources)                   │
│     - 类似任务 (7 天内)                                      │
│     - Cron jobs                                             │
│     - Scripts                                               │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  2. 创建任务和工作目录                                       │
│     - db.createTask()                                       │
│     - workDir = ~/.ai-company/outputs/tasks/{task_id}       │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  3. 任务分析 (TaskManagerAgent.analyzeTask)                 │
│     - 使用 Claude LLM 分析任务类型、复杂度                    │
│     - 返回：type, complexity, requiredSkills, etc.          │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  4. 员工匹配 (TaskManagerAgent.findBestEmployee)            │
│     - 使用 Claude LLM 智能匹配最佳员工                       │
│     - 考虑：技能匹配、历史绩效、工作负载                      │
└─────────────────────────────────────────────────────────────┘
    │
    ├─────────────────────────────────────────┐
    │                                         │
    ▼ (需要多 Agent)                          ▼ (单 Agent)
┌─────────────────────────┐     ┌─────────────────────────┐
│  AgentSwarmManager      │     │  直接执行               │
│  .executeSwarm()        │     │  claude.prompt()        │
└─────────────────────────┘     └─────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  5. 构建 AgentDefinition                                    │
│     - 为每个员工构建 {name, description, prompt}            │
│     - 添加 Reviewer Agent                                   │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  6. 调用 Claude CLI --agents                                │
│     - claude.prompt(swarmPrompt, { agent, agents })         │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  7. 自动验收 (ReviewerAgent.reviewStep)                     │
│     - 评分：功能(30%) + 质量(25%) + 可用性(25%) + 验证(20%) │
│     - 返回：overall, score, issues, suggestions            │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  8. 保存结果                                                 │
│     - work_dir/outputs/deliverable.md                       │
│     - work_dir/review-report.md                             │
│     - 更新任务状态                                           │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 多 Agent 协作流程

```
┌─────────────────────────────────────────────────────────────┐
│  AgentSwarmManager.executeSwarm()                           │
│                                                              │
│  1. 招募缺失员工                                             │
│     for needed_recruit in plan.needed_recruits:             │
│         employee = await recruitment_service.recruit(role)  │
│                                                              │
│  2. 构建 AgentDefinition                                     │
│     agents = build_agent_definitions(assignments)           │
│     agents.append(build_reviewer_agent())                   │
│                                                              │
│  3. 执行 Swarm                                               │
│     output = claude.prompt(prompt, {                        │
│       agent: primary_agent,                                  │
│       agents: {name: {description, prompt}, ...}            │
│     })                                                       │
│                                                              │
│  4. 自动验收                                                 │
│     review = await reviewer_agent.review_step(task, workDir)│
│                                                              │
│  5. 保存验收报告                                             │
│     save_review_report(workDir, review, output)             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 动态招募流程

```
┌─────────────────────────────────────────────────────────────┐
│  RecruitmentService.recruit(role, context)                   │
│                                                              │
│  1. 查找或创建 Human                                         │
│     human = find_human(skills=[role])                       │
│     if not found:                                           │
│         human = generate_human_by_ai(role)                  │
│                                                              │
│  2. 使用 AI 生成人类档案                                      │
│     prompt → Claude LLM → JSON:                             │
│     {                                                       │
│       name, gender, personality_traits,                      │
│       hobbies, skills, weaknesses, notes                     │
│     }                                                       │
│                                                              │
│  3. 创建 Employee                                            │
│     employee = db.createEmployee({                          │
│       name: human.name,                                      │
│       role: role,                                           │
│       human_id: human.id,                                   │
│       model: 'claude-sonnet-4-5-20250929'                   │
│     })                                                      │
│                                                              │
│  4. 添加技能                                                 │
│     for skill in human.skills:                              │
│         db.add_employee_skill(employee.id, skill)           │
│                                                              │
│  5. 返回员工                                                 │
│     return {id, name, role}                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、Input 系统分析

### 4.1 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                      Input Sources                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Telegram    │  │  CLI         │  │  Web (未来)   │     │
│  │     Bot      │  │  Commands    │  │     API       │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             ▼
        ┌────────────────────────────────────────────┐
        │       MessageService (消息持久化)           │
        │  - saveUserMessage()                        │
        │  - saveCompanyResponse()                    │
        │  - getChatHistory()                         │
        └────────────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────┐
        │         Orchestrator / Handler             │
        │  - processRequirement()                    │
        │  - handleCommand()                         │
        └────────────────────────────────────────────┘
```

### 4.2 InputService 接口

**位置**：`src/interfaces/gateway/InputService.ts`

```typescript
export interface InputMessage {
  source: 'telegram' | 'web';
  userId?: string;
  content: string;
  messageId?: string;
  metadata?: Record<string, any>;
}

export interface InputResult {
  success: boolean;
  action: 'skill_executed' | 'task_created' | 'chat_response' | 'error';
  message: string;
  data?: any;
}
```

**关键特点**：
1. **Telegram Bot 自己处理消息** - 不经过 IntentAgent，避免 CLI 调用
2. **消息队列支持** - 内置 messageQueue 和 processMessages 循环
3. **可扩展处理器** - registerMessageHandler() 支持自定义处理逻辑

### 4.3 MessageService

**位置**：`src/core/messages/MessageService.ts`

```typescript
class MessageService {
  // 保存用户消息
  saveUserMessage(params: {
    content, source, chatId, userId, username,
    externalMessageId, sessionId, metadata
  })

  // 保存公司响应
  saveCompanyResponse(params: {
    content, source, chatId, sessionId, metadata
  })

  // 获取聊天历史
  getChatHistory(params: { source?, chatId?, sessionId?, limit? })

  // 统计
  getSourceStats()

  // 清理
  cleanup(daysToKeep)
}
```

**数据流**：
```
Telegram 消息
    ↓
MessageService.saveUserMessage()
    ↓
chat_messages 表 (source='tg', direction='user')
    ↓
处理响应
    ↓
MessageService.saveCompanyResponse()
    ↓
chat_messages 表 (source='tg', direction='company')
```

---

## 五、Notification 系统分析

### 5.1 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                  NotificationService                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    渠道注册                            │ │
│  │  channels: Map<channelType, INotificationChannel>      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │ Telegram   │  │    CLI     │  │  (Future)   │           │
│  │  Channel   │  │  Channel   │  │   Web/WS    │           │
│  └────────────┘  └────────────┘  └────────────┘           │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                 交互处理器                              │ │
│  │  interactionHandlers: Map<correlationId, handler>      │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 NotificationService 接口

**位置**：`src/infrastructure/notifications/NotificationService.ts`

```typescript
class NotificationService {
  // 注册渠道
  registerChannel(channel: INotificationChannel)

  // 发送消息
  async send(message: NotificationMessage): Promise<SendResult>

  // 快捷方法
  async sendText(to, text, options?)
  async sendConfirm(to, message, correlationId, options?)
  async sendSelect(to, message, correlationId, optionsList, options?)
  async sendInput(to, message, correlationId, options?)

  // 交互处理
  onInteraction(correlationId, handler)
  offInteraction(correlationId)

  // 编辑/删除
  async edit(channelType, messageId, newContent, chatId?)
  async delete(channelType, messageId, chatId?)
}
```

### 5.3 渠道适配器

```typescript
interface INotificationChannel {
  type: string;                    // 'telegram' | 'cli'
  send(message: NotificationMessage): Promise<SendResult>;
  edit?(messageId, newContent, chatId?): Promise<SendResult>;
  delete?(messageId, chatId?): Promise<boolean>;
  startListening?(callback): void;  // 可选监听
}

// TelegramChannel
class TelegramChannel implements INotificationChannel {
  type = 'telegram';
  constructor(private bot: TelegramBot) {}

  async send(message) {
    return await this.bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: this.buildInlineKeyboard(message.interaction)
    });
  }

  startListening(callback) {
    this.bot.on('callback_query', async (query) => {
      callback({
        correlationId: query.data,
        value: query.data,
        userId: query.from.id.toString()
      });
    });
  }
}

// CLIChannel
class CLIChannel implements INotificationChannel {
  type = 'cli';
  async send(message) {
    console.log(`\n${message.content.text}`);
    // 使用 inquirer 处理交互
  }
}
```

### 5.4 交互系统

**支持的交互类型**：
1. **confirm** - 确认/取消
2. **select** - 多选一
3. **input** - 文本输入

**流程**：
```
1. 发送交互消息
   notificationService.sendConfirm(to, message, correlationId)

2. 用户响应
   Telegram: callback_query
   CLI: inquirer.prompt

3. 触发处理器
   interactionHandlers.get(correlationId)(response)

4. 清理处理器
   offInteraction(correlationId)
```

---

## 六、关键类型定义

### 6.1 任务状态

```typescript
type TaskStatus =
  | 'pending_owner'   // 等待负责人确认
  | 'pending'         // 等待处理
  | 'assigned'        // 已分配
  | 'planning'        // 方案制定中
  | 'dispatched'      // 已分发
  | 'executing'       // 执行中
  | 'wait_human'      // 等待人工介入
  | 'auditing'        // 审计中
  | 'completed'       // 已完成
  | 'failed'          // 已失败
  | 'cancelled';      // 已取消
```

### 6.2 员工状态

```typescript
type EmployeeStatus =
  | 'active'          // 活跃
  | 'busy'            // 忙碌
  | 'offline'         // 离线
  | 'unavailable'     // 不可用
  | 'archived';       // 已归档
```

### 6.3 消息方向

```typescript
type ChatSource = 'tg' | 'web' | 'cli' | 'api' | 'other';
type ChatDirection = 'user' | 'company';
```

---

## 七、待完善部分

### 7.1 缺失的核心功能

| 功能 | 状态 | 优先级 |
|------|------|--------|
| 产出管理 (outputs 表) | ❌ | P0 |
| 发布管理 (publications 表) | ❌ | P1 |
| 验收记录 (reviews 表) | ❌ | P1 |
| 事件系统 (events 表) | ❌ | P0 |
| REST API | ❌ | P2 |

### 7.2 架构改进方向

1. **事件驱动架构**
   - 当前仍是固定流程
   - 需要实现 EventBus + StrategyEngine + DynamicScheduler

2. **复盘进化系统**
   - 验收反馈 → 员工优化 → 流程改进 → Prompt 优化

3. **业务集成**
   - 小红书 API
   - Twitter API
   - Git API

---

## 八、总结

### 当前优势

1. ✅ **完整的 Agent 系统** - 动态招募、智能匹配、多 Agent 协作
2. ✅ **完善的数据库设计** - Human/Employee 分离，任务执行记录完整
3. ✅ **健全的通知系统** - 多渠道支持，交互完善
4. ✅ **灵活的消息系统** - 统一持久化，支持多来源

### 核心问题

1. ❌ **缺少产出管理** - 无法追踪任务产生的文件
2. ❌ **固定流程** - 未实现事件驱动的动态调度
3. ❌ **缺少 API** - 无 REST 接口，只能 CLI/Telegram
4. ❌ **复盘缺失** - 验收结果无法转化为系统改进

### 下一步建议

**P0 - 立即实施**：
1. 实现 OutputManager + outputs 表
2. 实现事件驱动调度器（DynamicScheduler）

**P1 - 近期实施**：
3. 实现复盘进化系统
4. 实现业务集成（小红书、Twitter）

**P2 - 中期规划**：
5. 实现 REST API
6. 实现 Web Dashboard
