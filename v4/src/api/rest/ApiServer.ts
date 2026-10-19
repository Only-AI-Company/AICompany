/**
 * REST API Server - 通信层
 *
 * 负责：
 * - HTTP 请求处理
 * - RESTful 端点
 * - 认证中间件
 * - 请求日志
 */

import express, { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ApiServerConfig {
  port: number;
  prefix?: string;
  cors?: boolean;
  serveWebUI?: boolean;
}

export class ApiServer {
  private app: express.Application;
  private port: number;
  private prefix: string;
  private logger: pino.Logger;
  private routes = new Map<string, RouteHandler>();

  constructor(config: ApiServerConfig) {
    this.app = express();
    this.port = config.port;
    this.prefix = config.prefix || '/api';
    this.logger = pino({ name: 'api-server' });

    this.setupMiddleware(config);
    this.setupRoutes();

    // Serve WebUI
    if (config.serveWebUI) {
      this.setupWebUI();
    }
  }

  private setupMiddleware(config: ApiServerConfig): void {
    // 解析 JSON
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // CORS
    if (config.cors) {
      this.app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') {
          return res.sendStatus(200);
        }
        next();
        return undefined;
      });
    }

    // 错误处理
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      this.logger.error({ err }, 'Unhandled error');
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message
        }
      });
    });
  }

  private setupRoutes(): void {
    // 健康检查
    this.registerRoute('GET', '/health', async (_req, res) => {
      res.json({
        success: true,
        data: {
          status: 'healthy',
          timestamp: Date.now()
        }
      });
    });

    // 系统状态
    this.registerRoute('GET', '/status', async (_req, res) => {
      res.json({
        success: true,
        data: {
          version: '4.0.0',
          uptime: process.uptime(),
          timestamp: Date.now()
        }
      });
    });
  }

  /**
   * 设置 WebUI 静态文件服务
   */
  private setupWebUI(): void {
    // 支持开发环境 (src) 和生产环境 (dist)
    const webuiPath = path.join(__dirname, '../../../webui');

    // WebUI 主页
    this.app.get('/', (_req, res) => {
      res.sendFile(path.join(webuiPath, 'index.html'));
    });

    // 静态文件
    this.app.use(express.static(webuiPath));

    this.logger.info({ path: webuiPath }, 'WebUI static files enabled');
  }

  /**
   * 注册路由
   */
  registerRoute(
    method: string,
    path: string,
    handler: RouteHandler,
    _options?: RouteOptions
  ): void {
    const fullPath = `${this.prefix}${path}`;

    (this.app as any)[method.toLowerCase()](fullPath, async (req: express.Request, res: express.Response) => {
      try {
        const result = await handler(req, res);
        if (result !== undefined && !res.headersSent) {
          res.json(result);
        }
      } catch (error) {
        this.logger.error({ error, path: req.path }, 'Route handler error');
        res.status(500).json({
          success: false,
          error: {
            code: 'HANDLER_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    });

    this.routes.set(`${method}:${fullPath}`, handler);
    this.logger.info({ method, path: fullPath }, 'Route registered');
  }

  /**
   * 获取 Express 应用实例
   */
  getApp(): express.Application {
    return this.app;
  }

  /**
   * 启动服务器
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        this.logger.info(`REST API server started on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * 关闭服务器
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      // 实际实现需要追踪所有活跃请求
      resolve();
    });
  }
}

// ============================================================================
// 类型定义
// ============================================================================

interface RouteHandler {
  (req: express.Request, res: express.Response): Promise<any>;
}

interface RouteOptions {
  auth?: boolean;
  rateLimit?: number;
}

// ============================================================================
// API 端点定义 (供后续扩展)
// ============================================================================

/**
 * 任务相关端点
 *
 * GET    /api/tasks              - 获取任务列表
 * POST   /api/tasks              - 创建任务
 * GET    /api/tasks/:id          - 获取任务详情
 * DELETE /api/tasks/:id          - 删除任务
 * POST   /api/tasks/:id/cancel   - 取消任务
 */
export interface TaskEndpoints {
  'GET /tasks': () => Promise<any>;
  'POST /tasks': (body: CreateTaskRequest) => Promise<any>;
  'GET /tasks/:id': (params: { id: string }) => Promise<any>;
  'DELETE /tasks/:id': (params: { id: string }) => Promise<any>;
  'POST /tasks/:id/cancel': (params: { id: string }) => Promise<any>;
}

/**
 * 会话相关端点
 *
 * GET    /api/conversations       - 获取会话列表
 * POST   /api/conversations       - 创建会话
 * GET    /api/conversations/:id   - 获取会话详情
 * GET    /api/conversations/:id/messages - 获取消息历史
 * POST   /api/conversations/:id/messages - 发送消息
 */
export interface ConversationEndpoints {
  'GET /conversations': () => Promise<any>;
  'POST /conversations': (body: CreateConversationRequest) => Promise<any>;
  'GET /conversations/:id': (params: { id: string }) => Promise<any>;
  'GET /conversations/:id/messages': (params: { id: string }) => Promise<any>;
  'POST /conversations/:id/messages': (params: { id: string }, body: SendMessageRequest) => Promise<any>;
}

/**
 * 记忆相关端点
 *
 * GET    /api/memories            - 检索记忆
 * POST   /api/memories            - 存储记忆
 * DELETE /api/memories/:id        - 删除记忆
 */
export interface MemoryEndpoints {
  'GET /memories': (query: MemoryQuery) => Promise<any>;
  'POST /memories': (body: CreateMemoryRequest) => Promise<any>;
  'DELETE /memories/:id': (params: { id: string }) => Promise<any>;
}

/**
 * 配置相关端点
 *
 * GET    /api/config              - 获取配置
 * PUT    /api/config              - 更新配置
 */
export interface ConfigEndpoints {
  'GET /config': () => Promise<any>;
  'PUT /config': (body: UpdateConfigRequest) => Promise<any>;
}

/**
 * 用户相关端点
 *
 * GET    /api/users/:id           - 获取用户信息
 * PUT    /api/users/:id/settings  - 更新用户设置
 */
export interface UserEndpoints {
  'GET /users/:id': (params: { id: string }) => Promise<any>;
  'PUT /users/:id/settings': (params: { id: string }, body: UpdateSettingsRequest) => Promise<any>;
}

// ============================================================================
// 请求/响应类型
// ============================================================================

export interface CreateTaskRequest {
  description: string;
  type: 'goal' | 'task' | 'query';
  priority?: 'critical' | 'high' | 'medium' | 'low';
  constraints?: Record<string, any>;
}

export interface CreateConversationRequest {
  title?: string;
  source?: string;
  metadata?: Record<string, any>;
}

export interface SendMessageRequest {
  content: string;
  metadata?: Record<string, any>;
}

export interface MemoryQuery {
  query?: string;
  type?: 'episodic' | 'semantic' | 'procedural';
  limit?: number;
}

export interface CreateMemoryRequest {
  type: 'episodic' | 'semantic' | 'procedural';
  content: any;
  importance?: number;
}

export interface UpdateConfigRequest {
  autonomyLevel?: number;
  maxConcurrentTasks?: number;
  autoApproveLowRisk?: boolean;
}

export interface UpdateSettingsRequest {
  language?: string;
  timezone?: string;
  notifications?: Record<string, boolean>;
}
