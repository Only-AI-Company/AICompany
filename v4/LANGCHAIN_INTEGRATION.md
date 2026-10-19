# AI Company v4 - LangChain 集成总结

**日期**: 2026-03-13
**状态**: 能力层和记忆系统集成完成

---

## 集成概述

采用 **LangChain 生态** 作为能力层和记忆系统的基础实现：

| 功能 | 开源方案 | 说明 |
|------|---------|------|
| **工具系统** | LangChain Tools | 标准 Tool 接口，支持扩展 |
| **记忆系统** | LangChain Memory + 自定义 | 三层记忆架构 |
| **向量检索** | 内存存储 (简化) | 可升级到 ChromaDB/Pinecone |
| **Embedding** | OpenAI Embeddings | `text-embedding-3-small` |
| **LLM** | @langchain/anthropic | Claude API 集成 |

---

## 已安装依赖

```json
{
  "langchain": "^1.2.32",
  "@langchain/core": "^1.1.32",
  "@langchain/community": "^1.1.23",
  "@langchain/anthropic": "latest",
  "@langchain/openai": "latest",
  "chromadb": "^3.3.3"
}
```

---

## 能力层 (Capability Layer)

### 文件结构

```
src/core/capability/
├── index.ts              # 导出
├── ToolRegistry.ts       # 工具注册中心 (113 行)
└── tools.ts              # 工具实现 (225 行)
```

### 已实现工具

| 工具 | 类别 | 说明 |
|------|------|------|
| `llm_chat` | LLM | 与 Claude 对话 |
| `web_search` | Web | 网络搜索 (框架，需 API Key) |
| `browser` | Browser | Playwright 浏览器自动化 |
| `file` | File | 文件读写/目录列表 |
| `xiaohongshu` | Platform | 小红书发布/数据获取 (框架) |

### 使用示例

```typescript
import { ToolRegistry, LangChainLLMTool, BrowserTool } from './core/capability';

// 创建注册表
const toolRegistry = new ToolRegistry();

// 注册工具
toolRegistry.registerMany([
  {
    name: 'llm_chat',
    description: '与 AI 助手对话',
    category: 'llm',
    instance: new LangChainLLMTool()
  },
  {
    name: 'browser',
    description: '访问网页',
    category: 'browser',
    instance: new BrowserTool()
  }
]);

// 执行工具
const result = await toolRegistry.executeTool('llm_chat', '你好，请介绍一下自己');
```

---

## 记忆系统 (Memory System)

### 文件结构

```
src/core/memory/
├── index.ts              # 导出
└── MemorySystem.ts       # 记忆系统实现 (423 行)
```

### 三层记忆架构

#### 1. 情景记忆 (Episodic Memory)
- **用途**: 存储具体经历和事件
- **实现**: 继承 LangChain `BaseRetriever`
- **功能**:
  - `add()` - 添加记忆
  - `getRecentMemories()` - 获取最近记忆
  - `getImportantMemories()` - 获取重要记忆
  - `forget()` - 遗忘不重要的记忆

#### 2. 语义记忆 (Semantic Memory)
- **用途**: 存储事实性知识
- **实现**: 结构化键值存储
- **功能**:
  - `addFact()` - 添加事实
  - `getFact()` - 获取事实
  - `query()` - 文本匹配查询
  - `getCategories()` - 获取分类列表

#### 3. 程序记忆 (Procedural Memory)
- **用途**: 存储技能和流程
- **实现**: 技能步骤库
- **功能**:
  - `addSkill()` - 添加技能
  - `executeSkill()` - 执行技能
  - `updateMastery()` - 更新熟练度
  - `getAllSkills()` - 获取所有技能

### 使用示例

```typescript
import { MemorySystem } from './core/memory';

const memorySystem = new MemorySystem();
await memorySystem.initialize();

// 添加情景记忆
await memorySystem.add('episodic', '用户请求搜集马斯克最新消息', {
  taskId: 'task-123',
  importance: 0.8
});

// 添加语义记忆
await memorySystem.add('semantic', '马斯克是 Tesla 和 SpaceX 的 CEO', {
  key: 'musk-facts',
  category: 'business'
});

// 添加程序记忆
memorySystem.procedural.addSkill('web-research', [
  { id: 'step-1', description: '打开浏览器' },
  { id: 'step-2', description: '搜索关键词' },
  { id: 'step-3', description: '提取结果' }
], 'research');

// 检索记忆
const results = await memorySystem.query('马斯克', 'episodic');

// 获取记忆摘要
const summary = memorySystem.getSummary();
// { episodic: 1, semantic: 1, procedural: 1 }
```

---

## 主入口集成

```typescript
// src/index.ts
import { ToolRegistry, LangChainLLMTool } from './core/capability';
import { MemorySystem } from './core/memory';

let toolRegistry: ToolRegistry | null = null;
let memorySystem: MemorySystem | null = null;

function initializeToolRegistry(): void {
  toolRegistry = new ToolRegistry();
  toolRegistry.registerMany([
    { name: 'llm_chat', description: '...', category: 'llm', instance: new LangChainLLMTool() },
    // ... 更多工具
  ]);
}

async function initializeMemorySystem(): Promise<void> {
  memorySystem = new MemorySystem();
  await memorySystem.initialize();
}

async function main() {
  // ... 其他初始化
  initializeToolRegistry();
  await initializeMemorySystem();

  logger.info(`Tools: ${toolRegistry?.listTools().length || 0} tools`);
  logger.info(`Memory: ${memorySystem ? 'initialized' : 'disabled'}`);
}
```

---

## Agent 系统

### 文件结构

```
src/core/agent/
├── index.ts              # 导出
├── BaseAgent.ts          # Agent 基类 (237 行)
├── CEOAgent.ts           # CEO Agent (战略层)
├── ManagerAgent.ts       # Manager Agent (战术层，295 行)
└── SpecialistAgents.ts   # 专家 Agent 集合 (414 行)
```

### Agent 层级

| Agent | 层级 | 职责 | 成员 |
|------|------|------|------|
| `CEOAgent` | 战略层 | 决策、任务分配、审批 | - |
| `ManagerAgent` | 战术层 | 任务分解、团队协调、质量监督 | 3 人团队 |
| `ResearcherAgent` | 执行层 | 信息搜索、研究分析 | - |
| `CreatorAgent` | 执行层 | 内容创作、文案撰写 | - |
| `PublisherAgent` | 执行层 | 多平台发布、分发 | - |
| `AnalystAgent` | 执行层 | 数据分析、性能评估 | - |

### Agent 执行流程

```
CEO (接收用户需求)
  ↓
Manager (分解任务、分配团队)
  ↓
Specialists (执行具体任务)
  ↓
Manager (汇总结果、质量检查)
  ↓
CEO (审批、返回结果)
```

### 使用示例

```typescript
import { CEOAgent, ManagerAgent, ResearcherAgent } from './core/agent';

// 创建 CEO
const ceo = new CEOAgent({ name: 'CEO', autonomyLevel: 2 });

// 创建 Manager
const manager = new ManagerAgent({
  name: 'Manager-Content',
  specialization: 'creation',
  teamSize: 3
});

// 创建专家
const researcher = new ResearcherAgent({
  name: 'Researcher-News',
  focus: 'news',
  maxSources: 5
});

// 添加专家到团队
manager.addTeamMember('researcher-1', researcher);

// 执行任务
const task = {
  id: 'task-1',
  type: 'task',
  description: '搜集马斯克最新动态并创作小红书笔记',
  priority: 'high'
};

const result = await manager.executeTask(task);
console.log(result.summary);
```

---

## 代码统计

| 模块 | 文件数 | 代码行数 |
|------|--------|---------|
| Capability Layer | 3 | ~350 行 |
| Memory System | 2 | ~440 行 |
| Agent System | 4 | ~950 行 |
| **总计** | **9** | **~1740 行** |

---

## 技术亮点

### 1. LangChain 标准化
- 所有工具继承 `@langchain/core/tools` 的 `Tool` 类
- 记忆检索继承 `BaseRetriever`
- 可直接使用 LangChain 生态系统

### 2. 三层记忆设计
- **情景记忆**: 向量检索 (可扩展 ChromaDB)
- **语义记忆**: 结构化知识库
- **程序记忆**: 技能流程 + 熟练度

### 3. Agent 分层架构
- **战略层 (CEO)**: 全局决策、风险评估、任务分配
- **战术层 (Manager)**: 任务分解、团队协调、质量监督
- **执行层 (Specialists)**: 专业执行、领域技能

### 4. 渐进式实现
- 初期使用简化内存存储
- 可升级到 ChromaDB/Pinecone 等向量数据库
- 搜索工具可配置 Serper/Google API

---

## 待完善功能

### 工具层
- [ ] 配置 Serper API Key 启用网络搜索
- [ ] 实现小红书 API 真实调用
- [ ] 添加 Twitter 发布工具
- [ ] 添加更多 LangChain 工具

### 记忆层
- [ ] 升级到 ChromaDB 持久化
- [ ] 实现更好的检索算法
- [ ] 添加记忆压缩/总结
- [ ] 与 Agent 执行深度集成

### Agent 层
- [ ] 实现真实工具调用 (而非模拟)
- [ ] 添加反思与自我批评机制
- [ ] 实现 Agent 间通信协议
- [ ] 添加长期记忆存储与检索

---

## 参考文档

- [LangChain JS/TS 文档](https://js.langchain.com/)
- [LangChain Tools](https://js.langchain.com/docs/modules/agents/tools/)
- [LangChain Memory](https://js.langchain.com/docs/modules/memory/)
- [ChromaDB](https://docs.trychroma.com/)

---

**生成时间**: 2026-03-13
**版本**: v4.1.0 (包含 Agent 系统)
