# AI Company - 双模式架构设计

## 核心理解

**两套系统并行，不是二选一**：

1. **主动模式（Autonomous）** - 公司内部自行运转
   - 自己设定目标（基于公司愿景）
   - 自己发现机会
   - 自己规划和执行
   - 例：小红书运营、内容创作、数据分析

2. **响应模式（Reactive）** - 响应外部输入
   - 用户主动输入
   - 时间触发
   - 外部事件

**关键：透明度系统** - 让用户看到一切
- 记录：所有操作都有日志
- 汇报：在关键节点向用户汇报
- 反馈：定期给用户报表
- 可观察：能看到内部思考过程

---

## 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Company                                │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   主动模式 (Autonomous)                     │ │
│  │                                                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │ │
│  │  │  目标设定    │  │  机会发现    │  │  自主执行    │     │ │
│  │  │  GoalSetter  │  │ Opportunity  │  │ AutoExecutor │     │ │
│  │  │              │  │   Scanner    │  │              │     │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │ │
│  │         │                  │                  │             │ │
│  │         └──────────────────┴──────────────────┘             │ │
│  │                            │                                │ │
│  │  例如：                                                     │ │
│  │  - 小红书运营（每天发帖、分析数据、优化内容）                │ │
│  │  - 内容创作（根据目标持续产出文章）                          │ │
│  │  - 数据监控（发现问题、提出改进）                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                      │                                           │
│                      │                                           │
│  ┌───────────────────┴───────────────────────────────────────┐ │
│  │                   透明度系统 (Transparency)                 │ │
│  │                                                             │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │ │
│  │  │ 操作日志  │  │ 关键节点  │  │ 定期报表  │  │ 实时面板  │  │ │
│  │  │ Activity  │  │ Milestone │  │ Reports  │  │ Dashboard│  │ │
│  │  │   Log     │  │  Report   │  │          │  │          │  │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                      │                                           │
│                      ▼                                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   响应模式 (Reactive)                       │ │
│  │                                                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │ │
│  │  │  用户输入    │  │  时间触发    │  │  外部事件    │     │ │
│  │  │ UserInput    │  │ TimeTrigger  │  │  Webhook     │     │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │ │
│  │         │                  │                  │             │ │
│  │         └──────────────────┴──────────────────┘             │ │
│  │                            │                                │ │
│  │                            ▼                                │ │
│  │                   ┌──────────────┐                        │ │
│  │                   │ EventDriver  │                        │ │
│  │                   │  处理器      │                        │ │
│  │                   └──────────────┘                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 主动模式详细设计

### 1. 目标系统

```typescript
// src/core/autonomous/GoalManager.ts

export class GoalManager {
  /**
   * 管理公司的主动目标
   *
   * 目标来源：
   * 1. 用户设定的战略目标
   * 2. 公司自己发现的改进机会
   * 3. 基于历史数据的优化目标
   */
  async getActiveGoals(): Promise<Goal[]> {
    return this.db.prepare(`
      SELECT * FROM strategic_goals
      WHERE status = 'active'
      ORDER BY priority DESC
    `).all();
  }

  /**
   * 为目标创建执行计划
   */
  async createExecutionPlan(goalId: string): Promise<ExecutionPlan> {
    const goal = this.db.getGoal(goalId);

    // 使用 AI 分解目标为可执行的步骤
    const prompt = `
你是目标规划专家。请将以下目标分解为具体的执行步骤。

目标: ${goal.title}
描述: ${goal.description}
成功标准: ${goal.success_criteria}

请分解为：
1. 具体的行动步骤
2. 每个步骤的预期产出
3. 所需的资源
4. 预估的时间

返回 JSON 格式。
`;

    const response = await this.claude.prompt(prompt, {
      outputFormat: 'json',
    });

    // 保存执行计划
    return this.db.createExecutionPlan({
      goal_id: goalId,
      steps: response.steps,
      resource_requirements: response.resources,
      estimated_duration: response.duration,
    });
  }
}
```

### 2. 机会发现系统

```typescript
// src/core/autonomous/OpportunityScanner.ts

export class OpportunityScanner {
  /**
   * 扫描发现机会
   *
   * 扫描内容：
   * 1. 数据异常（指标下降、趋势变化）
   * 2. 优化空间（流程改进、成本降低）
   * 3. 增长机会（新内容方向、新渠道）
   * 4. 风险预警（性能问题、安全风险）
   */
  async scan(): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = [];

    // 1. 数据分析
    const dataOpportunities = await this.analyzeData();
    opportunities.push(...dataOpportunities);

    // 2. 运营分析
    const operationOpportunities = await this.analyzeOperations();
    opportunities.push(...operationOpportunities);

    // 3. 竞品分析
    const competitorOpportunities = await this.analyzeCompetitors();
    opportunities.push(...competitorOpportunities);

    return opportunities;
  }

  /**
   * 数据分析发现机会
   */
  private async analyzeData(): Promise<Opportunity[]> {
    const opportunities = [];

    // 分析小红书数据
    const xiaohongshuStats = await this.getXiaohongshuStats();

    // 发现：互动率下降
    if (xiaohongshuStats.engagementRate < 0.05) {
      opportunities.push({
        type: 'optimization',
        title: '小红书互动率下降，需要优化内容',
        description: `当前互动率 ${(xiaohongshuStats.engagementRate * 100).toFixed(1)}%，低于目标 5%`,
        potentialValue: 0.8,
        urgency: 0.7,
        suggestedActions: [
          '分析近期低互动内容',
          '调整内容方向',
          '优化发布时间',
        ],
      });
    }

    // 发现：粉丝增长趋势
    if (xiaohongshuStats.followerGrowth > 0.1) {
      opportunities.push({
        type: 'growth',
        title: '小红书粉丝增长良好，可以加大投入',
        description: `周增长 ${xiaohongshuStats.followerGrowth}，超过预期`,
        potentialValue: 0.9,
        urgency: 0.6,
        suggestedActions: [
          '增加发布频率',
          '拓展相似内容',
          '考虑商业化',
        ],
      });
    }

    return opportunities;
  }
}
```

### 3. 自主执行器

```typescript
// src/core/autonomous/AutoExecutor.ts

export class AutoExecutor {
  private goalManager: GoalManager;
  private opportunityScanner: OpportunityScanner;

  /**
   * 主执行循环
   *
   * 定期：
   * 1. 检查目标进度
   * 2. 扫描新机会
   * 3. 决定下一步行动
   * 4. 执行行动
   * 5. 记录结果
   */
  async runCycle(): Promise<void> {
    // 1. 获取活跃目标
    const goals = await this.goalManager.getActiveGoals();

    // 2. 检查目标进度
    for (const goal of goals) {
      const progress = await this.checkGoalProgress(goal);

      // 如果目标滞后，采取行动
      if (progress.isBehindSchedule) {
        await this.catchUpGoal(goal, progress);
      }

      // 如果目标完成，创建新目标
      if (progress.isComplete) {
        await this.completeGoal(goal);
        await this.suggestNextGoals(goal);
      }
    }

    // 3. 扫描机会
    const opportunities = await this.opportunityScanner.scan();

    // 4. 评估机会，决定是否执行
    for (const opp of opportunities) {
      const shouldPursue = await this.evaluateOpportunity(opp);

      if (shouldPursue) {
        await this.pursueOpportunity(opp);
      }
    }
  }

  /**
   * 追赶滞后目标
   */
  private async catchUpGoal(goal: Goal, progress: any): Promise<void> {
    // 记录到透明度系统
    await this.transparency.log({
      type: 'goal_catchup',
      goalId: goal.id,
      message: `目标滞后，开始追赶: ${goal.title}`,
    });

    // 调整执行计划
    const adjustedPlan = await this.adjustExecutionPlan(goal, progress);

    // 执行追赶计划
    await this.executePlan(adjustedPlan);
  }

  /**
   * 追逐机会
   */
  private async pursueOpportunity(opp: Opportunity): Promise<void> {
    // 记录
    await this.transparency.log({
      type: 'opportunity_pursued',
      opportunity: opp,
      message: `开始追逐机会: ${opp.title}`,
    });

    // 将机会转化为任务
    const task = await this.createTaskFromOpportunity(opp);

    // 执行任务
    await this.executeTask(task);
  }
}
```

---

## 透明度系统详细设计

### 1. 操作日志

```typescript
// src/core/transparency/ActivityLogger.ts

export class ActivityLogger {
  /**
   * 记录所有操作
   */
  async log(activity: Activity): Promise<void> {
    await this.db.createActivityLog({
      timestamp: Date.now(),
      type: activity.type,        // 'goal_created', 'task_started', 'decision_made', etc.
      actor: activity.actor,       // 'autonomous' | 'user' | employee_id
      action: activity.action,
      context: activity.context,
      reasoning: activity.reasoning, // 为什么要这样做
      expectedOutcome: activity.expectedOutcome,
    });
  }

  /**
   * 查询操作日志
   */
  async query(filters: ActivityFilters): Promise<Activity[]> {
    // 支持按时间、类型、参与者过滤
    return this.db.getActivityLogs(filters);
  }
}
```

### 2. 关键节点汇报

```typescript
// src/core/transparency/MilestoneReporter.ts

export class MilestoneReporter {
  /**
   * 定义关键节点
   *
   * 关键节点：需要向用户汇报的重要时刻
   */
  private milestones = [
    'goal_created',           // 目标创建
    'goal_completed',         // 目标完成
    'goal_failed',            // 目标失败
    'opportunity_discovered', // 发现重要机会
    'decision_made',          // 重要决策
    'task_started',           // 任务开始（高优先级）
    'task_completed',         // 任务完成
    'task_failed',            // 任务失败
    'review_failed',          // 验收失败
    'output_published',       // 产出发布
  ];

  /**
   * 检查是否需要汇报
   */
  async shouldReport(event: any): Promise<boolean> {
    return this.milestones.includes(event.type) &&
           this.isImportantEnough(event);
  }

  /**
   * 发送汇报
   */
  async report(event: any): Promise<void> {
    const report = await this.generateReport(event);

    // 发送到用户
    await this.notificationService.send({
      to: { channel: 'telegram', userId: this.adminUserId },
      content: { text: report },
    });

    // 同时保存到报表
    await this.saveReport(event, report);
  }

  /**
   * 生成汇报内容
   */
  private async generateReport(event: any): Promise<string> {
    switch (event.type) {
      case 'goal_created':
        return `🎯 新目标创建\n\n${event.goal.title}\n\n${event.goal.description}`;

      case 'goal_completed':
        return `✅ 目标完成\n\n${event.goal.title}\n\n结果: ${event.result}`;

      case 'task_failed':
        return `❌ 任务失败\n\n${event.task.description}\n\n原因: ${event.error}`;

      case 'review_failed':
        return `⚠️ 验收失败\n\n${event.task.description}\n\n问题: ${event.issues}`;

      default:
        return JSON.stringify(event, null, 2);
    }
  }
}
```

### 3. 定期报表

```typescript
// src/core/transparency/ReportGenerator.ts

export class ReportGenerator {
  /**
   * 生成日报
   */
  async generateDailyReport(date: Date): Promise<DailyReport> {
    const startOfDay = new Date(date).setHours(0, 0, 0, 0);
    const endOfDay = new Date(date).setHours(23, 59, 59, 999);

    // 1. 任务统计
    const tasks = await this.db.getTasksByDateRange(startOfDay, endOfDay);

    // 2. 产出统计
    const outputs = await this.db.getOutputsByDateRange(startOfDay, endOfDay);

    // 3. 目标进度
    const goals = await this.goalManager.getAllGoals();

    // 4. 关键指标
    const metrics = await this.calculateMetrics(date);

    return {
      date,
      summary: this.generateSummary(tasks, outputs, goals),
      tasks: {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        failed: tasks.filter(t => t.status === 'failed').length,
        inProgress: tasks.filter(t => t.status === 'in_progress').length,
      },
      outputs: {
        total: outputs.length,
        byType: this.groupByType(outputs),
      },
      goals: goals.map(g => ({
        id: g.id,
        title: g.title,
        progress: g.progress,
        status: g.status,
      })),
      metrics,
      highlights: await this.getHighlights(date),
      issues: await this.getIssues(date),
    };
  }

  /**
   * 生成周报
   */
  async generateWeeklyReport(weekStart: Date): Promise<WeeklyReport> {
    // 类似日报，但聚合一周的数据
    // 增加趋势分析和对比
  }

  /**
   * 生成月报
   */
  async generateMonthlyReport(month: number, year: number): Promise<MonthlyReport> {
    // 类似周报，但聚合一个月的数据
    // 增加深度分析和洞察
  }
}
```

### 4. 实时仪表盘

```typescript
// src/interfaces/dashboard/DashboardData.ts

export class DashboardData {
  /**
   * 获取仪表盘数据
   */
  async getData(): Promise<DashboardData> {
    return {
      // 实时状态
      now: {
        activeGoals: await this.getActiveGoals(),
        runningTasks: await this.getRunningTasks(),
        idleEmployees: await this.getIdleEmployees(),
      },

      // 今日统计
      today: {
        tasksCompleted: await this.getTasksCompletedToday(),
        outputsCreated: await this.getOutputsCreatedToday(),
        metrics: await this.getTodayMetrics(),
      },

      // 趋势
      trends: {
        taskCompletion: await this.getTaskCompletionTrend(7), // 7天趋势
        outputCreation: await this.getOutputCreationTrend(7),
        engagement: await this.getEngagementTrend(7),
      },

      // 最近活动
      recentActivities: await this.getRecentActivities(20),

      // 关键指标
      kpis: await this.getKPIs(),
    };
  }
}
```

---

## 响应模式详细设计

（保持之前的事件驱动设计）

```typescript
// EventCollector 收集外部输入
// EventBus 分发事件
// CoreProcess 处理事件
// ResultRouter 分发结果
```

---

## 两套系统的协作

### 信息共享

```typescript
// 主动模式和响应模式共享数据

// 1. 共享目标
// - 响应模式创建的任务，可以关联到主动模式的目标
// - 主动模式发现的机会，可以通过响应模式通知用户

// 2. 共享资源
// - 主动模式和响应模式使用同一个资源池
// - 避免冲突：主动模式优先级低于响应模式

// 3. 共享学习
// - 两套系统的经验都记录到同一个经验库
// - 互相学习，共同进化
```

### 优先级处理

```typescript
class PriorityManager {
  /**
   * 决定执行顺序
   */
  async prioritize(actions: Action[]): Promise<Action[]> {
    return actions.sort((a, b) => {
      // 1. 响应模式优先（用户输入 > 时间触发 > 外部事件）
      if (a.mode === 'reactive' && b.mode === 'autonomous') return -1;
      if (a.mode === 'autonomous' && b.mode === 'reactive') return 1;

      // 2. 同模式内按优先级
      return b.priority - a.priority;
    });
  }
}
```

---

## 用户控制

### 用户可以：

1. **设定目标**
   ```bash
   ai-company goal create "小红书粉丝增长到10万"
   ai-company goal list
   ai-company goal progress <goal-id>
   ```

2. **查看活动**
   ```bash
   ai-company activity log              # 查看操作日志
   ai-company activity today            # 今天的活动
   ai-company activity timeline         # 时间线
   ```

3. **查看报表**
   ```bash
   ai-company report daily              # 日报
   ai-company report weekly             # 周报
   ai-company report monthly            # 月报
   ```

4. **查看仪表盘**
   ```bash
   ai-company dashboard                 # 实时仪表盘
   ```

5. **干预控制**
   ```bash
   ai-company pause                     # 暂停主动模式
   ai-company resume                    # 恢复
   ai-company config autonomous.enabled false  # 禁用主动模式
   ```

---

## 总结

### 架构要点

1. **双模式并行** - 主动模式 + 响应模式
2. **透明度系统** - 日志、汇报、报表、仪表盘
3. **用户控制** - 可以干预、暂停、查看详情

### 核心流程

```
主动模式：目标 → 计划 → 执行 → 汇报
响应模式：输入 → 处理 → 反馈 → 通知
透明度：记录 → 汇报 → 报表 → 可视化
```

### 用户体验

- 用户把小红书账号交给公司
- 公司自行运营：发帖、分析、优化
- 用户每周收到周报，看到：
  - 本周发帖数、互动情况、粉丝增长
  - 内容表现分析
  - 下周计划
- 有重要事件（比如爆文、违规）实时通知
- 用户随时可以查看仪表盘了解状态

这才是完整的"AI 公司"！
