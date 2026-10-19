/**
 * AI Company v2 - Task Scheduler
 *
 * 职责：管理任务队列，按优先级调度任务执行
 *
 * 特性：
 * - 优先级队列（critical > high > medium > low）
 * - 防止任务饥饿（低优先级任务也会被执行）
 * - 任务年龄追踪（防止长期等待）
 * - 并发控制（限制同时执行的任务数）
 */

import { EventEmitter } from 'events';
import type { UserInputEvent } from '../events/EventBus.js';
import { getDatabase } from '../../db/Database.js';

/**
 * 优先级权重
 */
const PRIORITY_WEIGHT = {
  critical: 1000,
  high: 100,
  medium: 10,
  low: 1,
} as const;

/**
 * 待调度任务
 */
interface ScheduledTask {
  taskId: string;
  description: string;
  requiredCapabilities: string[];
  employeeId?: string;
  inputEvent: UserInputEvent;
  priority: 'critical' | 'high' | 'medium' | 'low';
  createdAt: number;
  scheduledAt?: number;
}

/**
 * 任务调度结果
 */
interface ScheduleResult {
  success: boolean;
  taskId: string;
  scheduledAt?: number;
  error?: string;
}

/**
 * 任务调度器
 */
export class TaskScheduler extends EventEmitter {
  private db = getDatabase();

  // 待调度队列（按优先级排序）
  private pendingTasks: Map<string, ScheduledTask> = new Map();

  // 任务年龄追踪（防止饥饿）
  private taskAges: Map<string, number> = new Map();

  // 并发控制
  private executingTasks = new Set<string>();
  private readonly MAX_CONCURRENT_TASKS = 5;

  // 调度定时器
  private scheduleTimer?: NodeJS.Timeout;
  private readonly SCHEDULE_INTERVAL = 1000; // 每秒检查一次

  // 年龄权重（防止饥饿）
  private readonly AGE_WEIGHT_PER_MINUTE = 1; // 每分钟增加的权重

  constructor() {
    super();
    // 不在构造函数中启动，由外部调用 start()
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (this.scheduleTimer) {
      console.warn('[TaskScheduler] 调度器已在运行');
      return;
    }

    this.scheduleTimer = setInterval(() => {
      this.schedulePendingTasks();
    }, this.SCHEDULE_INTERVAL);

    console.log('[TaskScheduler] 调度器已启动');
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = undefined;
      console.log('[TaskScheduler] 调度器已停止');
    }
  }

  /**
   * 调度任务（添加到队列）
   */
  schedule(task: ScheduledTask): ScheduleResult {
    try {
      // 如果任务已在队列中，更新优先级
      if (this.pendingTasks.has(task.taskId)) {
        const existing = this.pendingTasks.get(task.taskId)!;
        // 只提升优先级，不降低
        if (this.comparePriority(task.priority, existing.priority) > 0) {
          existing.priority = task.priority;
          console.log(`[TaskScheduler] 任务 ${task.taskId} 优先级已提升: ${existing.priority} → ${task.priority}`);
        }
        return { success: true, taskId: task.taskId };
      }

      // 添加到队列
      this.pendingTasks.set(task.taskId, {
        ...task,
        scheduledAt: Date.now(),
      });

      // 初始化年龄
      this.taskAges.set(task.taskId, 0);

      console.log(`[TaskScheduler] 任务已加入调度队列: ${task.taskId} (优先级: ${task.priority})`);

      return { success: true, taskId: task.taskId, scheduledAt: Date.now() };
    } catch (error: any) {
      console.error(`[TaskScheduler] 调度任务失败: ${error.message}`);
      return { success: false, taskId: task.taskId, error: error.message };
    }
  }

  /**
   * 取消任务调度
   */
  cancel(taskId: string): boolean {
    const removed = this.pendingTasks.delete(taskId);
    this.taskAges.delete(taskId);
    if (removed) {
      console.log(`[TaskScheduler] 任务已从调度队列移除: ${taskId}`);
    }
    return removed;
  }

  /**
   * 获取下一个要执行的任务
   *
   * 综合考虑：
   * 1. 任务优先级
   * 2. 任务年龄（防止饥饿）
   * 3. 可用员工
   */
  getNextTask(): ScheduledTask | null {
    if (this.pendingTasks.size === 0) {
      return null;
    }

    // 检查并发限制
    if (this.executingTasks.size >= this.MAX_CONCURRENT_TASKS) {
      console.log(`[TaskScheduler] 已达到并发上限 (${this.MAX_CONCURRENT_TASKS})，等待任务完成`);
      return null;
    }

    // 计算每个任务的综合得分
    const taskScores: Array<{ task: ScheduledTask; score: number }> = [];

    for (const task of this.pendingTasks.values()) {
      const score = this.calculateTaskScore(task);
      taskScores.push({ task, score });
    }

    // 按得分排序，选择得分最高的
    taskScores.sort((a, b) => b.score - a.score);

    const bestTask = taskScores[0]?.task;
    if (!bestTask) {
      return null;
    }

    // 从队列中移除
    this.pendingTasks.delete(bestTask.taskId);
    this.taskAges.delete(bestTask.taskId);

    // 标记为执行中
    this.executingTasks.add(bestTask.taskId);

    console.log(`[TaskScheduler] 选择任务执行: ${bestTask.taskId} (得分: ${taskScores[0].score}, 优先级: ${bestTask.priority})`);

    return bestTask;
  }

  /**
   * 计算任务得分（用于调度决策）
   *
   * 得分 = 优先级权重 + 年龄权重
   */
  private calculateTaskScore(task: ScheduledTask): number {
    // 优先级权重
    const priorityScore = PRIORITY_WEIGHT[task.priority] || 1;

    // 年龄权重（每分钟增加一次）
    const ageMinutes = Math.floor((Date.now() - (task.scheduledAt || task.createdAt)) / 60000);
    const ageScore = ageMinutes * this.AGE_WEIGHT_PER_MINUTE;

    return priorityScore + ageScore;
  }

  /**
   * 比较优先级（返回 >0 如果优先级 a 高于 b）
   */
  private comparePriority(
    a: 'critical' | 'high' | 'medium' | 'low',
    b: 'critical' | 'high' | 'medium' | 'low'
  ): number {
    return (PRIORITY_WEIGHT[a] || 0) - (PRIORITY_WEIGHT[b] || 0);
  }

  /**
   * 标记任务完成
   */
  markTaskComplete(taskId: string, success: boolean): void {
    this.executingTasks.delete(taskId);

    if (!success) {
      // 任务失败，可以考虑重新调度
      // 这里简化处理，不自动重新调度
      console.log(`[TaskScheduler] 任务执行失败: ${taskId}`);
    } else {
      console.log(`[TaskScheduler] 任务执行成功: ${taskId}`);
    }

    // 触发调度检查
    this.schedulePendingTasks();
  }

  /**
   * 调度待处理任务
   */
  private schedulePendingTasks(): void {
    // 更新任务年龄
    this.updateTaskAges();

    // 尝试调度任务
    const task = this.getNextTask();
    if (task) {
      this.emit('task.scheduled', task);
    }
  }

  /**
   * 更新所有待处理任务的年龄
   */
  private updateTaskAges(): void {
    const now = Date.now();
    for (const [taskId, scheduledAt] of this.taskAges) {
      // scheduledAt 存储的是创建时间，计算年龄（分钟）
      const ageMinutes = Math.floor((now - scheduledAt) / 60000);
      this.taskAges.set(taskId, ageMinutes);
    }
  }

  /**
   * 获取调度统计
   */
  getStats(): {
    pendingCount: number;
    executingCount: number;
    maxConcurrent: number;
    pendingByPriority: Record<string, number>;
  } {
    const pendingByPriority: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const task of this.pendingTasks.values()) {
      pendingByPriority[task.priority]++;
    }

    return {
      pendingCount: this.pendingTasks.size,
      executingCount: this.executingTasks.size,
      maxConcurrent: this.MAX_CONCURRENT_TASKS,
      pendingByPriority,
    };
  }

  /**
   * 清理过期的待处理任务
   *
   * 超过一定时间的待处理任务会被标记为超时
   */
  cleanupExpiredTasks(): number {
    const now = Date.now();
    const EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 小时
    let cleaned = 0;

    for (const [taskId, task] of this.pendingTasks) {
      const age = now - (task.scheduledAt || task.createdAt);
      if (age > EXPIRY_TIME) {
        this.pendingTasks.delete(taskId);
        this.taskAges.delete(taskId);

        // 记录任务超时
        this.db.logActivity({
          eventType: 'task.expired',
          actor: 'task_scheduler',
          action: 'task_expired_in_queue',
          context: {
            taskId,
            priority: task.priority,
            age: Math.round(age / 1000 / 60), // 分钟
          },
        });

        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[TaskScheduler] 清理了 ${cleaned} 个过期任务`);
    }

    return cleaned;
  }
}

// 单例
let schedulerInstance: TaskScheduler | null = null;

export function getTaskScheduler(): TaskScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new TaskScheduler();
  }
  return schedulerInstance;
}
