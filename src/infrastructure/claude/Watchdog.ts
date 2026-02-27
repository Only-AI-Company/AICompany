import { EventEmitter } from 'events';

export interface WatchdogOptions {
  keywords?: string[];
  tokenPatterns?: RegExp[];
  maxBuffer?: number;
}

export interface WatchdogStats {
  tokensUsed: number;
  keywordHits: Record<string, number>;
  errorCount: number;
  lastProgress?: number;
}

export class Watchdog extends EventEmitter {
  private buffer = '';
  private tokensUsed = 0;
  private keywordHits = new Map<string, number>();
  private errorCount = 0;
  private lastProgress?: number;
  private keywords: string[];
  private tokenPatterns: RegExp[];
  private maxBuffer: number;

  constructor(options: WatchdogOptions = {}) {
    super();
    this.keywords = options.keywords || [];
    this.tokenPatterns = options.tokenPatterns || [
      /tokens_used\s*[:=]\s*(\d+)/i,
      /tokenUsage\s*[:=]\s*(\d+)/i,
      /tokensUsed\s*[:=]\s*(\d+)/i,
      /"inputTokens"\s*:\s*(\d+)[\s\S]*"outputTokens"\s*:\s*(\d+)/i,
    ];
    this.maxBuffer = options.maxBuffer || 20000;
  }

  handleChunk(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > this.maxBuffer) {
      this.buffer = this.buffer.slice(-this.maxBuffer);
    }
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      this.processLine(line);
    }
  }

  getStats(): WatchdogStats {
    return {
      tokensUsed: this.tokensUsed,
      keywordHits: Object.fromEntries(this.keywordHits.entries()),
      errorCount: this.errorCount,
      lastProgress: this.lastProgress,
    };
  }

  setKeywords(keywords: string[]): void {
    this.keywords = keywords;
  }

  reset(): void {
    this.buffer = '';
    this.tokensUsed = 0;
    this.keywordHits.clear();
    this.errorCount = 0;
    this.lastProgress = undefined;
  }

  private processLine(line: string): void {
    const tokensDelta = this.extractTokens(line);
    if (tokensDelta > 0) {
      this.tokensUsed += tokensDelta;
      this.emit('tokens', { total: this.tokensUsed, delta: tokensDelta, line });
    }

    for (const keyword of this.keywords) {
      if (keyword && line.includes(keyword)) {
        const count = (this.keywordHits.get(keyword) || 0) + 1;
        this.keywordHits.set(keyword, count);
        this.emit('keyword', { keyword, count, line });
      }
    }

    if (/(error|failed|exception|stack trace)/i.test(line)) {
      this.errorCount += 1;
      this.emit('error', { count: this.errorCount, line });
    }

    const progressMatch = line.match(/\b(\d{1,3})%\b/);
    if (progressMatch) {
      const percent = Math.min(100, parseInt(progressMatch[1], 10));
      this.lastProgress = percent;
      this.emit('progress', { percent, line });
    }
  }

  private extractTokens(line: string): number {
    let total = 0;
    for (const pattern of this.tokenPatterns) {
      const match = line.match(pattern);
      if (!match) continue;
      if (match.length >= 3 && pattern.source.includes('inputTokens')) {
        total += parseInt(match[1], 10) + parseInt(match[2], 10);
      } else {
        total += parseInt(match[1], 10);
      }
    }
    return total;
  }
}
