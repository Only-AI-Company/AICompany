# AI Company v3 - Review System Complete

## 完成概述

复盘系统已完全实现，所有 CEO 方法现在使用 LLM 驱动。

---

## 已完成工作

### 复盘系统 (`Engine.performReview()`)

完整的复盘循环实现：

```typescript
private async performReview(): Promise<void> {
  // 1. 收集最近完成的任务（未复盘的）
  const recentTasks = this.db.getAllTasks().filter(
    t => t.status === 'completed' && !t.reviewed
  );

  // 2. 对每个任务进行复盘
  for (const task of recentTasks) {
    // 调用 CEO 复盘
    const review = await this.ceo.reviewTask(task, task.result);

    // 持久化复盘结果
    this.db.insertReview(review);

    // 更新员工绩效
    if (review.shouldUpdatePerformance) {
      employee.updatePerformance(review.performanceDelta);
    }

    // 标记任务已复盘
    this.db.updateTask(task.id, { reviewed: 1 });
  }

  // 3. 更新系统状态
  this.db.updateSystemStatus({ last_review_at: Date.now() });
}
```

### CEO LLM 驱动方法

#### 1. `decomposeGoal()` - 目标拆解

```typescript
// 调用 LLM 拆解目标
const response = await this.aiProvider.prompt(userPrompt, systemPrompt);
const result = parseJSON(content);

// 返回结构化计划
{
  description: "计划描述",
  steps: [
    {
      id: "step_1",
      description: "步骤描述",
      requiredCapabilities: ["能力1", "能力2"],
      estimatedDuration: 60
    }
  ]
}
```

#### 2. `assignTask()` - 任务分配

```typescript
// 调用 LLM 选择员工
const response = await this.aiProvider.prompt(userPrompt, systemPrompt);
const result = parseJSON(content);

// 返回选中的员工
{
  employeeId: "员工ID",
  reasoning: "选择理由"
}
```

#### 3. `reviewTask()` - 任务复盘

```typescript
// 调用 LLM 复盘任务
const response = await this.aiProvider.prompt(userPrompt, systemPrompt);
const result = parseJSON(content);

// 返回复盘结果
{
  score: 8,              // 1-10 分
  strengths: [...],       // 优点
  improvements: [...],    // 改进点
  learnings: [...],       // 经验教训
  shouldUpdatePerformance: true,
  performanceDelta: 10    // 绩效调整
}
```

### 数据库更新

添加了 `reviewed` 列到 tasks 表：

```sql
CREATE TABLE IF NOT EXISTS tasks (
  ...
  reviewed INTEGER DEFAULT 0,  -- 新增：是否已复盘
  ...
);
```

---

## 复盘触发机制

```
Engine.runLoop()
  └─> 每分钟检查: if (Date.now() % 60000 < 1000)
      └─> performReview()
          ├─> 收集已完成但未复盘的任务
          ├─> 调用 CEO.reviewTask() 进行 LLM 复盘
          ├─> 存储复盘结果到数据库
          ├─> 更新员工绩效
          └─> 标记任务已复盘
```

---

## Fallback 策略

所有 LLM 调用都有 fallback：

1. **目标拆解**: 返回默认 3 步计划
2. **任务分配**: 使用技能匹配算法
3. **任务复盘**: 基于成功/失败的简单评分

```typescript
try {
  // LLM 调用
  const response = await this.aiProvider.prompt(...);
  return parseJSON(content);
} catch (error) {
  console.warn('LLM failed, using fallback:', error.message);
  return this.fallbackMethod();
}
```

---

## 构建状态

```bash
$ npm run build
✓ Build successful
```

---

## v3 核心功能完成度

| 功能 | 状态 | 说明 |
|------|------|------|
| 用户输入理解 | ✅ | LLM 驱动意图识别 |
| 目标拆解 | ✅ | LLM 驱动计划生成 |
| 任务分配 | ✅ | LLM 驱动员工选择 |
| 任务调度 | ✅ | 优先级队列 + 并发控制 |
| 任务执行 | ✅ | 员工执行 + 工具使用 |
| 任务复盘 | ✅ | LLM 驱动评价学习 |
| 数据持久化 | ✅ | SQLite 完整支持 |
| 自主运行 | ✅ | 后台循环 + 自动复盘 |

---

## 待实现 (P4)

### 测试
- [ ] 单元测试
- [ ] 集成测试
- [ ] 端到端测试

### CLI 入口
- [ ] 命令行入口实现
- [ ] 交互式对话
- [ ] 状态查询命令

---

## 总结

**v3 核心系统现已完成！**

AI Company v3 现在具备完整的自主运行能力：
- ✅ LLM 驱动的决策（目标拆解、任务分配、复盘）
- ✅ 数据持久化（所有状态保存到数据库）
- ✅ 自主运行循环（每秒检查 + 每分钟复盘）
- ✅ 健壮的 fallback 机制
- ✅ 完整的事件日志

下一步：CLI 入口、测试
