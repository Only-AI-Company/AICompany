# AI Company v2 - 实际测试场景验证

**目的**: 通过具体场景验证系统差距
**方法**: 逐个场景分析当前系统能否处理

---

## 测试场景 1: 简单任务

### 场景描述
```bash
ai-company run "创建一个 hello-world.py 文件"
```

### 执行路径分析
```
1. CEO.analyzeRequirement()
   → type: 'execute'
   → taskDescription: "创建一个 hello-world.py 文件"
   → requiredCapabilities: ['coding'] (LLM 推断)

2. CEO.decideAgentStrategy()
   → 没有现有 Agent
   → strategy: 'create_new'
   → newAgentConfig: {
       employeeId: 'emp-general-001',
       name: 'python-expert',
       taskType: 'code',
       taskSubtype: 'python',
       prompt: '# python Expert\n...'
     }

3. executeWithNewAgent()
   → 创建 APIAgentExecutor
   → 执行任务

4. APIAgentExecutor.execute()
   → LLM 分析: 需要使用 Write 工具
   → Tool Use: Write({ path: 'hello-world.py', content: 'print("Hello, World!")' })
   → 执行成功
   → 返回结果

5. 事件发出
   → EventBus.emit('task.completed')
   → ResultRouter 显示结果
```

### 预期结果 ✅
- 任务成功完成
- hello-world.py 文件被创建
- 用户收到确认

### 可能的问题 ⚠️
- 如果文件已存在，Write 工具会覆盖（没有警告）
- 如果目录不存在，可能失败

---

## 测试场景 2: 中等复杂度任务

### 场景描述
```bash
ai-company run "创建一个 Node.js Express API，包含用户注册、登录、JWT 认证"
```

### 执行路径分析
```
1. CEO.analyzeRequirement()
   → type: 'execute'
   → requiredCapabilities: ['coding', 'backend', 'security']

2. CEO.decideAgentStrategy()
   → 可能有相关 Agent，看统计数据
   → 假设创建新 Agent

3. executeWithNewAgent()
   → 创建 APIAgentExecutor
   → 执行任务

4. APIAgentExecutor.execute()
   → 第 1 轮: LLM 分析需要多个步骤
   → 第 2 轮: 使用 Bash 初始化项目
   → 第 3 轮: 使用 Write 创建 package.json
   → 第 4 轮: 使用 Write 创建 server.js
   → 第 5 轮: 使用 Write 创建 auth.js
   → ...
   → 第 N 轮: 完成

5. 返回结果
```

### 预期结果 ❓
- **问题 1**: Agent 可能在中途迷失（没有明确的任务分解）
- **问题 2**: 可能只实现部分功能（没有验证）
- **问题 3**: 可能创建不符合最佳实践的代码

### 需要的改进
- [ ] 任务分解（将大任务分解为多个阶段）
- [ ] 结果验证（确认所有功能都已实现）
- [ ] 中间检查（每阶段完成后验证）

---

## 测试场景 3: 复杂多步骤任务

### 场景描述
```bash
ai-company run "设计并实现一个完整的博客系统，包含：
1. 前端（React）
2. 后端（Node.js + Express）
3. 数据库（PostgreSQL）
4. 用户认证
5. 文章 CRUD
6. 评论系统
7. Docker 部署"
```

### 当前系统能力 ❌

**问题 1: 任务复杂度**
```
当前: 一个 Agent 执行整个任务
问题:
- Agent 可能只完成部分功能
- 没有阶段性检查
- 容易迷失方向
```

**问题 2: 技术栈多样性**
```
当前: 单一 Agent 的能力有限
问题:
- 需要前端专家（React）
- 需要后端专家（Node.js）
- 需要数据库专家（PostgreSQL）
- 需要部署专家（Docker）
```

**问题 3: 验证缺失**
```
当前: 只检查 LLM 返回结果
问题:
- 无法验证前端是否可运行
- 无法验证后端 API 是否正确
- 无法验证数据库 schema 是否合理
```

### 需要的系统
```typescript
// 1. 任务分解器
const phases = await decomposer.depose(task);
// [
//   { phase: '设计', task: '设计数据库 schema 和 API 接口' },
//   { phase: '后端', task: '实现 Node.js + Express API' },
//   { phase: '前端', task: '实现 React 前端' },
//   { phase: '部署', task: '创建 Docker 配置' },
// ]

// 2. 多 Agent 协调器
const results = await coordinator.coordinate(phases);
// 每个阶段使用最适合的 Agent

// 3. 结果验证器
for (const phase of phases) {
  const isValid = await validator.validate(phase.result);
  if (!isValid) {
    // 触发修正流程
  }
}
```

---

## 测试场景 4: 错误处理

### 场景描述
```bash
ai-company run "调用 https://invalid-api-12345.com/data"
```

### 当前执行路径
```
1. CEO.analyzeRequirement()
   → type: 'execute' (需要网络请求)

2. APIAgentExecutor.execute()
   → 第 1 轮: LLM 决定使用 HTTP 工具
   → Tool Use: HTTP({ url: 'https://invalid-api-12345.com/data' })
   → 执行失败: DNS 错误或超时

3. 错误处理
   → HTTP 工具返回错误
   → LLM 看到错误
   → 可能尝试其他方法 或 直接返回失败
```

### 可能的结果 ⚠️
- **最佳情况**: LLM 意识到 URL 无效，告知用户
- **常见情况**: LLM 重复尝试相同 URL（浪费 token）
- **最坏情况**: 任务失败，没有有用的错误信息

### 需要的改进
- [ ] 智能重试（指数退避）
- [ ] 错误分析（识别错误类型）
- [ ] 备用方案（尝试其他方法）

---

## 测试场景 5: 迭代修改

### 场景描述
```bash
# 第一次请求
ai-company run "创建一个用户注册 API"

# 第二次请求（基于第一次结果修改）
ai-company run "给刚才的 API 添加邮箱验证功能"
```

### 当前能力 ⚠️

**问题 1: 上下文丢失**
```
第一次请求:
- 创建 user-registration.js
- 包含基本注册功能

第二次请求:
- Agent 不知道第一次请求的结果
- 无法找到 user-registration.js
- 可能创建新文件而不是修改现有文件
```

**问题 2: 记忆不连贯**
```
当前: 每个 Agent 有独立的 MEMORY.md
问题:
- 第二次请求可能使用不同的 Agent
- 无法记住第一次请求的上下文
```

### 需要的改进
- [ ] 项目上下文记忆（记录项目文件结构）
- [ ] 任务关联（将相关任务关联起来）
- [ ] 智能文件定位（自动找到需要修改的文件）

---

## 测试场景 6: 并发任务

### 场景描述
```bash
# 同时提交多个独立任务
ai-company run "创建用户管理模块" &
ai-company run "创建文章管理模块" &
ai-company run "创建评论管理模块" &
```

### 当前能力 ❌

**问题: 没有并发支持**
```
当前: CoreProcess 顺序处理任务
结果:
- 任务 2 需要等待任务 1 完成
- 无法利用并行能力
- 总时间 = 所有任务时间之和
```

### 需要的系统
```typescript
// 任务队列管理器
class TaskQueueManager {
  async submit(task: Task): Promise<void> {
    // 分析任务依赖关系
    // 识别可并行的任务
    // 并行执行独立任务
  }
}

// 多 Agent 并发执行
const results = await Promise.all([
  agent1.execute(task1),
  agent2.execute(task2),
  agent3.execute(task3),
]);
```

---

## 验证总结

### 当前系统适合的场景 ✅
1. **简单任务**（单一文件、单一操作）
2. **中等复杂度任务**（小项目、单一技术栈）
3. **查询类任务**（状态查询、信息检索）

### 当前系统不适合的场景 ❌
1. **大型项目**（需要多阶段、多 Agent）
2. **多技术栈项目**（需要不同专家协作）
3. **需要验证的任务**（需要确认结果正确性）
4. **并发任务**（需要并行执行）
5. **迭代任务**（需要记住上下文）

### 优先改进项
1. 🔴 **结果验证** - 确保任务真正完成
2. 🔴 **任务分解** - 处理大型项目
3. 🟡 **错误恢复** - 智能重试和备用方案
4. 🟡 **上下文记忆** - 支持迭代修改
5. 🟢 **并发执行** - 提高效率

---

## 下一步行动

### 立即验证
```bash
# 运行这些测试，验证实际表现
ai-company run "创建一个 Python 脚本，计算斐波那契数列"
ai-company run "创建一个 Node.js CLI 工具，支持 --help 参数"
ai-company run "分析当前目录的 package.json，列出所有依赖"
```

### 记录问题
- 每个测试记录实际输出
- 识别不符合预期的行为
- 分析根本原因

### 迭代改进
- 根据测试结果调整优先级
- 逐个解决关键差距
- 持续验证改进效果

---

**报告生成时间**: 2026-03-07
**建议审查周期**: 每周
