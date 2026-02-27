/**
 * AI Company v2 - 意图分析
 *
 * 使用 LLM 理解用户意图
 */
import type { IntentAnalysis, IntentType } from '../types.js';
import type { AIProvider } from '../ai/AI.js';

const INTENT_PROMPT = `你是意图理解专家。请分析用户的输入，返回 JSON 格式。

【意图类型】
- create_task: 创建一个一次性任务
- create_goal: 创建目标（长期/短期/循环）
- create_script: 创建自动化脚本（定时执行）
- execute_cron: 执行定时任务
- query_status: 查询系统状态
- query_tasks: 查询任务列表
- query_goals: 查询目标列表
- query_employees: 查询员工列表
- chat: 普通对话或提问
- unknown: 无法识别

【提取规则】
1. 如果包含"每天"、"每日"、"每X"等循环词 → create_goal，type为recurring
2. 如果提到"目标"、"达成"等 → create_goal
3. 如果是"创建任务"、"新建"等明确动词 → create_task
4. 如果包含"自动化"、"定时"、"脚本"等 → create_script

【返回格式】
{
  "type": "意图类型",
  "confidence": 0.0-1.0,
  "entities": {
    "description": "任务/目标描述",
    "title": "目标标题",
    "goalType": "long_term/short_term/recurring",
    "priority": "urgent/high/medium/low",
    "cronRule": "cron表达式(如有)",
    "recurring": {
      "frequency": "daily/weekly/monthly",
      "time": "时间(如有)",
      "autoRenew": true/false
    }
  },
  "reasoning": "分析过程"
}`;

export class IntentionAnalyzer {
  constructor(private ai: AIProvider) {}

  async analyze(input: {
    content: string;
    context?: {
      history?: Array<{ role: string; content: string }>;
      userId?: string;
    };
  }): Promise<IntentAnalysis> {
    // 构建完整提示
    let fullPrompt = INTENT_PROMPT + '\n\n【用户输入】\n' + input.content;

    // 添加历史上下文
    if (input.context?.history && input.context.history.length > 0) {
      fullPrompt += '\n\n【对话历史】\n' +
        input.context.history.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n');
    }

    try {
      const startTime = Date.now();
      const response = await this.ai.generate(fullPrompt, {
        temperature: 0.3,
      });

      const latency = Date.now() - startTime;

      // 解析响应
      let parsed;
      try {
        parsed = JSON.parse(response);
      } catch (parseError) {
        console.error('[IntentionAnalyzer] Failed to parse AI response:', response.substring(0, 500));
        throw new Error(`Invalid JSON response from AI: ${(parseError as Error).message}`);
      }

      return {
        type: parsed.type || 'unknown',
        confidence: parsed.confidence || 0.5,
        entities: parsed.entities || {},
        reasoning: parsed.reasoning || '',
      };
    } catch (error: any) {
      console.error('[IntentionAnalyzer] Error:', error.message);

      // 降级到简单规则
      return this.fallbackAnalyze(input.content);
    }
  }

  /**
   * 降级分析（不使用 LLM）
   */
  private fallbackAnalyze(content: string): IntentAnalysis {
    const lower = content.toLowerCase();

    // 目标检测
    if (lower.includes('目标') || lower.match(/(?:每天|每日|每)\s*\w+/)) {
      return {
        type: 'create_goal',
        confidence: 0.6,
        entities: {
          title: content,
          description: content,
        },
      };
    }

    // 脚本检测
    if (lower.includes('自动化') || lower.includes('定时') || lower.includes('脚本')) {
      return {
        type: 'create_script',
        confidence: 0.6,
        entities: {
          description: content,
        },
      };
    }

    // 查询检测
    if (lower.startsWith('查询') || lower.startsWith('查看') || lower.startsWith('状态')) {
      return {
        type: 'query_status',
        confidence: 0.9,
        entities: {},
      };
    }

    // 默认为任务
    return {
      type: 'create_task',
      confidence: 0.5,
      entities: {
        description: content,
      },
    };
  }
}
