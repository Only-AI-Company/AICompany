/**
 * BaseAgent - Agent 基类
 *
 * 所有 Agent 的抽象基类，定义标准接口：
 * - think(): 思考与分析
 * - plan(): 规划与策略
 * - act(): 执行与行动
 * - reflect(): 反思与优化
 * - learn(): 学习与记忆
 */

import { EventEmitter } from 'events';
import pino from 'pino';
import type { AgentRole, AgentStatus, Task, Memory, ThoughtProcess } from '../../types';
import { LangFuseClient } from '../observability/LangFuseClient';

export interface AgentConfig {
  role: AgentRole;
  name?: string;
  maxIterations?: number;
  reflectionEnabled?: boolean;
}

export abstract class BaseAgent extends EventEmitter {
  protected config: Required<AgentConfig>;
  protected status: AgentStatus = 'idle';
  protected logger: pino.Logger;
  protected currentTask: Task | null = null;

  // 记忆存储
  protected memories: Memory[] = [];

  // 思考历史
  protected thoughtHistory: ThoughtProcess[] = [];

  // LangFuse 可观测性
  protected langfuse: LangFuseClient;
  protected currentTrace: any = null;

  constructor(config: AgentConfig) {
    super();
    this.config = {
      role: config.role,
      name: config.name || config.role,
      maxIterations: config.maxIterations ?? 10,
      reflectionEnabled: config.reflectionEnabled ?? true
    };
    this.logger = pino({ name: `agent-${this.config.name}` });

    // 初始化 LangFuse
    this.langfuse = new LangFuseClient();
  }

  /**
   * 思考：分析任务与环境
   */
  async think(task: Task): Promise<ThoughtProcess> {
    this.logger.info({ taskId: task.id }, 'Thinking about task');
    this.status = 'thinking';

    const observations = this.observe(task);
    const analysis = await this.analyze(task);

    const thought: ThoughtProcess = {
      observations,
      reasoning: {
        initialHypothesis: analysis.initialHypothesis || '',
        evidenceChain: analysis.evidenceChain || [],
        conclusion: analysis.conclusion || '',
        confidence: analysis.confidence || 0.5,
        reasoningType: 'deductive'
      },
      decision: {
        selectedAction: {
          id: this.generateId('action'),
          type: 'use_tool',
          agentId: this.config.name,
          description: 'Default action',
          parameters: {}
        },
        alternatives: [],
        rationale: analysis.rationale || '',
        expectedOutcome: analysis.expectedOutcome || ''
      },
      selfCritique: undefined
    };

    this.thoughtHistory.push(thought);
    return thought;
  }

  /**
   * 规划：制定执行策略
   */
  async plan(thought: ThoughtProcess): Promise<any> {
    this.logger.info('Planning execution');
    this.status = 'planning';

    // 子类实现具体规划逻辑
    return this.createPlan(thought);
  }

  /**
   * 执行：采取实际行动
   */
  async act(plan: any): Promise<any> {
    this.logger.info('Executing plan');
    this.status = 'acting';

    // 子类实现具体执行逻辑
    return this.execute(plan);
  }

  /**
   * 反思：评估结果并优化
   */
  async reflect(result: any): Promise<void> {
    if (!this.config.reflectionEnabled) {
      return;
    }

    this.logger.info('Reflecting on execution');
    this.status = 'reflecting';

    // 子类实现具体反思逻辑
    await this.evaluate(result);
  }

  /**
   * 学习：从经验中提取记忆
   */
  async learn(memory: Memory): Promise<void> {
    this.logger.info({ memoryType: memory.type }, 'Learning from experience');
    this.memories.push(memory);
    this.status = 'learning';
  }

  /**
   * 执行任务（主入口）
   */
  async executeTask(task: Task): Promise<any> {
    this.currentTask = task;
    this.logger.info({ taskId: task.id, type: task.type }, 'Executing task');

    // 创建 LangFuse Trace
    const traceResult = await this.langfuse.traceAgentExecution(
      this.config.name,
      task.id,
      { taskType: task.type, priority: task.priority }
    );
    this.currentTrace = traceResult;

    try {
      // 思考
      const thought = await this.think(task);
      await traceResult.observe('think', task, thought);

      // 规划
      const plan = await this.plan(thought);
      await traceResult.observe('plan', thought, plan);

      // 执行
      const result = await this.act(plan);
      await traceResult.observe('act', plan, result);

      // 反思
      await this.reflect(result);
      await traceResult.observe('reflect', { result }, { reflected: true });

      // 学习
      const memory = {
        id: this.generateId('memory'),
        type: 'episodic',
        content: { task, result },
        importance: 0.5,
        confidence: 0.8,
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now()
      } as Memory;

      await this.learn(memory);
      await traceResult.observe('learn', { memory }, { stored: true });

      this.status = 'idle';
      this.emit('task_completed', { task, result });

      // 刷新 LangFuse 数据
      await this.langfuse.flush();

      return result;

    } catch (error) {
      this.logger.error({ error }, 'Task execution failed');
      this.status = 'error';

      // 记录错误到 LangFuse
      if (this.currentTrace) {
        await this.currentTrace.trace.event({
          name: 'error',
          input: error instanceof Error ? error.message : String(error)
        });
        await this.langfuse.flush();
      }

      this.emit('task_failed', { task, error });
      throw error;
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * 获取配置信息
   */
  getInfo(): { role: AgentRole; name: string; status: AgentStatus } {
    return {
      role: this.config.role,
      name: this.config.name,
      status: this.status
    };
  }

  /**
   * 停止 Agent
   */
  stop(): void {
    this.logger.info('Agent stopped');
    this.status = 'stopped';
    this.currentTask = null;
  }

  // ============================================================================
  // 抽象方法 - 子类必须实现
  // ============================================================================

  /**
   * 观察环境与任务
   */
  protected abstract observe(task: Task): any;

  /**
   * 分析任务需求
   */
  protected abstract analyze(task: Task): Promise<any>;

  /**
   * 创建执行计划
   */
  protected abstract createPlan(thought: ThoughtProcess): Promise<any>;

  /**
   * 执行计划
   */
  protected abstract execute(plan: any): Promise<any>;

  /**
   * 评估执行结果
   */
  protected abstract evaluate(result: any): Promise<void>;

  // ============================================================================
  // 辅助方法
  // ============================================================================

  protected generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
