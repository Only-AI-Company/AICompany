/**
 * AI Company v3 - Main Entry Point
 *
 * 自主运行的 AI 公司
 */

import { getEngine } from './core/Engine.js';
import { getCEO } from './core/CEO.js';
import { EmployeeFactory } from './core/Employee.js';

// ============================================================================
// Main
// ============================================================================

export class AICCompany {
  private engine = getEngine();
  private ceo = getCEO();

  /**
   * 启动 AI 公司
   */
  async start(): Promise<void> {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║        AI Company v3 - Starting...            ║');
    console.log('╚════════════════════════════════════════════════╝');

    // 启动引擎
    await this.engine.start();

    console.log('\n✓ AI Company is running');
    console.log('✓ Type your input and press Enter');
    console.log('✓ Press Ctrl+C to stop\n');
  }

  /**
   * 停止 AI 公司
   */
  async stop(): Promise<void> {
    console.log('\n[AI Company] Stopping...');

    await this.engine.stop();

    console.log('[AI Company] Stopped');
  }

  /**
   * 处理用户输入
   */
  async handleInput(input: string): Promise<string> {
    return await this.engine.handleUserInput(input);
  }

  /**
   * 获取系统状态
   */
  getStatus() {
    return this.engine.getStatus();
  }

  /**
   * 设置目标
   */
  async setGoal(description: string, timeframe: string): Promise<void> {
    const understanding = await this.ceo.understand(description);

    if (understanding.intentType === 'goal') {
      console.log(`\n[AI Company] Setting goal: ${description}`);
      console.log(`[AI Company] Timeframe: ${timeframe}`);
      // TODO: 创建目标
    } else {
      console.log(`\n[AI Company] This doesn't look like a goal.`);
    }
  }

  /**
   * 创建员工
   */
  createEmployee(name: string, role: string, skills: string[]) {
    return EmployeeFactory.createCustomEmployee(name, role, skills);
  }

  /**
   * 获取默认员工
   */
  getDefaultEmployees() {
    return EmployeeFactory.createDefaultEmployees();
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

export async function main() {
  const company = new AICCompany();

  try {
    await company.start();

    // 简单的 REPL
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', async (data: string) => {
      const input = data.toString().trim();

      if (input === 'exit' || input === 'quit') {
        await company.stop();
        process.exit(0);
      }

      if (input === 'status') {
        console.log('\n[System Status]');
        console.log(JSON.stringify(company.getStatus(), null, 2));
        return;
      }

      if (input) {
        const response = await company.handleInput(input);
        console.log(`\n[Response] ${response}\n`);
      }
    });

  } catch (error: any) {
    console.error('[AI Company] Error:', error);
    process.exit(1);
  }
}

// 如果直接运行这个文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// ============================================================================
// Exports
// ============================================================================

export * from './core/types.js';
export * from './core/Engine.js';
export * from './core/CEO.js';
export * from './core/Employee.js';
export * from './core/GoalManager.js';
export * from './core/Scheduler.js';
export * from './core/utils.js';
export * from './core/ai/index.js';
