# AI Company - 事件驱动核心流程设计

## 核心流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        外部世界                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │  用户输入  │  │  时间触发  │  │  外部事件  │                │
│  │  Telegram  │  │  Cron定时  │  │  Webhook   │                │
│  │  CLI命令   │  │  间隔检查  │  │  API调用   │                │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘                │
└────────┼───────────────┼───────────────┼───────────────────────┘
         │               │               │
         └───────────────┼───────────────┘
                         ▼
         ┌───────────────────────────────────────┐
         │         事件采集器 (EventCollector)    │
         │  统一收集所有外部事件                   │
         └───────────────┬───────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────────────┐
         │         事件总线 (EventBus)           │
         │  所有事件流经这里                       │
         └───────┬───────────────────────┬───────┘
                 │                       │
    ┌────────────┴────────────┐         │
    │                         │         │
    ▼                         ▼         │
┌─────────┐           ┌─────────────┐    │
│订阅者   │           │  处理器     │    │
│日志     │           │  核心流程   │    │
│监控     │           │             │    │
└─────────┘           └──────┬──────┘    │
                              │           │
                              ▼           │
         ┌─────────────────────────────────┤
         │      核心处理流程 (CoreProcess)   │
         │                                  │
         │  1. 理解事件                      │
         │  2. 分析上下文                    │
         │  3. 决定行动                      │
         │  4. 执行任务                      │
         │  5. 产出结果                      │
         └──────────────┬───────────────────┘
                        │
                        ▼
         ┌───────────────────────────────────────┐
         │         结果分发器 (ResultRouter)     │
         │  根据结果类型，分发到不同的地方       │
         └───────┬───────────────────────┬───────┘
                │                       │
    ┌───────────┴───────────┐   ┌───────┴────────┐
    ▼                       ▼   ▼                ▼
┌─────────┐         ┌─────────────┐    ┌─────────────┐
│用户通知  │         │  保存产出   │    │  记录经验   │
│Telegram  │         │  outputs/   │    │  经验库     │
│CLI      │         │  数据库     │    │  知识图谱   │
└─────────┘         └─────────────┘    └─────────────┘
```

---

## 核心组件

### 1. 事件采集器（EventCollector）

```typescript
// src/core/events/EventCollector.ts

export class EventCollector {
  private eventBus: EventBus;

  /**
   * 启动所有采集器
   */
  async start(): Promise<void> {
    // 1. 用户输入采集器
    await this.startUserInputCollector();

    // 2. 时间触发采集器
    await this.startTimeTriggerCollector();

    // 3. 外部事件采集器
    await this.startExternalEventCollector();
  }

  /**
   * 用户输入采集器
   */
  private async startUserInputCollector(): Promise<void> {
    // Telegram 消息
    this.telegramBot.on('message', async (msg) => {
      this.emitEvent({
        type: 'user.input',
        source: 'telegram',
        userId: msg.from.id,
        content: msg.text,
        chatId: msg.chat.id,
        metadata: msg,
      });
    });

    // CLI 命令
    this.cli.on('command', async (cmd) => {
      this.emitEvent({
        type: 'user.input',
        source: 'cli',
        command: cmd.name,
        args: cmd.args,
      });
    });
  }

  /**
   * 时间触发采集器
   */
  private async startTimeTriggerCollector(): Promise<void> {
    // 定时检查
    setInterval(async () => {
      // 检查是否有到期的任务
      const overdueTasks = await this.checkOverdueTasks();
      for (const task of overdueTasks) {
        this.emitEvent({
          type: 'time.triggered',
          triggerType: 'task_overdue',
          data: task,
        });
      }

      // 检查 Cron 表
      const dueCrons = await this.checkCronJobs();
      for (const cron of dueCrons) {
        this.emitEvent({
          type: 'time.triggered',
          triggerType: 'cron',
          data: cron,
        });
      }
    }, 60000); // 每分钟检查
  }

  /**
   * 外部事件采集器（Webhook, API）
   */
  private async startExternalEventCollector(): Promise<void> {
    // Webhook 服务器
    this.webhookServer.post('/webhook/:source', async (req, res) => {
      this.emitEvent({
        type: 'external.event',
        source: req.params.source,
        data: req.body,
      });
      res.json({ received: true });
    });
  }
}
```

### 2. 事件总线（EventBus）

```typescript
// src/core/events/EventBus.ts

export type SystemEvent =
  // 用户输入
  | { type: 'user.input'; source: 'telegram' | 'cli' | 'api'; content: string; userId?: string; metadata?: any }
  | { type: 'user.command'; command: string; args: string[] }

  // 时间触发
  | { type: 'time.triggered'; triggerType: 'cron' | 'overdue' | 'scheduled'; data: any }

  // 外部事件
  | { type: 'external.event'; source: string; data: any }

  // 任务事件
  | { type: 'task.created'; taskId: string }
  | { type: 'task.started'; taskId: string }
  | { type: 'task.completed'; taskId: string; result: any }
  | { type: 'task.failed'; taskId: string; error: string }

  // 产出事件
  | { type: 'output.created'; outputId: string; taskId: string; type: string }
  | { type: 'output.published'; outputId: string; platform: string }

  // 通知事件
  | { type: 'notification.needed'; userId: string; message: string };

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  /**
   * 发布事件
   */
  emit<T extends SystemEvent>(event: T): void {
    console.log(`[EventBus] ${event.type}`, event);

    // 通知所有订阅者
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        listener(event);
      }
    }

    // 通配符订阅者
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        listener(event);
      }
    }
  }

  /**
   * 订阅事件
   */
  on<T extends SystemEvent>(
    eventType: string,
    handler: (event: T) => void | Promise<void>
  ): UnsubscribeFunction {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);

    return () => {
      this.listeners.get(eventType)?.delete(handler);
    };
  }
}
```

### 3. 核心处理流程（CoreProcess）

```typescript
// src/core/process/CoreProcess.ts

export class CoreProcess {
  constructor(
    private eventBus: EventBus,
    private db: AIDatabase,
    private claude: ClaudeClient
  ) {
    // 订阅所有需要处理的事件
    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    // 用户输入 → 处理
    this.eventBus.on('user.input', async (event) => {
      await this.handleUserInput(event);
    });

    // 时间触发 → 执行
    this.eventBus.on('time.triggered', async (event) => {
      await this.handleTimeTrigger(event);
    });

    // 任务完成 → 通知
    this.eventBus.on('task.completed', async (event) => {
      await this.handleTaskCompleted(event);
    });

    // 产出创建 → 发布/通知
    this.eventBus.on('output.created', async (event) => {
      await this.handleOutputCreated(event);
    });
  }

  /**
   * 处理用户输入
   */
  private async handleUserInput(event: any): Promise<void> {
    console.log(`\n[CoreProcess] 处理用户输入: ${event.content}`);

    // 1. 理解意图
    const intent = await this.understandIntent(event.content);

    // 2. 根据意图分发
    switch (intent.type) {
      case 'create_task':
        await this.createTask(intent, event);
        break;

      case 'query_status':
        await this.queryStatus(intent, event);
        break;

      case 'manage_employee':
        await this.manageEmployee(intent, event);
        break;

      case 'chat':
        await this.chat(intent, event);
        break;

      default:
        await this.fallback(intent, event);
    }
  }

  /**
   * 理解意图
   */
  private async understandIntent(content: string): Promise<Intent> {
    // 使用 Claude LLM 理解用户意图
    const prompt = `你是意图理解专家。请分析用户的输入，判断意图。

用户输入: ${content}

可能的意图类型:
1. create_task - 创建新任务
2. query_status - 查询状态
3. manage_employee - 管理员工
4. chat - 普通聊天

返回 JSON 格式。`;

    const response = await this.claude.prompt(prompt, {
      outputFormat: 'json',
    });

    return response;
  }

  /**
   * 创建任务
   */
  private async createTask(intent: Intent, event: any): Promise<void> {
    // 1. 创建任务记录
    const task = this.db.createTask({
      description: intent.description,
      type: intent.taskType,
      status: 'pending',
      priority: intent.priority || 'medium',
      requested_by: 'user',
      context_json: JSON.stringify({
        source: event.source,
        userId: event.userId,
        chatId: event.chatId,
      }),
    });

    // 2. 发布任务创建事件
    this.eventBus.emit({
      type: 'task.created',
      taskId: task.id,
    });

    // 3. 立即开始处理任务
    await this.processTask(task);
  }

  /**
   * 处理任务
   */
  private async processTask(task: Task): Promise<void> {
    console.log(`[CoreProcess] 开始处理任务: ${task.id}`);

    // 1. 分析任务
    const analysis = await this.analyzeTask(task);

    // 2. 决定执行方式
    const executionPlan = await this.planExecution(task, analysis);

    // 3. 执行
    const result = await this.executeTask(task, executionPlan);

    // 4. 发布完成事件
    this.eventBus.emit({
      type: 'task.completed',
      taskId: task.id,
      result,
    });
  }

  /**
   * 分析任务
   */
  private async analyzeTask(task: Task): Promise<TaskAnalysis> {
    // 使用 TaskManagerAgent
    const taskManager = new TaskManagerAgent(this.db, this.claude);
    return await taskManager.analyzeTask(task.description);
  }

  /**
   * 计划执行
   */
  private async planExecution(task: Task, analysis: TaskAnalysis): Promise<ExecutionPlan> {
    // 决定：单 Agent 还是 Swarm
    if (analysis.requiresCollaboration) {
      // 多 Agent 协作
      const swarmManager = new AgentSwarmManager(this.db, this.claude);
      return {
        mode: 'swarm',
        agents: await this.buildAgentList(analysis),
        collaborationMode: analysis.collaborationMode,
      };
    } else {
      // 单 Agent
      return {
        mode: 'single',
        agent: await this.selectBestAgent(analysis),
      };
    }
  }

  /**
   * 执行任务
   */
  private async executeTask(task: Task, plan: ExecutionPlan): Promise<ExecutionResult> {
    if (plan.mode === 'swarm') {
      const swarmManager = new AgentSwarmManager(this.db, this.claude);
      return await swarmManager.executeSwarm(task, plan);
    } else {
      // 单 Agent 执行
      const workDir = this.getWorkDir(task.id);
      const output = await this.claude.prompt(task.description, {
        agent: plan.agent,
        cwd: workDir,
      });

      return { output, success: true };
    }
  }

  /**
   * 处理时间触发
   */
  private async handleTimeTrigger(event: any): Promise<void> {
    if (event.triggerType === 'cron') {
      // 执行 Cron 任务
      const cron = event.data;
      await this.executeCronJob(cron);
    } else if (event.triggerType === 'overdue') {
      // 处理超期任务
      await this.handleOverdueTask(event.data);
    }
  }

  /**
   * 处理任务完成
   */
  private async handleTaskCompleted(event: any): Promise<void> {
    const { taskId, result } = event;
    const task = this.db.getTask(taskId);

    // 1. 更新任务状态
    this.db.updateTaskStatus(taskId, 'completed');

    // 2. 验收
    const review = await this.reviewOutput(task, result);

    // 3. 保存产出
    if (result.output) {
      const output = this.outputManager.save({
        taskId,
        type: this.inferOutputType(task),
        content: result.output,
      });

      // 发布产出事件
      this.eventBus.emit({
        type: 'output.created',
        outputId: output.id,
        taskId,
        type: output.type,
      });
    }

    // 4. 通知用户
    await this.notifyUser({
      type: 'task_completed',
      taskId,
      result,
      review,
    });
  }

  /**
   * 处理产出创建
   */
  private async handleOutputCreated(event: any): Promise<void> {
    const { outputId, taskId, type } = event;

    // 根据产出类型决定是否发布
    if (type === 'post') {
      // 社媒内容，自动发布
      await this.publishOutput(outputId);
    } else {
      // 其他类型，等待用户决定
      await this.notifyUser({
        type: 'output_created',
        outputId,
        taskId,
      });
    }
  }

  /**
   * 通知用户
   */
  private async notifyUser(notification: Notification): Promise<void> {
    // 发布通知事件
    this.eventBus.emit({
      type: 'notification.needed',
      userId: notification.userId,
      message: notification.message,
    });
  }
}
```

### 4. 结果分发器（ResultRouter）

```typescript
// src/core/results/ResultRouter.ts

export class ResultRouter {
  constructor(
    private eventBus: EventBus,
    private notificationService: NotificationService
  ) {
    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    // 订阅通知事件
    this.eventBus.on('notification.needed', async (event) => {
      await this.sendNotification(event);
    });
  }

  /**
   * 发送通知
   */
  private async sendNotification(event: any): Promise<void> {
    // 确定通知渠道
    const channel = this.determineChannel(event.userId);

    // 发送
    await this.notificationService.send({
      to: { channel, userId: event.userId },
      content: { text: event.message },
    });
  }

  /**
   * 确定通知渠道
   */
  private determineChannel(userId: string): 'telegram' | 'cli' {
    // 查询用户偏好
    const user = this.db.getUser(userId);
    return user.preferredChannel || 'telegram';
  }
}
```

---

## 完整流程示例

### 示例1：用户通过 Telegram 发送任务

```
1. 用户在 Telegram 发送: "帮我写一篇关于AI的文章"

2. EventCollector 捕获消息
   → emit({ type: 'user.input', source: 'telegram', content: '...', userId: '123', chatId: 456 })

3. EventBus 分发事件
   → CoreProcess.handleUserInput() 接收

4. 理解意图
   → Claude LLM 分析: { type: 'create_task', description: '写一篇关于AI的文章' }

5. 创建任务
   → db.createTask({ description: '...', status: 'pending' })
   → emit({ type: 'task.created', taskId: 'task-001' })

6. 分析任务
   → TaskManagerAgent.analyzeTask()
   → 返回: { type: 'content_creation', complexity: 'medium', skills: ['writing'] }

7. 计划执行
   → 选择最佳员工: 招募或匹配 "content_writer"
   → mode: 'single', agent: 'content_writer'

8. 执行任务
   → claude.prompt() 调用 Claude CLI
   → Agent 产出文章内容

9. 任务完成
   → emit({ type: 'task.completed', taskId: 'task-001', result: { output: '...' } })

10. 验收
    → ReviewerAgent.reviewStep()
    → 返回: { overall: 'approved', score: 85 }

11. 保存产出
    → outputManager.save({ taskId: 'task-001', type: 'article', content: '...' })
    → emit({ type: 'output.created', outputId: 'out-001' })

12. 通知用户
    → emit({ type: 'notification.needed', userId: '123', message: '文章已完成' })
    → ResultRouter 发送 Telegram 消息
```

### 示例2：Cron 定时任务触发

```
1. EventCollector 每分钟检查 Cron 表
   → 发现 "morning_post" Cron 到期

2. emit({ type: 'time.triggered', triggerType: 'cron', data: { name: 'morning_post' } })

3. CoreProcess.handleTimeTrigger()
   → 执行 Cron 命令: 发送早安推文

4. 创建任务并执行
   → 同示例1的步骤 6-12
```

---

## 启动流程

```typescript
// src/main.ts

async function main() {
  console.log('🏢 AI Company 正在启动...\n');

  // 1. 初始化基础设施
  const db = getDatabase();
  const eventBus = new EventBus();
  const claude = getClaudeClient();

  // 2. 启动事件采集器
  const eventCollector = new EventCollector(eventBus);
  await eventCollector.start();
  console.log('✅ 事件采集器已启动');

  // 3. 启动核心处理流程
  const coreProcess = new CoreProcess(eventBus, db, claude);
  console.log('✅ 核心处理流程已启动');

  // 4. 启动结果分发器
  const resultRouter = new ResultRouter(eventBus, notificationService);
  console.log('✅ 结果分发器已启动');

  // 5. 启动 Telegram Bot
  const telegramBot = await startTelegramBot(token, db);
  eventCollector.setTelegramBot(telegramBot);
  console.log('✅ Telegram Bot 已启动');

  console.log('\n🏢 AI Company 已就绪，等待事件...\n');

  // 保持运行
  await new Promise(() => {});
}
```

---

## 总结

### 核心流程

```
外部输入 → EventCollector → EventBus → CoreProcess → 执行 → ResultRouter → 通知用户
    ↑                                                               │
    └───────────────────────────────────────────────────────────────┘
```

### 关键点

1. **事件驱动** - 一切都是事件，事件触发处理
2. **解耦** - EventBus 连接所有组件，组件间不直接依赖
3. **可扩展** - 新增事件类型、处理器都很容易
4. **完整闭环** - 从输入到通知，形成完整流程

这才是"公司"该有的样子——**接收输入，处理输出，持续运行**。
