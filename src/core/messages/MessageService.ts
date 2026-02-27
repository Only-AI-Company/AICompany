/**
 * AI Company - Message Service
 *
 * 统一消息持久化服务
 * 所有来源（Telegram、CLI、Web、API）的消息都通过此服务保存
 */

import type { AIDatabase } from '../../infrastructure/database/index.js';
import type { CreateChatMessageInput, ChatSource, ChatDirection } from '../../types/index.js';

/**
 * 消息服务
 */
export class MessageService {
  constructor(private db: AIDatabase) {}

  /**
   * 保存用户消息
   */
  saveUserMessage(params: {
    content: string;
    source: ChatSource;
    chatId?: string;
    userId?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    externalMessageId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.db.createChatMessage({
      session_id: params.sessionId,
      content: params.content,
      source: params.source,
      direction: 'user', // 用户发给公司
      message_type: 'text',
      external_message_id: params.externalMessageId,
      external_chat_id: params.chatId,
      external_user_id: params.userId,
      username: params.username,
      first_name: params.firstName,
      last_name: params.lastName,
      metadata_json: params.metadata ? JSON.stringify(params.metadata) : undefined,
    });
  }

  /**
   * 保存公司响应
   */
  saveCompanyResponse(params: {
    content: string;
    source: ChatSource;
    chatId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.db.createChatMessage({
      session_id: params.sessionId,
      content: params.content,
      source: params.source,
      direction: 'company', // 公司发给用户
      external_chat_id: params.chatId,
      metadata_json: params.metadata ? JSON.stringify(params.metadata) : undefined,
    });
  }

  /**
   * 获取聊天历史
   */
  getChatHistory(params: {
    source?: ChatSource;
    chatId?: string;
    sessionId?: string;
    limit?: number;
  }): any[] {
    const limit = params.limit || 50;

    if (params.sessionId) {
      return this.db.getChatMessagesBySession(params.sessionId);
    }

    if (params.source) {
      return this.db.getChatMessagesBySource(params.source, limit);
    }

    return this.db.getChatMessages(limit);
  }

  /**
   * 获取特定来源的消息统计
   */
  getSourceStats(): Array<{ source: string; count: number; lastMessage: number }> {
    return this.db.prepare(`
      SELECT
        source,
        COUNT(*) as count,
        MAX(created_at) as lastMessage
      FROM chat_messages
      GROUP BY source
      ORDER BY count DESC
    `).all() as Array<{ source: string; count: number; lastMessage: number }>;
  }

  /**
   * 清理旧消息（保留最近 N 天）
   */
  cleanup(daysToKeep: number = 30): number {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    const result = this.db.prepare(`
      DELETE FROM chat_messages
      WHERE created_at < ?
    `).run(cutoffTime);

    return result.changes;
  }
}

// 单例
let messageServiceInstance: MessageService | null = null;

export function getMessageService(db: AIDatabase): MessageService {
  if (!messageServiceInstance) {
    messageServiceInstance = new MessageService(db);
  }
  return messageServiceInstance;
}
