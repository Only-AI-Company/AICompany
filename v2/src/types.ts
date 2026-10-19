/**
 * AI Company v2 - 全局类型定义
 *
 * 只保留实际使用的核心类型
 */

// ============================================================================
// 输入相关
// ============================================================================

export type InputSource = 'cli' | 'telegram' | 'web' | 'cron' | 'system';

export interface InputMessage {
  id: string;
  source: InputSource;
  content: string;
  userId?: string;
  chatId?: string;
  timestamp: number;
  rawData?: any;
}

// ============================================================================
// 数据库相关
// ============================================================================

export interface Database {
  prepare(sql: string): Statement;
  exec(sql: string): void;
}

export interface Statement {
  run(...params: any[]): RunResult;
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

// ============================================================================
// 通知相关
// ============================================================================

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  content: string;
  channels: Array<'telegram' | 'cli'>;
  userId?: string;
  chatId?: string;
  timestamp: number;
}

// ============================================================================
// 配置相关
// ============================================================================

export interface AIProviderConfig {
  active: string;
  providers: Record<string, {
    apiKey?: string;
    baseURL?: string;
    model?: string;
  }>;
}

export interface TelegramConfig {
  enabled: boolean;
  botToken?: string;
}

export interface Config {
  aiProvider: AIProviderConfig;
  telegram: TelegramConfig;
  company: {
    name: string;
    timezone: string;
  };
}
