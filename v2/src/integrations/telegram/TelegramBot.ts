/**
 * AI Company v2 - Telegram Bot Integration
 *
 * CEO 通过 Telegram 与用户交互
 *
 * 架构：
 * - CLI 模式输入 → EventBus → Telegram
 * - Telegram 输入 → EventBus → CoreProcess
 * - 双向通信，统一事件驱动
 */

import { getEventBus } from '../../core/events/EventBus.js';
import { getConfigManager } from '../../config/ConfigManager.js';
import { getDatabase } from '../../db/Database.js';
import { getInteractionManager } from '../../core/events/InteractionManager.js';
import type { InteractionEvent } from '../../core/events/EventBus.js';

// ============================================================================
// 类型定义
// ============================================================================

export interface TelegramConfig {
  botToken: string;
  enabled: boolean;
  ownerName?: string;
  companyName?: string;
}

// ============================================================================
// Telegram Bot 集成
// ============================================================================

export class TelegramIntegration {
  private bot: any;
  private botReady: Promise<void>;
  private eventBus = getEventBus();
  private configManager = getConfigManager();
  private db = getDatabase();
  private interactionManager = getInteractionManager();
  private polling: any = null;
  private config: TelegramConfig;
  private handlersSetup = false; // 防止重复注册监听器

  // 存储 userId → chatId 映射（持久化到数据库）
  private userChatMap = new Map<string, string>();
  // 存储等待中的交互：interactionId → chatId
  private pendingInteractions = new Map<string, string>();

  constructor(botToken: string) {
    // 动态导入 TelegramBot 并等待完成
    this.botReady = import('node-telegram-bot-api').then(({ default: TelegramBot }) => {
      this.bot = new TelegramBot(botToken, { polling: false });
    });
    this.config = {
      botToken,
      enabled: true,
    };

    this.setupMessageHandlers();
  }

  /**
   * 等待 bot 准备就绪
   */
  private async waitReady(): Promise<void> {
    await this.botReady;
    if (!this.bot) {
      throw new Error('Telegram bot failed to initialize');
    }
  }

  /**
   * 启动 Bot
   */
  async start(): Promise<void> {
    await this.waitReady();

    const config = this.configManager.getConfig();
    const companyName = config?.companyName || 'AI Company';
    const ownerName = config?.ownerName || '朋友';

    // 加载用户 chatId 映射
    this.loadUserChatMap();

    console.log('\n========================================');
    console.log(`📱 ${companyName} - Telegram Bot 已启动`);
    console.log(`👤 正在服务：${ownerName}`);
    console.log('========================================\n');

    // 启动轮询
    this.polling = this.bot.on('message', this.onMessage.bind(this));

    // 启动回调查询监听
    this.bot.on('callback_query', this.handleCallbackQuery.bind(this));

    await this.bot.startPolling();

    // 发出启动事件
    this.eventBus.emit({
      type: 'telegram.started',
      timestamp: Date.now(),
    } as any);
  }

  /**
   * 停止 Bot
   */
  async stop(): Promise<void> {
    await this.waitReady();
    if (this.polling) {
      await this.bot.stopPolling();
      this.polling = null;
    }
    console.log('\n🛑 Telegram Bot 已停止\n');

    // 重置处理器设置标志，允许重新注册
    this.handlersSetup = false;

    // 发出停止事件
    this.eventBus.emit({
      type: 'telegram.stopped',
      timestamp: Date.now(),
    } as any);
  }

  /**
   * 发送消息到 Telegram
   */
  async sendMessage(chatId: string, text: string, options?: any): Promise<void> {
    await this.waitReady();

    // 清理 Markdown 格式，转换为 Telegram 友好的纯文本
    const cleanText = this.stripMarkdown(text);

    await this.bot.sendMessage(chatId, cleanText, options);
  }

  /**
   * 清理 Markdown 格式，转换为纯文本
   */
  private stripMarkdown(text: string): string {
    // 移除 Markdown 代码块标记
    text = text.replace(/```[\s\S]*?```/g, (match) => {
      // 提取代码块内容
      const content = match.replace(/```\w*\n?/g, '').replace(/```$/g, '');
      return content;
    });

    // 移除行内代码标记
    text = text.replace(/`([^`]+)`/g, '$1');

    // 移除加粗标记
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');

    // 移除斜体标记
    text = text.replace(/\*([^*]+)\*/g, '$1');

    // 移除标题标记
    text = text.replace(/^#+\s+/gm, '');

    // 移除链接标记 [text](url)
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // 移除水平线
    text = text.replace(/^---+$/gm, '---');

    // 清理多余的空行
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }

  /**
   * 加载用户 chatId 映射从数据库
   */
  private loadUserChatMap(): void {
    try {
      // 从 config 表中加载映射
      const configRow = this.db.prepare('SELECT config_json FROM config WHERE namespace = ?').get('telegram_chat_map');
      if (configRow) {
        const map = JSON.parse(configRow.config_json);
        for (const [userId, chatId] of Object.entries(map)) {
          this.userChatMap.set(userId as string, chatId as string);
        }
      }
      console.log(`[Telegram] 加载了 ${this.userChatMap.size} 个用户 chatId 映射`);
    } catch (error: any) {
      console.error('[Telegram] 加载用户 chatId 映射失败:', error.message);
    }
  }

  /**
   * 保存用户 chatId 映射到数据库
   */
  private saveUserChatMap(): void {
    try {
      const map: Record<string, string> = {};
      for (const [userId, chatId] of this.userChatMap.entries()) {
        map[userId] = chatId;
      }
      this.db.setConfig('telegram_chat_map', map);
    } catch (error: any) {
      console.error('[Telegram] 保存用户 chatId 映射失败:', error.message);
    }
  }

  /**
   * 设置消息处理器
   */
  private setupMessageHandlers(): void {
    // 防止重复注册监听器
    if (this.handlersSetup) {
      console.log('[Telegram] ⚠️ 消息处理器已设置，跳过重复注册');
      return;
    }

    console.log('[Telegram] 🔧 设置消息处理器...');

    // 监听来自系统的通知事件，发送到 Telegram
    this.eventBus.on('notification.needed' as any, async (event: any) => {
      // 如果通知目标是 telegram
      if (event.channel === 'telegram' || !event.channel) {
        await this.handleNotification(event);
      }
    });

    // 监听任务开始事件 - 不再发送通知（避免骚扰用户）
    // task.started 事件只在终端日志中记录，不发送到 Telegram

    // 监听任务完成事件，发送结果到 Telegram
    this.eventBus.on('task.completed' as any, async (event: any) => {
      // 如果是 telegram 来源的任务，直接使用事件中的 chatId
      if (event.source === 'telegram' && event.chatId) {
        const result = event.result || {};
        const message = this.formatTaskResult(result);
        await this.sendMessage(event.chatId, message);
      }
    });

    // 监听任务失败事件，发送错误到 Telegram
    this.eventBus.on('task.failed' as any, async (event: any) => {
      // 如果是 telegram 来源的任务，直接使用事件中的 chatId
      if (event.source === 'telegram' && event.chatId) {
        const message = `❌ 任务失败\n\n${event.error || '未知错误'}`;
        await this.sendMessage(event.chatId, message);
      }
    });

    // 监听交互请求事件，发送到 Telegram
    this.eventBus.on('interaction.requested' as any, async (event: InteractionEvent) => {
      await this.handleInteractionRequest(event);
    });

    this.handlersSetup = true;
    console.log('[Telegram] ✅ 消息处理器设置完成');
  }

  /**
   * 处理通知事件
   */
  private async handleNotification(event: any): Promise<void> {
    try {
      // 优先使用事件中的 chatId
      let chatId = event.chatId || event.metadata?.chatId;

      // 如果没有 chatId，尝试从 userId 获取
      if (!chatId && event.userId) {
        chatId = this.userChatMap.get(event.userId);
      }

      // 如果仍然没有，从数据库查询最近的 Telegram 用户
      if (!chatId) {
        const row = this.db.prepare(`
          SELECT external_chat_id
          FROM chat_messages
          WHERE source = 'telegram'
            AND external_chat_id IS NOT NULL
          ORDER BY created_at DESC
          LIMIT 1
        `).get() as any;
        chatId = row?.external_chat_id;
      }

      if (chatId) {
        await this.sendMessage(chatId, event.message);
        console.log(`[Telegram] 通知已发送到 chatId: ${chatId}`);
      } else {
        console.warn('[Telegram] 无法发送通知：没有可用的 chatId');
      }
    } catch (error: any) {
      console.error('[Telegram] 发送通知失败:', error.message);
    }
  }

  /**
   * 格式化任务结果
   */
  private formatTaskResult(result: any): string {
    if (result.success) {
      let message = '✅ 任务完成\n\n';

      if (result.output) {
        // 限制输出长度
        const output = result.output.length > 1000
          ? result.output.substring(0, 1000) + '...\n\n(输出已截断)'
          : result.output;
        message += output;
      }

      return message;
    } else {
      return `❌ 任务失败\n\n${result.error || '未知错误'}`;
    }
  }

  /**
   * 处理交互请求事件
   */
  private async handleInteractionRequest(event: InteractionEvent): Promise<void> {
    const { interactionId, interaction, chatId } = event;

    console.log(`[Telegram] 📤 交互请求: ${interaction.type} - ${interaction.question.substring(0, 50)}...`);

    try {
      // 确定目标 chatId
      let targetChatId = chatId;
      if (!targetChatId && event.userId) {
        targetChatId = this.userChatMap.get(event.userId);
      }

      if (!targetChatId) {
        console.warn('[Telegram] 无法发送交互请求：没有可用的 chatId');
        return;
      }

      // 根据交互类型构建不同的消息
      let replyMarkup: any = undefined;

      if (interaction.type === 'confirm') {
        // 确认类型：显示是/否按钮
        replyMarkup = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ 是', callback_data: `interaction:${interactionId}:true` },
                { text: '❌ 否', callback_data: `interaction:${interactionId}:false` },
              ],
            ],
          },
        };

      } else if (interaction.type === 'select' && interaction.options && interaction.options.length > 0) {
        // 选择类型：显示选项按钮
        const keyboard = interaction.options.map((option, index) => [{
          text: option.label,
          callback_data: `interaction:${interactionId}:${option.value}`,
        }]);

        // 如果有默认值，添加一个"使用默认"按钮
        if (interaction.default !== undefined) {
          keyboard.push([
            { text: `🔄 使用默认: ${interaction.default}`, callback_data: `interaction:${interactionId}:default` },
          ]);
        }

        replyMarkup = {
          reply_markup: {
            inline_keyboard: keyboard,
          },
        };

      } else if (interaction.type === 'input') {
        // 输入类型：不需要特殊按钮，用户直接回复文本即可
        // 但可以添加一个"跳过"按钮（如果有默认值）
        if (interaction.default !== undefined) {
          replyMarkup = {
            reply_markup: {
              inline_keyboard: [
                [{ text: `🔄 使用默认: ${interaction.default}`, callback_data: `interaction:${interactionId}:default` }],
              ],
            },
          };
        }
      }

      // 发送消息到 Telegram
      let message = `📝 ${interaction.question}`;

      if (interaction.type === 'select' && interaction.options) {
        message += '\n\n请选择一个选项：';
      } else if (interaction.type === 'input' && interaction.placeholder) {
        message += `\n\n💬 提示: ${interaction.placeholder}`;
      }

      await this.sendMessage(targetChatId, message, replyMarkup);

      // 保存交互 ID → chatId 映射（用于处理响应）
      this.pendingInteractions.set(interactionId, targetChatId);

      console.log(`[Telegram] 交互请求已发送到 chatId: ${targetChatId}, interactionId: ${interactionId}`);

    } catch (error: any) {
      console.error('[Telegram] 发送交互请求失败:', error.message);

      // 发送失败时，通知 InteractionManager
      this.interactionManager.handleResponse(interactionId, null, true);
    }
  }

  /**
   * 处理 Telegram 回调查询
   */
  private async handleCallbackQuery(query: any): Promise<void> {
    const chatId = query.message.chat.id.toString();
    const data = query.data;

    console.log(`[Telegram] 📩 收到回调查询: ${data}`);

    // 解析回调数据
    if (typeof data === 'string' && data.startsWith('interaction:')) {
      const parts = data.split(':');
      const interactionId = parts[1];
      const value = parts[2];

      // 回复回调查询（移除按钮）
      await this.bot.answerCallbackQuery(query.id, { text: '✅ 已选择' });

      // 处理响应
      if (value === 'default') {
        // 使用默认值 - 从事件历史中查找交互请求
        const history = this.eventBus.getHistory('interaction.requested');
        const event: any = history.find((e: any) => e.interactionId === interactionId);
        if (event && event.interaction && event.interaction.default !== undefined) {
          this.interactionManager.handleResponse(interactionId, event.interaction.default);
        }
      } else if (value === 'true') {
        this.interactionManager.handleResponse(interactionId, true);
      } else if (value === 'false') {
        this.interactionManager.handleResponse(interactionId, false);
      } else {
        this.interactionManager.handleResponse(interactionId, value);
      }

      // 清理待处理交互
      this.pendingInteractions.delete(interactionId);

    } else {
      // 其他回调查询，正常回复
      await this.bot.answerCallbackQuery(query.id);
    }
  }

  /**
   * 处理来自 Telegram 的消息
   */
  private async onMessage(msg: any): Promise<void> {
    const chatId = msg.chat.id.toString();
    const text = msg.text || '';
    const user = msg.from;
    const userId = user.id.toString();

    console.log(`[Telegram] 📩 收到消息 from ${user.username || user.first_name}: ${text.substring(0, 50)}`);

    // 保存 userId → chatId 映射
    const prevChatId = this.userChatMap.get(userId);
    if (prevChatId !== chatId) {
      this.userChatMap.set(userId, chatId);
      this.saveUserChatMap();
    }

    // 检查是否有等待中的交互（这个 chatId 有待处理的交互请求）
    for (const [interactionId, pendingChatId] of this.pendingInteractions.entries()) {
      if (pendingChatId === chatId) {
        // 这是一个交互响应，不是普通的用户输入
        console.log(`[Telegram] 📥 交互响应: interactionId=${interactionId}, value=${text}`);

        // 发送响应到 InteractionManager
        this.interactionManager.handleResponse(interactionId, text);

        // 清理待处理交互
        this.pendingInteractions.delete(interactionId);

        // 发送确认消息
        await this.sendMessage(chatId, '✅ 已收到您的回复');

        // 记录聊天消息（但不作为 user.input 事件）
        this.db.saveChatMessage({
          sessionId: chatId,  // ← 修复：使用 chatId 而不是 userId
          content: text,
          source: 'telegram',
          direction: 'in',
          chatId: chatId,
          userId: userId,
        });

        // 不继续处理为普通的用户输入
        return;
      }
    }

    // 记录聊天消息到数据库
    this.db.saveChatMessage({
      sessionId: chatId,  // ← 修复：使用 chatId 而不是 userId
      content: text,
      source: 'telegram',
      direction: 'in',
      chatId: chatId,
      userId: userId,
    });

    // 生成唯一的事件 ID
    const eventId = `telegram-${chatId}-${Date.now()}`;

    // 发出用户输入事件（与 CLI 统一）
    this.eventBus.emit({
      type: 'user.input',
      source: 'telegram',
      content: text,
      userId,
      chatId,
      metadata: {
        chatId,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        eventId,
      },
      timestamp: Date.now(),
    } as any);

    // 不再发送"正在处理"消息 - 避免不必要的骚扰
    // 查询类任务会通过 notification.needed 事件立即返回结果
    // 执行类任务会在完成后通过 task.completed 发送结果
  }

  /**
   * 获取 Bot 信息
   */
  async getBotInfo(): Promise<any> {
    await this.waitReady();
    return await this.bot.getMe();
  }

  /**
   * 验证 Token 是否有效
   */
  async validateToken(): Promise<boolean> {
    try {
      await this.waitReady();
      await this.bot.getMe();
      return true;
    } catch (error: any) {
      if (error.response?.statusCode === 401) {
        return false;
      }
      throw error;
    }
  }
}

// ============================================================================
// 工厂函数（单例模式）
// ============================================================================

let telegramBotInstance: TelegramIntegration | null = null;
let telegramBotReady: Promise<TelegramIntegration | null> | null = null;

/**
 * 创建或获取 Telegram Integration 单例
 *
 * 确保整个应用中只有一个 Telegram Bot 实例，避免事件监听器重复注册
 */
export async function createTelegramIntegration(): Promise<TelegramIntegration | null> {
  // 如果已有实例，直接返回
  if (telegramBotInstance) {
    return telegramBotInstance;
  }

  // 如果正在初始化，等待完成
  if (telegramBotReady) {
    return telegramBotReady;
  }

  // 开始初始化
  telegramBotReady = (async () => {
    const configManager = getConfigManager();

    // 检查工作目录下是否有 .env 文件
    const workdir = configManager.getWorkdir();
    const { existsSync, readFileSync } = await import('fs');
    const { join } = await import('path');

    const envPath = join(workdir, '.env');
    if (!existsSync(envPath)) {
      telegramBotReady = null;
      return null;
    }

    // 读取 .env 文件获取 token
    const envContent = readFileSync(envPath, 'utf-8');
    const tokenMatch = envContent.match(/TELEGRAM_BOT_TOKEN=([^\s\n]+)/);

    if (!tokenMatch) {
      telegramBotReady = null;
      return null;
    }

    const token = tokenMatch[1];
    const bot = new TelegramIntegration(token);

    // 验证 Token 是否有效
    const isValid = await bot.validateToken();
    if (!isValid) {
      console.log('[Telegram] ⚠️  Token 验证失败，请检查配置');
      console.log('[Telegram]    获取 Token: 在 Telegram 中找 @BotFather，发送 /newbot');
      console.log('[Telegram]    配置 Token: ai-company telegram:setup <token>');
      telegramBotReady = null;
      return null;
    }

    telegramBotInstance = bot;
    telegramBotReady = null;
    return bot;
  })();

  return telegramBotReady;
}

/**
 * 重置 Telegram Integration 单例
 * 用于测试或重新配置
 */
export function resetTelegramIntegration(): void {
  telegramBotInstance = null;
  telegramBotReady = null;
}
