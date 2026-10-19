/**
 * AI Company v3 - Tool Registry
 *
 * 工具注册和管理中心
 */

import type { Tool, ToolCategory, AnthropicTool, ToolRegistryConfig, ToolResult } from './types.js';
import { registerBuiltinTools } from './builtin/index.js';
import { registerXiaohongshuTools } from './xiaohongshu/index.js';

// ============================================================================
// Tool Registry
// ============================================================================

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private config: ToolRegistryConfig;

  constructor(config: ToolRegistryConfig = {}) {
    this.config = config;
  }

  /**
   * 注册工具
   */
  register(tool: Tool): void {
    if (this.isToolEnabled(tool.name)) {
      this.tools.set(tool.name, tool);
      console.log(`[ToolRegistry] Registered tool: ${tool.name}`);
    } else {
      console.log(`[ToolRegistry] Tool disabled: ${tool.name}`);
    }
  }

  /**
   * 注销工具
   */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  /**
   * 获取工具
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 列出所有工具
   */
  list(category?: ToolCategory): Tool[] {
    const tools = Array.from(this.tools.values());
    if (category) {
      return tools.filter(t => t.category === category);
    }
    return tools;
  }

  /**
   * 检查工具是否可用
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取所有工具名称
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 转换为 Anthropic 工具格式
   */
  toAnthropicTools(): AnthropicTool[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: Object.entries(tool.parameters.properties).reduce((acc, [key, value]) => ({
          ...acc,
          [key]: {
            type: value.type,
            description: value.description,
            ...(value.enum ? { enum: value.enum } : {}),
          },
        }), {}),
        required: tool.parameters.required || [],
      },
    }));
  }

  /**
   * 执行工具
   */
  async executeTool(
    name: string,
    params: any,
    context: { employeeId: string; taskId: string; workspace?: string }
  ): Promise<ToolResult> {
    const tool = this.get(name);

    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    // 验证参数
    if (!tool.validate(params)) {
      return {
        success: false,
        error: `Invalid parameters for tool: ${name}`,
      };
    }

    try {
      return await tool.execute(params, {
        employeeId: context.employeeId,
        taskId: context.taskId,
        workspace: context.workspace,
      });
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 检查工具是否启用
   */
  private isToolEnabled(name: string): boolean {
    const { enabledTools } = this.config;

    // 如果没有配置 enabledTools，默认全部启用
    if (!enabledTools || enabledTools.length === 0) {
      return true;
    }

    return enabledTools.includes(name);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let defaultRegistry: ToolRegistry | null = null;

export function getDefaultToolRegistry(): ToolRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ToolRegistry();

    // 注册内置工具
    registerBuiltinTools(defaultRegistry);

    // 注册小红书工具
    registerXiaohongshuTools(defaultRegistry);
  }
  return defaultRegistry;
}

export function resetToolRegistry(): void {
  defaultRegistry = null;
}
