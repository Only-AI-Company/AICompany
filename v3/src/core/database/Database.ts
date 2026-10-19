/**
 * AI Company v3 - Database
 *
 * SQLite 数据库层
 *
 * 使用 better-sqlite3 进行数据库操作
 */

import Database from 'better-sqlite3';
import { promises } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../../data/company.db');

// ============================================================================
// Database Schema
// ============================================================================

const SCHEMA = `
-- Goals Table
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'failed', 'paused')),
  parent_goal_id TEXT,
  progress INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (parent_goal_id) REFERENCES goals(id) ON DELETE CASCADE
);

-- Plans Table
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
  current_step_index INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
);

-- Plan Steps Table
CREATE TABLE IF NOT EXISTS plan_steps (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
  dependencies TEXT,
  task_id TEXT,
  estimated_duration INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT,
  goal_id TEXT,
  description TEXT NOT NULL,
  required_capabilities TEXT,
  employee_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending', 'scheduled', 'executing', 'completed', 'failed')),
  priority TEXT NOT NULL CHECK(priority IN ('critical', 'high', 'medium', 'low')),
  input TEXT,
  output TEXT,
  error TEXT,
  duration INTEGER,
  reviewed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  scheduled_at INTEGER,
  started_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

-- Employees Table
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  skills TEXT NOT NULL,
  level INTEGER DEFAULT 1,
  performance INTEGER DEFAULT 50,
  satisfaction INTEGER DEFAULT 70,
  system_prompt TEXT NOT NULL,
  capabilities TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

-- Reviews Table
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score >= 1 AND score <= 10),
  strengths TEXT,
  improvements TEXT,
  learnings TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- System Status Table
CREATE TABLE IF NOT EXISTS system_status (
  id TEXT PRIMARY KEY,
  current_goal_id TEXT,
  engine_running INTEGER DEFAULT 0,
  active_goals INTEGER DEFAULT 0,
  active_tasks INTEGER DEFAULT 0,
  pending_tasks INTEGER DEFAULT 0,
  completed_tasks INTEGER DEFAULT 0,
  failed_tasks INTEGER DEFAULT 0,
  active_employees INTEGER DEFAULT 0,
  last_review_at INTEGER,
  uptime INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- Activities Log Table
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  context TEXT,
  created_at INTEGER NOT NULL
);

-- Episodic Memories Table
CREATE TABLE IF NOT EXISTS episodic_memories (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_description TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('success', 'failure', 'partial')),
  input TEXT,
  output TEXT,
  error TEXT,
  duration INTEGER,
  tools_used TEXT,
  learnings TEXT,
  improvements TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Semantic Memories Table
CREATE TABLE IF NOT EXISTS semantic_memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL CHECK(source IN ('review', 'user', 'system', 'extracted')),
  source_memory_id TEXT,
  related_knowledge_ids TEXT,
  usage_count INTEGER DEFAULT 0,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT,
  status TEXT CHECK(status IN ('active', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT CHECK(role IN ('user', 'assistant', 'system')) NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_created_at ON goals(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_employee_id ON tasks(employee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_plan_steps_plan_id ON plan_steps(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_steps_status ON plan_steps(status);
CREATE INDEX IF NOT EXISTS idx_reviews_employee_id ON reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);
`;

// ============================================================================
// Database Class
// ============================================================================

export class AIDatabase extends Database {
  constructor(filename: string = DB_PATH) {
    super(filename);
  }

  /**
   * 初始化数据库
   */
  initialize(): void {
    console.log('[Database] Initializing database...');

    // 创建表
    this.exec(SCHEMA);

    // 插入默认系统状态
    const systemStatus = this.prepare('SELECT * FROM system_status WHERE id = ?').get('main');
    if (!systemStatus) {
      this.prepare('INSERT INTO system_status (id, engine_running, updated_at) VALUES (?, 0, ?)').run('main', Date.now());
    }

    console.log('[Database] Database initialized');
  }

  // ============================================================================
  // Goal Operations
  // ============================================================================

  insertGoal(goal: any): void {
    const stmt = this.prepare(`
      INSERT INTO goals (id, description, timeframe, status, parent_goal_id, progress, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      goal.id,
      goal.description,
      goal.timeframe,
      goal.status || 'active',
      goal.parentGoalId || null,
      goal.progress || 0,
      goal.createdAt || Date.now()
    );
  }

  getGoal(goalId: string): any {
    return this.prepare('SELECT * FROM goals WHERE id = ?').get(goalId);
  }

  getAllGoals(): any[] {
    return this.prepare('SELECT * FROM goals ORDER BY created_at DESC').all();
  }

  getActiveGoals(): any[] {
    return this.prepare('SELECT * FROM goals WHERE status = ? ORDER BY created_at ASC').all('active');
  }

  updateGoal(goalId: string, updates: any): void {
    const fieldMap: Record<string, string> = {
      'parentGoalId': 'parent_goal_id',
      'completedAt': 'completed_at',
    };

    const mappedUpdates: any = {};
    for (const [key, value] of Object.entries(updates)) {
      mappedUpdates[fieldMap[key] || key] = value;
    }

    const fields = Object.keys(mappedUpdates);
    const values = Object.values(mappedUpdates);

    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const stmt = this.prepare(`UPDATE goals SET ${setClause} WHERE id = ?`);

    stmt.run(...values, goalId);
  }

  // ============================================================================
  // Plan Operations
  // ============================================================================

  insertPlan(plan: any): void {
    const stmt = this.prepare(`
      INSERT INTO plans (id, goal_id, description, status, current_step_index, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      plan.id,
      plan.goalId,
      plan.description,
      plan.status || 'pending',
      plan.currentStepIndex || 0,
      plan.createdAt || Date.now()
    );
  }

  getPlan(planId: string): any {
    return this.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
  }

  getAllPlans(): any[] {
    return this.prepare('SELECT * FROM plans ORDER BY created_at DESC').all();
  }

  updatePlan(planId: string, updates: any): void {
    const fieldMap: Record<string, string> = {
      'startedAt': 'started_at',
      'completedAt': 'completed_at',
      'currentStepIndex': 'current_step_index',
      'goalId': 'goal_id',
    };

    const mappedUpdates: any = {};
    for (const [key, value] of Object.entries(updates)) {
      mappedUpdates[fieldMap[key] || key] = value;
    }

    const fields = Object.keys(mappedUpdates);
    const values = Object.values(mappedUpdates);

    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const stmt = this.prepare(`UPDATE plans SET ${setClause} WHERE id = ?`);

    stmt.run(...values, planId);
  }

  // ============================================================================
  // Plan Step Operations
  // ============================================================================

  insertPlanStep(step: any): void {
    const stmt = this.prepare(`
      INSERT INTO plan_steps (id, plan_id, description, status, dependencies, task_id, estimated_duration, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      step.id,
      step.planId,
      step.description,
      step.status || 'pending',
      step.dependencies ? JSON.stringify(step.dependencies) : null,
      step.taskId || null,
      step.estimatedDuration || null,
      step.createdAt || Date.now()
    );
  }

  getPlanSteps(planId: string): any[] {
    return this.prepare('SELECT * FROM plan_steps WHERE plan_id = ? ORDER BY created_at ASC').all(planId);
  }

  updatePlanStep(stepId: string, updates: any): void {
    const fieldMap: Record<string, string> = {
      'taskId': 'task_id',
    };

    const mappedUpdates: any = {};
    for (const [key, value] of Object.entries(updates)) {
      mappedUpdates[fieldMap[key] || key] = value;
    }

    const fields = Object.keys(mappedUpdates);
    const values = Object.values(mappedUpdates);

    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const stmt = this.prepare(`UPDATE plan_steps SET ${setClause} WHERE id = ?`);

    stmt.run(...values, stepId);
  }

  // ============================================================================
  // Task Operations
  // ============================================================================

  insertTask(task: any): void {
    const stmt = this.prepare(`
      INSERT INTO tasks (id, plan_id, goal_id, description, required_capabilities, employee_id, status, priority, input, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      task.planId || null,
      task.goalId || null,
      task.description,
      task.requiredCapabilities ? JSON.stringify(task.requiredCapabilities) : null,
      task.employeeId || null,
      task.status || 'pending',
      task.priority || 'medium',
      task.input || null,
      task.createdAt || Date.now()
    );
  }

  getTask(taskId: string): any {
    return this.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  }

  getAllTasks(): any[] {
    return this.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
  }

  getTasksByStatus(status: string): any[] {
    return this.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC').all(status);
  }

  updateTask(taskId: string, updates: any): void {
    const fieldMap: Record<string, string> = {
      'planId': 'plan_id',
      'goalId': 'goal_id',
      'requiredCapabilities': 'required_capabilities',
      'employeeId': 'employee_id',
      'startedAt': 'started_at',
      'completedAt': 'completed_at',
      'scheduledAt': 'scheduled_at',
    };

    const mappedUpdates: any = {};
    for (const [key, value] of Object.entries(updates)) {
      mappedUpdates[fieldMap[key] || key] = value;
    }

    const fields = Object.keys(mappedUpdates);
    const values = Object.values(mappedUpdates);

    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const stmt = this.prepare(`UPDATE tasks SET ${setClause} WHERE id = ?`);

    stmt.run(...values, taskId);
  }

  // ============================================================================
  // Employee Operations
  // ============================================================================

  insertEmployee(employee: any): void {
    const stmt = this.prepare(`
      INSERT INTO employees (id, name, role, skills, level, performance, satisfaction, system_prompt, capabilities, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      employee.id,
      employee.name,
      employee.role,
      JSON.stringify(employee.skills),
      employee.level || 1,
      employee.performance || 50,
      employee.satisfaction || 70,
      employee.systemPrompt,
      JSON.stringify(employee.capabilities),
      employee.createdAt || Date.now()
    );
  }

  getEmployee(employeeId: string): any {
    return this.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId);
  }

  getAllEmployees(): any[] {
    return this.prepare('SELECT * FROM employees ORDER BY created_at ASC').all();
  }

  updateEmployee(employeeId: string, updates: any): void {
    const fields = Object.keys(updates);
    const values = Object.values(updates);

    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const stmt = this.prepare(`UPDATE employees SET ${setClause} WHERE id = ?`);

    if (updates.skills) {
      // 特殊处理 skills - 转为 JSON
      const skillsIndex = fields.indexOf('skills');
      if (skillsIndex >= 0) {
        values[skillsIndex] = JSON.stringify(updates.skills);
      }
    }

    if (updates.capabilities) {
      const capsIndex = fields.indexOf('capabilities');
      if (capsIndex >= 0) {
        values[capsIndex] = JSON.stringify(updates.capabilities);
      }
    }

    stmt.run(...values, employeeId);
  }

  // ============================================================================
  // Review Operations
  // ============================================================================

  insertReview(review: any): void {
    const stmt = this.prepare(`
      INSERT INTO reviews (id, task_id, employee_id, score, strengths, improvements, learnings, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      review.id,
      review.taskId,
      review.employeeId,
      review.score,
      review.strengths ? JSON.stringify(review.strengths) : null,
      review.improvements ? JSON.stringify(review.improvements) : null,
      review.learnings ? JSON.stringify(review.learnings) : null,
      review.createdAt || Date.now()
    );
  }

  getReviewsByEmployee(employeeId: string): any[] {
    return this.prepare('SELECT * FROM reviews WHERE employee_id = ? ORDER BY created_at DESC LIMIT 50').all(employeeId);
  }

  getRecentReviews(limit: number = 10): any[] {
    return this.prepare(`SELECT * FROM reviews ORDER BY created_at DESC LIMIT ?`).all(limit);
  }

  // ============================================================================
  // System Status Operations
  // ============================================================================

  updateSystemStatus(updates: any): void {
    const fields = Object.keys(updates);
    const values = Object.values(updates);

    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const stmt = this.prepare(`UPDATE system_status SET ${setClause}, updated_at = ? WHERE id = ?`);

    stmt.run(...values, Date.now(), 'main');
  }

  getSystemStatus(): any {
    return this.prepare('SELECT * FROM system_status WHERE id = ?').get('main');
  }

  // ============================================================================
  // Activity Log Operations
  // ============================================================================

  logActivity(activity: any): void {
    const stmt = this.prepare(`
      INSERT INTO activities (id, event_type, actor, action, context, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      activity.id || generateId('activity'),
      activity.eventType,
      activity.actor,
      activity.action,
      activity.context ? JSON.stringify(activity.context) : null,
      activity.createdAt || Date.now()
    );
  }

  getRecentActivities(limit: number = 50): any[] {
    return this.prepare(`SELECT * FROM activities ORDER BY created_at DESC LIMIT ?`).all(limit);
  }

  // ============================================================================
  // Memory Operations
  // ============================================================================

  insertEpisodicMemory(memory: any): void {
    const stmt = this.prepare(`
      INSERT INTO episodic_memories
      (id, task_id, task_description, employee_id, outcome, input, output, error,
       duration, tools_used, learnings, improvements, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      memory.id,
      memory.task_id,
      memory.task_description,
      memory.employee_id,
      memory.outcome,
      memory.input || null,
      memory.output || null,
      memory.error || null,
      memory.duration || null,
      memory.tools_used || null,
      memory.learnings,
      memory.improvements,
      memory.metadata || null,
      memory.created_at
    );
  }

  getEpisodicMemory(memoryId: string): any {
    return this.prepare('SELECT * FROM episodic_memories WHERE id = ?').get(memoryId);
  }

  getAllEpisodicMemories(): any[] {
    return this.prepare('SELECT * FROM episodic_memories ORDER BY created_at DESC').all();
  }

  getEpisodicMemoriesByEmployee(employeeId: string, limit: number = 50): any[] {
    return this.prepare(`
      SELECT * FROM episodic_memories
      WHERE employee_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(employeeId, limit);
  }

  getEpisodicMemoryIdsByTask(taskId: string): string[] {
    const rows = this.prepare(`
      SELECT id FROM episodic_memories
      WHERE task_id = ?
    `).all(taskId) as Array<{ id: string }>;
    return rows.map(row => row.id);
  }

  deleteEpisodicMemoriesByTask(taskId: string): void {
    this.prepare('DELETE FROM episodic_memories WHERE task_id = ?').run(taskId);
  }

  insertSemanticMemory(memory: any): void {
    const stmt = this.prepare(`
      INSERT INTO semantic_memories
      (id, title, description, category, tags, confidence, source,
       source_memory_id, related_knowledge_ids, usage_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);
    stmt.run(
      memory.id,
      memory.title,
      memory.description,
      memory.category,
      memory.tags,
      memory.confidence,
      memory.source,
      memory.source_memory_id || null,
      memory.related_knowledge_ids || null,
      memory.created_at,
      memory.updated_at
    );
  }

  getSemanticMemory(memoryId: string): any {
    return this.prepare('SELECT * FROM semantic_memories WHERE id = ?').get(memoryId);
  }

  getAllSemanticMemories(): any[] {
    return this.prepare('SELECT * FROM semantic_memories ORDER BY created_at DESC').all();
  }

  deleteSemanticMemoriesBySourceIds(sourceIds: string[]): void {
    if (sourceIds.length === 0) return;
    const placeholders = sourceIds.map(() => '?').join(',');
    this.prepare(`
      DELETE FROM semantic_memories
      WHERE source_memory_id IN (${placeholders})
    `).run(...sourceIds);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  getStats(): any {
    const goalStats = this.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM goals
    `).get();

    const taskStats = this.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'executing' THEN 1 ELSE 0 END) as executing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM tasks
    `).get();

    const employeeStats = this.prepare(`SELECT COUNT(*) as total FROM employees`).get();

    return {
      goals: goalStats || { total: 0, active: 0, completed: 0 },
      tasks: taskStats || { total: 0, pending: 0, executing: 0, completed: 0, failed: 0 },
      employees: employeeStats || { total: 0 },
    };
  }

  // ============================================================================
  // Conversation Operations
  // ============================================================================

  insertConversation(conv: {
    id: string;
    userId?: string;
    title?: string;
    status?: 'active' | 'archived';
    createdAt: number;
    updatedAt: number;
  }): void {
    const stmt = this.prepare(`
      INSERT INTO conversations (id, user_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      conv.id,
      conv.userId || null,
      conv.title || null,
      conv.status || 'active',
      conv.createdAt,
      conv.updatedAt
    );
  }

  getConversation(id: string): any {
    return this.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  }

  getAllConversations(): any[] {
    return this.prepare(`
      SELECT * FROM conversations
      WHERE status = 'active'
      ORDER BY updated_at DESC
    `).all();
  }

  updateConversation(id: string, updates: any): void {
    const fields = Object.keys(updates);
    const values = Object.values(updates);

    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const stmt = this.prepare(`UPDATE conversations SET ${setClause}, updated_at = ? WHERE id = ?`);

    stmt.run(...values, Date.now(), id);
  }

  // ============================================================================
  // Message Operations
  // ============================================================================

  insertMessage(msg: {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: any;
    createdAt: number;
  }): void {
    const stmt = this.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      msg.id,
      msg.conversationId,
      msg.role,
      msg.content,
      msg.metadata ? JSON.stringify(msg.metadata) : null,
      msg.createdAt
    );
  }

  getMessages(conversationId: string, limit: number = 50): any[] {
    return this.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(conversationId, limit);
  }

  getRecentMessages(conversationId: string, before: number, limit: number = 50): any[] {
    return this.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ? AND created_at < ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(conversationId, before, limit);
  }

  deleteConversation(id: string): void {
    this.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  deleteMessages(conversationId: string): void {
    this.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

async function ensureDataDir(): Promise<void> {
  const dir = path.dirname(DB_PATH);
  try {
    await promises.access(dir);
  } catch {
    await promises.mkdir(dir, { recursive: true });
  }
}

// ============================================================================
// Singleton
// ============================================================================

let dbInstance: AIDatabase | null = null;

export async function getDatabase(): Promise<AIDatabase> {
  if (!dbInstance) {
    await ensureDataDir();
    dbInstance = new AIDatabase(DB_PATH);
    dbInstance.initialize();
    dbInstance.pragma('foreign_keys = ON');
  }
  return dbInstance;
}

export function getDatabaseSync(): AIDatabase {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call getDatabase() first.');
  }
  return dbInstance;
}

export function resetDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
