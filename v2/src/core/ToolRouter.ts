/**
 * AI Company v2 - Tool Router
 * 基于关键词和规则的意图分析，将用户输入路由到合适的工具
 */

import type { IntentAnalysis } from '../types.js';
import type { ToolContext } from './tools/types.js';

// 置信度阈值
const CONFIDENCE_HIGH = 0.85;
const CONFIDENCE_MEDIUM = 0.7;
const CONFIDENCE_LOW = 0.5;

export class ToolRouter {
  /**
   * 分析用户输入，返回意图和需要调用的工具
   */
  async analyze(input: string, context?: Partial<ToolContext>): Promise<{
    intent: IntentAnalysis;
    toolCalls: Array<{ tool: string; params: Record<string, unknown> }>;
  }> {
    const normalizedInput = input.toLowerCase().trim();
    const toolCalls: Array<{ tool: string; params: Record<string, unknown> }> = [];

    // 目标相关
    if (this.matchesAny(normalizedInput, ['目标', 'goal', '达成', '完成', 'objective'])) {
      if (this.matchesAny(normalizedInput, ['创建', '新建', 'make', 'create', 'add', '添加', '弄', '搞'])) {
        toolCalls.push({
          tool: 'create_goal',
          params: {
            title: this.extractGoalTitle(input),
            type: this.extractGoalType(normalizedInput),
          },
        });
        return {
          intent: { type: 'create_goal', confidence: CONFIDENCE_HIGH, entities: { title: this.extractGoalTitle(input) } },
          toolCalls,
        };
      }
      if (this.matchesAny(normalizedInput, ['进度', 'progress', '多少', '百分比', '完成度'])) {
        // 尝试提取 goalId
        const goalId = this.extractGoalId(input, context);
        toolCalls.push({ tool: 'get_goal_progress', params: { goalId } });
        return { intent: { type: 'query_goals', confidence: CONFIDENCE_MEDIUM, entities: {} }, toolCalls };
      }
      toolCalls.push({ tool: 'list_goals', params: {} });
      return { intent: { type: 'query_goals', confidence: CONFIDENCE_MEDIUM, entities: {} }, toolCalls };
    }

    // 任务相关
    if (this.matchesAny(normalizedInput, ['任务', 'task', 'todo', '待办', '事情'])) {
      if (this.matchesAny(normalizedInput, ['创建', '新建', 'add', '添加', '发布'])) {
        return {
          intent: { type: 'create_task', confidence: CONFIDENCE_MEDIUM, entities: { description: this.extractTaskDescription(input) } },
          toolCalls: [{ tool: 'chat', params: { hint: 'create_task' } }],
        };
      }
      return { intent: { type: 'query_tasks', confidence: CONFIDENCE_LOW, entities: {} }, toolCalls: [] };
    }

    // 员工相关
    if (this.matchesAny(normalizedInput, ['员工', 'employee', '成员', '排行', 'leaderboard', 'top', '第一', '成绩', '绩效'])) {
      if (this.matchesAny(normalizedInput, ['排行', 'leaderboard', 'top', '第一', '成绩', '绩效', '排名'])) {
        toolCalls.push({ tool: 'get_leaderboard', params: {} });
        return { intent: { type: 'query_employees', confidence: CONFIDENCE_HIGH, entities: {} }, toolCalls };
      }
      toolCalls.push({ tool: 'list_employees', params: {} });
      return { intent: { type: 'query_employees', confidence: CONFIDENCE_MEDIUM, entities: {} }, toolCalls };
    }

    // 定时任务
    if (this.matchesAny(normalizedInput, ['定时', '计划任务', 'schedule', 'cron', '每天', '每周', '每小时', '循环', '重复'])) {
      if (this.matchesAny(normalizedInput, ['创建', '新建', 'add', '添加', '设置', '配置'])) {
        toolCalls.push({
          tool: 'create_scheduled_task',
          params: {
            name: this.extractTaskName(input),
            cronRule: this.parseCronExpression(input),
            command: 'echo "Running scheduled task"',
          },
        });
        return { intent: { type: 'create_script', confidence: CONFIDENCE_MEDIUM, entities: {} }, toolCalls };
      }
      toolCalls.push({ tool: 'list_scheduled_tasks', params: {} });
      return { intent: { type: 'query_status', confidence: CONFIDENCE_MEDIUM, entities: {} }, toolCalls };
    }

    // 系统状态
    if (this.matchesAny(normalizedInput, ['状态', 'status', '怎么样', '如何', 'overview', '系统', '总览', '情况'])) {
      toolCalls.push({ tool: 'query_system_status', params: {} });
      return { intent: { type: 'query_status', confidence: CONFIDENCE_HIGH, entities: {} }, toolCalls };
    }

    // 开放性任务 - 创建应用/网站/工具等
    // 第一组：动作关键词（创建、开发、写等）
    const actionKeywords = ['创建', '新建', 'make', 'create', 'add', '添加', '弄', '搞', '开发', 'build', 'generate', '写', '做一个', '做一个'];
    // 第二组：目标对象关键词（应用、网站、工具等）
    const targetKeywords = ['应用', 'app', '网站', 'web', '网页', '工具', 'tool', '程序', 'program', '页面', 'page', '系统', '功能', '计算器', '游戏'];

    if (this.matchesAny(normalizedInput, actionKeywords)) {
      if (this.matchesAny(normalizedInput, targetKeywords)) {
        return {
          intent: { type: 'open_task', confidence: CONFIDENCE_HIGH, entities: { description: this.extractTaskDescription(input) } },
          toolCalls: [{ tool: 'execute_open_task', params: { description: this.extractTaskDescription(input) } }],
        };
      }
    }

    // 默认聊天
    toolCalls.push({ tool: 'chat', params: {} });
    return { intent: { type: 'chat', confidence: CONFIDENCE_LOW, entities: {} }, toolCalls };
  }

  /**
   * 检查输入是否匹配任一关键词
   */
  private matchesAny(input: string, keywords: string[]): boolean {
    return keywords.some(k => input.includes(k));
  }

  /**
   * 从输入中提取目标标题
   */
  private extractGoalTitle(input: string): string {
    return input
      .replace(/^(创建|新建|添加|make|create|add|弄|搞|设|立)\s*(一个|a|an|个)?\s*/i, '')
      .replace(/^(目标|任务|task|goal|objective)\s*/i, '')
      .replace(/^(每天|每周|每月|长期|短期)\s*/i, '')
      .replace(/^(to|for|of)\s*/i, '')
      .trim() || '未命名目标';
  }

  /**
   * 从输入中提取目标类型
   */
  private extractGoalType(input: string): 'long_term' | 'short_term' {
    if (this.matchesAny(input, ['长期', 'long', 'longterm', '月', '年'])) {
      return 'long_term';
    }
    return 'short_term';
  }

  /**
   * 从输入中提取任务描述
   */
  private extractTaskDescription(input: string): string {
    return input
      .replace(/^(创建|新建|添加|make|create|add|弄|搞)\s*(一个|a|an|个)?\s*/i, '')
      .replace(/^(任务|task|todo)\s*/i, '')
      .trim() || '未命名任务';
  }

  /**
   * 从输入中提取任务名称
   */
  private extractTaskName(input: string): string {
    const extracted = this.extractGoalTitle(input);
    return extracted.length > 30 ? extracted.substring(0, 30) : extracted || 'Scheduled Task';
  }

  /**
   * 尝试从输入或上下文中提取 goalId
   */
  private extractGoalId(input: string, context?: Partial<ToolContext>): string {
    // 先检查是否明确提到了 ID
    const idMatch = input.match(/[a-z]+_\d+_[a-z0-9]+/i);
    if (idMatch) {
      return idMatch[0];
    }

    // 如果上下文中有历史记录，尝试查找最近的目标
    if (context?.history && context.history.length > 0) {
      const recent = context.history.slice(-3).reverse();
      for (const msg of recent) {
        if (msg.content.includes('目标') || msg.content.includes('goal')) {
          const match = msg.content.match(/[a-z]+_\d+_[a-z0-9]+/i);
          if (match) return match[0];
        }
      }
    }

    return '';
  }

  /**
   * 解析 cron 表达式
   */
  private parseCronExpression(input: string): string {
    const lower = input.toLowerCase();

    // 每天 X 点
    const dailyMatch = lower.match(/(?:每天|daily)\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?(?:点|:)?/);
    if (dailyMatch) {
      const hour = dailyMatch[1].padStart(2, '0');
      const minute = dailyMatch[2] || '00';
      return `${minute} ${hour} * * *`;
    }

    // 每小时
    if (this.matchesAny(lower, ['每小时', 'hourly', 'every hour'])) {
      return '0 * * * *';
    }

    // 每周一
    if (this.matchesAny(lower, ['每周一', 'monday', '每周'])) {
      return '0 9 * * 1';
    }

    // 默认每天9点
    return '0 9 * * *';
  }
}

let instance: ToolRouter | null = null;
export function getToolRouter(): ToolRouter {
  if (!instance) instance = new ToolRouter();
  return instance;
}
