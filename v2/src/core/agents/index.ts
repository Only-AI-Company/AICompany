/**
 * AI Company v2 - Agent System Index
 *
 * 导出 Agent 相关模块
 */

// 类型定义（包括 AgentDefinition）
export * from './types.js';

// ========== Agent Factory - 动态生成 Agent ==========
// 根据需求动态生成，无需预定义模板
export {
  AgentFactory,
  getAgentFactory,
  type AgentRequirement,
} from './AgentFactory.js';

// ========== Dynamic Agent - 执行层 ==========
export { DynamicAgent } from './DynamicAgent.js';
