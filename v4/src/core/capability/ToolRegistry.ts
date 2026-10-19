/**
 * Tool Registry - 工具注册中心
 *
 * 基于 LangChain Tools 的工具管理系统
 * 参考：https://js.langchain.com/docs/modules/agents/tools/
 */

import { Tool } from '@langchain/core/tools';
import pino from 'pino';

export type ToolCategory = 'llm' | 'web' | 'browser' | 'file' | 'platform';

export interface ToolInfo {
  name: string;
  description: string;
  category: ToolCategory;
  instance: Tool;
}

export class ToolRegistry {
  private tools = new Map<string, ToolInfo>();
  private logger: pino.Logger;

  constructor() {
    this.logger = pino({ name: 'tool-registry' });
  }

  /**
   * 注册工具
   */
  register(toolInfo: ToolInfo): void {
    this.tools.set(toolInfo.name, toolInfo);
    this.logger.info({ name: toolInfo.name, category: toolInfo.category }, 'Tool registered');
  }

  /**
   * 注册多个工具
   */
  registerMany(toolInfos: ToolInfo[]): void {
    toolInfos.forEach(tool => this.register(tool));
  }

  /**
   * 获取工具
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name)?.instance;
  }

  /**
   * 获取所有工具
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values()).map(t => t.instance);
  }

  /**
   * 按分类获取工具
   */
  getToolsByCategory(category: ToolCategory): ToolInfo[] {
    return Array.from(this.tools.values()).filter(t => t.category === category);
  }

  /**
   * 获取工具列表
   */
  listTools(): { name: string; description: string; category: ToolCategory }[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      category: t.category
    }));
  }

  /**
   * 执行工具
   */
  async executeTool(name: string, input: string): Promise<any> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    this.logger.info({ name, input }, 'Executing tool');
    try {
      const result = await tool.invoke(input);
      this.logger.info({ name, result }, 'Tool execution completed');
      return result;
    } catch (error) {
      this.logger.error({ name, input, error }, 'Tool execution failed');
      throw error;
    }
  }

  /**
   * 移除工具
   */
  unregister(name: string): boolean {
    const deleted = this.tools.delete(name);
    if (deleted) {
      this.logger.info({ name }, 'Tool unregistered');
    }
    return deleted;
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
    this.logger.info('All tools cleared');
  }
}
