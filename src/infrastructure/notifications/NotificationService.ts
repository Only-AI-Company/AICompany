/**
 * AI Company - Notification Service
 *
 * 统一的通知服务入口，管理所有渠道
 */

import type TelegramBot from 'node-telegram-bot-api';
import type {
  NotificationMessage,
  SendResult,
  InteractionResponse,
  UserIdentity,
  ButtonOption,
  FormattedContent
} from './types.js';
import type {
  INotificationChannel
} from './NotificationChannel.js';
import { TelegramChannel } from './adapters/TelegramAdapter.js';
import { CLIChannel } from './adapters/CLIAdapter.js';

/**
 * 通知服务单例
 */
class NotificationService {
  private channels = new Map<string, INotificationChannel>();
  private interactionHandlers = new Map<string, (response: InteractionResponse) => void>();

  /**
   * 注册渠道
   */
  registerChannel(channel: INotificationChannel): void {
    this.channels.set(channel.type, channel);

    // 如果渠道支持监听，启动监听
    if (channel.startListening) {
      channel.startListening((response) => this.handleInteraction(response));
    }
  }

  /**
   * 获取渠道
   */
  getChannel(channelType: string): INotificationChannel | undefined {
    return this.channels.get(channelType);
  }

  /**
   * 初始化 Telegram 渠道
   */
  initTelegram(bot: TelegramBot): void {
    this.registerChannel(new TelegramChannel(bot));
  }

  /**
   * 初始化 CLI 渠道
   */
  initCLI(): void {
    this.registerChannel(new CLIChannel());
  }

  /**
   * 发送消息
   */
  async send(message: NotificationMessage): Promise<SendResult> {
    const channel = this.channels.get(message.to.channel);
    if (!channel) {
      return {
        success: false,
        error: `未知渠道: ${message.to.channel}`
      };
    }

    return await channel.send(message);
  }

  /**
   * 发送纯文本消息（快捷方法）
   */
  async sendText(
    to: UserIdentity,
    text: string,
    options?: {
      subject?: string;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
    }
  ): Promise<SendResult> {
    return this.send({
      to,
      content: { text },
      ...options
    });
  }

  /**
   * 发送确认消息
   */
  async sendConfirm(
    to: UserIdentity,
    message: string,
    correlationId: string,
    options?: {
      timeout?: number;
      confirmLabel?: string;
      cancelLabel?: string;
    }
  ): Promise<SendResult> {
    const buttons: ButtonOption[] = [
      { id: 'confirm', label: options?.confirmLabel || '确认', style: 'success' },
      { id: 'cancel', label: options?.cancelLabel || '取消', style: 'danger' }
    ];

    return this.send({
      to,
      content: { text: message },
      interaction: {
        type: 'confirm',
        correlationId,
        timeout: options?.timeout || 300000, // 默认 5 分钟
        options: buttons
      }
    });
  }

  /**
   * 发送选择消息
   */
  async sendSelect(
    to: UserIdentity,
    message: string,
    correlationId: string,
    optionsList: Array<{ id: string; label: string; style?: ButtonOption['style'] }>,
    options?: {
      timeout?: number;
      placeholder?: string;
    }
  ): Promise<SendResult> {
    const buttons: ButtonOption[] = optionsList.map(opt => ({
      id: opt.id,
      label: opt.label,
      style: opt.style,
      metadata: { correlationId } // 自动注入 correlationId
    }));

    return this.send({
      to,
      content: { text: message },
      interaction: {
        type: 'select',
        correlationId,
        timeout: options?.timeout || 300000,
        options: buttons
      }
    });
  }

  /**
   * 发送输入消息
   */
  async sendInput(
    to: UserIdentity,
    message: string,
    correlationId: string,
    options?: {
      timeout?: number;
      placeholder?: string;
    }
  ): Promise<SendResult> {
    return this.send({
      to,
      content: { text: message },
      interaction: {
        type: 'input',
        correlationId,
        timeout: options?.timeout || 300000,
        placeholder: options?.placeholder || '请输入...'
      }
    });
  }

  /**
   * 注册交互处理器
   */
  onInteraction(correlationId: string, handler: (response: InteractionResponse) => void): void {
    this.interactionHandlers.set(correlationId, handler);
  }

  /**
   * 移除交互处理器
   */
  offInteraction(correlationId: string): void {
    this.interactionHandlers.delete(correlationId);
  }

  /**
   * 处理交互响应
   */
  private handleInteraction(response: InteractionResponse): void {
    const handler = this.interactionHandlers.get(response.correlationId);
    if (handler) {
      handler(response);
    }
  }

  /**
   * 编辑消息
   */
  async edit(channelType: string, messageId: string, newContent: string, chatId?: string | number): Promise<SendResult> {
    const channel = this.channels.get(channelType);
    if (!channel || !channel.edit) {
      return { success: false, error: '渠道不支持编辑' };
    }

    return await channel.edit(messageId, newContent, chatId);
  }

  /**
   * 删除消息
   */
  async delete(channelType: string, messageId: string, chatId?: string | number): Promise<boolean> {
    const channel = this.channels.get(channelType);
    if (!channel || !channel.delete) {
      return false;
    }

    return await channel.delete(messageId, chatId);
  }
}

// 单例导出
export const notificationService = new NotificationService();
export default notificationService;

// 也导出类型
export * from './types.js';
export * from './NotificationChannel.js';
export * from './adapters/index.js';
