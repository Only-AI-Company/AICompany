/**
 * AI Company v2 - Browser Tools
 *
 * 浏览器自动化工具：使用 Playwright 控制浏览器
 *
 * 核心理念：
 * - 一个工具集搞定所有网站，不需要为每个网站写适配器
 * - 模拟人操作：打开、点击、输入、等待
 * - 保持登录状态：通过 contextId 隔离会话
 */

import type { Tool, ToolContext, ToolResult } from '../types.js';

// ============================================================================
// 浏览器管理器（单例，保持浏览器状态）
// ============================================================================

class BrowserManager {
  private browser: any = null;
  private contexts: Map<string, any> = new Map();
  private pages: Map<string, any> = new Map();

  /**
   * 获取或创建浏览器
   */
  async getBrowser(options: { headless?: boolean } = {}): Promise<any> {
    if (!this.browser || this.browser.isConnected() === false) {
      // 动态导入 Playwright
      const { chromium } = await import('playwright');

      this.browser = await chromium.launch({
        headless: options.headless ?? false,  // 默认显示浏览器
        slowMo: 100,  // 稍微放慢操作，便于观察
      });
      console.log('[BrowserManager] ✅ 浏览器已启动');
    }
    return this.browser;
  }

  /**
   * 获取或创建上下文（隔离的会话，保持登录状态）
   */
  async getContext(contextId: string = 'default'): Promise<any> {
    if (!this.contexts.has(contextId)) {
      const browser = await this.getBrowser();
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        // 持久化存储位置（保持登录状态）
        storageState: `.browser-state/${contextId}.json`,
      });
      this.contexts.set(contextId, context);
      console.log(`[BrowserManager] 📂 创建上下文: ${contextId}`);
    }
    return this.contexts.get(contextId)!;
  }

  /**
   * 获取或创建页面
   */
  async getPage(contextId: string = 'default', pageId: string = 'main'): Promise<any> {
    const context = await this.getContext(contextId);

    if (!this.pages.has(`${contextId}:${pageId}`)) {
      const page = await context.newPage();
      this.pages.set(`${contextId}:${pageId}`, page);
      console.log(`[BrowserManager] 📄 创建页面: ${contextId}:${pageId}`);
    }

    return this.pages.get(`${contextId}:${pageId}`)!;
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.contexts.clear();
      this.pages.clear();
      console.log('[BrowserManager] ❌ 浏览器已关闭');
    }
  }

  /**
   * 保存上下文状态（登录状态）
   */
  async saveState(contextId: string = 'default'): Promise<void> {
    const context = this.contexts.get(contextId);
    if (context) {
      await context.storageState({ path: `.browser-state/${contextId}.json` });
      console.log(`[BrowserManager] 💾 保存状态: ${contextId}`);
    }
  }
}

const browserManager = new BrowserManager();

// ============================================================================
// BrowserOpen 工具 - 打开网页
// ============================================================================

export const browserOpenTool: Tool = {
  name: 'BrowserOpen',
  description: 'Open a web page in the browser. Use this to navigate to any website.',
  category: 'browser',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to open (e.g., https://www.xiaohongshu.com)',
      },
      contextId: {
        type: 'string',
        description: 'Context ID for session isolation. Use different IDs for different accounts (default: "default")',
      },
      pageId: {
        type: 'string',
        description: 'Page ID for multiple tabs (default: "main")',
      },
    },
    required: ['url'],
  },
  enabled: true,
  timeout: 60000,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { url, contextId = 'default', pageId = 'main' } = input;

    try {
      const page = await browserManager.getPage(contextId, pageId);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      return {
        success: true,
        data: {
          url: page.url(),
          title: await page.title(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to open page',
      };
    }
  },
};

// ============================================================================
// BrowserClick 工具 - 点击元素
// ============================================================================

export const browserClickTool: Tool = {
  name: 'BrowserClick',
  description: 'Click an element on the page. Can find by CSS selector or text content.',
  category: 'browser',
  parameters: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector to find the element (e.g., button.submit, #login-btn)',
      },
      text: {
        type: 'string',
        description: 'Text content to find (alternative to selector, e.g., "登录", "发布")',
      },
      contextId: {
        type: 'string',
        description: 'Context ID (default: "default")',
      },
      pageId: {
        type: 'string',
        description: 'Page ID (default: "main")',
      },
    },
    required: [],
  },
  enabled: true,
  timeout: 30000,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { selector, text, contextId = 'default', pageId = 'main' } = input;

    try {
      const page = await browserManager.getPage(contextId, pageId);

      if (text) {
        // 按文本查找
        await page.getByText(text, { exact: false }).click();
        console.log(`[BrowserClick] 点击文本: "${text}"`);
      } else if (selector) {
        // 按选择器查找
        await page.locator(selector).click();
        console.log(`[BrowserClick] 点击选择器: "${selector}"`);
      } else {
        return {
          success: false,
          error: 'Must provide either selector or text',
        };
      }

      // 等待导航或网络空闲
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

      return {
        success: true,
        data: {
          url: page.url(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to click element',
      };
    }
  },
};

// ============================================================================
// BrowserType 工具 - 输入文本
// ============================================================================

export const browserTypeTool: Tool = {
  name: 'BrowserType',
  description: 'Type text into an input field. Clears existing text first.',
  category: 'browser',
  parameters: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector to find the input field (e.g., #username, input[name="phone"])',
      },
      text: {
        type: 'string',
        description: 'Text to type',
      },
      contextId: {
        type: 'string',
        description: 'Context ID (default: "default")',
      },
      pageId: {
        type: 'string',
        description: 'Page ID (default: "main")',
      },
    },
    required: ['selector', 'text'],
  },
  enabled: true,
  timeout: 30000,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { selector, text, contextId = 'default', pageId = 'main' } = input;

    try {
      const page = await browserManager.getPage(contextId, pageId);

      await page.locator(selector).clear();
      await page.locator(selector).fill(text);
      console.log(`[BrowserType] 输入文本到 "${selector}": "${text.slice(0, 50)}..."`);

      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to type text',
      };
    }
  },
};

// ============================================================================
// BrowserWait 工具 - 等待元素
// ============================================================================

export const browserWaitTool: Tool = {
  name: 'BrowserWait',
  description: 'Wait for an element to appear or page to load.',
  category: 'browser',
  parameters: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector to wait for',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
      },
      contextId: {
        type: 'string',
        description: 'Context ID (default: "default")',
      },
      pageId: {
        type: 'string',
        description: 'Page ID (default: "main")',
      },
    },
    required: ['selector'],
  },
  enabled: true,
  timeout: 60000,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { selector, timeout = 30000, contextId = 'default', pageId = 'main' } = input;

    try {
      const page = await browserManager.getPage(contextId, pageId);

      await page.waitForSelector(selector, { timeout });
      console.log(`[BrowserWait] 元素已出现: "${selector}"`);

      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Element not found or timeout',
      };
    }
  },
};

// ============================================================================
// BrowserScreenshot 工具 - 截图
// ============================================================================

export const browserScreenshotTool: Tool = {
  name: 'BrowserScreenshot',
  description: 'Take a screenshot of the current page. Useful for debugging or seeing the page state.',
  category: 'browser',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to save screenshot (optional, saves to current directory if not provided)',
      },
      fullPage: {
        type: 'boolean',
        description: 'Whether to capture full page or just viewport (default: false)',
      },
      contextId: {
        type: 'string',
        description: 'Context ID (default: "default")',
      },
      pageId: {
        type: 'string',
        description: 'Page ID (default: "main")',
      },
    },
    required: [],
  },
  enabled: true,
  timeout: 30000,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { path, fullPage = false, contextId = 'default', pageId = 'main' } = input;

    try {
      const page = await browserManager.getPage(contextId, pageId);

      const screenshotPath = path || `screenshot-${Date.now()}.png`;
      await page.screenshot({
        path: screenshotPath,
        fullPage,
      });
      console.log(`[BrowserScreenshot] 截图已保存: ${screenshotPath}`);

      return {
        success: true,
        data: {
          path: screenshotPath,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to take screenshot',
      };
    }
  },
};

// ============================================================================
// BrowserGetText 工具 - 获取页面文本
// ============================================================================

export const browserGetTextTool: Tool = {
  name: 'BrowserGetText',
  description: 'Extract text content from the page or specific elements.',
  category: 'browser',
  parameters: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector to extract text from (optional, gets full page text if not provided)',
      },
      contextId: {
        type: 'string',
        description: 'Context ID (default: "default")',
      },
      pageId: {
        type: 'string',
        description: 'Page ID (default: "main")',
      },
    },
    required: [],
  },
  enabled: true,
  timeout: 30000,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { selector, contextId = 'default', pageId = 'main' } = input;

    try {
      const page = await browserManager.getPage(contextId, pageId);

      let text: string;
      if (selector) {
        text = await page.locator(selector).textContent({ timeout: 5000 }) || '';
      } else {
        text = await page.textContent('body') || '';
      }

      const trimmedText = text.trim().slice(0, 10000); // 限制长度
      console.log(`[BrowserGetText] 获取文本 (${trimmedText.length} chars)`);

      return {
        success: true,
        data: {
          text: trimmedText,
          truncated: text.length > 10000,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get text',
      };
    }
  },
};

// ============================================================================
// BrowserClose 工具 - 关闭浏览器
// ============================================================================

export const browserCloseTool: Tool = {
  name: 'BrowserClose',
  description: 'Close the browser and save login state. Call this when done with browser operations.',
  category: 'browser',
  parameters: {
    type: 'object',
    properties: {
      saveState: {
        type: 'boolean',
        description: 'Whether to save login state (default: true)',
      },
      contextId: {
        type: 'string',
        description: 'Context ID to save state for (default: "default")',
      },
    },
    required: [],
  },
  enabled: true,
  timeout: 10000,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { saveState = true, contextId = 'default' } = input;

    try {
      if (saveState) {
        await browserManager.saveState(contextId);
      }
      await browserManager.close();

      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to close browser',
      };
    }
  },
};

// ============================================================================
// BrowserSelect 工具 - 下拉选择
// ============================================================================

export const browserSelectTool: Tool = {
  name: 'BrowserSelect',
  description: 'Select an option from a dropdown (select element).',
  category: 'browser',
  parameters: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector for the select element',
      },
      value: {
        type: 'string',
        description: 'Value to select',
      },
      contextId: {
        type: 'string',
        description: 'Context ID (default: "default")',
      },
      pageId: {
        type: 'string',
        description: 'Page ID (default: "main")',
      },
    },
    required: ['selector', 'value'],
  },
  enabled: true,
  timeout: 30000,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { selector, value, contextId = 'default', pageId = 'main' } = input;

    try {
      const page = await browserManager.getPage(contextId, pageId);

      await page.selectOption(selector, value);
      console.log(`[BrowserSelect] 选择 "${selector}" = "${value}"`);

      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to select option',
      };
    }
  },
};

// ============================================================================
// BrowserUpload 工具 - 上传文件
// ============================================================================

export const browserUploadTool: Tool = {
  name: 'BrowserUpload',
  description: 'Upload a file through a file input element.',
  category: 'browser',
  parameters: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector for the file input element',
      },
      filePath: {
        type: 'string',
        description: 'Path to the file to upload',
      },
      contextId: {
        type: 'string',
        description: 'Context ID (default: "default")',
      },
      pageId: {
        type: 'string',
        description: 'Page ID (default: "main")',
      },
    },
    required: ['selector', 'filePath'],
  },
  enabled: true,
  timeout: 30000,
  async handler(input: any, context: ToolContext): Promise<ToolResult> {
    const { selector, filePath, contextId = 'default', pageId = 'main' } = input;

    try {
      const page = await browserManager.getPage(contextId, pageId);

      await page.locator(selector).setInputFiles(filePath);
      console.log(`[BrowserUpload] 上传文件: "${filePath}"`);

      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to upload file',
      };
    }
  },
};

// ============================================================================
// 导出和初始化
// ============================================================================

export function initBrowserTools(registry: any): void {
  registry.register(browserOpenTool);
  registry.register(browserClickTool);
  registry.register(browserTypeTool);
  registry.register(browserWaitTool);
  registry.register(browserScreenshotTool);
  registry.register(browserGetTextTool);
  registry.register(browserCloseTool);
  registry.register(browserSelectTool);
  registry.register(browserUploadTool);
  console.log('[BrowserTools] ✅ 已注册浏览器工具 (9个):');
  console.log('  - BrowserOpen: 打开网页');
  console.log('  - BrowserClick: 点击元素');
  console.log('  - BrowserType: 输入文本');
  console.log('  - BrowserWait: 等待元素');
  console.log('  - BrowserScreenshot: 截图');
  console.log('  - BrowserGetText: 获取文本');
  console.log('  - BrowserClose: 关闭浏览器');
  console.log('  - BrowserSelect: 下拉选择');
  console.log('  - BrowserUpload: 上传文件');
}
