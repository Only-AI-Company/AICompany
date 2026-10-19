/**
 * AI Company v2 - Query Tools
 *
 * 查询统计工具：query_system_status, search_activities
 */

import type { Tool, ToolContext, ToolResult } from '../types.js';
import type { ToolRegistry } from '../ToolRegistry.js';
import { getDatabase } from '../../../db/Database.js';

/**
 * 查询系统状态
 */
const querySystemStatusTool: Tool = {
  name: 'query_system_status',
  description: `查询系统当前的整体状态。

## 数据库表结构

本工具聚合查询多个表：
- **goals**: goals 表
- **tasks**: tasks 表
- **employees**: employees 表
- **crontab**: 定时任务表

## 使用场景

- 当用户问"系统怎么样了"、"状态如何"、"有什么在进行"
- 当用户问"概况"、"总览"、"summary"
- 当用户想快速了解系统运行情况

## 返回信息

- 目标：总数、活跃数、已完成数
- 任务：总数、执行中数、已完成数、失败数
- 员工：总数、活跃数
- 定时任务：总数、启用数`,
  category: 'query',
  parameters: {
    type: 'object',
    properties: {
      includeDetails: {
        type: 'boolean',
        description: '是否包含详细信息',
        default: false,
      },
    },
  },
  enabled: true,
  async handler(
    input: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const db = getDatabase();

      // 获取统计信息
      const goalStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'pending_owner' THEN 1 ELSE 0 END) as pending
        FROM goals
      `).get() as any;

      const taskStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'executing' THEN 1 ELSE 0 END) as executing,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM tasks
      `).get() as any;

      const employeeStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
        FROM employees
      `).get() as any;

      const cronStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled
        FROM crontab
      `).get() as any;

      const status = {
        goals: {
          total: goalStats.total || 0,
          active: goalStats.active || 0,
          completed: goalStats.completed || 0,
          pending: goalStats.pending || 0,
        },
        tasks: {
          total: taskStats.total || 0,
          executing: taskStats.executing || 0,
          completed: taskStats.completed || 0,
          pending: taskStats.pending || 0,
          failed: taskStats.failed || 0,
        },
        employees: {
          total: employeeStats.total || 0,
          active: employeeStats.active || 0,
        },
        cronJobs: {
          total: cronStats.total || 0,
          enabled: cronStats.enabled || 0,
        },
      };

      let message = `系统状态：${status.tasks.executing} 个任务执行中，${status.goals.active} 个目标进行中，${status.employees.active} 个活跃员工`;

      if (input.includeDetails) {
        message += `\n\n详细统计：\n- 目标：${status.goals.completed} 已完成/${status.goals.pending} 待开始\n- 任务：${status.tasks.completed} 已完成/${status.tasks.failed} 失败\n- 定时任务：${status.cronJobs.enabled} 个启用`;
      }

      return {
        success: true,
        data: status,
        message,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `查询系统状态失败：${error.message}`,
      };
    }
  },
};

/**
 * 搜索活动记录
 */
const searchActivitiesTool: Tool = {
  name: 'search_activities',
  description: `搜索系统活动记录。

## 数据库表结构 (activity_logs 表)

\`\`sql
CREATE TABLE activity_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,     -- ⚠️ 列名是 event_type，不是 type！
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  context_json TEXT,            -- ⚠️ 列名是 context_json，不是 description！
  result_json TEXT,             -- ⚠️ 列名是 result_json，不是 metadata！
  timestamp INTEGER NOT NULL    -- ⚠️ 列名是 timestamp，不是 created_at！
);
\`\`

## ⚠️ 重要列名说明

- **event_type** (不是 type)
- **context_json** (不是 description)
- **result_json** (不是 metadata)
- **timestamp** (不是 created_at)

可以按类型、时间范围、关键词搜索。用于审计和追踪。`,
  category: 'query',
  parameters: {
    type: 'object',
    properties: {
      eventType: {
        type: 'string',
        description: '活动类型：task, goal, employee, cron, decision, chat, system',
      },
      keyword: {
        type: 'string',
        description: '搜索关键词（在 context_json 和 result_json 中搜索）',
      },
      hours: {
        type: 'number',
        description: '搜索最近 N 小时的记录',
        default: 24,
      },
      limit: {
        type: 'number',
        description: '返回数量限制',
        default: 50,
      },
    },
  },
  enabled: true,
  async handler(
    input: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const db = getDatabase();

      // 搜索 activity_logs 表 - 使用正确的列名
      let sql = 'SELECT * FROM activity_logs WHERE 1=1';
      const params: any[] = [];

      // 时间范围 - 使用整数时间戳
      if (input.hours) {
        const cutoffTime = Date.now() - (input.hours * 3600000);
        sql += ' AND timestamp >= ?';
        params.push(cutoffTime);
      }

      // 类型筛选 - 使用正确的列名
      if (input.eventType) {
        sql += ' AND event_type = ?';
        params.push(input.eventType);
      }

      // 关键词搜索 - 使用正确的列名
      if (input.keyword) {
        sql += ' AND (context_json LIKE ? OR result_json LIKE ?)';
        const keyword = `%${input.keyword}%`;
        params.push(keyword, keyword);
      }

      sql += ' ORDER BY timestamp DESC LIMIT ?';  // ← timestamp 不是 created_at
      params.push(input.limit || 50);

      const activities = db.prepare(sql).all(...params) as any[];

      return {
        success: true,
        data: {
          activities,
          count: activities.length,
        },
        message: `找到 ${activities.length} 条活动记录`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `搜索活动记录失败：${error.message}`,
      };
    }
  },
};

/**
 * 初始化 Query 工具
 */
export function initQueryTools(registry: ToolRegistry): void {
  registry.register(querySystemStatusTool);
  registry.register(searchActivitiesTool);
}
