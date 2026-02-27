/**
 * AI Company v2 - 目标管理
 *
 * 处理目标的创建、计划生成、进度跟踪
 */
import type { Goal, GoalType, GoalPlan, GoalStatus } from '../types.js';
import { getEventBus } from './Event.js';
import { EventType } from '../types.js';
import { getDatabase } from '../db/Database.js';
import { getAIProvider } from '../ai/AI.js';
import { getExecutionEngine } from './Execute.js';

/**
 * 目标管理器
 */
export class GoalManager {
  /**
   * 创建目标
   */
  async createGoal(input: {
    type: GoalType;
    title: string;
    description?: string;
    acceptanceCriteria?: string;
    dueDate?: number;
    parentGoalId?: string;
    recurring?: {
      frequency: 'daily' | 'weekly' | 'monthly';
      time?: string;
      autoRenew?: boolean;
    };
    ownerId?: string;
  }): Promise<Goal> {
    const goalId = this.generateId();
    const now = Date.now();

    const goal: Goal = {
      id: goalId,
      type: input.type,
      title: input.title,
      description: input.description,
      acceptanceCriteria: input.acceptanceCriteria,
      status: 'pending',
      dueDate: input.dueDate,
      parentGoalId: input.parentGoalId,
      recurring: input.recurring ? JSON.stringify(input.recurring) : undefined,
      ownerId: input.ownerId,
      createdAt: now,
      updatedAt: now,
    };

    // 保存到数据库
    const db = getDatabase();
    db.createGoal(goal);

    // 发布事件
    getEventBus().emit(EventType.GOAL_CREATED, {
      goal,
      source: input.ownerId || 'system',
    });

    console.log(`[Goal] Created goal: ${goal.title} (${goal.type})`);

    // 如果是循环目标，自动创建 Cron
    if (input.recurring) {
      await this.setupRecurringGoal(goal, input.recurring);
    }

    return goal;
  }

  /**
   * 设置循环目标
   */
  private async setupRecurringGoal(goal: Goal, recurring: {
    frequency: 'daily' | 'weekly' | 'monthly';
    time?: string;
    autoRenew?: boolean;
  }): Promise<void> {
    const db = getDatabase();

    // 生成 cron 表达式
    const cronRule = this.generateCronRule(recurring);

    // 创建 Cron 任务
    const cronId = this.generateId();
    db.createCron({
      id: cronId,
      name: `循环目标: ${goal.title}`,
      description: goal.description,
      command: `ai:执行目标 ${goal.id}`,
      cronRule,
      goalId: goal.id,
    });

    // 关联目标和 Cron
    db.linkGoalToCron(goal.id, cronId);

    console.log(`[Goal] Set up recurring schedule: ${cronRule}`);

    // 发布 Cron 创建事件
    getEventBus().emit(EventType.CRON_CREATED, {
      cronId,
      goalId: goal.id,
      cronRule,
    });
  }

  /**
   * 生成 cron 表达式
   */
  private generateCronRule(recurring: {
    frequency: 'daily' | 'weekly' | 'monthly';
    time?: string;
  }): string {
    // 默认时间 09:00
    let hour = 9;
    let minute = 0;

    if (recurring.time) {
      // 处理各种时间格式: "09:00", "9:00", "9点", "09点"
      const timeStr = recurring.time.replace(/点/g, ':');
      const parts = timeStr.split(':');
      if (parts.length >= 1) {
        const h = parseInt(parts[0], 10);
        if (!isNaN(h) && h >= 0 && h <= 23) hour = h;
      }
      if (parts.length >= 2) {
        const m = parseInt(parts[1], 10);
        if (!isNaN(m) && m >= 0 && m <= 59) minute = m;
      }
    }

    switch (recurring.frequency) {
      case 'daily':
        return `${minute} ${hour} * * *`;
      case 'weekly':
        return `${minute} ${hour} * * 1`; // 每周一
      case 'monthly':
        return `${minute} ${hour} 1 * *`; // 每月1号
      default:
        return `${minute} ${hour} * * *`;
    }
  }

  /**
   * 生成目标计划
   */
  async generatePlan(goalId: string): Promise<GoalPlan> {
    const db = getDatabase();
    const goal = db.getGoal(goalId);

    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    console.log(`[Goal] Generating plan for: ${goal.title}`);

    const ai = await getAIProvider();

    const prompt = `请将以下目标分解为可执行的步骤计划：

目标类型：${goal.type}
目标标题：${goal.title}
目标描述：${goal.description || '无'}
验收标准：${goal.acceptanceCriteria || '无'}

要求：
1. 将目标分解为 3-7 个具体步骤
2. 每个步骤要有清晰的名称和说明
3. 估算每个步骤的预计时间（分钟）
4. 步骤要具体可执行
5. 对于技术目标，要明确需要调用的工具或API

返回 JSON 格式：
{
  "steps": [
    {
      "id": "step-1",
      "name": "步骤名称",
      "description": "详细说明",
      "estimatedMinutes": 30,
      "tool": "工具名称(可选)"
    }
  ],
  "totalEstimatedMinutes": 总预计分钟数,
  "prerequisites": ["前置条件(可选)"]
}`;

    const response = await ai.generate(prompt, {
      temperature: 0.5,
      maxTokens: 2000,
    });

    let plan: GoalPlan;
    try {
      plan = JSON.parse(response);
    } catch (error) {
      console.error('[Goal] Failed to parse AI plan response:', response.substring(0, 500));
      throw new Error(`Invalid JSON from AI: ${(error as Error).message}`);
    }

    // 验证 JSON 结构
    if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      console.error('[Goal] Invalid plan structure:', plan);
      throw new Error('AI response missing required "steps" array');
    }

    // 保存计划
    db.createGoalPlan({
      id: this.generateId(),
      goalId,
      content: plan,
    });

    // 发布计划创建事件
    getEventBus().emit(EventType.GOAL_PLAN_CREATED, {
      goalId,
      plan,
    });

    console.log(`[Goal] Plan generated with ${plan.steps.length} steps`);

    return plan;
  }

  /**
   * 开始执行目标
   */
  async startExecution(goalId: string): Promise<void> {
    const db = getDatabase();
    const goal = db.getGoal(goalId);

    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    console.log(`[Goal] Starting execution: ${goal.title}`);

    // 更新状态
    db.updateGoalStatus(goalId, 'active');

    // 提交到执行引擎
    const engine = getExecutionEngine();
    await engine.execute({
      type: 'goal',
      description: goal.title,
      correlationId: goalId,
      params: { goalId },
      source: { type: 'system', id: 'goal-manager' },
    });
  }

  /**
   * 获取目标进度
   */
  getProgress(goalId: string): {
    goal: Goal;
    plan?: GoalPlan;
    status: string;
  } {
    const db = getDatabase();
    const goal = db.getGoal(goalId);

    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    const plans = db.prepare('SELECT content FROM goal_plans WHERE goal_id = ? ORDER BY version DESC LIMIT 1')
      .all(goalId);

    let plan: GoalPlan | undefined;
    if (plans.length > 0) {
      try {
        plan = JSON.parse(plans[0].content);
      } catch (error) {
        console.error('[Goal] Failed to parse goal plan:', plans[0].content?.substring(0, 200));
      }
    }

    return {
      goal,
      plan,
      status: goal.status,
    };
  }

  /**
   * 列出目标
   */
  listGoals(filters?: { status?: GoalStatus; ownerId?: string }): Goal[] {
    const db = getDatabase();
    return db.listGoals(filters);
  }

  /**
   * 更新目标状态
   */
  updateStatus(goalId: string, status: GoalStatus): void {
    const db = getDatabase();
    db.updateGoalStatus(goalId, status);

    getEventBus().emit(EventType.GOAL_STATUS_CHANGED, {
      goalId,
      status,
      timestamp: Date.now(),
    });
  }

  /**
   * 完成目标
   */
  completeGoal(goalId: string, result?: {
    output?: string;
    artifacts?: Array<{ name: string; path: string }>;
  }): void {
    const db = getDatabase();
    db.updateGoalStatus(goalId, 'completed');

    // 记录活动
    db.logActivity({
      eventType: 'goal_completed',
      actor: 'system',
      action: `完成目标: ${goalId}`,
      result,
    });

    getEventBus().emit(EventType.GOAL_COMPLETED, {
      goalId,
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `goal_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// 单例
let goalManagerInstance: GoalManager | null = null;

export function getGoalManager(): GoalManager {
  if (!goalManagerInstance) {
    goalManagerInstance = new GoalManager();
  }
  return goalManagerInstance;
}
