/**
 * AI Company v2 - CEO Chat Handler
 *
 * 处理用户与 CEO 的多轮对话
 */

import { getProvider } from '../core/ai/AIProvider.js';
import { getConfigManager } from '../config/ConfigManager.js';
import type { UserConfig } from '../config/ConfigManager.js';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ChatMessage {
  role: 'user' | 'ceo';
  content: string;
  timestamp: number;
}

interface ChatHistory {
  messages: ChatMessage[];
  lastUpdated: number;
}

export class CEOChatHandler {
  private config: UserConfig;
  private historyFile: string;
  private history: ChatHistory;
  private systemPrompt: string;

  constructor(config: UserConfig) {
    this.config = config;
    this.historyFile = path.join(config.workdir, '.chat-history.json');
    this.history = { messages: [], lastUpdated: Date.now() };
    this.systemPrompt = this.buildCEOPrompt();
  }

  /**
   * 构建 CEO System Prompt
   */
  private buildCEOPrompt(): string {
    return `# CEO 身份

姓名：CEO
角色：AI Company CEO
职责：分析需求，决策执行，协调资源

# 工作方式

用户向你表达需求时：

1. **理解意图**
   - 判断用户要的是：方案、执行、还是其他
   - 不确定时，使用 request_interaction 工具确认

2. **决策执行**
   - 如果需要执行，调用合适的 Agent 完成任务
   - 如果只需要回答，直接给出答案

3. **确保完成**
   - 任务真正完成才算结束
   - 不要给"方案"，要给"结果"

# 可用资源

- Agent 团队：用于执行具体任务
- 工具系统：45 个通用工具
- 数据库：员工、任务、目标记录

# 对话原则

- 简洁直接，不要废话
- 理解了就去做，不要反复确认
- 需要执行的任务，调用 Agent 完成
- 只回答问题，不要主动提出计划`;
  }

  /**
   * 启动对话模式
   */
  async start(): Promise<void> {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║           与 CEO 对话                            ║');
    console.log('║                                              ║');
    console.log('║  输入您的需求，CEO 会分析并执行或回答            ║');
    console.log('║  输入 "exit" 或 "quit" 退出                          ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    // 加载历史记录
    await this.loadHistory();

    const readline = (await import('readline')).createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      let exiting = false;

      while (!exiting) {
        const input = await this.question(readline, '\n> ');

        if (!input.trim()) continue;

        // 检查退出命令
        if (this.isExitCommand(input)) {
          exiting = true;
          break;
        }

        // 添加用户消息到历史
        this.addMessage('user', input);

        // CEO 处理
        const response = await this.processMessage(input);

        // 显示 CEO 回复
        console.log(`\nCEO: ${response}\n`);

        // 添加 CEO 消息到历史
        this.addMessage('ceo', response);

        // 保存历史
        await this.saveHistory();
      }

      console.log('CEO: 再见！\n');

    } finally {
      readline.close();
    }
  }

  /**
   * 处理用户消息
   */
  async processMessage(userMessage: string): Promise<string> {
    const { getToolRegistry } = await import('../core/tools/ToolRegistry.js');
    const toolRegistry = getToolRegistry();

    // 构建 CEO 对话上下文
    const contextMessages = this.buildContextMessages(userMessage);

    // 分离 system 消息和 user 消息
    const systemMessage = contextMessages.find((m: any) => m.role === 'system');
    const userMessages = contextMessages.filter((m: any) => m.role !== 'system');

    // 准备工具
    const tools = toolRegistry.toAnthropicSchemas();

    // 调用 LLM
    const { getProvider } = await import('../core/ai/AIProvider.js');
    const provider = getProvider();

    const response = await provider.messagesWithTools(
      userMessages,
      tools,
      systemMessage?.content
    );

    // 处理工具调用
    // content 可能是 string（无工具）或数组（有工具）
    const contentBlocks: any[] = typeof response.content === 'string'
      ? [{ type: 'text', text: response.content }]
      : response.content;

    if (response.stopReason === 'tool_use') {
      const toolName = contentBlocks?.find((block: any) =>
        block.type === 'tool_use'
      )?.name;

      if (toolName === 'request_interaction') {
        // 需要用户交互
        return await this.handleInteraction({ ...response, content: contentBlocks });
      } else {
        // 其他工具调用暂不支持，返回文本响应
        return this.extractTextContent({ ...response, content: contentBlocks });
      }
    }

    return this.extractTextContent({ ...response, content: contentBlocks });
  }

  /**
   * 构建对话上下文消息
   */
  private buildContextMessages(userMessage: string): any[] {
    const messages: any[] = [
      {
        role: 'system',
        content: this.systemPrompt,
      },
    ];

    // 添加最近的历史消息（最近 10 条）
    const recentHistory = this.history.messages.slice(-10);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'ceo' ? 'assistant' : 'user',
        content: msg.content,
      });
    }

    // 添加当前用户消息
    messages.push({
      role: 'user',
      content: userMessage,
    });

    return messages;
  }

  /**
   * 处理用户交互请求
   */
  private async handleInteraction(llmResponse: any): Promise<string> {
    // 提取交互参数
    const toolBlock = llmResponse.content?.find((block: any) =>
      block.type === 'tool_use' && block.name === 'request_interaction'
    );

    if (!toolBlock) {
      return '处理交互请求时出错';
    }

    const input = toolBlock.input;
    const type = input?.type;
    const question = input?.question;

    if (type === 'confirm') {
      const readline = (await import('readline')).createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      try {
        const answer = await this.question(readline, `\n[CEO] ${question} (y/n): `);
        readline.close();

        const confirmed = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';

        return confirmed ? '用户确认继续' : '用户取消操作';
      } catch {
        readline.close();
        return '操作取消';
      }
    }

    return '交互请求处理完成';
  }

  /**
   * 提取文本内容
   */
  private extractTextContent(llmResponse: any): string {
    const textBlocks = llmResponse.content?.filter((block: any) =>
      block.type === 'text'
    );

    if (!textBlocks || textBlocks.length === 0) {
      return '处理响应时出错';
    }

    return textBlocks.map((block: any) => block.text).join('\n');
  }

  /**
   * 从历史记录加载
   */
  private async loadHistory(): Promise<void> {
    try {
      const data = await fs.readFile(this.historyFile, 'utf-8');
      this.history = JSON.parse(data);
    } catch {
      // 文件不存在，使用空历史
      this.history = { messages: [], lastUpdated: Date.now() };
    }
  }

  /**
   * 保存历史记录
   */
  private async saveHistory(): Promise<void> {
    this.history.lastUpdated = Date.now();
    await fs.writeFile(
      this.historyFile,
      JSON.stringify(this.history, null, 2),
      'utf-8'
    );
  }

  /**
   * 添加消息到历史
   */
  private addMessage(role: 'user' | 'ceo', content: string): void {
    this.history.messages.push({
      role,
      content,
      timestamp: Date.now(),
    });

    // 限制历史记录长度
    if (this.history.messages.length > 100) {
      this.history.messages = this.history.messages.slice(-50);
    }
  }

  /**
   * 显示对话历史
   */
  async showHistory(): Promise<void> {
    await this.loadHistory();

    if (this.history.messages.length === 0) {
      console.log('\n暂无对话记录\n');
      return;
    }

    console.log('\n=== 对话历史 ===\n');

    for (const msg of this.history.messages) {
      const name = msg.role === 'ceo' ? 'CEO' : '你';
      const timestamp = new Date(msg.timestamp).toLocaleTimeString();
      console.log(`[${timestamp}] ${name}: ${msg.content}\n`);
    }
  }

  /**
   * 检查是否是退出命令
   */
  private isExitCommand(input: string): boolean {
    const exitCommands = ['exit', 'quit', 'bye', 'byebye', '退出', '再见'];
    return exitCommands.includes(input.toLowerCase().trim());
  }

  /**
   * 辅助方法：提问
   */
  private question(readline: any, prompt: string): Promise<string> {
    return new Promise((resolve) => {
      readline.question(prompt, (answer: string) => {
        resolve(answer);
      });
    });
  }
}

// 单例
let handlerInstance: CEOChatHandler | null = null;

export function getCEOChatHandler(config: UserConfig): CEOChatHandler {
  if (!handlerInstance) {
    handlerInstance = new CEOChatHandler(config);
  }
  return handlerInstance;
}
