/**
 * CXO 架构 - 共享类型定义
 */

// ============================================================================
// 意图类型
// ============================================================================

export type IntentType = 'query' | 'goal' | 'task' | 'script';

export interface Intent {
  /** 意图类型 */
  type: IntentType;
  /** 原始内容 */
  content: string;
  /** 提取的参数 */
  params?: Record<string, any>;
  /** 元数据 */
  metadata?: {
    chatId?: string;
    userId?: string;
    timestamp?: number;
    [key: string]: any;
  };
}

// ============================================================================
// CEO 分析结果（包含意图类型和 CXO 分配）
// ============================================================================

export type CXORole = 'CEO' | 'CRO' | 'CTO' | 'CMO' | 'COO' | 'CFO';

export interface CEOAnalysisResult {
  /** 意图类型 */
  intentType: IntentType;
  /** 原始用户输入 */
  userInput: string;
  /** 提取的参数 */
  params?: Record<string, any>;
  /** CEO 决定由哪个 CXO 处理 */
  assignedCXO: CXORole;
  /** 分配原因 */
  assignmentReason: string;
  /** 置信度 */
  confidence: number;
  /** 分析推理 */
  reasoning: string;
  /** 下一步建议 */
  nextSteps?: string[];
}

// ============================================================================
// 员工相关
// ============================================================================

export interface Employee {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
}

export interface TaskRequirements {
  /** 任务描述 */
  description: string;
  /** 所需能力 */
  requiredCapabilities: string[];
  /** 任务类型 */
  taskType?: string;
  /** 任务子类型 */
  taskSubtype?: string | null;
  /** 优先级 */
  priority?: 'low' | 'medium' | 'high';
  /** 上下文 */
  context?: string;
}

export interface EmployeeMatch {
  /** 匹配的员工 */
  employee: Employee;
  /** Agent 提示词 */
  agentPrompt: string;
  /** 匹配原因 */
  matchReason: string;
  /** 匹配分数 */
  matchScore: number;
  /** 是否新创建 */
  isNew?: boolean;
}

// ============================================================================
// 执行相关
// ============================================================================

export interface ExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 输出内容 */
  output?: string;
  /** 错误信息 */
  error?: string;
  /** 产生的文件/产物 */
  artifacts?: Array<{
    type: 'file' | 'code' | 'plan' | 'directory' | 'url';
    content: string;
    path?: string;
    description?: string;
  }>;
  /** 用时 */
  duration?: number;
  /** Token 使用 */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ============================================================================
// CXO 接口
// ============================================================================

/**
 * CEO - 首席执行官接口
 */
export interface ICEO {
  /**
   * 分析用户意图
   */
  analyzeIntent(userInput: string, chatHistory?: ChatMessage[]): Promise<Intent>;

  /**
   * 分析意图并分配给相应的 CXO（核心方法）
   */
  analyzeAndAssign(userInput: string, chatHistory?: ChatMessage[]): Promise<CEOAnalysisResult>;
}

/**
 * CRO - 首席资源官接口
 */
export interface ICRO {
  /**
   * 为任务匹配合适的员工
   */
  findEmployee(requirements: TaskRequirements, employees: Employee[]): Promise<EmployeeMatch>;

  /**
   * 招聘新员工（创建新 agent）
   */
  hireEmployee(requirements: TaskRequirements): Promise<EmployeeMatch>;

  /**
   * 更新员工绩效
   */
  updatePerformance(employeeId: string, review: TaskReview): Promise<void>;

  /**
   * 获取员工绩效数据
   */
  getEmployeePerformance(employeeId: string): Promise<EmployeePerformance | null>;
}

/**
 * CXO - 执行官接口（CTO/CMO/COO/CFO）
 */
export interface ICXO {
  /** CXO 名称 */
  name: string;
  /** CXO 角色标识 */
  role: 'CTO' | 'CMO' | 'COO' | 'CFO';
  /** 负责的能力 */
  capabilities: string[];

  /**
   * 判断是否能处理该任务
   */
  canHandle(requirements: TaskRequirements): boolean;

  /**
   * 执行任务
   */
  execute(requirements: TaskRequirements, agentPrompt: string): Promise<ExecutionResult>;
}

// ============================================================================
// 其他类型
// ============================================================================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface TaskReview {
  taskId: string;
  success: boolean;
  score: number; // 1-10
  strengths: string[];
  improvements: string[];
}

export interface EmployeePerformance {
  employeeId: string;
  points: number;
  level: number;
  satisfaction: number;
  completedTasks: number;
  avgScore: number;
}
