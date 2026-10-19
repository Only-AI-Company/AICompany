/**
 * AI Company v2 - Employee Tools
 *
 * 员工管理工具：list_employees, get_employee_performance, get_leaderboard
 */

import type { Tool, ToolContext, ToolResult } from '../types.js';
import type { ToolRegistry } from '../ToolRegistry.js';
import { getDatabase } from '../../../db/Database.js';

/**
 * 列出所有员工
 */
const listEmployeesTool: Tool = {
  name: 'list_employees',
  description: `列出所有员工。

## 数据库表结构 (employees 表)

\`\`sql
CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,             -- active, inactive
  capabilities TEXT NOT NULL,      -- JSON 数组，如 '["coding", "analysis"]'
  model TEXT NOT NULL,
  temperature REAL NOT NULL,
  human_id TEXT,

  -- 统计信息
  total_tasks INTEGER DEFAULT 0,
  completed_tasks INTEGER DEFAULT 0,
  failed_tasks INTEGER DEFAULT 0,

  -- 积分系统
  points INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  satisfaction INTEGER DEFAULT 80,  -- 0-100
  current_state TEXT DEFAULT 'idle',
  last_activity_at INTEGER,
  created_at INTEGER NOT NULL
);
\`\`

## 可筛选状态

- **active**: 活跃员工
- **inactive**: 非活跃员工

返回员工列表及其能力、绩效等信息。`,
  category: 'employee',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: '按状态筛选：active, inactive',
        enum: ['active', 'inactive'],
        default: 'active',
      },
      includeStats: {
        type: 'boolean',
        description: '是否包含统计信息（绩效、等级等）',
        default: true,
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

      // 查询员工 - 使用正确的列名
      const sql = `
        SELECT e.*,
               (SELECT COUNT(*) FROM tasks WHERE assigned_to = e.id) as task_count,
               (SELECT COUNT(*) FROM tasks WHERE assigned_to = e.id AND status = 'completed') as completed_count
        FROM employees e
        WHERE e.status = ?
        ORDER BY e.points DESC, e.created_at ASC
      `;

      const employees = db.prepare(sql).all(input.status || 'active') as any[];

      // 解析 capabilities JSON
      const formattedEmployees = employees.map(emp => ({
        ...emp,
        capabilities: (() => {
          try {
            return JSON.parse(emp.capabilities || '[]');
          } catch {
            return [];
          }
        })(),
      }));

      return {
        success: true,
        data: {
          employees: formattedEmployees,
          count: formattedEmployees.length,
        },
        message: `共 ${formattedEmployees.length} 个${input.status === 'active' ? '活跃' : ''}员工`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `查询员工失败：${error.message}`,
      };
    }
  },
};

/**
 * 获取员工绩效
 */
const getEmployeePerformanceTool: Tool = {
  name: 'get_employee_performance',
  description: `获取指定员工的详细绩效信息。

## 数据库表结构 (employees 表)

\`\`sql
CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capabilities TEXT NOT NULL,      -- JSON 数组
  points INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  satisfaction INTEGER DEFAULT 80,
  ...
);
\`\`

**tasks 表结构:**

\`\`sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  assigned_to TEXT,                -- ⚠️ 列名是 assigned_to
  ...
);
\`\`

包括积分、等级、满意度、完成任务数、成功率等。`,
  category: 'employee',
  parameters: {
    type: 'object',
    properties: {
      employeeId: {
        type: 'string',
        description: '员工 ID',
        required: true,
      },
    },
    required: ['employeeId'],
  },
  enabled: true,
  async handler(
    input: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const db = getDatabase();

      // 获取员工信息
      const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(input.employeeId) as any;

      if (!employee) {
        return {
          success: false,
          error: '员工不存在',
        };
      }

      // 获取任务统计 - 使用正确的列名
      const stats = db.prepare(`
        SELECT
          COUNT(*) as total_tasks,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_tasks,
          SUM(CASE WHEN status = 'executing' THEN 1 ELSE 0 END) as executing_tasks
        FROM tasks
        WHERE assigned_to = ?
      `).get(input.employeeId) as any;

      // 计算成功率
      const successRate = stats.total_tasks > 0
        ? Math.round((stats.completed_tasks / stats.total_tasks) * 100)
        : 0;

      // 解析能力
      const capabilities = (() => {
        try {
          return JSON.parse(employee.capabilities || '[]');
        } catch {
          return [];
        }
      })();

      return {
        success: true,
        data: {
          employee: {
            ...employee,
            capabilities,
          },
          stats: {
            totalTasks: stats.total_tasks || 0,
            completedTasks: stats.completed_tasks || 0,
            failedTasks: stats.failed_tasks || 0,
            executingTasks: stats.executing_tasks || 0,
            successRate,
          },
        },
        message: `${employee.name} - 等级 ${employee.level || 1}, 积分 ${employee.points || 0}, 成功率 ${successRate}%`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `查询员工绩效失败：${error.message}`,
      };
    }
  },
};

/**
 * 获取排行榜
 */
const getLeaderboardTool: Tool = {
  name: 'get_leaderboard',
  description: `获取员工绩效排行榜。

## 数据库表结构

**employees 表:**
\`\`sql
CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER DEFAULT 1,
  points INTEGER DEFAULT 0,
  satisfaction INTEGER DEFAULT 80,
  ...
);
\`\`

**tasks 表:**
\`\`sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  assigned_to TEXT,                -- ⚠️ 列名是 assigned_to
  status TEXT NOT NULL
  ...
);
\`\`

按积分、等级或成功率排序，返回 TOP N 员工列表。`,
  category: 'employee',
  parameters: {
    type: 'object',
    properties: {
      orderBy: {
        type: 'string',
        description: '排序依据：points（积分）、level（等级）、successRate（成功率）',
        enum: ['points', 'level', 'successRate'],
        default: 'points',
      },
      limit: {
        type: 'number',
        description: '返回数量限制',
        default: 10,
      },
      status: {
        type: 'string',
        description: '员工状态筛选',
        enum: ['active', 'inactive'],
        default: 'active',
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

      // 根据排序字段构建 SQL - 使用正确的列名
      let orderBySql = 'e.points DESC';
      if (input.orderBy === 'level') {
        orderBySql = 'e.level DESC, e.points DESC';
      } else if (input.orderBy === 'successRate') {
        // 成功率需要计算
        orderBySql = 'success_rate DESC';
      }

      const sql = `
        SELECT
          e.id,
          e.name,
          e.role,
          e.level,
          e.points,
          e.satisfaction,
          e.capabilities,
          COUNT(t.id) as total_tasks,
          SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
          ROUND(
            CASE WHEN COUNT(t.id) > 0
              THEN (SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(t.id))
              ELSE 0
            END, 2
          ) as success_rate
        FROM employees e
        LEFT JOIN tasks t ON t.assigned_to = e.id
        WHERE e.status = ?
        GROUP BY e.id
        ORDER BY ${orderBySql}
        LIMIT ?
      `;

      const employees = db.prepare(sql).all(input.status || 'active', input.limit || 10) as any[];

      // 解析 capabilities
      const formattedEmployees = employees.map(emp => ({
        ...emp,
        capabilities: (() => {
          try {
            return JSON.parse(emp.capabilities || '[]');
          } catch {
            return [];
          }
        })(),
      }));

      return {
        success: true,
        data: {
          leaderboard: formattedEmployees,
          orderBy: input.orderBy || 'points',
          count: formattedEmployees.length,
        },
        message: `排行榜 TOP ${formattedEmployees.length}（按${input.orderBy === 'level' ? '等级' : input.orderBy === 'successRate' ? '成功率' : '积分'}排序）`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `查询排行榜失败：${error.message}`,
      };
    }
  },
};

/**
 * 初始化 Employee 工具
 */
export function initEmployeeTools(registry: ToolRegistry): void {
  registry.register(listEmployeesTool);
  registry.register(getEmployeePerformanceTool);
  registry.register(getLeaderboardTool);
}
