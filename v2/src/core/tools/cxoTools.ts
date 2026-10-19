/**
 * CXO 工具系统
 *
 * 将 CXO 的能力包装为工具，供 Agent 调用
 */

import { getCTO, getCMO, getCOO, getCFO, getCRO } from '../cxo/index.js';
import type { Tool, ToolCategory, ToolResult } from './types.js';
import type { TaskRequirements } from '../cxo/types.js';
import { getDatabase } from '../../db/Database.js';

const db = getDatabase();

// ============================================================================
// CTO 工具
// ============================================================================

export const cto_execute_coding: Tool = {
  name: 'cto_execute_coding',
  description: '执行技术/编码任务，包括代码开发、架构设计、API 开发等',
  category: 'task' as ToolCategory,
  parameters: {
    type: 'object',
    properties: {
      description: { type: 'string', description: '任务描述' },
      capabilities: { type: 'array', items: { type: 'string', description: '' }, description: '所需能力' },
    },
    required: ['description'],
  },
  handler: async (input: any) => {
    const cto = getCTO();
    const employee = db.prepare('SELECT system_prompt FROM employees WHERE id = ?').bind('emp-cto').get() as any;
    const agentPrompt = employee?.system_prompt || '你是技术专家';

    const requirements: TaskRequirements = {
      description: input.description,
      requiredCapabilities: input.capabilities || ['coding'],
    };

    const result = await cto.execute(requirements, agentPrompt);
    return { success: result.success, data: result.output, error: result.error };
  },
};

export const cto_review_code: Tool = {
  name: 'cto_review_code',
  description: '审查代码质量、安全性、性能',
  category: 'task' as ToolCategory,
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: '要审查的代码' },
      language: { type: 'string', description: '编程语言' },
    },
    required: ['code'],
  },
  handler: async (input: any) => {
    const cto = getCTO();
    const employee = db.prepare('SELECT system_prompt FROM employees WHERE id = ?').bind('emp-cto').get() as any;
    const agentPrompt = employee?.system_prompt || '你是技术专家，负责代码审查';

    const requirements: TaskRequirements = {
      description: `审查${input.language || '代码'}:\n${input.code}`,
      requiredCapabilities: ['coding', 'review'],
    };

    const result = await cto.execute(requirements, agentPrompt);
    return { success: result.success, data: result.output, error: result.error };
  },
};

// ============================================================================
// CMO 工具
// ============================================================================

export const cmo_create_content: Tool = {
  name: 'cmo_create_content',
  description: '创建营销内容，包括文案、广告、推广内容',
  category: 'task' as ToolCategory,
  parameters: {
    type: 'object',
    properties: {
      description: { type: 'string', description: '内容需求' },
      contentType: { type: 'string', description: '内容类型' },
      targetAudience: { type: 'string', description: '目标受众' },
    },
    required: ['description'],
  },
  handler: async (input: any) => {
    const cmo = getCMO();
    const employee = db.prepare('SELECT system_prompt FROM employees WHERE id = ?').bind('emp-cmo').get() as any;
    const agentPrompt = employee?.system_prompt || '你是营销专家';

    let contentDesc = input.contentType ? `创建${input.contentType}` : input.description;
    if (input.targetAudience) contentDesc += `\n目标：${input.targetAudience}`;

    const requirements: TaskRequirements = {
      description: contentDesc,
      requiredCapabilities: ['writing', 'marketing'],
    };

    const result = await cmo.execute(requirements, agentPrompt);
    return { success: result.success, data: result.output, error: result.error };
  },
};

export const cmo_analyze_growth: Tool = {
  name: 'cmo_analyze_growth',
  description: '分析用户增长数据、营销效果',
  category: 'query' as ToolCategory,
  parameters: {
    type: 'object',
    properties: {
      data: { type: 'string', description: '增长数据或需求' },
    },
    required: ['data'],
  },
  handler: async (input: any) => {
    const cmo = getCMO();
    const employee = db.prepare('SELECT system_prompt FROM employees WHERE id = ?').bind('emp-cmo').get() as any;
    const agentPrompt = employee?.system_prompt || '你是营销专家，负责增长分析';

    const requirements: TaskRequirements = {
      description: `分析增长：${input.data}`,
      requiredCapabilities: ['analysis', 'growth'],
    };

    const result = await cmo.execute(requirements, agentPrompt);
    return { success: result.success, data: result.output, error: result.error };
  },
};

// ============================================================================
// COO 工具
// ============================================================================

export const coo_manage_goal: Tool = {
  name: 'coo_manage_goal',
  description: '管理目标，包括创建、分解、跟踪',
  category: 'goal' as ToolCategory,
  parameters: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: '目标描述' },
      action: { type: 'string', description: '操作（create/breakdown/track）' },
    },
    required: ['goal', 'action'],
  },
  handler: async (input: any) => {
    const coo = getCOO();
    const employee = db.prepare('SELECT system_prompt FROM employees WHERE id = ?').bind('emp-coo').get() as any;
    const agentPrompt = employee?.system_prompt || '你是运营专家，负责目标管理';

    const actionText = input.action === 'create' ? '创建' : input.action === 'breakdown' ? '分解' : '跟踪';
    const requirements: TaskRequirements = {
      description: `${actionText}目标：${input.goal}`,
      requiredCapabilities: ['planning', 'management'],
    };

    const result = await coo.execute(requirements, agentPrompt);
    return { success: result.success, data: result.output, error: result.error };
  },
};

export const coo_execute_script: Tool = {
  name: 'coo_execute_script',
  description: '执行预定义的自动化脚本',
  category: 'task' as ToolCategory,
  parameters: {
    type: 'object',
    properties: {
      script: { type: 'string', description: '脚本名称或命令' },
    },
    required: ['script'],
  },
  handler: async (input: any) => {
    const coo = getCOO();
    const employee = db.prepare('SELECT system_prompt FROM employees WHERE id = ?').bind('emp-coo').get() as any;
    const agentPrompt = employee?.system_prompt || '你是运营专家，负责脚本执行';

    const requirements: TaskRequirements = {
      description: `执行脚本：${input.script}`,
      requiredCapabilities: ['automation', 'scripting'],
    };

    const result = await coo.execute(requirements, agentPrompt);
    return { success: result.success, data: result.output, error: result.error };
  },
};

export const coo_optimize_process: Tool = {
  name: 'coo_optimize_process',
  description: '优化业务流程，提高效率',
  category: 'task' as ToolCategory,
  parameters: {
    type: 'object',
    properties: {
      process: { type: 'string', description: '流程描述' },
    },
    required: ['process'],
  },
  handler: async (input: any) => {
    const coo = getCOO();
    const employee = db.prepare('SELECT system_prompt FROM employees WHERE id = ?').bind('emp-coo').get() as any;
    const agentPrompt = employee?.system_prompt || '你是运营专家，负责流程优化';

    const requirements: TaskRequirements = {
      description: `优化流程：${input.process}`,
      requiredCapabilities: ['analysis', 'optimization'],
    };

    const result = await coo.execute(requirements, agentPrompt);
    return { success: result.success, data: result.output, error: result.error };
  },
};

// ============================================================================
// CFO 工具
// ============================================================================

export const cfo_analyze_finance: Tool = {
  name: 'cfo_analyze_finance',
  description: '分析财务数据、成本、ROI',
  category: 'query' as ToolCategory,
  parameters: {
    type: 'object',
    properties: {
      data: { type: 'string', description: '财务数据或需求' },
    },
    required: ['data'],
  },
  handler: async (input: any) => {
    const cfo = getCFO();
    const employee = db.prepare('SELECT system_prompt FROM employees WHERE id = ?').bind('emp-cfo').get() as any;
    const agentPrompt = employee?.system_prompt || '你是财务专家，负责财务分析';

    const requirements: TaskRequirements = {
      description: `分析财务：${input.data}`,
      requiredCapabilities: ['analysis', 'finance'],
    };

    const result = await cfo.execute(requirements, agentPrompt);
    return { success: result.success, data: result.output, error: result.error };
  },
};

export const cfo_prepare_report: Tool = {
  name: 'cfo_prepare_report',
  description: '准备财务报告、数据分析报告',
  category: 'task' as ToolCategory,
  parameters: {
    type: 'object',
    properties: {
      reportType: { type: 'string', description: '报告类型' },
      data: { type: 'string', description: '报告数据' },
    },
    required: ['reportType'],
  },
  handler: async (input: any) => {
    const cfo = getCFO();
    const employee = db.prepare('SELECT system_prompt FROM employees WHERE id = ?').bind('emp-cfo').get() as any;
    const agentPrompt = employee?.system_prompt || '你是财务专家，负责报告准备';

    const desc = input.data ? `准备${input.reportType}，数据：${input.data}` : `准备${input.reportType}`;
    const requirements: TaskRequirements = {
      description: desc,
      requiredCapabilities: ['analysis', 'reporting'],
    };

    const result = await cfo.execute(requirements, agentPrompt);
    return { success: result.success, data: result.output, error: result.error };
  },
};

// ============================================================================
// CRO 工具
// ============================================================================

export const cro_find_employee: Tool = {
  name: 'cro_find_employee',
  description: '为任务匹配合适的员工',
  category: 'employee' as ToolCategory,
  parameters: {
    type: 'object',
    properties: {
      description: { type: 'string', description: '任务描述' },
      capabilities: { type: 'array', items: { type: 'string', description: '' }, description: '所需能力' },
    },
    required: ['description'],
  },
  handler: async (input: any) => {
    const cro = getCRO();
    const employees = db.prepare('SELECT id, name, role, capabilities FROM employees WHERE status = ?').bind('active').all() as any[];
    const employeeList = employees.map((row: any) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      capabilities: JSON.parse(row.capabilities || '[]'),
    }));

    const requirements: TaskRequirements = {
      description: input.description,
      requiredCapabilities: input.capabilities || ['analysis'],
    };

    const match = await cro.findEmployee(requirements, employeeList);
    return { success: true, data: { employee: match.employee, matchReason: match.matchReason } };
  },
};

export const cro_hire_employee: Tool = {
  name: 'cro_hire_employee',
  description: '为特定任务招聘新员工',
  category: 'employee' as ToolCategory,
  parameters: {
    type: 'object',
    properties: {
      description: { type: 'string', description: '任务描述' },
      capabilities: { type: 'array', items: { type: 'string', description: '' }, description: '所需能力' },
    },
    required: ['description'],
  },
  handler: async (input: any) => {
    const cro = getCRO();
    const requirements: TaskRequirements = {
      description: input.description,
      requiredCapabilities: input.capabilities || ['analysis'],
    };

    const match = await cro.hireEmployee(requirements);
    return { success: true, data: { employee: match.employee, agentPrompt: match.agentPrompt, isNew: true } };
  },
};

// ============================================================================
// 工具导出
// ============================================================================

export const cxoTools = [
  cto_execute_coding,
  cto_review_code,
  cmo_create_content,
  cmo_analyze_growth,
  coo_manage_goal,
  coo_execute_script,
  coo_optimize_process,
  cfo_analyze_finance,
  cfo_prepare_report,
  cro_find_employee,
  cro_hire_employee,
];

/**
 * 注册所有 CXO 工具
 */
export function registerCXOTools(toolRegistry: any): void {
  for (const tool of cxoTools) {
    toolRegistry.register(tool);
    console.log(`[CXOTools] ✅ ${tool.name}`);
  }
}
