/**
 * CXO 架构 - CTO (Chief Technology Officer)
 *
 * 职责：技术任务执行
 * - 编码开发
 * - 架构设计
 * - 技术问题解决
 */

import { getAPIAgentExecutor } from '../execution/APIAgentExecutor.js';
import type { ICXO, TaskRequirements, ExecutionResult } from './types.js';

export class CTO implements ICXO {
  name = '林拓海';
  role = 'CTO' as const;
  capabilities = ['coding', 'architecture', 'cloud', 'ai/ml', 'devops'];

  /**
   * 判断是否能处理该任务
   */
  canHandle(requirements: TaskRequirements): boolean {
    const caps = requirements.requiredCapabilities;

    // 技术相关的任务
    const techKeywords = [
      'code', 'coding', 'programming', 'develop', 'api', 'app', 'function',
      'architecture', 'design', 'system', 'database',
      'fix', 'bug', 'debug', 'test', 'deploy',
      '脚本', '工具', '自动化'
    ];

    const desc = requirements.description.toLowerCase();

    // 能力匹配或关键词匹配
    const hasCapability = caps.some(c => this.capabilities.includes(c));
    const hasKeyword = techKeywords.some(k => desc.includes(k));

    return hasCapability || hasKeyword;
  }

  /**
   * 执行任务
   */
  async execute(requirements: TaskRequirements, agentPrompt: string): Promise<ExecutionResult> {
    console.log(`\n[CTO] 💻 执行技术任务`);
    console.log(`[CTO] 任务: ${requirements.description.substring(0, 50)}...`);

    const taskId = `task-cto-${Date.now()}`;

    try {
      // 使用 API Agent 执行器
      const executor = getAPIAgentExecutor({
        agentId: taskId,
        agentName: '林拓海',
        systemPrompt: agentPrompt,
        maxTurns: 15,
        timeout: 600000, // 10 分钟
        taskId,
      });

      const result = await executor.execute(requirements.description);

      console.log(`[CTO] ✅ 任务完成: ${result.success ? '成功' : '失败'}`);

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        artifacts: result.artifacts,
        duration: result.usage ? (result.usage.inputTokens + result.usage.outputTokens) : 0,
        usage: result.usage,
      };

    } catch (error: any) {
      console.error(`[CTO] ❌ 任务执行失败: ${error.message}`);
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

let ctoInstance: CTO | null = null;

export function getCTO(): CTO {
  if (!ctoInstance) {
    ctoInstance = new CTO();
  }
  return ctoInstance;
}

export function resetCTO(): void {
  ctoInstance = null;
}
