/**
 * TaskManager - 任务管理器
 *
 * 负责：
 * - 任务存储与查询
 * - 状态跟踪
 * - 任务历史
 */

import pino from 'pino';
import type { Task, TaskStatus, TaskType, TaskPriority } from '../../types';

export class TaskManager {
  private tasks = new Map<string, Task>();
  private logger: pino.Logger;

  constructor() {
    this.logger = pino({ name: 'task-manager' });
  }

  /**
   * 注册任务
   */
  registerTask(task: Task): void {
    this.tasks.set(task.id, task);
    this.logger.info({ taskId: task.id, type: task.type }, 'Task registered');
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 更新任务状态
   */
  updateStatus(taskId: string, status: TaskStatus, error?: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      task.updatedAt = Date.now();
      if (error) {
        task.error = error;
      }
      this.logger.debug({ taskId, status }, 'Task status updated');
    }
  }

  /**
   * 更新任务优先级
   */
  updatePriority(taskId: string, priority: TaskPriority): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.priority = priority;
      task.updatedAt = Date.now();
    }
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.tasks.get(taskId)?.status;
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 按状态筛选任务
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    return Array.from(this.tasks.values()).filter(t => t.status === status);
  }

  /**
   * 按类型筛选任务
   */
  getTasksByType(type: TaskType): Task[] {
    return Array.from(this.tasks.values()).filter(t => t.type === type);
  }

  /**
   * 获取活跃任务
   */
  getActiveTasks(): Task[] {
    return this.getTasksByStatus('in_progress').concat(this.getTasksByStatus('pending'));
  }

  /**
   * 删除任务
   */
  deleteTask(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  /**
   * 清空所有任务
   */
  clear(): void {
    this.tasks.clear();
    this.logger.info('All tasks cleared');
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    byStatus: Record<TaskStatus, number>;
    byType: Record<TaskType, number>;
  } {
    const tasks = this.getAllTasks();
    const byStatus: Record<TaskStatus, number> = {
      pending: 0,
      in_progress: 0,
      waiting_approval: 0,
      waiting_feedback: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };
    const byType: Record<TaskType, number> = {
      goal: 0,
      task: 0,
      query: 0,
      chat: 0,
      scheduled: 0
    };

    for (const task of tasks) {
      byStatus[task.status]++;
      byType[task.type]++;
    }

    return { total: tasks.length, byStatus, byType };
  }
}
