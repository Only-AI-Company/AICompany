#!/usr/bin/env tsx
/**
 * 首次登录设置脚本
 *
 * 用途：
 * 1. 启动浏览器
 * 2. 等待用户手动登录
 * 3. 保存 Cookies 到本地
 */

import 'dotenv/config';
import { XiaohongshuWorkflow } from '../core/Workflow.js';

async function main() {
  const workflow = new XiaohongshuWorkflow();

  try {
    await workflow.setup();
  } catch (error: any) {
    console.error('\n❌ 设置失败:', error.message);
    console.error('\n请检查：');
    console.error('  1. 是否已安装 Playwright 浏览器');
    console.error('     运行: npx playwright install chromium');
    console.error('  2. .env 文件是否正确配置\n');
    process.exit(1);
  }
}

main();
