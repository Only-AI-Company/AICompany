/**
 * AI Company v2 - 事件驱动核心
 *
 * 一切皆事件：用户输入、时间触发、任务状态、产出创建...
 * 所有组件通过 EventBus 连接，完全解耦
 */

// ========== 事件类型定义 ==========

/**
 * 决策事件
 */
export interface DecisionEvent {
  type: 'decision.requested' | 'decision.made';
  decisionId: string;
  taskId: string;
  description?: string;
  decision?: {
    selectedOption: string;
    reasoning: string;
    followUp?: string;
  };
  timestamp: number;
}

/**
 * 进度事件
 */
export interface ProgressEvent {
  type: 'task.progress';
  taskId: string;
  agentId: string;
  agentName: string;
  progress: {
    turn: number;
    toolCall?: {
      name: string;
      input: any;
    };
    message: string;
    timestamp: number;
  };
  timestamp: number;
}

/**
 * 员工绩效事件
 */
export interface EmployeePerformanceEvent {
  type: 'employee.performance_updated';
  employeeId: string;
  update: {
    pointsDelta: number;
    satisfactionDelta?: number;
    levelUp?: boolean;
    reason: string;
  };
  timestamp: number;
}

/**
 * 交互事件（Agent 与用户交互）
 */
export interface InteractionEvent {
  type: 'interaction.requested' | 'interaction.responded' | 'interaction.timeout' | 'interaction.cancelled';
  interactionId: string;
  taskId: string;
  agentId: string;
  agentName: string;
  interaction: {
    type: 'confirm' | 'select' | 'input';
    question: string;
    options?: InteractionOption[];
    default?: any;
    placeholder?: string;  // for input type
    multiline?: boolean;   // for input type
  };
  userId?: string;
  chatId?: string;
  response?: any;         // 用户响应
  timestamp: number;
}

/**
 * 交互选项
 */
export interface InteractionOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * 系统事件类型
 */
export type SystemEvent =
  // 用户输入事件
  | UserInputEvent
  // 时间触发事件
  | TimeTriggeredEvent
  // 任务事件
  | TaskEvent
  // 产出事件
  | OutputEvent
  // 通知事件
  | NotificationEvent
  // 决策事件
  | DecisionEvent
  // 员工绩效事件
  | EmployeePerformanceEvent
  // 进度事件
  | ProgressEvent
  // 交互事件
  | InteractionEvent;

/**
 * 用户输入事件
 */
export interface UserInputEvent {
  type: 'user.input';
  source: 'telegram' | 'cli' | 'api';
  content: string;
  userId?: string;
  chatId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 时间触发事件
 */
export interface TimeTriggeredEvent {
  type: 'time.triggered';
  triggerType: 'cron' | 'overdue' | 'scheduled';
  data: Record<string, unknown>;
  timestamp: number;
}

/**
 * 任务事件
 */
export interface TaskEvent {
  type: 'task.created' | 'task.started' | 'task.completed' | 'task.failed';
  taskId: string;
  result?: TaskResult;
  error?: string;
  timestamp: number;
}

interface TaskResult {
  success: boolean;
  output?: string;
  artifacts?: Array<{
    type: string;
    name: string;
    content?: string;
  }>;
}

/**
 * 产出事件
 */
export interface OutputEvent {
  type: 'output.created' | 'output.published' | 'output.rejected';
  outputId: string;
  taskId: string;
  outputType: 'code' | 'article' | 'post' | 'document' | 'other';
  content?: string;
  platform?: string;
  timestamp: number;
}

/**
 * 通知事件
 */
export interface NotificationEvent {
  type: 'notification.needed';
  userId?: string;
  channel: 'telegram' | 'cli' | 'email';
  message: string;
  chatId?: string;  // For sending replies back to Telegram
  metadata?: Record<string, unknown>;
}

// ========== 事件总线 ==========

type EventListener<T extends SystemEvent = SystemEvent> = (event: T) => void | Promise<void>;
type UnsubscribeFunction = () => void;

export class EventBus {
  private listeners = new Map<string, Set<EventListener>>();
  private eventHistory: SystemEvent[] = [];
  private maxHistorySize = 1000;

  // 数据库实例（可选，用于死信记录）
  private db: any | null = null;

  // 错误计数和熔断
  private errorCounts = new Map<string, number>(); // 事件类型 -> 错误计数
  private errorHistory: Array<{ eventType: string; error: Error; timestamp: number }> = [];
  private readonly ERROR_THRESHOLD = 5; // 连续错误阈值
  private readonly ERROR_HISTORY_LIMIT = 100; // 错误历史记录限制
  private readonly CRITICAL_EVENTS = [
    'task.completed',
    'task.failed',
    'user.input',
    'decision.made',
    'notification.needed',
  ]; // 关键事件列表

  // 失败事件队列
  private failedEventQueue: Array<{
    event: SystemEvent;
    listener: EventListener;
    eventType: string;
    error: Error;
    timestamp: number;
    retryCount: number;
    nextRetryTime: number;
  }> = [];
  private retryTimer?: NodeJS.Timeout;
  private readonly RETRY_INTERVAL = 10000; // 10 秒检查一次重试队列
  private readonly MAX_RETRY_ATTEMPTS = 5; // 最大重试次数
  private readonly MAX_FAILED_QUEUE_SIZE = 500; // 失败队列最大大小

  constructor(db?: any) {
    if (db) {
      this.db = db;
    }
    // 启动重试定时器
    this.startRetryTimer();
  }

  /**
   * 设置数据库实例（用于死信记录）
   */
  setDatabase(db: any): void {
    this.db = db;
  }

  /**
   * 启动重试定时器
   */
  private startRetryTimer(): void {
    this.retryTimer = setInterval(() => {
      this.processFailedEventQueue();
    }, this.RETRY_INTERVAL);

    console.log(`[EventBus] 失败事件重试定时器已启动 (间隔: ${this.RETRY_INTERVAL}ms)`);
  }

  /**
   * 停止重试定时器
   */
  private stopRetryTimer(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = undefined;
      console.log('[EventBus] 失败事件重试定时器已停止');
    }
  }

  /**
   * 处理失败事件队列
   */
  private processFailedEventQueue(): void {
    const now = Date.now();
    const retryableEvents: typeof this.failedEventQueue = [];

    // 找出所有可以重试的事件
    for (const item of this.failedEventQueue) {
      if (now >= item.nextRetryTime && item.retryCount < this.MAX_RETRY_ATTEMPTS) {
        retryableEvents.push(item);
      }
    }

    if (retryableEvents.length === 0) {
      return;
    }

    console.log(`[EventBus] 🔄 发现 ${retryableEvents.length} 个可重试的失败事件`);

    for (const item of retryableEvents) {
      // 从队列中移除
      const index = this.failedEventQueue.indexOf(item);
      if (index !== -1) {
        this.failedEventQueue.splice(index, 1);
      }

      // 增加重试计数
      item.retryCount++;
      item.nextRetryTime = now + this.calculateRetryDelay(item.retryCount);

      console.log(`[EventBus] 🔄 重试事件: ${item.eventType} (尝试 ${item.retryCount}/${this.MAX_RETRY_ATTEMPTS})`);

      // 重试执行
      this.executeListenerWithRetry(item.listener, item.event, item.eventType, item.retryCount);
    }
  }

  /**
   * 计算重试延迟（指数退避）
   */
  private calculateRetryDelay(retryCount: number): number {
    // 初始 10 秒，每次翻倍，最大 5 分钟
    const delay = 10000 * Math.pow(2, retryCount - 1);
    return Math.min(delay, 300000);
  }

  /**
   * 带重试的监听器执行
   */
  private executeListenerWithRetry(
    listener: EventListener,
    event: SystemEvent,
    eventType: string,
    retryCount: number
  ): void {
    Promise.resolve(listener(event))
      .then(() => {
        // 成功：清除错误计数（如果之前有错误）
        if (this.errorCounts.has(eventType)) {
          const currentCount = this.errorCounts.get(eventType)!;
          this.errorCounts.set(eventType, Math.max(0, currentCount - 1));
          console.log(`[EventBus] ✅ ${eventType} 处理器恢复成功，错误计数: ${this.errorCounts.get(eventType)}/${this.ERROR_THRESHOLD}`);
        }
      })
      .catch((error) => {
        // 失败：重新加入失败队列（如果还有重试机会）
        if (retryCount < this.MAX_RETRY_ATTEMPTS) {
          this.addToFailedQueue(event, listener, eventType, error, retryCount);
        } else {
          console.error(`[EventBus] ❌ ${eventType} 处理器重试 ${this.MAX_RETRY_ATTEMPTS} 次后仍失败，放弃重试`);

          // 记录到死信队列（数据库）
          this.recordDeadLetter(event, eventType, error);
        }
      });
  }

  /**
   * 添加事件到失败队列
   */
  private addToFailedQueue(
    event: SystemEvent,
    listener: EventListener<any>,
    eventType: string,
    error: Error,
    retryCount: number = 1
  ): void {
    // 检查队列大小限制
    if (this.failedEventQueue.length >= this.MAX_FAILED_QUEUE_SIZE) {
      console.warn(`[EventBus] ⚠️ 失败事件队列已满 (${this.MAX_FAILED_QUEUE_SIZE})，移除最老的事件`);
      this.failedEventQueue.shift(); // 移除最老的事件
    }

    this.failedEventQueue.push({
      event,
      listener,
      eventType,
      error,
      timestamp: Date.now(),
      retryCount,
      nextRetryTime: Date.now() + this.calculateRetryDelay(retryCount),
    });

    console.log(`[EventBus] 📋 事件 ${eventType} 已加入失败队列 (队列大小: ${this.failedEventQueue.length}/${this.MAX_FAILED_QUEUE_SIZE})`);
  }

  /**
   * 记录到死信队列（数据库）
   */
  private recordDeadLetter(event: SystemEvent, eventType: string, error: Error): void {
    // 使用注入的数据库实例，避免循环依赖
    if (!this.db) {
      return; // 没有数据库实例时跳过记录
    }

    // 异步记录到数据库，不阻塞
    setTimeout(() => {
      try {
        this.db.logActivity({
          eventType: 'eventbus.dead_letter',
          actor: 'eventbus',
          action: 'event_processing_failed',
          context: {
            eventType,
            retryCount: this.MAX_RETRY_ATTEMPTS,
            event: JSON.stringify(this.formatEvent(event)).substring(0, 500),
            error: error.message,
          },
        });
      } catch (e) {
        console.error('[EventBus] 记录死信队列失败:', e);
      }
    }, 0);
  }

  /**
   * 发布事件
   */
  emit<T extends SystemEvent>(event: T): void {
    // 记录到历史
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // 打印日志
    console.log(`[EventBus] ${event.type}`, this.formatEvent(event));

    // 通知类型订阅者
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        // 异步执行，不阻塞
        this.safeExecute(listener, event);
      }
    }

    // 通知通配符订阅者
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        this.safeExecute(listener, event);
      }
    }
  }

  /**
   * 订阅事件
   */
  on<T extends SystemEvent>(
    eventType: string,
    handler: EventListener<T>
  ): UnsubscribeFunction {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler as EventListener<SystemEvent>);

    console.log(`[EventBus] Registered listener for: ${eventType}`);

    return () => {
      this.listeners.get(eventType)?.delete(handler as EventListener<SystemEvent>);
      console.log(`[EventBus] Unregistered listener for: ${eventType}`);
    };
  }

  /**
   * 订阅所有事件
   */
  onAny(handler: EventListener): UnsubscribeFunction {
    if (!this.listeners.has('*')) {
      this.listeners.set('*', new Set());
    }
    this.listeners.get('*')!.add(handler as EventListener<SystemEvent>);

    const unsubscribe = () => {
      this.listeners.get('*')?.delete(handler as EventListener<SystemEvent>);
      console.log(`[EventBus] Unregistered wildcard listener`);
    };

    return unsubscribe;
  }

  /**
   * 等待某个事件（用于异步等待）
   */
  async waitFor<T extends SystemEvent>(
    eventType: string,
    filter?: (event: T) => boolean,
    timeout = 30000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout waiting for event: ${eventType}`));
      }, timeout);

      const unsubscribe = this.on<T>(eventType, (event) => {
        if (!filter || filter(event)) {
          clearTimeout(timer);
          unsubscribe();
          resolve(event);
        }
      });
    });
  }

  /**
   * 获取事件历史
   */
  getHistory(eventType?: string): SystemEvent[] {
    if (eventType) {
      return this.eventHistory.filter(e => e.type === eventType);
    }
    return [...this.eventHistory];
  }

  /**
   * 清空历史
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * 安全执行处理器（捕获错误）
   *
   * 改进版：对于关键事件，添加到失败队列进行重试
   * 同时捕获同步和异步错误
   */
  private safeExecute<T extends SystemEvent>(
    handler: EventListener<T>,
    event: T
  ): void {
    // 错误处理函数（提取出来避免重复代码）
    const handleError = (error: unknown): void => {
      const eventType = event.type;
      const errorObj = error instanceof Error ? error : new Error(String(error));

      // 记录错误
      console.error(`[EventBus] Handler error for ${eventType}:`, errorObj);

      // 更新错误计数
      const currentCount = (this.errorCounts.get(eventType) || 0) + 1;
      this.errorCounts.set(eventType, currentCount);

      // 记录错误历史
      this.errorHistory.push({
        eventType,
        error: errorObj,
        timestamp: Date.now(),
      });

      // 限制错误历史大小
      if (this.errorHistory.length > this.ERROR_HISTORY_LIMIT) {
        this.errorHistory.shift();
      }

      // 检查是否为关键事件
      const isCritical = this.CRITICAL_EVENTS.includes(eventType);
      if (isCritical) {
        // 关键事件：添加到失败队列进行重试
        console.warn(`[EventBus] ⚠️ 关键事件 ${eventType} 处理失败，加入重试队列`);
        this.addToFailedQueue(event, handler, eventType, errorObj);
      } else {
        // 非关键事件：检查错误计数
        if (currentCount >= this.ERROR_THRESHOLD) {
          this.handleCriticalEventError(eventType, currentCount);
        }
      }

      // 记录到数据库（异步，不阻塞）
      import('../../db/Database.js').then(({ getDatabase }) => {
        try {
          const db = getDatabase();
          db.logActivity({
            eventType: 'eventbus.handler_error',
            actor: 'eventbus',
            action: 'handler_failed',
            context: {
              eventType,
              errorCount: currentCount,
              isCritical,
              errorMessage: errorObj.message,
            },
          });
        } catch (e) {
          // 数据库记录失败不影响主流程
        }
      });
    };

    try {
      // 使用 Promise 包装以捕获同步和异步错误
      Promise.resolve()
        .then(() => handler(event))
        .catch(handleError);
    } catch (syncError) {
      // 捕获同步错误（在 Promise.then 之前抛出的错误）
      handleError(syncError);
    }
  }

  /**
   * 处理关键事件的严重错误
   */
  private handleCriticalEventError(eventType: string, errorCount: number): void {
    const errorMsg = `[EventBus] ⚠️  关键事件 ${eventType} 处理器连续失败 ${errorCount} 次，系统可能不稳定`;

    console.error(errorMsg);

    // 发出系统告警事件
    this.emit({
      type: 'notification.needed',
      channel: 'cli',
      message: errorMsg,
    } as any);

    // 如果错误数量过多，可以考虑暂时禁用该事件的处理器
    if (errorCount >= this.ERROR_THRESHOLD * 2) {
      console.error(`[EventBus] ❌ 事件 ${eventType} 错误过多，可能需要重启系统`);
    }
  }

  /**
   * 重置事件类型的错误计数
   */
  resetErrorCount(eventType: string): void {
    this.errorCounts.delete(eventType);
    console.log(`[EventBus] 重置事件 ${eventType} 的错误计数`);
  }

  /**
   * 获取错误统计
   */
  getErrorStats(): {
    errorCounts: Record<string, number>;
    recentErrors: Array<{ eventType: string; error: string; timestamp: number }>;
    failedQueueSize: number;
  } {
    const errorCounts: Record<string, number> = {};
    for (const [type, count] of this.errorCounts.entries()) {
      errorCounts[type] = count;
    }

    const recentErrors = this.errorHistory
      .slice(-20)
      .map(e => ({
        eventType: e.eventType,
        error: e.error.message,
        timestamp: e.timestamp,
      }));

    return {
      errorCounts,
      recentErrors,
      failedQueueSize: this.failedEventQueue.length,
    };
  }

  /**
   * 获取失败队列统计
   */
  getFailedQueueStats(): {
    size: number;
    maxSize: number;
    events: Array<{
      eventType: string;
      retryCount: number;
      nextRetryTime: number;
      timestamp: number;
    }>;
  } {
    return {
      size: this.failedEventQueue.length,
      maxSize: this.MAX_FAILED_QUEUE_SIZE,
      events: this.failedEventQueue.map(item => ({
        eventType: item.eventType,
        retryCount: item.retryCount,
        nextRetryTime: item.nextRetryTime,
        timestamp: item.timestamp,
      })),
    };
  }

  /**
   * 手动触发失败队列重试（用于调试）
   */
  triggerRetry(): void {
    console.log('[EventBus] 手动触发失败队列重试...');
    this.processFailedEventQueue();
  }

  /**
   * 关闭 EventBus（停止定时器）
   */
  shutdown(): void {
    console.log('[EventBus] 正在关闭...');

    // 停止重试定时器
    this.stopRetryTimer();

    // 清空监听器
    this.listeners.clear();

    // 清空队列
    this.failedEventQueue = [];

    // 清空历史
    this.eventHistory = [];

    // 清空错误计数
    this.errorCounts.clear();

    console.log('[EventBus] 已关闭');
  }

  /**
   * 检查事件是否健康
   */
  isEventHealthy(eventType: string): boolean {
    const count = this.errorCounts.get(eventType) || 0;
    return count < this.ERROR_THRESHOLD;
  }

  /**
   * 格式化事件用于日志
   */
  private formatEvent(event: SystemEvent): unknown {
    // 移除过长的 content
    if ('content' in event && typeof event.content === 'string' && event.content.length > 100) {
      return { ...event, content: event.content.substring(0, 100) + '...' };
    }
    return event;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalEvents: number;
    listenersByType: Record<string, number>;
    recentEvents: Array<{ type: string; timestamp: number }>;
  } {
    const listenersByType: Record<string, number> = {};
    for (const [type, set] of this.listeners.entries()) {
      listenersByType[type] = set.size;
    }

    const recentEvents = this.eventHistory.slice(-10).map(e => ({
      type: e.type,
      timestamp: 'timestamp' in e ? (e as any).timestamp : Date.now(),
    }));

    return {
      totalEvents: this.eventHistory.length,
      listenersByType,
      recentEvents,
    };
  }
}

// 单例
let eventBusInstance: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!eventBusInstance) {
    // 创建时不传入数据库，避免循环依赖
    eventBusInstance = new EventBus();

    // 懒加载注入数据库（异步，避免循环依赖）
    setTimeout(() => {
      try {
        const { getDatabase } = require('../../db/Database.js');
        const db = getDatabase();
        eventBusInstance?.setDatabase(db);
      } catch (e) {
        // 数据库未初始化时跳过
      }
    }, 0);
  }
  return eventBusInstance;
}

/**
 * 重置 EventBus 单例（用于测试或重启）
 */
export function resetEventBus(): void {
  if (eventBusInstance) {
    eventBusInstance.shutdown();
    eventBusInstance = null;
    console.log('[EventBus] 单例已重置');
  }
}
