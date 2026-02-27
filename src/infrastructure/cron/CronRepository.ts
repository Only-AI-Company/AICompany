/**
 * AI Company - Cron Repository
 *
 * Crontab 数据访问层
 */

import type { AIDatabase } from '../../infrastructure/database/index.js';
import type { CronJob, CronExecution, CreateCronParams, UpdateCronParams, CronStats } from './types.js';
import { getNextRunTime } from './utils.js';

export class CronRepository {
  constructor(private db: AIDatabase) {}

  /**
   * 创建定时任务
   */
  create(params: CreateCronParams): CronJob {
    const now = Date.now();
    const hasCron = !!params.cronRule;

    const job: CronJob = {
      id: this.generateId(),
      taskId: params.taskId,
      name: params.name,
      description: params.description,
      command: params.command,
      args: params.args,
      cronRule: params.cronRule,
      enabled: params.enabled ?? true,
      nextRun: hasCron ? getNextRunTime(params.cronRule!).getTime() : undefined,
      lastRun: undefined,
      lastRunningAt: undefined,
      runCount: 0,
      failCount: 0,
      lastOutput: undefined,
      lastError: undefined,
      timeout: params.timeout ?? 300,
      workingDir: params.workingDir,
      env: params.env,
      createdAt: now,
      updatedAt: now,
    };

    this.db.prepare(`
      INSERT INTO crontab (
        id, task_id, name, description, command, args_json, cron_rule, enabled,
        next_run, last_run, last_running_at, run_count, fail_count, last_output, last_error,
        timeout, working_dir, env_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.taskId ?? null,
      job.name,
      job.description ?? null,
      job.command,
      job.args ? JSON.stringify(job.args) : null,
      job.cronRule ?? null,
      job.enabled ? 1 : 0,
      job.nextRun ?? null,
      job.lastRun ?? null,
      job.lastRunningAt ?? null,
      job.runCount,
      job.failCount,
      job.lastOutput ?? null,
      job.lastError ?? null,
      job.timeout,
      job.workingDir ?? null,
      job.env ? JSON.stringify(job.env) : null,
      job.createdAt,
      job.updatedAt
    );

    return job;
  }

  /**
   * 根据 ID 获取任务
   */
  getById(id: string): CronJob | null {
    const row = this.db.prepare(
      'SELECT * FROM crontab WHERE id = ?'
    ).get(id) as any;

    return row ? this.rowToJob(row) : null;
  }

  /**
   * 根据名称获取任务
   */
  getByName(name: string): CronJob | null {
    const row = this.db.prepare(
      'SELECT * FROM crontab WHERE name = ?'
    ).get(name) as any;

    return row ? this.rowToJob(row) : null;
  }

  /**
   * 获取所有任务
   */
  getAll(): CronJob[] {
    const rows = this.db.prepare(
      'SELECT * FROM crontab ORDER BY next_run ASC'
    ).all() as any[];

    return rows.map(r => this.rowToJob(r));
  }

  /**
   * 获取启用的任务
   */
  getEnabled(): CronJob[] {
    const rows = this.db.prepare(
      'SELECT * FROM crontab WHERE enabled = 1 ORDER BY next_run ASC'
    ).all() as any[];

    return rows.map(r => this.rowToJob(r));
  }

  /**
   * 获取应该运行的任务 (next_run <= now)
   */
  getDueJobs(): CronJob[] {
    const now = Date.now();
    const rows = this.db.prepare(
      'SELECT * FROM crontab WHERE enabled = 1 AND next_run <= ? ORDER BY next_run ASC'
    ).all(now) as any[];

    return rows.map(r => this.rowToJob(r));
  }

  /**
   * 更新任务
   */
  update(id: string, params: UpdateCronParams): CronJob | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const now = Date.now();

    const updated: CronJob = {
      ...existing,
      name: params.name ?? existing.name,
      description: params.description ?? existing.description,
      command: params.command ?? existing.command,
      args: params.args ?? existing.args,
      cronRule: params.cronRule ?? existing.cronRule,
      enabled: params.enabled ?? existing.enabled,
      timeout: params.timeout ?? existing.timeout,
      workingDir: params.workingDir ?? existing.workingDir,
      env: params.env ?? existing.env,
      updatedAt: now,
    };

    // 如果 cron 规则变了，重新计算 nextRun
    if (params.cronRule && params.cronRule !== existing.cronRule) {
      updated.nextRun = getNextRunTime(params.cronRule).getTime();
    }

    this.db.prepare(`
      UPDATE crontab SET
        name = ?, description = ?, command = ?, args_json = ?, cron_rule = ?,
        enabled = ?, timeout = ?, working_dir = ?, env_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.description ?? null,
      updated.command,
      updated.args ? JSON.stringify(updated.args) : null,
      updated.cronRule,
      updated.enabled ? 1 : 0,
      updated.timeout,
      updated.workingDir ?? null,
      updated.env ? JSON.stringify(updated.env) : null,
      updated.updatedAt,
      id
    );

    return updated;
  }

  /**
   * 删除任务
   */
  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM crontab WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * 更新任务运行状态
   */
  updateRunStatus(
    id: string,
    lastRun: number,
    nextRun?: number,
    runCount?: number,
    failCount?: number,
    output?: string,
    error?: string
  ): void {
    this.db.prepare(`
      UPDATE crontab SET
        last_run = ?, next_run = ?, run_count = ?, fail_count = ?,
        last_output = ?, last_error = ?, updated_at = ?
      WHERE id = ?
    `).run(
      lastRun,
      nextRun ?? null,
      runCount,
      failCount,
      output ?? null,
      error ?? null,
      Date.now(),
      id
    );
  }

  /**
   * 创建执行记录
   */
  createExecution(
    cronId: string,
    startedAt: number
  ): string {
    const id = this.generateId();

    this.db.prepare(`
      INSERT INTO cron_executions (id, cron_id, started_at)
      VALUES (?, ?, ?)
    `).run(id, cronId, startedAt);

    return id;
  }

  /**
   * 更新执行记录
   */
  updateExecution(
    id: string,
    completedAt: number,
    exitCode?: number,
    signal?: number,
    output?: string,
    error?: string,
    timeout = false
  ): void {
    this.db.prepare(`
      UPDATE cron_executions SET
        completed_at = ?, exit_code = ?, signal = ?, output = ?, error = ?, timeout = ?
      WHERE id = ?
    `).run(
      completedAt,
      exitCode ?? null,
      signal ?? null,
      output ?? null,
      error ?? null,
      timeout ? 1 : 0,
      id
    );
  }

  /**
   * 获取任务的执行记录
   */
  getExecutions(cronId: string, limit = 50): CronExecution[] {
    const rows = this.db.prepare(`
      SELECT * FROM cron_executions
      WHERE cron_id = ?
      ORDER BY started_at DESC
      LIMIT ?
    `).all(cronId, limit) as any[];

    return rows.map(r => ({
      id: r.id,
      cronId: r.cron_id,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      exitCode: r.exit_code,
      signal: r.signal,
      output: r.output,
      error: r.error,
      timeout: r.timeout === 1,
    }));
  }

  /**
   * 获取统计信息
   */
  getStats(): CronStats {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM crontab').get() as { count: number };
    const enabled = this.db.prepare('SELECT COUNT(*) as count FROM crontab WHERE enabled = 1').get() as { count: number };
    const totalRuns = this.db.prepare('SELECT SUM(run_count) as total FROM crontab').get() as { total: number };
    const totalFailures = this.db.prepare('SELECT SUM(fail_count) as total FROM crontab').get() as { total: number };
    const next = this.db.prepare('SELECT MIN(next_run) as next FROM crontab WHERE enabled = 1').get() as { next: number | null };

    return {
      total: total.count,
      enabled: enabled.count,
      disabled: total.count - enabled.count,
      totalRuns: totalRuns.total ?? 0,
      totalFailures: totalFailures.total ?? 0,
      nextRun: next.next ?? undefined,
    };
  }

  /**
   * 将数据库行转换为 CronJob 对象
   */
  private rowToJob(row: any): CronJob {
    return {
      id: row.id,
      taskId: row.task_id ?? undefined,
      name: row.name,
      description: row.description ?? undefined,
      command: row.command,
      args: row.args_json ? JSON.parse(row.args_json) : undefined,
      cronRule: row.cron_rule ?? undefined,
      enabled: row.enabled === 1,
      nextRun: row.next_run ?? undefined,
      lastRun: row.last_run ?? undefined,
      lastRunningAt: row.last_running_at ?? undefined,
      runCount: row.run_count,
      failCount: row.fail_count,
      lastOutput: row.last_output ?? undefined,
      lastError: row.last_error ?? undefined,
      timeout: row.timeout,
      workingDir: row.working_dir ?? undefined,
      env: row.env_json ? JSON.parse(row.env_json) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `cron-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
