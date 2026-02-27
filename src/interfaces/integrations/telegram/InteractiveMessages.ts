/**
 * AI Company - Telegram Interactive Messages
 *
 * 通用的交互式消息组件
 */

import type TelegramBot from 'node-telegram-bot-api';
import { notificationService } from '../../../infrastructure/notifications/index.js';

/**
 * 通用按钮样式
 */
export enum ButtonStyle {
  DEFAULT = 'default',
  PRIMARY = 'primary',
  DANGER = 'danger',
  SUCCESS = 'success'
}

/**
 * 交互式消息构建器
 */
export class InteractiveMessage {
  private to: { channel: 'telegram'; chatId: number; userId: string };
  private title?: string;
  private content: string[] = [];
  private buttons: Array<{
    id: string;
    label: string;
    style?: ButtonStyle;
    row?: number;
  }> = [];

  constructor(chatId: number) {
    this.to = {
      channel: 'telegram',
      chatId,
      userId: String(chatId)
    };
  }

  /**
   * 设置标题
   */
  setTitle(title: string): this {
    this.title = title;
    return this;
  }

  /**
   * 添加内容段落
   */
  addContent(text: string, format?: 'bold' | 'italic' | 'code' | 'pre'): this {
    let formatted = text;
    if (format === 'bold') formatted = `<b>${text}</b>`;
    if (format === 'italic') formatted = `<i>${text}</i>`;
    if (format === 'code') formatted = `<code>${text}</code>`;
    if (format === 'pre') formatted = `<pre>${text}</pre>`;

    this.content.push(formatted);
    return this;
  }

  /**
   * 添加分隔线
   */
  addSeparator(): this {
    this.content.push('─'.repeat(30));
    return this;
  }

  /**
   * 添加列表项
   */
  addListItem(label: string, value?: string, indent: number = 0): this {
    const prefix = '  '.repeat(indent);
    if (value) {
      this.content.push(`${prefix}• ${label}: ${value}`);
    } else {
      this.content.push(`${prefix}• ${label}`);
    }
    return this;
  }

  /**
   * 添加按钮
   */
  addButton(id: string, label: string, style?: ButtonStyle, row?: number): this {
    this.buttons.push({ id, label, style, row });
    return this;
  }

  /**
   * 添加确认/取消按钮
   */
  addConfirmCancel(confirmLabel = '确认', cancelLabel = '取消'): this {
    this.addButton('confirm', confirmLabel, ButtonStyle.SUCCESS, 0);
    this.addButton('cancel', cancelLabel, ButtonStyle.DANGER, 0);
    return this;
  }

  /**
   * 添加是/否按钮
   */
  addYesNo(): this {
    this.addButton('yes', '是', ButtonStyle.SUCCESS, 0);
    this.addButton('no', '否', ButtonStyle.DANGER, 0);
    return this;
  }

  /**
   * 构建并发送消息
   */
  async send(correlationId?: string): Promise<string | null> {
    const messageText = this.buildText();

    // 构建按钮（按行分组）
    const buttonRows = this.groupButtonsByRow();
    const buttons = buttonRows.map(row => ({
      id: row[0].id,
      label: row[0].label,
      style: row[0].style,
      metadata: { correlationId }
    }));

    const result = await notificationService.send({
      to: this.to,
      content: {
        text: messageText,
        html: messageText
      },
      interaction: buttons.length > 0 ? {
        type: 'button',
        correlationId,
        options: buttons,
        timeout: 300000 // 5 分钟
      } : undefined
    });

    return result.channelMessageId || null;
  }

  /**
   * 构建文本
   */
  private buildText(): string {
    let text = '';

    if (this.title) {
      text += `<b>${this.title.toUpperCase()}</b>\n\n`;
    }

    text += this.content.join('\n');

    return text;
  }

  /**
   * 按行分组按钮
   */
  private groupButtonsByRow(): Array<typeof this.buttons> {
    const rows = new Map<number, typeof this.buttons>();

    for (const button of this.buttons) {
      const row = button.row ?? 0;
      if (!rows.has(row)) {
        rows.set(row, []);
      }
      rows.get(row)!.push(button);
    }

    return Array.from(rows.values()).sort((a, b) => {
      const rowA = a[0]?.row ?? 0;
      const rowB = b[0]?.row ?? 0;
      return rowA - rowB;
    });
  }
}

/**
 * 交互式消息快捷方法
 */
export class Interactive {
  /**
   * 确认消息
   */
  static async confirm(
    chatId: number,
    message: string,
    correlationId: string,
    options?: {
      title?: string;
      confirmLabel?: string;
      cancelLabel?: string;
    }
  ): Promise<string | null> {
    return new InteractiveMessage(chatId)
      .setTitle(options?.title || '⚠️ 确认操作')
      .addContent(message)
      .addSeparator()
      .addConfirmCancel(options?.confirmLabel, options?.cancelLabel)
      .send(correlationId);
  }

  /**
   * 选择消息
   */
  static async select(
    chatId: number,
    title: string,
    options: Array<{ id: string; label: string; description?: string }>,
    correlationId: string
  ): Promise<string | null> {
    const msg = new InteractiveMessage(chatId)
      .setTitle(title);

    for (const opt of options) {
      if (opt.description) {
        msg.addListItem(opt.label, opt.description);
      } else {
        msg.addContent(opt.label);
      }
    }

    msg.addSeparator();

    // 添加选项按钮
    for (const opt of options) {
      msg.addButton(opt.id, opt.label);
    }

    return msg.send(correlationId);
  }

  /**
   * 状态消息（带操作按钮）
   */
  static async status(
    chatId: number,
    status: 'loading' | 'success' | 'error' | 'info',
    title: string,
    items?: Array<{ label: string; value?: string }>,
    buttons?: Array<{ id: string; label: string; style?: ButtonStyle }>,
    correlationId?: string
  ): Promise<string | null> {
    const emoji = {
      loading: '⏳',
      success: '✅',
      error: '❌',
      info: 'ℹ️'
    };

    const msg = new InteractiveMessage(chatId)
      .setTitle(`${emoji[status]} ${title}`);

    if (items) {
      for (const item of items) {
        msg.addListItem(item.label, item.value);
      }
    }

    if (buttons) {
      msg.addSeparator();
      for (const btn of buttons) {
        msg.addButton(btn.id, btn.label, btn.style);
      }
    }

    return msg.send(correlationId);
  }

  /**
   * 进度消息
   */
  static async progress(
    chatId: number,
    title: string,
    current: number,
    total: number,
    status?: string
  ): Promise<string | null> {
    const percentage = Math.round((current / total) * 100);
    const barLength = 20;
    const filled = Math.round((barLength * current) / total);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

    return new InteractiveMessage(chatId)
      .setTitle(title)
      .addContent(`${bar} ${percentage}%`, 'bold')
      .addContent(`${current} / ${total}`, 'code')
      .addSeparator()
      .addContent(status || '处理中...', 'italic')
      .send();
  }

  /**
   * 列表消息
   */
  static async list(
    chatId: number,
    title: string,
    items: Array<{ id: string; label: string; description?: string; status?: string }>,
    options?: {
      showIndex?: boolean;
      selectable?: boolean;
      correlationId?: string;
    }
  ): Promise<string | null> {
    const msg = new InteractiveMessage(chatId).setTitle(title);

    items.forEach((item, index) => {
      const prefix = options?.showIndex ? `${index + 1}. ` : '';
      const status = item.status ? `[${item.status}] ` : '';
      const desc = item.description ? `\n    ${item.description}` : '';

      msg.addContent(`${prefix}${status}${item.label}${desc}`);

      if (options?.selectable) {
        msg.addButton(`select_${item.id}`, `选择 ${item.label}`, ButtonStyle.PRIMARY);
      }
    });

    if (items.length === 0) {
      msg.addContent('暂无数据', 'italic');
    }

    return msg.send(options?.correlationId);
  }

  /**
   * 表单消息（收集多个输入）
   */
  static async form(
    chatId: number,
    title: string,
    fields: Array<{ name: string; label: string; value?: string }>,
    correlationId: string,
    options?: {
      submitLabel?: string;
      cancelLabel?: string;
    }
  ): Promise<string | null> {
    const msg = new InteractiveMessage(chatId).setTitle(title);

    for (const field of fields) {
      const value = field.value || '(未填写)';
      msg.addListItem(field.label, value, 1);
    }

    msg.addSeparator();
    msg.addButton('submit', options?.submitLabel || '提交', ButtonStyle.SUCCESS, 0);
    msg.addButton('cancel', options?.cancelLabel || '取消', ButtonStyle.DANGER, 0);

    return msg.send(correlationId);
  }

  /**
   * 错误消息
   */
  static async error(
    chatId: number,
    title: string,
    error: string,
    buttons?: Array<{ id: string; label: string }>,
    correlationId?: string
  ): Promise<string | null> {
    const msg = new InteractiveMessage(chatId)
      .setTitle(`❌ ${title}`)
      .addContent(error, 'code');

    if (buttons) {
      msg.addSeparator();
      for (const btn of buttons) {
        msg.addButton(btn.id, btn.label);
      }
    }

    return msg.send(correlationId);
  }

  /**
   * 成功消息
   */
  static async success(
    chatId: number,
    title: string,
    message: string,
    buttons?: Array<{ id: string; label: string; style?: ButtonStyle }>
  ): Promise<string | null> {
    const msg = new InteractiveMessage(chatId)
      .setTitle(`✅ ${title}`)
      .addContent(message);

    if (buttons) {
      msg.addSeparator();
      for (const btn of buttons) {
        msg.addButton(btn.id, btn.label, btn.style);
      }
    }

    return msg.send();
  }

  /**
   * 文件/资源消息
   */
  static async resource(
    chatId: number,
    type: 'script' | 'task' | 'cron' | 'employee',
    resource: {
      id: string;
      name: string;
      description?: string;
      status?: string;
      details?: Record<string, any>;
    },
    correlationId?: string
  ): Promise<string | null> {
    const emoji = {
      script: '📜',
      task: '📝',
      cron: '⏰',
      employee: '👤'
    };

    const msg = new InteractiveMessage(chatId)
      .setTitle(`${emoji[type]} ${resource.name}`)
      .addListItem('ID', resource.id)
      .addListItem('状态', resource.status || '未知')
      .addSeparator();

    if (resource.description) {
      msg.addContent('描述:', 'bold').addContent(resource.description).addSeparator();
    }

    if (resource.details) {
      for (const [key, value] of Object.entries(resource.details)) {
        msg.addListItem(key, String(value));
      }
    }

    // 添加操作按钮
    msg.addButton('run', '执行', ButtonStyle.SUCCESS, 0);
    msg.addButton('edit', '编辑', ButtonStyle.PRIMARY, 1);
    msg.addButton('delete', '删除', ButtonStyle.DANGER, 1);

    return msg.send(correlationId);
  }
}

/**
 * 消息更新器（用于更新已发送的消息）
 */
export class MessageUpdater {
  constructor(private chatId: number, private messageId: string) {}

  /**
   * 更新为加载状态
   */
  async loading(text: string = '正在处理...'): Promise<void> {
    await notificationService.edit('telegram', this.messageId, `⏳ ${text}`, this.chatId);
  }

  /**
   * 更新为成功状态
   */
  async success(text: string): Promise<void> {
    await notificationService.edit('telegram', this.messageId, `✅ ${text}`, this.chatId);
  }

  /**
   * 更新为错误状态
   */
  async error(text: string): Promise<void> {
    await notificationService.edit('telegram', this.messageId, `❌ ${text}`, this.chatId);
  }

  /**
   * 更新进度
   */
  async progress(current: number, total: number, status?: string): Promise<void> {
    const percentage = Math.round((current / total) * 100);
    const barLength = 20;
    const filled = Math.round((barLength * current) / total);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

    let text = `<b>${bar} ${percentage}%</b>\n`;
    text += `<code>${current} / ${total}</code>`;
    if (status) {
      text += `\n<i>${status}</i>`;
    }

    await notificationService.edit('telegram', this.messageId, text, this.chatId);
  }

  /**
   * 自定义更新
   */
  async update(html: string): Promise<void> {
    await notificationService.edit('telegram', this.messageId, html, this.chatId);
  }

  /**
   * 获取更新器
   */
  static get(chatId: number, messageId: string): MessageUpdater {
    return new MessageUpdater(chatId, messageId);
  }
}
