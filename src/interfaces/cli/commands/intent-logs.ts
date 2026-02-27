/**
 * Intent Logs Command - 查看意图理解日志
 */

import { AIDatabase } from '../../../infrastructure/database/index.js';
import { getIntentLogService } from '../../../infrastructure/logging/IntentLogService.js';

export const intentLogsCommand = {
  name: 'intent-logs',
  description: '查看意图理解和工具执行日志',
  args: [
    { name: 'limit', description: '显示条数', default: 20 },
    { name: 'session', description: '按会话ID筛选' },
    { name: 'tool', description: '按工具名筛选' },
    { name: 'failed', description: '只显示失败的' },
  ],
  async execute(args: Record<string, any>, db: AIDatabase): Promise<string> {
    const limit = args.limit || 20;
    const service = getIntentLogService(db);

    let logs: any[];

    if (args.failed) {
      logs = service.getFailed(limit);
    } else if (args.session) {
      logs = service.getBySession(args.session, limit);
    } else if (args.tool) {
      logs = service.getByTool(args.tool, limit);
    } else {
      logs = service.getRecent(limit);
    }

    if (logs.length === 0) {
      return '📋 暂无日志记录';
    }

    let output = `📋 意图日志 (${logs.length} 条)\n\n`;

    logs.forEach((log, i) => {
      const timestamp = new Date(log.timestamps * 1000).toLocaleString('zh-CN');
      const status = log.execution_status === 'success' ? '✅' : '❌';

      output += `${status} [${i + 1}] ${timestamp}\n`;
      output += `   来源: ${log.source} | 会话: ${log.session_id.slice(0, 8)}...\n`;
      output += `   输入: ${log.user_input}\n`;

      if (log.parsed_tool) {
        output += `   工具: ${log.parsed_tool}\n`;
      }

      if (log.tool_result) {
        output += `   结果: ${log.tool_result.slice(0, 60)}...\n`;
      }

      if (log.execution_status === 'failed' && log.tool_result) {
        output += `   ❌ 错误: ${log.tool_result}\n`;
      }

      output += '\n';
    });

    return output.trim();
  }
};
