/**
 * AI Company v2 - 配置服务
 *
 * 管理系统配置，支持多厂商 AI Provider
 */
import { getDatabase } from '../db/Database.js';
import { getEventBus } from './Event.js';
import { EventType } from '../types.js';

/**
 * AI Provider 配置（通用字段）
 */
export interface AIProviderConfig {
  /**
   * API 类型：openai, anthropic, zhipu, kimi, qwen, etc.
   */
  type: 'openai' | 'anthropic' | 'zhipu' | 'kimi' | 'qwen' | 'other';

  /**
   * API URL
   */
  url: string;

  /**
   * API Key 环境变量名（如：ANTHROPIC_API_KEY）
   */
  keyEnvVar: string;

  /**
   * 可用模型列表
   */
  models: string[];

  /**
   * 活跃模型列表（当前使用的模型）
   */
  activeModels: string[];

  /**
   * 模型默认设置
   */
  defaultModel?: string;
}

/**
 * 完整配置结构
 */
export interface AppConfig {
  activeProvider: string;
  providers: Record<string, AIProviderConfig>;
}

/**
 * 配置服务
 */
export class ConfigService {
  private configCache: AppConfig | null = null;
  private readonly CONFIG_NAMESPACE = 'app_config';

  /**
   * 获取配置
   */
  getConfig(): AppConfig {
    if (this.configCache) {
      return this.configCache;
    }

    const db = getDatabase();
    const config = db.getConfig(this.CONFIG_NAMESPACE);

    if (config) {
      this.configCache = config;
      return config;
    }

    return this.getDefaultConfigInternal();
  }

  /**
   * 保存配置
   */
  saveConfig(config: AppConfig): void {
    const db = getDatabase();
    db.setConfig(this.CONFIG_NAMESPACE, config);
    this.configCache = config;

    getEventBus().emit(EventType.CONFIG_UPDATED, { config });
    console.log('[ConfigService] Configuration saved');
  }

  /**
   * 获取活跃的 Provider
   */
  getActiveProvider(): string {
    const config = this.getConfig();
    return config.activeProvider;
  }

  /**
   * 设置活跃的 Provider
   */
  setActiveProvider(providerName: string): boolean {
    const config = this.getConfig();

    if (!config.providers[providerName]) {
      console.error(`[ConfigService] Provider not found: ${providerName}`);
      return false;
    }

    config.activeProvider = providerName;
    this.saveConfig(config);
    console.log(`[ConfigService] Active provider set to: ${providerName}`);
    return true;
  }

  /**
   * 获取 Provider 配置
   */
  getProvider(name: string): AIProviderConfig | null {
    const config = this.getConfig();
    return config.providers[name] || null;
  }

  /**
   * 添加/更新 Provider
   */
  upsertProvider(name: string, provider: AIProviderConfig): void {
    const config = this.getConfig();
    const wasUpdate = config.providers[name] !== undefined;
    config.providers[name] = provider;
    this.saveConfig(config);
    console.log(`[ConfigService] Provider ${name} ${wasUpdate ? 'updated' : 'added'}`);
  }

  /**
   * 删除 Provider
   */
  deleteProvider(name: string): boolean {
    const config = this.getConfig();

    if (name === 'anthropic') {
      console.error('[ConfigService] Cannot delete default provider: anthropic');
      return false;
    }

    if (!config.providers[name]) {
      console.error(`[ConfigService] Provider not found: ${name}`);
      return false;
    }

    if (config.activeProvider === name) {
      config.activeProvider = 'anthropic';
    }

    delete config.providers[name];
    this.saveConfig(config);
    console.log(`[ConfigService] Provider deleted: ${name}`);
    return true;
  }

  /**
   * 列出所有 Provider
   */
  listProviders(): Array<{
    name: string;
    type: string;
    url: string;
    keyEnvVar: string;
    keyMasked: string;
    models: string[];
    activeModels: string[];
    isActive: boolean;
  }> {
    const config = this.getConfig();

    return Object.entries(config.providers).map(([name, provider]) => ({
      name,
      type: provider.type || 'other',
      url: provider.url,
      keyEnvVar: provider.keyEnvVar,
      keyMasked: this.maskKey(provider.keyEnvVar),
      models: provider.models,
      activeModels: provider.activeModels,
      isActive: name === config.activeProvider,
    }));
  }

  /**
   * 获取当前活跃的 Provider 配置
   */
  getActiveProviderConfig(): AIProviderConfig {
    const config = this.getConfig();
    return config.providers[config.activeProvider] || this.getDefaultProviderConfigInternal();
  }

  /**
   * 重置配置为默认值
   */
  reset(): void {
    const defaultConfig = this.getDefaultConfigInternal();
    this.configCache = defaultConfig;
    this.saveConfig(defaultConfig);
    console.log('[ConfigService] Configuration reset to default');
  }

  /**
   * 获取默认 Provider 配置
   */
  getDefaultProviderConfig(): AIProviderConfig {
    const config = this.getConfig();
    return config.providers[config.activeProvider] ||
           config.providers['anthropic'] ||
           this.getDefaultProviderConfigInternal();
  }

  /**
   * 掩码 API Key 显示
   */
  private maskKey(envVar: string): string {
    const value = process.env[envVar];
    if (!value || value.length < 8) {
      return '(not set)';
    }
    return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfigInternal(): AppConfig {
    return {
      activeProvider: 'anthropic',
      providers: {
        anthropic: {
          type: 'anthropic',
          url: 'https://api.anthropic.com',
          keyEnvVar: 'ANTHROPIC_API_KEY',
          models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
          activeModels: ['claude-sonnet-4-20250514'],
          defaultModel: 'claude-sonnet-4-20250514',
        },
      },
    };
  }

  /**
   * 获取默认 Provider 配置（内部）
   */
  private getDefaultProviderConfigInternal(): AIProviderConfig {
    return {
      type: 'anthropic',
      url: 'https://api.anthropic.com',
      keyEnvVar: 'ANTHROPIC_API_KEY',
      models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
      activeModels: ['claude-sonnet-4-20250514'],
      defaultModel: 'claude-sonnet-4-20250514',
    };
  }
}

// 单例
let configServiceInstance: ConfigService | null = null;

export function getConfigService(): ConfigService {
  if (!configServiceInstance) {
    configServiceInstance = new ConfigService();
  }
  return configServiceInstance;
}
