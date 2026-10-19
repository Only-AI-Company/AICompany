/**
 * AI Company v2 - 交互管理器
 *
 * 负责处理 Agent 与用户之间的交互：
 * - Agent 请求用户输入/确认/选择
 * - 通过相应渠道（CLI/Telegram）发送交互请求
 * - 等待用户响应
 * - 将响应返回给 Agent
 */

import { getEventBus, type InteractionEvent } from './EventBus.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 交互请求
 */
export interface InteractionRequest {
  interactionId: string;
  taskId: string;
  agentId: string;
  agentName: string;
  type: 'confirm' | 'select' | 'input';
  question: string;
  options?: Array<{
    value: string;
    label: string;
    description?: string;
  }>;
  default?: any;
  placeholder?: string;
  multiline?: boolean;
  timeout?: number;
  chatId?: string;
  userId?: string;
}

/**
 * 交互响应
 */
export interface InteractionResponse {
  interactionId: string;
  value: any;
  cancelled?: boolean;
  timeout?: boolean;
}

/**
 * 等待中的交互
 */
interface PendingInteraction {
  request: InteractionRequest;
  resolve: (response: InteractionResponse) => void;
  timeoutTimer?: NodeJS.Timeout;
  createdAt: number;
}

// ============================================================================
// 交互管理器
// ============================================================================

export class InteractionManager {
  private eventBus = getEventBus();
  private pendingInteractions = new Map<string, PendingInteraction>();
  private readonly DEFAULT_TIMEOUT = 300000; // 5 分钟

  constructor() {
    this.setupEventListeners();
  }

  /**
   * 启动交互管理器
   */
  start(): void {
    console.log('[InteractionManager] Starting interaction manager...');
    console.log('[InteractionManager] Interaction manager started');
  }

  /**
   * 停止交互管理器
   */
  stop(): void {
    console.log('[InteractionManager] Stopping interaction manager...');

    // 清理所有等待中的交互
    for (const [interactionId, pending] of this.pendingInteractions) {
      if (pending.timeoutTimer) {
        clearTimeout(pending.timeoutTimer);
      }
      // 用超时响应 resolve
      pending.resolve({
        interactionId,
        value: null,
        timeout: true,
      });
    }

    this.pendingInteractions.clear();
    console.log('[InteractionManager] Interaction manager stopped');
  }

  /**
   * 请求用户交互
   *
   * @param request 交互请求
   * @returns Promise<用户响应>
   */
  async requestInteraction(request: InteractionRequest): Promise<InteractionResponse> {
    const interactionId = request.interactionId || uuidv4();
    const interaction: InteractionEvent = {
      type: 'interaction.requested',
      interactionId,
      taskId: request.taskId,
      agentId: request.agentId,
      agentName: request.agentName,
      interaction: {
        type: request.type,
        question: request.question,
        options: request.options,
        default: request.default,
        placeholder: request.placeholder,
        multiline: request.multiline,
      },
      userId: request.userId,
      chatId: request.chatId,
      timestamp: Date.now(),
    };

    console.log(`[InteractionManager] 📤 请求交互: ${request.type} - ${request.question.substring(0, 50)}...`);

    // 发出交互事件
    this.eventBus.emit(interaction);

    // 创建 Promise 等待响应
    return new Promise<InteractionResponse>((resolve) => {
      // 设置超时
      const timeout = request.timeout || this.DEFAULT_TIMEOUT;
      const timeoutTimer = setTimeout(() => {
        this.pendingInteractions.delete(interactionId);

        // 发出超时事件
        this.eventBus.emit({
          type: 'interaction.timeout',
          interactionId,
          taskId: request.taskId,
          agentId: request.agentId,
          agentName: request.agentName,
          interaction: {
            type: request.type,
            question: request.question,
            options: request.options,
            default: request.default,
            placeholder: request.placeholder,
            multiline: request.multiline,
          },
          timestamp: Date.now(),
        } as InteractionEvent);

        resolve({
          interactionId,
          value: null,
          timeout: true,
        });
      }, timeout);

      // 保存等待中的交互
      this.pendingInteractions.set(interactionId, {
        request,
        resolve,
        timeoutTimer,
        createdAt: Date.now(),
      });
    });
  }

  /**
   * 处理用户响应
   *
   * @param interactionId 交互 ID
   * @param value 用户响应值
   * @param cancelled 是否取消
   */
  handleResponse(interactionId: string, value: any, cancelled = false): void {
    const pending = this.pendingInteractions.get(interactionId);

    if (!pending) {
      console.warn(`[InteractionManager] ⚠️ 未找到等待中的交互: ${interactionId}`);
      return;
    }

    console.log(`[InteractionManager] 📥 收到响应: ${interactionId}`);

    // 清理超时定时器
    if (pending.timeoutTimer) {
      clearTimeout(pending.timeoutTimer);
    }

    // 从等待列表中移除
    this.pendingInteractions.delete(interactionId);

    // 发出响应事件
    this.eventBus.emit({
      type: 'interaction.responded',
      interactionId,
      taskId: pending.request.taskId,
      agentId: pending.request.agentId,
      agentName: pending.request.agentName,
      interaction: {
        type: pending.request.type,
        question: pending.request.question,
        options: pending.request.options,
        default: pending.request.default,
        placeholder: pending.request.placeholder,
        multiline: pending.request.multiline,
      },
      userId: pending.request.userId,
      chatId: pending.request.chatId,
      response: value,
      timestamp: Date.now(),
    } as InteractionEvent);

    // resolve Promise
    pending.resolve({
      interactionId,
      value,
      cancelled,
    });
  }

  /**
   * 取消交互
   *
   * @param interactionId 交互 ID
   */
  cancelInteraction(interactionId: string): void {
    const pending = this.pendingInteractions.get(interactionId);

    if (!pending) {
      return;
    }

    console.log(`[InteractionManager] ❌ 取消交互: ${interactionId}`);

    // 清理超时定时器
    if (pending.timeoutTimer) {
      clearTimeout(pending.timeoutTimer);
    }

    // 从等待列表中移除
    this.pendingInteractions.delete(interactionId);

    // 发出取消事件
    this.eventBus.emit({
      type: 'interaction.cancelled',
      interactionId,
      taskId: pending.request.taskId,
      agentId: pending.request.agentId,
      agentName: pending.request.agentName,
      interaction: {
        type: pending.request.type,
        question: pending.request.question,
        options: pending.request.options,
        default: pending.request.default,
        placeholder: pending.request.placeholder,
        multiline: pending.request.multiline,
      },
      timestamp: Date.now(),
    } as InteractionEvent);

    // resolve Promise（cancelled=true）
    pending.resolve({
      interactionId,
      value: null,
      cancelled: true,
    });
  }

  /**
   * 获取等待中的交互统计
   */
  getStats(): {
    pending: number;
    interactions: Array<{
      interactionId: string;
      type: string;
      question: string;
      agentName: string;
      elapsed: number;
    }>;
  } {
    const now = Date.now();
    const interactions = Array.from(this.pendingInteractions.values()).map(pending => ({
      interactionId: pending.request.interactionId,
      type: pending.request.type,
      question: pending.request.question.substring(0, 100),
      agentName: pending.request.agentName,
      elapsed: now - pending.createdAt,
    }));

    return {
      pending: this.pendingInteractions.size,
      interactions,
    };
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 这里可以添加其他事件监听器
  }
}

// ============================================================================
// 单例
// ============================================================================

let interactionManagerInstance: InteractionManager | null = null;

export function getInteractionManager(): InteractionManager {
  if (!interactionManagerInstance) {
    interactionManagerInstance = new InteractionManager();
  }
  return interactionManagerInstance;
}
