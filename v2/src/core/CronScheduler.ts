/**
 * AI Company v2 - Cron 调度器
 *
 * 负责定时任务的调度和触发
 */
import { schedule, ScheduledTask } from 'node-cron';
import { getEventBus } from './Event.js';
import { EventType } from '../types.js';
import { getDatabase } from '../db/Database.js';
import { getExecutionEngine } from './Execute.js';

/**
 * Cron 调度器
 */
export class CronScheduler {
  private jobs: Map<string, ScheduledTask> = new Map();
  private isRunning: boolean = false;
  private unsubscribeFunctions: Array<() => void> = [];

  /**
   * 启动调度器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[CronScheduler] Already running');
      return;
    }

    console.log('[CronScheduler] Starting...');

    const db = getDatabase();
    const crons = db.listCrons({ enabled: true });

    for (const cron of crons) {
      await this.scheduleJob(cron);
    }

    this.isRunning = true;

    // 监听 Cron 创建事件
    const unsubscribe = getEventBus().on(EventType.CRON_CREATED, async (event) => {
      try {
        const { cronId } = event.data;
        const cron = db.getCron(cronId);
        if (cron) {
          await this.scheduleJob(cron);
        }
      } catch (error: any) {
        console.error('[CronScheduler] Error in CRON_CREATED handler:', error.message);
      }
    });
    this.unsubscribeFunctions.push(unsubscribe);

    console.log(`[CronScheduler] Started with ${this.jobs.size} jobs`);
  }

  /**
   * 停止调度器
   */
  stop(): void {
    console.log('[CronScheduler] Stopping...');

    // 清理所有事件监听器
    this.unsubscribeFunctions.forEach(fn => fn());
    this.unsubscribeFunctions = [];

    for (const [id, job] of this.jobs) {
      job.stop();
    }

    this.jobs.clear();
    this.isRunning = false;

    console.log('[CronScheduler] Stopped');
  }

  /**
   * 调度任务
   */
  private async scheduleJob(cron: any): Promise<void> {
    try {
      const task = schedule(
        cron.cron_rule,
        async () => {
          await this.executeCron(cron);
        },
        {
          timezone: 'Asia/Shanghai',
        }
      );

      this.jobs.set(cron.id, task);
      task.start();

      console.log(`[CronScheduler] Scheduled: ${cron.name} (${cron.cron_rule})`);
    } catch (error: any) {
      console.error(`[CronScheduler] Failed to schedule ${cron.id}:`, error.message);
    }
  }

  /**
   * 执行 Cron 任务
   */
  private async executeCron(cron: any): Promise<void> {
    const startTime = Date.now();

    console.log(`[CronScheduler] Executing: ${cron.name}`);

    // 发布触发事件
    getEventBus().emit(EventType.CRON_TRIGGERED, {
      cronId: cron.id,
      goalId: cron.goal_id,
      timestamp: startTime,
    });

    try {
      // 提交到执行引擎
      const engine = getExecutionEngine();
      const result = await engine.execute({
        type: 'cron',
        description: cron.name,
        correlationId: cron.id,
        params: { cronId: cron.id },
        source: { type: 'cron', id: cron.id },
      });

      // 更新 Cron 运行状态
      const db = getDatabase();
      db.updateCronRunStatus(cron.id, {
        success: result.success,
        output: result.output,
        error: result.error,
        duration: Date.now() - startTime,
      });

      // 如果成功且有关联目标，检查是否需要更新目标状态
      if (result.success && cron.goal_id) {
        const goal = db.getGoal(cron.goal_id);
        if (goal && goal.status === 'pending') {
          db.updateGoalStatus(cron.goal_id, 'active');
        }
      }

      console.log(`[CronScheduler] Completed: ${cron.name} (${result.success ? 'success' : 'failed'})`);
    } catch (error: any) {
      console.error(`[CronScheduler] Execution failed: ${cron.name}`, error.message);

      const db = getDatabase();
      db.updateCronRunStatus(cron.id, {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
    }
  }

  /**
   * 手动触发 Cron
   */
  async trigger(cronId: string): Promise<void> {
    const db = getDatabase();
    const cron = db.getCron(cronId);

    if (!cron) {
      throw new Error(`Cron not found: ${cronId}`);
    }

    await this.executeCron(cron);
  }

  /**
   * 添加新任务
   */
  async addJob(cron: {
    id: string;
    name: string;
    description?: string;
    command: string;
    cronRule: string;
    goalId?: string;
  }): Promise<void> {
    const db = getDatabase();
    db.createCron(cron);

    await this.scheduleJob(db.getCron(cron.id));

    getEventBus().emit(EventType.CRON_CREATED, {
      cronId: cron.id,
      goalId: cron.goalId,
      cronRule: cron.cronRule,
    });
  }

  /**
   * 移除任务
   */
  removeJob(cronId: string): void {
    const job = this.jobs.get(cronId);
    if (job) {
      job.stop();
      this.jobs.delete(cronId);
      console.log(`[CronScheduler] Removed: ${cronId}`);
    }

    // TODO: 更新数据库中的 enabled 状态
  }

  /**
   * 获取调度状态
   */
  getStatus(): {
    isRunning: boolean;
    jobCount: number;
    jobs: Array<{ id: string; name: string; cronRule: string }>;
  } {
    const db = getDatabase();
    const crons = db.listCrons({ enabled: true });

    return {
      isRunning: this.isRunning,
      jobCount: this.jobs.size,
      jobs: crons.map(c => ({
        id: c.id,
        name: c.name,
        cronRule: c.cron_rule,
      })),
    };
  }
}

// 单例
let cronSchedulerInstance: CronScheduler | null = null;

export function getCronScheduler(): CronScheduler {
  if (!cronSchedulerInstance) {
    cronSchedulerInstance = new CronScheduler();
  }
  return cronSchedulerInstance;
}
