/**
 * Intent Log Service - 意图理解日志服务
 *
 * 记录和查询意图理解、工具执行日志
 */

import type { AIDatabase } from '../database/index.js';
import type { NewIntentLog } from '../database/drizzle/schema.js';

export interface IntentLogInput {
  sessionId: string;
  source: 'telegram' | 'cli' | 'web';
  userInput: string;
  aiRawResponse?: string;
  parsedTool?: string;
  parsedInput?: string;
  toolResult?: string;
  executionStatus?: 'success' | 'failed';
  chatHistoryCount?: number;
  latency?: number;
}

export class IntentLogService {
  constructor(private db: AIDatabase) {}

  /**
   * 记录意图理解日志
   */
  log(input: IntentLogInput): void {
    const now = Math.floor(Date.now() / 1000);
    const id = `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const logEntry: NewIntentLog = {
      id,
      sessionId: input.sessionId,
      source: input.source,
      userInput: input.userInput,
      aiRawResponse: input.aiRawResponse || null,
      parsedTool: input.parsedTool || null,
      parsedInput: input.parsedInput || null,
      toolResult: input.toolResult || null,
      executionStatus: input.executionStatus || 'success',
      chatHistoryCount: input.chatHistoryCount || 0,
      latency: input.latency || null,
      timestamps: now,
    };

    try {
      this.db.prepare(`
        INSERT INTO intent_logs (
          id, session_id, source, user_input, ai_raw_response, parsed_tool,
          parsed_input, tool_result, execution_status, chat_history_count,
          latency, timestamps
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        logEntry.id,
        logEntry.sessionId,
        logEntry.source,
        logEntry.userInput,
        logEntry.aiRawResponse,
        logEntry.parsedTool,
        logEntry.parsedInput,
        logEntry.toolResult,
        logEntry.executionStatus,
        logEntry.chatHistoryCount,
        logEntry.latency,
        logEntry.timestamps
      );
    } catch (error) {
      console.error('[IntentLog] 记录失败:', error);
    }
  }

  /**
   * 获取最近的日志
   */
  getRecent(limit: number = 20): any[] {
    return this.db.prepare(`
      SELECT * FROM intent_logs
      ORDER BY timestamps DESC
      LIMIT ?
    `).all(limit) as any[];
  }

  /**
   * 按会话获取日志
   */
  getBySession(sessionId: string, limit: number = 50): any[] {
    return this.db.prepare(`
      SELECT * FROM intent_logs
      WHERE session_id = ?
      ORDER BY timestamps DESC
      LIMIT ?
    `).all(sessionId, limit) as any[];
  }

  /**
   * 按工具获取日志
   */
  getByTool(tool: string, limit: number = 20): any[] {
    return this.db.prepare(`
      SELECT * FROM intent_logs
      WHERE parsed_tool = ?
      ORDER BY timestamps DESC
      LIMIT ?
    `).all(tool, limit) as any[];
  }

  /**
   * 获取失败的日志
   */
  getFailed(limit: number = 20): any[] {
    return this.db.prepare(`
      SELECT * FROM intent_logs
      WHERE execution_status = 'failed'
      ORDER BY timestamps DESC
      LIMIT ?
    `).all(limit) as any[];
  }

  /**
   * 格式化日志用于显示
   */
  formatForDisplay(log: any): string {
    const timestamp = new Date(log.timestamps * 1000).toLocaleString('zh-CN');
    return `
[${timestamp}] ${log.source} - ${log.parsed_tool || 'chat'}
输入: ${log.userInput}
${log.aiRawResponse ? `AI: ${log.aiRawResponse.slice(0, 100)}...` : ''}
${log.toolResult ? `结果: ${log.toolResult.slice(0, 100)}...` : ''}
`.trim();
  }
}

let serviceInstance: IntentLogService | null = null;

export function getIntentLogService(db?: AIDatabase): IntentLogService {
  if (!serviceInstance) {
    if (!db) {
      const { getDatabase } = require('../database/index.js');
      db = getDatabase();
    }
    if (!db) {
      throw new Error('IntentLogService requires database');
    }
    serviceInstance = new IntentLogService(db);
  }
  return serviceInstance;
}

export function resetIntentLogService(): void {
  serviceInstance = null;
}
