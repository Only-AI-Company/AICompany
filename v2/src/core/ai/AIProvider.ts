/**
 * AI Company v2 - AI Provider
 *
 * 统一的 LLM API 调用封装
 * 支持多种 AI Provider: Anthropic, Qwen, Kimi, etc.
 *
 * 特性：
 * - Provider 优先级队列
 * - 自动故障转移
 * - 健康检查
 * - 自动重试
 * - 熔断器状态持久化
 */

import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// 类型定义
// ============================================================================

// ============================================================================
// 类型定义
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';
export type ProviderType = 'anthropic' | 'qwen' | 'kimi' | 'zhipu';

/**
 * 消息内容块（支持 Tool Use）
 */
export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: any;
}

export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
}

export interface ProviderResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  stopReason?: string;
}

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  model: string;
  baseURL?: string;
  priority?: number; // 优先级 (1 = 最高)
  enabled?: boolean; // 是否启用
}

export interface ProviderHealth {
  type: ProviderType;
  healthy: boolean;
  lastCheck: number;
  consecutiveFailures: number;
  lastError?: string;
  latency?: number;
}

/**
 * 熔断器状态
 */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * 熔断器详细状态
 */
export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  lastStateChange: number;
  halfOpenCalls: number;
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;      // 失败阈值，达到后熔断
  successThreshold: number;      // 半开状态成功阈值，达到后恢复
  timeout: number;               // 熔断后等待时间（ms）后尝试恢复
  halfOpenMaxCalls: number;      // 半开状态最大尝试次数
}

// ============================================================================
// 统一 Provider 接口
// ============================================================================

export interface IProvider {
  prompt(prompt: string, systemPrompt?: string): Promise<ProviderResponse>;
  messages(messages: Message[], systemPrompt?: string): Promise<ProviderResponse>;
  messagesWithTools(messages: Message[], tools: any[], systemPrompt?: string): Promise<ProviderResponse>;
  healthCheck(): Promise<boolean>;
  getLatency(): number;
  getType(): ProviderType;
}

// ============================================================================
// Anthropic Provider (Claude)
// ============================================================================

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
    this.baseURL = baseURL || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';
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
    const system = systemPrompt || messages.find(m => m.role === 'system')?.content;

    const body: any = {
      model: this.model,
      max_tokens: 4096,
      messages: userMessages.map(m => ({
        role: m.role,
        content: m.content
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

    // 过滤 system 消息，单独传递
    const userMessages = messages.filter(m => m.role !== 'system');
    const system = systemPrompt || messages.find(m => m.role === 'system')?.content;

    const body: any = {
      model: this.model,
      max_tokens: 4096,
      messages: userMessages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content,
      })),
      tools,
    };

    // Anthropic 支持独立的 system 参数
    if (system) {
      body.system = typeof system === 'string' ? system : system;
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

    // 返回完整的 content 数组（包含 tool_use 块）
    return {
      content: data.content || [],
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
      stopReason: data.stop_reason,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.apiVersion,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      return response.ok;
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

// ============================================================================
// Qwen Provider (通义千问 - OpenAI 兼容)
// ============================================================================

export class QwenProvider implements IProvider {
  private apiKey: string;
  private model: string;
  private baseURL: string;
  private averageLatency: number = 0;
  private latencySamples: number[] = [];

  constructor(apiKey: string, model?: string, baseURL?: string) {
    this.apiKey = apiKey;
    this.model = model || 'qwen-turbo';
    this.baseURL = baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  }

  getType(): ProviderType {
    return 'qwen';
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

    // Qwen/OpenAI 格式：system 作为第一条消息
    const formattedMessages = [];

    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }

    formattedMessages.push(...messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }))
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
      throw new Error(`Qwen API failed: ${response.status} ${error}`);
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

    // Qwen/OpenAI 格式：system 作为第一条消息，tools 作为独立参数
    const formattedMessages = [];

    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }

    formattedMessages.push(...messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }))
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
      throw new Error(`Qwen API failed: ${response.status} ${error}`);
    }

    const data: any = await response.json();
    const latency = Date.now() - startTime;
    this.recordLatency(latency);

    // 检查工具调用
    const choice = data.choices?.[0];
    if (choice?.message?.tool_calls) {
      return {
        content: choice.message.tool_calls,
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
        },
        stopReason: 'tool_calls',
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
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 10,
        }),
      });
      return response.ok;
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

// ============================================================================
// Kimi Provider (月之暗面 - OpenAI 兼容)
// ============================================================================

export class KimiProvider implements IProvider {
  private apiKey: string;
  private model: string;
  private baseURL = 'https://api.moonshot.cn/v1';
  private averageLatency: number = 0;
  private latencySamples: number[] = [];

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || 'moonshot-v1-8k';
  }

  getType(): ProviderType {
    return 'kimi';
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

    // Kimi 格式：system 作为第一条消息
    const formattedMessages = [];

    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }

    formattedMessages.push(...messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }))
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
      throw new Error(`Kimi API failed: ${response.status} ${error}`);
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

    // Kimi/OpenAI 格式：system 作为第一条消息，tools 作为独立参数
    const formattedMessages = [];

    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }

    formattedMessages.push(...messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }))
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
      throw new Error(`Kimi API failed: ${response.status} ${error}`);
    }

    const data: any = await response.json();
    const latency = Date.now() - startTime;
    this.recordLatency(latency);

    // 检查工具调用
    const choice = data.choices?.[0];
    if (choice?.message?.tool_calls) {
      return {
        content: choice.message.tool_calls,
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
        },
        stopReason: 'tool_calls',
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
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 10,
        }),
      });
      return response.ok;
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

// ============================================================================
// Provider Manager - 多 Provider 管理与自动故障转移
// ============================================================================

/**
 * 熔断器状态
 */
// type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'; // 已导出
// interface CircuitBreakerConfig { ... } // 已导出
// interface CircuitBreakerStatus { ... } // 已导出

interface ProviderEntry {
  provider: IProvider;
  config: ProviderConfig;
  health: ProviderHealth;
  circuitBreaker: CircuitBreakerStatus;
}

/**
 * 默认熔断器配置
 */
const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,           // 5 次连续失败后熔断
  successThreshold: 2,           // 半开状态 2 次成功后恢复
  timeout: 60000,                // 熔断 1 分钟后尝试恢复
  halfOpenMaxCalls: 3,           // 半开状态最多尝试 3 次
};

export class ProviderManager {
  private providers: Map<ProviderType, ProviderEntry> = new Map();
  private priorityOrder: ProviderType[] = [];
  private healthCheckInterval?: NodeJS.Timeout;
  private readonly DEFAULT_HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 分钟
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private circuitBreakerConfig: CircuitBreakerConfig;
  private db: any = null; // 延迟加载 Database

  // 强制恢复相关
  private forcedRecoveryTimer?: NodeJS.Timeout;
  private readonly FORCED_RECOVERY_INTERVAL = 2 * 60 * 1000; // 2 分钟
  private recoveryAttempts: Map<ProviderType, number> = new Map();
  private readonly MAX_FORCED_RECOVERY_ATTEMPTS = 5;

  constructor(configs: ProviderConfig[], circuitBreakerConfig?: Partial<CircuitBreakerConfig>) {
    this.circuitBreakerConfig = {
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      ...circuitBreakerConfig,
    };
    this.initializeProviders(configs);

    // 从数据库恢复熔断器状态
    this.restoreCircuitBreakerStates();

    this.startHealthChecks();
    this.startForcedRecovery();
  }

  /**
   * 获取数据库实例（延迟加载）
   */
  private getDatabase(): any {
    if (!this.db) {
      try {
        const { getDatabase } = require('../../db/Database.js');
        this.db = getDatabase();
      } catch (e) {
        console.warn('[ProviderManager] 无法加载数据库模块，熔断器状态将不会持久化');
      }
    }
    return this.db;
  }

  /**
   * 保存熔断器状态到数据库
   */
  private persistCircuitBreakerState(providerType: ProviderType, state: CircuitBreakerStatus): void {
    try {
      const db = this.getDatabase();
      if (db && db.saveCircuitBreakerState) {
        db.saveCircuitBreakerState(providerType, {
          state: state.state,
          failureCount: state.failureCount,
          successCount: state.successCount,
          lastFailureTime: state.lastFailureTime,
          lastStateChange: state.lastStateChange,
          halfOpenCalls: state.halfOpenCalls,
        });
      }
    } catch (e: any) {
      console.warn(`[ProviderManager] 保存熔断器状态失败: ${e.message}`);
    }
  }

  /**
   * 从数据库恢复熔断器状态
   */
  private restoreCircuitBreakerStates(): void {
    try {
      const db = this.getDatabase();
      if (!db || !db.getAllCircuitBreakerStates) {
        return;
      }

      const savedStates = db.getAllCircuitBreakerStates();
      if (savedStates.size === 0) {
        console.log('[ProviderManager] 没有保存的熔断器状态');
        return;
      }

      let restoredCount = 0;
      for (const [providerType, savedState] of savedStates.entries()) {
        const entry = this.providers.get(providerType as ProviderType);
        if (entry) {
          // 检查保存的状态是否过期（超过 1 小时）
          const timeSinceChange = Date.now() - savedState.lastStateChange;
          if (timeSinceChange > 3600000) {
            console.log(`[ProviderManager] ${providerType} 熔断器状态已过期，重置为 CLOSED`);
            continue;
          }

          // 如果状态是 OPEN，检查是否应该转换到 HALF_OPEN
          if (savedState.state === 'OPEN') {
            const timeSinceChange = Date.now() - savedState.lastStateChange;
            if (timeSinceChange >= this.circuitBreakerConfig.timeout) {
              savedState.state = 'HALF_OPEN';
              savedState.halfOpenCalls = 0;
              savedState.lastStateChange = Date.now();
              console.log(`[ProviderManager] ${providerType} 熔断器: OPEN → HALF_OPEN (从持久化状态恢复)`);
            }
          }

          entry.circuitBreaker = {
            state: savedState.state as CircuitBreakerState,
            failureCount: savedState.failureCount,
            successCount: savedState.successCount,
            lastFailureTime: savedState.lastFailureTime,
            lastStateChange: savedState.lastStateChange,
            halfOpenCalls: savedState.halfOpenCalls,
          };

          restoredCount++;
          console.log(`[ProviderManager] ${providerType} 熔断器状态已恢复: ${savedState.state}`);
        }
      }

      console.log(`[ProviderManager] 恢复了 ${restoredCount} 个熔断器状态`);
    } catch (e: any) {
      console.warn(`[ProviderManager] 恢复熔断器状态失败: ${e.message}`);
    }
  }

  /**
   * 初始化 Providers
   */
  private initializeProviders(configs: ProviderConfig[]): void {
    for (const config of configs) {
      if (config.enabled === false) continue;

      const provider = createProvider(config) as IProvider;

      this.providers.set(config.type, {
        provider,
        config,
        health: {
          type: config.type,
          healthy: true,
          lastCheck: Date.now(),
          consecutiveFailures: 0,
        },
        circuitBreaker: {
          state: 'CLOSED',
          failureCount: 0,
          successCount: 0,
          lastStateChange: Date.now(),
          halfOpenCalls: 0,
        },
      });

      this.priorityOrder.push(config.type);
    }

    // 按优先级排序 (priority 越小越优先)
    this.priorityOrder.sort((a, b) => {
      const entryA = this.providers.get(a);
      const entryB = this.providers.get(b);
      const priorityA = entryA?.config.priority ?? 999;
      const priorityB = entryB?.config.priority ?? 999;
      return priorityA - priorityB;
    });

    console.log(`[ProviderManager] 初始化 ${this.providers.size} 个 Providers: [${this.priorityOrder.join(', ')}]`);
  }

  /**
   * 启动健康检查
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.checkAllProviders();
    }, this.DEFAULT_HEALTH_CHECK_INTERVAL);

    console.log(`[ProviderManager] 健康检查已启动 (间隔: ${this.DEFAULT_HEALTH_CHECK_INTERVAL}ms)`);
  }

  /**
   * 检查所有 Providers 健康状态
   */
  private async checkAllProviders(): Promise<void> {
    const now = Date.now();

    const checkPromises = Array.from(this.providers.values()).map(async (entry) => {
      const startTime = Date.now();
      const healthy = await entry.provider.healthCheck();
      const latency = Date.now() - startTime;

      // 更新健康状态
      entry.health = {
        type: entry.config.type,
        healthy,
        lastCheck: now,
        consecutiveFailures: healthy ? 0 : entry.health.consecutiveFailures + 1,
        latency,
      };

      // 检查是否需要从 OPEN 状态转换到 HALF_OPEN
      if (entry.circuitBreaker.state === 'OPEN') {
        const timeSinceLastChange = now - entry.circuitBreaker.lastStateChange;
        if (timeSinceLastChange >= this.circuitBreakerConfig.timeout) {
          // 转换到 HALF_OPEN 状态
          entry.circuitBreaker.state = 'HALF_OPEN';
          entry.circuitBreaker.lastStateChange = now;
          entry.circuitBreaker.halfOpenCalls = 0;
          console.log(`[ProviderManager] ${entry.config.type} 熔断器: OPEN → HALF_OPEN`);

          // 持久化状态变化（我们知道状态从 OPEN 变为 HALF_OPEN）
          this.persistCircuitBreakerState(entry.config.type, entry.circuitBreaker);
        }
      }

      if (!healthy) {
        console.warn(`[ProviderManager] ${entry.config.type} 健康检查失败 (${entry.health.consecutiveFailures}/${this.MAX_CONSECUTIVE_FAILURES})`);
      }
    });

    await Promise.all(checkPromises);
  }

  /**
   * 获取最佳 Provider (按优先级和健康状态，考虑熔断器状态)
   */
  private getBestProvider(): IProvider | null {
    for (const type of this.priorityOrder) {
      const entry = this.providers.get(type);
      if (!entry) continue;

      // 检查熔断器状态
      const cb = entry.circuitBreaker;
      if (cb.state === 'OPEN') {
        console.log(`[ProviderManager] 跳过 ${type} (熔断器: OPEN)`);
        continue;
      }

      if (cb.state === 'HALF_OPEN' && cb.halfOpenCalls >= this.circuitBreakerConfig.halfOpenMaxCalls) {
        console.log(`[ProviderManager] 跳过 ${type} (熔断器: HALF_OPEN, 达到最大尝试次数)`);
        continue;
      }

      // 检查健康状态
      if (!entry.health.healthy) continue;

      // 检查连续失败次数
      if (entry.health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        console.warn(`[ProviderManager] ${type} 连续失败 ${entry.health.consecutiveFailures} 次，跳过`);
        continue;
      }

      return entry.provider;
    }

    console.error('[ProviderManager] 没有可用的 Provider');
    return null;
  }

  /**
   * 检查并更新熔断器状态（成功时）
   */
  private handleProviderSuccess(entry: ProviderEntry): void {
    const cb = entry.circuitBreaker;
    const oldState = cb.state;

    // 重置强制恢复尝试计数（Provider 已恢复正常）
    this.resetRecoveryAttempts(entry.config.type);

    if (cb.state === 'HALF_OPEN') {
      cb.successCount++;
      cb.halfOpenCalls++;

      // 半开状态达到成功阈值，恢复到 CLOSED
      if (cb.successCount >= this.circuitBreakerConfig.successThreshold) {
        cb.state = 'CLOSED';
        cb.failureCount = 0;
        cb.successCount = 0;
        cb.lastStateChange = Date.now();
        console.log(`[ProviderManager] ${entry.config.type} 熔断器: HALF_OPEN → CLOSED`);

        // 持久化状态变化
        this.persistCircuitBreakerState(entry.config.type, cb);
      }
    } else if (cb.state === 'CLOSED') {
      cb.failureCount = 0;
      cb.successCount = 0;
    }

    // 如果状态发生变化，持久化
    if (oldState !== cb.state) {
      this.persistCircuitBreakerState(entry.config.type, cb);
    }
  }

  /**
   * 检查并更新熔断器状态（失败时）
   */
  private handleProviderFailure(entry: ProviderEntry, error: string): void {
    const cb = entry.circuitBreaker;
    const oldState = cb.state;

    cb.failureCount++;
    cb.lastFailureTime = Date.now();

    if (cb.state === 'HALF_OPEN') {
      // 半开状态失败，直接回到 OPEN
      cb.state = 'OPEN';
      cb.halfOpenCalls = 0;
      cb.lastStateChange = Date.now();
      console.log(`[ProviderManager] ${entry.config.type} 熔断器: HALF_OPEN → OPEN (半开状态失败)`);

      // 持久化状态变化
      this.persistCircuitBreakerState(entry.config.type, cb);
    } else if (cb.state === 'CLOSED') {
      // 检查是否达到熔断阈值
      if (cb.failureCount >= this.circuitBreakerConfig.failureThreshold) {
        cb.state = 'OPEN';
        cb.lastStateChange = Date.now();
        console.log(`[ProviderManager] ${entry.config.type} 熔断器: CLOSED → OPEN (失败次数: ${cb.failureCount})`);

        // 持久化状态变化
        this.persistCircuitBreakerState(entry.config.type, cb);
      }
    }

    // 更新健康状态
    entry.health.consecutiveFailures++;
    entry.health.lastError = error;

    // 如果状态发生变化，持久化
    if (oldState !== cb.state) {
      this.persistCircuitBreakerState(entry.config.type, cb);
    }
  }

  /**
   * 带故障转移的 prompt 调用（使用熔断器）
   */
  async prompt(prompt: string, systemPrompt?: string): Promise<ProviderResponse> {
    const errors: Array<{ type: ProviderType; error: string }> = [];

    for (const type of this.priorityOrder) {
      const entry = this.providers.get(type);
      if (!entry) continue;

      // 检查熔断器状态
      const cb = entry.circuitBreaker;
      if (cb.state === 'OPEN') {
        console.log(`[ProviderManager] 跳过 ${type} (熔断器: OPEN)`);
        continue;
      }

      if (cb.state === 'HALF_OPEN') {
        cb.halfOpenCalls++;
        if (cb.halfOpenCalls > this.circuitBreakerConfig.halfOpenMaxCalls) {
          console.log(`[ProviderManager] 跳过 ${type} (熔断器: HALF_OPEN, 达到最大尝试次数)`);
          continue;
        }
      }

      // 检查健康状态
      if (!entry.health.healthy || entry.health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        console.log(`[ProviderManager] 跳过 ${type} (健康: ${entry.health.healthy}, 失败: ${entry.health.consecutiveFailures})`);
        continue;
      }

      try {
        console.log(`[ProviderManager] 尝试使用 ${type} (熔断器: ${cb.state})...`);
        const result = await entry.provider.prompt(prompt, systemPrompt);

        // 成功：更新熔断器状态
        this.handleProviderSuccess(entry);

        // 更新健康状态
        entry.health.consecutiveFailures = 0;

        console.log(`[ProviderManager] ${type} 成功 (延迟: ${entry.provider.getLatency()}ms, 熔断器: ${cb.state})`);
        return result;
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        errors.push({ type, error: errorMsg });

        // 失败：更新熔断器状态
        this.handleProviderFailure(entry, errorMsg);

        console.warn(`[ProviderManager] ${type} 失败: ${errorMsg} (熔断器: ${cb.state}, 失败计数: ${cb.failureCount})`);
      }
    }

    // 所有 Provider 都失败了
    throw new Error(
      `所有 AI Provider 都失败了:\n${errors.map(e => `  - ${e.type}: ${e.error}`).join('\n')}`
    );
  }

  /**
   * 带故障转移的 messages 调用（使用熔断器）
   */
  async messages(messages: Message[], systemPrompt?: string): Promise<ProviderResponse> {
    const errors: Array<{ type: ProviderType; error: string }> = [];

    for (const type of this.priorityOrder) {
      const entry = this.providers.get(type);
      if (!entry) continue;

      // 检查熔断器状态
      const cb = entry.circuitBreaker;
      if (cb.state === 'OPEN') {
        console.log(`[ProviderManager] 跳过 ${type} (熔断器: OPEN)`);
        continue;
      }

      if (cb.state === 'HALF_OPEN') {
        cb.halfOpenCalls++;
        if (cb.halfOpenCalls > this.circuitBreakerConfig.halfOpenMaxCalls) {
          console.log(`[ProviderManager] 跳过 ${type} (熔断器: HALF_OPEN, 达到最大尝试次数)`);
          continue;
        }
      }

      // 检查健康状态
      if (!entry.health.healthy || entry.health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        console.log(`[ProviderManager] 跳过 ${type} (健康: ${entry.health.healthy}, 失败: ${entry.health.consecutiveFailures})`);
        continue;
      }

      try {
        console.log(`[ProviderManager] 尝试使用 ${type} (熔断器: ${cb.state})...`);
        const result = await entry.provider.messages(messages, systemPrompt);

        // 成功：更新熔断器状态
        this.handleProviderSuccess(entry);

        // 更新健康状态
        entry.health.consecutiveFailures = 0;

        console.log(`[ProviderManager] ${type} 成功 (延迟: ${entry.provider.getLatency()}ms, 熔断器: ${cb.state})`);
        return result;
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        errors.push({ type, error: errorMsg });

        // 失败：更新熔断器状态
        this.handleProviderFailure(entry, errorMsg);

        console.warn(`[ProviderManager] ${type} 失败: ${errorMsg} (熔断器: ${cb.state}, 失败计数: ${cb.failureCount})`);
      }
    }

    // 所有 Provider 都失败了
    throw new Error(
      `所有 AI Provider 都失败了:\n${errors.map(e => `  - ${e.type}: ${e.error}`).join('\n')}`
    );
  }

  /**
   * 获取所有 Providers 健康状态（包括熔断器状态）
   */
  getHealthStatus(): Array<ProviderHealth & { type: ProviderType; circuitBreaker: CircuitBreakerState }> {
    return Array.from(this.providers.values()).map(e => ({
      ...e.health,
      type: e.config.type,
      circuitBreaker: e.circuitBreaker.state,
    }));
  }

  /**
   * 获取熔断器详细状态
   */
  getCircuitBreakerStatus(): Map<ProviderType, CircuitBreakerStatus> {
    const status = new Map<ProviderType, CircuitBreakerStatus>();
    for (const [type, entry] of this.providers.entries()) {
      status.set(type, { ...entry.circuitBreaker });
    }
    return status;
  }

  /**
   * 手动重置指定 Provider 的熔断器
   */
  resetCircuitBreaker(providerType: ProviderType): void {
    const entry = this.providers.get(providerType);
    if (entry) {
      const oldState = entry.circuitBreaker.state;
      entry.circuitBreaker = {
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        lastStateChange: Date.now(),
        halfOpenCalls: 0,
      };
      console.log(`[ProviderManager] ${providerType} 熔断器已手动重置`);

      // 持久化状态变化
      if (oldState !== 'CLOSED') {
        this.persistCircuitBreakerState(providerType, entry.circuitBreaker);
      }
    }
  }

  /**
   * 手动触发健康检查
   */
  async manualHealthCheck(): Promise<void> {
    await this.checkAllProviders();
  }

  /**
   * 启动强制恢复机制
   *
   * 定期尝试恢复处于 OPEN 状态的 Provider，即使超时时间未到
   * 这防止了所有 Provider 同时失败后无法恢复的情况
   */
  private startForcedRecovery(): void {
    this.forcedRecoveryTimer = setInterval(async () => {
      await this.attemptForcedRecovery();
    }, this.FORCED_RECOVERY_INTERVAL);

    console.log(`[ProviderManager] 强制恢复机制已启动 (间隔: ${this.FORCED_RECOVERY_INTERVAL}ms)`);
  }

  /**
   * 尝试强制恢复熔断器
   *
   * 对于处于 OPEN 状态的 Provider，即使超时时间未到，也会尝试健康检查
   * 如果健康检查通过，则将状态切换到 HALF_OPEN
   */
  private async attemptForcedRecovery(): Promise<void> {
    const now = Date.now();
    let recoveredCount = 0;

    for (const [type, entry] of this.providers) {
      const cb = entry.circuitBreaker;

      // 只处理 OPEN 状态的熔断器
      if (cb.state !== 'OPEN') {
        continue;
      }

      // 获取当前恢复尝试次数
      const attempts = this.recoveryAttempts.get(type) || 0;

      // 检查是否超过最大尝试次数
      if (attempts >= this.MAX_FORCED_RECOVERY_ATTEMPTS) {
        console.warn(`[ProviderManager] ${type} 强制恢复次数已达上限，停止自动恢复`);
        continue;
      }

      // 检查是否已经过了基本的冷却时间（至少 30 秒）
      const timeSinceLastChange = now - cb.lastStateChange;
      if (timeSinceLastChange < 30000) {
        continue;
      }

      console.log(`[ProviderManager] 🔄 尝试强制恢复 ${type} (尝试 ${attempts + 1}/${this.MAX_FORCED_RECOVERY_ATTEMPTS})`);

      // 执行健康检查
      try {
        const isHealthy = await entry.provider.healthCheck();

        if (isHealthy) {
          // 健康检查通过，切换到 HALF_OPEN 状态
          cb.state = 'HALF_OPEN';
          cb.lastStateChange = now;
          cb.halfOpenCalls = 0;
          cb.failureCount = Math.max(0, cb.failureCount - 1); // 减少失败计数

          console.log(`[ProviderManager] ✅ ${type} 强制恢复成功，熔断器: OPEN → HALF_OPEN`);

          // 持久化状态变化
          this.persistCircuitBreakerState(type, cb);

          // 重置恢复尝试计数
          this.recoveryAttempts.set(type, 0);
          recoveredCount++;
        } else {
          // 健康检查失败，增加恢复尝试计数
          this.recoveryAttempts.set(type, attempts + 1);
          console.log(`[ProviderManager] ❌ ${type} 强制恢复失败 (尝试 ${attempts + 1})`);
        }
      } catch (error: any) {
        // 健康检查出错，增加恢复尝试计数
        this.recoveryAttempts.set(type, attempts + 1);
        console.warn(`[ProviderManager] ❌ ${type} 强制恢复出错: ${error.message}`);
      }
    }

    if (recoveredCount > 0) {
      console.log(`[ProviderManager] 强制恢复: ${recoveredCount} 个 Provider 已恢复`);
    }
  }

  /**
   * 重置所有 Provider 的恢复尝试计数
   *
   * 当 Provider 成功完成请求后，应该重置其恢复计数
   */
  private resetRecoveryAttempts(providerType: ProviderType): void {
    this.recoveryAttempts.delete(providerType);
  }

  /**
   * 停止健康检查
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    if (this.forcedRecoveryTimer) {
      clearInterval(this.forcedRecoveryTimer);
      this.forcedRecoveryTimer = undefined;
    }
  }
}

// ============================================================================
// 单例 ProviderManager
// ============================================================================

let globalProviderManager: ProviderManager | null = null;

/**
 * 获取 ProviderManager 单例
 */
export function getProviderManager(): ProviderManager {
  if (!globalProviderManager) {
    // 从配置文件和环境变量读取配置
    const configs: ProviderConfig[] = [];

    // 尝试从配置文件读取
    try {
      const { getConfigManager } = require('../config/ConfigManager.js');
      const configManager = getConfigManager();
      const userConfig = configManager.getConfig();

      if (userConfig?.aiProvider === 'anthropic' && userConfig.anthropic?.apiKey) {
        configs.push({
          type: 'anthropic',
          apiKey: userConfig.anthropic.apiKey,
          model: userConfig.anthropic.model || 'claude-sonnet-4-20250514',
          baseURL: userConfig.anthropic.baseURL,
          priority: 1,
          enabled: true,
        });
      } else if (userConfig?.aiProvider === 'qwen' && userConfig.qwen?.apiKey) {
        configs.push({
          type: 'qwen',
          apiKey: userConfig.qwen.apiKey,
          model: userConfig.qwen.model || 'qwen-turbo',
          baseURL: userConfig.qwen.baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          priority: 1,
          enabled: true,
        });
      } else if (userConfig?.aiProvider === 'kimi' && userConfig.kimi?.apiKey) {
        configs.push({
          type: 'kimi',
          apiKey: userConfig.kimi.apiKey,
          model: userConfig.kimi.model || 'moonshot-v1-8k',
          priority: 1,
          enabled: true,
        });
      }
    } catch {
      // 配置文件读取失败，忽略
    }

    // 从环境变量读取（作为 fallback）
    if (configs.length === 0) {
      // Anthropic (优先级 1)
      if (process.env.ANTHROPIC_API_KEY) {
        configs.push({
          type: 'anthropic',
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
          baseURL: process.env.ANTHROPIC_BASE_URL,
          priority: 1,
          enabled: true,
        });
      }

      // Qwen (优先级 2)
      if (process.env.QWEN_API_KEY) {
        configs.push({
          type: 'qwen',
          apiKey: process.env.QWEN_API_KEY,
          model: process.env.QWEN_MODEL || 'qwen-turbo',
          baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          priority: 2,
          enabled: true,
        });
      }

      // Kimi (优先级 3)
      if (process.env.KIMI_API_KEY) {
        configs.push({
          type: 'kimi',
          apiKey: process.env.KIMI_API_KEY,
          model: process.env.KIMI_MODEL || 'moonshot-v1-8k',
          priority: 3,
          enabled: true,
        });
      }
    }

    if (configs.length === 0) {
      throw new Error('没有配置任何 AI Provider (请运行 ai-company init 配置)');
    }

    globalProviderManager = new ProviderManager(configs);
  }

  return globalProviderManager;
}

/**
 * 重置 ProviderManager (用于测试)
 */
export function resetProviderManager(): void {
  if (globalProviderManager) {
    globalProviderManager.shutdown();
    globalProviderManager = null;
  }
}

// ============================================================================
// Factory: 根据配置创建 Provider
// ============================================================================

export function createProvider(config: ProviderConfig): IProvider {
  switch (config.type) {
    case 'anthropic':
      return new AnthropicProvider(config.apiKey, config.model, config.baseURL);
    case 'qwen':
      return new QwenProvider(config.apiKey, config.model, config.baseURL);
    case 'kimi':
      return new KimiProvider(config.apiKey, config.model);
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}

// ============================================================================
// 默认 Provider - 从环境变量读取
// ============================================================================

let cachedProvider: AnthropicProvider | QwenProvider | KimiProvider | null = null;
let cachedProviderType: string | null = null;

function getDefaultProviderType(): ProviderConfig['type'] {
  const envType = process.env.AI_PROVIDER_TYPE || 'anthropic';
  if (['anthropic', 'qwen', 'kimi'].includes(envType)) {
    return envType as ProviderConfig['type'];
  }
  return 'anthropic';
}

/**
 * 获取 AI Provider
 *
 * 支持运行时切换 Provider（通过 resetProvider）
 */
export function getProvider(): AnthropicProvider | QwenProvider | KimiProvider {
  const currentType = getDefaultProviderType();

  // 如果 Provider 类型改变，重新创建
  if (cachedProvider && cachedProviderType !== currentType) {
    cachedProvider = null;
  }

  if (cachedProvider) {
    return cachedProvider;
  }

  switch (currentType) {
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
      const baseURL = process.env.ANTHROPIC_BASE_URL;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not set in environment');
      }
      cachedProvider = new AnthropicProvider(apiKey, model, baseURL);
      break;
    }
    case 'qwen': {
      const apiKey = process.env.QWEN_API_KEY;
      const model = process.env.QWEN_MODEL || 'qwen-turbo';
      const baseURL = process.env.QWEN_BASE_URL;
      if (!apiKey) {
        throw new Error('QWEN_API_KEY not set in environment');
      }
      cachedProvider = new QwenProvider(apiKey, model, baseURL);
      break;
    }
    case 'kimi': {
      const apiKey = process.env.KIMI_API_KEY;
      const model = process.env.KIMI_MODEL || 'moonshot-v1-8k';
      if (!apiKey) {
        throw new Error('KIMI_API_KEY not set in environment');
      }
      cachedProvider = new KimiProvider(apiKey, model);
      break;
    }
  }

  cachedProviderType = currentType;
  return cachedProvider!;
}

/**
 * 重置 Provider 缓存（用于测试或切换配置）
 */
export function resetProvider(): void {
  cachedProvider = null;
  cachedProviderType = null;
}

/**
 * 带重试的 Provider 调用
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const initialDelay = options?.initialDelay ?? 1000;
  const maxDelay = options?.maxDelay ?? 10000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // 最后一次尝试失败，抛出错误
      if (attempt === maxRetries) {
        break;
      }

      // 计算延迟（指数退避 + 抖动）
      const delay = Math.min(
        initialDelay * Math.pow(2, attempt),
        maxDelay
      ) + Math.random() * 100;

      console.log(`[AIProvider] 重试 #${attempt + 1}/${maxRetries}，等待 ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
