/**
 * AI Company - Runtime Module
 *
 * 自治运行系统 - 事件总线、钩子系统
 */

export { EventBus, getEventBus } from './EventBus.js';
export type { EventType, Event, EventHandler, EventSubscriptionOptions } from './EventBus.js';

export { HookSystem, getHookSystem, beforeTaskCreate, afterTaskCreate, onTaskComplete, onClaudeToolUse, onGoalCreated } from './HookSystem.js';
export type { AllHookEvents, HookEventName, HookHandler, TaskLifecycleEvents, ClaudeExecutionEvents, GoalLifecycleEvents, ExecutionTrackingEvents } from './HookSystem.js';
