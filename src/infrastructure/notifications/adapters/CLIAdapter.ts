/**
 * AI Company - CLI Channel Adapter
 *
 * CLI 渠道适配器
 */

import readline from 'readline';
import type {
  NotificationMessage,
  SendResult,
  InteractionResponse,
  FormattedContent,
  ButtonOption,
  UserIdentity
} from '../types.js';
import type {
  INotificationChannel,
  ChannelCapabilities
} from '../NotificationChannel.js';

/**
 * CLI 格式化工具
 */
class CLIFormatter {
  static bold(text: string): string {
    return `\x1b[1m${text}\x1b[0m`;
  }

  static dim(text: string): string {
    return `\x1b[2m${text}\x1b[0m`;
  }

  static green(text: string): string {
    return `\x1b[32m${text}\x1b[0m`;
  }

  static red(text: string): string {
    return `\x1b[31m${text}\x1b[0m`;
  }

  static yellow(text: string): string {
    return `\x1b[33m${text}\x1b[0m`;
  }

  static blue(text: string): string {
    return `\x1b[34m${text}\x1b[0m`;
  }

  static h1(text: string): string {
    return `\n${this.bold(this.blue('► ' + text.toUpperCase()))}\n`;
  }

  static h2(text: string): string {
    return `\n${this.bold(text)}\n`;
  }

  /**
   * 格式化消息内容
   */
  static formatContent(content: FormattedContent): string {
    let text = content.text;

    if (content.html) {
      // 简单的 HTML → ANSI 转换
      text = content.html
        .replace(/<b>(.*?)<\/b>/gi, this.bold('$1'))
        .replace(/<i>(.*?)<\/i>/gi, (match, p1) => `\x1b[3m${p1}\x1b[23m`)
        .replace(/<code>(.*?)<\/code>/gi, this.dim('$1'))
        .replace(/<pre>(.*?)<\/pre>/gis, this.dim('$1'))
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    }

    return text;
  }

  /**
   * 渲染选项列表
   */
  static renderOptions(options: ButtonOption[]): string {
    let output = '\n' + this.bold('选项:') + '\n';
    options.forEach((opt, index) => {
      const icon = opt.style === 'danger' ? '❌' :
                   opt.style === 'success' ? '✅' :
                   opt.style === 'primary' ? '🔵' : '▸';
      output += `  ${index + 1}. ${icon} ${opt.label}\n`;
    });
    return output;
  }
}

/**
 * CLI 渠道适配器
 */
export class CLIChannel implements INotificationChannel {
  readonly type = 'cli';

  private rl: readline.Interface;
  private interactionCallback?: (response: InteractionResponse) => void;
  private currentInteraction?: {
    correlationId: string;
    userIdentity: UserIdentity;
    options?: ButtonOption[];
    timeout?: NodeJS.Timeout;
  };

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  getCapabilities(): ChannelCapabilities {
    return {
      interactions: ['confirm', 'select', 'input'],
      supportsHTML: false,
      supportsMarkdown: false,
      supportsAttachments: false,
      supportedAttachmentTypes: [],
      supportsEditing: false,
      supportsDeleting: false,
      maxMessageLength: Infinity
    };
  }

  async send(message: NotificationMessage): Promise<SendResult> {
    const { content, interaction } = message;

    try {
      // 格式化并输出内容
      const formattedText = CLIFormatter.formatContent(content);
      process.stdout.write(formattedText + '\n');

      // 处理交互
      if (interaction?.type && interaction.type !== 'none') {
        return await this.handleMessageInteraction(message);
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  startListening(callback: (response: InteractionResponse) => void): void {
    this.interactionCallback = callback;
  }

  stopListening(): void {
    this.interactionCallback = undefined;
  }

  /**
   * 处理消息内的交互
   */
  private async handleMessageInteraction(message: NotificationMessage): Promise<SendResult> {
    const { interaction, to } = message;

    if (!interaction) {
      return { success: true };
    }

    // 保存当前交互上下文
    this.currentInteraction = {
      correlationId: interaction.correlationId || '',
      userIdentity: to,
      options: interaction.options,
      timeout: interaction.timeout ? setTimeout(() => {
        console.log(CLIFormatter.yellow('\n⏱️  操作已超时'));
        this.currentInteraction = undefined;
      }, interaction.timeout) : undefined
    };

    switch (interaction.type) {
      case 'confirm':
        return await this.promptConfirm();

      case 'select':
        return await this.promptSelect(interaction.options || []);

      case 'input':
        return await this.promptInput(interaction.placeholder || '请输入: ');

      default:
        return { success: true };
    }
  }

  /**
   * 确认提示
   */
  private async promptConfirm(): Promise<SendResult> {
    const options: ButtonOption[] = [
      { id: 'confirm', label: '是', style: 'success' },
      { id: 'cancel', label: '否', style: 'danger' }
    ];
    return await this.promptSelect(options);
  }

  /**
   * 选择提示
   */
  private async promptSelect(options: ButtonOption[]): Promise<SendResult> {
    if (!this.currentInteraction || !this.interactionCallback) {
      return { success: false, error: '无活跃交互' };
    }

    // 显示选项
    process.stdout.write(CLIFormatter.renderOptions(options));

    // 等待用户输入
    const answer = await this.question('\n请选择 (输入序号): ');

    // 解析输入
    const index = parseInt(answer.trim()) - 1;
    if (index >= 0 && index < options.length) {
      const selected = options[index];

      // 触发回调
      this.interactionCallback({
        correlationId: this.currentInteraction.correlationId,
        userIdentity: this.currentInteraction.userIdentity,
        action: selected.id,
        data: selected.metadata,
        timestamp: Date.now()
      });

      // 清理
      this.clearCurrentInteraction();

      return { success: true };
    }

    return { success: false, error: '无效选择' };
  }

  /**
   * 输入提示
   */
  private async promptInput(prompt: string): Promise<SendResult> {
    if (!this.currentInteraction || !this.interactionCallback) {
      return { success: false, error: '无活跃交互' };
    }

    const answer = await this.question(prompt);

    // 触发回调
    this.interactionCallback({
      correlationId: this.currentInteraction.correlationId,
      userIdentity: this.currentInteraction.userIdentity,
      action: 'input',
      data: { text: answer },
      timestamp: Date.now()
    });

    // 清理
    this.clearCurrentInteraction();

    return { success: true };
  }

  /**
   * 提问辅助方法
   */
  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  }

  /**
   * 清理当前交互
   */
  private clearCurrentInteraction(): void {
    if (this.currentInteraction?.timeout) {
      clearTimeout(this.currentInteraction.timeout);
    }
    this.currentInteraction = undefined;
  }

  /**
   * 关闭适配器
   */
  close(): void {
    this.rl.close();
  }
}
