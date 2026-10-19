# AI Company v2 - 架构说明

## 核心理念

**事件驱动架构** - 一切皆事件，完全解耦

```
用户输入 → EventCollector → EventBus → CoreProcess → AgentFactory → 动态Agent → 执行 → EventBus → ResultRouter → 通知
```

## 最终干净的目录结构

```
v2/src/
├── core/
│   ├── events/              # 事件驱动核心 ⭐
│   │   ├── EventBus.ts       # 事件总线
│   │   ├── EventCollector.ts # 事件采集器
│   │   ├── CoreProcess.ts    # 核心处理流程
│   │   ├── ResultRouter.ts   # 结果分发器
│   │   └── index.ts
│   │
│   ├── agents/              # 动态 Agent 系统
│   │   ├── AgentFactory.ts   # Agent 工厂 ⭐
│   │   ├── DynamicAgent.ts   # Agent 实例
│   │   ├── types.ts          # 类型定义
│   │   └── index.ts
│   │
│   └── claude/              # Claude CLI 集成
│       └── ClaudeCLIManager.ts
│
├── db/                      # 数据库
│   ├── Database.ts
│   └── seeds/
│
├── test-*.ts                # 测试文件
└── types.ts                 # 全局类型
```

## 核心流程

```
┌─────────────┐
│  用户输入    │  CLI / Telegram / API
└──────┬──────┘
       │
       ▼
┌─────────────┐
│EventCollector│  统一采集事件
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  EventBus   │  事件总线 - 所有组件的连接点
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ CoreProcess │  订阅事件，处理逻辑
└──────┬──────┘
       │
       ▼
┌─────────────┐
│AgentFactory │  动态生成/复用 Agent
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ DynamicAgent│  执行任务
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  EventBus   │  发出完成事件
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ResultRouter │  分发结果
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  用户通知    │
└─────────────┘
```

## Agent 生成流程（核心）

```
需求: "创建一个计算器应用"
  │
  ├─ 分析能力: ['coding']
  │
  ├─ 检查缓存: coding:analysis
  │   │
  │   ├─ 有 → 复用 ✅
  │   │
  │   └─ 无 → 动态生成
  │       ├─ 推断角色: developer
  │       ├─ 生成名称: Developer
  │       ├─ 生成 system prompt
  │       └─ 缓存
  │
  └─ 返回 Agent
```

## 关键文件说明

### EventBus.ts
事件总线，所有事件的连接点
- `emit(event)` - 发布事件
- `on(eventType, handler)` - 订阅事件
- `waitFor(eventType)` - 等待事件

### EventCollector.ts
事件采集器，从各种来源采集事件
- CLI 输入
- 时间触发（Cron）
- TODO: Telegram, Webhook

### CoreProcess.ts
核心处理流程，订阅事件并处理
- 处理用户输入
- 分析需求
- 调用 AgentFactory
- 发出完成事件

### AgentFactory.ts ⭐
Agent 工厂，动态生成 Agent
- `getOrCreateAgent(requirement)` - 获取或创建
- 首次需求 → 动态生成
- 相似需求 → 复用缓存
- `getStats()` - 获取统计

### DynamicAgent.ts
Agent 实例，执行任务
- `executeTask(task)` - 执行任务
- `getStatus()` - 获取状态

### ResultRouter.ts
结果分发器，发送通知
- 订阅 `notification.needed` 事件
- 输出到 CLI / Telegram

## 事件类型

```typescript
type SystemEvent =
  | UserInputEvent        // { type: 'user.input', source, content }
  | TimeTriggeredEvent    // { type: 'time.triggered', triggerType, data }
  | TaskEvent            // { type: 'task.created' | 'task.completed', taskId }
  | OutputEvent          // { type: 'output.created', outputId }
  | NotificationEvent;   // { type: 'notification.needed', message }
```

## 关键特性

✅ **事件驱动** - 一切皆事件，完全解耦
✅ **按需生成** - 没有预定义模板，动态生成 Agent
✅ **智能缓存** - 相似需求复用已创建的 Agent
✅ **可扩展** - 新增事件类型很容易
✅ **完整闭环** - 从输入到通知

## 使用示例

```typescript
import {
  getEventBus,
  getEventCollector,
  getCoreProcess,
  getResultRouter,
} from './core/events/index.js';

// 启动系统
await collector.start();
coreProcess.start();
resultRouter.start();

// 触发事件 - Agent 会自动生成和复用
collector.emitUserInput({
  source: 'cli',
  content: '创建一个计算器应用',  // → 创建 Developer Agent
});

collector.emitUserInput({
  source: 'cli',
  content: '开发待办事项',        // → 复用 Developer Agent ✅
});

collector.emitUserInput({
  source: 'cli',
  content: '写技术文章',          // → 创建 Writer Agent
});
```

---

*更新时间：2026-02-28*
