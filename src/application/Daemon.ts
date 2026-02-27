/**
 * AI Company Daemon
 *
 * 持续运行的主循环，等待需求并自动处理
 */

import type { AIDatabase } from '../infrastructure/database/index.js';
import { Orchestrator } from '../core/agents/Orchestrator.js';

export interface Demand {
  source: 'cli' | 'telegram' | 'web';
  content: string;
  userId?: string;
  timestamp: number;
}

export class Daemon {
  private isRunning = false;
  private demands: Demand[] = [];
  private orchestrator: Orchestrator;

  constructor(private db: AIDatabase) {
    this.orchestrator = new Orchestrator(db);
  }

  /**
   * 启动守护进程
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Daemon 已经在运行');
      return;
    }

    this.isRunning = true;
    console.log('\n🏢 AI Company Daemon 启动');
    console.log('   等待需求...\n');

    // 主循环
    while (this.isRunning) {
      // 等待需求
      const demand = await this.waitForDemand();

      if (demand) {
        await this.processDemand(demand);
      }

      // 避免忙等待
      await this.sleep(100);
    }
  }

  /**
   * 停止守护进程
   */
  stop(): void {
    console.log('\n🛑 Daemon 正在停止...');
    this.isRunning = false;
  }

  /**
   * 添加需求到队列
   */
  addDemand(demand: Demand): void {
    this.demands.push(demand);
    console.log(`📨 新需求 [${demand.source}]: ${demand.content.substring(0, 50)}...`);
  }

  /**
   * 等待需求（非阻塞）
   */
  private async waitForDemand(): Promise<Demand | null> {
    if (this.demands.length > 0) {
      return this.demands.shift()!;
    }
    return null;
  }

  /**
   * 处理需求
   */
  private async processDemand(demand: Demand): Promise<void> {
    try {
      console.log(`\n🔄 处理需求 [${demand.source}]`);
      console.log(`   ${demand.content}\n`);

      // 调用 Orchestrator 处理
      const result = await this.orchestrator.processRequirement(demand.content);

      console.log(`✅ 需求处理完成`);
      console.log(`   工作流: ${result.workflowId}`);
      console.log(`   状态: ${result.status}`);
    } catch (error: any) {
      console.error(`❌ 处理需求时出错: ${error.message}`);
    }
  }

  /**
   * 延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
