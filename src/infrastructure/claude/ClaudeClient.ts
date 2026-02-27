/**
 * AI Company - Claude Client
 *
 * 封装 Anthropic Claude API (兼容其他 provider 如 Qwen)
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ClaudeMessage, ClaudeResponse, ClaudeConfig } from '../../types/index.js';

export class ClaudeClient {
  private client: Anthropic | null = null;
  private config: ClaudeConfig & { baseURL?: string };

  constructor(config: ClaudeConfig = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      model: config.model || 'claude-sonnet-4-5-20250929',
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature || 0.7,
      baseURL: (config as any).baseURL,
    };

    if (!this.config.apiKey) {
      throw new Error('API Key is required');
    }

    // 只有在没有自定义 baseURL 时才使用 Anthropic SDK
    if (!this.config.baseURL) {
      this.client = new Anthropic({
        apiKey: this.config.apiKey,
      });
    }
  }

  /**
   * 发送消息并返回响应
   */
  async messages(messages: ClaudeMessage[]): Promise<ClaudeResponse> {
    // 如果有自定义 baseURL (如 qwen)，使用 fetch
    if (this.config.baseURL) {
      return this.messagesWithFetch(messages);
    }

    // 使用 Anthropic SDK
    if (!this.client) {
      throw new Error('Anthropic client not initialized');
    }

    const response = await this.client.messages.create({
      model: this.config.model!,
      max_tokens: this.config.maxTokens!,
      temperature: this.config.temperature,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    return {
      content: response.content.map(b => b.type === 'text' ? b.text : '').join(''),
      stopReason: response.stop_reason || undefined,
      usage: response.usage ? {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      } : undefined,
    };
  }

  /**
   * 使用 fetch 调用兼容 Anthropic API 的服务 (如 Qwen)
   */
  private async messagesWithFetch(messages: ClaudeMessage[]): Promise<ClaudeResponse> {
    const response = await fetch(`${this.config.baseURL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${response.status} ${error}`);
    }

    const data: any = await response.json();

    // 处理不同的响应格式
    let content = '';

    if (typeof data.content === 'string') {
      // 直接返回字符串（某些 provider 格式）
      content = data.content;
    } else if (Array.isArray(data.content)) {
      // Anthropic 格式：content 是数组
      content = data.content
        .map((b: any) => b.type === 'text' ? b.text : '')
        .join('');
    } else if (data.choices && data.choices[0]) {
      // OpenAI 格式：choices[0].message.content
      content = data.choices[0].message.content || '';
    } else {
      throw new Error(`Unknown API response format: ${JSON.stringify(data).slice(0, 200)}`);
    }

    return {
      content,
      stopReason: data.stop_reason,
      usage: data.usage ? {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      } : undefined,
    };
  }

  /**
   * 发送消息并期望 JSON 响应
   */
  async messagesJSON<T>(messages: ClaudeMessage[]): Promise<T> {
    const jsonMessage: ClaudeMessage = {
      role: 'user',
      content: messages[messages.length - 1].content + '\n\n请返回 JSON 格式，不要包含任何其他文字。',
    };

    const response = await this.messages([...messages, jsonMessage]);
    const jsonStr = response.content.trim();

    // 尝试提取 JSON（可能被 ```json 包裹）
    const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from response');
    }

    return JSON.parse(jsonMatch[1] || jsonMatch[0]);
  }

  /**
   * 发送单个提示词
   */
  async prompt(prompt: string): Promise<string> {
    return this.messages([{ role: 'user', content: prompt }])
      .then(r => r.content);
  }

  /**
   * 发送单个提示词并期望 JSON 响应
   */
  async promptJSON<T>(prompt: string): Promise<T> {
    return this.messagesJSON<T>([{ role: 'user', content: prompt }]);
  }
}

// 单例
let clientInstance: ClaudeClient | null = null;
export function getClaudeClient(config?: ClaudeConfig): ClaudeClient {
  if (!clientInstance) {
    clientInstance = new ClaudeClient(config);
  }
  return clientInstance;
}
