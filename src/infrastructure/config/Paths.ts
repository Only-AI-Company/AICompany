/**
 * AI Company - Paths Configuration
 *
 * 统一管理所有路径（可配置）
 */

import { join, dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import type { AIDatabase } from '../database/index.js';
import { getConfigService } from './ConfigService.js';

/**
 * 路径配置接口
 */
export interface PathsConfig {
  /** 基础目录（默认 ~/.ai-company） */
  baseDir: string;
  /** 数据库文件 */
  database: string;
  /** 输出目录 */
  outputs: string;
  /** 知识库目录 */
  knowledge: string;
  /** 日志目录 */
  logs: string;
  /** 配置目录 */
  config: string;
}

/**
 * 路径管理器
 */
export class Paths {
  private config: PathsConfig;
  private db: AIDatabase;

  constructor(db: AIDatabase) {
    this.db = db;
    this.config = this.loadConfig();
    this.ensureDirectories();
  }

  /**
   * 从配置加载路径
   */
  private loadConfig(): PathsConfig {
    const configService = getConfigService(this.db);

    // 从配置读取基础目录，否则使用默认值
    const baseDir = configService.get('paths.base_dir') as string ||
      join(homedir(), '.ai-company');

    return {
      baseDir,
      database: join(baseDir, 'data.db'),
      outputs: configService.get('paths.outputs') as string || join(baseDir, 'outputs'),
      knowledge: configService.get('paths.knowledge') as string || join(baseDir, '.knowledge'),
      logs: configService.get('paths.logs') as string || join(baseDir, 'logs'),
      config: configService.get('paths.config') as string || join(baseDir, 'config'),
    };
  }

  /**
   * 确保目录存在
   */
  private ensureDirectories(): void {
    const dirs = [
      this.config.baseDir,
      dirname(this.config.database),
      this.config.outputs,
      this.config.knowledge,
      this.config.logs,
      this.config.config,
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * 获取路径配置
   */
  getConfig(): PathsConfig {
    return { ...this.config };
  }

  /**
   * 获取基础目录
   */
  getBaseDir(): string {
    return this.config.baseDir;
  }

  /**
   * 获取数据库路径
   */
  getDatabasePath(): string {
    return this.config.database;
  }

  /**
   * 获取输出目录（可选：指定子目录）
   */
  getOutputsPath(subPath?: string): string {
    return subPath ? join(this.config.outputs, subPath) : this.config.outputs;
  }

  /**
   * 获取知识库路径
   */
  getKnowledgePath(): string {
    return this.config.knowledge;
  }

  /**
   * 获取日志路径
   */
  getLogsPath(): string {
    return this.config.logs;
  }

  /**
   * 设置基础目录
   */
  setBaseDir(path: string): void {
    const configService = getConfigService(this.db);
    configService.set('paths.base_dir', path);
    this.config = this.loadConfig();
    this.ensureDirectories();
  }

  /**
   * 格式化路径用于显示（将 HOME 替换为 ~）
   */
  formatForDisplay(path: string): string {
    const home = homedir();
    if (path.startsWith(home)) {
      return '~' + path.slice(home.length);
    }
    return path;
  }

  /**
   * 显示路径信息
   */
  display(): void {
    console.log('\n📁 路径配置\n');
    console.log(`  基础目录: ${this.formatForDisplay(this.config.baseDir)}`);
    console.log(`  数据库:   ${this.formatForDisplay(this.config.database)}`);
    console.log(`  输出:     ${this.formatForDisplay(this.config.outputs)}`);
    console.log(`  知识库:   ${this.formatForDisplay(this.config.knowledge)}`);
    console.log(`  日志:     ${this.formatForDisplay(this.config.logs)}`);
    console.log('');
  }
}

// 单例
let pathsInstance: Paths | null = null;

export function getPaths(db?: AIDatabase): Paths {
  if (!pathsInstance) {
    if (!db) {
      throw new Error('Paths requires database on first call');
    }
    pathsInstance = new Paths(db);
  }
  return pathsInstance;
}

export function resetPaths(): void {
  pathsInstance = null;
}
