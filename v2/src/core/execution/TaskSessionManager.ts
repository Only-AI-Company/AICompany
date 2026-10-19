/**
 * AI Company v2 - Task Session Manager
 *
 * 核心理念：
 * - 每个 Task 有独立的 Claude CLI Session
 * - Task 完成/失败后 Session 自动清理
 * - 支持并行任务（各自独立 Session）
 * - Session 状态与 Task 状态同步
 */

import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import type { AgentTask, AgentTaskResult } from '../agents/types.js';
import { getEventBus } from '../events/EventBus.js';
import { getDatabase } from '../../db/Database.js';

// ============================================================================
// 类型定义
// ============================================================================

export interface TaskSessionOptions {
  /** Claude CLI 可执行文件路径 */
  cliPath?: string;
  /** 项目根目录 */
  projectRoot?: string;
  /** Session 持久化目录 */
  sessionDir?: string | null;
  /** 空闲超时（ms）- 无输出后多久认为任务可能完成 */
  idleTimeout?: number;
  /** 任务最大执行时间（ms）- 防止任务无限运行 */
  maxTaskDuration?: number;
  /** 是否在等待输入时暂停空闲检测 */
  pauseIdleOnPrompt?: boolean;
}

export interface TaskSessionOutput {
  /** 原始输出 */
  raw: string;
  /** 清理后的输出 */
  cleaned: string;
  /** 是否完成 */
  complete: boolean;
  /** 时间戳 */
  timestamp: number;
}

export interface TaskSessionState {
  taskId: string;
  sessionId: string;
  status: 'starting' | 'running' | 'idle' | 'stopping' | 'stopped' | 'error';
  startTime: number;
  endTime?: number;
  outputCount: number;
  lastOutput?: string;
}

// ============================================================================
// 工具函数
// ============================================================================

const stripAnsi = (str: string): string => {
  const pattern = [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))'
  ].join('|');
  const regex = new RegExp(pattern, 'g');
  return str.replace(regex, '');
};

// ============================================================================
// Task Session - 单个任务的 Session
// ============================================================================

/**
 * Task Session
 *
 * 代表单个任务的 Claude CLI 会话
 * - 与 Task 一对一绑定
 * - Task 结束时自动清理
 * - 独立的上下文和输出流
 */
export class TaskSession extends EventEmitter {
  readonly taskId: string;
  readonly sessionId: string;
  readonly workspaceDir: string;

  private pty: pty.IPty | null = null;
  private options: Required<TaskSessionOptions>;
  private outputBuffer: string = '';
  private isRunning: boolean = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private resolvePromise: ((result: AgentTaskResult) => void) | null = null;
  private rejectPromise: ((error: Error) => void) | null = null;
  private taskStartTime: number = 0;

  // 输出历史（用于构建结果）
  private outputHistory: TaskSessionOutput[] = [];

  // 异常恢复相关
  private restartAttempts: number = 0;
  private readonly MAX_RESTART_ATTEMPTS: number = 2;

  // PTY 劫持相关
  private eventBus = getEventBus();
  private pendingDecision: {
    decisionId: string;
    promptType: 'Y_n' | 'enter' | 'other';
    context: string;
    timestamp: number;
    retryCount: number;
  } | null = null;
  private decisionUnsubscribe: (() => void) | null = null;
  private decisionTimeout: NodeJS.Timeout | null = null;
  private readonly MAX_DECISION_RETRIES = 3; // 最大决策重试次数
  private readonly DECISION_RETRY_DELAY = 30000; // 30 秒重试延迟

  constructor(
    taskId: string,
    workspaceDir: string,
    options: TaskSessionOptions = {}
  ) {
    super();

    this.taskId = taskId;
    this.sessionId = `task-${taskId}-${Date.now()}`;
    this.workspaceDir = workspaceDir;

    this.options = {
      cliPath: options.cliPath || 'claude',
      projectRoot: options.projectRoot || process.cwd(),
      sessionDir: options.sessionDir || null,
      idleTimeout: options.idleTimeout || 30000, // 默认 30 秒空闲超时
      maxTaskDuration: options.maxTaskDuration || 30 * 60 * 1000, // 默认最大 30 分钟
      pauseIdleOnPrompt: options.pauseIdleOnPrompt ?? true, // 默认等待输入时暂停空闲检测
    };

    console.log(`[TaskSession] Created: ${this.sessionId} for task ${taskId}`);
    console.log(`[TaskSession] Config: idleTimeout=${this.options.idleTimeout}ms, maxTaskDuration=${this.options.maxTaskDuration}ms`);
  }

  // ---------------------------------------------------------------------------
  // 生命周期
  // ---------------------------------------------------------------------------

  /**
   * 启动 Session
   */
  async start(): Promise<void> {
    if (this.pty) {
      console.log(`[TaskSession] Already started: ${this.sessionId}`);
      return;
    }

    // 确保工作目录存在
    if (!fs.existsSync(this.workspaceDir)) {
      fs.mkdirSync(this.workspaceDir, { recursive: true });
    }

    try {
      console.log(`[TaskSession] Spawning PTY: ${this.options.cliPath} in ${this.workspaceDir}`);

      // 启动 PTY
      // 过滤掉 CLAUDECODE 环境变量，避免被 Claude CLI 检测为嵌套会话而拒绝运行
      const ptyEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (key !== 'CLAUDECODE' && value !== undefined) {
          ptyEnv[key] = value;
        }
      }
      ptyEnv.CLAUDE_TASK_SESSION = this.taskId;

      this.pty = pty.spawn(this.options.cliPath, [], {
        name: 'xterm-256color',
        cols: 100,
        rows: 30,
        cwd: this.workspaceDir,
        env: ptyEnv as any,
      });

      console.log(`[TaskSession] PTY spawned: ${this.sessionId} (PID: ${(this.pty as any).pid})`);

      // 监听数据
      this.pty.onData((data) => this.handleData(data));

      // 监听退出
      this.pty.onExit(({ exitCode }) => {
        console.log(`[TaskSession] Exited: ${this.sessionId} with code ${exitCode}`);
        this.handleExit(exitCode);
      });

      this.isRunning = true;
      this.emit('started', { sessionId: this.sessionId, taskId: this.taskId });

      // 持久化初始状态（非阻塞）
      this.persistState().catch(e => {
        console.error(`[TaskSession] 持久化失败: ${e.message}`);
      });

      // 启动定期心跳
      this.startHeartbeat();

      console.log(`[TaskSession] Started: ${this.sessionId}`);

      // 等待一小段时间确保 PTY 初始化完成
      await this.sleep(100);
    } catch (error: any) {
      console.error(`[TaskSession] ❌ PTY spawn failed: ${error.message}`);
      console.error(`[TaskSession] Stack: ${error.stack}`);
      this.isRunning = false;
      this.pty = null;
      throw error;
    }
  }

  /**
   * 启动定期心跳
   */
  private startHeartbeat(): void {
    // 每 30 秒更新一次心跳
    const heartbeatInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(heartbeatInterval);
        return;
      }
      await this.updateHeartbeat();
    }, 30000);
  }

  /**
   * 停止 Session
   *
   * 改进版本：确保 PTY 进程完全终止，避免僵尸进程
   * - 使用进程组终止（如果支持）
   * - 递归终止所有子进程
   * - 验证进程终止状态
   */
  stop(): void {
    if (!this.pty) return;

    console.log(`[TaskSession] Stopping: ${this.sessionId}`);

    const pty = this.pty; // 保存引用
    const pid = (pty as any).pid;
    let forceKilled = false;
    let checkInterval: NodeJS.Timeout | null = null;

    // 1. 发送 Ctrl+C 优雅退出
    try {
      pty.write('\x03'); // Ctrl+C
    } catch (e) {
      // PTY 可能已关闭，忽略错误
    }

    // 2. 延迟后检查进程是否仍在运行
    checkInterval = setInterval(async () => {
      try {
        if (pid && !forceKilled) {
          // 检查进程是否仍在运行
          const isRunning = await this.isProcessRunning(pid);

          if (isRunning) {
            // 尝试发送 SIGTERM 到进程组（如果可用）
            try {
              // Unix 系统：尝试向进程组发送信号
              if (process.platform !== 'win32') {
                // 获取进程组 ID (负 PID 表示进程组)
                process.kill(-pid, 'SIGTERM');
                console.log(`[TaskSession] Sent SIGTERM to process group: ${pid}`);
              } else {
                process.kill(pid, 'SIGTERM');
              }
            } catch (e: any) {
              if (e.code === 'ESRCH') {
                // 进程不存在，可能已终止
                console.log(`[TaskSession] Process ${pid} already terminated`);
              } else {
                // 其他错误，尝试单个进程终止
                try {
                  process.kill(pid, 'SIGTERM');
                } catch (e2) {
                  // 忽略错误
                }
              }
            }
          }
        }
      } catch (e) {
        // 忽略错误
      }
    }, 200);

    // 3. 超时后强制终止所有子进程
    const forceKillTimer = setTimeout(async () => {
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }

      if (this.pty === pty) { // 检查 PTY 是否未被新实例替换
        if (pid) {
          // 递归终止所有子进程
          await this.killProcessTree(pid, 'SIGKILL');
          forceKilled = true;
          console.log(`[TaskSession] Force killed process tree: ${this.sessionId} (PID: ${pid})`);
        }

        // PTY 会在 kill() 后自动清理
      }
    }, 2000); // 2 秒后强制终止

    // 4. 最终清理（延迟执行，确保信号传递完成）
    setTimeout(() => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
      clearTimeout(forceKillTimer);
      this.cleanup();
    }, 3000); // 3 秒后完成清理
  }

  /**
   * 立即强制终止（同步版本）
   *
   * 用于紧急情况或进程泄漏时的强制清理
   * 不等待优雅退出，直接发送 SIGKILL
   */
  async forceKillNow(): Promise<void> {
    if (!this.pty) return;

    console.log(`[TaskSession] 🔴 Force killing NOW: ${this.sessionId}`);

    const pty = this.pty;
    const pid = (pty as any).pid;

    try {
      // 立即终止进程树
      if (pid) {
        await this.killProcessTree(pid, 'SIGKILL');
      }

      // 销毁 PTY
      pty.kill();

      console.log(`[TaskSession] Force killed: ${this.sessionId} (PID: ${pid})`);
    } catch (e: any) {
      console.error(`[TaskSession] Force kill error: ${e.message}`);
    } finally {
      // 确保清理
      this.cleanup();
    }
  }

  /**
   * 检查进程是否仍在运行
   */
  private async isProcessRunning(pid: number): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        // Windows: 使用 tasklist 命令
        const { exec } = await import('child_process');
        return new Promise((resolve) => {
          exec(`tasklist /FI "PID eq ${pid}"`, (error: any, stdout: string) => {
            resolve(!error && stdout.includes(pid.toString()));
          });
        });
      } else {
        // Unix: 使用 kill(pid, 0) 检查进程是否存在
        process.kill(pid, 0);
        return true;
      }
    } catch (e) {
      return false;
    }
  }

  /**
   * 递归终止进程树
   *
   * 终止指定进程及其所有子进程
   *
   * 改进版：
   * - 使用 pgrep 一次性获取所有子孙进程
   * - 从叶子节点开始终止
   * - 验证进程是否真正终止
   * - 支持重试机制
   */
  private async killProcessTree(rootPid: number, signal: 'SIGTERM' | 'SIGKILL' = 'SIGKILL'): Promise<void> {
    try {
      if (process.platform === 'win32') {
        // Windows: 使用 taskkill 命令终止进程树
        const { exec } = await import('child_process');
        return new Promise((resolve) => {
          exec(`taskkill /F /PID ${rootPid} /T`, (error: any) => {
            if (error && !error.message.includes('not found')) {
              console.warn(`[TaskSession] Windows kill process tree warning: ${error.message}`);
            }
            resolve();
          });
        });
      } else {
        // Unix: 使用 pgrep 获取所有子孙进程（包括间接子进程）
        const allPids = await this.getAllDescendantProcesses(rootPid);

        // 从最深的子进程开始终止（反向排序）
        allPids.reverse();

        // 批量终止所有进程
        for (const pid of allPids) {
          try {
            process.kill(pid, signal);
          } catch (e: any) {
            if (e.code !== 'ESRCH') {
              console.warn(`[TaskSession] Kill descendant ${pid} warning: ${e.message}`);
            }
          }
        }

        // 最后终止根进程
        try {
          process.kill(rootPid, signal);
        } catch (e: any) {
          if (e.code !== 'ESRCH') {
            console.warn(`[TaskSession] Kill root ${rootPid} warning: ${e.message}`);
          }
        }

        // 验证进程是否真正终止
        const verifyKilled = await this.verifyProcessTerminated(rootPid, 3, 100);
        if (!verifyKilled) {
          console.warn(`[TaskSession] Process ${rootPid} may still be running after kill`);
        }
      }
    } catch (e: any) {
      console.error(`[TaskSession] Kill process tree error: ${e.message}`);
    }
  }

  /**
   * 获取进程的所有子孙进程 PID（包括间接子进程）
   *
   * 使用 pgrep -P 递归获取所有子孙进程
   */
  private async getAllDescendantProcesses(parentPid: number): Promise<number[]> {
    const allPids: number[] = [];
    const visited = new Set<number>();

    const collectPids = async (pid: number): Promise<void> => {
      if (visited.has(pid)) return;
      visited.add(pid);

      const childPids = await this.getChildProcesses(pid);
      for (const childPid of childPids) {
        await collectPids(childPid); // 递归获取子孙进程
        allPids.push(childPid);
      }
    };

    await collectPids(parentPid);
    return allPids;
  }

  /**
   * 验证进程是否已终止
   *
   * @param pid 进程 ID
   * @param attempts 尝试次数
   * @param delay 每次尝试间隔（ms）
   * @returns 进程是否已终止
   */
  private async verifyProcessTerminated(pid: number, attempts: number = 3, delay: number = 100): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      try {
        process.kill(pid, 0);
        // 进程仍存在，等待后重试
        await this.sleep(delay);
      } catch (e: any) {
        if (e.code === 'ESRCH') {
          return true; // 进程已终止
        }
      }
    }
    return false; // 进程仍然存在
  }

  /**
   * 获取进程的所有子进程 PID（Unix 系统）
   */
  private async getChildProcesses(parentPid: number): Promise<number[]> {
    try {
      const { exec } = await import('child_process');
      return new Promise((resolve) => {
        // 使用 pgrep 或 ps 命令查找子进程
        const command = `ps -o pid= -P ${parentPid} 2>/dev/null || pgrep -P ${parentPid} 2>/dev/null || echo ""`;

        exec(command, (error: any, stdout: string) => {
          if (error) {
            resolve([]);
            return;
          }

          const pids = stdout
            .trim()
            .split('\n')
            .map(line => parseInt(line.trim()))
            .filter(pid => !isNaN(pid));

          resolve(pids);
        });
      });
    } catch (e) {
      return [];
    }
  }

  /**
   * 检查 Session 是否存活
   */
  isAlive(): boolean {
    return this.isRunning && this.pty !== null;
  }

  // ---------------------------------------------------------------------------
  // 任务执行
  // ---------------------------------------------------------------------------

  /**
   * 执行任务
   *
   * @param prompt 发送给 Claude 的提示词
   * @returns Promise<AgentTaskResult>
   */
  async execute(prompt: string): Promise<AgentTaskResult> {
    if (!this.pty || !this.isRunning) {
      const error = `Session not running: ${this.sessionId} (pty=${!!this.pty}, isRunning=${this.isRunning})`;
      console.error(`[TaskSession] ❌ ${error}`);
      return {
        taskId: this.taskId,
        success: false,
        error,
      };
    }

    const pty = this.pty; // 保存引用以避免 null 检查

    console.log(`[TaskSession] ${this.sessionId} executing task...`);
    console.log(`[TaskSession] Prompt: ${prompt.substring(0, 100)}...`);

    return new Promise((resolve, reject) => {
      // 检查是否已经有 pending promise
      if (this.resolvePromise) {
        const error = `Task already in progress for session: ${this.sessionId}`;
        console.error(`[TaskSession] ❌ ${error}`);
        resolve({
          taskId: this.taskId,
          success: false,
          error,
        });
        return;
      }

      this.resolvePromise = resolve;
      this.rejectPromise = reject;
      this.taskStartTime = Date.now();
      this.outputBuffer = '';
      this.outputHistory = [];

      // 发送提示词
      try {
        pty.write(prompt + '\r');
      } catch (e: any) {
        console.error(`[TaskSession] ❌ Failed to write to PTY: ${e.message}`);
        resolve({
          taskId: this.taskId,
          success: false,
          error: `Failed to write to PTY: ${e.message}`,
        });
        return;
      }

      // 设置任务最大执行时间超时（使用配置值）
      const maxDuration = this.options.maxTaskDuration;
      const timeoutTimer = setTimeout(() => {
        if (this.resolvePromise) {
          const duration = Date.now() - this.taskStartTime;
          console.warn(`[TaskSession] ${this.sessionId} task timeout after ${duration}ms (max: ${maxDuration}ms)`);

          // 首先结束任务，这将 resolve/reject promise
          this.finishTask({
            success: false,
            error: `Task timeout after ${Math.round(duration / 1000 / 60)} minutes (max: ${Math.round(maxDuration / 1000 / 60)} minutes)`,
          });

          // 然后强制停止 PTY 会话，确保进程被终止
          console.warn(`[TaskSession] ${this.sessionId} forcefully stopping due to timeout`);
          this.stop();
        }
      }, maxDuration);

      // 任务完成时清理超时计时器
      const originalResolve = this.resolvePromise;
      this.resolvePromise = (result) => {
        clearTimeout(timeoutTimer);
        if (originalResolve) {
          originalResolve(result);
        }
      };

      const originalReject = this.rejectPromise;
      this.rejectPromise = (error) => {
        clearTimeout(timeoutTimer);
        if (originalReject) {
          originalReject(error);
        }
      };
    });
  }

  /**
   * 追加消息到当前会话
   * 用于多轮交互
   */
  append(message: string): void {
    if (this.pty && this.isRunning) {
      this.pty.write(message + '\r');
    }
  }

  // ---------------------------------------------------------------------------
  // 私有方法
  // ---------------------------------------------------------------------------

  private handleData(data: string): void {
    // 实时输出
    process.stdout.write(data);

    this.outputBuffer += data;

    // 记录输出
    const output: TaskSessionOutput = {
      raw: data,
      cleaned: stripAnsi(data),
      complete: false,
      timestamp: Date.now(),
    };
    this.outputHistory.push(output);
    this.emit('output', output);

    // 重置空闲计时器
    this.resetIdleTimer();

    // 检查交互提示
    this.checkForPrompts();
  }

  /**
   * 重置空闲计时器
   *
   * 如果配置了 pauseIdleOnPrompt 且当前正在等待输入，则延长超时时间
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    // 检测是否正在等待输入
    const waitingForInput = this.isWaitingForInput();

    // 如果正在等待输入且配置了暂停空闲检测，使用更长的超时时间
    const timeout = waitingForInput && this.options.pauseIdleOnPrompt
      ? this.options.idleTimeout * 3  // 等待输入时超时时间延长 3 倍
      : this.options.idleTimeout;

    this.idleTimer = setTimeout(() => {
      // 再次检查是否在等待输入（状态可能已变化）
      if (this.resolvePromise && !this.isWaitingForInput()) {
        console.log(`[TaskSession] ${this.sessionId} idle timeout (${timeout}ms), task may be complete`);
        this.finishTask({ success: true });
      } else if (this.isWaitingForInput()) {
        // 仍在等待输入，可能 CEO 响应超时
        console.warn(`[TaskSession] ${this.sessionId} still waiting for input after timeout`);
        // 不自动完成，等待 CEO 响应或手动干预
      }
    }, timeout);
  }

  /**
   * 检测是否正在等待用户输入
   *
   * 检测多种常见的输入提示模式
   */
  private isWaitingForInput(): boolean {
    const clean = stripAnsi(this.outputBuffer);
    // 检查最后 100 个字符（增加检测范围）
    const lastChars = clean.slice(-100);

    // 常见的输入提示模式
    const inputPatterns = [
      /\?\s*$/,                      // 以问号结尾
      /\(Y\/n\)/i,                   // (Y/n) 确认
      /\(yes\/no\)/i,                // (yes/no) 确认
      /Y\/n\s*:/i,                   // Y/n:
      /yes\/no\s*:/i,                // yes/no:
      /:\s*$/,                       // 以冒号结尾（可能需要输入）
      /Press Enter/i,                // Press Enter to continue
      /Press any key/i,              // Press any key to continue
      /Continue\?/i,                 // Continue?
      /Continue \[Y\/n\]/i,          // Continue [Y/n]
      /Proceed\?/i,                  // Proceed?
      /\[y\/N\]/i,                   // [y/N]
      /\[Y\/n\]/i,                   // [Y/n]
      /\[yes\/no\]/i,                // [yes/no]
      /Enter to continue/i,          // Enter to continue
      /input:/i,                     // input:
      /value:/i,                     // value:
      /choice:/i,                    // choice:
      /option:/i,                    // option:
      /select:/i,                    // select:
      /confirm:/i,                   // confirm:
      /approve:/i,                   // approve:
      /allow\?/i,                    // allow?
      /overwrite\?/i,                // overwrite?
      /delete\?/i,                   // delete?
      /replace\?/i,                  // replace?
    ];

    for (const pattern of inputPatterns) {
      if (pattern.test(lastChars)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检测并处理 PTY 中的输入提示
   *
   * 检测多种提示模式并触发决策请求
   */
  private checkForPrompts(): void {
    const clean = stripAnsi(this.outputBuffer);

    // 如果已经有待处理的决策，不再触发新的
    if (this.pendingDecision) return;

    // 检查最后 150 个字符中的提示模式
    const recentOutput = clean.slice(-150);

    // Y/n 确认类型
    if (/\(Y\/n\)|\[Y\/n\]|Y\/n\s*:/i.test(recentOutput)) {
      this.handleDecisionPrompt('Y_n', '请求确认操作 (Y/n)');
      return;
    }

    // yes/no 确认类型
    if (/\(yes\/no\)|\[yes\/no\]|yes\/no\s*:/i.test(recentOutput)) {
      this.handleDecisionPrompt('Y_n', '请求确认操作 (yes/no)');
      return;
    }

    // Press Enter / Press any key
    if (/Press (?:Enter|any key)|Enter to continue/i.test(recentOutput)) {
      this.handleDecisionPrompt('enter', '请求按键继续');
      return;
    }

    // Continue? / Proceed?
    if (/Continue\?|Proceed\?|Continue \[Y\/n\]/i.test(recentOutput)) {
      this.handleDecisionPrompt('Y_n', '请求确认是否继续');
      return;
    }

    // 危险操作确认
    const dangerousPatterns = [
      /overwrite\?/i,
      /delete\?/i,
      /replace\?/i,
      /remove\?/i,
      /confirm.*delete/i,
      /confirm.*remove/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(recentOutput)) {
        this.handleDecisionPrompt('Y_n', `危险操作确认: ${pattern.source}`);
        return;
      }
    }
  }

  /**
   * 处理决策提示 - PTY 劫持核心逻辑
   *
   * 改进版：支持决策重试机制
   */
  private handleDecisionPrompt(
    promptType: 'Y_n' | 'enter' | 'other',
    description: string
  ): void {
    const decisionId = `dec-${this.sessionId}-${Date.now()}`;
    const clean = stripAnsi(this.outputBuffer);

    // 提取上下文（提示前的内容）
    const context = clean.slice(-200);

    this.pendingDecision = {
      decisionId,
      promptType,
      context,
      timestamp: Date.now(),
      retryCount: 0, // 初始化重试计数
    };

    console.log(`[TaskSession] 🔒 PTY 劫持: ${description}`);
    console.log(`[TaskSession] 上下文: "${context.slice(-100)}..."`);

    // 发出决策请求事件
    this.eventBus.emit({
      type: 'decision.requested',
      decisionId,
      taskId: this.taskId,
      description,
      timestamp: Date.now(),
    });

    // 订阅决策事件（一次性）
    this.decisionUnsubscribe = this.eventBus.on(
      'decision.made' as any,
      (event: any) => {
        if (event.decisionId === decisionId) {
          this.injectDecision(event.decision);
        }
      }
    );

    // 设置决策超时（2 分钟）- 第一次超时
    this.decisionTimeout = setTimeout(() => {
      this.handleDecisionTimeout(decisionId, description, false);
    }, 120000); // 2 minutes
  }

  /**
   * 处理决策超时 - 使用 Fallback 策略（带重试）
   *
   * 改进版：
   * - 第一次超时：重新发出决策请求（重试）
   * - 多次超时后：使用 Fallback 决策
   * - 使用更全面的风险操作关键词库
   * - 考虑决策类型和上下文
   */
  private handleDecisionTimeout(decisionId: string, description: string, isRetry: boolean): void {
    console.warn(`[TaskSession] ⏰ 决策超时：${decisionId} (${description}) ${isRetry ? '(重试)' : ''}`);

    // 检查是否已经有决策
    if (!this.pendingDecision || this.pendingDecision.decisionId !== decisionId) {
      // 决策已经处理，无需 fallback
      return;
    }

    const retryCount = this.pendingDecision.retryCount || 0;

    // 如果还有重试机会，重新发出决策请求
    if (retryCount < this.MAX_DECISION_RETRIES) {
      // 增加重试计数
      this.pendingDecision.retryCount = retryCount + 1;

      console.log(`[TaskSession] 🔄 决策重试 ${retryCount + 1}/${this.MAX_DECISION_RETRIES}，30秒后重新发出决策请求`);

      // 清理旧的订阅
      if (this.decisionUnsubscribe) {
        this.decisionUnsubscribe();
        this.decisionUnsubscribe = null;
      }

      // 延迟后重新发出决策请求
      this.decisionTimeout = setTimeout(() => {
        if (!this.pendingDecision || this.pendingDecision.decisionId !== decisionId) {
          return; // 决策已处理
        }

        console.log(`[TaskSession] 📤 重新发出决策请求: ${decisionId}`);

        // 重新发出决策请求事件
        this.eventBus.emit({
          type: 'decision.requested',
          decisionId,
          taskId: this.taskId,
          description,
          timestamp: Date.now(),
          retryCount: this.pendingDecision.retryCount,
        } as any);

        // 重新订阅决策事件
        this.decisionUnsubscribe = this.eventBus.on(
          'decision.made' as any,
          (event: any) => {
            if (event.decisionId === decisionId) {
              this.injectDecision(event.decision);
            }
          }
        );

        // 再次设置超时（2 分钟）
        this.decisionTimeout = setTimeout(() => {
          this.handleDecisionTimeout(decisionId, description, true);
        }, 120000);
      }, this.DECISION_RETRY_DELAY);

      return;
    }

    // 重试用尽，使用 Fallback 决策
    console.warn(`[TaskSession] ⚠️ 决策重试次数已用尽 (${this.MAX_DECISION_RETRIES})，使用 Fallback 策略`);

    // Fallback 策略：使用更全面的风险操作关键词库
    const riskLevel = this.assessRiskLevel(description, this.pendingDecision.context);

    console.log(`[TaskSession] 风险评估结果：${riskLevel.level} (${riskLevel.reason})`);

    // 改进的默认策略：考虑重试历史
    // 如果是低风险或中等风险且有重试历史，倾向于继续执行
    const shouldProceed = riskLevel.level === 'low' ||
      (riskLevel.level === 'medium' && retryCount >= this.MAX_DECISION_RETRIES);

    console.log(`[TaskSession] 使用 Fallback 决策：${shouldProceed ? '继续执行' : '跳过操作'}`);

    // 注入 Fallback 决策
    this.injectDecision({
      selectedOption: shouldProceed ? 'yes' : 'no',
      reasoning: `决策超时 (${this.pendingDecision.promptType})，已重试 ${this.MAX_DECISION_RETRIES} 次。使用保守 Fallback 策略：${riskLevel.reason}`,
    });

    // 记录超时活动日志
    try {
      const db = getDatabase();
      db.logActivity({
        eventType: 'task.decision_timeout',
        actor: 'task_session',
        action: 'fallback_decision',
        context: {
          decisionId,
          taskId: this.taskId,
          description,
          riskLevel: riskLevel.level,
          retryCount: this.MAX_DECISION_RETRIES,
          selectedOption: shouldProceed ? 'yes' : 'no',
        },
        result: {
          selectedOption: shouldProceed ? 'yes' : 'no',
          reasoning: riskLevel.reason,
        },
      });
    } catch (logError) {
      console.error('[TaskSession] 记录决策超时日志失败:', logError);
    }
  }

  /**
   * 评估操作风险等级
   *
   * @param description 决策描述
   * @param context 上下文
   * @returns 风险等级和原因
   */
  private assessRiskLevel(description: string, context?: string): { level: 'low' | 'medium' | 'high'; reason: string } {
    const text = (description + ' ' + (context || '')).toLowerCase();

    // 高风险操作：删除、销毁、覆盖、终止等
    const highRiskPatterns = [
      // 中文
      /删除/i, /销毁/i, /覆盖/i, /替换/i, /清空/i, /清除/i, /抹除/i,
      /终止/i, /杀死/i, /关闭/i, /停止/i, /撤销/i,
      // 英文
      /delete/i, /destroy/i, /overwrite/i, /replace/i, /clear/i, /wipe/i, /erase/i,
      /drop/i, /truncate/i, /remove/i, /kill/i, /terminate/i, /abort/i,
      /revoke/i, /decommission/i, /nuke/i, /rm -rf/i, /rm\s+-rf/i,
      // 数据库操作
      /drop\s+table/i, /drop\s+database/i, /truncate\s+table/i,
      // 文件系统操作
      /rm\s+-rf\s+\//i, /format/i, /mkfs/i,
    ];

    // 中等风险操作：修改、更新、移动等
    const mediumRiskPatterns = [
      // 中文
      /修改/i, /更新/i, /移动/i, /重命名/i, /变更/i, /调整/i,
      // 英文
      /modify/i, /update/i, /move/i, /rename/i, /change/i, /alter/i,
      /migrate/i, /transfer/i, /shift/i,
      // 命令模式
      /mv\s+/i, /chmod/i, /chown/i, /set\s+/i, /config/i,
    ];

    // 低风险操作：查看、读取、确认继续等
    const lowRiskPatterns = [
      // 确认继续类型
      /continue\?/i, /proceed\?/i, /press enter/i, /press any key/i,
      /enter to continue/i, /确认继续/i, /是否继续/i,
      // 查看类型
      /view/i, /show/i, /list/i, /display/i, /查看/i, /显示/i,
      // 信息收集类型
      /info/i, /check/i, /verify/i, /validate/i, /scan/i,
    ];

    // 检查高风险
    for (const pattern of highRiskPatterns) {
      if (pattern.test(text)) {
        return { level: 'high', reason: `检测到高风险操作模式：${pattern.source}` };
      }
    }

    // 检查中等风险
    for (const pattern of mediumRiskPatterns) {
      if (pattern.test(text)) {
        return { level: 'medium', reason: `检测到中等风险操作模式：${pattern.source}` };
      }
    }

    // 检查低风险
    for (const pattern of lowRiskPatterns) {
      if (pattern.test(text)) {
        return { level: 'low', reason: `检测到低风险操作模式：${pattern.source}` };
      }
    }

    // 默认中等风险（未知操作）
    return { level: 'medium', reason: '未知操作类型，默认中等风险' };
  }

  /**
   * 注入 CEO 的决策到 PTY
   */
  private injectDecision(decision: { selectedOption: string; reasoning?: string }): void {
    if (!this.pendingDecision || !this.pty) {
      console.warn('[TaskSession] 注入决策时没有待处理的决策或 PTY');
      return;
    }

    console.log(`[TaskSession] 🔓 注入决策: ${decision.selectedOption}`);
    if (decision.reasoning) {
      console.log(`[TaskSession] 理由: ${decision.reasoning}`);
    }

    let input = '';

    switch (this.pendingDecision.promptType) {
      case 'Y_n':
        // Y/n 确认：根据决策发送 Y 或 n
        input = decision.selectedOption.toLowerCase().startsWith('y') ? 'Y' : 'n';
        input += '\r';
        break;

      case 'enter':
        // Enter 继续
        input = '\r';
        break;

      case 'other':
        // 其他：直接使用选中的选项
        input = decision.selectedOption + '\r';
        break;
    }

    // 写入 PTY
    this.pty.write(input);

    // 清理状态
    this.pendingDecision = null;
    if (this.decisionUnsubscribe) {
      this.decisionUnsubscribe();
      this.decisionUnsubscribe = null;
    }
    // 清除决策超时定时器
    if (this.decisionTimeout) {
      clearTimeout(this.decisionTimeout);
      this.decisionTimeout = null;
    }
  }

  private finishTask(result: Omit<AgentTaskResult, 'taskId'>): void {
    if (!this.resolvePromise) return;

    const duration = Date.now() - this.taskStartTime;
    const cleanedOutput = stripAnsi(this.outputBuffer).trim();

    const finalResult: AgentTaskResult = {
      taskId: this.taskId,
      success: result.success,
      output: result.output || cleanedOutput,
      error: result.error,
      metadata: {
        duration,
      },
    };

    console.log(`[TaskSession] ${this.sessionId} task ${result.success ? 'completed' : 'failed'} (${duration}ms)`);

    this.resolvePromise(finalResult);
    this.resolvePromise = null;
    this.rejectPromise = null;

    // 持久化最终状态并标记为结束
    this.persistState().then(() => this.markAsEnded()).catch(e => {
      console.error('[TaskSession] 持久化最终状态失败:', e);
    });

    this.emit('taskCompleted', finalResult);
  }

  private handleExit(exitCode: number): void {
    const isCrash = exitCode !== null && exitCode !== 0 && exitCode !== 130; // 130 = Ctrl+C
    const wasUnexpected = this.resolvePromise !== null; // Still has pending promise means task wasn't finished

    console.log(`[TaskSession] Exit: ${this.sessionId} code=${exitCode} crash=${isCrash} unexpected=${wasUnexpected}`);

    // 检测异常退出
    if (isCrash && wasUnexpected && this.restartAttempts < this.MAX_RESTART_ATTEMPTS) {
      this.restartAttempts++;
      console.warn(`[TaskSession] 🔧 检测到异常退出，尝试恢复 (${this.restartAttempts}/${this.MAX_RESTART_ATTEMPTS})`);

      // 记录崩溃
      try {
        const db = getDatabase();
        db.logActivity({
          eventType: 'task.session_crash',
          actor: 'task_session',
          action: 'attempting_restart',
          context: {
            sessionId: this.sessionId,
            taskId: this.taskId,
            exitCode,
            restartAttempt: this.restartAttempts,
          },
        });
      } catch (e) {
        console.error('[TaskSession] 记录崩溃日志失败:', e);
      }

      // 尝试重启 PTY 并继续任务
      this.attemptRecovery(exitCode);
      return;
    }

    // 正常退出或无法恢复
    if (this.resolvePromise) {
      // 如果任务未完成且有重启尝试，标记为部分失败
      if (isCrash && this.restartAttempts > 0) {
        this.finishTask({
          success: false,
          error: `Session crashed ${this.restartAttempts} times and couldn't recover. Exit code: ${exitCode}`,
        });
      } else {
        this.finishTask({
          success: exitCode === 0,
          error: exitCode !== 0 ? `CLI exited with code ${exitCode}` : undefined,
        });
      }
    }

    this.cleanup();
    this.emit('exited', { sessionId: this.sessionId, exitCode });
  }

  /**
   * 尝试从崩溃中恢复
   */
  private attemptRecovery(exitCode: number): void {
    const recoveryDelay = 1000 * this.restartAttempts; // 指数退避

    setTimeout(async () => {
      try {
        // 清理旧 PTY
        this.cleanup();

        // 等待一小段时间确保资源释放
        await this.sleep(100);

        // 重新启动 PTY
        await this.start();

        console.log(`[TaskSession] ✅ 恢复成功: ${this.sessionId}`);

        // 记录恢复成功
        try {
          const db = getDatabase();
          db.logActivity({
            eventType: 'task.session_recovered',
            actor: 'task_session',
            action: 'restart_success',
            context: {
              sessionId: this.sessionId,
              taskId: this.taskId,
              originalExitCode: exitCode,
              restartAttempt: this.restartAttempts,
            },
          });
        } catch (e) {
          console.error('[TaskSession] 记录恢复日志失败:', e);
        }

        // 恢复后，让上层决定是否继续任务
        // 这里我们不自动恢复任务执行，因为状态可能已损坏
        this.finishTask({
          success: false,
          error: `Session crashed but PTY was recovered (attempt ${this.restartAttempts}). Task needs to be retried at a higher level.`,
        });

      } catch (error: any) {
        console.error(`[TaskSession] ❌ 恢复失败: ${error.message}`);

        // 记录恢复失败
        try {
          const db = getDatabase();
          db.logActivity({
            eventType: 'task.session_recovery_failed',
            actor: 'task_session',
            action: 'restart_failed',
            context: {
              sessionId: this.sessionId,
              taskId: this.taskId,
              originalExitCode: exitCode,
              error: error.message,
            },
          });
        } catch (e) {
          console.error('[TaskSession] 记录恢复失败日志失败:', e);
        }

        // 恢复失败，结束任务
        if (this.resolvePromise) {
          this.finishTask({
            success: false,
            error: `Session crashed and recovery failed: ${error.message}`,
          });
        }

        this.cleanup();
      }
    }, recoveryDelay);
  }

  /**
   * 同步休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private cleanup(): void {
    // 清理 PTY 引用
    this.pty = null;
    this.isRunning = false;

    // 清理定时器
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    // 清理决策订阅
    if (this.decisionUnsubscribe) {
      this.decisionUnsubscribe();
      this.decisionUnsubscribe = null;
    }

    // 清理决策超时定时器
    if (this.decisionTimeout) {
      clearTimeout(this.decisionTimeout);
      this.decisionTimeout = null;
    }

    // 清理决策状态
    this.pendingDecision = null;

    // 清理输出历史（释放内存）
    if (this.outputHistory.length > 0) {
      this.outputHistory = [];
    }

    // 清理输出缓冲
    this.outputBuffer = '';

    // 移除所有事件监听器（防止内存泄漏）
    this.removeAllListeners();

    console.log(`[TaskSession] Cleanup complete: ${this.sessionId}`);
  }

  // ---------------------------------------------------------------------------
  // 查询方法
  // ---------------------------------------------------------------------------

  getState(): TaskSessionState {
    return {
      taskId: this.taskId,
      sessionId: this.sessionId,
      status: this.pty ? (this.resolvePromise ? 'running' : 'idle') : 'stopped',
      startTime: this.taskStartTime,
      outputCount: this.outputHistory.length,
      lastOutput: this.outputBuffer.slice(-200),
    };
  }

  getOutputHistory(): TaskSessionOutput[] {
    return [...this.outputHistory];
  }

  // ============================================================================
  // 状态持久化
  // ============================================================================

  /**
   * 保存会话状态到数据库
   */
  async persistState(): Promise<void> {
    try {
      const db = getDatabase();
      const state = this.getState();
      const pid = (this.pty as any)?.pid;

      // 准备状态 JSON
      const stateJson = JSON.stringify({
        taskId: this.taskId,
        sessionId: this.sessionId,
        status: state.status,
        startTime: state.startTime,
        outputCount: state.outputCount,
        lastOutput: state.lastOutput,
        restartAttempts: this.restartAttempts,
        pendingDecision: this.pendingDecision,
        isRunning: this.isRunning,
      });

      // 使用 UPSERT 语法
      const now = Date.now();
      db.prepare(`
        INSERT INTO task_sessions (
          id, task_id, session_id, status, workspace_dir, pid,
          start_time, end_time, output_count, last_output, last_heartbeat,
          state_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          pid = excluded.pid,
          end_time = excluded.end_time,
          output_count = excluded.output_count,
          last_output = excluded.last_output,
          last_heartbeat = excluded.last_heartbeat,
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `).run(
        this.sessionId, // id = session_id
        this.taskId,
        this.sessionId,
        state.status,
        this.workspaceDir,
        pid || null,
        state.startTime,
        state.endTime || null,
        state.outputCount,
        state.lastOutput || null,
        now, // last_heartbeat
        stateJson,
        now, // created_at (ignored on conflict)
        now  // updated_at
      );
    } catch (error: any) {
      console.error(`[TaskSession] 保存状态失败：${error.message}`);
    }
  }

  /**
   * 从数据库恢复会话状态
   */
  static async restoreState(taskId: string): Promise<{ sessionId: string; stateJson: any } | null> {
    try {
      const db = getDatabase();
      const row = db.prepare(`
        SELECT session_id, state_json FROM task_sessions
        WHERE task_id = ? AND status NOT IN ('stopped', 'error')
        ORDER BY updated_at DESC LIMIT 1
      `).get(taskId) as { session_id: string; state_json: string } | undefined;

      if (!row) {
        return null;
      }

      return {
        sessionId: row.session_id,
        stateJson: JSON.parse(row.state_json),
      };
    } catch (error: any) {
      console.error(`[TaskSession] 恢复状态失败：${error.message}`);
      return null;
    }
  }

  /**
   * 更新会话心跳
   */
  async updateHeartbeat(): Promise<void> {
    try {
      const db = getDatabase();
      db.prepare('UPDATE task_sessions SET last_heartbeat = ? WHERE session_id = ?')
        .run(Date.now(), this.sessionId);
    } catch (error: any) {
      console.error(`[TaskSession] 更新心跳失败：${error.message}`);
    }
  }

  /**
   * 标记会话结束
   */
  async markAsEnded(): Promise<void> {
    try {
      const db = getDatabase();
      const state = this.getState();
      db.prepare(`
        UPDATE task_sessions SET
          status = ?,
          end_time = ?,
          last_heartbeat = ?,
          updated_at = ?
        WHERE session_id = ?
      `).run(
        state.status === 'stopped' ? 'stopped' : 'completed',
        Date.now(),
        Date.now(),
        Date.now(),
        this.sessionId
      );
    } catch (error: any) {
      console.error(`[TaskSession] 标记结束失败：${error.message}`);
    }
  }
}

// ============================================================================
// Task Session Manager - 管理所有 Task Session
// ============================================================================

/**
 * Task Session Manager
 *
 * 管理所有任务的 Session 生命周期
 */
export class TaskSessionManager {
  private sessions = new Map<string, TaskSession>();
  private options: TaskSessionOptions;
  private workspacesRoot: string;
  private cleanupTimer?: NodeJS.Timeout;
  private readonly MAX_SESSIONS = 100; // 最大 Session 数量限制
  private readonly CLEANUP_INTERVAL = 300000; // 5 分钟清理一次
  private readonly SESSION_TIMEOUT = 3600000; // 1 小时超时
  private readonly ZOMBIE_PROCESS_CHECK_INTERVAL = 600000; // 10 分钟检查一次僵尸进程

  constructor(options: TaskSessionOptions = {}) {
    this.options = options;
    this.workspacesRoot = path.join(
      options.projectRoot || process.cwd(),
      '.task-workspaces'
    );

    // 确保工作区根目录存在
    if (!fs.existsSync(this.workspacesRoot)) {
      fs.mkdirSync(this.workspacesRoot, { recursive: true });
    }

    // 启动定期清理任务
    this.startPeriodicCleanup();

    // 首先检测并清理孤儿 PTY 进程
    this.detectAndCleanupOrphanedPTYProcesses().then(count => {
      if (count > 0) {
        console.log(`[TaskSessionManager] 启动时清理了 ${count} 个孤儿 PTY 进程`);
      }
    }).catch(e => {
      console.warn('[TaskSessionManager] 孤儿 PTY 检测失败:', e);
    });

    // 尝试恢复未完成的 Session
    this.recoverSessions();

    console.log(`[TaskSessionManager] Initialized, workspaces: ${this.workspacesRoot}`);
  }

  /**
   * 启动定期清理任务
   */
  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.periodicCleanup();
    }, this.CLEANUP_INTERVAL);

    console.log(`[TaskSessionManager] Periodic cleanup started (interval: ${this.CLEANUP_INTERVAL}ms)`);
  }

  /**
   * 从数据库恢复未完成的 Session
   */
  private async recoverSessions(): Promise<void> {
    try {
      const db = getDatabase();

      // 查找未完成的 Session（状态不是 stopped/completed）
      const incompleteSessions = db.prepare(`
        SELECT session_id, task_id, state_json, workspace_dir, pid
        FROM task_sessions
        WHERE status NOT IN ('stopped', 'completed', 'error')
          AND last_heartbeat > ?
        ORDER BY updated_at DESC
      `).all(Date.now() - this.ZOMBIE_PROCESS_CHECK_INTERVAL) as any[];

      if (incompleteSessions.length === 0) {
        console.log('[TaskSessionManager] 没有需要恢复的 Session');
        return;
      }

      console.log(`[TaskSessionManager] 发现 ${incompleteSessions.length} 个可能需要恢复的 Session`);

      for (const row of incompleteSessions) {
        // 检查进程是否仍在运行
        if (row.pid) {
          try {
            process.kill(row.pid, 0); // 检查进程是否存在
            // 进程存在，可能仍在运行，跳过恢复
            console.log(`[TaskSessionManager] Session ${row.session_id} (PID: ${row.pid}) 进程仍在运行，跳过恢复`);
            continue;
          } catch (e) {
            // 进程不存在，标记为已结束
            console.log(`[TaskSessionManager] Session ${row.session_id} (PID: ${row.pid}) 进程不存在，标记为失败`);
            db.prepare(`
              UPDATE task_sessions
              SET status = 'error', end_time = ?, updated_at = ?
              WHERE session_id = ?
            `).run(Date.now(), Date.now(), row.session_id);
            continue;
          }
        }
      }
    } catch (error: any) {
      console.error('[TaskSessionManager] 恢复 Session 失败:', error.message);
    }
  }

  /**
   * 定期清理所有僵尸 Session 和过期 Session
   */
  private periodicCleanup(): void {
    const beforeCount = this.sessions.size;
    let cleaned = 0;

    // 1. 清理内存中的 Session
    for (const [taskId, session] of this.sessions) {
      // 清理已死亡的 Session
      if (!session.isAlive()) {
        this.sessions.delete(taskId);
        cleaned++;
        continue;
      }

      // 清理超过最大运行时间的 Session
      const state = session.getState();
      const runningTime = Date.now() - (state.startTime || Date.now());
      if (runningTime > this.SESSION_TIMEOUT) {
        console.warn(`[TaskSessionManager] 清理超时 Session: ${taskId} (运行 ${Math.round(runningTime / 60000)} 分钟)`);
        session.stop();
        this.sessions.delete(taskId);
        cleaned++;
      }
    }

    // 2. 清理数据库中的僵尸进程记录
    this.cleanupDatabaseSessions();

    // 3. 检测并清理孤儿 PTY 进程（不阻塞清理流程）
    this.detectAndCleanupOrphanedPTYProcesses().then(count => {
      if (count > 0) {
        console.log(`[TaskSessionManager] 定期清理发现并清理了 ${count} 个孤儿 PTY 进程`);
      }
    }).catch(e => {
      console.warn('[TaskSessionManager] 孤儿 PTY 检测失败:', e);
    });

    // 4. 如果 Session 数量接近上限，清理最老的活跃 Session
    if (this.sessions.size > this.MAX_SESSIONS * 0.9) {
      const entries = Array.from(this.sessions.entries());
      // 按创建时间排序，清理最老的
      entries.sort((a, b) => (a[1].getState().startTime || 0) - (b[1].getState().startTime || 0));

      const toRemove = entries.slice(0, entries.length - this.MAX_SESSIONS);
      for (const [taskId] of toRemove) {
        console.warn(`[TaskSessionManager] 清理最老 Session（数量限制）: ${taskId}`);
        this.sessions.get(taskId)?.stop();
        this.sessions.delete(taskId);
        cleaned++;
      }
    }

    if (cleaned > 0 || beforeCount !== this.sessions.size) {
      console.log(`[TaskSessionManager] Periodic cleanup: ${beforeCount} → ${this.sessions.size} (清理 ${cleaned} 个)`);
    }
  }

  /**
   * 清理数据库中的僵尸进程记录
   */
  private cleanupDatabaseSessions(): void {
    try {
      const db = getDatabase();

      // 标记超过心跳时间的 Session 为失败
      const staleThreshold = Date.now() - this.ZOMBIE_PROCESS_CHECK_INTERVAL;
      const staleSessions = db.prepare(`
        SELECT session_id, task_id, pid FROM task_sessions
        WHERE status NOT IN ('stopped', 'completed', 'error')
          AND last_heartbeat < ?
      `).all(staleThreshold) as any[];

      for (const row of staleSessions) {
        console.warn(`[TaskSessionManager] 发现僵尸 Session 记录: ${row.session_id} (PID: ${row.pid})`);

        // 检查进程是否仍在运行
        if (row.pid) {
          try {
            process.kill(row.pid, 0);
            // 进程存在，尝试终止
            console.log(`[TaskSessionManager] 终止僵尸进程: PID ${row.pid}`);
            this.killProcessTree(row.pid, 'SIGTERM');

            // 等待一段时间后强制清理
            setTimeout(() => {
              this.killProcessTree(row.pid, 'SIGKILL');
            }, 2000);
          } catch (e) {
            // 进程不存在，直接标记记录
          }
        }

        // 标记 Session 为失败
        db.prepare(`
          UPDATE task_sessions
          SET status = 'error', end_time = ?, updated_at = ?
          WHERE session_id = ?
        `).run(Date.now(), Date.now(), row.session_id);
      }

      // 删除超过 7 天的旧记录
      const oldThreshold = Date.now() - (7 * 24 * 3600000);
      const deleted = db.prepare(`
        DELETE FROM task_sessions
        WHERE created_at < ?
      `).run(oldThreshold);

      if (deleted.changes > 0) {
        console.log(`[TaskSessionManager] 清理了 ${deleted.changes} 个旧的 Session 记录`);
      }
    } catch (error: any) {
      console.error('[TaskSessionManager] 清理数据库 Session 失败:', error.message);
    }
  }

  /**
   * 递归终止进程树
   */
  private async killProcessTree(pid: number, signal: 'SIGTERM' | 'SIGKILL' = 'SIGKILL'): Promise<void> {
    try {
      if (process.platform === 'win32') {
        const { exec } = await import('child_process');
        return new Promise((resolve) => {
          exec(`taskkill /F /PID ${pid} /T`, (error: any) => {
            if (error && !error.message.includes('not found')) {
              console.warn(`[TaskSessionManager] Windows kill process tree warning: ${error.message}`);
            }
            resolve();
          });
        });
      } else {
        const childPids = await this.getChildProcesses(pid);
        for (const childPid of childPids) {
          await this.killProcessTree(childPid, signal);
        }
        try {
          process.kill(pid, signal);
        } catch (e: any) {
          if (e.code !== 'ESRCH') {
            console.warn(`[TaskSessionManager] Kill process ${pid} warning: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.error('[TaskSessionManager] Kill process tree error:', e);
    }
  }

  /**
   * 获取进程的所有子进程 PID（Unix 系统）
   */
  private async getChildProcesses(parentPid: number): Promise<number[]> {
    try {
      const { exec } = await import('child_process');
      return new Promise((resolve) => {
        const command = `ps -o pid= -P ${parentPid} 2>/dev/null || pgrep -P ${parentPid} 2>/dev/null || echo ""`;
        exec(command, (error: any, stdout: string) => {
          if (error) {
            resolve([]);
            return;
          }
          const pids = stdout
            .trim()
            .split('\n')
            .map(line => parseInt(line.trim()))
            .filter(pid => !isNaN(pid));
          resolve(pids);
        });
      });
    } catch (e) {
      return [];
    }
  }

  /**
   * 检测并清理孤儿 PTY 进程
   *
   * 这些进程可能是父进程被强制终止（SIGKILL）后遗留下来的
   * 它们不在数据库中跟踪，但仍占用系统资源
   */
  async detectAndCleanupOrphanedPTYProcesses(): Promise<number> {
    try {
      const { exec } = await import('child_process');

      // 查找所有 claude 进程（包括子进程）
      const command = process.platform === 'win32'
        ? `tasklist /FI "IMAGENAME eq claude.exe" /FO CSV`
        : `ps -eo pid,ppid,comm,args | grep -E '[c]laude|[n]ode-pty' | grep -v grep`;

      const orphanedPids: number[] = [];
      const trackedPids = new Set<number>();

      // 1. 获取数据库中所有已跟踪的 PID
      try {
        const db = getDatabase();
        const trackedSessions = db.prepare(`
          SELECT DISTINCT pid FROM task_sessions
          WHERE status NOT IN ('stopped', 'completed', 'error')
            AND pid IS NOT NULL
            AND last_heartbeat > ?
        `).all(Date.now() - this.ZOMBIE_PROCESS_CHECK_INTERVAL) as any[];

        for (const row of trackedSessions) {
          if (row.pid) {
            trackedPids.add(row.pid);
          }
        }
      } catch (e) {
        console.warn('[TaskSessionManager] 无法获取已跟踪的 PID:', e);
      }

      // 2. 扫描系统中的 claude 进程
      if (process.platform === 'win32') {
        // Windows 实现
        exec(command, (error: any, stdout: string) => {
          if (error) return;
          const lines = stdout.split('\n').slice(1); // 跳过标题行
          for (const line of lines) {
            const match = line.match(/"(\d+)"/);
            if (match) {
              const pid = parseInt(match[1]);
              if (!trackedPids.has(pid)) {
                orphanedPids.push(pid);
              }
            }
          }
        });
      } else {
        // Unix 实现
        return new Promise((resolve) => {
          exec(command, { maxBuffer: 1024 * 1024 }, async (error: any, stdout: string) => {
            if (error) {
              resolve(0);
              return;
            }

            const lines = stdout.trim().split('\n');
            for (const line of lines) {
              const parts = line.trim().split(/\s+/);
              if (parts.length >= 4) {
                const pid = parseInt(parts[0]);
                const comm = parts[2];
                const args = parts.slice(3).join(' ');

                // 检查是否是 claude 或 node-pty 相关进程
                const isClaudeProcess =
                  comm.includes('claude') ||
                  comm.includes('node') ||
                  args.includes('claude') ||
                  args.includes('node-pty');

                if (isClaudeProcess && !isNaN(pid)) {
                  // 检查是否在跟踪列表中
                  if (!trackedPids.has(pid)) {
                    orphanedPids.push(pid);
                  }
                }
              }
            }

            // 3. 终止所有孤儿进程
            let terminatedCount = 0;
            for (const pid of orphanedPids) {
              try {
                console.warn(`[TaskSessionManager] 🔍 发现孤儿 PTY 进程: PID ${pid}`);
                await this.killProcessTree(pid, 'SIGTERM');

                // 等待一段时间后强制清理
                setTimeout(async () => {
                  try {
                    process.kill(pid, 0); // 检查是否仍在运行
                    await this.killProcessTree(pid, 'SIGKILL');
                    console.log(`[TaskSessionManager] 🧹 强制清理孤儿进程: PID ${pid}`);
                  } catch (e) {
                    // 进程已终止
                  }
                }, 2000);

                terminatedCount++;
              } catch (e: any) {
                if (e.code !== 'ESRCH') {
                  console.warn(`[TaskSessionManager] 终止孤儿进程 ${pid} 失败:`, e.message);
                }
              }
            }

            if (terminatedCount > 0) {
              console.log(`[TaskSessionManager] ✅ 清理了 ${terminatedCount} 个孤儿 PTY 进程`);
            }

            resolve(terminatedCount);
          });
        });
      }

      return 0;
    } catch (error: any) {
      console.error('[TaskSessionManager] 检测孤儿进程失败:', error.message);
      return 0;
    }
  }

  /**
   * 停止并清理所有资源
   */
  shutdown(): void {
    console.log(`[TaskSessionManager] Shutting down...`);

    // 停止清理定时器
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // 清理所有 Session
    this.cleanup();
  }

  /**
   * 为任务创建/获取 Session
   */
  async getOrCreateSession(taskId: string): Promise<TaskSession> {
    // 清理已完成的 session
    this.cleanupCompletedSessions();

    if (this.sessions.has(taskId)) {
      const session = this.sessions.get(taskId)!;
      if (session.isAlive()) {
        return session;
      } else {
        this.sessions.delete(taskId);
      }
    }

    // 检查是否超过最大 Session 数量限制
    if (this.sessions.size >= this.MAX_SESSIONS) {
      // 尝试清理空闲的 Session
      const freed = this.forceCleanupIdleSessions();
      if (!freed && this.sessions.size >= this.MAX_SESSIONS) {
        throw new Error(
          `Session 数量已达上限 (${this.MAX_SESSIONS})，请等待现有任务完成或增加系统资源`
        );
      }
    }

    // 创建新 session
    const workspaceDir = path.join(this.workspacesRoot, taskId);
    const session = new TaskSession(taskId, workspaceDir, this.options);

    // 监听任务完成，自动清理
    session.on('taskCompleted', () => {
      console.log(`[TaskSessionManager] Task ${taskId} completed, will cleanup session`);
      // 延迟清理，给获取结果的时间
      setTimeout(() => {
        this.cleanupSession(taskId);
      }, 5000);
    });

    session.on('exited', () => {
      this.sessions.delete(taskId);
    });

    await session.start();
    this.sessions.set(taskId, session);

    console.log(`[TaskSessionManager] 创建 Session: ${taskId}, 当前活跃: ${this.sessions.size}/${this.MAX_SESSIONS}`);

    return session;
  }

  /**
   * 强制清理空闲的 Session
   * @returns 是否成功释放了至少一个 Session
   */
  private forceCleanupIdleSessions(): boolean {
    let freed = false;

    for (const [taskId, session] of this.sessions.entries()) {
      const state = session.getState();
      if (state.status === 'idle') {
        console.log(`[TaskSessionManager] 强制清理空闲 Session: ${taskId}`);
        session.stop();
        this.sessions.delete(taskId);
        freed = true;
      }
    }

    return freed;
  }

  /**
   * 执行任务
   */
  async executeTask(taskId: string, prompt: string): Promise<AgentTaskResult> {
    const session = await this.getOrCreateSession(taskId);
    return session.execute(prompt);
  }

  /**
   * 追加消息到任务 Session
   */
  appendToTask(taskId: string, message: string): void {
    const session = this.sessions.get(taskId);
    if (session && session.isAlive()) {
      session.append(message);
    }
  }

  /**
   * 中断任务（保留兼容性）
   */
  interruptTask(taskId: string): void {
    const session = this.sessions.get(taskId);
    if (session) {
      session.stop();
    }
  }

  /**
   * 获取任务状态
   */
  getTaskState(taskId: string): TaskSessionState | null {
    const session = this.sessions.get(taskId);
    return session ? session.getState() : null;
  }

  /**
   * 获取所有活跃任务
   */
  getActiveTasks(): string[] {
    return Array.from(this.sessions.keys()).filter(
      id => this.sessions.get(id)?.isAlive()
    );
  }

  /**
   * 强制终止任务（用于超时或卡住的任务）
   * 与 cancelTask 不同，这个方法会立即发送 SIGKILL
   */
  forceKillTask(taskId: string): boolean {
    console.log(`[TaskSessionManager] 收到强制终止请求: ${taskId}`);

    const session = this.sessions.get(taskId);
    if (!session) {
      console.log(`[TaskSessionManager] Session 不存在: ${taskId}`);
      return false;
    }

    try {
      // 立即停止会话（会发送 Ctrl+C 然后等待，最终 SIGKILL）
      session.stop();

      // 从列表中移除
      this.sessions.delete(taskId);

      // 记录强制终止活动日志
      try {
        const db = getDatabase();
        db.logActivity({
          eventType: 'task.session_force_killed',
          actor: 'task_session_manager',
          action: 'force_kill_session',
          context: {
            sessionId: session.sessionId,
            taskId,
          },
        });
      } catch (e) {
        console.error('[TaskSessionManager] 记录强制终止日志失败:', e);
      }

      console.log(`[TaskSessionManager] ✅ 任务已强制终止: ${taskId}`);
      return true;
    } catch (error: any) {
      console.error(`[TaskSessionManager] ❌ 强制终止任务失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 清理指定 Session
   */
  private cleanupSession(taskId: string): void {
    const session = this.sessions.get(taskId);
    if (session) {
      session.stop();
      this.sessions.delete(taskId);
    }
  }

  /**
   * 清理已完成的 Session
   */
  private cleanupCompletedSessions(): void {
    for (const [taskId, session] of this.sessions) {
      if (!session.isAlive()) {
        this.sessions.delete(taskId);
      }
    }
  }

  /**
   * 清理所有 Session
   */
  cleanup(): void {
    console.log(`[TaskSessionManager] Cleaning up ${this.sessions.size} sessions...`);
    for (const session of this.sessions.values()) {
      try {
        session.stop();
      } catch (e) {
        console.error(`[TaskSessionManager] Error stopping session:`, e);
      }
    }
    this.sessions.clear();

    // 停止清理定时器
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    activeTasks: string[];
  } {
    const activeTasks = this.getActiveTasks();

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeTasks.length,
      activeTasks,
    };
  }

  /**
   * 取消任务
   *
   * @param taskId 任务 ID
   * @returns Promise<boolean> 是否成功取消
   */
  async cancelTask(taskId: string): Promise<boolean> {
    console.log(`[TaskSessionManager] 收到取消请求: ${taskId}`);

    const session = this.sessions.get(taskId);
    if (!session) {
      console.log(`[TaskSessionManager] Session 不存在: ${taskId}`);
      return false;
    }

    try {
      // 发送停止信号
      session.stop();

      // 等待 Session 完全停止
      const maxWaitTime = 5000; // 最多等待 5 秒
      const startTime = Date.now();

      while (session.isAlive() && Date.now() - startTime < maxWaitTime) {
        await this.sleep(100);
      }

      // 如果仍在运行，强制终止
      if (session.isAlive()) {
        console.warn(`[TaskSessionManager] Session 未能正常终止，强制清理: ${taskId}`);
        await session.forceKillNow();
      }

      // 从 Map 中删除
      this.sessions.delete(taskId);

      // 记录取消活动日志
      try {
        const db = getDatabase();
        db.logActivity({
          eventType: 'task.session_cancelled',
          actor: 'task_session_manager',
          action: 'cancel_session',
          context: {
            sessionId: session.sessionId,
            taskId,
          },
        });
      } catch (e) {
        console.error('[TaskSessionManager] 记录取消日志失败:', e);
      }

      console.log(`[TaskSessionManager] ✅ 任务已取消: ${taskId}`);
      return true;
    } catch (error: any) {
      console.error(`[TaskSessionManager] ❌ 取消任务失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 同步休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// 单例
// ============================================================================

let globalManager: TaskSessionManager | null = null;

export function getTaskSessionManager(options?: TaskSessionOptions): TaskSessionManager {
  if (!globalManager) {
    globalManager = new TaskSessionManager(options);
  }
  return globalManager;

  // 或者每次创建新实例（不使用单例）
  // return new TaskSessionManager(options);
}

export function resetTaskSessionManager(): void {
  if (globalManager) {
    globalManager.cleanup();
    globalManager = null;
  }
}

export function shutdownTaskSessionManager(): void {
  if (globalManager) {
    globalManager.shutdown();
    globalManager = null;
  }
}
