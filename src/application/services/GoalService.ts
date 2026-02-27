/**
 * AI Company - Goal Service
 *
 * 目标管理服务：管理长期目标和短期目标
 * - 目标创建与分解
 * - 目标进度追踪
 * - 目标-任务关联
 * - 目标状态管理
 */

import type {
  Goal,
  GoalPlan,
  CreateGoalInput,
  GoalStatus,
  GoalPlanStatus,
  Task,
} from '../../types/index.js';
import type { AIDatabase } from '../../infrastructure/database/index.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 目标类型 */
export type GoalType = 'long_term' | 'short_term';

/** 目标进度 */
export interface GoalProgress {
  goalId: string;
  goalTitle: string;
  completionPercentage: number; // 0-100
  status: GoalStatus;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  failedTasks: number;
  subGoalsProgress?: Array<{ subGoalId: string; title: string; progress: number }>;
}

/** 目标分解输入 */
export interface GoalDecompositionInput {
  parentGoalId: string;
  subGoals: Array<{
    title: string;
    description?: string;
    due_date?: number;
    acceptance_criteria?: string;
  }>;
}

/** 目标-任务关联输入 */
export interface GoalTaskLinkInput {
  goalId: string;
  taskIds: string[];
}

/** 目标创建输入（扩展） */
export interface ExtendedCreateGoalInput extends CreateGoalInput {
  type: GoalType;
  ownerId?: string;
}

// ============================================================================
// GoalService
// ============================================================================

export class GoalService {
  constructor(private db: AIDatabase) {}

  // ==========================================================================
  // 目标创建
  // ==========================================================================

  /**
   * 创建目标
   */
  createGoal(input: ExtendedCreateGoalInput): Goal {
    // 验证必需字段
    if (!input.title) {
      throw new Error('目标标题不能为空');
    }
    if (!input.type || !['long_term', 'short_term'].includes(input.type)) {
      throw new Error('目标类型必须是 long_term 或 short_term');
    }

    // 长期目标必须有验收标准
    if (input.type === 'long_term' && !input.acceptance_criteria) {
      throw new Error('长期目标必须包含验收标准');
    }

    return this.db.createGoal(input);
  }

  /**
   * 创建长期目标
   */
  createLongTermGoal(input: Omit<ExtendedCreateGoalInput, 'type'>): Goal {
    return this.createGoal({ ...input, type: 'long_term' });
  }

  /**
   * 创建短期目标
   */
  createShortTermGoal(input: Omit<ExtendedCreateGoalInput, 'type'>): Goal {
    return this.createGoal({ ...input, type: 'short_term' });
  }

  // ==========================================================================
  // 目标分解
  // ==========================================================================

  /**
   * 将长期目标分解为短期目标
   */
  decomposeGoal(input: GoalDecompositionInput): Goal[] {
    const parentGoal = this.db.getGoal(input.parentGoalId);
    if (!parentGoal) {
      throw new Error(`父目标 ${input.parentGoalId} 不存在`);
    }

    if (parentGoal.type !== 'long_term') {
      throw new Error('只有长期目标可以被分解');
    }

    const subGoals: Goal[] = [];

    for (const subGoalInput of input.subGoals) {
      const subGoal = this.createShortTermGoal({
        title: subGoalInput.title,
        description: subGoalInput.description,
        parent_goal_id: input.parentGoalId,
        due_date: subGoalInput.due_date || parentGoal.due_date,
        acceptance_criteria: subGoalInput.acceptance_criteria,
        status: 'pending_owner',
      });
      subGoals.push(subGoal);
    }

    // 更新父目标状态为 planning（表示已开始分解）
    this.db.updateGoalStatus(input.parentGoalId, 'planning');

    return subGoals;
  }

  /**
   * 获取目标的所有子目标
   */
  getSubGoals(parentGoalId: string): Goal[] {
    const allGoals = this.db.getAllGoals ? this.db.getAllGoals() : [];
    return allGoals.filter(g => g.parent_goal_id === parentGoalId);
  }

  /**
   * 获取目标层级结构（包含所有子目标）
   */
  getGoalHierarchy(goalId: string): {
    goal: Goal;
    subGoals: Goal[];
  } | null {
    const goal = this.db.getGoal(goalId);
    if (!goal) return null;

    const subGoals = this.getSubGoals(goalId);

    return {
      goal,
      subGoals,
    };
  }

  // ==========================================================================
  // 目标进度追踪
  // ==========================================================================

  /**
   * 计算目标进度
   */
  calculateGoalProgress(goalId: string): GoalProgress {
    const goal = this.db.getGoal(goalId);
    if (!goal) {
      throw new Error(`目标 ${goalId} 不存在`);
    }

    // 获取关联的任务
    const relatedTasks = this.getRelatedTasks(goalId);

    // 统计任务状态
    const totalTasks = relatedTasks.length;
    const completedTasks = relatedTasks.filter(t => t.status === 'completed').length;
    const inProgressTasks = relatedTasks.filter(t =>
      ['executing', 'in_progress', 'planning', 'dispatched'].includes(t.status)
    ).length;
    const pendingTasks = relatedTasks.filter(t =>
      ['pending', 'pending_owner', 'assigned'].includes(t.status)
    ).length;
    const failedTasks = relatedTasks.filter(t => t.status === 'failed').length;

    // 计算完成度
    let completionPercentage = 0;
    if (totalTasks > 0) {
      completionPercentage = Math.round((completedTasks / totalTasks) * 100);
    }

    // 获取子目标进度
    const subGoals = this.getSubGoals(goalId);
    const subGoalsProgress: Array<{ subGoalId: string; title: string; progress: number }> = [];

    for (const subGoal of subGoals) {
      const subProgress = this.calculateGoalProgress(subGoal.id);
      subGoalsProgress.push({
        subGoalId: subGoal.id,
        title: subGoal.title,
        progress: subProgress.completionPercentage,
      });
    }

    // 如果有子目标，综合计算进度
    if (subGoals.length > 0) {
      const subGoalsAvgProgress = subGoalsProgress.reduce((sum, sp) => sum + sp.progress, 0) / subGoals.length;
      // 综合任务进度和子目标进度（各占 50%）
      completionPercentage = Math.round((completionPercentage + subGoalsAvgProgress) / 2);
    }

    return {
      goalId,
      goalTitle: goal.title,
      completionPercentage,
      status: goal.status,
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      failedTasks,
      subGoalsProgress: subGoalsProgress.length > 0 ? subGoalsProgress : undefined,
    };
  }

  /**
   * 更新目标进度（自动更新状态）
   */
  updateGoalProgress(goalId: string): GoalProgress {
    const progress = this.calculateGoalProgress(goalId);

    // 根据进度自动更新目标状态
    let newStatus: GoalStatus | null = null;

    if (progress.completionPercentage === 100) {
      newStatus = 'completed';
    } else if (progress.completionPercentage > 0) {
      newStatus = 'in_progress';
    }

    if (newStatus) {
      this.db.updateGoalStatus(goalId, newStatus);
    }

    return progress;
  }

  // ==========================================================================
  // 目标-任务关联
  // ==========================================================================

  /**
   * 将任务关联到目标
   * 注意：需要在任务表中添加 goal_id 字段，或使用关联表
   * 当前实现使用 context_json 存储 goal_id
   */
  linkTasksToGoal(input: GoalTaskLinkInput): void {
    const goal = this.db.getGoal(input.goalId);
    if (!goal) {
      throw new Error(`目标 ${input.goalId} 不存在`);
    }

    for (const taskId of input.taskIds) {
      const task = this.db.getTask(taskId);
      if (!task) {
        console.warn(`任务 ${taskId} 不存在，跳过`);
        continue;
      }

      // 将 goal_id 存储在 context_json 中
      const context = task.context_json ? JSON.parse(task.context_json) : {};
      context.goal_id = input.goalId;

      this.db.updateTaskFields(taskId, {
        description: task.description, // 保持不变
      });

      // 由于 updateTaskFields 不支持 context_json，需要直接更新
      this.db.prepare(`
        UPDATE tasks SET context_json = ? WHERE id = ?
      `).run(JSON.stringify(context), taskId);
    }

    // 更新目标进度
    this.updateGoalProgress(input.goalId);
  }

  /**
   * 获取目标关联的所有任务
   */
  getRelatedTasks(goalId: string): Task[] {
    // 查询所有任务，筛选 context_json 中包含 goal_id 的
    const allTasks = this.db.getAllTasks();
    return allTasks.filter(task => {
      if (!task.context_json) return false;
      try {
        const context = JSON.parse(task.context_json);
        return context.goal_id === goalId;
      } catch {
        return false;
      }
    });
  }

  // ==========================================================================
  // 查询方法
  // ==========================================================================

  /**
   * 根据 ID 获取目标
   */
  getGoalById(id: string): Goal | null {
    return this.db.getGoal(id) || null;
  }

  /**
   * 根据类型获取目标
   */
  getGoalsByType(type: GoalType): Goal[] {
    const allGoals = this.db.getAllGoals ? this.db.getAllGoals() : [];
    return allGoals.filter(g => g.type === type);
  }

  /**
   * 获取所有活跃目标（未完成）
   */
  getActiveGoals(): Goal[] {
    const allGoals = this.db.getAllGoals ? this.db.getAllGoals() : [];
    return allGoals.filter(g =>
      !['completed', 'rejected'].includes(g.status)
    );
  }

  /**
   * 根据状态获取目标
   */
  getGoalsByStatus(status: GoalStatus): Goal[] {
    return this.db.getGoalsByStatus(status);
  }

  /**
   * 获取所有长期目标
   */
  getLongTermGoals(): Goal[] {
    return this.getGoalsByType('long_term');
  }

  /**
   * 获取所有短期目标
   */
  getShortTermGoals(): Goal[] {
    return this.getGoalsByType('short_term');
  }

  // ==========================================================================
  // 目标计划管理
  // ==========================================================================

  /**
   * 创建目标计划
   */
  createGoalPlan(
    goalId: string,
    content: string,
    version: number = 1,
    status: GoalPlanStatus = 'pending_owner'
  ): GoalPlan {
    const goal = this.db.getGoal(goalId);
    if (!goal) {
      throw new Error(`目标 ${goalId} 不存在`);
    }

    return this.db.createGoalPlan(goalId, content, version, status);
  }

  /**
   * 获取目标的所有计划
   */
  getGoalPlans(goalId: string): GoalPlan[] {
    return this.db.getGoalPlans(goalId);
  }

  /**
   * 获取目标的最新计划
   */
  getLatestGoalPlan(goalId: string): GoalPlan | null {
    const plans = this.db.getGoalPlans(goalId);
    return plans.length > 0 ? plans[0] : null;
  }

  /**
   * 更新目标计划状态
   */
  updateGoalPlanStatus(
    planId: string,
    status: GoalPlanStatus,
    ownerFeedback?: string
  ): void {
    this.db.updateGoalPlanStatus(planId, status, ownerFeedback);
  }

  // ==========================================================================
  // 目标状态管理
  // ==========================================================================

  /**
   * 更新目标状态
   */
  updateGoalStatus(goalId: string, status: GoalStatus): void {
    this.db.updateGoalStatus(goalId, status);
  }

  /**
   * 更新目标字段
   */
  updateGoalFields(
    goalId: string,
    fields: Partial<Pick<Goal, 'title' | 'description' | 'due_date' | 'acceptance_criteria' | 'owner_id' | 'owner_feedback'>>
  ): void {
    this.db.updateGoalFields(goalId, fields);
  }

  /**
   * 完成目标
   */
  completeGoal(goalId: string): void {
    this.updateGoalStatus(goalId, 'completed');
    // 同时更新所有子目标为完成
    const subGoals = this.getSubGoals(goalId);
    for (const subGoal of subGoals) {
      if (subGoal.status !== 'completed') {
        this.updateGoalStatus(subGoal.id, 'completed');
      }
    }
  }

  /**
   * 拒绝目标
   */
  rejectGoal(goalId: string, reason: string): void {
    this.updateGoalFields(goalId, { owner_feedback: reason });
    this.updateGoalStatus(goalId, 'rejected');
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

// 扩展 AIDatabase 接口以支持 getAllGoals
declare module '../../infrastructure/database/index.js' {
  interface AIDatabase {
    getAllGoals(): Goal[];
  }
}
