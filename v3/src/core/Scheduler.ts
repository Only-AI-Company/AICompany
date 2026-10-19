/**
 * AI Company v3 - Scheduler
 *
 * 任务调度器
 *
 * 职责：
 * 1. 管理任务队列
 * 2. 按优先级调度任务
 * 3. 分配任务给员工
 * 4. 防止任务饥饿
 * 5. 持久化任务到数据库
 */

import { EventEmitter } from 'eventemitter3';
import type { Task, TaskPriority, TaskStatus, Employee } from './types.js';
import { getCEO } from './CEO.js';
import { generateId, delay } from './utils.js';
import { EmployeeImpl } from './Employee.js';
import { getDatabase, getDatabaseSync } from './database/index.js';

// ============================================================================
// Types
// ============================================================================

interface ScheduledTask {
  task: Task;
  priority: TaskPriority;
  scheduledAt: number;
  attempts: number;
}

// ============================================================================
// Priority Weights
// ============================================================================

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  critical: 1000,
  high: 100,
  medium: 10,
  low: 1,
};

// ============================================================================
// Scheduler
// ============================================================================

export class Scheduler extends EventEmitter {
  // 任务队列
  private queue: ScheduledTask[] = [];

  // 正在执行的任务
  private executingTasks: Set<string> = new Set();

  // CEO 引用
  private ceo = getCEO();

  // 数据库（延迟初始化）
  private db?: ReturnType<typeof getDatabaseSync>;

  // 并发限制
  private readonly MAX_CONCURRENT_TASKS = 3;

  // 最大重试次数
  private readonly MAX_ATTEMPTS = 3;

  // 任务恢复超时时间（毫秒）- 30分钟后视为失败
  private readonly TASK_RECOVERY_TIMEOUT = 30 * 60 * 1000;

  constructor() {
    super();
    this.tryLoadPendingTasks();
  }

  /**
   * 设置员工列表（用于任务恢复）
   *
   * 这个方法应该在 Engine 初始化时调用，传入员工列表
   */
  setEmployees(employees: Employee[]): void {
    // 存储员工引用用于任务恢复
    (this as any).employees = employees;

    // 如果有待恢复的任务，现在可以恢复了
    this.recoverPendingRecovery();
  }

  /**
   * 恢复待处理的任务恢复操作
   *
   * 用于在员工列表设置后完成任务恢复
   */
  private recoverPendingRecovery(): void {
    if (!this.db) return;

    try {
      const executingTasks = this.db.getTasksByStatus('executing');
      const now = Date.now();

      for (const dbTask of executingTasks) {
        const elapsed = now - (dbTask.started_at || now);

        // 只处理未超时的任务（超时的已在 recoverExecutingTasks 中处理）
        if (elapsed <= this.TASK_RECOVERY_TIMEOUT && !this.executingTasks.has(dbTask.id)) {
          const employees = (this as any).employees as Employee[];
          if (!employees || employees.length === 0) {
            continue; // 员工列表仍未设置
          }

          const employee = employees.find((e: Employee) => e.id === dbTask.employee_id);
          if (employee) {
            console.log(`[Scheduler] Recovering task ${dbTask.id} with employee ${employee.name}`);

            // 重新加入执行中的任务集合
            this.executingTasks.add(dbTask.id);

            // 创建 Task 对象
            const task: Task = {
              id: dbTask.id,
              planId: dbTask.plan_id,
              goalId: dbTask.goal_id,
              description: dbTask.description,
              requiredCapabilities: dbTask.required_capabilities ? JSON.parse(dbTask.required_capabilities) : [],
              employeeId: dbTask.employee_id,
              status: dbTask.status,
              priority: dbTask.priority,
              input: dbTask.input,
              createdAt: dbTask.created_at,
              startedAt: dbTask.started_at,
            };

            // 创建 ScheduledTask
            const scheduledTask: ScheduledTask = {
              task,
              priority: task.priority,
              scheduledAt: dbTask.scheduled_at || now,
              attempts: 0,
            };

            // 异步重新执行
            this.executeTask(task, employee, scheduledTask);
          }
        }
      }
    } catch (error: any) {
      console.error('[Scheduler] Failed to recover pending tasks:', error.message);
    }
  }

  /**
   * 尝试从数据库加载待执行任务（静默失败）
   */
  private tryLoadPendingTasks(): void {
    try {
      this.db = getDatabaseSync();
      this.loadPendingTasks();
      this.recoverExecutingTasks();
    } catch (error: any) {
      // Database not initialized yet, will load later
      console.log('[Scheduler] Database not yet initialized, will load later');
    }
  }

  /**
   * 从数据库加载待执行任务
   */
  private loadPendingTasks(): void {
    if (!this.db) return;

    try {
      const pendingTasks = this.db.getTasksByStatus('pending');
      console.log(`[Scheduler] Loaded ${pendingTasks.length} pending tasks from database`);

      for (const dbTask of pendingTasks) {
        const task: Task = {
          id: dbTask.id,
          planId: dbTask.plan_id,
          goalId: dbTask.goal_id,
          description: dbTask.description,
          requiredCapabilities: dbTask.required_capabilities ? JSON.parse(dbTask.required_capabilities) : [],
          employeeId: dbTask.employee_id,
          status: dbTask.status,
          priority: dbTask.priority,
          input: dbTask.input,
          createdAt: dbTask.created_at,
          scheduledAt: dbTask.scheduled_at,
        };

        this.schedule(task, task.priority);
      }
    } catch (error: any) {
      console.error('[Scheduler] Failed to load pending tasks:', error.message);
    }
  }

  /**
   * 恢复执行中的任务状态
   *
   * 系统重启后处理状态为 'executing' 的任务：
   * - 超时的任务标记为失败
   * - 未超时的任务将在 setEmployees 后通过 recoverPendingRecovery 恢复
   */
  private recoverExecutingTasks(): void {
    if (!this.db) return;

    try {
      const executingTasks = this.db.getTasksByStatus('executing');
      console.log(`[Scheduler] Checking ${executingTasks.length} executing tasks from database`);

      const now = Date.now();

      for (const dbTask of executingTasks) {
        const elapsed = now - (dbTask.started_at || now);

        if (elapsed > this.TASK_RECOVERY_TIMEOUT) {
          // 任务超时，标记为失败
          console.log(`[Scheduler] Task ${dbTask.id} timed out during recovery (${Math.floor(elapsed / 1000)}s)`);
          this.db.updateTask(dbTask.id, {
            status: 'failed',
            error: `Task recovery timeout: task was executing for ${Math.floor(elapsed / 1000)}s before system restart`,
          });

          // 发出失败事件
          this.emit('task.failed', {
            type: 'task.failed',
            timestamp: now,
            data: {
              taskId: dbTask.id,
              error: 'Recovery timeout',
            },
          });
        }
        // 未超时的任务将在 setEmployees 调用后通过 recoverPendingRecovery 处理
      }

      console.log('[Scheduler] Task recovery check completed');
    } catch (error: any) {
      console.error('[Scheduler] Failed to recover executing tasks:', error.message);
    }
  }

  /**
   * 调度任务
   */
  schedule(task: Task, priority: TaskPriority = 'medium'): void {
    const scheduledTask: ScheduledTask = {
      task,
      priority,
      scheduledAt: Date.now(),
      attempts: 0,
    };

    this.queue.push(scheduledTask);

    // 按优先级排序
    this.sortQueue();

    // 持久化到数据库
    if (this.db) {
      try {
        this.db.insertTask({
          id: task.id,
          planId: task.planId,
          goalId: task.goalId,
          description: task.description,
          requiredCapabilities: task.requiredCapabilities,
          employeeId: task.employeeId,
          status: 'scheduled',
          priority: task.priority,
          input: task.input,
          createdAt: task.createdAt,
          scheduledAt: Date.now(),
        });
      } catch (error: any) {
        console.error('[Scheduler] Failed to persist task:', error.message);
      }
    }

    // 发出事件
    this.emit('task.scheduled', {
      type: 'task.scheduled',
      timestamp: Date.now(),
      data: { taskId: task.id, priority },
    });

    console.log(`[Scheduler] Task scheduled: ${task.id} (priority: ${priority})`);
  }

  /**
   * 获取下一个待执行的任务
   */
  getNextTask(): ScheduledTask | null {
    // 检查并发限制
    if (this.executingTasks.size >= this.MAX_CONCURRENT_TASKS) {
      return null;
    }

    if (this.queue.length === 0) {
      return null;
    }

    // 返回优先级最高的任务
    const scheduledTask = this.queue.shift()!;
    return scheduledTask;
  }

  /**
   * 执行下一个任务
   */
  async executeNext(employees: Employee[]): Promise<void> {
    const scheduledTask = this.getNextTask();

    if (!scheduledTask) {
      return;
    }

    const { task } = scheduledTask;

    // 分配给员工
    let employee: Employee;
    try {
      employee = await this.ceo.assignTask(task, employees);
    } catch (error: any) {
      console.error(`[Scheduler] Failed to assign task: ${error.message}`);

      // 标记为失败
      task.status = 'failed';
      this.emitTaskFailed(task, error.message);

      // 持久化失败状态
      if (this.db) {
        try {
          this.db.updateTask(task.id, {
            status: 'failed',
            error: error.message,
          });
        } catch (dbError: any) {
          console.error('[Scheduler] Failed to update task in database:', dbError.message);
        }
      }

      return;
    }

    // 更新任务状态
    task.status = 'executing';
    task.employeeId = employee.id;
    task.startedAt = Date.now();

    // 持久化到数据库
    if (this.db) {
      try {
        this.db.updateTask(task.id, {
          status: task.status,
          employeeId: task.employeeId,
          startedAt: task.startedAt,
        });
      } catch (error: any) {
        console.error('[Scheduler] Failed to update task in database:', error.message);
      }
    }

    this.executingTasks.add(task.id);

    // 发出事件
    this.emit('task.started', {
      type: 'task.started',
      timestamp: Date.now(),
      data: { taskId: task.id, employeeId: employee.id },
    });

    console.log(`[Scheduler] Starting task: ${task.id} by ${employee.name}`);

    // 异步执行任务
    this.executeTask(task, employee, scheduledTask);
  }

  /**
   * 执行任务（异步）
   */
  private async executeTask(
    task: Task,
    employee: Employee,
    scheduledTask: ScheduledTask
  ): Promise<void> {
    try {
      // 执行任务
      const result = employee.execute
        ? await employee.execute(task)
        : await (employee as EmployeeImpl).execute(task);

      // 更新任务状态
      task.status = 'completed';
      task.completedAt = Date.now();
      task.result = result;

      // 持久化到数据库
      if (this.db) {
        try {
          this.db.updateTask(task.id, {
            status: task.status,
            completedAt: task.completedAt,
            output: result.output,
            error: result.error,
            duration: result.duration,
          });
        } catch (error: any) {
          console.error('[Scheduler] Failed to update task in database:', error.message);
        }
      }

      // 从执行中移除
      this.executingTasks.delete(task.id);

      // 发出事件
      this.emit('task.completed', {
        type: 'task.completed',
        timestamp: Date.now(),
        data: { taskId: task.id, result },
      });

      console.log(`[Scheduler] Task completed: ${task.id} (${result.duration}ms)`);
    } catch (error: any) {
      scheduledTask.attempts++;

      // 检查是否重试
      if (scheduledTask.attempts < this.MAX_ATTEMPTS) {
        console.log(`[Scheduler] Retrying task: ${task.id} (attempt ${scheduledTask.attempts})`);

        // 重新加入队列
        this.queue.push(scheduledTask);
        this.sortQueue();

        this.executingTasks.delete(task.id);

        // 等待后重试
        await delay(1000 * scheduledTask.attempts);
      } else {
        // 达到最大重试次数，标记为失败
        task.status = 'failed';
        task.completedAt = Date.now();
        task.result = {
          success: false,
          error: error.message,
        };

        // 持久化到数据库
        if (this.db) {
          try {
            this.db.updateTask(task.id, {
              status: task.status,
              completedAt: task.completedAt,
              error: error.message,
            });
          } catch (dbError: any) {
            console.error('[Scheduler] Failed to update failed task in database:', dbError.message);
          }
        }

        this.executingTasks.delete(task.id);

        this.emitTaskFailed(task, error.message);
      }
    }
  }

  /**
   * 获取队列统计
   */
  getStats(): {
    queued: number;
    executing: number;
    byPriority: Record<TaskPriority, number>;
  } {
    const byPriority: Record<TaskPriority, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const scheduledTask of this.queue) {
      byPriority[scheduledTask.priority]++;
    }

    return {
      queued: this.queue.length,
      executing: this.executingTasks.size,
      byPriority,
    };
  }

  /**
   * 获取所有执行中的任务
   */
  getExecutingTasks(): string[] {
    return Array.from(this.executingTasks);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * 按优先级排序队列
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const scoreA = this.calculateScore(a);
      const scoreB = this.calculateScore(b);
      return scoreB - scoreA; // 降序
    });
  }

  /**
   * 计算任务得分
   *
   * 得分 = 优先级权重 + 年龄权重
   * 年龄权重防止饥饿：等待时间越长，得分越高
   */
  private calculateScore(scheduledTask: ScheduledTask): number {
    // 优先级权重
    const priorityScore = PRIORITY_WEIGHT[scheduledTask.priority];

    // 年龄权重（每分钟增加 1 分）
    const ageMinutes = (Date.now() - scheduledTask.scheduledAt) / 60000;
    const ageScore = ageMinutes;

    return priorityScore + ageScore;
  }

  /**
   * 发出任务失败事件
   */
  private emitTaskFailed(task: Task, error: string): void {
    this.emit('task.failed', {
      type: 'task.failed',
      timestamp: Date.now(),
      data: { taskId: task.id, error },
    });

    console.error(`[Scheduler] Task failed: ${task.id} - ${error}`);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let schedulerInstance: Scheduler | null = null;

export function getScheduler(): Scheduler {
  if (!schedulerInstance) {
    schedulerInstance = new Scheduler();
  }
  return schedulerInstance;
}

export function resetScheduler(): void {
  schedulerInstance = null;
}
