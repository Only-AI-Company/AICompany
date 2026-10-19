/**
 * CXO 架构 - COO (Chief Operating Officer)
 *
 * 职责：运营管理任务执行
 * - 任务规划和分解
 * - 流程优化
 * - 日常运营协调
 */

import { getAPIAgentExecutor } from '../execution/APIAgentExecutor.js';
import type { ICXO, TaskRequirements, ExecutionResult } from './types.js';

export class COO implements ICXO {
  name = '郑立行';
  role = 'COO' as const;
  capabilities = ['planning', 'management', 'automation', 'analysis', 'coordination'];

  /**
   * 判断是否能处理该任务
   */
  canHandle(requirements: TaskRequirements): boolean {
    const caps = requirements.requiredCapabilities;

    // 运营管理相关的关键词
    const opsKeywords = [
      '规划', '计划', '分解', '流程', '优化',
      '协调', '管理', '组织', '调度',
      'plan', 'schedule', 'coordinate', 'manage',
      'SOP', '标准', '规范', '制度'
    ];

    const desc = requirements.description.toLowerCase();

    // 能力匹配或关键词匹配
    const hasCapability = caps.some(c => this.capabilities.includes(c));
    const hasKeyword = opsKeywords.some(k => desc.includes(k));

    return hasCapability || hasKeyword;
  }

  /**
   * 执行任务
   */
  async execute(requirements: TaskRequirements, agentPrompt: string): Promise<ExecutionResult> {
    console.log(`\n[COO] 📋 执行运营管理任务`);
    console.log(`[COO] 任务：${requirements.description.substring(0, 50)}...`);

    const taskId = `task-coo-${Date.now()}`;

    try {
      // 使用 API Agent 执行器
      const executor = getAPIAgentExecutor({
        agentId: taskId,
        agentName: '郑立行',
        systemPrompt: agentPrompt,
        maxTurns: 12,
        timeout: 300000, // 5 分钟
        taskId,
      });

      const result = await executor.execute(requirements.description);

      console.log(`[COO] ✅ 任务完成：${result.success ? '成功' : '失败'}`);

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        artifacts: result.artifacts,
        duration: result.usage ? (result.usage.inputTokens + result.usage.outputTokens) : 0,
        usage: result.usage,
      };

    } catch (error: any) {
      console.error(`[COO] ❌ 任务执行失败：${error.message}`);
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

let cooInstance: COO | null = null;

export function getCOO(): COO {
  if (!cooInstance) {
    cooInstance = new COO();
  }
  return cooInstance;
}

export function resetCOO(): void {
  cooInstance = null;
}
