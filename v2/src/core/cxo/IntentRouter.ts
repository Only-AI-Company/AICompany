/**
 * CXO 架构 - IntentRouter
 *
 * 职责：根据 CEO 分析的意图路由到相应的处理器
 * - query → QueryHandler
 * - goal → GoalManager
 * - task → TaskDispatcher
 * - script → ScriptExecutor
 */

import { getEventBus } from '../events/EventBus.js';
import type { Intent } from './types.js';

// ============================================================================
// 处理器接口
// ============================================================================

export interface IntentHandler {
  /**
   * 处理意图
   */
  handle(intent: Intent): Promise<HandlerResult>;
}

export interface HandlerResult {
  success: boolean;
  output?: string;
  error?: string;
  nextAction?: string;
}

// ============================================================================
// IntentRouter
// ============================================================================

export class IntentRouter {
  private eventBus = getEventBus();

  // 处理器映射
  private handlers = new Map<string, IntentHandler>();

  constructor() {
    this.setupDefaultHandlers();
  }

  /**
   * 设置默认处理器
   */
  private setupDefaultHandlers(): void {
    // query 处理器
    this.handlers.set('query', {
      async handle(intent: Intent): Promise<HandlerResult> {
        console.log(`[IntentRouter] 📊 路由到 QueryHandler`);
        // 发出事件，由 CoreProcess 或其他模块处理
        return {
          success: true,
          nextAction: 'query',
        };
      }
    });

    // goal 处理器
    this.handlers.set('goal', {
      async handle(intent: Intent): Promise<HandlerResult> {
        console.log(`[IntentRouter] 🎯 路由到 GoalManager`);
        return {
          success: true,
          nextAction: 'create_goal',
        };
      }
    });

    // task 处理器
    this.handlers.set('task', {
      async handle(intent: Intent): Promise<HandlerResult> {
        console.log(`[IntentRouter] ⚡ 路由到 TaskDispatcher`);
        // 发出 task.execution 事件
        return {
          success: true,
          nextAction: 'execute_task',
        };
      }
    });

    // script 处理器
    this.handlers.set('script', {
      async handle(intent: Intent): Promise<HandlerResult> {
        console.log(`[IntentRouter] 💻 路由到 ScriptExecutor`);
        // 直接执行命令
        const command = intent.params?.command || intent.content;
        const { execSync } = await import('child_process');
        try {
          const output = execSync(command, { encoding: 'utf-8', cwd: process.cwd() });
          return {
            success: true,
            output: output.toString(),
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      }
    });
  }

  /**
   * 路由意图到相应的处理器
   */
  async route(intent: Intent): Promise<HandlerResult> {
    console.log(`\n[IntentRouter] 🚦 路由意图: ${intent.type}`);

    const handler = this.handlers.get(intent.type);

    if (!handler) {
      console.error(`[IntentRouter] ❌ 未找到处理器: ${intent.type}`);
      return {
        success: false,
        error: `未找到意图类型 ${intent.type} 的处理器`,
      };
    }

    try {
      const result = await handler.handle(intent);

      // 发出路由完成事件
      this.eventBus.emit({
        type: 'intent.routed',
        intentType: intent.type,
        success: result.success,
        nextAction: result.nextAction,
        timestamp: Date.now(),
      } as any);

      return result;
    } catch (error: any) {
      console.error(`[IntentRouter] ❌ 处理器执行失败:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 注册自定义处理器
   */
  registerHandler(intentType: string, handler: IntentHandler): void {
    this.handlers.set(intentType, handler);
    console.log(`[IntentRouter] ✅ 注册处理器: ${intentType}`);
  }

  /**
   * 移除处理器
   */
  unregisterHandler(intentType: string): void {
    this.handlers.delete(intentType);
    console.log(`[IntentRouter] 🗑️ 移除处理器: ${intentType}`);
  }
}

// ============================================================================
// 单例
// ============================================================================

let routerInstance: IntentRouter | null = null;

export function getIntentRouter(): IntentRouter {
  if (!routerInstance) {
    routerInstance = new IntentRouter();
  }
  return routerInstance;
}

export function resetIntentRouter(): void {
  routerInstance = null;
}
