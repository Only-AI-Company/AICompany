/**
 * AI Company v3 - Engine
 *
 * 核心引擎：自主运行的后台循环
 *
 * 职责：
 * 1. 启动后台运行循环
 * 2. 协调各组件工作
 * 3. 处理用户输入
 * 4. 监控系统状态
 * 5. 持久化活动日志
 */

import { EventEmitter } from 'eventemitter3';
import type { SystemEvent, SystemStatus, Task } from './types.js';
import { getGoalManager } from './GoalManager.js';
import { getScheduler } from './Scheduler.js';
import { getCEO } from './CEO.js';
import { EmployeeFactory, EmployeeImpl } from './Employee.js';
import { getPlanExecutor } from './PlanExecutor.js';
import { getMemoryExtractor } from './memory/MemoryExtractor.js';
import { ensureWorkspaceDir, generateId, getConversationWorkspacePath, getTaskWorkspacePath } from './utils.js';
import { getDatabase, getDatabaseSync } from './database/index.js';

// ============================================================================
// Engine
// ============================================================================

export class Engine extends EventEmitter {
  private running = false;
  private startTime = 0;
  private loopTimer?: NodeJS.Timeout;
  private reviewTimer?: NodeJS.Timeout;

  // 组件
  private goalManager = getGoalManager();
  private scheduler = getScheduler();
  private ceo = getCEO();
  private planExecutor = getPlanExecutor();

  // 员工池
  private employees = EmployeeFactory.createDefaultEmployees();

  // 数据库（延迟初始化）
  private db?: ReturnType<typeof getDatabaseSync>;

  // 当前活跃会话
  private activeConversationId?: string;

  constructor() {
    super();
  }

  /**
   * 记录活动到数据库
   */
  private logActivity(eventType: string, action: string, context?: Record<string, any>): void {
    if (!this.db) return;
    try {
      this.db.logActivity({
        eventType,
        actor: 'Engine',
        action,
        context,
        createdAt: Date.now(),
      });
    } catch (error: any) {
      console.error('[Engine] Failed to log activity:', error.message);
    }
  }

  /**
   * 启动引擎
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('[Engine] Already running');
      return;
    }

    console.log('[Engine] Starting...');
    this.startTime = Date.now();
    this.running = true;

    // 初始化组件
    await this.initializeComponents();

    // 启动后台循环
    this.startLoop();

    // 启动复盘定时器（每5分钟）
    this.startReviewScheduler();

    // 记录活动并更新系统状态
    this.logActivity('engine.started', 'Engine started');
    this.updateSystemStatus();

    this.emit('engine.started', {
      timestamp: Date.now(),
      startTime: this.startTime,
    });

    console.log('[Engine] Started');
  }

  /**
   * 停止引擎
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.log('[Engine] Stopping...');
    this.running = false;

    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
    }

    if (this.reviewTimer) {
      clearInterval(this.reviewTimer);
      this.reviewTimer = undefined;
    }

    await this.shutdownComponents();

    // 记录活动并更新系统状态
    this.logActivity('engine.stopped', 'Engine stopped', { uptime: Date.now() - this.startTime });
    this.updateSystemStatus();

    this.emit('engine.stopped', {
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
    });

    console.log('[Engine] Stopped');
  }

  /**
   * 处理用户输入
   */
  async handleUserInput(input: string, conversationId?: string): Promise<string> {
    console.log(`[Engine] User input: "${input.substring(0, 50)}..."`);

    // 使用或设置当前会话 ID
    const convId = conversationId || this.activeConversationId;

    // 保存用户消息到数据库
    if (convId) {
      this.saveMessage(convId, 'user', input);
    }

    // 记录活动
    this.logActivity('user.input', 'User input received', { input: input.substring(0, 100), conversationId: convId });

    // 发出事件
    this.emit('user.input', {
      timestamp: Date.now(),
      input,
      conversationId: convId,
    });

    // 交给 CEO 处理
    try {
      const understanding = await this.ceo.understand(input);

      switch (understanding.intentType) {
        case 'goal':
          // 解析时间框架
          const timeframeMatch = input.match(/(\d+[天月周年]|永久|ongoing)/i);
          const timeframe = timeframeMatch ? timeframeMatch[1] : '30 天';

          await this.goalManager.setGoal(understanding.userWant, timeframe);
          this.logActivity('goal.created', 'Goal created', { description: understanding.userWant, timeframe });
          return `目标已设置：${understanding.userWant}（${timeframe}）`;

        case 'task':
          // 创建任务并调度
          const taskId = generateId('task');
          const task = {
            id: taskId,
            description: understanding.userWant,
            requiredCapabilities: [],  // TODO: 从理解中提取
            status: 'pending' as const,
            priority: 'medium' as const,
            input,
            createdAt: Date.now(),
          };

          await ensureWorkspaceDir(getTaskWorkspacePath(taskId));
          this.scheduler.schedule(task);
          this.logActivity('task.created', 'Task created', { description: understanding.userWant });
          return `任务已创建并加入队列：${understanding.userWant}`;

        case 'chat':
          // 对话模式
          try {
            const provider = this.ceo.getAIProvider();
            const response = await provider.prompt(
              `用户说：${input}\n请回复。`,
              '你是 AI Company v3 的 CEO。请友好地回复用户。'
            );
            const text = typeof response.content === 'string'
              ? response.content
              : response.getText ? response.getText() : JSON.stringify(response.content);

            if (text && text.trim().length > 0) {
              // 保存助手响应到数据库
              if (convId) {
                this.saveMessage(convId, 'assistant', text);
              }
              this.logActivity('user.chat', 'Chat response', { input: input.substring(0, 50), conversationId: convId });
              return text;
            }
          } catch (llmError: any) {
            console.warn('[Engine] LLM chat failed, using fallback:', llmError.message);
          }

          // Fallback: 简单规则回复
          const fallbackResponses: Record<string, string> = {
            '你好': '你好！我是 AI Company v3 的 CEO。很高兴为你服务。有什么我可以帮助你的吗？',
            '嗨': '嗨！有什么我可以帮你的吗？',
            '怎么样': '系统运行正常！当前有 3 名员工待命，随时准备执行任务。',
            'status': '系统状态：运行中。引擎已启动，等待你的指令。',
            '在吗': '我在！随时准备为你服务。请告诉我你需要什么帮助。',
          };

          let fallbackText = '你好！我是 AI Company v3 的 CEO。系统运行正常，请告诉我你需要什么帮助。';

          for (const [keyword, response] of Object.entries(fallbackResponses)) {
            if (input.toLowerCase().includes(keyword.toLowerCase())) {
              fallbackText = response;
              break;
            }
          }

          // 保存 fallback 响应
          if (convId) {
            this.saveMessage(convId, 'assistant', fallbackText);
          }

          return fallbackText;

        case 'command':
          // 命令模式 - 出于安全考虑已禁用
          // 防止命令注入攻击
          return '命令执行功能已禁用。如需执行系统命令，请直接在终端运行。';

        default:
          return `我理解你是想要：${understanding.userWant}`;
      }
    } catch (error: any) {
      console.error('[Engine] Error processing input:', error);
      this.logActivity('user.input', 'Input processing failed', { error: error.message });
      return `处理失败：${error.message}`;
    }
  }

  /**
   * 保存消息到数据库
   */
  private saveMessage(conversationId: string, role: 'user' | 'assistant' | 'system', content: string): void {
    if (!this.db) return;
    try {
      this.db.insertMessage({
        id: generateId('msg'),
        conversationId,
        role,
        content,
        createdAt: Date.now(),
      });
    } catch (error: any) {
      console.error('[Engine] Failed to save message:', error.message);
    }
  }

  /**
   * 创建新会话
   */
  createConversation(title?: string): string {
    const id = generateId('conv');
    if (!this.db) return id;

    try {
      const now = Date.now();
      this.db.insertConversation({
        id,
        title: title || `会话 ${new Date().toLocaleString()}`,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      this.activeConversationId = id;
      void ensureWorkspaceDir(getConversationWorkspacePath(id)).catch((error: any) => {
        console.warn(`[Engine] Failed to create conversation workspace: ${error.message}`);
      });
      return id;
    } catch (error: any) {
      console.error('[Engine] Failed to create conversation:', error.message);
      return id;
    }
  }

  /**
   * 获取会话历史
   */
  getConversationHistory(conversationId: string, limit: number = 50): any[] {
    if (!this.db) return [];
    return this.db.getMessages(conversationId, limit);
  }

  /**
   * 设置当前会话
   */
  setActiveConversation(conversationId: string): void {
    this.activeConversationId = conversationId;
  }

  /**
   * 获取当前会话
   */
  getActiveConversation(): string | undefined {
    return this.activeConversationId;
  }

  /**
   * 获取系统状态
   */
  getStatus(): SystemStatus {
    const stats = this.scheduler.getStats();
    const dbStats = this.db?.getStats() || { goals: { active: 0 }, tasks: { completed: 0, failed: 0 } };

    return {
      engineRunning: this.running,
      currentGoalId: undefined, // TODO: 从系统状态读取
      activeGoals: dbStats.goals.active,
      activeTasks: stats.executing,
      pendingTasks: stats.queued,
      completedTasks: dbStats.tasks.completed,
      failedTasks: dbStats.tasks.failed,
      activeEmployees: this.employees.length,
      uptime: this.running ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      lastUpdateAt: Date.now(),
    };
  }

  /**
   * 更新系统状态到数据库
   */
  private updateSystemStatus(): void {
    if (!this.db) return;
    try {
      const stats = this.scheduler.getStats();
      const dbStats = this.db.getStats();

      this.db.updateSystemStatus({
        engine_running: this.running ? 1 : 0,
        active_goals: dbStats.goals.active,
        active_tasks: stats.executing,
        pending_tasks: stats.queued,
        completed_tasks: dbStats.tasks.completed,
        failed_tasks: dbStats.tasks.failed,
        active_employees: this.employees.length,
        uptime: this.running ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      });
    } catch (error: any) {
      console.error('[Engine] Failed to update system status:', error.message);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * 初始化组件
   */
  private async initializeComponents(): Promise<void> {
    console.log('[Engine] Initializing components...');

    // 初始化数据库
    console.log('[Engine] Initializing database...');
    this.db = await getDatabase();

    // 将默认员工持久化到数据库（如果不存在）
    this.initializeDefaultEmployees();

    // 从数据库加载员工列表
    this.loadEmployeesFromDatabase();

    // 设置员工列表到 Scheduler（用于任务恢复）
    this.scheduler.setEmployees(this.employees);

    // 设置 PlanExecutor 事件监听
    this.setupPlanExecutorListeners();

    console.log('[Engine] Components initialized');
    console.log(`[Engine] Employees: ${this.employees.length} available`);
  }

  /**
   * 关闭组件
   */
  private async shutdownComponents(): Promise<void> {
    console.log('[Engine] Shutting down components...');

    // TODO: 关闭各组件

    console.log('[Engine] Components shut down');
  }

  /**
   * 启动后台循环
   */
  private startLoop(): void {
    const loop = async () => {
      if (!this.running) {
        return;
      }

      try {
        await this.runLoop();
      } catch (error: any) {
        console.error('[Engine] Loop error:', error);
      }

      // 继续下一次循环（1 秒间隔）
      if (this.running) {
        this.loopTimer = setTimeout(loop, 1000);
      }
    };

    // 启动循环
    loop();
  }

  /**
   * 启动复盘定时器
   *
   * 每5分钟执行一次复盘，而不是依赖主循环的时间检测
   */
  private startReviewScheduler(): void {
    // 清除现有定时器（如果有）
    if (this.reviewTimer) {
      clearInterval(this.reviewTimer);
    }

    // 每5分钟执行一次复盘
    this.reviewTimer = setInterval(() => {
      if (this.running) {
        void this.performReview();
      }
    }, 5 * 60 * 1000); // 5分钟

    console.log('[Engine] Review scheduler started (5 min interval)');
  }

  /**
   * 设置 PlanExecutor 事件监听
   *
   * 监听 Scheduler 的任务完成事件，更新 PlanExecutor 中的步骤状态
   */
  private setupPlanExecutorListeners(): void {
    // 监听任务完成事件
    this.scheduler.on('task.completed', async (event: SystemEvent) => {
      const { taskId } = event.data;
      const result = {
        success: true,
        error: undefined,
      };

      try {
        await this.planExecutor.handleTaskCompleted(taskId, result);
      } catch (error: any) {
        console.error('[Engine] Failed to handle task completed in PlanExecutor:', error.message);
      }
    });

    // 监听任务失败事件
    this.scheduler.on('task.failed', async (event: SystemEvent) => {
      const { taskId, error } = event.data;
      const result = {
        success: false,
        error,
      };

      try {
        await this.planExecutor.handleTaskCompleted(taskId, result);
      } catch (error: any) {
        console.error('[Engine] Failed to handle task failed in PlanExecutor:', error.message);
      }
    });

    console.log('[Engine] PlanExecutor listeners setup complete');
  }

  /**
   * 初始化默认员工到数据库
   */
  private initializeDefaultEmployees(): void {
    if (!this.db) return;

    try {
      const existingEmployees = this.db.getAllEmployees();
      const existingIds = new Set(existingEmployees.map((e: any) => e.id));

      // 创建默认员工
      const defaultEmployees = [
        {
          id: 'emp_xiaohongshu',
          name: '小红书专员',
          role: '小红书运营',
          skills: ['小红书运营', '内容创作', '数据分析'],
          level: 3,
          performance: 70,
          satisfaction: 80,
          systemPrompt: '你是小红书运营专员，擅长小红书内容创作和运营。',
          capabilities: ['xiaohongshu', 'content_creation', 'data_analysis'],
          createdAt: Date.now(),
        },
        {
          id: 'emp_content',
          name: '内容创作',
          role: '内容创作',
          skills: ['文案写作', '文章创作', '编辑'],
          level: 4,
          performance: 75,
          satisfaction: 85,
          systemPrompt: '你是内容创作专家，擅长各种文案和文章写作。',
          capabilities: ['writing', 'editing', 'content_creation'],
          createdAt: Date.now(),
        },
        {
          id: 'emp_data',
          name: '数据分析',
          role: '数据分析师',
          skills: ['数据分析', '报表生成', '趋势分析'],
          level: 3,
          performance: 65,
          satisfaction: 75,
          systemPrompt: '你是数据分析师，擅长数据分析和报告生成。',
          capabilities: ['data_analysis', 'reporting', 'analytics'],
          createdAt: Date.now(),
        },
      ];

      // 只添加不存在的员工
      for (const empData of defaultEmployees) {
        if (!existingIds.has(empData.id)) {
          this.db.insertEmployee(empData);
          console.log(`[Engine] Default employee created: ${empData.name}`);
        }
      }
    } catch (error: any) {
      console.error('[Engine] Failed to initialize default employees:', error.message);
    }
  }

  /**
   * 从数据库加载员工列表
   */
  private loadEmployeesFromDatabase(): void {
    if (!this.db) return;

    try {
      const dbEmployees = this.db.getAllEmployees();

      if (dbEmployees.length === 0) {
        console.warn('[Engine] No employees found in database');
        return;
      }

      // 将数据库员工转为 Employee 对象
      this.employees = dbEmployees.map((dbEmp: any) => {
        return new EmployeeImpl({
          id: dbEmp.id,
          name: dbEmp.name,
          role: dbEmp.role,
          skills: typeof dbEmp.skills === 'string' ? JSON.parse(dbEmp.skills) : dbEmp.skills,
          level: dbEmp.level || 1,
          performance: dbEmp.performance || 50,
          satisfaction: dbEmp.satisfaction || 70,
          systemPrompt: dbEmp.system_prompt || dbEmp.systemPrompt,
          capabilities: typeof dbEmp.capabilities === 'string' ? JSON.parse(dbEmp.capabilities) : dbEmp.capabilities,
          createdAt: dbEmp.created_at || Date.now(),
        });
      });

      console.log(`[Engine] Loaded ${this.employees.length} employees from database`);
    } catch (error: any) {
      console.error('[Engine] Failed to load employees from database:', error.message);
    }
  }

  /**
   * 运行一次循环
   *
   * 自主运行的核心逻辑
   */
  private async runLoop(): Promise<void> {
    // 1. 检查目标 → 拆解新目标
    await this.goalManager.checkAndDecompose();

    // 2. 执行待办任务
    await this.scheduler.executeNext(this.employees);

    // 3. 更新进度
    this.updateProgress();

    // 4. 更新系统状态（每次循环都更新）
    this.updateSystemStatus();
  }

  /**
   * 更新进度
   */
  private updateProgress(): void {
    const activeGoals = this.goalManager.getActiveGoals();

    for (const goal of activeGoals) {
      const progress = this.goalManager.getProgress(goal.id);
      if (progress) {
        // 简单的进度计算：完成的步骤 / 总步骤
        const calculatedProgress = (progress.completedSteps / progress.totalSteps) * 100;
        this.goalManager.updateProgress(goal.id, calculatedProgress);
      }
    }
  }

  /**
   * 执行复盘
   */
  private async performReview(): Promise<void> {
    if (!this.db) return;

    try {
      console.log('[Engine] Performing review...');

      // 收集最近完成的任务（未复盘的）
      const recentTasks = this.db.getAllTasks().filter(
        (t: any) => t.status === 'completed' && !t.reviewed
      );

      if (recentTasks.length === 0) {
        console.log('[Engine] No new tasks to review');
        return;
      }

      console.log(`[Engine] Reviewing ${recentTasks.length} tasks`);

      // 对每个任务进行复盘
      for (const dbTask of recentTasks.slice(0, 10)) {  // 每次最多复盘 10 个
        const task: Task = {
          id: dbTask.id,
          planId: dbTask.plan_id,
          goalId: dbTask.goal_id,
          description: dbTask.description,
          requiredCapabilities: dbTask.required_capabilities ? JSON.parse(dbTask.required_capabilities) : [],
          employeeId: dbTask.employee_id,
          status: dbTask.status,
          priority: dbTask.priority,
          input: dbTask.input,
          result: {
            success: !dbTask.error,
            output: dbTask.output,
            error: dbTask.error,
          },
          createdAt: dbTask.created_at,
          startedAt: dbTask.started_at,
          completedAt: dbTask.completed_at,
        };

        // 调用 CEO 复盘
        const review = await this.ceo.reviewTask(task, task.result!);

        // 持久化复盘结果
        this.db.insertReview({
          id: review.id,
          taskId: review.taskId,
          employeeId: review.employeeId,
          score: review.score,
          strengths: review.strengths,
          improvements: review.improvements,
          learnings: review.learnings,
          createdAt: review.createdAt,
        });

        // 更新员工绩效
        if (review.shouldUpdatePerformance && review.performanceDelta) {
          const employee = this.employees.find(e => e.id === review.employeeId);
          if (employee && employee.updatePerformance) {
            employee.updatePerformance(review.performanceDelta);
          }
        }

        // 标记任务已复盘
        this.db.updateTask(task.id, { reviewed: 1 });

        console.log(`[Engine] Task ${task.id} reviewed: ${review.score}/10`);

        // 提取记忆
        try {
          const memoryExtractor = getMemoryExtractor();
          const memoryResult = await memoryExtractor.extractFromReview(review, task, task.result!);
          await memoryExtractor.saveMemories(memoryResult);
          console.log(`[Engine] Extracted ${memoryResult.episodicMemories.length} episodic, ${memoryResult.semanticMemories.length} semantic memories`);
        } catch (memoryError: any) {
          console.error('[Engine] Failed to extract memories:', memoryError.message);
        }
      }

      // 更新系统状态中的复盘时间
      this.db.updateSystemStatus({ last_review_at: Date.now() });

      // 记录活动
      this.logActivity('review.completed', 'Review cycle completed', {
        tasksReviewed: recentTasks.length,
      });

      console.log('[Engine] Review cycle completed');
    } catch (error: any) {
      console.error('[Engine] Review failed:', error.message);
      this.logActivity('review.completed', 'Review cycle failed', { error: error.message });
    }
  }
}

// ============================================================================
// Singleton Exports
// ============================================================================

let engineInstance: Engine | null = null;

export function getEngine(): Engine {
  if (!engineInstance) {
    engineInstance = new Engine();
  }
  return engineInstance;
}

export function resetEngine(): void {
  engineInstance = null;
}
