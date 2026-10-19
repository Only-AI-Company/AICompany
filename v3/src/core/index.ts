/**
 * AI Company v3 - Core Index
 *
 * Main exports for the core module
 */

// Types
export * from './types.js';

// Core Components
export { getCEO, CEO } from './CEO.js';
export { getEngine, Engine } from './Engine.js';
export { getGoalManager, GoalManager } from './GoalManager.js';
export { getScheduler, Scheduler } from './Scheduler.js';
export { EmployeeFactory, EmployeeImpl } from './Employee.js';

// Database
export { getDatabase, getDatabaseSync, resetDatabase, AIDatabase } from './database/index.js';

// AI
export { getAIProvider, resetAIProvider } from './ai/index.js';

// Utils
export { generateId, parseJSON, delay, safeStringify } from './utils.js';
