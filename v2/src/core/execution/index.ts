/**
 * AI Company v2 - Execution Module
 *
 * Task Session 管理 - 每个 Task 有独立的 Claude CLI Session
 */

export {
  TaskSession,
  TaskSessionManager,
  getTaskSessionManager,
  resetTaskSessionManager,
  type TaskSessionOptions,
  type TaskSessionOutput,
  type TaskSessionState,
} from './TaskSessionManager.js';
