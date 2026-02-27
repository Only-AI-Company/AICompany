/**
 * AI Company v2 - 主入口
 *
 * 导出所有公共 API
 */

// 核心模块
export { getEventBus, EventBus } from './core/Event.js';
export { getOrchestrator, Orchestrator } from './core/Orchestrator.js';
export { getGoalManager, GoalManager } from './core/Goal.js';
export { getExecutionEngine, ExecutionEngine } from './core/Execute.js';
export { getCronScheduler, CronScheduler } from './core/CronScheduler.js';
export { InputCollector, InputClassifier } from './core/Input.js';
export { IntentionAnalyzer } from './core/Intent.js';
export { getEmployeeService, EmployeeService } from './core/Employee.js';
export { getConfigService, ConfigService } from './core/Config.js';

// 类型导出
export type { EmployeeRole } from './core/Employee.js';
// EmployeeState 从 types.ts 导出（已包含在 export * 中）

// 基础设施
export { getDatabase, AIDatabase } from './db/Database.js';
export { getAIProvider, AIProvider } from './ai/AI.js';

// 类型
export * from './types.js';
