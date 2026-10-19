# AI Company v2 系统流程分析

## 一、输入源

### 1.1 CLI 输入 (`ai-company run "xxx"`)
```
用户 → CLI (index.ts run) 
  → EventCollector.collectCLIInput() 
  → EventBus.emit('user.input')
```

### 1.2 Telegram 输入
```
用户 → Telegram Bot 
  → TelegramIntegration.onMessage()
  → EventBus.emit('user.input')
```

---

## 二、事件处理流程

### 2.1 事件采集与分发
```
EventBus.emit('user.input')
  ↓
EventCollector (监听所有事件)
  ↓
CoreProcess (监听 user.input)
```

### 2.2 CEO 分析需求
```
CoreProcess.handleUserInput()
  → CEOSupervisor.analyzeRequirement()
    → LLM调用 (带 requirement_analysis 工具)
    → 返回: { type, queryType, tool, taskType, ... }
```

### 2.3 分析结果分发

#### 查询类 (type=query)
```
CoreProcess.handleQuery()
  → ToolRegistry.execute(tool='chat')
  → EventBus.emit('notification.needed')
  → ResultRouter.handleNotification()
  → TelegramIntegration.handleNotification()
  → 发送回复
```

#### 执行类 (type=execute)
```
CoreProcess.handleExecution()
  → AgentFactory.createAgent()
  → DynamicAgent.executeTask()
  → APIAgentExecutor.execute()
  → EventBus.emit('task.completed/failed')
```

---

## 三、Agent 执行流程

### 3.1 DynamicAgent 执行
```
DynamicAgent.executeTask(task)
  → getAPIAgentExecutor({ agentId, agentName, systemPrompt })
  → executor.execute(task)
```

### 3.2 APIAgentExecutor 流程
```
1. 加载 Agent 记忆 (~/.claude/agent-memory/{agentName}/MEMORY.md)
2. 构建对话上下文
3. 多轮循环:
   - callLLM(tools)
   - 解析响应 (text 或 tool_calls)
   - 有 tool_calls → 执行工具 → 继续
   - 无 tool_calls → 完成
4. 保存新记忆
```

---

## 四、通知流程

### 4.1 通知事件路径
```
notification.needed 事件
  ↓
┌─────────────────────┬─────────────────────┐
│  ResultRouter       │  TelegramIntegration │
│  (打印到控制台)      │  (发送到Telegram)    │
└─────────────────────┴─────────────────────┘
```

### 4.2 问题：重复发送
- ResultRouter.handleNotification() 
- TelegramIntegration.handleNotification()
- 两者都处理 'telegram' channel → 重复

**修复**: ResultRouter 只处理 CLI，跳过 Telegram

---

## 五、组件职责

### 5.1 EventBus
- 事件发布/订阅中心
- 所有事件通过它流转

### 5.2 EventCollector
- 采集 CLI 输入
- 监听所有事件记录到数据库

### 5.3 CoreProcess
- 监听 user.input 事件
- 调用 CEO 分析
- 分发到查询/执行处理

### 5.4 CEOSupervisor (CEO)
- 分析用户需求
- 决定任务类型
- 选择合适的 Agent/工具

### 5.5 DynamicAgent
- 执行具体任务
- 使用 APIAgentExecutor

### 5.6 APIAgentExecutor
- 调用 LLM API
- 管理 Tool Use
- 持久化记忆

### 5.7 ResultRouter
- 分发通知到不同渠道

### 5.8 TelegramIntegration
- Telegram Bot 接口
- 处理 Telegram 消息
- 发送通知到 Telegram

---

## 六、数据流

### 6.1 用户输入数据
```
{
  type: 'user.input',
  source: 'cli' | 'telegram',
  content: '用户消息',
  userId: '用户ID',
  chatId: '聊天ID',
  timestamp: Date.now()
}
```

### 6.2 CEO 分析结果
```
{
  type: 'query' | 'execute',
  queryType: 'chat' | 'status' | 'tasks' | ...,
  tool: 'chat' | 'status' | ...,
  taskType: string,
  requirements: {...}
}
```

### 6.3 Agent 执行结果
```
{
  success: boolean,
  output: string,
  toolCalls: [...],
  usage: { inputTokens, outputTokens },
  artifacts?: [...]
}
```

### 6.4 通知事件
```
{
  type: 'notification.needed',
  channel: 'cli' | 'telegram' | 'email',
  message: '回复内容',
  chatId?: string,
  timestamp: Date.now()
}
```

---

## 七、关键流程图

### 7.1 完整消息处理流程
```
用户消息
    ↓
EventBus.emit('user.input')
    ↓
EventCollector (记录)
    ↓
CoreProcess (接收)
    ↓
CEOSupervisor.analyzeRequirement()
    ↓
    ├─→ type=query → ToolRegistry.execute() → notification.needed
    │                                              ↓
    │                                        ResultRouter
    │                                        TelegramIntegration
    │                                              ↓
    │                                        发送回复
    │
    └─→ type=execute → AgentFactory.createAgent()
                           ↓
                      DynamicAgent.executeTask()
                           ↓
                      APIAgentExecutor.execute()
                           ↓
                      ┌───────┴───────┐
                      │               │
                  tool_calls      无工具调用
                      │               │
                  执行工具          返回结果
                      │               │
                  继续循环               ↓
                      │          task.completed
                      └───────────────┘
                                ↓
                          notification.needed
                                ↓
                          ResultRouter
                          TelegramIntegration
                                ↓
                          发送结果
```

### 7.2 事件订阅关系
```
user.input:
  - EventCollector (采集)
  - CoreProcess (处理)

notification.needed:
  - ResultRouter (CLI输出)
  - TelegramIntegration (Telegram发送)

task.completed:
  - ResultRouter (备用)
  - TaskReviewer (复盘)
  - TelegramIntegration (结果通知)

task.started:
  - TelegramIntegration (开始通知)
```

---

## 八、问题与修复

### 8.1 重复发送问题
**原因**: ResultRouter 和 TelegramIntegration 都处理 telegram channel

**修复**: ResultRouter 跳过 telegram channel

### 8.2 "正在处理中" 消息
**原因**: pendingResponses 没有在查询任务完成后清理

**修复**: handleNotification 后清理对应 chatId 的 pendingResponses

---

## 九、配置文件

### 9.1 config.json (~/.ai-company/)
```json
{
  "version": "2.0.0",
  "createdAt": 1234567890,
  "updatedAt": 1234567890,
  "config": {
    "ownerName": "Devin",
    "companyName": "AI Company",
    "workdir": "/Users/devin/.ai-company",
    "aiProvider": "anthropic"
  }
}
```

### 9.2 .env (~/.ai-company/)
```
ANTHROPIC_API_KEY=xxx
TELEGRAM_BOT_TOKEN=xxx
```

---

## 十、数据库表结构

```
- employees: 员工/Agent 信息
- humans: 人类画像
- employee_agents: Agent Prompts
- tasks: 任务记录
- goals: 目标
- chat_messages: 聊天消息
- config: 配置存储
- activity_log: 活动日志
- cron_jobs: 定时任务
```


---

## 十一、代码检查清单

### 11.1 EventBus (events/EventBus.ts)
- [x] emit() - 发布事件
- [x] on() - 订阅事件
- [x] waitFor() - 等待事件（超时控制）
- [x] 事件格式验证

### 11.2 EventCollector (events/EventCollector.ts)
- [x] collectCLIInput() - 采集 CLI 输入
- [x] 监听所有事件并记录到数据库
- [x] eventId 生成机制

### 11.3 CoreProcess (events/CoreProcess.ts)
- [x] handleUserInput() - 处理用户输入
- [x] handleQuery() - 处理查询类任务
- [x] handleExecution() - 处理执行类任务
- [x] 调用 CEO 分析
- [x] 分发到对应处理器

### 11.4 CEOSupervisor (supervision/CEOSupervisorAgent.ts)
- [x] analyzeRequirement() - 分析需求
- [x] 带工具的 LLM 调用
- [x] 返回结构化分析结果

### 11.5 DynamicAgent (agents/DynamicAgent.ts)
- [x] executeTask() - 执行任务
- [x] 使用 APIAgentExecutor
- [x] 转换结果格式
- [x] 能力匹配检查

### 11.6 APIAgentExecutor (execution/APIAgentExecutor.ts)
- [x] execute() - 多轮执行循环
- [x] callLLM() - 调用 LLM API
- [x] parseResponse() - 解析 tool_use 响应
- [x] executeTool() - 执行工具
- [x] loadMemory() / saveMemory() - 记忆持久化

### 11.7 ToolRegistry (tools/ToolRegistry.ts)
- [x] register() - 注册工具
- [x] execute() - 执行工具
- [x] toAnthropicSchemas() - 转换为 Anthropic 格式
- [x] 限流和权限检查

### 11.8 ResultRouter (events/ResultRouter.ts)
- [x] handleNotification() - 处理通知
- [x] 跳过 telegram channel (避免重复)
- [x] 只输出到 CLI

### 11.9 TelegramIntegration (integrations/telegram/TelegramBot.ts)
- [x] onMessage() - 接收 Telegram 消息
- [x] handleNotification() - 发送通知到 Telegram
- [x] cleanupPendingResponsesByChatId() - 清理待处理响应
- [x] 30秒超时提示逻辑

---

## 十二、关键问题验证

### 12.1 消息重复发送
✅ **已修复**: ResultRouter 跳过 telegram channel

### 12.2 "正在处理中" 消息
✅ **已修复**: handleNotification 后清理 pendingResponses

### 12.3 数据库路径
✅ **已修复**: getDatabase() 从 config 读取 workdir

### 12.4 工具注册
✅ **已实现**: initAllBuiltInTools() 注册所有工具
- queryTools
- taskTools
- employeeTools
- cronTools
- chatTools
- systemTools (业务工具)
- systemTools (系统工具: Bash, Read, Write...)

### 12.5 Agent 记忆
✅ **已实现**: ~/.claude/agent-memory/{agentName}/MEMORY.md

---

## 十三、待优化项

### 13.1 错误处理
- [ ] API 调用失败重试机制
- [ ] 工具执行失败的友好提示
- [ ] 超时处理的用户体验优化

### 13.2 性能优化
- [ ] LLM 调用缓存
- [ ] 工具执行结果缓存
- [ ] 数据库查询优化

### 13.3 功能增强
- [ ] 支持流式输出
- [ ] 支持多文件上传
- [ ] 支持代码执行沙箱

---

## 十四、测试场景

### 14.1 基础查询
```
用户: "你在吗"
CEO: type=query, queryType=chat, tool=chat
结果: 直接回复
```

### 14.2 状态查询
```
用户: "状态"
CEO: type=query, queryType=status, tool=status
结果: 显示系统状态
```

### 14.3 任务查询
```
用户: "任务"
CEO: type=query, queryType=tasks, tool=tasks
结果: 显示任务列表
```

### 14.4 执行类任务
```
用户: "帮我写一个 Python 脚本"
CEO: type=execute, taskType=python_coding
Agent: python-backend-architect
结果: 执行并返回结果
```

### 14.5 Telegram 交互
```
Telegram: "你好"
→ user.input 事件
→ CEO 分析
→ chat 工具执行
→ notification.needed
→ Telegram 回复
```

---

## 十五、调试命令

### 15.1 查看工具列表
```bash
ai-company tools
```

### 15.2 查看系统状态
```bash
ai-company status
```

### 15.3 查看系统健康
```bash
ai-company health
```

### 15.4 查看任务列表
```bash
ai-company tasks
```

### 15.5 启动后台服务
```bash
ai-company server
```

