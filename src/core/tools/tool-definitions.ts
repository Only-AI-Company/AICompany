/**
 * AI Company - Tool Definitions
 *
 * 系统工具定义，用于 AI 路由决策
 */

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export const TOOLS: ToolDefinition[] = [
  // ============================================================================
  // 查询工具
  // ============================================================================

  {
    name: 'list_tasks',
    description: '列出所有任务，支持按状态筛选',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: '状态筛选: pending/in_progress/completed/failed', enum: ['pending', 'in_progress', 'completed', 'failed'] },
        limit: { type: 'number', description: '返回数量限制，默认10' }
      }
    }
  },

  {
    name: 'get_task',
    description: '获取指定任务的详细信息',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '任务ID' },
        description: { type: 'string', description: '任务描述（模糊匹配）' }
      },
      required: []
    }
  },

  {
    name: 'list_employees',
    description: '列出所有员工，支持按角色/状态筛选',
    input_schema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: '角色筛选: CEO/CTO/CMO/COO/Developer/Designer等' },
        status: { type: 'string', description: '状态筛选: active/busy/offline', enum: ['active', 'busy', 'offline'] },
        limit: { type: 'number', description: '返回数量限制，默认10' }
      }
    }
  },

  {
    name: 'get_employee',
    description: '获取指定员工的详细信息',
    input_schema: {
      type: 'object',
      properties: {
        employee_id: { type: 'string', description: '员工ID' },
        name: { type: 'string', description: '员工姓名（模糊匹配）' }
      },
      required: []
    }
  },

  {
    name: 'list_crons',
    description: '列出所有定时任务/脚本',
    input_schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: '只显示已启用的任务' }
      }
    }
  },

  {
    name: 'get_status',
    description: '获取系统整体状态（员工数、任务数等）',
    input_schema: { type: 'object', properties: {} }
  },

  // ============================================================================
  // 执行工具
  // ============================================================================

  {
    name: 'create_task',
    description: '创建新任务并自动分配给合适的员工',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: '任务描述' },
        priority: { type: 'string', description: '优先级: low/medium/high/urgent', enum: ['low', 'medium', 'high', 'urgent'] },
        type: { type: 'string', description: '任务类型: development/design/research/analysis/other' },
        assign_to: { type: 'string', description: '指定员工ID或角色（可选）' }
      },
      required: ['description']
    }
  },

  {
    name: 'execute_cron',
    description: '执行指定的定时任务/脚本',
    input_schema: {
      type: 'object',
      properties: {
        cron_id: { type: 'string', description: '任务ID（精确）' },
        name: { type: 'string', description: '脚本名称（模糊匹配）' }
      },
      required: []
    }
  },

  {
    name: 'disable_cron',
    description: '禁用/关闭指定的定时任务/脚本',
    input_schema: {
      type: 'object',
      properties: {
        cron_id: { type: 'string', description: '任务 ID（精确）' },
        name: { type: 'string', description: '脚本名称（模糊匹配）' }
      },
      required: []
    }
  },

  {
    name: 'create_automation',
    description: '创建自动化脚本（可含定时任务）',
    input_schema: {
      type: 'object',
      properties: {
        requirement: { type: 'string', description: '需求描述' }
      },
      required: ['requirement']
    }
  },

  {
    name: 'develop_feature',
    description: '开发新功能（使用 Orchestrator 处理复杂需求）',
    input_schema: {
      type: 'object',
      properties: {
        requirement: { type: 'string', description: '需求描述' }
      },
      required: ['requirement']
    }
  },

  {
    name: 'recruit_employee',
    description: '招募新员工（从人类档案创建）',
    input_schema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: '职位角色: CEO/CTO/CMO/COO/Developer/Designer等' },
        name: { type: 'string', description: '指定人类档案名称（可选）' }
      },
      required: ['role']
    }
  },

  {
    name: 'talk_to_employee',
    description: '切换到与指定员工对话',
    input_schema: {
      type: 'object',
      properties: {
        employee_id: { type: 'string', description: '员工ID' },
        name: { type: 'string', description: '员工姓名（模糊匹配）' },
        role: { type: 'string', description: '员工角色（如：CTO、Designer）' }
      },
      required: []
    }
  },

  // ============================================================================
  // 对话工具
  // ============================================================================

  {
    name: 'chat',
    description: '与 CEO 进行对话问答',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '消息内容' }
      },
      required: ['message']
    }
  }
];

export function formatToolsForPrompt(): string {
  return TOOLS.map(t => {
    let desc = `- ${t.name}: ${t.description}`;
    if (Object.keys(t.input_schema.properties).length > 0) {
      const params = Object.entries(t.input_schema.properties)
        .map(([k, v]) => {
          const req = t.input_schema.required?.includes(k) ? '' : '?';
          return `${k}${req}`;
        })
        .join(', ');
      desc += ` (${params})`;
    }
    return desc;
  }).join('\n');
}

/**
 * 获取工具定义
 */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOLS.find(t => t.name === name);
}
