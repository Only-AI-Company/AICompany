/**
 * AI Company v3 - REST API Service
 *
 * RESTful API 服务器
 *
 * 端点：
 * - GET    /api/status              - 系统状态
 * - GET    /api/goals               - 目标列表
 * - POST   /api/goals               - 创建目标
 * - GET    /api/tasks               - 任务列表
 * - POST   /api/tasks               - 创建任务
 * - GET    /api/conversations       - 会话列表
 * - POST   /api/conversations       - 创建会话
 * - GET    /api/conversations/:id   - 获取会话
 * - GET    /api/conversations/:id/messages - 消息历史
 * - POST   /api/conversations/:id/messages - 发送消息
 * - GET    /api/employees           - 员工列表
 * - GET    /api/memories/episodic   - 情景记忆
 * - GET    /api/memories/semantic   - 语义记忆
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { getEngine } from '../core/Engine.js';
import { getDatabase } from '../core/database/index.js';
import { generateId } from '../core/utils.js';

// ============================================================================
// Configuration - Input Validation Limits
// ============================================================================

const LIMITS = {
  MAX_DESCRIPTION_LENGTH: 1000,
  MAX_TITLE_LENGTH: 200,
  MAX_CONTENT_LENGTH: 10000,
  MAX_MESSAGES_LIMIT: 100,
  MAX_ACTIVITIES_LIMIT: 100,
};

const VALID_TIMEFRAMES = ['7 天', '14 天', '30 天', '1 个月', '3 个月', '6 个月', '1 年', '永久', 'ongoing'];

const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'];

// ============================================================================
// Sanitization Helper
// ============================================================================

/**
 * Sanitize string input to prevent XSS
 * Basic sanitization - for production, use a library like DOMPurify
 */
function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

/**
 * Validate string input
 */
function validateString(input: unknown, fieldName: string, maxLength: number): { valid: boolean; error?: string; value?: string } {
  if (typeof input !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: `${fieldName} cannot be empty` };
  }

  if (trimmed.length > maxLength) {
    return { valid: false, error: `${fieldName} must be less than ${maxLength} characters` };
  }

  return { valid: true, value: sanitizeInput(trimmed) };
}

// ============================================================================
// API Service
// ============================================================================

export class ApiService {
  private app: express.Application;
  private engine = getEngine();
  private port: number;

  constructor(port: number = 3000) {
    this.app = express();
    this.port = port;

    // 中间件
    this.app.use(cors());
    this.app.use(express.json({ limit: '1mb' })); // Limit body size
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Request logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`[API] ${req.method} ${req.path}`);
      next();
    });

    // Error handling middleware
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('[API] Error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    });

    // 设置路由
    this.setupRoutes();

    console.log(`[API] Service configured on port ${port}`);
  }

  /**
   * 设置路由
   */
  private setupRoutes(): void {
    // 健康检查
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // 系统状态
    this.app.get('/api/status', (req: Request, res: Response) => {
      try {
        const status = this.engine.getStatus();
        res.json(status);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // ========== Goals ==========
    this.app.get('/api/goals', async (req: Request, res: Response) => {
      try {
        const db = await getDatabase();
        const goals = db.getAllGoals();
        res.json({ goals });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/goals', async (req: Request, res: Response) => {
      try {
        // Validate description
        const descValidation = validateString(req.body.description, 'Description', LIMITS.MAX_DESCRIPTION_LENGTH);
        if (!descValidation.valid) {
          return res.status(400).json({ error: descValidation.error });
        }

        // Validate timeframe
        if (req.body.timeframe && !VALID_TIMEFRAMES.includes(req.body.timeframe)) {
          return res.status(400).json({
            error: `Invalid timeframe. Must be one of: ${VALID_TIMEFRAMES.join(', ')}`,
          });
        }

        const description = descValidation.value;
        const timeframe = req.body.timeframe || '30 天';

        await this.engine.handleUserInput(`设置目标：${description}`, undefined);

        const db = await getDatabase();
        const goals = db.getActiveGoals();
        const goal = goals[goals.length - 1];

        res.json({ goal });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // ========== Tasks ==========
    this.app.get('/api/tasks', async (req: Request, res: Response) => {
      try {
        const db = await getDatabase();
        const tasks = db.getAllTasks();
        res.json({ tasks });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/tasks', async (req: Request, res: Response) => {
      try {
        // Validate description
        const descValidation = validateString(req.body.description, 'Description', LIMITS.MAX_DESCRIPTION_LENGTH);
        if (!descValidation.valid) {
          return res.status(400).json({ error: descValidation.error });
        }

        // Validate priority
        if (req.body.priority && !VALID_PRIORITIES.includes(req.body.priority)) {
          return res.status(400).json({
            error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`,
          });
        }

        const description = descValidation.value;
        const priority = req.body.priority || 'medium';

        await this.engine.handleUserInput(`创建任务：${description}`, undefined);

        const db = await getDatabase();
        const tasks = db.getAllTasks();
        const task = tasks[tasks.length - 1];

        res.json({ task });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // ========== Conversations ==========
    this.app.get('/api/conversations', async (req: Request, res: Response) => {
      try {
        const db = await getDatabase();
        const conversations = db.getAllConversations();
        res.json({ conversations });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/conversations', async (req: Request, res: Response) => {
      try {
        const titleValidation = validateString(req.body.title, 'Title', LIMITS.MAX_TITLE_LENGTH);
        if (req.body.title && !titleValidation.valid) {
          return res.status(400).json({ error: titleValidation.error });
        }

        const db = await getDatabase();

        const id = generateId('conv');
        const now = Date.now();

        db.insertConversation({
          id,
          title: titleValidation.value || `会话 ${new Date().toLocaleString()}`,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });

        this.engine.setActiveConversation(id);

        res.json({
          id,
          title: titleValidation.value,
          createdAt: now,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/conversations/:id', async (req: Request, res: Response) => {
      try {
        const id = req.params.id as string;
        const db = await getDatabase();
        const conversation = db.getConversation(id);

        if (!conversation) {
          return res.status(404).json({ error: 'Conversation not found' });
        }

        res.json({ conversation });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/conversations/:id/messages', async (req: Request, res: Response) => {
      try {
        const id = req.params.id as string;
        let limit = parseInt(req.query.limit as string) || 50;

        // Validate limit
        if (isNaN(limit) || limit < 1) {
          limit = 50;
        }
        if (limit > LIMITS.MAX_MESSAGES_LIMIT) {
          limit = LIMITS.MAX_MESSAGES_LIMIT;
        }

        const db = await getDatabase();
        const messages = db.getMessages(id, limit);

        res.json({ messages });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/conversations/:id/messages', async (req: Request, res: Response) => {
      try {
        const id = req.params.id as string;

        // Validate content
        const contentValidation = validateString(req.body.content, 'Content', LIMITS.MAX_CONTENT_LENGTH);
        if (!contentValidation.valid) {
          return res.status(400).json({ error: contentValidation.error });
        }

        const content = contentValidation.value;

        if (!content) {
          return res.status(400).json({ error: 'Content is required' });
        }

        // 设置当前会话
        this.engine.setActiveConversation(id);

        // 处理输入
        const response = await this.engine.handleUserInput(content, id);

        // 获取保存的消息 - 获取最新的 assistant 消息
        const db = await getDatabase();
        const allMessages = db.getMessages(id, 50);

        // 找到最后一条 assistant 消息（最新回复）
        const lastAssistantMessage = [...allMessages]
          .reverse()
          .find((m: any) => m.role === 'assistant' && m.content !== response);

        // 如果找不到已保存的消息，使用响应内容创建新消息
        let assistantMessage;
        if (lastAssistantMessage) {
          assistantMessage = lastAssistantMessage;
        } else {
          // 创建新消息对象
          const messages = db.getMessages(id, 2);
          assistantMessage = messages.length > 0 ? messages[messages.length - 1] : null;
          if (!assistantMessage || assistantMessage.role !== 'assistant') {
            assistantMessage = {
              id: generateId('msg'),
              conversation_id: id,
              role: 'assistant',
              content: response,
              created_at: Date.now(),
            };
          }
        }

        res.json({
          message: assistantMessage || {
            id: generateId('msg'),
            role: 'assistant',
            content: response,
            createdAt: Date.now(),
          },
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/conversations/:id', async (req: Request, res: Response) => {
      try {
        const id = req.params.id as string;
        const db = await getDatabase();

        db.deleteMessages(id);
        db.deleteConversation(id);

        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // ========== Employees ==========
    this.app.get('/api/employees', async (req: Request, res: Response) => {
      try {
        const db = await getDatabase();
        const employees = db.getAllEmployees();
        res.json({ employees });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // ========== Memories ==========
    this.app.get('/api/memories/episodic', async (req: Request, res: Response) => {
      try {
        const db = await getDatabase();
        const memories = db.getAllEpisodicMemories();
        res.json({ memories });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/memories/semantic', async (req: Request, res: Response) => {
      try {
        const db = await getDatabase();
        const memories = db.getAllSemanticMemories();
        res.json({ memories });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // ========== Activities ==========
    this.app.get('/api/activities', async (req: Request, res: Response) => {
      try {
        let limit = parseInt(req.query.limit as string) || 50;

        // Validate limit
        if (isNaN(limit) || limit < 1) {
          limit = 50;
        }
        if (limit > LIMITS.MAX_ACTIVITIES_LIMIT) {
          limit = LIMITS.MAX_ACTIVITIES_LIMIT;
        }

        const db = await getDatabase();
        const activities = db.getRecentActivities(limit);
        res.json({ activities });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  /**
   * 启动 API 服务
   */
  public start(): void {
    this.app.listen(this.port, () => {
      console.log(`[API] Server running on http://localhost:${this.port}`);
    });
  }

  /**
   * 停止 API 服务
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      console.log('[API] Stopping...');
      resolve();
    });
  }
}

// ============================================================================
// Singleton
// ============================================================================

let apiServiceInstance: ApiService | null = null;

export function getApiService(port?: number): ApiService {
  if (!apiServiceInstance) {
    apiServiceInstance = new ApiService(port);
  }
  return apiServiceInstance;
}

export function resetApiService(): void {
  if (apiServiceInstance) {
    apiServiceInstance.stop();
    apiServiceInstance = null;
  }
}
