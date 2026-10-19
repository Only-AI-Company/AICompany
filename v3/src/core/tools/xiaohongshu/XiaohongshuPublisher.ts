/**
 * AI Company v3 - 小红书发布工具
 *
 * 功能：
 * 1. 浏览器自动化发布
 * 2. Cookie 会话管理
 * 3. 内容自动填充
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface XiaohongshuPost {
  title: string;
  content: string;
  tags?: string[];
  images?: string[];
}

export interface PublishOptions {
  headless?: boolean;
  cookiesPath?: string;
  screenshotPath?: string;
}

export interface PublishResult {
  success: boolean;
  postUrl?: string;
  error?: string;
  screenshot?: string;
}

// ============================================================================
// Xiaohongshu Publisher
// ============================================================================

export class XiaohongshuPublisher {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private cookiesPath: string;

  constructor(cookiesPath: string = 'storage/xiaohongshu-cookies.json') {
    this.cookiesPath = path.resolve(cookiesPath);
  }

  /**
   * 初始化浏览器
   */
  async init(options: PublishOptions = {}): Promise<void> {
    const { headless = false } = options;

    console.log('[小红书] 启动浏览器...');

    this.browser = await chromium.launch({
      headless,
      channel: 'chrome', // 使用系统 Chrome
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });

    // 加载保存的 Cookies
    await this.loadCookies();

    this.page = await this.context.newPage();

    console.log('[小红书] 浏览器已启动');
  }

  /**
   * 首次登录（保存 Cookies）
   */
  async login(): Promise<void> {
    if (!this.context) {
      await this.init({ headless: false });
    }

    if (!this.page) {
      this.page = await this.context!.newPage();
    }

    console.log('[小红书] 打开登录页面...');

    await this.page.goto('https://www.xiaohongshu.com/explore');
    await this.page.waitForLoadState('networkidle');

    console.log('[小红书] 请在浏览器中完成登录...');
    console.log('[小红书] 登录完成后，按回车键继续...');

    // 等待用户按回车
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve());
    });

    // 保存 Cookies
    await this.saveCookies();

    console.log('[小红书] Cookies 已保存');
  }

  /**
   * 发布笔记
   */
  async publish(post: XiaohongshuPost, options: PublishOptions = {}): Promise<PublishResult> {
    try {
      if (!this.page) {
        await this.init(options);
      }

      const page = this.page!;

      console.log('[小红书] 开始发布笔记...');
      console.log(`[小红书] 标题: ${post.title}`);

      // 打开发布页面
      await page.goto('https://creator.xiaohongshu.com/publish/publish');
      await page.waitForLoadState('networkidle');

      // 等待编辑器加载
      await page.waitForSelector('textarea[placeholder*="填写标题"]', { timeout: 10000 });

      // 填写标题
      const titleSelector = 'textarea[placeholder*="填写标题"]';
      await page.fill(titleSelector, post.title);
      await this.delay(500);

      // 填写内容
      const contentSelector = 'div[contenteditable="true"]';
      const contentEditor = await page.$(contentSelector);
      if (contentEditor) {
        await contentEditor.click();
        await this.delay(200);
        await page.keyboard.type(post.content);
        await this.delay(500);
      }

      // 添加话题标签
      if (post.tags && post.tags.length > 0) {
        for (const tag of post.tags) {
          await page.click('text=#');
          await this.delay(200);
          await page.keyboard.type(`#${tag}`);
          await this.delay(300);
          // 选择第一个推荐话题
          await page.keyboard.press('Enter');
          await this.delay(300);
        }
      }

      console.log('[小红书] 内容已填写');

      // 上传图片（如果有）
      if (post.images && post.images.length > 0) {
        await this.uploadImages(post.images);
      }

      // 截图
      if (options.screenshotPath) {
        await page.screenshot({ path: options.screenshotPath, fullPage: true });
      }

      console.log('[小红书] 请检查内容，确认无误后点击发布按钮');
      console.log('[小红书] 发布完成后按回车键...');

      // 等待用户手动确认发布
      await new Promise<void>((resolve) => {
        process.stdin.once('data', () => resolve());
      });

      // 等待发布完成
      await this.delay(2000);

      // 获取发布后的 URL
      const url = page.url();

      console.log('[小红书] 笔记已发布');

      return {
        success: true,
        postUrl: url,
      };
    } catch (error: any) {
      console.error('[小红书] 发布失败:', error.message);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 上传图片
   */
  private async uploadImages(imagePaths: string[]): Promise<void> {
    if (!this.page) return;

    console.log(`[小红书] 上传 ${imagePaths.length} 张图片...`);

    // 查找上传按钮
    const uploadInput = await this.page.$('input[type="file"]');

    if (uploadInput) {
      // 上传所有图片
      await uploadInput.setInputFiles(imagePaths);

      // 等待上传完成
      await this.delay(2000);

      console.log('[小红书] 图片上传完成');
    } else {
      console.warn('[小红书] 未找到上传按钮');
    }
  }

  /**
   * 保存 Cookies
   */
  private async saveCookies(): Promise<void> {
    if (!this.context) return;

    const cookies = await this.context.cookies();
    const dir = path.dirname(this.cookiesPath);

    // 确保目录存在
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(this.cookiesPath, JSON.stringify(cookies, null, 2));

    console.log(`[小红书] Cookies 已保存到: ${this.cookiesPath}`);
  }

  /**
   * 加载 Cookies
   */
  private async loadCookies(): Promise<void> {
    if (!this.context) return;

    try {
      const data = await fs.readFile(this.cookiesPath, 'utf8');
      const cookies = JSON.parse(data);

      await this.context.addCookies(cookies);

      console.log(`[小红书] Cookies 已加载`);
    } catch (error) {
      console.log('[小红书] 未找到保存的 Cookies，需要登录');
    }
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
      this.context = undefined;
      this.page = undefined;
    }
  }

  /**
   * 延迟工具
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 检查登录状态
   */
  async isLoggedIn(): Promise<boolean> {
    if (!this.page) {
      await this.init({ headless: true });
    }

    try {
      const page = this.page!;

      await page.goto('https://www.xiaohongshu.com/explore');
      await page.waitForLoadState('networkidle');

      // 检查是否有登录按钮
      const loginButton = await page.$('text=登录');

      return !loginButton;
    } catch (error) {
      return false;
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 创建发布器实例
 */
export async function createPublisher(cookiesPath?: string): Promise<XiaohongshuPublisher> {
  const publisher = new XiaohongshuPublisher(cookiesPath);
  await publisher.init();
  return publisher;
}

/**
 * 一次性发布（不保持会话）
 */
export async function publishOnce(
  post: XiaohongshuPost,
  cookiesPath: string = 'storage/xiaohongshu-cookies.json'
): Promise<PublishResult> {
  const publisher = new XiaohongshuPublisher(cookiesPath);

  try {
    await publisher.init({ headless: false });
    const result = await publisher.publish(post);
    return result;
  } finally {
    await publisher.close();
  }
}
