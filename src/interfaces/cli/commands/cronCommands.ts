/**
 * AI Company CLI - Cron Commands
 *
 * 定时任务管理 - 使用 node-cron
 */

import { Command } from 'commander';
import { getDatabase } from '../../../infrastructure/database/index.js';
import { getCronService } from '../../../infrastructure/cron/index.js';
import { CronRepository } from '../../../infrastructure/cron/CronRepository.js';
import { formatCronRule, validateCronRule } from '../../../infrastructure/cron/utils.js';

// 全局 CronService 实例（用于守护进程）
let globalCronService: any = null;

export function registerCronCommands(program: Command): void {
  // ============================================================================
  // cron:add - 添加定时任务
  // ============================================================================

  program
    .command('cron:add <name> <command> <cronRule>')
    .description('添加定时任务')
    .option('-d, --description <desc>', '描述')
    .option('--arg <key=value>', '参数 (可多次使用)', [])
    .option('--env <key=value>', '环境变量 (可多次使用)', [])
    .option('--timeout <seconds>', '超时时间(秒)', '300')
    .option('--working-dir <dir>', '工作目录')
    .option('--disabled', '创建后禁用')
    .action(async (name, command, cronRule, options) => {
      const db = getDatabase();
      const repository = new CronRepository(db);

      // 检查名称是否已存在
      if (repository.getByName(name)) {
        console.log(`\n❌ 任务名称已存在: ${name}\n`);
        return;
      }

      // 验证 cron 规则
      const validation = validateCronRule(cronRule);
      if (!validation.valid) {
        console.log(`\n❌ 无效的 cron 规则: ${cronRule}`);
        console.log(`   错误: ${validation.error}\n`);
        return;
      }

      // 解析参数
      const args: Record<string, any> = {};
      for (const arg of options.arg) {
        const [key, ...valueParts] = arg.split('=');
        const value = valueParts.join('=');
        try {
          args[key] = JSON.parse(value);
        } catch {
          args[key] = value;
        }
      }

      // 解析环境变量
      const env: Record<string, string> = {};
      for (const e of options.env) {
        const [key, value] = e.split('=');
        env[key] = value;
      }

      // 创建任务
      const job = repository.create({
        name,
        description: options.description,
        command,
        args: Object.keys(args).length > 0 ? args : undefined,
        cronRule,
        enabled: !options.disabled,
        timeout: parseInt(options.timeout),
        workingDir: options.workingDir,
        env: Object.keys(env).length > 0 ? env : undefined,
      });

      // 如果启用，调度任务
      if (job.enabled) {
        const cronService = getCronService(db);
        cronService.schedule({
          id: job.id,
          name: job.name,
          description: job.description,
          command: job.command,
          args: job.args,
          cronRule: job.cronRule ?? undefined,
          enabled: job.enabled,
          timeout: job.timeout,
          workingDir: job.workingDir,
          env: job.env,
        });
      }

      console.log(`\n✅ 定时任务已创建: ${job.name}`);
      console.log(`   ID: ${job.id}`);
      console.log(`   命令: ${job.command}`);
      if (cronRule) {
        console.log(`   Cron: ${cronRule} (${formatCronRule(cronRule)})`);
      }
      if (job.nextRun) {
        console.log(`   下次运行: ${new Date(job.nextRun).toLocaleString('zh-CN')}`);
      }
      console.log(`   状态: ${job.enabled ? '启用' : '禁用'}\n`);
    });

  // ============================================================================
  // cron:list - 列出定时任务
  // ============================================================================

  program
    .command('cron:list')
    .description('列出所有定时任务')
    .option('-a, --all', '包括禁用的任务')
    .action(async (options) => {
      const db = getDatabase();
      const repository = new CronRepository(db);

      const jobs = options.all ? repository.getAll() : repository.getEnabled();

      console.log(`\n📋 定时任务列表 (${jobs.length})\n`);

      if (jobs.length === 0) {
        console.log(`  暂无任务\n`);
        return;
      }

      const now = Date.now();

      for (const job of jobs) {
        const status = job.enabled ? '🟢' : '⚫';
        const nextRun = job.nextRun && job.nextRun > now
          ? new Date(job.nextRun).toLocaleString('zh-CN')
          : (job.nextRun ? '⚠️  已到期' : '手动执行');

        console.log(`${status} ${job.name}`);
        console.log(`   ID: ${job.id}`);
        console.log(`   命令: ${job.command}`);
        if (job.cronRule) {
          console.log(`   Cron: ${job.cronRule} (${formatCronRule(job.cronRule)})`);
        } else {
          console.log(`   Cron: 手动执行`);
        }
        console.log(`   下次运行: ${nextRun}`);
        console.log(`   运行: ${job.runCount}次 | 失败: ${job.failCount}次\n`);
      }
    });

  // ============================================================================
  // cron:show - 查看任务详情
  // ============================================================================

  program
    .command('cron:show <nameOrId>')
    .description('查看任务详情')
    .action(async (nameOrId) => {
      const db = getDatabase();
      const repository = new CronRepository(db);

      const job = repository.getById(nameOrId) || repository.getByName(nameOrId);

      if (!job) {
        console.log(`\n❌ 任务不存在: ${nameOrId}\n`);
        return;
      }

      console.log(`\n📋 ${job.name}\n`);
      console.log(`ID: ${job.id}`);
      console.log(`描述: ${job.description || '-'}`);
      console.log(`状态: ${job.enabled ? '✅ 启用' : '⚫ 禁用'}`);
      console.log(`\n命令:`);
      console.log(`  ${job.command}`);
      if (job.args) {
        console.log(`\n参数:`);
        for (const [key, value] of Object.entries(job.args)) {
          console.log(`  --${key} ${JSON.stringify(value)}`);
        }
      }
      if (job.env) {
        console.log(`\n环境变量:`);
        for (const [key, value] of Object.entries(job.env)) {
          console.log(`  ${key}=${value}`);
        }
      }
      console.log(`\nCron 规则: ${job.cronRule || '手动执行'}`);
      if (job.cronRule) {
        console.log(`说明: ${formatCronRule(job.cronRule)}`);
      }
      if (job.nextRun) {
        console.log(`下次运行: ${new Date(job.nextRun).toLocaleString('zh-CN')}`);
      }
      console.log(`\n统计:`);
      console.log(`  运行次数: ${job.runCount}`);
      console.log(`  失败次数: ${job.failCount}`);
      console.log(`  超时: ${job.timeout}秒`);
      console.log(`  工作目录: ${job.workingDir || '-'}`);
      console.log(`\n创建时间: ${new Date(job.createdAt).toLocaleString('zh-CN')}`);
      console.log(`更新时间: ${new Date(job.updatedAt).toLocaleString('zh-CN')}`);

      // 最近执行记录
      const executions = repository.getExecutions(job.id, 5);
      if (executions.length > 0) {
        console.log(`\n最近执行:`);
        for (const exec of executions) {
          const status = exec.timeout ? '⏱️  超时' :
            exec.exitCode === 0 ? '✅ 成功' : '❌ 失败';
          const duration = exec.completedAt
            ? `${((exec.completedAt - exec.startedAt) / 1000).toFixed(2)}s`
            : '-';
          const startTime = new Date(exec.startedAt).toLocaleString('zh-CN');

          console.log(`  ${status} ${startTime} (${duration})`);
        }
      }
      console.log('');
    });

  // ============================================================================
  // cron:history - 查看执行历史
  // ============================================================================

  program
    .command('cron:history <nameOrId>')
    .description('查看任务执行历史')
    .option('-n, --limit <number>', '显示条数', '20')
    .action(async (nameOrId, options) => {
      const db = getDatabase();
      const repository = new CronRepository(db);

      const job = repository.getById(nameOrId) || repository.getByName(nameOrId);

      if (!job) {
        console.log(`\n❌ 任务不存在: ${nameOrId}\n`);
        return;
      }

      const executions = repository.getExecutions(job.id, parseInt(options.limit));

      console.log(`\n📜 ${job.name} - 执行历史 (${executions.length}条)\n`);

      if (executions.length === 0) {
        console.log(`  暂无执行记录\n`);
        return;
      }

      for (const exec of executions) {
        const status = exec.timeout ? '⏱️  超时' :
          exec.exitCode === 0 ? '✅ 成功' :
          exec.exitCode === undefined ? '🔄 运行中' : '❌ 失败';
        const duration = exec.completedAt
          ? `${((exec.completedAt - exec.startedAt) / 1000).toFixed(2)}s`
          : '运行中...';
        const startTime = new Date(exec.startedAt).toLocaleString('zh-CN');

        console.log(`${status} ${startTime} (${duration})`);

        if (exec.output) {
          const lines = exec.output.split('\n').slice(0, 3);
          for (const line of lines) {
            console.log(`   ${line}`);
          }
          if (exec.output.split('\n').length > 3) {
            console.log(`   ...`);
          }
        }

        if (exec.error) {
          console.log(`   ❌ ${exec.error.split('\n')[0]}`);
        }
        console.log('');
      }
    });

  // ============================================================================
  // cron:enable - 启用任务
  // ============================================================================

  program
    .command('cron:enable <nameOrId>')
    .description('启用定时任务')
    .action(async (nameOrId) => {
      const db = getDatabase();
      const repository = new CronRepository(db);
      const cronService = getCronService(db);

      const job = repository.getById(nameOrId) || repository.getByName(nameOrId);

      if (!job) {
        console.log(`\n❌ 任务不存在: ${nameOrId}\n`);
        return;
      }

      if (job.enabled) {
        console.log(`\n⚠️  任务已经是启用状态\n`);
        return;
      }

      repository.update(job.id, { enabled: true });

      // 调度任务
      cronService.schedule({
        id: job.id,
        name: job.name,
        command: job.command,
        args: job.args,
        cronRule: job.cronRule ?? undefined,
        enabled: true,
        timeout: job.timeout,
        workingDir: job.workingDir,
        env: job.env,
      });

      console.log(`\n✅ 任务已启用: ${job.name}\n`);
    });

  // ============================================================================
  // cron:disable - 禁用任务
  // ============================================================================

  program
    .command('cron:disable <nameOrId>')
    .description('禁用定时任务')
    .action(async (nameOrId) => {
      const db = getDatabase();
      const repository = new CronRepository(db);
      const cronService = getCronService(db);

      const job = repository.getById(nameOrId) || repository.getByName(nameOrId);

      if (!job) {
        console.log(`\n❌ 任务不存在: ${nameOrId}\n`);
        return;
      }

      if (!job.enabled) {
        console.log(`\n⚠️  任务已经是禁用状态\n`);
        return;
      }

      repository.update(job.id, { enabled: false });

      // 停止调度
      cronService.unschedule(job.id);

      console.log(`\n✅ 任务已禁用: ${job.name}\n`);
    });

  // ============================================================================
  // cron:delete - 删除任务
  // ============================================================================

  program
    .command('cron:delete <nameOrId>')
    .description('删除定时任务')
    .option('-f, --force', '强制删除，不提示确认')
    .action(async (nameOrId, options) => {
      const db = getDatabase();
      const repository = new CronRepository(db);
      const cronService = getCronService(db);

      const job = repository.getById(nameOrId) || repository.getByName(nameOrId);

      if (!job) {
        console.log(`\n❌ 任务不存在: ${nameOrId}\n`);
        return;
      }

      if (!options.force) {
        console.log(`\n⚠️  确定要删除任务 "${job.name}" 吗？`);
        console.log(`   运行 'ai-company cron:delete ${nameOrId} --force' 强制删除\n`);
        return;
      }

      // 停止调度
      cronService.unschedule(job.id);

      // 删除任务
      repository.delete(job.id);

      console.log(`\n✅ 任务已删除: ${job.name}\n`);
    });

  // ============================================================================
  // cron:run - 立即运行任务
  // ============================================================================

  program
    .command('cron:run <nameOrId>')
    .description('立即运行定时任务')
    .action(async (nameOrId) => {
      const db = getDatabase();
      const cronService = getCronService(db);
      const repository = new CronRepository(db);

      const job = repository.getById(nameOrId) || repository.getByName(nameOrId);

      if (!job) {
        console.log(`\n❌ 任务不存在: ${nameOrId}\n`);
        return;
      }

      console.log(`\n▶️  手动执行任务: ${job.name}\n`);

      try {
        const result = await cronService.executeNow({
          id: job.id,
          name: job.name,
          command: job.command,
          args: job.args,
          cronRule: job.cronRule ?? undefined,
          enabled: job.enabled,
          timeout: job.timeout,
          workingDir: job.workingDir,
          env: job.env,
        });

        console.log(`\n✅ 任务完成: ${job.name}`);
        console.log(`   耗时: ${result.duration}ms`);
        console.log(`   退出码: ${result.exitCode}`);

        if (result.stdout) {
          console.log(`\n输出:\n${result.stdout}`);
        }

        if (result.stderr) {
          console.log(`\n错误:\n${result.stderr}`);
        }
      } catch (error: any) {
        console.log(`\n❌ 任务失败: ${job.name}`);
        console.log(`   错误: ${error.message}`);
      }

      console.log('');
    });

  // ============================================================================
  // cron:start - 启动守护进程
  // ============================================================================

  program
    .command('cron:start')
    .description('启动 cron 守护进程')
    .action(async () => {
      const db = getDatabase();
      const cronService = getCronService(db);
      const repository = new CronRepository(db);

      // 启用所有已启用的任务
      const jobs = repository.getEnabled();

      console.log(`\n🚀 启动 Cron 守护进程...`);
      console.log(`   加载 ${jobs.length} 个定时任务\n`);

      for (const job of jobs) {
        cronService.schedule({
          id: job.id,
          name: job.name,
          command: job.command,
          args: job.args,
          cronRule: job.cronRule ?? undefined,
          enabled: job.enabled,
          timeout: job.timeout,
          workingDir: job.workingDir,
          env: job.env,
        });
      }

      // 打印状态
      const status = cronService.getStatus();
      console.log(`\n✅ 已启动 ${status.running} 个定时任务\n`);

      // 保持进程运行
      console.log(`按 Ctrl+C 退出...\n`);

      // 处理退出信号
      const shutdown = async () => {
        console.log(`\n\n🛑 停止 Cron 守护进程...`);
        cronService.stopAll();
        console.log(`✅ 已停止\n`);
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });

  // ============================================================================
  // cron:status - 查看运行状态
  // ============================================================================

  program
    .command('cron:status')
    .description('查看 cron 守护进程状态')
    .action(async () => {
      const db = getDatabase();
      const cronService = getCronService(db);

      const status = cronService.getStatus();

      console.log(`\n📊 Cron 状态\n`);
      console.log(`运行中任务: ${status.running}`);
      console.log(`任务列表:`);

      if (status.jobs.length === 0) {
        console.log(`  无运行中的任务\n`);
      } else {
        for (const job of status.jobs) {
          const statusIcon = job.running ? '🟢' : '⚫';
          console.log(`  ${statusIcon} ${job.id}`);
        }
      }
      console.log('');
    });

  // ============================================================================
  // cron:validate - 验证 cron 表达式
  // ============================================================================

  program
    .command('cron:validate <cronRule>')
    .description('验证 cron 表达式')
    .action(async (cronRule) => {
      const validation = validateCronRule(cronRule);

      if (validation.valid) {
        console.log(`\n✅ Cron 表达式有效\n`);
        console.log(`规则: ${cronRule}`);
        console.log(`说明: ${formatCronRule(cronRule)}\n`);
      } else {
        console.log(`\n❌ 无效的 cron 表达式\n`);
        console.log(`规则: ${cronRule}`);
        console.log(`错误: ${validation.error}\n`);
      }
    });

  // ============================================================================
  // cron:stats - 统计信息
  // ============================================================================

  program
    .command('cron:stats')
    .description('显示统计信息')
    .action(async () => {
      const db = getDatabase();
      const repository = new CronRepository(db);
      const stats = repository.getStats();

      console.log(`\n📊 Cron 统计\n`);
      console.log(`任务总数: ${stats.total}`);
      console.log(`启用: ${stats.enabled}`);
      console.log(`禁用: ${stats.disabled}`);
      console.log(`\n累计运行: ${stats.totalRuns}次`);
      console.log(`累计失败: ${stats.totalFailures}次`);

      if (stats.nextRun) {
        console.log(`\n下次运行: ${new Date(stats.nextRun).toLocaleString('zh-CN')}`);
      }
      console.log('');
    });
}
