# AI Company v3 - Tool System Complete

## 完成概述

工具系统已完全实现，支持 LLM 调用工具（Tool Use）。

---

## 已实现组件

### 1. 工具类型定义 (`src/core/tools/types.ts`)

```typescript
export interface Tool {
  name: string;
  description: string;
  category: ToolCategory;  // system | file | network | search | custom
  parameters: ToolParameters;  // JSON Schema
  execute(params: any, context: ToolContext): Promise<ToolResult>;
  validate(params: any): boolean;
}
```

### 2. 工具注册表 (`src/core/tools/ToolRegistry.ts`)

**功能：**
- 工具注册/注销
- 工具列表查询
- 转换为 Anthropic 工具格式
- 工具执行

```typescript
export class ToolRegistry {
  register(tool: Tool): void;
  unregister(name: string): void;
  get(name: string): Tool | undefined;
  list(category?: ToolCategory): Tool[];
  toAnthropicTools(): AnthropicTool[];
  executeTool(name, params, context): Promise<ToolResult>;
}
```

### 3. 内置工具 (`src/core/tools/builtin/index.ts`)

#### BashTool
```typescript
{
  name: 'bash',
  description: 'Execute shell commands',
  parameters: { command, timeout },
  // 安全检查：命令注入检测
}
```

#### FileReadTool
```typescript
{
  name: 'file_read',
  description: 'Read file contents',
  parameters: { path, encoding },
  // 安全检查：路径遍历检测
}
```

#### FileWriteTool
```typescript
{
  name: 'file_write',
  description: 'Write content to file',
  parameters: { path, content, append },
  // 安全检查：路径遍历检测
}
```

#### SearchTool (Grep)
```typescript
{
  name: 'search',
  description: 'Search for text patterns in files',
  parameters: { pattern, path, caseSensitive, maxResults },
}
```

#### GlobTool
```typescript
{
  name: 'glob',
  description: 'Find files matching a pattern',
  parameters: { pattern, path, maxResults },
}
```

### 4. AI Provider 增强 (`src/core/ai/AIProvider.ts`)

**新增方法：**
```typescript
async promptWithTools(
  prompt: string,
  systemPrompt: string,
  tools: any[]
): Promise<ProviderResponse>

async continueWithToolResults(
  previousResponse: ProviderResponse,
  toolResults: string[],
  tools: any[]
): Promise<ProviderResponse>
```

**实现逻辑：**
- 将工具描述添加到 prompt 中
- 支持 fallback（当 provider 不支持 tool use 时）
- 将工具结果反馈给 LLM

### 5. Employee 工具集成 (`src/core/Employee.ts`)

**执行流程：**
```typescript
async execute(task: Task): Promise<TaskResult> {
  // 1. 获取可用工具
  const tools = this.toolRegistry.toAnthropicTools();

  // 2. 调用 LLM with tools
  let response = await this.aiProvider.promptWithTools(
    userPrompt, systemPrompt, tools
  );

  // 3. 处理工具调用循环
  while (response.stopReason === 'tool_use') {
    for (const toolCall of response.toolCalls) {
      const result = await this.executeToolCall(toolCall, task);
      toolResults.push(result);
    }

    // 4. 将工具结果反馈给 LLM
    response = await this.aiProvider.continueWithToolResults(
      response, toolResults, tools
    );
  }

  // 5. 返回最终结果
  return response.getText?.() || '';
}
```

---

## 工具使用示例

### 用户输入
```
帮我创建一个新项目，并在项目中创建一个 README.md 文件
```

### 执行流程

1. **CEO 理解输入**
   ```
   intent: task
   userWant: 创建新项目并创建 README.md
   ```

2. **调度器创建任务**
   ```typescript
   task = {
     description: "创建新项目并创建 README.md",
     requiredCapabilities: ["file_write", "bash"]
   }
   ```

3. **员工执行任务**
   ```
   [Employee] Executing: "创建新项目并创建 README.md"

   → LLM 决定使用工具：
     1. bash: mkdir my-project
     2. file_write: path="my-project/README.md", content="# My Project"

   → 执行工具：
     [bash] mkdir my-project → success
     [file_write] write README.md → success

   → 完成任务
   ```

---

## 安全检查

### Bash 命令安全
```typescript
function isDangerousCommand(command: string): boolean {
  const dangerousPatterns = [
    'rm -rf /',
    'rm -rf *',
    'mkfs',
    'curl.*|.*sh',
    'wget.*|.*sh',
    // ...
  ];
  // 检测命令是否包含危险模式
}
```

### 文件路径安全
```typescript
async function getSafePath(filePath: string, workspace?: string): Promise<string | null> {
  // 1. 解析绝对路径
  const resolvedPath = resolve(workspace || '.', filePath);

  // 2. 检测路径遍历
  if (workspace && !resolvedPath.startsWith(resolve(workspace))) {
    return null;  // 路径遍历攻击
  }

  return resolvedPath;
}
```

---

## 工具配置

在 `config/default.yaml` 中配置启用的工具：

```yaml
tools:
  enabled:
    - bash
    - file_read
    - file_write
    - search
    - glob

  bash:
    timeout: 30000
    allowedCommands: ["ls", "cd", "cat", "grep", "find"]

  file:
    base_path: ./workspace
    max_size: 10M
```

---

## 构建状态

```bash
$ npm run build
✓ Build successful
```

---

## 工具系统架构

```
┌─────────────────┐
│    Employee     │
│                 │
│  toolRegistry   │
│  aiProvider     │
└────────┬────────┘
         │
         │ execute(task)
         ▼
┌─────────────────┐
│  LLM (Claude)   │
│  + Tools        │
└────────┬────────┘
         │
         │ tool_calls[]
         ▼
┌─────────────────┐
│  ToolRegistry   │
│  executeTool()  │
└────────┬────────┘
         │
         ├──────┬───────┬────────┐
         ▼      ▼       ▼        ▼
    ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
    │ Bash │ │ File │ │Search│ │ Glob │
    │ Tool │ │ Tools│ │ Tool │ │ Tool │
    └──────┘ └──────┘ └──────┘ └──────┘
```

---

## 总结

v3 现在具备完整的**工具使用**能力：
- ✅ 5 个内置工具（bash, file_read, file_write, search, glob）
- ✅ 工具注册表管理
- ✅ LLM 工具调用支持
- ✅ 工具执行循环（最多 10 次迭代）
- ✅ 安全检查（命令注入、路径遍历）
- ✅ 配置化启用/禁用

**下一步：**
- 添加更多工具（网络请求、Git 操作等）
- 工具权限控制
- 工具使用审计日志
