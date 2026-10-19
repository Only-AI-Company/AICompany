# CXO 架构集成方案

## 目标

将新的 CXO 架构集成到现有 CoreProcess 工作流中，实现：
- 各司其职：CEO 只做意图分析，CRO 负责员工管理，CXO 负责领域执行
- 支持 4 种意图类型：query, goal, task, script
- 完整的员工生命周期：匹配 → 招聘 → 执行 → 绩效

## 现有架构分析

### CoreProcess 当前流程

```typescript
handleUserInput(inputEvent)
  → ceo.analyzeRequirement()          // 返回 { type: 'query'|'execute', ... }
  → if query: handleQuery()
  → if execute: handleExecute()
      → collectEmployeeContext()       // 收集员工和 Agent 信息
      → ceo.decideAgentStrategy()      // 决策用哪个 Agent
      → executeWithAgent()
```

### CEOSupervisorAgent 当前职责

| 方法 | 职责 | 问题 |
|------|------|------|
| analyzeRequirement | 意图分析 (query/execute) | 只支持 2 种类型 |
| decideAgentStrategy | Agent 策略决策 | 职责过重 |
| selectEmployee | 员工选择 | 应该由 CRO 负责 |
| assessRisk | 风险评估 | 保留 |
| makeDecision | 决策处理 | 保留 |
| reviewTask | 任务复盘 | 保留 |

## 集成方案：三阶段渐进式

### 阶段 1：意图层替换（低风险）

**目标：** 用新 CEO 替换意图分析，支持 4 种意图类型

**改动点：**

1. **CoreProcess.ts**
```typescript
// 替换前
const analysis = await this.ceo.analyzeRequirement(content, chatId, history);

// 替换后
const { getCEO } = await import('../cxo/index.js');
const ceo = getCEO();
const intent = await ceo.analyzeIntent(content, history);
// intent.type: 'query' | 'goal' | 'task' | 'script'
```

2. **意图路由处理**
```typescript
switch (intent.type) {
  case 'query':
    await this.handleQuery(intent, event);
    break;
  case 'goal':
    await this.handleGoal(intent, event);  // 新增
    break;
  case 'task':
    await this.handleTask(intent, event);  // 新增
    break;
  case 'script':
    await this.handleScript(intent, event);  // 新增
    break;
}
```

**风险评估：** 低
- 只影响入口处的意图分析
- 后续处理逻辑保持不变
- 可以快速回滚

### 阶段 2：员工管理层替换（中风险）

**目标：** 用 CRO 替换员工选择和招聘

**改动点：**

1. **handleTask/handleGoal 方法中**
```typescript
// 替换前
const agentDecision = await this.ceo.decideAgentStrategy({
  task,
  employees,
  availableAgents,
});

// 替换后
const { getCRO } = await import('../cxo/index.js');
const cro = getCRO();

// 1. 让 CRO 匹配员工
const employeeMatch = await cro.findEmployee(
  {
    description: taskDescription,
    requiredCapabilities,
    taskType: extractTaskType(intent),
  },
  employees
);

// 2. 根据 employeeMatch 决定策略
if (!employeeMatch.isNew) {
  await this.executeWithExistingAgent(...);
} else {
  await this.executeWithNewAgent(...);
}
```

**风险评估：** 中
- 影响员工选择逻辑
- 需要确保 CRO 的匹配质量和 CEOSupervisor 一致
- 新增动态招聘功能

### 阶段 3：执行层替换（高风险）

**目标：** 用 CXO 执行器替换 DynamicAgent

**改动点：**

1. **领域任务路由**
```typescript
// 根据任务类型选择 CXO 执行器
const { getCTO, getCMO, getCOO, getCFO } = await import('../cxo/index.js');

const cxo = this.selectCXOExecutor(taskType, requiredCapabilities);

if (cxo) {
  // 使用 CXO 执行器
  const result = await cxo.execute(
    {
      description: taskDescription,
      requiredCapabilities,
      context,
    },
    agentPrompt
  );
} else {
  // Fallback 到 DynamicAgent
  await this.executeWithDynamicAgent(...);
}
```

2. **CXO 选择器**
```typescript
private selectCXOExecutor(
  taskType: string,
  requiredCapabilities: string[]
): ICXO | null {
  const { getCTO, getCMO, getCOO, getCFO } = require('../cxo/index.js');

  const cto = getCTO();
  if (cto.canHandle({ description: '', requiredCapabilities })) return cto;

  const cmo = getCMO();
  if (cmo.canHandle({ description: '', requiredCapabilities })) return cmo;

  const coo = getCOO();
  if (coo.canHandle({ description: '', requiredCapabilities })) return coo;

  const cfo = getCFO();
  if (cfo.canHandle({ description: '', requiredCapabilities })) return cfo;

  return null;
}
```

**风险评估：** 高
- 完全改变任务执行方式
- 需要确保 CXO 执行器的稳定性和可靠性
- 建议保留 DynamicAgent 作为 Fallback

### 阶段 4：引入 IntentRouter（可选）

**目标：** 使用 IntentRouter 解耦意图路由逻辑

**改动点：**

```typescript
import { getIntentRouter, type Intent } from '../cxo/index.js';

const router =_intentRouter();

// 注册处理器
router.registerHandler('query', new QueryHandler());
router.registerHandler('goal', new GoalHandler());
router.registerHandler('task', new TaskHandler());
router.registerHandler('script', new ScriptHandler());

// 路由
const result = await router.route(intent);
```

**风险评估：** 低
- 主要是架构重构，不改变业务逻辑
- 可以最后进行

## 实施步骤

### Step 1: 准备工作
- [ ] 确保所有 CXO 模块编译通过
- [ ] 编写 CXO 单元测试
- [ ] 备份现有 CoreProcess 代码

### Step 2: 阶段 1 实施
- [ ] 修改 CoreProcess.handleUserInput()
- [ ] 添加 handleGoal/handleTask/handleScript 方法
- [ ] 测试 4 种意图类型
- [ ] 监控错误率

### Step 3: 阶段 2 实施
- [ ] 修改 CoreProcess.handleExecute()
- [ ] 集成 CRO.findEmployee()
- [ ] 测试员工匹配质量
- [ ] 测试动态招聘功能

### Step 4: 阶段 3 实施（可选，根据效果决定）
- [ ] 实现 CXO 执行器选择逻辑
- [ ] 保留 DynamicAgent Fallback
- [ ] 灰度发布 CXO 执行器
- [ ] 监控执行成功率和性能

### Step 5: 清理和优化
- [ ] 移除旧的 CEOSupervisor.analyzeRequirement()
- [ ] 移除旧的 CEOSupervisor.selectEmployee()
- [ ] 更新文档
- [ ] 性能优化

## 回滚方案

每个阶段都保留回滚能力：

```typescript
// 使用 feature flag 控制
const USE_NEW_CEO = process.env.USE_NEW_CEO === 'true';

if (USE_NEW_CEO) {
  const { getCEO } = await import('../cxo/index.js');
  const ceo = getCEO();
  intent = await ceo.analyzeIntent(content, history);
} else {
  intent = await this.ceo.analyzeRequirement(content, chatId, history);
  // 转换格式
  intent = this.convertLegacyIntent(intent);
}
```

## 测试计划

### 单元测试
- [ ] CEO.analyzeIntent() 测试
- [ ] CRO.findEmployee() 测试
- [ ] CRO.hireEmployee() 测试
- [ ] CXO.canHandle() 测试
- [ ] CXO.execute() 测试

### 集成测试
- [ ] query 意图端到端测试
- [ ] goal 意图端到端测试
- [ ] task 意图端到端测试
- [ ] script 意图端到端测试
- [ ] 员工匹配测试
- [ ] 动态招聘测试
- [ ] CXO 执行器测试

### 性能测试
- [ ] 意图分析延迟 < 2s
- [ ] 员工匹配延迟 < 1s
- [ ] 任务执行成功率 > 90%
- [ ] 内存使用 < 500MB

## 风险和缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 意图分类错误 | 任务被错误路由 | 保留旧逻辑作为 Fallback |
| 员工匹配质量下降 | 任务执行失败 | 监控成功率，调优匹配算法 |
| CXO 执行器不稳定 | 任务失败 | 保留 DynamicAgent Fallback |
| 性能下降 | 用户体验差 | 性能测试，优化查询 |
| 兼容性问题 | 功能异常 | 渐进式发布，快速回滚 |

## 时间估算

| 阶段 | 工作量 | 测试 | 总计 |
|------|--------|------|------|
| 阶段 1 | 4h | 2h | 6h |
| 阶段 2 | 6h | 4h | 10h |
| 阶段 3 | 8h | 6h | 14h |
| 阶段 4 | 4h | 2h | 6h |
| 总计 | 22h | 14h | 36h |

## 下一步行动

1. **评审集成方案** - 确认技术方案和实施计划
2. **开始阶段 1** - 实现意图层替换
3. **持续监控** - 观察新架构的效果和问题
