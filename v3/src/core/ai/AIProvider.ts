/**
 * AI Company v3 - AI Provider Manager
 *
 * 统一的 LLM API 调用封装
 * 支持多种 AI Provider: Anthropic, Qwen, Kimi, Zhipu, Z.ai
 *
 * 特性：
 * - Provider 优先级队列
 * - 自动故障转移
 * - 健康检查
 * - 自动重试
 */

import dotenv from 'dotenv';
import type { IProvider, Message, ProviderResponse, ProviderConfig, ProviderHealth, ProviderType } from './types.js';
import { AnthropicProvider } from './providers/AnthropicProvider.js';
import { OpenAICompatibleProvider } from './providers/OpenAICompatibleProvider.js';

dotenv.config();

// ============================================================================
// AI Provider Manager
// ============================================================================

export class AIProviderManager {
  private providers: IProvider[] = [];
  private currentProviderIndex = 0;
  private healthStatus: Map<ProviderType, ProviderHealth> = new Map();
  private maxRetries = 3;
  private retryDelay = 1000;

  constructor() {
    this.initializeProviders();
  }

  /**
   * 初始化 Providers（从环境变量）
   */
  private initializeProviders(): void {
    // Anthropic (Claude)
    if (process.env.ANTHROPIC_API_KEY) {
      this.addProvider({
        type: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        baseURL: process.env.ANTHROPIC_BASE_URL,
        priority: 1,
        enabled: true,
      });
    }

    // Qwen (通义千问)
    if (process.env.QWEN_API_KEY) {
      this.addProvider({
        type: 'qwen',
        apiKey: process.env.QWEN_API_KEY,
        model: process.env.QWEN_MODEL || 'qwen-plus',
        baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        priority: 2,
        enabled: true,
      });
    }

    // Z.ai
    if (process.env.ZAI_API_KEY) {
      this.addProvider({
        type: 'zai',
        apiKey: process.env.ZAI_API_KEY,
        model: process.env.ZAI_MODEL || 'glm-4.7',
        baseURL: process.env.ZAI_BASE_URL || 'https://api.z.ai/v1',
        priority: 3,
        enabled: true,
      });
    }

    // Kimi (月之暗面)
    if (process.env.KIMI_API_KEY) {
      this.addProvider({
        type: 'kimi',
        apiKey: process.env.KIMI_API_KEY,
        model: process.env.KIMI_MODEL || 'moonshot-v1-8k',
        baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
        priority: 4,
        enabled: true,
      });
    }

    // Zhipu (智谱)
    if (process.env.ZHIPU_API_KEY) {
      this.addProvider({
        type: 'zhipu',
        apiKey: process.env.ZHIPU_API_KEY,
        model: process.env.ZHIPU_MODEL || 'glm-4',
        baseURL: process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
        priority: 5,
        enabled: true,
      });
    }

    // 按优先级排序
    this.providers.sort((a, b) => {
      const priorityA = this.getProviderPriority(a.getType());
      const priorityB = this.getProviderPriority(b.getType());
      return priorityA - priorityB;
    });

    console.log(`[AIProvider] Initialized ${this.providers.length} providers`);
    for (const provider of this.providers) {
      console.log(`  - ${provider.getType()} (priority: ${this.getProviderPriority(provider.getType())})`);
    }
  }

  /**
   * 添加 Provider
   */
  addProvider(config: ProviderConfig): void {
    let provider: IProvider;

    switch (config.type) {
      case 'anthropic':
        provider = new AnthropicProvider(config.apiKey, config.model, config.baseURL);
        break;
      default:
        provider = new OpenAICompatibleProvider(
          config.type,
          config.apiKey,
          config.model,
          config.baseURL
        );
        break;
    }

    if (config.enabled !== false) {
      this.providers.push(provider);
    }

    // 初始化健康状态
    this.healthStatus.set(config.type, {
      type: config.type,
      healthy: true,
      lastCheck: Date.now(),
      consecutiveFailures: 0,
    });
  }

  /**
   * 调用 prompt API
   */
  async prompt(prompt: string, systemPrompt?: string): Promise<ProviderResponse> {
    return this.withRetry(async (provider) => {
      return provider.prompt(prompt, systemPrompt);
    });
  }

  /**
   * 调用 promptWithTools API
   */
  async promptWithTools(
    prompt: string,
    systemPrompt: string,
    tools: any[]
  ): Promise<ProviderResponse> {
    const messages: Message[] = [
      {
        role: 'user',
        content: prompt,
      },
    ];

    return this.withRetry(async (provider) => {
      if (provider.messagesWithTools) {
        return provider.messagesWithTools(messages, tools, systemPrompt);
      }
      // Fallback: 将工具描述添加到 prompt 中
      const toolDescriptions = tools.map(t =>
        `${t.name}: ${t.description}\nParameters: ${JSON.stringify(t.input_schema)}`
      ).join('\n\n');

      const enhancedPrompt = `${prompt}\n\n可用工具:\n${toolDescriptions}\n\n如果需要使用工具，请在响应中说明工具名称和参数。`;

      return provider.messages(
        [{ role: 'user', content: enhancedPrompt }],
        systemPrompt
      );
    });
  }

  /**
   * 带工具调用结果的继续执行
   */
  async continueWithToolResults(
    previousResponse: ProviderResponse,
    toolResults: string[],
    tools: any[]
  ): Promise<ProviderResponse> {
    // 构建包含工具结果的 messages
    const messages: Message[] = [
      {
        role: 'assistant',
        content: typeof previousResponse.content === 'string'
          ? previousResponse.content
          : JSON.stringify(previousResponse.content),
      },
      {
        role: 'user',
        content: `工具执行结果:\n${toolResults.join('\n')}\n\n请根据工具执行结果继续完成任务。`,
      },
    ];

    return this.withRetry(async (provider) => {
      if (provider.messagesWithTools) {
        return provider.messagesWithTools(messages, tools, undefined);
      }
      return provider.messages(messages, undefined);
    });
  }

  /**
   * 调用 messages API
   */
  async messages(messages: Message[], systemPrompt?: string): Promise<ProviderResponse> {
    return this.withRetry(async (provider) => {
      return provider.messages(messages, systemPrompt);
    });
  }

  /**
   * 调用 messagesWithTools API
   */
  async messagesWithTools(messages: Message[], tools: any[], systemPrompt?: string): Promise<ProviderResponse> {
    return this.withRetry(async (provider) => {
      if (provider.messagesWithTools) {
        return provider.messagesWithTools(messages, tools, systemPrompt);
      }
      // Fallback to messages
      return provider.messages(messages, systemPrompt);
    });
  }

  /**
   * 带重试的执行
   */
  private async withRetry(fn: (provider: IProvider) => Promise<ProviderResponse>): Promise<ProviderResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const provider = this.getNextProvider();

      try {
        const result = await fn(provider);
        // 成功后更新健康状态
        this.updateHealth(provider.getType(), true);
        return result;
      } catch (error: any) {
        lastError = error;
        console.error(`[AIProvider] ${provider.getType()} failed: ${error.message}`);

        // 更新健康状态
        this.updateHealth(provider.getType(), false, error.message);

        // 等待后重试
        if (attempt < this.maxRetries - 1) {
          await this.delay(this.retryDelay * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  /**
   * 获取下一个可用的 Provider
   *
   * 策略：
   * 1. 优先选择健康的 Provider
   * 2. 按优先级排序
   * 3. 跳过连续失败的 Provider
   */
  private getNextProvider(): IProvider {
    // 获取健康的 Provider 列表，按优先级排序
    const healthyProviders = this.providers
      .filter(p => {
        const health = this.healthStatus.get(p.getType());
        return health?.healthy !== false;
      })
      .sort((a, b) => {
        const priorityA = this.getProviderPriority(a.getType());
        const priorityB = this.getProviderPriority(b.getType());
        return priorityA - priorityB;
      });

    if (healthyProviders.length === 0) {
      // 没有健康的 Provider，使用第一个（尝试恢复）
      console.warn('[AIProvider] No healthy providers, using first available');
      return this.providers[0];
    }

    // 从健康的 Provider 中选择（简单的轮询）
    const provider = healthyProviders[this.currentProviderIndex % healthyProviders.length];
    this.currentProviderIndex++;

    return provider;
  }

  /**
   * 更新健康状态
   */
  private updateHealth(type: ProviderType, healthy: boolean, error?: string): void {
    const status = this.healthStatus.get(type);
    if (status) {
      status.healthy = healthy;
      status.lastCheck = Date.now();
      if (healthy) {
        status.consecutiveFailures = 0;
        status.lastError = undefined;
      } else {
        status.consecutiveFailures++;
        status.lastError = error;
      }
    }
  }

  /**
   * 获取 Provider 优先级
   */
  private getProviderPriority(type: ProviderType): number {
    const priorities: Record<ProviderType, number> = {
      'anthropic': 1,
      'qwen': 2,
      'zai': 3,
      'kimi': 4,
      'zhipu': 5,
    };
    return priorities[type] || 99;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ProviderHealth[]> {
    const results: ProviderHealth[] = [];

    for (const provider of this.providers) {
      const healthy = await provider.healthCheck();
      const health: ProviderHealth = {
        type: provider.getType(),
        healthy,
        lastCheck: Date.now(),
        consecutiveFailures: this.healthStatus.get(provider.getType())?.consecutiveFailures || 0,
        latency: provider.getLatency(),
      };
      results.push(health);
    }

    return results;
  }

  /**
   * 获取健康状态
   */
  getHealthStatus(): Map<ProviderType, ProviderHealth> {
    return this.healthStatus;
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton & Helper Functions
// ============================================================================

let providerInstance: AIProviderManager | null = null;

export function getAIProvider(): AIProviderManager {
  if (!providerInstance) {
    providerInstance = new AIProviderManager();
  }
  return providerInstance;
}

export function resetAIProvider(): void {
  providerInstance = null;
}

/**
 * 简化的调用函数（向后兼容）
 */
export async function callWithRetry(
  messages: Message[],
  systemPrompt?: string
): Promise<ProviderResponse> {
  const provider = getAIProvider();
  return provider.messages(messages, systemPrompt);
}
