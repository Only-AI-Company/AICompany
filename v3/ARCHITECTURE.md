# AI Company v3 - Architecture

## 核心理念

**自主运行、自主决策、自动调度**

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        Engine                                │
│                   (自主运行引擎)                              │
│                                                             │
│  while (running) {                                          │
│    1. 检查目标 → 拆解新目标                                   │
│    2. 检查计划 → 执行待办任务                                 │
│    3. 检查进度 → 更新状态                                     │
│    4. 检查复盘 → 定期复盘                                     │
│    5. 等待（或处理用户输入）                                  │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ GoalManager  │  │ PlanExecutor │  │ Scheduler    │
│ (目标管理)    │  │ (计划执行)    │  │ (调度器)      │
└──────────────┘  └──────────────┘  └──────────────┘
         │                │                │
         └────────────────┼────────────────┘
                          ▼
                   ┌──────────────┐
                   │     CEO      │
                   │  (决策中枢)   │
                   └──────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Employees   │  │   Memory     │  │    Tools     │
│  (员工池)      │  │  (记忆系统)    │  │  (工具系统)    │
└──────────────┘  └──────────────┘  └──────────────┘
```

## 核心组件

### 1. Engine - 自主运行引擎

```typescript
class Engine {
  private running = false;
  private goalManager: GoalManager;
  private planExecutor: PlanExecutor;
  private scheduler: Scheduler;
  private monitor: ProgressMonitor;
  private reviewer: Reviewer;

  async start(): Promise<void> {
    this.running = true;

    while (this.running) {
      // 1. 检查目标
      await this.goalManager.checkAndDecompose();

      // 2. 执行计划
      await this.planExecutor.executeNext();

      // 3. 更新进度
      await this.monitor.update();

      // 4. 检查复盘
      await this.reviewer.checkAndReview();

      // 5. 等待或处理用户输入
      await this.waitOrProcess();
    }
  }
}
```

### 2. GoalManager - 目标管理

```typescript
class GoalManager {
  // 目标存储
  private goals: Map<string, Goal> = new Map();

  // 设置目标
  setGoal(description: string, timeframe: string): Goal;

  // 拆解目标：长期 → 短期 → 计划
  decompose(goal: Goal): Plan;

  // 检查并拆解新目标
  async checkAndDecompose(): Promise<void>;

  // 获取目标进度
  getProgress(goalId: string): Progress;
}
```

### 3. PlanExecutor - 计划执行

```typescript
class PlanExecutor {
  // 执行下一个任务
  async executeNext(): Promise<void>;

  // 执行任务（调用员工）
  async executeTask(task: Task): Promise<Result>;

  // 更新任务状态
  updateTaskStatus(taskId: string, status: TaskStatus): void;
}
```

### 4. Scheduler - 调度器

```typescript
class Scheduler {
  // 任务队列（优先级）
  private queue: PriorityQueue<Task>;

  // 调度任务
  schedule(task: Task): void;

  // 获取下一个任务
  getNext(): Task | null;

  // 分配给员工
  assignToEmployee(task: Task): Employee;
}
```

### 5. CEO - 决策中枢

```typescript
class CEO {
  // 理解用户输入
  async understand(input: string): Understanding;

  // 拆解目标
  async decomposeGoal(goal: Goal): Plan;

  // 分配任务给员工
  async assignTask(task: Task): Employee;

  // 复盘
  async review(task: Task, result: Result): Review;
}
```

### 6. Employee - 员工

```typescript
class Employee {
  id: string;
  name: string;
  role: string;
  skills: string[];

  // 执行任务
  async execute(task: Task): Promise<Result>;

  // 进化（学习新技能）
  evolve(newSkills: string[]): void;
}
```

## 数据流

```
用户输入
    │
    ▼
CEO.understand()
    │
    ├── 是目标？ → GoalManager.setGoal()
    │                  │
    │                  └── 拆解为计划 → Scheduler
    │
    ├── 是任务？ → Scheduler.schedule()
    │                  │
    │                  └── 分配员工 → Employee.execute()
    │
    └── 是对话？ → CEO.chat()
                        │
                        └── 返回状态/聊天

---

Engine 后台循环
    │
    ├── GoalManager.checkAndDecompose()
    ├── PlanExecutor.executeNext()
    ├── ProgressMonitor.update()
    └── Reviewer.checkAndReview()
```

## 数据库 Schema

```sql
-- 目标表
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  timeframe TEXT NOT NULL,  -- 30天、1个月等
  status TEXT NOT NULL,     -- active, completed, failed
  parent_goal_id TEXT,      -- 父目标ID（用于拆解）
  created_at INTEGER,
  completed_at INTEGER
);

-- 计划表
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  description TEXT NOT NULL,
  steps TEXT NOT NULL,      -- JSON: 计划步骤
  status TEXT NOT NULL,
  created_at INTEGER,
  FOREIGN KEY (goal_id) REFERENCES goals(id)
);

-- 任务表
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT,
  description TEXT NOT NULL,
  employee_id TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,   -- critical, high, medium, low
  created_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (plan_id) REFERENCES plans(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

-- 员工表
CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  skills TEXT NOT NULL,     -- JSON: 技能列表
  level INTEGER DEFAULT 1,
  performance INTEGER DEFAULT 0,
  created_at INTEGER
);

-- 复盘表
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  score INTEGER NOT NULL,    -- 1-10
  strengths TEXT,           -- JSON: 优点列表
  improvements TEXT,        -- JSON: 改进列表
  learnings TEXT,           -- JSON: 经验教训
  created_at INTEGER,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- 系统状态表
CREATE TABLE system_status (
  id TEXT PRIMARY KEY,
  current_goal_id TEXT,
  active_tasks INTEGER DEFAULT 0,
  last_review_at INTEGER,
  updated_at INTEGER
);
```

## 与 v2 的差异

| v2 | v3 |
|----|----|
| 事件驱动（用户输入触发） | 主动运行（后台循环） |
| CXO 层（6 个 CXO） | CEO 单层决策 |
| 意图分类（query/goal/task） | 理解后直接处理 |
| 任务完成后复盘 | 定期复盘 + 任务复盘 |
| 无目标管理 | 完整目标管理系统 |
| 无进度追踪 | 实时进度监控 |
| CoreProcess 协调 | Engine 统一管理 |

## 实现优先级

1. **Phase 1: 核心引擎**
   - [ ] Engine 基础框架
   - [ ] CEO 决策中枢
   - [ ] Employee 员工系统
   - [ ] 基础工具系统

2. **Phase 2: 目标管理**
   - [ ] GoalManager
   - [ ] PlanExecutor
   - [ ] 目标拆解逻辑

3. **Phase 3: 调度与监控**
   - [ ] Scheduler（改造 v2）
   - [ ] ProgressMonitor
   - [ ] 状态报告系统

4. **Phase 4: 复盘与进化**
   - [ ] Reviewer（改造 v2）
   - [ ] 记忆系统（复用 v2）
   - [ ] 员工进化机制

5. **Phase 5: 用户交互**
   - [ ] CLI 命令
   - [ ] 对话系统
   - [ ] Telegram 集成
