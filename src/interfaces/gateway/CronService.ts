/**
 * AI Company - Cron Service
 *
 * 使用 node-cron 库管理定时任务
 */

import cron from 'node-cron';
import type { AIDatabase } from '../../infrastructure/database/index.js';
import { spawn } from 'child_process';
import { getEnvVarService } from '../../infrastructure/env/index.js';
import { getDatabase } from '../../infrastructure/database/index.js';
import { CronRepository } from '../../infrastructure/cron/CronRepository.js';
import { getNextRunTime } from '../../infrastructure/cron/utils.js';

/**
 * Cron 任务配置
 */
export interface CronJobConfig {
  id: string;
  name: string;
  description?: string;
  command: string;
  args?: Record<string, any>;
  cronRule?: string;  // 可选，undefined = 无需定时
  enabled: boolean;
  timeout?: number;
  workingDir?: string;
  env?: Record<string, string>;
}

/**
 * Cron 执行结果
 */
export interface CronExecutionResult {
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  startedAt: number;
  completedAt: number;
  duration: number;
}

/**
 * Cron Service
 */
export class CronService {
  private jobs: Map<string, any> = new Map();
  private executionHistory: Map<string, CronExecutionResult[]> = new Map();
  private maxHistory = 50;
  public repository: CronRepository;

  constructor(private db: AIDatabase) {
    this.repository = new CronRepository(db);
  }

  /**
   * 添加/更新定时任务
   */
  schedule(config: CronJobConfig): void {
    // 先停止旧任务
    this.unschedule(config.id);

    if (!config.enabled || !config.cronRule) {
      // 没有定时规则的任务不调度
      return;
    }

    const task = cron.schedule(config.cronRule, async () => {
      await this.executeJob(config);
    }, {
      timezone: 'Asia/Shanghai',
    });

    this.jobs.set(config.id, task);
    console.log(`[Cron] 已调度任务: ${config.name} (${config.cronRule})`);
  }

  /**
   * 停止定时任务
   */
  unschedule(jobId: string): void {
    const task = this.jobs.get(jobId);
    if (task) {
      task.stop();
      this.jobs.delete(jobId);
      console.log(`[Cron] 已停止任务: ${jobId}`);
    }
  }

  /**
   * 停止所有任务
   */
  stopAll(): void {
    for (const [id, task] of this.jobs.entries()) {
      task.stop();
      console.log(`[Cron] 已停止任务: ${id}`);
    }
    this.jobs.clear();
  }

  /**
   * 获取任务状态
   */
  getStatus(): { running: number; jobs: Array<{ id: string; running: boolean }> } {
    return {
      running: this.jobs.size,
      jobs: Array.from(this.jobs.entries()).map(([id]) => ({
        id,
        running: true,
      })),
    };
  }

  /**
   * 获取执行历史
   */
  getHistory(jobId: string): CronExecutionResult[] {
    return this.executionHistory.get(jobId) || [];
  }

  /**
   * 执行任务
   */
  private async executeJob(config: CronJobConfig): Promise<void> {
    const startTime = Date.now();
    const job = this.repository.getById(config.id);
    const executionId = job ? this.repository.createExecution(config.id, startTime) : null;
    console.log(`\n[Cron] 执行任务: ${config.name}`);
    console.log(`  命令: ${config.command}`);
    console.log(`  时间: ${new Date().toLocaleString('zh-CN')}`);

    try {
      // 解析命令字符串（支持 "bash script.sh" 或 "./script.sh" 格式）
      const [cmd, ...cmdArgs] = this.parseCommand(config.command);

      // 额外的参数（从 config.args 构建）
      const extraArgs = this.buildArgs(config.args);

      // 合并所有参数
      const allArgs = [...cmdArgs, ...extraArgs];

      // 获取环境变量
      const globalEnv = getEnvVarService(this.db).buildEnv();
      const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        ...(globalEnv as Record<string, string>),
        ...(config.env || {}),
      };

      // 执行命令
      const result = await this.spawnCommand(cmd, allArgs, {
        cwd: config.workingDir,
        env,
        timeout: (config.timeout || 300) * 1000,
      });

      const duration = Date.now() - startTime;
      const nextRun = config.cronRule ? getNextRunTime(config.cronRule).getTime() : undefined;
      const runCount = (job?.runCount ?? 0) + 1;
      const failCount = (job?.failCount ?? 0) + (result.exitCode === 0 ? 0 : 1);

      // 记录执行结果
      const executionResult: CronExecutionResult = {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        startedAt: startTime,
        completedAt: Date.now(),
        duration,
      };

      this.saveHistory(config.id, executionResult);
      if (job) {
        this.repository.updateRunStatus(
          config.id,
          startTime,
          nextRun,
          runCount,
          failCount,
          result.stdout,
          result.exitCode === 0 ? undefined : (result.stderr || `exitCode:${result.exitCode}`)
        );
      }
      if (executionId) {
        this.repository.updateExecution(
          executionId,
          Date.now(),
          result.exitCode,
          undefined,
          result.stdout,
          result.stderr,
          false
        );
      }

      console.log(`[Cron] 任务完成: ${config.name}`);
      console.log(`  耗时: ${duration}ms`);
      console.log(`  退出码: ${result.exitCode}`);

      if (result.stdout) {
        console.log(`\n  输出:\n${result.stdout}`);
      }

      if (result.stderr) {
        console.log(`\n  错误:\n${result.stderr}`);
      }
      console.log();

    } catch (error: any) {
      const duration = Date.now() - startTime;
      const nextRun = config.cronRule ? getNextRunTime(config.cronRule).getTime() : undefined;
      const runCount = (job?.runCount ?? 0) + 1;
      const failCount = (job?.failCount ?? 0) + 1;

      // 记录失败结果
      const executionResult: CronExecutionResult = {
        success: false,
        error: error.message,
        startedAt: startTime,
        completedAt: Date.now(),
        duration,
      };

      this.saveHistory(config.id, executionResult);
      if (job) {
        this.repository.updateRunStatus(
          config.id,
          startTime,
          nextRun,
          runCount,
          failCount,
          undefined,
          error.message
        );
      }
      if (executionId) {
        this.repository.updateExecution(
          executionId,
          Date.now(),
          undefined,
          undefined,
          undefined,
          error.message,
          false
        );
      }

      console.log(`[Cron] 任务失败: ${config.name}`);
      console.log(`  错误: ${error.message}`);
      console.log();
    }
  }

  /**
   * 构建命令参数
   */
  private buildArgs(args?: Record<string, any>): string[] {
    if (!args) return [];

    const result: string[] = [];

    for (const [key, value] of Object.entries(args)) {
      if (value == null) continue;

      if (typeof value === 'boolean') {
        if (value) result.push(`--${key}`);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          result.push(`--${key}`, String(item));
        }
      } else {
        result.push(`--${key}`, String(value));
      }
    }

    return result;
  }

  /**
   * 解析命令字符串，分离出命令名和参数
   * 支持 "bash script.sh" 或 "./script.sh arg1" 格式
   */
  private parseCommand(command: string): [string, ...string[]] {
    // 按空格分割，但保留引号内的内容
    const parts: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < command.length; i++) {
      const char = command[i];
      const nextChar = command[i + 1];

      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuote) {
        inQuote = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuote) {
        if (current) {
          parts.push(current);
          current = '';
        }
      } else {
        current += char;
      }

      // 处理最后一个字符
      if (i === command.length - 1 && current) {
        parts.push(current);
      }
    }

    if (parts.length === 0) {
      return [command];
    }

    return [parts[0], ...parts.slice(1)] as [string, ...string[]];
  }

  /**
   * 执行命令
   */
  private spawnCommand(
    command: string,
    args: string[],
    options: { cwd?: string; env: Record<string, string>; timeout: number }
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const child = spawn(command, args, options);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (code) => {
        resolve({
          exitCode: code ?? 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      });
    });
  }

  /**
   * 保存执行历史
   */
  private saveHistory(jobId: string, result: CronExecutionResult): void {
    let history = this.executionHistory.get(jobId) || [];
    history.push(result);

    // 限制历史记录数量
    if (history.length > this.maxHistory) {
      history = history.slice(-this.maxHistory);
    }

    this.executionHistory.set(jobId, history);
  }

  /**
   * 手动触发任务执行
   */
  async executeNow(config: CronJobConfig): Promise<CronExecutionResult> {
    await this.executeJob(config);
    const history = this.getHistory(config.id);
    return history[history.length - 1];
  }
}

// 单例
let cronServiceInstance: CronService | null = null;

export function getCronService(db: AIDatabase): CronService {
  if (!cronServiceInstance) {
    cronServiceInstance = new CronService(db);
  }
  return cronServiceInstance;
}

/**
 * 启动 Cron 服务（Gateway 使用）
 */
export async function startCronService(): Promise<{ kill: () => void }> {
  console.log(`⏰ [Cron Service] 启动中...`);

  const db = getDatabase();
  const cronService = new CronService(db);

  // 加载所有启用的任务
  const jobs = cronService.repository.getEnabled();

  for (const job of jobs) {
    if (job.cronRule) {
      cronService.schedule({
        id: job.id,
        name: job.name,
        description: job.description,
        command: job.command,
        args: job.args,
        cronRule: job.cronRule,
        enabled: job.enabled,
        timeout: job.timeout,
        workingDir: job.workingDir,
        env: job.env,
      });
    }
  }

  console.log(`✅ [Cron Service] 已启动 (${jobs.length} 个定时任务)`);

  return {
    kill: () => {
      cronService.stopAll();
      console.log(`⏰ [Cron Service] 已停止`);
    },
  };
}
