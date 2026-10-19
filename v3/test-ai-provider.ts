/**
 * AI Company v3 - Test AI Provider
 */

import { getAIProvider } from './src/core/ai/AIProvider.js';

async function testAIProvider() {
  console.log('Testing AI Provider...\n');

  const provider = getAIProvider();

  // 获取健康状态
  console.log('Health Check:');
  const health = await provider.healthCheck();
  for (const h of health) {
    console.log(`  - ${h.type}: ${h.healthy ? '✓' : '✗'} (latency: ${h.latency}ms)`);
  }

  console.log('\nTesting prompt API...');
  try {
    const response = await provider.prompt('你好，请简单介绍一下你自己。', '你是 AI Company v3 的 CEO。');
    console.log('\nResponse:', response.content);
    console.log('\nTokens:', response.usage);
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

testAIProvider().catch(console.error);
