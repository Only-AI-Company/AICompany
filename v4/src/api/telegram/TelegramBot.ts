/**
 * Telegram Bot - 外部接口层
 *
 * 负责：
 * - Telegram 消息收发
 * - 按钮交互
 * - 长轮询/Webhook
 */

import TelegramBot from 'node-telegram-bot-api';
import { EventEmitter } from 'events';
import pino from 'pino';

export interface TelegramConfig {
  token: string;
  polling?: boolean;
  webhookUrl?: string;
}

export interface TelegramMessage {
  id: string;
  chatId: number;
  userId: number;
  text?: string;
  type: 'text' | 'callback_query';
  timestamp: number;
  data?: string;  // callback data
  messageId: number;
}

export class TelegramIntegration extends EventEmitter {
  private bot: TelegramBot;
  private logger: pino.Logger;

  constructor(config: TelegramConfig) {
    super();
    this.logger = pino({ name: 'telegram-bot' });

    this.bot = new TelegramBot(config.token, {
      polling: config.polling !== false
    });

    this.setupHandlers();
    this.logger.info('Telegram bot initialized');
  }

  private setupHandlers(): void {
    // 处理文本消息
    this.bot.on('message', (msg) => {
      if (!msg.text) return;

      const telegramMsg: TelegramMessage = {
        id: `${msg.chat.id}-${msg.message_id}`,
        chatId: msg.chat.id,
        userId: msg.from?.id || 0,
        text: msg.text,
        type: 'text',
        timestamp: Date.now(),
        messageId: msg.message_id
      };

      this.logger.info({ chatId: telegramMsg.chatId, text: telegramMsg.text }, 'Received message');
      this.emit('message', telegramMsg);
    });

    // 处理回调按钮
    this.bot.on('callback_query', (query) => {
      const telegramMsg: TelegramMessage = {
        id: `callback-${query.id}`,
        chatId: query.message?.chat.id || 0,
        userId: query.from.id,
        type: 'callback_query',
        timestamp: Date.now(),
        data: query.data || undefined,
        messageId: query.message?.message_id || 0
      };

      this.logger.info({ chatId: telegramMsg.chatId, data: telegramMsg.data }, 'Received callback');
      this.emit('callback', telegramMsg);

      // 确认回调
      this.bot.answerCallbackQuery(query.id);
    });

    // 处理错误
    this.bot.on('polling_error', (error) => {
      this.logger.error({ error }, 'Polling error');
    });

    this.bot.on('error', (error) => {
      this.logger.error({ error }, 'Bot error');
    });
  }

  // ============================================================================
  // 消息发送
  // ============================================================================

  /**
   * 发送文本消息
   */
  async sendMessage(
    chatId: number,
    text: string,
    options?: SendMessageOptions
  ): Promise<number> {
    try {
      const message = await this.bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        ...options
      });
      this.logger.debug({ chatId, messageId: message.message_id }, 'Message sent');
      return message.message_id;
    } catch (error) {
      this.logger.error({ chatId, error }, 'Failed to send message');
      throw error;
    }
  }

  /**
   * 发送带按钮的消息
   */
  async sendMessageWithButtons(
    chatId: number,
    text: string,
    buttons: ButtonConfig[]
  ): Promise<number> {
    const keyboard = this.buildKeyboard(buttons);

    try {
      const message = await this.bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
      this.logger.debug({ chatId, messageId: message.message_id }, 'Message with buttons sent');
      return message.message_id;
    } catch (error) {
      this.logger.error({ chatId, error }, 'Failed to send message with buttons');
      throw error;
    }
  }

  /**
   * 编辑消息
   */
  async editMessage(chatId: number, messageId: number, text: string): Promise<void> {
    try {
      await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });
      this.logger.debug({ chatId, messageId }, 'Message edited');
    } catch (error) {
      this.logger.error({ chatId, messageId, error }, 'Failed to edit message');
    }
  }

  /**
   * 删除消息
   */
  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    try {
      await this.bot.deleteMessage(chatId, messageId);
      this.logger.debug({ chatId, messageId }, 'Message deleted');
    } catch (error) {
      this.logger.error({ chatId, messageId, error }, 'Failed to delete message');
    }
  }

  /**
   * 发送文件
   */
  async sendFile(
    chatId: number,
    type: 'photo' | 'document' | 'audio' | 'video',
    file: Buffer | string,
    caption?: string
  ): Promise<void> {
    try {
      const method = `send${type.charAt(0).toUpperCase() + type.slice(1)}`;
      await (this.bot as any)[method](chatId, file, {
        caption,
        parse_mode: 'Markdown'
      });
      this.logger.debug({ chatId, type }, 'File sent');
    } catch (error) {
      this.logger.error({ chatId, type, error }, 'Failed to send file');
      throw error;
    }
  }

  /**
   * 发送进度更新
   */
  async sendProgress(
    chatId: number,
    messageId: number,
    progress: number,
    status: string
  ): Promise<void> {
    const text = `${status}\n\n${this.buildProgressBar(progress)} ${Math.round(progress)}%`;
    await this.editMessage(chatId, messageId, text);
  }

  // ============================================================================
  // 交互
  // ============================================================================

  /**
   * 请求用户选择
   */
  async requestSelection(
    chatId: number,
    question: string,
    options: string[]
  ): Promise<string> {
    return new Promise((resolve) => {
      const handler = (msg: TelegramMessage) => {
        if (msg.chatId === chatId && msg.type === 'callback_query' && options.includes(msg.data!)) {
          this.removeListener('callback', handler);
          resolve(msg.data!);
        }
      };

      this.on('callback', handler);

      // 5 分钟超时
      setTimeout(() => {
        this.removeListener('callback', handler);
        resolve('');
      }, 300000);

      this.sendMessageWithButtons(chatId, question, options.map(opt => ({
        text: opt,
        callbackData: opt
      })));
    });
  }

  /**
   * 请求确认
   */
  async requestConfirmation(chatId: number, question: string): Promise<boolean> {
    const result = await this.requestSelection(chatId, question, ['✅ 确认', '❌ 取消']);
    return result === '✅ 确认';
  }

  /**
   * 请求文本输入
   */
  async requestInput(
    chatId: number,
    question: string,
    timeout: number = 300000
  ): Promise<string> {
    return new Promise((resolve) => {
      const handler = (msg: TelegramMessage) => {
        if (msg.chatId === chatId && msg.type === 'text') {
          this.removeListener('message', handler);
          resolve(msg.text || '');
        }
      };

      this.on('message', handler);

      setTimeout(() => {
        this.removeListener('message', handler);
        resolve('');
      }, timeout);

      this.sendMessage(chatId, question);
    });
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private buildKeyboard(buttons: ButtonConfig[]): any[] {
    const keyboard: any[] = [];
    let row: any[] = [];

    for (const button of buttons) {
      row.push({
        text: button.text,
        callback_data: button.callbackData
      });

      if (button.newLine || row.length >= 2) {
        keyboard.push(row);
        row = [];
      }
    }

    if (row.length > 0) {
      keyboard.push(row);
    }

    return keyboard;
  }

  private buildProgressBar(progress: number): string {
    const filled = Math.round(progress * 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * 获取聊天信息
   */
  async getChat(chatId: number): Promise<any> {
    return this.bot.getChat(chatId);
  }

  /**
   * 获取用户信息
   */
  async getUser(userId: number): Promise<any> {
    // Telegram 不直接支持获取用户信息，需要通过聊天
    return { id: userId };
  }

  /**
   * 关闭 Bot
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      this.bot.close();
      this.logger.info('Telegram bot closed');
      resolve();
    });
  }
}

// ============================================================================
// 类型定义
// ============================================================================

interface SendMessageOptions {
  reply_to_message_id?: number;
  disable_notification?: boolean;
}

interface ButtonConfig {
  text: string;
  callbackData: string;
  newLine?: boolean;
}

// ============================================================================
// 消息格式化
// ============================================================================

export function formatMessage(text: string): string {
  // 转义 Markdown 特殊字符
  return text
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/`/g, '\\`');
}

export function formatCode(code: string, language: string = ''): string {
  return `\`\`\`${language}\n${code}\n\`\`\``;
}

export function formatTable(rows: string[][], headers?: string[]): string {
  const allRows = headers ? [headers, ...rows] : rows;
  const colWidths = allRows.reduce((widths, row) => {
    return row.map((cell, i) => Math.max(widths[i] || 0, cell.length));
  }, [] as number[]);

  return allRows.map((row, i) => {
    const cells = row.map((cell, j) => cell.padEnd(colWidths[j]));
    const line = cells.join(' │ ');
    if (i === 0 && headers) {
      return line + '\n' + '─'.repeat(line.length);
    }
    return line;
  }).join('\n');
}
