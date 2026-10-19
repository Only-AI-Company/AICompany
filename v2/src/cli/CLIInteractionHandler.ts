/**
 * AI Company v2 - CLI 交互处理器
 *
 * 在 CLI 模式下处理 Agent 的交互请求：
 * - confirm: 确认是/否
 * - select: 从选项中选择
 * - input: 文本输入
 */

import { getEventBus, type InteractionEvent } from '../core/events/EventBus.js';
import { getInteractionManager } from '../core/events/InteractionManager.js';
import inquirer from 'inquirer';

/**
 * CLI 交互处理器
 */
export class CLIInteractionHandler {
  private eventBus = getEventBus();
  private interactionManager = getInteractionManager();
  private started = false;
  private unsubscribeFunctions: Array<() => void> = [];

  /**
   * 启动 CLI 交互处理器
   */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    console.log('[CLIInteractionHandler] Starting CLI interaction handler...');

    // 监听交互请求事件
    const unsubscribe = this.eventBus.on('interaction.requested' as any, this.handleInteractionRequest.bind(this));
    this.unsubscribeFunctions.push(unsubscribe);

    this.started = true;
    console.log('[CLIInteractionHandler] CLI interaction handler started');
  }

  /**
   * 停止 CLI 交互处理器
   */
  stop(): void {
    if (!this.started) {
      return;
    }

    console.log('[CLIInteractionHandler] Stopping CLI interaction handler...');

    // 清理所有监听器
    for (const unsubscribe of this.unsubscribeFunctions) {
      unsubscribe();
    }
    this.unsubscribeFunctions = [];

    this.started = false;
    console.log('[CLIInteractionHandler] CLI interaction handler stopped');
  }

  /**
   * 处理交互请求
   */
  private async handleInteractionRequest(event: InteractionEvent): Promise<void> {
    const { interactionId, interaction, taskId, agentName } = event;

    console.log(`\n[CLIInteractionHandler] 📤 交互请求：${interaction.type}`);
    console.log('─'.repeat(50));

    try {
      let value: any;

      switch (interaction.type) {
        case 'confirm':
          value = await this.handleConfirm(interaction.question, interaction.default);
          break;

        case 'select':
          value = await this.handleSelect(interaction.question, interaction.options);
          break;

        case 'input':
          value = await this.handleInput(
            interaction.question,
            interaction.placeholder,
            interaction.multiline
          );
          break;

        default:
          console.warn(`[CLIInteractionHandler] 未知的交互类型：${interaction.type}`);
          return;
      }

      // 将用户响应返回给 InteractionManager
      this.interactionManager.handleResponse(interactionId, value);

      console.log(`[CLIInteractionHandler] ✅ 用户已响应`);

    } catch (error: any) {
      console.error(`[CLIInteractionHandler] 交互处理失败：${error.message}`);

      // 取消交互
      this.interactionManager.cancelInteraction(interactionId);
    }

    console.log('─'.repeat(50));
  }

  /**
   * 处理确认交互
   */
  private async handleConfirm(question: string, defaultValue?: any): Promise<boolean> {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: question,
        default: defaultValue ?? true,
      },
    ]);

    return confirm;
  }

  /**
   * 处理选择交互
   */
  private async handleSelect(
    question: string,
    options?: Array<{ value: string; label: string; description?: string }>
  ): Promise<string> {
    if (!options || options.length === 0) {
      throw new Error('选择交互需要提供选项');
    }

    const choices = options.map(opt => ({
      name: opt.label + (opt.description ? ` - ${opt.description}` : ''),
      value: opt.value,
    }));

    const { selection } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selection',
        message: question,
        choices,
      },
    ]);

    return selection;
  }

  /**
   * 处理输入交互
   */
  private async handleInput(
    question: string,
    placeholder?: string,
    multiline?: boolean
  ): Promise<string> {
    const { input } = await inquirer.prompt([
      {
        type: multiline ? 'editor' : 'input',
        name: 'input',
        message: question,
        default: placeholder,
      },
    ]);

    return input;
  }
}

// ============================================================================
// 单例
// ============================================================================

let cliInteractionHandlerInstance: CLIInteractionHandler | null = null;

export function getCLIInteractionHandler(): CLIInteractionHandler {
  if (!cliInteractionHandlerInstance) {
    cliInteractionHandlerInstance = new CLIInteractionHandler();
  }
  return cliInteractionHandlerInstance;
}

export function resetCLIInteractionHandler(): void {
  if (cliInteractionHandlerInstance) {
    cliInteractionHandlerInstance.stop();
    cliInteractionHandlerInstance = null;
  }
}
