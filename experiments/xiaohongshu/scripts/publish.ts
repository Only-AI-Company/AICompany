#!/usr/bin/env tsx
/**
 * 自动发布脚本
 *
 * 用途：
 * 1. AI 生成小红书文案
 * 2. 自动发布到小红书
 */

import 'dotenv/config';
import { XiaohongshuWorkflow } from '../core/Workflow.js';

async function main() {
  // 获取命令行参数
  const args = process.argv.slice(2);
  const topic = args[0];

  // 显示帮助
  if (!topic || topic === '--help' || topic === '-h') {
    console.log(`
用法: npm run publish <主题>

示例:
  npm run publish "春季穿搭搭配"
  npm run publish "健康早餐食谱"

选项:
  --help, -h    显示帮助信息
  --only-generate  只生成不发布

注意:
  首次使用请先运行: npm run setup
    `);
    process.exit(topic ? 0 : 1);
  }

  // 检查是否只生成模式
  const onlyGenerate = args.includes('--only-generate');

  const workflow = new XiaohongshuWorkflow();

  try {
    if (onlyGenerate) {
      await workflow.generateOnly(topic);
    } else {
      await workflow.createAndPublish(topic);
    }
  } catch (error: any) {
    console.error('\n❌ 执行失败:', error.message);

    // 提供解决建议
    if (error.message.includes('未找到保存的登录信息')) {
      console.error('\n💡 解决方法: 请先运行 npm run setup 完成登录');
    } else if (error.message.includes('会话已过期')) {
      console.error('\n💡 解决方法: 请重新运行 npm run setup');
    } else if (error.message.includes('ANTHROPIC_API_KEY')) {
      console.error('\n💡 解决方法: 请在 .env 文件中配置 ANTHROPIC_API_KEY');
    }

    console.error('');
    process.exit(1);
  }
}

main();
