/**
 * AI Company - Telegram Bot Integration
 *
 * CEO 通过 Telegram 与用户交互
 *
 * 交互规则:
 * - 默认 = 聊天模式 (与 CEO 对话)
 * - / 开头 = 命令模式
 * - 按钮点击 = 快捷操作
 */

import TelegramBot from 'node-telegram-bot-api';
import type { AIDatabase, Employee, Task } from '../../../infrastructure/database/index.js';
import { getAIProvider, type AIProvider } from '../../../infrastructure/ai/index.js';
import { getConfigService } from '../../../infrastructure/config/index.js';
import { MessageService, getMessageService } from '../../../core/messages/MessageService.js';
import { notificationService } from '../../../infrastructure/notifications/index.js';
import { Interactive, MessageUpdater } from './InteractiveMessages.js';

// ============================================================================
// 格式化工具
// ============================================================================

class TelegramFormatter {
  static bold(text: string): string {
    return `<b>${this.escape(text)}</b>`;
  }

  static italic(text: string): string {
    return `<i>${this.escape(text)}</i>`;
  }

  static code(text: string): string {
    return `<code>${this.escape(text)}</code>`;
  }

  static pre(text: string): string {
    return `<pre>${this.escape(text)}</pre>`;
  }

  static link(text: string, url: string): string {
    return `<a href="${url}">${this.escape(text)}</a>`;
  }

  static emoji(emoji: string, text: string): string {
    return `${emoji} ${text}`;
  }

  static li(text: string, indent: number = 0): string {
    const prefix = '  '.repeat(indent);
    return `${prefix}• ${text}`;
  }

  static h1(text: string): string {
    return `<b>${this.escape(text).toUpperCase()}</b>\n`;
  }

  static h2(text: string): string {
    return `<b>${this.escape(text)}</b>\n`;
  }

  static escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  static buttonRow(buttons: string[]): TelegramBot.InlineKeyboardButton[][] {
    return buttons.map(text => [{ text, callback_data: text }]);
  }

  static buttonGrid(buttons: string[][]): TelegramBot.InlineKeyboardButton[][] {
    return buttons.map(row => row.map(text => ({ text, callback_data: text })));
  }

  static actionButton(text: string, action: string): TelegramBot.InlineKeyboardButton[][] {
    return [[{ text, callback_data: `action:${action}` }]];
  }

  static taskButton(taskId: string, label: string): TelegramBot.InlineKeyboardButton {
    return { text: label, callback_data: `task:${taskId}` };
  }

  static employeeButton(employeeId: string, label: string): TelegramBot.InlineKeyboardButton {
    return { text: label, callback_data: `employee:${employeeId}` };
  }
}

// ============================================================================
// 会话状态管理
// ============================================================================

/**
 * 聊天模式
 */
type ChatMode = 'ceo' | 'employee';

/**
 * 等待用户输入的操作类型
 */
type PendingAction =
  | 'waiting_for_run'      // 等待 /run 命令的需求描述
  | 'waiting_for_recruit'  // 等待 /recruit 命令的角色
  | 'waiting_for_talk'     // 等待 /talk 命令的员工名
  | null;                  // 无等待操作

/**
 * 用户会话状态
 */
/** 聊天消息记录 */
interface ChatMessage {
  /** 发送者名字：Owner, CEO名字, 或员工名字 */
  sender: string;
  content: string;
  timestamp: number;
}

interface UserSession {
  /** Telegram 聊天 ID */
  chatId: number;
  /** 当前聊天模式 */
  chatMode: ChatMode;
  /** 如果是员工模式，记录员工 ID */
  employeeId?: string;
  /** 订阅的任务 ID (用于进度通知) */
  subscribedTaskId?: string;
  /** 最后活跃时间 */
  lastActivity: number;
  /** 等待用户输入的操作 */
  pendingAction?: PendingAction;
  /** 多步骤操作的临时数据 */
  multistepData?: Record<string, any>;
  /** 聊天历史（统一存储，sender 区分身份） */
  chatHistory?: ChatMessage[];
}

/**
 * 会话管理器
 */
class SessionManager {
  private sessions: Map<number, UserSession> = new Map();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 分钟

  get(chatId: number): UserSession {
    let session = this.sessions.get(chatId);
    if (!session) {
      session = this.createDefaultSession(chatId);
      this.sessions.set(chatId, session);
    }
    return session;
  }

  set(chatId: number, session: UserSession): void {
    session.lastActivity = Date.now();
    this.sessions.set(chatId, session);
  }

  update(chatId: number, updates: Partial<UserSession>): void {
    const session = this.get(chatId);
    Object.assign(session, updates);
    session.lastActivity = Date.now();
    this.sessions.set(chatId, session);
  }

  clear(chatId: number): void {
    this.sessions.delete(chatId);
  }

  clearEmployeeMode(chatId: number): void {
    const session = this.get(chatId);
    session.chatMode = 'ceo';
    delete session.employeeId;
    this.set(chatId, session);
  }

  setEmployeeMode(chatId: number, employeeId: string): void {
    const session = this.get(chatId);
    session.chatMode = 'employee';
    session.employeeId = employeeId;
    this.set(chatId, session);
  }

  setSubscribedTask(chatId: number, taskId: string): void {
    const session = this.get(chatId);
    session.subscribedTaskId = taskId;
    this.set(chatId, session);
  }

  clearSubscribedTask(chatId: number): void {
    const session = this.get(chatId);
    delete session.subscribedTaskId;
    this.set(chatId, session);
  }

  /** 设置等待操作 */
  setPendingAction(chatId: number, action: PendingAction): void {
    const session = this.get(chatId);
    session.pendingAction = action;
    this.set(chatId, session);
  }

  /** 清除等待操作 */
  clearPendingAction(chatId: number): void {
    const session = this.get(chatId);
    delete session.pendingAction;
    delete session.multistepData;
    this.set(chatId, session);
  }

  /** 添加聊天消息到历史 */
  addChatMessage(chatId: number, sender: string, content: string): void {
    const session = this.get(chatId);
    if (!session.chatHistory) {
      session.chatHistory = [];
    }
    session.chatHistory.push({ sender, content, timestamp: Date.now() });
    // 最多保留最近 30 条消息
    if (session.chatHistory.length > 30) {
      session.chatHistory = session.chatHistory.slice(-30);
    }
    this.set(chatId, session);
  }

  /** 获取聊天历史 */
  getChatHistory(chatId: number): ChatMessage[] {
    const session = this.get(chatId);
    return session.chatHistory || [];
  }

  /** 清除聊天历史 */
  clearChatHistory(chatId: number): void {
    const session = this.get(chatId);
    session.chatHistory = [];
    this.set(chatId, session);
  }

  private createDefaultSession(chatId: number): UserSession {
    return {
      chatId,
      chatMode: 'ceo',
      lastActivity: Date.now(),
      chatHistory: [],
    };
  }

  // 清理过期会话
  cleanup(): void {
    const now = Date.now();
    for (const [chatId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.SESSION_TIMEOUT) {
        this.sessions.delete(chatId);
        console.log(`🧹 清理过期会话: chatId=${chatId}`);
      }
    }
  }
}

// ============================================================================
// 命令处理器
// ============================================================================

interface CommandHandler {
  pattern: RegExp;
  handler: (msg: TelegramBot.Message, match: RegExpExecArray | null, bot: TelegramIntegration) => Promise<void>;
  description: string;
}

/**
 * 系统类命令
 */
const SYSTEM_COMMANDS: CommandHandler[] = [
  {
    pattern: /\/start/,
    description: '显示欢迎信息 + 主菜单',
    handler: async (msg, _match, bot) => {
      const chatId = msg.chat.id;
      const companyName = bot.getCompanyName();
      const keyboard = TelegramFormatter.buttonGrid([
        ['📊 状态', '📋 任务', '👥 员工'],
        ['🆕 新任务', '👔 招募员工', '💬 与员工对话'],
        ['❓ 帮助'],
      ]);
      await bot.bot.sendMessage(chatId,
        TelegramFormatter.h1(`${companyName} CEO`) +
        `你好！我是 ${companyName} 的 CEO，很高兴为你服务。\n\n` +
        TelegramFormatter.h2('我能做什么') +
        TelegramFormatter.li('查看公司状态', 0) +
        TelegramFormatter.li('管理员工和任务', 0) +
        TelegramFormatter.li('执行新需求', 0) +
        TelegramFormatter.li('回答问题', 0) +
        '\n💡 直接发消息给我，我会智能处理。\n' +
        '发送 /help 查看所有命令。',
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
      );
    },
  },
  {
    pattern: /\/cancel/,
    description: '取消当前操作',
    handler: async (msg, _match, bot) => {
      const chatId = msg.chat.id;
      const session = bot.getSessionManager().get(chatId);
      if (session.pendingAction) {
        bot.getSessionManager().clearPendingAction(chatId);
        await bot.bot.sendMessage(chatId, '✅ 已取消操作', { parse_mode: 'HTML' });
      } else {
        await bot.bot.sendMessage(chatId, 'ℹ️ 没有正在进行的操作', { parse_mode: 'HTML' });
      }
    },
  },
  {
    pattern: /\/help/,
    description: '显示所有命令',
    handler: async (msg, _match, bot) => {
      const chatId = msg.chat.id;
      const help = TelegramFormatter.h1('命令帮助') + '\n' +
        TelegramFormatter.h2('基本操作') +
        TelegramFormatter.li('/start - 显示主菜单', 0) +
        TelegramFormatter.li('/cancel - 取消当前操作', 0) +
        TelegramFormatter.li('/help - 显示此帮助', 0) +
        '\n' +
        TelegramFormatter.h2('系统管理') +
        TelegramFormatter.li('/status - 查看公司整体状态', 0) +
        TelegramFormatter.li('/config - 查看配置', 0) +
        '\n' +
        TelegramFormatter.h2('资源查询') +
        TelegramFormatter.li('/employees - 查看所有员工', 0) +
        TelegramFormatter.li('/employee <id> - 查看员工详情', 0) +
        TelegramFormatter.li('/tasks - 查看任务列表', 0) +
        TelegramFormatter.li('/task <id> - 查看任务详情', 0) +
        TelegramFormatter.li('/logs - 查看日志', 0) +
        '\n' +
        TelegramFormatter.h2('任务管理') +
        TelegramFormatter.li('/run <需求> - 执行新任务', 0) +
        TelegramFormatter.li('/stop - 停止当前任务', 0) +
        TelegramFormatter.li('/pause - 暂停当前任务', 0) +
        TelegramFormatter.li('/resume - 恢复任务', 0) +
        '\n' +
        TelegramFormatter.h2('员工管理') +
        TelegramFormatter.li('/recruit <角色> - 招募新员工', 0) +
        TelegramFormatter.li('/talk <员工名/ID> - 与员工对话', 0) +
        TelegramFormatter.li('/talk CEO - 切换回 CEO 对话', 0) +
        TelegramFormatter.li('/performance - 员工绩效排行', 0) +
        '\n' +
        TelegramFormatter.italic('💡 提示：直接发消息给我，默认与 CEO 对话');

      await bot.bot.sendMessage(chatId, help, { parse_mode: 'HTML' });
    },
  },
  {
    pattern: /\/status/,
    description: '公司整体状态',
    handler: async (msg, _match, bot) => {
      const chatId = msg.chat.id;
      await bot.bot.sendChatAction(chatId, 'typing');
      const employees = bot.db.getAllEmployees();
      const tasks = bot.db.getAllTasks();

      const activeEmployees = employees.filter(e => e.status === 'active').length;
      const busyEmployees = employees.filter(e => e.status === 'busy').length;
      const pendingTasks = tasks.filter(t => t.status === 'pending').length;
      const inProgressTasks = tasks.filter(t => t.status === 'in_progress' || t.status === 'executing').length;
      const completedToday = tasks.filter(t =>
        t.status === 'completed' &&
        t.completed_at &&
        Date.now() - t.completed_at < 24 * 60 * 60 * 1000
      ).length;

      let status = TelegramFormatter.h1('📊 公司状态') + '\n' +
        TelegramFormatter.h2('👥 员工') +
        `   总数: ${employees.length}\n` +
        `   活跃: ${activeEmployees} | 忙碌: ${busyEmployees}\n\n` +
        TelegramFormatter.h2('📋 任务') +
        `   待处理: ${pendingTasks}\n` +
        `   进行中: ${inProgressTasks}\n` +
        `   今日完成: ${completedToday}\n`;

      // 添加忙碌员工详情
      if (busyEmployees > 0) {
        status += '\n' + TelegramFormatter.h2('🔥 正在工作');
        employees
          .filter(e => e.status === 'busy')
          .forEach(e => {
            const task = e.current_task ? bot.db.getTask(e.current_task) : null;
            status += `\n${TelegramFormatter.emoji('👤', e.name)} (${e.role})`;
            if (task) {
              status += `\n   ${task.description.slice(0, 30)}...`;
            }
          });
      }

      await bot.bot.sendMessage(chatId, status, { parse_mode: 'HTML' });
    },
  },
];

/**
 * 命令管理器
 */
class CommandManager {
  private handlers: Map<string, CommandHandler> = new Map();

  constructor(private bot: TelegramIntegration) {
    this.registerSystemCommands();
    this.registerQueryCommands();
    this.registerTaskCommands();
    this.registerEmployeeCommands();
  }

  private registerSystemCommands(): void {
    for (const cmd of SYSTEM_COMMANDS) {
      this.register(cmd);
    }
  }

  private registerQueryCommands(): void {
    // /tasks - 任务列表
    this.register({
      pattern: /\/tasks/,
      description: '查看任务列表',
      handler: async (msg, _match, bot) => {
        await bot.handleTasks(msg);
      },
    });

    // /task <id> - 任务详情
    this.register({
      pattern: /\/task\s+([a-zA-Z0-9\-]+)/,
      description: '查看任务详情',
      handler: async (msg, match, bot) => {
        const chatId = msg.chat.id;
        const taskId = match![1];
        await bot.bot.sendChatAction(chatId, 'typing');

        // 尝试完整匹配
        let task = bot.db.getTask(taskId);
        // 如果没找到，尝试前缀匹配
        if (!task) {
          const allTasks = bot.db.getAllTasks();
          task = allTasks.find(t => t.id.startsWith(taskId));
        }

        if (!task) {
          await bot.bot.sendMessage(chatId, `❌ 任务不存在: ${TelegramFormatter.code(taskId)}`, { parse_mode: 'HTML' });
          return;
        }

        const assignedTo = task.assigned_to ? bot.db.getEmployee(task.assigned_to) : null;
        const statusEmoji = task.status === 'completed' ? '✅' :
                            task.status === 'failed' ? '❌' :
                            task.status === 'executing' || task.status === 'in_progress' ? '🔄' : '📋';

        let message = `${statusEmoji} ${TelegramFormatter.bold('任务详情')}\n\n`;
        message += `ID: ${TelegramFormatter.code(task.id.slice(0, 8))}\n`;
        message += `描述: ${task.description}\n`;
        message += `状态: ${task.status}\n`;
        message += `优先级: ${task.priority || 'medium'}\n`;
        if (assignedTo) {
          message += `负责人: ${assignedTo.name}\n`;
        }
        message += `创建: ${new Date(task.created_at).toLocaleString('zh-CN')}\n`;

        if (task.work_dir) {
          message += `\n工作目录: ${TelegramFormatter.code(task.work_dir)}`;
        }

        const keyboard = [
          [{ text: '📋 查看日志', callback_data: `task_logs:${task.id}` }],
          [{ text: '🔙 返回', callback_data: 'action:back' }]
        ];

        await bot.bot.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard }
        });
      },
    });

    // /employees - 员工列表
    this.register({
      pattern: /\/employees/,
      description: '查看所有员工',
      handler: async (msg, _match, bot) => {
        await bot.handleEmployees(msg);
      },
    });

    // /employee <id> - 员工详情
    this.register({
      pattern: /\/employee\s+([a-zA-Z0-9\-]+)/,
      description: '查看员工详情',
      handler: async (msg, match, bot) => {
        const chatId = msg.chat.id;
        const empId = match![1];
        await bot.bot.sendChatAction(chatId, 'typing');

        let employee = bot.db.getEmployee(empId);
        if (!employee) {
          const allEmployees = bot.db.getAllEmployees();
          employee = allEmployees.find(e => e.id.startsWith(empId) || e.name === empId);
        }

        if (!employee) {
          await bot.bot.sendMessage(chatId, `❌ 员工不存在: ${TelegramFormatter.code(empId)}`, { parse_mode: 'HTML' });
          return;
        }

        let message = TelegramFormatter.h1(`${employee.name} (${employee.role})`);
        message += `ID: ${TelegramFormatter.code(employee.id.slice(0, 8))}\n`;
        message += `状态: ${employee.status}\n`;
        message += `完成: ${employee.completed_tasks || 0} | 失败: ${employee.failed_tasks || 0}\n`;
        if (employee.average_quality) {
          message += `质量: ${Math.round(employee.average_quality)}/100\n`;
        }

        const skills = bot.db.getEmployeeSkills(employee.id);
        if (skills.length > 0) {
          message += `\n${TelegramFormatter.h2('技能')}`;
          skills.forEach(s => {
            message += TelegramFormatter.li(s.name);
          });
        }

        // 最近任务
        const recentTasks = bot.db.getAllTasks()
          .filter(t => t.assigned_to === employee.id)
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, 3);

        if (recentTasks.length > 0) {
          message += `\n${TelegramFormatter.h2('最近任务')}`;
          recentTasks.forEach(t => {
            const statusEmoji = t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : '🔄';
            message += `${statusEmoji} ${t.description.slice(0, 30)}...\n`;
          });
        }

        const keyboard = [
          [
            { text: '💬 与TA对话', callback_data: `talk_employee:${employee.id}` },
            { text: '🔙 返回', callback_data: 'action:back' }
          ]
        ];

        await bot.bot.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard }
        });
      },
    });

    // /logs - 查看日志
    this.register({
      pattern: /\/logs/,
      description: '查看日志',
      handler: async (msg, _match, bot) => {
        const chatId = msg.chat.id;
        await bot.bot.sendChatAction(chatId, 'typing');

        const { execSync } = await import('child_process');
        const logsPath = process.env.AI_COMPANY_LOGS_PATH || './logs';

        try {
          const logs = execSync(`tail -n 50 ${logsPath}/gateway.log 2>/dev/null || tail -n 50 ${logsPath}/*.log 2>/dev/null || echo "暂无日志"`, {
            encoding: 'utf-8',
          });

          const maxLength = 4000;
          const message = logs.length > maxLength
            ? logs.slice(-maxLength) + '\n\n...(仅显示最近 4000 字符)'
            : logs;

          await bot.bot.sendMessage(chatId,
            TelegramFormatter.h1('📋 最近日志') + '\n' +
            TelegramFormatter.pre(message),
            { parse_mode: 'HTML' }
          );
        } catch (error: any) {
          await bot.bot.sendMessage(chatId, `❌ 无法读取日志: ${TelegramFormatter.escape(error.message)}`, { parse_mode: 'HTML' });
        }
      },
    });
  }

  private registerTaskCommands(): void {
    // /run <需求> - 执行任务（统一决策层）
    this.register({
      pattern: /\/run\s+(.+)/,
      description: '执行任务（AI 智能决策最优方案）',
      handler: async (msg, match, bot) => {
        const chatId = msg.chat.id;
        const input = match![1].trim();
        const userIdentity = bot.getUserIdentity(chatId);

        await bot.bot.sendChatAction(chatId, 'typing');

        // 发送"正在分析"状态消息（使用通知层）
        const statusResult = await notificationService.send({
          to: userIdentity,
          content: {
            text: '🧠 正在分析...\n查询所有资源中...',
            html: '<b>🧠 正在分析...</b>\n<i>查询所有资源中...</i>'
          }
        });

        const statusMessageId = statusResult.channelMessageId;
        const updater = statusMessageId ? MessageUpdater.get(chatId, statusMessageId) : null;

        try {
          // 🎯 使用工具路由器
          const { createToolRouter } = await import('../../../core/tools/ToolRouter.js');
          const router = createToolRouter(bot.db);

          // 📜 获取聊天历史（最近 10 条）
          const sessionId = this.bot.getSessionId(chatId);
          const recentMessages = this.bot.messageService.getChatHistory({
            sessionId,
            limit: 10
          });

          // 转换为 ToolRouter 需要的格式
          const chatHistory = recentMessages.map(msg => ({
            role: msg.direction === 'user' ? 'user' : 'assistant',
            content: msg.content
          }));

          // 🎯 AI 路由
          const result = await router.route(input, {
            chatHistory,
            sessionId: this.bot.getSessionId(chatId),
            source: 'telegram',
          });

          // 更新并显示结果
          const responseMsg = '<b>🎯 执行结果</b>\n\n' + result.response.slice(0, 2000);

          if (updater) {
            await updater.update(responseMsg);
          } else {
            await notificationService.sendText(userIdentity, result.response);
          }

          // 💾 保存响应到数据库
          this.bot.messageService.saveCompanyResponse({
            content: result.response,
            source: 'tg',
            chatId: chatId.toString(),
            sessionId: this.bot.getSessionId(chatId),
            metadata: {
              toolCalls: result.toolCalls,
              success: result.success,
            },
          });

          // 保存到 session manager 聊天历史（用于快速上下文）
          const owner = this.bot.getOwnerName();
          let ceoName = 'CEO';
          try {
            const ceo = this.bot.db.getHuman('human-ceo');
            ceoName = ceo?.name || 'CEO';
          } catch {}
          this.bot.getSessionManager().addChatMessage(chatId, owner, input);
          this.bot.getSessionManager().addChatMessage(chatId, ceoName, result.response);

        } catch (error: any) {
          console.error('❌ 统一决策失败:', error);

          if (updater) {
            await updater.update(
              '<b>⚠️ 决策失败</b>\n\n<i>创建新任务...</i>\n\n' +
              TelegramFormatter.escape(error.message)
            );
          }

          // 降级：直接创建任务
          await bot.handleCreateTask(msg, input, { type: 'create_task', confidence: 0, originalInput: input, reasoning: '降级处理' });
        }
      },
    });

    // /stop - 停止当前任务
    this.register({
      pattern: /\/stop/,
      description: '停止当前任务',
      handler: async (msg, _match, bot) => {
        const chatId = msg.chat.id;
        await bot.bot.sendMessage(chatId, '⚠️ /stop 功能开发中\n\n提示：使用 /pause 暂停任务');
      },
    });

    // /pause - 暂停任务
    this.register({
      pattern: /\/pause/,
      description: '暂停任务',
      handler: async (msg, _match, bot) => {
        const chatId = msg.chat.id;
        await bot.bot.sendMessage(chatId, '⚠️ /pause 功能开发中');
      },
    });

    // /resume - 恢复任务
    this.register({
      pattern: /\/resume/,
      description: '恢复任务',
      handler: async (msg, _match, bot) => {
        const chatId = msg.chat.id;
        await bot.bot.sendMessage(chatId, '⚠️ /resume 功能开发中');
      },
    });
  }

  private registerEmployeeCommands(): void {
    // /recruit <角色> - 招募新员工
    this.register({
      pattern: /\/recruit\s+(.+)/,
      description: '招募新员工',
      handler: async (msg, match, bot) => {
        const chatId = msg.chat.id;
        const role = match![1].trim();
        await bot.bot.sendChatAction(chatId, 'typing');

        const { EmployeeService } = await import('../../../application/services/EmployeeService.js');
        const service = new EmployeeService(bot.db);

        try {
          const employee = await service.recruit(role);
          const message = `✅ 员工已入职\n\n` +
            `姓名: ${employee.name}\n` +
            `角色: ${employee.role}\n` +
            `ID: ${employee.id}`;

          await bot.bot.sendMessage(chatId, message);
        } catch (error: any) {
          await bot.bot.sendMessage(chatId, `❌ 招募失败: ${TelegramFormatter.escape(error.message)}`, { parse_mode: 'HTML' });
        }
      },
    });

    // /talk - 提示选择员工
    this.register({
      pattern: /\/talk$/,
      description: '与员工对话',
      handler: async (msg, _match, bot) => {
        const chatId = msg.chat.id;
        await bot.bot.sendChatAction(chatId, 'typing');

        const employees = bot.db.getAllEmployees();
        if (employees.length === 0) {
          await bot.bot.sendMessage(chatId,
            '👥 暂无员工\n\n使用 /recruit <角色> 招募新员工',
            { parse_mode: 'HTML' }
          );
          return;
        }

        const sample = employees.slice(0, 5)
          .map(e => `- ${TelegramFormatter.bold(e.name)} (${e.role}) /talk ${e.id.slice(0, 8)}`)
          .join('\n');

        await bot.bot.sendMessage(chatId,
          `💬 请选择要对话的员工：\n\n${sample}\n\n` +
          `使用 /talk <员工名/ID> 开始对话\n` +
          TelegramFormatter.italic('也可以先用 /employees 查看完整列表'),
          { parse_mode: 'HTML' }
        );
      },
    });

    // /talk <员工名/ID> - 与员工对话
    this.register({
      pattern: /\/talk\s+(.+)/,
      description: '与员工对话',
      handler: async (msg, match, bot) => {
        const chatId = msg.chat.id;
        const target = match![1].trim();
        await bot.bot.sendChatAction(chatId, 'typing');

        // 检查是否是 CEO
        if (target.toLowerCase() === 'ceo' || target.toLowerCase() === 'ceo ') {
          bot.getSessionManager().clearEmployeeMode(chatId);
          await bot.bot.sendMessage(chatId, '💬 已切换到 CEO 对话模式');
          return;
        }

        // 查找员工
        const allEmployees = bot.db.getAllEmployees();
        const employee = allEmployees.find(e =>
          e.id.startsWith(target) || e.name === target || e.nickname === target
        );

        if (!employee) {
          await bot.bot.sendMessage(chatId,
            `❌ 找不到员工: ${TelegramFormatter.code(target)}\n\n使用 /employees 查看所有员工`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        bot.getSessionManager().setEmployeeMode(chatId, employee.id);

        await bot.bot.sendMessage(chatId,
          `💬 现在可以和 ${TelegramFormatter.bold(employee.name)} (${employee.role}) 对话了\n\n` +
          `直接发送消息即可。\n\n` +
          TelegramFormatter.italic('发送 /talk CEO 回到 CEO 模式'),
          { parse_mode: 'HTML' }
        );
      },
    });

    // /performance - 员工绩效排行
    this.register({
      pattern: /\/performance/,
      description: '员工绩效排行',
      handler: async (msg, _match, bot) => {
        const chatId = msg.chat.id;
        await bot.bot.sendChatAction(chatId, 'typing');

        const employees = bot.db.getAllEmployees();
        const sorted = employees
          .filter(e => (e.completed_tasks || 0) > 0)
          .sort((a, b) => (b.completed_tasks || 0) - (a.completed_tasks || 0))
          .slice(0, 10);

        if (sorted.length === 0) {
          await bot.bot.sendMessage(chatId, '📊 暂无绩效数据');
          return;
        }

        let message = TelegramFormatter.h1('📊 员工绩效排行') + '\n';
        sorted.forEach((emp, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          const quality = emp.average_quality ? ` | 质量: ${Math.round(emp.average_quality)}` : '';
          message += `${medal} ${TelegramFormatter.bold(emp.name)} (${emp.role})\n`;
          message += `    完成: ${emp.completed_tasks}${quality}\n`;
        });

        await bot.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
      },
    });
  }

  register(command: CommandHandler): void {
    this.handlers.set(command.pattern.source, command);
  }

  async handle(msg: TelegramBot.Message): Promise<boolean> {
    const text = msg.text;
    if (!text?.startsWith('/')) {
      return false;
    }

    for (const [_, handler] of this.handlers) {
      const match = handler.pattern.exec(text);
      if (match) {
        await handler.handler(msg, match, this.bot);
        return true;
      }
    }

    return false;
  }

  // 获取所有命令描述
  getDescriptions(): string[] {
    return Array.from(this.handlers.values()).map(h => h.description);
  }
}

// ============================================================================
// 聊天处理器
// ============================================================================

/**
 * 聊天处理器
 */
class ChatHandler {
  constructor(
    private bot: TelegramIntegration,
    private sessionManager: SessionManager
  ) {}

  async handle(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    console.log(`💬 ChatHandler: 处理聊天消息 chatId=${chatId}`);

    const session = this.sessionManager.get(chatId);

    // 优先检查是否有等待的输入操作
    if (session.pendingAction) {
      console.log(`💬 ChatHandler: 处理等待输入 ${session.pendingAction}`);
      const handled = await this.handlePendingAction(chatId, session.pendingAction, text);
      if (handled) {
        this.sessionManager.clearPendingAction(chatId);
        return;
      }
    }

    // 正常聊天流程
    if (session.chatMode === 'employee' && session.employeeId) {
      // 与员工对话
      console.log(`💬 ChatHandler: 与员工对话 employeeId=${session.employeeId}`);
      await this.chatWithEmployee(chatId, session.employeeId, text);
    } else {
      // 与 CEO 对话
      console.log(`💬 ChatHandler: 与 CEO 对话`);
      await this.chatWithCEO(chatId, text);
    }

    this.sessionManager.update(chatId, {});
  }

  /**
   * 处理等待的用户输入
   */
  private async handlePendingAction(chatId: number, action: PendingAction, input: string): Promise<boolean> {
    try {
      switch (action) {
        case 'waiting_for_run':
          // 创建任务，由 Scheduler 执行
          await this.bot.bot.sendChatAction(chatId, 'typing');

          // 获取可用员工，自动分配给合适的员工
          const employees = this.bot.db.getAllEmployees().filter(e => e.status === 'active');
          let assignedEmployee = employees.find(e => e.role === '资深全栈工程师' || e.role === '全栈工程师');

          // 如果没有找到全栈工程师，使用第一个可用员工
          if (!assignedEmployee && employees.length > 0) {
            assignedEmployee = employees[0];
          }

          const task = this.bot.db.createTask({
            type: 'general',
            description: input,
            priority: 'medium',
            requested_by: 'user',
            context: {
              telegramChatId: chatId,
            },
          });

          // 分配任务给员工
          if (assignedEmployee) {
            this.bot.db.updateTaskFields(task.id, { owner_id: assignedEmployee.id });
            this.bot.db.assignTask(task.id, assignedEmployee.id);
            console.log(`📋 [Task] 任务 ${task.id} 已分配给员工: ${assignedEmployee.name} (${assignedEmployee.role})`);
          }

          const employeeInfo = assignedEmployee
            ? `\n\n👤 分配给: ${TelegramFormatter.bold(assignedEmployee.name)} (${assignedEmployee.role})`
            : '\n\n⚠️  未找到可用员工';

          const msg1 = TelegramFormatter.h1('📋 任务已创建') + '\n' +
            TelegramFormatter.bold('需求:') + '\n' +
            TelegramFormatter.pre(input.slice(0, 100) + (input.length > 100 ? '...' : '')) + '\n\n' +
            TelegramFormatter.h2('📊 任务信息') +
            TelegramFormatter.li(`ID: ${task.id}`) +
            TelegramFormatter.li(`优先级: ${task.priority}`) +
            TelegramFormatter.li(`状态: ${task.status}`) +
            employeeInfo + '\n' +
            TelegramFormatter.italic('任务已加入队列，Scheduler 将在下次扫描时执行');

          const keyboard = TelegramFormatter.buttonRow(['📋 查看任务']);

          await this.bot.bot.sendMessage(chatId, msg1, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
          });
          return true;

        case 'waiting_for_recruit':
          // 模拟 /recruit 命令
          await this.bot.bot.sendChatAction(chatId, 'typing');
          const { EmployeeService } = await import('../../../application/services/EmployeeService.js');
          const empService = new EmployeeService(this.bot.db);
          const employee = await empService.recruit(input);
          await this.bot.bot.sendMessage(chatId, `✅ 员工已入职\n\n姓名: ${employee.name}\n角色: ${employee.role}\nID: ${employee.id}`);
          return true;

        case 'waiting_for_talk':
          // 模拟 /talk 命令
          await this.handleTalkCommand(chatId, input);
          return true;

        default:
          return false;
      }
    } catch (error: any) {
      await this.bot.bot.sendMessage(chatId, `❌ 操作失败: ${TelegramFormatter.escape(error.message)}`, { parse_mode: 'HTML' });
      return true;
    }
  }

  /**
   * 处理 /talk 命令逻辑
   */
  private async handleTalkCommand(chatId: number, target: string): Promise<void> {
    const trimmedTarget = target.trim();

    // 检查是否要切换回 CEO
    if (trimmedTarget.toLowerCase() === 'ceo') {
      this.sessionManager.clearEmployeeMode(chatId);
      await this.bot.bot.sendMessage(chatId, '💬 已切换回 CEO 对话模式', { parse_mode: 'HTML' });
      return;
    }

    // 查找员工
    const employees = this.bot.db.getAllEmployees();
    const employee = employees.find(e =>
      e.id.startsWith(trimmedTarget) ||
      e.name.toLowerCase() === trimmedTarget.toLowerCase()
    );

    if (!employee) {
      await this.bot.bot.sendMessage(chatId,
        `❌ 找不到员工: ${TelegramFormatter.code(trimmedTarget)}\n\n使用 /employees 查看所有员工`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    this.sessionManager.setEmployeeMode(chatId, employee.id);

    await this.bot.bot.sendMessage(chatId,
      `💬 现在可以和 ${TelegramFormatter.bold(employee.name)} (${employee.role}) 对话了\n\n` +
      `直接发送消息即可。\n\n` +
      TelegramFormatter.italic('发送 /talk CEO 回到 CEO 模式'),
      { parse_mode: 'HTML' }
    );
  }

  /**
   * 与 CEO 对话（使用 ToolRouter 进行意图识别）
   */
  private async chatWithCEO(chatId: number, question: string): Promise<void> {
    const owner = this.bot.getOwnerName();
    const userIdentity = this.bot.getUserIdentity(chatId);

    // 获取 CEO 名字
    let ceoName = 'CEO';
    try {
      const ceo = this.bot.db.getHuman('human-ceo');
      ceoName = ceo?.name || 'CEO';
    } catch (e) {
      // 使用默认
    }

    // 发送状态消息（使用通知层）
    const statusResult = await notificationService.send({
      to: userIdentity,
      content: {
        text: '🧠 正在分析...\n识别意图中...',
        html: '<b>🧠 正在分析...</b>\n<i>识别意图中...</i>'
      }
    });

    const statusMessageId = statusResult.channelMessageId;
    const updater = statusMessageId ? MessageUpdater.get(chatId, statusMessageId) : null;

    try {
      // 🎯 使用 ToolRouter 进行意图识别和执行
      const { createToolRouter } = await import('../../../core/tools/ToolRouter.js');
      const router = createToolRouter(this.bot.db);

      // 📜 获取聊天历史（最近10条）
      const sessionId = this.bot.getSessionId(chatId);
      const recentMessages = this.bot.messageService.getChatHistory({
        sessionId,
        limit: 10
      });

      // 转换为 ToolRouter 需要的格式
      const chatHistory = recentMessages.map(msg => ({
        role: msg.direction === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

      const result = await router.route(question, {
        chatHistory,
        sessionId: this.bot.getSessionId(chatId),
        source: 'telegram',
      });

      // 构建响应消息
      let responseHtml = '<b>🎯 执行结果</b>\n\n';

      // 如果调用了工具，显示工具名
      if (result.toolCalls && result.toolCalls.length > 0) {
        const toolName = result.toolCalls[0].tool;
        const toolNameZh: Record<string, string> = {
          'list_crons': '📋 列出脚本',
          'list_tasks': '📝 列出任务',
          'execute_cron': '▶️ 执行脚本',
          'create_automation': '🔧 创建自动化',
          'develop_feature': '💻 开发功能',
          'chat': '💬 对话',
        };
        responseHtml += `<b>${toolNameZh[toolName] || toolName}</b>\n\n`;
      }

      // 添加响应内容（截断到 3500 字符，Telegram 限制 4096）
      const maxLength = 3500;
      const responseContent = result.response.length > maxLength
        ? result.response.slice(0, maxLength - 100) + '...\n\n(消息过长，已截断)'
        : result.response;

      responseHtml += responseContent;

      // 使用更新器更新消息
      if (updater) {
        await updater.update(responseHtml);
      } else {
        await notificationService.sendText(userIdentity, responseContent);
      }

      // 保存到聊天历史
      this.sessionManager.addChatMessage(chatId, owner, question);
      this.sessionManager.addChatMessage(chatId, ceoName, result.response);

      console.log(`✅ CEO: 回复已发送`);
    } catch (error: any) {
      console.error(`❌ CEO: 处理失败:`, error.message);

      if (updater) {
        await updater.error(`处理失败: ${error.message}`);
      } else {
        await Interactive.error(chatId, '处理失败', error.message);
      }
    }
  }

  /**
   * 与员工对话
   */
  private async chatWithEmployee(chatId: number, employeeId: string, message: string): Promise<void> {
    const employee = this.bot.db.getEmployee(employeeId);
    if (!employee) {
      // 员工不存在，切换回 CEO 模式
      this.sessionManager.clearEmployeeMode(chatId);
      await this.bot.bot.sendMessage(chatId,
        `⚠️ 员工不存在，已切换回 CEO 对话模式`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // 发送状态消息
    const statusMsg = await this.bot.bot.sendMessage(chatId, `${employee.name} 正在思考...`);
    const statusMessageId = statusMsg.message_id;

    const updateStatus = async (text: string) => {
      try {
        await (this.bot.bot as any).editMessageText(chatId, statusMessageId, text, { parse_mode: 'HTML' });
      } catch (e) {
        // 忽略编辑失败
      }
    };

    const companyName = this.bot.getCompanyName();
    const owner = this.bot.getOwnerName();
    const human = this.bot.db.getHuman(employee.human_id);

    // 获取员工技能和记忆
    const skills = this.bot.db.getEmployeeSkills(employeeId);
    const memories = this.bot.db.getEmployeeMemories(employeeId).slice(0, 5);

    const skillList = skills.map(s => s.name).join(', ');
    const memoryContext = memories.map(m => m.content).join('; ');

    // 获取聊天历史（只包含与该员工的历史）
    const chatHistory = this.sessionManager.getChatHistory(chatId);
    const employeeHistory = chatHistory.filter(m => m.sender === employee.name || m.sender === owner);

    // 构建历史上下文
    const historyContext = employeeHistory.length > 0
      ? '\n\n【对话历史】\n' + employeeHistory.map(m =>
          m.sender === owner
            ? `${owner}: ${m.content}`
            : `${employee.name}: ${m.content}`
        ).join('\n')
      : '';

    // 构建系统提示
    const systemPrompt = `${employee.system_prompt}

你是 ${employee.name}，${companyName} 公司的（${employee.role}），正在通过 Telegram 与公司Owner ${owner} 交流。

【关于你】
${human?.personalityTraits?.join(', ') || '专业'}
技能: ${skillList}

【最近记忆】
${memoryContext || '无'}${historyContext}

请以你的身份回复。`;

    // 构建消息数组
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: systemPrompt + '\n\n【Owner消息】\n' + message }
    ];

    try {
      await updateStatus(`${employee.name} 正在回复...`);

      const response = await this.bot.aiProvider.messages(messages);

      const escapedResponse = TelegramFormatter.escape(response);
      const maxLength = 4000;
      const finalMessage = escapedResponse.length > maxLength
        ? escapedResponse.slice(0, maxLength - 100) + '...'
        : escapedResponse;

      // 更新为最终结果
      await (this.bot.bot as any).editMessageText(finalMessage, { chat_id: chatId, message_id: statusMessageId, parse_mode: 'HTML' });

      // 保存到聊天历史
      this.sessionManager.addChatMessage(chatId, owner, message);
      this.sessionManager.addChatMessage(chatId, employee.name, response);

      // 💾 保存员工响应到数据库
      try {
        this.bot.messageService.saveCompanyResponse({
          content: response,
          source: 'tg',
          chatId: chatId.toString(),
          sessionId: this.bot.getSessionId(chatId),
          metadata: {
            type: 'employee_response',
            employee_id: employeeId,
            employee_name: employee.name,
            employee_role: employee.role,
          },
        });
        console.log(`✅ 员工响应已保存: ${employee.name}`);
      } catch (error) {
        console.error('❌ 保存员工响应失败:', error);
      }
    } catch (error: any) {
      await updateStatus(`❌ ${employee.name} 暂时无法回复: ${TelegramFormatter.escape(error.message)}`);
    }
  }
}

// ============================================================================
// 按钮回调处理器
// ============================================================================

/**
 * 按钮回调处理器
 */
class CallbackHandler {
  constructor(
    private bot: TelegramIntegration,
    private sessionManager: SessionManager
  ) {}

  async handle(query: TelegramBot.CallbackQuery): Promise<void> {
    const chatId = query.message?.chat.id;
    if (!chatId) return;

    const data = query.data;
    if (!data) return;

    console.log(`🔘 按钮点击: chatId=${chatId}, data="${data}"`);

    try {
      await this.bot.bot.answerCallbackQuery(query.id);

      if (data.startsWith('action:')) {
        await this.handleAction(chatId, data.slice(7), query);
      } else if (data.startsWith('task:')) {
        await this.handleTaskAction(chatId, data.slice(5), query);
      } else if (data.startsWith('employee:')) {
        await this.handleEmployeeAction(chatId, data.slice(9), query);
      } else {
        // 简单按钮，直接作为命令处理
        await this.handleSimpleButton(chatId, data, query);
      }
    } catch (error: any) {
      console.error(`❌ 处理按钮失败:`, error.message);
    }
  }

  private async handleAction(chatId: number, action: string, query: TelegramBot.CallbackQuery): Promise<void> {
    switch (action) {
      case 'refresh':
        // 刷新当前显示的内容
        await this.bot.bot.sendMessage(chatId, '🔄 刷新中...');
        // 这里需要根据上下文判断刷新什么
        break;
      case 'back':
        // 返回上一级
        await this.bot.bot.sendMessage(chatId, '🔙 返回');
        break;
      case 'subscribe':
        // 订阅任务通知
        // 从上下文中获取 taskId
        break;
      case 'unsubscribe':
        // 取消订阅
        this.sessionManager.clearSubscribedTask(chatId);
        await this.bot.bot.sendMessage(chatId, '✅ 已取消订阅');
        break;
      default:
        await this.bot.bot.sendMessage(chatId, `未知操作: ${action}`);
    }
  }

  private async handleTaskAction(chatId: number, taskId: string, query: TelegramBot.CallbackQuery): Promise<void> {
    const task = this.bot.db.getTask(taskId);
    if (!task) {
      await this.bot.bot.sendMessage(chatId, `❌ 任务不存在: ${taskId.slice(0, 8)}...`);
      return;
    }

    // 显示任务详情
    const assignedTo = task.assigned_to ? this.bot.db.getEmployee(task.assigned_to) : null;
    const statusEmoji = task.status === 'completed' ? '✅' :
                        task.status === 'failed' ? '❌' :
                        task.status === 'executing' || task.status === 'in_progress' ? '🔄' : '📋';

    let message = `${statusEmoji} ${TelegramFormatter.bold('任务详情')}\n\n`;
    message += `ID: ${TelegramFormatter.code(task.id.slice(0, 12))}\n`;
    message += `描述: ${task.description}\n`;
    message += `状态: ${task.status}\n`;
    message += `优先级: ${task.priority || 'medium'}\n`;
    if (assignedTo) {
      message += `负责人: ${assignedTo.name}\n`;
    }
    message += `创建: ${new Date(task.created_at).toLocaleString('zh-CN')}\n`;

    if (task.work_dir) {
      message += `\n工作目录: ${TelegramFormatter.code(task.work_dir)}`;
    }

    const keyboard = [
      [
        { text: '📋 查看日志', callback_data: `task_logs:${taskId}` },
        { text: '🔙 返回', callback_data: 'action:back' }
      ]
    ];

    await this.bot.bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  private async handleEmployeeAction(chatId: number, employeeId: string, query: TelegramBot.CallbackQuery): Promise<void> {
    const employee = this.bot.db.getEmployee(employeeId);
    if (!employee) {
      await this.bot.bot.sendMessage(chatId, `❌ 员工不存在`);
      return;
    }

    // 显示员工详情
    let message = TelegramFormatter.h1(`${employee.name} (${employee.role})`);
    message += `ID: ${TelegramFormatter.code(employee.id.slice(0, 8))}\n`;
    message += `状态: ${employee.status}\n`;
    message += `完成: ${employee.completed_tasks || 0} | 失败: ${employee.failed_tasks || 0}\n`;
    if (employee.average_quality) {
      message += `质量: ${Math.round(employee.average_quality)}/100\n`;
    }

    const skills = this.bot.db.getEmployeeSkills(employeeId);
    if (skills.length > 0) {
      message += `\n` + TelegramFormatter.h2('技能');
      skills.forEach(s => {
        message += TelegramFormatter.li(s.name);
      });
    }

    const keyboard = [
      [
        { text: '💬 与TA对话', callback_data: `talk_employee:${employeeId}` },
        { text: '📊 查看绩效', callback_data: `employee_perf:${employeeId}` }
      ],
      [
        { text: '🔙 返回', callback_data: 'action:back' }
      ]
    ];

    await this.bot.bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  private async handleSimpleButton(chatId: number, data: string, query: TelegramBot.CallbackQuery): Promise<void> {
    // 将按钮点击转换为命令执行或设置等待状态
    switch (data) {
      case '📊 状态':
        await this.bot.handleStatus({ chat: { id: chatId } } as TelegramBot.Message);
        break;
      case '📋 任务':
        await this.bot.handleTasks({ chat: { id: chatId } } as TelegramBot.Message);
        break;
      case '👥 员工':
        await this.bot.handleEmployees({ chat: { id: chatId } } as TelegramBot.Message);
        break;
      case '🆕 新任务':
        // 设置等待状态，让用户输入需求
        this.sessionManager.setPendingAction(chatId, 'waiting_for_run');
        await this.bot.bot.sendMessage(chatId,
          '✏️ 请输入你想要执行的需求描述\n\n例如:\n• 帮我写一个 Python 爬虫\n• 分析这个数据集\n• 重构这段代码\n\n💡 发送 /cancel 取消',
          { parse_mode: 'HTML' }
        );
        break;
      case '👔 招募员工':
        // 设置等待状态，让用户输入角色
        this.sessionManager.setPendingAction(chatId, 'waiting_for_recruit');
        await this.bot.bot.sendMessage(chatId,
          '✏️ 请输入要招募的员工角色\n\n例如:\n• Python 开发工程师\n• 数据分析师\n• UI 设计师\n\n💡 发送 /cancel 取消',
          { parse_mode: 'HTML' }
        );
        break;
      case '💬 与员工对话':
        // 设置等待状态，让用户输入员工名/ID
        this.sessionManager.setPendingAction(chatId, 'waiting_for_talk');
        await this.bot.bot.sendMessage(chatId,
          '✏️ 请输入要对话的员工名称或 ID\n\n• 输入员工名字（如：张三）\n• 输入员工 ID 前缀\n• 输入 "CEO" 切换回 CEO 模式\n\n💡 发送 /cancel 取消',
          { parse_mode: 'HTML' }
        );
        break;
      case '📋 查看任务':
        await this.bot.handleTasks({ chat: { id: chatId } } as TelegramBot.Message);
        break;
      default:
        await this.bot.bot.sendMessage(chatId, `未知按钮: ${data}`);
    }
  }
}

// ============================================================================
// 主类
// ============================================================================

export class TelegramIntegration {
  bot: TelegramBot;
  db: AIDatabase;
  private _aiProvider: AIProvider | null = null;

  // 获取 AI Provider（实时从数据库读取，无缓存）
  get aiProvider(): AIProvider {
    // 直接返回新的 provider 实例（每次都从数据库读取最新配置）
    return getAIProvider();
  }

  private commandManager: CommandManager;
  private chatHandler: ChatHandler;
  private callbackHandler: CallbackHandler;
  public messageService: MessageService; // 消息持久化服务（public for command access）

  // 会话管理器（内部使用）
  private sessionManager: SessionManager;

  // 兼容旧代码的 sessions 公开属性（已废弃）
  /** @deprecated 使用 sessionManager 方法代替 */
  sessions: Map<number, UserSession>;

  constructor(token: string, db: AIDatabase) {
    this.bot = new TelegramBot(token, { polling: true });
    this.db = db;

    // 初始化通知服务的 Telegram 渠道
    notificationService.initTelegram(this.bot);

    this.sessionManager = new SessionManager();
    this.sessions = this.sessionManager as any; // 兼容旧代码（已废弃）

    this.messageService = getMessageService(db); // 初始化消息服务
    this.commandManager = new CommandManager(this);
    this.chatHandler = new ChatHandler(this, this.sessionManager);
    this.callbackHandler = new CallbackHandler(this, this.sessionManager);

    this.setupHandlers();
    this.registerCommands();

    // 定期清理过期会话
    setInterval(() => {
      this.sessionManager.cleanup();
    }, 5 * 60 * 1000); // 每 5 分钟
  }

  /**
   * 获取用户身份（用于通知层）
   */
  getUserIdentity(chatId: number) {
    return {
      channel: 'telegram' as const,
      userId: String(chatId),
      chatId
    };
  }

  /**
   * 注册 Telegram Bot 命令
   */
  private async registerCommands(): Promise<void> {
    const commands = [
      { command: 'start', description: '显示欢迎信息和主菜单' },
      { command: 'cancel', description: '取消当前操作' },
      { command: 'help', description: '显示帮助信息' },
      { command: 'status', description: '查看公司状态' },
      { command: 'employees', description: '查看所有员工' },
      { command: 'employee', description: '查看员工详情' },
      { command: 'tasks', description: '查看任务列表' },
      { command: 'task', description: '查看任务详情' },
      { command: 'logs', description: '查看日志' },
      { command: 'run', description: '执行新任务' },
      { command: 'stop', description: '停止当前任务' },
      { command: 'pause', description: '暂停任务' },
      { command: 'resume', description: '恢复任务' },
      { command: 'recruit', description: '招募新员工' },
      { command: 'talk', description: '与员工对话' },
      { command: 'performance', description: '员工绩效排行' },
    ];

    try {
      await this.bot.setMyCommands(commands);
      console.log('✅ Telegram 命令已注册');
    } catch (error: any) {
      console.error('⚠️ 注册命令失败:', error.message);
    }
  }

  /**
   * 设置消息处理器
   */
  private setupHandlers(): void {
    // 回调查询处理（按钮点击）
    this.bot.on('callback_query', (query) => {
      // 保存按钮点击消息
      if (query.message) {
        try {
          this.messageService.saveUserMessage({
            content: query.data || '[callback]',
            source: 'tg',
            chatId: query.message.chat.id.toString(),
            userId: query.from.id?.toString(),
            username: query.from.username,
            firstName: query.from.first_name,
            lastName: query.from.last_name,
            externalMessageId: query.id.toString(),
            sessionId: this.getSessionId(query.message.chat.id),
            metadata: { type: 'callback_query' },
          });
        } catch (error) {
          console.error('❌ 保存callback消息失败:', error);
        }
      }

      this.callbackHandler.handle(query);
    });

    // 所有消息的主路由
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text || '';

      console.log(`📨 收到消息: chatId=${chatId}, text="${text}"`);

      // 💾 保存用户消息
      try {
        this.messageService.saveUserMessage({
          content: text,
          source: 'tg',
          chatId: chatId.toString(),
          userId: msg.from?.id?.toString(),
          username: msg.from?.username,
          firstName: msg.from?.first_name,
          lastName: msg.from?.last_name,
          externalMessageId: msg.message_id?.toString(),
          sessionId: this.getSessionId(chatId),
          metadata: {
            message_type: msg.chat.type,
            replyToMessageId: msg.reply_to_message?.message_id,
          },
        });
      } catch (error) {
        console.error('❌ 保存消息失败:', error);
      }

      try {
        // 1. 处理命令
        if (text.startsWith('/')) {
          const handled = await this.commandManager.handle(msg);
          if (handled) return;
        }

        // 2. 处理普通聊天
        if (!text.startsWith('/')) {
          await this.chatHandler.handle(msg);
          return;
        }
      } catch (error: any) {
        console.error(`❌ 处理消息失败:`, error);
        try {
          const errorMsg = `❌ 处理请求时出错: ${TelegramFormatter.escape(error.message || String(error))}`;
          await this.bot.sendMessage(chatId, errorMsg, { parse_mode: 'HTML' });

          // 💾 保存错误响应
          this.messageService.saveCompanyResponse({
            content: errorMsg,
            source: 'tg',
            chatId: chatId.toString(),
            sessionId: this.getSessionId(chatId),
            metadata: { type: 'error' },
          });
        } catch {
          // 忽略发送错误消息时的错误
        }
      }
    });

    // 错误处理
    this.bot.on('polling_error', (error) => {
      console.error('❌ Telegram polling error:', error.message);
    });

    console.log('✅ 消息处理器已设置');
  }

  /**
   * 获取会话ID（用于消息历史关联）
   */
  public getSessionId(chatId: number): string {
    return `tg-${chatId}`;
  }

  /**
   * 包装 sendMessage 以自动保存响应
   */
  async sendMessageWithSave(
    chatId: number | string,
    text: string,
    options?: any
  ): Promise<TelegramBot.Message> {
    const msg = await this.bot.sendMessage(chatId, text, options);

    // 💾 保存公司响应
    try {
      this.messageService.saveCompanyResponse({
        content: text,
        source: 'tg',
        chatId: typeof chatId === 'number' ? chatId.toString() : chatId,
        sessionId: this.getSessionId(typeof chatId === 'number' ? chatId : parseInt(chatId)),
        metadata: {
          messageId: msg.message_id,
          parseMode: options?.parse_mode,
        },
      });
    } catch (error) {
      console.error('❌ 保存响应失败:', error);
    }

    return msg;
  }

  // ============================================================================
  // 公开的处理器方法（供 CommandManager 调用）
  // ============================================================================

  /**
   * 会话管理器访问方法
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  getCompanyName(): string {
    const config = getConfigService(this.db);
    return config.get('company.name') as string || 'AI Company';
  }

  /**
 * 获取Owner名称
 */
  getOwnerName(): string {
      const config = getConfigService(this.db);
      return config.get('company.owner') as string || 'Owner';
  }
  /**
   * 处理 /status
   */
  async handleStatus(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    await this.bot.sendChatAction(chatId, 'typing');

    const employees = this.db.getAllEmployees();
    const tasks = this.db.getAllTasks();

    const activeEmployees = employees.filter(e => e.status === 'active').length;
    const busyEmployees = employees.filter(e => e.status === 'busy').length;
    const pendingTasks = tasks.filter(t => t.status === 'pending').length;
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress' || t.status === 'executing').length;
    const completedToday = tasks.filter(t =>
      t.status === 'completed' &&
      t.completed_at &&
      Date.now() - t.completed_at < 24 * 60 * 60 * 1000
    ).length;

    let status = TelegramFormatter.h1('📊 公司状态') + '\n' +
      TelegramFormatter.h2('👥 员工') +
      `   总数: ${employees.length}\n` +
      `   活跃: ${activeEmployees} | 忙碌: ${busyEmployees}\n\n` +
      TelegramFormatter.h2('📋 任务') +
      `   待处理: ${pendingTasks}\n` +
      `   进行中: ${inProgressTasks}\n` +
      `   今日完成: ${completedToday}\n`;

    // 添加忙碌员工详情
    if (busyEmployees > 0) {
      status += '\n' + TelegramFormatter.h2('🔥 正在工作');
      employees
        .filter(e => e.status === 'busy')
        .forEach(e => {
          const task = e.current_task ? this.db.getTask(e.current_task) : null;
          status += `\n${TelegramFormatter.emoji('👤', e.name)} (${e.role})`;
          if (task) {
            status += `\n   ${task.description.slice(0, 30)}...`;
          }
        });
    }

    const keyboard = TelegramFormatter.buttonGrid([
      ['📊 状态', '📋 任务', '👥 员工'],
      ['❓ 帮助'],
    ]);

    await this.bot.sendMessage(chatId, status, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  /**
   * 处理 /tasks
   */
  async handleTasks(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    await this.bot.sendChatAction(chatId, 'typing');

    const tasks = this.db.getAllTasks();

    if (tasks.length === 0) {
      await this.bot.sendMessage(chatId, '📭 暂无任务\n\n使用 /run <需求> 创建新任务');
      return;
    }

    // 排序：最新的在前
    tasks.sort((a, b) => b.created_at - a.created_at);

    const lines: string[] = [];
    lines.push(TelegramFormatter.h1(`📋 任务列表 (${tasks.length} 个)`));

    const pending = tasks.filter(t => t.status === 'pending');
    const inProgress = tasks.filter(t => t.status === 'in_progress' || t.status === 'executing');
    const completed = tasks.filter(t => t.status === 'completed').slice(0, 5);

    if (pending.length > 0) {
      lines.push('\n' + TelegramFormatter.h2(`⏳ 待处理 (${pending.length})`));
      pending.slice(0, 5).forEach(t => {
        const statusEmoji = '📋';
        lines.push(`${statusEmoji} ${TelegramFormatter.bold(t.description.slice(0, 25))}`);
        lines.push(`   ID: ${TelegramFormatter.code(t.id.slice(0, 8))} | 优先级: ${t.priority || 'medium'}`);
      });
      if (pending.length > 5) {
        lines.push(`   ${TelegramFormatter.italic(`...还有 ${pending.length - 5} 个`)}`);
      }
    }

    if (inProgress.length > 0) {
      lines.push('\n' + TelegramFormatter.h2(`🔄 进行中 (${inProgress.length})`));
      inProgress.forEach(t => {
        const assignedTo = t.assigned_to ? this.db.getEmployee(t.assigned_to) : null;
        lines.push(`${TelegramFormatter.emoji('🔄', t.description.slice(0, 25))}`);
        lines.push(`   负责: ${assignedTo?.name || '未分配'}`);
      });
    }

    if (completed.length > 0) {
      lines.push('\n' + TelegramFormatter.h2('✅ 最近完成'));
      completed.forEach(t => {
        lines.push(TelegramFormatter.li(t.description.slice(0, 40)));
      });
    }

    const keyboard = TelegramFormatter.buttonRow(['🔄 刷新']);

    await this.bot.sendMessage(chatId, lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  /**
   * 处理 /employees
   */
  async handleEmployees(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    await this.bot.sendChatAction(chatId, 'typing');

    const employees = this.db.getAllEmployees();

    if (employees.length === 0) {
      await this.bot.sendMessage(chatId,
        '👥 暂无员工\n\n使用 /recruit <角色> 招募新员工',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const lines: string[] = [];
    lines.push(TelegramFormatter.h1(`👥 员工列表 (${employees.length} 人)`));

    for (const emp of employees) {
      const statusEmoji = emp.status === 'active' ? '🟢' : emp.status === 'busy' ? '🔵' : '⚪';
      const stats = emp.completed_tasks || 0;
      const quality = emp.average_quality ? Math.round(emp.average_quality) : 'N/A';

      lines.push(`${statusEmoji} ${TelegramFormatter.bold(emp.name)} (${emp.role})`);
      lines.push(`   ID: ${TelegramFormatter.code(emp.id.slice(0, 8))}`);
      lines.push(`   状态: ${emp.status} | 完成: ${stats} | 质量: ${quality}`);
      if (emp.current_task) {
        const task = this.db.getTask(emp.current_task);
        lines.push(`   当前: ${task?.description || '未知任务'}`);
      }
      lines.push('');
    }

    const keyboard = TelegramFormatter.buttonRow(['🔄 刷新']);

    await this.bot.sendMessage(chatId, lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  /**
   * 启动
   */
  start(): void {
    const companyName = this.getCompanyName();
    console.log('\nTelegram Bot 已启动');
    console.log(`🏢 ${companyName} CEO 在线`);
    console.log('📱 等待消息...\n');
  }

  /**
   * 停止
   */
  stop(): void {
    this.bot.stopPolling();
    console.log('\n🛑 Telegram Bot 已停止');
  }

  // ============================================================================
  // 意图处理方法
  // ============================================================================

  /**
   * 处理执行 cron 任务
   */
  async handleExecuteCron(msg: TelegramBot.Message, intent: any): Promise<void> {
    const chatId = msg.chat.id;
    const cronId = intent.targetId;

    if (!cronId) {
      await this.bot.sendMessage(chatId,
        `⚠️ 识别到您想执行 cron 任务，但无法确定具体任务\n\n` +
        `请使用 /crontab 查看所有可用任务`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // 获取 cron 任务详情
    const cronJob = this.db.prepare(`
      SELECT * FROM crontab WHERE id = ?
    `).get(cronId) as any;

    if (!cronJob) {
      await this.bot.sendMessage(chatId,
        `❌ Cron 任务不存在: ${TelegramFormatter.code(cronId)}`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // 发送确认消息
    const statusMsg = await this.bot.sendMessage(chatId,
      TelegramFormatter.h1('⚡ 执行 Cron 任务') + '\n' +
      TelegramFormatter.li(`任务: ${cronJob.name}`) +
      TelegramFormatter.li(`命令: ${TelegramFormatter.code(cronJob.command.split('/').pop() || cronJob.command)}`) +
      '\n⏳ 正在执行...',
      { parse_mode: 'HTML' }
    );

    try {
      // 动态导入 CronService
      const { getCronService } = await import('../../gateway/CronService.js');
      const cronService = getCronService(this.db);

      // 解析环境变量和参数
      const env = cronJob.env_json ? JSON.parse(cronJob.env_json) : {};
      const args = cronJob.args_json ? JSON.parse(cronJob.args_json) : {};

      // 执行任务
      const result = await cronService.executeNow({
        id: cronJob.id,
        name: cronJob.name,
        description: cronJob.description || undefined,
        command: cronJob.command,
        args,
        cronRule: cronJob.cron_rule || undefined,
        enabled: cronJob.enabled === 1,
        timeout: cronJob.timeout,
        workingDir: cronJob.working_dir || undefined,
        env,
      });

      // 更新消息显示结果
      let resultMsg = TelegramFormatter.h1('✅ Cron 任务完成') + '\n' +
        TelegramFormatter.li(`任务: ${cronJob.name}`) +
        TelegramFormatter.li(`状态: ${result.success ? '成功' : '失败'}`) +
        TelegramFormatter.li(`耗时: ${Math.round(result.duration / 1000)}s`);

      if (result.exitCode !== undefined) {
        resultMsg += TelegramFormatter.li(`退出码: ${result.exitCode}`);
      }

      if (result.stdout) {
        resultMsg += '\n\n' + TelegramFormatter.h2('📤 输出') + '\n' +
          TelegramFormatter.pre(result.stdout.slice(0, 500) + (result.stdout.length > 500 ? '...' : ''));
      }

      if (result.stderr) {
        resultMsg += '\n\n' + TelegramFormatter.h2('⚠️ 错误') + '\n' +
          TelegramFormatter.pre(result.stderr.slice(0, 500) + (result.stderr.length > 500 ? '...' : ''));
      }

      await this.bot.editMessageText(resultMsg, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'HTML'
      });

    } catch (error: any) {
      await this.bot.editMessageText(
        `❌ 执行失败: ${TelegramFormatter.escape(error.message)}`,
        {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'HTML'
        }
      );
    }
  }

  /**
   * 处理执行现有任务
   */
  async handleExecuteTask(msg: TelegramBot.Message, intent: any): Promise<void> {
    const chatId = msg.chat.id;
    const taskId = intent.targetId;

    await this.bot.sendMessage(chatId,
      `⚠️ 任务执行功能开发中\n\n` +
      `任务ID: ${TelegramFormatter.code(taskId || '未知')}\n\n` +
      `请使用 /tasks 查看任务列表`,
      { parse_mode: 'HTML' }
    );
  }

  /**
   * 处理查询状态
   */
  async handleQueryStatus(msg: TelegramBot.Message, intent: any): Promise<void> {
    const chatId = msg.chat.id;

    // 委托给 /status 处理
    await this.handleStatus(msg);
  }

  /**
   * 处理创建新任务
   */
  async handleCreateTask(msg: TelegramBot.Message, requirement: string, intent: any): Promise<void> {
    const chatId = msg.chat.id;
    await this.bot.sendChatAction(chatId, 'typing');

    // 创建任务（pending 状态），由 Scheduler 执行
    const task = this.db.createTask({
      type: 'general',
      description: requirement,
      priority: 'medium',
      requested_by: 'user',
      context: {
        telegramChatId: chatId,
        telegramUsername: msg.from?.username,
      },
    });

    let msg1 = TelegramFormatter.h1('📋 任务已创建') + '\n' +
      TelegramFormatter.bold('需求:') + '\n' +
      TelegramFormatter.pre(requirement.slice(0, 100) + (requirement.length > 100 ? '...' : '')) + '\n\n' +
      TelegramFormatter.h2('📊 任务信息') +
      TelegramFormatter.li(`ID: ${task.id}`) +
      TelegramFormatter.li(`优先级: ${task.priority}`) +
      TelegramFormatter.li(`状态: ${task.status}`) + '\n' +
      TelegramFormatter.italic('任务已加入队列，Scheduler 将在下次扫描时执行');

    if (intent.type !== 'create_task') {
      msg1 += '\n\n' + TelegramFormatter.italic(`💡 意图: ${intent.reasoning}`);
    }

    const keyboard = TelegramFormatter.buttonRow(['📋 查看任务']);

    await this.bot.sendMessage(chatId, msg1, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });
  }
}

// ============================================================================
// 导出启动函数
// ============================================================================

export async function startTelegramBot(token: string, db: AIDatabase): Promise<TelegramIntegration> {
  const bot = new TelegramIntegration(token, db);
  bot.start();
  return bot;
}
