#!/usr/bin/env tsx
/**
 * 查看历史记录脚本
 *
 * 用途：
 * 查看已生成的内容记录
 */

import 'dotenv/config';
import { XiaohongshuWorkflow } from '../core/Workflow.js';
import { PostRepository } from '../core/PostRepository.js';

async function main() {
  const args = process.argv.slice(2);

  // 解析参数
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1] || '10', 10) : 10;

  // 显示帮助
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
用法: npm run history [选项]

选项:
  --limit <数量>    显示最近 N 条记录 (默认: 10)
  --help, -h       显示帮助信息

示例:
  npm run history              # 显示最近 10 条
  npm run history --limit 20   # 显示最近 20 条
    `);
    process.exit(0);
  }

  const workflow = new XiaohongshuWorkflow();

  try {
    workflow.showHistory(limit);
  } catch (error: any) {
    console.error('\n❌ 查询失败:', error.message);
    process.exit(1);
  }
}

main();
