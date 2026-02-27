/**
 * AI Company - Interactive Prompts
 *
 * 使用 inquirer 实现交互式 CLI 输入
 */

import inquirer from 'inquirer';
import chalk from 'chalk';

/**
 * 确认操作
 */
export async function confirm(message: string, defaultValue = false): Promise<boolean> {
  const { result } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'result',
      message,
      default: defaultValue,
    },
  ]);
  return result;
}

/**
 * 输入文本
 */
export async function input(message: string, defaultValue = ''): Promise<string> {
  const { result } = await inquirer.prompt([
    {
      type: 'input',
      name: 'result',
      message,
      default: defaultValue,
    },
  ]);
  return result;
}

/**
 * 输入密码
 */
export async function password(message: string): Promise<string> {
  const { result } = await inquirer.prompt([
    {
      type: 'password',
      name: 'result',
      message,
      mask: '*',
    },
  ]);
  return result;
}

/**
 * 选择列表（单选）
 */
export async function select<T extends string>(
  message: string,
  choices: T[],
  defaultValue?: T
): Promise<T> {
  const { result } = await inquirer.prompt([
    {
      type: 'list',
      name: 'result',
      message,
      choices,
      default: defaultValue,
    },
  ]);
  return result;
}

/**
 * 多选列表
 */
export async function checkbox<T extends string>(
  message: string,
  choices: T[],
  validate: (choices: T[]) => boolean = () => true
): Promise<T[]> {
  const { result } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'result',
      message,
      choices,
      validate,
    },
  ]);
  return result;
}

/**
 * 自动补全输入
 * Note: inquirer doesn't have built-in autocomplete, using search list instead
 */
export async function autocomplete(
  message: string,
  choices: string[],
  suggestOnly = false
): Promise<string> {
  const { result } = await inquirer.prompt([
    {
      type: 'list',
      name: 'result',
      message,
      choices: suggestOnly ? choices : [...choices, 'Other (type custom value)'],
    },
  ]);

  if (result === 'Other (type custom value)' && !suggestOnly) {
    const { custom } = await inquirer.prompt([
      {
        type: 'input',
        name: 'custom',
        message: 'Enter custom value:',
      },
    ]);
    return custom;
  }

  return result;
}

/**
 * 编辑器输入（多行）
 */
export async function editor(message: string, defaultText = ''): Promise<string> {
  const { result } = await inquirer.prompt([
    {
      type: 'editor',
      name: 'result',
      message,
      default: defaultText,
    },
  ]);
  return result;
}

/**
 * 显示消息并等待确认
 */
export async function pause(message: string): Promise<void> {
  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: chalk.yellow(`${message} (按 Enter 继续)`),
    },
  ]);
}
