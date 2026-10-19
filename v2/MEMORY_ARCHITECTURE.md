# 记忆系统架构文档

## 问题陈述

**原始问题**: "你添加了记忆怎么使用的？要知道我给 CEO 发消息，判断我的意图是什么要结合上下文，你要怎么提取记忆？"

**核心洞察**: 记忆系统不是存储完事，而是在用户发送消息的**瞬间主动检索**，获取上下文后再做意图分析。

---

## 四层记忆架构

```
┌─────────────────────────────────────────────────────────────────┐
│  L1: Working Memory (短期工作记忆)                               │
│  - 任务上下文，临时数据                                          │
│  - 不持久化，会话结束即消失                                       │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  L2: Episodic Memory (情景记忆) ← 核心                           │
│  - 完整任务历史：任务描述、用户输入、执行结果、反思              │
│  - 用途：检索相似历史任务，提供参考                              │
│  - 表：episodic_memories                                         │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  L3: Semantic Memory (语义记忆) ← 核心                           │
│  - 模式/规则/技能：从复盘中提取的通用知识                        │
│  - 用途：指导决策，提供最佳实践                                  │
│  - 表：semantic_memories                                         │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  L4: Procedural Memory (程序记忆)                                │
│  - Agent Prompt 版本：进化的执行策略                             │
│  - 用途：Agent 能力进化，Prompt 优化                                │
│  - 表：procedural_memories                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 核心流程

### 1. 记忆检索（用户发送消息时）

```
用户："帮我优化一下代码"
  │
  ▼
CEO.analyzeAndAssign()
  │
  ├─ buildContextFromMemory()
  │   ├─ findSimilarTasks("优化代码", limit=3)
  │   │   └─ 检索 episodic_memories
  │   │      → "重构用户认证模块，优化性能" ✅ 成功
  │   │      → "优化数据库查询速度" ✅ 成功
  │   │
  │   ├─ findRelevantMemories(tags=["代码", "优化"], minConfidence=0.6)
  │   │   └─ 检索 semantic_memories
  │   │      → "代码优化最佳实践：优化前先写测试"
  │   │      → "代码审查规则：不要过度设计"
  │   │
  │   └─ 构建 enriched context:
  │       [
  │         {role: 'system', content: '历史参考：...'},
  │         {role: 'system', content: '可用模式：...'},
  │         ...chatHistory
  │       ]
  │
  ├─ understandUserNeed("优化代码", enrichedContext)
  │   └─ LLM 分析（带历史上下文）
  │
  └─ makeDecision(understanding)
      └─ 返回：{intentType: 'task', assignedCXO: 'CTO', ...}
```

### 2. 记忆存储（任务完成后）

```
task.completed 事件
  │
  ▼
TaskReviewer.handleTaskCompleted()
  │
  ├─ ceo.reviewTask()  ← CEO 复盘
  │   └─ 返回：{score, strengths, improvements, ...}
  │
  ├─ storeMemory()
  │   ├─ storeEpisodicMemory()
  │   │   └─ 存储完整任务记录到 episodic_memories
  │   │
  │   └─ extractAndStoreSemanticMemory()
  │       ├─ LLM 提取通用模式
  │       └─ storeSemanticMemory()
  │           └─ 存储模式到 semantic_memories
  │
  └─ updateEmployeePerformance()
      └─ 更新员工绩效
```

---

## 数据库设计

### Episodic Memory 表

```sql
CREATE TABLE episodic_memories (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_type TEXT NOT NULL,           -- 'query' | 'task' | 'goal' | 'script'
  task_description TEXT NOT NULL,    -- 任务描述（用于检索）
  user_input TEXT NOT NULL,          -- 用户原始输入
  assigned_cxo TEXT,                 -- 分配的 CXO
  agent_id TEXT,                     -- 执行的 Agent
  tools_used TEXT,                   -- JSON array
  status TEXT NOT NULL,              -- 'success' | 'failure' | 'partial'
  output TEXT,                       -- 执行结果
  artifacts TEXT,                    -- JSON - 产物
  reflection_json TEXT,              -- JSON - 反思结果
  created_at INTEGER NOT NULL
);

-- 索引：支持快速检索
CREATE INDEX idx_episodic_status ON episodic_memories(status);
CREATE INDEX idx_episodic_created ON episodic_memories(created_at);
CREATE INDEX idx_episodic_search ON episodic_memories(task_description);
```

### Semantic Memory 表

```sql
CREATE TABLE semantic_memories (
  id TEXT PRIMARY KEY,
  memory_type TEXT NOT NULL,         -- 'pattern' | 'rule' | 'skill' | 'concept'
  title TEXT NOT NULL,               -- 规则标题
  description TEXT NOT NULL,         -- 规则描述
  content_json TEXT NOT NULL,        -- JSON - 详细内容
  derived_from TEXT,                 -- 来源 episodic_memory_id
  tags TEXT,                         -- JSON array
  confidence REAL DEFAULT 1.0,       -- 置信度 (0-1)
  usage_count INTEGER DEFAULT 0,     -- 使用次数
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 索引：支持按置信度和使用次数排序
CREATE INDEX idx_semantic_confidence ON semantic_memories(confidence);
CREATE INDEX idx_semantic_usage ON semantic_memories(usage_count);
```

### Procedural Memory 表

```sql
CREATE TABLE procedural_memories (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  version INTEGER NOT NULL,
  is_active INTEGER DEFAULT 0,       -- 1 = 当前活跃版本
  system_prompt TEXT NOT NULL,
  few_shot_examples TEXT,            -- JSON array
  change_summary TEXT,
  performance_delta REAL,            -- 性能变化
  created_at INTEGER NOT NULL
);

-- 索引：支持快速获取活跃版本
CREATE INDEX idx_procedural_active ON procedural_memories(is_active);
```

---

## 关键代码

### MemoryStore - 记忆存储和检索

```typescript
export class MemoryStore {
  /**
   * 检索相似历史任务（用于 CEO 意图分析）
   */
  findSimilarTasks(taskDescription: string, taskType?: string, limit = 5): EpisodicMemory[] {
    // 简单实现：关键词匹配
    const keywords = taskDescription.split(/[\s,，]+/).filter(w => w.length > 1);
    const conditions = keywords.map(() => 'task_description LIKE ?').join(' OR ');
    const params = keywords.map(k => `%${k}%`);

    const sql = `
      SELECT * FROM episodic_memories
      WHERE status = 'success' AND (${conditions})
      ORDER BY created_at DESC
      LIMIT ?
    `;

    return this.db.prepare(sql).all(...params, limit).map(row => this.mapToEpisodicMemory(row));
  }

  /**
   * 检索相关语义记忆（用于指导决策）
   */
  findRelevantMemories(query: {
    memoryType?: string;
    tags?: string[];
    minConfidence?: number;
  }, limit = 10): SemanticMemory[] {
    // 按置信度和使用次数排序，优先返回高质量记忆
    const sql = `
      SELECT * FROM semantic_memories
      WHERE 1=1
      AND confidence >= ?
      ORDER BY confidence DESC, usage_count DESC
      LIMIT ?
    `;

    return this.db.prepare(sql).all(query.minConfidence || 0, limit)
      .map(row => this.mapToSemanticMemory(row));
  }
}
```

### CEO - 记忆集成

```typescript
export class CEO implements ICEO {
  private memoryStore = getMemoryStore();

  async analyzeAndAssign(userInput: string, chatHistory?: ChatMessage[]): Promise<CEOAnalysisResult> {
    // 关键：在分析前检索记忆
    const enrichedContext = await this.buildContextFromMemory(userInput, chatHistory);

    // 使用 enriched context（不是原始 chatHistory）
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

### TaskReviewer - 自动记忆存储

```typescript
export class TaskReviewer {
  private memoryStore = getMemoryStore();

  private async storeMemory(
    taskId: string,
    employeeId: string,
    taskDescription: string,
    result: any,
    review: any
  ): Promise<void> {
    // 1. 存储情景记忆
    const episodicId = await this.memoryStore.storeEpisodicMemory({
      taskId,
      taskType: this.determineTaskType(taskDescription),
      taskDescription,
      status: result.success ? 'success' : 'failure',
      output: result.output,
      reflection: {
        successFactors: review.strengths,
        failureFactors: review.improvements,
        learnings: [...review.strengths, ...review.improvements],
      },
    });

    // 2. 提取并存储语义记忆
    await this.extractAndStoreSemanticMemory(episodicId, taskDescription, review);
  }

  private async extractAndStoreSemanticMemory(
    episodicId: string,
    taskDescription: string,
    review: any
  ): Promise<void> {
    const learnings = [...review.strengths, ...review.improvements].join('\n- ');

    // LLM 提取通用模式
    const prompt = `从以下任务复盘中提取可复用的模式/规则：

任务：${taskDescription}
复盘学习：
- ${learnings}

返回 JSON 格式的模式列表。`;

    const response = await this.provider.messages(
      [{ role: 'user', content: prompt }],
      '你是经验丰富的教练，擅长从案例中提取通用模式。'
    );

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

---

## 记忆检索策略

### 当前实现（关键词匹配）

```typescript
findSimilarTasks(taskDescription: string): EpisodicMemory[] {
  const keywords = taskDescription.split(' ').filter(w => w.length > 1);
  const conditions = keywords.map(() => 'task_description LIKE ?').join(' OR ');
  // SELECT * WHERE status='success' AND (desc LIKE %keyword1% OR desc LIKE %keyword2%)
}
```

### 未来优化（Embedding 相似度）

```typescript
findSimilarTasks(taskDescription: string): EpisodicMemory[] {
  // 1. 计算输入文本的 embedding
  const queryEmbedding = await this.embeddingModel.encode(taskDescription);

  // 2. 计算与历史任务的余弦相似度
  // SELECT *, cosine_similarity(embedding, ?) as similarity
  // FROM episodic_memories
  // WHERE status='success'
  // ORDER BY similarity DESC
  // LIMIT 5
}
```

---

## 记忆更新机制

### 置信度更新

```typescript
recordUsage(memoryId: string, success: boolean): void {
  const delta = success ? 1 : -1;
  this.db.prepare(`
    UPDATE semantic_memories
    SET confidence = MIN(1.0, MAX(0.0, confidence + ? * 0.01)),
        usage_count = usage_count + 1
    WHERE id = ?
  `).run(delta, memoryId);
}
```

### Prompt 版本控制

```typescript
// 当发现新的成功模式时，更新 Agent Prompt
async updateAgentPrompt(
  employeeId: string,
  taskType: string,
  newPattern: string
): Promise<void> {
  const currentPrompt = this.memoryStore.getActivePrompt(employeeId, taskType);

  if (currentPrompt) {
    // 创建新版本，包含新模式
    const newVersion = currentPrompt.version + 1;
    const updatedPrompt = this.integratePattern(currentPrompt.systemPrompt, newPattern);

    await this.memoryStore.storeProceduralMemory({
      employeeId,
      taskType,
      version: newVersion,
      systemPrompt: updatedPrompt,
      changeSummary: '集成新模式：' + newPattern,
    });

    // 激活新版本
    this.memoryStore.activatePrompt(employeeId, taskType, newVersion);
  }
}
```

---

## 总结

### 记忆系统的核心价值

1. **上下文感知**: CEO 不再是"失忆症"患者，每次都能记住历史经验
2. **持续进化**: 从成功中学习模式，从失败中吸取教训
3. **智能决策**: 基于历史数据做决策，而不是每次都从零开始

### 关键设计原则

1. **主动检索**: 在用户发送消息的瞬间主动检索记忆
2. ** enriched context**: 将记忆与聊天历史结合，形成完整上下文
3. **自动存储**: 任务完成后自动存储，不需要手动干预
4. **置信度机制**: 成功的经验提高置信度，失败的降低置信度

### 下一步优化

1. Embedding 相似度搜索（当前是关键词匹配）
2. 记忆衰减机制（长期不用的记忆降低权重）
3. 记忆可视化工具（查看记忆网络）
4. CLI 记忆检索命令（`ai-company memory:search "关键词"`）
