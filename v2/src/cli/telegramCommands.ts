/**
 * AI Company v2 - Telegram Commands
 *
 * Telegram Bot 管理 CLI 命令
 */

import { Command } from 'commander';
import { getConfigManager } from '../config/ConfigManager.js';
import { createTelegramIntegration } from '../integrations/telegram/TelegramBot.js';

export function registerTelegramCommands(program: Command): void {
  // ===========================================================================
  // telegram:setup - 设置 Telegram Bot
  // ===========================================================================

  program
    .command('telegram:setup <token>')
    .description('设置 Telegram Bot Token')
    .action(async (token: string) => {
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

      const configManager = getConfigManager();
      const workdir = configManager.getWorkdir();
      const { writeFileSync, existsSync, readFileSync } = await import('fs');
      const { join } = await import('path');

      const envPath = join(workdir, '.env');

      // 读取或创建 .env 文件
      let envContent = '';
      if (existsSync(envPath)) {
        envContent = readFileSync(envPath, 'utf-8');
      }

      // 检查是否已有 TELEGRAM_BOT_TOKEN
      if (envContent.includes('TELEGRAM_BOT_TOKEN=')) {
        console.log('\n⚠️  检测到已有 Telegram Bot Token');
        console.log('如需更新，请手动编辑 .env 文件\n');
        return;
      }

      // 添加 Telegram token
      envContent += `\n\n# Telegram Bot\nTELEGRAM_BOT_TOKEN=${token}\n`;

      writeFileSync(envPath, envContent, 'utf-8');

      const config = configManager.getConfig();
      const companyName = config?.companyName || 'AI Company';

      console.log('\n✅ Telegram Bot Token 已保存');
      console.log(`   文件：${envPath}`);
      console.log('\n下一步:');
      console.log('1. 在 Telegram 中找到你的机器人');
      console.log('2. 发送 /start 开始对话');
      console.log('3. 运行: ai-company server');
      console.log(`\n🏢 ${companyName} 现在可以通过 Telegram 与你交流！\n`);
    });

  // ===========================================================================
  // telegram:test - 测试 Telegram Bot 配置
  // ===========================================================================

  program
    .command('telegram:test')
    .description('测试 Telegram Bot 配置')
    .action(async () => {
      const bot = await createTelegramIntegration();

      if (!bot) {
        console.error('\n❌ Telegram Bot 未配置\n');
        console.log('请先运行: ai-company telegram:setup <token>\n');
        process.exit(1);
      }

      console.log('\n📡 正在测试连接...\n');

      try {
        const botInfo = await bot.getBotInfo();
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

  // ===========================================================================
  // telegram:info - 显示配置信息
  // ===========================================================================

  program
    .command('telegram:info')
    .description('显示 Telegram Bot 配置信息')
    .action(async () => {
      const bot = await createTelegramIntegration();

      if (!bot) {
        console.log('\n📋 Telegram Bot 未配置\n');
        console.log('请运行: ai-company telegram:setup <token>\n');
        return;
      }

      const botInfo = await bot.getBotInfo();
      const configManager = getConfigManager();
      const workdir = configManager.getWorkdir();
      const { readFileSync } = await import('fs');
      const { join } = await import('path');

      const envPath = join(workdir, '.env');
      const envContent = readFileSync(envPath, 'utf-8');
      const tokenMatch = envContent.match(/TELEGRAM_BOT_TOKEN=([^\s\n]+)/);

      const token = tokenMatch ? tokenMatch[1] : '';
      const maskedToken = token.slice(0, 10) + '...' + token.slice(-4);

      console.log('\n📋 Telegram Bot 配置\n');
      console.log(`机器人: @${botInfo.username}`);
      console.log(`Token: ${maskedToken}`);
      console.log(`状态: ✅ 已配置`);
      console.log('\n命令:');
      console.log('  ai-company server          - 启动后台服务（包含 Telegram Bot）');
      console.log('  ai-company telegram:test  - 测试连接\n');
    });
}
