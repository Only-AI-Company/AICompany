/**
 * AI Company v3 - Tool Types
 *
 * 工具系统类型定义
 */

// ============================================================================
// Tool Interface
// ============================================================================

export interface Tool {
  /** 工具名称 */
  name: string;

  /** 工具描述 */
  description: string;

  /** 工具分类 */
  category: ToolCategory;

  /** 参数 Schema (JSON Schema) */
  parameters: ToolParameters;

  /** 执行工具 */
  execute(params: any, context: ToolContext): Promise<ToolResult>;

  /** 验证参数 */
  validate(params: any): boolean;
}

// ============================================================================
// Types
// ============================================================================

export type ToolCategory =
  | 'system'        // 系统工具（bash、文件等）
  | 'file'          // 文件操作
  | 'network'       // 网络请求
  | 'search'        // 搜索
  | 'xiaohongshu'   // 小红书工具
  | 'custom';       // 自定义工具

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ParameterDefinition>;
  required?: string[];
}

export interface ParameterDefinition {
  type: string;
  description: string;
  enum?: any[];
  items?: any;
  default?: any;
}

export interface ToolContext {
  /** 员工 ID */
  employeeId: string;

  /** 任务 ID */
  taskId: string;

  /** 工作目录 */
  workspace?: string;

  /** 环境变量 */
  env?: Record<string, string>;
}

export interface ToolResult {
  /** 是否成功 */
  success: boolean;

  /** 输出内容 */
  output?: string;

  /** 错误信息 */
  error?: string;

  /** 元数据 */
  metadata?: Record<string, any>;
}

// ============================================================================
// Tool Use for LLM
// ============================================================================

/**
 * Anthropic 格式的工具定义
 */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * 工具调用请求
 */
export interface ToolCallRequest {
  name: string;
  arguments: Record<string, any>;
}

/**
 * 工具调用结果
 */
export interface ToolCallResult {
  toolCallId: string;
  toolName: string;
  result: ToolResult;
}

// ============================================================================
// Tool Registry
// ============================================================================

export interface ToolRegistryConfig {
  /** 启用的工具列表 */
  enabledTools?: string[];

  /** Bash 工具配置 */
  bash?: {
    timeout?: number;
    allowedCommands?: string[];
  };

  /** 文件工具配置 */
  file?: {
    basePath?: string;
    maxSize?: string;
  };
}
