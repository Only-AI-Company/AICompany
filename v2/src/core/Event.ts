/**
 * AI Company v2 - 事件系统
 *
 * 简单的事件总线，所有组件通过事件通信
 */
import EventEmitter from 'eventemitter3';
import type { EventHandler, SystemEvent, EventTypeName } from '../types.js';
import { EventType } from '../types.js';

export { EventType };

class EventBusInner {
  private emitter = new EventEmitter();

  emit(type: EventTypeName, data: any): void {
    const event: SystemEvent = {
      type,
      data,
      timestamp: Date.now(),
    };

    this.emitter.emit(type, event);
    this.emitter.emit('*', event); // 通配符，监听所有事件
  }

  on(type: EventTypeName | '*', handler: EventHandler): () => void {
    this.emitter.on(type, handler as any);
    return () => this.emitter.off(type, handler as any);
  }

  once(type: EventTypeName, handler: EventHandler): () => void {
    this.emitter.once(type, handler as any);
    return () => this.emitter.off(type, handler as any);
  }

  off(type: EventTypeName | '*', handler: EventHandler): void {
    this.emitter.off(type, handler as any);
  }

  async waitFor(type: EventTypeName, filter?: (data: any) => boolean, timeout = 30000): Promise<SystemEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();  // 清理订阅
        reject(new Error(`Timeout waiting for event: ${type}`));
      }, timeout);

      const handler: EventHandler = (event) => {
        if (!filter || filter(event.data)) {
          clearTimeout(timer);
          unsubscribe();  // 清理订阅
          resolve(event);
        }
      };

      const unsubscribe = this.on(type, handler);
    });
  }
}

// 类型别名，对外暴露
export class EventBus extends EventBusInner {}

// 单例
let eventBusInstance: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus();
  }
  return eventBusInstance;
}
