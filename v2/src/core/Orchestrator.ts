/**
 * AI Company v2 - 核心编排器
 *
 * 统一处理输入、意图分析、执行流程
 */
import type { InputMessage, IntentAnalysis } from '../types.js';
import { getEventBus } from './Event.js';
import { EventType } from '../types.js';
import { getDatabase } from '../db/Database.js';
import { getAIProvider } from '../ai/AI.js';
import { IntentionAnalyzer } from './Intent.js';
import { InputCollector } from './Input.js';
import { getGoalManager } from './Goal.js';
import { getExecutionEngine } from './Execute.js';
import { getCronScheduler } from './CronScheduler.js';
import { getEmployeeService } from './Employee.js';
import { getTaskPlanner } from './TaskPlanner.js';
import { createToolExecutor } from './ToolExecutor.js';
import { getValidator } from './Validator.js';
import { getWorkspaceManager } from './Workspace.js';

/**
 * 核心编排器
 */
export class Orchestrator {
  private intentAnalyzer?: IntentionAnalyzer;
  private inputCollector: InputCollector;
  private employeeService = getEmployeeService();
  private isRunning: boolean = false;
  private unsubscribeFunctions: Array<() => void> = [];

  constructor() {
    this.inputCollector = new InputCollector();
  }

  /**
   * 启动编排器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Orchestrator] Already running');
      return;
    }

    console.log('[Orchestrator] Starting...');

    // 初始化意图分析器
    if (!this.intentAnalyzer) {
      const ai = await getAIProvider();
      this.intentAnalyzer = new IntentionAnalyzer(ai);
    }

    // 启动员工服务
    getEmployeeService().start();

    // 启动 Cron 调度器
    await getCronScheduler().start();

    // 监听输入事件
    const unsubscribe = getEventBus().on(EventType.INPUT_RECEIVED, async (event) => {
      try {
        await this.handleInput(event.data);
      } catch (error: any) {
        console.error('[Orchestrator] Error in INPUT_RECEIVED handler:', error.message);
      }
    });
    this.unsubscribeFunctions.push(unsubscribe);

    this.isRunning = true;
    console.log('[Orchestrator] Started');
  }

  /**
   * 停止编排器
   */
  async stop(): Promise<void> {
    console.log('[Orchestrator] Stopping...');

    // 清理所有事件监听器
    this.unsubscribeFunctions.forEach(fn => fn());
    this.unsubscribeFunctions = [];

    // 停止员工服务
    getEmployeeService().stop();

    getCronScheduler().stop();

    this.isRunning = false;
    console.log('[Orchestrator] Stopped');
  }

  /**
   * 处理输入
   */
  private async handleInput(input: InputMessage): Promise<void> {
    console.log(`[Orchestrator] Processing input from ${input.source}`);

    const startTime = Date.now();
    let intent: IntentAnalysis;

    try {
      // 意图分析
      if (!this.intentAnalyzer) {
        throw new Error('IntentAnalyzer not initialized. Call start() first.');
      }

      // 加载对话历史
      const db = getDatabase();
      const history = input.chatId ? db.getChatHistory(input.chatId, 10) : [];

      intent = await this.intentAnalyzer.analyze({
        content: input.content,
        context: {
          userId: input.userId,
          history,
        },
      });

      // 发布意图分析完成事件
      getEventBus().emit(EventType.INTENT_ANALYZED, {
        inputId: input.id,
        intent,
        timestamp: Date.now(),
      });

      // 记录意图日志
      db.logIntent({
        sessionId: input.chatId || 'default',
        source: input.source,
        userInput: input.content,
        aiRawResponse: JSON.stringify(intent),
        parsedTool: intent.type,
        parsedInput: input.content,
        executionStatus: 'analyzed',
        latency: Date.now() - startTime,
      });

      console.log(`[Orchestrator] Intent: ${intent.type} (confidence: ${intent.confidence})`);

      // 根据意图执行
      await this.executeIntent(intent, input);

    } catch (error: any) {
      console.error('[Orchestrator] Error processing input:', error.message);

      const db = getDatabase();
      db.logIntent({
        sessionId: input.chatId || 'default',
        source: input.source,
        userInput: input.content,
        executionStatus: 'error',
        latency: Date.now() - startTime,
      });
    }
  }

  /**
   * 执行意图
   */
  private async executeIntent(intent: IntentAnalysis, input: InputMessage): Promise<void> {
    const db = getDatabase();

    // 分配员工
    const employee = this.employeeService.assignEmployeeForIntent(intent.type);
    const employeeId = employee?.id;  // 暂时可能为 null

    switch (intent.type) {
      case 'create_goal': {
        const goalManager = getGoalManager();

        // 确定目标类型
        const goalType = intent.entities.goalType || 'short_term';

        // 创建目标
        const goal = await goalManager.createGoal({
          type: goalType,
          title: intent.entities.title || intent.entities.description || input.content.substring(0, 50),
          description: intent.entities.description,
          recurring: intent.entities.recurring,
          ownerId: input.userId,
        });

        // 发送回复
        this.sendResponse(input, {
          type: 'goal_created',
          message: `已创建目标：${goal.title}\n类型：${goal.type}\n状态：${goal.status}`,
          data: { goalId: goal.id },
        }, employeeId);

        // 如果是短期目标或长期目标，自动生成计划并开始执行
        if (goalType !== 'recurring') {
          await goalManager.generatePlan(goal.id);
          await goalManager.startExecution(goal.id);
        }

        break;
      }

      case 'create_task': {
        // 直接执行任务
        const engine = getExecutionEngine();
        const result = await engine.execute({
          type: 'task',
          description: intent.entities.description || input.content,
          correlationId: input.id,
          source: { type: input.source, id: input.userId || 'unknown' },
          params: {
            employeeId,  // 传递 employeeId 给执行引擎
            priority: intent.entities.priority,
          },
        });

        this.sendResponse(input, {
          type: 'task_completed',
          message: result.output || '任务已完成',
          data: { success: result.success },
        }, employeeId);

        break;
      }

      case 'create_script': {
        // 创建自动化脚本（作为 Cron）
        const cronId = this.generateId();
        const cronRule = intent.entities.cronRule || '0 * * * *'; // 默认每小时

        await getCronScheduler().addJob({
          id: cronId,
          name: intent.entities.title || intent.entities.description?.substring(0, 50) || '自动化脚本',
          description: intent.entities.description,
          command: `ai:${intent.entities.description}`,
          cronRule,
        });

        this.sendResponse(input, {
          type: 'script_created',
          message: `已创建自动化脚本\nCron: ${cronRule}`,
          data: { cronId },
        }, employeeId);

        break;
      }

      case 'query_status': {
        const goalManager = getGoalManager();
        const goals = goalManager.listGoals();

        const status = goals.map(g => `${g.title}: ${g.status}`).join('\n');
        this.sendResponse(input, {
          type: 'status',
          message: status || '暂无目标',
        }, employeeId);

        break;
      }

      case 'query_tasks': {
        const db = getDatabase();
        const tasks = db.listTasks();

        const taskList = tasks.map(t => `[${t.status}] ${t.description}`).join('\n');
        this.sendResponse(input, {
          type: 'tasks',
          message: taskList || '暂无任务',
        }, employeeId);

        break;
      }

      case 'query_goals': {
        const goalManager = getGoalManager();
        const goals = goalManager.listGoals();

        const goalList = goals.map(g => `[${g.type}] ${g.title}: ${g.status}`).join('\n');
        this.sendResponse(input, {
          type: 'goals',
          message: goalList || '暂无目标',
        }, employeeId);

        break;
      }

      case 'chat': {
        // 普通对话
        const ai = await getAIProvider();
        const response = await ai.generate(`用户说：${input.content}\n\n请友好地回复。`);

        this.sendResponse(input, {
          type: 'chat',
          message: response,
        }, employeeId);

        break;
      }

      case 'open_task': {
        // 开放性任务 - 使用 Phase 3 核心执行闭环
        await this.executeOpenTask(intent, input, employeeId);
        break;
      }

      default:
        this.sendResponse(input, {
          type: 'error',
          message: `无法识别的意图：${intent.type}`,
        }, employeeId);
    }
  }

  /**
   * 执行开放性任务（Phase 3 核心执行闭环）
   */
  private async executeOpenTask(
    intent: IntentAnalysis,
    input: InputMessage,
    employeeId?: string
  ): Promise<void> {
    console.log('[Orchestrator] Executing open task:', intent.entities.description);

    const description = intent.entities.description || input.content;

    try {
      // 1. 生成任务计划
      const taskPlanner = getTaskPlanner();
      const plan = await taskPlanner.generatePlan(description);

      console.log('[Orchestrator] Task plan generated:', plan.steps.length, 'steps');

      // 2. 执行任务
      const workspaceManager = getWorkspaceManager();
      const toolExecutor = createToolExecutor({
        workspaceManager,
        onProgress: (progress) => {
          console.log(`[Orchestrator] Progress: ${progress.currentStep}/${progress.totalSteps} - ${progress.currentStepName}`);
        },
      });

      const executionResult = await toolExecutor.execute(plan);

      // 3. 验证结果
      const validator = getValidator();
      const workspace = executionResult.workspace;
      const validationResult = await validator.validate(
        plan,
        executionResult,
        workspace?.path
      );

      // 4. 返回结果
      const validationReport = validator.generateReport(validationResult);
      const summary = `${executionResult.summary}\n\n${validationReport}`;

      this.sendResponse(input, {
        type: 'open_task_completed',
        message: summary,
        data: {
          plan,
          executionResult,
          validationResult,
          workspacePath: workspace?.path,
        },
      }, employeeId);
    } catch (error: any) {
      console.error('[Orchestrator] Open task execution failed:', error.message);
      this.sendResponse(input, {
        type: 'error',
        message: `开放性任务执行失败：${error.message}`,
      }, employeeId);
    }
  }

  /**
   * 发送响应
   */
  private sendResponse(input: InputMessage, response: {
    type: string;
    message: string;
    data?: any;
  }, employeeId?: string): void {
    // 保存输出消息
    const db = getDatabase();
    db.saveChatMessage({
      content: response.message,
      source: 'system',
      direction: 'out',
      employeeId: employeeId || null,
      chatId: input.chatId,
      userId: input.userId,
    });

    // 发布响应事件
    getEventBus().emit(EventType.RESPONSE_READY, {
      inputId: input.id,
      source: input.source,
      chatId: input.chatId,
      response,
      employeeId: employeeId || null,
    });
  }

  /**
   * 提交输入（供外部调用）
   */
  async submitInput(message: {
    content: string;
    source: 'cli' | 'telegram' | 'web';
    userId?: string;
    chatId?: string;
  }): Promise<void> {
    const input: InputMessage = {
      id: this.generateId(),
      source: message.source,
      content: message.content,
      userId: message.userId,
      chatId: message.chatId,
      timestamp: Date.now(),
    };

    // 使用 InputCollector 收集输入
    await this.inputCollector.collect(input);
  }

  private generateId(): string {
    return `input_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// 单例
let orchestratorInstance: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new Orchestrator();
  }
  return orchestratorInstance;
}
