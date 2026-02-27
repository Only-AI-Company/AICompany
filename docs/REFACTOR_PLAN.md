# AI Company 系统重构方案

> 版本：v1.0
> 日期：2026-02-27
> 状态：待审查

---

## 目录

1. [重构目标](#一重构目标)
2. [数据表重构](#二数据表重构)
3. [目录结构重构](#三目录结构重构)
4. [核心接口定义](#四核心接口定义)
5. [服务实现规范](#五服务实现规范)
6. [事件系统设计](#六事件系统设计)
7. [业务流程设计](#七业务流程设计)
8. [实施步骤](#八实施步骤)

---

## 一、重构目标

### 1.1 核心原则

| 原则 | 说明 |
|------|------|
| **单一职责** | 每个模块只负责一件事 |
| **清晰分层** | 核心层 → 基础设施层 → 接口层，职责明确 |
| **事件驱动** | 所有模块通过 EventBus 松耦合 |
| **接口优先** | 先定义接口，再实现 |
| **可测试** | 每个服务可独立测试 |

### 1.2 解决的问题

| 问题 | 解决方案 |
|------|----------|
| 重复的 Cron 服务 | 统一为 CronScheduler |
| 混乱的目录结构 | 重新定义三层架构 |
| 配置存储低效 | 改为 namespace + JSON |
| 目标与任务脱节 | 通过事件关联 |
| 无透明度 | 新增完整的日志和报表系统 |

---

## 二、数据表重构

### 2.1 删除的表

```sql
-- 删除以下表
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS memories;
```

### 2.2 重构的表

#### config 表（重构）

```sql
-- 删除旧表
DROP TABLE IF EXISTS config;

-- 新表结构
CREATE TABLE IF NOT EXISTS config (
  namespace TEXT PRIMARY KEY,     -- 配置命名空间（如 'ai_provider', 'telegram'）
  config_json TEXT NOT NULL,       -- 完整的配置JSON
  version INTEGER DEFAULT 1,       -- 版本号（用于配置迁移）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_config_updated ON config(updated_at);

-- 触发器：自动更新 updated_at
CREATE TRIGGER IF NOT EXISTS config_updated_at
AFTER UPDATE ON config
BEGIN
  UPDATE config SET updated_at = strftime('%s', 'now') WHERE rowid = NEW.rowid;
END;
```

#### config 表默认数据

```sql
-- AI Provider 配置
INSERT INTO config (namespace, config_json, version, created_at, updated_at) VALUES
('ai_provider', '{
  "active": "anthropic",
  "providers": {
    "anthropic": {
      "apiKey": "",
      "baseURL": "https://api.anthropic.com",
      "model": "claude-sonnet-4-20250514"
    },
    "kimi": {
      "apiKey": "",
      "baseURL": "https://api.moonshot.cn/v1",
      "model": "moonshot-v1-8k"
    },
    "qwen": {
      "apiKey": "",
      "baseURL": "https://dashscope.aliyuncs.com/api/v1",
      "model": "qwen-turbo"
    }
  }
}', 1, strftime('%s', 'now'), strftime('%s', 'now'));

-- Telegram 配置
INSERT INTO config (namespace, config_json, version, created_at, updated_at) VALUES
('telegram', '{
  "enabled": false,
  "botToken": "",
  "webhookURL": "",
  "adminUserId": ""
}', 1, strftime('%s', 'now'), strftime('%s', 'now'));

-- 公司配置
INSERT INTO config (namespace, config_json, version, created_at, updated_at) VALUES
('company', '{
  "name": "AI Company",
  "timezone": "Asia/Shanghai",
  "workingHours": {
    "start": "09:00",
    "end": "18:00"
  }
}', 1, strftime('%s', 'now'), strftime('%s', 'now'));
```

### 2.3 新增的表

#### activity_logs 表（活动日志）

```sql
-- 记录所有系统活动（透明度系统）
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,       -- 事件类型
  actor TEXT NOT NULL,            -- 执行者（system/user/employee_id）
  action TEXT NOT NULL,           -- 动作
  context_json TEXT,              -- 上下文数据
  result_json TEXT,               -- 结果数据
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (actor) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_event_type ON activity_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_logs(actor);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_logs(timestamp);
```

#### milestone_reports 表（关键节点报告）

```sql
-- 记录需要向用户汇报的关键节点
CREATE TABLE IF NOT EXISTS milestone_reports (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,       -- 事件类型（goal_created, task_completed等）
  title TEXT NOT NULL,            -- 报告标题
  content TEXT NOT NULL,          -- 报告内容
  user_id TEXT,                   -- 接收用户（暂时为空，未来用户系统）
  chat_id TEXT,                   -- 接收聊天ID（Telegram chat_id）
  status TEXT NOT NULL,           -- pending/sent/failed
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_milestone_status ON milestone_reports(status);
CREATE INDEX IF NOT EXISTS idx_milestone_created ON milestone_reports(created_at);
```

#### goal_cron_mapping 表（目标-Cron关联）

```sql
-- 目标与定时任务的关联表
CREATE TABLE IF NOT EXISTS goal_cron_mapping (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  cron_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
  FOREIGN KEY (cron_id) REFERENCES crontab(id) ON DELETE CASCADE,
  UNIQUE(goal_id, cron_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_cron_goal ON goal_cron_mapping(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_cron_cron ON goal_cron_mapping(cron_id);
```

### 2.4 保留的表（13个）

```
核心业务（8表）：
├── humans
├── employees
├── employee_agents
├── skills
├── tasks
├── task_employees
├── task_executions
└── task_interactions

目标系统（2表）：
├── goals
└── goal_plans

定时任务（2表）：
├── crontab
└── cron_executions

通信与日志（3表）：
├── chat_messages
├── intent_logs
└── config（重构）

新增（3表）：
├── activity_logs
├── milestone_reports
└── goal_cron_mapping
```

---

## 三、目录结构重构

### 3.1 新的目录结构

```
src/
├── core/                                    # 核心业务层
│   ├── input/                               # 输入处理
│   │   ├── InputCollector.ts               # 统一输入收集器
│   │   ├── InputClassifier.ts              # 输入分类器
│   │   └── index.ts
│   │
│   ├── intent/                              # 意图理解
│   │   ├── IntentionAnalyzer.ts            # 意图分析器
│   │   ├── ToolRouter.ts                    # 工具路由器（保留）
│   │   ├── tool-definitions.ts             # 工具定义（保留）
│   │   └── index.ts
│   │
│   ├── execution/                           # 执行引擎
│   │   ├── ExecutionEngine.ts              # 统一执行引擎
│   │   ├── TaskExecutor.ts                 # 任务执行器（重构）
│   │   ├── CronExecutor.ts                 # Cron执行器（新建）
│   │   ├── GoalExecutor.ts                 # 目标执行器（新建）
│   │   └── index.ts
│   │
│   ├── goal/                                # 目标管理
│   │   ├── GoalManager.ts                  # 目标管理器
│   │   ├── GoalPlanner.ts                  # 目标规划器
│   │   ├── GoalService.ts                  # 目标服务（保留重构）
│   │   └── index.ts
│   │
│   ├── agents/                              # Agent（保留）
│   │   ├── Orchestrator.ts                 # 编排器（重构）
│   │   ├── TaskManagerAgent.ts
│   │   ├── ReviewerAgent.ts
│   │   ├── EmployeeManagerAgent.ts
│   │   └── index.ts
│   │
│   ├── swarm/                               # 群体协作（保留）
│   │   ├── AgentSwarmManager.ts
│   │   ├── AutonomousLoopExecutor.ts
│   │   └── index.ts
│   │
│   ├── messages/                            # 消息服务（保留）
│   │   ├── MessageService.ts
│   │   └── index.ts
│   │
│   ├── planning/                            # 规划（保留）
│   │   ├── TaskPlanner.ts
│   │   └── index.ts
│   │
│   ├── transparency/                        # 透明度系统（新建）
│   │   ├── ActivityLogger.ts               # 活动日志
│   │   ├── MilestoneReporter.ts            # 关键节点报告
│   │   ├── ReportGenerator.ts              # 报表生成器
│   │   └── index.ts
│   │
│   └── runtime/                             # 运行时（保留）
│       ├── EventBus.ts                      # 事件总线
│       ├── HookSystem.ts                    # Hook系统
│       └── index.ts
│
├── infrastructure/                          # 基础设施层
│   ├── database/
│   │   ├── Database.ts
│   │   ├── drizzle/
│   │   │   ├── schema.ts                    # 主Schema
│   │   │   ├── schema-config.ts             # Config表Schema
│   │   │   ├── schema-activity.ts           # 活动日志Schema
│   │   │   └── index.ts
│   │   ├── seeds/
│   │   │   ├── 000_schema.sql               # 数据库Schema
│   │   │   ├── 001_config.sql               # 默认配置
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── config/
│   │   ├── ConfigService.ts                 # 重构后的配置服务
│   │   ├── Paths.ts
│   │   └── index.ts
│   │
│   ├── ai/
│   │   ├── AIProvider.ts
│   │   └── index.ts
│   │
│   ├── claude/
│   │   ├── ClaudeClient.ts
│   │   ├── ClaudeCLIManager.ts
│   │   ├── PTYExecutor.ts
│   │   ├── Watchdog.ts
│   │   └── index.ts
│   │
│   ├── cron/
│   │   ├── CronScheduler.ts                 # 统一的Cron调度器
│   │   ├── CronRepository.ts               # Cron数据访问
│   │   ├── utils.ts
│   │   └── index.ts
│   │
│   ├── notifications/
│   │   ├── NotificationService.ts
│   │   ├── NotificationChannel.ts
│   │   ├── adapters/
│   │   │   ├── CLIAdapter.ts
│   │   │   └── TelegramAdapter.ts
│   │   └── index.ts
│   │
│   ├── logging/
│   │   ├── Logger.ts
│   │   ├── IntentLogService.ts
│   │   └── index.ts
│   │
│   ├── queue/
│   │   ├── QueueService.ts
│   │   └── index.ts
│   │
│   ├── env/
│   │   ├── EnvVarService.ts
│   │   └── index.ts
│   │
│   └── index.ts
│
├── interfaces/                              # 接口层
│   ├── cli/
│   │   ├── index.ts                         # CLI主入口
│   │   ├── commands/
│   │   │   ├── runCommands.ts
│   │   │   ├── startCommands.ts
│   │   │   ├── goalCommands.ts              # 新增：目标相关命令
│   │   │   ├── reportCommands.ts            # 新增：报表命令
│   │   │   ├── taskCommands.ts              # 新增：任务命令
│   │   │   ├── cronCommands.ts
│   │   │   ├── employeeCommands.ts
│   │   │   ├── configCommands.ts
│   │   │   └── index.ts
│   │   └── prompts.ts
│   │
│   ├── integrations/
│   │   ├── telegram/
│   │   │   ├── TelegramBot.ts               # 重构：只负责消息收发
│   │   │   ├── TelegramEventHandler.ts      # 新增：事件处理
│   │   │   ├── InteractiveMessages.ts       # 保留
│   │   │   └── index.ts
│   │   └── web/                             # 未来：Web接口
│   │       └── index.ts
│   │
│   └── formatters/                          # 格式化器
│       ├── TaskFormatter.ts
│       ├── CronFormatter.ts
│       ├── GoalFormatter.ts                # 新增
│       └── index.ts
│
├── application/                             # 应用层（精简）
│   ├── services/
│   │   ├── CompanyService.ts                # 保留：公司信息
│   │   ├── EmployeeService.ts               # 保留
│   │   ├── HumanService.ts                  # 保留
│   │   ├── RecruitmentService.ts            # 保留
│   │   └── index.ts
│   │
│   ├── builder/                             # 构建器
│   │   ├── ScriptBuilder.ts                 # 保留重构
│   │   └── index.ts
│   │
│   └── Daemon.ts                            # 保留重构：主守护进程
│
├── types/                                   # 类型定义
│   ├── index.ts
│   ├── core/
│   │   ├── input.ts                         # 输入相关类型
│   │   ├── intent.ts                        # 意图相关类型
│   │   ├── execution.ts                     # 执行相关类型
│   │   ├── goal.ts                          # 目标相关类型
│   │   ├── event.ts                         # 事件相关类型
│   │   └── transparency.ts                  # 透明度相关类型
│   ├── infrastructure/
│   │   ├── database.ts
│   │   ├── config.ts
│   │   └── notifications.ts
│   ├── agents.ts
│   └── human.ts
│
└── main.ts                                  # 应用入口
```

---

## 四、核心接口定义

### 4.1 输入相关接口

#### 输入类型 (types/core/input.ts)

```typescript
/**
 * 输入来源
 */
export type InputSource = 'cli' | 'telegram' | 'web' | 'cron' | 'system';

/**
 * 输入消息
 */
export interface InputMessage {
  /** 唯一ID */
  id: string;
  /** 来源 */
  source: InputSource;
  /** 用户ID */
  userId?: string;
  /** 聊天ID（Telegram chat_id等） */
  chatId?: string;
  /** 消息内容 */
  content: string;
  /** 原始数据 */
  rawData?: any;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 输入分类结果
 */
export interface InputClassification {
  /** 分类类型 */
  type: 'task' | 'goal' | 'script' | 'chat' | 'query' | 'command';
  /** 置信度 */
  confidence: number;
  /** 提取的参数 */
  params: Record<string, any>;
}

/**
 * 输入收集器接口
 */
export interface IInputCollector {
  /**
   * 启动收集器
   */
  start(): Promise<void>;

  /**
   * 停止收集器
   */
  stop(): Promise<void>;

  /**
   * 收集消息
   */
  collect(message: InputMessage): Promise<void>;
}

/**
 * 输入分类器接口
 */
export interface IInputClassifier {
  /**
   * 分类输入
   */
  classify(content: string, context?: {
    history?: Array<{ role: string; content: string }>;
    userId?: string;
  }): Promise<InputClassification>;
}
```

### 4.2 意图相关接口 (types/core/intent.ts)

```typescript
/**
 * 意图类型
 */
export type IntentType =
  | 'create_task'           // 创建任务
  | 'create_goal'           // 创建目标
  | 'create_script'         // 创建脚本
  | 'execute_cron'          // 执行定时任务
  | 'query_status'          // 查询状态
  | 'query_tasks'           // 查询任务
  | 'query_goals'           // 查询目标
  | 'query_employees'       // 查询员工
  | 'chat'                  // 聊天
  | 'unknown';              // 未知

/**
 * 意图分析结果
 */
export interface IntentAnalysis {
  /** 意图类型 */
  type: IntentType;
  /** 置信度 */
  confidence: number;
  /** 提取的实体 */
  entities: {
    /** 任务描述 */
    description?: string;
    /** 目标标题 */
    title?: string;
    /** 目标类型 */
    goalType?: 'long_term' | 'short_term';
    /** 优先级 */
    priority?: 'urgent' | 'high' | 'medium' | 'low';
    /** 截止日期 */
    dueDate?: number;
    /** 定时规则 */
    cronRule?: string;
    /** 其他参数 */
    [key: string]: any;
  };
  /** 推理过程 */
  reasoning?: string;
}

/**
 * 意图分析器接口
 */
export interface IIntentAnalyzer {
  /**
   * 分析意图
   */
  analyze(input: {
    content: string;
    context?: {
      history?: Array<{ role: string; content: string }>;
      userId?: string;
    };
  }): Promise<IntentAnalysis>;
}

/**
 * 工具路由结果
 */
export interface ToolRouteResult {
  /** 选择的工具 */
  tool: string;
  /** 工具参数 */
  input: any;
  /** 响应内容 */
  response: string;
  /** 工具调用记录 */
  toolCalls?: Array<{
    tool: string;
    input: any;
    output: any;
  }>;
  /** 执行状态 */
  success: boolean;
}

/**
 * 工具路由器接口
 */
export interface IToolRouter {
  /**
   * 路由到合适的工具
   */
  route(
    userInput: string,
    context?: {
      chatHistory?: Array<{ role: string; content: string }>;
      sessionId?: string;
      source?: 'telegram' | 'cli' | 'web';
    }
  ): Promise<ToolRouteResult>;
}
```

### 4.3 执行相关接口 (types/core/execution.ts)

```typescript
/**
 * 执行类型
 */
export type ExecutionType = 'task' | 'goal' | 'cron' | 'script';

/**
 * 执行状态
 */
export type ExecutionStatus =
  | 'pending'       // 待执行
  | 'planning'      // 规划中
  | 'dispatched'    // 已分发
  | 'executing'     // 执行中
  | 'completed'     // 已完成
  | 'failed'        // 失败
  | 'cancelled';    // 已取消

/**
 * 执行请求
 */
export interface ExecutionRequest {
  /** 执行类型 */
  type: ExecutionType;
  /** 描述/内容 */
  description: string;
  /** 参数 */
  params?: Record<string, any>;
  /** 工作目录 */
  workDir?: string;
  /** 关联ID */
  correlationId?: string;
  /** 来源信息 */
  source?: {
    type: 'user' | 'system' | 'cron';
    userId?: string;
    chatId?: string;
  };
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 状态 */
  status: ExecutionStatus;
  /** 输出内容 */
  output?: string;
  /** 错误信息 */
  error?: string;
  /** 产物 */
  artifacts?: Array<{
    type: 'file' | 'directory' | 'url' | 'data';
    path?: string;
    content?: string;
    metadata?: Record<string, any>;
  }>;
  /** 元数据 */
  metadata?: {
    duration?: number;
    iterations?: number;
    completionPercentage?: number;
    [key: string]: any;
  };
}

/**
 * 执行进度
 */
export interface ExecutionProgress {
  /** 执行ID */
  executionId: string;
  /** 当前状态 */
  status: ExecutionStatus;
  /** 进度百分比 */
  percentage: number;
  /** 当前步骤 */
  currentStep?: string;
  /** 总步骤 */
  totalSteps?: number;
  /** 消息 */
  message?: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 执行器接口
 */
export interface IExecutor {
  /**
   * 执行请求
   */
  execute(request: ExecutionRequest): Promise<ExecutionResult>;

  /**
   * 取消执行
   */
  cancel(executionId: string): Promise<boolean>;

  /**
   * 获取进度
   */
  getProgress(executionId: string): ExecutionProgress | null;
}

/**
 * 执行引擎接口
 */
export interface IExecutionEngine {
  /**
   * 注册执行器
   */
  registerExecutor(type: ExecutionType, executor: IExecutor): void;

  /**
   * 执行请求
   */
  execute(request: ExecutionRequest): Promise<ExecutionResult>;

  /**
   * 取消执行
   */
  cancel(executionId: string): Promise<boolean>;
}
```

### 4.4 目标相关接口 (types/core/goal.ts)

```typescript
/**
 * 目标类型
 */
export type GoalType = 'long_term' | 'short_term' | 'recurring';

/**
 * 目标状态
 */
export type GoalStatus =
  | 'pending_owner'   // 等待Owner确认
  | 'planning'        // 规划中
  | 'active'          // 活跃
  | 'paused'          // 暂停
  | 'completed'       // 已完成
  | 'failed'          // 失败
  | 'cancelled';      // 取消

/**
 * 目标创建请求
 */
export interface CreateGoalRequest {
  /** 目标类型 */
  type: GoalType;
  /** 目标标题 */
  title: string;
  /** 目标描述 */
  description?: string;
  /** 成功标准 */
  acceptanceCriteria?: string;
  /** 截止日期 */
  dueDate?: number;
  /** 父目标ID */
  parentGoalId?: string;
  /** 是否循环 */
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    cronRule?: string;
    autoRenew: boolean;
  };
  /** 初始计划 */
  initialPlan?: {
    steps: Array<{
      name: string;
      description: string;
      estimatedMinutes?: number;
    }>;
  };
}

/**
 * 目标进度
 */
export interface GoalProgress {
  /** 目标ID */
  goalId: string;
  /** 目标标题 */
  title: string;
  /** 完成百分比 */
  completionPercentage: number;
  /** 状态 */
  status: GoalStatus;
  /** 关联任务数 */
  totalTasks: number;
  /** 完成任务数 */
  completedTasks: number;
  /** 进行中任务数 */
  inProgressTasks: number;
  /** 待处理任务数 */
  pendingTasks: number;
  /** 失败任务数 */
  failedTasks: number;
  /** 子目标进度 */
  subGoals?: Array<{
    goalId: string;
    title: string;
    progress: number;
  }>;
}

/**
 * 目标管理器接口
 */
export interface IGoalManager {
  /**
   * 创建目标
   */
  createGoal(request: CreateGoalRequest): Promise<string>;

  /**
   * 创建执行计划
   */
  createExecutionPlan(goalId: string): Promise<string>;

  /**
   * 获取进度
   */
  getProgress(goalId: string): GoalProgress;

  /**
   * 更新进度
   */
  updateProgress(goalId: string): GoalProgress;

  /**
   * 完成目标
   */
  completeGoal(goalId: string): Promise<void>;

  /**
   * 暂停目标
   */
  pauseGoal(goalId: string): Promise<void>;

  /**
   * 恢复目标
   */
  resumeGoal(goalId: string): Promise<void>;

  /**
   * 取消目标
   */
  cancelGoal(goalId: string, reason: string): Promise<void>;

  /**
   * 关联定时任务
   */
  linkCron(goalId: string, cronId: string): Promise<void>;

  /**
   * 取消关联
   */
  unlinkCron(goalId: string, cronId: string): Promise<void>;
}

/**
 * 目标规划器接口
 */
export interface IGoalPlanner {
  /**
   * 分析目标并生成计划
   */
  plan(goal: {
    id: string;
    title: string;
    description: string;
    acceptanceCriteria?: string;
  }): Promise<{
    steps: Array<{
      id: string;
      name: string;
      description: string;
      requiredSkills: string[];
      estimatedMinutes: number;
    }>;
    totalEstimatedMinutes: number;
    reasoning: string;
  }>;
}
```

### 4.5 事件相关接口 (types/core/event.ts)

```typescript
/**
 * 事件类型命名空间
 */
export namespace EventType {
  /** 输入事件 */
  export const INPUT_RECEIVED = 'input.received';
  export const INPUT_CLASSIFIED = 'input.classified';

  /** 意图事件 */
  export const INTENT_ANALYZED = 'intent.analyzed';

  /** 执行事件 */
  export const EXECUTION_STARTED = 'execution.started';
  export const EXECUTION_PROGRESS = 'execution.progress';
  export const EXECUTION_COMPLETED = 'execution.completed';
  export const EXECUTION_FAILED = 'execution.failed';
  export const EXECUTION_CANCELLED = 'execution.cancelled';

  /** 目标事件 */
  export const GOAL_CREATED = 'goal.created';
  export const GOAL_STARTED = 'goal.started';
  export const GOAL_PROGRESS = 'goal.progress';
  export const GOAL_COMPLETED = 'goal.completed';
  export const GOAL_FAILED = 'goal.failed';
  export const GOAL_PAUSED = 'goal.paused';
  export const GOAL_CANCELLED = 'goal.cancelled';

  /** 任务事件 */
  export const TASK_CREATED = 'task.created';
  export const TASK_ASSIGNED = 'task.assigned';
  export const TASK_STARTED = 'task.started';
  export const TASK_COMPLETED = 'task.completed';
  export const TASK_FAILED = 'task.failed';

  /** Cron事件 */
  export const CRON_CREATED = 'cron.created';
  export const CRON_TRIGGERED = 'cron.triggered';
  export const CRON_COMPLETED = 'cron.completed';
  export const CRON_FAILED = 'cron.failed';

  /** 通知事件 */
  export const NOTIFICATION_NEEDED = 'notification.needed';
  export const NOTIFICATION_SENT = 'notification.sent';
  export const NOTIFICATION_FAILED = 'notification.failed';
}

/**
 * 系统事件
 */
export type SystemEvent =
  | InputReceivedEvent
  | InputClassifiedEvent
  | IntentAnalyzedEvent
  | ExecutionStartedEvent
  | ExecutionProgressEvent
  | ExecutionCompletedEvent
  | ExecutionFailedEvent
  | GoalCreatedEvent
  | GoalProgressEvent
  | GoalCompletedEvent
  | CronTriggeredEvent
  | NotificationNeededEvent;

/**
 * 输入接收事件
 */
export interface InputReceivedEvent {
  type: typeof EventType.INPUT_RECEIVED;
  data: {
    messageId: string;
    source: 'cli' | 'telegram' | 'web' | 'cron' | 'system';
    content: string;
    userId?: string;
    chatId?: string;
    timestamp: number;
  };
}

/**
 * 执行开始事件
 */
export interface ExecutionStartedEvent {
  type: typeof EventType.EXECUTION_STARTED;
  data: {
    executionId: string;
    executionType: ExecutionType;
    description: string;
    source?: {
      type: 'user' | 'system' | 'cron';
      userId?: string;
      chatId?: string;
    };
    timestamp: number;
  };
}

/**
 * 执行进度事件
 */
export interface ExecutionProgressEvent {
  type: typeof EventType.EXECUTION_PROGRESS;
  data: {
    executionId: string;
    status: ExecutionStatus;
    percentage: number;
    currentStep?: string;
    totalSteps?: number;
    message?: string;
    timestamp: number;
  };
}

/**
 * 执行完成事件
 */
export interface ExecutionCompletedEvent {
  type: typeof EventType.EXECUTION_COMPLETED;
  data: {
    executionId: string;
    executionType: ExecutionType;
    result: ExecutionResult;
    duration: number;
    timestamp: number;
  };
}

/**
 * 目标创建事件
 */
export interface GoalCreatedEvent {
  type: typeof EventType.GOAL_CREATED;
  data: {
    goalId: string;
    goalType: GoalType;
    title: string;
    description: string;
    recurring?: {
      frequency: 'daily' | 'weekly' | 'monthly';
      cronRule?: string;
    };
    userId?: string;
    chatId?: string;
    timestamp: number;
  };
}

/**
 * 目标进度事件
 */
export interface GoalProgressEvent {
  type: typeof EventType.GOAL_PROGRESS;
  data: {
    goalId: string;
    progress: GoalProgress;
    timestamp: number;
  };
}

/**
 * 通知需求事件
 */
export interface NotificationNeededEvent {
  type: typeof EventType.NOTIFICATION_NEEDED;
  data: {
    notificationId: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    content: string;
    channels: Array<'telegram' | 'cli' | 'web'>;
    userId?: string;
    chatId?: string;
    timestamp: number;
  };
}

/**
 * 事件处理器
 */
export type EventHandler = (event: SystemEvent) => void | Promise<void>;

/**
 * 事件订阅选项
 */
export interface EventSubscriptionOptions {
  /** 是否一次性 */
  once?: boolean;
  /** 是否异步 */
  async?: boolean;
  /** 过滤器 */
  filter?: (event: SystemEvent) => boolean;
}

/**
 * 事件总线接口
 */
export interface IEventBus {
  /**
   * 发布事件
   */
  emit<T extends SystemEvent>(event: T): void;

  /**
   * 订阅事件
   */
  on<T extends SystemEvent>(
    eventType: string,
    handler: (event: T) => void | Promise<void>,
    options?: EventSubscriptionOptions
  ): () => void;

  /**
   * 订阅所有事件
   */
  onAny(handler: EventHandler, options?: EventSubscriptionOptions): () => void;

  /**
   * 异步发布（等待所有处理器完成）
   */
  asyncEmit<T extends SystemEvent>(event: T): Promise<void>;

  /**
   * 清除所有订阅
   */
  clear(): void;
}
```

### 4.6 透明度相关接口 (types/core/transparency.ts)

```typescript
/**
 * 活动日志类型
 */
export type ActivityType =
  | 'system_start'           // 系统启动
  | 'input_received'         // 接收输入
  | 'intent_analyzed'        // 意图分析
  | 'goal_created'           // 创建目标
  | 'goal_started'           // 开始目标
  | 'goal_progress'          // 目标进度
  | 'goal_completed'         // 完成目标
  | 'goal_failed'            // 目标失败
  | 'task_created'           // 创建任务
  | 'task_started'           // 开始任务
  | 'task_completed'         // 完成任务
  | 'task_failed'            // 任务失败
  | 'cron_triggered'         // Cron触发
  | 'cron_completed'         // Cron完成
  | 'execution_started'      // 执行开始
  | 'execution_progress'     // 执行进度
  | 'execution_completed'    // 执行完成
  | 'error_occurred'         // 发生错误
  | 'notification_sent';     // 发送通知

/**
 * 活动日志
 */
export interface ActivityLog {
  id: string;
  eventType: ActivityType;
  actor: 'system' | string;  // system 或 employee_id
  action: string;
  contextJson?: string;
  resultJson?: string;
  timestamp: number;
}

/**
 * 报告类型
 */
export type ReportType = 'daily' | 'weekly' | 'monthly' | 'goal' | 'custom';

/**
 * 报告
 */
export interface Report {
  id: string;
  type: ReportType;
  title: string;
  content: string;
  period?: {
    start: number;
    end: number;
  };
  goalId?: string;
  metadata?: Record<string, any>;
  generatedAt: number;
}

/**
 * 活动记录器接口
 */
export interface IActivityLogger {
  /**
   * 记录活动
   */
  log(options: {
    eventType: ActivityType;
    actor: 'system' | string;
    action: string;
    context?: Record<string, any>;
    result?: Record<string, any>;
  }): void;

  /**
   * 查询活动日志
   */
  query(options: {
    eventType?: ActivityType;
    actor?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): ActivityLog[];

  /**
   * 获取最近的活动
   */
  getRecent(limit?: number): ActivityLog[];
}

/**
 * 里程碑报告器接口
 */
export interface IMilestoneReporter {
  /**
   * 报告里程碑
   */
  report(options: {
    eventType: ActivityType;
    title: string;
    content: string;
    userId?: string;
    chatId?: string;
  }): Promise<void>;

  /**
   * 处理待发送的报告
   */
  processPending(): Promise<void>;
}

/**
 * 报告生成器接口
 */
export interface IReportGenerator {
  /**
   * 生成日报
   */
  generateDaily(date: Date): Promise<Report>;

  /**
   * 生成周报
   */
  generateWeekly(startDate: Date): Promise<Report>;

  /**
   * 生成月报
   */
  generateMonthly(year: number, month: number): Promise<Report>;

  /**
   * 生成目标报告
   */
  generateGoalReport(goalId: string): Promise<Report>;
}
```

---

## 五、服务实现规范

### 5.1 输入收集器 (core/input/InputCollector.ts)

```typescript
/**
 * 输入收集器
 *
 * 职责：
 * - 统一收集所有来源的输入
 * - 标准化为 InputMessage 格式
 * - 发布 input.received 事件
 */
import { EventEmitter } from 'events';
import type { IEventBus } from '../../types/core/event.js';
import type { IInputCollector, InputMessage } from '../../types/core/input.js';

export class InputCollector implements IInputCollector {
  private running = false;
  private sources: Map<string, EventEmitter> = new Map();

  constructor(
    private eventBus: IEventBus
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log('[InputCollector] Started');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.sources.clear();
    console.log('[InputCollector] Stopped');
  }

  async collect(message: InputMessage): Promise<void> {
    if (!this.running) return;

    // 发布事件
    this.eventBus.emit({
      type: 'input.received',
      data: {
        messageId: message.id,
        source: message.source,
        content: message.content,
        userId: message.userId,
        chatId: message.chatId,
        timestamp: message.timestamp,
      },
    });
  }

  /**
   * 注册输入源
   */
  registerSource(name: string, emitter: EventEmitter): void {
    this.sources.set(name, emitter);
  }
}
```

### 5.2 意图分析器 (core/intent/IntentionAnalyzer.ts)

```typescript
/**
 * 意图分析器
 *
 * 职责：
 * - 分析用户输入的意图
 * - 返回结构化的意图分析结果
 * - 支持聊天历史上下文
 */
import type { IIntentAnalyzer, IntentAnalysis, IntentType } from '../../types/core/intent.js';
import type { AIProvider } from '../../infrastructure/ai/index.js';

// 意图类型提示词
const INTENT_PROMPTS = {
  task: '创建一个任务（一次性工作）',
  goal: '创建一个目标（长期或短期目标）',
  script: '创建自动化脚本（可重复执行）',
  chat: '普通对话或提问',
  query: '查询状态或信息',
  command: '执行系统命令',
};

export class IntentionAnalyzer implements IIntentAnalyzer {
  constructor(private aiProvider: AIProvider) {}

  async analyze(input: {
    content: string;
    context?: {
      history?: Array<{ role: string; content: string }>;
      userId?: string;
    };
  }): Promise<IntentAnalysis> {
    // 构建提示词
    const historyContext = this.buildHistoryContext(input.context?.history || []);

    const prompt = `你是意图理解专家。请分析用户的输入。

【用户输入】
${input.content}

【意图类型】
${Object.entries(INTENT_PROMPTS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

${historyContext}

请返回 JSON 格式：
{
  "type": "意图类型",
  "confidence": 0.0-1.0,
  "entities": {
    "description": "任务/目标描述",
    "title": "目标标题",
    "priority": "urgent/high/medium/low",
    "dueDate": 时间戳（如有）,
    "cronRule": "cron表达式（如有）",
    ...
  },
  "reasoning": "分析过程"
}`;

    const response = await this.aiProvider.generate({
      prompt,
      outputFormat: 'json',
    });

    return this.parseResponse(response);
  }

  private buildHistoryContext(history: Array<{ role: string; content: string }>): string {
    if (history.length === 0) return '';

    const recent = history.slice(-5);
    return `【对话历史】\n${recent.map(m => `${m.role}: ${m.content}`).join('\n')}`;
  }

  private parseResponse(response: string): IntentAnalysis {
    try {
      const parsed = JSON.parse(response);
      return {
        type: parsed.type || 'unknown',
        confidence: parsed.confidence || 0.5,
        entities: parsed.entities || {},
        reasoning: parsed.reasoning || '',
      };
    } catch (error) {
      console.error('[IntentionAnalyzer] Failed to parse response:', error);
      return {
        type: 'unknown',
        confidence: 0,
        entities: {},
        reasoning: 'Parse error',
      };
    }
  }
}
```

### 5.3 执行引擎 (core/execution/ExecutionEngine.ts)

```typescript
/**
 * 执行引擎
 *
 * 职责：
 * - 管理所有执行器
 * - 分发执行请求
 * - 跟踪执行进度
 * - 发布执行事件
 */
import type { IExecutionEngine, IExecutor, ExecutionRequest, ExecutionResult, ExecutionProgress } from '../../types/core/execution.js';
import type { IEventBus } from '../../types/core/event.js';
import type { IActivityLogger } from '../../types/core/transparency.js';

export class ExecutionEngine implements IExecutionEngine {
  private executors: Map<string, IExecutor> = new Map();
  private executions: Map<string, ExecutionProgress> = new Map();

  constructor(
    private eventBus: IEventBus,
    private activityLogger: IActivityLogger
  ) {}

  registerExecutor(type: string, executor: IExecutor): void {
    this.executors.set(type, executor);
    console.log(`[ExecutionEngine] Registered executor: ${type}`);
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const executionId = this.generateId();
    const startTime = Date.now();

    // 记录活动
    this.activityLogger.log({
      eventType: 'execution_started',
      actor: 'system',
      action: `Start ${request.type} execution`,
      context: {
        executionId,
        type: request.type,
        description: request.description,
      },
    });

    // 发布开始事件
    this.eventBus.emit({
      type: 'execution.started',
      data: {
        executionId,
        executionType: request.type,
        description: request.description,
        source: request.source,
        timestamp: startTime,
      },
    });

    // 获取执行器
    const executor = this.executors.get(request.type);
    if (!executor) {
      const error = `No executor found for type: ${request.type}`;
      console.error(`[ExecutionEngine] ${error}`);

      return {
        success: false,
        status: 'failed',
        error,
      };
    }

    // 初始化进度
    const progress: ExecutionProgress = {
      executionId,
      status: 'executing',
      percentage: 0,
      timestamp: startTime,
    };
    this.executions.set(executionId, progress);

    try {
      // 执行
      const result = await executor.execute(request);

      // 更新进度
      progress.status = result.status;
      progress.percentage = 100;
      progress.message = result.success ? 'Completed' : result.error || 'Failed';
      progress.timestamp = Date.now();

      // 发布完成事件
      this.eventBus.emit({
        type: 'execution.completed',
        data: {
          executionId,
          executionType: request.type,
          result,
          duration: Date.now() - startTime,
          timestamp: Date.now(),
        },
      });

      // 记录活动
      this.activityLogger.log({
        eventType: result.success ? 'execution_completed' : 'error_occurred',
        actor: 'system',
        action: `${request.type} execution ${result.success ? 'completed' : 'failed'}`,
        result: {
          executionId,
          success: result.success,
          duration: Date.now() - startTime,
        },
      });

      return result;
    } catch (error: any) {
      const result: ExecutionResult = {
        success: false,
        status: 'failed',
        error: error.message,
      };

      // 发布失败事件
      this.eventBus.emit({
        type: 'execution.failed',
        data: {
          executionId,
          executionType: request.type,
          result,
          timestamp: Date.now(),
        },
      });

      return result;
    } finally {
      // 清理进度
      setTimeout(() => {
        this.executions.delete(executionId);
      }, 60000); // 保留1分钟
    }
  }

  cancel(executionId: string): Promise<boolean> {
    const progress = this.executions.get(executionId);
    if (!progress) return false;

    // TODO: 实现取消逻辑
    this.executions.delete(executionId);
    return true;
  }

  getProgress(executionId: string): ExecutionProgress | null {
    return this.executions.get(executionId) || null;
  }

  private generateId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 5.4 配置服务 (infrastructure/config/ConfigService.ts)

```typescript
/**
 * 配置服务
 *
 * 职责：
 * - 管理系统配置（namespace + JSON）
 * - 提供类型安全的配置访问
 * - 支持配置热更新
 */
import type { AIDatabase } from '../database/index.js';

/**
 * 配置命名空间
 */
export type ConfigNamespace =
  | 'ai_provider'
  | 'telegram'
  | 'company'
  | 'notification'
  | 'execution'
  | 'transparency';

/**
 * AI Provider 配置
 */
export interface AIProviderConfig {
  active: string;
  providers: Record<string, {
    apiKey?: string;
    baseURL?: string;
    model?: string;
    timeout?: number;
  }>;
}

/**
 * Telegram 配置
 */
export interface TelegramConfig {
  enabled: boolean;
  botToken?: string;
  webhookURL?: string;
  adminUserId?: string;
}

/**
 * 公司配置
 */
export interface CompanyConfig {
  name: string;
  timezone: string;
  workingHours?: {
    start: string;
    end: string;
  };
}

/**
 * 通知配置
 */
export interface NotificationConfig {
  channels: {
    telegram?: boolean;
    cli?: boolean;
    web?: boolean;
  };
  milestones?: boolean;
  reports?: {
    daily?: boolean;
    weekly?: boolean;
    monthly?: boolean;
  };
}

/**
 * 执行配置
 */
export interface ExecutionConfig {
  defaultTimeout: number;
  maxIterations: number;
  workDir: string;
}

/**
 * 透明度配置
 */
export interface TransparencyConfig {
  logAllActivities: boolean;
  reportMilestones: boolean;
  autoGenerateReports: boolean;
}

export class ConfigService {
  private cache: Map<ConfigNamespace, any> = new Map();

  constructor(private db: AIDatabase) {
    this.initialize();
  }

  private initialize(): void {
    // 确保表存在
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        namespace TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TRIGGER IF NOT EXISTS config_updated_at
      AFTER UPDATE ON config
      BEGIN
        UPDATE config SET updated_at = strftime('%s', 'now') WHERE rowid = NEW.rowid;
      END;
    `);
  }

  /**
   * 获取配置（类型安全）
   */
  get<N extends ConfigNamespace>(namespace: N): ConfigType<N> {
    // 检查缓存
    if (this.cache.has(namespace)) {
      return this.cache.get(namespace) as ConfigType<N>;
    }

    const row = this.db.getDatabase().prepare(
      'SELECT config_json FROM config WHERE namespace = ?'
    ).get(namespace);

    if (!row) {
      // 返回默认配置
      return this.getDefault(namespace);
    }

    const config = JSON.parse((row as any).config_json);
    this.cache.set(namespace, config);
    return config as ConfigType<N>;
  }

  /**
   * 设置配置
   */
  set<N extends ConfigNamespace>(
    namespace: N,
    config: Partial<ConfigType<N>>
  ): void {
    const current = this.get(namespace);
    const merged = { ...current, ...config };
    const now = Math.floor(Date.now() / 1000);

    this.db.getDatabase().prepare(`
      INSERT INTO config (namespace, config_json, version, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(namespace) DO UPDATE SET
        config_json = excluded.config_json,
        updated_at = excluded.updated_at
    `).run(namespace, JSON.stringify(merged), now, now);

    // 更新缓存
    this.cache.set(namespace, merged);
  }

  /**
   * 更新嵌套配置
   */
  update<N extends ConfigNamespace>(
    namespace: N,
    path: string,
    value: any
  ): void {
    const config = this.get(namespace);
    const keys = path.split('.');
    let target = config as any;

    for (let i = 0; i < keys.length - 1; i++) {
      target = target[keys[i]];
    }

    target[keys[keys.length - 1]] = value;
    this.set(namespace, config);
  }

  /**
   * 获取所有配置
   */
  getAll(): Record<string, any> {
    const rows = this.db.getDatabase().prepare(
      'SELECT namespace, config_json FROM config'
    ).all() as any[];

    const result: Record<string, any> = {};
    for (const row of rows) {
      result[row.namespace] = JSON.parse(row.config_json);
    }

    return result;
  }

  /**
   * 导出配置
   */
  export(): string {
    return JSON.stringify(this.getAll(), null, 2);
  }

  /**
   * 导入配置
   */
  import(configJson: string): void {
    const configs = JSON.parse(configJson);
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.getDatabase().prepare(`
      INSERT INTO config (namespace, config_json, version, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(namespace) DO UPDATE SET
        config_json = excluded.config_json,
        updated_at = excluded.updated_at
    `);

    for (const [namespace, config] of Object.entries(configs)) {
      stmt.run(namespace, JSON.stringify(config), now, now);
      this.cache.set(namespace as ConfigNamespace, config);
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  private getDefault<N extends ConfigNamespace>(namespace: N): ConfigType<N> {
    const defaults: Record<ConfigNamespace, any> = {
      ai_provider: {
        active: 'anthropic',
        providers: {
          anthropic: {
            baseURL: 'https://api.anthropic.com',
            model: 'claude-sonnet-4-20250514',
          },
        },
      },
      telegram: {
        enabled: false,
      },
      company: {
        name: 'AI Company',
        timezone: 'Asia/Shanghai',
      },
      notification: {
        channels: {
          cli: true,
        },
        milestones: true,
        reports: {
          daily: false,
          weekly: false,
          monthly: false,
        },
      },
      execution: {
        defaultTimeout: 300000,
        maxIterations: 10,
        workDir: './outputs',
      },
      transparency: {
        logAllActivities: true,
        reportMilestones: true,
        autoGenerateReports: false,
      },
    };

    return defaults[namespace] as ConfigType<N>;
  }
}

/**
 * 配置类型映射
 */
type ConfigType<N extends ConfigNamespace> =
  N extends 'ai_provider' ? AIProviderConfig :
  N extends 'telegram' ? TelegramConfig :
  N extends 'company' ? CompanyConfig :
  N extends 'notification' ? NotificationConfig :
  N extends 'execution' ? ExecutionConfig :
  N extends 'transparency' ? TransparencyConfig :
  never;

// 单例
let configServiceInstance: ConfigService | null = null;

export function getConfigService(db?: AIDatabase): ConfigService {
  if (!configServiceInstance) {
    if (!db) {
      throw new Error('ConfigService requires database on first call');
    }
    configServiceInstance = new ConfigService(db);
  }
  return configServiceInstance;
}
```

### 5.5 Cron调度器 (infrastructure/cron/CronScheduler.ts)

```typescript
/**
 * Cron 调度器
 *
 * 职责：
 * - 统一管理所有定时任务
 * - 使用 node-cron 调度
 * - 触发时发布 cron.triggered 事件
 */
import cron from 'node-cron';
import type { IEventBus } from '../../types/core/event.js';
import type { AIDatabase } from '../database/index.js';
import type { ConfigService } from '../config/index.js';

interface CronJob {
  id: string;
  name: string;
  description?: string;
  command: string;
  args?: Record<string, any>;
  cronRule: string;
  enabled: boolean;
  timeout?: number;
  workingDir?: string;
  env?: Record<string, string>;
}

export class CronScheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  constructor(
    private db: AIDatabase,
    private eventBus: IEventBus,
    private configService: ConfigService
  ) {}

  /**
   * 启动调度器
   */
  async start(): Promise<void> {
    console.log('[CronScheduler] Starting...');

    // 加载所有启用的任务
    const jobs = this.loadJobs();

    let scheduled = 0;
    for (const job of jobs) {
      if (job.enabled && job.cronRule) {
        this.schedule(job);
        scheduled++;
      }
    }

    console.log(`[CronScheduler] Started (${scheduled} jobs scheduled)`);

    return { kill: () => this.stop() };
  }

  /**
   * 停止调度器
   */
  stop(): void {
    console.log('[CronScheduler] Stopping...');

    for (const [id, task] of this.jobs.entries()) {
      task.stop();
      console.log(`[CronScheduler] Stopped job: ${id}`);
    }

    this.jobs.clear();
  }

  /**
   * 调度任务
   */
  schedule(job: CronJob): void {
    // 先停止旧任务
    this.unschedule(job.id);

    if (!job.enabled || !job.cronRule) {
      return;
    }

    const scheduledTask = cron.schedule(job.cronRule, async () => {
      await this.execute(job);
    }, {
      timezone: this.configService.get('company').timezone,
    });

    this.jobs.set(job.id, scheduledTask);
    console.log(`[CronScheduler] Scheduled job: ${job.name} (${job.cronRule})`);
  }

  /**
   * 取消调度
   */
  unschedule(jobId: string): void {
    const task = this.jobs.get(jobId);
    if (task) {
      task.stop();
      this.jobs.delete(jobId);
      console.log(`[CronScheduler] Unscheduled job: ${jobId}`);
    }
  }

  /**
   * 执行任务
   */
  private async execute(job: CronJob): Promise<void> {
    const startTime = Date.now();

    console.log(`\n[CronScheduler] Executing: ${job.name}`);
    console.log(`  Command: ${job.command}`);
    console.log(`  Time: ${new Date().toLocaleString('zh-CN')}`);

    // 发布触发事件
    this.eventBus.emit({
      type: 'cron.triggered',
      data: {
        cronId: job.id,
        name: job.name,
        command: job.command,
        args: job.args,
        timestamp: startTime,
      },
    });

    try {
      // 调用执行引擎执行
      const { ExecutionEngine } = await import('../../core/execution/index.js');
      const engine = ExecutionEngine.getInstance();

      const result = await engine.execute({
        type: 'cron',
        description: job.name,
        params: {
          command: job.command,
          args: job.args,
          workDir: job.workingDir,
          env: job.env,
        },
        workDir: job.workingDir,
      });

      const duration = Date.now() - startTime;

      // 更新执行记录
      this.updateExecutionRecord(job.id, {
        startedAt: startTime,
        completedAt: Date.now(),
        exitCode: result.success ? 0 : 1,
        output: result.output,
        error: result.error,
        duration,
      });

      // 发布完成事件
      if (result.success) {
        this.eventBus.emit({
          type: 'cron.completed',
          data: {
            cronId: job.id,
            name: job.name,
            output: result.output,
            duration,
            timestamp: Date.now(),
          },
        });
      } else {
        this.eventBus.emit({
          type: 'cron.failed',
          data: {
            cronId: job.id,
            name: job.name,
            error: result.error,
            duration,
            timestamp: Date.now(),
          },
        });
      }

      console.log(`[CronScheduler] Completed: ${job.name} (${duration}ms)`);
    } catch (error: any) {
      console.error(`[CronScheduler] Failed: ${job.name} - ${error.message}`);

      this.eventBus.emit({
        type: 'cron.failed',
        data: {
          cronId: job.id,
          name: job.name,
          error: error.message,
          timestamp: Date.now(),
        },
      });
    }
  }

  /**
   * 加载任务
   */
  private loadJobs(): CronJob[] {
    const rows = this.db.getDatabase().prepare(`
      SELECT id, name, description, command, args_json, cron_rule, enabled,
             timeout, working_dir, env_json
      FROM crontab
      WHERE enabled = 1
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      command: row.command,
      args: row.args_json ? JSON.parse(row.args_json) : undefined,
      cronRule: row.cron_rule,
      enabled: Boolean(row.enabled),
      timeout: row.timeout,
      workingDir: row.working_dir,
      env: row.env_json ? JSON.parse(row.env_json) : undefined,
    }));
  }

  /**
   * 更新执行记录
   */
  private updateExecutionRecord(
    cronId: string,
    data: {
      startedAt: number;
      completedAt: number;
      exitCode: number;
      output?: string;
      error?: string;
      duration: number;
    }
  ): void {
    const executionId = this.generateId();

    // 插入执行记录
    this.db.getDatabase().prepare(`
      INSERT INTO cron_executions (id, cron_id, started_at, completed_at, exit_code, output, error, timeout)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      executionId,
      cronId,
      data.startedAt,
      data.completedAt,
      data.exitCode,
      data.output || null,
      data.error || null,
      false
    );

    // 更新cron表
    this.db.getDatabase().prepare(`
      UPDATE crontab SET
        last_run = ?,
        last_running_at = ?,
        run_count = run_count + 1,
        fail_count = fail_count + ?,
        last_output = ?,
        last_error = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      data.startedAt,
      data.startedAt,
      data.exitCode !== 0 ? 1 : 0,
      data.output || null,
      data.error || null,
      Date.now() / 1000,
      cronId
    );
  }

  private generateId(): string {
    return `cron_exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 5.6 活动记录器 (core/transparency/ActivityLogger.ts)

```typescript
/**
 * 活动记录器
 *
 * 职责：
 * - 记录所有系统活动
 * - 提供查询接口
 */
import type { IActivityLogger, ActivityLog, ActivityType } from '../../types/core/transparency.js';
import type { AIDatabase } from '../../infrastructure/database/index.js';

export class ActivityLogger implements IActivityLogger {
  constructor(private db: AIDatabase) {}

  log(options: {
    eventType: ActivityType;
    actor: 'system' | string;
    action: string;
    context?: Record<string, any>;
    result?: Record<string, any>;
  }): void {
    const log: ActivityLog = {
      id: this.generateId(),
      eventType: options.eventType,
      actor: options.actor,
      action: options.action,
      contextJson: options.context ? JSON.stringify(options.context) : undefined,
      resultJson: options.result ? JSON.stringify(options.result) : undefined,
      timestamp: Date.now(),
    };

    this.db.getDatabase().prepare(`
      INSERT INTO activity_logs (id, event_type, actor, action, context_json, result_json, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      log.id,
      log.eventType,
      log.actor,
      log.action,
      log.contextJson,
      log.resultJson,
      log.timestamp
    );
  }

  query(options: {
    eventType?: ActivityType;
    actor?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): ActivityLog[] {
    let sql = 'SELECT * FROM activity_logs WHERE 1=1';
    const params: any[] = [];

    if (options.eventType) {
      sql += ' AND event_type = ?';
      params.push(options.eventType);
    }

    if (options.actor) {
      sql += ' AND actor = ?';
      params.push(options.actor);
    }

    if (options.startTime) {
      sql += ' AND timestamp >= ?';
      params.push(options.startTime);
    }

    if (options.endTime) {
      sql += ' AND timestamp <= ?';
      params.push(options.endTime);
    }

    sql += ' ORDER BY timestamp DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.getDatabase().prepare(sql).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      eventType: row.event_type,
      actor: row.actor,
      action: row.action,
      contextJson: row.context_json,
      resultJson: row.result_json,
      timestamp: row.timestamp,
    }));
  }

  getRecent(limit: number = 50): ActivityLog[] {
    return this.query({ limit });
  }

  private generateId(): string {
    return `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

---

## 六、事件系统设计

### 6.1 事件订阅示例

```typescript
/**
 * 事件订阅示例
 */
import { getEventBus } from './runtime/index.js';
import { EventType } from './types/core/event.js';

// 获取事件总线
const eventBus = getEventBus();

// 订阅输入事件
eventBus.on(EventType.INPUT_RECEIVED, async (event) => {
  console.log('Input received:', event.data.content);

  // 触发意图分析
  const { IntentionAnalyzer } = await import('./intent/index.js');
  const analyzer = new IntentionAnalyzer(aiProvider);
  const analysis = await analyzer.analyze({ content: event.data.content });

  // 发布意图分析事件
  eventBus.emit({
    type: EventType.INTENT_ANALYZED,
    data: {
      ...analysis,
      sourceMessageId: event.data.messageId,
      timestamp: Date.now(),
    },
  });
});

// 订阅意图分析事件
eventBus.on(EventType.INTENT_ANALYZED, async (event) => {
  const { type, entities } = event.data;

  // 根据意图分发
  switch (type) {
    case 'create_goal':
      await handleCreateGoal(entities);
      break;
    case 'create_task':
      await handleCreateTask(entities);
      break;
    // ...
  }
});

// 订阅所有事件（用于日志）
eventBus.onAny((event) => {
  console.log(`[${event.type}]`, JSON.stringify(event.data, null, 2));
});
```

### 6.2 事件流程图

```
输入事件流：
┌─────────────┐
│ TelegramMsg │
└──────┬──────┘
       │
       ▼
input.received
       │
       ▼
intent.analyzed
       │
       ├──► goal.created → 目标管理器
       ├──► task.created → 任务管理器
       ├──► cron.created → Cron调度器
       └──► chat.response → 聊天响应

执行事件流：
execution.started
       │
       ▼
execution.progress (多次)
       │
       ▼
execution.completed / execution.failed
```

---

## 七、业务流程设计

### 7.1 "每天10点科技日报"完整流程

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 用户输入                                                   │
│  Telegram: "每天10点给我一份科技日报"                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. InputCollector.collect()                                  │
│  → 发布 input.received 事件                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. InputClassifier.classify()                                │
│  → 分类为: create_recurring_goal                             │
│  → 发布 input.classified 事件                                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. IntentionAnalyzer.analyze()                               │
│  → 意图: create_goal                                          │
│  → 实体: {                                                    │
│      title: "每日科技日报",                                   │
│      type: "recurring",                                      │
│      recurring: { frequency: "daily", time: "10:00" }       │
│    }                                                          │
│  → 发布 intent.analyzed 事件                                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. GoalManager.createGoal()                                  │
│  → 创建 goals 记录                                            │
│  → 创建 goal_plans 记录                                       │
│  → 发布 goal.created 事件                                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. CronScheduler.schedule()                                 │
│  → goal_cron_mapping 记录                                   │
│  → 创建 crontab 记录 (0 10 * * *)                           │
│  → 发布 cron.created 事件                                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. MilestoneReporter.report()                                │
│  → 发送 Telegram: "⏰ 已设置定时任务..."                      │
└─────────────────────────────────────────────────────────────┘

[时间流逝 - 第二天10:00]

┌─────────────────────────────────────────────────────────────┐
│ 8. CronScheduler.execute()                                  │
│  → 发布 cron.triggered 事件                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. ExecutionEngine.execute({ type: 'goal' })              │
│  → 发布 execution.started 事件                                │
│  → GoalExecutor.execute()                                   │
│      │                                                        │
│      ├──► 执行计划步骤                                        │
│      │     ├── 收集新闻                                      │
│      │     ├── 生成日报                                      │
│      │     └── 发送到用户                                     │
│      │                                                        │
│      └──► 发布 execution.progress 事件                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 10. ExecutionEngine - 发布 execution.completed             │
│  → MilestoneReporter.report()                                │
│  → 发送 Telegram: "✅ 科技日报已生成..."                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 八、实施步骤

### Phase 1: 数据库重构（1天）

**任务清单：**
- [ ] 创建新的 config 表结构
- [ ] 创建 activity_logs 表
- [ ] 创建 milestone_reports 表
- [ ] 创建 goal_cron_mapping 表
- [ ] 删除 conversations 和 memories 表
- [ ] 创建数据迁移脚本
- [ ] 更新 Drizzle Schema

**验收标准：**
- 新表创建成功
- 旧表删除成功
- 默认配置数据正确

### Phase 2: 目录重构（2天）

**任务清单：**
- [ ] 创建新的目录结构
- [ ] 创建 types/core/ 目录和类型文件
- [ ] 移动 core/ 下文件到新位置
- [ ] 重构 infrastructure/config/
- [ ] 重构 infrastructure/cron/
- [ ] 创建 core/transparency/ 目录
- [ ] 更新所有 import 路径
- [ ] 删除废弃文件（InputService, 旧的SchedulerService等）

**验收标准：**
- 目录结构符合设计
- 所有 import 正确
- 没有废弃文件

### Phase 3: 实现核心接口（3天）

**任务清单：**
- [ ] 实现 InputCollector
- [ ] 实现 InputClassifier
- [ ] 重构 IntentionAnalyzer
- [ ] 实现 ExecutionEngine
- [ ] 实现 CronScheduler
- [ ] 重构 ConfigService
- [ ] 实现 ActivityLogger
- [ ] 实现 MilestoneReporter

**验收标准：**
- 所有接口实现完成
- 单元测试通过
- 集成测试通过

### Phase 4: 事件系统集成（2天）

**任务清单：**
- [ ] 重构 EventBus（增强功能）
- [ ] 定义所有事件类型
- [ ] 在各服务中集成事件发布
- [ ] 实现事件订阅
- [ ] 测试事件流程

**验收标准：**
- 事件发布正确
- 事件订阅正确
- 事件流程完整

### Phase 5: 重构现有服务（3天）

**任务清单：**
- [ ] 重构 TelegramBot（简化为消息收发）
- [ ] 重构 ToolRouter（保持功能）
- [ ] 重构 GoalService（扩展功能）
- [ ] 重构 TaskExecutor（适配ExecutionEngine）
- [ ] 重构 ScriptBuilder（关联目标系统）
- [ ] 重构 Daemon（主守护进程）

**验收标准：**
- Telegram 功能正常
- 任务执行正常
- 目标创建和执行正常
- Cron 调度正常

### Phase 6: CLI命令扩展（1天）

**任务清单：**
- [ ] 添加 goal 相关命令
- [ ] 添加 report 命令
- [ ] 添加 activity 命令
- [ ] 优化现有命令

**验收标准：**
- 新命令可用
- 命令输出清晰

### Phase 7: 测试与文档（2天）

**任务清单：**
- [ ] 端到端测试
- [ ] 性能测试
- [ ] 编写API文档
- [ ] 编写使用示例
- [ ] 编写迁移指南

**验收标准：**
- 测试用例通过
- 文档完整

---

## 附录

### A. 文件映射表（旧 → 新）

| 旧文件 | 新文件 | 状态 |
|--------|--------|------|
| `application/services/CronService.ts` | `infrastructure/cron/CronScheduler.ts` | 重构 |
| `interfaces/gateway/CronService.ts` | 删除 | 废弃 |
| `interfaces/gateway/SchedulerService.ts` | 删除 | 废弃 |
| `interfaces/gateway/InputService.ts` | `core/input/InputCollector.ts` | 重构 |
| `infrastructure/config/ConfigService.ts` | `infrastructure/config/ConfigService.ts` | 重写 |
| `application/services/TaskExecutor.ts` | `core/execution/TaskExecutor.ts` | 移动 |
| `application/services/GoalService.ts` | `core/goal/GoalService.ts` | 移动+扩展 |

### B. 时间估算

| Phase | 时间 | 关键路径 |
|-------|------|----------|
| Phase 1: 数据库重构 | 1天 | ✅ |
| Phase 2: 目录重构 | 2天 | ✅ |
| Phase 3: 实现核心接口 | 3天 | ✅ |
| Phase 4: 事件系统集成 | 2天 | ✅ |
| Phase 5: 重构现有服务 | 3天 | ✅ |
| Phase 6: CLI命令扩展 | 1天 | ✅ |
| Phase 7: 测试与文档 | 2天 | ✅ |
| **总计** | **14天** | |

### C. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 数据迁移失败 | 高 | 备份数据库，分步迁移 |
| 接口设计不合理 | 中 | 先写接口示例，再实现 |
| 性能下降 | 中 | 性能测试，优化热点 |
| 兼容性问题 | 低 | 保持部分旧接口，逐步迁移 |

---

**文档版本：** v1.0
**最后更新：** 2026-02-27
**审查状态：** 待审查
