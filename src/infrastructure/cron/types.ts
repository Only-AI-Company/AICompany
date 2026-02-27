/**
 * AI Company - Cron Types
 *
 * 定时任务类型定义
 */

/**
 * 定时任务状态
 */
export type CronStatus = 'enabled' | 'disabled';

/**
 * 定时任务执行状态
 */
export type CronExecutionStatus = 'running' | 'completed' | 'failed' | 'timeout';

/**
 * Cron 任务
 */
export interface CronJob {
  id: string;
  taskId?: string;              // 关联的任务 ID
  name: string;
  description?: string;
  command: string;              // 命令或脚本路径
  args?: Record<string, any>;   // 参数键值对
  cronRule?: string;            // cron 表达式: 分 时 日 月 周，undefined 表示无需定时
  enabled: boolean;
  nextRun?: number;             // 下次运行时间戳（仅当有 cronRule 时有值）
  lastRun?: number;             // 上次运行时间戳
  lastRunningAt?: number;       // 上次正在运行的时间戳（防止重复运行）
  runCount: number;
  failCount: number;
  lastOutput?: string;
  lastError?: string;
  timeout: number;              // 超时时间(秒)
  workingDir?: string;
  env?: Record<string, string>; // 环境变量
  createdAt: number;
  updatedAt: number;
}

/**
 * Cron 执行记录
 */
export interface CronExecution {
  id: string;
  cronId: string;
  startedAt: number;
  completedAt?: number;
  exitCode?: number;
  signal?: number;
  output?: string;
  error?: string;
  timeout: boolean;
}

/**
 * Cron 表达式解析结果
 */
export interface ParsedCron {
  minute: string;   // 0-59
  hour: string;     // 0-23
  day: string;      // 1-31
  month: string;    // 1-12
  dow: string;      // 0-6 (0=周日)
}

/**
 * 创建 Cron 任务参数
 */
export interface CreateCronParams {
  taskId?: string;              // 关联的任务 ID
  name: string;
  description?: string;
  command: string;
  args?: Record<string, any>;
  cronRule?: string;            // cron 表达式，不传表示无需定时
  enabled?: boolean;
  timeout?: number;
  workingDir?: string;
  env?: Record<string, string>;
}

/**
 * 更新 Cron 任务参数
 */
export interface UpdateCronParams {
  name?: string;
  description?: string;
  command?: string;
  args?: Record<string, any>;
  cronRule?: string;
  enabled?: boolean;
  timeout?: number;
  workingDir?: string;
  env?: Record<string, string>;
}

/**
 * Cron 统计信息
 */
export interface CronStats {
  total: number;
  enabled: number;
  disabled: number;
  totalRuns: number;
  totalFailures: number;
  nextRun?: number;
}
