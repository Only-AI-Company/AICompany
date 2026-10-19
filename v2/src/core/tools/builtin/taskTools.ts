/**
 * AI Company v2 - Task Tools
 *
 * 任务管理工具：create_task, list_tasks, execute_task
 */

import type { Tool, ToolContext, ToolResult } from '../types.js';
import type { ToolRegistry } from '../ToolRegistry.js';
import { getDatabase } from '../../../db/Database.js';

/**
 * 创建任务
 */
const createTaskTool: Tool = {
  name: 'create_task',
  description: `创建新的可执行任务。

## 数据库表结构 (tasks 表)

\`\`sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,             -- pending, executing, completed, failed, cancelled
  priority TEXT NOT NULL,           -- low, medium, high, critical
  goal_id TEXT,                    -- 关联的目标 ID
  work_dir TEXT,
  assigned_to TEXT,                -- ⚠️ 列名是 assigned_to，不是 assignee_id！
  requested_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,     -- 整数时间戳，毫秒
  started_at INTEGER,
  completed_at INTEGER,
  output TEXT,
  error TEXT
);
\`\`

## ⚠️ 重要参数说明

1. **assignedTo** - 对应数据库列名 \`assigned_to\`（不是 assignee_id！）

2. **dueDate** - 本工具不支持（在 goals 表中才有 due_date）

## 使用场景

- 当用户想要"执行一个任务"、"帮我做..."
- 当用户有具体的行动需求（如"写一段代码"、"发一篇文章"）
- 快速执行：不需要长期规划，只需要完成一个具体事项

## 与 create_goal 的区别

- **create_task**: 单个可执行任务，立即执行（如"修复这个bug"）
- **create_goal**: 长期目标或重复性计划（如"每周写一篇文章"）

如果用户需求涉及：
- 长期规划 → 使用 create_goal
- 重复性 routine → 使用 create_goal (type=recurring)
- 具体的一次性行动 → 使用 create_task`,
  category: 'task',
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: '任务描述',
        required: true,
      },
      goalId: {
        type: 'string',
        description: '关联的目标 ID（可选）',
      },
      priority: {
        type: 'string',
        description: '优先级：low, medium, high, critical',
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium',
      },
      assignedTo: {
        type: 'string',
        description: '执行者 ID（员工 ID）。⚠️ 对应数据库列 \`assigned_to\`',
      },
      workDir: {
        type: 'string',
        description: '工作目录路径',
      },
    },
    required: ['description'],
  },
  enabled: true,
  async handler(
    input: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const db = getDatabase();

      // 生成 Task ID
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // 插入数据库 - 使用正确的列名
      db.prepare(`
        INSERT INTO tasks (
          id, type, description, goal_id, priority,
          assigned_to, work_dir, status,
          requested_by, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskId,
        'one_time',                    // 默认类型
        input.description,
        input.goalId || null,
        input.priority || 'medium',
        input.assignedTo || null,      // ← assigned_to 不是 assignee_id
        input.workDir || null,
        'pending',
        context.userId || 'system',   // ← requested_by 是必填字段
        Date.now()
      );

      return {
        success: true,
        data: { taskId, description: input.description, priority: input.priority || 'medium' },
        message: `已创建任务："${input.description.substring(0, 30)}${input.description.length > 30 ? '...' : ''}"`,
        followUpTool: input.assignedTo
          ? { name: 'execute_task', input: { taskId } }
          : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `创建任务失败：${error.message}`,
      };
    }
  },
};

/**
 * 列出所有任务
 */
const listTasksTool: Tool = {
  name: 'list_tasks',
  description: `列出任务列表。

## 数据库表结构 (tasks 表)

\`\`sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  status TEXT NOT NULL,             -- pending, executing, completed, failed, cancelled
  priority TEXT NOT NULL,           -- low, medium, high, critical
  goal_id TEXT,
  assigned_to TEXT,                -- ⚠️ 列名是 assigned_to
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);
\`\`

## 使用场景

- 当用户问"有什么任务"、"任务列表"、"show tasks"
- 当用户问"待办事项"、"todo list"、"还有什么事要做"
- 当用户想查看特定状态的任务

## 可筛选状态

- **pending**: 待执行
- **executing**: 执行中
- **completed**: 已完成
- **failed**: 失败
- **cancelled**: 已取消`,
  category: 'task',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: '按状态筛选：pending, executing, completed, failed, cancelled',
        enum: ['pending', 'executing', 'completed', 'failed', 'cancelled'],
      },
      priority: {
        type: 'string',
        description: '按优先级筛选：low, medium, high, critical',
        enum: ['low', 'medium', 'high', 'critical'],
      },
      assignedTo: {
        type: 'string',
        description: '按执行者筛选（员工 ID）',
      },
      goalId: {
        type: 'string',
        description: '按目标筛选（目标 ID）',
      },
      limit: {
        type: 'number',
        description: '返回数量限制',
        default: 20,
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

      let sql = 'SELECT * FROM tasks WHERE 1=1';
      const params: any[] = [];

      if (input.status) {
        sql += ' AND status = ?';
        params.push(input.status);
      }

      if (input.priority) {
        sql += ' AND priority = ?';
        params.push(input.priority);
      }

      if (input.assignedTo) {
        sql += ' AND assigned_to = ?';     // ← assigned_to 不是 assignee_id
        params.push(input.assignedTo);
      }

      if (input.goalId) {
        sql += ' AND goal_id = ?';
        params.push(input.goalId);
      }

      sql += ' ORDER BY created_at DESC';

      if (input.limit) {
        sql += ' LIMIT ?';
        params.push(input.limit);
      }

      const tasks = db.prepare(sql).all(...params) as any[];

      // 格式化任务列表
      let message = `共 ${tasks.length} 个任务\n\n`;

      if (tasks.length > 0) {
        for (const task of tasks) {
          const emoji = task.status === 'completed' ? '✅' :
                       task.status === 'executing' ? '🔄' :
                       task.status === 'pending' ? '⏳' :
                       task.status === 'failed' ? '❌' : '⚫';
          message += `${emoji} ${task.description.substring(0, 50)}${task.description.length > 50 ? '...' : ''}\n`;
          message += `   ID: ${task.id} | 状态: ${task.status}\n\n`;
        }
      } else {
        message += '没有符合条件的任务';
      }

      return {
        success: true,
        data: { tasks, count: tasks.length },
        message,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `查询任务失败：${error.message}`,
      };
    }
  },
};

/**
 * 执行任务
 */
const executeTaskTool: Tool = {
  name: 'execute_task',
  description: `执行指定任务。

## 数据库表结构 (tasks 表)

\`\`sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  status TEXT NOT NULL,             -- pending, executing, completed, failed, cancelled
  assigned_to TEXT,                -- ⚠️ 列名是 assigned_to
  started_at INTEGER,
  completed_at INTEGER
);
\`\`

将任务状态更新为 executing，并记录开始时间。`,
  category: 'task',
  parameters: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: '任务 ID',
        required: true,
      },
      assigneeId: {
        type: 'string',
        description: '执行者 ID（员工 ID）。⚠️ 将存储到 \`assigned_to\` 列',
      },
    },
    required: ['taskId'],
  },
  enabled: true,
  async handler(
    input: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const db = getDatabase();

      // 检查任务是否存在
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(input.taskId) as any;

      if (!task) {
        return {
          success: false,
          error: '任务不存在',
        };
      }

      // 更新任务状态 - 使用正确的列名
      const updates: string[] = ['status = ?'];
      const updateParams: any[] = ['executing', input.taskId];

      // 使用整数时间戳
      updateParams.push(Date.now());
      updates.push('started_at = ?');

      if (input.assigneeId) {
        updates.push('assigned_to = ?');      // ← assigned_to 不是 assignee_id
        updateParams.push(input.assigneeId);
      }

      db.prepare(`
        UPDATE tasks
        SET ${updates.join(', ')}, updated_at = ?
        WHERE id = ?
      `).run(...updateParams, Date.now(), input.taskId);

      return {
        success: true,
        data: { taskId: input.taskId, status: 'executing' },
        message: `任务已开始执行："${task.description.substring(0, 30)}${task.description.length > 30 ? '...' : ''}"`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `执行任务失败：${error.message}`,
      };
    }
  },
};

/**
 * 初始化 Task 工具
 */
export function initTaskTools(registry: ToolRegistry): void {
  registry.register(createTaskTool);
  registry.register(listTasksTool);
  registry.register(executeTaskTool);
}
