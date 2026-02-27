# AI Company - 消息渠道测试计划

> **日期**: 2026-02-25
> **版本**: 1.0
> **目的**: 验证所有渠道的消息处理功能

## 测试范围

### 1. 渠道（Input Sources）

| 渠道 | 状态 | 说明 |
|------|------|------|
| Telegram | ✅ 主要渠道 | 通过 Telegram Bot 交互 |
| CLI | ✅ 开发/管理 | 命令行工具 |
| Web | 🚧 开发中 | Web UI（暂不测试） |
| API | 🚧 开发中 | REST API（暂不测试） |

### 2. 消息类型（Message Types）

| 类型 | 说明 | 示例 |
|------|------|------|
| 系统命令 | / 开头的命令 | `/start`, `/help`, `/status` |
| 任务命令 | 特定功能命令 | `/run`, `/recruit`, `/talk` |
| 普通聊天（CEO） | 与 CEO 对话 | "任务怎么样了？" |
| 员工对话 | 与员工对话 | "帮我实现登录功能" |
| 按钮回调 | 点击按钮触发 | `task:xxx`, `employee:xxx` |

---

## 测试场景

### Telegram 渠道测试

#### 1.1 系统命令测试

| 命令 | 预期结果 | 验证点 |
|------|---------|-------|
| `/start` | 显示欢迎信息 + 主菜单 | ✅ 返回 HTML 格式消息 + 键盘 |
| `/help` | 显示所有命令帮助 | ✅ 显示分类命令列表 |
| `/status` | 显示公司整体状态 | ✅ 员工数、任务数统计 |
| `/config` | 显示当前配置 | ✅ 显示配置项和值 |
| `/cancel` | 取消当前操作 | ✅ 清除 pendingAction 状态 |

#### 1.2 任务管理命令测试

| 命令 | 预期结果 | 验证点 |
|------|---------|-------|
| `/tasks` | 列出最近任务 | ✅ 显示任务列表（ID、描述、状态） |
| `/task <id>` | 显示任务详情 | ✅ 显示完整任务信息 |
| `/run <需求>` | 创建新任务 | ✅ 任务创建成功 + 分配员工 |
| `/stop` | 停止当前任务 | ✅ 任务状态更新为 cancelled |
| `/pause` | 暂停当前任务 | ✅ 任务状态更新为 paused |
| `/resume` | 恢复暂停的任务 | ✅ 任务状态恢复 |

#### 1.3 员工管理命令测试

| 命令 | 预期结果 | 验证点 |
|------|---------|-------|
| `/employees` | 列出所有员工 | ✅ 显示员工列表（ID、姓名、角色） |
| `/employee <id>` | 显示员工详情 | ✅ 显示完整员工信息 |
| `/recruit <角色>` | 招募新员工 | ✅ 从人类档案创建员工 |
| `/talk <员工>` | 切换到员工对话 | ✅ 聊天模式切换为 employee |
| `/talk CEO` | 切换回 CEO 对话 | ✅ 聊天模式切换为 ceo |
| `/performance` | 显示员工绩效 | ✅ 显示绩效排行榜 |

#### 1.4 意图识别测试（普通消息）

| 用户输入 | 预期工具 | 验证点 |
|---------|---------|-------|
| "任务怎么样了？" | `list_tasks` | ✅ 返回任务列表 |
| "有哪些员工？" | `list_employees` | ✅ 返回员工列表 |
| "系统状态" | `get_status` | ✅ 返回系统状态 |
| "帮我做个登录功能" | `create_task` 或 `develop_feature` | ✅ 创建任务 |
| "和CTO说话" | `talk_to_employee` | ✅ 提示使用 /talk 命令 |
| "你好" | `chat` | ✅ CEO 自然回复 |
| "张三是谁？" | `get_employee` | ✅ 返回员工详情 |

#### 1.5 员工对话测试

| 操作 | 预期结果 | 验证点 |
|------|---------|-------|
| `/talk CTO` | 切换到 CTO 对话模式 | ✅ session.chatMode = 'employee' |
| 发送消息给 CTO | CTO 以角色身份回复 | ✅ 使用 CTO 的 system_prompt |
| 检查 chat_messages | 记录员工响应 | ✅ direction='company', type='employee_response' |
| `/talk CEO` | 切换回 CEO 对话模式 | ✅ session.chatMode = 'ceo' |

#### 1.6 按钮回调测试

| 回调数据 | 预期结果 | 验证点 |
|---------|---------|-------|
| `task:xxx` | 显示任务详情 | ✅ 显示任务信息 + 操作按钮 |
| `employee:xxx` | 显示员工详情 | ✅ 显示员工信息 + 操作按钮 |
| `action:xxx` | 执行对应操作 | ✅ 操作执行 + 更新按钮 |

#### 1.7 消息持久化测试

| 操作 | 验证点 |
|------|-------|
| 用户发送消息 | ✅ chat_messages 表有记录，direction='user', source='tg' |
| CEO 回复 | ✅ chat_messages 表有记录，direction='company' |
| 员工回复 | ✅ chat_messages 表有记录，direction='company', metadata 包含 employee_id |
| 系统通知 | ✅ chat_messages 表有记录，metadata 包含 type |

---

### CLI 渠道测试

#### 2.1 基本命令测试

| 命令 | 预期结果 | 验证点 |
|------|---------|-------|
| `ai-company run "<需求>"` | 创建并执行任务 | ✅ 任务创建 + AutonomousLoopExecutor 执行 |
| `ai-company status` | 显示系统状态 | ✅ 命令行输出状态信息 |
| `ai-company employees` | 列出所有员工 | ✅ 命令行输出员工列表 |
| `ai-company db:seed humans` | 运行 seed 脚本 | ✅ 数据库插入人类档案 |
| `ai-company db:init` | 初始化数据库 | ✅ 数据库表创建 |

#### 2.2 消息持久化测试

| 操作 | 验证点 |
|------|-------|
| CLI 执行命令 | ✅ chat_messages 表有记录，source='cli' |

---

### ToolRouter 意图识别测试

#### 3.1 查询类意图

| 输入 | 预期工具 | 参数 |
|------|---------|------|
| "有哪些任务？" | `list_tasks` | {} |
| "进行中的任务" | `list_tasks` | { status: 'in_progress' } |
| "任务 123 的详情" | `get_task` | { task_id: '123' } |
| "包含登录的任务" | `get_task` | { description: '登录' } |

#### 3.2 执行类意图

| 输入 | 预期工具 | 参数 |
|------|---------|------|
| "创建一个登录功能" | `create_task` | { description: '登录功能', priority: 'medium' } |
| "紧急修复 bug" | `create_task` | { description: 'bug', priority: 'urgent' } |
| "执行备份脚本" | `execute_cron` | { name: '备份' } |
| "做个自动化脚本" | `create_automation` | { requirement: '...' } |

#### 3.3 交互类意图

| 输入 | 预期工具 | 参数 |
|------|---------|------|
| "和 CTO 说话" | `talk_to_employee` | { role: 'CTO' } |
| "招募一个前端" | `recruit_employee` | { role: 'Frontend_Engineer' } |
| "你好" | `chat` | { message: '你好' } |

---

## 测试方法

### 手动测试步骤

#### Telegram 测试

1. 启动服务
   ```bash
   npm run server
   ```

2. 打开 Telegram，找到你的 Bot

3. 按照测试场景逐个测试

4. 验证数据库记录
   ```bash
   sqlite3 ~/.ai-company/data.db "SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 10;"
   ```

#### CLI 测试

1. 运行 CLI 命令
   ```bash
   npm run build
   ai-company run "测试任务"
   ```

2. 验证数据库记录

### 自动化测试（建议创建）

```typescript
// tests/message-flow.test.ts
import { ToolRouter } from '../src/core/tools/ToolRouter.js';

describe('ToolRouter 意图识别', () => {
  it('应该识别任务查询意图', async () => {
    const router = new ToolRouter(db);
    const result = await router.route('有哪些任务？');
    assert.equal(result.toolCalls?.[0]?.tool, 'list_tasks');
  });

  it('应该识别员工查询意图', async () => {
    const router = new ToolRouter(db);
    const result = await router.route('有哪些员工？');
    assert.equal(result.toolCalls?.[0]?.tool, 'list_employees');
  });

  // ... 更多测试
});
```

---

## 测试检查清单

### Telegram 渠道

- [ ] `/start` - 显示欢迎信息
- [ ] `/help` - 显示帮助信息
- [ ] `/status` - 显示系统状态
- [ ] `/tasks` - 显示任务列表
- [ ] `/task <id>` - 显示任务详情
- [ ] `/run <需求>` - 创建任务
- [ ] `/employees` - 显示员工列表
- [ ] `/employee <id>` - 显示员工详情
- [ ] `/recruit <角色>` - 招募员工
- [ ] `/talk <员工>` - 切换员工对话
- [ ] `/talk CEO` - 切换回 CEO 对话
- [ ] 普通消息 → CEO 回复
- [ ] 意图识别 → 工具调用
- [ ] 员工对话 → 员工回复
- [ ] 按钮点击 → 执行操作
- [ ] 用户消息保存到 chat_messages
- [ ] CEO 回复保存到 chat_messages
- [ ] 员工回复保存到 chat_messages

### CLI 渠道

- [ ] `ai-company run` - 创建并执行任务
- [ ] `ai-company status` - 显示系统状态
- [ ] `ai-company employees` - 显示员工列表
- [ ] `ai-company db:seed humans` - 运行 seed
- [ ] CLI 消息保存到 chat_messages

---

## 已知问题

| 问题 | 影响 | 状态 |
|------|------|------|
| Web 渠道未实现 | 无法测试 Web 消息 | 🚧 开发中 |
| API 渠道未实现 | 无法测试 API 调用 | 🚧 开发中 |
| 员工对话的历史记录只存在 session 内存 | 重启后丢失 | 🔵 待优化 |

---

## 测试结果记录

### 测试日期：____/____/____

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Telegram /start | ⬜ Pass ⬜ Fail | |
| Telegram /help | ⬜ Pass ⬜ Fail | |
| Telegram /status | ⬜ Pass ⬜ Fail | |
| ... | ... | |
