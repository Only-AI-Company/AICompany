/**
 * AI Company v3 - 小红书 CLI 命令
 *
 * 功能：
 * - xiaohongshu generate <topic> - 生成小红书内容
 * - xiaohongshu login - 登录小红书
 * - xiaohongshu publish <topic> - 生成并发布
 * - xiaohongshu check-login - 检查登录状态
 */

import { Command } from 'commander';
import { getXiaohongshuContentGenerator } from '../core/tools/xiaohongshu/XiaohongshuContentGenerator.js';
import { XiaohongshuPublisher } from '../core/tools/xiaohongshu/XiaohongshuPublisher.js';

export const xiaohongshuCommand = new Command('xiaohongshu');

// ============================================================================
// 登录命令
// ============================================================================

xiaohongshuCommand
  .command('login')
  .description('登录小红书（保存会话）')
  .option('-c, --cookies <path>', 'Cookies 保存路径', 'storage/xiaohongshu-cookies.json')
  .action(async (options) => {
    console.log('[小红书] 启动登录流程...');

    const publisher = new XiaohongshuPublisher(options.cookies);

    try {
      await publisher.init({ headless: false });
      await publisher.login();

      console.log('[小红书] 登录成功！Cookies 已保存');
    } catch (error: any) {
      console.error('[小红书] 登录失败:', error.message);
      process.exit(1);
    } finally {
      await publisher.close();
    }
  });

// ============================================================================
// 生成内容命令
// ============================================================================

xiaohongshuCommand
  .command('generate <topic>')
  .description('AI 生成小红书内容')
  .option('-t, --type <type>', '内容类型: 分享, 教程, 种草, 测评, 日常', '分享')
  .option('-T, --tone <tone>', '语气风格: 亲切, 专业, 幽默, 干货', '亲切')
  .option('-k, --keywords <keywords>', '关键词（逗号分隔）', '')
  .action(async (topic, options) => {
    console.log(`[小红书] 生成内容: ${topic}`);

    const generator = getXiaohongshuContentGenerator();

    const keywords = options.keywords ? options.keywords.split(',').map((k: string) => k.trim()) : [];

    try {
      const content = await generator.generate({
        topic,
        contentType: options.type,
        tone: options.tone,
        keywords,
      });

      console.log();
      console.log('='.repeat(60));
      console.log('生成结果');
      console.log('='.repeat(60));
      console.log(`标题: ${content.title}`);
      console.log();
      console.log(`内容:\n${content.content}`);
      console.log();
      console.log(`标签: ${content.tags.join(', ')}`);
      console.log('='.repeat(60));
    } catch (error: any) {
      console.error('[小红书] 生成失败:', error.message);
      process.exit(1);
    }
  });

// ============================================================================
// 发布命令
// ============================================================================

xiaohongshuCommand
  .command('publish <topic>')
  .description('生成并发布小红书笔记')
  .option('-t, --type <type>', '内容类型', '分享')
  .option('-T, --tone <tone>', '语气风格', '亲切')
  .option('-k, --keywords <keywords>', '关键词', '')
  .option('-c, --cookies <path>', 'Cookies 路径', 'storage/xiaohongshu-cookies.json')
  .option('--headless', '无头模式（不显示浏览器）')
  .action(async (topic, options) => {
    console.log(`[小红书] 生成并发布: ${topic}`);

    // 1. 生成内容
    const generator = getXiaohongshuContentGenerator();

    const keywords = options.keywords ? options.keywords.split(',').map((k: string) => k.trim()) : [];

    const content = await generator.generate({
      topic,
      contentType: options.type,
      tone: options.tone,
      keywords,
    });

    console.log('[小红书] 内容已生成');
    console.log(`标题: ${content.title}`);
    console.log();

    // 2. 发布
    const publisher = new XiaohongshuPublisher(options.cookies);

    try {
      await publisher.init({ headless: options.headless });

      const result = await publisher.publish({
        title: content.title,
        content: content.content,
        tags: content.tags,
      });

      if (result.success) {
        console.log('[小红书] 发布成功!');
        console.log(`链接: ${result.postUrl}`);
      } else {
        console.error('[小红书] 发布失败:', result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error('[小红书] 发布失败:', error.message);
      process.exit(1);
    } finally {
      await publisher.close();
    }
  });

// ============================================================================
// 检查登录状态命令
// ============================================================================

xiaohongshuCommand
  .command('check-login')
  .description('检查小红书登录状态')
  .option('-c, --cookies <path>', 'Cookies 路径', 'storage/xiaohongshu-cookies.json')
  .action(async (options) => {
    console.log('[小红书] 检查登录状态...');

    const publisher = new XiaohongshuPublisher(options.cookies);

    try {
      await publisher.init({ headless: true });

      const isLoggedIn = await publisher.isLoggedIn();

      if (isLoggedIn) {
        console.log('[小红书] ✓ 登录状态有效');
      } else {
        console.log('[小红书] ✗ 登录状态无效或已过期');
        console.log('[小红书] 请运行: ai-company xiaohongshu login');
      }
    } catch (error: any) {
      console.error('[小红书] 检查失败:', error.message);
      process.exit(1);
    } finally {
      await publisher.close();
    }
  });

// ============================================================================
// 批量生成命令
// ============================================================================

xiaohongshuCommand
  .command('batch <topic> <count>')
  .description('批量生成多个版本的内容')
  .option('-t, --type <type>', '内容类型', '分享')
  .option('-T, --tone <tone>', '语气风格', '亲切')
  .action(async (topic, count, options) => {
    console.log(`[小红书] 批量生成 ${count} 个版本: ${topic}`);

    const generator = getXiaohongshuContentGenerator();

    try {
      const results = await generator.generateMultiple(
        {
          topic,
          contentType: options.type,
          tone: options.tone,
        },
        parseInt(count)
      );

      console.log();
      console.log('='.repeat(60));
      console.log(`已生成 ${results.length} 个版本`);
      console.log('='.repeat(60));

      results.forEach((content, index) => {
        console.log();
        console.log(`版本 ${index + 1}:`);
        console.log(`标题: ${content.title}`);
        console.log(`标签: ${content.tags.join(', ')}`);
      });
    } catch (error: any) {
      console.error('[小红书] 生成失败:', error.message);
      process.exit(1);
    }
  });
