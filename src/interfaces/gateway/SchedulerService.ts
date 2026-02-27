/**
 * AI Company Gateway - Scheduler Service
 *
 * 扫描 pending 任务，启动 Claude Code 执行
 */

import { getDatabase } from '../../infrastructure/database/index.js';
import { TaskExecutor } from '../../application/services/TaskExecutor.js';
import { getPaths } from '../../infrastructure/config/Paths.js';
import { prepareWorkDir } from './utils.js';

/**
 * 简单的 HTML 格式化（避免依赖 TelegramFormatter）
 */
const h1 = (text: string) => `<b>${text}</b>`;
const h2 = (text: string) => `\n<b>${text}</b>`;
const bold = (text: string) => `<b>${text}</b>`;
const code = (text: string) => `<code>${text}</code>`;
const pre = (text: string) => `<pre>${text}</pre>`;
const italic = (text: string) => `<i>${text}</i>`;
const li = (text: string) => `• ${text}`;

let running = true;

export async function startSchedulerService(): Promise<{ kill: () => void }> {
  console.log(`📋 [Scheduler Service] 启动中...`);

  // 立即执行一次扫描
  await scanAndExecute();

  // 每分钟扫描一次
  const interval = setInterval(async () => {
    if (running) {
      await scanAndExecute();
    }
  }, 60000);

  console.log(`✅ [Scheduler Service] 已启动 (每分钟扫描)`);

  return {
    kill: () => {
      clearInterval(interval);
      running = false;
      console.log(`📋 [Scheduler Service] 已停止`);
    },
  };
}

async function scanAndExecute() {
  const db = getDatabase();
  const paths = getPaths(db);

  // 查询 pending 任务
  const pendingTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    LIMIT 10
  `).all() as any[];

  if (pendingTasks.length === 0) {
    return;
  }

  console.log(`📋 [Scheduler] 发现 ${pendingTasks.length} 个待执行任务`);

  for (const task of pendingTasks) {
    if (!running) break;

    try {
      await executeTask(task, paths);
    } catch (error: any) {
      console.error(`❌ [Scheduler] 任务 ${task.id} 执行失败:`, error.message);

      // 标记失败
      db.prepare(`
        UPDATE tasks SET status = 'failed', last_error = ? WHERE id = ?
      `).run(error.message, task.id);
    }
  }
}

async function executeTask(task: any, paths: any): Promise<void> {
  console.log(`\n📋 [Scheduler] 开始执行任务: ${task.id}`);
  console.log(`   描述: ${task.description}`);

  if (!task.assigned_to) {
    console.log(`   ⚠️  未分配员工，跳过执行`);
    return;
  }

  const workDir = task.work_dir || paths.getOutputsPath(`tasks/${task.id}`);
  prepareWorkDir(workDir, { taskId: task.id, description: task.description });

  const db = getDatabase();
  db.updateTaskStatus(task.id, 'executing');

  console.log(`   👤 使用 TaskExecutor (assigned_to: ${task.assigned_to})`);
  const executor = new TaskExecutor(db);
  const execResult = await executor.execute(task.id, task.assigned_to);
  const status = execResult.success ? 'completed' : 'failed';
  const summary = execResult.success ? '' : execResult.error || '执行失败';
  const result = {
    status,
    stepsCompleted: execResult.success ? 1 : 0,
    stepsTotal: 1,
    outputs: [],
    summary,
    report: execResult.output || summary,
  };

  const quality = execResult.completionPercentage ?? null;

  // 4. 记录执行结果
  console.log(`   📊 执行结果: ${result.status} (${result.stepsCompleted}/${result.stepsTotal} 步骤)`);

  // 5. 更新状态与产出
  const finalStatus = result.status === 'completed' ? 'completed' : result.status === 'failed' ? 'failed' : 'partial';
  const artifactsJson = result.outputs && result.outputs.length > 0 ? JSON.stringify(result.outputs) : null;
  const outputText = result.report || result.summary || null;
  const lastError = result.status === 'failed' ? result.summary : null;
  const resultSignal = result.status === 'completed'
    ? '[[PASSED]]'
    : result.status === 'failed'
      ? '[[FAILED]]'
      : '[[PARTIAL]]';

  db.prepare(`
    UPDATE tasks SET
      status = ?, completed_at = ?, last_error = ?, output = ?, artifacts_json = ?, result_signal = ?, quality = ?
    WHERE id = ?
  `).run(finalStatus, Date.now(), lastError, outputText, artifactsJson, resultSignal, quality, task.id);

  console.log(`   ✅ 任务 ${task.id} 完成 (${finalStatus})\n`);

  // 6. 通知 Telegram 用户
  if (task.context?.telegramChatId) {
    await notifyTelegramUser(task, result, db);
  }
}

/**
 * 通知 Telegram 用户任务完成
 */
async function notifyTelegramUser(task: any, result: any, db: any): Promise<void> {
  try {
    const { getConfigService } = await import('../../infrastructure/config/ConfigService.js');
    const config = getConfigService(db);

    const botToken = config.get('telegram.bot_token') as string | undefined;
    const enabled = config.get('telegram.enabled') as boolean | undefined;

    if (!botToken || !enabled) {
      console.log(`   📱 [Scheduler] Telegram 未配置，跳过通知`);
      return;
    }

    // 动态导入 node-telegram-bot-api
    const TelegramBot = (await import('node-telegram-bot-api')).default;
    const bot = new TelegramBot(botToken, { polling: false });

    const chatId = task.context.telegramChatId;
    const username = task.context.telegramUsername ? `@${task.context.telegramUsername}` : '';

    let message = h1(result.status === 'failed' ? '❌ 任务失败' : '✅ 任务完成') + '\n';
    message += bold('需求:') + '\n';
    message += pre(task.description.slice(0, 80) + (task.description.length > 80 ? '...' : '')) + '\n\n';
    message += h2('📊 执行结果') + '\n';
    message += li(`状态: ${result.status}`);
    message += li(`步骤: ${result.stepsCompleted}/${result.stepsTotal}`);
    if (result.status === 'failed' && result.summary) {
      message += '\n' + li(`原因: ${result.summary}`);
    }

    if (result.finalDeliverable) {
      message += '\n\n' + h2('📁 产物') + '\n';
      message += code(result.finalDeliverable.slice(0, 200) + (result.finalDeliverable.length > 200 ? '...' : ''));
    }

    message += '\n\n' + italic('使用 /tasks 查看详情');

    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    console.log(`   📱 [Scheduler] 已通知 ${username} (chatId: ${chatId})`);
  } catch (error: any) {
    console.error(`   ❌ [Scheduler] Telegram 通知失败:`, error.message);
  }
}

function stopSchedulerService() {
  running = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
