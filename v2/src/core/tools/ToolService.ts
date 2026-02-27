/**
 * AI Company v2 - Tool Service
 * 统一入口：意图分析 -> 工具执行
 */

import type { Database, IntentAnalysis } from '../../types.js';
import type { ToolContext, ToolResult } from './types.js';
import { getToolRouter } from '../ToolRouter.js';
import { getToolRegistry, getToolExecutor } from './ToolRegistry.js';

export interface HandleInputResult {
  response: string;
  toolCalls: Array<{ tool: string; params: Record<string, unknown>; result?: ToolResult }>;
  intent: IntentAnalysis;
}

export class ToolService {
  constructor(private db: Database) {}

  async handleInput(
    content: string,
    context?: Partial<ToolContext>
  ): Promise<HandleInputResult> {
    const fullContext: ToolContext = {
      db: this.db,
      inputMessage: content,
      ...context,
    };

    // 1. 意图分析
    const router = getToolRouter();
    const { intent, toolCalls } = await router.analyze(content, fullContext);

    // 2. 执行工具
    const registry = getToolRegistry();
    const executor = getToolExecutor();
    const results: Array<{ tool: string; params: Record<string, unknown>; result?: ToolResult }> = [];
    const responses: string[] = [];

    for (const call of toolCalls) {
      const result = await executor.executeByName(call.tool, call.params, fullContext, registry);
      results.push({ tool: call.tool, params: call.params, result });
      if (result.response) responses.push(result.response);
      if (!result.success) break;
    }

    return {
      response: responses.join('\n\n') || '处理完成',
      toolCalls: results,
      intent,
    };
  }
}

export function getToolService(db: Database): ToolService {
  return new ToolService(db);
}
