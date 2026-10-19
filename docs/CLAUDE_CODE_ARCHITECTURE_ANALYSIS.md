# Claude Code 架构分析报告

**分析日期**: 2026-03-08
**分析目的**: 深入理解 Claude Code 的设计模式，为 AI Company v2 提供架构参考

---

## 一、核心洞察

### 1.1 工具调用流程

```
用户输入 → LLM 决定调用工具 → PreToolUse Hook → 执行工具 → PostToolUse Hook → 结果返回 LLM
```

**关键设计**：
- 工具调用由 LLM 自主决定，不是硬编码规则
- Hook 系统允许在工具调用前后插入自定义逻辑
- 工具执行结果返回给 LLM，形成闭环

---

### 1.2 Agent 定义格式 (`agents/*.md`)

```markdown
---
name: code-architect
description: Designs feature architectures...
tools: Glob, Grep, LS, Read, NotebookRead, WebFetch, TodoWrite, WebSearch
model: sonnet
color: green
---

# 正文：角色定义 + 工作流程 + 输出指导
```

**关键点**：
- `tools` 字段声明这个 Agent **偏好使用**的工具（不是限制）
- 正文说明何时使用什么工具：**"Use X tool to do Y"**
- 没有验证逻辑，只是指导

---

### 1.3 Skills 定义格式 (`skills/*/SKILL.md`)

```markdown
---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces...
---

正文：指导何时触发、如何工作
```

**关键点**：
- Skill 是**自动触发**的指导（auto-invoked）
- 当用户请求相关任务时，系统自动附加这个 skill 的 prompt
- 不是工具，是 prompt 指导

---

### 1.4 Hooks 系统 (`hooks/hooks.json`)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [{"type": "command", "command": "python3 .../pretooluse.py"}],
        "matcher": "Edit|Write|MultiEdit"
      }
    ],
    "PostToolUse": [...],
    "Stop": [...],
    "UserPromptSubmit": [...]
  }
}
```

**关键点**：
- **PreToolUse**: 工具调用**前**拦截（可以 blocking）
- **PostToolUse**: 工具调用**后**拦截
- **Stop**: 拦截 session 停止
- **UserPromptSubmit**: 用户提交 prompt 时拦截
- `matcher` 字段匹配工具名称

---

### 1.5 Commands 定义格式 (`commands/*.md`)

```markdown
---
description: Guided feature development...
argument-hint: Optional feature description
---

# 正文：命令执行的工作流程
```

---

## 二、核心架构对比

### 2.1 Claude Code vs AI Company v2

| 概念 | Claude Code | AI Company v2 | 差异分析 |
|------|-------------|---------------|----------|
| **Agent 定义** | Markdown 文件 (`agents/*.md`) | 数据库记录 (`employees` 表) | Claude Code 使用文件，我们使用数据库 |
| **Skills** | Markdown 文件 (`skills/*/SKILL.md`) | 无对应概念 | 我们可以引入类似的 prompt 指导系统 |
| **Hooks** | JSON 配置 (`hooks/hooks.json`) | EventBus 事件系统 | 我们的 EventBus 更灵活，但缺少标准化配置 |
| **Tools** | 内置系统工具 | ToolRegistry 注册系统 | 架构相似，我们都支持动态注册 |
| **Commands** | Markdown 文件 (`commands/*.md`) | CLI 命令 (`program.command`) | Claude Code 的命令是可组合的工作流 |

---

### 2.2 工具系统设计对比

#### Claude Code 的工具调用

```typescript
// LLM 决定调用工具 → 系统执行 → 结果返回
{
  "type": "tool_use",
  "id": "tool_123",
  "name": "Bash",
  "input": { "command": "npm install" }
}
```

#### AI Company v2 的工具调用

```typescript
// ToolRegistry 执行
const result = await toolRegistry.execute(toolName, input, context);
```

**对比分析**：
- Claude Code 的工具调用是**透明的**，LLM 直接看到工具调用和结果
- 我们的 ToolRegistry 也是类似的，但缺少 Hook 拦截机制
- 我们可以借鉴 Claude Code 的 PreToolUse/PostToolUse Hook 设计

---

### 2.3 Prompt 工程对比

#### Claude Code 的 Agent Prompt

```markdown
# 角色定义
你是代码架构师，负责设计功能架构...

# 工作流程
1. 使用 Glob 查找相关文件
2. 使用 Read 阅读现有代码
3. 使用 Grep 搜索相关实现
4. 设计架构并输出文档

# 工具使用指导
- 使用 Glob 查找文件模式
- 使用 Read 查看文件内容
- 使用 Grep 搜索代码内容
```

#### AI Company v2 的 Agent Prompt (修复前)

```markdown
# 你是谁
你是 XXX，一个专业的 AI 助手...

# 你的能力
- coding: 代码开发...
- analysis: 数据分析...

# 当前任务
XXX
```

**差异分析**：
- Claude Code 的 prompt **明确指导何时使用什么工具**
- 我们的 prompt 只描述能力，没有工具使用指导
- **修复方案**：在 `AgentFactory.generateSystemPrompt()` 中添加工具说明

---

## 三、关键设计模式

### 3.1 工具调用透明化

Claude Code 的核心设计：**工具调用对 LLM 是透明的**

```
LLM → 决定调用工具 → 系统执行 → 结果返回 → LLM 继续推理
```

**我们的实现**：
- `APIAgentExecutor` 已经实现了类似的循环
- LLM 调用 → ToolRegistry 执行 → 结果返回对话历史

**待改进**：
- 添加工具调用 Hook（PreToolUse/PostToolUse）
- 支持工具调用拦截和审计

---

### 3.2 Prompt 分层设计

Claude Code 的 Prompt 结构：

```
System Prompt (Agent 定义)
├── 角色定义
├── 工作流程
└── 工具使用指导

User Prompt (任务描述)
└── 当前任务

Skills (自动附加)
└── 相关领域的专业指导
```

**我们的实现**：
- `AgentFactory.generateSystemPrompt()` 生成 System Prompt
- `DynamicAgent.buildPrompt()` 添加任务描述
- **缺少**：Skills 类似的自动附加指导

---

### 3.3 Hook 系统设计

Claude Code Hook 类型：

| Hook 类型 | 触发时机 | 用途 |
|----------|---------|------|
| PreToolUse | 工具调用前 | 审批、审计、拦截危险操作 |
| PostToolUse | 工具调用后 | 日志、结果处理 |
| Stop | Session 停止时 | 清理、保存状态 |
| UserPromptSubmit | 用户提交 prompt 时 | 输入过滤、增强 |

**我们的 EventBus 可以支持**：

```typescript
// 已有的事件
'tool.before_execute'  → PreToolUse
'tool.after_execute'   → PostToolUse
'task.started'         → 类似 Stop
'user.input'           → UserPromptSubmit
```

---

## 四、架构改进建议

### 4.1 短期改进（已完成）

1. ✅ **增强工具描述** - 为所有系统工具添加详细说明
2. ✅ **添加使用示例** - 为每个工具生成使用示例
3. ✅ **添加使用时机指导** - 说明何时使用什么工具
4. ✅ **增强 Agent Prompt** - 在 `AgentFactory` 中添加工具说明章节

### 4.2 中期改进

1. **引入 Skills 系统**
   - 创建 `skills/` 目录存放专业技能 prompt
   - 当任务匹配时自动附加相关 skill
   - 示例：`coding.md`、`writing.md`、`analysis.md`

2. **实现 Tool Hook 系统**
   - 添加 `PreToolUse` 和 `PostToolUse` 事件
   - 支持 Hook 配置（JSON 或数据库）
   - 实现危险操作拦截（如删除文件、外部 API 调用）

3. **优化 Agent 定义格式**
   - 支持 Markdown 文件定义 Agent
   - 数据库存储执行统计
   - 文件定义 + 数据库统计的混合模式

### 4.3 长期改进

1. **Commands 工作流系统**
   - 支持可组合的命令工作流
   - 每个命令是一个预定义的多步骤流程
   - 示例：`feature-dev` 命令自动执行规划→开发→测试→审查

2. **Session 管理系统**
   - 改进会话持久化
   - 支持跨会话恢复
   - 添加会话快照功能

3. **记忆系统**
   - Agent 记忆存储到 `~/.claude/agent-memory/{agentName}/MEMORY.md`
   - 支持记忆检索和复用
   - 长期记忆和短期记忆分离

---

## 五、已实现的修复

### 5.1 工具描述增强

**文件**: `src/core/tools/builtinSystemTools.ts`

为每个系统工具添加了详细的使用场景说明：

```typescript
export const bashTool: Tool = {
  name: 'Bash',
  description: 'Run a shell command and capture its output. Use this tool to execute system commands, install packages, run scripts, and interact with the operating system.',
  // ...
};
```

### 5.2 工具示例生成

**文件**: `src/core/execution/APIAgentExecutor.ts`

```typescript
private generateToolUsageExample(tool: any): string {
  if (tool.name === 'Bash') {
    return `Bash(command="npm install")`;
  }
  if (tool.name === 'Read') {
    return `Read(filePath="src/index.ts")`;
  }
  // ... 其他工具
}
```

### 5.3 使用时机指导

**文件**: `src/core/execution/APIAgentExecutor.ts`

```typescript
private getToolUsageGuidance(toolName: string): string {
  const guidance: Record<string, string> = {
    'Bash': '当你需要运行 shell 命令、安装依赖、执行脚本、启动服务、与操作系统交互时使用',
    'Read': '当你需要读取文件内容、查看代码、检查配置文件时使用',
    'Write': '当你需要创建新文件、编写代码、生成配置文件或保存内容时使用',
    // ...
  };
  return guidance[toolName] || '';
}
```

### 5.4 Agent Prompt 增强

**文件**: `src/core/agents/AgentFactory.ts`

在 `generateSystemPrompt()` 中添加了工具说明章节：

```markdown
# 可用工具
你可以使用以下工具来完成任务：

**系统工具**：
- **Bash** - 运行 shell 命令（安装依赖、执行脚本、启动服务）
- **Read** - 读取文件内容（查看代码、配置文件）
- **Write** - 创建新文件（编写代码、生成配置）
- **Edit** - 修改现有文件（修复 bug、更新配置）
- **Glob** - 按模式查找文件
- **Grep** - 搜索文件内容
- **LS** - 列出目录内容

**使用指南**：
1. 需要运行命令、安装依赖时 → 使用 Bash
2. 需要查看文件内容时 → 使用 Read
3. 需要创建新文件时 → 使用 Write
4. 需要修改现有文件时 → 使用 Edit
5. 需要查找文件时 → 使用 Glob
6. 需要搜索内容时 → 使用 Grep
7. 需要探索目录时 → 使用 LS
```

---

## 六、验证结果

### 6.1 工具注册验证

```bash
$ node dist/cli/index.js tools

=== 可用工具 (36 个) ===

## SYSTEM
  - Bash: Run a shell command and capture its output...
  - Read: Read the contents of a file...
  - Write: Write content to a file...
  - Edit: Edit a file by replacing a specific string...
  - Glob: Find files matching a pattern...
  - Grep: Search for text in files...
  - LS: List directory contents...
```

### 6.2 构建验证

```bash
$ npm run build

> ai-company-v2@2.0.0 build
> tsc && cp schema.sql dist/

# ✅ 构建成功
```

---

## 七、下一步行动

### 7.1 优先事项

1. **测试 Agent 执行** - 运行实际任务验证工具使用是否正常
2. **监控 LLM 行为** - 观察 LLM 是否正确使用工具
3. **优化 Prompt** - 根据实际效果调整工具描述和指导

### 7.2 功能扩展

1. **Skills 系统** - 创建专业技能 prompt 库
2. **Hook 系统** - 实现 PreToolUse/PostToolUse 拦截
3. **Commands 工作流** - 实现可组合的命令系统

---

## 八、总结

### 8.1 核心学习

Claude Code 的设计哲学：
1. **透明化** - 工具调用对 LLM 透明
2. **指导而非限制** - Agent 和 Skills 是指导，不是硬编码规则
3. **可扩展** - Hook 系统支持自定义逻辑
4. **文件 + 数据库** - 文件定义配置，数据库存储状态

### 8.2 我们的优势

1. **数据库驱动** - 员工、任务、Agent 都存储在数据库中
2. **EventBus 系统** - 灵活的事件驱动架构
3. **CEO 监督者** - 智能决策和风险控制
4. **持久化记忆** - Agent 记忆存储和复用

### 8.3 改进方向

1. **Prompt 工程** - 继续优化 Agent 和工具描述
2. **Hook 系统** - 添加工具调用拦截
3. **Skills 系统** - 引入专业技能指导
4. **工作流系统** - 实现可组合的命令

---

**参考资料**:
- Claude Code 文档：https://docs.anthropic.com/claude-code
- Anthropic SDK：https://github.com/anthropics/claude-agent-sdk
