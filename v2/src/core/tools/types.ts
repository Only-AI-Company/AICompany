/**
 * AI Company v2 - Tool System Types
 *
 * 工具系统的核心类型定义
 */

// ============================================================================
// 工具定义
// ============================================================================

/**
 * 工具分类
 */
export type ToolCategory =
  | 'goal'        // 目标管理
  | 'task'        // 任务管理
  | 'employee'    // 员工管理
  | 'cron'        // 定时任务
  | 'chat'        // 对话交互
  | 'query'       // 查询统计
  | 'system'      // 系统控制
  | 'network'     // 网络请求
  | 'test'        // 测试执行
  | 'file'        // 文件操作
  | 'browser';    // 浏览器自动化

/**
 * 工具参数类型（JSON Schema 兼容）
 */
export interface ToolParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  enum?: string[];
  items?: ToolParameterProperty;
  properties?: Record<string, ToolParameterProperty>;
  default?: any;
}

/**
 * 工具参数定义
 */
export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

/**
 * 工具执行上下文
 */
export interface ToolContext {
  /** 用户 ID */
  userId: string;
  /** 聊天 ID */
  chatId: string;
  /** 对话历史 */
  history: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }>;
  /** 输入消息 */
  inputMessage: string;
  /** 当前任务 ID（如果有） */
  taskId?: string;
  /** 当前目标 ID（如果有） */
  goalId?: string;
}

/**
 * 工具执行结果
 */
export interface ToolResult<T = any> {
  /** 是否成功 */
  success: boolean;
  /** 返回数据 */
  data?: T;
  /** 错误信息（失败时） */
  error?: string;
  /** 后续工具建议 */
  followUpTool?: {
    name: string;
    input: Record<string, any>;
  };
  /** 用户可见的消息 */
  message?: string;
}

/**
 * 工具定义接口
 */
export interface Tool<TInput = Record<string, any>, TOutput = any> {
  /** 工具名称（唯一标识） */
  name: string;
  /** 工具描述（用于 AI 理解） */
  description: string;
  /** 工具分类 */
  category: ToolCategory;
  /** 参数定义 */
  parameters: ToolParameters;
  /** 执行函数 */
  handler: (input: Record<string, any>, context: ToolContext) => Promise<ToolResult<TOutput>>;
  /** 是否启用 */
  enabled?: boolean;
  /** 最大执行时间（毫秒） */
  timeout?: number;
  /** 是否需要用户确认 */
  requiresConfirmation?: boolean;
  /** 工具约束（使用规则和限制） */
  constraints?: string[];
}

// ============================================================================
// Anthropic Function Calling 兼容类型
// ============================================================================

/**
 * Anthropic Tool Schema
 */
export interface AnthropicToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Anthropic Tool Use Response
 */
export interface AnthropicToolUse {
  id: string;
  name: string;
  input: Record<string, any>;
}

// ============================================================================
// 工具注册表类型
// ============================================================================

import type { ToolRegistry } from './ToolRegistry.js';

export { ToolRegistry };

/**
 * 工具执行选项
 */
export interface ToolExecuteOptions {
  /** 跳过权限检查 */
  skipPermissionCheck?: boolean;
  /** 跳过限流 */
  skipRateLimit?: boolean;
  /** 自定义超时时间 */
  timeout?: number;
}

/**
 * 工具执行日志
 */
export interface ToolExecutionLog {
  toolName: string;
  input: any;
  result: ToolResult;
  duration: number;
  timestamp: number;
  context: {
    userId: string;
    chatId: string;
  };
}

/**
 * 工具注册表配置
 */
export interface ToolRegistryConfig {
  /** 是否启用日志 */
  enableLogging: boolean;
  /** 是否启用限流 */
  enableRateLimit: boolean;
  /** 每个工具每分钟最大执行次数 */
  rateLimitPerMinute: number;
  /** 默认超时时间（毫秒） */
  defaultTimeout: number;
}

// ============================================================================
// 意图分析结果类型
// ============================================================================

/**
 * 意图分析结果
 */
export interface IntentAnalysisResult {
  /** 调用的工具列表 */
  toolCalls: Array<{
    name: string;
    input: Record<string, any>;
  }>;
  /** 分析置信度 */
  confidence: number;
  /** 是否需要用户确认 */
  requiresConfirmation: boolean;
  /** 分析说明 */
  reasoning?: string;
}

/**
 * 意图分析配置
 */
export interface IntentAnalyzerConfig {
  /** AI Provider 类型 */
  providerType: 'anthropic' | 'qwen' | 'kimi';
  /** 使用的模型 */
  model: string;
  /** 是否启用 Fallback */
  enableFallback: boolean;
  /** 最大重试次数 */
  maxRetries: number;
}
