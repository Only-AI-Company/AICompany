# AI Company v2 架构调整方案

**制定日期**: 2026-03-08
**优先级**: 高 → 低
**预计周期**: 2 周

---

## 执行摘要

基于 Claude Code 架构分析，提出以下调整方案：

| 优先级 | 调整项 | 预计工作量 | 影响范围 |
|--------|--------|-----------|----------|
| P0 | 工具调用 Hook 系统 | 2 天 | 核心执行层 |
| P0 | Skills 系统 | 2 天 | Agent 执行 |
| P1 | Agent 定义格式统一 | 1 天 | Agent 工厂 |
| P1 | Prompt 分层优化 | 0.5 天 | 所有 Agent |
| P2 | Commands 工作流 | 3 天 | CLI 交互 |
| P2 | 记忆系统优化 | 2 天 | Agent 持久化 |

---

## 一、P0 优先级调整（立即执行）

### 1.1 工具调用 Hook 系统

**问题**：当前工具调用无拦截机制，无法审计和审批危险操作

**目标**：实现 PreToolUse/PostToolUse Hook，支持危险操作拦截

#### 1.1.1 设计

```typescript
// Hook 配置结构
interface ToolHookConfig {
  hookType: 'PreToolUse' | 'PostToolUse';
  matcher: string;  // 正则匹配工具名
  action: 'block' | 'warn' | 'log';
  handler: string;  // 处理函数路径
}

// hooks.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|Rm|Cp|Mv",
        "action": "warn",
        "handler": "src/hooks/fileOperations.ts"
      },
      {
        "matcher": "Bash",
        "action": "log",
        "handler": "src/hooks/bashCommands.ts"
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "action": "log",
        "handler": "src/hooks/toolLogging.ts"
      }
    ]
  }
}
```

#### 1.1.2 实现

**步骤 1**: 修改 ToolRegistry 添加 Hook 支持

```typescript
// src/core/tools/ToolRegistry.ts

export class ToolRegistry {
  private hooks: Map<string, ToolHookConfig[]> = new Map();

  // 注册 Hook
  registerHook(hook: ToolHookConfig): void {
    const hooks = this.hooks.get(hook.hookType) || [];
    hooks.push(hook);
    this.hooks.set(hook.hookType, hooks);
  }

  // 执行前 Hook
  private async executePreHooks(
    toolName: string,
    input: any,
    context: ToolContext
  ): Promise<{ allowed: boolean; reason?: string }> {
    const preHooks = this.hooks.get('PreToolUse') || [];

    for (const hook of preHooks) {
      if (new RegExp(hook.matcher).test(toolName)) {
        const result = await this.executeHookHandler(hook, toolName, input, context);
        if (!result.allowed) {
          return { allowed: false, reason: result.reason };
        }
      }
    }

    return { allowed: true };
  }

  // 执行后 Hook
  private async executePostHooks(
    toolName: string,
    input: any,
    result: ToolResult,
    context: ToolContext
  ): Promise<void> {
    const postHooks = this.hooks.get('PostToolUse') || [];

    for (const hook of postHooks) {
      if (new RegExp(hook.matcher).test(toolName)) {
        await this.executeHookHandler(hook, toolName, input, context, result);
      }
    }
  }

  // 执行工具（添加 Hook 调用）
  async execute(toolName: string, input: any, context: ToolContext): Promise<ToolResult> {
    // 执行前 Hook
    const preResult = await this.executePreHooks(toolName, input, context);
    if (!preResult.allowed) {
      return { success: false, error: preResult.reason };
    }

    // 执行工具
    const result = await this.executeTool(toolName, input, context);

    // 执行后 Hook
    await this.executePostHooks(toolName, input, result, context);

    return result;
  }
}
```

**步骤 2**: 实现内置 Hook 处理器

```typescript
// src/core/tools/hooks/fileOperations.ts

import type { ToolHookHandler, ToolResult } from '../types.js';
import { getCEOSupervisor } from '../../supervision/CEOSupervisorAgent.js';

export const fileOperationHook: ToolHookHandler = async (toolName, input, context, result) => {
  const dangerousPatterns = [
    'rm -rf',
    'del /s',
    'format',
    '> /dev/',
    'chmod 777',
  ];

  if (toolName === 'Bash') {
    const command = input.command || '';
    for (const pattern of dangerousPatterns) {
      if (command.includes(pattern)) {
        // 请求 CEO 审批
        const ceo = getCEOSupervisor();
        const decision = await ceo.makeDecision({
          decisionId: `file_op_${Date.now()}`,
          taskId: context.taskId || 'unknown',
          type: 'file_operation',
          description: `检测到危险命令：${command}`,
          options: [
            { value: 'allow', label: '允许执行', risk: 'high' },
            { value: 'block', label: '阻止执行', risk: 'low' },
          ],
        });

        if (decision.selectedOption === 'block') {
          return { allowed: false, reason: 'CEO 阻止了危险操作' };
        }
      }
    }
  }

  return { allowed: true };
};
```

**步骤 3**: 初始化 Hook 系统

```typescript
// src/core/tools/initHooks.ts

import { getToolRegistry } from './ToolRegistry.js';
import { fileOperationHook } from './hooks/fileOperations.js';
import { logHook } from './hooks/logHook.js';

export function initHooks(): void {
  const registry = getToolRegistry();

  // 注册文件操作 Hook（危险操作审批）
  registry.registerHook({
    hookType: 'PreToolUse',
    matcher: 'Write|Edit|Rm|Cp|Mv|Bash',
    action: 'block',
    handler: fileOperationHook,
  });

  // 注册日志 Hook（所有工具调用记录）
  registry.registerHook({
    hookType: 'PostToolUse',
    matcher: '.*',
    action: 'log',
    handler: logHook,
  });
}
```

#### 1.1.3 验收标准

- [ ] 危险文件操作触发 CEO 审批
- [ ] 所有工具调用记录到活动日志
- [ ] Hook 配置支持热更新
- [ ] Hook 执行超时不影响主流程

---

### 1.2 Skills 系统

**问题**：缺少专业技能指导，Agent 执行质量不稳定

**目标**：实现自动附加的专业技能 prompt 系统

#### 1.2.1 设计

```
skills/
├── coding.md          # 代码开发技能
├── writing.md         # 内容创作技能
├── analysis.md        # 数据分析技能
├── testing.md         # 测试技能
└── security.md        # 安全技能
```

**Skill 定义格式**:

```markdown
---
name: coding
description: 代码开发最佳实践
trigger: coding|programming|development|实现 | 开发
---

# 代码开发规范

## 代码质量
1. 编写可测试的代码
2. 添加适当的错误处理
3. 遵循项目代码风格

## 测试要求
1. 为新功能编写单元测试
2. 确保现有测试通过
3. 使用 `npm test` 验证

## 文档要求
1. 添加函数注释
2. 更新 README
3. 记录 API 变更
```

#### 1.2.2 实现

**步骤 1**: 创建 Skill 管理器

```typescript
// src/core/skills/SkillManager.ts

import * as fs from 'fs/promises';
import * as path from 'path';

export interface Skill {
  name: string;
  description: string;
  trigger: string[];  // 触发关键词
  content: string;
}

export class SkillManager {
  private skills: Skill[] = [];
  private skillsDir: string;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir || path.join(process.env.HOME || '', '.ai-company', 'skills');
  }

  // 加载所有 Skills
  async loadSkills(): Promise<void> {
    try {
      const files = await fs.readdir(this.skillsDir);

      for (const file of files.filter(f => f.endsWith('.md'))) {
        const content = await fs.readFile(path.join(this.skillsDir, file), 'utf-8');
        const skill = this.parseSkill(content);
        if (skill) {
          this.skills.push(skill);
        }
      }

      console.log(`[SkillManager] 加载了 ${this.skills.length} 个技能`);
    } catch (error) {
      console.warn('[SkillManager] 加载技能失败:', error);
    }
  }

  // 解析 Skill 文件
  private parseSkill(content: string): Skill | null {
    const parts = content.split('---');
    if (parts.length < 3) return null;

    const frontmatter = parts[1];
    const body = parts.slice(2).join('---').trim();

    const nameMatch = frontmatter.match(/name:\s*(.+)/);
    const descMatch = frontmatter.match(/description:\s*(.+)/);
    const triggerMatch = frontmatter.match(/trigger:\s*(.+)/);

    if (!nameMatch) return null;

    return {
      name: nameMatch[1].trim(),
      description: descMatch?.[1].trim() || '',
      trigger: triggerMatch?.[1].split('|').map(t => t.trim()) || [],
      content: body,
    };
  }

  // 根据任务描述匹配 Skills
  matchSkills(taskDescription: string): Skill[] {
    const desc = taskDescription.toLowerCase();

    return this.skills.filter(skill =>
      skill.trigger.some(keyword => desc.includes(keyword.toLowerCase()))
    );
  }

  // 构建增强 prompt
  buildEnhancedPrompt(originalPrompt: string, taskDescription: string): string {
    const matchedSkills = this.matchSkills(taskDescription);

    if (matchedSkills.length === 0) {
      return originalPrompt;
    }

    const skillsContent = matchedSkills
      .map(skill => `\n\n## ${skill.name} 技能\n${skill.content}`)
      .join('');

    return `${originalPrompt}\n\n# 专业技能指导${skillsContent}`;
  }
}

// 单例
let skillManagerInstance: SkillManager | null = null;

export function getSkillManager(): SkillManager {
  if (!skillManagerInstance) {
    skillManagerInstance = new SkillManager();
  }
  return skillManagerInstance;
}
```

**步骤 2**: 集成到 AgentFactory

```typescript
// src/core/agents/AgentFactory.ts

import { getSkillManager } from '../skills/SkillManager.js';

private generateSystemPrompt(requirement: AgentRequirement, capabilities: string[]): string {
  const skillManager = getSkillManager();

  // 生成基础 prompt
  let prompt = this.generateBasePrompt(requirement, capabilities);

  // 添加技能增强
  prompt = skillManager.buildEnhancedPrompt(prompt, requirement.taskDescription);

  return prompt;
}
```

**步骤 3**: 创建默认 Skills

```markdown
<!-- ~/.ai-company/skills/coding.md -->
---
name: coding
description: 代码开发最佳实践
trigger: 代码 | 编程|开发|实现|function|class|module
---

# 代码开发规范

## 代码质量
1. 编写可测试的代码 - 每个函数都应该可以被单元测试
2. 添加适当的错误处理 - 使用 try-catch 处理可能失败的异步操作
3. 遵循项目代码风格 - 使用 ESLint/Prettier 格式化代码

## 测试要求
1. 为新功能编写单元测试 - 使用 Jest 或项目现有测试框架
2. 确保现有测试通过 - 运行 `npm test` 验证
3. 测试边界情况 - 考虑空值、错误输入等边缘情况

## 文档要求
1. 添加函数注释 - 说明参数、返回值、副作用
2. 更新 README - 如有 API 变更
3. 记录重要决策 - 在代码中添加注释说明为什么这样实现
```

```markdown
<!-- ~/.ai-company/skills/writing.md -->
---
name: writing
description: 内容创作规范
trigger: 写文章 | 文案 | 内容 | 创作|writing|content
---

# 内容创作规范

## 内容结构
1. 清晰的标题 - 概括核心内容
2. 引言 - 吸引读者注意
3. 主体 - 分段论述，每段一个核心观点
4. 结论 - 总结要点

## 写作风格
1. 简洁明了 - 避免冗长句子
2. 用词准确 - 不使用模糊表达
3. 逻辑清晰 - 段落之间自然过渡

## 审校要求
1. 检查错别字和语法
2. 验证事实准确性
3. 确保语气一致
```

#### 1.2.3 验收标准

- [ ] Skills 目录支持动态加载
- [ ] 任务描述匹配关键词自动触发技能
- [ ] 多个技能可同时激活
- [ ] 技能内容可热更新

---

## 二、P1 优先级调整（本周执行）

### 2.1 Agent 定义格式统一

**问题**：Agent 定义在数据库中，不易于手动编辑和版本控制

**目标**：支持文件 + 数据库混合模式

#### 2.1.1 设计

```
agents/
├── code-architect.md    # 代码架构师
├── content-writer.md    # 内容创作者
└── data-analyst.md      # 数据分析师
```

**Agent 定义格式**:

```markdown
---
name: code-architect
description: 负责代码架构设计和审查
capabilities: coding,architecture,review
model: claude-sonnet-4-20250514
temperature: 0.7
maxTurns: 15
---

# 角色定义

你是资深代码架构师，负责：
1. 分析代码结构
2. 设计模块划分
3. 审查代码质量

# 工作流程

1. 使用 Glob 查找相关文件
2. 使用 Read 阅读现有代码
3. 使用 Grep 搜索相关实现
4. 设计架构并输出文档

# 输出格式

使用 Markdown 输出架构文档，包含：
- 模块划分
- 接口定义
- 数据流图
```

#### 2.1.2 实现

```typescript
// src/core/agents/AgentFileLoader.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import type { AgentDefinition } from './types.js';

export class AgentFileLoader {
  private agentsDir: string;

  constructor(agentsDir?: string) {
    this.agentsDir = agentsDir || path.join(process.env.HOME || '', '.ai-company', 'agents');
  }

  // 加载 Agent 文件
  async loadAgent(fileName: string): Promise<AgentDefinition | null> {
    const filePath = path.join(this.agentsDir, fileName);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseAgent(content);
    } catch (error) {
      console.warn(`[AgentFileLoader] 加载失败：${fileName}`, error);
      return null;
    }
  }

  // 解析 Agent 文件
  private parseAgent(content: string): AgentDefinition | null {
    const parts = content.split('---');
    if (parts.length < 3) return null;

    const frontmatter = parts[1];
    const body = parts.slice(2).join('---').trim();

    // 解析 frontmatter
    const nameMatch = frontmatter.match(/name:\s*(.+)/);
    const descMatch = frontmatter.match(/description:\s*(.+)/);
    const capsMatch = frontmatter.match(/capabilities:\s*(.+)/);

    if (!nameMatch) return null;

    return {
      id: `file_${nameMatch[1].trim()}`,
      name: nameMatch[1].trim(),
      role: descMatch?.[1].trim(),
      capabilities: capsMatch?.[1].split(',').map(c => c.trim()) || [],
      systemPrompt: body,
    };
  }

  // 列出所有可用 Agents
  async listAgents(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.agentsDir);
      return files.filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
    } catch {
      return [];
    }
  }
}
```

#### 2.1.3 验收标准

- [ ] 支持从文件加载 Agent
- [ ] 数据库 Agent 和文件 Agent 可共存
- [ ] 文件 Agent 优先于数据库 Agent
- [ ] 支持 Agent 文件热更新

---

### 2.2 Prompt 分层优化

**问题**：当前 Prompt 结构不够清晰，缺少分层

**目标**：实现结构化 Prompt 分层

#### 2.2.1 设计

```
System Prompt 结构：

# 角色定义          ← Agent 核心身份
# 可用工具          ← 工具说明（已实现）
# 专业技能          ← Skills 系统
# 工作流程          ← 标准操作步骤
# 输出规范          ← 输出格式要求
# 当前任务          ← 具体任务描述
```

#### 2.2.2 实现

```typescript
// src/core/agents/PromptBuilder.ts

export class PromptBuilder {
  private sections: Map<string, string> = new Map();

  // 添加章节
  addSection(name: string, content: string): this {
    this.sections.set(name, content);
    return this;
  }

  // 构建完整 prompt
  build(): string {
    const order = [
      '角色定义',
      '可用工具',
      '专业技能',
      '工作流程',
      '输出规范',
      '当前任务',
    ];

    const parts: string[] = [];

    for (const section of order) {
      const content = this.sections.get(section);
      if (content) {
        parts.push(`# ${section}\n${content}`);
      }
    }

    // 添加未排序的章节
    for (const [name, content] of this.sections.entries()) {
      if (!order.includes(name)) {
        parts.push(`# ${name}\n${content}`);
      }
    }

    return parts.join('\n\n');
  }

  // 从模板构建
  static fromTemplate(template: string, variables: Record<string, string>): PromptBuilder {
    const builder = new PromptBuilder();

    let remaining = template;
    const sectionRegex = /#\s*(\w+)\n([\s\S]*?)(?=\n#\s*\w+|$)/g;

    let match;
    while ((match = sectionRegex.exec(remaining)) !== null) {
      builder.addSection(match[1], match[2].trim());
    }

    return builder;
  }
}
```

#### 2.2.3 验收标准

- [ ] Prompt 按固定顺序组织
- [ ] 支持动态添加/删除章节
- [ ] 支持模板加载
- [ ] 输出格式一致

---

## 三、P2 优先级调整（下周执行）

### 3.1 Commands 工作流系统

**问题**：复杂任务需要多步骤，当前需要用户手动分解

**目标**：实现可组合的命令工作流

#### 3.1.1 设计

```
commands/
├── feature-dev.md     # 功能开发工作流
├── bug-fix.md         # Bug 修复工作流
├── code-review.md     # 代码审查工作流
└── deploy.md          # 部署工作流
```

**Command 定义格式**:

```markdown
---
name: feature-dev
description: 完整的功能开发工作流
argument-hint: 功能描述
---

# 功能开发工作流

## 步骤 1: 需求分析
- 理解功能需求
- 识别依赖关系
- 评估工作量

## 步骤 2: 技术设计
- 设计 API 接口
- 设计数据结构
- 编写技术方案

## 步骤 3: 代码实现
- 编写核心逻辑
- 编写测试用例
- 代码格式化

## 步骤 4: 验证
- 运行测试
- 手动验证
- 文档更新
```

#### 3.1.2 实现

```typescript
// src/core/commands/CommandRunner.ts

export interface Command {
  name: string;
  description: string;
  argumentHint?: string;
  steps: CommandStep[];
}

export interface CommandStep {
  name: string;
  action: string;  // 要执行的任务描述
  check?: string;  // 验证条件
}

export class CommandRunner {
  private commands: Map<string, Command> = new Map();

  // 注册命令
  register(command: Command): void {
    this.commands.set(command.name, command);
  }

  // 执行命令
  async execute(commandName: string, argument: string): Promise<void> {
    const command = this.commands.get(commandName);
    if (!command) {
      throw new Error(`未知命令：${commandName}`);
    }

    console.log(`执行命令：${command.name}`);
    console.log(`参数：${argument}`);

    // 依次执行步骤
    for (const step of command.steps) {
      console.log(`\n执行步骤：${step.name}`);

      // 构建任务描述
      const taskDescription = `${step.action}\n\n上下文：${argument}`;

      // 执行任务（调用 Agent）
      await this.executeStep(taskDescription);

      // 验证步骤
      if (step.check) {
        const passed = await this.verifyStep(step.check);
        if (!passed) {
          throw new Error(`步骤验证失败：${step.name}`);
        }
      }
    }
  }

  private async executeStep(taskDescription: string): Promise<void> {
    // 调用 CoreProcess 处理任务
    const { getCoreProcess } = await import('../events/CoreProcess.js');
    const coreProcess = getCoreProcess();
    // ... 执行任务
  }

  private async verifyStep(checkCondition: string): Promise<boolean> {
    // 验证步骤条件
    // 可以调用工具或 LLM 验证
    return true;
  }
}
```

#### 3.1.3 验收标准

- [ ] 支持命令文件加载
- [ ] 支持步骤依次执行
- [ ] 支持步骤验证
- [ ] 支持错误恢复

---

### 3.2 记忆系统优化

**问题**：当前 Agent 记忆简单追加，缺少结构化组织

**目标**：实现结构化记忆系统

#### 3.2.1 设计

```
~/.claude/agent-memory/{agentName}/
├── MEMORY.md           # 主记忆文件
├── sessions/           # 会话记录
│   ├── session-001.md
│   └── session-002.md
├── learnings/          # 经验教训
│   ├── coding-patterns.md
│   └── common-mistakes.md
└── context/            # 上下文信息
    ├── project-structure.md
    └── api-reference.md
```

#### 3.2.2 实现

```typescript
// src/core/memory/AgentMemory.ts

export class AgentMemory {
  private agentName: string;
  private memoryDir: string;

  constructor(agentName: string) {
    this.agentName = agentName;
    this.memoryDir = path.join(process.env.HOME || '', '.claude', 'agent-memory', agentName);
  }

  // 初始化记忆目录
  async initialize(): Promise<void> {
    await fs.mkdir(this.memoryDir, { recursive: true });
    await fs.mkdir(path.join(this.memoryDir, 'sessions'), { recursive: true });
    await fs.mkdir(path.join(this.memoryDir, 'learnings'), { recursive: true });
    await fs.mkdir(path.join(this.memoryDir, 'context'), { recursive: true });
  }

  // 添加记忆
  async addMemory(type: 'learning' | 'context' | 'session', content: string): Promise<void> {
    const timestamp = Date.now();
    const file = path.join(this.memoryDir, `${type}s/${timestamp}.md`);
    await fs.writeFile(file, content, 'utf-8');
  }

  // 检索相关记忆
  async searchMemories(query: string): Promise<string[]> {
    // 读取所有记忆文件
    const files = await this.readAllMemoryFiles();

    // 简单关键词匹配（可升级为向量检索）
    const matches = files.filter(file =>
      file.content.toLowerCase().includes(query.toLowerCase())
    );

    return matches.map(m => m.content);
  }

  // 构建记忆上下文
  async buildContext(): Promise<string> {
    const learnings = await this.searchMemories('learning');
    const contexts = await this.searchMemories('context');

    const sections: string[] = [];

    if (learnings.length > 0) {
      sections.push('# 经验教训');
      sections.push(learnings.join('\n\n'));
    }

    if (contexts.length > 0) {
      sections.push('# 项目上下文');
      sections.push(contexts.join('\n\n'));
    }

    return sections.join('\n\n');
  }

  private async readAllMemoryFiles(): Promise<Array<{ file: string; content: string }>> {
    const results: Array<{ file: string; content: string }> = [];

    const dirs = ['learnings', 'context', 'sessions'];
    for (const dir of dirs) {
      try {
        const files = await fs.readdir(path.join(this.memoryDir, dir));
        for (const file of files) {
          const content = await fs.readFile(path.join(this.memoryDir, dir, file), 'utf-8');
          results.push({ file: path.join(dir, file), content });
        }
      } catch {}
    }

    return results;
  }
}
```

#### 3.2.3 验收标准

- [ ] 支持分类存储记忆
- [ ] 支持关键词检索
- [ ] 支持记忆上下文构建
- [ ] 支持记忆过期清理

---

## 四、实施时间表

### 第 1 周（P0 + P1）

| 日期 | 任务 | 负责人 | 状态 |
|------|------|--------|------|
| Day 1 | 工具调用 Hook 系统 | - | ⏳ |
| Day 2 | Hook 处理器实现 | - | ⏳ |
| Day 3 | Skills 系统核心 | - | ⏳ |
| Day 4 | 默认 Skills 创建 | - | ⏳ |
| Day 5 | Agent 文件加载器 | - | ⏳ |
| Day 6 | Prompt 分层优化 | - | ⏳ |
| Day 7 | 集成测试 | - | ⏳ |

### 第 2 周（P2）

| 日期 | 任务 | 负责人 | 状态 |
|------|------|--------|------|
| Day 8 | Commands 工作流核心 | - | ⏳ |
| Day 9 | 默认 Commands 创建 | - | ⏳ |
| Day 10 | 记忆系统核心 | - | ⏳ |
| Day 11 | 记忆检索优化 | - | ⏳ |
| Day 12 | 系统联调 | - | ⏳ |
| Day 13 | 文档更新 | - | ⏳ |
| Day 14 | 验收测试 | - | ⏳ |

---

## 五、风险与缓解

### 5.1 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| Hook 系统性能开销 | 中 | 中 | 异步执行，超时熔断 |
| Skills 匹配不准确 | 高 | 中 | 关键词 + 语义双重匹配 |
| 文件 Agent 同步问题 | 中 | 高 | 文件 watchers + 缓存失效 |
| 记忆检索性能 | 中 | 低 | 限制检索数量，添加索引 |

### 5.2 实施风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 工作量超预期 | 中 | 中 | 优先完成 P0，P1/P2 可延期 |
| 破坏现有功能 | 低 | 高 | 充分测试，向后兼容 |
| 用户配置迁移 | 中 | 中 | 提供迁移脚本 |

---

## 六、验收标准

### 6.1 功能验收

- [ ] 工具调用触发 Hook 审批
- [ ] Skills 自动匹配并附加
- [ ] 文件 Agent 正常加载
- [ ] Prompt 分层结构清晰
- [ ] Commands 工作流可执行
- [ ] 记忆系统可检索

### 6.2 性能验收

- [ ] Hook 执行延迟 < 500ms
- [ ] Skills 匹配时间 < 100ms
- [ ] 记忆检索时间 < 200ms
- [ ] 系统启动时间 < 5s

### 6.3 质量验收

- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试全部通过
- [ ] 文档完整更新
- [ ] 无破坏性变更

---

## 七、总结

本调整方案基于 Claude Code 架构分析，提出以下核心改进：

1. **工具调用 Hook** - 实现危险操作审批和审计
2. **Skills 系统** - 提供专业技能指导
3. **Agent 文件化** - 支持版本控制和手动编辑
4. **Prompt 分层** - 结构化组织 prompt 内容
5. **Commands 工作流** - 简化复杂任务执行
6. **记忆系统** - 结构化存储和检索

预计实施周期 2 周，完成后系统将具备：
- 更安全的工具执行
- 更专业的 Agent 输出
- 更灵活的定义方式
- 更清晰的任务分解
