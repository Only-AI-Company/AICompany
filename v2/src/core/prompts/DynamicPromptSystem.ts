/**
 * AI Company v2 - Dynamic Prompt System
 *
 * 动态组装 System Prompt，参考 Claude Code 架构
 *
 * 核心原则：
 * 1. 提示词即代码 - 通过指令控制行为
 * 2. 分层架构 - 宪法 + 工具 + 动态注入
 * 3. 零硬编码 - 动态生成，不写死场景
 */

import type { Tool } from '../tools/types.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';

export interface DynamicPromptConfig {
  agentName: string;
  agentCapabilities: string[];
  taskDescription: string;
  context?: string;
  mode?: 'execute' | 'plan' | 'explore';
  availableTools: Tool[];
}

/**
 * 生成动态 System Prompt
 */
export function generateDynamicSystemPrompt(config: DynamicPromptConfig): string {
  const { agentName, agentCapabilities, taskDescription, context, mode, availableTools } = config;

  const sections: string[] = [];

  // === 第一层：核心身份（宪法）===
  sections.push(buildCoreIdentitySection(agentName, agentCapabilities));

  // === 第二层：行为原则（怎么思考）===
  sections.push(buildBehaviorPrinciplesSection(mode));

  // === 第三层：工具约束（每个工具的规则）===
  sections.push(buildToolConstraintsSection(availableTools));

  // === 第四层：动态注入（当前状态）===
  sections.push(buildDynamicInjectionSection(mode, context));

  // === 第五层：任务上下文 ===
  sections.push(buildTaskContextSection(taskDescription, context));

  return sections.join('\n\n');
}

/**
 * 第一层：核心身份
 * 简洁定义角色，不列举具体职责
 */
function buildCoreIdentitySection(agentName: string, capabilities: string[]): string {
  const parts = [
    `# 你是谁`,
    `你是 ${agentName}，工作在 AI Company 系统中。`,
    ``,
    `# 你的核心能力`,
    ...capabilities.map(cap => `- ${cap}`),
  ];
  return parts.join('\n');
}

/**
 * 第二层：行为原则
 * 教怎么思考，不教具体场景，不给例子
 */
function buildBehaviorPrinciplesSection(mode?: string): string {
  const parts = [
    `# 工作原则`,
    ``,
    `## 理解意图`,
    `分析用户真正想要的结果。`,
    ``,
    `## 执行优先`,
    `任务是"做某事"，不是"计划做某事"。`,
    `去执行，而不是描述如何执行。`,
    ``,
    `## 选择工具`,
    `根据任务需要选择合适的工具组合。`,
    `工具之间可以配合使用。`,
    ``,
    `## 验证完成`,
    `任务真正完成后才停止。`,
    `用户收到结果才算完成。`,
  ];

  // 模式特定约束
  if (mode === 'plan') {
    parts.push(``, `## 当前模式：规划模式`, `只设计方案，不执行任何修改操作。`);
  } else if (mode === 'explore') {
    parts.push(``, `## 当前模式：探索模式`, `只读取信息，不执行任何修改操作。`);
  }

  return parts.join('\n');
}

/**
 * 第三层：工具约束
 * 动态从工具注册表获取，包含每个工具的使用规则
 * 参考 Claude Code：Bash 工具明确说明 DO NOT use for file operations
 */
function buildToolConstraintsSection(tools: Tool[]): string {
  const parts = [
    `# 可用工具`,
    ``,
    `你可以使用以下工具完成任务：`,
    ``,
  ];

  // 动态生成工具约束
  for (const tool of tools) {
    if (!tool.enabled) continue;

    const toolInfo = [
      `## ${tool.name}`,
      tool.description,
    ];

    // 添加工具约束（如果有）
    if (tool.constraints) {
      toolInfo.push(``, `**约束：**`, ...tool.constraints);
    }

    // 添加参数说明
    const requiredParams = Object.entries(tool.parameters.properties || {})
      .filter(([_, param]) => (param as any).required)
      .map(([name, param]) => `- ${name}: ${(param as any).description}`)
      .join('\n');

    if (requiredParams) {
      toolInfo.push(``, `**必需参数：**`, requiredParams);
    }

    parts.push(toolInfo.join('\n'), ``);
  }

  return parts.join('\n');
}

/**
 * 第四层：动态注入
 * 根据当前状态动态添加约束
 */
function buildDynamicInjectionSection(mode?: string, context?: string): string {
  const parts: string[] = [];

  // 模式注入
  if (mode === 'plan') {
    parts.push(`**当前处于规划模式，禁止执行任何修改操作。**`);
  } else if (mode === 'explore') {
    parts.push(`**当前处于探索模式，只允许读取操作。**`);
  }

  // 上下文注入
  if (context) {
    parts.push(``, `**上下文信息：**`, context);
  }

  if (parts.length > 0) {
    return `# 当前状态\n\n` + parts.join('\n\n');
  }
  return '';
}

/**
 * 第五层：任务上下文
 */
function buildTaskContextSection(taskDescription: string, context?: string): string {
  const parts = [
    `# 当前任务`,
    taskDescription,
  ];

  if (context) {
    parts.push(``, `# 补充信息`, context);
  }

  return parts.join('\n');
}

/**
 * 工具约束定义（扩展 Tool 类型）
 * 可以在工具注册时添加约束规则
 */
export interface ToolConstraint {
  toolName: string;
  constraints: string[];
  examples?: never; // 不给例子
}

/**
 * 预定义的工具约束（参考 Claude Code）
 */
export const TOOL_CONSTRAINTS: Record<string, string[]> = {
  Bash: [
    `仅用于终端操作（git、npm、docker 等）`,
    `禁止用于文件读写操作，应使用专用工具`,
    `避免使用 find/grep/cat，改用 Glob/Grep/Read 工具`,
  ],
  Read: [
    `读取文件内容`,
    `读取前确保文件路径正确`,
  ],
  Write: [
    `写入新文件或覆盖现有文件`,
    `如果文件已存在且需要保留内容，应使用 Edit 工具`,
  ],
  Edit: [
    `修改现有文件的部分内容`,
    `必须先读取文件才能编辑`,
    `仅用于修改，不用于创建新文件`,
  ],
  BrowserOpen: [
    `打开网页并导航到指定 URL`,
    `浏览器会保持登录状态`,
  ],
  BrowserClick: [
    `点击页面元素`,
    `可以通过选择器或文本定位元素`,
  ],
  BrowserType: [
    `在输入框中输入文本`,
    `会自动清空现有内容`,
  ],
  // 其他工具的约束...
};

/**
 * 为工具添加约束
 */
export function addToolConstraints(tool: Tool, constraints: string[]): Tool {
  return {
    ...tool,
    constraints,
  };
}
