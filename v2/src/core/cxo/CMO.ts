/**
 * CXO 架构 - CMO (Chief Marketing Officer)
 *
 * 职责：营销内容任务执行
 * - 内容创作（小说、文章、文案）
 * - 社交媒体运营（小红书、Twitter）
 * - 品牌营销
 */

import { getAPIAgentExecutor } from '../execution/APIAgentExecutor.js';
import type { ICXO, TaskRequirements, ExecutionResult } from './types.js';

export class CMO implements ICXO {
  name = '苏思语';
  role = 'CMO' as const;
  capabilities = ['writing', 'marketing', 'growth', 'content-creation', 'xiaohongshu', 'twitter'];

  /**
   * 判断是否能处理该任务
   */
  canHandle(requirements: TaskRequirements): boolean {
    const caps = requirements.requiredCapabilities;

    // 营销内容相关的关键词
    const marketingKeywords = [
      '写', '创作', '文案', '文章', '小说', '内容',
      '小红书', '微博', 'twitter', '公众号',
      '笔记', '种草', '推广', '营销', '运营',
      '文案', '标题', '广告', '宣传',
      'article', 'post', 'copywriting', 'content'
    ];

    const desc = requirements.description.toLowerCase();

    // 能力匹配或关键词匹配
    const hasCapability = caps.some(c => this.capabilities.includes(c));
    const hasKeyword = marketingKeywords.some(k => desc.includes(k));

    return hasCapability || hasKeyword;
  }

  /**
   * 执行任务
   */
  async execute(requirements: TaskRequirements, agentPrompt: string): Promise<ExecutionResult> {
    console.log(`\n[CMO] 📝 执行营销内容任务`);
    console.log(`[CMO] 任务: ${requirements.description.substring(0, 50)}...`);

    const taskId = `task-cmo-${Date.now()}`;

    try {
      // 使用 API Agent 执行器
      const executor = getAPIAgentExecutor({
        agentId: taskId,
        agentName: '苏思语',
        systemPrompt: agentPrompt,
        maxTurns: 10,
        timeout: 300000, // 5 分钟
        taskId,
      });

      const result = await executor.execute(requirements.description);

      console.log(`[CMO] ✅ 任务完成: ${result.success ? '成功' : '失败'}`);

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        artifacts: result.artifacts,
        duration: result.usage ? (result.usage.inputTokens + result.usage.outputTokens) : 0,
        usage: result.usage,
      };

    } catch (error: any) {
      console.error(`[CMO] ❌ 任务执行失败: ${error.message}`);
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

let cmoInstance: CMO | null = null;

export function getCMO(): CMO {
  if (!cmoInstance) {
    cmoInstance = new CMO();
  }
  return cmoInstance;
}

export function resetCMO(): void {
  cmoInstance = null;
}
