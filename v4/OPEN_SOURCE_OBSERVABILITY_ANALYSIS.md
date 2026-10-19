# 开源 LLM 可观测性平台对比分析

**日期**: 2026-03-14
**目的**: 寻找 LangSmith 的开源替代方案，本地部署，集成到 DeepAgent

---

## 可行性分析

### ✅ 完全可行

开源的 LLM 可观测性平台已经成熟，可以完全本地部署，无需云服务。

---

## 开源替代方案对比

| 平台 | 语言 | 本地部署 | TypeScript SDK | LangChain 集成 | 推荐度 |
|------|------|---------|----------------|----------------|--------|
| **LangFuse** | Python/TS | ✅ Docker | ✅ 官方 SDK | ✅ 原生支持 | ⭐⭐⭐⭐⭐ |
| **Arize Phoenix** | Python/TS | ✅ Docker | ✅ 官方 SDK | ✅ 原生支持 | ⭐⭐⭐⭐ |
| **PromptLayer** | Python | ✅ Docker | ⚠️ 有限 | ⚠️ 需适配 | ⭐⭐⭐ |
| **Helicone** | TS | ✅ Docker | ✅ 官方 SDK | ✅ 中间件模式 | ⭐⭐⭐⭐ |
| **Weave-LM** | TS | ✅ Docker | ✅ 官方 SDK | ✅ 原生支持 | ⭐⭐⭐ |

---

## 推荐：LangFuse

**为什么选择 LangFuse**:
1. **完全开源** - MIT 许可证
2. **本地优先** - 专为本地部署设计
3. **TypeScript SDK** - 与 v4 技术栈完美匹配
4. **LangChain 原生集成** - 开箱即用
5. **功能完整** - Trace、监控、评估、用户管理
6. **活跃维护** - 快速迭代，社区活跃

---

## LangFuse 架构

```
┌─────────────────────────────────────────────────────────┐
│                   DeepAgent WebUI                       │
│  ┌───────────────┐  ┌─────────────────────────────────┐ │
│  │ Chat Interface │  │ Trace Visualization Panel     │ │
│  └───────┬───────┘  └───────────────┬─────────────────┘ │
│          │                          │                     │
└──────────┼──────────────────────────┼─────────────────────┘
           │                          │
┌──────────▼──────────────────────────▼─────────────────────┐
│              AI Company v4 Backend                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │ LangFuse SDK Integration                           │  │
│  │  - Trace execution (think/plan/act/reflect)      │  │
│  │  - Log LLM calls (input/output/tokens)           │  │
│  │  - Track Agent interactions                       │  │
│  │  - Record tool usage                              │  │
│  └────────────┬───────────────────────────────────────┘  │
└───────────────┼───────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────┐
│              LangFuse Server (Local)                   │
│  ┌─────────────────────────────────────────────────┐  │
│  │ PostgreSQL Database                              │  │
│  │  - Traces                                       │  │
│  │  - Observations                                 │  │
│  │  - Scores                                       │  │
│  │  - Users                                        │  │
│  └─────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Web UI (React)                                  │  │
│  │  - Trace Explorer                               │  │
│  │  - User Sessions                                │  │
│  │  - Evaluation Playground                        │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 技术方案

### Phase 1: 部署 LangFuse 服务

```bash
# 1. Docker Compose 部署
cd v4
mkdir -p langfuse
cd langfuse

# docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  langfuse:
    image: langfuse/langfuse:latest
    ports:
      - "3001:3000"
    environment:
      - DATABASE_URL=postgresql://langfuse:password@postgres:5432/langfuse
      - NEXTAUTH_SECRET=your-secret-key-here
      - SALT=your-salt-here
    depends_on:
      - postgres

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=langfuse
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
EOF

# 2. 启动服务
docker-compose up -d
```

### Phase 2: 安装 TypeScript SDK

```bash
npm install langfuse
```

### Phase 3: 集成到 DeepAgent

```typescript
// src/core/observability/LangFuseClient.ts

import { LangfuseTraceClient } from 'langfuse';

export class LangFuseClient {
  private client: LangFuseTraceClient;
  private projectId: string;

  constructor() {
    this.client = new LangFuseTraceClient({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY || 'pk-local',
      secretKey: process.env.LANGFUSE_SECRET_KEY || 'sk-local',
      baseUrl: process.env.LANGFUSE_URL || 'http://localhost:3001' // 本地部署
    });
    this.projectId = 'ai-company-v4';
  }

  /**
   * 记录 Agent 执行 Trace
   */
  async traceAgentExecution(agentName: string, taskId: string) {
    const trace = this.client.trace({
      name: `${agentName} execution`,
      sessionId: taskId,
      metadata: {
        project: this.projectId,
        agent: agentName
      }
    });

    return {
      trace,
      // 记录各个步骤
      observe: async (step: string, input: any, output: any) => {
        await trace.span({
          name: step,
          input: JSON.stringify(input),
          output: JSON.stringify(output)
        });
      }
    };
  }

  /**
   * 记录 LLM 调用
   */
  async traceLLMCall(agentName: string, params: {
    model: string;
    prompt: string;
    completion: string;
    tokens: number;
    latency: number;
  }) {
    const trace = this.client.trace({
      name: `${agentName} LLM Call`,
      metadata: {
        project: this.projectId,
        agent: agentName
      }
    });

    await trace.generation({
      model: params.model,
      prompt: params.prompt,
      completion: params.completion,
      usage: {
        totalTokens: params.tokens,
        promptTokens: Math.floor(params.tokens * 0.4),
        completionTokens: Math.floor(params.tokens * 0.6)
      },
      latency: params.latency
    });
  }

  /**
   * 记录工具使用
   */
  async traceToolUse(agentName: string, toolName: string, input: any, output: any) {
    const trace = this.client.trace({
      name: `${agentName} Tool Use`,
      metadata: {
        project: this.projectId,
        agent: agentName
      }
    });

    await trace.span({
      name: `tool:${toolName}`,
      input: JSON.stringify(input),
      output: JSON.stringify(output)
    });
  }

  /**
   * 记录 Agent 间通信
   */
  async traceAgentCommunication(from: string, to: string, message: any) {
    const trace = this.client.trace({
      name: 'Agent Communication',
      metadata: {
        project: this.projectId,
        from,
        to
      }
    });

    await trace.event({
      name: 'message',
      input: JSON.stringify(message)
    });
  }
}
```

### Phase 4: 集成到 BaseAgent

```typescript
// src/core/agent/BaseAgent.ts

import { LangFuseClient } from '../observability/LangFuseClient';

export abstract class BaseAgent extends EventEmitter {
  protected langfuse: LangFuseClient;
  protected currentTrace: any = null;

  constructor(config: AgentConfig) {
    super();
    // ... 现有代码

    // 初始化 LangFuse
    this.langfuse = new LangFuseClient();
  }

  async executeTask(task: Task): Promise<any> {
    // 创建 Trace
    this.currentTrace = await this.langfuse.traceAgentExecution(
      this.config.name,
      task.id
    );

    try {
      // 思考
      this.logger.info({ taskId: task.id }, 'Thinking about task');
      const thought = await this.think(task);
      await this.currentTrace.trace.observe('think', task, thought);

      // 规划
      this.logger.info('Planning execution');
      const plan = await this.plan(thought);
      await this.currentTrace.trace.observe('plan', thought, plan);

      // 执行
      this.logger.info('Executing plan');
      const result = await this.act(plan);
      await this.currentTrace.trace.observe('act', plan, result);

      // 反思
      await this.reflect(result);

      // 学习
      await this.learn({
        id: this.generateId('memory'),
        type: 'episodic',
        content: { task, result },
        importance: 0.5,
        confidence: 0.8,
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now()
      });

      this.status = 'idle';
      this.emit('task_completed', { task, result });
      return result;

    } catch (error) {
      this.logger.error({ error }, 'Task execution failed');
      this.status = 'error';
      this.emit('task_failed', { task, error });
      throw error;
    }
  }
}
```

### Phase 5: WebUI 显示 Trace

```typescript
// webui/trace.js

async function loadTraces() {
  const response = await fetch('http://localhost:3001/api/public/traces?limit=10');
  const data = await response.json();

  const traceList = document.getElementById('traceList');
  traceList.innerHTML = '';

  data.data.forEach(trace => {
    const traceEl = document.createElement('div');
    traceEl.className = 'trace-item';
    traceEl.innerHTML = `
      <div class="trace-header">
        <div class="trace-name">${trace.name}</div>
        <div class="trace-time">${new Date(trace.timestamp).toLocaleString()}</div>
      </div>
      <div class="trace-details">
        <div class="trace-spans">
          ${trace.observations.map(obs => `
            <div class="trace-span">
              <div class="span-name">${obs.name}</div>
              <div class="span-duration">${obs.durationMs}ms</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    traceList.appendChild(traceEl);
  });
}
```

---

## 集成方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **LangFuse** | 功能完整、本地部署、TS SDK、LangChain 集成 | 需要 Docker | ⭐⭐⭐⭐⭐ |
| **自研** | 完全控制、轻量 | 开发成本高、功能有限 | ⭐⭐ |
| **混合** | 灵活性高 | 集成复杂 | ⭐⭐⭐⭐ |

---

## 推荐方案：LangFuse 集成

### 实施步骤

**Week 1: 部署与基础集成**
1. 部署 LangFuse (Docker)
2. 安装 TypeScript SDK
3. 在 BaseAgent 中添加 Trace 记录
4. 测试基本 Trace 功能

**Week 2: WebUI 集成**
1. 在 WebUI 中添加 Trace 查看面板
2. 显示 Agent 执行流程
3. 显示 LLM 调用详情
4. 显示工具使用记录

**Week 3: 高级功能**
1. 添加用户会话管理
2. 添加评估与测试功能
3. 添加性能监控

---

## 总结

**可行性**: ✅ **完全可行**

**最佳方案**: **LangFuse**
- 完全开源
- 本地部署
- TypeScript SDK
- LangChain 原生集成
- 功能完整

**预期效果**:
```
DeepAgent WebUI
├── Chat Interface (当前)
├── Trace Visualization (新增 - LangFuse 集成)
│   ├── Agent 执行流程
│   ├── LLM 调用详情
│   ├── 工具使用记录
│   └── 性能指标
└── Agent Tree (当前)
```

**下一步**: 是否开始实施 LangFuse 集成？

---

**生成时间**: 2026-03-14
**版本**: v4.0.0
