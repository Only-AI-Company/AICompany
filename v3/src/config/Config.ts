/**
 * AI Company v3 - Configuration
 *
 * 配置加载和管理
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Configuration Types
// ============================================================================

export interface EngineConfig {
  loop_interval: number;
  review_interval: number;
  max_concurrent_tasks: number;
  max_task_attempts: number;
  graceful_shutdown_timeout: number;
}

export interface AIProviderConfig {
  api_key: string;
  base_url: string;
  model?: string;
  priority: number;
}

export interface AIConfig {
  default_provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
  providers: Record<string, AIProviderConfig>;
}

export interface DatabaseConfig {
  path: string;
  backup_enabled: boolean;
  backup_interval: number;
  backup_retention: number;
}

export interface LogFileConfig {
  enabled: boolean;
  path: string;
  max_size: string;
  max_files: number;
}

export interface LogConsoleConfig {
  enabled: boolean;
  colorize: boolean;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'pretty' | 'json';
  file: LogFileConfig;
  console: LogConsoleConfig;
}

export interface EmployeePreset {
  name: string;
  role: string;
  skills: string[];
  system_prompt: string;
}

export interface EmployeesConfig {
  default_level: number;
  default_performance: number;
  default_satisfaction: number;
  presets: EmployeePreset[];
}

export interface ToolsConfig {
  enabled: string[];
  bash: {
    timeout: number;
    allowed_commands: string[];
  };
  file: {
    base_path: string;
    max_size: string;
  };
}

export interface Config {
  engine: EngineConfig;
  ai: AIConfig;
  database: DatabaseConfig;
  logging: LoggingConfig;
  employees: EmployeesConfig;
  tools: ToolsConfig;
}

// ============================================================================
// Configuration Loader
// ============================================================================

/**
 * 解析环境变量
 * ${VAR_NAME} → process.env.VAR_NAME
 */
function resolveEnv(value: any): any {
  if (typeof value !== 'string') {
    return value;
  }

  const match = value.match(/^\$\{(.+)\}$/);
  if (!match) {
    return value;
  }

  const envVar = match[1];
  const envValue = process.env[envVar];

  if (envValue === undefined) {
    console.warn(`[Config] Environment variable ${envVar} is not set`);
    return value;
  }

  return envValue;
}

/**
 * 递归解析对象中的环境变量
 */
function resolveEnvRecursive(obj: any): any {
  if (typeof obj === 'string') {
    return resolveEnv(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(resolveEnvRecursive);
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvRecursive(value);
    }
    return result;
  }

  return obj;
}

/**
 * 简单的 YAML 解析器（避免依赖 js-yaml）
 */
function parseYaml(content: string): any {
  const lines = content.split('\n');
  const result: any = {};
  const stack: any[] = [result];
  const indentStack: number[] = [0];

  for (const line of lines) {
    // 跳过空行和注释
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    const indent = line.search(/\S|$/);
    const trimmed = line.trim();

    // 处理列表项
    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2);
      const list: any[] = [];

      // 找到应该添加列表的位置
      while (indentStack.length > 0 && indent <= indentStack[indentStack.length - 1]) {
        indentStack.pop();
        stack.pop();
      }

      const current = stack[stack.length - 1];
      const keys = Object.keys(current);
      if (keys.length === 0) {
        // 没有现有的键，创建新的数组
        const newKey = `item_${Date.now()}`;
        current[newKey] = [parseValue(value)];
      } else {
        const key = keys[keys.length - 1];
        if (Array.isArray(current[key])) {
          current[key].push(parseValue(value));
        } else {
          current[key] = [parseValue(value)];
        }
      }

      continue;
    }

    // 处理键值对
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, colonIndex);
    const valueStr = trimmed.slice(colonIndex + 1).trim();
    const value = parseValue(valueStr);

    // 找到应该添加属性的位置
    while (indentStack.length > 0 && indent <= indentStack[indentStack.length - 1]) {
      indentStack.pop();
      stack.pop();
    }

    const current = stack[stack.length - 1];
    current[key] = value;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      stack.push(value);
      indentStack.push(indent);
    }
  }

  return result;
}

/**
 * 解析值
 */
function parseValue(str: string): any {
  str = str.trim();

  // 空值
  if (str === '' || str === 'null') {
    return null;
  }

  // 布尔值
  if (str === 'true') return true;
  if (str === 'false') return false;

  // 数字
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }
  if (/^\d+\.\d+$/.test(str)) {
    return parseFloat(str);
  }

  // 字符串
  if (str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1);
  }
  if (str.startsWith("'") && str.endsWith("'")) {
    return str.slice(1, -1);
  }

  return str;
}

let configCache: Config | null = null;

/**
 * 加载配置
 */
export function loadConfig(configPath?: string): Config {
  if (configCache) {
    return configCache;
  }

  // 默认配置路径
  const defaultPath = path.join(__dirname, 'config', 'default.yaml');
  const userPath = configPath || path.join(process.cwd(), 'config', 'user.yaml');

  // 加载默认配置
  let config: Config;
  try {
    const content = readFileSync(defaultPath, 'utf8');
    config = parseYaml(content) as Config;
  } catch (error: any) {
    throw new Error(`Failed to load default config: ${error.message}`);
  }

  // 加载用户配置（如果存在）
  if (existsSync(userPath)) {
    try {
      const userContent = readFileSync(userPath, 'utf8');
      const userConfig = parseYaml(userContent) as Partial<Config>;
      config = { ...config, ...userConfig };
      console.log(`[Config] Loaded user config from ${userPath}`);
    } catch (error: any) {
      console.warn(`[Config] Failed to load user config: ${error.message}`);
    }
  }

  // 解析环境变量
  config = resolveEnvRecursive(config) as Config;

  // 验证必需的配置
  validateConfig(config);

  configCache = config;
  console.log('[Config] Configuration loaded successfully');

  return config;
}

/**
 * 验证配置
 */
function validateConfig(config: Config): void {
  // 检查 AI provider 配置
  if (!config.ai.providers[config.ai.default_provider]) {
    throw new Error(`Default provider "${config.ai.default_provider}" not configured`);
  }

  // 检查 API keys
  for (const [name, provider] of Object.entries(config.ai.providers)) {
    if (!provider.api_key || provider.api_key.startsWith('${')) {
      console.warn(`[Config] API key for provider "${name}" is not set`);
    }
  }
}

/**
 * 获取配置（已缓存）
 */
export function getConfig(): Config {
  if (!configCache) {
    return loadConfig();
  }
  return configCache;
}

/**
 * 重置配置缓存
 */
export function resetConfig(): void {
  configCache = null;
}
