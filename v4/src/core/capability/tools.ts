/**
 * LangChain 工具封装
 *
 * 使用 LangChain 官方工具
 * 参考：https://js.langchain.com/docs/integrations/tools/
 */

import { Tool } from '@langchain/core/tools';
import pino from 'pino';

// ============================================================================
// LLM 工具 - 使用 LangChain 封装的 Anthropic
// ============================================================================

export interface LangChainToolConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
}

export class LangChainLLMTool extends Tool {
  name = 'llm_chat';
  description = '与 AI 助手进行对话，回答问题或完成任务';

  private apiKey: string;
  private model: string;
  private temperature: number;
  private logger: pino.Logger;

  constructor(config: LangChainToolConfig = {}) {
    super();
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.temperature = config.temperature ?? 0.7;
    this.logger = pino({ name: 'llm-tool' });
  }

  protected async _call(input: string): Promise<string> {
    // 使用 LangChain 的 ChatAnthropic
    const { ChatAnthropic } = await import('@langchain/anthropic');

    const llm = new ChatAnthropic({
      apiKey: this.apiKey,
      model: this.model,
      temperature: this.temperature
    });

    try {
      const response = await llm.invoke(input);
      return response.content as string;
    } catch (error) {
      this.logger.error({ error }, 'LLM call failed');
      throw error;
    }
  }
}

// ============================================================================
// 网络搜索工具
// ============================================================================

export interface SearchToolConfig {
  searchEngine?: 'google' | 'bing' | 'duckduckgo';
  apiKey?: string;
}

export class SearchTool extends Tool {
  name = 'web_search';
  description = '搜索互联网获取最新信息';

  private logger: pino.Logger;

  constructor(_config: SearchToolConfig = {}) {
    super();
    this.logger = pino({ name: 'search-tool' });
  }

  protected async _call(query: string): Promise<string> {
    // 降级：使用简单的 fetch 搜索
    this.logger.info({ query }, 'Search requested');
    return `搜索 "${query}" 的功能暂不可用，请配置 SERPER_API_KEY 或使用 browser 工具直接访问网页`;
  }
}

// ============================================================================
// 浏览器自动化工具 (Playwright)
// ============================================================================

export class BrowserTool extends Tool {
  name = 'browser';
  description = '使用浏览器访问网页、提取内容';

  private logger: pino.Logger;

  constructor() {
    super();
    this.logger = pino({ name: 'browser-tool' });
  }

  protected async _call(input: string): Promise<string> {
    // 解析输入：{ action: 'goto' | 'screenshot' | 'extract', url: string, selector?: string }
    const params = JSON.parse(input);
    const { action, url, selector } = params;

    try {
      const { chromium } = await import('playwright');

      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      let result: string;

      if (action === 'goto') {
        await page.goto(url);
        result = await page.content();
      } else if (action === 'screenshot') {
        await page.goto(url);
        await page.screenshot({ path: 'screenshot.png' });
        result = '截图已保存到 screenshot.png';
      } else if (action === 'extract') {
        await page.goto(url);
        const content = await page.$eval(selector, el => el.textContent);
        result = content || '未找到内容';
      } else {
        result = `未知操作：${action}`;
      }

      await browser.close();
      return result;
    } catch (error) {
      this.logger.error({ error, action, url }, 'Browser action failed');
      throw error;
    }
  }
}

// ============================================================================
// 文件工具
// ============================================================================

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';

export class FileTool extends Tool {
  name = 'file';
  description = '读取/写入文件，列出目录内容';

  private logger: pino.Logger;
  private basePath: string;

  constructor(basePath?: string) {
    super();
    this.basePath = basePath || process.cwd();
    this.logger = pino({ name: 'file-tool' });
  }

  protected async _call(input: string): Promise<string> {
    // 解析输入：{ action: 'read' | 'write' | 'list', path: string, content?: string }
    const params = JSON.parse(input);
    const { action, path: filePath, content } = params;

    try {
      const fullPath = join(this.basePath, filePath);

      if (action === 'read') {
        const data = await readFile(fullPath, 'utf-8');
        return data;
      } else if (action === 'write') {
        await writeFile(fullPath, content, 'utf-8');
        return `文件已写入：${fullPath}`;
      } else if (action === 'list') {
        const files = await readdir(fullPath);
        return files.join('\n');
      } else {
        return `未知操作：${action}`;
      }
    } catch (error) {
      this.logger.error({ error, action, filePath }, 'File action failed');
      throw error;
    }
  }
}

// ============================================================================
// 社交媒体工具 - 小红书
// ============================================================================

export interface XiaohongshuConfig {
  accountId?: string;
  authToken?: string;
}

export class XiaohongshuTool extends Tool {
  name = 'xiaohongshu';
  description = '发布小红书笔记、获取笔记数据';

  private logger: pino.Logger;

  constructor(_config: XiaohongshuConfig = {}) {
    super();
    this.logger = pino({ name: 'xiaohongshu-tool' });
  }

  protected async _call(input: string): Promise<string> {
    // 解析输入：{ action: 'publish' | 'get_stats', title: string, content: string, tags?: string[] }
    const params = JSON.parse(input);
    const { action, title, content: _content, tags } = params;

    try {
      if (action === 'publish') {
        // TODO: 实现小红书 API 调用
        this.logger.info({ title, tags }, 'Publishing to Xiaohongshu');
        return `笔记发布成功（模拟）：${title}`;
      } else if (action === 'get_stats') {
        // TODO: 获取统计数据
        return '粉丝数：10000 | 点赞：50000 | 收藏：20000';
      } else {
        return `未知操作：${action}`;
      }
    } catch (error) {
      this.logger.error({ error, action }, 'Xiaohongshu action failed');
      throw error;
    }
  }
}
