/**
 * AI Company v3 - Server Entry Point
 *
 * 启动 WebSocket 和 REST API 服务器
 */

import { getWSServer } from './WebSocketServer.js';
import { getApiService } from './ApiService.js';
import { getEngine } from '../core/Engine.js';
import { getDatabase } from '../core/database/index.js';

// ============================================================================
// Configuration
// ============================================================================

const WS_PORT = parseInt(process.env.WS_PORT || '8080', 10);
const API_PORT = parseInt(process.env.API_PORT || '3000', 10);

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('[Server] Starting AI Company v3 Server...');

  try {
    // 初始化数据库
    console.log('[Server] Initializing database...');
    await getDatabase();

    // 启动引擎
    console.log('[Server] Starting engine...');
    const engine = getEngine();
    await engine.start();

    // 启动 WebSocket 服务器
    console.log('[Server] Starting WebSocket server...');
    const wsServer = getWSServer(WS_PORT);

    // 启动 API 服务
    console.log('[Server] Starting API service...');
    const apiService = getApiService(API_PORT);
    apiService.start();

    console.log('[Server] All services started successfully');
    console.log(`[Server] WebSocket: ws://localhost:${WS_PORT}`);
    console.log(`[Server] API: http://localhost:${API_PORT}`);
    console.log(`[Server] Health: http://localhost:${API_PORT}/health`);

    // 处理进程信号
    process.on('SIGINT', async () => {
      console.log('\n[Server] Shutting down...');
      await engine.stop();
      wsServer.close();
      await apiService.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n[Server] Shutting down...');
      await engine.stop();
      wsServer.close();
      await apiService.stop();
      process.exit(0);
    });

  } catch (error: any) {
    console.error('[Server] Failed to start:', error.message);
    process.exit(1);
  }
}

// ============================================================================
// Exports
// ============================================================================

export { getWSServer, getApiService, getEngine };

// 启动服务器
main().catch(console.error);
