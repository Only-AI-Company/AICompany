/**
 * AI Company v2 - Claude CLI Manager
 *
 * 通过 Claude Code CLI 执行实际操作
 * - 运行 shell 命令
 * - 读写文件
 * - 创建/删除目录
 * - 执行代码
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface CLIExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
}

export interface FileOperation {
  type: 'read' | 'write' | 'delete' | 'mkdir';
  path: string;
  content?: string;
}

/**
 * Claude CLI Manager
 *
 * 使用 Claude Code CLI 进行实际操作执行
 */
export class ClaudeCLIManager {
  private workspacePath: string;
  private claudeProcess: any = null;
  private isInitialized = false;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * 初始化工作区
   */
  async initialize(): Promise<void> {
    // 确保工作区目录存在
    if (!fs.existsSync(this.workspacePath)) {
      fs.mkdirSync(this.workspacePath, { recursive: true });
    }
    this.isInitialized = true;
    console.log(`[ClaudeCLI] Initialized workspace: ${this.workspacePath}`);
  }

  /**
   * 执行 shell 命令
   */
  async executeCommand(
    command: string,
    options?: { cwd?: string; timeout?: number }
  ): Promise<CLIExecutionResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve) => {
      const cwd = options?.cwd || this.workspacePath;
      const timeout = options?.timeout || 60000;

      console.log(`[ClaudeCLI] Executing: ${command}`);

      const process = spawn('sh', ['-c', command], {
        cwd,
        shell: true,
      });

      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        console.log(`[ClaudeCLI] stdout: ${text.trim()}`);
      });

      process.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        errorOutput += text;
        console.error(`[ClaudeCLI] stderr: ${text.trim()}`);
      });

      process.on('close', (code: number) => {
        resolve({
          success: code === 0,
          output: output.trim(),
          error: errorOutput.trim() || undefined,
          exitCode: code,
        });
      });

      process.on('error', (err: Error) => {
        resolve({
          success: false,
          error: err.message,
        });
      });

      // Timeout handling
      setTimeout(() => {
        process.kill();
        resolve({
          success: false,
          error: 'Command timeout',
        });
      }, timeout);
    });
  }

  /**
   * 读取文件
   */
  async readFile(filePath: string): Promise<CLIExecutionResult> {
    try {
      const fullPath = path.join(this.workspacePath, filePath);
      if (!fs.existsSync(fullPath)) {
        return {
          success: false,
          error: `File not found: ${filePath}`,
        };
      }
      const content = fs.readFileSync(fullPath, 'utf-8');
      return {
        success: true,
        output: content,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 写入文件
   */
  async writeFile(
    filePath: string,
    content: string
  ): Promise<CLIExecutionResult> {
    try {
      const fullPath = path.join(this.workspacePath, filePath);
      const dir = path.dirname(fullPath);

      // 确保目录存在
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, content, 'utf-8');
      console.log(`[ClaudeCLI] Written: ${filePath}`);

      return {
        success: true,
        output: `File written: ${filePath}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 删除文件
   */
  async deleteFile(filePath: string): Promise<CLIExecutionResult> {
    try {
      const fullPath = path.join(this.workspacePath, filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      return {
        success: true,
        output: `File deleted: ${filePath}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 创建目录
   */
  async mkdir(dirPath: string): Promise<CLIExecutionResult> {
    try {
      const fullPath = path.join(this.workspacePath, dirPath);
      fs.mkdirSync(fullPath, { recursive: true });
      return {
        success: true,
        output: `Directory created: ${dirPath}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 列出目录内容
   */
  async listDir(dirPath?: string): Promise<CLIExecutionResult> {
    try {
      const fullPath = dirPath
        ? path.join(this.workspacePath, dirPath)
        : this.workspacePath;

      if (!fs.existsSync(fullPath)) {
        return {
          success: false,
          error: `Directory not found: ${dirPath || this.workspacePath}`,
        };
      }

      const files = fs.readdirSync(fullPath);
      return {
        success: true,
        output: files.join('\n'),
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 检查文件是否存在
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.workspacePath, filePath);
    return fs.existsSync(fullPath);
  }

  /**
   * 获取工作区路径
   */
  getWorkspacePath(): string {
    return this.workspacePath;
  }

  /**
   * 清理工作区
   */
  async cleanup(): Promise<void> {
    try {
      if (fs.existsSync(this.workspacePath)) {
        fs.rmSync(this.workspacePath, { recursive: true, force: true });
      }
      console.log(`[ClaudeCLI] Cleaned up workspace: ${this.workspacePath}`);
    } catch (err: any) {
      console.error(`[ClaudeCLI] Cleanup failed: ${err.message}`);
    }
  }
}

// 工厂函数
let managerInstance: ClaudeCLIManager | null = null;

export function getClaudeCLIManager(workspacePath?: string): ClaudeCLIManager {
  if (!managerInstance || workspacePath) {
    const path = workspacePath || process.cwd() + '/.workspace';
    managerInstance = new ClaudeCLIManager(path);
  }
  return managerInstance;
}
