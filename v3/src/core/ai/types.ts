/**
 * AI Company v3 - AI Provider Types
 */

export type MessageRole = 'user' | 'assistant' | 'system';
export type ProviderType = 'anthropic' | 'qwen' | 'kimi' | 'zhipu' | 'zai';

export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: any;
}

export interface ProviderResponse {
  content: string | any[];  // 文本或内容块（tool_use）
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  stopReason?: string;
  toolCalls?: any[];

  /**
   * 获取文本内容（辅助方法）
   */
  getText?(): string;
}

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  model: string;
  baseURL?: string;
  priority?: number; // 1 = 最高
  enabled?: boolean;
}

export interface ProviderHealth {
  type: ProviderType;
  healthy: boolean;
  lastCheck: number;
  consecutiveFailures: number;
  lastError?: string;
  latency?: number;
}

export interface IProvider {
  prompt(prompt: string, systemPrompt?: string): Promise<ProviderResponse>;
  messages(messages: Message[], systemPrompt?: string): Promise<ProviderResponse>;
  messagesWithTools?(messages: Message[], tools: any[], systemPrompt?: string): Promise<ProviderResponse>;
  healthCheck(): Promise<boolean>;
  getLatency(): number;
  getType(): ProviderType;
}
