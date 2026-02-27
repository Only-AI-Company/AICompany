// AI Company - Cron Utilities
// Cron 表达式解析和时间计算工具

import type { ParsedCron } from './types.js';

// 解析 cron 表达式
// 格式: 分 时 日 月 周
// 示例格式: 0 9 * * * (每天9点), */5 * * * * (每5分钟)
export function parseCron(cronRule: string): ParsedCron {
  const parts = cronRule.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron rule: ${cronRule}. Expected 5 parts, got ${parts.length}`);
  }

  const [minute, hour, day, month, dow] = parts;

  // 验证各部分范围
  if (!isValidCronPart(minute, 0, 59)) throw new Error(`Invalid minute: ${minute}`);
  if (!isValidCronPart(hour, 0, 23)) throw new Error(`Invalid hour: ${hour}`);
  if (!isValidCronPart(day, 1, 31)) throw new Error(`Invalid day: ${day}`);
  if (!isValidCronPart(month, 1, 12)) throw new Error(`Invalid month: ${month}`);
  if (!isValidCronPart(dow, 0, 7)) throw new Error(`Invalid day of week: ${dow}`);

  return { minute, hour, day, month, dow: dow === '7' ? '0' : dow };
}

/**
 * 验证 cron 部分是否有效
 */
function isValidCronPart(part: string, min: number, max: number): boolean {
  // 支持的格式: *, */n, n, n-m, n,m,o
  const patterns = [
    /^\*$/,                    // *
    /^\*\/\d+$/,              // */n
    /^\d+$/,                  // n
    /^\d+-\d+$/,              // n-m
    /^[\d,-]+$/               // n,m,o
  ];

  if (!patterns.some(p => p.test(part))) {
    return false;
  }

  // 检查数值范围
  const values = expandCronPart(part);
  return values.every(v => v >= min && v <= max);
}

/**
 * 展开 cron 部分为具体值
 */
export function expandCronPart(part: string): number[] {
  if (part === '*') return [];

  // */n 格式
  const stepMatch = part.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = parseInt(stepMatch[1]);
    return [];
  }

  // n-m 格式
  const rangeMatch = part.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    const end = parseInt(rangeMatch[2]);
    const result = [];
    for (let i = start; i <= end; i++) result.push(i);
    return result;
  }

  // n,m,o 格式
  if (part.includes(',')) {
    return part.split(',').map(v => parseInt(v));
  }

  // 单个数字
  return [parseInt(part)];
}

/**
 * 检查 cron 表达式是否在指定时间匹配
 */
export function cronMatches(parsed: ParsedCron, date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const dow = date.getDay();

  return (
    matchesCronPart(parsed.minute, minute) &&
    matchesCronPart(parsed.hour, hour) &&
    matchesCronPart(parsed.day, day) &&
    matchesCronPart(parsed.month, month) &&
    matchesCronPart(parsed.dow, dow)
  );
}

/**
 * 检查 cron 部分是否匹配指定值
 */
function matchesCronPart(part: string, value: number): boolean {
  if (part === '*') return true;

  // */n 格式 (每n分钟/小时等)
  const stepMatch = part.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = parseInt(stepMatch[1]);
    return value % step === 0;
  }

  // n-m 格式
  const rangeMatch = part.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    const end = parseInt(rangeMatch[2]);
    return value >= start && value <= end;
  }

  // n,m,o 格式
  if (part.includes(',')) {
    const values = part.split(',').map(v => parseInt(v));
    return values.includes(value);
  }

  // 单个数字
  return parseInt(part) === value;
}

/**
 * 计算下次运行时间
 */
export function getNextRunTime(cronRule: string, from: Date = new Date()): Date {
  const parsed = parseCron(cronRule);

  // 从下一分钟开始检查
  let next = new Date(from);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  // 最多向后查找 4 年（防止死循环）
  const maxDate = new Date(from);
  maxDate.setFullYear(maxDate.getFullYear() + 4);

  while (next <= maxDate) {
    if (cronMatches(parsed, next)) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }

  throw new Error(`Cannot find next run time for cron rule: ${cronRule}`);
}

/**
 * 格式化 cron 表达式为可读文本
 */
export function formatCronRule(cronRule: string): string {
  const parsed = parseCron(cronRule);

  const formatPart = (part: string, type: 'minute' | 'hour' | 'day' | 'month' | 'dow'): string => {
    if (part === '*') {
      const unitMap = { minute: '每分钟', hour: '每小时', day: '每天', month: '每月', dow: '每周' };
      return unitMap[type];
    }
    return part;
  };

  const minute = formatPart(parsed.minute, 'minute');
  const hour = formatPart(parsed.hour, 'hour');
  const day = formatPart(parsed.day, 'day');
  const month = formatPart(parsed.month, 'month');
  const dow = formatPart(parsed.dow, 'dow');

  // 简化常见的组合
  if (parsed.day === '*' && parsed.dow === '*') {
    if (parsed.hour === '*' && parsed.minute === '*') return '每分钟';
    if (parsed.hour !== '*' && parsed.minute === '0') return `每天 ${parsed.hour} 点`;
    if (parsed.hour !== '*') return `每天 ${parsed.hour}:${parsed.minute.toString().padStart(2, '0')}`;
  }

  if (parsed.minute === '0' && parsed.hour === '*' && parsed.day === '*' && parsed.month === '*') {
    return `每小时`;
  }

  return `${minute} ${hour} ${day} ${month} ${dow}`;
}

/**
 * 验证 cron 表达式
 */
export function validateCronRule(cronRule: string): { valid: boolean; error?: string } {
  try {
    parseCron(cronRule);
    getNextRunTime(cronRule);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}
