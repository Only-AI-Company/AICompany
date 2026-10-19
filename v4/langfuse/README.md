# LangFuse 可观测性集成

为 DeepAgent 添加完整的 LLM 可观测性功能，追踪 Agent 执行、LLM 调用和工具使用。

## 快速开始

### 1. 启动 LangFuse 服务

```bash
cd langfuse
docker-compose up -d
```

等待服务启动（约 30 秒）：

```bash
docker-compose ps
# 应该看到 langfuse-server 和 langfuse-postgres 都是 healthy 状态
```

访问 LangFuse Web UI: http://localhost:3001

### 2. 启动 DeepAgent

```bash
cd ..
npm run dev
```

### 3. 查看 Trace

1. 在 WebUI (http://localhost:3000) 发送消息
2. 点击 "📊 View LangFuse Traces" 按钮
3. 查看 LangFuse 中的详细执行追踪

## 架构

```
┌─────────────────────────────────────────┐
│           DeepAgent WebUI               │
│  - Live Execution Trace                 │
│  - LangFuse Trace Viewer                │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│           AI Company v4                 │
│  ┌────────────────────────────────────┐ │
│  │ BaseAgent                          │ │
│  │ - think() → trace span             │ │
│  │ - plan() → trace span              │ │
│  │ - act() → trace span               │ │
│  │ - reflect() → trace span           │ │
│  │ - learn() → trace span             │ │
│  └────────────────────────────────────┘ │
│  ┌────────────────────────────────────┐ │
│  │ LangFuseClient                     │ │
│  │ - traceAgentExecution()            │ │
│  │ - traceLLMCall()                   │ │
│  │ - traceToolUse()                   │ │
│  └────────────────────────────────────┘ │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│        LangFuse Server (Local)          │
│  - http://localhost:3001                │
│  - PostgreSQL 数据库                    │
│  - Web UI (Trace Explorer)              │
└─────────────────────────────────────────┘
```

## 追踪内容

### Agent 执行追踪

每个 Agent 任务执行都会记录：
- **think**: 任务分析与思考
- **plan**: 执行计划制定
- **act**: 实际执行
- **reflect**: 结果评估与优化
- **learn**: 经验学习与记忆

### LLM 调用追踪

每次 LLM 请求记录：
- 模型名称
- 输入 Prompt
- 输出 Completion
- Token 使用量
- 响应延迟

### 工具使用追踪

每个工具调用记录：
- 工具名称
- 输入参数
- 输出结果
- 执行元数据

## 环境变量

复制 `.env.example` 为 `.env`：

```bash
cp langfuse/.env.example langfuse/.env
```

修改密码：

```bash
# 生成随机密钥
openssl rand -base64 32
```

## API 使用示例

### 在代码中使用 LangFuse

```typescript
import { LangFuseClient } from './core/observability/LangFuseClient';

const langfuse = new LangFuseClient();

// 追踪 Agent 执行
const trace = await langfuse.traceAgentExecution('Researcher', 'task-123');
await trace.observe('think', { query: '...' }, { result: '...' });

// 追踪 LLM 调用
await langfuse.traceLLMCall('CEO', {
  model: 'claude-sonnet-4-6',
  prompt: '...',
  completion: '...',
  tokens: 1500,
  latency: 2300
});

// 追踪工具使用
await langfuse.traceToolUse('Researcher', 'web_search',
  { query: 'AI news' },
  { results: [...] }
);
```

## 故障排查

### LangFuse 无法启动

```bash
# 查看日志
docker-compose logs langfuse

# 重启服务
docker-compose down
docker-compose up -d
```

### 无法连接 LangFuse

1. 检查服务是否运行：`docker-compose ps`
2. 检查端口是否占用：`lsof -i :3001`
3. 检查环境变量是否正确

### WebUI 无法加载 Traces

1. 打开浏览器控制台查看错误
2. 确认 LangFuse URL 正确 (http://localhost:3001)
3. 确认 CORS 已启用（LangFuse 默认启用）

## 高级功能

### 查看特定 Agent 的 Trace

在 LangFuse Web UI 中使用过滤器：
- Filter by name: `Researcher execution`
- Filter by session ID: `task-xxx`

### 导出 Trace 数据

```bash
curl http://localhost:3001/api/public/traces?limit=100
```

### 性能监控

LangFuse 自动记录：
- LLM 调用延迟
- Token 使用统计
- Agent 执行时长

## 清理数据

```bash
# 删除所有数据
docker-compose down -v

# 重启干净环境
docker-compose up -d
```

## 下一步

- [ ] 在 WebUI 中嵌入 LangFuse iframe
- [ ] 添加性能指标仪表板
- [ ] 实现基于 Trace 的调试功能
- [ ] 添加异常检测与告警
