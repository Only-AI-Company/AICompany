/**
 * AI Company v3 - 小红书工具集
 *
 * 功能：
 * 1. 生成小红书内容
 * 2. 发布小红书笔记
 * 3. 管理发布会话
 */

import type { Tool, ToolContext, ToolResult } from '../types.js';
import { getXiaohongshuContentGenerator } from './XiaohongshuContentGenerator.js';
import { XiaohongshuPublisher } from './XiaohongshuPublisher.js';

// ============================================================================
// Xiaohongshu Generate Content Tool
// ============================================================================

export const XiaohongshuGenerateTool: Tool = {
  name: 'xiaohongshu_generate',
  description: 'Generate Xiaohongshu (Little Red Book) content with AI',
  category: 'xiaohongshu',

  parameters: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'The topic to generate content about',
      },
      contentType: {
        type: 'string',
        description: 'Content type: 分享, 教程, 种草, 测评, 日常',
        enum: ['分享', '教程', '种草', '测评', '日常'],
      },
      tone: {
        type: 'string',
        description: 'Tone style: 亲切, 专业, 幽默, 干货',
        enum: ['亲切', '专业', '幽默', '干货'],
      },
      keywords: {
        type: 'array',
        description: 'Keywords to include in the content',
        items: {
          type: 'string',
        },
      },
    },
    required: ['topic'],
  },

  validate(params) {
    return typeof params.topic === 'string' && params.topic.length > 0;
  },

  async execute(params, context) {
    const { topic, contentType = '分享', tone = '亲切', keywords = [] } = params;

    try {
      const generator = getXiaohongshuContentGenerator();

      const content = await generator.generate({
        topic,
        contentType,
        tone,
        keywords,
      });

      return {
        success: true,
        output: `Title: ${content.title}\n\nContent:\n${content.content}\n\nTags: ${content.tags.join(', ')}`,
        metadata: {
          title: content.title,
          content: content.content,
          tags: content.tags,
          contentType: content.contentType,
          suggestedImages: content.suggestedImages,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

// ============================================================================
// Xiaohongshu Publish Tool
// ============================================================================

export const XiaohongshuPublishTool: Tool = {
  name: 'xiaohongshu_publish',
  description: 'Publish content to Xiaohongshu (Little Red Book)',
  category: 'xiaohongshu',

  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The title of the post',
      },
      content: {
        type: 'string',
        description: 'The main content of the post',
      },
      tags: {
        type: 'array',
        description: 'Topic tags to include',
        items: {
          type: 'string',
        },
      },
      headless: {
        type: 'boolean',
        description: 'Run browser in headless mode (default: false)',
        default: false,
      },
      cookiesPath: {
        type: 'string',
        description: 'Path to saved cookies file',
        default: 'storage/xiaohongshu-cookies.json',
      },
    },
    required: ['title', 'content'],
  },

  validate(params) {
    return (
      typeof params.title === 'string' &&
      params.title.length > 0 &&
      typeof params.content === 'string' &&
      params.content.length > 0
    );
  },

  async execute(params, context) {
    const { title, content, tags = [], headless = false, cookiesPath = 'storage/xiaohongshu-cookies.json' } = params;

    try {
      const publisher = new XiaohongshuPublisher(cookiesPath);

      await publisher.init({ headless });

      const post = {
        title,
        content,
        tags,
      };

      const result = await publisher.publish(post);

      // 不要立即关闭，让用户看到结果
      // await publisher.close();

      if (result.success) {
        return {
          success: true,
          output: `Published successfully! URL: ${result.postUrl}`,
          metadata: {
            postUrl: result.postUrl,
          },
        };
      } else {
        return {
          success: false,
          error: result.error || 'Publishing failed',
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

// ============================================================================
// Xiaohongshu Login Tool
// ============================================================================

export const XiaohongshuLoginTool: Tool = {
  name: 'xiaohongshu_login',
  description: 'Setup Xiaohongshu login session (opens browser for manual login)',
  category: 'xiaohongshu',

  parameters: {
    type: 'object',
    properties: {
      cookiesPath: {
        type: 'string',
        description: 'Path to save cookies file',
        default: 'storage/xiaohongshu-cookies.json',
      },
    },
    required: [],
  },

  validate(params) {
    return true;
  },

  async execute(params, context) {
    const { cookiesPath = 'storage/xiaohongshu-cookies.json' } = params;

    try {
      const publisher = new XiaohongshuPublisher(cookiesPath);

      await publisher.init({ headless: false });

      console.log('[小红书] 浏览器已打开，请完成登录...');
      console.log('[小红书] 登录完成后按回车键...');

      await publisher.login();

      return {
        success: true,
        output: 'Login successful! Cookies have been saved.',
        metadata: {
          cookiesPath,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

// ============================================================================
// Xiaohongshu Check Login Tool
// ============================================================================

export const XiaohongshuCheckLoginTool: Tool = {
  name: 'xiaohongshu_check_login',
  description: 'Check if Xiaohongshu login session is valid',
  category: 'xiaohongshu',

  parameters: {
    type: 'object',
    properties: {
      cookiesPath: {
        type: 'string',
        description: 'Path to cookies file',
        default: 'storage/xiaohongshu-cookies.json',
      },
    },
    required: [],
  },

  validate(params) {
    return true;
  },

  async execute(params, context) {
    const { cookiesPath = 'storage/xiaohongshu-cookies.json' } = params;

    try {
      const publisher = new XiaohongshuPublisher(cookiesPath);

      await publisher.init({ headless: true });

      const isLoggedIn = await publisher.isLoggedIn();

      await publisher.close();

      if (isLoggedIn) {
        return {
          success: true,
          output: 'Login session is valid!',
          metadata: {
            loggedIn: true,
          },
        };
      } else {
        return {
          success: false,
          error: 'Login session is invalid or expired. Please run xiaohongshu_login again.',
          metadata: {
            loggedIn: false,
          },
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        metadata: {
          loggedIn: false,
        },
      };
    }
  },
};

// ============================================================================
// Tool Exports
// ============================================================================

export const xiaohongshuTools: Tool[] = [
  XiaohongshuGenerateTool,
  XiaohongshuPublishTool,
  XiaohongshuLoginTool,
  XiaohongshuCheckLoginTool,
];

export const registerXiaohongshuTools = (registry: import('../ToolRegistry.js').ToolRegistry): void => {
  for (const tool of xiaohongshuTools) {
    registry.register(tool);
  }

  console.log('[小红书] 已注册 4 个工具');
  console.log('[小红书] - xiaohongshu_generate: AI 生成内容');
  console.log('[小红书] - xiaohongshu_publish: 发布笔记');
  console.log('[小红书] - xiaohongshu_login: 登录设置');
  console.log('[小红书] - xiaohongshu_check_login: 检查登录状态');
};
