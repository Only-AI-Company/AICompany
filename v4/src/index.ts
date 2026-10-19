/**
 * AI Company v4 - 主入口
 *
 * 启动顺序：
 * 1. 初始化配置
 * 2. 启动通信层（WebSocket + REST API）
 * 3. 启动外部接口（Telegram Bot）
 * 4. 启动交互层（Interaction Manager）
 * 5. 启动编排层（Orchestrator）
 * 6. 启动 Agent 层
 */

import dotenv from 'dotenv';
import pino from 'pino';
import { WSServer } from './api/websocket/WSServer';
import { ApiServer } from './api/rest/ApiServer';
import { AuthService } from './api/auth/AuthService';
import { TelegramIntegration } from './api/telegram/TelegramBot';
import { InteractionManager } from './interaction/dialog/InteractionManager';
import { Orchestrator } from './core/orchestration/Orchestrator';
import { CEOAgent } from './core/agent/CEOAgent';
import { ManagerAgent } from './core/agent/ManagerAgent';
import { ResearcherAgent, CreatorAgent, PublisherAgent, AnalystAgent } from './core/agent/SpecialistAgents';
import { ToolRegistry, LangChainLLMTool, SearchTool, BrowserTool, FileTool, XiaohongshuTool } from './core/capability';
import { MemorySystem } from './core/memory';

// 加载环境变量
dotenv.config();

const logger = pino({ name: 'ai-company-v4' });

// ============================================================================
// 配置
// ============================================================================

const config = {
  // WebSocket
  wsPort: parseInt(process.env.WS_PORT || '8081'),

  // REST API
  apiPort: parseInt(process.env.API_PORT || '3000'),

  // 认证
  authSecret: process.env.AUTH_SECRET || 'change-me-in-production',

  // Telegram
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,

  // 功能开关
  features: {
    enableWebSocket: true,
    enableRestApi: true,
    enableTelegram: !!process.env.TELEGRAM_BOT_TOKEN,
    enableAuth: false // 初期开发暂不启用认证
  }
};

// ============================================================================
// 服务实例
// ============================================================================

let wsServer: WSServer | null = null;
let apiServer: ApiServer | null = null;
let authService: AuthService | null = null;
let telegramBot: TelegramIntegration | null = null;
let interactionManager: InteractionManager | null = null;
let orchestrator: Orchestrator | null = null;
let ceoAgent: CEOAgent | null = null;
let managerAgent: ManagerAgent | null = null;
let researcherAgent: ResearcherAgent | null = null;
let creatorAgent: CreatorAgent | null = null;
let publisherAgent: PublisherAgent | null = null;
let analystAgent: AnalystAgent | null = null;
let toolRegistry: ToolRegistry | null = null;
let memorySystem: MemorySystem | null = null;

// ============================================================================
// 初始化函数
// ============================================================================

async function initializeAuth(): Promise<void> {
  if (!config.features.enableAuth) {
    logger.info('Authentication disabled');
    return;
  }

  authService = new AuthService({
    secret: config.authSecret,
    accessTokenExpiresIn: '1h',
    refreshTokenExpiresIn: '7d'
  });

  logger.info('Auth service initialized');
}

async function initializeWebSocket(): Promise<void> {
  if (!config.features.enableWebSocket) {
    logger.info('WebSocket disabled');
    return;
  }

  wsServer = new WSServer({
    port: config.wsPort,
    heartbeatInterval: 30000,
    maxConnections: 100
  });

  // 处理聊天消息
  wsServer.on('chat_message', async (event) => {
    logger.info({ connectionId: event.connectionId }, 'Received chat message');

    if (interactionManager) {
      const result = await interactionManager.handleInput({
        userId: event.connectionId, // TODO: 从连接获取 userId
        source: 'web',
        content: event.payload.content,
        conversationId: event.payload.conversationId
      });

      // 发送响应
      if (result.type === 'direct_response' || result.type === 'task_created') {
        wsServer?.send(event.connectionId, {
          type: 'chat_response',
          payload: {
            conversationId: event.payload.conversationId,
            content: result.response || '任务已创建',
            taskId: result.taskId
          }
        });
      }
    }
  });

  logger.info(`WebSocket server initialized on port ${config.wsPort}`);
}

async function initializeRestApi(): Promise<void> {
  if (!config.features.enableRestApi) {
    logger.info('REST API disabled');
    return;
  }

  apiServer = new ApiServer({
    port: config.apiPort,
    prefix: '/api',
    cors: true,
    serveWebUI: true
  });

  // 注册健康检查路由（已在 ApiServer 中默认注册）

  // 注册任务相关路由
  registerTaskRoutes();

  // 注册会话相关路由
  registerConversationRoutes();

  await apiServer.start();

  logger.info(`REST API server started on port ${config.apiPort}`);
  logger.info(`   WebUI: http://localhost:${config.apiPort}`);
}

async function initializeTelegram(): Promise<void> {
  if (!config.features.enableTelegram || !config.telegramToken) {
    logger.info('Telegram disabled (no token)');
    return;
  }

  telegramBot = new TelegramIntegration({
    token: config.telegramToken,
    polling: true
  });

  // 处理 Telegram 消息
  telegramBot.on('message', async (msg) => {
    logger.info({ chatId: msg.chatId, text: msg.text }, 'Telegram message received');

    if (interactionManager) {
      const result = await interactionManager.handleInput({
        userId: String(msg.userId),
        source: 'telegram',
        content: msg.text || '',
        metadata: {
          chatId: msg.chatId
        }
      });

      // 发送响应
      if (result.type === 'direct_response' && result.response) {
        await telegramBot?.sendMessage(msg.chatId, result.response);
      } else if (result.type === 'approval_requested' && result.approvalRequest) {
        await telegramBot?.sendMessageWithButtons(
          msg.chatId,
          `需要您的确认：\n\n${result.approvalRequest.description}`,
          result.approvalRequest.options.map(text => ({ text, callbackData: text }))
        );
      }
    }
  });

  // 处理回调按钮（审批响应）
  telegramBot.on('callback', async (msg) => {
    logger.info({ chatId: msg.chatId, data: msg.data }, 'Telegram callback received');

    if (interactionManager && msg.data) {
      // 处理审批响应
      const result = await interactionManager.handleInput({
        userId: String(msg.userId),
        source: 'telegram',
        content: msg.data,
        type: 'callback_query'
      } as any);

      if (result.type === 'direct_response' && result.response) {
        await telegramBot?.sendMessage(msg.chatId, result.response);
      }
    }
  });

  logger.info('Telegram bot initialized');
}

function initializeInteraction(): void {
  interactionManager = new InteractionManager({
    autoApproveLowRisk: true,
    approvalTimeout: 300000,
    feedbackTimeout: 300000
  });

  // 监听任务创建事件
  interactionManager.on('task_created', (task) => {
    logger.info({ taskId: task.taskId, type: task.type }, 'Task created');

    // 通知 Orchestrator 处理任务
    if (orchestrator) {
      orchestrator.submitTask({
        id: task.taskId,
        type: task.type,
        description: task.description,
        status: 'pending',
        priority: task.priority || 'medium',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        userId: task.userId
      });
    }
  });

  // 监听状态请求
  interactionManager.on('status_request', async (request) => {
    // 从系统获取状态
    const status = {
      running: true,
      activeTasks: orchestrator?.getStats().executing || 0,
      pendingTasks: orchestrator?.getStats().queued || 0,
      employees: 0
    };
    request.callback(status);
  });

  logger.info('Interaction manager initialized');
}

function initializeOrchestrator(): void {
  orchestrator = new Orchestrator({
    maxConcurrentTasks: 5,
    taskTimeout: 300000
  });

  // 监听 Orchestrator 事件
  orchestrator.on('task_started', ({ taskId }) => {
    logger.info({ taskId }, 'Task started');
  });

  orchestrator.on('task_completed', ({ taskId, result }) => {
    logger.info({ taskId, result }, 'Task completed');
  });

  orchestrator.on('task_failed', ({ taskId, error }) => {
    logger.error({ taskId, error }, 'Task failed');
  });

  logger.info('Orchestrator initialized');
}

function initializeCEOAgent(): void {
  ceoAgent = new CEOAgent({
    name: 'CEO',
    autonomyLevel: 2 // 默认级别 2：低风险任务自动批准
  });

  // 监听 CEO Agent 事件
  ceoAgent.on('task_completed', ({ task, result }) => {
    logger.info({ taskId: task.id, result }, 'CEO Agent completed task');
  });

  ceoAgent.on('task_failed', ({ task, error }) => {
    logger.error({ taskId: task.id, error }, 'CEO Agent failed task');
  });

  logger.info('CEO Agent initialized');
}

function initializeSpecialistAgents(): void {
  // 创建研究员 Agent（新闻搜索）
  researcherAgent = new ResearcherAgent({
    name: 'Researcher-News',
    focus: 'news',
    maxSources: 5
  });

  // 创建创作者 Agent（社交媒体）
  creatorAgent = new CreatorAgent({
    name: 'Creator-Social',
    specialty: 'social_media',
    tone: 'casual'
  });

  // 创建发布员 Agent（小红书）
  publisherAgent = new PublisherAgent({
    name: 'Publisher-Xiaohongshu',
    platforms: ['xiaohongshu'],
    autoSchedule: false
  });

  // 创建分析师 Agent（数据分析）
  analystAgent = new AnalystAgent({
    name: 'Analyst-Performance',
    focus: 'performance'
  });

  logger.info('Specialist agents initialized');
}

function initializeManagerAgent(): void {
  managerAgent = new ManagerAgent({
    name: 'Manager-Content',
    specialization: 'creation',
    teamSize: 3
  });

  // 添加专家团队成员
  if (researcherAgent) {
    managerAgent.addTeamMember('researcher-1', researcherAgent);
  }
  if (creatorAgent) {
    managerAgent.addTeamMember('creator-1', creatorAgent);
  }
  if (publisherAgent) {
    managerAgent.addTeamMember('publisher-1', publisherAgent);
  }

  logger.info('Manager agent initialized');
}

function initializeToolRegistry(): void {
  toolRegistry = new ToolRegistry();

  // 注册内置工具
  toolRegistry.registerMany([
    {
      name: 'llm_chat',
      description: '与 AI 助手对话，回答问题或完成任务',
      category: 'llm',
      instance: new LangChainLLMTool()
    },
    {
      name: 'web_search',
      description: '搜索互联网获取最新信息',
      category: 'web',
      instance: new SearchTool()
    },
    {
      name: 'browser',
      description: '使用浏览器访问网页、提取内容',
      category: 'browser',
      instance: new BrowserTool()
    },
    {
      name: 'file',
      description: '读取/写入文件，列出目录内容',
      category: 'file',
      instance: new FileTool()
    },
    {
      name: 'xiaohongshu',
      description: '发布小红书笔记、获取笔记数据',
      category: 'platform',
      instance: new XiaohongshuTool()
    }
  ]);

  logger.info({ count: 5 }, 'Tool registry initialized');
}

async function initializeMemorySystem(): Promise<void> {
  memorySystem = new MemorySystem();
  await memorySystem.initialize();
  logger.info('Memory system initialized');
}

// ============================================================================
// 路由注册
// ============================================================================

function registerTaskRoutes(): void {
  if (!apiServer) return;

  // GET /api/tasks - 获取任务列表
  apiServer.registerRoute('GET', '/tasks', async (_req, res) => {
    // TODO: 从数据库获取任务
    return res.json({
      success: true,
      data: {
        tasks: [],
        total: 0
      }
    });
  });

  // POST /api/tasks - 创建任务
  apiServer.registerRoute('POST', '/tasks', async (req, res) => {
    const { description, type, priority } = req.body;

    if (!description) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Description is required' }
      });
    }

    if (!interactionManager) {
      return res.status(500).json({
        success: false,
        error: { code: 'NOT_INITIALIZED', message: 'Interaction manager not initialized' }
      });
    }

    // 通过 Interaction Manager 处理
    const result = await interactionManager.handleInput({
      userId: (req as any).userId || 'anonymous',
      source: 'web',
      content: `${type || 'task'}: ${description}`,
      metadata: { priority }
    });

    return res.json({
      success: true,
      data: {
        taskId: result.taskId,
        type: result.type,
        response: result.response
      }
    });
  });
}

function registerConversationRoutes(): void {
  if (!apiServer) return;

  // GET /api/conversations - 获取会话列表
  apiServer.registerRoute('GET', '/conversations', async (_req, res) => {
    return res.json({
      success: true,
      data: {
        conversations: [],
        total: 0
      }
    });
  });

  // POST /api/conversations/:id/messages - 发送消息
  apiServer.registerRoute('POST', '/conversations/:id/messages', async (req, res) => {
    const { id: conversationId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Content is required' }
      });
    }

    if (!interactionManager) {
      return res.status(500).json({
        success: false,
        error: { code: 'NOT_INITIALIZED', message: 'Interaction manager not initialized' }
      });
    }

    const result = await interactionManager.handleInput({
      userId: (req as any).userId || 'anonymous',
      source: 'web',
      content,
      conversationId
    });

    return res.json({
      success: true,
      data: {
        type: result.type,
        response: result.response,
        taskId: result.taskId
      }
    });
  });
}

// ============================================================================
// 主函数
// ============================================================================

async function main(): Promise<void> {
  logger.info('🚀 AI Company v4 starting...');

  try {
    // 初始化各层
    await initializeAuth();
    await initializeWebSocket();
    await initializeRestApi();
    await initializeTelegram();
    initializeInteraction();
    initializeOrchestrator();
    initializeCEOAgent();
    initializeSpecialistAgents();
    initializeManagerAgent();
    initializeToolRegistry();
    await initializeMemorySystem();

    logger.info('✅ AI Company v4 started successfully');
    logger.info(`   WebSocket: ${config.features.enableWebSocket ? `port ${config.wsPort}` : 'disabled'}`);
    logger.info(`   REST API: ${config.features.enableRestApi ? `port ${config.apiPort}` : 'disabled'}`);
    logger.info(`   Telegram: ${config.features.enableTelegram ? 'enabled' : 'disabled'}`);
    logger.info(`   Tools: ${toolRegistry?.listTools().length || 0} tools registered`);
    logger.info(`   Memory: ${memorySystem ? 'initialized' : 'disabled'}`);
    logger.info(`   Agents: CEO + Manager + ${4} Specialists`);

    // 优雅关闭
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      await shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Shutting down...');
      await shutdown();
      process.exit(0);
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start AI Company v4');
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  const promises: Promise<void>[] = [];

  if (wsServer) {
    promises.push(wsServer.close());
  }
  if (apiServer) {
    promises.push(apiServer.stop());
  }
  if (telegramBot) {
    promises.push(telegramBot.close());
  }

  await Promise.all(promises);
  logger.info('AI Company v4 shut down complete');
}

// ============================================================================
// 导出
// ============================================================================

export {
  wsServer,
  apiServer,
  authService,
  telegramBot,
  interactionManager,
  orchestrator,
  ceoAgent,
  managerAgent,
  researcherAgent,
  creatorAgent,
  publisherAgent,
  analystAgent,
  toolRegistry,
  memorySystem
};

// 启动
main().catch(console.error);
