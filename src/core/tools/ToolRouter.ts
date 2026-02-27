/**
 * AI Company - Tool Router
 *
 * 工具路由器：让 AI 选择并执行工具
 */

import type { AIDatabase } from '../../infrastructure/database/index.js';
import { getAIProvider } from '../../infrastructure/ai/AIProvider.js';
import { formatToolsForPrompt, TOOLS } from './tool-definitions.js';
import { TaskService } from '../../application/services/TaskService.js';
import { CronService } from '../../application/services/CronService.js';
import { getCronService } from '../../interfaces/gateway/CronService.js';
import { CompanyService } from '../../application/services/CompanyService.js';
import { TaskFormatter } from '../../interfaces/formatters/TaskFormatter.js';
import { CronFormatter } from '../../interfaces/formatters/CronFormatter.js';
import { getIntentLogService } from '../../infrastructure/logging/IntentLogService.js';

export interface ToolCall {
  tool: string;
  input: any;
}

export interface RouterResult {
  success: boolean;
  response: string;
  toolCalls?: ToolCall[];
}

export class ToolRouter {
  constructor(private db: AIDatabase) {}

  async route(
    userInput: string,
    context?: {
      chatHistory?: Array<{ role: string; content: string }>;
      sessionId?: string;
      source?: 'telegram' | 'cli' | 'web';
    }
  ): Promise<RouterResult> {
    const startTime = Date.now();
    const sessionId = context?.sessionId || 'unknown';
    const source = context?.source || 'cli';

    // 构建聊天历史上下文
    const historyContext = context?.chatHistory && context.chatHistory.length > 0
      ? `\n\n## 最近对话历史\n${context.chatHistory.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}`
      : '';

    // 构建提示词
    const prompt = `# 你是 AI Company 的智能路由器

你的任务是理解用户的自然语言输入，并选择最合适的工具来处理。

## 可用工具
${formatToolsForPrompt()}

## 工具选择指南

1. **查询类** - 用户想了解状态、列表、详情时使用：
   - "任务怎么样了" → list_tasks
   - "有哪些员工" → list_employees
   - "系统状态" → get_status
   - "某个任务的详情" → get_task

2. **执行类** - 用户想要创建或执行什么时使用：
   - "帮我开发..." / "实现一个..." → develop_feature
   - "创建任务..." / "新建..." → create_task
   - "运行脚本" / "执行..." → execute_cron
   - "做个自动化" / "定时任务" → create_automation

3. **交互类** - 用户想与人互动时使用：
   - "和XX说话" / "切换到..." → talk_to_employee
   - "招个人" / "入职" → recruit_employee
   - 其他聊天、问候 → chat

## 用户输入
${userInput}${historyContext}

## 输出格式
\`\`\`json
{"tool": "工具名", "input": {参数}}
\`\`\`

注意：
1. 如果工具参数不足，优先使用模糊匹配（如 name 参数）
2. 如果只是闲聊、问候、寒暄，使用 chat 工具
3. 如果无法确定工具，使用 chat 工具让 CEO 回复`;

    const provider = getAIProvider();
    const response = await provider.messages([
      { role: 'user', content: prompt }
    ]);

    // 解析工具调用
    const toolCall = this.parseToolCall(response);

    let result = '';
    let status: 'success' | 'failed' = 'success';

    if (toolCall) {
      try {
        result = await this.executeTool(toolCall);
      } catch (error: any) {
        status = 'failed';
        result = error.message || '执行失败';
      }
    } else {
      result = response;
    }

    // 记录到数据库
    const latency = Date.now() - startTime;
    getIntentLogService(this.db).log({
      sessionId,
      source,
      userInput,
      aiRawResponse: response,
      parsedTool: toolCall?.tool,
      parsedInput: toolCall?.input ? JSON.stringify(toolCall.input) : undefined,
      toolResult: result,
      executionStatus: status,
      chatHistoryCount: context?.chatHistory?.length || 0,
      latency,
    });

    return {
      success: status === 'success',
      response: result,
      toolCalls: toolCall ? [toolCall] : undefined
    };
  }

  private parseToolCall(response: string): ToolCall | null {
    try {
      const match = response.match(/```json\s*({[\s\S]*?})\s*```/) || response.match(/({[\s\S]*})/);
      if (match) {
        const parsed = JSON.parse(match[1]);
        if (parsed.tool && TOOLS.some(t => t.name === parsed.tool)) {
          return { tool: parsed.tool, input: parsed.input || {} };
        }
      }
    } catch {}
    return null;
  }

  private async executeTool(call: ToolCall): Promise<string> {
    const { tool, input } = call;

    // 初始化服务（延迟实例化）
    const taskService = new TaskService(this.db);
    const cronService = new CronService(this.db);
    const companyService = new CompanyService(this.db);

    switch (tool) {
      case 'list_crons': {
        const crons = cronService.getCrons(10);
        return CronFormatter.listForTelegram(crons);
      }

      case 'list_tasks': {
        const tasks = taskService.getTasks({ limit: 10 });
        return TaskFormatter.forTelegram(tasks);
      }

      case 'execute_cron': {
        // 按名称查找
        let cronId = input.cron_id;
        if (!cronId && input.name) {
          const cron = cronService.findCron(input.name);
          if (cron) cronId = cron.id;
          else {
            const multiple = cronService.findMultipleCrons(input.name);
            if (multiple.length > 1) {
              return CronFormatter.multipleMatchesForTelegram(multiple);
            }
            return CronFormatter.notFoundForTelegram();
          }
        }

        if (!cronId) {
          return CronFormatter.notFoundForTelegram();
        }

        const result = await cronService.executeCron(cronId);
        const cron = cronService.getCron(cronId);
        return CronFormatter.executionResultForTelegram(result, cron?.name || 'Unknown');
      }

      case 'disable_cron': {
        let cronId = input.cron_id;
        if (!cronId && input.name) {
          const cron = cronService.findCron(input.name);
          if (cron) cronId = cron.id;
          else {
            const multiple = cronService.findMultipleCrons(input.name);
            if (multiple.length > 1) {
              return `❌ 找到多个匹配的脚本:\n${multiple.map(c => `- ${c.id}: ${c.name}`).join('\n')}\n\n请使用精确的 ID`;
            }
            return `❌ 脚本不存在`;
          }
        }

        if (!cronId) {
          return `❌ 请提供任务 ID 或名称`;
        }

        // 从数据库获取任务信息
        const cron = this.db.prepare('SELECT * FROM crontab WHERE id = ?').get(cronId) as any;
        if (!cron) {
          return `❌ 定时任务不存在：${cronId}`;
        }

        // 禁用任务
        this.db.prepare('UPDATE crontab SET enabled = 0 WHERE id = ?').run(cronId);

        // 从 CronService 中移除调度
        try {
          const cronServiceInstance = getCronService(this.db);
          cronServiceInstance.unschedule(cronId);
        } catch (e) {
          // 如果任务未加载，忽略
        }

        return `✅ 已禁用定时任务\n\nID: ${cronId}\n名称：${cron.name}\n状态：已禁用`;
      }

      case 'create_automation':
        console.log(`\n🔧 [创建自动化] 需求: ${input.requirement}`);
        const { ScriptBuilder } = await import('../../application/builder/ScriptBuilder.js');
        const scriptBuilder = new ScriptBuilder(this.db);
        const outcome = await scriptBuilder.buildAndDecide({ requirement: input.requirement, autoRun: false });
        console.log(`✅ [脚本创建] 名称: ${outcome.script.name}`);
        console.log(`📁 [工作目录] ${outcome.script.workDir}`);
        console.log(`⏰ [调度类型] ${outcome.decision.action}`);
        return `✅ 创建脚本: ${outcome.script.name}\n\n描述: ${outcome.script.description}\n\n工作目录: ${outcome.script.workDir}`;

      case 'develop_feature':
        const { Orchestrator } = await import('../agents/Orchestrator.js');
        const orchestrator = new Orchestrator(this.db);
        const result = await orchestrator.processRequirement(input.requirement, false);
        return `${result.status === 'completed' ? '✅' : '⚠️'} ${result.summary}`;

      case 'chat': {
        const companyInfo = companyService.getCompanyInfo();

        const systemPrompt = `你是 ${companyInfo.name} 的 CEO。

【公司数据】
员工: ${companyInfo.employeeCount} 人
任务: ${companyInfo.taskCount} 个

【回复规则】
1. 只基于真实数据回复，不要虚构任何内容
2. 不要编造人名、职位、场景、对话
3. 不要讲故事，不要角色扮演
4. 如需要信息，使用工具查询

Owner: ${input.message}

回复：`;

        const provider = getAIProvider();
        const response = await provider.messages([
          { role: 'user', content: systemPrompt }
        ]);

        return response;
      }

      case 'create_task': {
        const task = taskService.createTask({
          type: input.type,
          description: input.description,
          priority: input.priority,
          requestedBy: 'user',
        });

        let assignedTo = null;
        if (input.assign_to) {
          const employee = taskService.findEmployee(input.assign_to);
          if (employee) {
            taskService.assignTask(task.id, employee.id);
            assignedTo = employee;
          }
        }

        if (!assignedTo) {
          const employee = taskService.autoAssignTask(task.id);
          assignedTo = employee;
        }

        return TaskFormatter.createSuccessForTelegram(task, assignedTo);
      }

      case 'get_task': {
        if (input.task_id) {
          const task = taskService.getTask(input.task_id);
          if (task) {
            return TaskFormatter.singleForTelegram(task);
          }
          return `❌ 任务不存在: ${input.task_id}`;
        }
        if (input.description) {
          const tasks = taskService.getTasks({ limit: 100 });
          const matched = tasks.filter(t => t.description.includes(input.description)).slice(0, 5);
          if (matched.length > 0) {
            return `📝 匹配的任务 (${matched.length}个)\n\n` + matched.map(t => `• ${t.id}: ${t.description.slice(0, 40)}... [${t.status}]`).join('\n');
          }
          return `❌ 未找到包含 "${input.description}" 的任务`;
        }
        return `❌ 请提供任务ID或描述`;
      }

      case 'list_employees': {
        const info = companyService.getCompanyInfo();
        let employees = info.employees;

        if (input.role) {
          employees = employees.filter(e => e.role === input.role);
        }
        if (input.status) {
          employees = employees.filter(e => e.status === input.status);
        }
        const limit = input.limit || 10;
        const displayed = employees.slice(0, limit);

        if (displayed.length === 0) {
          return `👥 暂无员工`;
        }
        return `👥 员工列表 (${displayed.length}/${employees.length}人)\n\n` + displayed.map(e => {
          const statusEmoji = e.status === 'active' ? '🟢' : e.status === 'busy' ? '🔴' : '⚫';
          return `${statusEmoji} ${e.name}\n    角色: ${e.role}\n    ID: ${e.id}`;
        }).join('\n\n');
      }

      case 'get_employee': {
        if (input.employee_id) {
          const employee = companyService.findEmployee(input.employee_id);
          if (employee) {
            const statusEmoji = employee.status === 'active' ? '🟢' : employee.status === 'busy' ? '🔴' : '⚫';
            return `👤 员工详情\n\n${statusEmoji} ${employee.name}\n角色: ${employee.role}\nID: ${employee.id}\n状态: ${employee.status}`;
          }
          return `❌ 员工不存在: ${input.employee_id}`;
        }
        if (input.name) {
          const employees = companyService.getCompanyInfo().employees;
          const matched = employees.filter(e => e.name.includes(input.name));
          if (matched.length > 0) {
            return `👤 匹配的员工\n\n` + matched.map(e => `• ${e.name} (${e.role}) - ID: ${e.id}`).join('\n');
          }
          return `❌ 未找到包含 "${input.name}" 的员工`;
        }
        return `❌ 请提供员工ID或姓名`;
      }

      case 'get_status': {
        const info = companyService.getCompanyInfo();
        const tasks = taskService.getTasks({ limit: 1000 });
        const activeCount = info.employees.filter(e => e.status === 'active').length;
        const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
        const completedTasks = tasks.filter(t => t.status === 'completed').length;

        return `📊 公司状态\n\n` +
          `👥 员工: ${info.employeeCount} 人 (活跃: ${activeCount})\n` +
          `📝 任务: ${info.taskCount} 个 (进行中: ${pendingTasks}, 已完成: ${completedTasks})\n` +
          `⏰ 更新时间: ${new Date().toLocaleString('zh-CN')}`;
      }

      case 'recruit_employee': {
        // TODO: 实现招募逻辑
        return `⚠️ 招募功能开发中\n\n请使用命令: /recruit ${input.role}`;
      }

      case 'talk_to_employee': {
        // TODO: 返回切换员工指令
        if (input.employee_id) {
          return `💬 切换到员工对话\n\n请使用命令: /talk ${input.employee_id}`;
        }
        if (input.name) {
          return `💬 切换到员工对话\n\n请使用命令: /talk ${input.name}`;
        }
        if (input.role) {
          return `💬 切换到员工对话\n\n请使用命令: /talk ${input.role}`;
        }
        return `❌ 请指定员工ID、姓名或角色`;
      }

      default:
        return `❌ 未知工具: ${tool}`;
    }
  }
}

export function createToolRouter(db: AIDatabase): ToolRouter {
  return new ToolRouter(db);
}
