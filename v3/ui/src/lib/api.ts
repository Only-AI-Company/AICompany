import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types
export interface SystemStatus {
  engineRunning: boolean;
  activeGoals: number;
  activeTasks: number;
  pendingTasks: number;
  completedTasks: number;
  failedTasks: number;
  activeEmployees: number;
  uptime: number;
  lastUpdateAt: number;
}

export interface Goal {
  id: string;
  description: string;
  timeframe: string;
  status: 'active' | 'completed' | 'failed' | 'paused';
  progress: number;
  created_at: number;
}

export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'scheduled' | 'executing' | 'completed' | 'failed';
  priority: 'critical' | 'high' | 'medium' | 'low';
  employee_id?: string;
  created_at: number;
}

export interface Conversation {
  id: string;
  title: string;
  status: 'active' | 'archived';
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: number;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  skills: string[];
  level: number;
  performance: number;
  satisfaction: number;
}

// API Functions
export const api = {
  // Status
  getStatus: () => apiClient.get<SystemStatus>('/api/status').then(r => r.data),

  // Goals
  getGoals: () => apiClient.get<{ goals: Goal[] }>('/api/goals').then(r => r.data),
  createGoal: (description: string, timeframe?: string) =>
    apiClient.post<{ goal: Goal }>('/api/goals', { description, timeframe }).then(r => r.data),

  // Tasks
  getTasks: () => apiClient.get<{ tasks: Task[] }>('/api/tasks').then(r => r.data),
  createTask: (description: string, priority?: string) =>
    apiClient.post<{ task: Task }>('/api/tasks', { description, priority }).then(r => r.data),

  // Conversations
  getConversations: () => apiClient.get<{ conversations: Conversation[] }>('/api/conversations').then(r => r.data),
  createConversation: (title?: string) =>
    apiClient.post<{ id: string; title: string; createdAt: number }>('/api/conversations', { title }).then(r => r.data),
  getConversation: (id: string) =>
    apiClient.get<{ conversation: Conversation }>(`/api/conversations/${id}`).then(r => r.data),
  getMessages: (id: string, limit?: number) =>
    apiClient.get<{ messages: Message[] }>(`/api/conversations/${id}/messages`, { params: { limit } }).then(r => r.data),
  sendMessage: (id: string, content: string) =>
    apiClient.post<{ message: Message }>(`/api/conversations/${id}/messages`, { content }).then(r => r.data),
  deleteConversation: (id: string) =>
    apiClient.delete(`/api/conversations/${id}`).then(r => r.data),

  // Employees
  getEmployees: () => apiClient.get<{ employees: Employee[] }>('/api/employees').then(r => r.data),

  // Memories
  getEpisodicMemories: () => apiClient.get<{ memories: any[] }>('/api/memories/episodic').then(r => r.data),
  getSemanticMemories: () => apiClient.get<{ memories: any[] }>('/api/memories/semantic').then(r => r.data),

  // Activities
  getActivities: (limit?: number) =>
    apiClient.get<{ activities: any[] }>('/api/activities', { params: { limit } }).then(r => r.data),
};
