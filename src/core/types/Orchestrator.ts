/**
 * Orchestrator Types
 * 用于资源查询和智能执行
 */

/** 已找到的资源 */
export interface FoundResources {
  /** 匹配的 cron 任务 */
  cronJobs: Array<{
    id: string;
    name: string;
    description: string | null;
    command: string;
    cron_rule: string | null;
    enabled: number;
  }>;
  /** 相似的任务 */
  similarTasks: Array<{
    id: string;
    description: string;
    status: string;
    created_at: number;
  }>;
  /** 已有脚本 */
  existingScripts: Array<{
    path: string;
    name: string;
    taskDescription: string;
    taskId: string;
  }>;
  /** 提取的关键词 */
  keywords: string[];
}

/** 处理需求选项 */
export interface ProcessRequirementOptions {
  /** 强制创建新任务（跳过资源查询） */
  forceNew?: boolean;
  /** 交互模式（让用户选择） */
  interactive?: boolean;
  /** 搜索最近 N 天的任务（默认 7） */
  searchDays?: number;
  /** 执行上下文 */
  executionContext?: {
    /** 来源渠道 (tg, cli, api 等) */
    source?: string;
    /** 用户 ID */
    userId?: string;
    /** 会话 ID */
    sessionId?: string;
    /** 之前的决策信息 */
    previousDecision?: {
      type: string;
      target: string;
      reason: string;
      confidence: number;
    };
  };
}
