/**
 * LangFuse 可观测性客户端
 *
 * 用于追踪 DeepAgent 的执行过程、LLM 调用和工具使用
 */

import { Langfuse, LangfuseTraceClient } from 'langfuse';

export interface LangFuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
  projectId?: string;
}

export interface TraceResult {
  trace: LangfuseTraceClient;
  observe: (step: string, input: any, output: any) => Promise<void>;
}

export class LangFuseClient {
  private client: Langfuse;
  private projectId: string;
  private enabled: boolean = true;

  constructor(config?: Partial<LangFuseConfig>) {
    const envConfig = {
      publicKey: config?.publicKey || process.env.LANGFUSE_PUBLIC_KEY || 'pk-lf-local',
      secretKey: config?.secretKey || process.env.LANGFUSE_SECRET_KEY || 'sk-lf-local',
      baseUrl: config?.baseUrl || process.env.LANGFUSE_URL || 'http://localhost:3001'
    };

    // 检查是否启用了 LangFuse
    this.enabled = !!(envConfig.publicKey && envConfig.secretKey);

    if (!this.enabled) {
      console.log('[LangFuse] Disabled - missing credentials');
    }

    this.client = new Langfuse(envConfig);
    this.projectId = config?.projectId || 'ai-company-v4';

    // 错误处理
    this.client.on('error', (error) => {
      console.error('[LangFuse] Error:', error);
    });

    console.log(`[LangFuse] Initialized: ${envConfig.baseUrl}`);
  }

  /**
   * 追踪 Agent 执行
   */
  async traceAgentExecution(
    agentName: string,
    taskId: string,
    metadata?: Record<string, any>
  ): Promise<TraceResult> {
    if (!this.enabled) {
      return {
        trace: {} as LangfuseTraceClient,
        observe: async () => {}
      };
    }

    const trace = this.client.trace({
      id: `trace-${agentName}-${taskId}-${Date.now()}`,
      name: `${agentName} execution`,
      sessionId: taskId,
      metadata: {
        project: this.projectId,
        agent: agentName,
        ...metadata
      }
    });

    return {
      trace,
      observe: async (step: string, input: any, output: any) => {
        await trace.span({
          name: step,
          input: typeof input === 'string' ? input : JSON.stringify(input),
          output: typeof output === 'string' ? output : JSON.stringify(output)
        });
      }
    };
  }

  /**
   * 追踪 LLM 调用
   */
  async traceLLMCall(
    agentName: string,
    params: {
      model: string;
      prompt: string;
      completion: string;
      tokens: number;
      latency: number;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    if (!this.enabled) return;

    const trace = this.client.trace({
      name: `${agentName} LLM Call`,
      metadata: {
        project: this.projectId,
        agent: agentName
      }
    });

    await trace.generation({
      model: params.model,
      input: params.prompt,
      output: params.completion,
      usage: {
        totalTokens: params.tokens,
        promptTokens: Math.floor(params.tokens * 0.4),
        completionTokens: Math.floor(params.tokens * 0.6)
      },
      latency: params.latency / 1000, // 转换为秒
      metadata: params.metadata
    });

    // 确保数据被刷新
    await this.client.flushAsync();
  }

  /**
   * 追踪工具使用
   */
  async traceToolUse(
    agentName: string,
    toolName: string,
    input: any,
    output: any,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.enabled) return;

    const trace = this.client.trace({
      name: `${agentName} Tool Use`,
      metadata: {
        project: this.projectId,
        agent: agentName,
        tool: toolName
      }
    });

    await trace.span({
      name: `tool:${toolName}`,
      input: typeof input === 'string' ? input : JSON.stringify(input),
      output: typeof output === 'string' ? output : JSON.stringify(output),
      metadata
    });

    await this.client.flushAsync();
  }

  /**
   * 追踪 Agent 间通信
   */
  async traceAgentCommunication(
    from: string,
    to: string,
    message: any,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.enabled) return;

    const trace = this.client.trace({
      name: 'Agent Communication',
      metadata: {
        project: this.projectId,
        from,
        to
      }
    });

    await trace.event({
      name: 'message',
      input: typeof message === 'string' ? message : JSON.stringify(message),
      metadata
    });

    await this.client.flushAsync();
  }

  /**
   * 记录事件
   */
  async recordEvent(
    eventName: string,
    data: any,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.enabled) return;

    const trace = this.client.trace({
      name: eventName,
      metadata: {
        project: this.projectId,
        ...metadata
      }
    });

    await trace.event({
      name: eventName,
      input: typeof data === 'string' ? data : JSON.stringify(data)
    });

    await this.client.flushAsync();
  }

  /**
   * 刷新所有数据
   */
  async flush(): Promise<void> {
    if (!this.enabled) return;
    await this.client.flushAsync();
  }

  /**
   * 关闭客户端
   */
  async shutdown(): Promise<void> {
    if (!this.enabled) return;
    await this.client.shutdownAsync();
    console.log('[LangFuse] Shutdown complete');
  }
}
