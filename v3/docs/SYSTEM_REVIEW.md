# AI Company v3 - 系统审查报告

## 审查日期
2026-03-11

---

## 一、已实现组件审查

### ✅ 完成的核心组件

#### 1. Engine (`src/core/Engine.ts`)

**职责：**
- 自主运行后台循环
- 协调各组件工作
- 处理用户输入
- 定期复盘

**实现质量：** ⭐⭐⭐⭐ (4/5)

**优点：**
- 清晰的循环逻辑：目标检查 → 任务执行 → 进度更新 → 复盘
- 良好的事件发射机制
- 数据库持久化集成
- 安全的数据库初始化（延迟加载）

**问题：**
- ⚠️ `shutdownComponents()` 是空实现
- ⚠️ 复盘间隔用 `Date.now() % 60000 < 1000` 不够精确
- ⚠️ 没有优雅关闭机制（正在执行的任务会中断）

**建议：**
```typescript
// 改进复盘触发
private nextReviewTime: number = 0;

private shouldPerformReview(): boolean {
  const now = Date.now();
  if (now > this.nextReviewTime) {
    this.nextReviewTime = now + 60000; // 1分钟后
    return true;
  }
  return false;
}

// 改进优雅关闭
async stop(): Promise<void> {
  this.running = false;

  // 等待执行中任务完成
  while (this.scheduler.getExecutingTasks().length > 0) {
    await delay(100);
  }

  await this.shutdownComponents();
}
```

---

#### 2. CEO (`src/core/CEO.ts`)

**职责：**
- 理解用户输入（意图分类）
- 拆解目标为计划
- 分配任务给员工
- 复盘任务结果

**实现质量：** ⭐⭐⭐⭐⭐ (5/5)

**优点：**
- 所有决策方法都是 LLM 驱动
- 完善的 fallback 机制
- 使用 parseJSON 处理各种格式
- 清晰的评分标准和绩效调整

**问题：**
- 无明显问题

**建议：**
- 可以添加决策历史记录，用于审计和学习

---

#### 3. GoalManager (`src/core/GoalManager.ts`)

**职责：**
- 存储和管理目标
- 拆解目标为计划
- 追踪进度
- 持久化到数据库

**实现质量：** ⭐⭐⭐⭐ (4/5)

**优点：**
- 内存 + 数据库双层存储
- 自动从数据库恢复
- 步骤依赖关系支持
- 进度自动计算

**问题：**
- ⚠️ `loadFromDatabase()` 在尝试加载时可能失败（数据库未初始化）
- ⚠️ 没有处理数据库加载失败后的重试机制

**建议：**
```typescript
// 添加重试加载机制
async reloadFromDatabase(): Promise<void> {
  let attempts = 0;
  while (attempts < 3) {
    try {
      this.db = getDatabaseSync();
      this.loadFromDatabase();
      return;
    } catch {
      attempts++;
      await delay(1000);
    }
  }
}
```

---

#### 4. Scheduler (`src/core/Scheduler.ts`)

**职责：**
- 任务队列管理
- 优先级调度
- 并发控制
- 自动重试

**实现质量：** ⭐⭐⭐⭐⭐ (5/5)

**优点：**
- 优先级权重 + 年龄权重（防饥饿）
- 并发限制（MAX_CONCURRENT_TASKS = 3）
- 自动重试（MAX_ATTEMPTS = 3）
- 指数退避重试延迟
- 完整的事件发射

**问题：**
- 无明显问题

**建议：**
- 可以考虑添加任务依赖管理（DAG 调度）

---

#### 5. Database (`src/core/database/Database.ts`)

**职责：**
- SQLite 数据库操作
- CRUD 方法
- 统计查询

**实现质量：** ⭐⭐⭐⭐ (4/5)

**优点：**
- 完整的 schema 设计
- 外键约束
- 索引优化
- 类型安全的 getStats()

**问题：**
- ⚠️ 所有方法使用 `any` 类型
- ⚠️ 没有数据库迁移机制
- ⚠️ 没有数据库备份/恢复
- ⚠️ 缺少事务支持

**建议：**
```typescript
// 添加类型定义
interface GoalRecord {
  id: string;
  description: string;
  timeframe: string;
  status: GoalStatus;
  parent_goal_id?: string;
  progress: number;
  created_at: number;
  completed_at?: number;
}

// 类型安全的方法
insertGoal(goal: GoalRecord): void;

// 添加事务支持
transaction<T>(fn: () => T): T {
  this.exec('BEGIN');
  try {
    const result = fn();
    this.exec('COMMIT');
    return result;
  } catch (error) {
    this.exec('ROLLBACK');
    throw error;
  }
}
```

---

## 二、架构问题分析

### ⚠️ 关键问题

#### 1. 过度使用 Singleton 模式

**问题：**
```typescript
// 每个组件都是 singleton
let engineInstance: Engine | null = null;
export function getEngine(): Engine {
  if (!engineInstance) {
    engineInstance = new Engine();
  }
  return engineInstance;
}
```

**影响：**
- 难以测试（无法 mock）
- 难以并行运行多个实例
- 组件之间紧耦合

**建议：使用依赖注入**
```typescript
class Engine {
  constructor(
    private goalManager: GoalManager,
    private scheduler: Scheduler,
    private ceo: CEO,
    private db: AIDatabase
  ) {}
}

// 主程序组装
const db = await getDatabase();
const ceo = new CEO(aiProvider);
const goalManager = new GoalManager(ceo, db);
const scheduler = new Scheduler(ceo, db);
const engine = new Engine(goalManager, scheduler, ceo, db);
```

---

#### 2. 数据库初始化时序问题

**问题：**
- GoalManager 和 Scheduler 在构造函数中尝试访问数据库
- 但数据库需要 Engine.start() 才初始化
- 导致首次启动时数据丢失

**当前流程：**
```
1. new Engine() → new GoalManager() → 尝试加载数据库（失败）
2. engine.start() → 初始化数据库
3. 但 GoalManager 已经加载过了，不会重试
```

**建议：显式初始化**
```typescript
class GoalManager {
  private initialized = false;

  async initialize(db: AIDatabase): Promise<void> {
    if (this.initialized) return;
    this.db = db;
    this.loadFromDatabase();
    this.initialized = true;
  }
}

class Engine {
  async initializeComponents(): Promise<void> {
    this.db = await getDatabase();

    // 显式初始化各组件
    await this.goalManager.initialize(this.db);
    await this.scheduler.initialize(this.db);
  }
}
```

---

#### 3. 缺少工具系统

**问题：**
```typescript
// Employee.ts
async execute(task: Task): Promise<TaskResult> {
  // 只使用 LLM，没有工具调用
  const response = await this.aiProvider.prompt(...);
  return { success: true, output: response.content };
}
```

**影响：**
- 员工无法执行实际操作（读写文件、运行命令等）
- 纯 LLM 无法完成复杂任务

**建议：实现 Tool Use**
```typescript
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(params: any): Promise<any>;
}

class Employee {
  private tools: Map<string, Tool> = new Map();

  async execute(task: Task): Promise<TaskResult> {
    // 1. 分析任务需要哪些工具
    const toolAnalysis = await this.analyzeRequiredTools(task);

    // 2. 调用 LLM with tool use
    const response = await this.aiProvider.promptWithTools(
      task.description,
      this.systemPrompt,
      toolAnalysis.requiredTools
    );

    // 3. 执行工具调用
    for (const toolCall of response.toolCalls || []) {
      const tool = this.tools.get(toolCall.name);
      if (tool) {
        const result = await tool.execute(toolCall.parameters);
        // 将结果反馈给 LLM
      }
    }

    return { success: true, output: response.content };
  }
}
```

---

#### 4. 缺少记忆系统

**问题：**
- 复盘存储了 `learnings`，但从不读取
- 员工无法从过去的经验中学习
- 没有语义记忆存储通用知识

**建议：实现双层记忆**
```typescript
interface EpisodicMemory {
  id: string;
  taskDescription: string;
  employeeId: string;
  outcome: 'success' | 'failure';
  learnings: string[];
  timestamp: number;
}

interface SemanticMemory {
  id: string;
  knowledge: string;
  category: string;
  confidence: number;
  source: 'review' | 'user' | 'system';
}

class MemorySystem {
  // 存储经验
  storeEpisodic(review: Review): void;

  // 提取语义知识
  extractSemantic(review: Review): SemanticMemory;

  // 检索相关经验
  retrieveRelevant(task: Task): EpisodicMemory[];

  // 检索相关知识
  retrieveKnowledge(query: string): SemanticMemory[];
}
```

---

## 三、缺失组件

### 1. CLI 入口（优先级：高）

**当前状态：** 基础 REPL

**需要实现：**
```bash
# 启动引擎
ai-company start

# 交互模式
ai-company chat

# 设置目标
ai-company goal "30天1万粉丝" --timeframe "30天"

# 查看状态
ai-company status

# 查看任务
ai-company tasks [--pending] [--running]

# 查看员工
ai-company employees

# 查看复盘
ai-company reviews

# 系统控制
ai-company stop
ai-company pause
ai-company resume
```

### 2. 配置系统（优先级：高）

**当前状态：** 硬编码值

**需要实现：**
```yaml
# config.yaml
engine:
  loop_interval: 1000      # 循环间隔(ms)
  review_interval: 60000   # 复盘间隔(ms)
  max_concurrent_tasks: 3
  max_task_attempts: 3

ai:
  provider: anthropic      # 默认 provider
  model: claude-3-5-sonnet-20241022
  fallback_providers:
    - qwen
    - zhipu

database:
  path: ./data/company.db
  backup_enabled: true
  backup_interval: 86400  # 每天备份

logging:
  level: info
  file: ./logs/ai-company.log
  console: true
```

### 3. 日志系统（优先级：中）

**当前状态：** console.log

**建议：** 使用 pino 或 winston

```typescript
import pino from 'pino';

export const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname'
    }
  }
});

// 使用
logger.info({ component: 'Engine', action: 'start' }, 'Engine starting');
logger.error({ component: 'Scheduler', taskId: 'xxx', error: err.message }, 'Task failed');
```

### 4. 监控系统（优先级：中）

**建议实现：**
- 任务成功率监控
- LLM 调用统计
- 员工绩效趋势
- 系统资源使用

```typescript
interface Metrics {
  tasks: {
    total: number;
    completed: number;
    failed: number;
    successRate: number;
  };
  llm: {
    totalCalls: number;
    totalTokens: number;
    avgLatency: number;
  };
  employees: {
    id: string;
    tasksCompleted: number;
    avgScore: number;
    performanceTrend: number;
  }[];
}
```

---

## 四、下一步设计

### Phase 1: CLI 与配置（立即）

1. **实现完整的 CLI**
   - 使用 commander.js
   - 支持所有核心命令
   - 添加帮助文档

2. **配置系统**
   - YAML 配置文件
   - 环境变量支持
   - 配置验证

### Phase 2: 工具系统（高优先级）

1. **定义工具接口**
   - Tool 接口
   - 工具注册机制
   - 参数验证

2. **实现核心工具**
   - Bash 工具
   - 文件读写工具
   - 搜索工具

3. **集成到 Employee**
   - Tool Use 支持
   - 工具选择逻辑

### Phase 3: 记忆系统（中优先级）

1. **Episodic Memory**
   - 存储任务执行记录
   - 检索相关经验

2. **Semantic Memory**
   - 提取和存储知识
   - 知识检索

3. **集成到 CEO**
   - 复盘时提取知识
   - 决策时检索经验

### Phase 4: 监控与日志（中优先级）

1. **结构化日志**
   - pino 集成
   - 日志级别管理

2. **指标收集**
   - 任务统计
   - LLM 使用统计
   - 员工绩效追踪

3. **健康检查**
   - 系统状态查询
   - 自动告警

---

## 五、总结

### 当前完成度：70%

**已完成：**
- ✅ 核心引擎循环
- ✅ LLM 驱动决策
- ✅ 数据持久化
- ✅ 任务调度
- ✅ 复盘系统

**待完成：**
- ⚠️ CLI 入口（优先级：高）
- ⚠️ 工具系统（优先级：高）
- ⚠️ 记忆系统（优先级：中）
- ⚠️ 配置系统（优先级：高）
- ⚠️ 日志系统（优先级：中）
- ⚠️ 监控系统（优先级：中）

### 建议优先级

1. **立即实现**：CLI 入口 + 配置系统
2. **本周实现**：工具系统
3. **下周实现**：记忆系统
4. **后续迭代**：日志 + 监控
