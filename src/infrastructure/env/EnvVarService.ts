import type { AIDatabase } from '../database/index.js';
import { getConfigService } from '../config/ConfigService.js';

export type EnvVarType = 'text' | 'filepath';

export interface EnvVarItem {
  key: string;
  value: string;
  type: EnvVarType;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface EnvVarSetOptions {
  value: string;
  type?: EnvVarType;
  description?: string;
}

/**
 * 环境变量服务
 *
 * 支持两种类型：
 * - text: 存储普通文本值
 * - filepath: 存储文件路径（不读取内容，使用时由调用者决定如何处理）
 *
 * 使用示例：
 * ```ts
 * // 存储普通文本
 * envVar.set('API_KEY', { value: 'sk-xxx', type: 'text' });
 *
 * // 存储文件路径
 * envVar.set('PRIVATE_KEY', { value: '/path/to/key.pem', type: 'filepath' });
 *
 * // 使用时根据类型处理
 * const item = envVar.get('PRIVATE_KEY');
 * if (item.type === 'filepath') {
 *   // 读取文件
 *   const content = fs.readFileSync(item.value, 'utf-8');
 *   // 或直接传路径给库
 *   const agent = new HttpsAgent({ key: fs.readFileSync(item.value) });
 * }
 * ```
 */
export class EnvVarService {
  constructor(private db: AIDatabase) {}

  /**
   * 设置环境变量
   * @param key 变量名
   * @param options 配置选项
   */
  set(key: string, options: EnvVarSetOptions): void {
    const type = options.type ?? 'text';
    const value = options.value;

    const config = getConfigService(this.db);
    // EnvVarService 使用 'filepath'，但 ConfigService 存储为 'file'
    const configType = type === 'filepath' ? 'file' : type;

    config.set(key, {
      value,
      type: configType,
      description: options.description,
      category: 'env',
    });
  }

  /**
   * 获取环境变量
   * @param key 变量名
   * @returns 环境变量项，不存在返回 null
   */
  get(key: string): EnvVarItem | null {
    const config = getConfigService(this.db);
    const item = config.getItem(key);
    if (!item || item.category !== 'env') return null;

    // ConfigService 存储为 'file'，转换为 'filepath'
    const normalizedType: EnvVarType = item.type === 'file' ? 'filepath' : 'text';

    return {
      key: item.key,
      value: String(item.value ?? ''),
      type: normalizedType,
      description: item.description,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  /**
   * 列出所有环境变量
   */
  list(): EnvVarItem[] {
    const config = getConfigService(this.db);
    const items = config.getByCategory('env');

    return items.map(item => {
      // ConfigService 存储为 'file'，转换为 'filepath'
      const normalizedType: EnvVarType = item.type === 'file' ? 'filepath' : 'text';

      return {
        key: item.key,
        value: String(item.value ?? ''),
        type: normalizedType,
        description: item.description,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });
  }

  /**
   * 删除环境变量
   */
  delete(key: string): boolean {
    const config = getConfigService(this.db);
    return config.delete(key);
  }

  /**
   * 构建环境变量对象（用于传给子进程等）
   *
   * 注意：filepath 类型会直接使用路径值，不读取文件内容
   * 调用者需要根据类型自行处理
   */
  buildEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    const items = this.list();

    for (const item of items) {
      env[item.key] = item.value;
    }

    return env;
  }

  /**
   * 应用到 process.env
   *
   * 注意：filepath 类型直接使用路径值，不读取文件内容
   */
  applyToProcessEnv(): void {
    const env = this.buildEnv();
    for (const [key, value] of Object.entries(env)) {
      process.env[key] = value;
    }
  }

  /**
   * 获取 filepath 类型变量的文件路径
   * @param key 变量名
   * @returns 文件路径，如果不是 filepath 类型或不存在返回 null
   */
  getFilePath(key: string): string | null {
    const item = this.get(key);
    if (!item || item.type !== 'filepath') return null;
    return item.value;
  }

  /**
   * 获取 text 类型变量的文本值
   * @param key 变量名
   * @returns 文本值，如果不是 text 类型或不存在返回 null
   */
  getText(key: string): string | null {
    const item = this.get(key);
    if (!item || item.type !== 'text') return null;
    return item.value;
  }

  /**
   * 检查变量是否存在
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * 获取所有 filepath 类型的变量
   */
  listFilePaths(): EnvVarItem[] {
    return this.list().filter(item => item.type === 'filepath');
  }

  /**
   * 获取所有 text 类型的变量
   */
  listTexts(): EnvVarItem[] {
    return this.list().filter(item => item.type === 'text');
  }
}

let envVarServiceInstance: EnvVarService | null = null;

export function getEnvVarService(db?: AIDatabase): EnvVarService {
  if (!envVarServiceInstance) {
    if (!db) {
      throw new Error('EnvVarService requires database on first call');
    }
    envVarServiceInstance = new EnvVarService(db);
  }
  return envVarServiceInstance;
}

export function resetEnvVarService(): void {
  envVarServiceInstance = null;
}
