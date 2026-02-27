# 场景分析：每天 10 点科技日报

## 完整生命周期

### 阶段 1：用户输入（响应模式）

```
用户在 Telegram 发送:
"每天 10 点给我一份科技日报"
```

**事件流**：

```typescript
// 1. Telegram Bot 接收消息
TelegramBot.on('message', msg => {
  // 2. EventCollector 捕获
  eventCollector.emit({
    type: 'user.input',
    source: 'telegram',
    userId: '123',
    chatId: '456',
    content: '每天 10 点给我一份科技日报',
    metadata: { msg }
  });
});

// 3. EventBus 分发
eventBus.emit(event);

// 4. CoreProcess 接收
coreProcess.handleUserInput(event);

// 5. 理解意图
intent = await understandIntent(event.content);
// 返回: {
//   type: 'create_recurring_task',
//   task: '生成科技日报',
//   schedule: { type: 'daily', time: '10:00' },
//   requirements: ['科技新闻', 'AI动态', '产品发布']
// }

// 6. 透明度记录
activityLogger.log({
  type: 'user_input_received',
  actor: 'user',
  action: 'create_recurring_task_request',
  context: { originalInput: event.content },
  timestamp: Date.now()
});
```

---

### 阶段 2：创建目标（响应模式 → 主动模式）

```typescript
// CoreProcess 继续处理

// 1. 创建战略目标
const goal = await goalManager.createGoal({
  type: 'recurring_content',
  title: '每日科技日报',
  description: '每天 10 点生成并发送科技日报，包含科技新闻、AI动态、产品发布',
  source: 'user_request',
  userId: '123',
  chatId: '456',

  // 成功标准
  successCriteria: {
    daily: true,
    time: '10:00',
    quality: 'engagement_rate > 0.03',
    content: ['科技新闻', 'AI动态', '产品发布']
  },

  // 自动续期
  recurring: {
    frequency: 'daily',
    autoRenew: true
  },

  status: 'active',
  priority: 0.8
});

// 返回: goal_id = 'goal-daily-tech-report'

// 2. 透明度：关键节点汇报
await milestoneReporter.report({
  type: 'goal_created',
  goal: goal,
  message: `🎯 已创建目标：每日科技日报\n\n将每天 10:00 自动生成并发送`
});

// 用户收到 Telegram 通知：
// "🎯 已创建目标：每日科技日报
//
//  将每天 10:00 自动生成并发送
//  包含内容：科技新闻、AI动态、产品发布"
```

---

### 阶段 3：创建执行计划（主动模式）

```typescript
// 目标创建后，自动创建执行计划

const plan = await goalManager.createExecutionPlan(goal.id);

// AI 分解目标为步骤
plan = {
  goal_id: 'goal-daily-tech-report',

  steps: [
    {
      id: 'step-1',
      name: '收集科技新闻',
      agent: 'news_collector',
      actions: [
        '搜索 TechCrunch、The Verge、36氪',
        '筛选今日重要新闻',
        '提取关键信息'
      ],
      estimatedMinutes: 10
    },
    {
      id: 'step-2',
      name: '收集 AI 动态',
      agent: 'ai_news_collector',
      actions: [
        '搜索 Arxiv、OpenAI、Anthropic',
        '筛选今日重要动态',
        '提取关键信息'
      ],
      estimatedMinutes: 10
    },
    {
      id: 'step-3',
      name: '整理汇编',
      agent: 'content_compiler',
      actions: [
        '合并收集的信息',
        '按主题分类',
        '添加摘要和评论'
      ],
      estimatedMinutes: 15
    },
    {
      id: 'step-4',
      name: '生成日报',
      agent: 'daily_reporter',
      actions: [
        '格式化为日报',
        '添加配图建议',
        '生成发布文案'
      ],
      estimatedMinutes: 10
    },
    {
      id: 'step-5',
      name: '发送给用户',
      agent: 'notifier',
      actions: [
        '发送到 Telegram',
        '记录发送状态'
      ],
      estimatedMinutes: 2
    }
  ],

  totalEstimatedMinutes: 47,

  requiredAgents: ['news_collector', 'ai_news_collector', 'content_compiler', 'daily_reporter', 'notifier'],

  schedule: {
    type: 'cron',
    expression: '0 10 * * *',  // 每天 10:00
    timezone: 'Asia/Shanghai'
  }
};

// 保存计划
await db.createExecutionPlan(plan);

// 透明度记录
await activityLogger.log({
  type: 'plan_created',
  actor: 'system',
  action: 'create_execution_plan',
  context: { goalId: goal.id, plan },
  reasoning: '为目标创建执行计划，分解为5个步骤'
});
```

---

### 阶段 4：创建 Cron 任务（响应模式）

```typescript
// 创建定时触发器

const cron = await cronService.create({
  name: '每日科技日报',
  description: '每天 10:00 触发科技日报生成',
  goal_id: goal.id,
  plan_id: plan.id,

  cron_rule: '0 10 * * *',
  timezone: 'Asia/Shanghai',

  enabled: true,
  next_run: calculateNextRun('0 10 * * *', 'Asia/Shanghai'),

  callback: 'trigger_goal_execution'
});

// 保存到数据库
await db.insert('crontab', cron);

// 透明度记录
await activityLogger.log({
  type: 'cron_created',
  actor: 'system',
  action: 'create_cron_job',
  context: { cron, goalId: goal.id },
  reasoning: '创建定时任务，每天 10:00 触发'
});

// 用户收到通知：
// "⏰ 已设置定时任务
//  每天 10:00 自动生成科技日报
//  首次运行：明天 10:00"
```

---

### 阶段 5：等待触发（时间流逝）

```
系统持续运行中...

主动模式：
- 其他目标在执行
- 机会扫描在运行
- 经验在学习

透明度系统：
- 记录所有活动
- 监控系统状态
- 准备定期报表
```

---

### 阶段 6：触发时刻（响应模式）

```
第二天 10:00:00
```

```typescript
// 1. CronService 检查到期的任务
const dueCrons = await cronService.getDueCrons();
// 包含: { id: 'cron-daily-tech-report', ... }

// 2. 发出时间触发事件
for (const cron of dueCrons) {
  eventBus.emit({
    type: 'time.triggered',
    triggerType: 'cron',
    cron: cron
  });
}

// 3. CoreProcess 接收
coreProcess.handleTimeTrigger(event);

// 4. 透明度记录
await activityLogger.log({
  type: 'cron_triggered',
  actor: 'system',
  action: 'trigger_cron_job',
  context: { cronId: cron.id, goalId: cron.goal_id },
  timestamp: Date.now()
});
```

---

### 阶段 7：执行目标（主动模式）

```typescript
// 5. AutoExecutor 开始执行

const execution = await autoExecutor.executeGoal(goal.id, plan.id);

// 5.1 创建任务实例
const task = await db.createTask({
  id: 'task-tech-report-20250228',
  type: 'content_creation',
  description: '生成 2025-02-28 科技日报',
  goal_id: goal.id,
  plan_id: plan.id,
  status: 'executing',
  work_dir: '~/.ai-company/outputs/tasks/task-tech-report-20250228',
  created_at: Date.now()
});

// 透明度：任务开始
await milestoneReporter.report({
  type: 'task_started',
  task: task,
  message: `📝 开始生成今日科技日报`
});

// 5.2 执行步骤 1：收集科技新闻
await autoExecutor.executeStep(plan.steps[0], {
  task, workDir: task.work_dir
});

// news_collector Agent 工作
// - 调用 Claude CLI
// - 使用搜索工具
// - 收集新闻
// - 保存到 work_dir/step1_news.json

// 透明度记录
await activityLogger.log({
  type: 'step_completed',
  actor: 'news_collector',
  action: 'collect_tech_news',
  context: {
    stepId: 'step-1',
    taskId: task.id,
    result: '收集到 15 条科技新闻'
  },
  output: { newsCount: 15 }
});

// 5.3 执行步骤 2：收集 AI 动态
await autoExecutor.executeStep(plan.steps[1], {
  task, workDir: task.work_dir
});

// 类似步骤 1...

// 5.4 执行步骤 3：整理汇编
await autoExecutor.executeStep(plan.steps[2], {
  task, workDir: task.work_dir
});

// content_compiler Agent 工作
// - 读取 step1_news.json, step2_ai_news.json
// - 合并和分类
// - 生成汇编草稿
// - 保存到 work_dir/step3_draft.md

// 5.5 执行步骤 4：生成日报
await autoExecutor.executeStep(plan.steps[3], {
  task, workDir: task.work_dir
});

// daily_reporter Agent 工作
// - 读取 step3_draft.md
// - 格式化为日报
// - 添加配图建议
// - 保存到 work_dir/step4_report.md

// 5.6 执行步骤 5：发送给用户
await autoExecutor.executeStep(plan.steps[4], {
  task, workDir: task.work_dir
});

// notifier Agent 工作
const report = fs.readFileSync('work_dir/step4_report.md', 'utf-8');

// 发送到 Telegram
await telegramBot.sendMessage(chatId, report);

// 透明度记录
await activityLogger.log({
  type: 'notification_sent',
  actor: 'notifier',
  action: 'send_telegram_message',
  context: {
    chatId: '456',
    reportLength: report.length
  }
});
```

---

### 阶段 8：完成与验收（主动模式）

```typescript
// 6. 所有步骤完成

const result = {
  success: true,
  task: task,
  outputs: [
    { step: 'step-1', file: 'step1_news.json' },
    { step: 'step-2', file: 'step2_ai_news.json' },
    { step: 'step-3', file: 'step3_draft.md' },
    { step: 'step-4', file: 'step4_report.md' }
  ],
  sent: true
};

// 7. 更新任务状态
await db.updateTask(task.id, {
  status: 'completed',
  completed_at: Date.now(),
  output: result
});

// 8. 保存产出
await outputManager.save({
  task_id: task.id,
  type: 'article',
  title: '科技日报 2025-02-28',
  content: report,
  file_path: `${task.work_dir}/step4_report.md`,
  metadata: {
    date: '2025-02-28',
    categories: ['科技新闻', 'AI动态', '产品发布']
  }
});

// 返回: output_id = 'out-tech-report-20250228'

// 9. 发出产出事件
eventBus.emit({
  type: 'output.created',
  outputId: 'out-tech-report-20250228',
  taskId: task.id,
  type: 'article'
});

// 10. 透明度：关键节点汇报
await milestoneReporter.report({
  type: 'task_completed',
  task: task,
  result: result,
  message: `✅ 科技日报已生成并发送`
});

// 用户收到 Telegram 通知：
// "✅ 科技日报已生成并发送
//
//  今日共收集 15 条科技新闻
//  生成报告：科技日报 2025-02-28
//  已发送到您的 Telegram"
```

---

### 阶段 9：持续优化（主动模式）

```typescript
// 目标持续运行中...

// 第二天、第三天...每天执行

// 一周后，AutoExecutor 分析执行情况

const weekStats = await analyzer.analyzeGoalPerformance(goal.id, {
  period: 'week',
  endDate: Date.now()
});

// 分析结果：
weekStats = {
  executions: 7,           // 执行了 7 次
  onTime: 7,               // 全部准时
  success: 7,              // 全部成功
  avgDuration: 45,         // 平均耗时 45 分钟
  userFeedback: {
    positive: 3,           // 用户 3 次正面反馈
    neutral: 4,
    negative: 0
  },
  engagement: {
    avgReadRate: 0.8,      // 平均阅读率 80%
    avgSatisfaction: 4.2   // 平均满意度 4.2/5
  }
};

// 发现优化机会
const opportunities = await opportunityScanner.scan();

opportunities.push({
  type: 'optimization',
  title: '科技日报可以增加推荐阅读部分',
  description: '根据用户反馈，增加相关文章推荐可以提高价值',
  potentialValue: 0.7,
  goalId: goal.id,
  suggestedAction: {
    type: 'modify_plan',
    step: 'step-4',
    change: '添加推荐阅读部分'
  }
});

// 询问用户是否采纳优化
await milestoneReporter.report({
  type: 'improvement_suggested',
  goal: goal,
  opportunity: opportunities[0],
  message: `💡 发现优化机会\n\n科技日报可以增加推荐阅读部分\n\n是否采纳？回复 "采纳" 或 "忽略"`
});

// 用户回复 "采纳"

// 更新执行计划
await goalManager.updateExecutionPlan(plan.id, {
  step: 'step-4',
  changes: {
    addSection: '推荐阅读',
    instructions: '根据今日内容推荐 3-5 篇相关文章'
  }
});

// 明天开始使用新计划
```

---

### 阶段 10：定期汇报（透明度系统）

```typescript
// 每周自动生成周报

const weeklyReport = await reportGenerator.generateWeeklyReport(goal.id);

weeklyReport = {
  goalId: 'goal-daily-tech-report',
  period: { start: '2025-02-24', end: '2025-03-02' },

  summary: `
本周科技日报运行良好！

📊 执行情况
- 计划执行：7/7 天
- 准时完成：7/7 天
- 平均耗时：45 分钟

📈 内容质量
- 平均阅读率：82%
- 用户满意度：4.2/5
- 正面反馈：3 次

💡 优化建议
- 已采纳：增加推荐阅读部分
- 待评估：增加视频摘要
  `,

  details: {
    dailyStats: [
      { date: '02-24', status: 'completed', sent: true },
      { date: '02-25', status: 'completed', sent: true },
      { date: '02-26', status: 'completed', sent: true },
      { date: '02-27', status: 'completed', sent: true },
      { date: '02-28', status: 'completed', sent: true },
      { date: '03-01', status: 'completed', sent: true },
      { date: '03-02', status: 'completed', sent: true },
    ],

    improvements: [
      {
        date: '2025-02-28',
        description: '增加推荐阅读部分',
        reason: '用户反馈',
        impact: '待评估'
      }
    ],

    metrics: {
      totalOutputs: 7,
      avgEngagement: 0.82,
      userSatisfaction: 4.2
    }
  }
};

// 发送周报到 Telegram
await telegramBot.sendMessage(chatId, formatWeeklyReport(weeklyReport));

// 同时保存到报表库
await db.createReport({
  type: 'weekly',
  goal_id: goal.id,
  content: weeklyReport,
  period: weeklyReport.period,
  created_at: Date.now()
});

// 用户可以通过 CLI 查看
// ai-company report goal <goal-id> weekly
```

---

## 完整流程图

```
┌────────────────────────────────────────────────────────────────┐
│                     用户输入（Telegram）                         │
│  "每天 10 点给我一份科技日报"                                    │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                   响应模式：处理输入                             │
│  1. 理解意图 → create_recurring_task                           │
│  2. 创建目标 → goal_id = 'goal-daily-tech-report'               │
│  3. 关键节点汇报 → Telegram: "🎯 已创建目标"                    │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                   主动模式：创建执行计划                         │
│  1. AI 分解目标 → 5 个步骤                                      │
│  2. 创建 Cron 任务 → '0 10 * * *'                              │
│  3. 关键节点汇报 → Telegram: "⏰ 已设置定时任务"                 │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                      等待触发（时间流逝）                         │
│  系统继续处理其他事务...                                        │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                  第二天 10:00：Cron 触发                         │
│  1. CronService 检测到到期任务                                   │
│  2. 发出 time.triggered 事件                                     │
│  3. 关键节点汇报 → Telegram: "📝 开始生成今日科技日报"           │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                  主动模式：执行目标                             │
│  Step 1: 收集科技新闻 → 15 条                                    │
│  Step 2: 收集 AI 动态 → 8 条                                     │
│  Step 3: 整理汇编 → 草稿                                        │
│  Step 4: 生成日报 → 最终报告                                     │
│  Step 5: 发送到 Telegram                                        │
│                                                                  │
│  每步都有透明度记录                                              │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                        完成与验收                                │
│  1. 任务状态 → completed                                       │
│  2. 保存产出 → outputs/articles/                               │
│  3. 关键节点汇报 → Telegram: "✅ 科技日报已生成并发送"           │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                        持续运行                                 │
│  第二天、第三天...每天 10:00 自动执行                            │
│                                                                  │
│  一周后：                                                         │
│  - 分析执行情况                                                   │
│  - 发现优化机会                                                   │
│  - 询问用户是否采纳                                               │
│  - 更新执行计划                                                   │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                        定期汇报                                 │
│  每周发送周报到 Telegram                                         │
│  用户也可以随时查看：                                             │
│  - ai-company activity log                                      │
│  - ai-company report weekly                                     │
│  - ai-company dashboard                                         │
└────────────────────────────────────────────────────────────────┘
```

---

## 关键特点

### 1. 双模式协作

| 阶段 | 模式 | 作用 |
|------|------|------|
| 用户输入 | 响应模式 | 接收并处理用户请求 |
| 创建目标 | 响应→主动 | 响应创建，主动执行 |
| 执行计划 | 主动模式 | 系统自己规划 |
| Cron触发 | 响应模式 | 时间事件触发 |
| 执行目标 | 主动模式 | 系统自己执行 |
| 完成汇报 | 透明度系统 | 告知用户结果 |
| 持续优化 | 主动模式 | 系统自己改进 |
| 定期报表 | 透明度系统 | 定期告知状态 |

### 2. 透明度贯穿始终

- **输入时**：确认收到，告知将创建目标
- **创建后**：汇报目标和计划
- **执行时**：记录每一步操作
- **完成后**：汇报结果
- **定期**：发送周报/月报
- **优化时**：询问用户意见

### 3. 用户可以随时了解

```bash
# 查看目标详情
ai-company goal show goal-daily-tech-report

# 查看执行历史
ai-company activity log --goal goal-daily-tech-report

# 查看产出
ai-company outputs list --goal goal-daily-tech-report

# 查看仪表盘
ai-company dashboard
```

这才是完整的生命周期！
