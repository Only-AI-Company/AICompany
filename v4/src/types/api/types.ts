/**
 * API 层类型定义
 */

import type { WebSocketMessage, TaskStatus, TaskPriority } from '../index';

export type MessageSource = 'telegram' | 'mobile_app' | 'web' | 'cli';

// ============================================================================
// WebSocket 连接
// ============================================================================

export interface WebSocketConnection {
  id: string;
  userId: string;
  source: MessageSource;
  connectedAt: number;
  lastPing: number;
  metadata?: ConnectionMetadata;
}

export interface ConnectionMetadata {
  deviceId?: string;
  appVersion?: string;
  platform?: string;
  chatId?: string;  // Telegram chat ID
}

// ============================================================================
// WebSocket 事件
// ============================================================================

export interface ChatMessage extends WebSocketMessage {
  type: 'chat_message';
  payload: {
    conversationId: string;
    content: string;
    metadata?: Record<string, any>;
  };
}

export interface ChatResponse extends WebSocketMessage {
  type: 'chat_response';
  payload: {
    conversationId: string;
    content: string;
    taskId?: string;
  };
}

export interface TaskEvent extends WebSocketMessage {
  type: 'task_created' | 'task_updated' | 'task_completed';
  payload: {
    taskId: string;
    status: TaskStatus;
    description?: string;
    result?: any;
    timestamp: number;
  };
}

export interface SystemEvent extends WebSocketMessage {
  type: 'system_event';
  payload: {
    eventType: string;
    data: Record<string, any>;
    timestamp: number;
  };
}

export interface ErrorMessage extends WebSocketMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

// ============================================================================
// REST API 请求/响应
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

// ============================================================================
// 认证相关
// ============================================================================

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthPayload {
  userId: string;
  deviceId?: string;
}

export interface DeviceInfo {
  id: string;
  userId: string;
  name: string;
  platform: string;
  appVersion: string;
  lastSeen: number;
  isTrusted: boolean;
}

// ============================================================================
// 会话相关
// ============================================================================

export interface Session {
  id: string;
  userId: string;
  source: MessageSource;
  createdAt: number;
  lastActivity: number;
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  chatId?: string;
  threadId?: string;
  context?: Record<string, any>;
}

// ============================================================================
// 任务相关 API
// ============================================================================

export interface CreateTaskRequest {
  description: string;
  type: 'goal' | 'task' | 'query';
  priority?: TaskPriority;
  constraints?: Record<string, any>;
}

export interface TaskResponse {
  id: string;
  description: string;
  type: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: number;
  updatedAt: number;
  result?: any;
}

// ============================================================================
// 用户相关 API
// ============================================================================

export interface UserProfile {
  id: string;
  name: string;
  settings: UserSettings;
  createdAt: number;
}

export interface UserSettings {
  language: string;
  timezone: string;
  notifications: NotificationSettings;
  autonomyLevel: AutonomyLevel;
}

export interface NotificationSettings {
  telegram: boolean;
  push: boolean;
  email: boolean;
  taskComplete: boolean;
  taskFailed: boolean;
  dailyReport: boolean;
  weeklyReport: boolean;
}

export type AutonomyLevel = 1 | 2 | 3 | 4;

// ============================================================================
// 记忆相关 API
// ============================================================================

export interface MemoryQuery {
  query?: string;
  type?: 'episodic' | 'semantic' | 'procedural';
  limit?: number;
  timeRange?: {
    start: number;
    end: number;
  };
}

export interface MemoryResponse {
  id: string;
  type: string;
  content: any;
  importance: number;
  timestamp: number;
}

// ============================================================================
// 配置相关 API
// ============================================================================

export interface SystemConfig {
  autonomyLevel: AutonomyLevel;
  maxConcurrentTasks: number;
  autoApproveLowRisk: boolean;
  logLevel: string;
}

export interface UpdateConfigRequest {
  autonomyLevel?: AutonomyLevel;
  maxConcurrentTasks?: number;
  autoApproveLowRisk?: boolean;
  logLevel?: string;
}
