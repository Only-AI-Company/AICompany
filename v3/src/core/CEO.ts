/**
 * AI Company v3 - CEO
 *
 * 决策中枢：理解、拆解、分配、复盘
 *
 * 职责：
 * 1. 理解用户输入
 * 2. 拆解目标为计划
 * 3. 分配任务给员工
 * 4. 复盘任务结果
 * 5. 决策和审批
 */

import type {
  Understanding,
  CEOAnalysis,
  Goal,
  Plan,
  Task,
  Employee,
  Review,
  TaskResult,
} from './types.js';
import type { Message } from './ai/types.js';
import { getAIProvider } from './ai/AIProvider.js';
import { parseJSON } from './utils.js';
import { withRateLimit } from './utils/RateLimiter.js';

// ============================================================================
// CEO Class
// ============================================================================

export class CEO {
  private aiProvider = getAIProvider();

  constructor() {
    // 初始化
  }

  /**
   * 获取 AI Provider（用于 Engine 访问）
   */
  getAIProvider() {
    return this.aiProvider;
  }

  /**
   * 理解用户输入
   *
   * 返回：用户想要什么、意图类型、置信度
   */
  async understand(input: string): Promise<Understanding> {
    console.log(`\n[CEO] Understanding: "${input.substring(0, 50)}..."`);

    const systemPrompt = `你是 AI Company 的 CEO。

你的职责是理解用户需求。

请分析用户输入，返回 JSON 格式：
{
  "userWant": "用户想要什么（一句话）",
  "intentType": "goal|task|chat|command",
  "confidence": 0.8,
  "reasoning": "推理过程"
}

意图类型说明：
- goal: 长期目标（如：1个月1万粉丝）
- task: 具体任务（如：写一篇文章）
- chat: 对话（如：你好、怎么样了）
- command: 命令（如：ls、cd、npm run）`;

    const userPrompt = `用户说：${input}

请分析用户的需求。`;

    try {
      // 使用速率限制
      const response = await withRateLimit(async () =>
        await this.aiProvider.prompt(userPrompt, systemPrompt)
      );

      // 提取文本内容
      const content = typeof response.content === 'string'
        ? response.content
        : response.getText?.() || JSON.stringify(response.content);

      // 解析 JSON
      const result = parseJSON(content);

      return {
        userWant: result.userWant || input,
        intentType: result.intentType || 'task',
        confidence: result.confidence || 0.7,
        reasoning: result.reasoning || 'AI reasoning',
      };
    } catch (error: any) {
      console.warn('[CEO] LLM understanding failed, using fallback:', error.message);
      // Fallback: 规则检测
      return {
        userWant: input,
        intentType: this.detectIntentType(input),
        confidence: 0.6,
        reasoning: 'Fallback: rule-based detection',
      };
    }
  }

  /**
   * 拆解目标为计划
   *
   * 长期目标 → 短期目标 → 执行计划
   */
  async decomposeGoal(goal: Goal): Promise<Plan> {
    console.log(`\n[CEO] Decomposing goal: "${goal.description}"`);

    const systemPrompt = `你是 AI Company 的 CEO。

你的职责是将长期目标拆解为可执行的计划。

请分析目标，返回 JSON 格式：
{
  "description": "计划描述",
  "steps": [
    {
      "description": "步骤描述",
      "requiredCapabilities": ["能力1", "能力2"],
      "estimatedDuration": 60
    }
  ]
}

要求：
1. 步骤要具体可执行
2. 识别每步需要的能力（写作、编程、分析、设计等）
3. 预估每步时长（分钟）
4. 步骤之间要有逻辑顺序`;

    const userPrompt = `目标：${goal.description}
时间框架：${goal.timeframe}

请将这个目标拆解为可执行的计划。`;

    try {
      // 使用速率限制
      const response = await withRateLimit(async () =>
        await this.aiProvider.prompt(userPrompt, systemPrompt)
      );

      // 提取文本内容
      const content = typeof response.content === 'string'
        ? response.content
        : response.getText?.() || JSON.stringify(response.content);

      // 解析 JSON
      const result = parseJSON(content);

      // 生成计划
      const plan: Plan = {
        id: `plan_${Date.now()}`,
        goalId: goal.id,
        description: result.description || `执行计划：${goal.description}`,
        steps: (result.steps || []).map((s: any, i: number) => ({
          id: `step_${i + 1}`,
          description: s.description || `步骤 ${i + 1}`,
          status: 'pending' as const,
          requiredCapabilities: s.requiredCapabilities || [],
          estimatedDuration: s.estimatedDuration || 60,
        })),
        status: 'pending',
        currentStepIndex: 0,
        createdAt: Date.now(),
      };

      console.log(`[CEO] Plan created with ${plan.steps.length} steps (LLM-powered)`);

      return plan;
    } catch (error: any) {
      console.warn('[CEO] LLM decomposition failed, using fallback:', error.message);

      // Fallback: 简单的3步计划
      const plan: Plan = {
        id: `plan_${Date.now()}`,
        goalId: goal.id,
        description: `执行计划：${goal.description}`,
        steps: [
          {
            id: 'step_1',
            description: '分析现状',
            status: 'pending',
            estimatedDuration: 30,
          },
          {
            id: 'step_2',
            description: '制定策略',
            status: 'pending',
            dependencies: ['step_1'],
            estimatedDuration: 60,
          },
          {
            id: 'step_3',
            description: '执行计划',
            status: 'pending',
            dependencies: ['step_2'],
            estimatedDuration: 120,
          },
        ],
        status: 'pending',
        currentStepIndex: 0,
        createdAt: Date.now(),
      };

      console.log(`[CEO] Fallback plan created with ${plan.steps.length} steps`);

      return plan;
    }
  }

  /**
   * 分配任务给员工
   *
   * 根据任务需求选择最合适的员工
   */
  async assignTask(task: Task, employees: Employee[]): Promise<Employee> {
    console.log(`\n[CEO] Assigning task: "${task.description}"`);

    if (employees.length === 0) {
      throw new Error('No employees available');
    }

    // 如果没有指定能力需求，使用简单的技能匹配
    if (!task.requiredCapabilities || task.requiredCapabilities.length === 0) {
      const bestMatch = this.findBestEmployee(task, employees);
      console.log(`[CEO] Assigned to: ${bestMatch.name} (${bestMatch.role}) [auto-match]`);
      return bestMatch;
    }

    // 使用 LLM 选择最合适的员工
    const systemPrompt = `你是 AI Company 的 CEO。

你的职责是为任务选择最合适的员工。

请分析任务需求和员工能力，返回 JSON 格式：
{
  "employeeId": "员工ID",
  "reasoning": "选择理由"
}

选择标准：
1. 技能匹配度
2. 员工等级
3. 绩效历史
4. 工作负载`;

    const userPrompt = `任务：${task.description}
需要能力：${task.requiredCapabilities.join(', ')}

可选员工：
${employees.map(e => `- ${e.name} (${e.role}, Lv${e.level}, 绩效${e.performance}): ${e.skills.join(', ')}`).join('\n')}

请选择最合适的员工。`;

    try {
      // 使用速率限制
      const response = await withRateLimit(async () =>
        await this.aiProvider.prompt(userPrompt, systemPrompt)
      );

      // 提取文本内容
      const content = typeof response.content === 'string'
        ? response.content
        : response.getText?.() || JSON.stringify(response.content);

      // 解析 JSON
      const result = parseJSON(content);

      const selected = employees.find(e => e.id === result.employeeId);
      if (selected) {
        console.log(`[CEO] Assigned to: ${selected.name} (${selected.role}) [LLM: ${result.reasoning}]`);
        return selected;
      }

      // LLM 返回无效员工ID，使用 fallback
      console.warn('[CEO] LLM returned invalid employee, using fallback');
      throw new Error('Invalid employee selection');
    } catch (error: any) {
      console.warn('[CEO] LLM assignment failed, using fallback:', error.message);
      const bestMatch = this.findBestEmployee(task, employees);
      console.log(`[CEO] Assigned to: ${bestMatch.name} (${bestMatch.role}) [fallback]`);
      return bestMatch;
    }
  }

  /**
   * 复盘任务
   *
   * 分析任务结果，给出评分和改进建议
   */
  async reviewTask(task: Task, result: TaskResult): Promise<Review> {
    console.log(`\n[CEO] Reviewing task: "${task.description}"`);

    const systemPrompt = `你是 AI Company 的 CEO。

你的职责是复盘任务结果，给出客观评价。

请分析任务，返回 JSON 格式：
{
  "score": 8,
  "strengths": ["优点1", "优点2", "优点3"],
  "improvements": ["改进1", "改进2", "改进3"],
  "learnings": ["经验1", "经验2"],
  "shouldUpdatePerformance": true,
  "performanceDelta": 10
}

评分标准：
- 9-10: 完美，超出预期
- 7-8: 优秀，符合预期
- 5-6: 良好，基本符合
- 3-4: 需要改进
- 1-2: 失败，需要重新执行

绩效调整：
- 成功且优秀: +5~15
- 成功但一般: +0~5
- 失败但有尝试: -5~-10
- 完全失败: -15~-20`;

    const outputPreview = result.output?.substring(0, 500) || '无';
    const userPrompt = `任务：${task.description}
结果：${result.success ? '成功' : '失败'}
输出：${outputPreview}
${result.error ? `错误：${result.error}` : ''}

请复盘这个任务。`;

    try {
      // 使用速率限制
      const response = await withRateLimit(async () =>
        await this.aiProvider.prompt(userPrompt, systemPrompt)
      );

      // 提取文本内容
      const content = typeof response.content === 'string'
        ? response.content
        : response.getText?.() || JSON.stringify(response.content);

      // 解析 JSON
      const parsedResult = parseJSON(content);

      const review: Review = {
        id: `review_${Date.now()}`,
        taskId: task.id,
        employeeId: task.employeeId || 'unknown',
        score: parsedResult.score || (result.success ? 7 : 4),
        strengths: parsedResult.strengths || (result.success ? ['任务完成'] : ['尝试执行']),
        improvements: parsedResult.improvements || [],
        learnings: parsedResult.learnings || [],
        shouldUpdatePerformance: parsedResult.shouldUpdatePerformance !== false,
        performanceDelta: parsedResult.performanceDelta || (result.success ? 5 : -5),
        levelUp: false,
        createdAt: Date.now(),
      };

      console.log(`[CEO] Review score: ${review.score}/10 (LLM-powered)`);

      return review;
    } catch (error: any) {
      console.warn('[CEO] LLM review failed, using fallback:', error.message);

      // Fallback: 基于结果的简单评分
      const review: Review = {
        id: `review_${Date.now()}`,
        taskId: task.id,
        employeeId: task.employeeId || 'unknown',
        score: result.success ? 7 : 4,
        strengths: result.success
          ? ['任务完成', '输出清晰']
          : ['尝试执行'],
        improvements: result.success
          ? ['可以更详细']
          : ['需要改进技能'],
        learnings: result.success
          ? ['这个方法有效']
          : ['下次需要更多信息'],
        shouldUpdatePerformance: true,
        performanceDelta: result.success ? 5 : -5,
        levelUp: false,
        createdAt: Date.now(),
      };

      console.log(`[CEO] Fallback review score: ${review.score}/10`);

      return review;
    }
  }

  /**
   * 分析任务需求
   *
   * 理解任务需要什么能力、风险等级
   */
  async analyze(task: Task): Promise<CEOAnalysis> {
    console.log(`\n[CEO] Analyzing task: "${task.description}"`);

    // TODO: 调用 LLM 分析
    const understanding = await this.understand(task.input || task.description);

    return {
      understanding: understanding,
      riskLevel: 'low',
      requiresApproval: false,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * 检测意图类型（规则）
   */
  private detectIntentType(input: string): 'goal' | 'task' | 'chat' | 'command' {
    const lower = input.toLowerCase();

    // 命令模式
    if (/^(ls|cd|npm|git|cat|grep|npm run|node|python|bash|sh)/.test(lower)) {
      return 'command';
    }

    // 目标关键词
    const goalKeywords = [
      '目标', '个月', '天', '周', '年',
      '涨粉', '达成', '实现', '完成', '持续',
      'goal', 'month', 'week', 'year'
    ];

    // 对话关键词
    const chatKeywords = [
      '你好', '嗨', '嘿', '怎么样', '如何', '在吗',
      'hello', 'hi', 'how are you', 'status'
    ];

    // 检查是否是目标
    for (const keyword of goalKeywords) {
      if (input.includes(keyword)) {
        return 'goal';
      }
    }

    // 检查是否是对话
    for (const keyword of chatKeywords) {
      if (input.includes(keyword)) {
        return 'chat';
      }
    }

    // 默认是任务
    return 'task';
  }

  /**
   * 找到最匹配的员工
   */
  private findBestEmployee(task: Task, employees: Employee[]): Employee {
    if (employees.length === 0) {
      throw new Error('No employees available');
    }

    // 计算每个员工的匹配分数
    const scores = employees.map(employee => {
      let score = 0;
      const requiredSkills = task.requiredCapabilities;

      // 技能匹配
      for (const skill of requiredSkills) {
        if (employee.skills.includes(skill)) {
          score += 10;
        }
      }

      // 能力匹配
      for (const cap of requiredSkills) {
        if (employee.capabilities.includes(cap)) {
          score += 5;
        }
      }

      // 等级加分
      score += employee.level * 2;

      // 绩效加分
      score += employee.performance / 10;

      return { employee, score };
    });

    // 按分数排序
    scores.sort((a, b) => b.score - a.score);

    // 返回最高分的员工
    return scores[0].employee;
  }
}

// ============================================================================
// Exports
// ============================================================================

let ceoInstance: CEO | null = null;

export function getCEO(): CEO {
  if (!ceoInstance) {
    ceoInstance = new CEO();
  }
  return ceoInstance;
}

export function resetCEO(): void {
  ceoInstance = null;
}
