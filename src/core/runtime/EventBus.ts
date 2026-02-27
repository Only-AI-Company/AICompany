/**
 * AI Company - EventBus (事件总线)
 *
 * 使用 eventemitter3 替代原生 EventEmitter
 * 提供更好的性能和浏览器兼容性
 */

import EventEmitter from 'eventemitter3';

/**
 * 事件类型
 */
export type EventType = string;

/**
 * 事件数据
 */
export interface Event {
  /** 事件类型 */
  type: EventType;
  /** 事件数据 */
  data: any;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 事件处理器
 */
export type EventHandler = (event: Event) => void | Promise<void>;

/**
 * 事件订阅选项
 */
export interface EventSubscriptionOptions {
  /** 是否一次性 */
  once?: boolean;
  /** 是否异步处理 */
  async?: boolean;
}

/**
 * 事件总线
 */
export class EventBus extends EventEmitter {
  /**
   * 发布事件
   */
  publish(type: EventType, data: any = {}): void {
    const event: Event = {
      type,
      data,
      timestamp: Date.now(),
    };
    this.emit(type, event);
    this.emit('*', event); // 通配符监听所有事件
  }

  /**
   * 订阅事件
   */
  subscribe(type: EventType, handler: EventHandler, options?: EventSubscriptionOptions): void {
    if (options?.once) {
      this.once(type, handler);
    } else {
      this.on(type, handler);
    }
  }

  /**
   * 订阅所有事件（通过通配符）
   */
  subscribeToAll(handler: EventHandler): void {
    this.on('*', handler);
  }

  /**
   * 取消订阅
   */
  unsubscribe(type: EventType, handler: EventHandler): void {
    this.off(type, handler);
  }

  /**
   * 取消所有订阅
   */
  unsubscribeAll(): void {
    this.removeAllListeners();
  }

  /**
   * 异步发布事件（等待所有处理器完成）
   */
  async publishAsync(type: EventType, data: any = {}): Promise<void> {
    const event: Event = {
      type,
      data,
      timestamp: Date.now(),
    };

    // 获取所有监听器
    const listeners = this.listeners(type) as Array<EventHandler>;
    if (listeners.length === 0) {
      return;
    }

    // 等待所有异步处理器
    await Promise.all(
      listeners.map((listener) => {
        try {
          const result = listener(event);
          // Check if result is a promise-like object (has 'then' method)
          if (result && (result as any).then && typeof (result as any).then === 'function') {
            return result;
          }
          return Promise.resolve();
        } catch (error) {
          console.error(`[EventBus] Error in ${type} handler:`, error);
          return Promise.resolve();
        }
      })
    );

    this.emit('*', event);
  }

  /**
   * 清空所有订阅
   */
  clear(): void {
    this.removeAllListeners();
  }
}

// 单例
let eventBusInstance: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus();
  }
  return eventBusInstance;
}
