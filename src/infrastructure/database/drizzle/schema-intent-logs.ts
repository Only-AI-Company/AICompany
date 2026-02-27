/**
 * Intent & Tool Execution Logs
 * 意图理解和工具执行日志
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * 意图理解日志
 */
export const intentLogs = sqliteTable('intent_logs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),          // 会话 ID (chatId)
  source: text('source').notNull(),                 // 来源: telegram, cli, web

  // 用户输入
  userInput: text('user_input').notNull(),          // 用户原始输入

  // AI 意图理解
  aiRawResponse: text('ai_raw_response'),          // AI 原始响应
  parsedTool: text('parsed_tool'),                 // 解析出的工具名
  parsedInput: text('parsed_input'),               // 解析出的参数 (JSON)

  // 执行结果
  toolResult: text('tool_result'),                 // 工具执行结果
  executionStatus: text('execution_status'),       // success, failed

  // 元数据
  chatHistoryCount: integer('chat_history_count'), // 聊天历史条数
  latency: integer('latency'),                     // 处理耗时 (ms)

  timestamps: integer('timestamps').notNull(),    // 创建时间
});

export type IntentLog = typeof intentLogs.$inferSelect;
export type NewIntentLog = typeof intentLogs.$inferInsert;
