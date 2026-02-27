/**
 * AI Company - Execution Tracker
 *
 * 执行追踪服务：追踪 Claude 执行进度
 * - 监听 Hook 事件
 * - 记录执行步骤
 * - 计算进度
 * - 聚合日志
 * - 统计指标
 */

import type { AIDatabase } from '../../infrastructure/database/index.js';
import { getHookSystem, type HookSystem } from '../../core/runtime/HookSystem.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 执行步骤 */
export interface ExecutionStep {
  stepId: string;
  executionId: string;
  type: 'prompt' | 'response' | 'tool_use' | 'error' | 'progress';
  timestamp: number;
  data: any;
  duration?: number;
}

/** 执行进度 */
export interface ExecutionProgress {
  executionId: string;
  taskId?: string;
  progress: number; // 0-100
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  estimatedDuration?: number;
  stepsCompleted: number;
  stepsTotal?: number;
}

/** 执行结果 */
export interface ExecutionResult {
  executionId: string;
  success: boolean;
  duration: number;
  steps: ExecutionStep[];
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  toolCalls?: Array<{
    name: string;
    input: any;
    output?: any;
    duration?: number;
  }>;
  error?: string;
}

/** 执行指标 */
export interface ExecutionMetrics {
  totalExecutions: number;
  successRate: number;
  averageDuration: number;
  averageTokenUsage: number;
  mostUsedTools: Array<{ name: string; count: number }>;
  recentExecutions: ExecutionResult[];
}

// ============================================================================
// ExecutionTracker
// ============================================================================

export class ExecutionTracker {
  private hookSystem: HookSystem;

  // 存储执行数据（生产环境应该用数据库或缓存）
  private executions = new Map<string, ExecutionProgress>();
  private steps = new Map<string, ExecutionStep[]>();
  private currentExecution: string | null = null;

  constructor(private db: AIDatabase) {
    this.hookSystem = getHookSystem();
    this.registerHooks();
  }

  /**
   * 注册 Hook 监听器
   */
  private registerHooks(): void {
    // 监听执行开始
    this.hookSystem.on('execution:start', (data) => {
      this.startTracking(data.executionId, data.taskId);
    });

    // 监听执行步骤
    this.hookSystem.on('execution:step', (data) => {
      this.recordStep(data.executionId, data.step);
    });

    // 监听执行进度
    this.hookSystem.on('execution:progress', (data) => {
      this.updateProgress(data.executionId, data.progress);
    });

    // 监听执行完成
    this.hookSystem.on('execution:complete', (data) => {
      this.completeTracking(data.executionId, data.result);
    });

    // 监听执行失败
    this.hookSystem.on('execution:failed', (data) => {
      this.failTracking(data.executionId, data.error);
    });

    // 监听 Claude 开始
    this.hookSystem.on('claude:on_start', (data) => {
      if (!this.currentExecution) {
        // 如果没有当前执行，创建一个新的
        const executionId = this.generateExecutionId();
        this.startTracking(executionId);
        this.currentExecution = executionId;
      }
      this.recordStep(this.currentExecution, {
        stepId: this.generateStepId(),
        executionId: this.currentExecution,
        type: 'prompt',
        timestamp: Date.now(),
        data: { prompt: data.prompt, model: data.model },
      });
    });

    // 监听 Claude 工具调用
    this.hookSystem.on('claude:on_tool_use', (data) => {
      if (this.currentExecution) {
        this.recordStep(this.currentExecution, {
          stepId: this.generateStepId(),
          executionId: this.currentExecution,
          type: 'tool_use',
          timestamp: Date.now(),
          data: { toolName: data.toolName, toolInput: data.toolInput },
        });
      }
    });

    // 监听 Claude 完成
    this.hookSystem.on('claude:on_complete', (data) => {
      if (this.currentExecution) {
        this.recordStep(this.currentExecution, {
          stepId: this.generateStepId(),
          executionId: this.currentExecution,
          type: 'response',
          timestamp: Date.now(),
          data: { response: data.response, duration: data.duration },
        });
        this.completeTracking(this.currentExecution, { response: data.response });
        this.currentExecution = null;
      }
    });

    // 监听 Claude 错误
    this.hookSystem.on('claude:on_error', (data) => {
      if (this.currentExecution) {
        this.recordStep(this.currentExecution, {
          stepId: this.generateStepId(),
          executionId: this.currentExecution,
          type: 'error',
          timestamp: Date.now(),
          data: { error: data.error, phase: data.phase },
        });
        this.failTracking(this.currentExecution, data.error);
        this.currentExecution = null;
      }
    });

    // 监听任务进度
    this.hookSystem.on('task:on_progress', (data) => {
      // 查找与任务关联的执行
      const executionId = this.findExecutionByTaskId(data.taskId);
      if (executionId) {
        this.updateProgress(executionId, data.progress);
      }
    });
  }

  // ==========================================================================
  // 追踪方法
  // ==========================================================================

  /**
   * 开始追踪执行
   */
  startTracking(executionId: string, taskId?: string): void {
    const progress: ExecutionProgress = {
      executionId,
      taskId,
      progress: 0,
      status: 'running',
      startedAt: Date.now(),
      stepsCompleted: 0,
    };

    this.executions.set(executionId, progress);
    this.steps.set(executionId, []);

    // 触发 Hook
    this.hookSystem.emit('execution:start', { executionId, taskId: taskId || '' });
  }

  /**
   * 记录执行步骤
   */
  recordStep(executionId: string, step: ExecutionStep): void {
    const steps = this.steps.get(executionId);
    if (!steps) {
      this.steps.set(executionId, []);
    }

    const stepsList = this.steps.get(executionId)!;
    stepsList.push(step);

    // 更新步骤计数
    const progress = this.executions.get(executionId);
    if (progress) {
      progress.stepsCompleted = stepsList.length;
    }

    // 触发 Hook
    this.hookSystem.emit('execution:step', { executionId, step });
  }

  /**
   * 更新进度
   */
  updateProgress(executionId: string, progress: number): void {
    const execProgress = this.executions.get(executionId);
    if (!execProgress) {
      console.warn(`Execution ${executionId} not found for progress update`);
      return;
    }

    execProgress.progress = Math.max(0, Math.min(100, progress));

    // 触发 Hook
    this.hookSystem.emit('execution:progress', { executionId, progress });
  }

  /**
   * 完成追踪
   */
  completeTracking(executionId: string, result: any): void {
    const progress = this.executions.get(executionId);
    if (!progress) return;

    progress.status = 'completed';
    progress.progress = 100;
    progress.completedAt = Date.now();

    // 触发 Hook
    this.hookSystem.emit('execution:complete', { executionId, result });
  }

  /**
   * 标记失败
   */
  failTracking(executionId: string, error: string): void {
    const progress = this.executions.get(executionId);
    if (!progress) return;

    progress.status = 'failed';
    progress.completedAt = Date.now();

    // 记录错误步骤
    this.recordStep(executionId, {
      stepId: this.generateStepId(),
      executionId,
      type: 'error',
      timestamp: Date.now(),
      data: { error },
    });

    // 触发 Hook
    this.hookSystem.emit('execution:failed', { executionId, error });
  }

  // ==========================================================================
  // 查询方法
  // ==========================================================================

  /**
   * 获取执行进度
   */
  getProgress(executionId: string): ExecutionProgress | undefined {
    return this.executions.get(executionId);
  }

  /**
   * 获取执行时间线
   */
  getExecutionTimeline(executionId: string): ExecutionStep[] {
    return this.steps.get(executionId) || [];
  }

  /**
   * 获取执行结果
   */
  getExecutionResult(executionId: string): ExecutionResult | undefined {
    const progress = this.executions.get(executionId);
    const steps = this.steps.get(executionId);

    if (!progress || !steps) {
      return undefined;
    }

    const duration = (progress.completedAt || Date.now()) - progress.startedAt;
    const success = progress.status === 'completed';

    // 提取工具调用
    const toolCalls: Array<{ name: string; input: any; output?: any; duration?: number }> = [];
    for (const step of steps) {
      if (step.type === 'tool_use') {
        toolCalls.push({
          name: step.data.toolName,
          input: step.data.toolInput,
          output: step.data.output,
          duration: step.duration,
        });
      }
    }

    // 计算 token 使用（如果有）
    let tokenUsage;
    const promptStep = steps.find(s => s.type === 'prompt');
    const responseStep = steps.find(s => s.type === 'response');
    if (promptStep?.data?.model || responseStep?.data?.usage) {
      tokenUsage = {
        inputTokens: promptStep?.data?.inputTokens || 0,
        outputTokens: responseStep?.data?.outputTokens || 0,
        totalTokens: (promptStep?.data?.inputTokens || 0) + (responseStep?.data?.outputTokens || 0),
      };
    }

    // 获取错误信息
    const errorStep = steps.find(s => s.type === 'error');
    const error = errorStep?.data?.error;

    return {
      executionId,
      success,
      duration,
      steps,
      tokenUsage,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      error,
    };
  }

  /**
   * 获取执行指标
   */
  getMetrics(): ExecutionMetrics {
    const allExecutions = Array.from(this.executions.values());
    const completed = allExecutions.filter(e => e.status === 'completed');
    const failed = allExecutions.filter(e => e.status === 'failed');

    const totalExecutions = allExecutions.length;
    const successRate = totalExecutions > 0 ? (completed.length / totalExecutions) * 100 : 0;

    // 计算平均时长
    const completedWithTime = completed.filter(e => e.completedAt);
    const averageDuration = completedWithTime.length > 0
      ? completedWithTime.reduce((sum, e) => sum + (e.completedAt! - e.startedAt), 0) / completedWithTime.length
      : 0;

    // 计算平均 token 使用
    let totalTokens = 0;
    let tokenCount = 0;
    for (const [, steps] of this.steps) {
      const responseStep = steps.find(s => s.type === 'response');
      if (responseStep?.data?.usage?.totalTokens) {
        totalTokens += responseStep.data.usage.totalTokens;
        tokenCount++;
      }
    }
    const averageTokenUsage = tokenCount > 0 ? totalTokens / tokenCount : 0;

    // 统计工具使用
    const toolCounts = new Map<string, number>();
    for (const [, steps] of this.steps) {
      for (const step of steps) {
        if (step.type === 'tool_use') {
          const name = step.data.toolName;
          toolCounts.set(name, (toolCounts.get(name) || 0) + 1);
        }
      }
    }
    const mostUsedTools = Array.from(toolCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 最近执行
    const recentExecutions = allExecutions
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 10)
      .map(e => this.getExecutionResult(e.executionId)!)
      .filter(Boolean);

    return {
      totalExecutions,
      successRate,
      averageDuration,
      averageTokenUsage,
      mostUsedTools,
      recentExecutions,
    };
  }

  /**
   * 获取所有活跃执行
   */
  getActiveExecutions(): ExecutionProgress[] {
    return Array.from(this.executions.values()).filter(e => e.status === 'running');
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  private findExecutionByTaskId(taskId: string): string | undefined {
    for (const [executionId, progress] of this.executions) {
      if (progress.taskId === taskId && progress.status === 'running') {
        return executionId;
      }
    }
    return undefined;
  }

  private generateExecutionId(): string {
    return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private generateStepId(): string {
    return `step-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// ============================================================================
// 单例
// ============================================================================

let executionTrackerInstance: ExecutionTracker | null = null;

/**
 * 获取全局 ExecutionTracker 实例
 */
export function getExecutionTracker(db: AIDatabase): ExecutionTracker {
  if (!executionTrackerInstance) {
    executionTrackerInstance = new ExecutionTracker(db);
  }
  return executionTrackerInstance;
}
