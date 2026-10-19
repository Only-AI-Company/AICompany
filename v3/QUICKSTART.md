# AI Company v3 - 快速启动指南

## 一键启动所有服务

### 前提条件
```bash
# 安装依赖
cd /Users/devin/code/ai-company/v3
npm install

cd ui
npm install
```

### 启动后端
```bash
cd /Users/devin/code/ai-company/v3
npm run build
npm run server
```

### 启动前端（新终端）
```bash
cd /Users/devin/code/ai-company/v3/ui
npm run dev
```

### 访问 UI
```
http://localhost:5173
```

## 服务状态检查

### 检查所有服务
```bash
# 后端 API (应该返回 JSON)
curl http://localhost:3000/api/status

# WebSocket (使用 wscat)
wscat -c "ws://localhost:8080?token=ai-company-v3-secret-token"

# 前端 UI (浏览器)
open http://localhost:5173
```

### 快速测试
```bash
# 系统状态
curl http://localhost:3000/api/status | jq '.'

# 员工列表
curl http://localhost:3000/api/employees | jq '.employees | length'

# 创建会话并发送消息
CONV=$(curl -s -X POST http://localhost:3000/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"title":"测试"}' | jq -r '.id')

curl -s -X POST "http://localhost:3000/api/conversations/$CONV/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"你好"}' | jq '.message.content'
```

## 环境变量

### 配置 API Key（可选）
```bash
# 启用 LLM 功能
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

**注意**: 未配置 API Key 时，系统使用 fallback 回复模式。

## 数据库管理

### 初始化数据库
```bash
# 数据库会在首次启动时自动创建
# 位置：data/company.db
```

### 查看数据
```bash
# 使用 SQLite CLI
sqlite3 data/company.db

# 查看表
.tables

# 查看员工
SELECT * FROM employees;

# 查看任务
SELECT * FROM tasks LIMIT 10;

# 查看会话
SELECT * FROM conversations;
```

### 重置数据库
```bash
# 删除数据库文件（会丢失所有数据）
rm data/company.db

# 重启服务会重新创建
npm run server
```

## 日志查看

### 后端日志
```bash
# 实时查看
tail -f logs/server.log

# 使用 jq 格式化
tail -f logs/server.log | jq .
```

### 活动日志（通过 API）
```bash
# 最近 50 条活动
curl http://localhost:3000/api/activities | jq '.activities | length'
```

## 常见问题

### 端口被占用
```bash
# 查看占用端口的进程
lsof -ti:3000
lsof -ti:8080
lsof -ti:5173

# 杀掉进程
lsof -ti:3000 | xargs kill -9
```

### 服务启动失败
```bash
# 检查 Node 版本
node --version  # 需要 v18+

# 清除 node_modules
rm -rf node_modules
npm install

# 重新构建
npm run build
```

### WebSocket 连接失败
```bash
# 检查 token
# 默认 token: ai-company-v3-secret-token

# 修改 token (如需)
# 编辑 src/server/WebSocketServer.ts
```

## API 使用示例

### 创建目标
```bash
curl -X POST http://localhost:3000/api/goals \
  -H "Content-Type: application/json" \
  -d '{"description":"提升系统性能","timeframe":"7 天"}'
```

### 创建任务
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"description":"分析代码性能瓶颈","priority":"high"}'
```

### 创建会话
```bash
curl -X POST http://localhost:3000/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"title":"项目讨论"}'
```

### 发送消息
```bash
curl -X POST "http://localhost:3000/api/conversations/CONV_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"你好，介绍一下你自己"}'
```

### 获取会话历史
```bash
curl "http://localhost:3000/api/conversations/CONV_ID/messages?limit=50"
```

## 开发工具

### TypeScript 检查
```bash
npm run build  # 编译检查
```

### 代码格式化
```bash
npm run lint   # ESLint
npm run format # Prettier
```

### 测试
```bash
npm test       # 运行测试
```

## 性能优化

### 开发模式
```bash
# 使用 Vite 开发服务器（HMR）
npm run dev

# 生产构建
npm run build
```

### 生产部署
```bash
# 使用 PM2
pm2 start dist/server/index.js --name ai-company-v3

# 查看状态
pm2 status

# 查看日志
pm2 logs ai-company-v3
```

## 备份和恢复

### 备份数据库
```bash
# 复制数据库文件
cp data/company.db data/company.db.backup

# 或使用 sqlite3
sqlite3 data/company.db ".backup 'data/backup.db'"
```

### 恢复数据库
```bash
# 停止服务
pkill -f "node.*v3"

# 复制备份文件
cp data/company.db.backup data/company.db

# 重启服务
npm run server
```

## 监控和调试

### 查看系统状态
```bash
curl http://localhost:3000/api/status | jq '.'
```

### 查看活动日志
```bash
curl http://localhost:3000/api/activities | jq '.activities[] | {event_type, actor, action, created_at}'
```

### 调试模式
```bash
# 启用详细日志
export DEBUG=ai-company:*
npm run server
```

## 下一步

访问 UI 后，你可以：
1. 与 CEO 对话（/chat）
2. 查看任务（/tasks）
3. 查看目标（/goals）
4. 查看记忆（/memory）
5. 调整设置（/settings）

**享受你的 AI 公司！** 🚀
