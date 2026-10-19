#!/usr/bin/env node
/**
 * AI Company v2 - CLI Entry Point
 */

// 加载环境变量
import 'dotenv/config';

import { Command } from 'commander';
import { initDatabase, resetDatabase, getDatabase } from '../db/Database.js';
import { Orchestrator } from '../core/Orchestrator.js';
import { getToolRegistry, initAllBuiltInTools } from '../core/tools/builtin/index.js';
import { getEventBus, getEventCollector, getCoreProcess, getResultRouter, getTaskReviewer } from '../core/events/index.js';
import { getConfigManager } from '../config/ConfigManager.js';
import { getServerManager } from '../server/index.js';
import { registerTelegramCommands } from './telegramCommands.js';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';

const program = new Command();

// 获取项目根目录
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

program
  .name('ai-company')
  .description('AI Company - 自主运行公司')
  .version('2.0.0');

// ============================================================================
// 初始化命令
// ============================================================================

program
  .command('init')
  .description('初始化公司（首次使用）')
  .action(async () => {
    try {
      console.log('\n╔══════════════════════════════════════════════╗');
      console.log('║       欢迎使用 AI Company v2                ║');
      console.log('║    让 AI 替你完成所有工作的自主运行公司        ║');
      console.log('╚══════════════════════════════════════════════╝\n');

      const configManager = getConfigManager();

      // 检查是否已配置
      if (configManager.exists()) {
        const existing = configManager.getConfig();
        console.log('⚠️  检测到已有配置：');
        console.log(`   👤 Owner: ${existing?.ownerName}`);
        console.log(`   🏢 Company: ${existing?.companyName}`);
        console.log(`   📁 Workdir: ${existing?.workdir}`);
        console.log('\n如需重新配置，请删除配置文件后重试：');
        console.log(`   rm ${path.join(configManager.getWorkdir(), 'config.json')}\n`);
        return;
      }

      // 交互式配置
      const config = await configManager.initConfig();

      console.log('\n✅ 配置保存成功！');
      console.log(`   👤 Owner: ${config.ownerName}`);
      console.log(`   🏢 Company: ${config.companyName}`);
      console.log(`   📁 Workdir: ${config.workdir}`);

      // 复制 .env.example 到用户选择的工作目录
      configManager.setupEnvFile(projectRoot, config.aiProvider);

      // 初始化数据库（使用用户选择的工作目录）
      console.log('\n[Database] 正在创建数据库...');
      const dbPath = path.join(config.workdir, 'company.db');
      const db = initDatabase(dbPath);
      console.log(`[Database] ✅ 数据库已创建: ${dbPath}`);

      // 注册工具（确保系统工具可用）
      console.log('\n[Tools] 正在注册系统工具...');
      const toolRegistry = getToolRegistry();
      await initAllBuiltInTools(toolRegistry);
      const toolStats = toolRegistry.getStats();
      console.log(`[Tools] ✅ 已注册 ${toolStats.enabledTools} 个工具`);

      console.log('\n🎉 公司初始化完成！\n');

      // 显示下一步提示
      console.log('╔══════════════════════════════════════════════╗');
      console.log('║  下一步                                     ║');
      console.log('╚══════════════════════════════════════════════╝\n');

      console.log('1️⃣  配置 AI API Key');
      console.log(`   编辑: ${path.join(config.workdir, '.env')}`);
      console.log('   添加: ANTHROPIC_API_KEY=your_key_here\n');

      console.log('2️⃣  配置 Telegram Bot（可选）');
      console.log('   ai-company telegram:setup <bot_token>\n');

      console.log('3️⃣  开始使用');
      console.log(`   ai-company run "帮我写一个Python脚本"\n`);

    } catch (error: any) {
      console.error('\n❌ 初始化失败:', error.message);
      process.exit(1);
    }
  });

// ============================================================================
// 用户命令 - Chat/需求（直接执行，不启动后台服务）
// ============================================================================

program
  .command('chat')
  .description('与 CEO 对话，多轮交流')
  .option('--history', '显示对话历史')
  .action(async (options) => {
    try {
      // 检查配置
      const configManager = getConfigManager();
      const config = configManager.getConfig();

      if (!config) {
        console.log('\n⚠️  检测到您还未初始化配置\n');
        console.log('请先运行以下命令初始化您的 AI Company：');
        console.log('  ai-company init\n');
        process.exit(1);
      }

      // 初始化工具注册表
      const toolRegistry = getToolRegistry();
      await initAllBuiltInTools(toolRegistry);

      // 获取 CEO
      const { getCEOChatHandler } = await import('./CEOChatHandler.js');
      const chatHandler = getCEOChatHandler(config);

      if (options.history) {
        await chatHandler.showHistory();
      } else {
        await chatHandler.start();
      }

    } catch (error: any) {
      console.error('[CLI] 对话失败:', error.message);
      process.exit(1);
    }
  });

program
  .command('run')
  .argument('<input>', '用户输入/需求')
  .description('提交需求，直接执行（不启动后台服务）')
  .action(async (input: string) => {
    try {
      // 检查配置
      const configManager = getConfigManager();
      const config = configManager.getConfig();

      if (!config) {
        console.log('\n⚠️  检测到您还未初始化配置\n');
        console.log('请先运行以下命令初始化您的 AI Company：');
        console.log('  ai-company init\n');
        process.exit(1);
      }

      console.log(`[CLI] 收到需求："${input}"`);

      // 初始化工具注册表
      const toolRegistry = getToolRegistry();
      await initAllBuiltInTools(toolRegistry);

      // 启动 CLI 交互处理器（支持 Agent 请求用户交互）
      const { getCLIInteractionHandler } = await import('./CLIInteractionHandler.js');
      const cliInteractionHandler = getCLIInteractionHandler();
      await cliInteractionHandler.start();

      // 获取数据库和 Agent 工厂（使用配置的数据库路径）
      const configDbPath = path.join(config.workdir, 'company.db');
      const db = getDatabase(configDbPath);
      const { getAgentFactory } = await import('../core/agents/AgentFactory.js');
      const factory = getAgentFactory(db);

      // 获取或创建 Agent
      const agent = await factory.getOrCreateAgent({
        taskDescription: input,
        requiredCapabilities: ['analysis'],
      });

      console.log(`[CLI] 使用 Agent: ${agent.name} (${agent.role})`);

      // 直接调用 API Agent Executor
      const { getAPIAgentExecutor } = await import('../core/execution/APIAgentExecutor.js');
      const executor = getAPIAgentExecutor({
        agentId: agent.id,
        agentName: agent.name,
        systemPrompt: agent.systemPrompt,
        taskId: `cli_${Date.now()}`,
      });

      // 执行任务
      const result = await executor.execute(input);

      // 停止 CLI 交互处理器
      cliInteractionHandler.stop();

      // 输出结果
      if (result.success) {
        console.log('\n✅ 任务完成\n');
        if (result.output) {
          console.log(result.output);
        }
      } else {
        console.log('\n❌ 任务失败\n');
        console.log(result.error || '未知错误');
        process.exit(1);
      }

      process.exit(0);

    } catch (error: any) {
      // 停止 CLI 交互处理器
      try {
        const { getCLIInteractionHandler } = await import('./CLIInteractionHandler.js');
        const cliInteractionHandler = getCLIInteractionHandler();
        cliInteractionHandler.stop();
      } catch {}

      console.error('[CLI] 执行失败:', error.message);
      process.exit(1);
    }
  });

// ============================================================================
// 用户命令 - 明确指令（直接执行）
// ============================================================================

program
  .command('tasks')
  .description('查看任务列表')
  .option('-a, --all', '显示所有任务（包括已完成）')
  .option('-l, --limit <number>', '限制返回数量', '20')
  .action(async (options: { all?: boolean; limit: string }) => {
    try {
      const db = getDatabase();

      // 检查数据库状态
      if ((db as any).isClosed) {
        console.error('数据库连接已关闭，请重新初始化');
        process.exit(1);
      }

      const limit = parseInt(options.limit) || 20;

      let sql = `
        SELECT t.id, t.description, t.status, t.priority, t.assigned_to,
               t.created_at, e.name as employee_name
        FROM tasks t
        LEFT JOIN employees e ON t.assigned_to = e.id
        WHERE 1=1
      `;

      if (!options.all) {
        sql += ` AND t.status IN ('pending', 'executing', 'retrying')`;
      }

      sql += ` ORDER BY t.created_at DESC LIMIT ?`;

      const tasks = db.prepare(sql).all(limit) as any[];

      if (tasks.length === 0) {
        console.log('\n暂无任务\n');
        return;
      }

      console.log(`\n=== 任务列表 (${tasks.length} 个) ===\n`);
      console.log('ID\t状态\t优先级\t员工\t描述');
      console.log('─'.repeat(80));

      for (const task of tasks) {
        const statusIcons: Record<string, string> = {
          'pending': '⏳',
          'executing': '🔄',
          'retrying': '🔁',
          'completed': '✅',
          'failed': '❌',
          'cancelled': '🚫',
        };
        const statusIcon = statusIcons[task.status as string] || task.status;

        const priorityIcons: Record<string, string> = {
          'low': '🟢',
          'medium': '🟡',
          'high': '🟠',
          'critical': '🔴',
        };
        const priorityIcon = priorityIcons[task.priority as string] || task.priority;

        const desc = task.description?.substring(0, 30) || 'N/A';
        const employee = task.employee_name || '未分配';

        console.log(`${task.id}\n  ${statusIcon} ${priorityIcon} ${employee} ${desc}`);
      }

      console.log('');
      console.log('取消任务：ai-company cancel <task-id>');
      console.log('');
    } catch (error: any) {
      console.error('[CLI] 查询失败:', error.message);
      process.exit(1);
    }
  });

program
  .command('cancel')
  .argument('<taskId>', '任务 ID')
  .description('取消正在执行的任务')
  .action(async (taskId: string) => {
    try {
      const db = getDatabase();

      // 检查任务是否存在
      const task = db.prepare('SELECT id, status FROM tasks WHERE id = ?').get(taskId) as any;

      if (!task) {
        console.log(`\n⚠️  任务不存在：${taskId}\n`);
        process.exit(1);
      }

      // 检查任务状态
      const cancellableStatuses = ['pending', 'executing', 'retrying'];
      if (!cancellableStatuses.includes(task.status)) {
        console.log(`\n⚠️  任务状态为 "${task.status}"，无法取消\n`);
        process.exit(1);
      }

      // 更新任务状态为 cancelled
      db.prepare(`
        UPDATE tasks
        SET status = 'cancelled', updated_at = ?
        WHERE id = ?
      `).run(Date.now(), taskId);

      // 记录活动日志
      db.logActivity({
        eventType: 'task.cancelled',
        actor: 'cli_user',
        action: 'cancel_task',
        context: {
          taskId,
          previousStatus: task.status,
        },
      });

      // 尝试中断正在执行的 Session
      try {
        const { getTaskSessionManager } = await import('../core/execution/TaskSessionManager.js');
        const sessionManager = getTaskSessionManager();
        await sessionManager.cancelTask(taskId);
        console.log(`\n✅ 任务已取消：${taskId}`);
        console.log(`   原状态：${task.status}`);
        console.log('');
      } catch (sessionError: any) {
        console.log(`\n⚠️  任务状态已更新，但 Session 中断失败：${sessionError.message}\n`);
      }
    } catch (error: any) {
      console.error('[CLI] 取消失败:', error.message);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('查看系统状态')
  .action(async () => {
    try {
      const orchestrator = new Orchestrator();
      await orchestrator.initialize();

      const result = await orchestrator.getSystemStatus();

      console.log('\n=== 系统状态 ===');
      console.log(`目标：${result.goals.total} 总 ${result.goals.active} 进行中 ${result.goals.completed} 已完成`);
      console.log(`任务：${result.tasks.total} 总 ${result.tasks.executing} 执行中 ${result.tasks.completed} 已完成`);
      console.log(`员工：${result.employees.total} 总 ${result.employees.active} 活跃`);
      console.log(`定时任务：${result.cronJobs.total} 总 ${result.cronJobs.enabled} 启用`);

      await orchestrator.shutdown();
    } catch (error: any) {
      console.error('[CLI] 查询失败:', error.message);
      process.exit(1);
    }
  });

program
  .command('health')
  .description('查看系统健康状态（SystemMonitor）')
  .option('-v, --verbose', '显示详细信息')
  .action(async (options) => {
    try {
      const { getSystemMonitor } = await import('../core/supervision/SystemMonitor.js');
      const monitor = getSystemMonitor();

      // 启动监控（如果尚未启动）
      monitor.start();

      // 获取健康摘要
      const summary = monitor.getHealthSummary();

      console.log('\n=== 系统健康状态 ===\n');
      console.log(summary);
      console.log('');

      if (options.verbose) {
        const health = monitor.getSystemHealth();

        console.log('=== 详细信息 ===\n');
        console.log('组件状态:');
        for (const [name, component] of Object.entries(health.components)) {
          const icon = component.status === 'healthy' ? '✅' : component.status === 'degraded' ? '⚠️' : '❌';
          console.log(`  ${icon} ${name}:`);
          console.log(`     状态: ${component.status}`);
          console.log(`     消息: ${component.message || 'N/A'}`);
          if (component.details) {
            console.log(`     详情: ${JSON.stringify(component.details, null, 2).split('\n').join('\n     ')}`);
          }
        }

        console.log('\n资源使用:');
        const mem = health.resources.memory;
        console.log(`  内存: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB`);
        console.log(`  外部: ${Math.round(mem.external / 1024 / 1024)}MB`);
        console.log(`  运行时间: ${Math.round(health.resources.uptime / 1000)}秒`);
      }

      // 停止监控
      monitor.stop();
    } catch (error: any) {
      console.error('[CLI] 健康检查失败:', error.message);
      process.exit(1);
    }
  });

program
  .command('tools')
  .description('查看可用工具列表')
  .action(async () => {
    try {
      const registry = getToolRegistry();
      initAllBuiltInTools(registry);

      const tools = registry.getAllEnabled();
      const stats = registry.getStats();

      console.log(`\n=== 可用工具 (${stats.enabledTools} 个) ===\n`);

      // 按分类显示
      const categories = ['goal', 'task', 'employee', 'cron', 'chat', 'query', 'system'];

      for (const category of categories) {
        const categoryTools = tools.filter((t: any) => t.category === category);
        if (categoryTools.length > 0) {
          console.log(`## ${category.toUpperCase()}`);
          for (const tool of categoryTools) {
            console.log(`  - ${tool.name}: ${tool.description.substring(0, 60)}...`);
          }
          console.log('');
        }
      }
    } catch (error: any) {
      console.error('[CLI] 查询失败:', error.message);
      process.exit(1);
    }
  });

// ============================================================================
// 管理命令
// ============================================================================

program
  .command('db:init')
  .description('初始化数据库')
  .action(async () => {
    try {
      console.log('[CLI] 初始化数据库...');
      initDatabase();
      console.log('[CLI] 数据库初始化完成');
    } catch (error: any) {
      console.error('[CLI] 初始化失败:', error.message);
      process.exit(1);
    }
  });

program
  .command('db:reset')
  .description('重置数据库')
  .action(async () => {
    try {
      console.log('[CLI] 重置数据库...');
      resetDatabase();
      console.log('[CLI] 数据库重置完成');
    } catch (error: any) {
      console.error('[CLI] 重置失败:', error.message);
      process.exit(1);
    }
  });

// ============================================================================
// 启动
// ============================================================================

// 注册 Telegram 命令
registerTelegramCommands(program);

// ============================================================================
// Server 命令 - 启动后台服务
// ============================================================================

program
  .command('server')
  .description('启动后台服务（Telegram Bot + Cron 扫描）')
  .action(async () => {
    try {
      // 检查配置
      const configManager = getConfigManager();
      const config = configManager.getConfig();

      if (!config) {
        console.log('\n⚠️  检测到您还未初始化配置\n');
        console.log('请先运行以下命令初始化您的 AI Company：');
        console.log('  ai-company init\n');
        process.exit(1);
      }

      // 初始化工具注册表（确保所有内置工具已注册）
      const toolRegistry = getToolRegistry();
      await initAllBuiltInTools(toolRegistry);
      console.log('[CLI] 工具注册表初始化完成');

      const serverManager = getServerManager();

      // 启动服务
      await serverManager.start();

      // 处理退出信号
      process.on('SIGINT', async () => {
        console.log('\n\n收到停止信号，正在关闭服务...\n');
        await serverManager.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await serverManager.stop();
        process.exit(0);
      });

      // 保持进程运行
      await new Promise(() => {});

    } catch (error: any) {
      console.error('[Server] 启动失败:', error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);

// ============================================================================
// 全局错误处理和恢复机制
// ============================================================================

/**
 * 错误恢复管理器
 * 负责在系统崩溃时保存状态，并在重启后恢复
 */
class ErrorRecoveryManager {
  private static instance: ErrorRecoveryManager;
  private isShuttingDown = false;
  private recentCrashes: Array<{ timestamp: number; type: string; error: Error }> = [];
  private readonly CRASH_FILE = '.ai-company-crash.json';
  private readonly MAX_CRASHES_PER_HOUR = 5;
  private readonly CRASH_WINDOW_MS = 3600000; // 1 小时

  static getInstance(): ErrorRecoveryManager {
    if (!this.instance) {
      this.instance = new ErrorRecoveryManager();
    }
    return this.instance;
  }

  /**
   * 获取崩溃文件路径（供外部访问）
   */
  getCrashFilePath(): string {
    return this.CRASH_FILE;
  }

  /**
   * 记录崩溃信息（使用滑动窗口）
   */
  recordCrash(error: Error, type: 'uncaughtException' | 'unhandledRejection'): void {
    const now = Date.now();

    // 移除 1 小时前的崩溃记录
    this.recentCrashes = this.recentCrashes.filter(
      crash => now - crash.timestamp < this.CRASH_WINDOW_MS
    );

    // 添加当前崩溃
    this.recentCrashes.push({ timestamp: now, type, error });

    // 检查是否超过限制
    if (this.recentCrashes.length >= this.MAX_CRASHES_PER_HOUR) {
      console.error(`[ErrorRecovery] ❌ 崩溃次数过多 (${this.recentCrashes.length}/${this.MAX_CRASHES_PER_HOUR})，停止自动重启`);
      console.error('[ErrorRecovery] 请检查系统配置和日志，手动解决问题后再重启');
      process.exit(1);
    }

    const crashInfo = {
      type,
      message: error.message,
      stack: error.stack,
      timestamp: now,
      crashCount: this.recentCrashes.length,
    };

    try {
      const fs = require('fs');
      const path = require('path');
      const crashFile = path.join(process.cwd(), this.CRASH_FILE);
      fs.writeFileSync(crashFile, JSON.stringify(crashInfo, null, 2));
      console.error(`[ErrorRecovery] 崩溃信息已保存到: ${crashFile}`);
    } catch (e) {
      console.error('[ErrorRecovery] 无法保存崩溃信息:', e);
    }
  }

  /**
   * 优雅关闭系统
   */
  async gracefulShutdown(reason: string, error?: Error): Promise<void> {
    if (this.isShuttingDown) {
      console.log('[ErrorRecovery] 正在关闭中，跳过重复关闭');
      return;
    }

    this.isShuttingDown = true;
    console.log(`\n[ErrorRecovery] 🔴 开始优雅关闭: ${reason}`);

    try {
      // 1. 停止 CoreProcess
      try {
        const { getCoreProcess } = await import('../core/events/index.js');
        const coreProcess = getCoreProcess();
        coreProcess.stop();
        console.log('[ErrorRecovery] CoreProcess 已停止');
      } catch (e) {
        console.warn('[ErrorRecovery] 停止 CoreProcess 失败:', e);
      }

      // 2. 停止 SystemMonitor
      try {
        const { getSystemMonitor } = await import('../core/supervision/SystemMonitor.js');
        const monitor = getSystemMonitor();
        monitor.stop();
        console.log('[ErrorRecovery] SystemMonitor 已停止');
      } catch (e) {
        console.warn('[ErrorRecovery] 停止 SystemMonitor 失败:', e);
      }

      // 3. 停止 TaskSessionManager
      try {
        const { shutdownTaskSessionManager } = await import('../core/execution/TaskSessionManager.js');
        shutdownTaskSessionManager();
        console.log('[ErrorRecovery] TaskSessionManager 已停止');
      } catch (e) {
        console.warn('[ErrorRecovery] 停止 TaskSessionManager 失败:', e);
      }

      // 4. 停止 ProviderManager
      try {
        const { resetProviderManager } = await import('../core/ai/AIProvider.js');
        resetProviderManager();
        console.log('[ErrorRecovery] ProviderManager 已停止');
      } catch (e) {
        console.warn('[ErrorRecovery] 停止 ProviderManager 失败:', e);
      }

      // 5. 关闭数据库连接
      try {
        const { shutdownDatabase } = await import('../db/Database.js');
        shutdownDatabase();
        console.log('[ErrorRecovery] 数据库已关闭');
      } catch (e) {
        console.warn('[ErrorRecovery] 关闭数据库失败:', e);
      }

      console.log('[ErrorRecovery] ✅ 优雅关闭完成');
    } catch (e) {
      console.error('[ErrorRecovery] 优雅关闭过程中出错:', e);
    }

    // 如果是错误导致的关闭，退出码为 1
    if (error) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

// 获取错误恢复管理器单例
const errorRecovery = ErrorRecoveryManager.getInstance();

// ============================================================================
// 全局未捕获异常处理器
// ============================================================================

process.on('uncaughtException', async (error: Error) => {
  console.error('\n[GlobalError] 🔴 未捕获异常 (uncaughtException)');
  console.error('[GlobalError] 错误消息:', error.message);
  console.error('[GlobalError] 错误堆栈:', error.stack);

  // 记录崩溃
  errorRecovery.recordCrash(error, 'uncaughtException');

  // 记录到数据库（如果可能）
  try {
    const { getDatabase } = await import('../db/Database.js');
    const db = getDatabase();
    db.logActivity({
      eventType: 'system.crash',
      actor: 'global_error_handler',
      action: 'uncaught_exception',
      context: {
        message: error.message,
        stack: error.stack?.substring(0, 1000),
      },
    });
  } catch (e) {
    console.error('[GlobalError] 无法记录崩溃到数据库:', e);
  }

  // 优雅关闭
  await errorRecovery.gracefulShutdown('uncaughtException', error);
});

// ============================================================================
// 全局未处理的 Promise 拒绝处理器
// ============================================================================

process.on('unhandledRejection', async (reason: unknown) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));

  console.error('\n[GlobalError] 🟡 未处理的 Promise 拒绝 (unhandledRejection)');
  console.error('[GlobalError] 拒绝原因:', error.message);
  if (error.stack) {
    console.error('[GlobalError] 错误堆栈:', error.stack);
  }

  // 记录崩溃
  errorRecovery.recordCrash(error, 'unhandledRejection');

  // 记录到数据库（如果可能）
  try {
    const { getDatabase } = await import('../db/Database.js');
    const db = getDatabase();
    db.logActivity({
      eventType: 'system.crash',
      actor: 'global_error_handler',
      action: 'unhandled_rejection',
      context: {
        message: error.message,
        stack: error.stack?.substring(0, 1000),
        reason: String(reason),
      },
    });
  } catch (e) {
    console.error('[GlobalError] 无法记录崩溃到数据库:', e);
  }

  // 注意：unhandledRejection 不会自动终止进程，但我们仍然需要优雅关闭
  // 在生产环境中，这可能是可恢复的错误，所以只记录不退出
  console.warn('[GlobalError] Promise 拒绝不退出进程，继续运行...');
});

// ============================================================================
// 警告信号处理器
// ============================================================================

process.on('SIGINT', async () => {
  console.log('\n[GlobalError] 收到 SIGINT 信号 (Ctrl+C)');
  await errorRecovery.gracefulShutdown('SIGINT');
});

process.on('SIGTERM', async () => {
  console.log('\n[GlobalError] 收到 SIGTERM 信号');
  await errorRecovery.gracefulShutdown('SIGTERM');
});

// ============================================================================
// 启动时的恢复检查
// ============================================================================

function checkCrashRecovery(): void {
  try {
    const crashFile = path.join(process.cwd(), errorRecovery.getCrashFilePath());

    if (fs.existsSync(crashFile)) {
      const crashInfo = JSON.parse(fs.readFileSync(crashFile, 'utf-8'));
      const timeSinceCrash = Date.now() - crashInfo.timestamp;

      console.log(`\n[ErrorRecovery] ⚠️  检测到上次崩溃: ${new Date(crashInfo.timestamp).toLocaleString()}`);
      console.log(`[ErrorRecovery] 崩溃类型: ${crashInfo.type}`);
      console.log(`[ErrorRecovery] 错误消息: ${crashInfo.message}`);
      console.log(`[ErrorRecovery] 距离崩溃: ${Math.round(timeSinceCrash / 1000)} 秒`);

      if (timeSinceCrash < 60000) { // 1 分钟内
        console.warn('\n[ErrorRecovery] ⚠️  系统在 1 分钟内崩溃过，请注意监控系统状态');
      }

      // 清除崩溃文件
      fs.unlinkSync(crashFile);
      console.log('[ErrorRecovery] 崩溃记录已清除\n');
    }
  } catch (e) {
    console.error('[ErrorRecovery] 检查崩溃恢复失败:', e);
  }
}

// 在程序启动时检查崩溃恢复
checkCrashRecovery();
