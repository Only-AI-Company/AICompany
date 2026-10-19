# AI Company v4

基于 DeepAgent 风格的自主 AI 代理系统。

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    外部接口层                                 │
│  Telegram Bot │ Mobile App │ Web UI │ CLI                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    通信层 (Communication Layer)              │
│  WebSocket Server │ REST API │ Authentication │ Event Push  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    交互层 (Interaction Layer)                │
│  Intent Recognition │ Dialog Management │ Approval/Feedback │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    编排层 (Orchestration Layer)              │
│  Orchestrator │ Task Manager                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Agent 层                                  │
│  CEO Agent │ Manager Agent │ Specialist Agents             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    能力层 (Capability Layer)                 │
│  Tool Registry │ LLM/Web/Browser/File/Platform Tools       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    支撑系统                                   │
│  Scheduler │ Experiment │ Analytics │ Report Generator     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    记忆与存储层                               │
│  Memory System │ Database │ File System                    │
└─────────────────────────────────────────────────────────────┘
```

## 快速开始

### 1. 安装依赖

```bash
cd v4
pnpm install
# 或
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入必要的配置
```

### 3. 启动开发服务器

```bash
npm run dev
```

### 4. 构建生产版本

```bash
npm run build
npm start
```

## 目录结构

```
v4/
├── src/
│   ├── api/                      # 通信层
│   │   ├── websocket/            # WebSocket 服务器
│   │   ├── rest/                 # REST API 服务器
│   │   ├── auth/                 # 认证服务
│   │   └── telegram/             # Telegram 集成
│   │
│   ├── interaction/              # 交互层
│   │   ├── intent/               # 意图识别
│   │   ├── dialog/               # 对话管理
│   │   ├── feedback/             # 反馈收集
│   │   └── confirm/              # 确认请求
│   │
│   ├── orchestration/            # 编排层
│   │   ├── orchestrator/         # 任务编排
│   │   └── task/                 # 任务管理
│   │
│   ├── agents/                   # Agent 层
│   │   ├── base/                 # Agent 基类
│   │   ├── core/                 # 核心 Agent (CEO/Manager)
│   │   └── specialists/          # 专家 Agent
│   │
│   ├── capabilities/             # 能力层
│   │   ├── llm/                  # LLM 工具
│   │   ├── web/                  # 网络工具
│   │   ├── browser/              # 浏览器工具
│   │   ├── file/                 # 文件工具
│   │   └── platform/             # 平台工具
│   │
│   ├── support/                  # 支撑系统
│   │   ├── scheduler/            # 定时任务
│   │   ├── experiment/           # A/B 测试
│   │   ├── analytics/            # 数据分析
│   │   └── report/               # 报告生成
│   │
│   ├── memory/                   # 记忆系统
│   │   ├── episodic/             # 情景记忆
│   │   ├── semantic/             # 语义记忆
│   │   ├── procedural/           # 程序记忆
│   │   └── vector/               # 向量检索
│   │
│   ├── storage/                  # 存储层
│   │   ├── database/             # 数据库
│   │   └── files/                # 文件系统
│   │
│   ├── types/                    # 类型定义
│   ├── config/                   # 配置管理
│   ├── utils/                    # 工具函数
│   └── index.ts                  # 入口文件
│
├── tests/
│   ├── unit/                     # 单元测试
│   ├── integration/              # 集成测试
│   └── e2e/                      # 端到端测试
│
├── prompts/                      # AI 提示词
│   ├── agents/                   # Agent 提示词
│   ├── tools/                    # 工具提示词
│   └── reports/                  # 报告提示词
│
├── docs/                         # 文档
├── package.json
├── tsconfig.json
└── .env.example
```

## 核心功能

### 1. 多端接入

- **Telegram Bot**: 通过 Telegram 进行交互
- **WebSocket**: 实时双向通信
- **REST API**: 标准 HTTP 接口
- **CLI**: 命令行工具

### 2. 意图识别

自动识别用户意图：
- `query` - 信息查询
- `task` - 任务执行
- `goal` - 长期目标
- `chat` - 闲聊对话
- `status` - 状态查询

### 3. 人机协作

- **审批请求**: 高风险操作需要用户确认
- **反馈收集**: 主动收集用户反馈
- **渐进式自主**: 4 级自主程度可调

### 4. 记忆系统

三层记忆架构：
- **情景记忆**: 具体经历
- **语义记忆**: 通用知识
- **程序记忆**: 技能流程

## API 示例

### WebSocket 连接

```javascript
const ws = new WebSocket('ws://localhost:8080?userId=user1&source=web');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(message);
};

// 发送消息
ws.send(JSON.stringify({
  type: 'chat_message',
  payload: {
    conversationId: 'conv1',
    content: '帮我搜集马斯克最新消息'
  }
}));
```

### REST API

```bash
# 创建任务
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "description": "搜集马斯克最新消息",
    "type": "query"
  }'

# 获取任务状态
curl http://localhost:3000/api/tasks/task-123

# 发送消息
curl -X POST http://localhost:3000/api/conversations/conv1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "content": "你好"
  }'
```

### Telegram Bot

```bash
# 在 Telegram 中直接与 Bot 对话
/ start
帮我搜集马斯克最新消息
```

## 开发计划

| 阶段 | 周期 | 里程碑 |
|------|------|--------|
| Phase 1 | 2 周 | 核心框架完成 |
| Phase 2 | 2 周 | CEO/Manager 可用 |
| Phase 3 | 2 周 | 专家 Agent 完成 |
| Phase 4 | 2 周 | 支撑系统完成 |
| Phase 5 | 2 周 | 多端接入完成 |
| Phase 6 | 2 周 | 小红书场景验证 |

## 当前状态

✅ **Phase 1 完成**:
- [x] 目录结构创建
- [x] TypeScript 配置
- [x] 类型定义
- [x] WebSocket Server
- [x] REST API Server
- [x] AuthService
- [x] Telegram Integration
- [x] Intent Recognizer
- [x] Interaction Manager
- [x] Orchestrator (编排层)
- [x] TaskManager (任务管理)
- [x] BaseAgent (Agent 基类)
- [x] CEOAgent (CEO 代理)
- [x] ToolRegistry (工具注册中心)
- [x] LangChain 工具集成 (LLM/Browser/File/Xiaohongshu)
- [x] MemorySystem (记忆系统：情景/语义/程序)

## 下一步

1. 实现 Manager Agent（中层管理者）
2. 实现 Specialist Agents（专家代理：研究员/创作者/发布员）
3. 完善工具实现（搜索/社交媒体 API）
4. 实现 Scheduler（定时任务调度器）
5. 端到端测试

## 许可证

MIT
