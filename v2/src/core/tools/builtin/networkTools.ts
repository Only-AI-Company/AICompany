/**
 * AI Company v2 - Network Tools
 *
 * 网络相关工具：HTTP 请求、API 调用
 */

import type { Tool, ToolContext, ToolResult } from '../types.js';

// ============================================================================
// HTTP 工具 - 发送 HTTP 请求
// ============================================================================

export const httpTool: Tool = {
  name: 'HTTP',
  description: 'Send HTTP requests (GET, POST, PUT, DELETE, PATCH) and retrieve responses',
  category: 'network',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to send the request to',
        required: true,
      },
      method: {
        type: 'string',
        description: 'HTTP method: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS',
        required: false,
      },
      headers: {
        type: 'object',
        description: 'HTTP headers as key-value pairs',
        required: false,
      },
      body: {
        type: 'string',
        description: 'Request body (for POST, PUT, PATCH)',
        required: false,
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds (default: 30000)',
        required: false,
      },
    },
    required: ['url'],
  },
  enabled: true,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { url, method = 'GET', headers = {}, body, timeout = 30000 } = input;

    try {
      // 使用 fetch 发送请求
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const options: RequestInit = {
        method,
        headers,
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        options.body = body;
      }

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      const responseText = await response.text();
      let responseData: any = responseText;

      // 尝试解析 JSON
      try {
        responseData = JSON.parse(responseText);
      } catch {
        // 不是 JSON，保持原始文本
      }

      return {
        success: true,
        data: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseData,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'HTTP request failed',
      };
    }
  },
};

// ============================================================================
// Fetch 工具 - 简化的 GET 请求
// ============================================================================

export const fetchTool: Tool = {
  name: 'Fetch',
  description: 'Fetch data from a URL (simple GET request)',
  category: 'network',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch from',
        required: true,
      },
      headers: {
        type: 'object',
        description: 'Optional headers',
        required: false,
      },
    },
    required: ['url'],
  },
  enabled: true,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { url, headers = {} } = input;

    try {
      const response = await fetch(url, { headers });
      const data = await response.text();

      let parsedData: any = data;
      try {
        parsedData = JSON.parse(data);
      } catch {}

      return {
        success: true,
        data: {
          status: response.status,
          data: parsedData,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Fetch failed',
      };
    }
  },
};

// ============================================================================
// 导出
// ============================================================================

export function initNetworkTools(registry: any): void {
  registry.register(httpTool);
  registry.register(fetchTool);
  console.log('[NetworkTools] 已注册网络工具');
}
