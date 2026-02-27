# Telegram Bot 交互系统 - 完整实现

## 已实现的功能

### 1. 消息路由
- ✅ 命令模式: `/` 开头的消息 → CommandManager
- ✅ 聊天模式: 非 `/` 开头 → ChatHandler
- ✅ 按钮点击: callback_query → CallbackHandler

### 2. 会话管理
```typescript
interface UserSession {
  chatId: number;
  chatMode: 'ceo' | 'employee';
  employeeId?: string;
  subscribedTaskId?: string;
  lastActivity: number;
}
```

- ✅ 默认与 CEO 对话
- ✅ `/talk <员工名>` 切换到员工对话
- ✅ `/talk CEO` 切换回 CEO
- ✅ 30分钟无活动自动清理会话

### 3. 命令列表

#### 系统类
| 命令 | 功能 | 状态 |
|------|------|------|
| `/start` | 显示欢迎信息 | ✅ |
| `/help` | 显示所有命令 | ✅ |
| `/status` | 公司整体状态 | ✅ |

#### 查询类
| 命令 | 功能 | 状态 |
|------|------|------|
| `/employees` | 员工列表 | ✅ |
| `/employee <id>` | 员工详情 | ✅ |
| `/tasks` | 任务列表 | ✅ |
| `/task <id>` | 任务详情 | ✅ |
| `/logs` | 查看日志 | ✅ |

#### 任务类
| 命令 | 功能 | 状态 |
|------|------|------|
| `/run <需求>` | 执行新任务 | ✅ |
| `/stop` | 停止任务 | ⚠️ 开发中 |
| `/pause` | 暂停任务 | ⚠️ 开发中 |
| `/resume` | 恢复任务 | ⚠️ 开发中 |

#### 员工类
| 命令 | 功能 | 状态 |
|------|------|------|
| `/recruit <角色>` | 招募新员工 | ✅ |
| `/talk <员工>` | 与员工对话 | ✅ |
| `/performance` | 员工绩效 | ✅ |

### 4. 聊天功能
- ✅ CEO 对话模式（默认）
- ✅ 员工对话模式
- ✅ 员工技能和记忆注入
- ✅ 自动识别员工提及

### 5. 按钮交互
- ✅ 主菜单按钮
- ✅ 任务操作按钮
- ✅ 员工操作按钮
- ✅ 刷新按钮

### 6. 消息格式化
- ✅ HTML 转义
- ✅ Markdown 转 HTML
- ✅ 表情符号
- ✅ 代码块
- ✅ 列表
- ✅ 标题

## 使用方法

### 启动 Gateway
```bash
ai-company gateway
```

### 配置 Telegram Token
```bash
ai-company config set telegram.bot_token 8398048969:AAHtRK5SIWVNxarJM1FUO5nY_A-cWOw9qFs
```

### 或使用环境变量
```bash
export TELEGRAM_BOT_TOKEN=8398048969:AAHtRK5SIWVNxarJM1FUO5nY_A-cWOw9qFs
ai-company gateway
```

## 交互流程

### 场景 1: 查看 CEO 状态
```
用户: /status
Bot:  📊 公司状态
      👥 员工
         总数: 0
         活跃: 0 | 忙碌: 0
      📋 任务
         待处理: 0
         进行中: 0
```

### 场景 2: 创建任务
```
用户: /run 帮我写一个 Python 爬虫
Bot:  🚀 开始执行
      需求: 帮我写一个 Python 爬虫
      ...（执行中）
      ✅ 执行完成
```

### 场景 3: 与 CEO 对话（默认）
```
用户: 现在状态怎么样？
Bot:  我是 AI Company 的 CEO，目前公司...（回答问题）
```

### 场景 4: 与员工对话
```
用户: /talk 张三
Bot:  💬 已切换到与 张三 对话
用户: 你最近在做什么？
Bot:  （张三的回答，带技能和记忆）
```

### 场景 5: 招募员工
```
用户: /recruit Python 工程师
Bot:  ✅ 员工已入职
      姓名: 李明
      角色: Python_Engineer
```

## 代码结构

```
src/interfaces/integrations/telegram/
└── TelegramBot.ts
    ├── TelegramFormatter        # 格式化工具
    ├── SessionManager          # 会话管理
    ├── CommandManager          # 命令管理器
    ├── ChatHandler             # 聊天处理器
    └── CallbackHandler         # 按钮回调处理器
```

## 扩展命令

添加新命令非常简单，在 `CommandManager` 的 `registerXxxCommands()` 方法中添加：

```typescript
this.register({
  pattern: /\/mycommand/,
  description: '我的命令',
  handler: async (msg, _match, bot) => {
    // 处理逻辑
  },
});
```
