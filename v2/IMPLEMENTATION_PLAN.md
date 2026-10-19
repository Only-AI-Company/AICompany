# AI Company v2 下一步实施方案

## 一、现状分析

### 1.1 已完成 ✅
- 事件驱动架构 (EventBus, EventCollector)
- CEO 需求分析 (CEOSupervisor.analyzeRequirement)
- 查询类任务处理 (handleQuery → ToolRegistry)
- 动态 Agent 框架 (DynamicAgent)
- API 模式执行器 (APIAgentExecutor + Tool Use)
- 系统工具集 (Bash, Read, Write, Edit, Glob, Grep, LS)
- Employee Agent 管理 (EmployeeAgentManager)
- Telegram 集成

### 1.2 核心问题 ❌
**执行流程断裂**：CoreProcess 还在使用 TaskSessionManager（PTY 模式），而不是 APIAgentExecutor（API 模式）

```
当前流程（断裂）:
用户输入 → CEO 分析 → type=execute
  → executeWithExistingAgent/executeWithNewAgent
    → TaskSessionManager.executeTask()  ❌ PTY 不工作
      → 任务失败
```

### 1.3 架构是对的
- CEO 调度机制 ✅
- Employee Agent 概念 ✅
- 动态创建 Agent ✅
- 基础工具集 ✅

**问题只是：执行器用错了。**

---

## 二、修复方案

### 2.1 核心修复：替换执行器

**问题代码位置**：
- `src/core/events/CoreProcess.ts:1270` (executeWithExistingAgent)
- `src/core/events/CoreProcess.ts:1373` (executeWithNewAgent)

**当前代码**：
```typescript
const sessionManager = getTaskSessionManager();
const result = await sessionManager.executeTask(taskId, fullPrompt);
```

**修复为**：
```typescript
// 1. 获取 Agent 的 system prompt
const agentPrompt = await this.getAgentPrompt(agentFile);

// 2. 创建 API 模式执行器
const executor = getAPIAgentExecutor({
  agentId: taskId,
  agentName: agentConfig.name || 'Agent',
  systemPrompt: agentPrompt,
  maxTurns: 10,
  timeout: 300000,
});

// 3. 执行任务
const result = await executor.execute(taskDescription);
```

### 2.2 修改范围

| 文件 | 修改内容 |
|------|---------|
| `CoreProcess.ts` | 替换 TaskSessionManager 为 APIAgentExecutor |
| `CoreProcess.ts` | 添加 getAgentPrompt() 方法 |
| `DynamicAgent.ts` | 已经在使用 APIAgentExecutor ✅ |

---

## 三、分阶段实施计划

### Phase 1: 修复执行流程 (1-2天)

**目标**：让 type=execute 的任务能正常执行

#### 步骤 1: 添加获取 Agent Prompt 的方法
```typescript
// CoreProcess.ts

private async getAgentPrompt(agentFile: string): Promise<string> {
  const { readFile } = await import('fs/promises');

  // agentFile 可能是：
  // 1. 文件路径：~/.claude/agents/xxx.md
  // 2. 数据库存储的 prompt

  try {
    // 先尝试从文件读取
    const content = await readFile(agentFile, 'utf-8');
    // 提取 frontmatter 之后的 prompt 部分
    const parts = content.split('---');
    if (parts.length >= 3) {
      return parts.slice(2).join('---').trim();
    }
    return content;
  } catch {
    // 从数据库读取
    const row = this.db.prepare(`
      SELECT prompt_content FROM employee_agents
      WHERE agent_file = ?
    `).get(agentFile);

    if (row) {
      return row.prompt_content;
    }

    throw new Error(`找不到 Agent prompt: ${agentFile}`);
  }
}
```

#### 步骤 2: 修改 executeWithExistingAgent
```typescript
private async executeWithExistingAgent(
  taskId: string,
  taskDescription: string,
  agentFile: string,
  employeeId: string,
  inputEvent: UserInputEvent
): Promise<void> {
  // ... 创建任务记录 ...

  // 获取 Agent prompt
  const agentPrompt = await this.getAgentPrompt(agentFile);

  // 获取 Agent 信息（用于命名）
  const agentInfo = this.db.prepare(`
    SELECT agent_name, task_type FROM employee_agents
    WHERE agent_file = ?
  `).get(agentFile) || { agent_name: 'Agent', task_type: 'general' };

  // 创建 API 执行器
  const executor = getAPIAgentExecutor({
    agentId: taskId,
    agentName: agentInfo.agent_name,
    systemPrompt: agentPrompt,
    maxTurns: 10,
    timeout: 300000,
  });

  // 发出任务开始事件
  this.eventBus.emit({
    type: 'task.started',
    taskId,
    employeeId,
    source: inputEvent.source,
    chatId: inputEvent.chatId,
    userId: inputEvent.userId,
    timestamp: Date.now(),
  } as any);

  try {
    // 执行任务
    const result = await executor.execute(taskDescription);

    // 发出任务完成事件
    this.eventBus.emit({
      type: 'task.completed',
      taskId,
      employeeId,
      source: inputEvent.source,
      chatId: inputEvent.chatId,
      userId: inputEvent.userId,
      result: {
        success: result.success,
        output: result.output,
        artifacts: result.artifacts,
      },
      taskDescription: taskDescription.substring(0, 100),
      duration: result.usage ? (result.usage.inputTokens + result.usage.outputTokens) : 0,
      timestamp: Date.now(),
    } as any);

    // 更新 Agent 统计
    const { getEmployeeAgentManager } = await import('../agents/EmployeeAgentManager.js');
    const agentManager = getEmployeeAgentManager(this.db);
    agentManager.recordUsage(
      this.extractAgentIdFromFile(agentFile),
      result.success,
      result.success ? 8 : 0
    );

  } catch (error: any) {
    // ... 错误处理 ...
  }
}
```

#### 步骤 3: 修改 executeWithNewAgent
```typescript
private async executeWithNewAgent(
  taskId: string,
  taskDescription: string,
  requiredCapabilities: string[],
  agentConfig: {
    employeeId: string;
    name: string;
    taskType: string;
    taskSubtype: string | null;
    prompt: string;
  },
  inputEvent: UserInputEvent
): Promise<void> {
  console.log(`[CoreProcess] 🆕 创建新 Agent: ${agentConfig.name}`);

  const { getEmployeeAgentManager } = await import('../agents/EmployeeAgentManager.js');
  const agentManager = getEmployeeAgentManager(this.db);

  try {
    // 1. 保存 Agent 到数据库
    const agentFile = `~/.claude/agents/${Date.now()}_${agentConfig.name}.md`;
    const savedAgent = agentManager.saveAgent({
      employee_id: agentConfig.employeeId,
      task_type: agentConfig.taskType,
      task_subtype: agentConfig.taskSubtype,
      agent_name: agentConfig.name,
      agent_file: agentFile,
      prompt_content: agentConfig.prompt,
    });

    // 2. 创建数据库任务记录
    this.db.createTask({
      id: taskId,
      type: 'general',
      description: taskDescription,
      priority: 'medium',
      requestedBy: inputEvent.userId || 'user',
      assignedTo: agentConfig.employeeId,
    });

    // 3. 创建 API 执行器
    const executor = getAPIAgentExecutor({
      agentId: taskId,
      agentName: agentConfig.name,
      systemPrompt: agentConfig.prompt,
      maxTurns: 10,
      timeout: 300000,
    });

    // 4. 发出任务开始事件
    this.eventBus.emit({
      type: 'task.started',
      taskId,
      employeeId: agentConfig.employeeId,
      source: inputEvent.source,
      chatId: inputEvent.chatId,
      userId: inputEvent.userId,
      timestamp: Date.now(),
    } as any);

    // 5. 执行任务
    const result = await executor.execute(taskDescription);

    // 6. 更新 Agent 统计
    agentManager.recordUsage(
      savedAgent.id,
      result.success,
      result.success ? 8 : 0
    );

    // 7. 发出完成事件
    this.eventBus.emit({
      type: 'task.completed',
      taskId,
      employeeId: agentConfig.employeeId,
      source: inputEvent.source,
      chatId: inputEvent.chatId,
      userId: inputEvent.userId,
      result: {
        success: result.success,
        output: result.output,
        artifacts: result.artifacts,
      },
      taskDescription: taskDescription.substring(0, 100),
      duration: result.usage ? (result.usage.inputTokens + result.usage.outputTokens) : 0,
      timestamp: Date.now(),
    } as any);

  } catch (error: any) {
    // ... 错误处理 ...
  }
}
```

### Phase 2: 完善 Employee Agent Seeds (1天)

**目标**：补充更多专业角色的 Agent Prompt

#### 新增 Agent Seeds
```sql
-- 003_agent_prompts_enhanced.sql

-- 小说作家
INSERT INTO employee_agents (employee_id, task_type, task_subtype, agent_name, prompt_content) VALUES
(
  (SELECT id FROM employees WHERE role = 'novelist' LIMIT 1),
  'creative_writing',
  'novel',
  '小说作家',
  E'# 小说作家

你是专业小说作家，擅长：
- 长篇小说连载创作
- 人物塑造和情节设计
- 不同题材写作（玄幻、都市、科幻...）
- 章节规划和节奏控制

## 工作方式
1. 理解创作需求（题材、风格、章节）
2. 使用 Write 工具创建文件
3. 使用 Read 工具读取已写内容保持连贯
4. 使用 Edit 工具修改完善
5. 完成交付
'
);

-- 文案专家
INSERT INTO employee_agents (employee_id, task_type, task_subtype, agent_name, prompt_content) VALUES
(
  (SELECT id FROM employees WHERE role = 'copywriter' LIMIT 1),
  'content_creation',
  'copywriting',
  '文案专家',
  E'# 文案专家

你是专业文案创作专家，擅长：
- 广告文案写作
- 营销文案策划
- 品牌故事讲述
- 社交媒体短内容

## 工作方式
1. 分析产品/品牌特点
2. 确定目标受众和场景
3. 使用 Write 工具创建文案
4. 根据反馈修改优化
'
);

-- 小红书运营专家
INSERT INTO employee_agents (employee_id, task_type, task_subtype, agent_name, prompt_content) VALUES
(
  (SELECT id FROM employees WHERE role = 'xiaohongshu_operator' LIMIT 1),
  'social_media',
  'xiaohongshu',
  '小红书运营专家',
  E'# 小红书运营专家

你是小红书运营专家，擅长：
- 种草文案创作
- 笔记内容策划
- 话题标签优化
- 用户互动策略

## 工作方式
1. 分析产品特点和用户画像
2. 创作吸引人的笔记内容
3. 优化标题和封面描述
4. 使用合适的表情包和标签
'
);
```

### Phase 3: 支持多 Agent 协作 (2-3天)

**目标**：复杂任务可以分解给多个 Agent 协作完成

#### 设计思路
```
复杂任务 → CEO 分解为子任务
  → 子任务1: Agent A (前端开发)
  → 子任务2: Agent B (后端开发)
  → 子任务3: Agent C (文档编写)
  → 整合结果
```

#### 实现方式
```typescript
// CEO 增强的决策能力
interface CEODecision {
  strategy: 'collaborative' | 'single_agent';
  subtasks?: Array<{
    id: string;
    description: string;
    agentType: string;
    dependencies: string[];
  }>;
  integrationPlan?: string;  // 如何整合子任务结果
}

// CoreProcess 协作执行
if (agentDecision.strategy === 'collaborative') {
  await this.executeCollaborativeTask(
    taskDescription,
    agentDecision.subtasks!,
    agentDecision.integrationPlan!,
    inputEvent
  );
}
```

### Phase 4: 完善 Employee 管理 (1-2天)

#### 4.1 添加动态 Employee 命令
```bash
# 添加新的 Employee Agent
ai-company employee add \
  --name "Python 专家" \
  --role "python_developer" \
  --capabilities "python,coding,analysis" \
  --agent-file ~/.claude/agents/python-expert.md

# 列出 Employees
ai-company employees

# 查看 Employee 绩效
ai-company employee performance <employee-id>
```

#### 4.2 Employee 绩效追踪
```sql
-- 已有字段
success_count, fail_count, success_rate, usage_count

-- 需要添加
ALTER TABLE employee_agents ADD COLUMN last_success_at INTEGER;
ALTER TABLE employee_agents ADD COLUMN avg_score REAL;
ALTER TABLE employee_agents ADD COLUMN total_earnings INTEGER DEFAULT 0;
```

---

## 四、验证方案

### 4.1 单元测试
```bash
# 测试 API 模式执行
npm run test:api-agent

# 测试工具系统
npm run test:tools
```

### 4.2 集成测试
```bash
# 测试查询类任务
ai-company run "状态"

# 测试执行类任务
ai-company run "帮我创建一个 Python 脚本，打印 Hello World"

# 测试 Telegram 集成
# (发送消息到 Telegram Bot)
```

### 4.3 流程验证清单
- [ ] CLI 输入 → CEO 分析 → 查询处理 → 返回结果
- [ ] CLI 输入 → CEO 分析 → 执行处理 → APIAgent 执行 → 返回结果
- [ ] Telegram 输入 → CEO 分析 → 查询处理 → Telegram 回复
- [ ] Telegram 输入 → CEO 分析 → 执行处理 → APIAgent 执行 → Telegram 回复
- [ ] Agent 能使用基础工具 (Read, Write, Bash...)
- [ ] Agent 记忆持久化正常

---

## 五、时间估算

| 阶段 | 工作内容 | 预估时间 |
|------|---------|---------|
| Phase 1 | 修复执行流程 | 1-2 天 |
| Phase 2 | 补充 Agent Seeds | 1 天 |
| Phase 3 | 多 Agent 协作 | 2-3 天 |
| Phase 4 | Employee 管理 | 1-2 天 |
| **总计** | | **5-8 天** |

---

## 六、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| API 调用成本过高 | 经济成本 | 实现调用缓存，优化 prompt |
| Agent 执行超时 | 用户体验 | 设置合理超时，增加进度提示 |
| Agent 生成质量不稳定 | 输出质量 | 收集反馈，优化 prompt |
| 并发任务冲突 | 系统稳定性 | 任务队列，资源隔离 |

---

## 七、成功标准

### 7.1 功能完整性
- ✅ 查询类任务正常返回
- ✅ 执行类任务能完成
- ✅ Agent 能使用工具
- ✅ Telegram 集成正常

### 7.2 用户体验
- ✅ 响应时间 < 30秒（简单查询）
- ✅ 执行时间 < 5分钟（复杂任务）
- ✅ 错误处理友好
- ✅ 进度反馈及时

### 7.3 技术指标
- ✅ CPU 使用率 < 80%
- ✅ 内存使用 < 2GB
- ✅ 任务成功率 > 90%
- ✅ API 调用成功率 > 95%

---

## 八、后续优化方向

### 8.1 短期（1-2周后）
- [ ] 添加任务队列支持并发
- [ ] 实现任务优先级调度
- [ ] 添加任务暂停/恢复功能
- [ ] 优化 Agent Prompt 基于反馈

### 8.2 中期（1个月后）
- [ ] 社交媒体集成（Twitter API）
- [ ] 内容发布管道
- [ ] 数据分析 Dashboard
- [ ] 任务复盘和学习系统

### 8.3 长期（3个月后）
- [ ] 多模态能力（图片、文件）
- [ ] 代码执行沙箱（Docker）
- [ ] 自动化测试和部署
- [ ] Agent 自我进化机制

---

## 九、总结

**核心问题**：执行器用错了（TaskSessionManager → APIAgentExecutor）

**解决方案**：修改 CoreProcess.ts 中的 executeWithExistingAgent 和 executeWithNewAgent 方法

**实施顺序**：
1. 修复执行流程（Phase 1）⭐ **最优先**
2. 补充 Agent Seeds（Phase 2）
3. 支持多 Agent 协作（Phase 3）
4. 完善 Employee 管理（Phase 4）

**预期效果**：
- 系统能正常处理查询和执行任务
- Agent 能用基础工具完成实际工作
- 为后续扩展打下基础
