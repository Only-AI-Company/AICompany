/**
 * AI Company v3 - Rate Limiter
 *
 * 令牌桶算法实现的速率限制器
 *
 * 用途：
 * - 防止 LLM API 调用过快
 * - 支持可配置的速率限制
 * - 平滑处理突发请求
 */

interface RateLimiterConfig {
  // 速率：每秒允许的请求数
  rate: number;
  // 容量：令牌桶最大容量（允许突发）
  capacity: number;
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    this.tokens = config.capacity; // 初始时桶是满的
    this.lastRefill = Date.now();
  }

  /**
   * 尝试获取一个令牌
   *
   * @returns {boolean} 是否成功获取令牌
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * 获取令牌，如果不可用则等待
   *
   * @param {number} timeoutMs 最大等待时间（毫秒）
   * @returns {Promise<boolean>} 是否成功获取令牌
   */
  async acquire(timeoutMs: number = 10000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return true;
      }

      // 等待一小段时间后重试
      await this.sleep(100);
    }

    return false;
  }

  /**
   * 获取当前可用的令牌数
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * 重置速率限制器
   */
  reset(): void {
    this.tokens = this.config.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...config };
    // 确保令牌不超过新容量
    if (this.tokens > this.config.capacity) {
      this.tokens = this.config.capacity;
    }
  }

  /**
   * 补充令牌桶
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // 转换为秒

    // 计算应该补充的令牌数
    const tokensToAdd = elapsed * this.config.rate;

    this.tokens = Math.min(this.config.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * 睡眠指定毫秒数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// LLM Rate Limiter (预配置实例)
// ============================================================================

/**
 * LLM 调用速率限制器配置
 *
 * 默认：每秒 2 个请求，最多允许突发 10 个请求
 */
const LLM_RATE_LIMITER = new RateLimiter({
  rate: 2,      // 每秒 2 个请求
  capacity: 10, // 最多突发 10 个请求
});

/**
 * 使用 LLM 速率限制器执行函数
 *
 * @example
 * await withRateLimit(async () => {
 *   return await llm.call(prompt);
 * });
 */
export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  // 尝试获取令牌，最多等待 30 秒
  const acquired = await LLM_RATE_LIMITER.acquire(30000);

  if (!acquired) {
    throw new Error('Rate limit timeout: unable to acquire token within 30 seconds');
  }

  return fn();
}

/**
 * 获取 LLM 速率限制器实例
 */
export function getLLMRateLimiter(): RateLimiter {
  return LLM_RATE_LIMITER;
}
