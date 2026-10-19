/**
 * Orchestrator - 编排层核心
 *
 * 负责：
 * - 任务分发与协调
 * - Agent 调度
 * - 执行流程控制
 * - 资源管理
 */

import { EventEmitter } from 'events';
import pino from 'pino';
import type { Task, TaskStatus } from '../../types';
import { TaskManager } from './TaskManager';

export interface OrchestratorConfig {
  maxConcurrentTasks?: number;
  taskTimeout?: number;
}

export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  result?: any;
  error?: string;
}

export class Orchestrator extends EventEmitter {
  private config: Required<OrchestratorConfig>;
  private logger: pino.Logger;
  private taskManager: TaskManager;

  // 执行队列
  private executionQueue: Task[] = [];

  // 正在执行的任务
  private executingTasks = new Map<string, Task>();

  constructor(config: OrchestratorConfig = {}) {
    super();
    this.config = {
      maxConcurrentTasks: config.maxConcurrentTasks ?? 5,
      taskTimeout: config.taskTimeout ?? 300000 // 5 分钟
    };
    this.taskManager = new TaskManager();
    this.logger = pino({ name: 'orchestrator' });
  }

  /**
   * 提交任务
   */
  async submitTask(task: Task): Promise<string> {
    this.logger.info({ taskId: task.id, type: task.type }, 'Task submitted');

    // 任务注册
    this.taskManager.registerTask(task);

    // 加入执行队列
    this.executionQueue.push(task);

    // 尝试启动任务
    this.processQueue();

    return task.id;
  }

  /**
   * 处理队列
   */
  private processQueue(): void {
    while (
      this.executingTasks.size < this.config.maxConcurrentTasks &&
      this.executionQueue.length > 0
    ) {
      const task = this.executionQueue.shift()!;
      this.executeTask(task);
    }
  }

  /**
   * 执行任务
   */
  private async executeTask(task: Task): Promise<void> {
    this.executingTasks.set(task.id, task);
    this.taskManager.updateStatus(task.id, 'in_progress');

    this.logger.info({ taskId: task.id }, 'Executing task');
    this.emit('task_started', { taskId: task.id });

    try {
      // TODO: 调用 Agent 执行
      // const result = await agent.execute(task);

      // 模拟执行
      await this.mockExecute(task);

      // 任务完成
      this.taskManager.updateStatus(task.id, 'completed');
      this.emit('task_completed', { taskId: task.id, result: 'success' });

    } catch (error) {
      this.logger.error({ taskId: task.id, error }, 'Task execution failed');
      this.taskManager.updateStatus(task.id, 'failed', error instanceof Error ? error.message : 'Unknown error');
      this.emit('task_failed', { taskId: task.id, error });
    } finally {
      this.executingTasks.delete(task.id);
      this.processQueue();
    }
  }

  /**
   * 模拟执行（临时）
   */
  private async mockExecute(_task: Task): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): boolean {
    // 从队列中移除
    const index = this.executionQueue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      this.executionQueue.splice(index, 1);
      this.taskManager.updateStatus(taskId, 'cancelled');
      this.logger.info({ taskId }, 'Task cancelled');
      return true;
    }

    // 从执行中任务移除
    if (this.executingTasks.has(taskId)) {
      // TODO: 实现任务中断
      this.logger.warn({ taskId }, 'Cancelling running task (not fully implemented)');
      return true;
    }

    return false;
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.taskManager.getTaskStatus(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): Task[] {
    return this.taskManager.getAllTasks();
  }

  /**
   * 获取执行统计
   */
  getStats(): {
    queued: number;
    executing: number;
    completed: number;
    failed: number;
  } {
    const tasks = this.taskManager.getAllTasks();
    return {
      queued: this.executionQueue.length,
      executing: this.executingTasks.size,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length
    };
  }

  /**
   * 清空队列
   */
  clearQueue(): number {
    const count = this.executionQueue.length;
    this.executionQueue = [];
    this.logger.info({ count }, 'Queue cleared');
    return count;
  }
}
