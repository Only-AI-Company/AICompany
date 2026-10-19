/**
 * AI 内容生成器
 *
 * 职责：
 * 1. 调用 AI API 生成内容
 * 2. 支持不同平台的提示词
 * 3. 支持多种 AI 服务提供商
 * 4. 错误处理和重试
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { getPromptForPlatform, type GenerationParams } from '../config/prompts.js';

export interface GeneratedContent {
  content: string;
  platform: string;
  topic: string;
  tokens: number;
  model: string;
  provider: string;
  createdAt: Date;
}

/**
 * AI 服务提供商类型
 */
type AIProvider = 'qwen' | 'anthropic' | 'openai';

export class ContentGenerator {
  private qwenClient?: OpenAI;
  private anthropicClient?: Anthropic;
  private openaiClient?: OpenAI;
  private provider: AIProvider;

  constructor() {
    // 优先级：通义千问 > Anthropic > OpenAI
    if (process.env.QWEN_API_KEY) {
      this.qwenClient = new OpenAI({
        apiKey: process.env.QWEN_API_KEY,
        baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      });
      this.provider = 'qwen';
    } else if (process.env.ANTHROPIC_API_KEY) {
      this.anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      this.provider = 'anthropic';
    } else if (process.env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      this.provider = 'openai';
    } else {
      throw new Error(
        '未找到 API Key，请在 .env 文件中配置以下任一服务：\n' +
          '  - QWEN_API_KEY (通义千问)\n' +
          '  - ANTHROPIC_API_KEY (Claude)\n' +
          '  - OPENAI_API_KEY (ChatGPT)'
      );
    }
  }

  /**
   * 生成内容
   */
  async generate(params: GenerationParams): Promise<GeneratedContent> {
    const { platform, topic } = params;

    console.log(`🤖 正在生成${platform}内容...`);
    console.log(`   主题: ${topic}`);
    console.log(`   使用: ${this.getProviderName()}`);

    const systemPrompt = getPromptForPlatform(platform);

    try {
      let result: GeneratedContent;

      switch (this.provider) {
        case 'qwen':
          result = await this.generateWithQwen(topic, systemPrompt, platform);
          break;
        case 'anthropic':
          result = await this.generateWithAnthropic(topic, systemPrompt, platform);
          break;
        case 'openai':
          result = await this.generateWithOpenAI(topic, systemPrompt, platform);
          break;
        default:
          throw new Error(`不支持的 AI 服务: ${this.provider}`);
      }

      console.log(`✅ 生成成功！使用了 ${result.tokens} tokens`);
      return result;
    } catch (error: any) {
      console.error('❌ 生成失败:', error.message);
      throw new Error(`AI 生成失败: ${error.message}`);
    }
  }

  /**
   * 使用通义千问生成
   */
  private async generateWithQwen(
    topic: string,
    systemPrompt: string,
    platform: string
  ): Promise<GeneratedContent> {
    if (!this.qwenClient) throw new Error('通义千问客户端未初始化');

    const response = await this.qwenClient.chat.completions.create({
      model: process.env.QWEN_MODEL || 'qwen-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `请帮我写一篇关于"${topic}"的${platform === 'xiaohongshu' ? '小红书' : platform}文案`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || '';
    const tokens = response.usage?.total_tokens || 0;

    return {
      content,
      platform,
      topic,
      tokens,
      model: response.model,
      provider: 'qwen',
      createdAt: new Date(),
    };
  }

  /**
   * 使用 Anthropic Claude 生成
   */
  private async generateWithAnthropic(
    topic: string,
    systemPrompt: string,
    platform: string
  ): Promise<GeneratedContent> {
    if (!this.anthropicClient) throw new Error('Anthropic 客户端未初始化');

    const response = await this.anthropicClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `请帮我写一篇关于"${topic}"的${platform === 'xiaohongshu' ? '小红书' : platform}文案`,
        },
      ],
    });

    const content = this.extractContent(response);
    const tokens = response.usage.input_tokens + response.usage.output_tokens;

    return {
      content,
      platform,
      topic,
      tokens,
      model: response.model,
      provider: 'anthropic',
      createdAt: new Date(),
    };
  }

  /**
   * 使用 OpenAI 生成
   */
  private async generateWithOpenAI(
    topic: string,
    systemPrompt: string,
    platform: string
  ): Promise<GeneratedContent> {
    if (!this.openaiClient) throw new Error('OpenAI 客户端未初始化');

    const response = await this.openaiClient.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `请帮我写一篇关于"${topic}"的${platform === 'xiaohongshu' ? '小红书' : platform}文案`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || '';
    const tokens = response.usage?.total_tokens || 0;

    return {
      content,
      platform,
      topic,
      tokens,
      model: response.model,
      provider: 'openai',
      createdAt: new Date(),
    };
  }

  /**
   * 提取文本内容
   */
  private extractContent(response: Anthropic.Message): string {
    const contentBlock = response.content[0];

    if (contentBlock.type === 'text') {
      return contentBlock.text.trim();
    }

    throw new Error('无法解析 AI 响应内容');
  }

  /**
   * 批量生成（未来扩展）
   */
  async generateBatch(topics: string[], platform: GenerationParams['platform'] = 'xiaohongshu'): Promise<GeneratedContent[]> {
    const results: GeneratedContent[] = [];

    console.log(`\n🔄 批量生成 ${topics.length} 篇内容...\n`);

    for (let i = 0; i < topics.length; i++) {
      console.log(`[${i + 1}/${topics.length}]`);

      try {
        const result = await this.generate({ platform, topic: topics[i] });
        results.push(result);

        // 避免请求过快
        if (i < topics.length - 1) {
          await this.delay(1000);
        }
      } catch (error: any) {
        console.error(`❌ 第 ${i + 1} 篇生成失败:`, error.message);
      }
    }

    console.log(`\n✅ 批量生成完成，成功 ${results.length}/${topics.length} 篇\n`);

    return results;
  }

  /**
   * 获取提供商名称
   */
  private getProviderName(): string {
    const names = {
      qwen: '通义千问',
      anthropic: 'Claude',
      openai: 'ChatGPT',
    };
    return names[this.provider] || this.provider;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
