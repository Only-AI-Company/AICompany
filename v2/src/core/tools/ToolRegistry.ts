/**
 * AI Company v2 - Tool Registry
 *
 * 工具注册中心：管理所有工具的注册、查询、执行
 */

import type {
  Tool,
  ToolContext,
  ToolResult,
  ToolExecutionLog,
  ToolRegistryConfig,
  AnthropicToolSchema,
  ToolExecuteOptions,
} from './types.js';

// ============================================================================
// 工具注册表
// ============================================================================

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private executionHistory: ToolExecutionLog[] = [];
  private rateLimitMap: Map<string, number[]> = new Map();

  private config: ToolRegistryConfig = {
    enableLogging: true,
    enableRateLimit: true,
    rateLimitPerMinute: 60,
    defaultTimeout: 30000, // 30 秒
  };

  constructor(config?: Partial<ToolRegistryConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  // ============================================================================
  // 工具注册
  // ============================================================================

  /**
   * 注册单个工具
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] 工具已存在，覆盖：${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    console.log(`[ToolRegistry] 已注册工具：${tool.name} (${tool.category})`);
  }

  /**
   * 批量注册工具
   */
  registerMany(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 注销工具
   */
  unregister(toolName: string): boolean {
    return this.tools.delete(toolName);
  }

  // ============================================================================
  // 工具查询
  // ============================================================================

  /**
   * 获取单个工具
   */
  get(toolName: string): Tool | undefined {
    return this.tools.get(toolName);
  }

  /**
   * 获取所有工具
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取所有启用的工具
   */
  getAllEnabled(): Tool[] {
    return this.getAll().filter(tool => tool.enabled !== false);
  }

  /**
   * 按分类获取工具
   */
  getByCategory(category: string): Tool[] {
    return this.getAll().filter(tool => tool.category === category);
  }

  /**
   * 检查工具是否存在
   */
  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  // ============================================================================
  // 工具执行
  // ============================================================================

  /**
   * 执行工具
   */
  async execute(
    toolName: string,
    input: any,
    context: ToolContext,
    options?: ToolExecuteOptions
  ): Promise<ToolResult> {
    const startTime = Date.now();
    console.log(`[ToolRegistry] 执行工具：${toolName}`, input);

    // 1. 检查工具是否存在
    const tool = this.get(toolName);
    if (!tool) {
      const error = `工具不存在：${toolName}`;
      console.error(`[ToolRegistry] ${error}`);
      return { success: false, error };
    }

    // 2. 检查工具是否启用
    if (tool.enabled === false) {
      const error = `工具未启用：${toolName}`;
      console.error(`[ToolRegistry] ${error}`);
      return { success: false, error };
    }

    // 3. 权限检查（预留）
    if (!options?.skipPermissionCheck) {
      const permissionResult = await this.checkPermission(tool, context);
      if (!permissionResult.allowed) {
        return { success: false, error: permissionResult.reason };
      }
    }

    // 4. 限流检查
    if (!options?.skipRateLimit && this.config.enableRateLimit) {
      const rateLimitResult = this.checkRateLimit(toolName);
      if (!rateLimitResult.allowed) {
        return { success: false, error: '触发限流，请稍后重试' };
      }
      // 检查通过后立即记录时间戳（预分配），防止并发请求超过限制
      this.recordRateLimit(toolName);
    }

    // 5. 执行工具
    const timeout = options?.timeout || tool.timeout || this.config.defaultTimeout;
    const timeoutPromise = new Promise<ToolResult>((_, reject) =>
      setTimeout(() => reject(new Error(`工具执行超时：${timeout}ms`)), timeout)
    );

    const executionPromise = (async () => {
      try {
        const result = await tool.handler(input, context);

        // 记录执行日志
        if (this.config.enableLogging) {
          this.logExecution(toolName, input, result, Date.now() - startTime, context);
        }

        return result;
      } catch (error: any) {
        console.error(`[ToolRegistry] 工具执行失败：${toolName}`, error);
        return {
          success: false,
          error: error.message || '工具执行失败',
        };
      }
    })();

    try {
      return await Promise.race([executionPromise, timeoutPromise]);
    } catch (error: any) {
      console.error(`[ToolRegistry] 工具执行异常：${toolName}`, error);
      return {
        success: false,
        error: error.message || '工具执行异常',
      };
    }
  }

  // ============================================================================
  // 权限检查（预留实现）
  // ============================================================================

  private async checkPermission(
    tool: Tool,
    context: ToolContext
  ): Promise<{ allowed: boolean; reason?: string }> {
    // TODO: 实现权限检查逻辑
    // 目前默认允许所有操作
    return { allowed: true };
  }

  // ============================================================================
  // 限流逻辑
  // ============================================================================

  private checkRateLimit(toolName: string): { allowed: boolean } {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 分钟
    const maxRequests = this.config.rateLimitPerMinute;

    const timestamps = this.rateLimitMap.get(toolName) || [];
    const recentTimestamps = timestamps.filter(ts => now - ts < windowMs);

    if (recentTimestamps.length >= maxRequests) {
      return { allowed: false };
    }

    return { allowed: true };
  }

  private recordRateLimit(toolName: string): void {
    const timestamps = this.rateLimitMap.get(toolName) || [];
    timestamps.push(Date.now());
    this.rateLimitMap.set(toolName, timestamps);
  }

  // ============================================================================
  // 日志记录
  // ============================================================================

  private logExecution(
    toolName: string,
    input: any,
    result: ToolResult,
    duration: number,
    context: ToolContext
  ): void {
    const log: ToolExecutionLog = {
      toolName,
      input,
      result,
      duration,
      timestamp: Date.now(),
      context: {
        userId: context.userId,
        chatId: context.chatId,
      },
    };

    this.executionHistory.push(log);

    // 保留最近 1000 条记录
    if (this.executionHistory.length > 1000) {
      this.executionHistory.shift();
    }

    console.log(
      `[ToolRegistry] 执行完成：${toolName} (${duration}ms) - ${result.success ? '成功' : '失败'}`
    );
  }

  /**
   * 获取执行历史
   */
  getExecutionHistory(limit: number = 100): ToolExecutionLog[] {
    return this.executionHistory.slice(-limit);
  }

  /**
   * 清除执行历史
   */
  clearExecutionHistory(): void {
    this.executionHistory = [];
  }

  // ============================================================================
  // 转换为 Anthropic Function Schema
  // ============================================================================

  /**
   * 将工具转换为 Anthropic Function Schema 格式
   */
  toAnthropicSchema(tool: Tool): AnthropicToolSchema {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, param] of Object.entries(tool.parameters.properties)) {
      properties[key] = {
        type: param.type,
        description: param.description,
      };

      if (param.enum) {
        properties[key].enum = param.enum;
      }

      if (param.properties) {
        // 嵌套对象
        properties[key].properties = {};
        for (const [nestedKey, nestedParam] of Object.entries(param.properties)) {
          properties[key].properties[nestedKey] = {
            type: nestedParam.type,
            description: nestedParam.description,
          };
        }
      }

      if (param.required) {
        required.push(key);
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties,
        required: tool.parameters.required || required,
      },
    };
  }

  /**
   * 将所有工具转换为 Anthropic Function Schema 格式
   */
  toAnthropicSchemas(): AnthropicToolSchema[] {
    return this.getAllEnabled().map(tool => this.toAnthropicSchema(tool));
  }

  // ============================================================================
  // 工具统计
  // ============================================================================

  /**
   * 获取工具统计信息
   */
  getStats(): {
    totalTools: number;
    enabledTools: number;
    totalExecutions: number;
    successRate: number;
    averageDuration: number;
  } {
    const totalTools = this.tools.size;
    const enabledTools = this.getAllEnabled().length;
    const totalExecutions = this.executionHistory.length;

    const successfulExecutions = this.executionHistory.filter(
      log => log.result.success
    ).length;

    const successRate = totalExecutions > 0
      ? (successfulExecutions / totalExecutions) * 100
      : 0;

    const averageDuration = totalExecutions > 0
      ? this.executionHistory.reduce((sum, log) => sum + log.duration, 0) / totalExecutions
      : 0;

    return {
      totalTools,
      enabledTools,
      totalExecutions,
      successRate,
      averageDuration,
    };
  }

  /**
   * 重置限流计数器
   */
  resetRateLimits(): void {
    this.rateLimitMap.clear();
  }
}

// ============================================================================
// 单例
// ============================================================================

let registryInstance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();

    // 自动注册 CXO 工具
    import('./cxoTools.js').then(({ registerCXOTools }) => {
      registerCXOTools(registryInstance);
      console.log('[ToolRegistry] ✅ CXO 工具已自动注册');
    }).catch((error) => {
      console.error('[ToolRegistry] ❌ CXO 工具注册失败:', error.message);
    });

    // 自动加载内置工具（HTTP、文件、任务等）
    import('./builtin/index.js').then(({ initAllBuiltInTools }) => {
      initAllBuiltInTools(registryInstance!);
    }).catch((error) => {
      console.error('[ToolRegistry] ❌ 内置工具加载失败:', error.message);
    });
  }
  return registryInstance;
}

export function resetToolRegistry(): void {
  registryInstance = null;
}
