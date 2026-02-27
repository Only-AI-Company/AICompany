/**
 * AI Company Start Commands
 *
 * 启动 AI 公司服务（持续运行）
 */

import { Command } from 'commander';
import { getDatabase } from '../../../infrastructure/database/index.js';
import { Daemon } from '../../../application/Daemon.js';

export function registerStartCommands(program: Command): void {
  program
    .command('start')
    .description('启动 AI 公司服务（持续运行）')
    .option('-v, --verbose', '详细输出')
    .action(async (options) => {
      const db = getDatabase();
      const daemon = new Daemon(db);

      // 优雅退出
      process.on('SIGINT', () => {
        daemon.stop();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        daemon.stop();
        process.exit(0);
      });

      // 启动守护进程
      try {
        await daemon.start();
      } catch (error: any) {
        console.error(`❌ 启动失败: ${error.message}`);
        process.exit(1);
      }
    });

  program
    .command('daemon:status')
    .description('查看 Daemon 状态')
    .action(() => {
      console.log('\n📊 Daemon 状态\n');
      console.log('功能开发中...\n');
    });
}
