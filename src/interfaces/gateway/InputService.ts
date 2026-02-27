/**
 * AI Company Gateway - Input Service
 *
 * 监听 Telegram/Web 输入
 *
 * 架构：
 * - Telegram Bot 自己处理消息（命令/聊天）
 * - 不经过 Intent Agent（避免 CLI 调用）
 */

import { getDatabase } from '../../infrastructure/database/index.js';
import { startTelegramBot } from '../integrations/telegram/TelegramBot.js';
import { getConfigService } from '../../infrastructure/config/index.js';

/**
 * 输入消息接口
 */
export interface InputMessage {
  /** 来源 */
  source: 'telegram' | 'web';
  /** 用户 ID */
  userId?: string;
  /** 消息内容 */
  content: string;
  /** 消息 ID（用于回复） */
  messageId?: string;
  /** 额外数据 */
  metadata?: Record<string, any>;
}

/**
 * 输入处理结果
 */
export interface InputResult {
  success: boolean;
  action: 'skill_executed' | 'task_created' | 'chat_response' | 'error';
  message: string;
  data?: any;
}

let running = false;
let messageQueue: InputMessage[] = [];
let messageHandler: ((message: InputMessage) => Promise<InputResult>) | null = null;
let telegramBot: { bot: any; stop(): void } | null = null;

/**
 * 启动 Input Service
 */
export async function startInputService(): Promise<{ kill: () => void }> {
  console.log(`📥 [Input Service] 启动中...`);

  const db = getDatabase();

  // 启动消息处理循环
  running = true;
  processMessages();

  // 启动 Telegram Bot（从数据库配置读取）
  const config = getConfigService(db);
  const telegramToken = config.get('telegram.bot_token') as string || process.env.TELEGRAM_BOT_TOKEN;

  if (telegramToken) {
    try {
      telegramBot = await startTelegramBot(telegramToken, db);
    } catch (error: any) {
      console.error(`⚠️  [Telegram Bot] 启动失败: ${error.message}`);
      console.error(`   请使用 'ai-company config set telegram.bot_token <token>' 配置`);
      // 不阻止服务启动
    }
  } else {
    console.log(`ℹ️  [Telegram Bot] 未配置 telegram.bot_token，跳过启动`);
    console.log(`   配置方法: ai-company config set telegram.bot_token <token>`);
  }

  console.log(`✅ [Input Service] 已启动`);

  return {
    kill: async () => {
      console.log(`📥 [Input Service] 正在停止...`);
      running = false;

      // 停止 Telegram Bot
      if (telegramBot) {
        telegramBot.stop();
        telegramBot = null;
      }

      messageHandler = null;
    },
  };
}

/**
 * 处理输入消息（供外部调用）
 *
 * @param message 输入消息
 * @returns 处理结果
 */
export async function handleInput(message: InputMessage): Promise<InputResult> {
  console.log(`\n📨 [Input Service] 收到消息 (${message.source})`);
  console.log(`   内容: ${message.content}`);

  // Telegram Bot 自己处理消息，不需要 InputService 处理
  return {
    success: false,
    action: 'error',
    message: 'InputService 不处理消息，由 TelegramBot 直接处理',
  };
}

/**
 * 注册消息处理器（用于 Telegram/Web 集成）
 */
export function registerMessageHandler(handler: (message: InputMessage) => Promise<InputResult>) {
  messageHandler = handler;
}

/**
 * 消息处理循环（用于队列模式）
 */
async function processMessages() {
  while (running) {
    if (messageQueue.length > 0) {
      const message = messageQueue.shift()!;
      if (messageHandler) {
        await messageHandler(message);
      } else {
        await handleInput(message);
      }
    }
    await sleep(100);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
