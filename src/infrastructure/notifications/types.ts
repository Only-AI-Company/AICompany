/**
 * AI Company - Notification Types
 *
 * 统一的消息格式定义，支持所有渠道
 */

/**
 * 渠道类型
 */
export type ChannelType = 'telegram' | 'cli' | 'web' | 'email';

/**
 * 交互类型
 */
export type InteractionType =
  | 'none'           // 无交互，纯消息
  | 'confirm'        // 确认式：是/否
  | 'select'         // 选择式：多选一
  | 'input'          // 输入式：等待文本输入
  | 'button'         // 按钮式：自定义按钮
  | 'inline';        // 内联按钮（Telegram）

/**
 * 消息优先级
 */
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * 消息状态
 */
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'failed';

/**
 * 用户标识
 */
export interface UserIdentity {
  channel: ChannelType;
  userId: string;
  chatId?: string | number;
  threadId?: string;
}

/**
 * 按钮选项
 */
export interface ButtonOption {
  id: string;           // 按钮 ID，用于回调
  label: string;         // 按钮文本
  style?: 'default' | 'primary' | 'danger' | 'success';
  metadata?: Record<string, any>;
}

/**
 * 交互配置
 */
export interface InteractionConfig {
  type: InteractionType;
  timeout?: number;      // 超时时间（毫秒）
  correlationId?: string; // 关联 ID，用于回调匹配
  placeholder?: string;   // 输入提示（input 类型）
  options?: ButtonOption[]; // 按钮/选项列表
  multiSelect?: boolean;  // 是否多选（select 类型）
}

/**
 * 附件
 */
export interface Attachment {
  type: 'image' | 'document' | 'video' | 'audio';
  url?: string;
  path?: string;
  filename?: string;
  mimeType?: string;
}

/**
 * 格式化内容
 */
export interface FormattedContent {
  text: string;
  html?: string;
  markdown?: string;
}

/**
 * 统一消息格式
 */
export interface NotificationMessage {
  id?: string;           // 消息 ID（可选）
  to: UserIdentity;      // 收件人
  content: FormattedContent;

  // 可选字段
  subject?: string;      // 标题/主题
  priority?: MessagePriority;
  status?: MessageStatus;

  // 交互
  interaction?: InteractionConfig;

  // 附件
  attachments?: Attachment[];

  // 元数据
  metadata?: Record<string, any>;

  // 时间戳
  timestamp?: number;
  expiresAt?: number;
}

/**
 * 发送结果
 */
export interface SendResult {
  success: boolean;
  messageId?: string;
  channelMessageId?: string; // 渠道原生消息 ID
  error?: string;
}

/**
 * 交互响应
 */
export interface InteractionResponse {
  correlationId: string;  // 关联 ID
  userIdentity: UserIdentity;
  action: string;         // 用户选择的 action/button id
  data?: any;            // 额外数据（如输入的文本）
  timestamp: number;
}
