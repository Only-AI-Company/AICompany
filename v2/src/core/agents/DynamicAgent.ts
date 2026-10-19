/**
 * AI Company v2 - Dynamic Agent
 *
 * 动态 Agent - 由 AgentFactory 根据需求动态生成
 * - 每个任务使用独立的 Claude CLI Session
 * - 任务完成后 Session 自动清理
 * - 支持并行任务执行
 */

import type {
  AgentTask,
  AgentTaskResult,
  AgentStatus,
  AgentState,
  AgentCapability,
  AgentDefinition,
} from './types.js';
import { getAPIAgentExecutor } from '../execution/APIAgentExecutor.js';
import { getTaskSessionManager } from '../execution/TaskSessionManager.js';

/**
 * 动态 Agent
 *
 * 核心特性：
 * - 由能力 (capabilities) 定义，而非角色
 * - 每个任务有独立的 PTY Session
 * - Session 与 Task 生命周期绑定
 */
export class DynamicAgent {
  readonly id: string;
  readonly name: string;
  readonly role: string | undefined;
  readonly capabilities: AgentCapability[];
  readonly systemPrompt: string;

  protected state: AgentState = 'idle';
  protected completedTasksCount = 0;
  protected failedTasksCount = 0;
  protected lastActiveAt?: number;
  protected activeTaskIds = new Set<string>();

  constructor(
    private definition: AgentDefinition
  ) {
    this.id = definition.id;
    this.name = definition.name;
    this.role = definition.role;
    this.capabilities = definition.capabilities;
    this.systemPrompt = definition.systemPrompt;
  }

  /**
   * 初始化 Agent
   */
  async initialize(): Promise<void> {
    const roleLabel = this.role ? ` (${this.role})` : '';
    console.log(`[DynamicAgent] ${this.name}${roleLabel} initialized`);
    console.log(`[DynamicAgent] Capabilities: [${this.capabilities.join(', ')}]`);
    this.state = 'idle';
  }

  /**
   * 检查是否能执行任务（能力匹配）
   *
   * 支持模糊匹配：
   * - 完全匹配：字符串完全相同 → 匹配
   * - 同义匹配：能力是同义词 → 匹配
   * - 包含匹配：员工能力包含所需能力（或反之） → 匹配
   */
  canExecute(task: AgentTask): boolean {
    const requiredCaps = task.requiredCapabilities || [];
    if (requiredCaps.length === 0) return true;

    // 检查是否有必需的能力（支持模糊匹配）
    for (const reqCap of requiredCaps) {
      const hasMatch = this.capabilities.some(empCap =>
        this.isCapabilityMatch(reqCap, empCap)
      );
      if (!hasMatch) {
        return false;
      }
    }

    return true;
  }

  /**
   * 检查两个能力是否匹配（简化版：完全匹配 或 包含匹配）
   *
   * 不再使用硬编码的同义词列表。
   * 复杂的能力匹配判断交给 LLM 在高层级决策时处理。
   */
  private isCapabilityMatch(required: string, employee: string): boolean {
    // 1. 完全匹配
    if (required === employee) return true;

    // 2. 包含匹配
    if (employee.includes(required) || required.includes(employee)) return true;

    // 3. 其他情况：返回 false，让 LLM 在 Agent 决策时判断
    return false;
  }

  /**
   * 执行任务
   *
   * 核心流程：
   * 1. 检查能力匹配
   * 2. 使用 API Agent Executor 执行任务（替代 PTY）
   * 3. 记录结果
   *
   * 支持并行任务执行：多个任务可同时执行
   */
  async executeTask(task: AgentTask): Promise<AgentTaskResult> {
    // 检查能力匹配
    if (!this.canExecute(task)) {
      return {
        taskId: task.id,
        success: false,
        error: `Agent lacks required capabilities. Has: [${this.capabilities.join(', ')}], needs: [${task.requiredCapabilities?.join(', ') || 'none'}]`,
      };
    }

    // 更新状态为 busy（但不阻塞其他任务）
    this.updateStateForNewTask();
    this.activeTaskIds.add(task.id);

    const startTime = Date.now();

    try {
      console.log(`[DynamicAgent] ${this.name} executing task ${task.id} (active tasks: ${this.activeTaskIds.size})...`);
      console.log(`[DynamicAgent] Task: ${task.description.substring(0, 80)}...`);

      // 1. 获取 API Agent Executor（每个 agent 独立）
      const executor = getAPIAgentExecutor({
        agentId: this.id,
        agentName: this.name,
        systemPrompt: this.systemPrompt,
        maxTurns: 10,
        timeout: 300000,
      });

      // 2. 构建完整任务描述
      const fullTask = this.buildPrompt(task);

      // 3. 执行任务（使用 API 模式）
      const result = await executor.execute(fullTask);

      // 4. 转换结果格式
      // 转换 artifacts 格式以匹配 AgentArtifact
      const artifacts = result.artifacts?.map(a => ({
        type: a.type as 'code' | 'document' | 'plan' | 'report' | 'data',
        name: a.path || a.type,
        content: a.content,
        path: a.path,
      }));

      const taskResult: AgentTaskResult = {
        taskId: task.id,
        success: result.success,
        output: result.output,
        error: result.error,
        artifacts,
        metadata: {
          duration: Date.now() - startTime,
        },
      };

      // 5. 记录结果
      if (result.success) {
        this.recordTaskCompletion();
      } else {
        this.recordTaskFailure();
      }

      // 6. 更新状态（移除任务）
      this.activeTaskIds.delete(task.id);
      this.updateStateAfterTaskCompletion();

      return taskResult;

    } catch (error: any) {
      this.recordTaskFailure();

      // 更新状态（移除任务）
      this.activeTaskIds.delete(task.id);
      this.updateStateAfterTaskCompletion();

      return {
        taskId: task.id,
        success: false,
        error: error.message,
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * 更新状态以反映新任务开始
   */
  private updateStateForNewTask(): void {
    // 如果之前是 error 状态，重置为 busy
    if (this.state === 'error') {
      this.state = 'busy';
    } else if (this.state === 'idle') {
      this.state = 'busy';
    }
    // 如果已经是 busy，保持 busy
  }

  /**
   * 任务完成后更新状态
   */
  private updateStateAfterTaskCompletion(): void {
    // 如果还有活跃任务，保持 busy 状态
    if (this.activeTaskIds.size > 0) {
      this.state = 'busy';
    } else {
      // 没有活跃任务了，设置为 idle
      this.state = 'idle';
    }
  }

  /**
   * 构建完整提示词
   */
  private buildPrompt(task: AgentTask): string {
    const sections: string[] = [];

    // System Prompt
    sections.push(this.systemPrompt);

    // 任务描述
    sections.push('');
    sections.push('【当前任务】');
    sections.push(task.description);

    // 上下文
    if (task.context) {
      sections.push('');
      sections.push('【上下文】');
      sections.push(task.context);
    }

    // 优先级说明
    if (task.priority === 'critical' || task.priority === 'high') {
      sections.push('');
      sections.push('【注意】这是一个高优先级任务，请优先处理并确保质量。');
    }

    return sections.join('\n');
  }

  /**
   * 追加消息到正在运行的任务
   */
  appendToTask(taskId: string, message: string): void {
    if (!this.activeTaskIds.has(taskId)) {
      console.warn(`[DynamicAgent] Task ${taskId} is not active`);
      return;
    }

    const sessionManager = getTaskSessionManager();
    sessionManager.appendToTask(taskId, message);
  }

  /**
   * 中断正在运行的任务
   */
  interruptTask(taskId: string): void {
    if (!this.activeTaskIds.has(taskId)) {
      console.warn(`[DynamicAgent] Task ${taskId} is not active`);
      return;
    }

    const sessionManager = getTaskSessionManager();
    sessionManager.interruptTask(taskId);
    this.activeTaskIds.delete(taskId);
    this.setState('idle');
  }

  /**
   * 获取任务状态
   */
  getTaskState(taskId: string) {
    const sessionManager = getTaskSessionManager();
    return sessionManager.getTaskState(taskId);
  }

  /**
   * 处理消息
   */
  async handleMessage(message: any): Promise<void> {
    console.log(`[DynamicAgent] ${this.name} received message`);
  }

  /**
   * 获取状态
   */
  getStatus(): AgentStatus {
    return {
      id: this.id,
      name: this.name,
      state: this.state,
      capabilities: this.capabilities,
      currentTaskId: this.activeTaskIds.size > 0 ? Array.from(this.activeTaskIds)[0] : undefined,
      activeTaskIds: this.activeTaskIds.size > 0 ? Array.from(this.activeTaskIds) : [],
      activeTasksCount: this.activeTaskIds.size,
      completedTasks: this.completedTasksCount,
      failedTasks: this.failedTasksCount,
      lastActiveAt: this.lastActiveAt,
    };
  }

  /**
   * 重置 Agent
   */
  reset(): void {
    this.state = 'idle';
    this.activeTaskIds.clear();
  }

  /**
   * 获取定义
   */
  getDefinition(): AgentDefinition {
    return this.definition;
  }

  protected setState(state: AgentState): void {
    this.state = state;
    this.lastActiveAt = Date.now();
  }

  protected recordTaskCompletion(): void {
    this.completedTasksCount++;
    this.lastActiveAt = Date.now();
  }

  protected recordTaskFailure(): void {
    this.failedTasksCount++;
    this.lastActiveAt = Date.now();
  }
}
