/**
 * AI Company v3 - Plan Executor
 *
 * 计划执行器
 *
 * 职责：
 * 1. 执行计划步骤
 * 2. 管理步骤依赖关系
 * 3. 跟踪执行进度
 * 4. 将步骤转换为任务并调度
 * 5. 处理步骤失败和重试
 */

import { EventEmitter } from 'eventemitter3';
import type { Plan, PlanStep, Task, SystemEvent } from './types.js';
import { getScheduler } from './Scheduler.js';
import { generateId } from './utils.js';
import { getDatabase, getDatabaseSync } from './database/index.js';

// ============================================================================
// Types
// ============================================================================

export interface PlanExecutionConfig {
  // 失败重试次数
  maxRetries: number;
  // 步骤执行超时时间（毫秒）
  stepTimeout: number;
  // 是否自动执行下一步
  autoAdvance: boolean;
}

export interface StepExecutionResult {
  stepId: string;
  success: boolean;
  taskId: string;
  startedAt: number;
  completedAt: number;
  error?: string;
}

// ============================================================================
// Plan Executor
// ============================================================================

export class PlanExecutor extends EventEmitter {
  // 正在执行的计划
  private executingPlans = new Map<string, Plan>();

  // 步骤执行历史
  private stepHistory = new Map<string, StepExecutionResult>();

  // 配置
  private config: PlanExecutionConfig;

  // Scheduler 引用
  private scheduler = getScheduler();

  // 数据库（延迟初始化）
  private db?: ReturnType<typeof getDatabaseSync>;

  constructor(config?: Partial<PlanExecutionConfig>) {
    super();

    this.config = {
      maxRetries: 3,
      stepTimeout: 30 * 60 * 1000, // 30 分钟
      autoAdvance: true,
      ...config,
    };

    this.tryInitDatabase();
  }

  /**
   * 尝试初始化数据库
   */
  private tryInitDatabase(): void {
    try {
      this.db = getDatabaseSync();
      this.loadExecutingPlans();
    } catch (error: any) {
      console.log('[PlanExecutor] Database not yet initialized, will load later');
    }
  }

  /**
   * 从数据库加载执行中的计划
   */
  private loadExecutingPlans(): void {
    if (!this.db) return;

    try {
      // 加载状态为 in_progress 的计划
      const plans = this.db.getAllPlans().filter((p: any) => p.status === 'in_progress');

      for (const dbPlan of plans) {
        const steps = this.db.getPlanSteps(dbPlan.id);
        const plan: Plan = {
          id: dbPlan.id,
          goalId: dbPlan.goal_id,
          description: dbPlan.description,
          status: dbPlan.status,
          currentStepIndex: dbPlan.current_step_index,
          steps: steps.map((s: any) => ({
            id: s.id,
            description: s.description,
            status: s.status,
            dependencies: s.dependencies ? JSON.parse(s.dependencies) : undefined,
            taskId: s.task_id,
            estimatedDuration: s.estimated_duration,
          })),
          createdAt: dbPlan.created_at,
          startedAt: dbPlan.started_at,
          completedAt: dbPlan.completed_at,
        };

        this.executingPlans.set(plan.id, plan);
      }

      console.log(`[PlanExecutor] Loaded ${this.executingPlans.size} executing plans from database`);
    } catch (error: any) {
      console.error('[PlanExecutor] Failed to load executing plans:', error.message);
    }
  }

  /**
   * 开始执行计划
   */
  async executePlan(plan: Plan): Promise<void> {
    console.log(`[PlanExecutor] Starting plan: ${plan.id}`);

    // 标记计划为执行中
    plan.status = 'in_progress';
    plan.startedAt = Date.now();

    // 持久化到数据库
    if (this.db) {
      try {
        this.db.updatePlan(plan.id, {
          status: plan.status,
          startedAt: plan.startedAt,
        });
      } catch (error: any) {
        console.error('[PlanExecutor] Failed to update plan status:', error.message);
      }
    }

    // 添加到执行列表
    this.executingPlans.set(plan.id, plan);

    // 发出事件
    this.emit('plan.started', {
      type: 'plan.started',
      timestamp: Date.now(),
      data: { planId: plan.id },
    } as SystemEvent);

    // 开始执行第一个可执行的步骤
    if (this.config.autoAdvance) {
      await this.advancePlan(plan);
    }
  }

  /**
   * 推进计划执行
   *
   * 查找下一个可执行的步骤（无依赖或依赖已完成）并执行
   */
  async advancePlan(plan: Plan): Promise<void> {
    console.log(`[PlanExecutor] Advancing plan: ${plan.id}`);

    // 查找可执行的步骤
    const executableSteps = this.findExecutableSteps(plan);

    if (executableSteps.length === 0) {
      // 没有可执行的步骤，检查是否完成
      if (this.isPlanComplete(plan)) {
        await this.completePlan(plan);
      } else {
        console.log(`[PlanExecutor] No executable steps for plan ${plan.id}, waiting...`);
      }
      return;
    }

    // 执行所有可执行的步骤
    for (const step of executableSteps) {
      await this.executeStep(plan, step);
    }
  }

  /**
   * 查找可执行的步骤
   *
   * 条件：状态为 pending 且所有依赖已完成
   */
  private findExecutableSteps(plan: Plan): PlanStep[] {
    return plan.steps.filter(step => {
      // 必须是待执行状态
      if (step.status !== 'pending') {
        return false;
      }

      // 检查依赖是否完成
      if (step.dependencies && step.dependencies.length > 0) {
        const allDepsCompleted = step.dependencies.every(depId => {
          const depStep = plan.steps.find(s => s.id === depId);
          return depStep?.status === 'completed';
        });
        return allDepsCompleted;
      }

      return true;
    });
  }

  /**
   * 执行单个步骤
   */
  async executeStep(plan: Plan, step: PlanStep): Promise<void> {
    console.log(`[PlanExecutor] Executing step: ${step.id} - ${step.description}`);

    // 更新步骤状态
    step.status = 'in_progress';

    // 持久化步骤状态
    if (this.db) {
      try {
        this.db.updatePlanStep(step.id, { status: step.status });
      } catch (error: any) {
        console.error('[PlanExecutor] Failed to update step status:', error.message);
      }
    }

    // 创建任务
    const taskId = generateId('task');
    const task: Task = {
      id: taskId,
      planId: plan.id,
      goalId: plan.goalId,
      description: step.description,
      requiredCapabilities: [], // TODO: 从步骤中提取
      status: 'pending',
      priority: 'medium',
      input: undefined,
      createdAt: Date.now(),
    };

    // 关联任务到步骤
    step.taskId = taskId;

    // 持久化任务关联
    if (this.db) {
      try {
        this.db.updatePlanStep(step.id, { taskId });
        this.db.insertTask({
          id: task.id,
          planId: task.planId,
          goalId: task.goalId,
          description: task.description,
          requiredCapabilities: task.requiredCapabilities,
          status: task.status,
          priority: task.priority,
          input: task.input,
          createdAt: task.createdAt,
        });
      } catch (error: any) {
        console.error('[PlanExecutor] Failed to persist task:', error.message);
      }
    }

    // 调度任务
    this.scheduler.schedule(task, task.priority);

    // 发出事件
    this.emit('step.started', {
      type: 'step.started',
      timestamp: Date.now(),
      data: { planId: plan.id, stepId: step.id, taskId },
    } as SystemEvent);

    console.log(`[PlanExecutor] Step ${step.id} scheduled as task ${taskId}`);
  }

  /**
   * 处理任务完成事件
   *
   * 由 Scheduler 调用，当步骤关联的任务完成时
   */
  async handleTaskCompleted(taskId: string, result: { success: boolean; error?: string }): Promise<void> {
    // 查找关联的步骤
    let stepId: string | undefined;
    let planId: string | undefined;

    for (const plan of this.executingPlans.values()) {
      const step = plan.steps.find(s => s.taskId === taskId);
      if (step) {
        stepId = step.id;
        planId = plan.id;
        break;
      }
    }

    if (!stepId || !planId) {
      console.warn(`[PlanExecutor] Task ${taskId} not associated with any step`);
      return;
    }

    const plan = this.executingPlans.get(planId);
    if (!plan) {
      console.warn(`[PlanExecutor] Plan ${planId} not found`);
      return;
    }

    const step = plan.steps.find(s => s.id === stepId);
    if (!step) {
      console.warn(`[PlanExecutor] Step ${stepId} not found in plan ${planId}`);
      return;
    }

    // 记录执行历史
    const executionResult: StepExecutionResult = {
      stepId,
      success: result.success,
      taskId,
      startedAt: step.taskId ? Date.now() : Date.now(), // TODO: 从任务获取实际开始时间
      completedAt: Date.now(),
      error: result.error,
    };

    this.stepHistory.set(stepId, executionResult);

    // 更新步骤状态
    step.status = result.success ? 'completed' : 'failed';

    // 持久化步骤状态
    if (this.db) {
      try {
        this.db.updatePlanStep(stepId, { status: step.status });
      } catch (error: any) {
        console.error('[PlanExecutor] Failed to update step status:', error.message);
      }
    }

    // 发出事件
    this.emit(result.success ? 'step.completed' : 'step.failed', {
      type: result.success ? 'step.completed' : 'step.failed',
      timestamp: Date.now(),
      data: { planId, stepId, taskId, error: result.error },
    } as SystemEvent);

    // 如果步骤失败，检查是否需要停止计划
    if (!result.success) {
      console.error(`[PlanExecutor] Step ${stepId} failed: ${result.error}`);
      // TODO: 根据配置决定是否继续执行其他步骤
    }

    // 自动推进计划
    if (this.config.autoAdvance) {
      await this.advancePlan(plan);
    }
  }

  /**
   * 检查计划是否完成
   */
  private isPlanComplete(plan: Plan): boolean {
    return plan.steps.every(step => step.status === 'completed');
  }

  /**
   * 完成计划
   */
  async completePlan(plan: Plan): Promise<void> {
    console.log(`[PlanExecutor] Completing plan: ${plan.id}`);

    plan.status = 'completed';
    plan.completedAt = Date.now();

    // 持久化到数据库
    if (this.db) {
      try {
        this.db.updatePlan(plan.id, {
          status: plan.status,
          completedAt: plan.completedAt,
        });
      } catch (error: any) {
        console.error('[PlanExecutor] Failed to update plan status:', error.message);
      }
    }

    // 从执行列表移除
    this.executingPlans.delete(plan.id);

    // 发出事件
    this.emit('plan.completed', {
      type: 'plan.completed',
      timestamp: Date.now(),
      data: { planId: plan.id },
    } as SystemEvent);

    console.log(`[PlanExecutor] Plan ${plan.id} completed`);
  }

  /**
   * 获取计划执行状态
   */
  getPlanStatus(planId: string): {
    executing: boolean;
    currentStep?: PlanStep;
    completedSteps: number;
    totalSteps: number;
    progress: number;
  } | null {
    const plan = this.executingPlans.get(planId);
    if (!plan) {
      return null;
    }

    const completedSteps = plan.steps.filter(s => s.status === 'completed').length;
    const totalSteps = plan.steps.length;
    const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

    // 找到当前正在执行的步骤
    const currentStep = plan.steps.find(s => s.status === 'in_progress');

    return {
      executing: true,
      currentStep,
      completedSteps,
      totalSteps,
      progress,
    };
  }

  /**
   * 获取步骤执行历史
   */
  getStepHistory(stepId: string): StepExecutionResult | undefined {
    return this.stepHistory.get(stepId);
  }

  /**
   * 暂停计划执行
   */
  pausePlan(planId: string): void {
    const plan = this.executingPlans.get(planId);
    if (plan) {
      plan.status = 'pending';
      console.log(`[PlanExecutor] Plan ${planId} paused`);
    }
  }

  /**
   * 恢复计划执行
   */
  async resumePlan(planId: string): Promise<void> {
    const plan = this.executingPlans.get(planId);
    if (plan && plan.status === 'pending') {
      plan.status = 'in_progress';
      console.log(`[PlanExecutor] Plan ${planId} resumed`);

      if (this.config.autoAdvance) {
        await this.advancePlan(plan);
      }
    }
  }

  /**
   * 取消计划执行
   */
  async cancelPlan(planId: string): Promise<void> {
    const plan = this.executingPlans.get(planId);
    if (plan) {
      plan.status = 'failed';

      if (this.db) {
        try {
          this.db.updatePlan(plan.id, { status: 'failed' });
        } catch (error: any) {
          console.error('[PlanExecutor] Failed to update plan status:', error.message);
        }
      }

      this.executingPlans.delete(planId);

      this.emit('plan.cancelled', {
        type: 'plan.cancelled',
        timestamp: Date.now(),
        data: { planId },
      } as SystemEvent);

      console.log(`[PlanExecutor] Plan ${planId} cancelled`);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let planExecutorInstance: PlanExecutor | null = null;

export function getPlanExecutor(): PlanExecutor {
  if (!planExecutorInstance) {
    planExecutorInstance = new PlanExecutor();
  }
  return planExecutorInstance;
}

export function resetPlanExecutor(): void {
  planExecutorInstance = null;
}
