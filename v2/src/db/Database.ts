/**
 * AI Company v2 - 数据库访问层
 *
 * 简单的数据库封装，提供基本的CRUD操作
 */
import Database from 'better-sqlite3';
import { readFileSync, existsSync, statSync, unlinkSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initSeeds } from './seeds/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * WAL 文件信息
 */
interface WalFileInfo {
  walPath: string;
  shmPath: string;
  walSize: number;
  shmSize: number;
  totalSize: number;
}

export class AIDatabase {
  private db: Database.Database;
  private dbPath: string;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second
  private isClosed = false;

  // WAL 管理相关
  private walCheckpointTimer?: NodeJS.Timeout;
  private readonly WAL_CHECKPOINT_INTERVAL = 5 * 60 * 1000; // 5 分钟
  private readonly WAL_SIZE_WARNING_THRESHOLD = 10 * 1024 * 1024; // 10 MB
  private readonly WAL_SIZE_CRITICAL_THRESHOLD = 50 * 1024 * 1024; // 50 MB
  private lastWalCheck: number = 0;

  // 连接健康检查相关
  private healthCheckTimer?: NodeJS.Timeout;
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 分钟
  private consecutiveHealthFailures: number = 0;
  private readonly MAX_HEALTH_FAILURES = 3;
  private reconnectInProgress = false;

  // 重连相关（指数退避）
  private reconnectAttemptCount: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private reconnectTimer?: NodeJS.Timeout;
  private readonly BASE_RECONNECT_DELAY = 1000; // 1 秒
  private readonly MAX_RECONNECT_DELAY = 60000; // 最大 1 分钟

  constructor(dbPath: string = join(__dirname, '../../data/company.db')) {
    this.dbPath = dbPath;
    this.db = this.initDatabaseWithRetry(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();

    // 启动 WAL 定期检查点
    this.startWalCheckpoint();

    // 启动连接健康检查
    this.startHealthCheck();

    // 注册进程退出时的清理
    this.registerCleanupHandlers();
  }

  /**
   * 初始化数据库连接（带重试）
   */
  private initDatabaseWithRetry(dbPath: string): Database.Database {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        // 确保数据目录存在
        const dir = dirname(dbPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        return new Database(dbPath);
      } catch (error: any) {
        lastError = error;
        console.error(`[Database] 初始化失败 (尝试 ${attempt}/${this.MAX_RETRIES}): ${error.message}`);

        if (attempt < this.MAX_RETRIES) {
          console.log(`[Database] 等待 ${this.RETRY_DELAY}ms 后重试...`);
          this.sleep(this.RETRY_DELAY * attempt); // 指数退避
        }
      }
    }

    // 所有重试失败，抛出详细错误
    throw new Error(
      `数据库初始化失败：${lastError?.message}. ` +
      `可能原因：1) 数据库文件损坏 2) 权限不足 3) 磁盘空间不足。` +
      `建议：删除损坏的数据库文件后重试 (rm ${dbPath}*), 或运行 'ai-company db:reset'`
    );
  }

  /**
   * 注册进程退出时的清理处理器
   */
  private registerCleanupHandlers(): void {
    const cleanup = () => {
      this.close();
    };

    // 监听进程退出事件
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
  }

  /**
   * 同步休眠（用于重试延迟）
   */
  private sleep(ms: number): void {
    const start = Date.now();
    while (Date.now() - start < ms) {
      // 自旋等待
    }
  }

  /**
   * 初始化Schema
   */
  private initSchema(): void {
    const schema = readFileSync(join(__dirname, '../../schema.sql'), 'utf-8');
    this.db.exec(schema);

    // 初始化种子数据
    initSeeds(this);
  }

  /**
   * 重置数据库
   */
  reset(): void {
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    for (const table of tables) {
      this.db.exec(`DROP TABLE IF EXISTS ${table.name}`);
    }
    this.initSchema();
  }

  /**
   * 执行 WAL checkpoint（将 WAL 文件内容合并回主数据库）
   */
  checkpoint(): void {
    if (this.isClosed) {
      console.warn('[Database] 数据库已关闭，跳过 checkpoint');
      return;
    }

    try {
      // 获取 checkpoint 前的 WAL 文件大小
      const beforeInfo = this.getWalFileInfo();

      // 执行 TRUNCATE 模式的 checkpoint（最激进，会清空 WAL 文件）
      const result = this.db.pragma('wal_checkpoint(TRUNCATE)') as [number, number, number];
      // 结果格式: [frames in WAL, frames checkpointed, frames truncated]

      // 获取 checkpoint 后的 WAL 文件大小
      const afterInfo = this.getWalFileInfo();

      this.lastWalCheck = Date.now();

      console.log('[Database] WAL checkpoint 完成:', {
        before: beforeInfo.walSize > 0 ? `${Math.round(beforeInfo.walSize / 1024)}KB` : 'N/A',
        after: afterInfo.walSize > 0 ? `${Math.round(afterInfo.walSize / 1024)}KB` : 'N/A',
        framesInWal: result[0],
        framesCheckpointed: result[1],
        framesTruncated: result[2],
      });

      // 检查 WAL 文件大小，如果超过阈值发出警告
      if (afterInfo.totalSize > this.WAL_SIZE_CRITICAL_THRESHOLD) {
        console.error(`[Database] ⚠️  WAL 文件过大: ${Math.round(afterInfo.totalSize / 1024 / 1024)}MB`);
      } else if (afterInfo.totalSize > this.WAL_SIZE_WARNING_THRESHOLD) {
        console.warn(`[Database] ⚠️  WAL 文件较大: ${Math.round(afterInfo.totalSize / 1024 / 1024)}MB`);
      }
    } catch (error: any) {
      console.error('[Database] WAL checkpoint 失败:', error.message);
    }
  }

  /**
   * 获取 WAL 文件信息
   */
  private getWalFileInfo(): WalFileInfo {
    const walPath = `${this.dbPath}-wal`;
    const shmPath = `${this.dbPath}-shm`;

    let walSize = 0;
    let shmSize = 0;

    try {
      if (existsSync(walPath)) {
        walSize = statSync(walPath).size;
      }
    } catch (e) {
      // 忽略错误
    }

    try {
      if (existsSync(shmPath)) {
        shmSize = statSync(shmPath).size;
      }
    } catch (e) {
      // 忽略错误
    }

    return {
      walPath,
      shmPath,
      walSize,
      shmSize,
      totalSize: walSize + shmSize,
    };
  }

  /**
   * 启动 WAL 定期 checkpoint
   */
  private startWalCheckpoint(): void {
    this.walCheckpointTimer = setInterval(() => {
      this.checkpoint();
    }, this.WAL_CHECKPOINT_INTERVAL);

    console.log(`[Database] WAL 定期 checkpoint 已启动 (间隔: ${this.WAL_CHECKPOINT_INTERVAL / 1000}秒)`);
  }

  /**
   * 停止 WAL 定期 checkpoint
   */
  private stopWalCheckpoint(): void {
    if (this.walCheckpointTimer) {
      clearInterval(this.walCheckpointTimer);
      this.walCheckpointTimer = undefined;
      console.log('[Database] WAL 定期 checkpoint 已停止');
    }
  }

  /**
   * 获取 WAL 统计信息
   */
  getWalStats(): {
    lastCheck: number;
    timeSinceLastCheck: number;
    walInfo: WalFileInfo;
  } {
    return {
      lastCheck: this.lastWalCheck,
      timeSinceLastCheck: this.lastWalCheck > 0 ? Date.now() - this.lastWalCheck : 0,
      walInfo: this.getWalFileInfo(),
    };
  }

  /**
   * 强制执行 WAL checkpoint 并清理（用于维护）
   */
  forceWalCheckpoint(): void {
    console.log('[Database] 执行强制 WAL checkpoint...');
    this.checkpoint();
  }

  // ============================================================================
  // 连接健康检查和自动重连
  // ============================================================================

  /**
   * 检查数据库连接是否健康
   */
  checkHealth(): boolean {
    if (this.isClosed) {
      console.warn('[Database] 数据库已关闭，健康检查失败');
      return false;
    }

    try {
      // 执行简单的查询来验证连接
      this.db.prepare('SELECT 1 as test').get();
      this.consecutiveHealthFailures = 0;
      return true;
    } catch (error: any) {
      this.consecutiveHealthFailures++;
      console.error(`[Database] 健康检查失败 (第 ${this.consecutiveHealthFailures} 次): ${error.message}`);

      // 如果连续失败次数达到阈值，尝试重连
      if (this.consecutiveHealthFailures >= this.MAX_HEALTH_FAILURES && !this.reconnectInProgress) {
        console.warn('[Database] 连续健康检查失败次数达到阈值，尝试重连...');
        this.reconnect();
      }

      return false;
    }
  }

  /**
   * 启动定期健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      this.checkHealth();
    }, this.HEALTH_CHECK_INTERVAL);

    console.log(`[Database] 连接健康检查已启动 (间隔: ${this.HEALTH_CHECK_INTERVAL / 1000}秒)`);
  }

  /**
   * 停止定期健康检查
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      clearTimeout(this.healthCheckTimer as any); // 同时处理 setTimeout
      this.healthCheckTimer = undefined;
      console.log('[Database] 连接健康检查已停止');
    }

    // 同时停止重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
      console.log('[Database] 重连定时器已停止');
    }
  }

  /**
   * 计算重连延迟（指数退避）
   */
  private calculateReconnectDelay(attempt: number): number {
    // 指数退避：1s, 2s, 4s, 8s, ... 最大 60 秒
    const delay = this.BASE_RECONNECT_DELAY * Math.pow(2, attempt - 1);
    return Math.min(delay, this.MAX_RECONNECT_DELAY);
  }

  /**
   * 重新连接数据库（带指数退避和自动重试）
   */
  private reconnect(): void {
    if (this.reconnectInProgress) {
      console.log('[Database] 重连已在进行中，跳过');
      return;
    }

    // 检查是否超过最大重试次数
    if (this.reconnectAttemptCount >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error(`[Database] ❌ 重连次数已达上限 (${this.MAX_RECONNECT_ATTEMPTS})，停止自动重连`);
      console.error('[Database] ⚠️  请检查数据库文件和系统状态，可能需要手动干预');
      this.reconnectInProgress = false;
      return;
    }

    this.reconnectInProgress = true;
    this.reconnectAttemptCount++;

    const delay = this.calculateReconnectDelay(this.reconnectAttemptCount);
    console.log(`[Database] 开始第 ${this.reconnectAttemptCount} 次重连尝试 (延迟 ${delay}ms)...`);

    // 延迟后执行重连
    this.reconnectTimer = setTimeout(() => {
      try {
        // 关闭旧连接
        try {
          if (this.db) {
            this.db.close();
          }
        } catch (e) {
          // 忽略关闭错误
        }

        // 重新初始化数据库连接
        this.db = this.initDatabaseWithRetry(this.dbPath);
        this.db.pragma('journal_mode = WAL');

        // 重置失败计数和重连计数
        this.consecutiveHealthFailures = 0;
        this.reconnectAttemptCount = 0;
        this.reconnectInProgress = false;

        console.log('[Database] ✅ 数据库重连成功');

        // 记录重连活动日志
        this.logActivity({
          eventType: 'database.reconnected',
          actor: 'database',
          action: 'auto_reconnect',
          context: {
            dbPath: this.dbPath,
            attemptNumber: this.reconnectAttemptCount,
            timestamp: Date.now(),
          },
        });
      } catch (error: any) {
        console.error(`[Database] ❌ 第 ${this.reconnectAttemptCount} 次重连失败: ${error.message}`);

        // 记录重连失败
        this.logActivity({
          eventType: 'database.reconnect_failed',
          actor: 'database',
          action: 'reconnect_failed',
          context: {
            dbPath: this.dbPath,
            error: error.message,
            attemptNumber: this.reconnectAttemptCount,
            timestamp: Date.now(),
          },
        });

        // 计划下一次重连
        this.reconnectInProgress = false;
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * 计划下一次重连
   */
  private scheduleReconnect(): void {
    // 计算下一次重连的延迟时间
    const nextDelay = this.calculateReconnectDelay(this.reconnectAttemptCount + 1);
    console.log(`[Database] 📅 计划在 ${nextDelay}ms 后进行下一次重连尝试...`);

    // 使用健康检查定时器来触发下一次重连
    // 这样可以避免创建额外的定时器
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setTimeout(() => {
      // 停止当前定时器
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
      }

      // 尝试重连（通过健康检查失败触发）
      this.consecutiveHealthFailures = this.MAX_HEALTH_FAILURES;
      this.checkHealth();

      // 重启定期健康检查
      this.startHealthCheck();
    }, nextDelay);
  }

  /**
   * 带自动重连的安全执行
   * 在执行数据库操作时自动检查并重连
   */
  private executeWithReconnect<T>(operation: () => T, fallback?: () => T): T {
    // 如果正在重连，等待重连完成
    if (this.reconnectInProgress) {
      console.warn('[Database] 正在重连中，操作被延迟');
      if (fallback) return fallback();
      throw new Error('数据库正在重连，请稍后再试');
    }

    const maxAttempts = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return operation();
      } catch (error: any) {
        lastError = error;

        // 检查是否是连接相关错误
        const isConnectionError =
          error.message.includes('SQLITE_BUSY') ||
          error.message.includes('database is closed') ||
          error.message.includes('disk I/O error') ||
          error.message.includes('database disk image is malformed');

        if (isConnectionError && attempt < maxAttempts) {
          console.warn(`[Database] 检测到连接错误 (尝试 ${attempt}/${maxAttempts})，尝试重连...`);

          // 检查健康并可能触发重连
          const isHealthy = this.checkHealth();
          if (!isHealthy) {
            // 等待重连完成
            const waitStart = Date.now();
            while (this.reconnectInProgress && Date.now() - waitStart < 5000) {
              this.sleep(100);
            }
          }

          continue;
        }
      }
    }

    // 所有尝试都失败
    console.error(`[Database] 操作失败: ${lastError?.message}`);
    if (fallback) return fallback();
    throw lastError;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.isClosed) {
      return;
    }

    console.log('[Database] 正在关闭数据库...');

    try {
      // 停止 WAL 定期 checkpoint
      this.stopWalCheckpoint();

      // 停止健康检查
      this.stopHealthCheck();

      // 执行 checkpoint，确保 WAL 文件内容合并回主数据库
      this.checkpoint();

      // 关闭数据库
      this.db.close();
      this.isClosed = true;

      console.log('[Database] 数据库已安全关闭');
    } catch (error: any) {
      console.error('[Database] 关闭数据库失败:', error.message);
    }
  }

  /**
   * 获取数据库路径
   */
  getDbPath(): string {
    return this.dbPath;
  }

  /**
   * 检查数据库是否已关闭
   */
  getIsClosed(): boolean {
    return this.isClosed;
  }

  /**
   * 准备语句（带自动重连）
   */
  prepare(sql: string): any {
    if (this.isClosed) {
      throw new Error('数据库已关闭');
    }
    return this.executeWithReconnect(
      () => this.db.prepare(sql),
      () => { throw new Error('数据库已关闭且无法重连'); }
    );
  }

  /**
   * 执行SQL（带自动重连）
   */
  exec(sql: string): void {
    if (this.isClosed) {
      throw new Error('数据库已关闭');
    }
    this.executeWithReconnect(
      () => this.db.exec(sql),
      () => { throw new Error('数据库已关闭且无法重连'); }
    );
  }

  // ============================================================================
  // Config
  // ============================================================================

  getConfig(namespace: string): any {
    const row = this.prepare('SELECT config_json FROM config WHERE namespace = ?').get(namespace);
    if (!row) return null;
    try {
      return JSON.parse(row.config_json);
    } catch (error) {
      console.error('[Database] Failed to parse config for', namespace, ':', row.config_json?.substring(0, 200));
      return null;
    }
  }

  setConfig(namespace: string, config: any): void {
    const now = Date.now();
    this.prepare(`
      INSERT INTO config (namespace, config_json, version, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(namespace) DO UPDATE SET
        config_json = excluded.config_json,
        updated_at = excluded.updated_at
    `).run(namespace, JSON.stringify(config), now, now);
  }

  // ============================================================================
  // Goal
  // ============================================================================

  createGoal(goal: {
    id: string;
    type: string;
    title: string;
    description?: string;
    acceptanceCriteria?: string;
    dueDate?: number;
    parentGoalId?: string;
    recurring?: string;
    ownerId?: string;
  }): void {
    const now = Date.now();
    this.prepare(`
      INSERT INTO goals (id, type, title, description, acceptance_criteria, due_date,
                         parent_goal_id, recurring, owner_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      goal.id,
      goal.type,
      goal.title,
      goal.description || null,
      goal.acceptanceCriteria || null,
      goal.dueDate || null,
      goal.parentGoalId || null,
      goal.recurring || null,
      goal.ownerId || null,
      now,
      now
    );
  }

  getGoal(id: string): any {
    return this.prepare('SELECT * FROM goals WHERE id = ?').get(id);
  }

  listGoals(filters?: { status?: string; ownerId?: string }): any[] {
    let sql = 'SELECT * FROM goals WHERE 1=1';
    const params: any[] = [];

    if (filters?.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters?.ownerId) {
      sql += ' AND owner_id = ?';
      params.push(filters.ownerId);
    }

    sql += ' ORDER BY created_at DESC';

    return this.prepare(sql).all(...params);
  }

  updateGoalStatus(id: string, status: string): void {
    this.prepare('UPDATE goals SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Date.now(), id);
  }

  // ============================================================================
  // Goal Plan
  // ============================================================================

  createGoalPlan(plan: {
    id: string;
    goalId: string;
    content: any;
  }): void {
    const now = Date.now();
    this.prepare(`
      INSERT INTO goal_plans (id, goal_id, version, content, status, created_at, updated_at)
      VALUES (?, ?, 1, ?, 'pending_owner', ?, ?)
    `).run(plan.id, plan.goalId, JSON.stringify(plan.content), now, now);
  }

  // ============================================================================
  // Task
  // ============================================================================

  createTask(task: {
    id: string;
    type: string;
    description: string;
    priority?: string;
    goalId?: string;
    requestedBy: string;
    assignedTo?: string;
  }): void {
    const now = Date.now();
    this.prepare(`
      INSERT INTO tasks (id, type, description, priority, goal_id, requested_by, assigned_to, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id,
      task.type,
      task.description,
      task.priority || 'medium',
      task.goalId || null,
      task.requestedBy,
      task.assignedTo || null,
      now
    );
  }

  getTask(id: string): any {
    return this.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  }

  listTasks(filters?: { status?: string; goalId?: string; assignedTo?: string }): any[] {
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];

    if (filters?.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters?.goalId) {
      sql += ' AND goal_id = ?';
      params.push(filters.goalId);
    }
    if (filters?.assignedTo) {
      sql += ' AND assigned_to = ?';
      params.push(filters.assignedTo);
    }

    sql += ' ORDER BY created_at DESC';

    return this.prepare(sql).all(...params);
  }

  updateTaskStatus(id: string, status: string, result?: { output?: string; error?: string }): void {
    const now = Date.now();
    let sql = 'UPDATE tasks SET status = ?';
    const params: any[] = [status];

    if (status === 'completed') {
      sql += ', completed_at = ?';
      params.push(now);
    }
    if (status === 'executing') {
      sql += ', started_at = ?';
      params.push(now);
    }

    if (result?.output) {
      sql += ', output = ?';
      params.push(result.output);
    }
    if (result?.error) {
      sql += ', error = ?';
      params.push(result.error);
    }

    sql += ' WHERE id = ?';
    params.push(id);

    this.prepare(sql).run(...params);
  }

  // ============================================================================
  // Cron
  // ============================================================================

  createCron(cron: {
    id: string;
    name: string;
    description?: string;
    command: string;
    args?: any;
    cronRule: string;
    goalId?: string;
    workingDir?: string;
    env?: any;
  }): void {
    const now = Date.now();
    this.prepare(`
      INSERT INTO crontab (id, name, description, command, args_json, cron_rule, goal_id,
                          working_dir, env_json, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      cron.id,
      cron.name,
      cron.description || null,
      cron.command,
      cron.args ? JSON.stringify(cron.args) : null,
      cron.cronRule,
      cron.goalId || null,
      cron.workingDir || null,
      cron.env ? JSON.stringify(cron.env) : null,
      now,
      now
    );

    // 计算下次运行时间
    this.updateCronNextRun(cron.id, cron.cronRule);
  }

  getCron(id: string): any {
    return this.prepare('SELECT * FROM crontab WHERE id = ?').get(id);
  }

  listCrons(filters?: { enabled?: boolean; goalId?: string }): any[] {
    let sql = 'SELECT * FROM crontab WHERE 1=1';
    const params: any[] = [];

    if (filters?.enabled !== undefined) {
      sql += ' AND enabled = ?';
      params.push(filters.enabled ? 1 : 0);
    }
    if (filters?.goalId) {
      sql += ' AND goal_id = ?';
      params.push(filters.goalId);
    }

    sql += ' ORDER BY created_at DESC';

    return this.prepare(sql).all(...params);
  }

  updateCronNextRun(id: string, cronRule: string): void {
    // 简单的下次运行时间计算（这里可以改进）
    const nextRun = this.calculateNextRun(cronRule);
    this.prepare('UPDATE crontab SET next_run = ? WHERE id = ?')
      .run(nextRun, id);
  }

  updateCronRunStatus(id: string, result: {
    success: boolean;
    output?: string;
    error?: string;
    duration?: number;
  }): void {
    const now = Date.now();
    this.prepare(`
      UPDATE crontab SET
        last_run = ?,
        run_count = run_count + 1,
        fail_count = fail_count + ?,
        last_output = ?,
        last_error = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      now,
      result.success ? 0 : 1,  // 成功时增加 0，失败时增加 1
      result.output || null,
      result.error || null,
      now,
      id
    );
  }

  // ============================================================================
  // Goal-Cron 关联
  // ============================================================================

  linkGoalToCron(goalId: string, cronId: string): void {
    this.prepare(`
      INSERT INTO goal_cron_mapping (id, goal_id, cron_id, created_at)
      VALUES (?, ?, ?, ?)
    `).run(this.generateId(), goalId, cronId, Date.now());
  }

  // ============================================================================
  // Activity Log
  // ============================================================================

  logActivity(options: {
    eventType: string;
    actor: string;
    action: string;
    context?: any;
    result?: any;
  }): void {
    try {
      this.prepare(`
        INSERT INTO activity_logs (id, event_type, actor, action, context_json, result_json, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        this.generateId(),
        options.eventType,
        options.actor,
        options.action,
        options.context ? JSON.stringify(options.context) : null,
        options.result ? JSON.stringify(options.result) : null,
        Date.now()
      );
    } catch (error: any) {
      // 活动日志记录失败不应影响主流程
      console.error('[Database] 记录活动日志失败:', error.message);
    }
  }

  // ============================================================================
  // 意图日志
  // ============================================================================

  logIntent(options: {
    sessionId: string;
    source: string;
    userInput: string;
    aiRawResponse?: string;
    parsedTool?: string;
    parsedInput?: string;
    toolResult?: string;
    executionStatus?: string;
    latency?: number;
  }): void {
    this.prepare(`
      INSERT INTO intent_logs
      (id, session_id, source, user_input, ai_raw_response, parsed_tool, parsed_input, tool_result, execution_status, chat_history_count, latency, timestamps)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      this.generateId(),
      options.sessionId,
      options.source,
      options.userInput,
      options.aiRawResponse || null,
      options.parsedTool || null,
      options.parsedInput || null,
      options.toolResult || null,
      options.executionStatus || null,
      options.latency || null,
      Date.now()
    );
  }

  // ============================================================================
  // Chat Message
  // ============================================================================

  saveChatMessage(options: {
    sessionId?: string;
    content: string;
    source: string;
    direction: 'in' | 'out';
    employeeId?: string | null;
    chatId?: string;
    userId?: string;
  }): void {
    this.prepare(`
      INSERT INTO chat_messages (id, session_id, content, source, direction, employee_id, external_chat_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      this.generateId(),
      options.sessionId || 'default',
      options.content,
      options.source,
      options.direction,
      options.employeeId || null,
      options.chatId || null,
      Date.now()
    );
  }

  // ============================================================================
  // 聊天历史
  // ============================================================================

  getChatHistory(chatId: string, limit: number = 10): Array<{
    role: string;
    content: string;
  }> {
    // 优先按 chatId 查询，其次按 session_id 查询（兼容旧数据）
    const messages = this.prepare(`
      SELECT direction, content
      FROM chat_messages
      WHERE external_chat_id = ? OR session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(chatId, chatId, limit) as any[];

    // direction: in = user, out = assistant
    return messages.reverse().map(m => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.content,
    }));
  }

  // ============================================================================
  // Employee
  // ============================================================================

  createEmployee(employee: {
    id: string;
    name: string;
    role: string;
    systemPrompt: string;
    model?: string;
  }): void {
    this.prepare(`
      INSERT INTO employees (id, name, role, system_prompt, model, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(
      employee.id,
      employee.name,
      employee.role,
      employee.systemPrompt,
      employee.model || 'claude-3-5-20241022',
      Date.now()
    );
  }

  getEmployee(id: string): any {
    return this.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  }

  listEmployees(filters?: { status?: string }): any[] {
    let sql = 'SELECT * FROM employees WHERE 1=1';
    const params: any[] = [];

    if (filters?.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY created_at DESC';

    return this.prepare(sql).all(...params);
  }

  // ============================================================================
  // Humans (人类档案)
  // ============================================================================

  /**
   * 将数据库行映射为 Human 对象（处理 snake_case 到 camelCase 的转换）
   */
  private mapRowToHuman(row: any): any {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      gender: row.gender,
      location: row.location,
      birthday: row.birthday,
      appearance: row.appearance,
      personality_traits: row.personality_traits,
      hobbies: row.hobbies,
      work_preferences: row.work_preferences,
      skills: row.skills,
      weaknesses: row.weaknesses,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  createHuman(human: {
    id: string;
    name: string;
    gender?: string;
    location?: string;
    birthday?: string;
    appearance?: string;
    personalityTraits?: string;
    hobbies?: string;
    workPreferences?: string;
    skills?: string;
    weaknesses?: string;
    notes?: string;
  }): any {
    const now = Date.now();
    this.prepare(`
      INSERT INTO humans (id, name, gender, location, birthday, appearance,
                          personality_traits, hobbies, work_preferences, skills,
                          weaknesses, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      human.id,
      human.name,
      human.gender || null,
      human.location || null,
      human.birthday || null,
      human.appearance || null,
      human.personalityTraits || null,
      human.hobbies || null,
      human.workPreferences || null,
      human.skills || null,
      human.weaknesses || null,
      human.notes || null,
      now,
      now
    );
    return this.getHuman(human.id);
  }

  getHuman(id: string): any {
    const row = this.prepare('SELECT * FROM humans WHERE id = ?').get(id);
    return this.mapRowToHuman(row);
  }

  listHumans(filters?: { gender?: string; location?: string }): any[] {
    let sql = 'SELECT * FROM humans WHERE 1=1';
    const params: any[] = [];

    if (filters?.gender) {
      sql += ' AND gender = ?';
      params.push(filters.gender);
    }
    if (filters?.location) {
      sql += ' AND location LIKE ?';
      params.push(`%${filters.location}%`);
    }

    sql += ' ORDER BY created_at DESC';

    const rows = this.prepare(sql).all(...params);
    return rows.map((row: any) => this.mapRowToHuman(row));
  }

  updateHuman(id: string, updates: {
    name?: string;
    gender?: string;
    location?: string;
    birthday?: string;
    appearance?: string;
    personalityTraits?: string;
    hobbies?: string;
    workPreferences?: string;
    skills?: string;
    weaknesses?: string;
    notes?: string;
  }): void {
    const updatesArray: string[] = [];
    const params: any[] = [];

    if (updates.name !== undefined) {
      updatesArray.push('name = ?');
      params.push(updates.name);
    }
    if (updates.gender !== undefined) {
      updatesArray.push('gender = ?');
      params.push(updates.gender);
    }
    if (updates.location !== undefined) {
      updatesArray.push('location = ?');
      params.push(updates.location);
    }
    if (updates.birthday !== undefined) {
      updatesArray.push('birthday = ?');
      params.push(updates.birthday);
    }
    if (updates.appearance !== undefined) {
      updatesArray.push('appearance = ?');
      params.push(updates.appearance);
    }
    if (updates.personalityTraits !== undefined) {
      updatesArray.push('personality_traits = ?');
      params.push(updates.personalityTraits);
    }
    if (updates.hobbies !== undefined) {
      updatesArray.push('hobbies = ?');
      params.push(updates.hobbies);
    }
    if (updates.workPreferences !== undefined) {
      updatesArray.push('work_preferences = ?');
      params.push(updates.workPreferences);
    }
    if (updates.skills !== undefined) {
      updatesArray.push('skills = ?');
      params.push(updates.skills);
    }
    if (updates.weaknesses !== undefined) {
      updatesArray.push('weaknesses = ?');
      params.push(updates.weaknesses);
    }
    if (updates.notes !== undefined) {
      updatesArray.push('notes = ?');
      params.push(updates.notes);
    }

    if (updatesArray.length === 0) return;

    params.push(id);

    const sql = `UPDATE humans SET ${updatesArray.join(', ')} WHERE id = ?`;
    this.prepare(sql).run(...params);
  }

  deleteHuman(id: string): void {
    this.prepare('DELETE FROM humans WHERE id = ?').run(id);
  }

  searchHumans(keyword: string): any[] {
    const sql = `
      SELECT * FROM humans
      WHERE name LIKE ?
         OR location LIKE ?
         OR skills LIKE ?
         OR notes LIKE ?
      ORDER BY created_at DESC
    `;
    const pattern = `%${keyword}%`;
    const rows = this.prepare(sql).all(pattern, pattern, pattern, pattern);
    return rows.map((row: any) => this.mapRowToHuman(row));
  }

  // ============================================================================
  // Milestone Report
  // ============================================================================

  createMilestoneReport(options: {
    eventType: string;
    title: string;
    content: string;
    chatId?: string;
  }): void {
    this.prepare(`
      INSERT INTO milestone_reports (id, event_type, title, content, chat_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      this.generateId(),
      options.eventType,
      options.title,
      options.content,
      options.chatId || null,
      Date.now()
    );
  }

  getPendingMilestoneReports(): any[] {
    return this.prepare(`
      SELECT * FROM milestone_reports WHERE status = 'pending' ORDER BY created_at ASC
    `).all();
  }

  markMilestoneReportSent(id: string): void {
    this.prepare('UPDATE milestone_reports SET status = ?, sent_at = ? WHERE id = ?')
      .run('sent', Date.now(), id);
  }

  // ============================================================================
  // 熔断器状态持久化
  // ============================================================================

  /**
   * 保存熔断器状态
   */
  saveCircuitBreakerState(providerType: string, state: {
    state: string;
    failureCount: number;
    successCount: number;
    lastFailureTime?: number;
    lastStateChange: number;
    halfOpenCalls: number;
  }): void {
    const now = Date.now();
    this.prepare(`
      INSERT INTO circuit_breaker_states (
        provider_type, state, failure_count, success_count,
        last_failure_time, last_state_change, half_open_calls,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_type) DO UPDATE SET
        state = excluded.state,
        failure_count = excluded.failure_count,
        success_count = excluded.success_count,
        last_failure_time = excluded.last_failure_time,
        last_state_change = excluded.last_state_change,
        half_open_calls = excluded.half_open_calls,
        updated_at = excluded.updated_at
    `).run(
      providerType,
      state.state,
      state.failureCount,
      state.successCount,
      state.lastFailureTime || null,
      state.lastStateChange,
      state.halfOpenCalls,
      now,
      now
    );
  }

  /**
   * 获取熔断器状态
   */
  getCircuitBreakerState(providerType: string): {
    state: string;
    failureCount: number;
    successCount: number;
    lastFailureTime?: number;
    lastStateChange: number;
    halfOpenCalls: number;
  } | null {
    const row = this.prepare(`
      SELECT state, failure_count, success_count, last_failure_time,
             last_state_change, half_open_calls
      FROM circuit_breaker_states
      WHERE provider_type = ?
    `).get(providerType) as any | undefined;

    if (!row) return null;

    return {
      state: row.state,
      failureCount: row.failure_count,
      successCount: row.success_count,
      lastFailureTime: row.last_failure_time,
      lastStateChange: row.last_state_change,
      halfOpenCalls: row.half_open_calls,
    };
  }

  /**
   * 获取所有熔断器状态
   */
  getAllCircuitBreakerStates(): Map<string, {
    state: string;
    failureCount: number;
    successCount: number;
    lastFailureTime?: number;
    lastStateChange: number;
    halfOpenCalls: number;
  }> {
    const rows = this.prepare(`
      SELECT provider_type, state, failure_count, success_count,
             last_failure_time, last_state_change, half_open_calls
      FROM circuit_breaker_states
    `).all() as any[];

    const states = new Map();
    for (const row of rows) {
      states.set(row.provider_type, {
        state: row.state,
        failureCount: row.failure_count,
        successCount: row.success_count,
        lastFailureTime: row.last_failure_time,
        lastStateChange: row.last_state_change,
        halfOpenCalls: row.half_open_calls,
      });
    }
    return states;
  }

  /**
   * 删除熔断器状态
   */
  deleteCircuitBreakerState(providerType: string): void {
    this.prepare('DELETE FROM circuit_breaker_states WHERE provider_type = ?')
      .run(providerType);
  }

  // ============================================================================
  // 工具方法
  // ============================================================================

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 计算下次运行时间（基于 cron 表达式）
   *
   * 支持的 cron 格式：
   * - * * * * * (每分钟)
   * - 0 * * * * (每小时)
   * - 0 0 * * * (每天午夜)
   * - 0 0 * * 0 (每周日午夜)
   * - 0 0 1 * * (每月1号午夜)
   * - 每5分钟: {step}/5 * * * *
   * - 每2小时: 0 {step}/2 * * *
   * - 30 9 * * 1-5 (周一到周五上午9:30)
   */
  private calculateNextRun(cronRule: string): number {
    try {
      const now = new Date();
      const parts = cronRule.trim().split(/\s+/);

      if (parts.length !== 5) {
        console.warn(`[Database] Invalid cron format: ${cronRule}, using default 1 hour`);
        return Date.now() + 3600000;
      }

      const [minutePart, hourPart, dayPart, monthPart, weekdayPart] = parts;

      // 解析各部分
      const minutes = this.parseCronPart(minutePart, 0, 59);
      const hours = this.parseCronPart(hourPart, 0, 23);
      const days = this.parseCronPart(dayPart, 1, 31);
      const months = this.parseCronPart(monthPart, 1, 12);
      const weekdays = this.parseCronPart(weekdayPart, 0, 6); // 0=周日, 6=周六

      // 查找下一个匹配的时间
      return this.findNextMatch(now, { minutes, hours, days, months, weekdays });
    } catch (error: any) {
      console.error(`[Database] Error parsing cron rule '${cronRule}':`, error.message);
      // Fallback: 1小时后
      return Date.now() + 3600000;
    }
  }

  /**
   * 解析 cron 部分为数值数组
   */
  private parseCronPart(part: string, min: number, max: number): number[] {
    const values: number[] = [];

    // 处理通配符
    if (part === '*') {
      for (let i = min; i <= max; i++) values.push(i);
      return values;
    }

    // 处理范围 (1-5)
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]);
      const end = parseInt(rangeMatch[2]);
      for (let i = Math.max(min, start); i <= Math.min(max, end); i++) {
        values.push(i);
      }
      return values;
    }

    // 处理步长 */n 或 1-5/n
    const stepMatch = part.match(/^\*\/(\d+)$|^(\d+)-(\d+)\/(\d+)$/);
    if (stepMatch) {
      if (stepMatch[1]) {
        // */n 格式
        const step = parseInt(stepMatch[1]);
        for (let i = min; i <= max; i += step) values.push(i);
      } else {
        // start-end/step 格式
        const start = parseInt(stepMatch[2]);
        const end = parseInt(stepMatch[3]);
        const step = parseInt(stepMatch[4]);
        for (let i = Math.max(min, start); i <= Math.min(max, end); i += step) {
          values.push(i);
        }
      }
      return values;
    }

    // 处理列表 (1,2,3)
    if (part.includes(',')) {
      const items = part.split(',');
      for (const item of items) {
        const val = parseInt(item.trim());
        if (!isNaN(val) && val >= min && val <= max) {
          values.push(val);
        }
      }
      return values.length > 0 ? values : [min];
    }

    // 单个数值
    const val = parseInt(part);
    if (!isNaN(val) && val >= min && val <= max) {
      return [val];
    }

    // Fallback
    console.warn(`[Database] Invalid cron part: ${part}, using range ${min}-${max}`);
    for (let i = min; i <= max; i++) values.push(i);
    return values;
  }

  /**
   * 查找下一个匹配 cron 规则的时间
   */
  private findNextMatch(
    from: Date,
    schedule: { minutes: number[]; hours: number[]; days: number[]; months: number[]; weekdays: number[] }
  ): number {
    // 从下一分钟开始搜索
    let current = new Date(from);
    current.setSeconds(0, 0);
    current.setMinutes(current.getMinutes() + 1);

    // 搜索最多 4 年（避免无限循环）
    const maxAttempts = 365 * 4 * 24 * 60; // 4年的分钟数
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;

      const year = current.getFullYear();
      const month = current.getMonth() + 1; // 1-12
      const day = current.getDate();
      const hour = current.getHours();
      const minute = current.getMinutes();
      const weekday = current.getDay(); // 0-6

      // 检查月份
      if (!schedule.months.includes(month)) {
        current.setMonth(current.getMonth() + 1);
        current.setDate(1);
        current.setHours(0, 0, 0, 0);
        continue;
      }

      // 检查日期（支持 day 和 weekday）
      const dayMatch = schedule.days.includes(day);
      const weekdayMatch = schedule.weekdays.includes(weekday);
      const daySpecified = schedule.days.length < 31; // 不是所有天
      const weekdaySpecified = schedule.weekdays.length < 7; // 不是所有星期

      // 如果同时指定了 day 和 weekday，需要 OR 逻辑（cron 标准）
      // 如果只指定了其中一个，检查对应的
      let dayOk = true;
      if (daySpecified && weekdaySpecified) {
        dayOk = dayMatch || weekdayMatch;
      } else if (daySpecified) {
        dayOk = dayMatch;
      } else if (weekdaySpecified) {
        dayOk = weekdayMatch;
      }

      if (!dayOk) {
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
        continue;
      }

      // 检查小时
      if (!schedule.hours.includes(hour)) {
        current.setHours(current.getHours() + 1);
        current.setMinutes(0, 0, 0);
        continue;
      }

      // 检查分钟
      if (!schedule.minutes.includes(minute)) {
        current.setMinutes(current.getMinutes() + 1);
        continue;
      }

      // 找到匹配
      return current.getTime();
    }

    // 没找到匹配（理论上不应该发生），返回 1 小时后
    console.warn(`[Database] Could not find next match for cron schedule, using 1 hour fallback`);
    return Date.now() + 3600000;
  }
}

// 单例
let dbInstance: AIDatabase | null = null;

/**
 * 获取数据库实例
 * @param dbPath 可选的数据库路径，如果不提供则从配置中读取
 */
export function getDatabase(dbPath?: string): AIDatabase {
  if (!dbInstance) {
    // 如果没有提供 dbPath，尝试从配置中读取
    if (!dbPath) {
      try {
        const { getConfigManager } = require('../config/ConfigManager.js');
        const configManager = getConfigManager();
        const config = configManager.getConfig();
        if (config?.workdir) {
          const path = require('path');
          dbPath = path.join(config.workdir, 'company.db');
        }
      } catch (error) {
        // 配置不存在时使用默认路径
      }
    }
    dbInstance = new AIDatabase(dbPath);
  } else if (dbPath && dbInstance.getDbPath() !== dbPath) {
    // 如果传入的 dbPath 与当前实例不同，关闭当前实例并创建新实例
    console.log(`[Database] 数据库路径变化：${dbInstance.getDbPath()} -> ${dbPath}`);
    dbInstance.close();
    dbInstance = new AIDatabase(dbPath);
  }
  return dbInstance;
}

/**
 * 初始化数据库（显式调用）
 */
export function initDatabase(dbPath?: string): AIDatabase {
  dbInstance = new AIDatabase(dbPath);
  return dbInstance;
}

/**
 * 重置数据库
 */
export function resetDatabase(dbPath?: string): void {
  const db = new AIDatabase(dbPath);
  db.reset();
}

/**
 * 关闭数据库（优雅关闭，会执行 WAL checkpoint）
 */
export function shutdownDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
