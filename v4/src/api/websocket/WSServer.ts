/**
 * WebSocket Server - 通信层核心
 *
 * 负责：
 * - WebSocket 连接管理
 * - 消息路由
 * - 事件推送
 * - 心跳检测
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import type {
  WebSocketConnection,
  ChatResponse,
  TaskEvent,
  SystemEvent,
  MessageSource
} from '../../types/api/types';

export interface WebSocketServerConfig {
  port: number;
  path?: string;
  heartbeatInterval?: number;
  maxConnections?: number;
}

export class WSServer extends EventEmitter {
  private wss: WebSocketServer;
  private connections = new Map<string, WebSocketConnection>();
  private userConnections = new Map<string, Set<string>>(); // userId -> connectionIds
  private websockets = new Map<string, WebSocket>(); // connectionId -> WebSocket instance
  private heartbeatInterval: number;
  private maxConnections: number;
  private logger: pino.Logger;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(config: WebSocketServerConfig) {
    super();
    this.wss = new WebSocketServer({
      port: config.port,
      path: config.path || '/ws'
    });
    this.heartbeatInterval = config.heartbeatInterval || 30000;
    this.maxConnections = config.maxConnections || 100;
    this.logger = pino({ name: 'ws-server' });

    this.setupServer();
    this.startHeartbeat();

    this.logger.info(`WebSocket server started on port ${config.port}`);
  }

  private setupServer(): void {
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      this.logger.error({ error }, 'WebSocket server error');
      this.emit('error', error);
    });
  }

  private handleConnection(ws: WebSocket, req: any): void {
    // 解析连接参数
    const url = new URL(req.url, `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId') || uuidv4();
    const source = (url.searchParams.get('source') as MessageSource) || 'web';
    const deviceId = url.searchParams.get('deviceId') || uuidv4();

    // 创建连接 ID
    const connectionId = uuidv4();

    // 检查连接数限制
    if (this.connections.size >= this.maxConnections) {
      this.sendError(connectionId, 'MAX_CONNECTIONS', 'Too many connections');
      ws.close();
      return;
    }

    // 创建连接
    const connection: WebSocketConnection = {
      id: connectionId,
      userId,
      source,
      connectedAt: Date.now(),
      lastPing: Date.now(),
      metadata: {
        deviceId,
        platform: url.searchParams.get('platform') || undefined,
        appVersion: url.searchParams.get('appVersion') || undefined,
        chatId: url.searchParams.get('chatId') || undefined
      }
    };

    // 存储连接
    this.connections.set(connectionId, connection);
    this.websockets.set(connectionId, ws);
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);

    // 设置 WebSocket 事件处理
    ws.on('message', (data) => this.handleMessage(connectionId, data));
    ws.on('close', () => this.handleClose(connectionId));
    ws.on('error', (error) => this.handleError(connectionId, error));
    ws.on('pong', () => this.handlePong(connectionId));

    // 发送连接成功消息
    this.send(connectionId, {
      type: 'system_event',
      payload: {
        eventType: 'connected',
        data: {
          connectionId,
          userId,
          source,
          timestamp: Date.now()
        }
      }
    });

    this.logger.info({ connectionId, userId, source }, 'New WebSocket connection');
    this.emit('connection', connection);
  }

  private async handleMessage(connectionId: string, data: any): Promise<void> {
    try {
      const message = JSON.parse(data.toString());
      const connection = this.connections.get(connectionId);

      if (!connection) {
        this.logger.warn({ connectionId }, 'Received message for unknown connection');
        return;
      }

      this.logger.debug({ connectionId, message }, 'Received message');

      // 更新最后活动时间
      connection.lastPing = Date.now();

      // 根据消息类型路由
      switch (message.type) {
        case 'chat_message':
          this.emit('chat_message', { connectionId, ...message });
          break;

        case 'ping':
          this.send(connectionId, { type: 'pong', timestamp: Date.now() });
          break;

        case 'subscribe':
          this.handleSubscribe(connectionId, message.payload);
          break;

        default:
          this.logger.warn({ connectionId, type: message.type }, 'Unknown message type');
      }
    } catch (error) {
      this.logger.error({ connectionId, error }, 'Error handling message');
      this.sendError(connectionId, 'PARSE_ERROR', 'Failed to parse message');
    }
  }

  private handleSubscribe(connectionId: string, payload: { events?: string[] }): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const events = payload.events || ['task_updated', 'task_completed', 'system_event'];
    this.logger.info({ connectionId, events }, 'Connection subscribed to events');
  }

  private handleClose(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.websockets.delete(connectionId);
      this.userConnections.get(connection.userId)?.delete(connectionId);
      this.connections.delete(connectionId);

      this.logger.info({ connectionId, userId: connection.userId }, 'Connection closed');
      this.emit('disconnection', connection);
    }
  }

  private handleError(connectionId: string, error: Error): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.logger.error({ connectionId, error }, 'Connection error');
      this.emit('error', { connectionId, error });
    }
  }

  private handlePong(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastPing = Date.now();
    }
  }

  // ============================================================================
  // 消息发送
  // ============================================================================

  /**
   * 发送消息到指定连接
   */
  send(connectionId: string, message: any): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    try {
      const ws = this.getWebSocket(connectionId);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error({ connectionId, error }, 'Error sending message');
      return false;
    }
  }

  /**
   * 发送消息到用户的所有连接
   */
  sendToUser(userId: string, message: any): number {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) return 0;

    let sent = 0;
    for (const connectionId of connectionIds) {
      if (this.send(connectionId, message)) {
        sent++;
      }
    }
    return sent;
  }

  /**
   * 发送消息到指定源的所有连接
   */
  sendToSource(source: MessageSource, message: any): number {
    let sent = 0;
    for (const [connectionId, connection] of this.connections.entries()) {
      if (connection.source === source) {
        if (this.send(connectionId, message)) {
          sent++;
        }
      }
    }
    return sent;
  }

  /**
   * 广播消息到所有连接
   */
  broadcast(message: any): number {
    let sent = 0;
    for (const connectionId of this.connections.keys()) {
      if (this.send(connectionId, message)) {
        sent++;
      }
    }
    return sent;
  }

  // ============================================================================
  // 事件推送
  // ============================================================================

  /**
   * 推送任务事件
   */
  pushTaskEvent(userId: string, taskId: string, status: string, result?: any): void {
    const event: TaskEvent = {
      type: status === 'completed' ? 'task_completed' : 'task_updated',
      payload: {
        taskId,
        status: status as any,
        result,
        timestamp: Date.now()
      }
    };
    this.sendToUser(userId, event);
  }

  /**
   * 推送系统事件
   */
  pushSystemEvent(userId: string, eventType: string, data: any): void {
    const event: SystemEvent = {
      type: 'system_event',
      payload: {
        eventType,
        data,
        timestamp: Date.now()
      }
    };
    this.sendToUser(userId, event);
  }

  /**
   * 推送聊天响应
   */
  pushChatResponse(userId: string, conversationId: string, content: string, taskId?: string): void {
    const message: ChatResponse = {
      type: 'chat_response',
      payload: {
        conversationId,
        content,
        taskId
      }
    };
    this.sendToUser(userId, message);
  }

  // ============================================================================
  // 心跳检测
  // ============================================================================

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const [connectionId, connection] of this.connections.entries()) {
        if (now - connection.lastPing > this.heartbeatInterval * 2) {
          // 超时，关闭连接
          this.logger.warn({ connectionId }, 'Connection timeout');
          this.getWebSocket(connectionId)?.terminate();
        } else if (now - connection.lastPing > this.heartbeatInterval) {
          // 发送 ping
          this.getWebSocket(connectionId)?.ping();
        }
      }
    }, this.heartbeatInterval);
  }

  private getWebSocket(connectionId: string): WebSocket | null {
    return this.websockets.get(connectionId) || null;
  }

  private sendError(connectionId: string, code: string, message: string): void {
    this.send(connectionId, {
      type: 'error',
      payload: { code, message }
    });
  }

  // ============================================================================
  // 连接管理
  // ============================================================================

  /**
   * 获取连接信息
   */
  getConnection(connectionId: string): WebSocketConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * 获取用户的所有连接
   */
  getUserConnections(userId: string): WebSocketConnection[] {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) return [];
    return Array.from(connectionIds)
      .map(id => this.connections.get(id))
      .filter((c): c is WebSocketConnection => c !== undefined);
  }

  /**
   * 获取活跃连接数
   */
  getActiveConnections(): number {
    return this.connections.size;
  }

  /**
   * 获取所有连接统计
   */
  getStats(): {
    totalConnections: number;
    connectionsBySource: Record<string, number>;
    connectionsByUser: number;
  } {
    const bySource: Record<string, number> = {};
    for (const connection of this.connections.values()) {
      bySource[connection.source] = (bySource[connection.source] || 0) + 1;
    }

    return {
      totalConnections: this.connections.size,
      connectionsBySource: bySource,
      connectionsByUser: this.userConnections.size
    };
  }

  /**
   * 关闭服务器
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
      }

      // 关闭所有连接
      for (const connection of this.connections.values()) {
        this.getWebSocket(connection.id)?.close();
      }

      this.wss.close(() => {
        this.logger.info('WebSocket server closed');
        resolve();
      });
    });
  }
}
