/**
 * Interaction Manager - 交互层核心
 *
 * 负责：
 * - 处理用户输入
 * - 意图识别
 * - 对话管理
 * - 审批/反馈请求
 */

import { EventEmitter } from 'events';
import pino from 'pino';
import { IntentRecognizer } from '../intent/IntentRecognizer';
import type {
  Intent,
  InteractionContext,
  ApprovalRequest,
  FeedbackRequest,
  MessageSource,
  TaskPriority
} from '../../types';

export interface InteractionManagerConfig {
  autoApproveLowRisk?: boolean;
  approvalTimeout?: number;
  feedbackTimeout?: number;
}

export interface UserInput {
  userId: string;
  source: MessageSource;
  content: string;
  conversationId?: string;
  metadata?: Record<string, any>;
}

export interface InteractionResult {
  type: 'direct_response' | 'task_created' | 'approval_requested' | 'feedback_requested';
  response?: string;
  taskId?: string;
  approvalRequest?: ApprovalRequest;
  feedbackRequest?: FeedbackRequest;
}

export class InteractionManager extends EventEmitter {
  private intentRecognizer: IntentRecognizer;
  private config: Required<InteractionManagerConfig>;
  private logger: pino.Logger;

  // 进行中的审批
  private pendingApprovals = new Map<string, ApprovalRequest>();

  // 进行中的反馈
  private pendingFeedbacks = new Map<string, FeedbackRequest>();

  // 对话上下文
  private contexts = new Map<string, InteractionContext>();

  constructor(config: InteractionManagerConfig = {}) {
    super();
    this.config = {
      autoApproveLowRisk: config.autoApproveLowRisk ?? true,
      approvalTimeout: config.approvalTimeout ?? 300000, // 5 分钟
      feedbackTimeout: config.feedbackTimeout ?? 300000
    };
    this.intentRecognizer = new IntentRecognizer();
    this.logger = pino({ name: 'interaction-manager' });
  }

  /**
   * 处理用户输入
   */
  async handleInput(input: UserInput): Promise<InteractionResult> {
    this.logger.info({ userId: input.userId, source: input.source }, 'Processing input');

    // 获取或创建对话上下文
    const context = this.getOrCreateContext(input);

    // 意图识别
    const intent = this.intentRecognizer.recognize(input.content, context);
    context.intent = intent;

    // 根据意图类型处理
    switch (intent.type) {
      case 'chat':
        return this.handleChat(input, intent);

      case 'query':
        return this.handleQuery(input, intent);

      case 'task':
      case 'goal':
        return this.handleTask(input, intent);

      case 'status':
        return this.handleStatus(input, intent);

      case 'config':
        return this.handleConfig(input, intent);

      default:
        // 检查是否有待处理的审批/反馈
        if (context.pendingApproval) {
          return this.handleApprovalResponse(input, context.pendingApproval);
        }
        if (context.pendingFeedback) {
          return this.handleFeedbackResponse(input, context.pendingFeedback);
        }

        // 默认作为聊天处理
        return this.handleChat(input, intent);
    }
  }

  /**
   * 处理聊天
   */
  private async handleChat(input: UserInput, _intent: Intent): Promise<InteractionResult> {
    // 简单聊天直接回复
    return {
      type: 'direct_response',
      response: await this.generateChatResponse(input.content)
    };
  }

  /**
   * 处理查询
   */
  private async handleQuery(input: UserInput, intent: Intent): Promise<InteractionResult> {
    const queryTopic = intent.entities.queryTopic || input.content;

    // 对于简单的系统能力查询，直接用 LLM 回答
    const capabilityQueries = ['你能做什么', '你能干什么', '你会什么', '你的功能', '功能', '能力'];
    if (capabilityQueries.some(q => input.content.includes(q)) ||
        input.content.includes('能做什么') || input.content.includes('能干什么')) {
      return {
        type: 'direct_response',
        response: await this.generateChatResponse(input.content)
      };
    }

    // 其他查询创建任务
    const taskId = this.generateTaskId();

    this.emit('task_created', {
      taskId,
      type: 'query',
      description: queryTopic,
      userId: input.userId
    });

    return {
      type: 'task_created',
      taskId,
      response: `正在为你查询：${queryTopic}`
    };
  }

  /**
   * 处理任务
   */
  private async handleTask(input: UserInput, intent: Intent): Promise<InteractionResult> {
    const taskId = this.generateTaskId();
    const priority = this.extractPriority(intent);

    // 检查是否需要审批
    const requiresApproval = this.checkRequiresApproval(intent, priority);

    if (requiresApproval && !this.config.autoApproveLowRisk) {
      // 创建审批请求
      const approvalRequest: ApprovalRequest = {
        id: this.generateId('approval'),
        taskId,
        description: intent.entities.taskDescription || input.content,
        risk: priority === 'critical' ? 'high' : 'low',
        options: ['✅ 执行', '❌ 取消'],
        timeout: this.config.approvalTimeout
      };

      return this.createApprovalRequest(input, approvalRequest);
    }

    // 直接创建任务
    this.emit('task_created', {
      taskId,
      type: 'task',
      description: intent.entities.taskDescription || input.content,
      priority,
      userId: input.userId
    });

    return {
      type: 'task_created',
      taskId,
      response: `好的，我来执行：${intent.entities.taskDescription || input.content}`
    };
  }

  /**
   * 处理状态查询
   */
  private async handleStatus(input: UserInput, _intent: Intent): Promise<InteractionResult> {
    // 发射状态请求事件
    return new Promise((resolve) => {
      this.emit('status_request', {
        userId: input.userId,
        callback: (status: any) => {
          resolve({
            type: 'direct_response',
            response: this.formatStatus(status)
          });
        }
      });
    });
  }

  /**
   * 处理配置修改
   */
  private async handleConfig(input: UserInput, _intent: Intent): Promise<InteractionResult> {
    // 配置修改通常需要审批
    const approvalRequest: ApprovalRequest = {
      id: this.generateId('approval'),
      taskId: this.generateTaskId(),
      description: `修改配置：${input.content}`,
      risk: 'medium',
      options: ['✅ 确认修改', '❌ 取消'],
      timeout: this.config.approvalTimeout
    };

    return this.createApprovalRequest(input, approvalRequest);
  }

  // ============================================================================
  // 审批管理
  // ============================================================================

  private createApprovalRequest(
    input: UserInput,
    request: ApprovalRequest
  ): InteractionResult {
    // 存储审批请求
    this.pendingApprovals.set(request.id, request);

    // 更新上下文
    const context = this.getContext(input.conversationId || input.userId);
    if (context) {
      context.pendingApproval = request;
    }

    this.logger.info({ approvalId: request.id }, 'Approval request created');

    this.emit('approval_requested', request);

    return {
      type: 'approval_requested',
      approvalRequest: request
    };
  }

  /**
   * 处理审批响应
   */
  private async handleApprovalResponse(
    input: UserInput,
    approvalRequest: ApprovalRequest
  ): Promise<InteractionResult> {
    // 清除待处理状态
    this.pendingApprovals.delete(approvalRequest.id);

    const context = this.getContext(input.conversationId || input.userId);
    if (context) {
      context.pendingApproval = undefined;
    }

    // 解析用户选择
    const approved = input.content.includes('✅') || input.content.includes('确认');

    if (approved) {
      // 创建任务
      this.emit('task_created', {
        taskId: approvalRequest.taskId,
        type: 'task',
        description: approvalRequest.description,
        userId: input.userId
      });

      return {
        type: 'task_created',
        taskId: approvalRequest.taskId,
        response: '好的，已为您执行。'
      };
    } else {
      return {
        type: 'direct_response',
        response: '已取消操作。'
      };
    }
  }

  /**
   * 审批结果回调
   */
  handleApprovalResult(approvalId: string, approved: boolean): void {
    const request = this.pendingApprovals.get(approvalId);
    if (request) {
      this.emit('approval_resolved', { approvalId, approved, request });
    }
  }

  // ============================================================================
  // 反馈管理
  // ============================================================================

  createFeedbackRequest(
    _userId: string,
    request: FeedbackRequest
  ): void {
    this.pendingFeedbacks.set(request.id, request);

    this.emit('feedback_requested', request);

    // 设置超时
    setTimeout(() => {
      if (this.pendingFeedbacks.has(request.id)) {
        this.pendingFeedbacks.delete(request.id);
        this.emit('feedback_timeout', request);
      }
    }, this.config.feedbackTimeout);
  }

  /**
   * 处理反馈响应
   */
  private async handleFeedbackResponse(
    input: UserInput,
    feedbackRequest: FeedbackRequest
  ): Promise<InteractionResult> {
    this.pendingFeedbacks.delete(feedbackRequest.id);

    const context = this.getContext(input.conversationId || input.userId);
    if (context) {
      context.pendingFeedback = undefined;
    }

    this.emit('feedback_received', {
      feedbackId: feedbackRequest.id,
      response: input.content
    });

    return {
      type: 'direct_response',
      response: '感谢你的反馈！'
    };
  }

  // ============================================================================
  // 上下文管理
  // ============================================================================

  private getOrCreateContext(input: UserInput): InteractionContext {
    const conversationId = input.conversationId || `${input.userId}-${input.source}`;

    if (!this.contexts.has(conversationId)) {
      const { userId, source } = input;
      this.contexts.set(conversationId, {
        userId,
        source,
        conversationId
      });
    }

    return this.contexts.get(conversationId)!;
  }

  private getContext(id: string): InteractionContext | undefined {
    return this.contexts.get(id);
  }

  /**
   * 更新上下文
   */
  updateContext(conversationId: string, updates: Partial<InteractionContext>): void {
    const context = this.contexts.get(conversationId);
    if (context) {
      Object.assign(context, updates);
    }
  }

  /**
   * 清除上下文
   */
  clearContext(conversationId: string): void {
    this.contexts.delete(conversationId);
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private extractPriority(intent: Intent): TaskPriority {
    const priority = intent.entities.priority;
    if (priority === 'critical') return 'critical';
    if (priority === 'high') return 'high';
    if (priority === 'medium') return 'medium';
    return 'medium';
  }

  private checkRequiresApproval(intent: Intent, priority: TaskPriority): boolean {
    // 高优先级任务需要审批
    if (priority === 'critical' || priority === 'high') {
      return true;
    }

    // 包含特定关键词需要审批
    const requiresApprovalKeywords = ['删除', '清除', '重置', '修改配置', '停止'];
    const content = intent.rawInput.toLowerCase();

    return requiresApprovalKeywords.some(keyword => content.includes(keyword));
  }

  private generateTaskId(): string {
    return this.generateId('task');
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private async generateChatResponse(input: string): Promise<string> {
    // 使用 LLM 生成回复
    try {
      const { LangChainLLMTool } = await import('../../core/capability/index.js');
      const llmTool = new LangChainLLMTool();

      const systemPrompt = `你是 AI Company v4 的 CEO 助手，负责与用户沟通和协调任务。

你的职责：
1. 回答用户的问题
2. 帮助用户明确需求
3. 解释系统的能力
4. 友好、专业、简洁

系统功能：
- 新闻搜索与信息收集
- 内容创作（文章、社交媒体文案）
- 小红书发布
- 数据分析
- 任务执行与管理

回答要求：
- 简洁明了，不超过100字
- 友好专业
- 如果用户需要执行任务，引导他们明确描述
- 使用中文`;

      const response = await llmTool.execute({
        input: systemPrompt + '\n\n用户说：' + input
      });

      return response.content || '你好！我是 AI Company v4 的助手。有什么我可以帮助你的吗？';
    } catch (error) {
      this.logger.error({ error }, 'LLM response failed, falling back to default');

      // 降级到简单回复
      const greetings = ['你好', 'hello', 'hi', '嗨', 'hey', '在吗', '能'];
      if (greetings.some(g => input.toLowerCase().includes(g))) {
        return '你好！我是 AI Company v4 的助手。我可以帮你：\n\n📰 搜索最新信息\n✍️ 创作内容\n📤 发布小红书\n📊 分析数据\n\n请告诉我你需要什么帮助？';
      }

      const thanks = ['谢谢', '感谢', 'thanks', 'thank you'];
      if (thanks.some(t => input.toLowerCase().includes(t))) {
        return '不客气！有其他问题随时问我。';
      }

      return '我收到了你的消息。请告诉我你具体需要什么帮助？';
    }
  }

  private formatStatus(status: any): string {
    if (!status) {
      return '暂无状态信息。';
    }

    return `
📊 系统状态

运行状态：${status.running ? '✅ 运行中' : '❌ 已停止'}
活跃任务：${status.activeTasks || 0}
待处理：${status.pendingTasks || 0}
员工数：${status.employees || 0}
    `.trim();
  }

  // ============================================================================
  // 状态管理
  // ============================================================================

  /**
   * 获取待处理审批列表
   */
  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values());
  }

  /**
   * 获取待处理反馈列表
   */
  getPendingFeedbacks(): FeedbackRequest[] {
    return Array.from(this.pendingFeedbacks.values());
  }

  /**
   * 清理过期的审批
   */
  cleanupExpiredApprovals(): number {
    const now = Date.now();
    let count = 0;

    for (const [id, request] of this.pendingApprovals.entries()) {
      // 简单超时检查 - 假设创建时间为 5 分钟前
      const createdAt = now - 300000; // 5 分钟前
      const timeout = request.timeout || 300000; // 默认 5 分钟
      if (now - createdAt > timeout) {
        this.pendingApprovals.delete(id);
        count++;
      }
    }

    return count;
  }
}
