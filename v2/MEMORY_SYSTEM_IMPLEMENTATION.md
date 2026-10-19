# 记忆系统实现总结

## 核心问题

**用户质疑**: "你添加了记忆怎么使用的？要知道我给 CEO 发消息，判断我的意图是什么要结合上下文，你要怎么提取记忆？"

**解决方案**: 记忆不是存储完事，而是在**用户发送消息的瞬间**，CEO 主动检索记忆，获取上下文，再做意图分析。

---

## 完整流程

```
┌─────────────────────────────────────────────────────────────────┐
│  用户发消息："帮我优化一下代码"                                    │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  CEO.analyzeAndAssign()                                         │
│                                                                  │
│  1. 调用 buildContextFromMemory()                                │
│     ├─ 检索 episodic memory（相似历史任务）                       │
│     ├─ 检索 semantic memory（相关模式/规则）                      │
│     └─ 结合 chat history                                         │
│                                                                  │
│  2. 使用 enriched context 进行意图分析                            │
│  3. 决定 CXO 分配                                                  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  执行任务 → TaskReviewer → 存储记忆                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 关键文件

### 1. schema.sql - 记忆表结构

```sql
-- L2: Episodic Memory - 完整任务记录与反思
CREATE TABLE episodic_memories (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  task_type TEXT NOT NULL,           -- 'query' | 'task' | 'goal' | 'script'
  task_description TEXT NOT NULL,
  user_input TEXT NOT NULL,
  status TEXT NOT NULL,              -- 'success' | 'failure' | 'partial'
  reflection_json TEXT,              -- JSON - 反思结果
  created_at INTEGER NOT NULL
);

-- L3: Semantic Memory - 模式/规则/技能
CREATE TABLE semantic_memories (
  id TEXT PRIMARY KEY,
  memory_type TEXT NOT NULL,         -- 'pattern' | 'rule' | 'skill' | 'concept'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags TEXT,                         -- JSON array
  confidence REAL DEFAULT 1.0,
  usage_count INTEGER DEFAULT 0
);

-- L4: Procedural Memory - Agent Prompt 进化
CREATE TABLE procedural_memories (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  version INTEGER NOT NULL,
  system_prompt TEXT NOT NULL
);
```

### 2. src/core/memory/MemoryStore.ts - 记忆存储和检索

**核心方法**:

```typescript
export class MemoryStore {
  // 存储情景记忆
  async storeEpisodicMemory(memory): Promise<string>

  // 检索相似历史任务（用于 CEO 意图分析）
  findSimilarTasks(taskDescription: string, limit = 5): EpisodicMemory[]

  // 检索相关语义记忆（用于指导决策）
  findRelevantMemories(query, limit = 10): SemanticMemory[]

  // 存储语义记忆
  async storeSemanticMemory(memory): Promise<string>

  // 获取 Agent 活跃 Prompt
  getActivePrompt(employeeId: string, taskType: string): ProceduralMemory | null
}
```

### 3. src/core/cxo/CEO.ts - 记忆集成

**关键增强**:

```typescript
export class CEO implements ICEO {
  private memoryStore = getMemoryStore();

  async analyzeAndAssign(userInput: string, chatHistory?: ChatMessage[]): Promise<CEOAnalysisResult> {
    // 关键：在分析前检索记忆
    const enrichedContext = await this.buildContextFromMemory(userInput, chatHistory);

    // 使用 enriched context（包含记忆）进行意图分析
    const understanding = await this.understandUserNeed(userInput, enrichedContext);

    // 基于历史经验做决策
    const decision = this.makeDecision(understanding, userInput);

    return {...};
  }

  private async buildContextFromMemory(userInput: string, chatHistory?: ChatMessage[]): Promise<ChatMessage[]> {
    const memoryContext: ChatMessage[] = [];

    // 1. 检索相似历史任务
    const similarTasks = this.memoryStore.findSimilarTasks(userInput, undefined, 3);
    for (const task of similarTasks) {
      memoryContext.push({
        role: 'system',
        content: `历史参考：${task.taskDescription} → ${task.status}。${task.reflection?.learnings?.[0]}`
      });
    }

    // 2. 检索相关模式
    const keywords = this.extractKeywords(userInput);
    const patterns = this.memoryStore.findRelevantMemories({ tags: keywords, minConfidence: 0.6 });
    if (patterns.length > 0) {
      memoryContext.push({
        role: 'system',
        content: `可用模式：${patterns.map(p => p.description).join('; ')}`
      });
    }

    // 3. 结合聊天历史
    return [...memoryContext, ...(chatHistory || [])];
  }
}
```

### 4. src/core/events/TaskReviewer.ts - 自动记忆存储

**关键增强**:

```typescript
export class TaskReviewer {
  private memoryStore = getMemoryStore();

  private async conductReview(taskId, employeeId, taskDescription, result, review): Promise<void> {
    // CEO 复盘
    const review = await this.ceo.reviewTask(...);

    // 存储记忆（新增）
    await this.storeMemory(taskId, employeeId, taskDescription, result, review);

    // 更新绩效
    if (review.shouldUpdatePerformance) { ... }
  }

  private async storeMemory(...): Promise<void> {
    // 1. 存储情景记忆
    const episodicId = await this.memoryStore.storeEpisodicMemory({
      taskId,
      taskType: this.determineTaskType(taskDescription),
      taskDescription,
      status: result.success ? 'success' : 'failure',
      reflection: {
        successFactors: review.strengths,
        failureFactors: review.improvements,
        learnings: [...review.strengths, ...review.improvements],
      },
    });

    // 2. 提取并存储语义记忆
    await this.extractAndStoreSemanticMemory(episodicId, taskDescription, review);
  }

  private async extractAndStoreSemanticMemory(episodicId, taskDescription, review): Promise<void> {
    // 使用 LLM 从复盘中提取通用模式
    const prompt = `从以下任务复盘中提取可复用的模式/规则...`;
    const response = await this.provider.messages([{ role: 'user', content: prompt }], ...);
    const patterns = JSON.parse(response.content);

    for (const pattern of patterns.patterns) {
      await this.memoryStore.storeSemanticMemory({
        memoryType: pattern.type,
        title: pattern.title,
        description: pattern.description,
        derivedFrom: episodicId,
        tags: pattern.tags,
        confidence: 0.8,
      });
    }
  }
}
```

### 5. src/core/events/CoreProcess.ts - 启动 TaskReviewer

```typescript
export class CoreProcess {
  private taskReviewer = getTaskReviewer();

  start(): void {
    // 启动任务复盘器（关键：启动记忆系统）
    this.taskReviewer.start();

    // ...其他初始化
  }
}
```

---

## 使用示例

### 场景：用户发送"帮我优化一下代码"

#### 第一步：CEO 检索记忆

```typescript
// CEO.analyzeAndAssign() 内部
const enrichedContext = await this.buildContextFromMemory("帮我优化一下代码", chatHistory);

// 检索结果：
// 1. Episodic: "重构用户认证模块，优化性能" → 成功，经验：优化前先备份原文件
// 2. Episodic: "优化数据库查询速度" → 成功，经验：添加索引前先分析慢查询
// 3. Semantic: "代码优化最佳实践" → 优化前先写测试，确保功能不变
```

#### 第二步：构建 enriched context

```typescript
const enrichedContext = [
  {
    role: 'system',
    content: '历史参考 成功："重构用户认证模块，优化性能" → 经验：优化前先备份原文件'
  },
  {
    role: 'system',
    content: '历史参考 成功："优化数据库查询速度" → 经验：添加索引前先分析慢查询'
  },
  {
    role: 'system',
    content: '可用模式：代码优化最佳实践：优化前先写测试，确保功能不变'
  },
  // 原始聊天历史
  ...chatHistory
];
```

#### 第三步：基于 enriched context 进行意图分析

```typescript
const understanding = await this.understandUserNeed("帮我优化一下代码", enrichedContext);
// LLM 会考虑历史经验，做出更好的决策
```

#### 第四步：决策和路由

```typescript
const decision = this.makeDecision(understanding, "帮我优化一下代码");
// 返回：
{
  intentType: 'task',
  assignedCXO: 'CTO',
  reason: '技术类任务由 CTO 负责（基于历史成功经验）',
  nextSteps: ['CTO 分析任务', '选择或创建员工', '执行任务']
}
```

---

## 记忆系统的价值

### 没有记忆系统
```
用户："帮我优化一下代码"
CEO: "好的，这是代码优化任务，分配给 CTO"
（每次都从零开始，不知道之前的经验）
```

### 有记忆系统
```
用户："帮我优化一下代码"
CEO:
  1. 检索记忆 → "用户上次优化代码时，性能提升了 40%"
  2. 检索模式 → "优化前先写测试，确保功能不变"
  3. 结合上下文 → "用户喜欢渐进式优化，先做性能分析"
  4. 决策 → "分配给 CTO，建议使用上次的成功方法"
```

---

## 下一步优化

1. [ ] **Embedding 相似度搜索**: 当前是关键词匹配，升级为向量相似度搜索
2. [ ] **记忆检索 CLI**: `ai-company memory:search "代码优化"`
3. [ ] **记忆可视化**: 查看记忆网络和关联
4. [ ] **记忆衰减**: 长期不用的记忆降低置信度
5. [ ] **记忆合并**: 相似记忆合并为更通用的模式

---

## 参考文件

- `schema.sql` - 记忆表结构
- `src/core/memory/MemoryStore.ts` - 记忆存储和检索
- `src/core/cxo/CEO.ts` - CEO 记忆集成
- `src/core/events/TaskReviewer.ts` - 自动记忆存储
- `src/core/events/CoreProcess.ts` - 启动记忆系统
- `MEMORY_USAGE_GUIDE.md` - 记忆系统使用指南
