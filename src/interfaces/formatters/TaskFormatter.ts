/**
 * Task Formatter - 任务展示格式化
 *
 * 负责将任务数据格式化为不同渠道需要的展示格式
 */

import type { TaskInfo } from '../../application/services/TaskService.js';

export class TaskFormatter {
  /**
   * Telegram 格式 - 带 emoji 和友好提示
   */
  static forTelegram(tasks: TaskInfo[]): string {
    if (tasks.length === 0) {
      return `📝 暂无任务\n\n提交新任务:\n- "帮我开发一个登录功能"\n- "创建用户管理页面"`;
    }

    const statusEmoji: Record<string, string> = {
      'pending': '⏳',
      'in_progress': '🔄',
      'completed': '✅',
      'failed': '❌',
      'cancelled': '🚫',
    };

    let result = `📝 任务列表 (${tasks.length} 个)\n\n`;
    tasks.forEach((t, i) => {
      const emoji = statusEmoji[t.status] || '📌';
      const date = new Date(t.createdAt).toLocaleDateString('zh-CN');
      const desc = t.description.length > 40 ? t.description.slice(0, 40) + '...' : t.description;

      result += `${emoji} ${i + 1}. ${desc}\n`;
      result += `    ID: \`${t.id}\`\n`;
      result += `    状态: ${t.status} | 日期: ${date}\n\n`;
    });

    return result.trim();
  }

  /**
   * CLI 格式 - 纯文本，适合终端
   */
  static forCLI(tasks: TaskInfo[]): string {
    if (tasks.length === 0) {
      return '暂无任务';
    }

    let result = `任务列表 (${tasks.length} 个)\n\n`;
    tasks.forEach((t, i) => {
      const date = new Date(t.createdAt).toLocaleDateString('zh-CN');
      result += `${i + 1}. [${t.status}] ${t.description}\n`;
      result += `   ID: ${t.id}\n`;
      result += `   日期: ${date}\n`;
    });

    return result.trim();
  }

  /**
   * JSON 格式 - 用于 API 返回
   */
  static forJSON(tasks: TaskInfo[]): { tasks: TaskInfo[]; total: number } {
    return {
      tasks,
      total: tasks.length
    };
  }

  /**
   * 单个任务的 Telegram 格式
   */
  static singleForTelegram(task: TaskInfo): string {
    const statusEmoji: Record<string, string> = {
      'pending': '⏳',
      'in_progress': '🔄',
      'completed': '✅',
      'failed': '❌',
      'cancelled': '🚫',
    };

    const emoji = statusEmoji[task.status] || '📌';
    const date = new Date(task.createdAt).toLocaleString('zh-CN');

    return `${emoji} 任务详情\n\n` +
           `ID: \`${task.id}\`\n` +
           `描述: ${task.description}\n` +
           `状态: ${task.status}\n` +
           `优先级: ${task.priority || 'medium'}\n` +
           `创建时间: ${date}`;
  }

  /**
   * 任务创建成功的 Telegram 格式
   */
  static createSuccessForTelegram(task: TaskInfo, assignedTo?: { name: string; role: string } | null): string {
    let result = `✅ 任务已创建\n\n`;
    result += `ID: ${task.id}\n`;
    result += `描述: ${task.description}\n`;
    result += `优先级: ${task.priority || 'medium'}`;

    if (assignedTo) {
      result += `\n分配给: ${assignedTo.name} (${assignedTo.role})`;
    }

    return result;
  }
}
