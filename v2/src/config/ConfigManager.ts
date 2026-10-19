/**
 * AI Company v2 - 配置管理
 *
 * 用户配置管理：owner name, workdir, company name, AI 配置
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// 配置类型
// ============================================================================

export interface UserConfig {
  /** 用户名称（系统如何称呼用户） */
  ownerName: string;
  /** 公司名称 */
  companyName: string;
  /** 工作目录（数据保存路径） */
  workdir: string;
  /** AI Provider 配置 */
  aiProvider?: 'anthropic' | 'openai' | 'qwen' | 'kimi' | 'zhipu';
  /** AI Provider 详细配置 */
  anthropic?: {
    apiKey?: string;
    model?: string;
    baseURL?: string;
  };
  qwen?: {
    apiKey?: string;
    model?: string;
    baseURL?: string;
  };
  kimi?: {
    apiKey?: string;
    model?: string;
    baseURL?: string;
  };
}

export interface ConfigStore {
  version: string;
  createdAt: number;
  updatedAt: number;
  config: UserConfig;
}

// ============================================================================
// 配置管理
// ============================================================================

export class ConfigManager {
  private configPath: string;
  private workdir: string;

  constructor() {
    // 默认工作目录
    this.workdir = path.join(os.homedir(), '.ai-company');
    this.configPath = path.join(this.workdir, 'config.json');
  }

  /**
   * 获取或设置工作目录
   */
  getWorkdir(): string {
    return this.workdir;
  }

  setWorkdir(dir: string): void {
    this.workdir = dir;
    this.configPath = path.join(dir, 'config.json');
  }

  /**
   * 初始化工作目录
   */
  initWorkdir(): void {
    if (!fs.existsSync(this.workdir)) {
      fs.mkdirSync(this.workdir, { recursive: true });
      console.log(`[Config] 创建工作目录：${this.workdir}`);
    }
  }

  /**
   * 检查配置是否存在
   */
  exists(): boolean {
    return fs.existsSync(this.configPath);
  }

  /**
   * 读取配置
   */
  read(): ConfigStore | null {
    if (!this.exists()) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(content) as ConfigStore;
    } catch (error) {
      console.error('[Config] 读取配置失败:', error);
      return null;
    }
  }

  /**
   * 保存配置
   */
  save(config: UserConfig): ConfigStore {
    this.initWorkdir();

    const now = Date.now();
    const existing = this.read();

    const store: ConfigStore = {
      version: '2.0.0',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      config,
    };

    fs.writeFileSync(this.configPath, JSON.stringify(store, null, 2), 'utf-8');
    console.log(`[Config] 配置已保存到：${this.configPath}`);

    return store;
  }

  /**
   * 获取配置（如果不存在则返回 null）
   */
  getConfig(): UserConfig | null {
    const store = this.read();
    return store?.config || null;
  }

  /**
   * 初始化配置（交互式）
   */
  async initConfig(): Promise<UserConfig> {
    const inquirer = await import('inquirer');

    console.log('\n========================================');
    console.log('  欢迎使用 AI Company v2');
    console.log('  让我们开始配置您的专属 AI 公司');
    console.log('========================================\n');

    const answers = await inquirer.default.prompt([
      {
        type: 'input',
        name: 'ownerName',
        message: '如何称呼您？（Owner Name）',
        default: os.userInfo().username,
        validate: (input: string) => {
          if (!input.trim()) {
            return '请输入您的名称';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'companyName',
        message: '您的公司名称是什么？',
        default: 'AI Company',
        validate: (input: string) => {
          if (!input.trim()) {
            return '请输入公司名称';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'workdir',
        message: '数据保存路径',
        default: this.workdir,
        validate: (input: string) => {
          if (!input.trim()) {
            return '请输入工作目录路径';
          }
          return true;
        },
      },
      {
        type: 'list',
        name: 'aiProvider',
        message: '您主要使用哪个 AI Provider？',
        choices: [
          { name: 'Anthropic (Claude)', value: 'anthropic' },
          { name: 'OpenAI (GPT-4)', value: 'openai' },
          { name: 'Qwen (通义千问)', value: 'qwen' },
          { name: 'Kimi (月之暗面)', value: 'kimi' },
          { name: 'Zhipu (智谱 AI)', value: 'zhipu' },
        ],
        default: 'anthropic',
      },
    ]);

    const config: UserConfig = {
      ownerName: answers.ownerName.trim(),
      companyName: answers.companyName.trim(),
      workdir: answers.workdir.trim(),
      aiProvider: answers.aiProvider,
    };

    // 更新工作目录
    this.setWorkdir(config.workdir);
    this.initWorkdir();

    // 保存配置
    this.save(config);

    return config;
  }

  /**
   * 复制 .env.example 并提示用户配置
   */
  setupEnvFile(projectRoot: string, aiProvider?: string): void {
    const examplePath = path.join(projectRoot, '.env.example');
    const envPath = path.join(this.workdir, '.env');

    if (fs.existsSync(examplePath) && !fs.existsSync(envPath)) {
      fs.copyFileSync(examplePath, envPath);
      console.log(`\n[Config] 已复制 .env.example 到：${envPath}`);
    } else if (!fs.existsSync(examplePath)) {
      console.warn(`[Config] 警告：找不到 .env.example 文件`);
    }

    // 获取当前配置以确定 AI Provider
    const config = this.getConfig();
    const provider = aiProvider || config?.aiProvider || 'anthropic';

    // Provider 配置映射
    const providerConfigs: Record<string, { key: string; name: string; url?: string }> = {
      anthropic: { key: 'ANTHROPIC_API_KEY', name: 'Anthropic (Claude)' },
      openai: { key: 'OPENAI_API_KEY', name: 'OpenAI (GPT-4)' },
      qwen: { key: 'QWEN_API_KEY', name: 'Qwen (通义千问)' },
      kimi: { key: 'KIMI_API_KEY', name: 'Kimi (月之暗面)' },
      zhipu: { key: 'ZHIPU_API_KEY', name: 'Zhipu (智谱 AI)' },
    };

    const selectedProvider = providerConfigs[provider] || providerConfigs.anthropic;

    console.log('\n========================================');
    console.log('  ⚠️  配置 AI API Key');
    console.log('========================================');
    console.log(`\n您选择的 AI Provider：${selectedProvider.name}`);
    console.log(`\n请编辑以下文件并填入您的 API Key：`);
    console.log(`  ${envPath}`);
    console.log(`\n添加配置：`);
    console.log(`  ${selectedProvider.key}=your_key_here`);

    // 显示可选配置
    if (provider === 'anthropic') {
      console.log(`\n可选配置：`);
      console.log(`  ANTHROPIC_BASE_URL=https://api.anthropic.com  # API 地址`);
      console.log(`  ANTHROPIC_MODEL=claude-sonnet-4-20250514      # 模型`);
    } else if (provider === 'openai') {
      console.log(`\n可选配置：`);
      console.log(`  OPENAI_BASE_URL=https://api.openai.com/v1   # API 地址`);
      console.log(`  OPENAI_MODEL=gpt-4                          # 模型`);
    } else if (provider === 'qwen') {
      console.log(`\n可选配置：`);
      console.log(`  QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`);
      console.log(`  QWEN_MODEL=qwen-max                         # 模型`);
    } else if (provider === 'kimi') {
      console.log(`\n可选配置：`);
      console.log(`  KIMI_BASE_URL=https://api.moonshot.cn/v1    # API 地址`);
      console.log(`  KIMI_MODEL=moonshot-v1-8k                   # 模型`);
    } else if (provider === 'zhipu') {
      console.log(`\n可选配置：`);
      console.log(`  ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4`);
      console.log(`  ZHIPU_MODEL=glm-4                           # 模型`);
    }

    console.log('\n========================================\n');
  }
}

// ============================================================================
// 单例
// ============================================================================

let globalConfigManager: ConfigManager | null = null;

export function getConfigManager(): ConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigManager();
  }
  return globalConfigManager;
}

export function resetConfigManager(): void {
  if (globalConfigManager) {
    globalConfigManager = null;
  }
}
