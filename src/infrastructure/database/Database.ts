/**
 * AI Company - Database Client
 */

import Database from 'better-sqlite3';
import type { Database as DbType, Statement } from 'better-sqlite3';
import { join, dirname, resolve } from 'path';
import { mkdirSync, existsSync } from 'fs';
import type * as Types from '../../types/index.js';
import type { HumanProfile, CreateHumanInput } from '../../types/human.js';
import { getPaths } from '../config/index.js';

export class AIDatabase {
  private db: Database.Database;

  constructor() {
    const envBaseDir = process.env.AI_COMPANY_WORKDIR || process.env.AI_COMPANY_BASE_DIR;
    const baseDir = envBaseDir && envBaseDir.trim().length > 0
      ? resolve(envBaseDir)
      : join(process.env.HOME || '', '.ai-company');
    const dbPath = join(baseDir, 'data.db');
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  initialize(schema: string) { this.db.exec(schema); }
  close() { this.db.close(); }
  transaction<T>(fn: () => T) { return this.db.transaction(fn)(); }

  // Raw database access for advanced queries
  exec(sql: string) { this.db.exec(sql); }
  prepare(sql: string): Statement { return this.db.prepare(sql); }
  getDatabase(): DbType { return this.db; }

  // Employees
  createEmployee(input: Types.CreateEmployeeInput): Types.Employee {
    const id = `emp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const systemPrompt = `你是${input.name}，一名${input.role}。以专业能力完成任务，与同事协作达成目标。`;

    // 获取默认模型（从配置或使用硬编码默认值）
    let defaultModel = 'claude-opus-4-6';
    try {
      // 动态导入避免循环依赖
      const { getConfigService } = require('../config/ConfigService.js');
      const config = getConfigService(this);
      const configuredModel = config.get('model.default');
      if (configuredModel) {
        defaultModel = configuredModel as string;
      }
    } catch {
      // 配置服务未初始化，使用默认值
    }

    const stmt = this.db.prepare(`
      INSERT INTO employees (
        id, name, nickname, avatar, role, backstory, model, system_prompt,
        base_personality, temperature, status, last_active, hire_date, birth_date,
        favorite_tasks, weaknesses, strengths, human_id, display_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      stmt.run(
        id,
        input.name,
        input.nickname || null,
        input.avatar || null,
        input.role,
        input.backstory || null,
        input.model || defaultModel,
        systemPrompt,
        input.base_personality || null,
        input.temperature ?? null,
        'active',
        now,
        now,
        now,
        input.favorite_tasks || null,
        input.weaknesses || null,
        null,
        input.human_id || null,
        input.display_name || null
      );
    } catch (e: any) {
      if (e.code !== 'SQLITE_CONSTRAINT') throw e;
      // ID 冲突，重新生成
      return this.createEmployee(input);
    }
    return this.getEmployee(id)!;
  }

  getEmployee(id: string): Types.Employee | undefined {
    return this.db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as Types.Employee | undefined;
  }

  getAllEmployees(): Types.Employee[] {
    return this.db.prepare('SELECT * FROM employees ORDER BY hire_date DESC').all() as Types.Employee[];
  }

  updateEmployee(id: string, input: Types.UpdateEmployeeInput): Types.Employee | undefined {
    const fields: string[] = [];
    const values: unknown[] = [];
    const hasField = (key: keyof Types.UpdateEmployeeInput) => Object.prototype.hasOwnProperty.call(input, key);

    if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
    if (input.nickname !== undefined) { fields.push('nickname = ?'); values.push(input.nickname); }
    if (input.avatar !== undefined) { fields.push('avatar = ?'); values.push(input.avatar); }
    if (input.role !== undefined) { fields.push('role = ?'); values.push(input.role); }
    if (input.personality !== undefined) { fields.push('personality = ?'); values.push(JSON.stringify(input.personality)); }
    if (input.backstory !== undefined) { fields.push('backstory = ?'); values.push(input.backstory); }
    if (input.model !== undefined) { fields.push('model = ?'); values.push(input.model); }
    if (input.system_prompt !== undefined) { fields.push('system_prompt = ?'); values.push(input.system_prompt); }
    if (input.base_personality !== undefined) { fields.push('base_personality = ?'); values.push(input.base_personality); }
    if (input.temperature !== undefined) { fields.push('temperature = ?'); values.push(input.temperature); }
    if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }
    if (hasField('current_task')) { fields.push('current_task = ?'); values.push(input.current_task ?? null); }
    if (input.current_mood !== undefined) { fields.push('current_mood = ?'); values.push(input.current_mood); }
    if (input.last_active !== undefined) { fields.push('last_active = ?'); values.push(input.last_active); }
    if (input.score !== undefined) { fields.push('score = ?'); values.push(input.score); }
    if (input.completed_tasks !== undefined) { fields.push('completed_tasks = ?'); values.push(input.completed_tasks); }
    if (input.failed_tasks !== undefined) { fields.push('failed_tasks = ?'); values.push(input.failed_tasks); }
    if (input.average_quality !== undefined) { fields.push('average_quality = ?'); values.push(input.average_quality); }
    if (input.total_earnings !== undefined) { fields.push('total_earnings = ?'); values.push(input.total_earnings); }
    if (input.level !== undefined) { fields.push('level = ?'); values.push(input.level); }
    if (input.total_hours !== undefined) { fields.push('total_hours = ?'); values.push(input.total_hours); }
    if (input.favorite_tasks !== undefined) {
      const favoriteTasks = Array.isArray(input.favorite_tasks)
        ? JSON.stringify(input.favorite_tasks)
        : input.favorite_tasks;
      fields.push('favorite_tasks = ?');
      values.push(favoriteTasks);
    }
    if (input.weaknesses !== undefined) {
      const weaknesses = Array.isArray(input.weaknesses)
        ? JSON.stringify(input.weaknesses)
        : input.weaknesses;
      fields.push('weaknesses = ?');
      values.push(weaknesses);
    }
    if (input.strengths !== undefined) {
      const strengths = Array.isArray(input.strengths)
        ? JSON.stringify(input.strengths)
        : input.strengths;
      fields.push('strengths = ?');
      values.push(strengths);
    }
    if (input.human_id !== undefined) { fields.push('human_id = ?'); values.push(input.human_id); }
    if (input.display_name !== undefined) { fields.push('display_name = ?'); values.push(input.display_name); }
    if (fields.length === 0) return this.getEmployee(id);
    values.push(id);
    this.db.prepare(`UPDATE employees SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getEmployee(id);
  }

  deleteEmployee(id: string): boolean {
    const result = this.db.prepare('DELETE FROM employees WHERE id = ?').run(id);
    return result.changes > 0;
  }

  upsertEmployeeAgent(input: Types.CreateEmployeeAgentInput): Types.EmployeeAgentMapping {
    const now = Date.now();
    const id = input.id || `emp-agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const stmt = this.db.prepare(`
      INSERT INTO employee_agents (
        id, employee_id, agent_name, scope, config_path, status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id) DO UPDATE SET
        agent_name = excluded.agent_name,
        scope = excluded.scope,
        config_path = excluded.config_path,
        status = excluded.status,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at,
        created_at = employee_agents.created_at
    `);
    stmt.run(
      id,
      input.employee_id,
      input.agent_name,
      input.scope,
      input.config_path,
      input.status,
      input.metadata_json || null,
      now,
      now
    );
    return this.getEmployeeAgentByEmployeeId(input.employee_id)!;
  }

  getEmployeeAgentByEmployeeId(employeeId: string): Types.EmployeeAgentMapping | undefined {
    return this.db.prepare('SELECT * FROM employee_agents WHERE employee_id = ?').get(employeeId) as Types.EmployeeAgentMapping | undefined;
  }

  getEmployeeAgentByAgentName(agentName: string, scope?: 'user' | 'project'): Types.EmployeeAgentMapping | undefined {
    if (scope) {
      return this.db.prepare('SELECT * FROM employee_agents WHERE agent_name = ? AND scope = ?').get(agentName, scope) as Types.EmployeeAgentMapping | undefined;
    }
    return this.db.prepare('SELECT * FROM employee_agents WHERE agent_name = ?').get(agentName) as Types.EmployeeAgentMapping | undefined;
  }

  listEmployeeAgents(): Types.EmployeeAgentMapping[] {
    return this.db.prepare('SELECT * FROM employee_agents ORDER BY updated_at DESC').all() as Types.EmployeeAgentMapping[];
  }

  deleteEmployeeAgent(employeeId: string): boolean {
    const result = this.db.prepare('DELETE FROM employee_agents WHERE employee_id = ?').run(employeeId);
    return result.changes > 0;
  }

  // Tasks
  createTask(input: Types.CreateTaskInput): Types.Task {
    const id = `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const paths = getPaths(this);
    const workDir = input.work_dir || join(paths.getOutputsPath(), 'tasks', id);
    const contextJson = input.context ? JSON.stringify(input.context) : null;
    const contextCheckpointId = input.context?.checkpointId || null;
    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, type, description, work_dir, plan_file_path, branch_name,
        status, priority, requested_by, owner_id, parent_task_id, context_json,
        context_checkpoint_id, created_at, estimated_duration, due_date, acceptance_criteria,
        owner_feedback
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      input.type,
      input.description,
      workDir,
      input.plan_file_path || null,
      input.branch_name || null,
      input.status || 'pending_owner',
      input.priority,
      input.requested_by,
      input.owner_id || null,
      input.parent_task_id || null,
      contextJson,
      contextCheckpointId,
      now,
      input.estimated_duration || null,
      input.due_date || null,
      input.acceptance_criteria || null,
      null
    );
    return this.getTask(id)!;
  }

  getTask(id: string): Types.Task | undefined {
    return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Types.Task | undefined;
  }

  getAllTasks(): Types.Task[] {
    return this.db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as Types.Task[];
  }

  assignTask(taskId: string, employeeId: string): void {
    const now = Date.now();
    this.db.prepare('UPDATE tasks SET assigned_to = ?, assigned_at = ?, status = ? WHERE id = ?')
      .run(employeeId, now, 'assigned', taskId);
    this.addTaskEmployee(taskId, employeeId);
  }

  updateTaskStatus(taskId: string, status: Types.TaskStatus, lastError?: string): void {
    const task = this.getTask(taskId);
    const fields: string[] = ['status = ?'];
    const values: unknown[] = [status];

    if ((status === 'executing' || status === 'in_progress') && !task?.started_at) {
      fields.push('started_at = ?');
      values.push(Date.now());
    }

    if ((status === 'completed' || status === 'failed') && !task?.completed_at) {
      fields.push('completed_at = ?');
      values.push(Date.now());
    }

    if (lastError !== undefined) {
      fields.push('last_error = ?');
      values.push(lastError);
    }

    values.push(taskId);
    this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  updateTaskFields(taskId: string, fields: Partial<Pick<Types.Task, 'description' | 'due_date' | 'acceptance_criteria' | 'owner_id' | 'owner_feedback' | 'artifacts_json'>>): void {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (fields.description !== undefined) {
      updates.push('description = ?');
      values.push(fields.description);
    }
    if (fields.due_date !== undefined) {
      updates.push('due_date = ?');
      values.push(fields.due_date);
    }
    if (fields.acceptance_criteria !== undefined) {
      updates.push('acceptance_criteria = ?');
      values.push(fields.acceptance_criteria);
    }
    if (fields.owner_id !== undefined) {
      updates.push('owner_id = ?');
      values.push(fields.owner_id);
    }
    if (fields.owner_feedback !== undefined) {
      updates.push('owner_feedback = ?');
      values.push(fields.owner_feedback);
    }
    if (fields.artifacts_json !== undefined) {
      updates.push('artifacts_json = ?');
      values.push(fields.artifacts_json);
    }

    if (updates.length === 0) {
      return;
    }

    values.push(taskId);
    this.db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  addTaskEmployee(taskId: string, employeeId: string, assignedPart?: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO task_employees (task_id, employee_id, assigned_part, assigned_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(taskId, employeeId, assignedPart || null, Date.now());
  }

  getTaskEmployees(taskId: string): Types.TaskEmployee[] {
    return this.db.prepare(`
      SELECT task_id, employee_id, assigned_part, assigned_at
      FROM task_employees
      WHERE task_id = ?
      ORDER BY assigned_at ASC
    `).all(taskId) as Types.TaskEmployee[];
  }

  createGoal(input: Types.CreateGoalInput): Types.Goal {
    const id = `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO goals (
        id, type, title, description, status, owner_id, parent_goal_id,
        due_date, acceptance_criteria, owner_feedback, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      input.type,
      input.title,
      input.description || null,
      input.status || 'pending_owner',
      input.owner_id || null,
      input.parent_goal_id || null,
      input.due_date || null,
      input.acceptance_criteria || null,
      null,
      now,
      now
    );
    return this.getGoal(id)!;
  }

  getGoal(id: string): Types.Goal | undefined {
    return this.db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as Types.Goal | undefined;
  }

  getGoalsByStatus(status: Types.GoalStatus): Types.Goal[] {
    return this.db.prepare('SELECT * FROM goals WHERE status = ? ORDER BY created_at DESC').all(status) as Types.Goal[];
  }

  getAllGoals(): Types.Goal[] {
    return this.db.prepare('SELECT * FROM goals ORDER BY created_at DESC').all() as Types.Goal[];
  }

  updateGoalStatus(goalId: string, status: Types.GoalStatus): void {
    this.db.prepare('UPDATE goals SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Date.now(), goalId);
  }

  updateGoalFields(goalId: string, fields: Partial<Pick<Types.Goal, 'title' | 'description' | 'due_date' | 'acceptance_criteria' | 'owner_id' | 'owner_feedback'>>): void {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (fields.title !== undefined) {
      updates.push('title = ?');
      values.push(fields.title);
    }
    if (fields.description !== undefined) {
      updates.push('description = ?');
      values.push(fields.description);
    }
    if (fields.due_date !== undefined) {
      updates.push('due_date = ?');
      values.push(fields.due_date);
    }
    if (fields.acceptance_criteria !== undefined) {
      updates.push('acceptance_criteria = ?');
      values.push(fields.acceptance_criteria);
    }
    if (fields.owner_id !== undefined) {
      updates.push('owner_id = ?');
      values.push(fields.owner_id);
    }
    if (fields.owner_feedback !== undefined) {
      updates.push('owner_feedback = ?');
      values.push(fields.owner_feedback);
    }

    if (updates.length === 0) {
      return;
    }

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(goalId);
    this.db.prepare(`UPDATE goals SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  createGoalPlan(goalId: string, content: string, version: number, status: Types.GoalPlanStatus = 'pending_owner'): Types.GoalPlan {
    const id = `goal-plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO goal_plans (id, goal_id, version, content, status, owner_feedback, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, goalId, version, content, status, null, now, now);
    return this.getGoalPlan(id)!;
  }

  getGoalPlan(id: string): Types.GoalPlan | undefined {
    return this.db.prepare('SELECT * FROM goal_plans WHERE id = ?').get(id) as Types.GoalPlan | undefined;
  }

  getGoalPlans(goalId: string): Types.GoalPlan[] {
    return this.db.prepare('SELECT * FROM goal_plans WHERE goal_id = ? ORDER BY version DESC').all(goalId) as Types.GoalPlan[];
  }

  updateGoalPlanStatus(planId: string, status: Types.GoalPlanStatus, ownerFeedback?: string): void {
    if (ownerFeedback !== undefined) {
      this.db.prepare('UPDATE goal_plans SET status = ?, owner_feedback = ?, updated_at = ? WHERE id = ?')
        .run(status, ownerFeedback, Date.now(), planId);
      return;
    }
    this.db.prepare('UPDATE goal_plans SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Date.now(), planId);
  }

  // Skills
  cacheSkill(skill: Omit<Types.Skill, 'cached_at' | 'usage_count'>): Types.Skill {
    const stmt = this.db.prepare(`
      INSERT INTO skills (id, name, category, description, system_prompt, version, cached_at, usage_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);
    stmt.run(skill.id, skill.name, skill.category, skill.description, skill.system_prompt, skill.version, Date.now());
    return this.getSkill(skill.id)!;
  }

  getSkill(id: string): Types.Skill | undefined {
    return this.db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as Types.Skill | undefined;
  }

  getAllSkills(): Types.Skill[] {
    return this.db.prepare('SELECT * FROM skills ORDER BY usage_count DESC').all() as Types.Skill[];
  }

  // Employee Skills (stored as JSON in employees.strengths field)
  addEmployeeSkill(employeeId: string, skill: { name: string; version?: string }): void {
    const employee = this.getEmployee(employeeId);
    if (!employee) throw new Error(`Employee not found: ${employeeId}`);

    const strengths = employee.strengths ? JSON.parse(employee.strengths) : [];
    if (!strengths.includes(skill.name)) {
      strengths.push(skill.name);
      this.updateEmployee(employeeId, { strengths });
    }
  }

  getEmployeeSkills(employeeId: string): Array<{ name: string; version: string | null; equipped_at: number }> {
    const employee = this.getEmployee(employeeId);
    if (!employee) return [];

    const strengths = employee.strengths ? JSON.parse(employee.strengths) : [];
    return strengths.map((name: string, idx: number) => ({
      name,
      version: null,
      equipped_at: Date.now() - (idx * 1000), // 模拟装备时间
    }));
  }

  removeEmployeeSkill(employeeId: string, skillName: string): void {
    const employee = this.getEmployee(employeeId);
    if (!employee) return;

    const strengths = employee.strengths ? JSON.parse(employee.strengths) : [];
    const filtered = strengths.filter((s: string) => s !== skillName);
    this.updateEmployee(employeeId, { strengths: filtered });
  }

  // 批量获取员工技能（从 employees.strengths JSON 字段）
  getEmployeeSkillsBatch(employeeIds: string[]): Map<string, string[]> {
    const skillsMap = new Map<string, string[]>();

    for (const id of employeeIds) {
      const employee = this.getEmployee(id);
      if (employee && employee.strengths) {
        try {
          const strengths = JSON.parse(employee.strengths);
          skillsMap.set(id, Array.isArray(strengths) ? strengths : []);
        } catch {
          skillsMap.set(id, []);
        }
      } else {
        skillsMap.set(id, []);
      }
    }

    return skillsMap;
  }

  getEmployeesWithSkillsAndMemories(): Array<{
    employee: Types.Employee;
    skills: Array<{ name: string; version?: string | null }>;
    memories: Types.Memory[];
  }> {
    const employees = this.getAllEmployees();
    if (employees.length === 0) {
      return [];
    }

    const employeeIds = employees.map(employee => employee.id);
    const skillsMap = this.getEmployeeSkillsBatch(employeeIds);
    const memoriesMap = new Map<string, Types.Memory[]>();

    const placeholders = employeeIds.map(() => '?').join(',');
    const memoryRows = this.db.prepare(
      `SELECT * FROM memories WHERE employee_id IN (${placeholders}) ORDER BY timestamp DESC`
    ).all(...employeeIds) as Types.Memory[];

    for (const memory of memoryRows) {
      if (!memoriesMap.has(memory.employee_id)) {
        memoriesMap.set(memory.employee_id, []);
      }
      memoriesMap.get(memory.employee_id)!.push(memory);
    }

    employeeIds.forEach(id => {
      if (!memoriesMap.has(id)) {
        memoriesMap.set(id, []);
      }
    });

    return employees.map(employee => ({
      employee,
      skills: (skillsMap.get(employee.id) || []).map(name => ({ name })),
      memories: memoriesMap.get(employee.id) || [],
    }));
  }

  // 获取员工的任务（优化 N+1 查询）
  getEmployeeTasksDescriptions(employeeId: string, limit: number = 10): string[] {
    const rows = this.db.prepare(
      'SELECT description FROM tasks WHERE assigned_to = ? ORDER BY created_at DESC LIMIT ?'
    ).all(employeeId, limit) as Array<{ description: string }>;
    return rows.map(r => r.description);
  }

  getAllWorkflows(): Types.Task[] {
    return this.getAllTasks();
  }

  // Tasks by Employee (for skill analysis)
  getTasksByEmployee(employeeId: string): Types.Task[] {
    return this.db.prepare(`
      SELECT * FROM tasks WHERE assigned_to = ? AND status NOT IN ('completed', 'cancelled')
      ORDER BY created_at DESC
    `).all(employeeId) as Types.Task[];
  }

  // Memories
  createMemory(input: Types.CreateMemoryInput): Types.Memory {
    const embedding = input.embedding ? input.embedding.toString('base64') : null;
    const stmt = this.db.prepare(`
      INSERT INTO memories (employee_id, type, content, timestamp, task_id, importance, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      input.employee_id,
      input.type,
      input.content,
      Date.now(),
      input.task_id || null,
      input.importance || 0.5,
      embedding
    );
    return this.getMemory(result.lastInsertRowid as number)!;
  }

  getMemory(id: number): Types.Memory | undefined {
    return this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Types.Memory | undefined;
  }

  getEmployeeMemories(employeeId: string): Types.Memory[] {
    return this.db.prepare('SELECT * FROM memories WHERE employee_id = ? ORDER BY timestamp DESC').all(employeeId) as Types.Memory[];
  }

  // Conversations
  createConversation(sessionId: string, employeeId: string, role: 'user' | 'employee', content: string): Types.Conversation {
    const stmt = this.db.prepare(`
      INSERT INTO conversations (session_id, employee_id, role, content, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(sessionId, employeeId, role, content, Date.now());
    return this.getConversation(result.lastInsertRowid as number)!;
  }

  getConversation(id: number): Types.Conversation | undefined {
    return this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Types.Conversation | undefined;
  }

  getSessionConversations(sessionId: string): Types.Conversation[] {
    return this.db.prepare('SELECT * FROM conversations WHERE session_id = ? ORDER BY timestamp ASC').all(sessionId) as Types.Conversation[];
  }

  // Chat Messages
  createChatMessage(input: Types.CreateChatMessageInput): Types.ChatMessage {
    const stmt = this.db.prepare(`
      INSERT INTO chat_messages (
        session_id, content, source, direction, message_type,
        external_message_id, external_chat_id, external_user_id,
        username, first_name, last_name,
        payload_json, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      input.session_id || null,
      input.content,
      input.source,
      input.direction,
      input.message_type || null,
      input.external_message_id || null,
      input.external_chat_id || null,
      input.external_user_id || null,
      input.username || null,
      input.first_name || null,
      input.last_name || null,
      input.payload_json || null,
      input.metadata_json || null,
      Date.now()
    );
    return this.getChatMessage(result.lastInsertRowid as number)!;
  }

  getChatMessage(id: number): Types.ChatMessage | undefined {
    return this.db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id) as Types.ChatMessage | undefined;
  }

  getChatMessages(limit: number = 50): Types.ChatMessage[] {
    return this.db.prepare('SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT ?').all(limit) as Types.ChatMessage[];
  }

  getChatMessagesBySession(sessionId: string): Types.ChatMessage[] {
    return this.db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as Types.ChatMessage[];
  }

  getChatMessagesBySource(source: Types.ChatSource, limit: number = 50): Types.ChatMessage[] {
    return this.db.prepare('SELECT * FROM chat_messages WHERE source = ? ORDER BY created_at DESC LIMIT ?').all(source, limit) as Types.ChatMessage[];
  }

  /**
   * 根据关键词搜索任务
   */
  searchTasksByKeywords(keywords: string[], days: number = 7): any[] {
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

    // 构建 LIKE 查询
    const conditions = keywords.map(() => 'description LIKE ?').join(' OR ');
    const params = keywords.flatMap(k => [`%${k}%`, cutoffTime]);

    const sql = `
      SELECT id, description, status, created_at
      FROM tasks
      WHERE created_at >= ? AND (${conditions})
      ORDER BY created_at DESC
      LIMIT 10
    `;

    return this.db.prepare(sql).all(cutoffTime, ...params) as any[];
  }

  /**
   * 根据关键词搜索 cron 任务
   */
  searchCronJobsByKeywords(keywords: string[]): any[] {
    const conditions = keywords.map(() => '(name LIKE ? OR description LIKE ? OR command LIKE ?)').join(' OR ');
    const params = keywords.flatMap(k => [`%${k}%`, `%${k}%`, `%${k}%`]);

    const sql = `
      SELECT id, name, description, command, cron_rule, enabled
      FROM crontab
      WHERE ${conditions}
      ORDER BY created_at DESC
      LIMIT 10
    `;

    return this.db.prepare(sql).all(...params) as any[];
  }

  // Additional methods needed for WorkScheduleManager
  updateEmployeeStatus(id: string, status: string): Types.Employee | undefined {
    const result = this.db.prepare('UPDATE employees SET status = ?, last_active = ? WHERE id = ?').run(status, Date.now(), id);
    if (result.changes > 0) {
      return this.getEmployee(id);
    }
    return undefined;
  }

  setEmployeeUnavailable(employeeId: string, days: number): void {
    const unavailableUntil = Date.now() + (days * 24 * 60 * 60 * 1000); // Convert days to milliseconds
    this.db.prepare('UPDATE employees SET unavailable_until = ? WHERE id = ?').run(unavailableUntil, employeeId);
  }

  getLastEmployeeActivity(employeeId: string): number | undefined {
    const row = this.db.prepare('SELECT last_active FROM employees WHERE id = ?').get(employeeId) as { last_active: number } | undefined;
    return row?.last_active;
  }

  getEmployeeTasks(employeeId: string): Types.Task[] {
    return this.db.prepare(`
      SELECT * FROM tasks 
      WHERE assigned_to = ? 
      ORDER BY created_at DESC
    `).all(employeeId) as Types.Task[];
  }

  // Methods for HumanService
  createHuman(input: CreateHumanInput): HumanProfile {
    const id = `human-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO humans (id, name, gender, location, birthday, appearance, personality_traits, hobbies, work_preferences, skills, weaknesses, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      input.name,
      input.gender || null,
      input.location || null,
      input.birthday || null,
      input.appearance || null,
      input.personalityTraits ? JSON.stringify(input.personalityTraits) : null,
      input.hobbies ? JSON.stringify(input.hobbies) : null,
      input.workPreferences ? JSON.stringify(input.workPreferences) : null,
      input.skills ? JSON.stringify(input.skills) : null,
      input.weaknesses ? JSON.stringify(input.weaknesses) : null,
      input.notes || null,
      now,
      now
    );
    return this.getHuman(id)!;
  }

  getHuman(id: string): HumanProfile | undefined {
    const row = this.db.prepare('SELECT * FROM humans WHERE id = ?').get(id) as {
      id: string;
      name: string;
      gender: 'male' | 'female' | 'other' | null;
      location: string | null;
      birthday: string | null;
      appearance: string | null;
      personality_traits: string | null;
      hobbies: string | null;
      work_preferences: string | null;
      skills: string | null;
      weaknesses: string | null;
      notes: string | null;
      created_at: number;
      updated_at: number;
    } | undefined;
    if (!row) return undefined;

    return {
      id: row.id,
      name: row.name,
      gender: row.gender || undefined,
      location: row.location || undefined,
      birthday: row.birthday || undefined,
      appearance: row.appearance || undefined,
      personalityTraits: row.personality_traits ? JSON.parse(row.personality_traits) : undefined,
      hobbies: row.hobbies ? JSON.parse(row.hobbies) : undefined,
      workPreferences: row.work_preferences ? JSON.parse(row.work_preferences) : undefined,
      skills: row.skills ? JSON.parse(row.skills) : undefined,
      weaknesses: row.weaknesses ? JSON.parse(row.weaknesses) : undefined,
      notes: row.notes || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  updateHuman(id: string, input: Partial<CreateHumanInput>): HumanProfile | undefined {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name) { fields.push('name = ?'); values.push(input.name); }
    if (input.gender) { fields.push('gender = ?'); values.push(input.gender); }
    if (input.location !== undefined) { fields.push('location = ?'); values.push(input.location); }
    if (input.birthday !== undefined) { fields.push('birthday = ?'); values.push(input.birthday); }
    if (input.appearance !== undefined) { fields.push('appearance = ?'); values.push(input.appearance); }
    if (input.personalityTraits) { fields.push('personality_traits = ?'); values.push(JSON.stringify(input.personalityTraits)); }
    if (input.hobbies) { fields.push('hobbies = ?'); values.push(JSON.stringify(input.hobbies)); }
    if (input.workPreferences) { fields.push('work_preferences = ?'); values.push(JSON.stringify(input.workPreferences)); }
    if (input.skills) { fields.push('skills = ?'); values.push(JSON.stringify(input.skills)); }
    if (input.weaknesses) { fields.push('weaknesses = ?'); values.push(JSON.stringify(input.weaknesses)); }
    if (input.notes) { fields.push('notes = ?'); values.push(input.notes); }
    fields.push('updated_at = ?'); values.push(Date.now());

    values.push(id);
    this.db.prepare(`UPDATE humans SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getHuman(id);
  }

  // ============================================================================
  // Task Interactions (任务交互记录 - 用于任务执行过程中需要用户交互)
  // ============================================================================

  createTaskInteraction(input: {
    taskId: string;
    type: 'confirm' | 'select' | 'input';
    question: string;
    options?: Array<{ id: string; label: string }>;
    channel: 'telegram' | 'cli' | 'web';
    channelId?: string;
    channelUserId?: string;
    timeout?: number;
    timeoutAction?: 'cancel' | 'proceed' | 'retry';
  }): string {
    const id = `ti-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const timeout = input.timeout || 300000; // 默认 5 分钟

    this.db.prepare(`
      INSERT INTO task_interactions (
        id, task_id, type, question, options_json,
        status, channel, channel_id, channel_user_id,
        delivery_status, delivery_attempts, created_at, expires_at, timeout_action
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, 'pending', 0, ?, ?, ?)
    `).run(
      id,
      input.taskId,
      input.type,
      input.question,
      input.options ? JSON.stringify(input.options) : null,
      input.channel,
      input.channelId || null,
      input.channelUserId || null,
      now,
      now + timeout,
      input.timeoutAction || 'cancel'
    );

    return id;
  }

  getTaskInteraction(id: string): any {
    return this.db.prepare('SELECT * FROM task_interactions WHERE id = ?').get(id);
  }

  updateTaskInteraction(id: string, update: {
    status?: 'pending' | 'answered' | 'expired' | 'cancelled';
    selectedOption?: string;
    userInput?: string;
    deliveryStatus?: 'pending' | 'sent' | 'delivered' | 'failed';
    deliveryAttempts?: number;
  }): void {
    const now = Date.now();
    const sets: string[] = [];
    const values: any[] = [];

    if (update.status) {
      sets.push('status = ?');
      values.push(update.status);
      if (update.status === 'answered') {
        sets.push('answered_at = ?');
        values.push(now);
      }
    }

    if (update.selectedOption) {
      sets.push('selected_option = ?');
      values.push(update.selectedOption);
    }

    if (update.userInput !== undefined) {
      sets.push('user_input = ?');
      values.push(update.userInput);
    }

    if (update.deliveryStatus) {
      sets.push('delivery_status = ?');
      values.push(update.deliveryStatus);
    }

    if (update.deliveryAttempts !== undefined) {
      sets.push('delivery_attempts = ?');
      values.push(update.deliveryAttempts);
    }

    if (sets.length === 0) return;
    values.push(id);

    this.db.prepare(`
      UPDATE task_interactions
      SET ${sets.join(', ')}
      WHERE id = ?
    `).run(...values);
  }

  getPendingTaskInteractions(): any[] {
    return this.db.prepare(`
      SELECT * FROM task_interactions
      WHERE status = 'pending'
        AND expires_at > ?
      ORDER BY created_at ASC
    `).all(Date.now());
  }

  getExpiredTaskInteractions(): any[] {
    return this.db.prepare(`
      SELECT * FROM task_interactions
      WHERE status = 'pending'
        AND expires_at IS NOT NULL
        AND expires_at <= ?
    `).all(Date.now());
  }

  getTaskInteractionsByTask(taskId: string): any[] {
    return this.db.prepare('SELECT * FROM task_interactions WHERE task_id = ? ORDER BY created_at DESC').all(taskId);
  }

  getTaskInteractionsByChannel(channel: string, channelUserId?: string): any[] {
    if (channelUserId) {
      return this.db.prepare(`
        SELECT * FROM task_interactions
        WHERE channel = ? AND channel_user_id = ? AND status = 'pending'
        ORDER BY created_at ASC
      `).all(channel, channelUserId);
    }
    return this.db.prepare(`
      SELECT * FROM task_interactions
      WHERE channel = ? AND status = 'pending'
      ORDER BY created_at ASC
    `).all(channel);
  }

  deleteHuman(id: string): boolean {
    const result = this.db.prepare('DELETE FROM humans WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

let dbInstance: AIDatabase | null = null;
export function getDatabase(): AIDatabase {
  if (!dbInstance) dbInstance = new AIDatabase();
  return dbInstance;
}
