/**
 * AI Company v2 - Phase 3 核心执行闭环模块
 *
 * 导出所有 Phase 3 新增的核心模块
 */

// Claude CLI Manager - 文件系统和命令执行
export { ClaudeCLIManager, getClaudeCLIManager } from './claude/ClaudeCLIManager.js';
export type { CLIExecutionResult, FileOperation } from './claude/ClaudeCLIManager.js';

// Workspace Manager - 工作区隔离管理
export { WorkspaceManager, getWorkspaceManager } from './Workspace.js';
export type { WorkspaceInfo, WorkspaceOptions } from './Workspace.js';

// Task Planner - 需求拆解为可执行步骤
export { TaskPlanner, getTaskPlanner } from './TaskPlanner.js';
export type { TaskStep, TaskPlan, PlanGenerationOptions } from './TaskPlanner.js';

// Tool Executor - 执行任务步骤
export { ToolExecutor, getToolExecutor } from './ToolExecutor.js';
export type { ExecutionProgress, ExecutionResult, ExecutorOptions } from './ToolExecutor.js';

// Validator - 验证执行结果
export { Validator, getValidator } from './Validator.js';
export type { ValidationResult, ValidationOptions } from './Validator.js';
