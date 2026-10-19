/**
 * AI Company v2 - Server Command
 *
 * 启动后台服务：
 * - Telegram Bot 监听
 * - Cron 任务扫描和执行
 */

import { getConfigManager } from '../config/ConfigManager.js';
import { createTelegramIntegration } from '../integrations/telegram/TelegramBot.js';
import { getEventBus, getEventCollector, getCoreProcess, getResultRouter, getTaskReviewer } from '../core/events/index.js';
import { getDatabase } from '../db/Database.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Server Manager
// ============================================================================

class ServerManager {
  private eventBus = getEventBus();
  private configManager = getConfigManager();
  private db = getDatabase();
  private telegramBot: any = null;
  private cronInterval: NodeJS.Timeout | null = null;
  private running = false;

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('[Server] 服务已在运行');
      return;
    }

    const config = this.configManager.getConfig();
    const companyName = config?.companyName || 'AI Company';

    console.log('\n========================================');
    console.log(`🚀 ${companyName} - 后台服务启动`);
    console.log('========================================\n');

    this.running = true;

    // 启动事件采集器
    const eventCollector = getEventCollector();
    eventCollector.start();

    // 启动结果分发器（处理通知事件，发送回 Telegram/CLI）
    const resultRouter = getResultRouter();
    resultRouter.start();

    // 启动 CoreProcess（处理 user.input 事件）
    const coreProcess = getCoreProcess();
    coreProcess.start();

    // 启动任务复盘器
    const taskReviewer = getTaskReviewer();
    taskReviewer.start();

    // 启动 Telegram Bot（如果配置了）
    await this.startTelegramBot();

    // 启动 Cron 扫描器
    this.startCronScanner();

    console.log('\n✅ 后台服务已启动');
    console.log('📡 Telegram Bot: 监听中（如果已配置）');
    console.log('⏰ Cron 扫描: 运行中');
    console.log('🔄 事件处理: 运行中');
    console.log('\n按 Ctrl+C 停止服务\n');

    // 发出服务启动事件
    this.eventBus.emit({
      type: 'server.started',
      timestamp: Date.now(),
    } as any);
  }

  /**
   * 启动 Telegram Bot
   */
  private async startTelegramBot(): Promise<void> {
    try {
      const bot = await createTelegramIntegration();
      if (bot) {
        this.telegramBot = bot;
        await bot.start();

        const botInfo = await bot.getBotInfo();
        console.log('[Server] ✅ Telegram Bot 已启动');
        console.log(`[Server]    机器人: @${botInfo.username}`);
      } else {
        console.log('[Server] ⚠️  Telegram Bot 未配置或无效，跳过启动');
        console.log('[Server]    配置方法: ai-company telegram:setup <token>');
      }
    } catch (error: any) {
      console.log('[Server] ⚠️  Telegram Bot 启动失败，跳过');
      console.log('[Server]    配置方法: ai-company telegram:setup <token>');
    }
  }

  /**
   * 启动 Cron 扫描器
   */
  private startCronScanner(): void {
    console.log('[Server] ⏰ 启动 Cron 扫描器（每分钟检查一次）');

    this.cronInterval = setInterval(() => {
      this.scanCronJobs();
    }, 60 * 1000); // 每分钟检查一次

    // 立即执行一次扫描
    this.scanCronJobs();
  }

  /**
   * 扫描并执行 Cron 任务
   */
  private scanCronJobs(): void {
    try {
      const now = new Date();
      const cronJobs = this.db.prepare(`
        SELECT * FROM crontab
        WHERE enabled = 1
      `).all() as any[];

      for (const job of cronJobs) {
        if (this.shouldExecute(job, now)) {
          console.log(`[Server] ⏰ 执行 Cron 任务: ${job.name}`);
          this.executeCronJob(job);
        }
      }
    } catch (error: any) {
      console.error('[Server] Cron 扫描失败:', error.message);
    }
  }

  /**
   * 检查任务是否应该执行
   */
  private shouldExecute(job: any, now: Date): boolean {
    // 简化实现：检查 next_run 时间
    if (!job.next_run) return true;

    const nextRun = new Date(job.next_run);
    return now >= nextRun;
  }

  /**
   * 执行 Cron 任务
   */
  private async executeCronJob(job: any): Promise<void> {
    const startTime = Date.now();
    let executionId: string | null = null;

    try {
      // 创建执行记录
      executionId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      this.db.prepare(`
        INSERT INTO cron_executions (id, cron_id, started_at)
        VALUES (?, ?, ?)
      `).run(executionId, job.id, startTime);

      console.log(`[Server] ⏰ 执行 Cron 任务: ${job.name} (${executionId})`);

      // 解析命令参数
      const args = job.args_json ? JSON.parse(job.args_json) : {};

      // 根据命令类型执行
      let output = '';
      let error = null;
      let exitCode = 0;

      switch (job.command) {
        case 'ai.run':
        case 'run':
          // 通过 EventBus 发送用户输入事件，走正常的事件驱动流程
          const userInput = args.prompt || args.message || args.input || '';
          if (userInput) {
            console.log(`[Server] 通过事件驱动执行: ${userInput.substring(0, 50)}...`);

            // 发出用户输入事件
            this.eventBus.emit({
              type: 'user.input',
              source: 'cron',
              content: userInput,
              userId: 'cron',
              metadata: {
                cronJobId: job.id,
                cronJobName: job.name,
                executionId,
              },
              timestamp: Date.now(),
            } as any);

            output = `通过事件驱动处理: ${userInput}`;
          } else {
            throw new Error('run 命令需要 prompt 或 message 参数');
          }
          break;

        case 'shell':
        case 'exec':
          // 执行 shell 命令
          const command = args.command || args.cmd;
          if (command) {
            console.log(`[Server] 执行 shell 命令: ${command}`);
            output = await this.executeShellCommand(command, job.working_dir, job.env_json);
          } else {
            throw new Error('shell 命令需要 command 参数');
          }
          break;

        case 'script':
          // 执行脚本文件
          const scriptPath = args.script || args.path;
          if (scriptPath) {
            console.log(`[Server] 执行脚本: ${scriptPath}`);
            output = await this.executeScript(scriptPath, args, job.working_dir, job.env_json);
          } else {
            throw new Error('script 命令需要 script 或 path 参数');
          }
          break;

        case 'http.request':
        case 'http':
          // 发送 HTTP 请求
          const url = args.url;
          if (url) {
            console.log(`[Server] 发送 HTTP 请求: ${url}`);
            output = await this.executeHttpRequest(url, args);
          } else {
            throw new Error('http 命令需要 url 参数');
          }
          break;

        case 'ai.task':
        case 'task.create':
          // 创建任务
          const description = args.description || args.task;
          if (description) {
            console.log(`[Server] 创建任务: ${description.substring(0, 50)}...`);
            output = await this.createTask(description, args);
          } else {
            throw new Error('task.create 命令需要 description 参数');
          }
          break;

        default:
          throw new Error(`未知命令类型: ${job.command}`);
      }

      // 计算执行时间
      const duration = Date.now() - startTime;
      const isTimeout = duration > (job.timeout || 300000);

      // 更新执行记录
      this.db.prepare(`
        UPDATE cron_executions
        SET completed_at = ?,
            exit_code = ?,
            output = ?,
            timeout = ?
        WHERE id = ?
      `).run(Date.now(), exitCode, output?.substring(0, 10000) || null, isTimeout ? 1 : 0, executionId);

      // 更新 cron 任务状态
      this.db.prepare(`
        UPDATE crontab
        SET last_run = ?,
            run_count = run_count + 1,
            last_output = ?,
            updated_at = ?
        WHERE id = ?
      `).run(startTime, output?.substring(0, 1000) || null, Date.now(), job.id);

      // 计算下次运行时间
      this.db.updateCronNextRun(job.id, job.cron_rule);

      // 发出时间触发事件
      this.eventBus.emit({
        type: 'time.triggered',
        triggerType: 'cron',
        data: {
          cronJob: job,
          executionId,
          output,
          duration,
        },
        timestamp: Date.now(),
      } as any);

      console.log(`[Server] ✅ Cron 任务完成: ${job.name} (${duration}ms)`);

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[Server] ❌ 执行 Cron 任务失败: ${job.name}`, error.message);

      // 更新执行记录
      if (executionId) {
        this.db.prepare(`
          UPDATE cron_executions
          SET completed_at = ?,
              exit_code = 1,
              error = ?
          WHERE id = ?
        `).run(Date.now(), error.message, executionId);
      }

      // 更新失败计数
      this.db.prepare(`
        UPDATE crontab
        SET fail_count = fail_count + 1,
            last_error = ?,
            updated_at = ?
        WHERE id = ?
      `).run(error.message, Date.now(), job.id);

      // 记录活动日志
      this.db.logActivity({
        eventType: 'cron.execution_failed',
        actor: 'server',
        action: 'execute_cron_job',
        context: {
          cronJobId: job.id,
          cronJobName: job.name,
          executionId,
          duration,
        },
        result: {
          error: error.message,
        },
      });
    }
  }

  /**
   * 执行 shell 命令
   */
  private async executeShellCommand(
    command: string,
    workingDir?: string,
    envJson?: string
  ): Promise<string> {
    const { exec } = await import('child_process');
    const path = await import('path');

    return new Promise((resolve, reject) => {
      const options: any = {
        cwd: workingDir || process.cwd(),
        env: { ...process.env },
        timeout: 300000, // 5 分钟超时
        maxBuffer: 10 * 1024 * 1024, // 10MB 缓冲
      };

      // 添加自定义环境变量
      if (envJson) {
        try {
          const customEnv = JSON.parse(envJson);
          options.env = { ...options.env, ...customEnv };
        } catch (e) {
          console.warn('[Server] 解析 env_json 失败:', e);
        }
      }

      exec(command, options, (error: any, stdout: string, stderr: string) => {
        if (error) {
          reject(new Error(`命令执行失败: ${error.message}\n${stderr}`));
        } else {
          resolve(stdout || stderr);
        }
      });
    });
  }

  /**
   * 执行脚本文件
   */
  private async executeScript(
    scriptPath: string,
    args: Record<string, any>,
    workingDir?: string,
    envJson?: string
  ): Promise<string> {
    const { spawn } = await import('child_process');
    const path = await import('path');
    const fs = await import('fs');

    // 解析脚本路径
    const fullPath = path.isAbsolute(scriptPath)
      ? scriptPath
      : path.resolve(workingDir || process.cwd(), scriptPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`脚本文件不存在: ${fullPath}`);
    }

    // 检查是否可执行
    try {
      fs.accessSync(fullPath, fs.constants.X_OK);
    } catch {
      throw new Error(`脚本文件不可执行: ${fullPath}`);
    }

    return new Promise((resolve, reject) => {
      const env = { ...process.env };
      if (envJson) {
        try {
          const customEnv = JSON.parse(envJson);
          Object.assign(env, customEnv);
        } catch (e) {
          console.warn('[Server] 解析 env_json 失败:', e);
        }
      }

      const proc = spawn(fullPath, [], {
        cwd: workingDir || process.cwd(),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number) => {
        if (code === 0) {
          resolve(stdout || stderr);
        } else {
          reject(new Error(`脚本退出码: ${code}\n${stderr}`));
        }
      });

      proc.on('error', (err: Error) => {
        reject(new Error(`启动脚本失败: ${err.message}`));
      });

      // 超时保护
      setTimeout(() => {
        proc.kill();
        reject(new Error('脚本执行超时'));
      }, 300000);
    });
  }

  /**
   * 执行 HTTP 请求（带超时）
   */
  private async executeHttpRequest(
    url: string,
    args: Record<string, any>
  ): Promise<string> {
    const method = (args.method || 'GET').toUpperCase();
    const headers = args.headers || {};
    const body = args.body ? JSON.stringify(args.body) : undefined;
    const timeout = args.timeout || 300000; // 默认 5 分钟超时

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      try {
        const json = JSON.parse(text);
        return JSON.stringify(json, null, 2);
      } catch {
        return text;
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`HTTP 请求超时 (${timeout}ms)`);
      }
      throw error;
    }
  }

  /**
   * 创建任务
   */
  private async createTask(
    description: string,
    args: Record<string, any>
  ): Promise<string> {
    const taskId = this.db.prepare('SELECT LOWER(HEX(RANDOMBLOB(16))) as id').get() as any;
    const finalId = `${taskId.id.substring(0, 8)}-${Date.now()}`;

    this.db.createTask({
      id: finalId,
      type: args.type || 'general',
      description,
      priority: args.priority || 'medium',
      goalId: args.goalId,
      requestedBy: 'cron',
    });

    // 发出任务创建事件
    this.eventBus.emit({
      type: 'task.created',
      taskId: finalId,
      timestamp: Date.now(),
    } as any);

    return `任务已创建: ${finalId}`;
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.log('\n[Server] 正在停止后台服务...');

    // 停止 Cron 扫描器
    if (this.cronInterval) {
      clearInterval(this.cronInterval);
      this.cronInterval = null;
    }

    // 停止 Telegram Bot
    if (this.telegramBot) {
      await this.telegramBot.stop();
      this.telegramBot = null;
    }

    this.running = false;

    // 发出服务停止事件
    this.eventBus.emit({
      type: 'server.stopped',
      timestamp: Date.now(),
    } as any);

    console.log('[Server] ✅ 后台服务已停止');
  }

  /**
   * 获取服务状态
   */
  getStatus(): { running: boolean; telegram: boolean; cron: boolean } {
    return {
      running: this.running,
      telegram: !!this.telegramBot,
      cron: !!this.cronInterval,
    };
  }
}

// ============================================================================
// 单例
// ============================================================================

let serverManager: ServerManager | null = null;

export function getServerManager(): ServerManager {
  if (!serverManager) {
    serverManager = new ServerManager();
  }
  return serverManager;
}
