/**
 * AI Company v2 - Orchestrator
 *
 * 遗留编排器：仅用于系统状态查询
 *
 * 注意：这是遗留代码，主要被 status 命令使用。
 * 核心的用户输入处理由 CoreProcess + CEO 负责。
 */

import { getDatabase } from '../db/Database.js';
import { seedDefaultEmployees, seedDefaultHumans } from '../db/seeds/index.js';

// ============================================================================
// 类型定义
// ============================================================================

export interface SystemStatus {
  goals: {
    total: number;
    active: number;
    completed: number;
    pending: number;
  };
  tasks: {
    total: number;
    executing: number;
    completed: number;
    pending: number;
    failed: number;
  };
  employees: {
    total: number;
    active: number;
  };
  cronJobs: {
    total: number;
    enabled: number;
  };
}

// ============================================================================
// Orchestrator
// ============================================================================

/**
 * Orchestrator（遗留）
 *
 * 仅用于系统状态查询，不再处理用户输入。
 * 用户输入处理由 CoreProcess + CEO 负责。
 */
export class Orchestrator {
  private db = getDatabase();
  private initialized = false;

  /**
   * 初始化 Orchestrator
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('[Orchestrator] 初始化...');

    // 初始化数据库（如果未初始化）
    this.ensureDatabaseInitialized();

    this.initialized = true;
    console.log('[Orchestrator] 初始化完成');
  }

  /**
   * 确保数据库已初始化
   */
  private ensureDatabaseInitialized(): void {
    try {
      // 检查是否有员工数据
      const row = this.db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number };
      if (row.count === 0) {
        console.log('[Orchestrator] 初始化种子数据...');
        seedDefaultHumans(this.db);
        seedDefaultEmployees(this.db);
      }
    } catch (error: any) {
      console.warn('[Orchestrator] 检查种子数据失败:', error.message);
    }
  }

  /**
   * 获取系统状态
   */
  async getSystemStatus(): Promise<SystemStatus> {
    const db = this.db;

    // 获取统计信息
    const goalStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM goals
    `).get() as any;

    const taskStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'executing' THEN 1 ELSE 0 END) as executing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM tasks
    `).get() as any;

    const employeeStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
      FROM employees
    `).get() as any;

    const cronStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled
      FROM crontab
    `).get() as any;

    return {
      goals: {
        total: goalStats.total || 0,
        active: goalStats.active || 0,
        completed: goalStats.completed || 0,
        pending: goalStats.pending || 0,
      },
      tasks: {
        total: taskStats.total || 0,
        executing: taskStats.executing || 0,
        completed: taskStats.completed || 0,
        pending: taskStats.pending || 0,
        failed: taskStats.failed || 0,
      },
      employees: {
        total: employeeStats.total || 0,
        active: employeeStats.active || 0,
      },
      cronJobs: {
        total: cronStats.total || 0,
        enabled: cronStats.enabled || 0,
      },
    };
  }

  /**
   * 关闭 Orchestrator
   */
  async shutdown(): Promise<void> {
    console.log('[Orchestrator] 关闭...');
    this.initialized = false;
  }
}
