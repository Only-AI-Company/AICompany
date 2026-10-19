/**
 * AI Company v2 - Chat Tools
 *
 * 对话交互工具：chat, get_conversation_history
 */

import type { Tool, ToolContext, ToolResult } from '../types.js';
import type { ToolRegistry } from '../ToolRegistry.js';
import { getProvider, callWithRetry, type ProviderResponse } from '../../ai/AIProvider.js';
import { getConfigManager } from '../../../config/ConfigManager.js';
import { getDatabase } from '../../../db/Database.js';

/**
 * 聊天对话（AI 驱动）
 */
const chatTool: Tool = {
  name: 'chat',
  description: `与用户进行自然对话。

## 数据库表结构 (chat_messages 表)

\`\`sql
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  direction TEXT NOT NULL,        -- in (用户输入) 或 out (AI 输出)
  employee_id TEXT,              -- AI 员工 ID (direction=out 时使用)
  external_chat_id TEXT,
  external_user_id TEXT,
  created_at INTEGER NOT NULL    -- 整数时间戳，毫秒
);
\`\`

## 使用场景

- 问候和礼貌用语（如"你好"、"谢谢"）
- 闲聊和寒暄
- 不明确的具体请求
- 回答一般性问题
- 当其他工具都不适用时

## 注意事项

- 如果用户想查询信息，优先使用查询工具（query_system_status、list_tasks 等）
- 如果用户想执行任务，使用 create_task 或 create_goal
- 只有在没有明确意图时才使用 chat

本工具不直接操作数据库，对话记录由系统自动保存。`,
  category: 'chat',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: '用户输入的消息',
        required: true,
      },
      context: {
        type: 'string',
        description: '对话上下文（可选）',
      },
    },
    required: ['message'],
  },
  enabled: true,
  async handler(
    input: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const userMessage = (input.message as string) || context.inputMessage || '你好';
      const conversationContext = input.context || '';

      // 获取配置
      const configManager = getConfigManager();
      const config = configManager.getConfig();
      const ownerName = config?.ownerName || '用户';
      const companyName = config?.companyName || 'AI Company';

      // 构建对话 prompt
      const systemPrompt = `你是 ${companyName} 的 AI 助手，正在与${ownerName}对话。
你的特点：
1. 友好、专业、乐于助人
2. 回答简洁明了，重点突出
3. 如果不知道答案，诚实说明
4. 善于倾听，理解用户需求后给出针对性回复

当前对话上下文：${conversationContext || '无额外上下文'}`;

      const userPrompt = `${ownerName}说：${userMessage}

请用自然、友好的语气回复${ownerName}。`;

      // 调用 LLM 生成回复
      const provider = getProvider();
      const response: ProviderResponse = await callWithRetry(
        () => provider.messages(
          [{ role: 'user', content: userPrompt }],
          systemPrompt
        ),
        {
          maxRetries: 2,
          initialDelay: 500,
        }
      );

      const aiResponse = response.content;

      // 记录活动日志
      try {
        const db = getDatabase();
        db.logActivity({
          eventType: 'chat',
          actor: 'ai_assistant',
          action: 'responded',
          context: {
            userInput: userMessage.substring(0, 100),
            userId: context.userId || 'unknown',
            chatId: context.chatId || 'unknown',
          },
          result: {
            responseLength: aiResponse.length,
            tokenUsage: response.usage,
          },
        });
      } catch (logError) {
        console.error('[ChatTool] 记录活动日志失败:', logError);
      }

      return {
        success: true,
        data: {
          message: aiResponse,
          userInput: userMessage,
        },
        message: aiResponse,
      };
    } catch (error: any) {
      console.error('[ChatTool] 生成回复失败:', error.message);

      // Fallback: 简单回复
      const configManager = getConfigManager();
      const config = configManager.getConfig();
      const ownerName = config?.ownerName || '用户';

      const fallbackResponse = `你好${ownerName}！我暂时无法处理复杂的对话，但我会尽力帮助你。你能再说得具体一些吗？`;

      return {
        success: true,
        data: { message: fallbackResponse, fallback: true },
        message: fallbackResponse,
      };
    }
  },
};

/**
 * 获取对话历史
 */
const getConversationHistoryTool: Tool = {
  name: 'get_conversation_history',
  description: `获取当前会话的对话历史记录。

## 数据库表结构 (chat_messages 表)

\`\`sql
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  direction TEXT NOT NULL,        -- in (用户输入) 或 out (AI 输出)
  employee_id TEXT,
  created_at INTEGER NOT NULL
);
\`\`

用于回顾之前的对话内容或总结会话要点。

本工具从上下文中获取历史，不直接查询数据库。`,
  category: 'chat',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: '返回消息数量限制',
        default: 20,
      },
      includeSystem: {
        type: 'boolean',
        description: '是否包含系统消息',
        default: false,
      },
    },
  },
  enabled: true,
  async handler(
    input: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      // 从上下文中获取历史
      let history = context.history || [];

      // 过滤系统消息
      if (!input.includeSystem) {
        history = history.filter(h => h.role !== 'system');
      }

      // 限制数量
      if (input.limit) {
        history = history.slice(-input.limit);
      }

      return {
        success: true,
        data: {
          history,
          count: history.length,
        },
        message: `共 ${history.length} 条对话记录`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `获取对话历史失败：${error.message}`,
      };
    }
  },
};

/**
 * 初始化 Chat 工具
 */
export function initChatTools(registry: ToolRegistry): void {
  registry.register(chatTool);
  registry.register(getConversationHistoryTool);
}
