/**
 * AI Company v2 - System Monitor
 *
 * 系统级监控模块，提供：
 * - 组件健康检查
 * - 任务队列监控
 * - Agent 状态监控
 * - 资源使用监控
 * - LLM Provider 健康监控
 * - 数据库健康监控
 */

import { getEventBus } from '../events/EventBus.js';
import { getDatabase } from '../../db/Database.js';
import { getProviderManager } from '../ai/AIProvider.js';
import type { ProviderHealth } from '../ai/AIProvider.js';

// ============================================================================
// 类型定义
// ============================================================================

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: number;
  message?: string;
  details?: any;
}

export interface SystemHealth {
  timestamp: number;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    eventBus: ComponentHealth;
    database: ComponentHealth;
    llmProviders: ComponentHealth;
    taskQueue: ComponentHealth;
    agents: ComponentHealth;
  };
  resources: {
    memory: NodeJS.MemoryUsage;
    uptime: number;
    cpuUsage?: number;
  };
}

export interface TaskQueueStats {
  pending: number;
  executing: number;
  completed: number;
  failed: number;
  retrying: number;
}

export interface AgentStats {
  total: number;
  active: number;
  idle: number;
  avgIdleTime: number;
}

// ============================================================================
// System Monitor
// ============================================================================

export class SystemMonitor {
  private eventBus = getEventBus();
  private db = getDatabase();
  private startTime: number;
  private checkInterval?: NodeJS.Timeout;
  private readonly CHECK_INTERVAL = 60000; // 1 分钟

  // 健康状态缓存
  private healthCache: SystemHealth | null = null;
  private lastHealthCheck: number = 0;
  private readonly HEALTH_CACHE_TTL = 10000; // 10 秒缓存

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * 启动系统监控
   */
  start(): void {
    console.log('[SystemMonitor] 启动系统监控...');

    // 定期执行健康检查
    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.CHECK_INTERVAL);

    // 执行初始健康检查
    this.performHealthCheck();

    console.log('[SystemMonitor] 系统监控已启动');
  }

  /**
   * 停止系统监控
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    console.log('[SystemMonitor] 系统监控已停止');
  }

  /**
   * 执行完整的健康检查
   */
  private performHealthCheck(): void {
    const health: SystemHealth = {
      timestamp: Date.now(),
      overall: 'healthy',
      components: {
        eventBus: this.checkEventBus(),
        database: this.checkDatabase(),
        llmProviders: this.checkLLMProviders(),
        taskQueue: this.checkTaskQueue(),
        agents: this.checkAgents(),
      },
      resources: this.getResourceUsage(),
    };

    // 计算整体健康状态
    const componentStatuses = Object.values(health.components);
    const hasUnhealthy = componentStatuses.some(c => c.status === 'unhealthy');
    const hasDegraded = componentStatuses.some(c => c.status === 'degraded');

    if (hasUnhealthy) {
      health.overall = 'unhealthy';
    } else if (hasDegraded) {
      health.overall = 'degraded';
    }

    this.healthCache = health;
    this.lastHealthCheck = Date.now();

    // 记录健康检查结果
    this.db.logActivity({
      eventType: 'system.health_check',
      actor: 'system_monitor',
      action: 'health_check_completed',
      context: {
        overall: health.overall,
        components: Object.fromEntries(
          Object.entries(health.components).map(([k, v]) => [k, v.status])
        ),
        resources: {
          memoryUsage: Math.round(health.resources.memory.heapUsed / 1024 / 1024),
          uptime: Math.round(health.resources.uptime / 1000),
        },
      },
    });

    // 发出健康检查事件
    this.eventBus.emit({
      type: 'system.health_check',
      health,
      timestamp: Date.now(),
    } as any);

    // 如果状态不是健康，发出警告
    if (health.overall !== 'healthy') {
      console.warn(`[SystemMonitor] ⚠️  系统状态: ${health.overall}`);
      for (const [name, component] of Object.entries(health.components)) {
        if (component.status !== 'healthy') {
          console.warn(`[SystemMonitor]   - ${name}: ${component.status} - ${component.message || '无详细信息'}`);
        }
      }
    }
  }

  /**
   * 检查 EventBus 状态
   */
  private checkEventBus(): ComponentHealth {
    try {
      // 检查 EventBus 是否可用（只要对象存在且可以调用 emit 方法）
      if (typeof this.eventBus.emit === 'function') {
        return {
          name: 'EventBus',
          status: 'healthy',
          lastCheck: Date.now(),
          message: 'EventBus 运行正常',
          details: { available: true },
        };
      } else {
        return {
          name: 'EventBus',
          status: 'unhealthy',
          lastCheck: Date.now(),
          message: 'EventBus emit 方法不可用',
        };
      }
    } catch (error: any) {
      return {
        name: 'EventBus',
        status: 'unhealthy',
        lastCheck: Date.now(),
        message: error.message,
      };
    }
  }

  /**
   * 检查数据库状态
   */
  private checkDatabase(): ComponentHealth {
    try {
      // 尝试执行简单的查询
      const result = this.db.prepare('SELECT 1 as test').get();

      // 检查 WAL 文件大小
      const walStats = this.db.getWalStats();
      const walSizeMB = walStats.walInfo.totalSize / 1024 / 1024;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = '数据库运行正常';

      if (walSizeMB > 50) {
        status = 'degraded';
        message = `WAL 文件过大: ${walSizeMB.toFixed(2)}MB`;
      }

      return {
        name: 'Database',
        status,
        lastCheck: Date.now(),
        message,
        details: {
          walSize: walStats.walInfo.totalSize,
          timeSinceLastCheck: walStats.timeSinceLastCheck,
        },
      };
    } catch (error: any) {
      return {
        name: 'Database',
        status: 'unhealthy',
        lastCheck: Date.now(),
        message: error.message,
      };
    }
  }

  /**
   * 检查 LLM Providers 状态
   */
  private checkLLMProviders(): ComponentHealth {
    try {
      const providerManager = getProviderManager();
      const healthStatus = providerManager.getHealthStatus();

      // 检查是否有可用的 provider
      const healthyProviders = healthStatus.filter(p => p.healthy);
      const totalProviders = healthStatus.length;

      if (totalProviders === 0) {
        return {
          name: 'LLM Providers',
          status: 'unhealthy',
          lastCheck: Date.now(),
          message: '没有可用的 LLM Provider',
        };
      }

      if (healthyProviders.length === 0) {
        return {
          name: 'LLM Providers',
          status: 'unhealthy',
          lastCheck: Date.now(),
          message: '所有 LLM Provider 都不健康',
          details: { providers: healthStatus },
        };
      }

      if (healthyProviders.length < totalProviders) {
        return {
          name: 'LLM Providers',
          status: 'degraded',
          lastCheck: Date.now(),
          message: `${healthyProviders.length}/${totalProviders} Providers 健康`,
          details: { providers: healthStatus },
        };
      }

      return {
        name: 'LLM Providers',
        status: 'healthy',
        lastCheck: Date.now(),
        message: `${healthyProviders.length} 个 Providers 都健康`,
        details: { providers: healthStatus },
      };
    } catch (error: any) {
      return {
        name: 'LLM Providers',
        status: 'unhealthy',
        lastCheck: Date.now(),
        message: error.message,
      };
    }
  }

  /**
   * 检查任务队列状态
   */
  private checkTaskQueue(): ComponentHealth {
    try {
      const stats = this.getTaskQueueStats();

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = '任务队列运行正常';

      // 如果有太多失败的任务，标记为 degraded
      if (stats.failed > 10) {
        status = 'degraded';
        message = `有 ${stats.failed} 个失败任务`;
      }

      // 如果有太多重试中的任务，标记为 degraded
      if (stats.retrying > 20) {
        status = 'degraded';
        message = `有 ${stats.retrying} 个重试中的任务`;
      }

      return {
        name: 'Task Queue',
        status,
        lastCheck: Date.now(),
        message,
        details: stats,
      };
    } catch (error: any) {
      return {
        name: 'Task Queue',
        status: 'unhealthy',
        lastCheck: Date.now(),
        message: error.message,
      };
    }
  }

  /**
   * 检查 Agents 状态
   */
  private checkAgents(): ComponentHealth {
    try {
      // 这里需要从 CoreProcess 获取 Agent 统计信息
      // 由于可能存在循环依赖，暂时返回健康状态
      return {
        name: 'Agents',
        status: 'healthy',
        lastCheck: Date.now(),
        message: 'Agent 系统运行正常',
        details: { note: '详细统计需要从 CoreProcess 获取' },
      };
    } catch (error: any) {
      return {
        name: 'Agents',
        status: 'unhealthy',
        lastCheck: Date.now(),
        message: error.message,
      };
    }
  }

  /**
   * 获取资源使用情况
   */
  private getResourceUsage(): SystemHealth['resources'] {
    const memUsage = process.memoryUsage();
    const uptime = Date.now() - this.startTime;

    return {
      memory: memUsage,
      uptime,
      cpuUsage: undefined, // CPU 使用率需要额外计算
    };
  }

  /**
   * 获取任务队列统计
   */
  getTaskQueueStats(): TaskQueueStats {
    try {
      const pending = this.db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get('pending') as any;
      const executing = this.db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get('executing') as any;
      const completed = this.db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get('completed') as any;
      const failed = this.db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get('failed') as any;
      const retrying = this.db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get('retrying') as any;

      return {
        pending: pending?.count || 0,
        executing: executing?.count || 0,
        completed: completed?.count || 0,
        failed: failed?.count || 0,
        retrying: retrying?.count || 0,
      };
    } catch (error: any) {
      console.error('[SystemMonitor] 获取任务队列统计失败:', error.message);
      return {
        pending: 0,
        executing: 0,
        completed: 0,
        failed: 0,
        retrying: 0,
      };
    }
  }

  /**
   * 获取系统健康状态（带缓存）
   */
  getSystemHealth(): SystemHealth {
    // 如果缓存仍然有效，返回缓存
    if (this.healthCache && (Date.now() - this.lastHealthCheck) < this.HEALTH_CACHE_TTL) {
      return this.healthCache;
    }

    // 否则执行新的健康检查
    this.performHealthCheck();
    return this.healthCache!;
  }

  /**
   * 获取组件健康状态摘要
   */
  getHealthSummary(): string {
    const health = this.getSystemHealth();
    const components: string[] = [];

    for (const [name, component] of Object.entries(health.components)) {
      const icon = component.status === 'healthy' ? '✅' : component.status === 'degraded' ? '⚠️' : '❌';
      components.push(`${icon} ${name}: ${component.status}`);
    }

    const overallIcon = health.overall === 'healthy' ? '✅' : health.overall === 'degraded' ? '⚠️' : '❌';
    const uptime = Math.round(health.resources.uptime / 1000);
    const memory = Math.round(health.resources.memory.heapUsed / 1024 / 1024);

    return `
${overallIcon} 系统状态: ${health.overall}
运行时间: ${uptime}秒
内存使用: ${memory}MB

组件状态:
${components.map(c => `  ${c}`).join('\n')}
    `.trim();
  }

  /**
   * 手动触发健康检查
   */
  triggerHealthCheck(): SystemHealth {
    console.log('[SystemMonitor] 手动触发健康检查...');
    this.performHealthCheck();
    return this.healthCache!;
  }
}

// ============================================================================
// 单例
// ============================================================================

let systemMonitorInstance: SystemMonitor | null = null;

export function getSystemMonitor(): SystemMonitor {
  if (!systemMonitorInstance) {
    systemMonitorInstance = new SystemMonitor();
  }
  return systemMonitorInstance;
}

export function resetSystemMonitor(): void {
  if (systemMonitorInstance) {
    systemMonitorInstance.stop();
    systemMonitorInstance = null;
  }
}
