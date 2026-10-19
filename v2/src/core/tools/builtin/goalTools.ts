/**
 * AI Company v2 - Goal Tools
 *
 * 目标管理工具：create_goal, list_goals, get_goal_progress, update_goal_status
 */

import type { Tool, ToolContext, ToolResult } from '../types.js';
import type { ToolRegistry } from '../ToolRegistry.js';
import { getDatabase } from '../../../db/Database.js';

/**
 * 创建目标
 */
const createGoalTool: Tool = {
  name: 'create_goal',
  description: `创建新目标。

## 数据库表结构 (goals 表)

\`\`sql
CREATE TABLE goals (
  id TEXT PRIMARY KEY,              -- 目标 ID
  type TEXT NOT NULL,               -- 目标类型
  title TEXT NOT NULL,              -- 标题
  description TEXT,                 -- 描述
  status TEXT NOT NULL,             -- 状态 (pending_owner, active, completed, cancelled)
  acceptance_criteria TEXT,        -- 验收标准
  due_date INTEGER,                -- 截止日期（整数时间戳，毫秒）
  parent_goal_id TEXT,             -- 父目标 ID
  recurring TEXT,                  -- 重复规则（JSON 字符串）
  owner_id TEXT,                  -- 所有者 ID
  created_at INTEGER NOT NULL,     -- 创建时间（整数时间戳，毫秒）
  updated_at INTEGER NOT NULL      -- 更新时间（整数时间戳，毫秒）
);
\`\`

## ⚠️ 重要参数说明

1. **dueDate** - 类型：INTEGER（整数时间戳，毫秒），不是字符串！
   - 错误：dueDate: '2025-12-31'
   - 正确：dueDate: 1735660800000
   - 可以使用 JavaScript：Date.parse('2025-12-31') 或 new Date('2025-12-31').getTime()

2. **recurring** - 类型：STRING（JSON 字符串）
   - 格式：JSON.stringify({ frequency: 'daily', time: '09:00' })
   - 不是 cron 表达式！

3. **status** 默认值是 'pending_owner'，不是 'pending'

## 使用场景

- 当用户想要"建立一个目标"、"设定一个计划"、"制定一个routine"
- 当用户说"我要..."、"我想达成..."、"我计划..."
- 当用户提到长期规划、短期目标或重复性任务

## 目标类型

- **long_term**: 长期目标（如"今年要完成100个项目"）
- **short_term**: 短期目标（如"本周完成这个功能"）
- **recurring**: 重复性目标（如"每天早上9点写日报"）

注意：如果用户只是想快速执行一个任务，使用 create_task 工具而不是 create_goal。`,
  category: 'goal',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: '目标标题',
        required: true,
      },
      type: {
        type: 'string',
        description: '目标类型：long_term（长期）、short_term（短期）、recurring（重复）',
        enum: ['long_term', 'short_term', 'recurring'],
        required: true,
      },
      description: {
        type: 'string',
        description: '目标详细描述',
      },
      dueDate: {
        type: 'number',
        description: '截止日期（整数时间戳，毫秒）。⚠️ 必须是整数，不是日期字符串！示例：1735660800000',
      },
      recurring: {
        type: 'string',
        description: '重复规则（JSON 字符串）。⚠️ 不是 cron 表达式！示例：{"frequency":"daily","time":"09:00"}',
      },
      acceptanceCriteria: {
        type: 'string',
        description: '验收标准，描述目标完成的具体条件',
      },
      parentGoalId: {
        type: 'string',
        description: '父目标 ID（用于子目标）',
      },
    },
    required: ['title', 'type'],
  },
  enabled: true,
  async handler(
    input: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const db = getDatabase();

      // 生成 Goal ID
      const goalId = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // 插入数据库 - 使用正确的列名
      db.prepare(`
        INSERT INTO goals (
          id, title, type, description,
          due_date, recurring, acceptance_criteria,
          parent_goal_id, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        goalId,
        input.title,
        input.type,
        input.description || null,
        input.dueDate || null,           // ← due_date 不是 deadline
        input.recurring || null,        // ← recurring 不是 cron_expression
        input.acceptanceCriteria || null,
        input.parentGoalId || null,
        'pending_owner',                // ← 默认状态
        Date.now(),
        Date.now()
      );

      return {
        success: true,
        data: { goalId, title: input.title, type: input.type },
        message: `已创建目标："${input.title}"（${input.type === 'long_term' ? '长期' : input.type === 'short_term' ? '短期' : '重复'}）`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `创建目标失败：${error.message}`,
      };
    }
  },
};

/**
 * 列出所有目标
 */
const listGoalsTool: Tool = {
  name: 'list_goals',
  description: `列出所有目标。

## 数据库表结构 (goals 表)

\`\`sql
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,             -- 状态: pending_owner, active, completed, cancelled
  due_date INTEGER,
  parent_goal_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
\`\`

## 使用场景

- 当用户问"有什么目标"、"目标列表"、"show goals"
- 当用户问"正在进行什么"、"还有什么没完成"
- 当用户想查看某个状态的目标

## 可筛选状态

- **pending_owner**: 待分配所有者
- **active**: 进行中
- **completed**: 已完成
- **cancelled**: 已取消`,
  category: 'goal',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: '按状态筛选：pending_owner, active, completed, cancelled',
        enum: ['pending_owner', 'active', 'completed', 'cancelled'],
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

      let sql = 'SELECT * FROM goals WHERE 1=1';
      const params: any[] = [];

      if (input.status) {
        sql += ' AND status = ?';
        params.push(input.status);
      }

      sql += ' ORDER BY created_at DESC';

      if (input.limit) {
        sql += ' LIMIT ?';
        params.push(input.limit);
      }

      const goals = db.prepare(sql).all(...params) as any[];

      return {
        success: true,
        data: { goals, count: goals.length },
        message: `共 ${goals.length} 个目标`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `查询目标失败：${error.message}`,
      };
    }
  },
};

/**
 * 获取目标进度
 */
const getGoalProgressTool: Tool = {
  name: 'get_goal_progress',
  description: `获取指定目标的进度信息。

## 数据库表结构

**goals 表:**
\`\`sql
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  ...
);
\`\`

**tasks 表:**
\`\`sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  status TEXT NOT NULL,             -- pending, executing, completed, failed, cancelled
  goal_id TEXT,                    -- 关联的目标 ID
  assigned_to TEXT,                -- 分配给的员工 ID
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);
\`\`

返回目标详情、相关任务列表、完成百分比等。`,
  category: 'goal',
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

      // 获取目标详情
      const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(input.goalId) as any;

      if (!goal) {
        return {
          success: false,
          error: '目标不存在',
        };
      }

      // 获取相关任务 - 使用正确的列名
      const tasks = db.prepare(`
        SELECT * FROM tasks
        WHERE goal_id = ?
        ORDER BY created_at DESC
      `).all(input.goalId) as any[];

      // 计算完成度
      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const progress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

      return {
        success: true,
        data: {
          goal,
          tasks,
          progress,
          totalTasks: tasks.length,
          completedTasks,
        },
        message: `目标 "${goal.title}" 进度：${progress}% (${completedTasks}/${tasks.length} 任务完成)`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `查询目标进度失败：${error.message}`,
      };
    }
  },
};

/**
 * 更新目标状态
 */
const updateGoalStatusTool: Tool = {
  name: 'update_goal_status',
  description: `更新目标状态。

## 数据库表结构 (goals 表)

\`\`sql
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,             -- pending_owner, active, completed, cancelled
  updated_at INTEGER NOT NULL
);
\`\`

可以将目标标记为 active（进行中）、completed（已完成）或 cancelled（已取消）。

⚠️ 注意：更新为 completed 或 cancelled 时，相关的未完成任务也会被更新。`,
  category: 'goal',
  parameters: {
    type: 'object',
    properties: {
      goalId: {
        type: 'string',
        description: '目标 ID',
        required: true,
      },
      status: {
        type: 'string',
        description: '新状态：active, completed, cancelled',
        enum: ['active', 'completed', 'cancelled'],
        required: true,
      },
      notes: {
        type: 'string',
        description: '更新说明',
      },
    },
    required: ['goalId', 'status'],
  },
  enabled: true,
  async handler(
    input: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const db = getDatabase();

      // 检查目标是否存在
      const goal = db.prepare('SELECT id, title FROM goals WHERE id = ?').get(input.goalId);

      if (!goal) {
        return {
          success: false,
          error: '目标不存在',
        };
      }

      // 更新状态 - 使用正确的列名 updated_at
      db.prepare(`
        UPDATE goals
        SET status = ?, updated_at = ?
        WHERE id = ?
      `).run(input.status, Date.now(), input.goalId);

      // 如果目标是 completed 或 cancelled，更新相关任务
      if (input.status === 'completed' || input.status === 'cancelled') {
        db.prepare(`
          UPDATE tasks
          SET status = ?
          WHERE goal_id = ? AND status NOT IN ('completed', 'failed')
        `).run(input.status === 'completed' ? 'completed' : 'cancelled', input.goalId);
      }

      const statusText = input.status === 'active' ? '进行中' : input.status === 'completed' ? '已完成' : '已取消';
      return {
        success: true,
        data: { goalId: input.goalId, status: input.status },
        message: `目标状态已更新为：${statusText}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `更新目标状态失败：${error.message}`,
      };
    }
  },
};

/**
 * 初始化 Goal 工具
 */
export function initGoalTools(registry: ToolRegistry): void {
  registry.register(createGoalTool);
  registry.register(listGoalsTool);
  registry.register(getGoalProgressTool);
  registry.register(updateGoalStatusTool);
}
