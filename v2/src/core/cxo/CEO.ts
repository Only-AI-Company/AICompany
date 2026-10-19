/**
 * CXO 架构 - CEO (Chief Executive Officer)
 *
 * 职责：意图分析和 CXO 分配
 * - 接收用户输入
 * - 分析意图类型（query/goal/task/script）
 * - 决定由哪个 CXO 处理
 * - 不做员工匹配、不做具体执行
 *
 * 关键增强：集成记忆系统，在意图分析前检索历史上下文
 */

import { getDatabase } from '../../db/Database.js';
import { getMemoryStore } from '../memory/MemoryStore.js';
import type { Intent, IntentType, ICEO, ChatMessage, CEOAnalysisResult, CXORole } from './types.js';

/**
 * CEO 意图分析结果
 */
interface IntentAnalysis {
  type: IntentType;
  confidence: number;
  params?: Record<string, any>;
  reasoning: string;
}

export class CEO implements ICEO {
  private db = getDatabase();
  private memoryStore = getMemoryStore(); // 记忆存储
  private model: string = 'claude-sonnet-4-20250514';

  /**
   * 分析用户意图
   */
  async analyzeIntent(userInput: string, chatHistory?: ChatMessage[]): Promise<Intent> {
    console.log(`\n[CEO] 分析用户意图："${userInput.substring(0, 50)}..."`);

    const analysis = await this.performIntentAnalysis(userInput, chatHistory);

    console.log(`[CEO] 意图分析结果：${analysis.type} (置信度：${analysis.confidence})`);
    console.log(`[CEO] 推理：${analysis.reasoning}`);

    // 记录分析活动
    this.db.logActivity({
      eventType: 'ceo.intent_analysis',
      actor: 'ceo',
      action: 'analyze_intent',
      context: {
        input: userInput.substring(0, 100),
        intentType: analysis.type,
        confidence: analysis.confidence,
      },
    });

    return {
      type: analysis.type,
      content: userInput,
      params: analysis.params,
      metadata: {
        timestamp: Date.now(),
      },
    };
  }

  /**
   * 分析意图并分配给相应的 CXO
   *
   * 这是 CEO 的核心方法：分析用户意图 + 决定由谁处理
   *
   * 关键增强：在分析前检索记忆，获取上下文
   */
  async analyzeAndAssign(userInput: string, chatHistory?: ChatMessage[]): Promise<CEOAnalysisResult> {
    console.log(`\n[CEO] 分析并分配："${userInput.substring(0, 50)}..."`);

    // ==========================================================================
    // 关键步骤：在分析前，先从记忆中检索上下文
    // ==========================================================================
    const enrichedContext = await this.buildContextFromMemory(userInput, chatHistory);

    // 1. 理解用户需求（使用 enriched context，包含历史记忆）
    const understanding = await this.understandUserNeed(userInput, enrichedContext);

    console.log(`[CEO] 理解：${understanding.userWant}`);
    console.log(`[CEO] 需要能力：${understanding.neededCapability || '通用'}`);

    // 2. 根据需求类型和所需能力，决定处理方式和 CXO
    const decision = this.makeDecision(understanding, userInput);

    console.log(`[CEO] 决策：${decision.action}`);
    console.log(`[CEO] 分配给：${decision.assignedCXO}`);
    console.log(`[CEO] 方案：${decision.plan}`);

    // 记录分析活动
    this.db.logActivity({
      eventType: 'ceo.analysis_and_assignment',
      actor: 'ceo',
      action: 'analyze_and_assign',
      context: {
        input: userInput.substring(0, 100),
        userWant: understanding.userWant,
        neededCapability: understanding.neededCapability,
        assignedCXO: decision.assignedCXO,
        plan: decision.plan,
        memoryContextUsed: enrichedContext.length > (chatHistory?.length || 0),
      },
    });

    return {
      intentType: decision.intentType,
      userInput,
      params: {
        userWant: understanding.userWant,
        neededCapability: understanding.neededCapability,
        suggestedTool: decision.suggestedTool,
        action: decision.action,
      },
      assignedCXO: decision.assignedCXO,
      assignmentReason: decision.reason,
      confidence: understanding.confidence,
      reasoning: understanding.reasoning,
      nextSteps: decision.nextSteps,
    };
  }

  /**
   * 从记忆中构建上下文（关键方法）
   *
   * 当用户发送消息时，CEO 需要：
   * 1. 检索相似的历史任务（episodic memory）
   * 2. 检索相关的模式/规则（semantic memory）
   * 3. 结合聊天历史，形成完整的上下文
   */
  private async buildContextFromMemory(
    userInput: string,
    chatHistory?: ChatMessage[]
  ): Promise<ChatMessage[]> {
    try {
      const memoryContext: ChatMessage[] = [];

      // 1. 检索相似的历史任务（episodic memory）
      const similarTasks = this.memoryStore.findSimilarTasks(userInput, undefined, 3);

      if (similarTasks.length > 0) {
        console.log(`[CEO] 检索到 ${similarTasks.length} 个相似历史任务`);

        for (const task of similarTasks) {
          const statusText = task.status === 'success' ? '成功' : '失败';
          const learning = task.reflection?.learnings?.[0] || '';

          memoryContext.push({
            role: 'system',
            content: `历史任务参考 ${statusText}: "${task.taskDescription}" -> ${task.output?.substring(0, 100) || '无输出'}${learning ? '。经验：' + learning : ''}`
          });
        }
      }

      // 2. 检索相关的语义记忆（semantic memory）- 模式/规则
      const keywords = this.extractKeywords(userInput);
      const patterns = this.memoryStore.findRelevantMemories({
        tags: keywords,
        minConfidence: 0.6
      }, 5);

      if (patterns.length > 0) {
        console.log(`[CEO] 检索到 ${patterns.length} 个相关模式`);

        const patternsText = patterns
          .map(p => `- ${p.title}: ${p.description}`)
          .join('\n');

        memoryContext.push({
          role: 'system',
          content: `可用模式/规则:\n${patternsText}`
        });
      }

      // 3. 结合原始聊天历史
      const enrichedContext = [...memoryContext, ...(chatHistory || [])];

      console.log(`[CEO] 上下文：${memoryContext.length} 条记忆 + ${chatHistory?.length || 0} 条聊天历史`);

      return enrichedContext;

    } catch (error: any) {
      console.warn('[CEO] 检索记忆失败:', error.message);
      // Fallback：返回原始聊天历史
      return chatHistory || [];
    }
  }

  /**
   * 从用户输入中提取关键词（用于记忆检索）
   */
  private extractKeywords(userInput: string): string[] {
    const zhKeywords = ['代码', '优化', '开发', '功能', '用户', '系统', '数据', 'API', '接口', '测试', '修复', 'bug', '性能'];
    const enKeywords = ['code', 'optimize', 'develop', 'feature', 'user', 'system', 'data', 'api', 'test', 'fix', 'bug', 'performance'];

    const keywords: string[] = [];

    for (const kw of zhKeywords) {
      if (userInput.includes(kw)) {
        keywords.push(kw);
      }
    }

    for (const kw of enKeywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(userInput)) {
        keywords.push(kw);
      }
    }

    if (keywords.length === 0) {
      keywords.push(userInput.substring(0, 20));
    }

    return keywords.slice(0, 5);
  }

  /**
   * 理解用户需求（智能分析）
   */
  private async understandUserNeed(userInput: string, chatHistory?: ChatMessage[]): Promise<{
    userWant: string;
    neededCapability: string;
    confidence: number;
    reasoning: string;
  }> {
    // 构建带上下文的 prompt
    const contextText = chatHistory && chatHistory.length > 0
      ? `\n最近对话:\n${chatHistory.map(m => `${m.role}: ${m.content.substring(0, 50)}`).join('\n')}`
      : '';

    const prompt = `分析用户的需求："${userInput}"${contextText}

返回 JSON:
{
  "userWant": "用户想要什么（一句话）",
  "neededCapability": "需要什么能力（如：外部信息搜索、代码开发、内容创作、系统查询）",
  "confidence": 0.0-1.0
}`;

    try {
      const { getProvider } = await import('../ai/AIProvider.js');
      const provider = getProvider();

      const response = await provider.messages(
        [{ role: 'user', content: prompt }],
        '你是一个需求分析助手。简洁回答。'
      );

      let content = response.content;
      if (Array.isArray(content)) {
        const textBlocks = content.filter((block: any) => block.type === 'text').map((block: any) => block.text);
        content = textBlocks.join('');
      }

      const result = JSON.parse(content);
      return {
        userWant: result.userWant || userInput,
        neededCapability: result.neededCapability || '通用',
        confidence: result.confidence || 0.8,
        reasoning: `用户需求：${result.userWant}`,
      };
    } catch (error) {
      // Fallback：简单规则
      const input = userInput.toLowerCase();
      let userWant = userInput;
      let neededCapability = '通用';

      if (input.includes('新闻') || input.includes('局势') || input.includes('最新')) {
        neededCapability = '外部信息搜索';
        userWant = `了解外部信息：${userInput}`;
      } else if (input.includes('开发') || input.includes('写代码')) {
        neededCapability = '代码开发';
      } else if (input.includes('写') || input.includes('文案')) {
        neededCapability = '内容创作';
      }

      return { userWant, neededCapability, confidence: 0.7, reasoning: '规则匹配' };
    }
  }

  /**
   * 做决策：根据需求决定怎么做
   */
  private makeDecision(understanding: any, userInput: string): {
    intentType: IntentType;
    action: string;
    assignedCXO: CXORole;
    plan: string;
    suggestedTool?: string;
    reason: string;
    nextSteps?: string[];
  } {
    const { userWant, neededCapability } = understanding;

    // 决策逻辑
    if (neededCapability.includes('外部信息') || neededCapability.includes('搜索')) {
      return {
        intentType: 'query',
        action: '外部信息查询',
        assignedCXO: 'CEO',
        plan: '使用 HTTP 工具获取外部信息',
        suggestedTool: 'HTTP',
        reason: '需要外部信息，使用网络工具获取',
        nextSteps: ['调用 HTTP 工具', '解析结果', '返回给用户'],
      };
    }

    if (neededCapability.includes('代码') || neededCapability.includes('技术')) {
      return {
        intentType: 'task',
        action: '技术任务执行',
        assignedCXO: 'CTO',
        plan: '使用 CTO 执行技术任务',
        reason: '技术类任务由 CTO 负责',
        nextSteps: ['CTO 分析任务', '选择或创建员工', '执行任务'],
      };
    }

    if (neededCapability.includes('内容') || neededCapability.includes('文案')) {
      return {
        intentType: 'task',
        action: '内容创作',
        assignedCXO: 'CMO',
        plan: '使用 CMO 创作内容',
        reason: '内容创作类任务由 CMO 负责',
        nextSteps: ['CMO 理解需求', '创作内容', '返回结果'],
      };
    }

    if (neededCapability.includes('系统') || neededCapability.includes('状态')) {
      return {
        intentType: 'query',
        action: '系统状态查询',
        assignedCXO: 'CEO',
        plan: '查询系统内部状态',
        reason: '系统状态查询由 CEO 直接处理',
        nextSteps: ['查询数据库', '返回结果'],
      };
    }

    // 默认：通用任务
    return {
      intentType: 'task',
      action: '通用任务处理',
      assignedCXO: 'CRO',
      plan: '由 CRO 匹配合适的员工处理',
      reason: '通用任务由 CRO 负责员工匹配',
      nextSteps: ['CRO 分析任务', '匹配或创建员工', '执行任务'],
    };
  }

  /**
   * 根据意图类型分配 CXO
   */
  private assignCXO(
    intentType: IntentType,
    userInput: string,
    params?: Record<string, any>
  ): { assignedCXO: CXORole; assignmentReason: string; nextSteps?: string[] } {
    switch (intentType) {
      case 'query':
        return {
          assignedCXO: 'CEO',
          assignmentReason: '查询类请求由 CEO 直接处理，快速响应用户的信息查询需求',
          nextSteps: ['查询系统状态/数据', '返回结果给用户'],
        };

      case 'goal':
        return {
          assignedCXO: 'COO',
          assignmentReason: '目标类请求需要 COO（首席运营官）进行目标分解、规划和持续跟进',
          nextSteps: ['将目标分解为可执行的任务', '分配给相应员工', '建立进度跟踪机制'],
        };

      case 'task':
        return this.assignTaskCXO(userInput, params);

      case 'script':
        return {
          assignedCXO: 'COO',
          assignmentReason: '脚本类请求由 COO（首席运营官）执行预定义的自动化流程',
          nextSteps: ['验证脚本权限', '执行脚本', '返回执行结果'],
        };

      default:
        return {
          assignedCXO: 'CEO',
          assignmentReason: '未知意图类型，由 CEO 进行进一步分析',
          nextSteps: ['与用户确认需求', '重新分析意图'],
        };
    }
  }

  /**
   * 为任务类型分配 CXO
   */
  private assignTaskCXO(
    userInput: string,
    params?: Record<string, any>
  ): { assignedCXO: CXORole; assignmentReason: string; nextSteps?: string[] } {
    const capabilities = params?.requiredCapabilities as string[] || [];
    const input = userInput.toLowerCase();

    if (capabilities.some(c => ['coding', 'architecture', 'cloud', 'ai/ml', 'devops', 'technical'].includes(c))
        || /代码 | 开发|api|架构 | 部署 | 数据库 | 算法/i.test(input)) {
      return {
        assignedCXO: 'CTO',
        assignmentReason: '技术类任务由 CTO（首席技术官）处理',
        nextSteps: ['评估任务复杂度', '匹配或创建技术员工', '执行技术任务'],
      };
    }

    if (capabilities.some(c => ['writing', 'marketing', 'growth', 'content-creation', 'xiaohongshu', 'twitter'].includes(c))
        || /文案 | 营销 | 推广 | 小红书 | 推特 | 内容/i.test(input)) {
      return {
        assignedCXO: 'CMO',
        assignmentReason: '营销类任务由 CMO（首席营销官）处理',
        nextSteps: ['制定营销策略', '创建营销内容', '执行推广计划'],
      };
    }

    if (capabilities.some(c => ['planning', 'management', 'automation', 'analysis', 'coordination'].includes(c))
        || /流程 | 优化 | 管理 | 协调 | 规划/i.test(input)) {
      return {
        assignedCXO: 'COO',
        assignmentReason: '运营类任务由 COO（首席运营官）处理',
        nextSteps: ['分析运营需求', '优化执行流程', '跟踪任务进度'],
      };
    }

    if (capabilities.some(c => ['analysis', 'finance', 'data', 'reporting'].includes(c))
        || /财务 | 分析 | 报告 | 数据 | 预算/i.test(input)) {
      return {
        assignedCXO: 'CFO',
        assignmentReason: '财务/分析类任务由 CFO（首席财务官）处理',
        nextSteps: ['收集相关数据', '进行财务/数据分析', '生成分析报告'],
      };
    }

    // 默认：先由 CRO 匹配员工，再由相应的 CXO 执行
    return {
      assignedCXO: 'CRO',
      assignmentReason: '通用任务由 CRO（首席资源官）匹配合适的员工',
      nextSteps: ['分析任务需求', '匹配合适的员工', '分配任务执行'],
    };
  }

  /**
   * 执行意图分析（调用 LLM）
   */
  private async performIntentAnalysis(
    userInput: string,
    chatHistory?: ChatMessage[]
  ): Promise<IntentAnalysis> {
    const { prompt, systemPrompt } = this.buildIntentPrompt(userInput, chatHistory);

    try {
      const { getProvider } = await import('../ai/AIProvider.js');
      const provider = getProvider();

      const response = await provider.messages(
        [{ role: 'user', content: prompt }],
        systemPrompt
      );

      let content = response.content;
      if (Array.isArray(content)) {
        const textBlocks = content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text);
        content = textBlocks.join('');
      }

      const result = this.parseIntentResponse(content);
      return result;

    } catch (error: any) {
      console.error('[CEO] LLM 调用失败:', error.message);
      return this.fallbackIntentAnalysis(userInput);
    }
  }

  /**
   * 构建意图分析提示
   */
  private buildIntentPrompt(
    userInput: string,
    chatHistory?: ChatMessage[]
  ): { prompt: string; systemPrompt: string } {
    let historyContext = '';
    if (chatHistory && chatHistory.length > 0) {
      historyContext = '\n\n最近的对话：\n' + chatHistory
        .slice(-3)
        .map(m => `${m.role}: ${m.content.substring(0, 50)}`)
        .join('\n');
    }

    const systemPrompt = `你是 AI Company 的 CEO，负责分析用户意图。

你的职责：理解用户想要什么，提取关键信息。

分析用户输入后，返回 JSON:
{
  "type": "query" | "goal" | "task" | "script",
  "what": "用户想要什么（简短描述）",
  "details": {}  // 任何相关细节
}`;

    const prompt = `用户输入："${userInput}"${historyContext}

用户想要什么？返回 JSON。`;

    return { prompt, systemPrompt };
  }

  /**
   * 解析意图响应
   */
  private parseIntentResponse(response: string): IntentAnalysis {
    try {
      let cleaned = response.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.substring(7);
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.substring(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.substring(0, cleaned.length - 3);
      }
      cleaned = cleaned.trim();

      const result = JSON.parse(cleaned);

      if (!result.type || !['query', 'goal', 'task', 'script'].includes(result.type)) {
        throw new Error('Invalid intent type');
      }

      const what = result.what || result.details?.toString() || '';

      return {
        type: result.type,
        confidence: result.confidence || 0.8,
        params: result.details || {},
        reasoning: what,
      };
    } catch (error) {
      console.error('[CEO] 解析意图响应失败:', error);
      throw error;
    }
  }

  /**
   * Fallback 意图分析（基于规则）
   */
  private fallbackIntentAnalysis(userInput: string): IntentAnalysis {
    const input = userInput.toLowerCase().trim();

    if (input.startsWith('ls') || input.startsWith('cd') ||
        input.startsWith('npm') || input.startsWith('git') ||
        input.startsWith('cat ') || input.startsWith('grep ') ||
        input.includes('|') && input.length < 100) {
      return {
        type: 'script',
        confidence: 0.7,
        params: { command: userInput },
        reasoning: '检测到命令格式',
      };
    }

    const queryKeywords = ['多少', '几个', '状态', '列表', '谁', '怎么样', 'status', 'list', 'how many', 'what'];
    const goalKeywords = ['目标', '一个月', '每天', '持续', '目标', '涨粉', '月度'];
    const taskKeywords = ['写', '创建', '开发', '实现', '做', '完成', '帮我', 'generate', 'create'];

    let type: IntentType = 'task';
    let confidence = 0.6;
    let reasoning = '基于关键词的默认分类';

    if (queryKeywords.some(k => userInput.includes(k))) {
      type = 'query';
      confidence = 0.8;
      reasoning = '包含查询关键词';
    } else if (goalKeywords.some(k => userInput.includes(k))) {
      type = 'goal';
      confidence = 0.7;
      reasoning = '包含目标相关关键词';
    } else if (taskKeywords.some(k => userInput.includes(k))) {
      type = 'task';
      confidence = 0.7;
      reasoning = '包含任务关键词';
    }

    return {
      type,
      confidence,
      params: {},
      reasoning,
    };
  }
}

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
