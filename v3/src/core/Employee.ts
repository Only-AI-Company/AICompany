/**
 * AI Company v3 - Employee
 *
 * 员工：执行任务的单元
 *
 * 职责：
 * 1. 执行分配的任务
 * 2. 使用工具完成任务
 * 3. 记忆和进化
 */

import type { Employee, Task, TaskResult, Tool } from './types.js';
import type { Message } from './ai/types.js';
import { getAIProvider } from './ai/AIProvider.js';
import { getDefaultToolRegistry } from './tools/ToolRegistry.js';
import type { ToolCallRequest } from './tools/types.js';
import { ensureWorkspaceDir, getTaskWorkspacePath, parseJSON } from './utils.js';

// ============================================================================
// Employee
// ============================================================================

export class EmployeeImpl implements Employee {
  id: string;
  name: string;
  role: string;
  skills: string[];
  level: number;
  performance: number;
  satisfaction: number;
  systemPrompt: string;
  capabilities: string[];
  createdAt: number;
  lastUsedAt?: number;

  // 工具注册表
  private toolRegistry = getDefaultToolRegistry();

  // AI Provider
  private aiProvider = getAIProvider();

  constructor(data: Omit<Employee, 'lastUsedAt'>) {
    this.id = data.id;
    this.name = data.name;
    this.role = data.role;
    this.skills = data.skills;
    this.level = data.level;
    this.performance = data.performance;
    this.satisfaction = data.satisfaction;
    this.systemPrompt = data.systemPrompt;
    this.capabilities = data.capabilities;
    this.createdAt = data.createdAt;
  }

  /**
   * 执行任务
   */
  async execute(task: Task): Promise<TaskResult> {
    console.log(`\n[${this.name}] Executing: "${task.description}"`);

    const startTime = Date.now();

    try {
      // 使用 LLM + 工具执行任务
      const result = await this.executeWithLLMAndTools(task);

      const duration = Date.now() - startTime;

      // 更新最后使用时间
      this.lastUsedAt = Date.now();

      return {
        success: true,
        output: result,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        error: error.message,
        duration,
      };
    }
  }

  /**
   * 进化（学习新技能）
   */
  evolve(newSkills: string[]): void {
    console.log(`\n[${this.name}] Evolving...`);

    // 添加新技能
    for (const skill of newSkills) {
      if (!this.skills.includes(skill)) {
        this.skills.push(skill);
        console.log(`  + Learned: ${skill}`);
      }
    }

    // 更新系统提示词
    this.updateSystemPrompt();

    console.log(`[${this.name}] Evolution complete. Skills: ${this.skills.join(', ')}`);
  }

  /**
   * 升级
   */
  levelUp(): void {
    if (this.level < 10) {
      this.level++;
      console.log(`[${this.name}] Level up! Now level ${this.level}`);
    }
  }

  /**
   * 更新绩效
   */
  updatePerformance(delta: number): void {
    this.performance = Math.max(0, Math.min(100, this.performance + delta));
    console.log(`[${this.name}] Performance: ${this.performance}/100 (${delta > 0 ? '+' : ''}${delta})`);
  }

  /**
   * 注册工具（已废弃，使用 toolRegistry）
   */
  registerTool(tool: Tool): void {
    console.log(`[${this.name}] registerTool is deprecated, use toolRegistry instead`);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * 使用 LLM + 工具执行任务
   */
  private async executeWithLLMAndTools(task: Task): Promise<string> {
    const tools = this.toolRegistry.toAnthropicTools();

    const userPrompt = `
任务：${task.description}
${task.input ? `用户输入：${task.input}` : ''}

请执行这个任务。你可以使用可用的工具来完成任务。

可用工具：
${this.toolRegistry.getToolNames().join(', ')}

如果需要使用工具，请调用相应的工具。否则直接返回执行结果。
`;

    try {
      // 第一次调用 LLM
      let response = await this.aiProvider.promptWithTools(
        userPrompt,
        this.systemPrompt,
        tools
      );

      // 处理工具调用循环
      let toolResults: string[] = [];
      let maxIterations = 10; // 防止无限循环

      while (response.stopReason === 'tool_use' && maxIterations > 0) {
        maxIterations--;

        // 执行工具调用
        const toolCalls = response.toolCalls || [];
        for (const toolCall of toolCalls) {
          const result = await this.executeToolCall(toolCall, task);
          toolResults.push(`Tool "${toolCall.name}" result: ${result.output || result.error}`);
        }

        // 将工具结果反馈给 LLM
        response = await this.aiProvider.continueWithToolResults(
          response,
          toolResults,
          tools
        );
      }

      // 返回最终结果
      const finalContent = typeof response.content === 'string'
        ? response.content
        : response.getText?.() || JSON.stringify(response.content);

      return finalContent;
    } catch (error: any) {
      // Fallback: 不使用工具，直接调用 LLM
      console.warn(`[${this.name}] Tool use failed, using fallback:`, error.message);
      return await this.executeWithSimpleLLM(task);
    }
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(
    toolCall: ToolCallRequest,
    task: Task
  ): Promise<import('./tools/types.js').ToolResult> {
    console.log(`[${this.name}] Executing tool: ${toolCall.name}`);

    let workspace = getTaskWorkspacePath(task.id);
    try {
      await ensureWorkspaceDir(workspace);
    } catch (error: any) {
      console.warn(`[${this.name}] Failed to ensure workspace: ${error.message}`);
      workspace = process.cwd();
    }

    return await this.toolRegistry.executeTool(
      toolCall.name,
      toolCall.arguments,
      {
        employeeId: this.id,
        taskId: task.id,
        workspace,
      }
    );
  }

  /**
   * 简单的 LLM 调用（无工具）
   */
  private async executeWithSimpleLLM(task: Task): Promise<string> {
    const userPrompt = `
任务：${task.description}
${task.input ? `用户输入：${task.input}` : ''}

请执行这个任务，返回执行结果。
`;

    const response = await this.aiProvider.prompt(userPrompt, this.systemPrompt);

    return typeof response.content === 'string'
      ? response.content
      : response.getText?.() || JSON.stringify(response.content);
  }

  /**
   * 更新系统提示词
   */
  private updateSystemPrompt(): void {
    this.systemPrompt = `
你是 ${this.name}，一个 ${this.role}。

你的技能：
${this.skills.map(s => `- ${s}`).join('\n')}

你的等级：${this.level}/10
你的绩效：${this.performance}/100

请使用你的技能完成任务。
`.trim();
  }
}

// ============================================================================
// Employee Factory
// ============================================================================

export class EmployeeFactory {
  /**
   * 创建默认员工
   */
  static createDefaultEmployees(): EmployeeImpl[] {
    return [
      // 小红书专员
      new EmployeeImpl({
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
      }),

      // 内容创作
      new EmployeeImpl({
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
      }),

      // 数据分析
      new EmployeeImpl({
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
      }),
    ];
  }

  /**
   * 创建自定义员工
   */
  static createCustomEmployee(
    name: string,
    role: string,
    skills: string[]
  ): EmployeeImpl {
    return new EmployeeImpl({
      id: `emp_${Date.now()}`,
      name,
      role,
      skills,
      level: 1,
      performance: 50,
      satisfaction: 70,
      systemPrompt: `你是${name}，一个${role}。`,
      capabilities: skills,
      createdAt: Date.now(),
    });
  }
}
