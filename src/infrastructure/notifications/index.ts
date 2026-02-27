/**
 * AI Company - Notification Layer
 *
 * 统一的通知层，支持多渠道消息发送和交互
 */

export { notificationService as default, notificationService } from './NotificationService.js';
export * from './NotificationService.js';
export * from './types.js';
export * from './NotificationChannel.js';
export * from './adapters/index.js';
