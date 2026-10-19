/**
 * 能力匹配器 - 将用户需求匹配到系统能力
 *
 * 核心思想：不是预先分类，而是动态匹配
 */

import { getToolRegistry } from '../tools/ToolRegistry.js';

export interface SystemCapability {
  name: string;
  description: string;
  tools: string[];
  canSatisfy: (userWant: string) => boolean;
  suggestedAction: (userWant: string) => string;
}

/**
 * 系统能力清单
 */
export const SYSTEM_CAPABILITIES: SystemCapability[] = [
  {
    name: '外部信息获取',
    description: '获取新闻、天气、实时信息',
    tools: ['HTTP', 'web_search'],
    canSatisfy: (userWant) => {
      const keywords = ['最新', '新闻', '局势', '天气', '多少钱', '汇率', '搜索'];
      return keywords.some(k => userWant.includes(k));
    },
    suggestedAction: (userWant) => `使用网络工具搜索"${userWant}"`,
  },
  {
    name: '系统状态查询',
    description: '查询 AI Company 内部状态',
    tools: ['query_system_status', 'list_employees', 'list_tasks'],
    canSatisfy: (userWant) => {
      const keywords = ['系统', '员工', '任务', '状态', '有多少'];
      return keywords.some(k => userWant.includes(k));
    },
    suggestedAction: (userWant) => `查询系统状态`,
  },
  {
    name: '代码开发',
    description: '写代码、开发功能、技术实现',
    tools: ['cto_execute_coding'],
    canSatisfy: (userWant) => {
      const keywords = ['开发', '写代码', '实现', 'API', '功能', '网站'];
      return keywords.some(k => userWant.includes(k));
    },
    suggestedAction: (userWant) => `使用 CTO 开发：${userWant}`,
  },
  {
    name: '内容创作',
    description: '写文章、文案、内容',
    tools: ['cmo_create_content'],
    canSatisfy: (userWant) => {
      const keywords = ['写', '文案', '文章', '内容', '博客'];
      return keywords.some(k => userWant.includes(k));
    },
    suggestedAction: (userWant) => `使用 CMO 创作：${userWant}`,
  },
  {
    name: '任务执行',
    description: '执行具体任务',
    tools: ['execute_script', 'bash'],
    canSatisfy: (userWant) => {
      const keywords = ['执行', '运行', '部署'];
      return keywords.some(k => userWant.includes(k));
    },
    suggestedAction: (userWant) => `执行任务：${userWant}`,
  },
];

/**
 * 能力匹配器
 */
export class CapabilityMatcher {
  /**
   * 匹配用户需求到系统能力
   */
  match(userWant: string): {
    capability: SystemCapability | null;
    confidence: number;
    reasoning: string;
  } {
    for (const cap of SYSTEM_CAPABILITIES) {
      if (cap.canSatisfy(userWant)) {
        return {
          capability: cap,
          confidence: 0.9,
          reasoning: `匹配到能力：${cap.name}`,
        };
      }
    }

    // 没有匹配的能力
    return {
      capability: null,
      confidence: 0,
      reasoning: '系统没有满足此需求的能力',
    };
  }

  /**
   * 获取系统可以做什么
   */
  listCapabilities(): string {
    return SYSTEM_CAPABILITIES.map(cap => `- ${cap.name}：${cap.description}`).join('\n');
  }
}
