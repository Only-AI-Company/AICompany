/**
 * AI Company v3 - OpenAI Compatible Provider
 *
 * 支持：
 * - Qwen (通义千问)
 * - Z.ai
 * - Kimi (月之暗面)
 * - Zhipu (智谱)
 * - 其他 OpenAI 兼容的 API
 */

import type { IProvider, Message, ProviderResponse, ProviderType } from '../types.js';

export class OpenAICompatibleProvider implements IProvider {
  private apiKey: string;
  private model: string;
  private baseURL: string;
  private providerType: ProviderType;
  private averageLatency: number = 0;
  private latencySamples: number[] = [];

  constructor(providerType: ProviderType, apiKey: string, model?: string, baseURL?: string) {
    this.providerType = providerType;
    this.apiKey = apiKey;
    this.model = model || this.getDefaultModel(providerType);
    this.baseURL = baseURL || this.getDefaultBaseURL(providerType);
  }

  private getDefaultModel(type: ProviderType): string {
    const models: Record<ProviderType, string> = {
      'qwen': 'qwen-plus',
      'kimi': 'moonshot-v1-8k',
      'zhipu': 'glm-4',
      'zai': 'glm-4.7',
      'anthropic': 'claude-sonnet-4-20250514',
    };
    return models[type] || 'gpt-3.5-turbo';
  }

  private getDefaultBaseURL(type: ProviderType): string {
    const urls: Record<ProviderType, string> = {
      'qwen': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      'kimi': 'https://api.moonshot.cn/v1',
      'zhipu': 'https://open.bigmodel.cn/api/paas/v4',
      'zai': 'https://api.z.ai/v1',
      'anthropic': 'https://api.anthropic.com/v1',
    };
    return urls[type] || 'https://api.openai.com/v1';
  }

  getType(): ProviderType {
    return this.providerType;
  }

  getLatency(): number {
    return this.averageLatency;
  }

  async prompt(prompt: string, systemPrompt?: string): Promise<ProviderResponse> {
    const messages: Message[] = [{ role: 'user', content: prompt }];
    return this.messages(messages, systemPrompt);
  }

  async messages(messages: Message[], systemPrompt?: string): Promise<ProviderResponse> {
    const startTime = Date.now();

    // OpenAI 格式：system 作为第一条消息
    const formattedMessages = [];

    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }

    formattedMessages.push(...messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      }))
    );

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: formattedMessages,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${this.providerType} API failed: ${response.status} ${error}`);
    }

    const data: any = await response.json();

    // 记录延迟
    const latency = Date.now() - startTime;
    this.recordLatency(latency);

    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
      stopReason: data.choices?.[0]?.finish_reason,
    };
  }

  async messagesWithTools(messages: Message[], tools: any[], systemPrompt?: string): Promise<ProviderResponse> {
    const startTime = Date.now();

    const formattedMessages = [];

    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }

    formattedMessages.push(...messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      }))
    );

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: formattedMessages,
        tools,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${this.providerType} API failed: ${response.status} ${error}`);
    }

    const data: any = await response.json();
    const latency = Date.now() - startTime;
    this.recordLatency(latency);

    // 检查工具调用
    const choice = data.choices?.[0];
    if (choice?.message?.tool_calls) {
      return {
        content: choice.message.content || '',
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
        },
        stopReason: choice.finish_reason,
        toolCalls: choice.message.tool_calls,
      };
    }

    return {
      content: choice?.message?.content || '',
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
      stopReason: choice?.finish_reason,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.prompt('Hello', 'You are a helpful assistant.');
      return response.content.length > 0;
    } catch {
      return false;
    }
  }

  private recordLatency(latency: number): void {
    this.latencySamples.push(latency);
    if (this.latencySamples.length > 10) {
      this.latencySamples.shift();
    }
    this.averageLatency = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
  }
}
