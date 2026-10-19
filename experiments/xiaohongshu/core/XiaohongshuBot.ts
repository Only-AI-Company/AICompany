/**
 * 小红书机器人
 *
 * 职责：
 * 1. 自动发布笔记
 * 2. 登录状态验证
 * 3. 错误处理和截图
 */

import { Page, BrowserContext } from 'playwright';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

/**
 * 笔记内容
 */
export interface NoteContent {
  title: string;
  content: string;
  tags?: string[];
}

export class XiaohongshuBot {
  constructor(private context: BrowserContext) {}

  /**
   * 验证登录状态
   */
  async isLoggedIn(): Promise<boolean> {
    let page: Page | null = null;

    try {
      console.log('🔍 验证登录状态...');

      page = await this.context.newPage();
      await page.goto('https://www.xiaohongshu.com', {
        waitUntil: 'networkidle',
        timeout: 15000,
      });

      // 等待页面加载
      await page.waitForTimeout(2000);

      // 检查是否有登录后的元素
      const hasAvatar = (await page.locator('.avatar, .user-avatar').count()) > 0;
      const hasPublishBtn = (await page.locator('text=/发布/').count()) > 0;

      const loggedIn = hasAvatar || hasPublishBtn;

      if (loggedIn) {
        console.log('✅ 登录状态有效\n');
      } else {
        console.log('❌ 登录已过期，请重新运行: npm run setup\n');
      }

      return loggedIn;
    } catch (error: any) {
      console.log('❌ 验证登录状态失败:', error.message, '\n');
      return false;
    } finally {
      await page?.close();
    }
  }

  /**
   * 自动发布笔记
   */
  async publish(note: NoteContent): Promise<boolean> {
    let page: Page | null = null;

    try {
      console.log('📝 正在打开发布页面...');

      page = await this.context.newPage();

      // 打开发布页面
      await page.goto('https://creator.xiaohongshu.com/publish/publish', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // 等待编辑器加载
      console.log('⏳ 等待编辑器加载...');
      await page.waitForTimeout(2000);

      // 查找输入框
      const titleInput = await this.findInputElement(page);
      if (!titleInput) {
        throw new Error('未找到输入框，页面可能已改版');
      }

      // 输入标题
      console.log(`✍️  输入标题: ${note.title}`);
      await titleInput.click();
      await page.keyboard.type(note.title, { delay: 50 });

      // 等待一下
      await page.waitForTimeout(500);

      // 输入正文
      console.log('✍️  输入正文...');

      // 尝试找到内容输入区域
      const contentSelectors = [
        '.note-editor',
        '[contenteditable="true"]',
        '.editor-content',
        '.content-input',
      ];

      let contentEditor = null;
      for (const selector of contentSelectors) {
        try {
          const element = page.locator(selector).first();
          if (await element.isVisible({ timeout: 1000 })) {
            contentEditor = element;
            break;
          }
        } catch {
          continue;
        }
      }

      if (contentEditor) {
        await contentEditor.click();
        await page.keyboard.type(note.content, { delay: 30 });
      } else {
        // 如果找不到单独的内容编辑区，尝试追加到标题后
        await page.keyboard.press('Enter');
        await page.keyboard.type(note.content, { delay: 30 });
      }

      // 预览一下
      console.log('⏳ 预览 3 秒后发布...');
      await page.waitForTimeout(3000);

      // 点击发布按钮
      console.log('🚀 点击发布按钮...');

      const published = await this.clickPublishButton(page);

      if (!published) {
        throw new Error('未找到发布按钮');
      }

      // 等待发布完成
      await page.waitForTimeout(3000);

      console.log('✅ 发布成功！\n');
      return true;
    } catch (error: any) {
      console.error('❌ 发布失败:', error.message, '\n');

      // 截图保存错误现场
      if (page) {
        await this.saveErrorScreenshot(page);
      }

      return false;
    } finally {
      await page?.close();
    }
  }

  /**
   * 查找输入元素
   */
  private async findInputElement(page: Page): Promise<any> {
    const selectors = [
      'input[placeholder*="标题"]',
      'input[placeholder*="填写标题"]',
      '.title-input',
      'input[type="text"]',
      '[contenteditable="true"]',
    ];

    for (const selector of selectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 1000 })) {
          return element;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * 点击发布按钮
   */
  private async clickPublishButton(page: Page): Promise<boolean> {
    const selectors = [
      'button:has-text("发布")',
      'button:has-text("立即发布")',
      '.publish-btn',
      '[class*="publish"] button',
      'button[type="submit"]',
      'button:has-text("确认")',
    ];

    for (const selector of selectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click();
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }

  /**
   * 保存错误截图
   */
  private async saveErrorScreenshot(page: Page): Promise<void> {
    const logsDir = join(process.cwd(), 'storage', 'logs');

    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    const filename = `error-${Date.now()}.png`;
    const filepath = join(logsDir, filename);

    await page.screenshot({
      path: filepath,
      fullPage: true,
    });

    console.log(`📸 错误截图已保存: ${filepath}\n`);
  }
}
