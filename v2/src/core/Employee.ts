/**
 * AI Company v2 - 员工服务
 *
 * 统一管理员工的所有操作：
 * - CRUD 操作
 * - 意图分配
 * - 事件订阅与统计更新
 * - 绩效报告
 */
import type { Employee, EmployeeState } from '../types.js';
import { getDatabase } from '../db/Database.js';
import { getEventBus } from './Event.js';
import { EventType } from '../types.js';

/**
 * 员工角色
 */
export type EmployeeRole =
  | 'ceo'           // CEO - 统筹决策
  | 'writer'        // 文案 - 写作
  | 'developer'     // 开发 - 编程
  | 'analyst'       // 分析 - 数据分析
  | 'manager'       // 经理 - 项目管理
  | 'assistant';    // 助手 - 通用助手

/**
 * 积分规则配置
 */
const POINTS_CONFIG = {
  TASK_ASSIGNED: 1,        // 任务被分配
  TASK_COMPLETED: 10,      // 任务完成
  TASK_FAILED: -5,         // 任务失败

  // 等级升级所需积分
  LEVEL_THRESHOLDS: [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500],
} as const;

/**
 * 员工服务
 *
 * 统一处理员工相关的所有操作
 */
export class EmployeeService {
  private isStarted: boolean = false;
  private unsubscribeFunctions: Array<() => void> = [];

  // ========================================================================
  // 生命周期管理
  // ========================================================================

  /**
   * 启动服务（订阅事件）
   */
  start(): void {
    if (this.isStarted) {
      return;
    }

    console.log('[EmployeeService] Starting...');

    // 订阅任务事件
    this.subscribeToEvents();

    this.isStarted = true;
    console.log('[EmployeeService] Started');
  }

  /**
   * 停止服务
   */
  stop(): void {
    if (!this.isStarted) {
      return;
    }

    console.log('[EmployeeService] Stopping...');

    // 清理所有事件监听器
    this.unsubscribeFunctions.forEach(fn => fn());
    this.unsubscribeFunctions = [];

    this.isStarted = false;
    console.log('[EmployeeService] Stopped');
  }

  // ========================================================================
  // CRUD 操作
  // ========================================================================

  /**
   * 创建员工
   */
  createEmployee(input: {
    name: string;
    role: EmployeeRole;
    systemPrompt: string;
    model?: string;
    temperature?: number;
  }): Employee {
    const db = getDatabase();
    const employeeId = this.generateId(input.role);

    const employee: Employee = {
      id: employeeId,
      name: input.name,
      role: input.role,
      status: 'active',
      systemPrompt: input.systemPrompt,
      model: input.model || 'claude-sonnet-4-20250514',
      temperature: input.temperature || 0.7,
      createdAt: Date.now(),
    };

    db.createEmployee(employee);

    // 发布事件
    getEventBus().emit(EventType.EMPLOYEE_CREATED, {
      employee,
    });

    console.log(`[EmployeeService] Created: ${employee.name} (${employee.role})`);

    return employee;
  }

  /**
   * 获取员工
   */
  getEmployee(id: string): Employee | null {
    const db = getDatabase();
    return db.getEmployee(id);
  }

  /**
   * 根据角色获取员工
   */
  getEmployeeByRole(role: EmployeeRole): Employee | null {
    const db = getDatabase();
    const employees = db.listEmployees({ status: 'active' });
    return employees.find(e => e.role === role) || null;
  }

  /**
   * 列出员工
   */
  listEmployees(filters?: { status?: 'active' | 'inactive' }): Employee[] {
    const db = getDatabase();
    return db.listEmployees(filters);
  }

  // ========================================================================
  // 员工分配
  // ========================================================================

  /**
   * 根据意图类型决定使用哪个员工
   */
  assignEmployeeForIntent(intentType: string): Employee | null {
    // 意图 → 员工角色映射
    const roleMap: Record<string, EmployeeRole> = {
      'create_task': 'assistant',
      'create_goal': 'manager',
      'create_script': 'developer',
      'chat': 'assistant',
      'query_status': 'assistant',
      'query_tasks': 'manager',
      'query_goals': 'manager',
    };

    const role = roleMap[intentType];
    if (!role) return null;

    return this.getEmployeeByRole(role);
  }

  // ========================================================================
  // 事件处理
  // ========================================================================

  /**
   * 订阅事件
   */
  private subscribeToEvents(): void {
    const eventBus = getEventBus();

    // 任务创建
    const unsubscribeCreated = eventBus.on(EventType.TASK_CREATED, (event) => {
      this.handleTaskCreated(event);
    });
    this.unsubscribeFunctions.push(unsubscribeCreated);

    // 任务完成
    const unsubscribeCompleted = eventBus.on(EventType.TASK_COMPLETED, (event) => {
      this.handleTaskCompleted(event);
    });
    this.unsubscribeFunctions.push(unsubscribeCompleted);

    // 任务失败
    const unsubscribeFailed = eventBus.on(EventType.TASK_FAILED, (event) => {
      this.handleTaskFailed(event);
    });
    this.unsubscribeFunctions.push(unsubscribeFailed);

    // 执行开始 - 设置状态为 busy
    const unsubscribeExecutionStarted = eventBus.on(EventType.EXECUTION_STARTED, (event) => {
      this.handleExecutionStarted(event);
    });
    this.unsubscribeFunctions.push(unsubscribeExecutionStarted);

    // 执行完成 - 设置状态为 idle
    const unsubscribeExecutionCompleted = eventBus.on(EventType.EXECUTION_COMPLETED, (event) => {
      this.handleExecutionCompleted(event);
    });
    this.unsubscribeFunctions.push(unsubscribeExecutionCompleted);

    const unsubscribeExecutionFailed = eventBus.on(EventType.EXECUTION_FAILED, (event) => {
      this.handleExecutionFailed(event);
    });
    this.unsubscribeFunctions.push(unsubscribeExecutionFailed);
  }

  private handleTaskCreated(event: any): void {
    const db = getDatabase();
    const task = event.data?.task;

    if (!task?.assigned_to) return;

    const employee = db.getEmployee(task.assigned_to);
    if (!employee) return;

    this.updateEmployeeStats(task.assigned_to, {
      totalTasks: (employee.total_tasks || 0) + 1,
      points: (employee.points || 0) + POINTS_CONFIG.TASK_ASSIGNED,
      lastActivityAt: Date.now(),
    });

    console.log(`[EmployeeService] Task assigned to ${employee.name}: ${task.description?.substring(0, 30)}...`);
  }

  private handleTaskCompleted(event: any): void {
    const db = getDatabase();
    const task = event.data?.task;

    if (!task?.assigned_to) return;

    const employee = db.getEmployee(task.assigned_to);
    if (!employee) return;

    // 计算积分（基础分 + 根据优先级加成）
    let pointsEarned = POINTS_CONFIG.TASK_COMPLETED;
    const priorityBonus: Record<string, number> = {
      'urgent': 5,
      'high': 3,
      'medium': 0,
      'low': -1,
    };
    pointsEarned += priorityBonus[task.priority] || 0;

    this.updateEmployeeStats(task.assigned_to, {
      completedTasks: (employee.completed_tasks || 0) + 1,
      points: (employee.points || 0) + pointsEarned,
      satisfaction: this.calculateSatisfaction(employee, pointsEarned, 'success'),
      lastActivityAt: Date.now(),
    });

    console.log(`[EmployeeService] Task completed by ${employee.name}: +${pointsEarned} points`);
  }

  private handleTaskFailed(event: any): void {
    const db = getDatabase();
    const task = event.data?.task;

    if (!task?.assigned_to) return;

    const employee = db.getEmployee(task.assigned_to);
    if (!employee) return;

    const pointsLost = POINTS_CONFIG.TASK_FAILED;

    this.updateEmployeeStats(task.assigned_to, {
      failedTasks: (employee.failed_tasks || 0) + 1,
      points: Math.max(0, (employee.points || 0) + pointsLost),
      satisfaction: this.calculateSatisfaction(employee, pointsLost, 'failure'),
      lastActivityAt: Date.now(),
    });

    console.log(`[EmployeeService] Task failed by ${employee.name}: ${pointsLost} points`);
  }

  private handleExecutionStarted(event: any): void {
    const employeeId = event.data?.employeeId;
    if (!employeeId) return;

    this.updateEmployeeState(employeeId, 'busy');
  }

  private handleExecutionCompleted(event: any): void {
    const employeeId = event.data?.employeeId;
    if (!employeeId) return;

    this.updateEmployeeState(employeeId, 'idle');
  }

  private handleExecutionFailed(event: any): void {
    const employeeId = event.data?.employeeId;
    if (!employeeId) return;

    this.updateEmployeeState(employeeId, 'error');

    // 5秒后恢复为 idle
    setTimeout(() => {
      this.updateEmployeeState(employeeId, 'idle');
    }, 5000);
  }

  // ========================================================================
  // 统计更新
  // ========================================================================

  /**
   * 更新员工统计信息
   */
  private updateEmployeeStats(employeeId: string, updates: {
    totalTasks?: number;
    completedTasks?: number;
    failedTasks?: number;
    points?: number;
    satisfaction?: number;
    lastActivityAt?: number;
  }): void {
    const db = getDatabase();

    const updatesArray: string[] = [];
    const params: any[] = [];

    if (updates.totalTasks !== undefined) {
      updatesArray.push('total_tasks = ?');
      params.push(updates.totalTasks);
    }
    if (updates.completedTasks !== undefined) {
      updatesArray.push('completed_tasks = ?');
      params.push(updates.completedTasks);
    }
    if (updates.failedTasks !== undefined) {
      updatesArray.push('failed_tasks = ?');
      params.push(updates.failedTasks);
    }
    if (updates.points !== undefined) {
      updatesArray.push('points = ?');
      params.push(updates.points);
    }
    if (updates.satisfaction !== undefined) {
      updatesArray.push('satisfaction = ?');
      params.push(updates.satisfaction);
    }
    if (updates.lastActivityAt !== undefined) {
      updatesArray.push('last_activity_at = ?');
      params.push(updates.lastActivityAt);
    }

    // 根据积分计算等级
    if (updates.points !== undefined) {
      const level = this.calculateLevel(updates.points);
      updatesArray.push('level = ?');
      params.push(level);
    }

    if (updatesArray.length === 0) return;

    params.push(employeeId);

    const sql = `
      UPDATE employees
      SET ${updatesArray.join(', ')}
      WHERE id = ?
    `;

    db.prepare(sql).run(...params);
  }

  /**
   * 更新员工状态
   */
  private updateEmployeeState(employeeId: string, state: EmployeeState): void {
    const db = getDatabase();
    const now = Date.now();

    db.prepare(`
      UPDATE employees
      SET current_state = ?, last_activity_at = ?
      WHERE id = ?
    `).run(state, now, employeeId);
  }

  /**
   * 计算等级
   */
  private calculateLevel(points: number): number {
    for (let i = POINTS_CONFIG.LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (points >= POINTS_CONFIG.LEVEL_THRESHOLDS[i]) {
        return i + 1;
      }
    }
    return 1;
  }

  /**
   * 计算满意度
   */
  private calculateSatisfaction(
    employee: any,
    pointsChange: number,
    resultType: 'success' | 'failure'
  ): number {
    const currentSatisfaction = employee.satisfaction || 80;

    if (resultType === 'success') {
      const increase = Math.min(pointsChange * 0.5, 5);
      return Math.min(100, currentSatisfaction + increase);
    } else {
      const decrease = Math.min(Math.abs(pointsChange) * 0.3, 3);
      return Math.max(0, currentSatisfaction - decrease);
    }
  }

  // ========================================================================
  // 报告
  // ========================================================================

  /**
   * 获取员工绩效报告
   */
  getEmployeePerformanceReport(employeeId: string): {
    employee: { id: string; name: string; role: string };
    stats: {
      totalTasks: number;
      completedTasks: number;
      failedTasks: number;
      successRate: number;
      points: number;
      level: number;
      satisfaction: number;
      currentState: string;
      lastActivityAt: number;
    };
  } | null {
    const db = getDatabase();
    const employee = db.getEmployee(employeeId);

    if (!employee) return null;

    const total = employee.total_tasks || 0;
    const completed = employee.completed_tasks || 0;
    const failed = employee.failed_tasks || 0;
    const successRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.role,
      },
      stats: {
        totalTasks: total,
        completedTasks: completed,
        failedTasks: failed,
        successRate: Math.round(successRate * 10) / 10,
        points: employee.points || 0,
        level: employee.level || 1,
        satisfaction: employee.satisfaction || 80,
        currentState: employee.current_state || 'idle',
        lastActivityAt: employee.last_activity_at || 0,
      },
    };
  }

  /**
   * 获取所有员工绩效排行榜
   */
  getLeaderboard(): Array<{
    id: string;
    name: string;
    role: string;
    points: number;
    level: number;
    completedTasks: number;
    successRate: number;
  }> {
    const db = getDatabase();
    const employees = db.listEmployees({ status: 'active' });

    return employees
      .map((emp: any) => {
        const total = emp.total_tasks || 0;
        const completed = emp.completed_tasks || 0;
        const successRate = total > 0 ? (completed / total) * 100 : 0;

        return {
          id: emp.id,
          name: emp.name,
          role: emp.role,
          points: emp.points || 0,
          level: emp.level || 1,
          completedTasks: completed,
          successRate: Math.round(successRate * 10) / 10,
        };
      })
      .sort((a, b) => b.points - a.points);
  }

  // ========================================================================
  // 工具方法
  // ========================================================================

  /**
   * 生成员工 ID
   */
  private generateId(role: EmployeeRole): string {
    return `${role}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// 单例
let employeeServiceInstance: EmployeeService | null = null;

export function getEmployeeService(): EmployeeService {
  if (!employeeServiceInstance) {
    employeeServiceInstance = new EmployeeService();
  }
  return employeeServiceInstance;
}
