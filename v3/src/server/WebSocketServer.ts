/**
 * AI Company v3 - WebSocket Server
 *
 * 实时通信服务器
 *
 * 功能：
 * 1. WebSocket 连接管理
 * 2. 消息路由
 * 3. 事件广播
 * 4. 心跳检测
 * 5. 连接认证
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'eventemitter3';
import { getEngine } from '../core/Engine.js';

// ============================================================================
// Types
// ============================================================================

export type WSMessageType =
  | 'chat_message'
  | 'chat_response'
  | 'task_created'
  | 'task_updated'
  | 'task_completed'
  | 'goal_created'
  | 'goal_updated'
  | 'system_status'
  | 'engine_started'
  | 'engine_stopped'
  | 'error'
  | 'auth_required'
  | 'authenticated';

export interface WSMessage {
  type: WSMessageType;
  payload: any;
  conversationId?: string;
  taskId?: string;
  goalId?: string;
}

// ============================================================================
// WebSocket Extensions for Type Safety
// ============================================================================

interface AugmentedWebSocket extends WebSocket {
  isAlive?: boolean;
  isAuthenticated?: boolean;
  clientId?: string;
  _socket?: { remoteAddress?: string; remotePort?: number };
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // 简易 token 认证（生产环境应使用 JWT）
  AUTH_TOKEN: process.env.WS_AUTH_TOKEN || 'ai-company-v3-secret-token',
  HEARTBEAT_INTERVAL: 30000, // 30 秒
};

// ============================================================================
// WebSocket Server
// ============================================================================

export class WSServer extends EventEmitter {
  private wss: WebSocketServer;
  private engine = getEngine();
  private clients = new Set<AugmentedWebSocket>();
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(port: number = 8080) {
    super();
    this.wss = new WebSocketServer({ port });
    this.setupServer();
    this.setupHeartbeat();
    this.subscribeToEngine();

    console.log(`[WebSocket] Server running on port ${port}`);
  }

  /**
   * 设置服务器
   */
  private setupServer(): void {
    this.wss.on('connection', (ws: AugmentedWebSocket, req) => {
      const clientId = this.getClientId(ws);
      ws.clientId = clientId;

      console.log(`[WebSocket] Connection attempt from: ${clientId}`);

      // 验证 token
      const url = req.url;
      const token = this.extractToken(url || '');

      if (!this.validateToken(token)) {
        console.warn(`[WebSocket] Authentication failed for ${clientId}`);
        ws.send(JSON.stringify({
          type: 'auth_required',
          payload: { message: 'Authentication failed. Please provide a valid token.' },
        }));
        ws.close(4001, 'Unauthorized');
        return;
      }

      // 认证通过
      ws.isAuthenticated = true;
      ws.isAlive = true;

      console.log(`[WebSocket] Client authenticated: ${clientId}`);
      this.clients.add(ws);

      // 发送认证成功消息
      this.send(ws, {
        type: 'authenticated',
        payload: {
          message: 'Authentication successful',
          clientId,
        },
      });

      // 广播连接事件
      this.broadcast({
        type: 'system_status',
        payload: {
          message: `Client ${clientId} connected`,
          clientCount: this.clients.size,
        },
      });

      // 发送欢迎消息
      this.send(ws, {
        type: 'system_status',
        payload: {
          message: 'Connected to AI Company v3',
          engineStatus: this.engine.getStatus(),
        },
      });

      ws.on('message', (data) => this.handleMessage(ws, data));
      ws.on('close', () => this.handleClose(ws));
      ws.on('error', (error) => this.handleError(ws, error));
    });
  }

  /**
   * 从 URL 提取 token
   */
  private extractToken(url: string): string | null {
    try {
      const params = new URLSearchParams(url.split('?')[1]);
      return params.get('token');
    } catch {
      return null;
    }
  }

  /**
   * 验证 token
   */
  private validateToken(token: string | null): boolean {
    if (!token) return false;
    return token === CONFIG.AUTH_TOKEN;
  }

  /**
   * 设置心跳检测
   */
  private setupHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, CONFIG.HEARTBEAT_INTERVAL);

    this.wss.on('pong', (ws: WebSocket) => {
      const augmented = ws as AugmentedWebSocket;
      augmented.isAlive = true;
    });
  }

  /**
   * 订阅引擎事件
   */
  private subscribeToEngine(): void {
    this.engine.on('engine.started', () => {
      this.broadcast({
        type: 'engine_started',
        payload: { timestamp: Date.now() },
      });
    });

    this.engine.on('engine.stopped', () => {
      this.broadcast({
        type: 'engine_stopped',
        payload: { timestamp: Date.now() },
      });
    });

    this.engine.on('user.input', (data: any) => {
      this.broadcast({
        type: 'chat_message',
        payload: {
          role: 'user',
          content: data.input,
          conversationId: data.conversationId,
        },
        conversationId: data.conversationId,
      });
    });
  }

  /**
   * 处理接收到的消息
   */
  private async handleMessage(ws: AugmentedWebSocket, data: any): Promise<void> {
    // 检查认证状态
    if (!ws.isAuthenticated) {
      this.send(ws, {
        type: 'auth_required',
        payload: { message: 'Please authenticate first' },
      });
      return;
    }

    try {
      const message: WSMessage = JSON.parse(data.toString());
      const clientId = ws.clientId || 'unknown';

      console.log(`[WebSocket] Received from ${clientId}:`, message.type);

      switch (message.type) {
        case 'chat_message':
          await this.handleChatMessage(ws, message);
          break;

        default:
          console.warn(`[WebSocket] Unknown message type: ${message.type}`);
          this.send(ws, {
            type: 'error',
            payload: { message: `Unknown message type: ${message.type}` },
          });
      }
    } catch (error: any) {
      console.error('[WebSocket] Error handling message:', error.message);
      this.send(ws, {
        type: 'error',
        payload: { message: error.message },
      });
    }
  }

  /**
   * 处理聊天消息
   */
  private async handleChatMessage(ws: AugmentedWebSocket, message: WSMessage): Promise<void> {
    const { content, conversationId } = message.payload;

    if (!content) {
      this.send(ws, {
        type: 'error',
        payload: { message: 'Content is required' },
      });
      return;
    }

    try {
      // 处理引擎输入
      const convId = conversationId || this.engine.getActiveConversation();
      const response = await this.engine.handleUserInput(content, convId);

      // 发送响应
      this.send(ws, {
        type: 'chat_response',
        payload: {
          content,
          response,
          conversationId: convId,
        },
        conversationId: convId,
      });
    } catch (error: any) {
      console.error('[WebSocket] Error processing chat message:', error.message);
      this.send(ws, {
        type: 'error',
        payload: { message: error.message },
      });
    }
  }

  /**
   * 处理客户端关闭
   */
  private handleClose(ws: AugmentedWebSocket): void {
    const clientId = ws.clientId || 'unknown';
    console.log(`[WebSocket] Client disconnected: ${clientId}`);

    this.clients.delete(ws);

    this.broadcast({
      type: 'system_status',
      payload: {
        message: `Client ${clientId} disconnected`,
        clientCount: this.clients.size,
      },
    });
  }

  /**
   * 处理客户端错误
   */
  private handleError(ws: AugmentedWebSocket, error: any): void {
    const clientId = ws.clientId || 'unknown';
    console.error(`[WebSocket] Error for client ${clientId}:`, error.message);
  }

  /**
   * 发送消息到指定客户端
   */
  public send(ws: AugmentedWebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * 广播消息到所有客户端
   */
  public broadcast(message: WSMessage): void {
    const data = JSON.stringify(message);
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  /**
   * 广播到指定会话的所有客户端
   */
  public broadcastToConversation(conversationId: string, message: WSMessage): void {
    const data = JSON.stringify({ ...message, conversationId });
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  /**
   * 获取客户端 ID
   */
  private getClientId(ws: AugmentedWebSocket): string {
    const addr = ws._socket?.remoteAddress || 'unknown';
    const port = ws._socket?.remotePort || 'unknown';
    return `${addr}:${port}`;
  }

  /**
   * 获取连接数
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * 获取已认证连接数
   */
  public getAuthenticatedClientCount(): number {
    return Array.from(this.clients).filter(ws => ws.isAuthenticated).length;
  }

  /**
   * 关闭服务器
   */
  public close(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.clients.forEach((ws) => {
      ws.close();
    });

    this.wss.close(() => {
      console.log('[WebSocket] Server closed');
    });
  }
}

// ============================================================================
// Singleton
// ============================================================================

let wsServerInstance: WSServer | null = null;

export function getWSServer(port?: number): WSServer {
  if (!wsServerInstance) {
    wsServerInstance = new WSServer(port);
  }
  return wsServerInstance;
}

export function resetWSServer(): void {
  if (wsServerInstance) {
    wsServerInstance.close();
    wsServerInstance = null;
  }
}
