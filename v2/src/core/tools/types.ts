/**
 * AI Company v2 - Tool System Types
 */

import type { Database } from '../../types.js';

export enum ToolCategory {
  GOAL = 'goal',
  TASK = 'task',
  EMPLOYEE = 'employee',
  CRON = 'cron',
  CHAT = 'chat',
  QUERY = 'query',
  SYSTEM = 'system',
}

export interface ToolContext {
  db: Database;
  inputMessage: string;
  userId?: string;
  chatId?: string;
  source?: 'cli' | 'telegram' | 'web';
  history?: Array<{ role: string; content: string }>;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  response: string;
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

export interface Tool {
  name: string;
  description: string;
  category: ToolCategory;
  parameters?: Record<string, ToolParameter>;
  handler: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
  /**
   * 验证参数
   */
  validateParams?(params: Record<string, unknown>): { valid: boolean; error?: string };
}
