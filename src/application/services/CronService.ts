/**
 * Cron Service - 定时任务业务逻辑
 */

import type { AIDatabase } from '../../infrastructure/database/index.js';

export interface CronInfo {
  id: string;
  name: string;
  description?: string;
  command: string;
  cronRule?: string;
  enabled: boolean;
  workingDir?: string;
  timeout?: number;
}

export interface CronExecuteResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
}

export class CronService {
  constructor(private db: AIDatabase) {}

  /**
   * 获取定时任务列表
   */
  getCrons(limit: number = 10): CronInfo[] {
    return this.db.prepare(`
      SELECT id, name, description, command, cron_rule, enabled, working_dir, timeout
      FROM crontab
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as CronInfo[];
  }

  /**
   * 查找定时任务（按 ID 或名称模糊匹配）
   */
  findCron(identifier: string): CronInfo | null {
    // 先按 ID 精确查找
    let result = this.db.prepare('SELECT * FROM crontab WHERE id = ?').get(identifier) as CronInfo | undefined;
    if (result) return result;

    // 按名称模糊查找
    const results = this.db.prepare('SELECT * FROM crontab WHERE name LIKE ?').all(`%${identifier}%`) as CronInfo[];
    if (results.length === 1) {
      return results[0];
    }

    return null;
  }

  /**
   * 查找多个匹配的定时任务
   */
  findMultipleCrons(identifier: string): CronInfo[] {
    return this.db.prepare('SELECT * FROM crontab WHERE name LIKE ?').all(`%${identifier}%`) as CronInfo[];
  }

  /**
   * 获取单个定时任务详情
   */
  getCron(cronId: string): CronInfo | null {
    const result = this.db.prepare(`
      SELECT id, name, description, command, cron_rule, enabled, working_dir, timeout
      FROM crontab WHERE id = ?
    `).get(cronId) as CronInfo | undefined;
    return result || null;
  }

  /**
   * 执行定时任务
   */
  async executeCron(cronId: string): Promise<CronExecuteResult> {
    const cron = this.getCron(cronId);
    if (!cron) {
      return { success: false, stderr: '定时任务不存在' };
    }

    const { getCronService } = await import('../../interfaces/gateway/CronService.js');
    const cronService = getCronService(this.db);

    const result = await cronService.executeNow({
      id: cron.id,
      name: cron.name,
      description: cron.description || '',
      command: cron.command,
      cronRule: cron.cronRule || '',
      enabled: cron.enabled,
      timeout: cron.timeout || 60000,
      workingDir: cron.workingDir || '',
      env: {},
      args: {},
    });

    return {
      success: result.success,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
}
