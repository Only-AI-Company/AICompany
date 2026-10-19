/**
 * 小红书自动化工作流
 *
 * 职责：
 * 1. 串联各个组件，完成完整流程
 * 2. 错误处理和状态管理
 * 3. 日志输出
 */

import { ContentGenerator } from './ContentGenerator.js';
import { PostRepository } from './PostRepository.js';
import { BrowserSession } from './BrowserSession.js';
import { XiaohongshuBot, type NoteContent } from './XiaohongshuBot.js';

export class XiaohongshuWorkflow {
  private generator: ContentGenerator;
  private repository: PostRepository;
  private session: BrowserSession;

  constructor() {
    this.generator = new ContentGenerator();
    this.repository = new PostRepository();
    this.session = new BrowserSession();
  }

  /**
   * 首次设置：登录并保存会话
   */
  async setup(): Promise<void> {
    console.log('═══════════════════════════════════════════════════');
    console.log('          小红书自动化 - 首次登录设置');
    console.log('═══════════════════════════════════════════════════\n');

    try {
      await this.session.login();
      console.log('═══════════════════════════════════════════════════');
      console.log('                  设置完成！');
      console.log('  现在可以使用 npm run publish 命令自动发布了');
      console.log('═══════════════════════════════════════════════════\n');
    } catch (error: any) {
      console.log('\n❌ 设置失败:', error.message);
      throw error;
    }
  }

  /**
   * 完整工作流：生成 → 保存 → 发布
   */
  async createAndPublish(topic: string): Promise<void> {
    console.log('═══════════════════════════════════════════════════');
    console.log(`      小红书自动化 - "${topic}"`);
    console.log('═══════════════════════════════════════════════════\n');

    try {
      // 步骤 1: 生成内容
      console.log('📋 步骤 1/4: AI 生成内容\n');
      const generated = await this.generator.generate({
        platform: 'xiaohongshu',
        topic,
      });

      // 步骤 2: 保存到数据库
      console.log('\n📋 步骤 2/4: 保存到数据库\n');
      const post = this.repository.create({
        topic,
        content: generated.content,
        platform: generated.platform,
        tokens: generated.tokens,
        model: generated.model,
      });
      console.log(`💾 已保存 (ID: ${post.id})`);

      // 显示预览
      this.showPreview(generated.content);

      // 步骤 3: 加载会话并验证
      console.log('\n📋 步骤 3/4: 验证登录状态\n');
      const context = await this.session.loadSession();
      const bot = new XiaohongshuBot(context);

      const loggedIn = await bot.isLoggedIn();
      if (!loggedIn) {
        throw new Error('会话已过期，请重新运行: npm run setup');
      }

      // 步骤 4: 发布
      console.log('\n📋 步骤 4/4: 自动发布\n');
      const note = this.parseContent(generated.content);
      const success = await bot.publish(note);

      // 更新状态
      if (success) {
        this.repository.markAsPublished(post.id);
        console.log('═══════════════════════════════════════════════════');
        console.log('                  🎉 完成！');
        console.log(`  文章 ID: ${post.id}`);
        console.log('  状态: 已发布');
        console.log('═══════════════════════════════════════════════════\n');
      } else {
        this.repository.updateStatus(post.id, 'failed', '发布失败');
        console.log('═══════════════════════════════════════════════════');
        console.log('                  ❌ 失败');
        console.log('  请查看错误截图: storage/logs/');
        console.log('═══════════════════════════════════════════════════\n');
      }
    } catch (error: any) {
      console.log('\n❌ 执行失败:', error.message, '\n');
      throw error;
    } finally {
      await this.session.close();
    }
  }

  /**
   * 只生成不发布
   */
  async generateOnly(topic: string): Promise<void> {
    console.log('═══════════════════════════════════════════════════');
    console.log(`   AI 生成内容 - "${topic}"`);
    console.log('═══════════════════════════════════════════════════\n');

    const generated = await this.generator.generate({
      platform: 'xiaohongshu',
      topic,
    });

    const post = this.repository.create({
      topic,
      content: generated.content,
      platform: generated.platform,
      tokens: generated.tokens,
      model: generated.model,
    });

    console.log(`\n💾 已保存到数据库 (ID: ${post.id})`);

    this.showPreview(generated.content);
    console.log('');
  }

  /**
   * 查看历史记录
   */
  showHistory(limit: number = 10): void {
    const posts = this.repository.findAll({ limit });

    console.log('═══════════════════════════════════════════════════');
    console.log('                 历史记录');
    console.log('═══════════════════════════════════════════════════\n');

    if (posts.length === 0) {
      console.log('暂无记录\n');
      return;
    }

    const stats = this.repository.getStats();

    console.log(`总计: ${stats.total} | 已发布: ${stats.published} | 草稿: ${stats.draft}\n`);

    posts.forEach((post, index) => {
      const statusIcon =
        {
          draft: '📝',
          pending: '⏳',
          published: '✅',
          failed: '❌',
        }[post.status] || '❓';

      const date = new Date(post.createdAt).toLocaleString('zh-CN');

      console.log(`${index + 1}. ${statusIcon} ${post.topic}`);
      console.log(`   ID: ${post.id}`);
      console.log(`   时间: ${date}`);
      console.log(`   状态: ${post.status}\n`);
    });
  }

  /**
   * 显示内容预览
   */
  private showPreview(content: string): void {
    console.log('\n--- 内容预览 ---');
    console.log(content);
    console.log('--- 预览结束 ---\n');
  }

  /**
   * 解析生成的内容
   */
  private parseContent(content: string): NoteContent {
    const lines = content.trim().split('\n');

    // 尝试提取标题
    let title = '';
    let contentStart = 0;

    // 查找标题（第一行，或者以"标题："开头的行）
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();

      if (line.startsWith('标题：') || line.startsWith('标题:')) {
        title = line.replace(/^标题[：:]\s*/, '');
        contentStart = i + 1;
        break;
      } else if (line.length > 0 && line.length < 50 && !line.includes('：')) {
        // 可能是标题
        title = line;
        contentStart = i + 1;
        break;
      }
    }

    // 如果没找到标题，使用前 20 个字
    if (!title && lines.length > 0) {
      title = lines[0].substring(0, 20);
      contentStart = 1;
    }

    // 正文是剩余的内容
    const body = lines.slice(contentStart).join('\n').trim();

    // 提取标签
    const tagMatch = body.match(/#[^\s#]+/g);
    const tags = tagMatch || [];

    // 移除标签行后的内容
    let cleanContent = body;
    const tagIndex = body.search(/\n#[^\s#]/);
    if (tagIndex > 0) {
      cleanContent = body.substring(0, tagIndex).trim();
    }

    return {
      title: title || '未命名笔记',
      content: cleanContent || content,
      tags,
    };
  }
}
