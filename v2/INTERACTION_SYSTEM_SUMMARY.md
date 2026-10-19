# AI Company v2 - 交互系统实现总结

**完成时间**: 2026-03-07
**目的**: 实现像 Claude Code 那样的用户交互能力，通过 Telegram 发送交互组件

---

## 一、实现内容

### 1. 交互协议和事件类型 ✅

**文件**: `src/core/events/EventBus.ts`

新增事件类型：
```typescript
// 交互事件
export interface InteractionEvent {
  type: 'interaction.requested' | 'interaction.responded' | 'interaction.timeout' | 'interaction.cancelled';
  interactionId: string;
  taskId: string;
  agentId: string;
  agentName: string;
  interaction: {
    type: 'confirm' | 'select' | 'input';
    question: string;
    options?: InteractionOption[];
    default?: any;
    placeholder?: string;
    multiline?: boolean;
  };
  userId?: string;
  chatId?: string;
  response?: any;
  timestamp: number;
}
```

---

### 2. 交互管理器 ✅

**文件**: `src/core/events/InteractionManager.ts`

核心功能：
- 管理等待中的交互请求
- 等待用户响应（支持超时）
- 将响应传递回 Agent
- 自动清理过期交互

关键方法：
```typescript
// 请求用户交互
async requestInteraction(request: InteractionRequest): Promise<InteractionResponse>

// 处理用户响应
handleResponse(interactionId: string, value: any, cancelled?: boolean): void

// 取消交互
cancelInteraction(interactionId: string): void
```

---

### 3. Agent 暂停/恢复机制 ✅

**文件**: `src/core/execution/APIAgentExecutor.ts`

新增功能：
- 添加 `request_interaction` 工具到 Agent 可用工具列表
- 在执行循环中支持暂停等待用户响应
- 响应后自动恢复执行

新增参数：
```typescript
export interface APIAgentExecuteOptions {
  // ...existing params
  taskId?: string;      // 用于交互追踪
  userId?: string;       // 用于交互
  chatId?: string;       // 用于交互
}
```

新增工具：
```typescript
{
  name: 'request_interaction',
  description: '请求用户交互（确认、选择或输入）以获取必要信息或决策',
  input_schema: {
    type: 'object',
    properties: {
      type: { enum: ['confirm', 'select', 'input'] },
      question: { type: 'string' },
      options: { type: 'array' },
      default: { type: 'string' },
      placeholder: { type: 'string' },
      timeout: { type: 'number' },
    },
    required: ['type', 'question'],
  },
}
```

---

### 4. Telegram 交互组件 ✅

**文件**: `src/integrations/telegram/TelegramBot.ts`

新增功能：
- 监听 `interaction.requested` 事件
- 根据交互类型发送相应的 Telegram 消息和按钮
- 处理回调查询（按钮点击）
- 处理文本消息（input 类型）

交互类型实现：

#### Confirm 类型
```
📝 问题内容
┌───────────┬──────────┐
│  ✅ 是    │  ❌ 否    │
└───────────┴──────────┘
```

#### Select 类型
```
📝 问题内容

请选择一个选项：
┌─────────────┬─────────────┐
│ 选项 1      │ 选项 2      │
├─────────────┼─────────────┤
│ 选项 3      │ 🔄 使用默认 │
└─────────────┴─────────────┘
```

#### Input 类型
```
📝 问题内容
💬 提示: 请输入...

┌─────────────┐
│ 🔄 使用默认 │  (如果有默认值)
└─────────────┘
```

---

## 二、执行流程

### 完整交互流程

```
1. Agent 执行中
   ↓
2. Agent 调用 request_interaction 工具
   {
     type: 'select',
     question: '请选择账号定位',
     options: ['美妆护肤', '时尚穿搭', ...]
   }
   ↓
3. APIAgentExecutor 暂停执行
   - 发出 interaction.requested 事件
   - 等待 InteractionManager 响应
   ↓
4. TelegramBot 监听事件
   - 发送消息和按钮到 Telegram
   ↓
5. 用户点击按钮
   - TelegramBot 收到 callback_query
   - 解析响应值
   ↓
6. InteractionManager 处理响应
   - resolve Promise
   ↓
7. APIAgentExecutor 恢复执行
   - 继续执行循环
   - 使用用户响应值
```

---

## 三、使用示例

### Agent 使用示例

```typescript
// Agent 在执行中调用工具
await this.callTool('request_interaction', {
  type: 'select',
  question: '请选择账号定位',
  options: [
    { value: 'beauty', label: '美妆护肤' },
    { value: 'fashion', label: '时尚穿搭' },
    { value: 'food', label: '美食探店' },
  ]
});

// 暂停等待用户响应...

// 用户响应后继续
const response = /* 用户选择的值，如 'beauty' */
console.log(`用户选择了: ${response}`);
```

### 用户看到的界面

```
🤖 xiaohongshu-operator
──────────────────
📝 请选择账号定位

请选择一个选项：
┌─────────────┬─────────────┐
│  美妆护肤    │  时尚穿搭    │
├─────────────┼─────────────┤
│  美食探店    │  职场干货    │
└─────────────┴─────────────┘
```

---

## 四、技术特点

### 1. 完全异步
- 使用 Promise 实现暂停/恢复
- 不阻塞主线程

### 2. 超时处理
- 默认 5 分钟超时
- 超时后自动取消交互
- Agent 收到超时信号

### 3. 状态管理
- 交互 ID 追踪
- chatId 映射
- 自动清理过期状态

### 4. 错误处理
- 发送失败时的回退
- 超时后的清理
- 取消后的通知

---

## 五、测试方法

### CLI 模式测试
```bash
# 当前 CLI 模式会显示文本提示（不支持按钮）
# 未来可以添加 readline 支持
```

### Telegram 模式测试
```bash
# 1. 启动 Telegram Bot
ai-company telegram:start

# 2. 发送任务
ai-company run "帮我运营小红书账号"

# 3. Agent 会发送交互请求
# 4. 在 Telegram 中点击按钮响应
```

---

## 六、扩展性

### 支持更多渠道

当前实现支持：
- ✅ Telegram（按钮交互）
- 🔄 CLI（可添加 readline 支持）
- 🔄 Web（可添加 WebSocket 支持）

### 支持更多交互类型

当前支持：
- ✅ confirm（是/否）
- ✅ select（选项选择）
- ✅ input（文本输入）

可扩展：
- 多选
- 文件上传
- 图片选择
- 日期选择

---

## 七、下一步

1. **测试验证**
   - 实际运行小红书运营任务
   - 验证交互流程
   - 优化用户体验

2. **CLI 交互支持**
   - 添加 readline 支持
   - 支持键盘选择

3. **会话持久化**
   - 保存交互状态到数据库
   - 支持跨会话恢复

4. **交互历史**
   - 记录所有交互
   - 用于分析和改进

---

**总结**: 交互系统已完整实现，Agent 现在可以在执行中请求用户交互，并通过 Telegram 的按钮组件接收响应。
