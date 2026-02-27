/**
 * AI Company - Queue Status (CLI Interface)
 *
 * CLI-based queue status and management
 */

import chalk from 'chalk';
import { getQueueService } from './QueueService.js';

/**
 * Display queue statistics
 */
export async function displayQueueStats(): Promise<void> {
  const queue = getQueueService();
  const stats = await queue.getStats();

  console.log(chalk.bold('\n📊 Queue Statistics\n'));

  const total = stats.waiting + stats.active + stats.completed + stats.failed + stats.delayed;

  console.log(`  Total Jobs:    ${total}`);
  console.log(`  Waiting:       ${chalk.yellow(stats.waiting)}`);
  console.log(`  Active:        ${chalk.green(stats.active)}`);
  console.log(`  Completed:     ${chalk.green(stats.completed)}`);
  console.log(`  Failed:        ${chalk.red(stats.failed)}`);
  console.log(`  Delayed:       ${chalk.yellow(stats.delayed)}\n`);
}

/**
 * Display recent jobs
 */
export async function displayRecentJobs(
  state: 'waiting' | 'active' | 'completed' | 'failed' = 'failed',
  limit = 10
): Promise<void> {
  const queue = getQueueService();
  const jobs = await queue.getJobsByState(state);

  const recentJobs = jobs.slice(0, limit);

  if (recentJobs.length === 0) {
    console.log(chalk.gray(`\n  No ${state} jobs\n`));
    return;
  }

  console.log(chalk.bold(`\n📋 Recent ${state} jobs (${recentJobs.length})\n`));

  for (const job of recentJobs) {
    const statusIcon = job.finishedOn ? '✅' : '🔄';
    const timestamp = new Date(job.timestamp || Date.now()).toLocaleString('zh-CN');

    console.log(`${statusIcon} ${chalk.cyan(job.id)}`);
    console.log(`   Task: ${job.data.taskId}`);
    console.log(`   Type: ${job.data.type}`);
    console.log(`   Created: ${timestamp}`);

    if (job.failedReason) {
      console.log(`   ${chalk.red('Error:')} ${job.failedReason}`);
    }

    if (job.returnvalue) {
      console.log(`   ${chalk.green('Result:')} ${JSON.stringify(job.returnvalue)}`);
    }

    console.log('');
  }
}

/**
 * Display job details
 */
export async function displayJobDetails(jobId: string): Promise<void> {
  const queue = getQueueService();
  const job = await queue.getJob(jobId);

  if (!job) {
    console.log(chalk.red(`\n❌ Job not found: ${jobId}\n`));
    return;
  }

  console.log(chalk.bold(`\n📋 Job Details: ${job.id}\n`));

  const state = job.finishedOn
    ? job.failedReason
      ? 'Failed'
      : 'Completed'
    : 'Active';

  console.log(`  State:     ${state}`);
  console.log(`  Task ID:   ${job.data.taskId}`);
  console.log(`  Type:      ${job.data.type}`);
  console.log(`  Priority:  ${job.opts.priority}`);
  console.log(`  Attempts:  ${job.attemptsMade}/${job.opts.attempts}`);

  const created = new Date(job.timestamp || Date.now()).toLocaleString('zh-CN');
  console.log(`  Created:   ${created}`);

  if (job.processedOn) {
    const processed = new Date(job.processedOn).toLocaleString('zh-CN');
    console.log(`  Processed: ${processed}`);
  }

  if (job.finishedOn) {
    const finished = new Date(job.finishedOn).toLocaleString('zh-CN');
    console.log(`  Finished:  ${finished}`);

    const duration = job.finishedOn - job.processedOn!;
    console.log(`  Duration:  ${duration}ms`);
  }

  if (job.failedReason) {
    console.log(`\n  ${chalk.red('Error:')} ${job.failedReason}`);
  }

  if (job.returnvalue) {
    console.log(`\n  ${chalk.green('Result:')}`);
    console.log(`  ${JSON.stringify(job.returnvalue, null, 2).split('\n').join('\n  ')}`);
  }

  if (job.data.context) {
    console.log(`\n  ${chalk.cyan('Context:')}`);
    console.log(`  ${JSON.stringify(job.data.context, null, 2).split('\n').join('\n  ')}`);
  }

  console.log('');
}

/**
 * Retry a failed job
 */
export async function retryJob(jobId: string): Promise<boolean> {
  const queue = getQueueService();
  const result = await queue.retryJob(jobId);

  if (result) {
    console.log(chalk.green(`\n✅ Job ${jobId} has been retried\n`));
    return true;
  } else {
    console.log(chalk.red(`\n❌ Failed to retry job ${jobId}\n`));
    return false;
  }
}

/**
 * Remove a job
 */
export async function removeJob(jobId: string): Promise<boolean> {
  const queue = getQueueService();
  const success = await queue.removeJob(jobId);

  if (success) {
    console.log(chalk.green(`\n✅ Job ${jobId} has been removed\n`));
    return true;
  } else {
    console.log(chalk.red(`\n❌ Failed to remove job ${jobId}\n`));
    return false;
  }
}

/**
 * Clean old jobs
 */
export async function cleanOldJobs(
  type: 'completed' | 'failed' = 'completed',
  olderThan = 24 * 60 * 60 * 1000 // 24 hours
): Promise<void> {
  const queue = getQueueService();
  await queue.clean(olderThan, 1000, type);
  console.log(chalk.green(`\n✅ Cleaned old ${type} jobs\n`));
}
