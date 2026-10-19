/**
 * Intent Recognition - 交互层核心
 *
 * 负责：
 * - 用户意图识别
 * - 实体提取
 * - 置信度评估
 */

import pino from 'pino';
import type { Intent, IntentType } from '../../types';

export interface IntentConfig {
  model?: string;
  threshold?: number;
}

export interface IntentResult {
  intent: Intent;
  rawInput: string;
  timestamp: number;
}

export class IntentRecognizer {
  private logger: pino.Logger;

  // 意图关键词映射
  private intentPatterns: Record<IntentType, string[]> = {
    query: ['查询', '搜索', '查找', '看看', '了解', '知道', '什么', 'how', 'what', 'when', 'where', 'who', '怎么', '如何', '能否', '可以'],
    task: ['执行', '完成', '帮我', '创建', '设置', '运行', 'start', 'run', 'create'],
    goal: ['目标', '计划', '想要', '希望', '长期', '短期', 'goal', 'plan', 'want'],
    chat: ['你好', '嗨', 'hello', 'hi', 'hey', '在吗', '最近', '聊天', '你好吗'],
    status: ['状态', '进度', '情况', 'status', 'progress'],
    config: ['配置', '设置', '修改', '调整', '更改', 'config', 'setting', 'change'],
    approval_request: ['确认', '审批', '同意', '批准', 'approve', 'confirm'],
    feedback_request: ['反馈', '评价', '满意', '建议', 'feedback', 'rating']
  };

  constructor(_config: IntentConfig = {}) {
    this.logger = pino({ name: 'intent-recognizer' });
  }

  /**
   * 识别用户意图
   */
  recognize(input: string, _context?: any): Intent {
    const normalizedInput = input.toLowerCase().trim();

    // 计算每个意图的得分
    const scores = this.calculateScores(normalizedInput);

    // 找出最佳意图
    const bestMatch = this.findBestMatch(scores);

    // 提取实体
    const entities = this.extractEntities(normalizedInput, bestMatch.type);

    // 计算置信度
    const confidence = this.calculateConfidence(scores, bestMatch);

    const intent: Intent = {
      type: bestMatch.type,
      confidence,
      entities,
      rawInput: input
    };

    this.logger.debug({ input, intent }, 'Intent recognized');

    return intent;
  }

  private calculateScores(input: string): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const [intentType, patterns] of Object.entries(this.intentPatterns)) {
      let score = 0;

      for (const pattern of patterns) {
        if (input.includes(pattern.toLowerCase())) {
          score += 1;
        }
      }

      // 精确匹配加分
      if (input === input.split(' ')[0] && patterns.some(p => input === p.toLowerCase())) {
        score += 2;
      }

      scores[intentType] = score;
    }

    return scores;
  }

  private findBestMatch(scores: Record<string, number>): { type: IntentType; score: number } {
    let bestType: IntentType = 'chat';
    let bestScore = 0;

    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestType = type as IntentType;
        bestScore = score;
      }
    }

    // 如果没有匹配，默认为 chat
    if (bestScore === 0) {
      return { type: 'chat', score: 0 };
    }

    return { type: bestType, score: bestScore };
  }

  private extractEntities(input: string, intentType: IntentType): Record<string, any> {
    const entities: Record<string, any> = {};

    // 提取时间实体
    const timePatterns = [
      { pattern: /今天|今天|today/i, value: 'today' },
      { pattern: /明天|明天|tomorrow/i, value: 'tomorrow' },
      { pattern: /后天|后天|day after tomorrow/i, value: 'day_after_tomorrow' },
      { pattern: /这周|本周|this week/i, value: 'this_week' },
      { pattern: /下周|next week/i, value: 'next_week' },
      { pattern: /每月 | 每个月|monthly/i, value: 'monthly' },
      { pattern: /每周 | 每个星期|weekly/i, value: 'weekly' },
      { pattern: /每天|daily/i, value: 'daily' },
      { pattern: /\d+[点時时]/i, value: 'specific_time' }
    ];

    for (const { pattern, value } of timePatterns) {
      if (pattern.test(input)) {
        entities.time = value;
        break;
      }
    }

    // 提取优先级实体
    const priorityPatterns = [
      { pattern: /紧急 | 急 |urgent|critical/i, value: 'critical' },
      { pattern: /重要|important|high/i, value: 'high' },
      { pattern: /普通 | 一般|normal|medium/i, value: 'medium' },
      { pattern: /低|low/i, value: 'low' }
    ];

    for (const { pattern, value } of priorityPatterns) {
      if (pattern.test(input)) {
        entities.priority = value;
        break;
      }
    }

    // 根据意图类型提取特定实体
    switch (intentType) {
      case 'task':
        // 提取任务描述
        entities.taskDescription = this.extractTaskDescription(input);
        break;

      case 'goal':
        // 提取目标描述
        entities.goalDescription = this.extractGoalDescription(input);
        break;

      case 'query':
        // 提取查询主题
        entities.queryTopic = this.extractQueryTopic(input);
        break;
    }

    return entities;
  }

  private extractTaskDescription(input: string): string {
    // 移除意图关键词，保留任务描述
    const keywords = ['帮我', '请', '想要', '需要', '执行', '完成', '做'];
    let description = input;

    for (const keyword of keywords) {
      const index = description.indexOf(keyword);
      if (index !== -1) {
        description = description.substring(index + keyword.length);
        break;
      }
    }

    return description.trim();
  }

  private extractGoalDescription(input: string): string {
    const keywords = ['目标', '计划', '想要', '希望'];
    let description = input;

    for (const keyword of keywords) {
      const index = description.indexOf(keyword);
      if (index !== -1) {
        description = description.substring(index + keyword.length);
        break;
      }
    }

    return description.trim();
  }

  private extractQueryTopic(input: string): string {
    const keywords = ['查询', '搜索', '查找', '看看', '了解', '知道'];
    let topic = input;

    for (const keyword of keywords) {
      const index = topic.indexOf(keyword);
      if (index !== -1) {
        topic = topic.substring(index + keyword.length);
        break;
      }
    }

    return topic.trim();
  }

  private calculateConfidence(
    scores: Record<string, number>,
    bestMatch: { type: IntentType; score: number }
  ): number {
    if (bestMatch.score === 0) {
      return 0.3; // 默认低置信度
    }

    // 计算相对置信度
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
    if (totalScore === 0) {
      return 0.5;
    }

    const relativeConfidence = bestMatch.score / totalScore;

    // 绝对置信度（基于匹配关键词数量）
    const absoluteConfidence = Math.min(bestMatch.score / 5, 1);

    // 加权平均
    return Math.round((relativeConfidence * 0.6 + absoluteConfidence * 0.4) * 100) / 100;
  }

  /**
   * 批量识别
   */
  batchRecognize(inputs: string[]): IntentResult[] {
    return inputs.map(input => ({
      intent: this.recognize(input),
      rawInput: input,
      timestamp: Date.now()
    }));
  }

  /**
   * 添加自定义模式
   */
  addPattern(intentType: IntentType, patterns: string[]): void {
    if (!this.intentPatterns[intentType]) {
      this.intentPatterns[intentType] = [];
    }
    this.intentPatterns[intentType].push(...patterns);
    this.logger.info({ intentType, patterns }, 'Custom patterns added');
  }

  /**
   * 获取支持的意图类型
   */
  getSupportedIntents(): IntentType[] {
    return Object.keys(this.intentPatterns) as IntentType[];
  }
}
