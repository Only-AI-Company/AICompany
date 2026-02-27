#!/usr/bin/env node

/**
 * AI Company CLI
 *
 * 设计原则：内部事情内部做，只暴露必要的外部接口
 *
 * 用户命令：run, status, logs, report, stop/pause/resume, config
 * 管理命令：admin:employees, admin:performance
 * 内部命令：由 CEO 自动调用，不暴露给用户
 */

import { Command } from 'commander';
import { getDatabase } from '../../infrastructure/database/index.js';
import { ensureDatabaseInitialized, isDatabaseInitialized } from '../../infrastructure/init.js';
import { seedHumans } from '../../infrastructure/database/seeds/index.js';
import { createToolRouter } from '../../core/tools/ToolRouter.js';
import { registerClaudeCommands } from './commands/claudeCommands.js';
import { registerConfigCommands } from './commands/configCommands.js';
import { registerCronCommands } from './commands/cronCommands.js';
import { registerEmployeeManagerCommands } from './commands/employeeManagerCommands.js';
import { registerEmployeeStatusCommands } from './commands/employeeStatusCommands.js';
import { registerStartCommands } from './commands/startCommands.js';
import { registerTelegramCommands } from './commands/telegramCommands.js';
import { existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import inquirer from 'inquirer';
import { getConfigService, getPaths } from '../../infrastructure/config/index.js';

const program = new Command();

function normalizeHomePath(input: string): string {
  if (input === '~') return homedir();
  if (input.startsWith('~/')) return join(homedir(), input.slice(2));
  return resolve(input);
}

function getActiveTask(db: any) {
  const activeStatuses = new Set([
    'pending',
    'assigned',
    'in_progress',
    'planning',
    'dispatched',
    'executing',
    'wait_human',
    'auditing',
  ]);
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50').all();
  return tasks.find((task: any) => activeStatuses.has(task.status));
}

function buildCompanyStatus(db: any, verbose: boolean) {
  const employees = db.getAllEmployees();
  const activeTask = getActiveTask(db);
  const tasksCompleted = employees.reduce((sum: number, e: any) => sum + (e.completed_tasks || 0), 0);
  const avgQuality = employees.length > 0
    ? employees.reduce((sum: number, e: any) => sum + (e.average_quality || 0), 0) / employees.length
    : 0;

  return {
    currentProject: activeTask ? {
      name: activeTask.description,
      progress: activeTask.status,
      status: activeTask.status,
    } : null,
    team: verbose ? employees.map((e: any) => ({
      name: e.name,
      role: e.role,
      status: e.status,
    })) : null,
    metrics: {
      tasksCompleted,
      avgQuality,
    },
  };
}

function getRecentLogs(db: any, limit = 50) {
  return db.prepare('SELECT * FROM conversations ORDER BY timestamp DESC LIMIT ?').all(limit);
}

function buildReport(db: any, period: string) {
  const now = Date.now();
  const periodMs =
    period === 'week' ? 7 * 24 * 60 * 60 * 1000
    : period === 'month' ? 30 * 24 * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  const startAt = now - periodMs;
  const tasks = db.prepare('SELECT * FROM tasks WHERE created_at >= ?').all(startAt);
  const completed = tasks.filter((task: any) => task.status === 'completed');
  const avgQuality = completed.length > 0
    ? completed.reduce((sum: number, task: any) => sum + (task.quality || 0), 0) / completed.length
    : 0;
  const employees = db.getAllEmployees();
  const topPerformers = [...employees]
    .sort((a: any, b: any) => (b.average_quality || 0) - (a.average_quality || 0))
    .slice(0, 3)
    .map((employee: any) => ({
      name: employee.name,
      role: employee.role,
      score: employee.average_quality || 0,
    }));

  return {
    periodName: period === 'week' ? '本周' : period === 'month' ? '本月' : '今日',
    dateRange: `${new Date(startAt).toLocaleDateString('zh-CN')} - ${new Date(now).toLocaleDateString('zh-CN')}`,
    summary: {
      tasksCompleted: completed.length,
      avgQuality,
    },
    topPerformers,
  };
}

// ============================================================================
// Init Command
// ============================================================================

program
  .command('init')
  .description('初始化 AI Company')
  .option('--workdir <dir>', '工作目录')
  .option('--name <name>', '公司名称')
  .action(async (options) => {
    console.log(`\n🚀 初始化 AI Company...\n`);

    const defaultWorkDir = join(homedir(), '.ai-company');
    const defaultName = 'AI Company';
    const defaultOwner = process.env.USER || process.env.USERNAME || '';
    const defaultProvider = 'anthropic';
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'workdir',
        message: '工作目录（默认 ~/.ai-company）',
        default: options?.workdir || defaultWorkDir,
      },
      {
        type: 'input',
        name: 'ownerName',
        message: '你的名字',
        default: defaultOwner,
      },
      {
        type: 'input',
        name: 'companyName',
        message: '公司名称',
        default: options?.name || defaultName,
      },
      {
        type: 'list',
        name: 'providerType',
        message: '选择 AI Provider',
        choices: [
          { name: 'anthropic', value: 'anthropic' },
          { name: 'qwen', value: 'qwen' },
        ],
        default: defaultProvider,
      },
      {
        type: 'input',
        name: 'providerKey',
        message: 'API Key',
        validate: (value) => (typeof value === 'string' && value.trim().length > 0) || '请输入 API Key',
      },
      {
        type: 'input',
        name: 'providerModel',
        message: '模型名称',
        default: (answers: any) => answers.providerType === 'qwen' ? 'qwen-turbo' : 'claude-sonnet-4-5-20250929',
      },
      {
        type: 'input',
        name: 'providerUrl',
        message: 'API URL',
        when: (answers: any) => answers.providerType === 'qwen',
        default: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      },
    ]);

    const rawWorkDir = typeof answers.workdir === 'string' ? answers.workdir.trim() : '';
    const workDir = normalizeHomePath(rawWorkDir.length > 0 ? rawWorkDir : defaultWorkDir);
    process.env.AI_COMPANY_WORKDIR = workDir;

    console.log(`\n📁 设定工作目录: ${workDir}`);
    const hasDb = isDatabaseInitialized();
    if (hasDb) {
      console.log(`🧱 数据库已存在，跳过结构创建`);
      console.log(`🌱 种子数据已存在，跳过导入`);
    } else {
      console.log(`🧱 创建数据库结构...`);
      console.log(`🌱 导入种子数据...`);
    }
    console.log(`⚙️  初始化配置...`);
    ensureDatabaseInitialized({ workDir });
    console.log(`  ✓ 数据库已就绪`);

    const db = getDatabase();
    const config = getConfigService(db);
    const ownerName = typeof answers.ownerName === 'string' ? answers.ownerName.trim() : '';
    const companyName = typeof answers.companyName === 'string' ? answers.companyName.trim() : '';
    if (ownerName.length > 0) {
      config.set('company.owner', { value: ownerName, description: '负责人姓名' });
      console.log(`  ✓ 负责人姓名已设置为: ${ownerName}`);
    }
    if (companyName.length > 0) {
      config.set('company.name', { value: companyName, description: '公司名称' });
      console.log(`  ✓ 公司名称已设置为: ${companyName}`);
    }
    const providerType = typeof answers.providerType === 'string' ? answers.providerType.trim() : '';
    const providerKey = typeof answers.providerKey === 'string' ? answers.providerKey.trim() : '';
    const providerModel = typeof answers.providerModel === 'string' ? answers.providerModel.trim() : '';
    const providerUrl = typeof answers.providerUrl === 'string' ? answers.providerUrl.trim() : '';
    if (providerType.length > 0 && providerKey.length > 0) {
      const providerConfig: Record<string, string> = providerType === 'qwen'
        ? { key: providerKey }
        : { apiKey: providerKey };
      if (providerModel.length > 0) providerConfig.model = providerModel;
      if (providerType === 'qwen' && providerUrl.length > 0) providerConfig.url = providerUrl;
      config.set(`ai-provider.${providerType}`, {
        value: providerConfig,
        type: 'json',
        description: 'AI Provider 配置',
      });
      config.set('ai-provider.api', {
        value: providerType,
        description: '默认 AI Provider',
      });
      console.log(`  ✓ AI Provider 已设置为: ${providerType}`);
    }

    console.log(`\n📂 路径配置:`);
    const paths = getPaths(db);
    paths.display();

    console.log(`🎉 AI Company 已就绪!`);
    console.log(`\n开始使用:`);
    console.log(`  ai-company run "你的需求"\n`);
  });

program
  .command('db:seed [target]')
  .description('导入数据库种子数据')
  .option('-f, --force', '覆盖已有数据')
  .action(async (target = 'humans', options) => {
    ensureDatabaseInitialized();
    const db = getDatabase();
    if (target !== 'humans' && target !== 'all') {
      console.log(`\n❌ 不支持的种子类型: ${target}\n`);
      return;
    }
    const result = seedHumans(db, { force: options.force });
    if (result.skipped) {
      console.log(`\nℹ️  humans 已存在，跳过导入\n`);
    } else {
      console.log(`\n✅ 已导入 humans 种子数据 (${result.inserted} 条)\n`);
    }
  });

// ============================================================================
// 核心命令：run - 提交需求
// ============================================================================

program
  .command('run <request>')
  .description('提交需求给 AI Company，自动完成')
  .option('-w, --wait', '等待完成并显示结果')
  .option('-b, --background', '后台运行')
  .action(async (request, options) => {
    ensureDatabaseInitialized();
    const db = getDatabase();
    const router = createToolRouter(db);

    console.log(`\n🏢 AI Company 正在处理您的需求...\n`);
    console.log(`📋 需求: ${request}\n`);

    try {
      const result = await router.route(request);

      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      if (result.toolCalls && result.toolCalls.length > 0) {
        console.log(`🔧 执行工具: ${result.toolCalls[0].tool}\n`);
      }
      console.log(result.response);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    } catch (error: any) {
      console.error(`\n❌ 处理失败: ${error.message}\n`);
    }
  });

// ============================================================================
// 核心命令：status - 查看状态
// ============================================================================

program
  .command('status')
  .description('查看 AI Company 当前状态')
  .option('-v, --verbose', '详细信息')
  .action(async (options) => {
    const db = getDatabase();
    const status = buildCompanyStatus(db, options.verbose);

    console.log(`\n🏢 AI Company Status\n`);

    if (status.currentProject) {
      console.log(`📊 当前项目: ${status.currentProject.name}`);
      console.log(`   进度: ${status.currentProject.progress}`);
      console.log(`   状态: ${status.currentProject.status}\n`);
    } else {
      console.log(`💤 当前无正在运行的项目\n`);
    }

    if (options.verbose && status.team) {
      console.log(`👥 团队:`);
      for (const member of status.team) {
        const statusIcon = member.status === 'working' ? '💼' : '💤';
        console.log(`   ${statusIcon} ${member.name} (${member.role})`);
      }
      console.log('');
    }

    if (status.metrics) {
      console.log(`📈 本日统计:`);
      console.log(`   完成任务: ${status.metrics.tasksCompleted}`);
      console.log(`   质量评分: ${(status.metrics.avgQuality * 100).toFixed(0)}%\n`);
    }
  });

// ============================================================================
// 核心命令：logs - 查看日志
// ============================================================================

program
  .command('logs')
  .description('查看执行日志')
  .option('-f, --follow', '实时跟随日志')
  .option('-n, --tail <lines>', '显示最近 N 行', '50')
  .action(async (options) => {
    const db = getDatabase();
    const logs = getRecentLogs(db, Number(options.tail || 50));

    console.log(`\n📋 执行日志 (最近 ${logs.length} 条)\n`);
    for (const log of logs) {
      console.log(`  ${log.content}`);
    }
    console.log('');
  });

// ============================================================================
// 核心命令：script - 构建脚本并配置 Cron
// ============================================================================

program
  .command('script <requirement>')
  .description('构建脚本（自然语言描述需求，可包含定时要求）')
  .action(async (requirement) => {
    ensureDatabaseInitialized();
    const db = getDatabase();
    const router = createToolRouter(db);

    console.log(`\n🔧 构建脚本...\n`);
    console.log(`📋 需求: ${requirement}\n`);

    const result = await router.route(`创建自动化脚本: ${requirement}`);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(result.response);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  });

// ============================================================================
// 核心命令：report - 工作报告
// ============================================================================

program
  .command('report')
  .description('生成工作报告')
  .option('-p, --period <period>', '报告周期 (today, week, month)', 'today')
  .action(async (options) => {
    const db = getDatabase();
    const report = buildReport(db, options.period);

    console.log(`\n📊 AI Company 工作报告\n`);
    console.log(`📅 ${report.periodName}: ${report.dateRange}\n`);
    console.log(`📈 完成任务: ${report.summary.tasksCompleted}`);
    console.log(`   质量评分: ${(report.summary.avgQuality * 100).toFixed(0)}%\n`);

    if (report.topPerformers.length > 0) {
      console.log(`🏆 表现最佳:`);
      for (const emp of report.topPerformers) {
        console.log(`   ${emp.name} (${emp.role}): ${emp.score} 分`);
      }
      console.log('');
    }
  });

// ============================================================================
// 核心命令：stop/pause/resume - 任务控制
// ============================================================================

program
  .command('stop')
  .description('停止当前任务')
  .action(async () => {
    const db = getDatabase();
    const task = getActiveTask(db);

    if (task) {
      db.updateTaskStatus(task.id, 'cancelled');
      console.log(`\n✅ 已停止: ${task.description}\n`);
    } else {
      console.log(`\n💤 当前没有正在运行的任务\n`);
    }
  });

program
  .command('pause')
  .description('暂停当前任务')
  .action(async () => {
    const db = getDatabase();
    const task = getActiveTask(db);

    if (task) {
      db.updateTaskStatus(task.id, 'wait_human');
      console.log(`\n⏸️  已暂停: ${task.description}\n`);
    } else {
      console.log(`\n💤 当前没有正在运行的任务\n`);
    }
  });

program
  .command('resume')
  .description('恢复暂停的任务')
  .action(async () => {
    const db = getDatabase();
    const tasks = db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC LIMIT 1').all('wait_human') as any[];
    const task = tasks[0] as any;

    if (task) {
      db.updateTaskStatus(task.id, 'executing');
      console.log(`\n▶️  已恢复\n`);
    } else {
      console.log(`\n💤 没有可恢复的任务\n`);
    }
  });

// ============================================================================
// 配置命令
// ============================================================================

registerConfigCommands(program);
registerStartCommands(program);
registerEmployeeStatusCommands(program);
registerEmployeeManagerCommands(program);
registerCronCommands(program);
registerClaudeCommands(program);
registerTelegramCommands(program);

// ============================================================================
// Gateway 命令
// ============================================================================

// ============================================================================
// Gateway 命令（使用 PM2 管理）
// ============================================================================

program
  .command('gateway')
  .description('启动 AI Company Gateway（使用 PM2 管理）')
  .action(async () => {
    await gatewayAction('start');
  });

program
  .command('gateway:start')
  .description('启动 Gateway 服务')
  .action(async () => {
    await gatewayAction('start');
  });

program
  .command('gateway:stop')
  .description('停止 Gateway 服务')
  .action(async () => {
    await gatewayAction('stop');
  });

program
  .command('gateway:restart')
  .description('重启 Gateway 服务')
  .action(async () => {
    await gatewayAction('restart');
  });

program
  .command('gateway:status')
  .description('查看 Gateway 状态')
  .action(async () => {
    await gatewayAction('status');
  });

program
  .command('gateway:logs')
  .description('查看 Gateway 日志')
  .action(async () => {
    await gatewayAction('logs');
  });

program
  .command('gateway:monit')
  .description('实时监控 Gateway')
  .action(async () => {
    await gatewayAction('monit');
  });

// ============================================================================
// Intent Logs Command
// ============================================================================
program
  .command('intent-logs')
  .description('查看意图理解和工具执行日志')
  .option('-l, --limit <number>', '显示条数', '20')
  .option('-s, --session <id>', '按会话ID筛选')
  .option('-t, --tool <name>', '按工具名筛选')
  .option('-f, --failed', '只显示失败的')
  .action(async (options) => {
    const { intentLogsCommand } = await import('./commands/intent-logs.js');
    const db = getDatabase();
    const result = await intentLogsCommand.execute(options, db);
    console.log(result);
  });

/**
 * Gateway 操作处理
 */
async function gatewayAction(action: string) {
  const { execSync } = await import('child_process');

  try {
    // 检查 PM2 是否安装
    execSync('pm2 --version', { stdio: 'ignore' });
  } catch {
    console.error(`\n❌ PM2 未安装\n`);
    console.error(`请安装 PM2:\n`);
    console.error(`  npm install -g pm2\n`);
    process.exit(1);
  }

  const configFile = 'ecosystem.config.cjs';
  const appName = 'ai-gateway';

  switch (action) {
    case 'start':
      console.log(`\n🚀 启动 Gateway...\n`);
      try {
        execSync(`pm2 start ${configFile}`, { stdio: 'inherit' });
        console.log(`\n✅ Gateway 已启动\n`);
        console.log(`💡 使用以下命令管理:\n`);
        console.log(`   ai-company gateway:status   查看状态`);
        console.log(`   ai-company gateway:logs     查看日志`);
        console.log(`   ai-company gateway:monit    实时监控\n`);
      } catch (error: any) {
        // 如果已经启动，显示状态
        if (error.stdout?.includes('already exists')) {
          console.log(`\n⚠️  Gateway 已在运行中\n`);
          await gatewayAction('status');
        } else {
          throw error;
        }
      }
      break;

    case 'stop':
      console.log(`\n🛑 停止 Gateway...\n`);
      try {
        execSync(`pm2 stop ${appName}`, { stdio: 'inherit' });
        console.log(`\n✅ Gateway 已停止\n`);
      } catch (error: any) {
        if (error.stderr?.includes('not found')) {
          console.log(`\n💤 Gateway 未运行\n`);
        } else {
          throw error;
        }
      }
      break;

    case 'restart':
      console.log(`\n🔄 重启 Gateway...\n`);
      try {
        execSync(`pm2 restart ${appName}`, { stdio: 'inherit' });
        console.log(`\n✅ Gateway 已重启\n`);
      } catch (error: any) {
        if (error.stderr?.includes('not found')) {
          console.log(`\n💤 Gateway 未运行，正在启动...\n`);
          await gatewayAction('start');
        } else {
          throw error;
        }
      }
      break;

    case 'status':
      try {
        const output = execSync(`pm2 list`, { encoding: 'utf-8' });
        console.log(`\n${output}`);
      } catch {
        console.log(`\n💤 Gateway 未运行\n`);
      }
      break;

    case 'logs':
      console.log(`\n📋 Gateway 日志 (Ctrl+C 退出)\n`);
      try {
        execSync(`pm2 logs ${appName}`, { stdio: 'inherit' });
      } catch (error: any) {
        if (error.stderr?.includes('not found')) {
          console.log(`\n💤 Gateway 未运行\n`);
        } else {
          throw error;
        }
      }
      break;

    case 'monit':
      console.log(`\n📊 实时监控 (Ctrl+C 退出)\n`);
      try {
        execSync(`pm2 monit`, { stdio: 'inherit' });
      } catch {
        console.log(`\n💤 Gateway 未运行\n`);
      }
      break;
  }
}

// ============================================================================
// 管理命令（可选）
// ============================================================================

program
  .command('admin:employees')
  .description('查看员工状态（管理功能）')
  .action(async () => {
    const db = getDatabase();
    const employees = db.getAllEmployees();

    console.log(`\n👥 员工状态 (${employees.length})\n`);

    for (const emp of employees) {
      const statusEmoji: Record<string, string> = { active: '🟢', busy: '🟡', offline: '⚫' };
      console.log(`${statusEmoji[emp.status]} ${emp.name} (${emp.role})`);
      console.log(`   完成: ${emp.completed_tasks || 0} | 质量: ${Math.round((emp.average_quality || 0) * 100)}%\n`);
    }
  });

program
  .command('admin:performance')
  .description('绩效报告（管理功能）')
  .action(async () => {
    const db = getDatabase();
    const employees = db.getAllEmployees();
    const report = {
      employees: employees.map((employee: any) => ({
        name: employee.name,
        role: employee.role,
        tasksCompleted: employee.completed_tasks || 0,
        score: employee.average_quality || 0,
      })),
    };

    console.log(`\n📊 绩效报告\n`);

    for (const emp of report.employees) {
      console.log(`${emp.name} (${emp.role})`);
      console.log(`   完成任务: ${emp.tasksCompleted}`);
      console.log(`   绩效评分: ${emp.score}\n`);
    }
  });

// ============================================================================
// Help
// ============================================================================

program
  .command('help')
  .description('显示帮助信息')
  .action(() => {
    console.log(`\n🏢 AI Company - AI 驱动的个人团队\n`);
    console.log(`使用方法:\n`);
    console.log(`  ai-company run "<需求>"       提交需求，自动完成`);
    console.log(`  ai-company status              查看当前状态`);
    console.log(`  ai-company logs                查看执行日志`);
    console.log(`  ai-company script "<需求>"     构建脚本`);
    console.log(`  ai-company report              工作报告`);
    console.log(`  ai-company stop/pause/resume   控制`);
    console.log(`  ai-company db:seed [humans]    导入种子数据`);
    console.log(`  ai-company gateway[:status|:logs|:monit|:stop|:restart]  Gateway 服务管理\n`);
    console.log(`管理功能:\n`);
    console.log(`  ai-company admin:employees     查看员工状态`);
    console.log(`  ai-company admin:performance   绩效报告`);
    console.log(`  ai-company config              配置管理\n`);
    console.log(`示例:\n`);
    console.log(`  ai-company run "重构登录模块，添加双因素认证"`);
    console.log(`  ai-company script "每小时清理临时文件"`);
    console.log(`  ai-company script "每天凌晨2点备份数据库"`);
    console.log(`  ai-company script "每周一早上生成周报"`);
    console.log(`  ai-company gateway\n`);
  });

// ============================================================================
// Parse
// ============================================================================

program.parse();
