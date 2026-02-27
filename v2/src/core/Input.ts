/**
 * AI Company v2 - 输入处理
 *
 * 统一收集所有输入，分类后发布事件
 */
import type { InputMessage, InputClassification, InputSource } from '../types.js';
import { getEventBus } from '../core/Event.js';
import { EventType } from '../types.js';
import { getDatabase } from '../db/Database.js';

/**
 * 输入收集器
 */
export class InputCollector {
  private sources: Map<InputSource, (msg: InputMessage) => void> = new Map();

  /**
   * 注册输入源
   */
  registerSource(source: InputSource, handler: (msg: InputMessage) => void): void {
    this.sources.set(source, handler);
  }

  /**
   * 收集输入
   */
  async collect(message: InputMessage): Promise<void> {
    console.log(`[Input] ${message.source}: ${message.content.substring(0, 50)}`);

    // 保存到数据库
    const db = getDatabase();
    db.saveChatMessage({
      content: message.content,
      source: message.source,
      direction: 'in',
      employeeId: undefined,  // 用户输入，无 employee
      chatId: message.chatId,
      userId: message.userId,
    });

    // 发布事件 - 发送完整的 InputMessage
    getEventBus().emit(EventType.INPUT_RECEIVED, message);
  }
}

/**
 * 输入分类器
 */
export class InputClassifier {
  /**
   * 分类输入
   */
  async classify(content: string, context?: {
    history?: Array<{ role: string; content: string }>;
  }): Promise<InputClassification> {
    // 简单的关键词分类
    const lowerContent = content.toLowerCase();

    // 检查是否是查询
    if (this.isQuery(lowerContent)) {
      return {
        type: 'query',
        confidence: 0.9,
        params: { query: content },
      };
    }

    // 检查是否是创建目标
    const goalMatch = this.extractGoal(lowerContent);
    if (goalMatch) {
      return {
        type: 'goal',
        confidence: 0.8,
        params: goalMatch,
      };
    }

    // 检查是否是创建任务
    const taskMatch = this.extractTask(lowerContent);
    if (taskMatch) {
      return {
        type: 'task',
        confidence: 0.8,
        params: taskMatch,
      };
    }

    // 检查是否是脚本
    if (this.isScript(lowerContent)) {
      return {
        type: 'script',
        confidence: 0.7,
        params: { description: content },
      };
    }

    // 默认为聊天
    return {
      type: 'chat',
      confidence: 0.5,
      params: { message: content },
    };
  }

  private isQuery(content: string): boolean {
    return content.startsWith('查询') ||
      content.startsWith('查看') ||
      content.startsWith('list') ||
      content.startsWith('status') ||
      content.startsWith('状态');
  }

  private extractGoal(content: string): Record<string, any> | null {
    // 检查循环模式
    const recurringMatch = content.match(/(?:每天|每日|每日每)(?:\s+(\d+点|\d+:\d+))?\s*(.+)/);
    if (recurringMatch) {
      return {
        title: `每日${recurringMatch[3]}`,
        type: 'recurring',
        recurring: {
          frequency: 'daily',
          time: recurringMatch[2] || undefined,
          autoRenew: true,
        },
      };
    }

    // 检查目标关键词
    if (content.includes('目标') || content.includes('达成')) {
      return {
        title: content,
        type: 'long_term',
      };
    }

    return null;
  }

  private extractTask(content: string): Record<string, any> | null {
    // 简单的任务识别
    if (content.startsWith('创建') || content.startsWith('新建')) {
      return {
        description: content.replace(/^(创建|新建)\s*/, ''),
        priority: 'medium',
      };
    }

    // 默认作为任务
    if (content.length < 100 && !content.includes('目标')) {
      return {
        description: content,
        priority: 'medium',
      };
    }

    return null;
  }

  private isScript(content: string): boolean {
    return content.includes('自动化') ||
      content.includes('定时') ||
      content.includes('cron') ||
      content.includes('脚本');
  }
}
