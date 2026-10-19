import { EventEmitter } from 'eventemitter3';

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

// Configuration
const WS_AUTH_TOKEN = import.meta.env.VITE_WS_TOKEN || 'ai-company-v3-secret-token';

export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;

  constructor(url: string) {
    super();
    this.url = url;
  }

  connect(): void {
    try {
      // Add auth token to URL
      const wsUrl = new URL(this.url);
      wsUrl.searchParams.set('token', WS_AUTH_TOKEN);

      this.ws = new WebSocket(wsUrl.toString());

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this.reconnectAttempts = 0;
        this.emit('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);

          // Handle auth_required
          if (message.type === 'auth_required') {
            console.error('[WebSocket] Authentication failed:', message.payload.message);
            this.emit('auth_error', message.payload);
            return;
          }

          this.emit('message', message);
          this.emit(message.type, message.payload);
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[WebSocket] Disconnected', event.code, event.reason);
        this.emit('disconnected');

        // Don't reconnect on auth failure
        if (event.code === 4001) {
          console.error('[WebSocket] Authentication failed, not reconnecting');
          this.emit('auth_failed');
          return;
        }

        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        this.emit('error', error);
      };
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[WebSocket] Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.connect(), this.reconnectDelay);
    } else {
      console.error('[WebSocket] Max reconnect attempts reached');
      this.emit('max_reconnect_reached');
    }
  }

  send(message: WSMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send - not connected');
    }
  }

  sendChatMessage(content: string, conversationId?: string): void {
    this.send({
      type: 'chat_message',
      payload: { content, conversationId },
      conversationId,
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Singleton
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(url?: string): WebSocketClient {
  if (!wsClient) {
    const wsUrl = url || `ws://${window.location.hostname}:8080`;
    wsClient = new WebSocketClient(wsUrl);
  }
  return wsClient;
}
