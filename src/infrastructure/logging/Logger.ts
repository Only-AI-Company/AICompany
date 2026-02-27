/**
 * AI Company - Logger
 *
 * 使用 Pino 结构化日志
 */

import pino from 'pino';

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SILENT = 'silent',
}

/**
 * 日志配置
 */
export interface LoggerConfig {
  level?: LogLevel;
  pretty?: boolean;
  destination?: string;
}

/**
 * 创建 Pino Logger
 */
export function createLogger(config: LoggerConfig = {}): pino.Logger {
  const level = config.level || LogLevel.INFO;

  const options: pino.LoggerOptions = {
    level,
    formatters: {
      level: (label) => {
        return {
          level: label,
        };
      },
    },
    serializers: {
      error: (err) => {
        return {
          type: err.constructor.name,
          message: err.message,
          stack: err.stack,
          ...err,
        };
      },
    },
  };

  if (config.pretty || process.env.NODE_ENV !== 'production') {
    // 开发环境使用 pretty print
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(options);
}

// 默认 logger实例
let defaultLogger: pino.Logger | null = null;

/**
 * 获取默认 Logger
 */
export function getLogger(): pino.Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger({
      level: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
      pretty: process.env.NODE_ENV !== 'production',
    });
  }
  return defaultLogger;
}

/**
 * 创建带上下文的 Logger
 */
export function createNamedLogger(name: string, config?: LoggerConfig): pino.Logger {
  const base = createLogger(config);
  return base.child({ name });
}
