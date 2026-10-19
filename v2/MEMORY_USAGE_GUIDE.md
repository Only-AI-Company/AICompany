# 记忆系统使用指南

## 核心问题

**用户**: "你添加了记忆怎么使用的？要知道我给 CEO 发消息，判断我的意图是什么要结合上下文，你要怎么提取记忆？"

**答案**: 记忆不是存储完事，而是在**用户发送消息的瞬间**，CEO 需要主动检索记忆，获取上下文，再做意图分析。

---

## 完整流程

```
用户发消息 → CEO 检索记忆 → 构建 enriched context → 意图分析 → CXO 路由
            ↓
      1. 找相似历史任务
      2. 找相关模式/规则
      3. 结合聊天历史
```

---

## 具体示例

### 场景 1：用户发送"帮我优化一下代码"

#### 第一步：CEO 检索 episodic memory（历史任务）

```typescript
const similarTasks = memoryStore.findSimilarTasks("帮我优化一下代码", undefined, 3);

// 检索结果示例：
[
  {
    taskDescription: "重构用户认证模块，优化性能",
    status: "success",
    output: "已完成重构，性能提升 40%",
    reflection: {
      learnings: ["优化前先备份原文件", "性能测试很重要"]
    }
  },
  {
    taskDescription: "优化数据库查询速度",
    status: "success",
    output: "添加索引，查询时间从 500ms 降到 50ms",
    reflection: {
      learnings: ["添加索引前先分析慢查询"]
    }
  }
]
```

#### 第二步：CEO 检索 semantic memory（模式/规则）

```typescript
const patterns = memoryStore.findRelevantMemories({
  tags: ['代码', '优化'],
  minConfidence: 0.6
}, 5);

// 检索结果示例：
[
  {
    title: "代码优化最佳实践",
    description: "优化前先写测试，确保功能不变",
    content: "1. 写单元测试 2. 性能基准测试 3. 渐进式优化",
    confidence: 0.9
  },
  {
    title: "代码审查规则",
    description: "优化代码时注意不要过度设计",
    content: "保持简单，只优化瓶颈",
    confidence: 0.8
  }
]
```

#### 第三步：构建 enriched context

```typescript
const enrichedContext: ChatMessage[] = [
  // 来自 episodic memory
  {
    role: 'system',
    content: '历史任务参考 ✅ 成功："重构用户认证模块，优化性能" → 已完成重构，性能提升 40%。经验：优化前先备份原文件'
  },
  {
    role: 'system',
    content: '历史任务参考 ✅ 成功："优化数据库查询速度" → 添加索引，查询时间从 500ms 降到 50ms。经验：添加索引前先分析慢查询'
  },
  // 来自 semantic memory
  {
    role: 'system',
    content: `可用模式/规则:
- 代码优化最佳实践：优化前先写测试，确保功能不变
- 代码审查规则：优化代码时注意不要过度设计`
  },
  // 原始聊天历史（如果有）
  ...chatHistory
];
```

#### 第四步：CEO 使用 enriched context 进行意图分析

```typescript
// CEO.analyzeAndAssign() 内部
async analyzeAndAssign(userInput: string, chatHistory?: ChatMessage[]): Promise<CEOAnalysisResult> {
  // 1. 检索记忆，构建 enriched context
  const enrichedContext = await buildContextFromMemory(userInput, chatHistory);

  // 2. 使用 enriched context（不是原始 chatHistory）
  const understanding = await this.understandUserNeed(userInput, enrichedContext);

  // 3. 基于历史经验做决策
  const decision = this.makeDecision(understanding, userInput);

  return {
    intentType: 'task',
    assignedCXO: 'CTO', // 代码优化 → 技术任务
    reasoning: '结合历史成功模式，代码优化由 CTO 处理效果最佳',
    // ...
  };
}
```

---

## 记忆检索的核心代码

### MemoryStore.ts - 提供检索方法

```typescript
export class MemoryStore {
  /**
   * 检索相似历史任务（用于上下文）
   */
  findSimilarTasks(taskDescription: string, taskType?: string, limit = 5): EpisodicMemory[] {
    // 简单实现：关键词匹配
    // 高级实现：Embedding 相似度搜索
    const keywords = taskDescription.split(' ').filter(w => w.length > 1);

    const query = `
      SELECT * FROM episodic_memories
      WHERE status = 'success'
      ORDER BY created_at DESC
      LIMIT ?
    `;

    return this.db.prepare(query).all(limit).map(row => this.mapToEpisodicMemory(row));
  }

  /**
   * 检索相关模式/规则（用于指导决策）
   */
  findRelevantMemories(query: {
    memoryType?: string;
    tags?: string[];
    taskType?: string;
    minConfidence?: number;
  }, limit = 10): SemanticMemory[] {
    let sql = 'SELECT * FROM semantic_memories WHERE 1=1';
    const params: any[] = [];

    if (query.memoryType) {
      sql += ' AND memory_type = ?';
      params.push(query.memoryType);
    }

    if (query.minConfidence) {
      sql += ' AND confidence >= ?';
      params.push(query.minConfidence);
    }

    sql += ' ORDER BY confidence DESC, usage_count DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(sql).all(...params).map(row => this.mapToSemanticMemory(row));
  }
}
```

### CEO.ts - 在意图分析时使用记忆

```typescript
export class CEO implements ICEO {
  private memoryStore = getMemoryStore();

  async analyzeAndAssign(userInput: string, chatHistory?: ChatMessage[]): Promise<CEOAnalysisResult> {
    // 关键：在分析前检索记忆
    const enrichedContext = await this.buildContextFromMemory(userInput, chatHistory);

    // 使用 enriched context 进行意图分析
    const understanding = await this.understandUserNeed(userInput, enrichedContext);

    // 基于历史经验做决策
    const decision = this.makeDecision(understanding, userInput);

    return {
      intentType: decision.intentType,
      assignedCXO: decision.assignedCXO,
      assignmentReason: decision.reason + '（基于历史成功经验）',
      // ...
    };
  }

  private async buildContextFromMemory(
    userInput: string,
    chatHistory?: ChatMessage[]
  ): Promise<ChatMessage[]> {
    const memoryContext: ChatMessage[] = [];

    // 1. 检索相似历史任务
    const similarTasks = this.memoryStore.findSimilarTasks(userInput, undefined, 3);
    for (const task of similarTasks) {
      const statusText = task.status === 'success' ? '✅ 成功' : '❌ 失败';
      const learning = task.reflection?.learnings?.[0] || '';

      memoryContext.push({
        role: 'system',
        content: `历史参考 ${statusText}: "${task.taskDescription}" → ${learning}`
      });
    }

    // 2. 检索相关模式
    const keywords = this.extractKeywords(userInput);
    const patterns = this.memoryStore.findRelevantMemories({
      tags: keywords,
      minConfidence: 0.6
    }, 5);

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

## 记忆检索的时机

| 时机 | 检索内容 | 用途 |
|------|----------|------|
| CEO 分析意图前 | episodic + semantic | 理解用户真实需求，结合历史上下文 |
| Agent 执行任务中 | semantic | 参考最佳实践，避免重复错误 |
| TaskReviewer 复盘 | episodic | 提取经验，更新语义记忆 |

---

## 下一步实现

1. [ ] 在 CEO.ts 中集成 `buildContextFromMemory()` 方法
2. [ ] 实现 Embedding 相似度搜索（当前是关键词匹配）
3. [ ] 添加记忆检索 CLI 命令：`ai-company memory:search "代码优化"`
4. [ ] 测试完整流程：用户消息 → 记忆检索 → 意图分析 → 任务执行

---

## 参考文件

- `src/core/memory/MemoryStore.ts` - 记忆存储和检索
- `src/core/cxo/CEO_with_memory.ts` - CEO 记忆集成示例代码
- `schema.sql` - 记忆表结构（episodic_memories, semantic_memories, procedural_memories）
