/**
 * AI Company CLI - Telegram Commands
 *
 * Telegram Bot 管理
 */

import { Command } from 'commander';
import { getDatabase } from '../../../infrastructure/database/index.js';
import { getConfigService } from '../../../infrastructure/config/ConfigService.js';
import { TelegramIntegration } from '../../integrations/telegram/TelegramBot.js';

export function registerTelegramCommands(program: Command): void {
  // ============================================================================
  // telegram:setup - 设置 Telegram Bot
  // ============================================================================

  program
    .command('telegram:setup <token>')
    .description('设置 Telegram Bot Token')
    .action(async (token) => {
      // 验证 token 格式
      if (!token.match(/^\d+:[A-Za-z0-9_-]{35,}$/)) {
        console.error('\n❌ Token 格式无效\n');
        console.log('Token 应该是: BOT_ID:API_KEY');
        console.log('例如: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
        console.log('\n获取 Token 步骤:');
        console.log('1. 在 Telegram 中找到 @BotFather');
        console.log('2. 发送 /newbot 创建新机器人');
        console.log('3. 复制获得的 Token\n');
        process.exit(1);
      }

      // 保存到数据库
      const db = getDatabase();
      const config = getConfigService(db);

      try {
        config.set('telegram.bot_token', { value: token, description: 'Telegram Bot Token' });
        config.set('telegram.enabled', { value: true, description: '是否启用 Telegram Bot' });

        const companyName = config.get('company.name', 'AI Company');

        console.log('\n✅ Telegram Bot Token 已保存\n');
        console.log('下一步:');
        console.log('1. 在 Telegram 中找到你的机器人');
        console.log('2. 发送 /start 开始对话');
        console.log('3. 运行: ai-company telegram:start\n');
        console.log(`🏢 ${companyName} CEO 现在可以通过 Telegram 与你交流！\n`);
      } catch (error: any) {
        console.error(`\n❌ 保存失败: ${error.message}\n`);
        process.exit(1);
      }
    });

  // ============================================================================
  // telegram:start - 启动 Telegram Bot
  // ============================================================================

  program
    .command('telegram:start')
    .description('启动 Telegram Bot（CEO 在线）')
    .action(async () => {
      const db = getDatabase();
      const config = getConfigService(db);

      // 检查是否配置
      const token = config.get('telegram.bot_token');
      if (!token) {
        console.error('\n❌ Telegram Bot 未配置\n');
        console.log('请先运行: ai-company telegram:setup <token>\n');
        process.exit(1);
      }

      const enabled = config.get('telegram.enabled', false);
      if (!enabled) {
        console.error('\n❌ Telegram Bot 未启用\n');
        console.log('请先运行: ai-company telegram:setup <token>\n');
        process.exit(1);
      }

      const companyName = config.get('company.name', 'Cube');

      // 启动机器人
      const bot = new TelegramIntegration(token as string, db);

      console.log(`\n🏢 ${companyName} - CEO 已上线`);
      console.log('📱 Telegram Bot 已启动\n');

      bot.start();

      // 保持运行
      process.on('SIGINT', () => {
        console.log('\n\n正在停止 Telegram Bot...');
        bot.stop();
        process.exit(0);
      });

      // 保持进程运行
      await new Promise(() => {});
    });

  // ============================================================================
  // telegram:test - 测试 Telegram Bot 配置
  // ============================================================================

  program
    .command('telegram:test')
    .description('测试 Telegram Bot 配置')
    .action(async () => {
      const db = getDatabase();
      const config = getConfigService(db);

      const token = config.get('telegram.bot_token');
      if (!token) {
        console.error('\n❌ Telegram Bot 未配置\n');
        console.log('请先运行: ai-company telegram:setup <token>\n');
        process.exit(1);
      }

      console.log('\n📡 正在测试连接...\n');

      try {
        const TelegramBot = (await import('node-telegram-bot-api')).default;
        const bot = new TelegramBot(token as string, { polling: false });

        const botInfo = await bot.getMe();
        console.log('✅ 连接成功!\n');
        console.log(`🤖 机器人信息:`);
        console.log(`   名称: ${botInfo.first_name}`);
        console.log(`   用户名: @${botInfo.username}`);
        console.log(`   ID: ${botInfo.id}`);
        console.log('\n💬 在 Telegram 中搜索 @' + botInfo.username + ' 开始对话\n');
      } catch (error: any) {
        console.error('❌ 连接失败\n');
        console.error(`错误: ${error.message}\n`);
        console.log('请检查:');
        console.log('1. Token 是否正确');
        console.log('2. 网络连接是否正常\n');
        process.exit(1);
      }
    });

  // ============================================================================
  // telegram:info - 显示配置信息
  // ============================================================================

  program
    .command('telegram:info')
    .description('显示 Telegram Bot 配置信息')
    .action(async () => {
      const db = getDatabase();
      const config = getConfigService(db);

      const token = config.get('telegram.bot_token');
      if (!token) {
        console.error('\n❌ Telegram Bot 未配置\n');
        console.log('请先运行: ai-company telegram:setup <token>\n');
        process.exit(1);
      }

      const enabled = config.get('telegram.enabled', false);
      const tokenStr = token as string;
      const maskedToken = tokenStr.slice(0, 10) + '...' + tokenStr.slice(-4);

      console.log('\n📋 Telegram Bot 配置\n');
      console.log(`Token: ${maskedToken}`);
      console.log(`状态: ${enabled ? '✅ 启用' : '❌ 禁用'}`);
      console.log('\n命令:');
      console.log('  ai-company telegram:start  - 启动机器人');
      console.log('  ai-company telegram:test   - 测试连接');
      console.log('  ai-company telegram:enable - 启用 Bot');
      console.log('  ai-company telegram:disable - 禁用 Bot\n');
    });

  // ============================================================================
  // telegram:enable - 启用 Bot
  // ============================================================================

  program
    .command('telegram:enable')
    .description('启用 Telegram Bot')
    .action(async () => {
      const db = getDatabase();
      const config = getConfigService(db);

      config.set('telegram.enabled', true);
      console.log('\n✅ Telegram Bot 已启用\n');
    });

  // ============================================================================
  // telegram:disable - 禁用 Bot
  // ============================================================================

  program
    .command('telegram:disable')
    .description('禁用 Telegram Bot')
    .action(async () => {
      const db = getDatabase();
      const config = getConfigService(db);

      config.set('telegram.enabled', false);
      console.log('\n❌ Telegram Bot 已禁用\n');
    });
}
