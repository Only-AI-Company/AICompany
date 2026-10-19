/**
 * AI Company v3 - 小红书工作流测试
 *
 * 完整流程：生成内容 → 发布到小红书
 */

import { getXiaohongshuContentGenerator } from '../src/core/tools/xiaohongshu/XiaohongshuContentGenerator.js';
import { XiaohongshuPublisher } from '../src/core/tools/xiaohongshu/XiaohongshuPublisher.js';

// ============================================================================
// Main Workflow
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('AI Company v3 - 小红书自动化工作流');
  console.log('='.repeat(60));
  console.log();

  // 1. 生成内容
  console.log('步骤 1: AI 生成小红书内容');
  console.log('-'.repeat(60));

  const generator = getXiaohongshuContentGenerator();

  const content = await generator.generate({
    topic: process.argv[2] || '春季穿搭搭配',
    contentType: '分享',
    tone: '亲切',
    keywords: ['春季', '穿搭', '搭配'],
  });

  console.log('生成内容:');
  console.log(`标题: ${content.title}`);
  console.log();
  console.log(`正文:\n${content.content}`);
  console.log();
  console.log(`标签: ${content.tags.join(', ')}`);
  console.log();

  // 2. 询问是否发布
  console.log('步骤 2: 发布到小红书');
  console.log('-'.repeat(60));
  console.log('是否发布到小红书？(y/n)');

  // 等待用户确认
  const shouldPublish = await waitForConfirmation();

  if (!shouldPublish) {
    console.log('已取消发布');
    process.exit(0);
  }

  // 3. 发布
  const publisher = new XiaohongshuPublisher();

  try {
    await publisher.init({ headless: false });

    const result = await publisher.publish({
      title: content.title,
      content: content.content,
      tags: content.tags,
    });

    if (result.success) {
      console.log('发布成功!');
      console.log(`笔记链接: ${result.postUrl}`);
    } else {
      console.error('发布失败:', result.error);
    }
  } finally {
    await publisher.close();
  }
}

/**
 * 等待用户确认
 */
function waitForConfirmation(): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdin.once('data', (data) => {
      const input = data.toString().trim().toLowerCase();
      resolve(input === 'y' || input === 'yes');
    });
  });
}

// ============================================================================
// Run
// ============================================================================

main().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
