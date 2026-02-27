/**
 * AI Company v2 - AI Provider
 *
 * 调用 LLM API，适配多厂商
 */
import { getConfigService } from '../core/Config.js';
import { getEventBus, EventType } from '../core/Event.js';

export class AIProvider {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor() {
    const configService = getConfigService();
    const provider = configService.getActiveProviderConfig();

    // 获取 API Key（从环境变量）
    this.apiKey = this.getEnvVarValue(provider.keyEnvVar);

    // 构建 base URL
    this.baseURL = provider.url;
    this.model = provider.activeModels[0] || provider.models[0] || 'gpt-4';

    if (!this.apiKey) {
      throw new Error(`API key not found. Set ${provider.keyEnvVar} environment variable.`);
    }
  }

  /**
   * 从环境变量读取值
   */
  private getEnvVarValue(envVar: string): string {
    if (!envVar) return '';
    const value = process.env[envVar];
    if (value === undefined) {
      throw new Error(`Environment variable ${envVar} not found. Set ${envVar} environment variable.`);
    }
    return value;
  }

  /**
   * 生成文本
   */
  async generate(prompt: string, options?: {
    temperature?: number;
    maxTokens?: number;
    outputFormat?: 'text' | 'json';
    model?: string;
  }): Promise<string> {
    // 从配置获取活跃的 provider
    const configService = getConfigService();
    const activeProvider = configService.getActiveProviderConfig();

    const provider = activeProvider.type;
    const model = options?.model || activeProvider.activeModels[0] || activeProvider.models[0] || 'gpt-4';
    const temperature = options?.temperature || 0.7;
    const maxTokens = options?.maxTokens || 4096;

    let url: string;
    let headers: Record<string, string>;

    // 根据 provider 类型选择 URL 和 headers
    switch (provider) {
      case 'anthropic':
        url = `${activeProvider.url}/v1/messages`;
        headers = {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        };
        break;

      case 'openai':
        url = `${activeProvider.url}/chat/completions`;
        headers = {
          'Authorization': `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        };
        break;

      case 'zhipu':
        // 智谱 AI 使用 OpenAI 兼容 API
        url = `${activeProvider.url}/chat/completions`;
        headers = {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        };
        break;

      case 'kimi':
        // Kimi 使用 OpenAI 兼容 API
        url = `${activeProvider.url}/chat/completions`;
        headers = {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        };
        break;

      case 'qwen':
        // 通义千问使用 OpenAI 兼容 API
        url = `${activeProvider.url}/chat/completions`;
        headers = {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        };
        break;

      default:
        url = `${activeProvider.url}/chat/completions`;
        headers = {
          'Authorization': `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        };
    }

    const body = {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: temperature,
      ...(options?.outputFormat === 'json' && ['anthropic', 'openai', 'qwen'].includes(provider) && {
        response_format: { type: 'json_object' },
      }),
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${provider}): ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return this.extractResponseData(data, provider);
    } catch (error: any) {
      console.error('[AI] Generation error:', error.message);
      throw error;
    }
  }

  /**
   * 从响应数据中提取文本
   */
  private extractResponseData(data: any, provider: string): string {
    switch (provider) {
      case 'anthropic':
        return data.content?.[0]?.text || '';
      case 'openai':
      case 'zhipu':
      case 'kimi':
      case 'qwen':
        return data.choices?.[0]?.message?.content || '';
      default:
        return data.choices?.[0]?.message?.content || '';
    }
  }

  /**
   * 监听配置更新，重建 AI Provider
   */
  start(): void {
    getEventBus().on(EventType.CONFIG_UPDATED, async () => {
      console.log('[AIProvider] Configuration updated, reloading AI provider...');
      // 重新创建 AI Provider 实例
      Object.defineProperty(this.constructor, 'instance', {
        value: new AIProvider(),
      });
    });
  }
}

// 单例（使用缓存）
let aiProviderInstance: AIProvider | null = null;

export async function getAIProvider(): Promise<AIProvider> {
  if (!aiProviderInstance) {
    aiProviderInstance = new AIProvider();
    // 监听配置更新
    getEventBus().on(EventType.CONFIG_UPDATED, () => {
      console.log('[AIProvider] Configuration updated, clearing cache...');
      aiProviderInstance = null;  // 清除缓存，下次获取时重建
    });
  }
  return aiProviderInstance;
}
