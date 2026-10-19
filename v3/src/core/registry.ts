/**
 * AI Company v3 - Component Registry
 *
 * 核心组件注册表
 *
 * 职责：
 * - 注册所有核心组件到 DI 容器
 * - 定义组件初始化顺序
 * - 提供类型安全的组件访问
 */

import { registerComponent, getComponent, resetContainer } from './Container.js';
import { CEO, resetCEO } from './CEO.js';
import { GoalManager, resetGoalManager } from './GoalManager.js';
import { Scheduler, resetScheduler } from './Scheduler.js';
import { Engine, resetEngine } from './Engine.js';
import type { Employee } from './types.js';

// ============================================================================
// 组件键常量
// ============================================================================

export const COMPONENT_KEYS = {
  CEO: 'ceo',
  GOAL_MANAGER: 'goalManager',
  SCHEDULER: 'scheduler',
  ENGINE: 'engine',
  EMPLOYEES: 'employees',
} as const;

// ============================================================================
// 组件注册
// ============================================================================

let initialized = false;

/**
 * 初始化所有核心组件
 *
 * 按照正确的依赖顺序注册组件
 */
export function initializeCoreComponents(): void {
  if (initialized) {
    console.warn('[ComponentRegistry] Core components already initialized');
    return;
  }

  console.log('[ComponentRegistry] Initializing core components...');

  // 1. CEO - 无依赖，首先注册
  registerComponent(
    COMPONENT_KEYS.CEO,
    () => {
      const { getCEO } = require('./CEO.js');
      return getCEO();
    },
    async () => {
      resetCEO();
    }
  );

  // 2. GoalManager - 依赖 CEO
  registerComponent(
    COMPONENT_KEYS.GOAL_MANAGER,
    () => {
      const { getGoalManager } = require('./GoalManager.js');
      return getGoalManager();
    },
    async () => {
      resetGoalManager();
    }
  );

  // 3. Scheduler - 依赖 CEO（用于任务分配）
  registerComponent(
    COMPONENT_KEYS.SCHEDULER,
    () => {
      const { getScheduler } = require('./Scheduler.js');
      const scheduler = getScheduler();
      // 员工列表将在 Engine 初始化后设置
      return scheduler;
    },
    async () => {
      resetScheduler();
    }
  );

  // 4. Employees - 无依赖，提前创建
  registerComponent(
    COMPONENT_KEYS.EMPLOYEES,
    () => {
      const { EmployeeFactory } = require('./Employee.js');
      return EmployeeFactory.createDefaultEmployees();
    }
  );

  // 5. Engine - 依赖所有其他组件
  registerComponent(
    COMPONENT_KEYS.ENGINE,
    () => {
      const { getEngine } = require('./Engine.js');
      const engine = getEngine();

      // 设置员工列表到 Scheduler
      const scheduler = getComponent<Scheduler>(COMPONENT_KEYS.SCHEDULER);
      const employees = getComponent<Employee[]>(COMPONENT_KEYS.EMPLOYEES);
      scheduler.setEmployees(employees);

      return engine;
    },
    async () => {
      resetEngine();
    }
  );

  initialized = true;
  console.log('[ComponentRegistry] Core components initialized');
}

// ============================================================================
// 类型安全的组件访问函数
// ============================================================================

/**
 * 获取 CEO 实例
 */
export function getCEOInstance(): CEO {
  if (!initialized) {
    initializeCoreComponents();
  }
  return getComponent<CEO>(COMPONENT_KEYS.CEO);
}

/**
 * 获取 GoalManager 实例
 */
export function getGoalManagerInstance(): GoalManager {
  if (!initialized) {
    initializeCoreComponents();
  }
  return getComponent<GoalManager>(COMPONENT_KEYS.GOAL_MANAGER);
}

/**
 * 获取 Scheduler 实例
 */
export function getSchedulerInstance(): Scheduler {
  if (!initialized) {
    initializeCoreComponents();
  }
  return getComponent<Scheduler>(COMPONENT_KEYS.SCHEDULER);
}

/**
 * 获取 Employees 列表
 */
export function getEmployees(): Employee[] {
  if (!initialized) {
    initializeCoreComponents();
  }
  return getComponent<Employee[]>(COMPONENT_KEYS.EMPLOYEES);
}

/**
 * 获取 Engine 实例
 */
export function getEngineInstance(): Engine {
  if (!initialized) {
    initializeCoreComponents();
  }
  return getComponent<Engine>(COMPONENT_KEYS.ENGINE);
}

// ============================================================================
// 重置函数
// ============================================================================

/**
 * 重置所有核心组件
 *
 * 按照正确的依赖顺序清理所有组件
 */
export async function resetAllComponents(): Promise<void> {
  await resetContainer();
  initialized = false;
  console.log('[ComponentRegistry] All components reset');
}

/**
 * 检查组件是否已初始化
 */
export function isInitialized(): boolean {
  return initialized;
}
