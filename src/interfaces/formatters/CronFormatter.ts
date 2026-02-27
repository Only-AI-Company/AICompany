/**
 * Cron Formatter - 定时任务展示格式化
 */

import type { CronInfo, CronExecuteResult } from '../../application/services/CronService.js';

export class CronFormatter {
  /**
   * Telegram 格式 - 定时任务列表
   */
  static listForTelegram(crons: CronInfo[]): string {
    if (crons.length === 0) {
      return `📋 暂无定时任务\n\n你可以使用以下命令创建:\n- "创建每天凌晨2点的备份脚本"\n- "每小时清理一次临时文件"`;
    }

    let result = `📋 定时任务列表 (${crons.length} 个)\n\n`;
    crons.forEach((c, i) => {
      const status = c.enabled ? '✅' : '❌';
      const rule = c.cronRule || '未配置';
      result += `${status} ${i + 1}. ${c.name}\n`;
      result += `    ID: \`${c.id}\`\n`;
      if (c.description) result += `    描述: ${c.description}\n`;
      result += `    定时: ${rule}\n\n`;
    });

    result += `💡 使用 "执行脚本 <ID>" 来运行某个脚本`;
    return result.trim();
  }

  /**
   * CLI 格式 - 定时任务列表
   */
  static listForCLI(crons: CronInfo[]): string {
    if (crons.length === 0) {
      return '暂无定时任务';
    }

    let result = `定时任务列表 (${crons.length} 个)\n\n`;
    crons.forEach((c, i) => {
      const status = c.enabled ? '[启用]' : '[禁用]';
      result += `${i + 1}. ${status} ${c.name}\n`;
      result += `   ID: ${c.id}\n`;
      if (c.description) result += `   描述: ${c.description}\n`;
      result += `   定时: ${c.cronRule || '未配置'}\n`;
    });

    return result.trim();
  }

  /**
   * 执行结果格式
   */
  static executionResultForTelegram(result: CronExecuteResult, cronName: string): string {
    if (result.success) {
      const output = result.stdout || '(无输出)';
      return `✅ 脚本执行成功\n\n脚本: ${cronName}\n输出: ${output}`;
    }
    const error = result.stderr || '未知错误';
    return `❌ 执行失败\n\n脚本: ${cronName}\n错误: ${error}`;
  }

  /**
   * 未找到提示
   */
  static notFoundForTelegram(): string {
    return `❌ 脚本不存在\n\n使用 "有哪些脚本" 查看可用脚本`;
  }

  /**
   * 多个匹配提示
   */
  static multipleMatchesForTelegram(crons: CronInfo[]): string {
    return `❌ 找到多个匹配的脚本:\n${crons.map(c => `- ${c.id}: ${c.name}`).join('\n')}\n\n请使用精确的 ID`;
  }
}
