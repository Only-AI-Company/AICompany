/**
 * AI Company v2 - Tool Registry
 * 工具注册中心：负责工具的注册和查询
 */

import type { Tool, ToolContext, ToolResult, ToolParameter } from './types.js';
import { ToolCategory } from './types.js';
import { getGoalManager } from '../Goal.js';
import { getEmployeeService } from '../Employee.js';
import type { AIDatabase } from '../../db/Database.js';

/**
 * 参数验证器
 */
class ParameterValidator {
  static validate(
    params: Record<string, unknown>,
    definition: Record<string, ToolParameter>
  ): { valid: boolean; error?: string } {
    for (const [key, param] of Object.entries(definition)) {
      // 检查必需参数
      if (param.required && params[key] === undefined) {
        return { valid: false, error: `Missing required parameter: ${key}` };
      }

      // 检查类型
      if (params[key] !== undefined) {
        const value = params[key];
        const typeError = this.checkType(value, param);
        if (typeError) {
          return { valid: false, error: `Parameter ${key}: ${typeError}` };
        }

        // 检查枚举值
        if (param.enum && typeof value === 'string' && !param.enum.includes(value)) {
          return {
            valid: false,
            error: `Parameter ${key} must be one of: ${param.enum.join(', ')}`,
          };
        }
      }
    }
    return { valid: true };
  }

  private static checkType(value: unknown, param: ToolParameter): string | null {
    switch (param.type) {
      case 'string':
        return typeof value !== 'string' ? 'must be a string' : null;
      case 'number':
        return typeof value !== 'number' ? 'must be a number' : null;
      case 'boolean':
        return typeof value !== 'boolean' ? 'must be a boolean' : null;
      case 'object':
        return typeof value !== 'object' || value === null ? 'must be an object' : null;
      case 'array':
        return !Array.isArray(value) ? 'must be an array' : null;
      default:
        return null;
    }
  }
}

/**
 * 工具注册表
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  /**
   * 注册工具
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Tool "${tool.name}" already registered, overwriting`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 批量注册工具
   */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 获取工具
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取所有工具
   */
  getAll(category?: ToolCategory): Tool[] {
    const allTools = Array.from(this.tools.values());
    if (category) {
      return allTools.filter(t => t.category === category);
    }
    return allTools;
  }

  /**
   * 获取工具名称列表
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 获取工具数量
   */
  size(): number {
    return this.tools.size;
  }
}

/**
 * 工具执行器
 */
export class ToolExecutor {
  /**
   * 执行工具
   */
  async execute(
    tool: Tool,
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    // 参数验证
    if (tool.parameters) {
      const validation = ParameterValidator.validate(params, tool.parameters);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error || '参数验证失败',
          response: `❌ 参数错误: ${validation.error}`,
        };
      }
    }

    // 执行工具
    try {
      return await tool.handler(params, context);
    } catch (error) {
      console.error(`[ToolExecutor] Error executing tool "${tool.name}":`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        response: `❌ 执行失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 通过名称执行工具
   */
  async executeByName(
    name: string,
    params: Record<string, unknown>,
    context: ToolContext,
    registry: ToolRegistry
  ): Promise<ToolResult> {
    const tool = registry.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
        response: `❌ 未知工具: ${name}`,
      };
    }
    return this.execute(tool, params, context);
  }
}

// 单例
let registryInstance: ToolRegistry | null = null;
let executorInstance: ToolExecutor | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
    registryInstance.registerAll(createBuiltinTools());
  }
  return registryInstance;
}

export function getToolExecutor(): ToolExecutor {
  if (!executorInstance) {
    executorInstance = new ToolExecutor();
  }
  return executorInstance;
}

/**
 * 内置工具定义
 */
function createBuiltinTools(): Tool[] {
  // Goal tools
  const createGoal: Tool = {
    name: 'create_goal',
    description: 'Create a new goal. Use when user wants to achieve something, create objectives, or set targets.',
    category: ToolCategory.GOAL,
    parameters: {
      title: { type: 'string', description: 'Goal title', required: true },
      type: { type: 'string', description: 'Goal type: long_term or short_term', required: true, enum: ['long_term', 'short_term'] },
      description: { type: 'string', description: 'Detailed description of the goal', required: false },
    },
    handler: async (params, ctx) => {
      const manager = getGoalManager();
      const goal = await manager.createGoal({
        type: params.type as 'long_term' | 'short_term',
        title: String(params.title),
        description: params.description ? String(params.description) : undefined,
      });
      return {
        success: true,
        data: goal,
        response: `✅ 目标创建成功\n\n📋 ${goal.title}\n🆔 ${goal.id}`,
      };
    },
  };

  const listGoals: Tool = {
    name: 'list_goals',
    description: 'List all goals with their status',
    category: ToolCategory.GOAL,
    handler: async (_, ctx) => {
      const manager = getGoalManager();
      const goals = manager.listGoals();
      if (goals.length === 0) {
        return { success: true, response: '📋 暂无目标', data: [] };
      }
      const lines = goals.map(g => {
        const icon = g.status === 'completed' ? '✅' : g.status === 'active' ? '🚀' : '📋';
        return `${icon} ${g.title}`;
      });
      return {
        success: true,
        response: `📋 目标列表 (${goals.length}个)\n\n${lines.join('\n')}`,
        data: goals,
      };
    },
  };

  const getGoalProgress: Tool = {
    name: 'get_goal_progress',
    description: 'Get progress details for a specific goal',
    category: ToolCategory.GOAL,
    parameters: {
      goalId: { type: 'string', description: 'The goal ID to check progress for', required: false },
    },
    handler: async (params, ctx) => {
      const manager = getGoalManager();
      const goalId = params.goalId as string | undefined;
      if (!goalId) {
        // 没有提供 goalId，返回最新目标的进度
        const goals = manager.listGoals();
        if (goals.length === 0) {
          return { success: true, response: '📋 暂无目标', data: null };
        }
        const latestGoal = goals[0];
        const progress = manager.getProgress(latestGoal.id);
        return {
          success: true,
          data: progress,
          response: `📊 ${progress.goal.title} (最新目标)\n\n状态: ${progress.status}`,
        };
      }
      const progress = manager.getProgress(goalId);
      return {
        success: true,
        data: progress,
        response: `📊 ${progress.goal.title}\n\n状态: ${progress.status}`,
      };
    },
  };

  // Employee tools
  const listEmployees: Tool = {
    name: 'list_employees',
    description: 'List all active employees',
    category: ToolCategory.EMPLOYEE,
    handler: async (_, ctx) => {
      const db = ctx.db as AIDatabase;
      const employees = db.listEmployees({ status: 'active' });
      if (employees.length === 0) {
        return { success: true, response: '👥 暂无员工', data: [] };
      }
      const lines = employees.map((e: unknown) => {
        const emp = e as { name: string; role: string };
        return `👤 ${emp.name} (${emp.role})`;
      });
      return {
        success: true,
        response: `👥 员工列表 (${employees.length}人)\n\n${lines.join('\n')}`,
        data: employees,
      };
    },
  };

  const getLeaderboard: Tool = {
    name: 'get_leaderboard',
    description: 'Get employee performance leaderboard ranked by points',
    category: ToolCategory.EMPLOYEE,
    handler: async (_, ctx) => {
      const service = getEmployeeService();
      const leaderboard = service.getLeaderboard();
      if (leaderboard.length === 0) {
        return { success: true, response: '🏆 暂无排行数据', data: [] };
      }
      const lines = leaderboard.map((e, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        return `${medal} ${e.name} - ${e.points}分 (Lv.${e.level})`;
      });
      return {
        success: true,
        response: `🏆 员工排行榜\n\n${lines.join('\n')}`,
        data: leaderboard,
      };
    },
  };

  // Cron tools
  const createScheduledTask: Tool = {
    name: 'create_scheduled_task',
    description: 'Create a new scheduled/cron task',
    category: ToolCategory.CRON,
    parameters: {
      name: { type: 'string', description: 'Task name', required: true },
      cronRule: { type: 'string', description: 'Cron expression (e.g., 0 9 * * *)', required: true },
      command: { type: 'string', description: 'Command to execute', required: true },
    },
    handler: async (params, ctx) => {
      const db = ctx.db as AIDatabase;
      const cron = {
        id: `cron_${Date.now()}`,
        name: String(params.name),
        cronRule: String(params.cronRule),
        command: String(params.command),
      };
      db.createCron(cron);
      return {
        success: true,
        data: cron,
        response: `⏰ 定时任务创建成功\n\n📋 ${cron.name}\n⏰ ${cron.cronRule}\n🆔 ${cron.id}`,
      };
    },
  };

  const listScheduledTasks: Tool = {
    name: 'list_scheduled_tasks',
    description: 'List all scheduled/cron tasks',
    category: ToolCategory.CRON,
    handler: async (_, ctx) => {
      const db = ctx.db as AIDatabase;
      const jobs = db.listCrons({});
      if (jobs.length === 0) {
        return { success: true, response: '⏰ 暂无定时任务', data: [] };
      }
      const lines = jobs.map((j: unknown) => {
        const job = j as { name: string; enabled: boolean; cron_rule: string };
        return `${job.enabled ? '✅' : '❌'} ${job.name}: ${job.cron_rule}`;
      });
      return {
        success: true,
        response: `⏰ 定时任务列表 (${jobs.length}个)\n\n${lines.join('\n')}`,
        data: jobs,
      };
    },
  };

  // Query tools
  const querySystemStatus: Tool = {
    name: 'query_system_status',
    description: 'Get overall system status including goals, employees, and tasks',
    category: ToolCategory.QUERY,
    handler: async (_, ctx) => {
      const db = ctx.db as AIDatabase;
      const [goals, employees, cronJobs] = [
        getGoalManager().listGoals(),
        db.listEmployees({ status: 'active' }),
        db.listCrons({}),
      ];
      return {
        success: true,
        data: { goals, employees, cronJobs },
        response: `📊 AI Company 系统状态\n\n🎯 目标: ${goals.length}\n👥 员工: ${employees.length}\n⏰ 定时任务: ${cronJobs.length}`,
      };
    },
  };

  // Chat tool
  const chat: Tool = {
    name: 'chat',
    description: 'General conversational response when no other tool applies',
    category: ToolCategory.CHAT,
    handler: async (params, ctx) => {
      return {
        success: true,
        response: '你好！我是 AI Company CEO。有什么可以帮你？\n\n你可以:\n- 创建目标 (说 "创建一个目标")\n- 查看状态 (说 "系统状态")\n- 查看员工 (说 "员工列表")\n- 创建应用 (说 "创建一个计算器应用")',
      };
    },
  };

  // Open task tool
  const executeOpenTask: Tool = {
    name: 'execute_open_task',
    description: 'Execute an open-ended task like creating an application, website, or tool. Use when user wants to build something specific.',
    category: ToolCategory.SYSTEM,
    parameters: {
      description: { type: 'string', description: 'Task description', required: true },
    },
    handler: async (params, ctx) => {
      // This is handled by the Orchestrator's open_task flow
      return {
        success: true,
        response: `正在执行任务：${params.description}\n\n系统将自动分析需求、生成计划并执行。`,
      };
    },
  };

  return [
    createGoal,
    listGoals,
    getGoalProgress,
    listEmployees,
    getLeaderboard,
    createScheduledTask,
    listScheduledTasks,
    querySystemStatus,
    chat,
    executeOpenTask,
  ];
}
