/**
 * AI Company v2 - 执行引擎
 *
 * 统一处理任务、目标、Cron的执行
 */
import type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionType,
  ExecutionStatus,
} from '../types.js';
import { getEventBus } from '../core/Event.js';
import { EventType } from '../types.js';
import { getDatabase } from '../db/Database.js';
import { getAIProvider } from '../ai/AI.js';

/**
 * 执行引擎
 */
export class ExecutionEngine {
  private executions: Map<string, {
    status: ExecutionStatus;
    percentage: number;
    startTime: number;
  }> = new Map();

  /**
   * 执行请求
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const executionId = this.generateId();
    const startTime = Date.now();

    console.log(`[Execute] ${request.type}: ${request.description}`);

    // 初始化执行状态
    this.executions.set(executionId, {
      status: 'executing',
      percentage: 0,
      startTime,
    });

    // 发布开始事件
    getEventBus().emit(EventType.EXECUTION_STARTED, {
      executionId,
      type: request.type,
      description: request.description,
      source: request.source,
    });

    try {
      let result: ExecutionResult;

      // 根据类型分发
      switch (request.type) {
        case 'goal':
          result = await this.executeGoal(request);
          break;
        case 'task':
          result = await this.executeTask(request);
          break;
        case 'cron':
          result = await this.executeCron(request);
          break;
        case 'script':
          result = await this.executeScript(request);
          break;
        default:
          throw new Error(`Unknown execution type: ${request.type}`);
      }

      // 更新状态
      this.executions.set(executionId, {
        status: result.status,
        percentage: 100,
        startTime,
      });

      // 发布完成/失败事件
      if (result.success) {
        getEventBus().emit(EventType.EXECUTION_COMPLETED, {
          executionId,
          type: request.type,
          result,
          duration: Date.now() - startTime,
        });
      } else {
        getEventBus().emit(EventType.EXECUTION_FAILED, {
          executionId,
          type: request.type,
          error: result.error,
          duration: Date.now() - startTime,
        });
      }

      return result;
    } catch (error: any) {
      const result: ExecutionResult = {
        success: false,
        status: 'failed',
        error: error.message,
      };

      getEventBus().emit(EventType.EXECUTION_FAILED, {
        executionId,
        type: request.type,
        error: error.message,
        timestamp: Date.now(),
      });

      return result;
    } finally {
      // 清理执行状态（保留1分钟）
      setTimeout(() => {
        this.executions.delete(executionId);
      }, 60000);
    }
  }

  /**
   * 执行目标
   */
  private async executeGoal(request: ExecutionRequest): Promise<ExecutionResult> {
    const db = getDatabase();
    const goalId = request.params?.goalId || request.correlationId;

    if (!goalId) {
      throw new Error('Goal ID required for goal execution');
    }

    const goal = db.getGoal(goalId);
    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    console.log(`[Execute] Executing goal: ${goal.title}`);

    // 更新目标状态
    db.updateGoalStatus(goalId, 'active');

    // 获取目标计划
    const plan = this.loadGoalPlan(goalId);
    const planData = plan || await this.createGoalPlan(goal);
    const steps = planData.steps || [];

    // 执行步骤
    const results: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.log(`[Execute] Step ${i + 1}/${steps.length}: ${step.name}`);

      // 发布进度
      this.publishProgress(request.correlationId || goalId, {
        percentage: Math.round(((i + 1) / steps.length) * 100),
        currentStep: step.name,
        totalSteps: steps.length,
        message: step.description,
      });

      // 执行步骤（调用AI）
      const result = await this.executeStep(step, goal);
      results.push(result);

      // 保存步骤结果
      this.saveStepResult(goalId, step, result);

      // 更新活动日志
      db.logActivity({
        eventType: 'goal_progress',
        actor: 'system',
        action: `Execute step: ${step.name}`,
        context: { goalId, stepIndex: i },
        result: { success: true },
      });
    }

    // 完成目标
    db.updateGoalStatus(goalId, 'completed');

    // 返回结果
    return {
      success: true,
      status: 'completed',
      output: results.join('\n\n'),
      artifacts: [],
    };
  }

  /**
   * 执行任务
   */
  private async executeTask(request: ExecutionRequest): Promise<ExecutionResult> {
    const db = getDatabase();
    const ai = await getAIProvider();

    console.log(`[Execute] Executing task: ${request.description}`);

    // 创建任务记录
    const taskId = request.correlationId || this.generateId();
    const employeeId = request.params?.employeeId;

    db.createTask({
      id: taskId,
      type: 'general',
      description: request.description,
      requestedBy: request.source?.type || 'system',
      assignedTo: employeeId || null,
    });

    // 发布任务创建事件
    getEventBus().emit(EventType.TASK_CREATED, {
      task: {
        id: taskId,
        description: request.description,
        assigned_to: employeeId,
        priority: request.params?.priority || 'medium',
      },
      employeeId,
    });

    // 更新状态
    db.updateTaskStatus(taskId, 'executing');

    try {
      // 调用AI执行任务
      const prompt = `你是AI公司的员工。请完成以下任务：

${request.description}

要求：
1. 理解需求，分析需要做什么
2. 执行必要的操作
3. 返回执行结果

直接返回结果，不需要其他说明。`;

      const output = await ai.generate(prompt, {
        maxTokens: 4000,
      });

      // 完成任务
      db.updateTaskStatus(taskId, 'completed', { output });

      // 发布任务完成事件
      getEventBus().emit(EventType.TASK_COMPLETED, {
        task: {
          id: taskId,
          description: request.description,
          assigned_to: employeeId,
          priority: request.params?.priority || 'medium',
        },
        employeeId,
      });

      return {
        success: true,
        status: 'completed',
        output,
      };
    } catch (error: any) {
      // 任务失败
      db.updateTaskStatus(taskId, 'failed', { error: error.message });

      // 发布任务失败事件
      getEventBus().emit(EventType.TASK_FAILED, {
        task: {
          id: taskId,
          description: request.description,
          assigned_to: employeeId,
        },
        employeeId,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * 执行Cron
   */
  private async executeCron(request: ExecutionRequest): Promise<ExecutionResult> {
    const db = getDatabase();
    const cronId = request.params?.cronId || request.correlationId;

    if (!cronId) {
      throw new Error('Cron ID required for cron execution');
    }

    const cron = db.getCron(cronId);
    if (!cron) {
      throw new Error(`Cron not found: ${cronId}`);
    }

    console.log(`[Execute] Executing cron: ${cron.name}`);

    // 解析命令
    const [command, ...args] = this.parseCommand(cron.command);

    // 如果目标是执行AI命令，使用AI
    if (this.isAICommand(command)) {
      const ai = await getAIProvider();
      const output = await ai.generate(cron.command, { maxTokens: 4000 });

      db.updateCronRunStatus(cron.id, {
        success: true,
        output,
        duration: 0,
      });

      return {
        success: true,
        status: 'completed',
        output,
      };
    }

    // TODO: 执行shell命令
    throw new Error('Shell command execution not yet implemented');
  }

  /**
   * 执行脚本
   */
  private async executeScript(request: ExecutionRequest): Promise<ExecutionResult> {
    // Script执行目前委托给Cron
    return this.executeCron({ ...request, type: 'cron' });
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(step: any, goal: any): Promise<string> {
    const ai = await getAIProvider();

    const prompt = `你是AI公司的员工。当前正在执行目标：${goal.title}

步骤：${step.name}

说明：${step.description}

请完成这个步骤，只返回执行结果。`;

    return await ai.generate(prompt, { maxTokens: 4000 });
  }

  /**
   * 加载目标计划
   */
  private loadGoalPlan(goalId: string): { steps: any[] } | null {
    const db = getDatabase();
    const plans = db.prepare('SELECT content FROM goal_plans WHERE goal_id = ? ORDER BY version DESC LIMIT 1')
      .all(goalId);

    if (plans.length === 0) return null;

    try {
      return JSON.parse(plans[0].content);
    } catch (error) {
      console.error('[Execute] Failed to parse goal plan:', plans[0].content?.substring(0, 200));
      return null;
    }
  }

  /**
   * 创建目标计划
   */
  private async createGoalPlan(goal: any): Promise<{ steps: any[] }> {
    const ai = await getAIProvider();

    const prompt = `请将以下目标分解为执行步骤：

目标：${goal.title}
描述：${goal.description || '无'}

要求：
1. 将目标分解为3-7个具体步骤
2. 每个步骤要有清晰的名称和说明
3. 步骤要可执行

返回 JSON 格式：
{
  "steps": [
    {
      "id": "step-1",
      "name": "步骤名称",
      "description": "详细说明",
      "estimatedMinutes": 30
    }
  ]
}`;

    const response = await ai.generate(prompt, { maxTokens: 2000 });

    try {
      return JSON.parse(response);
    } catch (error) {
      console.error('[Execute] Failed to parse AI plan response:', response.substring(0, 500));
      throw new Error(`Invalid JSON from AI: ${(error as Error).message}`);
    }
  }

  /**
   * 发布进度事件
   */
  private publishProgress(executionId: string, progress: {
    percentage: number;
    currentStep?: string;
    totalSteps?: number;
    message?: string;
  }): void {
    getEventBus().emit(EventType.EXECUTION_PROGRESS, {
      executionId,
      ...progress,
      timestamp: Date.now(),
    });
  }

  /**
   * 保存步骤结果
   */
  private saveStepResult(goalId: string, step: any, result: string): void {
    const db = getDatabase();
    // TODO: 保存步骤结果到表
  }

  /**
   * 判断是否是AI命令
   */
  private isAICommand(command: string): boolean {
    // 如果命令以特定前缀开头，认为是AI命令
    return command.startsWith('ai:') ||
           command.startsWith('分析:') ||
           command.startsWith('生成:');
  }

  /**
   * 解析命令字符串
   */
  private parseCommand(command: string): [string, ...string[]] {
    // 简单的空格分割
    return command.split(/\s+/) as [string, ...string[]];
  }

  private generateId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// 单例
let executionEngineInstance: ExecutionEngine | null = null;

export function getExecutionEngine(): ExecutionEngine {
  if (!executionEngineInstance) {
    executionEngineInstance = new ExecutionEngine();
  }
  return executionEngineInstance;
}
