/**
 * AI Company v2 - CEO 监督者 Agent
 *
 * 核心理念：
 * - CEO 是决策中枢，负责分析、审批、分配、审查
 * - 不直接执行任务，而是监督员工（执行者）完成
 * - 通过 LLM 实现智能决策，而不是硬编码规则
 *
 * 职责：
 * 1. analyzeRequirement - 分析用户需求，生成执行计划
 * 2. assessRisk - 评估任务风险等级
 * 3. selectEmployee - 根据能力需求选择员工
 * 4. makeDecision - 处理 PTY 劫持的决策请求
 * 5. reviewTask - 任务完成后进行复盘
 * 6. updateEmployeePerformance - 更新员工绩效
 */

import { getDatabase, type AIDatabase } from '../../db/Database.js';
import { getEventBus } from '../events/EventBus.js';
import type { AgentCapability } from '../agents/types.js';
import { getProvider, callWithRetry, type ProviderResponse } from '../ai/AIProvider.js';
import { getToolRegistry } from '../tools/ToolRegistry.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * CEO 需求分析结果（简化版）
 *
 * 只区分两种类型：查询 vs 执行
 */
export interface AnalysisResult {
  /** 类型：查询 or 执行 */
  type: 'query' | 'execute';

  // === query 类型字段 ===
  /** 查询类型（当 type=query 时） */
  queryType?: 'system_status' | 'employees' | 'tasks' | 'goals' | 'chat';
  /** 查询参数（可选） */
  queryParams?: Record<string, unknown>;

  // === execute 类型字段 ===
  /** 任务描述（当 type=execute 时） */
  taskDescription?: string;
  /** 所需能力（动态字符串数组） */
  requiredCapabilities?: string[];
  /** CEO 建议的员工 ID（可选） */
  suggestedEmployeeId?: string;

  // === 工具相关字段 ===
  /** 使用的工具名称（Function Calling） */
  toolName?: string;
  /** 工具输入参数 */
  toolInput?: Record<string, unknown>;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskAssessment {
  /** 风险等级 */
  level: RiskLevel;
  /** 风险因素列表 */
  factors: RiskFactor[];
  /** 是否需要 CEO 审批 */
  requiresApproval: boolean;
  /** 风险说明 */
  description?: string;
}

export interface RiskFactor {
  /** 风险类型 */
  type: 'data_loss' | 'external_call' | 'file_modification' | 'long_running' | 'unknown';
  /** 风险描述 */
  description: string;
  /** 风险等级 */
  level: RiskLevel;
}

export interface DecisionRequest {
  /** 决策 ID */
  decisionId: string;
  /** 任务 ID */
  taskId: string;
  /** 决策类型 */
  type: 'file_operation' | 'command_execution' | 'api_call' | 'user_confirmation';
  /** 决策描述 */
  description: string;
  /** 选项列表 */
  options: DecisionOption[];
}

export interface DecisionOption {
  /** 选项值 */
  value: string;
  /** 选项描述 */
  label: string;
  /** 风险说明 */
  risk?: string;
}

export interface Decision {
  /** 选中的选项 */
  selectedOption: string;
  /** 决策理由 */
  reasoning: string;
  /** 后续建议 */
  followUp?: string;
}

export interface ReviewResult {
  /** 是否成功 */
  success: boolean;
  /** 任务评分 (1-10) */
  score: number;
  /** 优点列表 */
  strengths: string[];
  /** 需要改进的方面 */
  improvements: string[];
  /** 经验教训 */
  lessonsLearned: string[];
  /** 是否更新员工绩效 */
  shouldUpdatePerformance: boolean;
}

export interface EmployeePerformanceUpdate {
  /** 员工 ID */
  employeeId: string;
  /** 绩效变化 */
  pointsDelta: number;
  /** 满意度变化 */
  satisfactionDelta?: number;
  /** 升级 */
  levelUp?: boolean;
  /** 绩效说明 */
  reason: string;
}

// ============================================================================
// CEO 监督者 Agent
// ============================================================================

export class CEOSupervisorAgent {
  private db: AIDatabase;
  private eventBus = getEventBus();
  private model: string = 'claude-sonnet-4-20250514';

  constructor() {
    this.db = getDatabase();
  }

  // ============================================================================
  // 1. 需求分析 (使用 Function Calling)
  // ============================================================================

  /**
   * 分析用户需求（使用 Function Calling）
   *
   * @param userInput 用户输入
   * @param chatId 聊天 ID（可选，用于加载历史）
   * @param history 聊天历史（可选）
   * @returns 分析结果
   */
  async analyzeRequirement(
    userInput: string,
    chatId?: string,
    history?: Array<{ role: string; content: string }>
  ): Promise<AnalysisResult> {
    console.log(`[CEO] 分析需求："${userInput.substring(0, 100)}..."`);

    // 获取聊天历史（如果没有提供）
    const chatHistory = history || this.loadChatHistory(chatId);

    // 使用 LLM + Function Calling 分析意图
    const { prompt, system } = this.buildAnalysisPrompt(userInput, chatHistory);

    try {
      // 获取工具列表
      const toolRegistry = getToolRegistry();
      const tools = toolRegistry.toAnthropicSchemas();

      // 调用 LLM with tools
      const llmResult = await this.callLLMWithTools(prompt, tools, 'requirement_analysis', system);

      // 解析工具调用结果
      const result = this.parseToolCallResult(llmResult, userInput);

      console.log(`[CEO] 分析结果：type=${result.type}, queryType=${result.queryType || 'N/A'}, tool=${result.toolName || 'N/A'}`);

      // 记录分析活动
      this.db.logActivity({
        eventType: 'ceo.analysis',
        actor: 'ceo',
        action: 'analyze_requirement',
        context: {
          input: userInput.substring(0, 100),
          resultType: result.type,
          queryType: result.queryType,
          toolName: result.toolName,
          chatId,
        },
      });

      return result;
    } catch (error: any) {
      console.error('[CEO] Function Calling 失败:', error);
      // 直接抛出错误，不 fallback
      throw new Error(`CEO 分析失败: ${error.message}`);
    }
  }

  /**
   * 加载聊天历史
   */
  private loadChatHistory(chatId?: string): Array<{ role: string; content: string }> {
    if (!chatId) return [];

    try {
      // 从数据库加载最近的聊天历史
      const messages = this.db.getChatHistory(chatId, 10);
      return messages.map((msg: any) => ({
        role: msg.direction === 'in' ? 'user' : 'assistant',
        content: msg.content,
      }));
    } catch (error) {
      console.warn('[CEO] 加载聊天历史失败:', error);
      return [];
    }
  }

  /**
   * 解析 LLM 返回结果
   */
  private parseToolCallResult(llmResult: string, userInput: string): AnalysisResult {
    try {
      // 清理可能的 markdown 代码块包裹
      const cleanedResult = this.extractJSONFromLLMResponse(llmResult);

      // 尝试解析为 JSON
      const data = JSON.parse(cleanedResult);

      // 验证必要字段
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format');
      }

      // 验证 type 字段
      if (data.type !== 'query' && data.type !== 'execute') {
        throw new Error('Missing or invalid type field');
      }

      // 如果是 query 类型
      if (data.type === 'query') {
        if (!data.queryType) {
          // 默认为 chat
          data.queryType = 'chat';
        }
        return {
          type: 'query',
          queryType: data.queryType,
        };
      }

      // 如果是 execute 类型
      if (data.type === 'execute') {
        if (!data.taskDescription) {
          data.taskDescription = userInput;
        }
        if (!data.requiredCapabilities || !Array.isArray(data.requiredCapabilities)) {
          data.requiredCapabilities = ['analysis'];
        }
        return {
          type: 'execute',
          taskDescription: data.taskDescription,
          requiredCapabilities: data.requiredCapabilities,
        };
      }

      // Fallback
      return {
        type: 'execute',
        taskDescription: userInput,
        requiredCapabilities: ['analysis'],
      };

    } catch (error) {
      console.error('[CEO] 解析 LLM 返回失败:', error);
      console.error('[CEO] 原始响应（前 200 字符）:', llmResult.substring(0, 200));
      console.error('[CEO] 清理后响应（前 200 字符）:', this.extractJSONFromLLMResponse(llmResult).substring(0, 200));

      // 更安全的 fallback：默认为闲聊，而不是执行任务
      // 这样避免把所有无法解析的输入都当成任务来执行
      return {
        type: 'query',
        queryType: 'chat',
      };
    }
  }

  /**
   * 将工具调用转换为分析结果
   */
  private convertToolCallToAnalysis(toolCall: any, userInput: string): AnalysisResult {
    const toolName = toolCall.name;
    const input = toolCall.input || {};

    // 查询类工具
    const queryTools: Record<string, string> = {
      'query_system_status': 'system_status',
      'list_employees': 'employees',
      'list_tasks': 'tasks',
      'list_goals': 'goals',
    };

    if (queryTools[toolName]) {
      return {
        type: 'query',
        queryType: queryTools[toolName] as any,
        queryParams: input,
        toolName,
      };
    }

    // chat 工具
    if (toolName === 'chat') {
      return {
        type: 'query',
        queryType: 'chat',
        toolName,
      };
    }

    // 执行类工具（create_goal, create_task 等）
    // 将工具调用转换为 execute 类型
    const description = input.description || input.title || input.name || userInput;

    // 从工具输入中提取能力
    const capabilities = this.extractCapabilities(input);

    return {
      type: 'execute',
      taskDescription: description,
      requiredCapabilities: capabilities,
      toolName,
      toolInput: input,
    };
  }

  /**
   * 从工具输入中提取所需能力
   */
  private extractCapabilities(input: any): string[] {
    const capabilities: string[] = [];

    // 根据不同的工具类型提取能力
    if (input.type || input.goalType) {
      // Goal 相关需要规划能力
      capabilities.push('planning');
    }

    if (input.description || input.content) {
      const desc = (input.description || input.content).toLowerCase();

      // 根据描述推断能力
      if (desc.includes('代码') || desc.includes('开发') || desc.includes('程序')) {
        capabilities.push('coding');
      }
      if (desc.includes('写') || desc.includes('文案') || desc.includes('文章')) {
        capabilities.push('writing');
      }
      if (desc.includes('分析') || desc.includes('数据') || desc.includes('统计')) {
        capabilities.push('analysis');
      }
      if (desc.includes('设计') || desc.includes('方案')) {
        capabilities.push('planning');
      }
    }

    return capabilities.length > 0 ? capabilities : ['analysis'];
  }

  /**
   * 转换旧格式为新格式
   */
  private convertToNewFormat(old: any, userInput: string): AnalysisResult {
    // 如果已经是新格式
    if (old.type === 'query' || old.type === 'execute') {
      return old as AnalysisResult;
    }

    // 转换旧格式
    if (old.intentType === 'query_status' || old.intentType === 'chat') {
      return {
        type: 'query',
        queryType: old.intentType,
      };
    }

    // 默认为 execute
    return {
      type: 'execute',
      taskDescription: old.taskDescription || userInput,
      requiredCapabilities: old.requiredCapabilities || ['analysis'],
    };
  }

  /**
   * 构建分析提示（包含聊天历史）
   */
  private buildAnalysisPrompt(
    userInput: string,
    chatHistory: Array<{ role: string; content: string }>
  ): { prompt: string; system: string } {
    // 构建聊天上下文
    let chatContext = '';
    if (chatHistory.length > 0) {
      chatContext = '\n\n最近的对话历史：\n' + chatHistory
        .slice(-5) // 只保留最近 5 条
        .map(msg => `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content.substring(0, 100)}`)
        .join('\n');
    }

    const systemPrompt = `你是 AI Company 的 CEO，负责分析用户需求。

你的核心职责：判断用户意图是"查询信息"还是"执行任务"。

## 判断标准

**查询信息** (type=query)：
- 用户想了解系统状态（如"有多少任务"、"员工状态"）
- 用户想查看数据（如"今天的任务列表"）
- 问候、闲聊

**执行任务** (type=execute)：
- 用户想让系统做某事（如"帮我写代码"、"运营小红书"、"创建API"）
- 用户请求需要多个步骤才能完成
- 即使包含"查询"字样，但主要目的是做事

## 输出格式

**CRITICAL**: 必须且只能返回纯 JSON 格式，不要包含任何解释、markdown 代码块标记或其他文字。

返回 JSON：
{
  "type": "query" | "execute",
  "queryType": "system_status" | "employees" | "tasks" | "goals" | "chat"  // 仅当 type=query 时
  OR
  "taskDescription": "任务描述",  // 仅当 type=execute 时
  "requiredCapabilities": ["能力1", "能力2"]  // 仅当 type=execute 时
}

## 示例

输入："有多少个员工？" → {"type": "query", "queryType": "employees"}
输入："帮我运营小红书" → {"type": "execute", "taskDescription": "运营小红书账号", "requiredCapabilities": ["运营", "内容创作"]}
输入："你好" → {"type": "query", "queryType": "chat"}

只返回 JSON，不要其他内容。不要用 \`\`\`json ... \`\`\` 包裹。`;

    const userPrompt = `用户输入："${userInput}"${chatContext}

请分析用户意图，返回 JSON 格式的分析结果。`;

    return { prompt: userPrompt, system: systemPrompt };
  }

  /**
   * 调用 LLM 分析意图
   */
  private async callLLMWithTools(
    prompt: string,
    tools: any[],
    purpose: string,
    systemPrompt?: string
  ): Promise<string> {
    console.log(`[CEO] 调用 LLM (${purpose})...`);

    const provider = getProvider();

    try {
      // 构建消息
      const messages = [{ role: 'user' as const, content: prompt }];

      // 使用 provider.messages（不需要工具，只需要返回 JSON）
      const response = await provider.messages(messages, systemPrompt);

      // 提取文本内容（response.content 可能是字符串或内容块数组）
      let content = response.content;
      if (Array.isArray(content)) {
        // 从内容块数组中提取文本
        const textBlocks = content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text);
        content = textBlocks.join('');
      }

      // 记录原始响应用于调试
      console.log(`[CEO] LLM 原始响应 (${purpose}): ${content.substring(0, 200)}...`);

      return content;

    } catch (error: any) {
      console.error(`[CEO] LLM 调用失败 (${purpose}): ${error.message}`);

      // 记录 LLM 失败活动
      try {
        this.db.logActivity({
          eventType: 'ceo.llm_error',
          actor: 'ceo',
          action: 'llm_call_failed',
          context: {
            purpose,
            providerType: provider.getType(),
            error: error.message,
          },
        });
      } catch {}

      // 使用 Fallback 响应
      console.log(`[CEO] 使用 Fallback 响应 (${purpose})`);
      return this.getMockResponse(purpose);
    }
  }

  /**
   * 清理能力列表（不进行硬编码过滤）
   */
  private cleanCapabilities(caps: any[]): string[] {
    if (!Array.isArray(caps) || caps.length === 0) {
      return ['analysis'];
    }

    const cleaned = caps
      .map(c => String(c).toLowerCase().trim())
      .filter(c => c.length > 0);

    // 去重
    const unique = [...new Set(cleaned)];

    return unique.length > 0 ? unique : ['analysis'];
  }

  // ============================================================================
  // 2. 风险评估
  // ============================================================================

  /**
   * 评估任务风险
   *
   * @param taskDescription 任务描述
   * @param capabilities 所需能力
   * @returns 风险评估结果
   */
  async assessRisk(
    taskDescription: string,
    capabilities: AgentCapability[]
  ): Promise<RiskAssessment> {
    console.log(`[CEO] 评估风险："${taskDescription.substring(0, 100)}..."`);

    const { prompt, system } = this.buildRiskAssessmentPrompt(taskDescription, capabilities);
    const llmResult = await this.callLLM(prompt, 'risk_assessment', system);

    try {
      const parsed = JSON.parse(llmResult) as RiskAssessment;

      // 验证必要字段
      if (!parsed.level) {
        parsed.level = 'medium';
      }
      if (!parsed.factors) {
        parsed.factors = [];
      }
      if (parsed.requiresApproval === undefined) {
        parsed.requiresApproval = parsed.level === 'high' || parsed.level === 'critical';
      }

      console.log(`[CEO] 风险评估：level=${parsed.level}, requiresApproval=${parsed.requiresApproval}`);

      return parsed;
    } catch (error) {
      console.error('[CEO] 解析风险评估失败:', error);
      // Fallback: 中等风险，需要审批
      return {
        level: 'medium',
        factors: [],
        requiresApproval: false,
        description: '无法完成风险评估，默认中等风险',
      };
    }
  }

  private buildRiskAssessmentPrompt(
    taskDescription: string,
    capabilities: AgentCapability[]
  ): { prompt: string; system: string } {
    const systemPrompt = `你是 AI Company 的 CEO，负责评估任务风险。

你是公司的最高决策者，需要：
1. 识别潜在风险
2. 评估风险等级
3. 决定是否需要审批

**CRITICAL**: 必须且只能返回纯 JSON 格式，不要包含任何解释、markdown 代码块标记或其他文字。`;

    const userPrompt = `任务描述："${taskDescription}"
所需能力：${capabilities.join(', ')}

请评估任务风险，返回 JSON 格式:
{
  "level": "low" | "medium" | "high" | "critical",
  "factors": [
    {
      "type": "data_loss" | "external_call" | "file_modification" | "long_running" | "unknown",
      "description": "string",
      "level": "low" | "medium" | "high" | "critical"
    }
  ],
  "requiresApproval": boolean,
  "description": "string (可选)"
}

风险因素类型:
- data_loss: 可能导致数据丢失
- external_call: 需要调用外部 API 或服务
- file_modification: 需要修改/创建文件
- long_running: 可能运行时间较长
- unknown: 未知风险

需要审批的情况:
- 风险等级为 high 或 critical
- 涉及数据删除或不可逆操作
- 涉及敏感信息或安全问题

只返回 JSON，不要其他内容。不要用 \`\`\`json ... \`\`\` 包裹。`;

    return { prompt: userPrompt, system: systemPrompt };
  }

  // ============================================================================
  // 3. 员工选择
  // ============================================================================

  /**
   * 选择最合适的员工
   *
   * @param requiredCapabilities 所需能力列表
   * @returns 选中的员工 ID 和匹配分数
   */
  async selectEmployee(
    requiredCapabilities: AgentCapability[]
  ): Promise<{ employeeId: string; matchScore: number; name: string } | null> {
    console.log(`[CEO] 选择员工，所需能力：${requiredCapabilities.join(', ')}`);

    // 从数据库查询所有活跃员工
    const employees = this.db.prepare(`
      SELECT id, name, capabilities, status
      FROM employees
      WHERE status = 'active'
    `).all() as Array<{
      id: string;
      name: string;
      capabilities: string;
      status: string;
    }>;

    if (employees.length === 0) {
      console.warn('[CEO] 没有活跃员工');
      return null;
    }

    // 计算每个员工的匹配分数
    const scored = employees.map(emp => {
      try {
        const empCaps = JSON.parse(emp.capabilities) as AgentCapability[];
        const score = this.calculateMatchScore(requiredCapabilities, empCaps);
        return {
          employeeId: emp.id,
          name: emp.name,
          matchScore: score,
          capabilities: empCaps,
        };
      } catch (e) {
        return {
          employeeId: emp.id,
          name: emp.name,
          matchScore: 0,
          capabilities: [] as AgentCapability[],
        };
      }
    });

    // 按分数排序
    scored.sort((a, b) => b.matchScore - a.matchScore);

    const best = scored[0];

    if (best.matchScore === 0) {
      console.warn(`[CEO] 没有匹配的员工，最低分：${best.name} (${best.matchScore})`);
      // 仍然返回分数最高的，即使为 0
    }

    console.log(`[CEO] 选中员工：${best.name} (${best.matchScore}分)`);

    // 记录员工选择活动
    this.db.logActivity({
      eventType: 'ceo.selection',
      actor: 'ceo',
      action: 'select_employee',
      context: {
        requiredCapabilities,
        selectedEmployeeId: best.employeeId,
        selectedName: best.name,
        matchScore: best.matchScore,
        allScores: scored.map(s => ({ name: s.name, score: s.matchScore })),
      },
    });

    return {
      employeeId: best.employeeId,
      matchScore: best.matchScore,
      name: best.name,
    };
  }

  /**
   * 计算匹配分数（简化版：完全匹配 或 LLM 判断）
   *
   * 不再使用硬编码的同义词列表。能力匹配由 LLM 在 Agent 决策时动态判断。
   *
   * 这里只做简单匹配：
   * 1. 完全匹配：10 分
   * 2. 包含匹配：5 分
   * 3. 其他：0 分（交给 LLM 在高层级决策）
   */
  private calculateMatchScore(
    required: string[],
    employeeCaps: string[]
  ): number {
    if (required.length === 0) return 0;

    let totalScore = 0;

    for (const reqCap of required) {
      let bestMatchScore = 0;

      for (const empCap of employeeCaps) {
        const score = this.calculateSingleMatch(reqCap, empCap);
        if (score > bestMatchScore) {
          bestMatchScore = score;
        }
      }

      totalScore += bestMatchScore;
    }

    return Math.round(totalScore / required.length);
  }

  /**
   * 计算单个能力的匹配分数（简化版）
   *
   * 移除了硬编码的同义词和语义映射。
   * 复杂的能力匹配判断交给 LLM 在 decideAgentStrategy 时动态处理。
   */
  private calculateSingleMatch(required: string, employee: string): number {
    // 1. 完全匹配
    if (required === employee) {
      return 10;
    }

    // 2. 包含匹配（简单的字符串包含）
    if (employee.includes(required) || required.includes(employee)) {
      return 5;
    }

    // 3. 其他情况：返回 0，让 LLM 在 Agent 决策时判断
    return 0;
  }

  // ============================================================================
  // 4. 决策处理
  // ============================================================================

  /**
   * 处理决策请求
   *
   * @param request 决策请求
   * @returns 决策结果
   */
  async makeDecision(request: DecisionRequest): Promise<Decision> {
    console.log(`[CEO] 处理决策请求：${request.decisionId} (${request.type})`);

    const prompt = this.buildDecisionPrompt(request);
    const llmResult = await this.callLLM(prompt, 'decision_making');

    try {
      const parsed = JSON.parse(llmResult) as Decision;

      // 验证必要字段
      if (!parsed.selectedOption) {
        parsed.selectedOption = request.options[0]?.value || '';
      }
      if (!parsed.reasoning) {
        parsed.reasoning = '自动决策';
      }

      console.log(`[CEO] 决策：${request.decisionId} -> ${parsed.selectedOption}`);

      // 记录决策活动
      this.db.logActivity({
        eventType: 'ceo.decision',
        actor: 'ceo',
        action: 'make_decision',
        context: {
          decisionId: request.decisionId,
          taskId: request.taskId,
          decisionType: request.type,
          description: request.description,
        },
        result: {
          selectedOption: parsed.selectedOption,
          reasoning: parsed.reasoning,
        },
      });

      // 发出决策事件
      this.eventBus.emit({
        type: 'decision.made' as any,
        decisionId: request.decisionId,
        taskId: request.taskId,
        decision: parsed,
        timestamp: Date.now(),
      });

      return parsed;
    } catch (error) {
      console.error('[CEO] 解析决策失败:', error);
      // Fallback: 选择最安全的选项（跳过或拒绝）
      const safeOption = request.options.find(o =>
        o.label.toLowerCase().includes('否') ||
        o.label.toLowerCase().includes('跳过') ||
        o.label.toLowerCase().includes('no') ||
        o.label.toLowerCase().includes('skip')
      ) || request.options[0];

      return {
        selectedOption: safeOption?.value || '',
        reasoning: 'LLM 调用失败，使用 Fallback：选择最安全的选项',
      };
    }
  }

  private buildDecisionPrompt(request: DecisionRequest): string {
    const optionsText = request.options
      .map((o, i) => `${i + 1}. ${o.label} (${o.value})${o.risk ? ` - 风险：${o.risk}` : ''}`)
      .join('\n');

    return `你是 AI Company 的 CEO，需要做出决策。

决策请求:
- ID: ${request.decisionId}
- 任务 ID: ${request.taskId}
- 类型：${request.type}
- 描述：${request.description}

选项:
${optionsText}

请分析各个选项的利弊，选择最佳方案。

**CRITICAL**: 必须且只能返回纯 JSON 格式，不要包含任何解释、markdown 代码块标记或其他文字。

返回 JSON 格式:
{
  "selectedOption": "选中的选项值",
  "reasoning": "决策理由",
  "followUp": "后续建议 (可选)"
}

只返回 JSON，不要其他内容。不要用 \`\`\`json ... \`\`\` 包裹。`;
  }

  // ============================================================================
  // 5. 任务复盘
  // ============================================================================

  /**
   * 复盘任务
   *
   * @param taskId 任务 ID
   * @param taskDescription 任务描述
   * @param result 任务结果
   * @returns 复盘结果
   */
  async reviewTask(
    taskId: string,
    taskDescription: string,
    result: { success: boolean; output?: string; error?: string; duration?: number }
  ): Promise<ReviewResult> {
    console.log(`[CEO] 复盘任务：${taskId}, 成功=${result.success}`);

    const { prompt, system } = this.buildReviewPrompt(taskDescription, result);
    const llmResult = await this.callLLM(prompt, 'task_review', system);

    try {
      // 清理 LLM 返回的内容：移除可能的 markdown 代码块包裹
      const cleanedResult = this.extractJSONFromLLMResponse(llmResult);
      const parsed = JSON.parse(cleanedResult) as ReviewResult;

      // 验证必要字段
      if (parsed.success === undefined) {
        parsed.success = result.success;
      }
      if (!parsed.score) {
        parsed.score = result.success ? 7 : 3;
      }
      if (!parsed.strengths) {
        parsed.strengths = [];
      }
      if (!parsed.improvements) {
        parsed.improvements = [];
      }
      if (!parsed.lessonsLearned) {
        parsed.lessonsLearned = [];
      }
      if (parsed.shouldUpdatePerformance === undefined) {
        parsed.shouldUpdatePerformance = true;
      }

      console.log(`[CEO] 复盘完成：评分=${parsed.score}, 更新绩效=${parsed.shouldUpdatePerformance}`);

      // 记录复盘活动
      this.db.logActivity({
        eventType: 'ceo.review',
        actor: 'ceo',
        action: 'review_task',
        context: {
          taskId,
          taskDescription: taskDescription.substring(0, 100),
          taskSuccess: result.success,
          duration: result.duration,
        },
        result: {
          score: parsed.score,
          strengths: parsed.strengths,
          improvements: parsed.improvements,
          shouldUpdatePerformance: parsed.shouldUpdatePerformance,
        },
      });

      return parsed;
    } catch (error) {
      console.error('[CEO] 解析复盘结果失败:', error);
      // Fallback: 简单复盘
      return {
        success: result.success,
        score: result.success ? 6 : 4,
        strengths: result.success ? ['任务完成'] : [],
        improvements: result.error ? ['错误处理'] : [],
        lessonsLearned: [],
        shouldUpdatePerformance: true,
      };
    }
  }

  private buildReviewPrompt(
    taskDescription: string,
    result: { success: boolean; output?: string; error?: string; duration?: number }
  ): { prompt: string; system: string } {
    const systemPrompt = `你是 AI Company 的 CEO，需要对任务进行复盘。

你是公司的最高决策者，需要：
1. 客观评估任务结果
2. 识别优点和改进空间
3. 总结经验教训
4. 更新员工绩效

**CRITICAL**: 必须且只能返回纯 JSON 格式，不要包含任何解释、markdown 代码块标记或其他文字。`;

    const userPrompt = `任务描述："${taskDescription}"

任务结果:
- 成功：${result.success ? '是' : '否'}
- 耗时：${result.duration ? `${result.duration}ms` : '未知'}
${result.output ? `- 输出：${result.output.substring(0, 500)}${result.output.length > 500 ? '...' : ''}` : ''}
${result.error ? `- 错误：${result.error}` : ''}

请给出复盘结果，返回 JSON 格式:
{
  "success": boolean,
  "score": number (1-10),
  "strengths": ["string"],
  "improvements": ["string"],
  "lessonsLearned": ["string"],
  "shouldUpdatePerformance": boolean
}

复盘指南:
- 成功的任务给 7-10 分，失败的任务给 1-5 分
- strengths: 做得好的地方
- improvements: 需要改进的地方
- lessonsLearned: 从这次任务中学到什么
- shouldUpdatePerformance: 是否应该更新员工绩效（通常都更新）

只返回 JSON，不要其他内容。不要用 \`\`\`json ... \`\`\` 包裹。`;

    return { prompt: userPrompt, system: systemPrompt };
  }

  // ============================================================================
  // 6. 员工绩效更新
  // ============================================================================

  /**
   * 更新员工绩效
   *
   * @param employeeId 员工 ID
   * @param reviewResult 复盘结果
   * @returns 绩效更新结果
   */
  async updateEmployeePerformance(
    employeeId: string,
    reviewResult: ReviewResult
  ): Promise<EmployeePerformanceUpdate | null> {
    console.log(`[CEO] 更新员工绩效：${employeeId}`);

    // 获取员工当前状态
    const employee = this.db.prepare(`
      SELECT id, name, points, level, satisfaction
      FROM employees
      WHERE id = ?
    `).get(employeeId) as any;

    if (!employee) {
      console.error(`[CEO] 员工不存在：${employeeId}`);
      return null;
    }

    // 计算绩效变化
    const pointsDelta = this.calculatePointsDelta(reviewResult);
    const satisfactionDelta = this.calculateSatisfactionDelta(reviewResult);

    // 检查是否升级
    const currentPoints = employee.points || 0;
    const newPoints = currentPoints + pointsDelta;
    const currentLevel = employee.level || 1;
    const levelThreshold = currentLevel * 100; // 每级需要 100 分
    const levelUp = newPoints >= levelThreshold;

    // 更新数据库
    const updateSql = `
      UPDATE employees
      SET points = points + ?,
          satisfaction = satisfaction + ?,
          level = ?
      WHERE id = ?
    `;

    this.db.prepare(updateSql).run(
      pointsDelta,
      satisfactionDelta,
      levelUp ? currentLevel + 1 : currentLevel,
      employeeId
    );

    const update: EmployeePerformanceUpdate = {
      employeeId,
      pointsDelta,
      satisfactionDelta,
      levelUp,
      reason: `任务复盘：${reviewResult.success ? '成功' : '失败'}，评分${reviewResult.score}/10`,
    };

    console.log(`[CEO] 绩效更新：${employee.name} +${pointsDelta}分，满意度${satisfactionDelta >= 0 ? '+' : ''}${satisfactionDelta}${levelUp ? '，升级!' : ''}`);

    // 发出绩效更新事件
    this.eventBus.emit({
      type: 'employee.performance_updated' as any,
      employeeId,
      update,
      timestamp: Date.now(),
    });

    return update;
  }

  private calculatePointsDelta(review: ReviewResult): number {
    // 基础分：成功 +10，失败 -5
    let delta = review.success ? 10 : -5;

    // 评分调整：每分 +/- 1
    delta += (review.score - 5);

    // 优点加分
    delta += review.strengths.length * 2;

    // 改进项减分
    delta -= review.improvements.length;

    return delta;
  }

  private calculateSatisfactionDelta(review: ReviewResult): number {
    // 成功 +1，失败 -1
    let delta = review.success ? 1 : -1;

    // 高分额外加分
    if (review.score >= 8) delta += 1;
    if (review.score <= 3) delta -= 1;

    // 限制在 -5 到 +5
    return Math.max(-5, Math.min(5, delta));
  }

  // ============================================================================
  // 工具方法
  // ============================================================================

  /**
   * 从 LLM 响应中提取纯 JSON 内容
   * 移除可能的 markdown 代码块包裹（如 ```json ... ```）
   * 并增强容错处理，处理不完整的 JSON
   */
  private extractJSONFromLLMResponse(response: string): string {
    let cleaned = response.trim();

    // 移除开头的 ```json 或 ```
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }

    // 移除结尾的 ```
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }

    // 再次 trim 确保没有多余空格
    cleaned = cleaned.trim();

    // 尝试修复不完整的 JSON（处理截断情况）
    cleaned = this.tryFixIncompleteJSON(cleaned);

    return cleaned;
  }

  /**
   * 尝试修复不完整的 JSON
   * 处理 LLM 响应被截断的情况（如缺少闭合括号）
   */
  private tryFixIncompleteJSON(json: string): string {
    try {
      // 如果已经可以解析，直接返回
      JSON.parse(json);
      return json;
    } catch (e) {
      // 尝试修复
      let fixed = json;

      // 计算括号数量
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      const openBrackets = (fixed.match(/\[/g) || []).length;
      const closeBrackets = (fixed.match(/\]/g) || []).length;

      // 补全缺失的闭合括号
      const missingCloseBraces = openBraces - closeBraces;
      const missingCloseBrackets = openBrackets - closeBrackets;

      if (missingCloseBraces > 0) {
        fixed += '}'.repeat(missingCloseBraces);
      }
      if (missingCloseBrackets > 0) {
        fixed += ']'.repeat(missingCloseBrackets);
      }

      // 尝试解析修复后的 JSON
      try {
        JSON.parse(fixed);
        return fixed;
      } catch (e2) {
        // 仍然无法解析，返回原始值（让调用者处理）
        return json;
      }
    }
  }

  private async callLLM(prompt: string, purpose: string, systemPrompt?: string): Promise<string> {
    console.log(`[CEO] 调用 LLM (${purpose})...`);

    const provider = getProvider();

    try {
      // 带重试的调用
      const response: ProviderResponse = await callWithRetry(
        () => systemPrompt
          ? provider.messages([{ role: 'user', content: prompt }], systemPrompt)
          : provider.prompt(prompt),
        {
          maxRetries: 3,  // 增加到 3 次重试
          initialDelay: 500,
        }
      );

      // 记录 Token 用量（用于监控和调试）
      if (response.usage) {
        console.log(`[CEO] LLM 用量：input=${response.usage.inputTokens}, output=${response.usage.outputTokens}`);
      }

      // 提取文本内容（response.content 可能是字符串或内容块数组）
      let content = response.content;
      if (Array.isArray(content)) {
        // 从内容块数组中提取文本
        const textBlocks = content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text);
        content = textBlocks.join('');
      }

      // 记录原始响应用于调试
      console.log(`[CEO] LLM 原始响应 (${purpose}): ${content.substring(0, 200)}...`);

      return content;
    } catch (error: any) {
      console.error(`[CEO] LLM 调用失败 (${purpose}): ${error.message}`);

      // 记录 LLM 失败活动
      try {
        this.db.logActivity({
          eventType: 'ceo.llm_error',
          actor: 'ceo',
          action: 'llm_call_failed',
          context: {
            purpose,
            error: error.message,
          },
        });
      } catch {}

      // 使用 Fallback 响应
      console.log(`[CEO] 使用 Fallback 响应 (${purpose})`);
      return this.getMockResponse(purpose);
    }
  }

  // ============================================================================
  // Agent 决策
  // ============================================================================

  /**
   * 决策使用现有 Agent 还是创建新 Agent
   *
   * 这是核心决策点：CEO 根据任务需求和现有 Agent 缓存，
   * 决定是复用已验证的 Agent，还是创建新的 Agent
   */
  async decideAgentStrategy(context: {
    task: {
      description: string;
      requiredCapabilities?: string[];
      type?: string;
    };
    employees: Array<{
      id: string;
      name: string;
      role: string;
      capabilities: string[];
    }>;
    availableAgents: Array<{
      id: string;
      employee_id: string;
      agent_name: string;
      agent_file: string;
      task_type: string;
      task_subtype: string | null;
      success_rate: number;
      usage_count: number;
    }>;
  }): Promise<{
    strategy: 'use_existing' | 'create_new';
    agentId?: string;
    agentFile?: string;
    employeeId?: string;
    newAgentConfig?: {
      employeeId: string;
      name: string;
      taskType: string;
      taskSubtype: string | null;
      prompt: string;
    };
    reason: string;
  }> {
    console.log(`[CEO] 🎯 Agent 决策 - 任务: ${context.task.description.substring(0, 50)}`);
    console.log(`[CEO] 📊 可用员工: ${context.employees.length} 个`);
    console.log(`[CEO] 📦 已缓存 Agents: ${context.availableAgents.length} 个`);

    // 构建决策提示词
    const prompt = this.buildAgentDecisionPrompt(context);
    const systemPrompt = `你是 AI 公司的 CEO，负责决策为任务选择合适的 Agent。

## 决策原则
1. **优先复用**：如果有成功率高的现有 Agent，优先使用
2. **成功率门槛**：现有 Agent 成功率 < 60% 时，考虑创建新的
3. **使用次数**：使用次数 < 3 的 Agent 视为不稳定，优先创建新的
4. **能力匹配**：Agent 必须具备任务所需的核心能力
5. **成本考虑**：复用优先于创建，除非现有 Agent 效果很差

**CRITICAL**: 必须且只能返回纯 JSON 格式，不要包含任何解释、markdown 代码块标记或其他文字。

## 输出格式
必须返回有效的 JSON：
{
  "strategy": "use_existing" | "create_new",
  "agentId": "agent_id（use_existing 时）",
  "agentFile": "~/.claude/agents/xxx.md（use_existing 时）",
  "employeeId": "employee_id",
  "reason": "决策原因",
  "newAgentConfig": {  // create_new 时
    "employeeId": "xxx",
    "name": "agent-name",
    "taskType": "code",
    "taskSubtype": "python",
    "prompt": "你是...的专家..."
  }  // create_new 时
}

只返回 JSON，不要其他内容。不要用 \`\`\`json ... \`\`\` 包裹。`;

    const response = await this.callLLM(prompt, 'agent_decision', systemPrompt);

    try {
      const result = JSON.parse(this.extractJSONFromLLMResponse(response));

      console.log(`[CEO] ✅ Agent 决策: ${result.strategy} - ${result.reason}`);

      // 后处理：智能修正（仅在极端情况下修正）
      if (result.strategy === 'create_new' && context.availableAgents.length > 0) {
        // 检查是否真的需要创建新 Agent
        const assessment = this.shouldRespectCreateDecision(context, result);

        if (!assessment.shouldCreate) {
          console.log(`[CEO] 🔄 修正决策：建议复用现有 Agent (${assessment.reason})`);
          return {
            strategy: 'use_existing',
            agentId: assessment.bestMatch!.id,
            agentFile: assessment.bestMatch!.agent_file,
            employeeId: assessment.bestMatch!.employee_id,
            reason: `决策优化：${assessment.reason}。${result.reason}`,
          };
        }
      }

      // 如果选择创建新 Agent，生成专业 prompt
      if (result.strategy === 'create_new' && result.newAgentConfig) {
        console.log(`[CEO] 📝 为新任务生成专业 prompt...`);

        // 获取成功 agent 的 prompt_content（从数据库）
        const agentsWithPrompts = await this.fetchAgentPrompts(context.availableAgents.slice(0, 3));

        // 使用 LLM 生成专业的 system prompt
        const professionalPrompt = await this.generateProfessionalPrompt({
          taskDescription: context.task.description,
          requiredCapabilities: context.task.requiredCapabilities || [],
          successfulAgents: agentsWithPrompts, // 参考最成功的3个
        });

        // 更新 prompt
        result.newAgentConfig.prompt = professionalPrompt;

        console.log(`[CEO] ✅ 专业 prompt 已生成 (${professionalPrompt.length} 字符)`);
      }

      return result;
    } catch (error) {
      console.error('[CEO] 解析 Agent 决策失败:', error);

      // Fallback: 简单规则
      const bestMatch = this.findBestAgentFallback(context);

      if (bestMatch && bestMatch.success_rate >= 0.6) {
        return {
          strategy: 'use_existing',
          agentId: bestMatch.id,
          agentFile: bestMatch.agent_file,
          employeeId: bestMatch.employee_id,
          reason: `LLM 解析失败，使用 Fallback：选择成功率最高的 Agent (${bestMatch.success_rate})`,
        };
      } else {
        // 创建新 Agent
        const employee = context.employees[0] || { id: 'emp-default', name: '默认员工' };
        const taskType = this.inferTaskType(context.task);
        const taskSubtype = this.inferTaskSubtype(context.task);

        // 获取成功 agent 的 prompt_content
        const agentsWithPrompts = await this.fetchAgentPrompts(context.availableAgents.slice(0, 3));

        // 生成专业 prompt
        const professionalPrompt = await this.generateProfessionalPrompt({
          taskDescription: context.task.description,
          requiredCapabilities: context.task.requiredCapabilities || [],
          successfulAgents: agentsWithPrompts,
        });

        return {
          strategy: 'create_new',
          newAgentConfig: {
            employeeId: employee.id,
            name: `${taskSubtype || taskType}-expert`,
            taskType,
            taskSubtype: taskSubtype || null,
            prompt: professionalPrompt,
          },
          reason: 'LLM 解析失败，使用 Fallback：没有合适的现有 Agent，创建新的',
        };
      }
    }
  }

  /**
   * 从数据库获取 Agent 的 prompt_content
   *
   * @param agents Agent 列表（不含 prompt_content）
   * @returns 带 prompt_content 的 Agent 列表
   */
  private async fetchAgentPrompts(agents: Array<{
    id: string;
    employee_id: string;
    agent_name: string;
    agent_file: string;
    task_type: string;
    task_subtype: string | null;
    success_rate: number;
    usage_count: number;
  }>): Promise<Array<{
    agent_name: string;
    prompt_content: string;
    success_rate: number;
    task_type: string;
    task_subtype: string | null;
  }>> {
    const result: Array<{
      agent_name: string;
      prompt_content: string;
      success_rate: number;
      task_type: string;
      task_subtype: string | null;
    }> = [];

    for (const agent of agents) {
      // 从数据库获取 prompt_content
      const row = this.db.prepare(`
        SELECT prompt_content
        FROM employee_agents
        WHERE id = ?
      `).get(agent.id) as { prompt_content: string } | undefined;

      if (row && row.prompt_content) {
        result.push({
          agent_name: agent.agent_name,
          prompt_content: row.prompt_content,
          success_rate: agent.success_rate,
          task_type: agent.task_type,
          task_subtype: agent.task_subtype,
        });
      }
    }

    return result;
  }

  /**
   * 生成专业的 Agent System Prompt
   *
   * 使用 LLM 根据任务需求和成功经验生成专业的 prompt
   */
  private async generateProfessionalPrompt(config: {
    taskDescription: string;
    requiredCapabilities: string[];
    successfulAgents: Array<{
      agent_name: string;
      prompt_content: string;
      success_rate: number;
      task_type: string;
      task_subtype: string | null;
    }>;
  }): Promise<string> {
    // 构建参考信息
    let referenceInfo = '';
    if (config.successfulAgents.length > 0) {
      referenceInfo = '\n\n## 参考的成功 Agent 模板：\n\n';
      for (const agent of config.successfulAgents) {
        referenceInfo += `### ${agent.agent_name}\n`;
        referenceInfo += `- 类型: ${agent.task_type}/${agent.task_subtype || '通用'}\n`;
        referenceInfo += `- 成功率: ${(agent.success_rate * 100).toFixed(1)}%\n`;
        referenceInfo += `- Prompt 片段:\n${agent.prompt_content.substring(0, 400)}...\n\n`;
      }
    }

    const prompt = `请为一个 AI Agent 设计专业的 system prompt。

## 任务需求
描述：${config.taskDescription}
所需能力：${config.requiredCapabilities.join(', ')}${referenceInfo}

## 设计要求

请生成一个专业的 AI Agent system prompt，必须包含以下部分：

1. **角色定位**（Role）
   - 明确这个 agent 的专业身份
   - 说明它的职责范围

2. **核心能力**（Core Capabilities）
   - 列出完成这个任务需要的专业技能
   - 具体说明每个能力的含义

3. **工作流程**（Workflow）
   - 给出清晰的执行步骤
   - 说明如何分析任务、如何使用工具、如何验证结果

4. **工具使用**（Tools）
   - 说明如何使用可用的工具（Bash、Read、Write、Edit、Glob、Grep）
   - 针对任务特点给出工具使用建议

5. **质量标准**（Quality Standards）
   - 定义什么样的输出是合格的
   - 说明交付物的格式和要求

## 输出格式

直接返回完整的 system prompt 内容（纯文本，不要 JSON，不要用 \`\`\` 包裹）。

提示：
- 要具体而非泛泛而谈
- 要针对任务特点定制
- 要包含可执行的指导
- 参考上面的成功模板，但不要照搬`;

    const systemPrompt = `你是 AI Agent prompt 设计专家。

你的职责是根据任务需求，生成专业、可执行的 system prompt。

好的 prompt 应该：
- 具体明确，不使用空洞的描述
- 针对任务类型定制
- 包含清晰的工作流程
- 说明如何使用可用工具
- 定义质量标准

只返回 prompt 内容，不要其他解释或标记。`;

    try {
      const professionalPrompt = await this.callLLM(prompt, 'generate_agent_prompt', systemPrompt);
      console.log(`[CEO] ✅ 专业 prompt 已生成 (${professionalPrompt.length} 字符)`);
      return professionalPrompt;
    } catch (error) {
      console.error('[CEO] 生成专业 prompt 失败:', error);
      // Fallback 到原来的 generateDefaultPrompt
      return this.generateDefaultPrompt(
        this.inferTaskType({ description: config.taskDescription }),
        this.inferTaskSubtype({ description: config.taskDescription }),
        config.taskDescription
      );
    }
  }

  /**
   * 构建 Agent 决策提示词
   */
  private buildAgentDecisionPrompt(context: {
    task: { description: string; requiredCapabilities?: string[] };
    employees: Array<{ id: string; name: string; role: string; capabilities: string[] }>;
    availableAgents: Array<{
      id: string;
      employee_id: string;
      agent_name: string;
      agent_file: string;
      task_type: string;
      task_subtype: string | null;
      success_rate: number;
      usage_count: number;
    }>;
  }): string {
    const sections: string[] = [];

    sections.push('## 任务信息');
    sections.push(`描述: ${context.task.description}`);
    if (context.task.requiredCapabilities) {
      sections.push(`所需能力: [${context.task.requiredCapabilities.join(', ')}]`);
    }

    sections.push('\n## 可用员工');
    context.employees.forEach((emp, idx) => {
      sections.push(`${idx + 1}. ID=${emp.id} | ${emp.name} (${emp.role})`);
      sections.push(`   能力: [${emp.capabilities.join(', ')}]`);
    });

    sections.push('\n## 已缓存的 Agents');
    if (context.availableAgents.length === 0) {
      sections.push('（无）');
    } else {
      context.availableAgents.forEach((agent, idx) => {
        sections.push(`${idx + 1}. ${agent.agent_name}`);
        sections.push(`   类型: ${agent.task_type}/${agent.task_subtype || '通用'}`);
        sections.push(`   成功率: ${(agent.success_rate * 100).toFixed(1)}%`);
        sections.push(`   使用次数: ${agent.usage_count}`);
      });
    }

    // 添加任务复杂度评估
    const taskComplexity = this.assessTaskComplexity(context.task);
    sections.push(`\n## 任务复杂度评估`);
    sections.push(`等级: ${taskComplexity.level} (${taskComplexity.reason})`);
    sections.push(`关键词: [${taskComplexity.keywords.join(', ')}]`);

    sections.push('\n## 请做出决策');
    sections.push('根据以上信息，决定是使用现有 Agent 还是创建新 Agent。');
    sections.push('\n## 决策原则（智能平衡）');
    sections.push('1. **任务类型匹配度优先**：优先选择 task_type/task_subtype 匹配的 Agent');
    sections.push('2. **成功率门槛**：现有 Agent 成功率 < 60% 时，考虑创建新的');
    sections.push('3. **使用次数阈值**：使用次数 < 3 的 Agent 视为不稳定，优先创建新的');
    sections.push('4. **复杂任务专用化**：高复杂度任务建议创建专用 Agent');
    sections.push('5. **简单任务复用**：低复杂度任务优先复用现有 Agent');
    sections.push('6. **通用工具万能**：Bash, Read, Write, Edit 等工具可以处理任何编程任务');
    sections.push('\n## 复用 vs 创建的权衡');
    sections.push('- **复用优势**：节省资源、利用经验、快速启动');
    sections.push('- **创建优势**：针对性强、优化 prompt、避免干扰');
    sections.push('- **建议**：成功率 > 70% 且使用次数 > 5 的 Agent 可以处理大部分任务');
    sections.push('**重要**: 如果创建新 Agent，必须使用上面列出的员工 ID（如 emp-general-001），不要编造新的 ID。');
    sections.push('\n**最终输出**: 只返回 JSON 格式的决策结果，不要用 \`\`\`json ... \`\`\` 包裹。');

    return sections.join('\n');
  }

  /**
   * Fallback：查找最佳 Agent（改进版，使用多维度评分）
   */
  private findBestAgentFallback(context: {
    task: { description: string; requiredCapabilities?: string[] };
    availableAgents: Array<{
      success_rate: number;
      usage_count: number;
      avg_performance_score?: number;
    }>;
  }) {
    if (context.availableAgents.length === 0) {
      return null;
    }

    // 多维度评分
    const scored = context.availableAgents.map(agent => {
      let score = 0;

      // 使用次数权重（40%）- 经验越丰富越好
      const usageScore = Math.min(agent.usage_count / 20, 1) * 40;
      score += usageScore;

      // 成功率权重（40%）- 成功率高的更可靠
      const successScore = agent.success_rate * 40;
      score += successScore;

      // 性能分权重（20%）- 平均分高的更优秀
      if (agent.avg_performance_score) {
        const perfScore = (agent.avg_performance_score / 10) * 20;
        score += perfScore;
      }

      return {
        ...agent,
        totalScore: score,
      };
    });

    // 按总分排序
    scored.sort((a, b) => b.totalScore - a.totalScore);

    return scored[0] as any;
  }

  /**
   * 评估任务复杂度
   */
  private assessTaskComplexity(task: {
    description: string;
    requiredCapabilities?: string[];
  }): {
    level: 'low' | 'medium' | 'high';
    reason: string;
    keywords: string[];
  } {
    const desc = task.description.toLowerCase();
    const keywords: string[] = [];
    let level: 'low' | 'medium' | 'high' = 'low';
    const reasons: string[] = [];

    // 关键词检测
    const complexityIndicators = {
      high: [
        '微服务', '分布式', '架构', '设计', '系统', '平台',
        'microservice', 'distributed', 'architecture', 'design system',
        '机器学习', 'ai', '模型', '训练', 'machine learning', 'model training',
        '区块链', '智能合约', 'blockchain', 'smart contract',
        'kubernetes', 'k8s', 'docker', '容器化',
      ],
      medium: [
        'api', 'rest', 'graphql', '数据库', '后端', 'backend',
        'react', 'vue', 'angular', '前端', 'frontend',
        '测试', '部署', 'ci/cd', 'devops',
        'migration', '重构', '优化', 'optimization',
      ],
      low: [
        '脚本', '工具', '简单', '查询', '修改',
        'script', 'tool', 'simple query', 'fix',
        '日志', '配置', '文件',
      ],
    };

    // 检测关键词
    for (const keyword of complexityIndicators.high) {
      if (desc.includes(keyword.toLowerCase())) {
        keywords.push(keyword);
        reasons.push(`包含高复杂度关键词: ${keyword}`);
      }
    }

    for (const keyword of complexityIndicators.medium) {
      if (desc.includes(keyword.toLowerCase())) {
        keywords.push(keyword);
      }
    }

    // 根据任务长度判断
    const descLength = task.description.length;
    if (descLength > 200) {
      reasons.push('任务描述较长');
    }

    // 根据能力数量判断
    if (task.requiredCapabilities && task.requiredCapabilities.length > 3) {
      reasons.push(`需要 ${task.requiredCapabilities.length} 种能力`);
    }

    // 确定复杂度等级
    if (keywords.filter(k => complexityIndicators.high.includes(k)).length >= 2) {
      level = 'high';
    } else if (keywords.length >= 1 || descLength > 100) {
      level = 'medium';
    }

    const reason = reasons.join('; ') || '常规任务';

    return { level, reason, keywords };
  }

  /**
   * 判断是否应该尊重创建新 Agent 的决策
   */
  private shouldRespectCreateDecision(
    context: {
      task: { description: string; requiredCapabilities?: string[] };
      availableAgents: Array<{
        id: string;
        employee_id: string;
        agent_name: string;
        agent_file: string;
        task_type: string;
        task_subtype: string | null;
        success_rate: number;
        usage_count: number;
        avg_performance_score?: number;
      }>;
    },
    decision: {
      strategy: 'use_existing' | 'create_new';
      newAgentConfig?: {
        employeeId: string;
        name: string;
        taskType: string;
        taskSubtype: string | null;
        prompt: string;
      };
    }
  ): {
    shouldCreate: boolean;
    reason: string;
    bestMatch?: any;
  } {
    // 没有现有 Agent，必须创建
    if (context.availableAgents.length === 0) {
      return { shouldCreate: true, reason: '没有现有 Agent' };
    }

    const bestMatch = this.findBestAgentFallback(context);

    // 情况1：现有 Agent 表现良好（成功率 > 70% 且使用次数 > 5）
    if (bestMatch.success_rate >= 0.7 && bestMatch.usage_count >= 5) {
      return {
        shouldCreate: false,
        reason: `现有 Agent 表现良好 (${bestMatch.agent_name}: ${(bestMatch.success_rate * 100).toFixed(1)}% 成功率, ${bestMatch.usage_count} 次使用)`,
        bestMatch,
      };
    }

    // 情况2：现有 Agent 表现不佳（成功率 < 50% 或使用次数 < 3）
    if (bestMatch.success_rate < 0.5 || bestMatch.usage_count < 3) {
      return {
        shouldCreate: true,
        reason: `现有 Agent 表现不佳 (${bestMatch.agent_name}: ${(bestMatch.success_rate * 100).toFixed(1)}% 成功率, ${bestMatch.usage_count} 次使用)`,
      };
    }

    // 情况3：中等表现，看任务复杂度
    const taskComplexity = this.assessTaskComplexity(context.task);

    if (taskComplexity.level === 'high') {
      return {
        shouldCreate: true,
        reason: `高复杂度任务 (${taskComplexity.reason})，建议创建专用 Agent`,
      };
    }

    if (taskComplexity.level === 'low') {
      return {
        shouldCreate: false,
        reason: `低复杂度任务 (${taskComplexity.reason})，复用现有 Agent`,
        bestMatch,
      };
    }

    // 中等复杂度，保守决策：复用
    return {
      shouldCreate: false,
      reason: `中等复杂度，优先复用现有 Agent`,
      bestMatch,
    };
  }

  /**
   * 推断任务类型
   */
  private inferTaskType(task: { description: string; requiredCapabilities?: string[] }): string {
    const desc = task.description.toLowerCase();
    const caps = task.requiredCapabilities || [];

    // 优先从能力推断
    if (caps.includes('code') || caps.includes('coding') || caps.includes('programming')) {
      return 'code';
    }
    if (caps.includes('writing') || caps.includes('content')) {
      return 'writing';
    }
    if (caps.includes('analysis') || caps.includes('research')) {
      return 'analysis';
    }

    // 从描述推断
    if (/代码|编程|脚本|app|应用|api|接口/.test(desc)) {
      return 'code';
    }
    if (/写|文章|小说|文案|内容/.test(desc)) {
      return 'writing';
    }
    if (/分析|研究|调查|报告/.test(desc)) {
      return 'analysis';
    }

    return 'general';
  }

  /**
   * 推断任务子类型
   */
  private inferTaskSubtype(task: { description: string; requiredCapabilities?: string[] }): string | null {
    const desc = task.description.toLowerCase();

    // 编程语言检测
    const languages = ['python', 'javascript', 'typescript', 'java', 'rust', 'go', 'cpp', 'c#'];
    for (const lang of languages) {
      if (desc.includes(lang)) {
        return lang;
      }
    }

    // 写作类型检测
    if (/小说|novel|章节/.test(desc)) {
      return 'novel';
    }
    if (/文章|article|论文/.test(desc)) {
      return 'article';
    }
    if (/文案|广告|推广/.test(desc)) {
      return 'copywriting';
    }

    return null;
  }

  /**
   * 生成默认 Agent 提示词
   */
  private generateDefaultPrompt(taskType: string, taskSubtype: string | null, taskDescription: string): string {
    const sections: string[] = [];

    sections.push(`# ${taskSubtype || taskType} Expert`);
    sections.push('');

    sections.push('You are an expert in ' + (taskSubtype || taskType) + '.');
    sections.push('');

    sections.push('## Task');
    sections.push(taskDescription);
    sections.push('');

    sections.push('## Instructions');
    sections.push('- Analyze the task carefully');
    sections.push('- Break down complex tasks into steps');
    sections.push('- Write clean, maintainable code');
    sections.push('- Test your solution before considering it complete');
    sections.push('- If stuck, ask for clarification');
    sections.push('');

    sections.push('## Output');
    sections.push('Provide a complete, working solution.');
    sections.push('Include code examples with explanations as needed.');

    return sections.join('\n');
  }

  private getMockResponse(purpose: string): string {
    // Fallback 响应，仅在 LLM API 调用失败时使用
    switch (purpose) {
      case 'requirement_analysis':
        // 默认为执行任务，使用通用能力
        return JSON.stringify({
          type: 'execute',
          taskDescription: '用户需求',
          requiredCapabilities: ['analysis'],
        });

      case 'risk_assessment':
        return JSON.stringify({
          level: 'medium',
          factors: [],
          requiresApproval: false,
          description: '无法完成风险评估，默认中等风险',
        });

      case 'decision_making':
        // 默认选择安全选项（跳过）
        return JSON.stringify({
          selectedOption: 'no',
          reasoning: 'LLM 调用失败，使用 Fallback：默认跳过操作以确保安全',
        });

      case 'task_review':
        return JSON.stringify({
          success: true,
          score: 6,
          strengths: [],
          improvements: [],
          lessonsLearned: [],
          shouldUpdatePerformance: true,
        });

      default:
        return '{}';
    }
  }
}

// ============================================================================
// 单例
// ============================================================================

let ceoInstance: CEOSupervisorAgent | null = null;

export function getCEOSupervisor(): CEOSupervisorAgent {
  if (!ceoInstance) {
    ceoInstance = new CEOSupervisorAgent();
  }
  return ceoInstance;
}

export function resetCEOSupervisor(): void {
  if (ceoInstance) {
    ceoInstance = null;
  }
}
