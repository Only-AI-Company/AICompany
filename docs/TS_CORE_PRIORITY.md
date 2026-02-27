# TS 后端核心优先级计划

## 当前状态分析

### ✅ 已实现的核心组件

| 组件 | 状态 | 说明 |
|------|------|------|
| **Orchestrator** | ✅ | 主流程编排，资源查询 |
| **TaskManagerAgent** | ✅ | 任务分析，员工匹配 |
| **AgentSwarmManager** | ✅ | 多 Agent 协作执行 |
| **AutonomousLoopExecutor** | ✅ | 自主循环执行 |
| **RecruitmentService** | ✅ | 动态招募（AI 生成 Human → Employee）|
| **ReviewerAgent** | ✅ | 自动验收 |
| **EmployeeManagerAgent** | ✅ | 团队优化分析 |
| **数据库层** | ✅ | Drizzle ORM + SQLite |
| **CLI 接口** | ✅ | Commander.js |
| **Telegram Bot** | ✅ | 基础集成 |

### ❌ 缺失的核心能力

| 模块 | 优先级 | 说明 |
|------|--------|------|
| **产出管理** | P0 | outputs/ 目录结构化管理 |
| **事件驱动调度** | P0 | 当前仍是固定流程 |
| **复盘进化** | P1 | Review → 改进的闭环 |
| **业务集成** | P1 | 小红书、Twitter、Git API |
| **REST API** | P2 | 暂无 API 接口 |

---

## 第一优先级：产出管理系统 (P0)

### 问题
- outputs/ 目录结构存在，但无代码管理
- 产出无分类、无索引、无版本记录
- 无法追踪每个任务的产出

### 解决方案

```typescript
// src/infrastructure/output/OutputManager.ts

export class OutputManager {
  /**
   * 保存任务产出
   */
  async saveOutput(data: {
    taskId: string;
    type: 'code' | 'article' | 'novel' | 'post' | 'design' | 'other';
    content: string;
    title?: string;
    metadata?: Record<string, any>;
  }): Promise<OutputFile> {
    // 1. 确定保存路径
    const dir = this.getOutputDir(data.type);
    const filename = this.generateFilename(data.taskId, data.type);
    const filePath = join(dir, filename);

    // 2. 保存文件
    await writeFile(filePath, data.content, 'utf-8');

    // 3. 记录到数据库
    const output = this.db.createOutput({
      task_id: data.taskId,
      type: data.type,
      title: data.title,
      file_path: filePath,
      content_preview: data.content.slice(0, 500),
      metadata: data.metadata,
    });

    return output;
  }

  /**
   * 获取任务所有产出
   */
  async getTaskOutputs(taskId: string): Promise<OutputFile[]> {
    return this.db.getOutputsByTask(taskId);
  }

  /**
   * 按类型浏览产出
   */
  async browseOutputs(type: string, options: {
    limit?: number;
    offset?: number;
    orderBy?: 'created_at' | 'title';
  }): Promise<OutputFile[]> {
    return this.db.getOutputsByType(type, options);
  }
}
```

### 目录结构

```
~/.ai-company/outputs/
├── code/          # 代码产出
│   └── {task_id}/
│       └── {files}
├── articles/      # 文章产出
│   └── {YYYY-MM}/
│       └── {slug}.md
├── novels/        # 小说产出
│   └── {title}/
│       ├── chapter-01.md
│       └── ...
├── posts/         # 社媒内容
│   ├── xiaohongshu/
│   └── twitter/
├── designs/       # 设计方案
└── archive/       # 归档
```

### 数据库表

```sql
CREATE TABLE outputs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  type TEXT NOT NULL,
  title TEXT,
  file_path TEXT NOT NULL,
  content_preview TEXT,
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_outputs_task_id ON outputs(task_id);
CREATE INDEX idx_outputs_type ON outputs(type);
CREATE INDEX idx_outputs_created_at ON outputs(created_at DESC);
```

---

## 第二优先级：事件驱动调度器 (P0)

### 问题
- 当前 Orchestrator 是固定流程
- 无法实现"动态流动、持续调度"的需求
- 调度器应该是常驻的、事件驱动的

### 解决方案

```typescript
// src/core/scheduler/DynamicScheduler.ts

export class DynamicScheduler {
  private eventBus: EventBus;
  private strategyEngine: StrategyEngine;
  private running = false;

  /**
   * 启动调度器（常驻运行）
   */
  async start(): Promise<void> {
    this.running = true;

    while (this.running) {
      // 1. 获取待执行步骤
      const executableSteps = await this.getExecutableSteps();

      // 2. 并行执行
      await Promise.all(
        executableSteps.map(step => this.executeStep(step))
      );

      // 3. 等待事件或超时
      await this.waitForNextTrigger();
    }
  }

  /**
   * 获取可执行步骤（来自策略引擎）
   */
  private async getExecutableSteps(): Promise<ExecutableStep[]> {
    // 从策略引擎获取当前可执行的步骤
    // 这些步骤可能是：
    // - 新创建的任务
    // - 等待中的后续步骤
    // - 定时触发的任务
    // - 事件触发的任务
    return this.strategyEngine.getExecutableSteps();
  }

  /**
   * 等待下一个触发信号
   */
  private async waitForNextTrigger(): Promise<void> {
    // 1. 检查是否有即将到期的定时任务
    const nextCron = await this.getNextCronTime();
    const timeout = nextCron ? Math.min(5000, nextCron - Date.now()) : 5000;

    // 2. 等待事件或超时
    await Promise.race([
      this.waitForEvent(),
      sleep(timeout),
    ]);
  }
}

// src/core/strategy/StrategyEngine.ts

export class StrategyEngine {
  /**
   * 事件处理：将事件转换为行动
   */
  async onEvent(event: SystemEvent): Promise<Action[]> {
    switch (event.type) {
      case 'task.created':
        return [
          { action: 'analyze_task', data: event },
          { action: 'assign_employee', data: event },
        ];

      case 'task.completed':
        return [
          { action: 'review_output', data: event },
          { action: 'save_output', data: event },
          { action: 'conduct_retrospective', data: event },
        ];

      case 'output.created':
        return [
          { action: 'archive_to_database', data: event },
          { action: 'update_knowledge_base', data: event },
        ];

      case 'review.failed':
        return [
          { action: 'revise_task', data: event },
        ];

      default:
        return [];
    }
  }

  /**
   * 获取当前可执行步骤
   */
  async getExecutableSteps(): Promise<ExecutableStep[]> {
    return this.db.getExecutableSteps();
  }
}
```

### 事件定义

```typescript
// src/core/runtime/EventBus.ts

export type SystemEvent =
  // 任务事件
  | { type: 'task.created'; taskId: string; requirement: string }
  | { type: 'task.assigned'; taskId: string; employeeId: string }
  | { type: 'task.started'; taskId: string }
  | { type: 'task.completed'; taskId: string; output: any }
  | { type: 'task.failed'; taskId: string; error: string }

  // 产出事件
  | { type: 'output.created'; outputId: string; taskId: string }
  | { type: 'output.published'; outputId: string; platform: string }

  // 验收事件
  | { type: 'review.completed'; taskId: string; result: ReviewResult }
  | { type: 'review.failed'; taskId: string; issues: string[] }

  // 员工事件
  | { type: 'employee.recruited'; employeeId: string }
  | { type: 'employee.busy'; employeeId: string }
  | { type: 'employee.idle'; employeeId: string }

  // 系统事件
  | { type: 'cron.triggered'; cronId: string }
  | { type: 'error.detected'; error: any };
```

---

## 第三优先级：复盘与进化系统 (P1)

### 解决方案

```typescript
// src/core/evolution/RetrospectiveService.ts

export class RetrospectiveService {
  /**
   * 执行复盘
   */
  async conductRetrospective(taskId: string): Promise<Retrospective> {
    const task = this.db.getTask(taskId);
    const output = this.outputManager.getTaskOutputs(taskId);
    const review = this.db.getReviewByTask(taskId);
    const execution = this.db.getTaskExecution(taskId);

    // 使用 AI 分析
    const prompt = this.buildRetrospectivePrompt({
      task,
      output,
      review,
      execution,
    });

    const analysis = await this.claude.prompt(prompt, {
      outputFormat: 'json',
    });

    // 保存复盘记录
    const retrospective = this.db.createRetrospective({
      task_id: taskId,
      quality_score: analysis.qualityScore,
      lessons_learned: analysis.lessons,
      improvements: analysis.improvements,
      evolution_suggestions: analysis.evolution,
    });

    // 触发进化
    await this.applyEvolution(retrospective);

    return retrospective;
  }

  /**
   * 应用进化（改进系统）
   */
  private async applyEvolution(retro: Retrospective): Promise<void> {
    // 1. 更新员工技能评估
    if (retro.employee_performance) {
      await this.updateEmployeeSkills(retro.employee_performance);
    }

    // 2. 更新流程模板
    if (retro.improvements) {
      await this.updateProcessTemplates(retro.improvements);
    }

    // 3. 更新 Prompt 模板
    if (retro.prompt_suggestions) {
      await this.updatePromptTemplates(retro.prompt_suggestions);
    }
  }
}
```

---

## 实施计划

### Phase 1: 产出管理系统 (3-5 天)

- [ ] OutputManager 类实现
- [ ] outputs 表创建
- [ ] 目录结构初始化
- [ ] 集成到 Orchestrator
- [ ] 单元测试

### Phase 2: 事件驱动调度器 (5-7 天)

- [ ] EventBus 扩展（新事件类型）
- [ ] StrategyEngine 实现
- [ ] DynamicScheduler 实现
- [ ] 与现有 Orchestrator 集成
- [ ] 测试事件流转

### Phase 3: 复盘进化系统 (3-4 天)

- [ ] RetrospectiveService 实现
- [ ] retrospectives 表创建
- [ ] 进化应用逻辑
- [ ] 集成到任务完成流程

### Phase 4: 业务集成 (可选，按需)

- [ ] Xiaohongshu API 客户端
- [ ] Twitter API 客户端
- [ ] Git API 客户端

---

## 立即开始

建议先从 **Phase 1: 产出管理系统** 开始，这是最基础的：

1. 创建 `src/infrastructure/output/OutputManager.ts`
2. 添加 `outputs` 数据库表
3. 实现 `saveOutput`, `getTaskOutputs` 等方法
4. 修改 Orchestrator 调用 OutputManager 保存产出

需要我开始实施吗？
