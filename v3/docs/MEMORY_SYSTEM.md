# AI Company v3 - Memory System

## 概述

简化的记忆系统，使用 SQLite 持久化，支持三种记忆类型：

| 类型 | 用途 | 存储 |
|------|------|------|
| **情景记忆** (Episodic) | 任务执行历史、经验 | SQLite |
| **语义记忆** (Semantic) | 通用知识、最佳实践 | SQLite |
| **工作记忆** (Working) | 临时上下文 | 内存 |

## 核心 API

### 情景记忆（Episodic Memory）

```typescript
const memory = getMemorySystem();

// 添加情景记忆
const id = await memory.addEpisodic({
  taskId: 'task_123',
  taskDescription: '创建 README 文件',
  employeeId: 'emp_456',
  outcome: 'success',
  input: '创建项目文档',
  output: 'README.md 已创建',
  learnings: ['使用 markdown 格式', '包含项目概述'],
  improvements: ['可以添加更多示例'],
});

// 获取情景记忆
const ep = await memory.getEpisodic(id);

// 检索相关记忆
const results = await memory.retrieveEpisodic({
  query: '创建文档',
  limit: 5
});

// 按员工获取
const history = await memory.getEpisodicByEmployee('emp_456', 10);
```

### 语义记忆（Semantic Memory）

```typescript
// 添加语义记忆
const id = await memory.addSemantic({
  title: 'README 最佳实践',
  description: 'README 应包含项目概述、安装步骤、使用示例',
  category: 'best_practice',
  tags: ['documentation', 'markdown'],
  confidence: 0.9,
  source: 'extracted',
});

// 检索语义记忆
const results = await memory.retrieveSemantic({
  query: '文档编写',
  categories: ['best_practice'],
  limit: 5
});

// 更新置信度
await memory.updateSemanticConfidence(id, 0.1);

// 增加使用次数
await memory.incrementUsage(id);
```

### 工作记忆（Working Memory）

```typescript
// 设置工作记忆（TTL 默认 1 小时）
memory.setWorking('task_123', {
  currentStep: 3,
  context: { fileName: 'README.md' }
}, 3600000);

// 获取工作记忆
const ctx = memory.getWorking('task_123');

// 清除
memory.clearWorking('task_123');
```

### 记忆提取

从情景记忆中提取通用知识：

```typescript
// 从一次成功执行中提取经验
const ids = await memory.extractSemanticFromEpisodic(episodicId);
// 自动创建：
// - best_practice 类别的经验
// - warning 类别的改进建议
```

### 统计

```typescript
const stats = memory.getStats();
// {
//   episodic: { total: 100, byOutcome: {...}, today: 15 },
//   semantic: { total: 50, byCategory: {...} },
//   working: { active: 5 }
// }
```

## 使用场景

### 1. CEO 复盘时存储经验

```typescript
// 任务完成后
await memory.addEpisodic({
  taskId: task.id,
  taskDescription: task.description,
  employeeId: task.employeeId,
  outcome: review.outcome,
  output: task.output,
  learnings: review.learnings,
  improvements: review.improvements,
});

// 提取通用知识
await memory.extractSemanticFromEpisodic(memoryId);
```

### 2. 员工执行前检索经验

```typescript
// 查找类似任务的成功经验
const relevant = await memory.retrieveEpisodic({
  query: task.description,
  limit: 5
});

// 查找相关知识
const knowledge = await memory.retrieveSemantic({
  query: task.requiredSkills?.[0],
  categories: ['skill', 'tool'],
  limit: 3
});

// 提供给 LLM 作为上下文
const context = `
相关经验:
${relevant.memories.map(m => `- ${m.taskDescription}: ${m.learnings.join(', ')}`).join('\n')}

相关知识:
${knowledge.memories.map(k => `- ${k.title}: ${k.description}`).join('\n')}
`;
```

## 数据库表

### episodic_memories
```sql
CREATE TABLE episodic_memories (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_description TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  outcome TEXT NOT NULL,  -- success/failure/partial
  input TEXT, output TEXT, error TEXT,
  duration INTEGER,
  tools_used TEXT,
  learnings TEXT,         -- JSON array
  improvements TEXT,      -- JSON array
  metadata TEXT,
  created_at INTEGER NOT NULL
);
```

### semantic_memories
```sql
CREATE TABLE semantic_memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT,
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  source_memory_id TEXT,
  related_knowledge_ids TEXT,
  usage_count INTEGER DEFAULT 0,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

## 与 mem0 对比

| 特性 | 本实现 | mem0ai |
|------|--------|--------|
| 依赖 | 无（SQLite 内置） | Python + 外部服务 |
| 嵌入 | 简单文本匹配 | 向量嵌入 |
| 检索 | TF-IDF 简化版 | 语义相似度 |
| 持久化 | SQLite | 可配置（SQLite/Redis/PG） |
| 复杂度 | ~400 行 | 完整库 |

**选择理由**：
- ✅ 零额外依赖
- ✅ TypeScript 原生
- ✅ 足够用于简单场景
- ✅ 可后续升级到向量数据库

## 下一步优化

如需更强大的记忆能力：
1. 集成 `pgvector`（PostgreSQL 向量插件）
2. 使用 `sentence-transformers` 生成嵌入
3. 或采用 mem0 的云服务

## 文件结构

```
src/core/memory/
├── types.ts           # 类型定义
├── MemorySystem.ts    # 实现
└── index.ts           # 导出
```
