/**
 * AI Company CLI - Run Commands
 *
 * 自动化需求处理命令（Orchestrator）
 */

import { Command } from 'commander';
import { getDatabase } from '../../../infrastructure/database/index.js';
import { Orchestrator } from '../../../core/agents/Orchestrator.js';

export function registerRunCommands(program: Command): void {
  // ============================================================================
  // run <requirement> - 自动处理需求（全自动）
  // ============================================================================

  program
    .command('run <requirement>')
    .description('自动处理需求（全自动）')
    .option('-o, --output <dir>', '输出目录')
    .option('-q, --quiet', '安静模式（减少输出，跳过交互）')
    .action(async (requirement, options) => {
      const db = getDatabase();
      const orchestrator = new Orchestrator(db);

      try {
        const result = await orchestrator.processRequirement(requirement, options.quiet || false);

        if (options.quiet) {
          console.log(JSON.stringify({
            workflowId: result.workflowId,
            status: result.status,
            summary: result.summary,
          }, null, 2));
        }
      } catch (error: any) {
        console.error(`\n❌ 执行失败: ${error.message}\n`);
        process.exit(1);
      }
    });
}
