# AI Company v3 - 继续设计

## 设计目标

基于系统审查，完成以下高优先级组件：
1. CLI 入口（完整命令行工具）
2. 配置系统（YAML + 环境变量）
3. 工具系统（Tool Use）

---

## 一、CLI 设计

### 命令结构

```bash
# 全局启动
ai-company start [--daemon]

# 交互模式
ai-company chat

# 目标管理
ai-company goal create "<描述>" [--timeframe <时间>]
ai-company goal list [--active] [--completed]
ai-company goal show <id>
ai-company goal progress <id>

# 任务管理
ai-company task list [--pending] [--running] [--completed]
ai-company task show <id>
ai-company task cancel <id>

# 员工管理
ai-company employee list
ai-company employee show <id>
ai-company employee create --name <名字> --role <角色> --skills <技能>

# 系统状态
ai-company status
ai-company stats

# 复盘
ai-company review list [--employee <id>]
ai-company review show <id>

# 系统控制
ai-company stop
ai-company pause
ai-company resume
```

### 交互式输出

```
$ ai-company status

╔════════════════════════════════════════════════════════════╗
║                   AI Company v3 Status                     ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Engine:        🟢 Running (23:45:12)                    ║
║  Active Goals:  2                                          ║
║  Pending Tasks: 5                                          ║
║  Running Tasks: 1                                          ║
║  Employees:     6 active                                   ║
║                                                            ║
║  Current Goal:                                             ║
║  → "30天1万粉丝" (45% complete)                           ║
║                                                            ║
║  Recent Activity:                                          ║
║  • [12:34] Task completed: 写小红书文案                   ║
║  • [12:30] Task started: 发布文章到小红书                 ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝

$ ai-company goal list

Active Goals:
┌─────────────────────────────────────┬──────────┬─────────┐
│ Description                         │ Progress │ Time    │
├─────────────────────────────────────┼──────────┼─────────┤
│ 30天1万粉丝                         │ 45%      │ 30天    │
│ 学习 Rust 并实现一个 Web 框架      │ 12%      │ 60天    │
└─────────────────────────────────────┴──────────┴─────────┘

$ ai-company chat

[AI Company] 你好！我是 CEO。有什么可以帮你的吗？
> 帮我写一篇关于 AI 的文章

[CEO] 我理解你想要创作一篇 AI 相关的文章。
需要我为你安排吗？(y/n)
> y

[CEO] 好的，我已将任务分配给写作专家 Alice。
预计 30 分钟内完成。

> 查看进度

[Scheduler] 任务 "写一篇关于 AI 的文章" 正在执行中...
员工: Alice (写作专家)
预计完成: 14:05

> exit
```

---

## 二、配置系统设计

### 配置文件结构

```yaml
# config/default.yaml
engine:
  loop_interval: 1000        # 循环间隔(ms)
  review_interval: 60000     # 复盘间隔(ms)
  max_concurrent_tasks: 3    # 最大并发任务
  max_task_attempts: 3       # 最大重试次数
  graceful_shutdown_timeout: 30000  # 优雅关闭超时

ai:
  default_provider: anthropic
  model: claude-3-5-sonnet-20241022
  temperature: 0.7
  max_tokens: 4096

  providers:
    anthropic:
      api_key: ${ANTHROPIC_API_KEY}
      base_url: https://api.anthropic.com
      priority: 1

    qwen:
      api_key: ${QWEN_API_KEY}
      base_url: https://dashscope.aliyuncs.com
      model: qwen-max
      priority: 2

    zhipu:
      api_key: ${ZHIPU_API_KEY}
      base_url: https://open.bigmodel.cn
      model: glm-4
      priority: 3

database:
  path: ./data/company.db
  backup_enabled: true
  backup_interval: 86400    # 每天备份
  backup_retention: 7       # 保留7天

logging:
  level: info               # debug, info, warn, error
  format: pretty            # pretty, json
  file:
    enabled: true
    path: ./logs/ai-company.log
    max_size: 100M
    max_files: 10
  console:
    enabled: true
    colorize: true

employees:
  default_level: 1
  default_performance: 50
  default_satisfaction: 70

  presets:
    - name: "Writer"
      role: "写作专家"
      skills: ["写作", "编辑", "文案"]
      system_prompt: "你是一位专业的写作者..."

    - name: "Developer"
      role: "开发工程师"
      skills: ["编程", "代码审查", "架构设计"]
      system_prompt: "你是一位资深的软件工程师..."

tools:
  enabled:
    - bash
    - file_read
    - file_write
    - search

  bash:
    timeout: 30000
    allowed_commands: ["ls", "cd", "cat", "grep", "find"]

  file:
    base_path: ./workspace
    max_size: 10M
```

### 配置加载

```typescript
// src/config/Config.ts
import { load } from 'js-yaml';
import { readFileSync } from 'fs';
import path from 'path';

interface Config {
  engine: EngineConfig;
  ai: AIConfig;
  database: DatabaseConfig;
  logging: LoggingConfig;
  employees: EmployeesConfig;
  tools: ToolsConfig;
}

export function loadConfig(configPath?: string): Config {
  const defaultPath = path.join(process.cwd(), 'config', 'default.yaml');
  const userPath = configPath || path.join(process.cwd(), 'config', 'user.yaml');

  // 加载默认配置
  const defaultConfig = load(readFileSync(defaultPath, 'utf8')) as Config;

  // 加载用户配置（如果存在）
  try {
    const userConfig = load(readFileSync(userPath, 'utf8')) as Config;
    return { ...defaultConfig, ...userConfig };
  } catch {
    return defaultConfig;
  }
}

// 环境变量替换
function resolveEnv(value: any): any {
  if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
    const envVar = value.slice(2, -1);
    return process.env[envVar] || value;
  }
  return value;
}
```

---

## 三、工具系统设计

### 工具接口

```typescript
// src/core/tools/Tool.ts
export interface Tool {
  name: string;
  description: string;
  category: 'system' | 'file' | 'network' | 'custom';

  // 参数 schema (JSON Schema)
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      required?: boolean;
    }>;
    required?: string[];
  };

  // 执行工具
  execute(params: any, context: ToolContext): Promise<ToolResult>;

  // 验证参数
  validate(params: any): boolean;
}

export interface ToolContext {
  employeeId: string;
  taskId: string;
  workspace?: string;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, any>;
}
```

### 内置工具

```typescript
// src/core/tools/builtin/BashTool.ts
export const BashTool: Tool = {
  name: 'bash',
  description: 'Execute shell commands',
  category: 'system',

  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
      },
    },
    required: ['command'],
  },

  validate(params) {
    return typeof params.command === 'string';
  },

  async execute(params, context) {
    const { execSync } = require('child_process');
    try {
      const result = execSync(params.command, {
        timeout: params.timeout || 30000,
        encoding: 'utf8',
      });
      return {
        success: true,
        output: result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

// src/core/tools/builtin/FileReadTool.ts
export const FileReadTool: Tool = {
  name: 'file_read',
  description: 'Read file contents',
  category: 'file',

  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to read',
      },
    },
    required: ['path'],
  },

  validate(params) {
    return typeof params.path === 'string';
  },

  async execute(params, context) {
    const { readFile } = require('fs/promises');
    try {
      const content = await readFile(params.path, 'utf8');
      return {
        success: true,
        output: content,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};
```

### 工具注册

```typescript
// src/core/tools/ToolRegistry.ts
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(category?: Tool['category']): Tool[] {
    if (category) {
      return Array.from(this.tools.values()).filter(t => t.category === category);
    }
    return Array.from(this.tools.values());
  }

  // 为 LLM 生成工具描述
  toAnthropicTools(): any[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }
}

// 单例
export const toolRegistry = new ToolRegistry();

// 注册内置工具
toolRegistry.register(BashTool);
toolRegistry.register(FileReadTool);
toolRegistry.register(FileWriteTool);
toolRegistry.register(SearchTool);
```

### 集成到 Employee

```typescript
// src/core/Employee.ts (改进版)
export class EmployeeImpl implements Employee {
  private toolRegistry: ToolRegistry;

  async execute(task: Task): Promise<TaskResult> {
    // 1. 分析需要哪些工具
    const requiredTools = await this.analyzeRequiredTools(task);

    // 2. 构建 LLM 请求（带工具）
    const tools = requiredTools.map(t => this.toolRegistry.get(t)).filter(Boolean);

    const response = await this.aiProvider.promptWithTools(
      `任务：${task.description}\n请使用可用的工具完成任务。`,
      this.systemPrompt,
      tools
    );

    // 3. 处理工具调用
    const toolResults: any[] = [];
    for (const toolCall of response.toolCalls || []) {
      const tool = this.toolRegistry.get(toolCall.name);
      if (tool && tool.validate(toolCall.parameters)) {
        const result = await tool.execute(toolCall.parameters, {
          employeeId: this.id,
          taskId: task.id,
        });
        toolResults.push({ tool: tool.name, result });

        // 如果有更多工具调用，继续执行
        if (response.stopReason === 'tool_use') {
          // 将结果反馈给 LLM
          const nextResponse = await this.aiProvider.continueWithToolResults(
            response,
            toolResults
          );
        }
      }
    }

    return {
      success: true,
      output: response.getText?.() || '',
      metadata: { toolResults },
    };
  }

  private async analyzeRequiredTools(task: Task): Promise<string[]> {
    // 简单实现：基于任务描述和关键词
    const keywords = {
      file: ['文件', '读取', '写入', '保存'],
      bash: ['运行', '执行', '命令', '脚本'],
      search: ['搜索', '查找', 'grep'],
    };

    const required: string[] = [];
    for (const [tool, words] of Object.entries(keywords)) {
      if (words.some(w => task.description.includes(w))) {
        required.push(tool);
      }
    }
    return required;
  }
}
```

---

## 四、实现优先级

### 立即（今天）

1. **CLI 入口**
   - 创建 `src/cli/index.ts`
   - 实现核心命令：start, status, goal, task, employee
   - 添加帮助和彩色输出

2. **配置系统**
   - 创建 `src/config/Config.ts`
   - 定义配置 schema
   - 实现配置加载和验证

### 本周

3. **工具系统**
   - 定义工具接口
   - 实现内置工具（bash, file_read, file_write, search）
   - 集成到 Employee

### 下周

4. **改进现有代码**
   - 修复 singleton 问题（添加依赖注入）
   - 修复数据库初始化时序
   - 添加优雅关闭

5. **日志系统**
   - 集成 pino
   - 结构化日志

---

## 五、下一步行动

现在开始实现 CLI 入口和配置系统。
