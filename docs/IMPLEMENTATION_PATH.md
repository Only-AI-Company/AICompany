# "每天10点科技日报"的架构实现路径

## 需求分析

```
用户输入：每天 10 点给我一份科技日报
```

这是一个**循环任务**需求，需要：
1. 理解用户意图
2. 创建目标（Goal）
3. 创建执行计划（ExecutionPlan）
4. 创建定时任务（Crontab）
5. 每天触发执行
6. 通知用户

---

## 架构实现路径

### 第一步：事件采集与分发

```typescript
// Telegram Bot 接收消息
src/interfaces/integrations/telegram/TelegramBot.ts
    ↓ on('message')
// 触发事件
src/interfaces/gateway/InputService.ts
    ↓ emit({ type: 'user.input', source: 'telegram', content: '...' })
// 事件总线
src/core/runtime/EventBus.ts
    ↓ emit(event)
// 订阅者接收
src/core/process/CoreProcess.ts (需要新建)
```

**关键代码**：

```typescript
// src/interfaces/integrations/telegram/TelegramBot.ts

export class TelegramBot {
  private bot: TelegramBot;
  private eventBus: EventBus;

  constructor(token: string, eventBus: EventBus) {
    this.bot = new TelegramBot(token);
    this.eventBus = eventBus;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.bot.on('message', async (msg) => {
      // 发出事件
      this.eventBus.emit({
        type: 'user.input',
        source: 'telegram',
        userId: msg.from.id.toString(),
        chatId: msg.chat.id.toString(),
        content: msg.text,
        metadata: {
          username: msg.from.username,
          firstName: msg.from.first_name,
          messageId: msg.message_id,
        },
      });
    });
  }
}
```

---

### 第二步：意图理解

```typescript
// src/core/process/CoreProcess.ts (新建)

export class CoreProcess {
  constructor(
    private eventBus: EventBus,
    private db: AIDatabase,
    private claude: ClaudeClient,
    private intentionAnalyzer: IntentionAnalyzer
  ) {
    this.setupSubscriptions();
  }

  private setupSubscriptions(): void {
    this.eventBus.on('user.input', async (event: UserInputEvent) => {
      await this.handleUserInput(event);
    });
  }

  private async handleUserInput(event: UserInputEvent): Promise<void> {
    // 1. 理解意图
    const intent = await this.intentionAnalyzer.analyze(event.content);
    // 返回: {
    //   type: 'create_recurring_task',
    //   task: '生成科技日报',
    //   schedule: { type: 'daily', time: '10:00' },
    //   requirements: ['科技新闻', 'AI动态', '产品发布']
    // }

    // 2. 根据意图分发
    switch (intent.type) {
      case 'create_recurring_task':
        await this.createRecurringTask(intent, event);
        break;
      // ... 其他情况
    }
  }
}
```

**意图分析器**（新建）：

```typescript
// src/core/intention/IntentionAnalyzer.ts (新建)

export class IntentionAnalyzer {
  async analyze(content: string): Promise<Intent> {
    const prompt = `你是意图理解专家。请分析用户的输入。

用户输入: "${content}"

请识别：
1. 意图类型（创建任务/查询状态/普通聊天/循环任务）
2. 任务描述
3. 时间要求（如有）
4. 内容要求（如有）

返回 JSON 格式。`;

    const response = await this.claude.prompt(prompt, {
      outputFormat: 'json',
    });

    return this.parseIntent(response);
  }

  private parseIntent(response: any): Intent {
    // 检测是否是循环任务
    if (response.timeRequirement?.frequency === 'daily') {
      return {
        type: 'create_recurring_task',
        task: response.task,
        schedule: response.timeRequirement,
        requirements: response.requirements,
      };
    }

    // 其他情况...
  }
}
```

---

### 第三步：创建目标

需要的数据表（已存在）：
```sql
-- goals 表（已存在）
-- goal_plans 表（已存在）
```

需要新增的字段（可能需要修改）：
```sql
ALTER TABLE goals ADD COLUMN recurring JSON;
-- recurring: { frequency: 'daily', time: '10:00', auto_renew: true }
```

**代码实现**：

```typescript
// src/core/process/CoreProcess.ts

private async createRecurringTask(intent: Intent, event: UserInputEvent): Promise<void> {
  // 1. 创建目标
  const goal = this.db.createGoal({
    id: generateId('goal'),
    type: 'recurring_content',
    title: `每日${intent.task}`,
    description: intent.requirements?.join(', '),
    status: 'active',
    owner_id: event.userId, // 关联用户

    // 新增字段
    recurring: JSON.stringify({
      frequency: intent.schedule?.type, // 'daily'
      time: intent.schedule?.time,     // '10:00'
      auto_renew: true,
    }),

    success_criteria: JSON.stringify({
      daily: true,
      time: intent.schedule?.time,
      quality: 'engagement_rate > 0.03',
    }),

    created_at: Date.now(),
  });

  // 2. 发出目标创建事件
  this.eventBus.emit({
    type: 'goal.created',
    goalId: goal.id,
    goal: goal,
    userId: event.userId,
    chatId: event.chatId,
  });
}
```

---

### 第四步：创建执行计划

```typescript
// src/application/services/GoalService.ts (需要扩展)

export class GoalService {
  /**
   * 为目标创建执行计划
   */
  async createExecutionPlan(goalId: string): Promise<ExecutionPlan> {
    const goal = this.db.getGoal(goalId);

    // 使用 AI 分解目标为步骤
    const prompt = `请将以下目标分解为具体的执行步骤。

目标: ${goal.title}
描述: ${goal.description}

请分解为：
1. 具体的行动步骤
2. 每个步骤的描述
3. 所需的技能
4. 预估时间（分钟）

返回 JSON 格式。`;

    const response = await this.claude.prompt(prompt, {
      outputFormat: 'json',
    });

    // 创建执行计划
    const plan = this.db.createExecutionPlan({
      id: generateId('plan'),
      goal_id: goalId,
      version: 1,
      content: JSON.stringify(response),
      status: 'active',
      created_at: Date.now(),
    });

    return plan;
  }
}
```

**订阅目标创建事件**：

```typescript
// src/core/planning/PlanManager.ts (新建)

export class PlanManager {
  constructor(
    private eventBus: EventBus,
    private goalService: GoalService
  ) {
    this.setupSubscriptions();
  }

  private setupSubscriptions(): void {
    // 当目标创建时，自动创建执行计划
    this.eventBus.on('goal.created', async (event: any) => {
      const plan = await this.goalService.createExecutionPlan(event.goalId);

      // 发出计划创建事件
      this.eventBus.emit({
        type: 'plan.created',
        planId: plan.id,
        goalId: event.goalId,
      });
    });
  }
}
```

---

### 第五步：创建定时任务

使用现有的 Crontab 表（已存在）：

```sql
CREATE TABLE crontab (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  goal_id TEXT,          -- 新增：关联目标
  name TEXT NOT NULL,
  description TEXT,
  command TEXT NOT NULL,
  cron_rule TEXT,
  enabled INTEGER,
  next_run INTEGER,
  ...
);
```

**代码实现**：

```typescript
// src/application/services/CronService.ts (扩展)

export class CronService {
  /**
   * 为循环目标创建定时任务
   */
  async createForGoal(goal: Goal, plan: ExecutionPlan): Promise<Crontab> {
    // 解析 recurring 配置
    const recurring = JSON.parse(goal.recurring || '{}');

    // 生成 cron 表达式
    const cronExpression = this.timeToCron(recurring.time, recurring.frequency);
    // '10:00 daily' → '0 10 * * *'

    // 创建定时任务
    const cron = this.db.createCrontab({
      id: generateId('cron'),
      goal_id: goal.id,
      name: `Cron: ${goal.title}`,
      description: `自动执行: ${goal.description}`,
      command: 'execute_goal', // 特殊命令，表示执行目标
      args_json: JSON.stringify({
        goal_id: goal.id,
        plan_id: plan.id,
      }),
      cron_rule: cronExpression,
      enabled: 1,
      next_run: this.calculateNextRun(cronExpression),
      created_at: Date.now(),
    });

    return cron;
  }
}
```

**订阅计划创建事件**：

```typescript
// src/infrastructure/cron/CronScheduler.ts (扩展)

export class CronScheduler {
  constructor(
    private eventBus: EventBus,
    private cronService: CronService
  ) {
    this.setupSubscriptions();
  }

  private setupSubscriptions(): void {
    // 当执行计划创建时，创建定时任务
    this.eventBus.on('plan.created', async (event: any) => {
      const goal = this.db.getGoal(event.goalId);
      const plan = this.db.getExecutionPlan(event.planId);

      const cron = await this.cronService.createForGoal(goal, plan);

      // 发出定时任务创建事件
      this.eventBus.emit({
        type: 'cron.created',
        cronId: cron.id,
        goalId: event.goalId,
        nextRun: cron.next_run,
      });
    });
  }
}
```

---

### 第六步：执行循环（Cron 触发）

现有的 CronService 会有定时检查：

```typescript
// src/infrastructure/cron/CronService.ts (已有，需要扩展)

export class CronService {
  /**
   * 检查到期的定时任务
   */
  async checkDueCrons(): Promise<void> {
    const now = Date.now();
    const dueCrons = this.db.prepare(`
      SELECT * FROM crontab
      WHERE enabled = 1
        AND next_run <= ?
    `).all(now);

    for (const cron of dueCrons) {
      // 发出时间触发事件
      this.eventBus.emit({
        type: 'time.triggered',
        triggerType: 'cron',
        cron: cron,
      });

      // 更新下次运行时间
      const nextRun = this.calculateNextRun(cron.cron_rule);
      this.db.updateCron(cron.id, { next_run: nextRun });
    }
  }
}

// 这个方法会被定时调用（每分钟）
// 在 src/application/Daemon.ts 中
```

---

### 第七步：处理时间触发事件

```typescript
// src/core/execution/ExecutionEngine.ts (新建)

export class ExecutionEngine {
  constructor(
    private eventBus: EventBus,
    private db: AIDatabase,
    private claude: ClaudeClient
  ) {
    this.setupSubscriptions();
  }

  private setupSubscriptions(): void {
    // 订阅时间触发事件
    this.eventBus.on('time.triggered', async (event: TimeTriggeredEvent) => {
      await this.handleTimeTriggered(event);
    });
  }

  private async handleTimeTriggered(event: TimeTriggeredEvent): Promise<void> {
    const { cron } = event;

    // 检查命令类型
    if (cron.command === 'execute_goal') {
      await this.executeGoal(cron);
    }
    // 其他命令类型...
  }

  private async executeGoal(cron: Crontab): Promise<void> {
    const args = JSON.parse(cron.args_json || '{}');
    const goalId = args.goal_id;
    const planId = args.plan_id;

    // 1. 创建任务实例
    const task = this.db.createTask({
      id: generateId('task'),
      type: 'goal_execution',
      description: `执行目标: ${cron.name}`,
      goal_id: goalId,
      plan_id: planId,
      status: 'executing',
      work_dir: this.getWorkDir(),
      created_at: Date.now(),
    });

    // 2. 发出任务开始事件
    this.eventBus.emit({
      type: 'task.started',
      taskId: task.id,
      goalId: goalId,
      cronId: cron.id,
    });

    // 3. 执行目标
    await this.runGoal(goalId, planId, task);

    // 4. 发出任务完成事件
    this.eventBus.emit({
      type: 'task.completed',
      taskId: task.id,
      result: { /* ... */ },
    });
  }

  private async runGoal(goalId: string, planId: string, task: Task): Promise<void> {
    const plan = this.db.getExecutionPlan(planId);
    const steps = JSON.parse(plan.content);

    // 逐步执行
    for (const step of steps) {
      await this.executeStep(step, task);
    }
  }

  private async executeStep(step: Step, task: Task): Promise<void> {
    // 调用现有的 AgentSwarmManager 或直接调用 Claude
    const swarmManager = new AgentSwarmManager(this.db, this.claude);

    // 根据步骤类型选择执行方式
    if (step.requiresCollaboration) {
      await swarmManager.executeSwarm(task, {
        // ...
      });
    } else {
      const workDir = task.work_dir;
      const output = await this.claude.prompt(step.description, {
        cwd: workDir,
      });

      // 保存输出
      this.saveStepOutput(task.id, step, output);
    }
  }
}
```

---

### 第八步：通知用户

```typescript
// src/infrastructure/notifications/NotificationRouter.ts (新建)

export class NotificationRouter {
  constructor(
    private eventBus: EventBus,
    private notificationService: NotificationService,
    private telegramBot: TelegramBot
  ) {
    this.setupSubscriptions();
  }

  private setupSubscriptions(): void {
    // 订阅所有需要通知的事件
    this.eventBus.on('goal.created', async (event) => {
      await this.notifyGoalCreated(event);
    });

    this.eventBus.on('task.started', async (event) => {
      await this.notifyTaskStarted(event);
    });

    this.eventBus.on('task.completed', async (event) => {
      await this.notifyTaskCompleted(event);
    });
  }

  private async notifyGoalCreated(event: any): Promise<void> {
    const goal = event.goal;
    const userId = event.userId;
    const chatId = event.chatId;

    const message = `🎯 已创建目标：${goal.title}\n\n${goal.description}`;

    // 发送到 Telegram
    await this.telegramBot.sendMessage(chatId, message);
  }

  private async notifyTaskCompleted(event: any): Promise<void> {
    const task = this.db.getTask(event.taskId);
    const goal = this.db.getGoal(task.goal_id);

    // 获取关联的 chatId
    const chatId = this.getChatIdForGoal(goal.id);

    const message = `✅ 任务完成：${task.description}`;

    await this.telegramBot.sendMessage(chatId, message);
  }
}
```

---

## 完整的事件流

```
用户输入 "每天10点科技日报"
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  TelegramBot.emit({ type: 'user.input', ... })            │
└─────────────────────────────────────────────────────────────┘
    │
    ▼ EventBus
    │
    ├──► CoreProcess.handleUserInput()
    │       │
    │       ├──► IntentionAnalyzer.analyze() → Intent
    │       │
    │       └──► CoreProcess.createRecurringTask()
    │               │
    │               └──► db.createGoal() → goal
    │
    ├──► EventBus.emit({ type: 'goal.created', goalId, ... })
    │
    ├──► PlanManager (订阅 goal.created)
    │       │
    │       └──► GoalService.createExecutionPlan() → plan
    │
    ├──► EventBus.emit({ type: 'plan.created', planId, ... })
    │
    ├──► CronScheduler (订阅 plan.created)
    │       │
    │       └──► CronService.createForGoal() → cron
    │
    └──► EventBus.emit({ type: 'cron.created', cronId, ... })
            │
            └──► NotificationRouter (订阅 cron.created)
                    │
                    └──► TelegramBot.sendMessage("⏰ 已设置定时任务")
```

---

## 执行时的事件流（每天10点）

```
每天 10:00
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  CronService.checkDueCrons() (每分钟调用)                   │
│       │                                                      │
│       └──► EventBus.emit({ type: 'time.triggered', cron })  │
└─────────────────────────────────────────────────────────────┘
    │
    ▼ EventBus
    │
    ├──► ExecutionEngine.handleTimeTriggered()
    │       │
    │       ├──► db.createTask() → task
    │       │
    │       ├──► EventBus.emit({ type: 'task.started', ... })
    │       │       │
    │       │       └──► NotificationRouter → Telegram
    │       │
    │       └──► ExecutionEngine.runGoal()
    │               │
    │               ├──► 执行步骤 1...
    │               ├──► 执行步骤 2...
    │               └──► 执行步骤 3...
    │
    └──► EventBus.emit({ type: 'task.completed', ... })
            │
            └──► NotificationRouter → Telegram
                    │
                    └──► 发送日报
```

---

## 需要新增/修改的组件

### 新增组件

| 组件 | 路径 | 作用 |
|------|------|------|
| **IntentionAnalyzer** | `src/core/intention/` | 理解用户意图 |
| **CoreProcess** | `src/core/process/` | 处理用户输入 |
| **PlanManager** | `src/core/planning/` | 管理执行计划 |
| **ExecutionEngine** | `src/core/execution/` | 执行目标和任务 |
| **NotificationRouter** | `src/infrastructure/notifications/` | 路由通知 |

### 修改组件

| 组件 | 修改内容 |
|------|----------|
| **TelegramBot** | 添加 EventBus 依赖，发出事件 |
| **EventBus** | 确保支持所有事件类型 |
| **GoalService** | 添加 createExecutionPlan 方法 |
| **CronService** | 添加 createForGoal 方法，支持 goal_id |
| **goals 表** | 添加 recurring 字段 |

---

## 数据流图

```
┌──────────────┐
│  Telegram    │
│  用户输入    │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                      EventBus                               │
│  user.input → goal.created → plan.created → cron.created   │
└─────────────────────────────────────────────────────────────┘
       │
       ├─────────────────────────────────────────────────┐
       │                                                 │
       ▼                                                 ▼
┌──────────────────┐                          ┌──────────────────┐
│   处理链          │                          │   通知链         │
│                  │                          │                  │
│ CoreProcess      │                          │ NotificationRouter│
│   │              │                          │   │              │
│   ├→IntentionAnalyzer                      │   └→Telegram      │
│   │              │                          │   └→CLI          │
│   └→createGoal   │                          │                  │
│       │          │                          │                  │
│       ▼          │                          │                  │
│   PlanManager    │                          │                  │
│       │          │                          │                  │
│       └→createPlan│                          │                  │
│       │          │                          │                  │
│       ▼          │                          │                  │
│   CronScheduler  │                          │                  │
│       │          │                          │                  │
│       └→createCron│                          │                  │
│                  │                          │                  │
└──────────────────┘                          └──────────────────┘
       │
       │ 每天触发
       ▼
┌─────────────────────────────────────────────────────────────┐
│                      EventBus                               │
│  time.triggered → task.started → task.completed             │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────┐
│  ExecutionEngine │
│                  │
│  →createTask     │
│  →runGoal        │
│  →executeSteps   │
│                  │
└──────────────────┘
```

---

这才是具体的架构实现路径！不是概念，是**代码调用链**。
