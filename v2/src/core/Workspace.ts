/**
 * AI Company v2 - Workspace Manager
 *
 * 管理工作目录，为每个任务提供隔离的执行环境
 */

import * as fs from 'fs';
import * as path from 'path';

export interface WorkspaceInfo {
  id: string;
  path: string;
  taskId: string;
  createdAt: number;
  status: 'active' | 'completed' | 'archived';
}

export interface WorkspaceOptions {
  baseDir?: string;
  cleanOnComplete?: boolean;
}

/**
 * Workspace Manager
 *
 * 为任务提供隔离的工作目录
 */
export class WorkspaceManager {
  private baseDir: string;
  private workspaces = new Map<string, WorkspaceInfo>();

  constructor(options?: WorkspaceOptions) {
    this.baseDir = options?.baseDir || path.join(process.cwd(), 'outputs', 'tasks');
  }

  /**
   * 初始化基础目录
   */
  async initialize(): Promise<void> {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
      console.log(`[Workspace] Created base directory: ${this.baseDir}`);
    }
  }

  /**
   * 创建新工作区
   */
  async createWorkspace(taskId: string): Promise<WorkspaceInfo> {
    await this.initialize();

    const workspaceId = `ws_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const workspacePath = path.join(this.baseDir, workspaceId);

    // 创建目录
    fs.mkdirSync(workspacePath, { recursive: true });

    const info: WorkspaceInfo = {
      id: workspaceId,
      path: workspacePath,
      taskId,
      createdAt: Date.now(),
      status: 'active',
    };

    this.workspaces.set(workspaceId, info);

    console.log(`[Workspace] Created: ${workspaceId} for task: ${taskId}`);

    return info;
  }

  /**
   * 获取工作区信息
   */
  getWorkspace(workspaceId: string): WorkspaceInfo | undefined {
    return this.workspaces.get(workspaceId);
  }

  /**
   * 通过 taskId 获取工作区
   */
  getWorkspaceByTaskId(taskId: string): WorkspaceInfo | undefined {
    for (const ws of this.workspaces.values()) {
      if (ws.taskId === taskId) {
        return ws;
      }
    }
    return undefined;
  }

  /**
   * 获取工作区路径
   */
  getWorkspacePath(workspaceId: string): string | undefined {
    const ws = this.workspaces.get(workspaceId);
    return ws?.path;
  }

  /**
   * 完成工作区
   */
  async completeWorkspace(
    workspaceId: string,
    keepFiles: boolean = true
  ): Promise<void> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    ws.status = 'completed';

    if (!keepFiles) {
      await this.cleanupWorkspace(workspaceId);
    }

    console.log(`[Workspace] Completed: ${workspaceId}`);
  }

  /**
   * 清理工作区
   */
  async cleanupWorkspace(workspaceId: string): Promise<void> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    try {
      if (fs.existsSync(ws.path)) {
        fs.rmSync(ws.path, { recursive: true, force: true });
      }
      ws.status = 'archived';
      console.log(`[Workspace] Cleaned up: ${workspaceId}`);
    } catch (err: any) {
      console.error(`[Workspace] Cleanup failed: ${err.message}`);
    }
  }

  /**
   * 归档工作区
   */
  async archiveWorkspace(workspaceId: string): Promise<void> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    ws.status = 'archived';
    console.log(`[Workspace] Archived: ${workspaceId}`);
  }

  /**
   * 列出所有活跃工作区
   */
  listActiveWorkspaces(): WorkspaceInfo[] {
    return Array.from(this.workspaces.values()).filter(
      (ws) => ws.status === 'active'
    );
  }

  /**
   * 获取基础目录
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * 清理所有工作区
   */
  async cleanupAll(): Promise<void> {
    for (const ws of this.workspaces.values()) {
      await this.cleanupWorkspace(ws.id);
    }
    this.workspaces.clear();
  }
}

// 单例
let instance: WorkspaceManager | null = null;

export function getWorkspaceManager(options?: WorkspaceOptions): WorkspaceManager {
  if (!instance) {
    instance = new WorkspaceManager(options);
  }
  return instance;
}
