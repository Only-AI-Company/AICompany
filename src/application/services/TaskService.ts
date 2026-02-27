/**
 * Task Service - 任务业务逻辑
 *
 * 只处理业务逻辑，返回结构化数据，不关心展示格式
 */

import type { AIDatabase } from '../../infrastructure/database/index.js';

export interface TaskInfo {
  id: string;
  description: string;
  status: string;
  createdAt: number;
  priority?: string;
  ownerId?: string;
}

export interface TaskListFilter {
  limit?: number;
  status?: string;
  ownerId?: string;
}

export class TaskService {
  constructor(private db: AIDatabase) {}

  /**
   * 获取任务列表
   */
  getTasks(filter: TaskListFilter = {}): TaskInfo[] {
    const limit = filter.limit || 10;
    let sql = 'SELECT id, description, status, created_at, priority, owner_id FROM tasks';
    const params: any[] = [];
    const conditions: string[] = [];

    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    if (filter.ownerId) {
      conditions.push('owner_id = ?');
      params.push(filter.ownerId);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(sql).all(...params) as TaskInfo[];
  }

  /**
   * 获取任务详情
   */
  getTask(taskId: string): TaskInfo | null {
    const result = this.db.prepare(
      'SELECT id, description, status, created_at, priority, owner_id FROM tasks WHERE id = ?'
    ).get(taskId) as TaskInfo | undefined;
    return result || null;
  }

  /**
   * 创建任务
   */
  createTask(input: {
    type?: string;
    description: string;
    priority?: string;
    requestedBy: string;
  }): TaskInfo {
    const task = this.db.createTask({
      type: (input.type || 'general') as any,
      description: input.description,
      priority: input.priority as any || 'medium',
      requested_by: input.requestedBy as any,
    });

    return {
      id: task.id,
      description: task.description,
      status: task.status,
      createdAt: task.created_at,
      priority: task.priority,
      ownerId: task.owner_id,
    };
  }

  /**
   * 分配任务给员工
   */
  assignTask(taskId: string, employeeId: string): boolean {
    try {
      this.db.assignTask(taskId, employeeId);
      this.db.updateTaskFields(taskId, { owner_id: employeeId });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 查找员工（按 ID 或角色）
   */
  findEmployee(identifier: string): { id: string; name: string; role: string } | null {
    // 先按 ID 查找
    let employee = this.db.getEmployee(identifier);
    if (employee) {
      return { id: employee.id, name: employee.name, role: employee.role };
    }

    // 按角色查找
    const employees = this.db.getAllEmployees();
    employee = employees.find(e => e.role === identifier);
    if (employee) {
      return { id: employee.id, name: employee.name, role: employee.role };
    }

    return null;
  }

  /**
   * 获取所有活跃员工
   */
  getActiveEmployees(): Array<{ id: string; name: string; role: string }> {
    return this.db.getAllEmployees()
      .filter(e => e.status === 'active')
      .map(e => ({ id: e.id, name: e.name, role: e.role }));
  }

  /**
   * 自动分配任务给合适的员工
   */
  autoAssignTask(taskId: string): { id: string; name: string; role: string } | null {
    const employees = this.getActiveEmployees();
    const preferredRoles = ['Fullstack_Engineer', 'Backend_Engineer', 'Developer'];

    for (const role of preferredRoles) {
      const employee = employees.find(e => e.role === role);
      if (employee) {
        this.assignTask(taskId, employee.id);
        return employee;
      }
    }

    // 没有首选角色，分配给第一个
    if (employees.length > 0) {
      const employee = employees[0];
      this.assignTask(taskId, employee.id);
      return employee;
    }

    return null;
  }
}
