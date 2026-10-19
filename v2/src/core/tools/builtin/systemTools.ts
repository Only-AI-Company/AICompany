/**
 * AI Company v2 - System Tools
 *
 * 系统控制工具：generate_plan, start_goal_execution, pause_goal_execution
 */

import type { Tool, ToolContext, ToolResult } from '../types.js';
import type { ToolRegistry } from '../ToolRegistry.js';
import { getDatabase } from '../../../db/Database.js';
import { getProvider, callWithRetry, type ProviderResponse } from '../../ai/AIProvider.js';

/**
 * 生成执行计划
 */
const generatePlanTool: Tool = {
  name: 'generate_plan',
  description: `生成任务执行计划。

## 使用场景

- 用户有一个复杂需求，需要分解为多个步骤
- 用户不确定如何开始，需要制定执行计划
- 用户想了解实现某个目标的大致流程

## 本工具不涉及数据库

本工具使用 AI 生成计划，不直接操作数据库。计划生成后可以：
- 展示给用户查看
- 作为创建任务和目标的参考`,
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      goal: {
        type: 'string',
        description: '目标或任务描述',
        required: true,
      },
      steps: {
        type: 'number',
        description: '期望的步骤数量',
        default: 5,
      },
    },
    required: ['goal'],
  },
  enabled: true,
  async handler(
    input: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const prompt = `请为以下目标生成执行计划，包含 ${input.steps || 5} 个具体步骤：

目标：${input.goal}

请返回 JSON 格式的计划：
{
  "steps": [
    {
      "order": 1,
      "action": "步骤描述",
      "estimatedDuration": "预计耗时"
    }
  ],
  "summary": "计划总结"
}

只返回 JSON，不要其他内容。`;

      const provider = getProvider();
      const response: ProviderResponse = await callWithRetry(
        () => provider.prompt(prompt),
        { maxRetries: 2, initialDelay: 500 }
      );

      const plan = JSON.parse(response.content);

      return {
        success: true,
        data: plan,
        message: `已生成执行计划：${plan.summary || `${plan.steps?.length || 0} 个步骤`}`,
      };
    } catch (error: any) {
      // Fallback：返回简单计划
      const fallbackPlan = {
        steps: [{ order: 1, action: input.goal, estimatedDuration: '未知' }],
        summary: '无法生成详细计划，请手动执行',
      };

      return {
        success: true,
        data: fallbackPlan,
        message: '已生成简化执行计划',
      };
    }
  },
};

/**
 * 启动目标执行
 */
const startGoalExecutionTool: Tool = {
  name: 'start_goal_execution',
  description: `启动目标执行流程。

## 数据库表结构 (goals 表)

\`\`sql
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,             -- pending_owner, active, completed, cancelled
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
  ...
);
\`\`

⚠️ 重要说明：
- goals 表**没有** \`started_at\` 列！只有 \`created_at\` 和 \`updated_at\`
- 将目标状态更新为 'active' 即可

## 使用场景

- 目标准备就绪，正式开始执行
- 从暂停状态恢复执行`,
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      goalId: {
        type: 'string',
        description: '目标 ID',
        required: true,
      },
    },
    required: ['goalId'],
  },
  enabled: true,
  async handler(
    input: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const db = getDatabase();

      // 检查目标是否存在
      const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(input.goalId) as any;

      if (!goal) {
        return {
          success: false,
          error: '目标不存在',
        };
      }

      // 更新目标状态 - 使用正确的列名
      db.prepare(`
        UPDATE goals
        SET status = 'active', updated_at = ?
        WHERE id = ?
      `).run(Date.now(), input.goalId);  // ← 只有 updated_at，没有 started_at

      return {
        success: true,
        data: { goalId: input.goalId, status: 'active' },
        message: `目标 "${goal.title}" 已开始执行`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `启动目标执行失败：${error.message}`,
      };
    }
  },
};

/**
 * 暂停目标执行
 */
const pauseGoalExecutionTool: Tool = {
  name: 'pause_goal_execution',
  description: `暂停目标执行。

## 数据库表结构 (goals 表)

\`\`sql
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
  ...
);
\`\`

⚠️ 重要说明：
- goals 表**没有** \`paused_at\` 列！
- 只需将 status 更新为 'pending' 即可

## 使用场景

- 临时停止目标执行
- 用户要求暂停某个目标`,
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      goalId: {
        type: 'string',
        description: '目标 ID',
        required: true,
      },
      reason: {
        type: 'string',
        description: '暂停原因',
      },
    },
    required: ['goalId'],
  },
  enabled: true,
  async handler(
    input: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const db = getDatabase();

      // 检查目标是否存在
      const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(input.goalId) as any;

      if (!goal) {
        return {
          success: false,
          error: '目标不存在',
        };
      }

      // 更新目标状态 - 使用正确的列名
      db.prepare(`
        UPDATE goals
        SET status = 'pending', updated_at = ?
        WHERE id = ?
      `).run(Date.now(), input.goalId);  // ← 只有 updated_at，没有 paused_at

      // 暂停相关任务
      db.prepare(`
        UPDATE tasks
        SET status = 'pending', updated_at = ?
        WHERE goal_id = ? AND status = 'executing'
      `).run(Date.now(), input.goalId);

      const reasonText = input.reason ? `（原因：${input.reason}）` : '';

      return {
        success: true,
        data: { goalId: input.goalId, status: 'paused' },
        message: `目标 "${goal.title}" 已暂停${reasonText}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `暂停目标执行失败：${error.message}`,
      };
    }
  },
};

/**
 * 初始化 System 工具
 */
export function initSystemTools(registry: ToolRegistry): void {
  registry.register(generatePlanTool);
  registry.register(startGoalExecutionTool);
  registry.register(pauseGoalExecutionTool);
}
