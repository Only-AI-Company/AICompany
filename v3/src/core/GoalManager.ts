/**
 * AI Company v3 - Goal Manager
 *
 * 目标管理系统
 *
 * 职责：
 * 1. 存储和管理目标
 * 2. 将长期目标拆解为短期目标
 * 3. 为目标创建执行计划
 * 4. 追踪目标进度
 * 5. 持久化到数据库
 */

import { EventEmitter } from 'eventemitter3';
import type { Goal, Plan, Task, GoalProgress, SystemEvent } from './types.js';
import { getCEO } from './CEO.js';
import { generateId } from './utils.js';
import { getDatabase, getDatabaseSync } from './database/index.js';
import { getPlanExecutor } from './PlanExecutor.js';

// ============================================================================
// Goal Manager
// ============================================================================

export class GoalManager extends EventEmitter {
  // 内存缓存（用于快速访问）
  private goals: Map<string, Goal> = new Map();

  // 计划缓存
  private plans: Map<string, Plan> = new Map();

  // CEO 引用
  private ceo = getCEO();

  // 数据库（延迟初始化）
  private db?: ReturnType<typeof getDatabaseSync>;

  constructor() {
    super();
    this.tryLoadFromDatabase();
  }

  /**
   * 尝试从数据库加载（静默失败）
   */
  private tryLoadFromDatabase(): void {
    try {
      this.db = getDatabaseSync();
      this.loadFromDatabase();
    } catch (error: any) {
      // Database not initialized yet, will load later
      console.log('[GoalManager] Database not yet initialized, will load later');
    }
  }

  /**
   * 从数据库加载目标和计划
   */
  private loadFromDatabase(): void {
    if (!this.db) return;

    try {
      // 加载活跃目标
      const dbGoals = this.db.getActiveGoals();
      for (const dbGoal of dbGoals) {
        const goal: Goal = {
          id: dbGoal.id,
          description: dbGoal.description,
          timeframe: dbGoal.timeframe,
          status: dbGoal.status,
          parentGoalId: dbGoal.parent_goal_id,
          progress: dbGoal.progress,
          createdAt: dbGoal.created_at,
          completedAt: dbGoal.completed_at,
        };
        this.goals.set(goal.id, goal);

        // 加载关联的计划
        const dbPlan = this.db.getPlan(dbGoal.id);
        if (dbPlan) {
          const dbSteps = this.db.getPlanSteps(dbPlan.id);
          const plan: Plan = {
            id: dbPlan.id,
            goalId: dbPlan.goal_id,
            description: dbPlan.description,
            steps: dbSteps.map((s: any) => ({
              id: s.id,
              description: s.description,
              status: s.status,
              dependencies: s.dependencies ? JSON.parse(s.dependencies) : undefined,
              taskId: s.task_id,
              estimatedDuration: s.estimated_duration,
            })),
            status: dbPlan.status,
            currentStepIndex: dbPlan.current_step_index,
            createdAt: dbPlan.created_at,
            startedAt: dbPlan.started_at,
            completedAt: dbPlan.completed_at,
          };
          this.plans.set(plan.id, plan);
          goal.plan = plan;
        }
      }

      console.log(`[GoalManager] Loaded ${this.goals.size} goals from database`);
    } catch (error: any) {
      console.error('[GoalManager] Failed to load from database:', error.message);
    }
  }

  /**
   * 设置目标
   */
  async setGoal(description: string, timeframe: string): Promise<Goal> {
    const goal: Goal = {
      id: generateId('goal'),
      description,
      timeframe,
      status: 'active',
      createdAt: Date.now(),
      progress: 0,
    };

    // 存储到内存
    this.goals.set(goal.id, goal);

    // 持久化到数据库
    if (this.db) {
      try {
        this.db.insertGoal({
          id: goal.id,
          description: goal.description,
          timeframe: goal.timeframe,
          status: goal.status,
          parentGoalId: goal.parentGoalId,
          progress: goal.progress,
          createdAt: goal.createdAt,
        });
        console.log('[GoalManager] Goal persisted to database');
      } catch (error: any) {
        console.error('[GoalManager] Failed to persist goal:', error.message);
      }
    }

    // 发出事件
    this.emit('goal.created', {
      type: 'goal.created',
      timestamp: Date.now(),
      data: { goal },
    } as SystemEvent);

    console.log(`[GoalManager] Goal created: ${description}`);

    // 自动拆解目标
    await this.decomposeGoal(goal);

    return goal;
  }

  /**
   * 拆解目标
   *
   * 长期目标 → 短期目标 → 执行计划
   */
  async decomposeGoal(goal: Goal): Promise<void> {
    console.log(`[GoalManager] Decomposing goal: ${goal.description}`);

    // 调用 CEO 拆解目标
    const plan = await this.ceo.decomposeGoal(goal);

    // 存储到内存
    this.plans.set(plan.id, plan);
    goal.plan = plan;

    // 持久化到数据库
    if (this.db) {
      try {
        this.db.insertPlan({
          id: plan.id,
          goalId: plan.goalId,
          description: plan.description,
          status: plan.status,
          currentStepIndex: plan.currentStepIndex,
          createdAt: plan.createdAt,
        });

        // 持久化步骤
        for (const step of plan.steps) {
          this.db.insertPlanStep({
            id: step.id,
            planId: plan.id,
            description: step.description,
            status: step.status,
            dependencies: step.dependencies,
            taskId: step.taskId,
            estimatedDuration: step.estimatedDuration,
            createdAt: plan.createdAt,
          });
        }

        console.log('[GoalManager] Plan persisted to database');
      } catch (error: any) {
        console.error('[GoalManager] Failed to persist plan:', error.message);
      }
    }

    // 发出事件
    this.emit('goal.decomposed', {
      type: 'goal.decomposed',
      timestamp: Date.now(),
      data: { goalId: goal.id, plan },
    } as SystemEvent);

    console.log(`[GoalManager] Goal decomposed into ${plan.steps.length} steps`);

    // 自动开始执行计划
    try {
      const planExecutor = getPlanExecutor();
      await planExecutor.executePlan(plan);
    } catch (error: any) {
      console.error('[GoalManager] Failed to start plan execution:', error.message);
    }
  }

  /**
   * 获取目标进度
   */
  getProgress(goalId: string): GoalProgress | null {
    const goal = this.goals.get(goalId);
    if (!goal) {
      return null;
    }

    const plan = goal.plan;
    if (!plan) {
      return {
        goalId,
        description: goal.description,
        progress: goal.progress || 0,
        status: goal.status,
        completedSteps: 0,
        totalSteps: 0,
        blockers: [],
      };
    }

    const completedSteps = plan.steps.filter(s => s.status === 'completed').length;

    return {
      goalId,
      description: goal.description,
      progress: goal.progress || 0,
      status: goal.status,
      completedSteps,
      totalSteps: plan.steps.length,
      blockers: this.getBlockers(goal),
    };
  }

  /**
   * 更新目标进度
   */
  updateProgress(goalId: string, progress: number): void {
    const goal = this.goals.get(goalId);
    if (goal) {
      goal.progress = Math.max(0, Math.min(100, progress));

      // 检查是否完成
      if (goal.progress >= 100 && goal.status === 'active') {
        goal.status = 'completed';
        goal.completedAt = Date.now();

        this.emit('goal.completed', {
          type: 'goal.completed',
          timestamp: Date.now(),
          data: { goal },
        } as SystemEvent);

        console.log(`[GoalManager] Goal completed: ${goal.description}`);
      }

      // 持久化到数据库
      if (this.db) {
        try {
          this.db.updateGoal(goalId, {
            progress: goal.progress,
            status: goal.status,
            completedAt: goal.completedAt,
          });
        } catch (error: any) {
          console.error('[GoalManager] Failed to update goal progress:', error.message);
        }
      }
    }
  }

  /**
   * 获取所有活跃目标
   */
  getActiveGoals(): Goal[] {
    return Array.from(this.goals.values()).filter(g => g.status === 'active');
  }

  /**
   * 获取目标
   */
  getGoal(goalId: string): Goal | undefined {
    return this.goals.get(goalId);
  }

  /**
   * 获取计划
   */
  getPlan(planId: string): Plan | undefined {
    return this.plans.get(planId);
  }

  /**
   * 更新步骤状态
   */
  updateStepStatus(planId: string, stepId: string, status: 'pending' | 'in_progress' | 'completed' | 'failed'): void {
    const plan = this.plans.get(planId);
    if (plan) {
      const step = plan.steps.find(s => s.id === stepId);
      if (step) {
        step.status = status;

        // 持久化步骤状态
        if (this.db) {
          try {
            this.db.updatePlanStep(stepId, { status });
          } catch (error: any) {
            console.error('[GoalManager] Failed to update step status:', error.message);
          }
        }

        // 如果步骤完成，检查是否所有步骤都完成
        if (status === 'completed') {
          const allCompleted = plan.steps.every(s => s.status === 'completed');
          if (allCompleted && plan.status !== 'completed') {
            plan.status = 'completed';
            plan.completedAt = Date.now();

            // 持久化计划状态
            if (this.db) {
              try {
                this.db.updatePlan(planId, {
                  status: plan.status,
                  completedAt: plan.completedAt,
                });
              } catch (error: any) {
                console.error('[GoalManager] Failed to update plan status:', error.message);
              }
            }

            // 更新关联目标的进度
            if (plan.goalId) {
              this.updateProgress(plan.goalId, 100);
            }
          }
        }
      }
    }
  }

  /**
   * 检查并拆解新目标
   */
  async checkAndDecompose(): Promise<void> {
    const activeGoals = this.getActiveGoals();

    for (const goal of activeGoals) {
      // 如果目标没有计划，创建计划
      if (!goal.plan) {
        await this.decomposeGoal(goal);
      }
    }
  }

  /**
   * 获取阻塞因素
   */
  private getBlockers(goal: Goal): string[] {
    const blockers: string[] = [];

    if (goal.plan) {
      for (const step of goal.plan.steps) {
        if (step.status === 'failed') {
          blockers.push(`步骤失败: ${step.description}`);
        }
      }
    }

    return blockers;
  }

  /**
   * 提取文本内容（辅助函数）
   */
  private extractText(content: string | any[]): string {
    if (typeof content === 'string') {
      return content;
    }
    // 假设是内容块数组
    const textBlocks = content.filter((b: any) => b.type === 'text');
    return textBlocks.map((b: any) => b.text).join('');
  }
}

// ============================================================================
// Singleton
// ============================================================================

let goalManagerInstance: GoalManager | null = null;

export function getGoalManager(): GoalManager {
  if (!goalManagerInstance) {
    goalManagerInstance = new GoalManager();
  }
  return goalManagerInstance;
}

export function resetGoalManager(): void {
  goalManagerInstance = null;
}
