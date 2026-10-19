/**
 * AI Company v3 - CLI Entry Point
 *
 * 命令行接口
 */

import { Command } from 'commander';
import { getEngine } from '../core/Engine.js';
import { getGoalManager } from '../core/GoalManager.js';
import { getScheduler } from '../core/Scheduler.js';
import { getDatabase } from '../core/database/index.js';
import { loadConfig } from '../config/Config.js';
import { xiaohongshuCommand } from './xiaohongshu.js';

// ============================================================================
// CLI Application
// ============================================================================

const program = new Command();

program
  .name('ai-company')
  .description('AI Company v3 - 自主运行的 AI 公司')
  .version('3.0.0');

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 打印标题
 */
function printTitle(title: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}\n`);
}

/**
 * 打印表格
 */
function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => {
    const colWidths = rows.map(r => (r[i] || '').length);
    return Math.max(h.length, ...colWidths);
  });

  // 打印表头
  const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join(' | ');
  console.log(headerRow);
  console.log(headers.map((_, i) => '-'.repeat(widths[i])).join('-+-'));

  // 打印数据行
  for (const row of rows) {
    const dataRow = row.map((c, i) => (c || '').padEnd(widths[i])).join(' | ');
    console.log(dataRow);
  }
}

/**
 * 获取状态图标
 */
function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    active: '🟢',
    completed: '✅',
    failed: '❌',
    pending: '⏳',
    executing: '🔄',
    scheduled: '📋',
  };
  return icons[status] || '⚪';
}

// ============================================================================
// Commands
// ============================================================================

/**
 * start - 启动引擎
 */
program
  .command('start')
  .description('启动 AI 公司引擎')
  .option('-d, --daemon', '后台运行模式')
  .action(async (options) => {
    printTitle('AI Company v3 - Starting');

    // 加载配置
    const config = loadConfig();
    console.log(`[Config] Engine interval: ${config.engine.loop_interval}ms`);
    console.log(`[Config] Review interval: ${config.engine.review_interval}ms`);

    // 启动引擎
    const engine = getEngine();
    await engine.start();

    console.log('\n✅ Engine started successfully!');
    console.log('\n提示:');
    console.log('  • 输入命令与 CEO 交互');
    console.log('  • 输入 "status" 查看状态');
    console.log('  • 输入 "exit" 退出\n');

    if (options.daemon) {
      console.log('[Daemon] Running in background mode...');
      console.log('[Daemon] Use "ai-company stop" to stop the engine\n');
      return;
    }

    // 交互模式
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', async (data: string) => {
      const input = data.toString().trim();

      if (input === 'exit' || input === 'quit') {
        await engine.stop();
        process.exit(0);
      }

      if (input === 'status') {
        const status = engine.getStatus();
        console.log('\n[System Status]');
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      if (input) {
        const response = await engine.handleUserInput(input);
        console.log(`\n[CEO] ${response}\n`);
      }
    });
  });

/**
 * stop - 停止引擎
 */
program
  .command('stop')
  .description('停止 AI 公司引擎')
  .action(async () => {
    const engine = getEngine();
    await engine.stop();
    console.log('✅ Engine stopped');
    process.exit(0);
  });

/**
 * status - 查看系统状态
 */
program
  .command('status')
  .description('查看系统状态')
  .action(async () => {
    printTitle('AI Company v3 - Status');

    try {
      const engine = getEngine();
      const status = engine.getStatus();

      console.log(`Engine:        ${status.engineRunning ? '🟢 Running' : '🔴 Stopped'}`);
      console.log(`Active Goals:  ${status.activeGoals}`);
      console.log(`Pending Tasks: ${status.pendingTasks}`);
      console.log(`Running Tasks: ${status.activeTasks}`);
      console.log(`Employees:     ${status.activeEmployees}`);
      console.log(`Uptime:        ${Math.floor(status.uptime / 60)}m ${status.uptime % 60}s\n`);

      // 显示当前目标
      const goalManager = getGoalManager();
      const activeGoals = goalManager.getActiveGoals();

      if (activeGoals.length > 0) {
        console.log('[Current Goals]');
        for (const goal of activeGoals) {
          const progress = goalManager.getProgress(goal.id);
          if (progress) {
            console.log(`  → ${goal.description} (${progress.progress}% complete)`);
          }
        }
      }

    } catch (error: any) {
      console.error('Error:', error.message);
      console.log('\n💡 提示: 请先使用 "ai-company start" 启动引擎');
    }
  });

/**
 * goal - 目标管理
 */
const goalCmd = program.command('goal').description('目标管理');

goalCmd
  .command('create <description>')
  .description('创建新目标')
  .option('-t, --timeframe <time>', '时间框架（如：30天、1个月）', '30天')
  .action(async (description, options) => {
    printTitle('Create Goal');

    try {
      const goalManager = getGoalManager();
      const goal = await goalManager.setGoal(description, options.timeframe);

      console.log(`✅ Goal created!`);
      console.log(`   ID: ${goal.id}`);
      console.log(`   Description: ${goal.description}`);
      console.log(`   Timeframe: ${goal.timeframe}\n`);
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

goalCmd
  .command('list')
  .description('列出所有目标')
  .option('-a, --active', '仅显示活跃目标')
  .option('-c, --completed', '仅显示已完成目标')
  .action(async (options) => {
    printTitle('Goals');

    try {
      const db = await getDatabase();
      let goals;

      if (options.active) {
        goals = db.getActiveGoals();
      } else if (options.completed) {
        goals = db.getAllGoals().filter((g: any) => g.status === 'completed');
      } else {
        goals = db.getAllGoals();
      }

      if (goals.length === 0) {
        console.log('No goals found.\n');
        return;
      }

      printTable(
        ['Description', 'Status', 'Progress', 'Timeframe'],
        goals.map((g: any) => [
          g.description.substring(0, 30),
          `${getStatusIcon(g.status)} ${g.status}`,
          `${g.progress || 0}%`,
          g.timeframe,
        ])
      );
      console.log();
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

goalCmd
  .command('progress <goalId>')
  .description('查看目标进度')
  .action(async (goalId) => {
    printTitle(`Goal Progress: ${goalId}`);

    try {
      const goalManager = getGoalManager();
      const progress = goalManager.getProgress(goalId);

      if (!progress) {
        console.log('❌ Goal not found\n');
        return;
      }

      console.log(`Description: ${progress.description}`);
      console.log(`Status: ${getStatusIcon(progress.status)} ${progress.status}`);
      console.log(`Progress: ${progress.progress}%`);
      console.log(`Steps: ${progress.completedSteps}/${progress.totalSteps} completed\n`);

      if (progress.blockers.length > 0) {
        console.log('[Blockers]');
        for (const blocker of progress.blockers) {
          console.log(`  • ${blocker}`);
        }
        console.log();
      }
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

/**
 * task - 任务管理
 */
const taskCmd = program.command('task').description('任务管理');

taskCmd
  .command('list')
  .description('列出所有任务')
  .option('-p, --pending', '仅显示待处理任务')
  .option('-r, --running', '仅显示执行中任务')
  .option('-c, --completed', '仅显示已完成任务')
  .action(async (options) => {
    printTitle('Tasks');

    try {
      const db = await getDatabase();
      let tasks;

      if (options.pending) {
        tasks = db.getTasksByStatus('pending');
      } else if (options.running) {
        tasks = db.getTasksByStatus('executing');
      } else if (options.completed) {
        tasks = db.getTasksByStatus('completed');
      } else {
        tasks = db.getAllTasks();
      }

      if (tasks.length === 0) {
        console.log('No tasks found.\n');
        return;
      }

      // 只显示前 20 个
      const displayTasks = tasks.slice(0, 20);

      printTable(
        ['ID', 'Description', 'Status', 'Priority', 'Employee'],
        displayTasks.map((t: any) => [
          t.id.substring(0, 12),
          t.description.substring(0, 30),
          `${getStatusIcon(t.status)} ${t.status}`,
          t.priority,
          t.employee_id || '-',
        ])
      );
      console.log();

      if (tasks.length > 20) {
        console.log(`... and ${tasks.length - 20} more tasks\n`);
      }
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

/**
 * employee - 员工管理
 */
const employeeCmd = program.command('employee').description('员工管理');

employeeCmd
  .command('list')
  .description('列出所有员工')
  .action(async () => {
    printTitle('Employees');

    try {
      const db = await getDatabase();
      const employees = db.getAllEmployees();

      if (employees.length === 0) {
        console.log('No employees found.\n');
        return;
      }

      printTable(
        ['Name', 'Role', 'Level', 'Performance', 'Satisfaction'],
        employees.map((e: any) => [
          e.name,
          e.role,
          `Lv${e.level}`,
          `${e.performance}/100`,
          `${e.satisfaction}/100`,
        ])
      );
      console.log();
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

/**
 * stats - 统计信息
 */
program
  .command('stats')
  .description('查看统计信息')
  .action(async () => {
    printTitle('Statistics');

    try {
      const db = await getDatabase();
      const stats = db.getStats();

      console.log('[Goals]');
      console.log(`  Total:     ${stats.goals.total}`);
      console.log(`  Active:    ${stats.goals.active}`);
      console.log(`  Completed: ${stats.goals.completed}\n`);

      console.log('[Tasks]');
      console.log(`  Total:     ${stats.tasks.total}`);
      console.log(`  Pending:   ${stats.tasks.pending}`);
      console.log(`  Executing: ${stats.tasks.executing}`);
      console.log(`  Completed: ${stats.tasks.completed}`);
      console.log(`  Failed:    ${stats.tasks.failed}\n`);

      console.log('[Employees]');
      console.log(`  Total:     ${stats.employees.total}\n`);
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

/**
 * chat - 交互式对话
 */
program
  .command('chat')
  .description('与 CEO 对话')
  .action(async () => {
    printTitle('Chat with CEO');

    try {
      const engine = getEngine();

      console.log('💬 输入你的消息与 CEO 对话');
      console.log('   输入 "exit" 退出\n');

      process.stdin.setEncoding('utf8');
      process.stdin.on('data', async (data: string) => {
        const input = data.toString().trim();

        if (input === 'exit' || input === 'quit') {
          console.log('\n👋 Goodbye!\n');
          process.exit(0);
        }

        if (input) {
          const response = await engine.handleUserInput(input);
          console.log(`\n[CEO] ${response}\n`);
        }
      });
    } catch (error: any) {
      console.error('Error:', error.message);
      console.log('\n💡 提示: 请先使用 "ai-company start" 启动引擎');
    }
  });

// 添加小红书命令
program.addCommand(xiaohongshuCommand);

// ============================================================================
// Parse and Execute
// ============================================================================

program.parse(process.argv);

// 如果没有参数，显示帮助
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
