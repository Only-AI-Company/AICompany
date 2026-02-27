/**
 * AI Company - Agents Module
 *
 * Agent 集成模块
 */

// 内部管理 Agents
export { TaskManagerAgent } from './TaskManagerAgent.js';
export { EmployeeManagerAgent } from './EmployeeManagerAgent.js';
export { Orchestrator } from './Orchestrator.js';
export type { TaskAnalysis, AssignmentSuggestion } from './TaskManagerAgent.js';
export type {
  EmployeeAnalysis,
  RecruitSuggestion,
  PerformanceReport,
  TeamOptimization,
  EmployeeHealth,
} from './EmployeeManagerAgent.js';
export type {
  OrchestrationResult,
} from './Orchestrator.js';

export { ReviewerAgent } from './ReviewerAgent.js';
export type { ReviewResult } from './ReviewerAgent.js';
