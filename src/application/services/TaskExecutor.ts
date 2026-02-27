/**
 * AI Company - Task Executor (自主循环版本)
 *
 * 让 AI 完全自主地分析、执行、检查、改进，直到任务解决
 *
 * 核心理念：
 * - 不预设任务类型（代码、文档、运营、分析...）
 * - AI 自主决定需要什么、做什么、怎么做
 * - 形成完整闭环：分析 → 执行 → 检查 → 改进 → 循环
 * - 超时提醒（默认 30 分钟）
 */

import type { AIDatabase } from '../../infrastructure/database/index.js';
import type { Task, Employee } from '../../types/index.js';
import { AutonomousLoopExecutor, type AutonomousConfig, type AutonomousExecutionResult } from '../../core/swarm/AutonomousLoopExecutor.js';
import { getHookSystem } from '../../core/runtime/HookSystem.js';

export interface TaskExecutionResult {
  success: boolean;
  output: string;
  iterations?: any[];
  duration?: number;
  completionReason?: string;
  error?: string;
  /** 最终完成度 */
  completionPercentage?: number;
}

export class TaskExecutor {
  private loopExecutor: AutonomousLoopExecutor;
  private hookSystem = getHookSystem();

  constructor(private db: AIDatabase) {
    this.loopExecutor = new AutonomousLoopExecutor(db);
  }

  /**
   * 执行任务（自主循环模式）
   *
   * AI 将自主：
   * 1. 分析任务类型和需求
   * 2. 制定执行计划
   * 3. 执行具体工作
   * 4. 检查结果质量
   * 5. 改进和优化
   * 6. 循环直到完成
   */
  async execute(taskId: string, options?: {
    maxIterations?: number;
    timeout?: number; // 毫秒，默认 30 分钟
    onTimeout?: (message: string) => void;
  }): Promise<TaskExecutionResult> {
    const task = this.db.getTask(taskId);
    if (!task) {
      return { success: false, output: '', error: '任务不存在' };
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🚀 TaskExecutor - 自主循环模式`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`任务：${task.description}`);
    console.log(`ID：${task.id}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    try {
      // 更新任务状态
      this.db.updateTaskStatus(taskId, 'planning');

      // 触发 Hook
      await this.hookSystem.emitAsync('task:before_execute', { taskId });

      // 配置自主执行
      const config: AutonomousConfig = {
        taskId: task.id,
        taskDescription: task.description,
        workDir: task.work_dir,
        maxIterations: options?.maxIterations,
        timeout: options?.timeout,
        onTimeout: options?.onTimeout,
      };

      // 执行自主循环
      this.db.updateTaskStatus(taskId, 'executing');
      const result = await this.loopExecutor.execute(config);

      // 更新任务状态
      if (result.success) {
        this.db.updateTaskStatus(taskId, 'completed');

        // 交付物记录在任务的 artifacts_json 字段中
        const task = this.db.getTask(taskId);
        if (task) {
          const artifacts = task.artifacts_json ? JSON.parse(task.artifacts_json) : [];
          artifacts.push({
            type: 'output',
            title: `任务完成：${task.description}`,
            content: result.finalOutput,
            created_at: Date.now()
          });
          this.db.updateTaskFields(taskId, {
            artifacts_json: JSON.stringify(artifacts)
          });
        }
      } else {
        this.db.updateTaskStatus(taskId, 'failed', `完成原因: ${result.completionReason}`);
      }

      // 触发 Hook
      await this.hookSystem.emitAsync('task:after_execute', {
        taskId,
        employeeId: undefined, // 自主模式没有特定员工
        result,
      });

      console.log(`\n${result.success ? '✅' : '❌'} 执行${result.success ? '成功' : '失败'}`);
      console.log(`   完成原因：${result.completionReason}`);
      console.log(`   迭代次数：${result.metadata.totalIterations}`);
      console.log(`   完成度：${result.metadata.finalCompletionPercentage}%\n`);

      return {
        success: result.success,
        output: result.finalOutput,
        iterations: result.iterations,
        duration: result.totalDuration,
        completionReason: result.completionReason,
        completionPercentage: result.metadata.finalCompletionPercentage,
      };

    } catch (error: any) {
      console.error(`\n❌ 执行失败:`, error);

      this.db.updateTaskStatus(taskId, 'failed', error.message);

      await this.hookSystem.emitAsync('task:on_failed', {
        taskId,
        error: error.message,
      });

      return {
        success: false,
        output: '',
        error: error.message,
      };
    }
  }

  /**
   * 分配并执行任务（兼容旧接口）
   * @deprecated 使用 execute() 代替
   */
  async executeWithAssignment(
    taskId: string,
    employeeId: string,
    options?: { maxIterations?: number; timeout?: number }
  ): Promise<TaskExecutionResult> {
    // 自主模式不需要指定员工，AI 会自己决定需要什么
    return this.execute(taskId, options);
  }
}
