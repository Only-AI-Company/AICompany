/**
 * AI Company v2 - 数据库访问层
 *
 * 简单的数据库封装，提供基本的CRUD操作
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initSeeds } from './seeds/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class AIDatabase {
  private db: Database.Database;

  constructor(dbPath: string = join(__dirname, '../../data/company.db')) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
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
   * 准备语句
   */
  prepare(sql: string): any {
    return this.db.prepare(sql);
  }

  /**
   * 执行SQL
   */
  exec(sql: string): void {
    this.db.exec(sql);
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
    const params: any[] = [status, now];

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
    const messages = this.prepare(`
      SELECT direction, content
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(chatId, limit) as any[];

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
  // 工具方法
  // ============================================================================

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private calculateNextRun(cronRule: string): number {
    // 简化版：返回1小时后
    // TODO: 使用 cron-parser 库正确计算
    return Date.now() + 3600000;
  }
}

// 单例
let dbInstance: AIDatabase | null = null;

export function getDatabase(dbPath?: string): AIDatabase {
  if (!dbInstance) {
    dbInstance = new AIDatabase(dbPath);
  }
  return dbInstance;
}
