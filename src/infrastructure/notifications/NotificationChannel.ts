/**
 * AI Company - Notification Channel Interface
 *
 * 通知渠道抽象接口，所有渠道适配器必须实现
 */

import type {
  NotificationMessage,
  SendResult,
  InteractionResponse,
  InteractionType
} from './types.js';

/**
 * 渠道能力
 */
export interface ChannelCapabilities {
  // 支持的交互类型
  interactions: InteractionType[];

  // 消息格式
  supportsHTML: boolean;
  supportsMarkdown: boolean;

  // 附件
  supportsAttachments: boolean;
  supportedAttachmentTypes: string[];

  // 其他
  supportsEditing: boolean;    // 是否支持编辑已发送消息
  supportsDeleting: boolean;   // 是否支持删除消息
  maxMessageLength: number;
}

/**
 * 渠道适配器接口
 */
export interface INotificationChannel {
  /**
   * 渠道类型
   */
  readonly type: string;

  /**
   * 获取渠道能力
   */
  getCapabilities(): ChannelCapabilities;

  /**
   * 发送消息
   */
  send(message: NotificationMessage): Promise<SendResult>;

  /**
   * 编辑消息（如果渠道支持）
   */
  edit?(messageId: string, newContent: string, chatId?: string | number): Promise<SendResult>;

  /**
   * 删除消息（如果渠道支持）
   */
  delete?(messageId: string, chatId?: string | number): Promise<boolean>;

  /**
   * 处理交互响应
   */
  handleInteraction?(response: InteractionResponse): Promise<void>;

  /**
   * 开始监听交互响应
   */
  startListening?(callback: (response: InteractionResponse) => void): void;

  /**
   * 停止监听
   */
  stopListening?(): void;
}

/**
 * 渠道工厂接口
 */
export interface IChannelFactory {
  create(channelType: string): INotificationChannel | null;
  register(channelType: string, channel: INotificationChannel): void;
}
