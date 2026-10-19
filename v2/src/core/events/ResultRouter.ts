/**
 * AI Company v2 - 结果分发器
 *
 * 订阅通知事件，发送到相应的渠道
 * - CLI 控制台
 * - Telegram 由 TelegramIntegration 单独处理
 */

import { getEventBus, type NotificationEvent } from './EventBus.js';

/**
 * 结果分发器
 */
export class ResultRouter {
  private eventBus = getEventBus();
  private started = false;
  private unsubscribeFunctions: Array<() => void> = [];

  /**
   * 启动分发器
   */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    console.log('[ResultRouter] Starting result router...');

    // 订阅通知事件并存储取消订阅函数
    this.unsubscribeFunctions.push(
      this.eventBus.on('notification.needed', this.handleNotification.bind(this))
    );
    this.unsubscribeFunctions.push(
      this.eventBus.on('task.completed' as any, this.handleTaskCompleted.bind(this))
    );
    this.unsubscribeFunctions.push(
      this.eventBus.on('task.failed' as any, this.handleTaskFailed.bind(this))
    );
    this.unsubscribeFunctions.push(
      this.eventBus.on('task.progress' as any, this.handleProgress.bind(this))
    );

    this.started = true;
    console.log('[ResultRouter] Result router started');
  }

  /**
   * 停止分发器，清理资源
   */
  stop(): void {
    if (!this.started) {
      return;
    }

    console.log('[ResultRouter] Stopping result router...');

    // 调用所有取消订阅函数
    this.unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    this.unsubscribeFunctions = [];

    this.started = false;
    console.log('[ResultRouter] Result router stopped');
  }

  /**
   * 处理进度事件
   */
  private handleProgress(event: any): void {
    const { taskId, agentName, progress } = event;

    console.log(`\n[Progress] ${agentName} - 第 ${progress.turn} 轮`);
    console.log('─'.repeat(40));

    if (progress.toolCall) {
      const toolName = progress.toolCall.name;
      const input = progress.toolCall.input;
      console.log(`🔧 工具: ${toolName}`);

      // 简化输入显示
      if (typeof input === 'object') {
        const inputStr = JSON.stringify(input, null, 2);
        if (inputStr.length > 100) {
          console.log(`   输入: ${inputStr.substring(0, 100)}...`);
        } else {
          console.log(`   输入: ${inputStr}`);
        }
      }
    }

    if (progress.message) {
      console.log(`📝 ${progress.message}`);
    }

    console.log('─'.repeat(40));
  }

  /**
   * 处理通知事件
   */
  private async handleNotification(event: NotificationEvent): Promise<void> {
    const { channel, message, chatId } = event;

    console.log(`\n[ResultRouter] 📤 通知 (${channel})`);
    console.log('─'.repeat(50));
    console.log(message);
    console.log('─'.repeat(50));

    // Telegram 由 TelegramIntegration 直接处理，避免重复发送
    if (channel === 'telegram') {
      return;
    }
  }

  /**
   * 处理任务完成事件（备用机制）
   */
  private async handleTaskCompleted(event: any): Promise<void> {
    const { source, result, taskDescription } = event;

    // 只处理非 Telegram 来源（Telegram 由 TelegramBot 直接处理）
    if (source === 'telegram') {
      return;
    }

    const message = this.formatTaskResult(result, taskDescription);

    console.log(`\n[ResultRouter] ✅ 任务完成`);
    console.log('─'.repeat(50));
    console.log(message);
    console.log('─'.repeat(50));
  }

  /**
   * 处理任务失败事件（备用机制）
   */
  private async handleTaskFailed(event: any): Promise<void> {
    const { source, error } = event;

    // 只处理非 Telegram 来源（Telegram 由 TelegramBot 直接处理）
    if (source === 'telegram') {
      return;
    }

    console.log(`\n[ResultRouter] ❌ 任务失败`);
    console.log('─'.repeat(50));
    console.log(error || '未知错误');
    console.log('─'.repeat(50));
  }

  /**
   * 格式化任务结果
   */
  private formatTaskResult(result: any, taskDescription?: string): string {
    let message = '';

    if (taskDescription) {
      message += `任务：${taskDescription.substring(0, 50)}...\n\n`;
    }

    if (result.success) {
      message += '✅ 任务完成\n\n';

      if (result.output) {
        // 限制输出长度
        const output = result.output.length > 1000
          ? result.output.substring(0, 1000) + '...\n\n(输出已截断)'
          : result.output;
        message += output;
      }
    } else {
      message += `❌ 任务失败\n\n${result.error || '未知错误'}`;
    }

    return message;
  }
}

// 单例
let resultRouterInstance: ResultRouter | null = null;

export function getResultRouter(): ResultRouter {
  if (!resultRouterInstance) {
    resultRouterInstance = new ResultRouter();
  }
  return resultRouterInstance;
}

export function resetResultRouter(): void {
  if (resultRouterInstance) {
    resultRouterInstance.stop();
    resultRouterInstance = null;
  }
}
