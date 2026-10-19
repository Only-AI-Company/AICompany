/**
 * CXO 架构 - CFO (Chief Financial Officer)
 *
 * 职责：财务分析任务执行
 * - 财务数据分析
 * - 成本控制
 * - 投资回报分析
 */

import { getAPIAgentExecutor } from '../execution/APIAgentExecutor.js';
import type { ICXO, TaskRequirements, ExecutionResult } from './types.js';

export class CFO implements ICXO {
  name = '财务官';
  role = 'CFO' as const;
  capabilities = ['analysis', 'finance', 'data', 'reporting', 'planning'];

  /**
   * 判断是否能处理该任务
   */
  canHandle(requirements: TaskRequirements): boolean {
    const caps = requirements.requiredCapabilities;

    // 财务分析相关的关键词
    const financeKeywords = [
      '分析', '数据', '统计', '报告',
      '财务', '成本', '预算', 'KPI',
      '分析', '报告', '统计', '洞察',
      'analyze', 'data', 'report', 'insight'
    ];

    const desc = requirements.description.toLowerCase();

    // 能力匹配或关键词匹配
    const hasCapability = caps.some(c => this.capabilities.includes(c));
    const hasKeyword = financeKeywords.some(k => desc.includes(k));

    return hasCapability || hasKeyword;
  }

  /**
   * 执行任务
   */
  async execute(requirements: TaskRequirements, agentPrompt: string): Promise<ExecutionResult> {
    console.log(`\n[CFO] 📊 执行财务分析任务`);
    console.log(`[CFO] 任务: ${requirements.description.substring(0, 50)}...`);

    const taskId = 'task-cfo-' + Date.now();

    try {
      // 使用 API Agent 执行器
      const executor = getAPIAgentExecutor({
        agentId: taskId,
        agentName: '财务官',
        systemPrompt: agentPrompt,
        maxTurns: 10,
        timeout: 300000, // 5 分钟
        taskId,
      });

      const result = await executor.execute(requirements.description);

      console.log(`[CFO] ✅ 任务完成: ${result.success ? '成功' : '失败'}`);

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        artifacts: result.artifacts,
        duration: result.usage ? (result.usage.inputTokens + result.usage.outputTokens) : 0,
        usage: result.usage,
      };

    } catch (error: any) {
      console.error(`[CFO] ❌ 任务执行失败: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// ============================================================================
// 单例
// ============================================================================

let cfoInstance: CFO | null = null;

export function getCFO(): CFO {
  if (!cfoInstance) {
    cfoInstance = new CFO();
  }
  return cfoInstance;
}

export function resetCFO(): void {
  cfoInstance = null;
}
