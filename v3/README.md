# AI Company v3

## 核心理念

**自主运行、自主决策、自动调度**

## 快速开始

```bash
# 安装依赖
npm install

# 构建
npm run build

# 运行
npm start
```

## 使用示例

```
AI Company v3 - Starting...
✓ AI Company is running
✓ Type your input and press Enter

> 1个月1万粉丝

[CEO] Understanding: "1个月1万粉丝"
[AI Company] Setting goal: 1个月1万粉丝
[AI Company] Timeframe: 30天

> 写一篇小红书

[CEO] Understanding: "写一篇小红书"
[CEO] Assigning task: "写一篇小红书"
[CEO] Assigned to: 小红书专员 (小红书运营)
[小红书专员] Executing: "写一篇小红书"
[Response] 已创建小红书内容：《xxx》

> status

[System Status]
{
  "engineRunning": true,
  "activeGoals": 1,
  "activeTasks": 0,
  ...
}

> exit
```

## 架构

```
Engine（自主运行引擎）
├── GoalManager（目标管理）
├── PlanExecutor（计划执行）
├── Scheduler（调度器）
├── CEO（决策中枢）
└── Employees（员工池）
```

## v3 vs v2

| v2 | v3 |
|----|----|
| 事件驱动 | 主动运行 |
| CXO 层（6个 CXO） | CEO 单层 |
| 意图分类 | 理解后处理 |
| 任务复盘 | 定期+任务复盘 |
| 无目标管理 | 完整目标系统 |

## 开发计划

- [x] Phase 1: 核心引擎框架
- [ ] Phase 2: 目标管理系统
- [ ] Phase 3: 调度与监控
- [ ] Phase 4: 复盘与进化
- [ ] Phase 5: 用户交互

## License

MIT
