/**
 * AI Company v3 - Anthropic Provider (Claude)
 */

import type { IProvider, Message, ProviderResponse, ProviderType } from '../types.js';

export class AnthropicProvider implements IProvider {
  private apiKey: string;
  private model: string;
  private baseURL: string;
  private apiVersion = '2024-04-27';
  private averageLatency: number = 0;
  private latencySamples: number[] = [];

  constructor(apiKey: string, model?: string, baseURL?: string) {
    this.apiKey = apiKey;
    this.model = model || 'claude-sonnet-4-20250514';
    this.baseURL = baseURL || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  }

  getType(): ProviderType {
    return 'anthropic';
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

    // 过滤 system 消息，单独传递
    const userMessages = messages.filter(m => m.role !== 'system');
    const system = systemPrompt || messages.find(m => m.role === 'system')?.content as string;

    const body: any = {
      model: this.model,
      max_tokens: 4096,
      messages: userMessages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content
      })),
    };

    // Anthropic 支持独立的 system 参数
    if (system) {
      body.system = system;
    }

    const response = await fetch(`${this.baseURL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.apiVersion,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API failed: ${response.status} ${error}`);
    }

    const data: any = await response.json();

    // 记录延迟
    const latency = Date.now() - startTime;
    this.recordLatency(latency);

    return {
      content: data.content?.[0]?.text || '',
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
      stopReason: data.stop_reason,
    };
  }

  async messagesWithTools(messages: Message[], tools: any[], systemPrompt?: string): Promise<ProviderResponse> {
    const startTime = Date.now();

    const userMessages = messages.filter(m => m.role !== 'system');
    const system = systemPrompt || messages.find(m => m.role === 'system')?.content as string;

    // 转换工具格式为 Anthropic 格式
    const anthropicTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));

    const body: any = {
      model: this.model,
      max_tokens: 4096,
      messages: userMessages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content
      })),
      tools: anthropicTools,
    };

    if (system) {
      body.system = system;
    }

    const httpResponse = await fetch(`${this.baseURL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.apiVersion,
      },
      body: JSON.stringify(body),
    });

    if (!httpResponse.ok) {
      const error = await httpResponse.text();
      throw new Error(`Anthropic API failed: ${httpResponse.status} ${error}`);
    }

    const data: any = await httpResponse.json();
    const latency = Date.now() - startTime;
    this.recordLatency(latency);

    // 解析响应
    const contentBlocks: any[] = [];
    const toolCalls: any[] = [];

    for (const block of data.content || []) {
      if (block.type === 'text') {
        contentBlocks.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input,
        });
        contentBlocks.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }

    const result: any = {
      content: contentBlocks.length > 0 ? contentBlocks : data.content?.[0]?.text || '',
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
      stopReason: data.stop_reason,
      toolCalls,
    };

    // 添加辅助方法
    result.getText = () => {
      if (typeof result.content === 'string') {
        return result.content;
      }
      // 提取文本块
      return result.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
    };

    return result;
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
