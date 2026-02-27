/**
 * AI Company - Hook System
 *
 * 基于 EventBus 的生命周期钩子系统
 * 提供任务、目标、Claude 执行的生命周期钩子
 */

import { EventBus, getEventBus, type Event } from './EventBus.js';

// ============================================================================
// Hook 事件类型定义
// ============================================================================

/** 任务生命周期事件 */
export interface TaskLifecycleEvents {
  'task:before_create': { taskData: any };
  'task:after_create': { task: any };
  'task:before_assign': { taskId: string; employeeId: string };
  'task:after_assign': { taskId: string; employeeId: string };
  'task:before_execute': { taskId: string; employeeId?: string };
  'task:after_execute': { taskId: string; employeeId?: string; result: any };
  'task:on_progress': { taskId: string; progress: number };
  'task:on_complete': { taskId: string; result: any };
  'task:on_failed': { taskId: string; error: string };
  'task:on_cancel': { taskId: string; reason: string };
}

/** Claude 执行事件 */
export interface ClaudeExecutionEvents {
  'claude:before_prompt': { prompt: string; model?: string };
  'claude:after_response': { response: string; usage?: any };
  'claude:stream_chunk': { chunk: string; index: number };
  'claude:on_tool_use': { toolName: string; toolInput: any };
  'claude:on_error': { error: string; phase: string };
  'claude:on_start': { prompt: string; model: string };
  'claude:on_complete': { response: string; duration: number };
}

/** 目标生命周期事件 */
export interface GoalLifecycleEvents {
  'goal:created': { goalId: string; type: string };
  'goal:updated': { goalId: string; changes: any };
  'goal:completed': { goalId: string; progress: any };
  'goal:rejected': { goalId: string; reason: string };
  'goal:decomposed': { parentGoalId: string; subGoalIds: string[] };
}

/** 执行追踪事件 */
export interface ExecutionTrackingEvents {
  'execution:start': { executionId: string; taskId: string };
  'execution:step': { executionId: string; step: any };
  'execution:progress': { executionId: string; progress: number };
  'execution:complete': { executionId: string; result: any };
  'execution:failed': { executionId: string; error: string };
  'execution:timeout': { taskId: string; duration: number; message: string };
  'execution:iteration': { iteration: number; state: string; timestamp: number; duration: number; aiDecision: any };
}

/** 所有事件类型 */
export type AllHookEvents = TaskLifecycleEvents & ClaudeExecutionEvents & GoalLifecycleEvents & ExecutionTrackingEvents;

/** Hook 事件名称 */
export type HookEventName = keyof AllHookEvents;

/** Hook 处理器函数 */
export type HookHandler<T extends HookEventName> = (data: AllHookEvents[T], event: Event) => void | Promise<void>;

// ============================================================================
// HookSystem
// ============================================================================

export class HookSystem {
  private eventBus: EventBus;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus || getEventBus();
  }

  /**
   * 注册 Hook 处理器
   * @param event Hook 事件名称
   * @param handler 处理函数
   */
  on<T extends HookEventName>(event: T, handler: HookHandler<T>): void {
    this.eventBus.subscribe(event, handler as any);
  }

  /**
   * 注册一次性 Hook 处理器
   * @param event Hook 事件名称
   * @param handler 处理函数
   */
  once<T extends HookEventName>(event: T, handler: HookHandler<T>): void {
    this.eventBus.subscribe(event, handler as any, { once: true });
  }

  /**
   * 取消 Hook 处理器
   * @param event Hook 事件名称
   * @param handler 处理函数
   */
  off<T extends HookEventName>(event: T, handler: HookHandler<T>): void {
    this.eventBus.unsubscribe(event, handler as any);
  }

  /**
   * 触发 Hook（同步）
   * @param event Hook 事件名称
   * @param data 事件数据
   */
  emit<T extends HookEventName>(event: T, data: AllHookEvents[T]): void {
    this.eventBus.publish(event, data);
  }

  /**
   * 触发 Hook（异步，等待所有处理器完成）
   * @param event Hook 事件名称
   * @param data 事件数据
   */
  async emitAsync<T extends HookEventName>(event: T, data: AllHookEvents[T]): Promise<void> {
    await this.eventBus.publishAsync(event, data);
  }

  /**
   * 监听所有 Hook 事件（用于调试/日志）
   * @param handler 处理函数
   */
  onAll(handler: (event: string, data: any, originalEvent: Event) => void): void {
    this.eventBus.subscribeToAll((originalEvent: Event) => {
      handler(originalEvent.type, originalEvent.data, originalEvent);
    });
  }

  /**
   * 移除所有 Hook
   */
  removeAll(): void {
    this.eventBus.clear();
  }

  /**
   * 获取已注册的 Hook 处理器数量
   * @param event Hook 事件名称（可选，不传则返回总数）
   */
  getHookCount(event?: HookEventName): number {
    if (event) {
      return this.eventBus.listenerCount(event);
    }
    // 返回所有 hook 事件的总数
    const hookEvents: HookEventName[] = [
      // Task events
      'task:before_create', 'task:after_create', 'task:before_assign', 'task:after_assign',
      'task:before_execute', 'task:after_execute', 'task:on_progress', 'task:on_complete',
      'task:on_failed', 'task:on_cancel',
      // Claude events
      'claude:before_prompt', 'claude:after_response', 'claude:stream_chunk', 'claude:on_tool_use',
      'claude:on_error', 'claude:on_start', 'claude:on_complete',
      // Goal events
      'goal:created', 'goal:updated', 'goal:completed', 'goal:rejected', 'goal:decomposed',
      // Execution events
      'execution:start', 'execution:step', 'execution:progress', 'execution:complete', 'execution:failed',
    ];

    return hookEvents.reduce((sum, e) => sum + this.eventBus.listenerCount(e), 0);
  }
}

// ============================================================================
// 便捷 Hook 函数
// ============================================================================

/**
 * 注册任务创建前 Hook
 */
export function beforeTaskCreate(handler: (data: { taskData: any }) => void): HookSystem {
  const hooks = new HookSystem();
  hooks.on('task:before_create', handler);
  return hooks;
}

/**
 * 注册任务创建后 Hook
 */
export function afterTaskCreate(handler: (data: { task: any }) => void): HookSystem {
  const hooks = new HookSystem();
  hooks.on('task:after_create', handler);
  return hooks;
}

/**
 * 注册任务完成后 Hook
 */
export function onTaskComplete(handler: (data: { taskId: string; result: any }) => void): HookSystem {
  const hooks = new HookSystem();
  hooks.on('task:on_complete', handler);
  return hooks;
}

/**
 * 注册 Claude 工具调用 Hook
 */
export function onClaudeToolUse(handler: (data: { toolName: string; toolInput: any }) => void): HookSystem {
  const hooks = new HookSystem();
  hooks.on('claude:on_tool_use', handler);
  return hooks;
}

/**
 * 注册目标创建 Hook
 */
export function onGoalCreated(handler: (data: { goalId: string; type: string }) => void): HookSystem {
  const hooks = new HookSystem();
  hooks.on('goal:created', handler);
  return hooks;
}

// ============================================================================
// 单例
// ============================================================================

let hookSystemInstance: HookSystem | null = null;

/**
 * 获取全局 HookSystem 实例
 */
export function getHookSystem(): HookSystem {
  if (!hookSystemInstance) {
    hookSystemInstance = new HookSystem();
  }
  return hookSystemInstance;
}
