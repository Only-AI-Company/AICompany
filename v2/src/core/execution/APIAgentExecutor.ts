/**
 * AI Company v2 - API Agent Executor
 *
 * 使用 Anthropic API 实现 Agent 执行能力
 * 替代 PTY 执行层，避免 node-pty 兼容性问题
 *
 * 核心特性：
 * - 保留 system prompt 机制
 * - 支持 Tool Use（函数调用）
 * - 持久化记忆（每个 agent 独立目录）
 * - 会话管理
 */

import { getProvider, type ProviderResponse } from '../ai/AIProvider.js';
import type { Tool, ToolContext, ToolResult } from '../tools/types.js';
import { getToolRegistry } from '../tools/ToolRegistry.js';
import { getDatabase } from '../../db/Database.js';
import { getEventBus } from '../events/EventBus.js';
import { getInteractionManager, type InteractionRequest, type InteractionResponse } from '../events/InteractionManager.js';
import { generateDynamicSystemPrompt } from '../prompts/DynamicPromptSystem.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// 类型定义
// ============================================================================

export interface APIAgentExecuteOptions {
  /** Agent ID */
  agentId: string;
  /** Agent 名称 */
  agentName: string;
  /** System Prompt */
  systemPrompt: string;
  /** 记忆目录（可选） */
  memoryDir?: string;
  /** 最大轮次 */
  maxTurns?: number;
  /** 超时时间（ms） */
  timeout?: number;
  /** 任务 ID（用于交互追踪） */
  taskId?: string;
  /** 用户 ID（用于交互） */
  userId?: string;
  /** 聊天 ID（用于交互） */
  chatId?: string;
}

export interface APIAgentResult {
  /** 是否成功 */
  success: boolean;
  /** 最终输出 */
  output: string;
  /** 使用的工具 */
  toolCalls: Array<{
    name: string;
    input: any;
    result: any;
  }>;
  /** Token 用量 */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** 错误信息 */
  error?: string;
  /** 生成的文件 */
  artifacts?: Array<{
    type: 'file' | 'code' | 'plan';
    content: string;
    path?: string;
  }>;
}

// ============================================================================
// API Agent Executor
// ============================================================================

export class APIAgentExecutor {
  private agentId: string;
  private agentName: string;
  private systemPrompt: string;
  private memoryDir: string;
  private maxTurns: number;
  private timeout: number;
  private taskId: string;
  private userId: string;
  private chatId: string;

  // 会话历史
  private conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string | Array<any>;
  }> = [];
  private readonly MAX_HISTORY_SIZE = 100; // 最大历史消息数

  // 工具注册表、事件总线和交互管理器
  private toolRegistry = getToolRegistry();
  private db = getDatabase();
  private eventBus = getEventBus();
  private interactionManager = getInteractionManager();

  constructor(options: APIAgentExecuteOptions) {
    this.agentId = options.agentId;
    this.agentName = options.agentName;
    this.systemPrompt = options.systemPrompt;
    this.maxTurns = options.maxTurns || 10;
    this.timeout = options.timeout || 300000; // 5 分钟
    this.taskId = options.taskId || options.agentId;
    this.userId = options.userId || 'api-agent';
    this.chatId = options.chatId || this.agentId;

    // 记忆目录：~/.claude/agent-memory/{agentName}/
    const baseDir = path.join(process.env.HOME || '', '.claude', 'agent-memory');
    this.memoryDir = options.memoryDir || path.join(baseDir, options.agentName);

    // 确保记忆目录存在
    fs.mkdir(this.memoryDir, { recursive: true }).catch(() => {});
  }

  /**
   * 执行任务
   *
   * 核心流程：
   * 1. 加载 agent 记忆
   * 2. 构建对话上下文
   * 3. 循环：LLM → Tool Use → Result → LLM
   * 4. 直到完成或达到最大轮次
   * 5. 保存新记忆
   */
  async execute(task: string): Promise<APIAgentResult> {
    console.log(`[APIAgentExecutor] ${this.agentName} 执行任务...`);
    console.log(`[APIAgentExecutor] 任务: ${task.substring(0, 80)}...`);

    const startTime = Date.now();
    const toolCalls: Array<{ name: string; input: any; result: any }> = [];

    try {
      // 1. 加载记忆
      const memory = await this.loadMemory();
      const memoryContext = memory ? `\n\n# 持久化记忆\n${memory}` : '';

      // 2. 获取可用工具
      const tools = this.getAvailableTools();

      // 3. 增强 system prompt，添加工具说明
      const enhancedSystemPrompt = this.enhanceSystemPromptWithTools(this.systemPrompt, tools);

      // 4. 构建初始消息
      // system prompt 作为独立消息，user 任务作为第二条消息
      this.conversationHistory = [
        {
          role: 'system',
          content: enhancedSystemPrompt + memoryContext,
        },
        {
          role: 'user',
          content: task,
        },
      ];

      console.log(`[APIAgentExecutor] 可用工具: ${tools.length} 个`);

      // 4. 多轮执行循环
      let turn = 0;
      let finalOutput = '';
      let isComplete = false;
      let lastResponse: Awaited<ReturnType<typeof this.callLLM>> | null = null;

      while (turn < this.maxTurns && !isComplete) {
        turn++;
        console.log(`[APIAgentExecutor] === 第 ${turn} 轮 ===`);

        // 调用 LLM
        const response = await this.callLLM(tools);
        lastResponse = response;

        if (!response.success) {
          return {
            success: false,
            output: '',
            toolCalls,
            error: response.error,
          };
        }

        // 解析响应
        const parsed = this.parseResponse(response.content!);

        // 检查是否有工具调用
        if (parsed.toolCalls.length > 0) {
          console.log(`[APIAgentExecutor] 工具调用: ${parsed.toolCalls.map(t => t.name).join(', ')}`);

          // 发送进度事件
          this.emitProgress(turn, {
            toolCall: {
              name: parsed.toolCalls[0].name,
              input: parsed.toolCalls[0].input,
            },
            message: `正在执行: ${parsed.toolCalls[0].name}`,
          });

          // 执行所有工具调用
          const toolResults: Array<any> = [];

          for (const toolCall of parsed.toolCalls) {
            const result = await this.executeTool(toolCall.name, toolCall.input);
            toolCalls.push({
              name: toolCall.name,
              input: toolCall.input,
              result,
            });
            toolResults.push({
              tool_use_id: toolCall.id,
              type: 'tool_result',
              content: JSON.stringify(result),
            });
          }

          // 将工具结果添加到对话历史
          this.addToHistory({
            role: 'assistant',
            content: response.content!,
          });
          this.addToHistory({
            role: 'user',
            content: toolResults,
          });

        } else {
          // 没有工具调用，说明完成了
          isComplete = true;
          finalOutput = parsed.text;

          console.log(`[APIAgentExecutor] 任务完成`);
          console.log(`[APIAgentExecutor] 输出: ${finalOutput.substring(0, 200)}...`);

          // 添加最终响应到历史
          this.addToHistory({
            role: 'assistant',
            content: response.content!,
          });
        }
      }

      // 5. 保存新记忆（异步，不阻塞）
      this.saveMemory(finalOutput).catch(console.error);

      // 6. 记录活动
      this.db.logActivity({
        eventType: 'agent.executed',
        actor: this.agentId,
        action: 'task_completed',
        context: {
          agentName: this.agentName,
          task: task.substring(0, 100),
          turns: turn,
          toolCallsCount: toolCalls.length,
        },
        result: {
          success: true,
          outputLength: finalOutput.length,
          duration: Date.now() - startTime,
        },
      });

      return {
        success: true,
        output: finalOutput,
        toolCalls,
        usage: lastResponse?.usage,
      };

    } catch (error: any) {
      console.error(`[APIAgentExecutor] 执行失败: ${error.message}`);

      return {
        success: false,
        output: '',
        toolCalls,
        error: error.message,
      };
    }
  }

  /**
   * 调用 LLM
   *
   * 修复：system prompt 需要作为独立参数传递，不是放在 user 消息中
   */
  private async callLLM(tools: any[]): Promise<{
    success: boolean;
    content?: any;
    usage?: { inputTokens: number; outputTokens: number };
    error?: string;
  }> {
    try {
      const provider = getProvider();

      // 过滤出 system 消息（如果有）
      const systemMessage = this.conversationHistory.find(m => m.role === 'system');
      const userMessages = this.conversationHistory.filter(m => m.role !== 'system');

      // 调用 LLM with tools，system prompt 作为独立参数
      const response: ProviderResponse = await provider.messagesWithTools(
        userMessages,
        tools,
        systemMessage?.content as string | undefined
      );

      return {
        success: true,
        content: response.content,
        usage: response.usage,
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 解析 LLM 响应
   */
  private parseResponse(content: any): {
    text: string;
    toolCalls: Array<{ id: string; name: string; input: any }>;
  } {
    const textParts: string[] = [];
    const toolCalls: Array<{ id: string; name: string; input: any }> = [];

    // content 可能是字符串（旧格式）或数组（新格式）
    if (typeof content === 'string') {
      return { text: content, toolCalls: [] };
    }

    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: block.input,
          });
        }
      }
    }

    return {
      text: textParts.join('\n'),
      toolCalls,
    };
  }

  /**
   * 执行工具
   */
  private async executeTool(toolName: string, input: any): Promise<ToolResult> {
    try {
      // 特殊处理交互工具
      if (toolName === 'request_interaction') {
        return await this.handleInteractionRequest(input);
      }

      // 构建工具上下文
      const context: ToolContext = {
        userId: this.userId,
        chatId: this.chatId,
        history: [],
        inputMessage: '',
        taskId: this.taskId,
      };

      // 执行工具
      const result = await this.toolRegistry.execute(toolName, input, context);

      return result;

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 处理交互请求
   */
  private async handleInteractionRequest(input: any): Promise<ToolResult> {
    try {
      const { type, question, options, default: defaultValue, placeholder, timeout } = input;

      console.log(`[APIAgentExecutor] 📤 请求用户交互: ${type} - ${question.substring(0, 50)}...`);

      // 构建交互请求
      const request: InteractionRequest = {
        interactionId: '',  // 由 InteractionManager 生成
        taskId: this.taskId,
        agentId: this.agentId,
        agentName: this.agentName,
        type,
        question,
        options,
        default: defaultValue,
        placeholder,
        timeout,
        chatId: this.chatId,
        userId: this.userId,
      };

      // 请求交互并等待响应
      const response: InteractionResponse = await this.interactionManager.requestInteraction(request);

      // 检查响应状态
      if (response.timeout) {
        return {
          success: false,
          error: '用户交互超时',
        };
      }

      if (response.cancelled) {
        return {
          success: false,
          error: '用户取消了交互',
        };
      }

      // 返回用户响应值
      return {
        success: true,
        data: {
          value: response.value,
        },
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 获取可用工具（转换为 Anthropic schemas）
   */
  private getAvailableTools(): any[] {
    const tools = this.toolRegistry.toAnthropicSchemas();

    // 添加交互工具
    tools.push({
      name: 'request_interaction',
      description: '请求用户交互（确认、选择或输入）以获取必要信息或决策。使用场景：需要用户确认某个操作、从多个选项中选择、或获取用户补充信息。',
      input_schema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['confirm', 'select', 'input'],
            description: '交互类型：confirm（确认是/否）、select（从选项中选择）、input（文本输入）',
          },
          question: {
            type: 'string',
            description: '向用户提出的问题或请求说明',
          },
          options: {
            type: 'array',
            description: '可选列表（仅用于 select 类型）',
            items: {
              type: 'object',
              properties: {
                value: { type: 'string', description: '选项值' },
                label: { type: 'string', description: '选项显示文本' },
                description: { type: 'string', description: '选项详细说明（可选）' },
              },
              required: ['value', 'label'],
            },
          },
          default: {
            type: 'string',
            description: '默认值（用于 confirm 和 input 类型）',
          },
          placeholder: {
            type: 'string',
            description: '输入提示文字（用于 input 类型）',
          },
          timeout: {
            type: 'number',
            description: '超时时间（毫秒，默认 5 分钟）',
          },
        },
        required: ['type', 'question'],
      },
    });

    return tools;
  }

  /**
   * 加载持久化记忆
   */
  private async loadMemory(): Promise<string> {
    try {
      const memoryFile = path.join(this.memoryDir, 'MEMORY.md');
      const exists = await fs.access(memoryFile).then(() => true).catch(() => false);

      if (!exists) {
        return '';
      }

      const content = await fs.readFile(memoryFile, 'utf-8');
      return content;

    } catch (error) {
      return '';
    }
  }

  /**
   * 保存新记忆
   */
  private async saveMemory(output: string): Promise<void> {
    try {
      const memoryFile = path.join(this.memoryDir, 'MEMORY.md');

      // 读取现有记忆
      let existingMemory = '';
      try {
        existingMemory = await fs.readFile(memoryFile, 'utf-8');
      } catch {}

      // 追加新记忆（简单实现）
      const timestamp = new Date().toISOString();
      const newMemory = `\n\n## ${timestamp}\n${output.substring(0, 500)}...\n`;

      await fs.writeFile(memoryFile, existingMemory + newMemory, 'utf-8');

      console.log(`[APIAgentExecutor] 记忆已保存: ${memoryFile}`);

    } catch (error) {
      console.error('[APIAgentExecutor] 保存记忆失败:', error);
    }
  }

  /**
   * 添加消息到对话历史（自动限制大小）
   */
  private addToHistory(message: { role: 'user' | 'assistant' | 'system'; content: string | Array<any> }): void {
    this.conversationHistory.push(message);

    // 限制历史大小，保留 system 消息
    if (this.conversationHistory.length > this.MAX_HISTORY_SIZE) {
      const systemMessages = this.conversationHistory.filter(m => m.role === 'system');
      const otherMessages = this.conversationHistory.filter(m => m.role !== 'system');
      // 保留最新的消息
      this.conversationHistory = [
        ...systemMessages,
        ...otherMessages.slice(-(this.MAX_HISTORY_SIZE - systemMessages.length))
      ];
    }
  }

  /**
   * 追加消息到当前会话
   */
  appendMessage(message: string): void {
    this.addToHistory({
      role: 'user',
      content: message,
    });
  }

  /**
   * 重置会话
   */
  reset(): void {
    this.conversationHistory = [];
  }

  /**
   * 发送进度事件
   */
  private emitProgress(turn: number, progress: {
    toolCall?: { name: string; input: any };
    message: string;
  }): void {
    try {
      this.eventBus.emit({
        type: 'task.progress' as any,
        taskId: this.agentId,
        agentId: this.agentId,
        agentName: this.agentName,
        progress: {
          turn,
          ...progress,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('[APIAgentExecutor] 发送进度事件失败:', error);
    }
  }

  /**
   * 增强 system prompt，添加工具说明
   *
   * 使用动态提示词系统，零硬编码
   */
  private enhanceSystemPromptWithTools(originalPrompt: string, tools: Tool[]): string {
    // 使用新的动态提示词系统
    const { agentName, systemPrompt: basePrompt } = this;

    // 提取能力信息
    const capabilities = this.parseCapabilities(basePrompt);

    // 构建动态提示词
    const dynamicPrompt = generateDynamicSystemPrompt({
      agentName,
      agentCapabilities: capabilities,
      taskDescription: this.getCurrentTask(),
      context: this.getCurrentContext(),
      mode: this.getExecutionMode(),
      availableTools: tools,
    });

    return dynamicPrompt;
  }

  /**
   * 从 system prompt 解析能力
   */
  private parseCapabilities(systemPrompt: string): string[] {
    // 简单实现：从 prompt 中提取能力信息
    // 实际可以从数据库或配置获取
    const lines = systemPrompt.split('\n');
    for (const line of lines) {
      if (line.includes('# 你的能力') || line.includes('# Core Capabilities')) {
        // 找到能力部分
        const startIdx = lines.indexOf(line);
        const capabilities: string[] = [];
        for (let i = startIdx + 1; i < lines.length; i++) {
          const capLine = lines[i].trim();
          if (capLine.startsWith('- ')) {
            capabilities.push(capLine.substring(2));
          } else if (capLine.startsWith('#') || capLine.trim() === '') {
            break;
          }
        }
        return capabilities;
      }
    }
    return ['general'];
  }

  /**
   * 获取当前任务描述
   */
  private getCurrentTask(): string {
    // 从 conversation history 中获取当前任务
    if (this.conversationHistory.length > 0) {
      const lastMessage = this.conversationHistory[this.conversationHistory.length - 1];
      if (lastMessage.role === 'user') {
        return lastMessage.content as string;
      }
    }
    return '执行任务';
  }

  /**
   * 获取当前上下文
   */
  private getCurrentContext(): string {
    // 返回任务相关上下文
    return `任务 ID: ${this.taskId}\nAgent ID: ${this.agentId}`;
  }

  /**
   * 获取执行模式
   */
  private getExecutionMode(): 'execute' | 'plan' | 'explore' {
    // 根据任务特征判断模式
    // 默认为 execute 模式
    return 'execute';
  }

  /**
   * 生成工具使用示例
   */
  private generateToolUsageExample(tool: any): string {
    // 交互工具示例
    if (tool.name === 'request_interaction') {
      return `request_interaction(
  type="select",
  question="请选择一个选项",
  options=[
    {label: "选项 A", value: "a"},
    {label: "选项 B", value: "b"}
  ]
)`;
    }

    // Bash 工具示例
    if (tool.name === 'Bash') {
      return `Bash(command="npm install")`;
    }

    // Read 工具示例
    if (tool.name === 'Read') {
      return `Read(filePath="src/index.ts")`;
    }

    // Write 工具示例
    if (tool.name === 'Write') {
      return `Write(
  filePath="src/hello.ts",
  content="console.log('Hello, World!');"
)`;
    }

    // Edit 工具示例
    if (tool.name === 'Edit') {
      return `Edit(
  filePath="src/index.ts",
  oldString="console.log('old')",
  newString="console.log('new')"
)`;
    }

    // Glob 工具示例
    if (tool.name === 'Glob') {
      return `Glob(pattern="**/*.ts")`;
    }

    // Grep 工具示例
    if (tool.name === 'Grep') {
      return `Grep(pattern="function.*test", path="src/", glob="*.ts")`;
    }

    // LS 工具示例
    if (tool.name === 'LS') {
      return `LS(path="src/")`;
    }

    return '';
  }

  /**
   * 获取工具使用指导（何时使用该工具）
   */
  private getToolUsageGuidance(toolName: string): string {
    const guidance: Record<string, string> = {
      'Bash': '当你需要运行 shell 命令、安装依赖、执行脚本、启动服务、与操作系统交互时使用',
      'Read': '当你需要读取文件内容、查看代码、检查配置文件时使用',
      'Write': '当你需要创建新文件、编写代码、生成配置文件或保存内容时使用',
      'Edit': '当你需要修改现有文件、修复 bug、更新配置或进行针对性更改时使用',
      'Glob': '当你需要按模式查找文件、定位特定类型文件或探索目录结构时使用',
      'Grep': '当你需要搜索文件内容、查找函数/类定义、定位变量使用时使用',
      'LS': '当你需要查看目录内容、了解项目组织或探索文件夹结构时使用',
      'request_interaction': '当你需要用户确认、从选项中选择或获取补充信息时使用',
    };

    return guidance[toolName] || '';
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

const executors = new Map<string, APIAgentExecutor>();

export function getAPIAgentExecutor(options: APIAgentExecuteOptions): APIAgentExecutor {
  const key = `${options.agentId}-${options.agentName}`;

  if (!executors.has(key)) {
    const executor = new APIAgentExecutor(options);
    executors.set(key, executor);
  }

  return executors.get(key)!;
}

export function clearExecutorCache(): void {
  executors.clear();
}
