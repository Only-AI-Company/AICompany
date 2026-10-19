/**
 * AI Company v2 - Cron Tools
 *
 * 定时任务工具：create_scheduled_task, list_scheduled_tasks, trigger_scheduled_task
 */

import type { Tool, ToolContext, ToolResult } from '../types.js';
import type { ToolRegistry } from '../ToolRegistry.js';
import { getDatabase } from '../../../db/Database.js';

/**
 * 创建定时任务
 */
const createScheduledTaskTool: Tool = {
  name: 'create_scheduled_task',
  description: `创建定时任务。

## 数据库表结构 (crontab 表)

\`\`sql
CREATE TABLE crontab (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  command TEXT NOT NULL,
  args_json TEXT,
  cron_rule TEXT NOT NULL,        -- ⚠️ 列名是 cron_rule，不是 cron_expression！
  enabled INTEGER NOT NULL,       -- ⚠️ 是 INTEGER (0/1)，不是 boolean！
  goal_id TEXT,
  timeout INTEGER DEFAULT 300000,
  working_dir TEXT,
  env_json TEXT,
  created_at INTEGER NOT NULL,    -- 整数时间戳，毫秒
  updated_at INTEGER NOT NULL,
  last_run INTEGER,
  next_run INTEGER,
  run_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  last_output TEXT,
  last_error TEXT
);
\`\`

## ⚠️ 重要参数说明

1. **cronRule** - 对应数据库列 \`cron_rule\`（不是 cron_expression！）
   - 标准格式：分 时 日 月 周
   - 示例："0 9 * * *" = 每天早上9点

2. **enabled** - 传入后会转换为 INTEGER (0/1)
   - true → 1
   - false → 0

3. **command** - 要执行的命令字符串

4. **所有时间字段** 都是 INTEGER（整数时间戳，毫秒）`,
  category: 'cron',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '定时任务名称',
        required: true,
      },
      cronRule: {
        type: 'string',
        description: 'Cron 表达式（如 "0 9 * * *" 表示每天早上 9 点）。⚠️ 对应数据库列 \`cron_rule\`',
        required: true,
      },
      command: {
        type: 'string',
        description: '要执行的命令',
      },
      description: {
        type: 'string',
        description: '任务描述',
      },
      goalId: {
        type: 'string',
        description: '关联的目标 ID',
      },
      enabled: {
        type: 'boolean',
        description: '是否启用',
        default: true,
      },
      timeout: {
        type: 'number',
        description: '超时时间（毫秒）',
        default: 300000,
      },
      workingDir: {
        type: 'string',
        description: '工作目录路径',
      },
    },
    required: ['name', 'cronRule'],
  },
  enabled: true,
  async handler(
    input: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const db = getDatabase();

      // 生成 ID
      const cronId = `cron_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // 插入数据库 - 使用正确的列名和类型
      db.prepare(`
        INSERT INTO crontab (
          id, name, description, command,
          cron_rule, goal_id, enabled, timeout, working_dir,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cronId,
        input.name,
        input.description || null,
        input.command || null,
        input.cronRule,               // ← cron_rule 不是 cron_expression
        input.goalId || null,
        input.enabled !== false ? 1 : 0,  // ← INTEGER 不是 boolean
        input.timeout || 300000,
        input.workingDir || null,
        Date.now(),                   // ← 整数时间戳
        Date.now()
      );

      // TODO: 集成 CronScheduler 注册定时任务
      console.log(`[CronTools] 创建定时任务：${input.name} (${input.cronRule})`);

      return {
        success: true,
        data: { cronId, name: input.name, cronRule: input.cronRule },
        message: `已创建定时任务："${input.name}"（${input.cronRule}）`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `创建定时任务失败：${error.message}`,
      };
    }
  },
};

/**
 * 列出所有定时任务
 */
const listScheduledTasksTool: Tool = {
  name: 'list_scheduled_tasks',
  description: `列出所有定时任务。

## 数据库表结构 (crontab 表)

\`\`sql
CREATE TABLE crontab (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cron_rule TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  last_run INTEGER,
  next_run INTEGER,
  run_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  ...
);
\`\`

可以按状态筛选（enabled/disabled）。返回定时任务列表及下次执行时间。`,
  category: 'cron',
  parameters: {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        description: '按启用状态筛选',
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

      let sql = 'SELECT * FROM crontab WHERE 1=1';
      const params: any[] = [];

      if (input.enabled !== undefined) {
        sql += ' AND enabled = ?';
        params.push(input.enabled ? 1 : 0);  // ← INTEGER 不是 boolean
      }

      sql += ' ORDER BY created_at DESC';

      if (input.limit) {
        sql += ' LIMIT ?';
        params.push(input.limit);
      }

      const cronJobs = db.prepare(sql).all(...params) as any[];

      return {
        success: true,
        data: {
          cronJobs,
          count: cronJobs.length,
        },
        message: `共 ${cronJobs.length} 个定时任务`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `查询定时任务失败：${error.message}`,
      };
    }
  },
};

/**
 * 触发定时任务
 */
const triggerScheduledTaskTool: Tool = {
  name: 'trigger_scheduled_task',
  description: `手动触发定时任务立即执行。

## 数据库表结构 (crontab 表)

\`\`sql
CREATE TABLE crontab (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  last_run INTEGER,
  run_count INTEGER DEFAULT 0,
  ...
);
\`\`

用于测试或临时执行定时任务。更新 last_run 和 run_count。`,
  category: 'cron',
  parameters: {
    type: 'object',
    properties: {
      cronId: {
        type: 'string',
        description: '定时任务 ID',
        required: true,
      },
    },
    required: ['cronId'],
  },
  enabled: true,
  async handler(
    input: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const db = getDatabase();

      // 检查定时任务是否存在
      const cronJob = db.prepare('SELECT * FROM crontab WHERE id = ?').get(input.cronId) as any;

      if (!cronJob) {
        return {
          success: false,
          error: '定时任务不存在',
        };
      }

      // 更新最后执行时间 - 使用整数时间戳
      db.prepare(`
        UPDATE crontab
        SET last_run = ?, run_count = run_count + 1, updated_at = ?
        WHERE id = ?
      `).run(Date.now(), Date.now(), input.cronId);

      // TODO: 触发实际任务执行
      // 如果有 command，创建并执行任务
      let followUpMessage = '定时任务已触发';
      if (cronJob.command) {
        followUpMessage += `，将执行："${cronJob.command}"`;
      }

      return {
        success: true,
        data: {
          cronId: input.cronId,
          name: cronJob.name,
          lastExecuted: new Date().toISOString(),
        },
        message: followUpMessage,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `触发定时任务失败：${error.message}`,
      };
    }
  },
};

/**
 * 初始化 Cron 工具
 */
export function initCronTools(registry: ToolRegistry): void {
  registry.register(createScheduledTaskTool);
  registry.register(listScheduledTasksTool);
  registry.register(triggerScheduledTaskTool);
}
