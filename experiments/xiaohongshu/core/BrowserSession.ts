/**
 * 浏览器会话管理
 *
 * 职责：
 * 1. 首次登录：打开浏览器让用户手动登录，保存 Cookies
 * 2. 加载会话：使用保存的 Cookies 自动登录
 * 3. 会话验证：检查登录状态
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { existsSync, mkdirSync, writeFile, readFile } from 'fs';
import { join } from 'path';

export interface SessionState {
  cookies: any[];
  localStorage: Record<string, string>;
}

export class BrowserSession {
  private browser?: Browser;
  private context?: BrowserContext;
  private cookiesFile: string;

  constructor() {
    // 确保 storage 目录存在
    const storageDir = join(process.cwd(), 'storage');
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }

    this.cookiesFile = join(storageDir, 'cookies.json');
  }

  /**
   * 首次登录：打开浏览器让用户手动登录
   */
  async login(): Promise<void> {
    console.log('🌐 正在启动浏览器...\n');

    this.browser = await chromium.launch({
      headless: false, // 显示浏览器窗口
      slowMo: parseInt(process.env.SLOW_MO || '100', 10), // 放慢操作，方便观察
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await this.context.newPage();

    console.log('📱 正在打开小红书...\n');

    try {
      await page.goto('https://www.xiaohongshu.com', {
        waitUntil: 'networkidle',
        timeout: parseInt(process.env.TIMEOUT || '30000', 10),
      });
    } catch (error) {
      console.log('⚠️  页面加载超时，继续等待用户操作...\n');
    }

    console.log('════════════════════════════════════════════════════════════');
    console.log('  请在浏览器中完成登录');
    console.log('  登录成功后，程序会自动检测并保存 Cookies');
    console.log('  如果 30 秒内没有检测到登录成功，请按 Ctrl+C 退出后重试');
    console.log('════════════════════════════════════════════════════════════\n');

    // 等待用户登录
    const isLoggedIn = await this.waitForLogin(page);

    if (!isLoggedIn) {
      console.log('\n❌ 登录超时或失败');
      console.log('提示：');
      console.log('  1. 请确保已完成登录');
      console.log('  2. 如果登录成功但未检测到，请等待几秒后再次运行 npm run setup');
      await this.browser.close();
      throw new Error('登录超时');
    }

    console.log('\n✅ 检测到登录成功！');

    // 保存 Cookies
    await this.saveCookies();

    console.log('🍪 Cookies 已保存到 storage/cookies.json');
    console.log('👋 下次可以直接使用保存的会话进行自动发布\n');

    await this.browser.close();
  }

  /**
   * 等待用户登录
   */
  private async waitForLogin(page: Page): Promise<boolean> {
    const maxWaitTime = 30; // 最多等待 30 秒
    const checkInterval = 500; // 每 500ms 检查一次

    for (let i = 0; i < maxWaitTime * (1000 / checkInterval); i++) {
      await page.waitForTimeout(checkInterval);

      // 每 2 秒输出一个进度点
      if (i % 4 === 0) {
        process.stdout.write('.');
      }

      // 检查登录状态（多种方式）
      const loggedIn = await this.checkLoginStatus(page);
      if (loggedIn) {
        console.log(''); // 换行
        return true;
      }
    }

    return false;
  }

  /**
   * 检查登录状态
   */
  private async checkLoginStatus(page: Page): Promise<boolean> {
    try {
      // 方式1：检查是否有用户头像
      const hasAvatar =
        (await page.locator('.avatar, .user-avatar, [class*="avatar"]').count()) > 0;

      if (hasAvatar) return true;

      // 方式2：检查是否有发布按钮
      const hasPublishBtn = (await page.locator('text=/发布|Publish/').count()) > 0;

      if (hasPublishBtn) return true;

      // 方式3：检查 URL 变化（登录后会跳转）
      const url = page.url();
      if (url.includes('explore') || url.includes('feed')) return true;

      return false;
    } catch {
      return false;
    }
  }

  /**
   * 加载已保存的会话
   */
  async loadSession(): Promise<BrowserContext> {
    // 检查是否有保存的 cookies
    if (!existsSync(this.cookiesFile)) {
      throw new Error(
        '未找到保存的登录信息\n' +
          '请先运行: npm run setup\n' +
          '在打开的浏览器中完成登录，Cookies 会自动保存'
      );
    }

    console.log('🍪 正在加载已保存的会话...\n');

    this.browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      storageState: this.cookiesFile, // 加载保存的 cookies
    });

    return this.context;
  }

  /**
   * 保存 Cookies 和 LocalStorage
   */
  private async saveCookies(): Promise<void> {
    if (!this.context) return;

    const cookies = await this.context.cookies();

    const localStorage = await this.context.evaluate(() => {
      const storage: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          storage[key] = localStorage.getItem(key) || '';
        }
      }
      return storage;
    });

    const state: SessionState = { cookies, localStorage };

    await writeFile(this.cookiesFile, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
    this.context = undefined;
  }

  /**
   * 获取当前上下文
   */
  getContext(): BrowserContext | undefined {
    return this.context;
  }
}
