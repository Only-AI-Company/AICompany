/**
 * Company Service - 公司信息业务逻辑
 */

import type { AIDatabase } from '../../infrastructure/database/index.js';

export interface CompanyInfo {
  name: string;
  owner: string;
  ceoName: string;
  ceoTraits: string[];
  employeeCount: number;
  taskCount: number;
  employees: EmployeeInfo[];
}

export interface EmployeeInfo {
  id: string;
  name: string;
  role: string;
  status: string;
}

export class CompanyService {
  constructor(private db: AIDatabase) {}

  /**
   * 获取公司信息
   */
  getCompanyInfo(): CompanyInfo {
    const config = this.db.prepare('SELECT value FROM config WHERE key = ?').get('name') as { value: string } | undefined;
    const ownerConfig = this.db.prepare('SELECT value FROM config WHERE key = ? AND category = ?').get('owner', 'company') as { value: string } | undefined;

    const employees = this.db.getAllEmployees();
    const tasks = this.db.getAllTasks();

    let ceoName = 'CEO';
    let ceoTraits: string[] = [];
    try {
      const ceo = this.db.getHuman('human-ceo');
      if (ceo) {
        ceoName = ceo.name || 'CEO';
        ceoTraits = ceo.personalityTraits || [];
      }
    } catch {}

    return {
      name: config?.value || 'AI Company',
      owner: ownerConfig?.value || 'Owner',
      ceoName,
      ceoTraits,
      employeeCount: employees.length,
      taskCount: tasks.length,
      employees: employees.map(e => ({
        id: e.id,
        name: e.name,
        role: e.role,
        status: e.status,
      })),
    };
  }

  /**
   * 获取员工列表摘要
   */
  getEmployeeSummary(limit: number = 5): EmployeeInfo[] {
    const employees = this.db.getAllEmployees();
    return employees.slice(0, limit).map(e => ({
      id: e.id,
      name: e.name,
      role: e.role,
      status: e.status,
    }));
  }

  /**
   * 获取员工（按 ID 或角色查找）
   */
  findEmployee(identifier: string): EmployeeInfo | null {
    // 按 ID 查找
    let employee = this.db.getEmployee(identifier);
    if (employee) {
      return {
        id: employee.id,
        name: employee.name,
        role: employee.role,
        status: employee.status,
      };
    }

    // 按角色查找
    const employees = this.db.getAllEmployees();
    employee = employees.find(e => e.role === identifier);
    if (employee) {
      return {
        id: employee.id,
        name: employee.name,
        role: employee.role,
        status: employee.status,
      };
    }

    return null;
  }

  /**
   * 获取任务摘要
   */
  getTaskSummary(limit: number = 5): Array<{ id: string; description: string; status: string }> {
    const tasks = this.db.getAllTasks();
    return tasks.slice(0, limit).map(t => ({
      id: t.id,
      description: t.description.length > 40 ? t.description.slice(0, 40) + '...' : t.description,
      status: t.status,
    }));
  }
}
