/**
 * AI Company - Gateway
 *
 * 大门：接收输入、调度任务、执行定时、监控重启
 */

import { startInputService } from './InputService.js';
import { startSchedulerService } from './SchedulerService.js';
import { startCronService } from './CronService.js';

export async function startGateway() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                  🚪 AI Company Gateway v1.0                     ║
║                                                                ║
║  三大服务:                                                     ║
║  📥 Input Service   - 监听 Telegram/CLI 输入                      ║
║  📋 Scheduler       - 调度 pending 任务执行                      ║
║  ⏰ Cron Service     - 执行定时脚本                              ║
║                                                                ║
║  自愈机制:                                                     ║
║  • 异常自动重启                                                 ║
║  • 定期重启（防内存泄漏）                                       ║
║  • 异常 Telegram 通知                                          ║
╚════════════════════════════════════════════════════════════╝
`);

  const services = new Map<string, ServiceProcess>();

  // 启动三大服务
  services.set('input', await startService('Input Service', startInputService));
  services.set('scheduler', await startService('Scheduler Service', startSchedulerService));
  services.set('cron', await startService('Cron Service', startCronService));

  console.log(`\n✅ Gateway 已启动，所有服务运行中...\n`);

  // 监控服务状态
  monitorServices(services);
}

interface ServiceProcess {
  name: string;
  process: any;
  restartCount: number;
  lastRestart: number;
  lastPeriodicRestart: number;
}

interface ServiceOptions {
  name: string;
  start: () => Promise<any>;
  intervalMs?: number;  // 定期重启间隔
}

async function startService(name: string, startFn: () => Promise<any>): Promise<ServiceProcess> {
  try {
    const process = await startFn();
    return {
      name,
      process,
      restartCount: 0,
      lastRestart: Date.now(),
      lastPeriodicRestart: Date.now(),
    };
  } catch (error) {
    console.error(`❌ ${name} 启动失败:`, error);
    throw error;
  }
}

async function monitorServices(services: Map<string, ServiceProcess>) {
  const RESTART_DELAY = 5000;  // 异常重启延迟
  const PERIODIC_RESTART_INTERVAL = 2 * 60 * 60 * 1000;  // 2小时定期重启
  const MONITOR_INTERVAL = 30000;  // 30秒检查一次

  setInterval(async () => {
    const now = Date.now();

    for (const [key, service] of services) {
      // 1. 检查进程是否存活
      const isAlive = isProcessAlive(service.process);

      if (!isAlive) {
        // 2. 异常重启
        await handleServiceCrash(service, services);
      } else {
        // 3. 定期重启（防内存泄漏）
        if (now - service.lastPeriodicRestart > PERIODIC_RESTART_INTERVAL) {
          await periodicRestart(service, services);
        }
      }
    }
  }, MONITOR_INTERVAL);
}

function isProcessAlive(process: any): boolean {
  if (!process) return false;

  // 检查是否是真正的子进程
  if (typeof process.exitCode === 'number') {
    // 子进程：exitCode === null 表示还在运行
    return process.exitCode === null && !process.killed;
  }

  // 普通对象（有 kill 方法）：假设存活
  // 服务会在内部通过 running 标志控制生命周期
  return typeof process.kill === 'function';
}

async function handleServiceCrash(service: ServiceProcess, services: Map<string, ServiceProcess>) {
  const { name, restartCount } = service;

  console.error(`⚠️  [${name}] 进程意外退出，尝试重启...`);

  // 发送 Telegram 通知
  await sendTelegramAlert(`⚠️ Gateway Alert

服务: ${name}
事件: 进程意外退出
重启次数: ${restartCount + 1}
时间: ${new Date().toISOString()}`);

  // 等待后重启
  await sleep(5000);

  try {
    let newProcess;
    if (name === 'Input Service') {
      newProcess = await startInputService();
    } else if (name === 'Scheduler Service') {
      newProcess = await startSchedulerService();
    } else if (name === 'Cron Service') {
      newProcess = await startCronService();
    }

    service.process = newProcess;
    service.lastRestart = Date.now();
    service.restartCount++;

    console.log(`✅ [${name}] 重启成功`);
  } catch (error) {
    console.error(`❌ [${name}] 重启失败:`, error);
    await sendTelegramAlert(`🚨 Gateway Critical Error

服务: ${name}
事件: 重启失败
错误: ${error}`);
  }
}

async function periodicRestart(service: ServiceProcess, services: Map<string, ServiceProcess>) {
  const { name, process } = service;

  console.log(`🔄 [${name}] 定期重启（防内存泄漏）...`);

  try {
    // 优雅关闭
    if (process && typeof process.kill === 'function') {
      process.kill('SIGTERM');
    }

    await sleep(3000);

    // 重新启动
    let newProcess;
    if (name === 'Input Service') {
      newProcess = await startInputService();
    } else if (name === 'Scheduler Service') {
      newProcess = await startSchedulerService();
    } else if (name === 'Cron Service') {
      newProcess = await startCronService();
    }

    service.process = newProcess;
    service.lastPeriodicRestart = Date.now();

    console.log(`✅ [${name}] 定期重启完成`);
  } catch (error) {
    console.error(`❌ [${name}] 定期重启失败:`, error);
  }
}

async function sendTelegramAlert(message: string) {
  // TODO: 发送 Telegram 通知
  // 复用现有的 TelegramBot 集成
  console.log(`📱 Telegram Alert: ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// 入口点 - 当直接运行此文件时启动 Gateway
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  // 强制刷新 stdout/stderr
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: any[]) => {
    originalLog(...args);
    // 强制刷新
    if (process.stdout.write !== undefined) {
      process.stdout.write('\n');
    }
  };

  console.error = (...args: any[]) => {
    originalError(...args);
    // 强制刷新
    if (process.stderr.write !== undefined) {
      process.stderr.write('\n');
    }
  };

  // 立即输出启动标记
  originalLog('=== GATEWAY STARTING ===');

  startGateway().catch(error => {
    console.error('❌ Gateway 启动失败:', error);
    process.exit(1);
  });
}
