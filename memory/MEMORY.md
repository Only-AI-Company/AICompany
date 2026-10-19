# AI Company v3 - Frontend Architecture

## 实现总结 (Implementation Summary)

### 已完成阶段

#### Phase 1: 后端 API 服务 ✅
- [x] WebSocket 服务器 (`src/server/WebSocketServer.ts`)
- [x] REST API 服务 (`src/server/ApiService.ts`)
- [x] 数据库扩展 - conversations/messages 表
- [x] Engine 支持会话持久化

#### Phase 2: React 前端 ✅
- [x] Vite + React + TypeScript 项目结构
- [x] Tailwind CSS + shadcn/ui 样式系统
- [x] Zustand 状态管理
- [x] React Router 路由
- [x] 核心 UI 组件 (Button, Input, Card, Badge)
- [x] 聊天界面 (ChatWindow, ChatInput, ConversationList, MessageList)
- [x] 任务管理 (TaskList, TaskCard)
- [x] 目标管理 (GoalsPage)
- [x] 布局组件 (Sidebar, StatusBar, Layout)
- [x] WebSocket 实时通信集成

### 技术栈

**后端**:
- TypeScript + Express + ws
- better-sqlite3
- eventemitter3

**前端**:
- React 19 + TypeScript
- Vite 6
- Tailwind CSS 3
- Zustand 5
- React Router 7
- Axios

### 运行方式

**后端服务器**:
```bash
cd v3
npm install
npm run build
npm run server
```

访问:
- REST API: http://localhost:3000
- WebSocket: ws://localhost:8080

**前端开发**:
```bash
cd v3/ui
npm install
npm run dev
```

访问：http://localhost:5173

### API 端点

```
GET  /api/status              - 系统状态
GET  /api/goals               - 目标列表
POST /api/goals               - 创建目标
GET  /api/tasks               - 任务列表
POST /api/tasks               - 创建任务
GET  /api/conversations       - 会话列表
POST /api/conversations       - 创建会话
GET  /api/conversations/:id/messages - 消息历史
POST /api/conversations/:id/messages - 发送消息
GET  /api/employees           - 员工列表
GET  /api/memories/episodic   - 情景记忆
GET  /api/memories/semantic   - 语义记忆
GET  /api/activities          - 活动日志
```

### WebSocket 事件

```typescript
// Client → Server
{ type: 'chat_message'; payload: { content: string; conversationId?: string } }

// Server → Client
{ type: 'chat_response' | 'system_status' | 'engine_started' | 'engine_stopped' | 'task_updated' }
```

### 待完成

- [ ] Tauri 桌面应用集成
- [ ] PWA 支持
- [ ] 记忆系统 UI
- [ ] 设置页面完善
- [ ] 员工管理界面
- [ ] 数据隔离 (任务级数据库)

### 关键文件

**后端**:
- `v3/src/server/WebSocketServer.ts`
- `v3/src/server/ApiService.ts`
- `v3/src/server/index.ts`
- `v3/src/core/Engine.ts` (扩展)
- `v3/src/core/database/Database.ts` (扩展)

**前端**:
- `v3/ui/src/App.tsx`
- `v3/ui/src/lib/api.ts`
- `v3/ui/src/lib/websocket.ts`
- `v3/ui/src/stores/*.ts`
- `v3/ui/src/components/**/*.tsx`
- `v3/ui/src/pages/*.tsx`
