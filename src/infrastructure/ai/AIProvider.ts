/**
 * AI Provider 接口
 * 统一不同 AI 服务的调用方式
 */

import type { ClaudeMessage, ClaudeToolDefinition, ClaudeContentBlock } from '../../types/index.js';

export interface AIProvider {
  /**
   * 发送消息并获取响应
   */
  prompt(prompt: string): Promise<string>;

  /**
   * 发送消息（带历史记录）
   */
  messages(messages: ClaudeMessage[]): Promise<string>;

  /**
   * 发送消息并获取响应（带工具定义）
   */
  messagesWithTools?(
    messages: ClaudeMessage[],
    tools: ClaudeToolDefinition[]
  ): Promise<{ content: ClaudeContentBlock[]; stopReason: string; usage?: { inputTokens: number; outputTokens: number } }>;
}

/**
 * Anthropic Provider
 */
export class AnthropicProvider implements AIProvider {
  private apiKey: string;
  private model: string;
  private maxTokens: number;

  constructor(config: { apiKey: string; model?: string; maxTokens?: number }) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'claude-sonnet-4-5-20250929';
    this.maxTokens = config.maxTokens || 4096;
  }

  async prompt(prompt: string): Promise<string> {
    return this.messages([{ role: 'user', content: prompt }]);
  }

  async messages(messages: ClaudeMessage[]): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API failed: ${response.status} ${error}`);
    }

    const data: any = await response.json();

    return data.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
  }

  /**
   * 发送消息并获取响应（带工具定义）
   */
  async messagesWithTools(
    messages: ClaudeMessage[],
    tools: ClaudeToolDefinition[]
  ): Promise<{ content: ClaudeContentBlock[]; stopReason: string; usage?: { inputTokens: number; outputTokens: number } }> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API failed: ${response.status} ${error}`);
    }

    const data: any = await response.json();

    return {
      content: data.content,
      stopReason: data.stop_reason,
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
    };
  }
}

/**
 * Qwen Provider (通过 DashScope API)
 *
 * 支持两种模式：
 * 1. OpenAI 兼容模式: https://dashscope.aliyuncs.com/compatible-mode/v1 (中国区)
 * 2. OpenAI 兼容模式: https://dashscope-intl.aliyuncs.com/compatible-mode/v1 (国际区)
 *
 * 重要: API Key 必须与 Base URL 的区域匹配！
 * - 中国区 API Key 只能用于 dashscope.aliyuncs.com
 * - 国际区 API Key 只能用于 dashscope-intl.aliyuncs.com
 */
export class QwenProvider implements AIProvider {
  private apiKey: string;
  private model: string;
  private baseURL: string;

  constructor(config: { key: string; model?: string; url?: string }) {
    this.apiKey = config.key;
    this.model = config.model || 'qwen-turbo';
    // 默认使用中国区 (如果用户没有指定)
    this.baseURL = config.url || 'https://dashscope.aliyuncs.com/compatible-mode/v1';

    // 调试输出
    console.log(`🔧 [QwenProvider] 配置:`);
    console.log(`   Base URL: ${this.baseURL}`);
    console.log(`   Model: ${this.model}`);
    console.log(`   API Key: ${this.apiKey.slice(0, 8)}...${this.apiKey.slice(-4)}`);

    // 验证 URL 格式
    if (this.baseURL.includes('aliyuncs.com')) {
      const region = this.baseURL.includes('dashscope-intl') ? '国际区' : '中国区';
      console.log(`   检测到区域: ${region}`);
      console.log(`   ⚠️  请确保 API Key 是${region}创建的！`);
    }
  }

  async prompt(prompt: string): Promise<string> {
    return this.messages([{ role: 'user', content: prompt }]);
  }

  async messages(messages: ClaudeMessage[]): Promise<string> {
    const url = `${this.baseURL}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Qwen API failed: ${response.status}`;

      // 详细的错误提示
      if (response.status === 401) {
        errorMessage += `\n\n❌ 401 认证失败 - 可能的原因:\n`;
        errorMessage += `1. API Key 无效或已过期\n`;
        errorMessage += `2. API Key 区域与 Base URL 不匹配\n`;
        errorMessage += `3. 当前 Base URL: ${this.baseURL}\n`;
        errorMessage += `4. 请检查: https://dashscope.console.aliyun.com/apiKey (中国区)`;
        errorMessage += `          或 https://dashscope-intl.console.aliyun.com/apiKey (国际区)`;
      } else if (response.status === 400) {
        errorMessage += `\n\n❌ 400 请求错误 - 可能的原因:\n`;
        errorMessage += `1. 模型名称错误: ${this.model}\n`;
        errorMessage += `2. 支持的模型: qwen-turbo, qwen-plus, qwen-max, qwen-max-latest`;
      }

      throw new Error(errorMessage + `\n\n原始响应: ${errorText}`);
    }

    const data: any = await response.json();

    return data.choices[0]?.message?.content || '';
  }
}

/**
 * 工厂函数：根据配置创建 Provider
 */
export function createProvider(config: any): AIProvider {
  const type = config.type || 'anthropic';

  switch (type) {
    case 'qwen':
      return new QwenProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

// ============================================================================
// 获取 AI Provider 单例
// ============================================================================

import { getConfigService } from '../config/ConfigService.js';
import { getDatabase } from '../database/index.js';

let providerInstance: AIProvider | null = null;

/**
 * 获取 AI Provider
 *
 * 实时从数据库读取配置（无缓存）
 *
 * 配置方式:
 * 1. 设置默认 provider: ai-company config set ai-provider.api qwen
 * 2. 配置 provider 详情: ai-company config:set qwen '{"key":"sk-...","model":"..."}' -t json -c ai-provider
 */
export function getAIProvider(): AIProvider {
  const db = getDatabase();
  const config = getConfigService(db);

  // 实时从数据库获取默认 provider（无缓存，无默认值）
  const defaultProviderValue = config.get('ai-provider.api');

  if (!defaultProviderValue || typeof defaultProviderValue !== 'string' || !defaultProviderValue.trim()) {
    throw new Error(
      `未配置 AI Provider。\n` +
      `请先配置: ai-company config set ai-provider.api qwen\n` +
      `然后配置: ai-company config:set qwen '{"key":"sk-xxx","model":"..."}' -t json -c ai-provider`
    );
  }

  const defaultProvider = defaultProviderValue.trim();

  // 实时从数据库获取 provider 配置（无缓存）
  let providerConfig = config.get(`ai-provider.${defaultProvider}`);

  // 配置可能是 JSON 字符串，需要解析
  if (typeof providerConfig === 'string') {
    try {
      providerConfig = JSON.parse(providerConfig);
    } catch (e) {
      throw new Error(
        `Provider "${defaultProvider}" 配置格式错误，无法解析 JSON: ${e}`
      );
    }
  }

  if (!providerConfig || typeof providerConfig !== 'object') {
    throw new Error(
      `Provider "${defaultProvider}" 未配置.\n` +
      `请先配置: ai-company config:set ${defaultProvider} \'{"key":"sk-xxx","model":"..."}\' -t json -c ai-provider`
    );
  }

  // 添加 type
  const finalConfig = { ...(providerConfig as any), type: defaultProvider };

  console.log(`🤖 [AIProvider] 使用: ${defaultProvider}, model: ${finalConfig.model || 'default'}`);

  // 每次都创建新的 provider 实例（不使用缓存）
  return createProvider(finalConfig);
}

/**
 * @deprecated 不再使用缓存，此函数已弃用
 */
export function resetAIProvider(): void {
  // 不再需要，因为 getAIProvider 不再使用缓存
}
