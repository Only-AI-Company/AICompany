/**
 * AI Company v2 - Event Collector
 *
 * 事件采集器 - 统一采集各类事件源并发出到 EventBus
 *
 * 职责：
 * - CLI 输入采集
 * - Telegram 消息采集
 * - 未来可扩展：Webhook、API 等
 *
 * 设计原则：
 * - 只负责采集，不处理逻辑
 * - 所有事件统一发出到 EventBus
 * - 支持多个采集源并行运行
 */

import { EventEmitter } from 'events';
import { getEventBus, type SystemEvent, type UserInputEvent, type TimeTriggeredEvent } from './EventBus.js';

// ============================================================================
// 类型定义
// ============================================================================

export interface EventCollectorOptions {
  /** 是否启用 CLI 采集 */
  enableCLI?: boolean;
}

export interface CollectorStats {
  totalEventsCollected: number;
  eventsBySource: Record<string, number>;
  eventsByType: Record<string, number>;
  uptime: number;
}

// ============================================================================
// Event Collector
// ============================================================================

/**
 * 事件采集器
 *
 * 核心职责：从各种来源采集事件，统一发出到 EventBus
 */
export class EventCollector extends EventEmitter {
  private eventBus = getEventBus();
  private options: Required<EventCollectorOptions>;
  private started = false;
  private startTime = 0;

  // 统计信息
  private stats = {
    totalEventsCollected: 0,
    eventsBySource: {} as Record<string, number>,
    eventsByType: {} as Record<string, number>,
  };

  constructor(options: EventCollectorOptions = {}) {
    super();

    this.options = {
      enableCLI: options.enableCLI ?? true,
    };
  }

  // ---------------------------------------------------------------------------
  // 生命周期
  // ---------------------------------------------------------------------------

  /**
   * 启动事件采集器
   */
  start(): void {
    if (this.started) {
      console.log('[EventCollector] Already started');
      return;
    }

    console.log('[EventCollector] Starting event collector...');
    this.startTime = Date.now();

    this.started = true;
    console.log('[EventCollector] Event collector started');
    console.log(`[EventCollector] - CLI: ${this.options.enableCLI ? 'enabled' : 'disabled'}`);

    this.emit('started');
  }

  /**
   * 停止事件采集器
   */
  stop(): void {
    if (!this.started) {
      return;
    }

    console.log('[EventCollector] Stopping event collector...');

    this.started = false;
    console.log('[EventCollector] Event collector stopped');

    this.emit('stopped');
  }

  // ---------------------------------------------------------------------------
  // 事件采集方法
  // ---------------------------------------------------------------------------

  /**
   * 采集 CLI 输入事件
   *
   * @param content 用户输入内容
   * @param userId 用户 ID
   */
  collectCLIInput(content: string, userId?: string): void {
    const event: UserInputEvent = {
      type: 'user.input',
      source: 'cli',
      content,
      userId: userId || 'cli_user',
      chatId: `cli_${Date.now()}`,
    };

    this.emitEvent(event, 'cli');
  }

  /**
   * 采集 Telegram 消息事件
   *
   * @param content 消息内容
   * @param userId Telegram 用户 ID
   * @param chatId Telegram 聊天 ID
   * @param rawData 原始消息数据
   */
  collectTelegramInput(
    content: string,
    userId: string,
    chatId: string,
    rawData?: any
  ): void {
    const event: UserInputEvent = {
      type: 'user.input',
      source: 'telegram',
      content,
      userId,
      chatId,
      metadata: { rawData },
    };

    this.emitEvent(event, 'telegram');
  }

  /**
   * 采集 API 输入事件
   *
   * @param content 输入内容
   * @param userId 用户 ID
   * @param metadata 额外元数据
   */
  collectAPIInput(content: string, userId: string, metadata?: Record<string, unknown>): void {
    const event: UserInputEvent = {
      type: 'user.input',
      source: 'api',
      content,
      userId,
      metadata,
    };

    this.emitEvent(event, 'api');
  }

  /**
   * 采集自定义事件
   *
   * @param event 系统事件
   * @param source 事件来源
   */
  collectCustomEvent(event: SystemEvent, source: string): void {
    this.emitEvent(event, source);
  }

  // ---------------------------------------------------------------------------
  // 事件发出
  // ---------------------------------------------------------------------------

  /**
   * 发出事件到 EventBus
   */
  private emitEvent(event: SystemEvent, source: string): void {
    // 更新统计
    this.stats.totalEventsCollected++;
    this.stats.eventsBySource[source] = (this.stats.eventsBySource[source] || 0) + 1;
    this.stats.eventsByType[event.type] = (this.stats.eventsByType[event.type] || 0) + 1;

    // 发出到 EventBus
    this.eventBus.emit(event);

    // 触发内部事件
    this.emit('collected', { event, source });
  }

  // ---------------------------------------------------------------------------
  // 查询方法
  // ---------------------------------------------------------------------------

  /**
   * 获取统计信息
   */
  getStats(): CollectorStats {
    return {
      totalEventsCollected: this.stats.totalEventsCollected,
      eventsBySource: { ...this.stats.eventsBySource },
      eventsByType: { ...this.stats.eventsByType },
      uptime: this.started ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * 是否正在运行
   */
  isRunning(): boolean {
    return this.started;
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      totalEventsCollected: 0,
      eventsBySource: {},
      eventsByType: {},
    };
  }
}

// ============================================================================
// 单例
// ============================================================================

let collectorInstance: EventCollector | null = null;

export function getEventCollector(options?: EventCollectorOptions): EventCollector {
  if (!collectorInstance) {
    collectorInstance = new EventCollector(options);
  }
  return collectorInstance;
}

export function resetEventCollector(): void {
  if (collectorInstance) {
    if (collectorInstance.isRunning()) {
      collectorInstance.stop();
    }
    collectorInstance = null;
  }
}
