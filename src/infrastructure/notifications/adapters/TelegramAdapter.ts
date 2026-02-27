/**
 * AI Company - Telegram Channel Adapter
 *
 * Telegram 渠道适配器
 */

import type TelegramBot from 'node-telegram-bot-api';
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
 * Telegram 格式化工具
 */
class TelegramFormatter {
  static escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  static bold(text: string): string {
    return `<b>${this.escape(text)}</b>`;
  }

  static italic(text: string): string {
    return `<i>${this.escape(text)}</i>`;
  }

  static code(text: string): string {
    return `<code>${this.escape(text)}</code>`;
  }

  static pre(text: string): string {
    return `<pre>${this.escape(text)}</pre>`;
  }

  static h1(text: string): string {
    return `<b>${this.escape(text).toUpperCase()}</b>\n`;
  }

  static h2(text: string): string {
    return `<b>${this.escape(text)}</b>\n`;
  }

  /**
   * 将通用按钮格式转换为 Telegram inline keyboard
   */
  static buildInlineKeyboard(options: ButtonOption[]): TelegramBot.InlineKeyboardButton[][] {
    const rows: TelegramBot.InlineKeyboardButton[][] = [];

    for (const option of options) {
      const button: TelegramBot.InlineKeyboardButton = {
        text: option.label,
        callback_data: JSON.stringify({
          id: option.id,
          metadata: option.metadata || {}
        })
      };

      // 根据样式设置
      if (option.style === 'danger') {
        button.text = `❌ ${option.label}`;
      } else if (option.style === 'success') {
        button.text = `✅ ${option.label}`;
      } else if (option.style === 'primary') {
        button.text = `🔵 ${option.label}`;
      }

      rows.push([button]);
    }

    return rows;
  }

  /**
   * 格式化消息内容
   */
  static formatContent(content: FormattedContent): string {
    if (content.html) {
      return content.html;
    }
    if (content.markdown) {
      // 转换 markdown 为 HTML（简单实现）
      return content.markdown
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/`(.*?)`/g, '<code>$1</code>');
    }
    return this.escape(content.text);
  }
}

/**
 * Telegram 渠道适配器
 */
export class TelegramChannel implements INotificationChannel {
  readonly type = 'telegram';

  private bot: TelegramBot;
  private interactionCallback?: (response: InteractionResponse) => void;
  private correlationMap = new Map<string, { userIdentity: UserIdentity; timeout?: NodeJS.Timeout }>();

  constructor(bot: TelegramBot) {
    this.bot = bot;

    // 设置 callback query 处理
    this.bot.on('callback_query', (query) => this.handleCallbackQuery(query));
  }

  getCapabilities(): ChannelCapabilities {
    return {
      interactions: ['confirm', 'select', 'button', 'inline'],
      supportsHTML: true,
      supportsMarkdown: false,
      supportsAttachments: true,
      supportedAttachmentTypes: ['photo', 'document', 'video', 'audio'],
      supportsEditing: true,
      supportsDeleting: true,
      maxMessageLength: 4096
    };
  }

  async send(message: NotificationMessage): Promise<SendResult> {
    const { to, content, interaction, attachments } = message;

    try {
      // 格式化内容
      const formattedText = TelegramFormatter.formatContent(content);

      // 构建发送选项
      const options: TelegramBot.SendMessageOptions = {
        parse_mode: 'HTML'
      };

      // 添加交互按钮
      if (interaction?.options && interaction.options.length > 0) {
        options.reply_markup = {
          inline_keyboard: TelegramFormatter.buildInlineKeyboard(interaction.options)
        };
      }

      // 发送消息
      const sentMsg = await this.bot.sendMessage(to.chatId as number, formattedText, options);

      // 如果有交互配置，记录 correlation ID
      if (interaction?.correlationId) {
        this.correlationMap.set(interaction.correlationId, {
          userIdentity: to,
          timeout: interaction.timeout ? setTimeout(() => {
            this.correlationMap.delete(interaction.correlationId!);
          }, interaction.timeout) : undefined
        });
      }

      // 发送附件
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          await this.sendAttachment(to.chatId as number, attachment);
        }
      }

      return {
        success: true,
        messageId: message.id,
        channelMessageId: sentMsg.message_id.toString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async edit(messageId: string, newContent: string, chatId?: string | number): Promise<SendResult> {
    try {
      const options: any = { parse_mode: 'HTML' };

      if (chatId) {
        options.chat_id = chatId;
        options.message_id = parseInt(messageId);
        await this.bot.editMessageText(newContent, options);
      } else {
        options.message_id = parseInt(messageId);
        await this.bot.editMessageText(newContent, options);
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async delete(messageId: string, chatId?: string | number): Promise<boolean> {
    try {
      if (chatId) {
        await this.bot.deleteMessage(chatId, parseInt(messageId));
      } else {
        await this.bot.deleteMessage(parseInt(messageId), chatId as any);
      }
      return true;
    } catch {
      return false;
    }
  }

  startListening(callback: (response: InteractionResponse) => void): void {
    this.interactionCallback = callback;
  }

  stopListening(): void {
    this.interactionCallback = undefined;
  }

  /**
   * 处理回调查询（按钮点击）
   */
  private async handleCallbackQuery(query: TelegramBot.CallbackQuery) {
    if (!query.data || !query.message) return;

    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;

    try {
      // 解析 callback_data
      const data = JSON.parse(query.data);
      const { id, metadata } = data;

      // 查找对应的 correlationId
      // 简化实现：从 metadata 中获取
      const correlationId = metadata?.correlationId;

      if (!correlationId || !this.interactionCallback) {
        await this.bot.answerCallbackQuery(query.id, { text: '操作已过期' });
        return;
      }

      const stored = this.correlationMap.get(correlationId);
      if (!stored) {
        await this.bot.answerCallbackQuery(query.id, { text: '操作已超时' });
        return;
      }

      // 构建交互响应
      const response: InteractionResponse = {
        correlationId,
        userIdentity: stored.userIdentity,
        action: id,
        data: metadata,
        timestamp: Date.now()
      };

      // 调用回调
      this.interactionCallback(response);

      // 回应 callback
      await this.bot.answerCallbackQuery(query.id, { text: '✅' });

      // 清理
      if (stored.timeout) {
        clearTimeout(stored.timeout);
      }
      this.correlationMap.delete(correlationId);
    } catch (error) {
      console.error('Failed to handle callback query:', error);
      await this.bot.answerCallbackQuery(query.id, { text: '操作失败' });
    }
  }

  /**
   * 发送附件
   */
  private async sendAttachment(chatId: number, attachment: any): Promise<void> {
    // 实现附件发送
    // TODO: 根据附件类型调用不同的 API
  }
}
