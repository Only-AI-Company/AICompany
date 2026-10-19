# 记忆系统测试指南

## 快速开始

### 1. 初始化数据库

```bash
cd v2
sqlite3 data/company.db < schema.sql
```

### 2. 启动系统

```bash
npm start
```

这将启动：
- CoreProcess（核心处理流程）
- TaskReviewer（任务复盘器，自动存储记忆）
- EventBus（事件总线）

### 3. 发送测试消息

#### 测试 1：执行任务

```
帮我写一个 Hello World 的 Python 脚本
```

系统会：
1. CEO 检索记忆（首次执行，无历史）
2. 分配给 CTO 执行
3. 任务完成后，TaskReviewer 存储记忆

#### 测试 2：再次执行类似任务

```
帮我写一个计算器的 Python 脚本
```

系统会：
1. CEO 检索记忆 → 找到 "Hello World Python 脚本" 任务
2. 检索模式 → 找到 "Python 开发最佳实践"
3. 基于历史经验做决策
4. 分配给 CTO，建议使用上次成功的方法

#### 测试 3：查询历史

```
我之前做过什么任务？
```

系统会：
1. CEO 检索 episodic memory
2. 返回历史任务列表

---

## 验证记忆存储

### 查看情景记忆

```bash
sqlite3 data/company.db "SELECT id, task_description, status FROM episodic_memories ORDER BY created_at DESC LIMIT 5;"
```

### 查看语义记忆

```bash
sqlite3 data/company.db "SELECT id, title, description, confidence FROM semantic_memories ORDER BY confidence DESC LIMIT 5;"
```

### 查看程序记忆

```bash
sqlite3 data/company.db "SELECT id, employee_id, task_type, version FROM procedural_memories ORDER BY version DESC;"
```

---

## 调试日志

### 启用详细日志

```bash
# 查看 CEO 记忆检索日志
DEBUG=ceo:* npm start

# 查看 TaskReviewer 日志
DEBUG=reviewer:* npm start

# 查看 MemoryStore 日志
DEBUG=memory:* npm start
```

### 关键日志消息

成功时你会看到：

```
[CEO] 检索到 2 个相似历史任务
[CEO] 检索到 1 个相关模式
[CEO] 上下文：2 条记忆 + 0 条聊天历史
[TaskReviewer] 存储情景记忆：mem_episodic_...
[TaskReviewer] 存储语义记忆：代码优化最佳实践
```

---

## 测试场景

### 场景 1：代码开发

```
1. "帮我写一个排序算法"
2. "帮我写一个搜索算法"  ← 应该检索到排序算法任务
```

### 场景 2：内容创作

```
1. "帮我写一篇小红书文案"
2. "帮我写一篇产品推广文章"  ← 应该检索到文案任务
```

### 场景 3：系统查询

```
1. "系统有多少员工？"
2. "系统有多少任务？"  ← 应该使用系统查询工具
```

---

## 预期行为

### 第一次执行任务

```
用户："帮我优化一下代码"
CEO:
  - 检索记忆：无结果
  - 决策：基于规则分配给 CTO
  - 执行任务
TaskReviewer:
  - 存储情景记忆
  - 提取语义记忆
```

### 第二次执行类似任务

```
用户："帮我优化一下代码"
CEO:
  - 检索记忆：找到 1 个相似任务
  - 检索模式：找到 2 个相关模式
  - 决策：基于历史经验分配给 CTO
  - 建议：使用上次的成功方法
TaskReviewer:
  - 更新情景记忆
  - 增加模式置信度
```

---

## 常见问题

### Q: 记忆检索不到？

A: 检查：
1. 数据库中是否有记忆：`SELECT count(*) FROM episodic_memories;`
2. 关键词匹配是否正确
3. 任务描述是否相似

### Q: 记忆没有存储？

A: 检查：
1. TaskReviewer 是否启动：查看日志 `[TaskReviewer] Task reviewer started`
2. task.completed 事件是否触发
3. CEO.reviewTask 是否返回结果

### Q: 记忆检索太慢？

A: 优化：
1. 添加索引：`CREATE INDEX idx_episodic_search ON episodic_memories(task_description);`
2. 减少检索数量：`limit=3` 而不是 `limit=10`
3. 使用 Embedding 相似度搜索（未来优化）

---

## 下一步

1. 执行几个测试任务
2. 检查数据库中的记忆
3. 再次执行类似任务，观察记忆检索
4. 对比有无记忆的行为差异
