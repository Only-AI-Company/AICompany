/**
 * AI Company v3 - Utility Functions
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_BASE_PATH = path.join(__dirname, '../../workspace');

/**
 * 健壮的 JSON 解析
 * 支持：
 * - markdown 代码块（```json, ```）
 * - 前后空白
 * - 单引号/双引号混用
 * - 注释
 */
export function parseJSON(content: string): any {
  let cleaned = content.trim();

  // 移除 markdown 代码块
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  cleaned = cleaned.trim();

  // 尝试直接解析
  try {
    return JSON.parse(cleaned);
  } catch {
    // 尝试修复单引号问题
    try {
      const fixed = cleaned
        .replace(/'/g, '"')
        .replace(/(\w+):/g, '"$1":');
      return JSON.parse(fixed);
    } catch {
      // 尝试提取 JSON 对象
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          throw new Error('Failed to parse JSON');
        }
      }
      throw new Error('No valid JSON found');
    }
  }
}

/**
 * 生成唯一 ID
 */
export function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 安全的 JSON 序列化
 */
export function safeStringify(obj: any, fallback?: string): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return fallback || '{}';
  }
}

export function getWorkspaceBasePath(): string {
  return WORKSPACE_BASE_PATH;
}

export function getTaskWorkspacePath(taskId: string): string {
  return path.join(WORKSPACE_BASE_PATH, 'tasks', taskId);
}

export function getConversationWorkspacePath(conversationId: string): string {
  return path.join(WORKSPACE_BASE_PATH, 'conversations', conversationId);
}

export async function ensureWorkspaceDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function clearWorkspaceDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

export async function removeWorkspaceDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}
