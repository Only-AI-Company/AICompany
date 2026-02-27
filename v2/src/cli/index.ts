#!/usr/bin/env node
/**
 * AI Company v2 - CLI 入口
 */
import { Command } from 'commander';
import { getOrchestrator } from '../core/Orchestrator.js';
import { getDatabase } from '../db/Database.js';
import { getEventBus, EventType } from '../core/Event.js';
import { getEmployeeService } from '../core/Employee.js';
import { getConfigService } from '../core/Config.js';
import type { SystemEvent } from '../types.js';

const program = new Command();

program
  .name('ai-company')
  .description('AI Company - 让 AI 替你完成所有工作')
  .version('2.0.0');

/**
 * 运行命令 - 提交需求
 */
program
  .command('run <content>')
  .description('执行需求')
  .option('-w, --wait', '等待执行完成')
  .action(async (content, options) => {
    const orchestrator = getOrchestrator();
    await orchestrator.start();

    console.log(`\n> ${content}\n`);

    // 提交输入
    await orchestrator.submitInput({
      content,
      source: 'cli',
    });

    // 如果需要等待，监听响应事件
    if (options.wait) {
      const response = await getEventBus().waitFor(EventType.RESPONSE_READY, undefined, 60000);
      console.log(`\n${response.data.response.message}\n`);
    }

    await orchestrator.stop();
  });

/**
 * 交互模式
 */
program
  .command('chat')
  .description('交互式对话模式')
  .action(async () => {
    const orchestrator = getOrchestrator();
    await orchestrator.start();

    console.log('\n进入交互模式（输入 exit 退出）\n');

    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const eventBus = getEventBus();

    // 监听响应事件
    eventBus.on(EventType.RESPONSE_READY, (event: SystemEvent) => {
      console.log(`\n${event.data.response.message}\n`);
    });

    const askQuestion = () => {
      rl.question('> ', async (input) => {
        if (input.toLowerCase() === 'exit') {
          await orchestrator.stop();
          rl.close();
          process.exit(0);
        }

        await orchestrator.submitInput({
          content: input,
          source: 'cli',
        });

        askQuestion();
      });
    };

    askQuestion();
  });

/**
 * 状态查询
 */
program
  .command('status')
  .description('查看系统状态')
  .action(async () => {
    const db = getDatabase();

    console.log('\n=== AI Company 状态 ===\n');

    // 目标统计
    const goals = db.listGoals();
    console.log(`目标总数: ${goals.length}`);
    console.log(`  - 活跃: ${goals.filter(g => g.status === 'active').length}`);
    console.log(`  - 完成: ${goals.filter(g => g.status === 'completed').length}`);
    console.log(`  - 待处理: ${goals.filter(g => g.status === 'pending').length}`);

    // 任务统计
    const tasks = db.listTasks();
    console.log(`\n任务总数: ${tasks.length}`);
    console.log(`  - 执行中: ${tasks.filter(t => t.status === 'executing').length}`);
    console.log(`  - 完成: ${tasks.filter(t => t.status === 'completed').length}`);
    console.log(`  - 失败: ${tasks.filter(t => t.status === 'failed').length}`);

    // Cron 统计
    const crons = db.listCrons({ enabled: true });
    console.log(`\n定时任务: ${crons.length}`);

    console.log();
  });

/**
 * 目标管理
 */
const goalCmd = program.command('goal');

goalCmd
  .command('list')
  .description('列出所有目标')
  .action(() => {
    const db = getDatabase();
    const goals = db.listGoals();

    console.log('\n=== 目标列表 ===\n');
    for (const goal of goals) {
      console.log(`[${goal.status}] ${goal.title} (${goal.type})`);
      if (goal.description) {
        console.log(`    ${goal.description}`);
      }
      console.log();
    }
  });

goalCmd
  .command('show <goalId>')
  .description('查看目标详情')
  .action((goalId) => {
    const db = getDatabase();
    const goal = db.getGoal(goalId);

    if (!goal) {
      console.error(`目标不存在: ${goalId}`);
      process.exit(1);
    }

    console.log('\n=== 目标详情 ===\n');
    console.log(`ID: ${goal.id}`);
    console.log(`标题: ${goal.title}`);
    console.log(`类型: ${goal.type}`);
    console.log(`状态: ${goal.status}`);
    if (goal.description) {
      console.log(`描述: ${goal.description}`);
    }
    console.log();
  });

/**
 * 数据库管理
 */
const dbCmd = program.command('db');

dbCmd
  .command('init')
  .description('初始化数据库')
  .action(() => {
    console.log('初始化数据库...');
    const db = getDatabase();
    console.log('数据库已初始化');
  });

dbCmd
  .command('reset')
  .description('重置数据库（危险操作）')
  .action(async () => {
    console.log('警告：这将清除所有数据！');
    const { createInterface } = await import('readline');
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('确定要继续吗？(yes/no): ', (answer: string) => {
      rl.close();
      if (answer.toLowerCase() === 'yes') {
        const db = getDatabase();
        db.reset();
        console.log('数据库已重置');
      } else {
        console.log('操作已取消');
      }
    });
  });

dbCmd
  .command('stats')
  .description('数据库统计')
  .action(() => {
    const db = getDatabase();

    console.log('\n=== 数据库统计 ===\n');

    // 表名白名单，防止 SQL 注入
    const allowedTables = [
      'config', 'employees', 'humans', 'goals', 'goal_plans', 'tasks',
      'crontab', 'cron_executions', 'goal_cron_mapping',
      'activity_logs', 'milestone_reports', 'intent_logs', 'chat_messages'
    ];

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    for (const table of tables) {
      // 跳过不在白名单中的表
      if (!allowedTables.includes(table.name)) {
        continue;
      }
      const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as any;
      console.log(`${table.name}: ${count.count}`);
    }

    console.log();
  });

/**
 * 员工管理
 */
const employeeCmd = program.command('employee');

employeeCmd
  .command('list')
  .description('列出所有员工')
  .action(() => {
    const db = getDatabase();
    const employees = db.listEmployees({ status: 'active' });

    console.log('\n=== 员工列表 ===\n');
    for (const emp of employees) {
      const stateEmoji: Record<string, string> = {
        'idle': '💤',
        'busy': '⚡',
        'error': '❌',
        'offline': '🌑',
      };
      const emoji = stateEmoji[emp.current_state || 'idle'] || '💤';
      console.log(`${emoji} ${emp.name} (${emp.role})`);
      console.log(`   等级: ${emp.level || 1} | 积分: ${emp.points || 0} | 满意度: ${emp.satisfaction || 80}%`);
      console.log(`   状态: ${emp.current_state || 'idle'} | 任务: ${emp.completed_tasks || 0}/${emp.total_tasks || 0} 完成`);
      console.log();
    }
  });

employeeCmd
  .command('show <employeeId>')
  .description('查看员工详情')
  .action((employeeId) => {
    const employeeService = getEmployeeService();
    const report = employeeService.getEmployeePerformanceReport(employeeId);

    if (!report) {
      console.error(`员工不存在: ${employeeId}`);
      process.exit(1);
    }

    console.log('\n=== 员工绩效报告 ===\n');
    console.log(`员工: ${report.employee.name} (${report.employee.role})`);
    console.log(`ID: ${report.employee.id}`);
    console.log();
    console.log('--- 统计 ---');
    console.log(`总任务: ${report.stats.totalTasks}`);
    console.log(`已完成: ${report.stats.completedTasks}`);
    console.log(`失败: ${report.stats.failedTasks}`);
    console.log(`成功率: ${report.stats.successRate}%`);
    console.log();
    console.log('--- 积分 ---');
    console.log(`积分: ${report.stats.points}`);
    console.log(`等级: ${report.stats.level}`);
    console.log(`满意度: ${report.stats.satisfaction}%`);
    console.log();
    console.log('--- 状态 ---');
    console.log(`当前状态: ${report.stats.currentState}`);
    console.log(`最后活动: ${report.stats.lastActivityAt ? new Date(report.stats.lastActivityAt).toLocaleString() : '无'}`);
    console.log();
  });

employeeCmd
  .command('leaderboard')
  .description('员工积分排行榜')
  .action(() => {
    const employeeService = getEmployeeService();
    const leaderboard = employeeService.getLeaderboard();

    console.log('\n=== 员工积分排行榜 ===\n');
    if (leaderboard.length === 0) {
      console.log('暂无员工数据\n');
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    for (let i = 0; i < leaderboard.length; i++) {
      const emp = leaderboard[i];
      const rank = i < 3 ? medals[i] : `${i + 1}.`;
      console.log(`${rank} ${emp.name} (${emp.role})`);
      console.log(`   等级: ${emp.level} | 积分: ${emp.points} | 完成任务: ${emp.completedTasks} | 成功率: ${emp.successRate}%`);
      console.log();
    }
  });

/**
 * 人类画像管理
 */
const humanCmd = program.command('human');

humanCmd
  .command('list')
  .description('列出所有人类画像')
  .option('-g, --gender <gender>', '按性别筛选')
  .option('-l, --location <location>', '按地区筛选')
  .action((options) => {
    const db = getDatabase();
    const humans = db.listHumans({
      gender: options.gender,
      location: options.location,
    });

    console.log('\n=== 人类画像列表 ===\n');
    for (const human of humans) {
      console.log(`${human.name} (${human.location || '未知地区'})`);
      if (human.skills) {
        try {
          const skills = JSON.parse(human.skills);
          const topSkills = skills.slice(0, 3).join(', ');
          console.log(`   技能: ${topSkills}${skills.length > 3 ? '...' : ''}`);
        } catch {
          console.log(`   技能: ${human.skills}`);
        }
      }
      console.log();
    }
  });

humanCmd
  .command('show <humanId>')
  .description('查看人类画像详情')
  .action((humanId) => {
    const db = getDatabase();
    const human = db.getHuman(humanId);

    if (!human) {
      console.error(`人类画像不存在: ${humanId}`);
      process.exit(1);
    }

    console.log('\n=== 人类画像详情 ===\n');
    console.log(`ID: ${human.id}`);
    console.log(`姓名: ${human.name}`);
    console.log(`性别: ${human.gender || '未设置'}`);
    console.log(`地区: ${human.location || '未设置'}`);
    console.log(`生日: ${human.birthday || '未设置'}`);
    if (human.appearance) {
      console.log(`\n外貌:\n${human.appearance}`);
    }
    if (human.personality_traits) {
      try {
        const traits = JSON.parse(human.personality_traits);
        console.log(`\n性格: ${traits.join(', ')}`);
      } catch {
        console.log(`\n性格: ${human.personality_traits}`);
      }
    }
    if (human.hobbies) {
      try {
        const hobbies = JSON.parse(human.hobbies);
        console.log(`\n爱好: ${hobbies.join(', ')}`);
      } catch {
        console.log(`\n爱好: ${human.hobbies}`);
      }
    }
    if (human.skills) {
      try {
        const skills = JSON.parse(human.skills);
        console.log(`\n技能: ${skills.join(', ')}`);
      } catch {
        console.log(`\n技能: ${human.skills}`);
      }
    }
    if (human.weaknesses) {
      try {
        const weaknesses = JSON.parse(human.weaknesses);
        console.log(`\n弱点: ${weaknesses.join(', ')}`);
      } catch {
        console.log(`\n弱点: ${human.weaknesses}`);
      }
    }
    if (human.notes) {
      console.log(`\n备注:\n${human.notes}`);
    }
    console.log(`\n创建时间: ${new Date(human.created_at).toLocaleString()}`);
    console.log(`更新时间: ${new Date(human.updated_at).toLocaleString()}`);
    console.log();
  });

humanCmd
  .command('search <keyword>')
  .description('搜索人类画像')
  .action((keyword) => {
    const db = getDatabase();
    const humans = db.searchHumans(keyword);

    console.log(`\n=== 搜索结果: "${keyword}" ===\n`);
    if (humans.length === 0) {
      console.log('未找到匹配的人类画像\n');
      return;
    }
    for (const human of humans) {
      console.log(`${human.name} (${human.location || '未知地区'})`);
      if (human.skills) {
        try {
          const skills = JSON.parse(human.skills);
          const topSkills = skills.slice(0, 2).join(', ');
          console.log(`   技能: ${topSkills}${skills.length > 2 ? '...' : ''}`);
        } catch {
          // ignore
        }
      }
      console.log();
    }
  });

/**
 * 配置管理
 */
const configCmd = program.command('config');

// ==================== 配置概览 ====================
configCmd
  .command('list')
  .description('查看所有配置')
  .action(() => {
    const configService = getConfigService();
    const config = configService.getConfig();
    const providers = configService.listProviders();

    console.log('\n=== 系统配置 ===\n');
    console.log(`活跃 Provider: ${config.activeProvider}`);
    console.log();

    console.log('=== Provider 列表 ===\n');
    for (const p of providers) {
      const activeFlag = p.isActive ? '👉' : '  ';
      console.log(`${activeFlag} ${p.name}`);
      console.log(`   URL: ${p.url}`);
      console.log(`   Key: ${p.keyMasked}`);
      console.log(`   可用模型：${p.models.join(', ')}`);
      console.log(`   活跃模型：${p.activeModels.join(', ')}`);
      console.log();
    }
  });

// ==================== Provider 管理 ====================
const providerCmd = configCmd.command('provider');

providerCmd
  .command('list')
  .description('列出所有 Provider')
  .action(() => {
    const configService = getConfigService();
    const providers = configService.listProviders();

    console.log('\n=== Provider 列表 ===\n');
    for (const p of providers) {
      const activeFlag = p.isActive ? '👉' : '  ';
      console.log(`${activeFlag} ${p.name}`);
      console.log(`   URL: ${p.url}`);
      console.log(`   Key: ${p.keyMasked}`);
      console.log();
    }
  });

providerCmd
  .command('add <name> <url>')
  .description('添加 Provider')
  .option('-t, --type <type>', 'API 类型 (anthropic/openai/zhipu/kimi/qwen)', 'anthropic')
  .option('-e, --env <envVar>', 'API Key 环境变量名', 'API_KEY')
  .option('-m, --models <models>', '模型列表（逗号分隔）')
  .action((name, url, options) => {
    const configService = getConfigService();
    const models = options.models ? options.models.split(',').map((m: string) => m.trim()) : [];
    const defaultModel = models.length > 0 ? models[0] : 'default-model';

    configService.upsertProvider(name, {
      type: options.type as any,
      url,
      keyEnvVar: options.env,
      models: models.length > 0 ? models : [defaultModel],
      activeModels: [defaultModel],
      defaultModel,
    });

    console.log(`\nProvider "${name}" 已添加\n`);
  });

providerCmd
  .command('remove <name>')
  .description('删除 Provider')
  .action((name) => {
    const configService = getConfigService();

    if (configService.deleteProvider(name)) {
      console.log(`\nProvider "${name}" 已删除\n`);
    } else {
      console.error(`\n删除失败：${name}\n`);
      process.exit(1);
    }
  });

providerCmd
  .command('set <name>')
  .description('设置活跃 Provider')
  .action((name) => {
    const configService = getConfigService();

    if (configService.setActiveProvider(name)) {
      console.log(`\n活跃 Provider 已设置为：${name}\n`);
    } else {
      console.error(`\n设置失败：${name}\n`);
      process.exit(1);
    }
  });

// ==================== 配置重置 ====================
configCmd
  .command('reset')
  .description('重置配置为默认值')
  .action(() => {
    const configService = getConfigService();
    configService.reset();
    console.log('\n配置已重置为默认值\n');
  });

// ==================== 启动服务（后台运行）
/**
 * 启动服务（后台运行）
 */
program
  .command('start')
  .description('启动 AI Company 服务（后台模式）')
  .option('-t, --telegram', '启用 Telegram Bot')
  .action(async (options) => {
    console.log('启动 AI Company 服务...\n');

    const orchestrator = getOrchestrator();
    await orchestrator.start();

    console.log('服务已启动');
    console.log('按 Ctrl+C 停止\n');

    // TODO: 启动 Telegram Bot（如果启用）

    // 保持运行
    process.on('SIGINT', async () => {
      console.log('\n正在停止服务...');
      await orchestrator.stop();
      process.exit(0);
    });
  });

/**
 * 日志查看
 */
program
  .command('logs')
  .description('查看活动日志')
  .option('-n, --limit <number>', '限制条数', '20')
  .action((options) => {
    const db = getDatabase();
    const limit = parseInt(options.limit);

    const logs = db.prepare(`
      SELECT * FROM activity_logs
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as any[];

    console.log('\n=== 活动日志 ===\n');
    for (const log of logs) {
      const timestamp = new Date(log.timestamp).toLocaleString();
      console.log(`[${timestamp}] ${log.event_type}`);
      console.log(`  ${log.action}`);
      if (log.context_json) {
        console.log(`  Context: ${log.context_json}`);
      }
      console.log();
    }
  });

// 解析命令行参数
program.parse();
