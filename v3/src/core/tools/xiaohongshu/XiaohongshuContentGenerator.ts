/**
 * AI Company v3 - 小红书内容生成器
 *
 * 功能：
 * 1. 根据主题生成小红书风格文案
 * 2. 生成吸引人的标题
 * 3. 推荐话题标签
 * 4. 支持多种内容类型
 */

import { getAIProvider } from '../../ai/AIProvider.js';
import { parseJSON } from '../../utils.js';

// ============================================================================
// Types
// ============================================================================

export interface ContentRequest {
  topic: string;
  contentType?: '分享' | '教程' | '种草' | '测评' | '日常';
  tone?: '亲切' | '专业' | '幽默' | '干货';
  targetAudience?: string;
  keywords?: string[];
}

export interface GeneratedContent {
  title: string;
  content: string;
  tags: string[];
  contentType: string;
  suggestedImages?: string[];
  emoji?: string;
}

// ============================================================================
// Xiaohongshu Content Generator
// ============================================================================

export class XiaohongshuContentGenerator {
  private aiProvider = getAIProvider();

  /**
   * 生成小红书内容
   */
  async generate(request: ContentRequest): Promise<GeneratedContent> {
    console.log(`[小红书] 生成内容: ${request.topic}`);

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(request);

    try {
      const response = await this.aiProvider.prompt(userPrompt, systemPrompt);

      const content = typeof response.content === 'string'
        ? response.content
        : response.getText?.() || JSON.stringify(response.content);

      const result = parseJSON(content);

      // 解析生成的标签
      const tags = this.parseTags(result.tags || result.标签);

      // 确保返回格式正确
      return {
        title: result.title || result.标题 || this.generateTitle(request.topic),
        content: result.content || result.内容 || this.generateContent(request.topic),
        tags,
        contentType: request.contentType || '分享',
        suggestedImages: result.suggestedImages || [],
        emoji: this.selectEmoji(request.contentType),
      };
    } catch (error: any) {
      console.warn('[小红书] AI 生成失败，使用 fallback:', error.message);

      return this.generateFallback(request);
    }
  }

  /**
   * 批量生成多个版本
   */
  async generateMultiple(request: ContentRequest, count: number = 3): Promise<GeneratedContent[]> {
    const results: GeneratedContent[] = [];

    for (let i = 0; i < count; i++) {
      const content = await this.generate(request);
      results.push(content);
    }

    return results;
  }

  /**
   * 优化现有内容
   */
  async optimize(content: GeneratedContent, feedback: string): Promise<GeneratedContent> {
    const systemPrompt = `你是小红书内容优化专家。

请根据用户反馈优化内容，返回 JSON 格式：
{
  "title": "优化后的标题",
  "content": "优化后的正文",
  "tags": ["标签1", "标签2"],
  "reasoning": "优化理由"
}

优化原则：
- 标题要吸引人但不夸张
- 内容要真实有价值
- 标签要精准相关
- 保持小红书风格（emoji、分段、话题）`;

    const userPrompt = `当前内容：
标题：${content.title}
内容：${content.content}
标签：${content.tags.join(', ')}

用户反馈：${feedback}

请优化这段内容。`;

    try {
      const response = await this.aiProvider.prompt(userPrompt, systemPrompt);

      const text = typeof response.content === 'string'
        ? response.content
        : response.getText?.() || JSON.stringify(response.content);

      const result = parseJSON(text);

      return {
        ...content,
        title: result.title || content.title,
        content: result.content || content.content,
        tags: result.tags || content.tags,
      };
    } catch (error: any) {
      console.warn('[小红书] 优化失败，返回原内容:', error.message);
      return content;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(): string {
    return `你是 AI Company 的小红书内容创作专家。

你的职责是根据主题生成高质量的小红书笔记内容。

小红书内容特点：
1. **标题吸引人**：使用数字、疑问、对比等方式
2. **开头抓眼球**：第一句话就要吸引读者
3. **分段清晰**：使用 emoji 和空行分段
4. **真实有用**：提供真实的价值和经验
5. **结尾引导**：引导点赞、收藏、评论
6. **话题标签**：3-5 个相关话题

请返回 JSON 格式：
{
  "title": "标题（20字以内，吸引人）",
  "content": "正文内容（分段、emoji、真实）",
  "tags": ["话题1", "话题2", "话题3"],
  "suggestedImages": ["图片1描述", "图片2描述"]
}

内容结构建议：
- 开头：1-2 句话引入
- 主体：3-5 段干货
- 结尾：总结 + 互动引导`;
  }

  /**
   * 构建用户提示词
   */
  private buildUserPrompt(request: ContentRequest): string {
    const parts = [`主题：${request.topic}`];

    if (request.contentType) {
      parts.push(`内容类型：${request.contentType}`);
    }

    if (request.tone) {
      parts.push(`语气风格：${request.tone}`);
    }

    if (request.targetAudience) {
      parts.push(`目标受众：${request.targetAudience}`);
    }

    if (request.keywords && request.keywords.length > 0) {
      parts.push(`关键词：${request.keywords.join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * 生成 Fallback 内容
   */
  private generateFallback(request: ContentRequest): GeneratedContent {
    const title = this.generateTitle(request.topic);
    const content = this.generateContent(request.topic);
    const tags = this.generateTags(request.topic);

    return {
      title,
      content,
      tags,
      contentType: request.contentType || '分享',
      emoji: this.selectEmoji(request.contentType),
    };
  }

  /**
   * 生成标题
   */
  private generateTitle(topic: string): string {
    const templates = [
      `${topic}｜超实用！`,
      `关于${topic}的真心话💡`,
      `${topic}这样做就对了！`,
      `谁懂啊！${topic}太香了`,
      `${topic}｜新手必看`,
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }

  /**
   * 生成正文
   */
  private generateContent(topic: string): string {
    return `👋 宝子们！

今天来聊聊${topic}

✨ 第一点：认真对待
这件事真的很重要，大家不要忽视

💡 第二点：找对方法
方法比努力更重要，要聪明地工作

🌟 第三点：持续学习
保持好奇心，每天进步一点点

希望这些分享对大家有帮助！

💬 你们有什么看法？欢迎在评论区交流～

记得点赞收藏哦～ #${topic} #经验分享 #干货`;
  }

  /**
   * 生成标签
   */
  private generateTags(topic: string): string[] {
    const baseTags = ['#经验分享', '#干货', '#小红书成长'];
    const topicTag = `#${topic}`;

    return [topicTag, ...baseTags.slice(0, 3)];
  }

  /**
   * 解析标签
   */
  private parseTags(tags: any): string[] {
    if (typeof tags === 'string') {
      return tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
    }

    if (Array.isArray(tags)) {
      return tags.map(t => String(t).trim().replace(/^#/, '')).filter(Boolean);
    }

    return [];
  }

  /**
   * 选择 emoji
   */
  private selectEmoji(contentType?: string): string {
    const emojiMap: Record<string, string> = {
      '分享': '💡',
      '教程': '📚',
      '种草': '🛒',
      '测评': '⭐',
      '日常': '🌸',
    };

    return emojiMap[contentType || '分享'] || '💡';
  }
}

// ============================================================================
// Singleton
// ============================================================================

let generatorInstance: XiaohongshuContentGenerator | null = null;

export function getXiaohongshuContentGenerator(): XiaohongshuContentGenerator {
  if (!generatorInstance) {
    generatorInstance = new XiaohongshuContentGenerator();
  }
  return generatorInstance;
}
