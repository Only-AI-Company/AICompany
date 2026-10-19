/**
 * AI Company v3 - Agent 基础接口
 *
 * 基于 DeepAgent 风格的统一 Agent 接口设计
 *
 * 核心理念：
 * 1. 统一接口 - 所有 Agent 实现相同接口
 * 2. 能力组合 - Agent 可以组合多种能力
 * 3. 记忆驱动 - Agent 从记忆中学习和决策
 * 4. 工具使用 - Agent 通过工具与世界交互
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 任务上下文
 */
export interface TaskContext {
  // 任务信息
  taskId: string;
  goal: Goal;
  constraints: Constraints;

  // 当前状态
  currentState: State;

  // 可用资源
  availableAgents: Agent[];
  availableTools: Tool[];

  // 历史信息
  history: ActionHistory;

  // 相关记忆
  relevantMemories: Memory[];
}

/**
 * 目标
 */
export interface Goal {
  id: string;
  description: string;
  type: 'strategic' | 'tactical' | 'operational';
  priority: 'critical' | 'high' | 'medium' | 'low';
  timeframe: string;
  successCriteria: SuccessCriteria;
  constraints: Constraints;
}

/**
 * 约束条件
 */
export interface Constraints {
  time?: TimeConstraint;
  resources?: ResourceConstraint;
  quality?: QualityConstraint;
  risk?: RiskConstraint;
}

/**
 * 思维过程
 */
export interface ThoughtProcess {
  // 观察
  observations: Observation[];

  // 推理链
  reasoning: {
    initial_hypothesis: string;
    evidence_chain: Evidence[];
    conclusion: string;
    confidence: number;
    reasoning_type: 'deductive' | 'inductive' | 'abductive';
  };

  // 决策
  decision: {
    selected_action: Action;
    alternatives: AlternativeAction[];
    rationale: string;
    expected_outcome: string;
  };

  // 自我反思
  self_critique?: {
    concerns: string[];
    adjustments: string[];
    confidence_adjustment: number;
  };
}

/**
 * 行动
 */
export interface Action {
  id: string;
  type: ActionType;
  agent_id: string;
  description: string;

  // 行动参数
  parameters: Record<string, any>;

  // 预期结果
  expected_outcome?: string;

  // 风险评估
  risk_assessment?: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    mitigation?: string[];
  };

  // 元数据
  metadata?: Record<string, any>;
}

export type ActionType =
  | 'think'           // 思考
  | 'plan'            // 规划
  | 'execute'         // 执行任务
  | 'use_tool'        // 使用工具
  | 'collaborate'     // 协作
  | 'delegate'        // 委派
  | 'request_info'    // 请求信息
  | 'report'          // 报告状态
  | 'learn';          // 学习

/**
 * 行动结果
 */
export interface ActionResult {
  action_id: string;
  agent_id: string;
  timestamp: number;

  // 执行状态
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';

  // 结果
  output?: any;
  error?: string;

  // 性能指标
  duration?: number;
  quality_score?: number;

  // 新信息
  new_observations?: Observation[];
  new_memories?: Memory[];

  // 后续行动建议
  next_actions?: Action[];
}

/**
 * 记忆
 */
export interface Memory {
  id: string;
  type: 'episodic' | 'semantic' | 'procedural';
  timestamp: number;

  // 内容
  content: any;

  // 重要性
  importance: number;
  confidence: number;

  // 关联
  associations: string[];

  // 访问统计
  access_count: number;
  last_accessed: number;

  // 向量（用于语义检索）
  embedding?: number[];
}

/**
 * 反思
 */
export interface Reflection {
  id: string;
  agent_id: string;
  action_id: string;
  timestamp: number;

  // 自我评估
  self_evaluation: {
    success: boolean;
    quality: number;  // 0-10
    efficiency: number;  // 0-10
    satisfaction: number;  // 0-10
  };

  // 改进建议
  improvements: string[];

  // 学习要点
  learnings: string[];

  // 行动调整
  adjustments: {
    keep: string[];
    change: string[];
    add: string[];
    remove: string[];
  };
}

// ============================================================================
// Agent 接口
// ============================================================================

/**
 * 统一 Agent 接口
 *
 * 所有 Agent 必须实现这个接口
 */
export interface Agent {
  // ========================================================================
  // 基本信息
  // ========================================================================

  /**
   * Agent 唯一标识
   */
  readonly id: string;

  /**
   * Agent 名称
   */
  readonly name: string;

  /**
   * Agent 角色定位
   */
  readonly role: AgentRole;

  /**
   * Agent 能力列表
   */
  readonly capabilities: Capability[];

  /**
   * Agent 状态
   */
  readonly status: 'idle' | 'busy' | 'error';

  // ========================================================================
  // 核心能力
  // ========================================================================

  /**
   * 思考 - 分析情况，形成假设
   *
   * @param context 任务上下文
   * @returns 思维过程
   */
  think(context: TaskContext): Promise<ThoughtProcess>;

  /**
   * 规划 - 制定行动计划
   *
   * @param goal 目标
   * @param constraints 约束条件
   * @returns 执行计划
   */
  plan(goal: Goal, constraints: Constraints): Promise<Plan>;

  /**
   * 执行 - 执行行动
   *
   * @param action 行动
   * @param context 执行上下文
   * @returns 行动结果
   */
  act(action: Action, context: ExecutionContext): Promise<ActionResult>;

  /**
   * 反思 - 评估结果，学习改进
   *
   * @param action 执行的行动
   * @param result 行动结果
   * @returns 反思结果
   */
  reflect(action: Action, result: ActionResult): Promise<Reflection>;

  // ========================================================================
  // 记忆能力
  // ========================================================================

  /**
   * 学习 - 从经验中学习
   *
   * @param experience 经验
   */
  learn(experience: Experience): Promise<void>;

  /**
   * 回忆 - 检索相关记忆
   *
   * @param query 记忆查询
   * @returns 相关记忆列表
   */
  recall(query: MemoryQuery): Promise<Memory[]>;

  /**
   * 遗忘 - 删除过期或低价值记忆
   *
   * @param criteria 遗忘标准
   */
  forget(criteria: ForgettingCriteria): Promise<number>;

  // ========================================================================
  // 协作能力
  // ========================================================================

  /**
   * 协作 - 与其他 Agent 协作完成任务
   *
   * @param agents 协作的 Agent 列表
   * @param task 任务
   * @param role 协作中的角色
   * @returns 协作结果
   */
  collaborate(
    agents: Agent[],
    task: Task,
    role: 'leader' | 'contributor' | 'reviewer'
  ): Promise<CollaborationResult>;

  /**
   * 委派 - 将任务委派给其他 Agent
   *
   * @param task 要委派的任务
   * @param candidates 候选 Agent 列表
   * @returns 委派决策
   */
  delegate(task: Task, candidates: Agent[]): Promise<DelegationDecision>;

  /**
   * 通信 - 向其他 Agent 发送消息
   *
   * @param message 消息
   * @param recipient 接收者
   * @returns 响应
   */
  communicate(message: AgentMessage, recipient: Agent): Promise<AgentMessage>;

  // ========================================================================
  // 工具使用
  // ========================================================================

  /**
   * 获取可用工具列表
   */
  getAvailableTools(): Tool[];

  /**
   * 使用工具
   *
   * @param tool 工具
   * @param parameters 参数
   * @returns 工具结果
   */
  useTool(tool: Tool, parameters: any): Promise<ToolResult>;

  // ========================================================================
  // 生命周期
  // ========================================================================

  /**
   * 初始化
   */
  initialize(): Promise<void>;

  /**
   * 启动
   */
  start(): Promise<void>;

  /**
   * 停止
   */
  stop(): Promise<void>;

  /**
   * 重置状态
   */
  reset(): Promise<void>;

  // ========================================================================
  // 监控
  // ========================================================================

  /**
   * 获取状态
   */
  getState(): AgentState;

  /**
   * 获取性能指标
   */
  getMetrics(): AgentMetrics;
}

// ============================================================================
// 辅助类型
// ============================================================================

export type AgentRole =
  | 'ceo'           // CEO - 决策中枢
  | 'planner'       // 规划师
  | 'executor'      // 执行者
  | 'reviewer'       // 复盘者
  | 'researcher'     // 研究员
  | 'creator'        // 创作者
  | 'publisher'      // 发布者
  | 'analyst'        // 分析师
  | 'specialist';    // 领域专家

export type Capability =
  | 'strategic_thinking'    // 战略思维
  | 'planning'              // 规划
  | 'execution'             // 执行
  | 'tool_use'              // 工具使用
  | 'memory'                // 记忆
  | 'learning'              // 学习
  | 'communication'         // 沟通
  | 'collaboration'         // 协作
  | 'research'              // 研究
  | 'creation'              // 创作
  | 'analysis'              // 分析;

export interface Tool {
  name: string;
  description: string;
  category: string;
  input_schema: any;
  output_schema: any;

  execute(params: any): Promise<ToolResult>;
  validate(params: any): boolean;
}

export interface Plan {
  id: string;
  goal_id: string;
  steps: PlanStep[];
  dependencies: DependencyGraph;
  resource_requirements: ResourceRequirement[];
  timeline: Timeline;
  contingency_plans: ContingencyPlan[];
}

export interface PlanStep {
  id: string;
  description: string;
  agent_id?: string;
  tool?: Tool;
  estimated_duration: number;
  dependencies: string[];
  success_criteria: SuccessCriteria;
}

export interface Experience {
  id: string;
  agent_id: string;
  task_id: string;
  action: Action;
  result: ActionResult;
  context: TaskContext;
  timestamp: number;
}

// ... (更多辅助类型定义)

// ============================================================================
// 导出
// ============================================================================

export * from './AgentBase.js';
export * from './Memory.js';
export * from './Tools.js';
