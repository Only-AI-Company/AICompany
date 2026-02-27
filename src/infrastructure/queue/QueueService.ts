/**
 * AI Company - Bull Queue Service
 *
 * Task queue using Bull for async job processing
 */

import Queue from 'bull';
import type { Job, JobOptions } from 'bull';

// ============================================================================
// Job Types
// ============================================================================

export interface TaskJobData {
  taskId: string;
  employeeId?: string;
  type: string;
  description: string;
  priority?: number;
  attempts?: number;
  context?: Record<string, any>;
}

export interface TaskJobResult {
  success: boolean;
  output?: string;
  error?: string;
  duration?: number;
}

// ============================================================================
// Queue Service
// ============================================================================

export class QueueService {
  private taskQueue: Queue.Queue<TaskJobData>;
  private processing = new Map<string, Job<TaskJobData>>();

  constructor() {
    // Initialize Redis connection (for production, use real Redis)
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
    };

    // Create task queue
    this.taskQueue = new Queue<TaskJobData>('ai-company-tasks', {
      redis: redisConfig,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });

    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Set up queue event handlers
   */
  private setupEventHandlers(): void {
    // Job completed
    this.taskQueue.on('completed', (job: Job<TaskJobData>, result: TaskJobResult) => {
      console.log(`✅ Job completed: ${job.id} (${job.data.taskId})`);
      this.processing.delete(String(job.id));
    });

    // Job failed
    this.taskQueue.on('failed', (job: Job<TaskJobData>, error: Error) => {
      console.error(`❌ Job failed: ${job.id} - ${error.message}`);
      if (job?.id) this.processing.delete(String(job.id));
    });

    // Job started
    this.taskQueue.on('active', (job: Job<TaskJobData>) => {
      console.log(`▶️  Job started: ${job.id}`);
      if (job?.id) this.processing.set(String(job.id), job);
    });

    // Job stalled
    this.taskQueue.on('stalled', (job: Job<TaskJobData>) => {
      console.warn(`⚠️  Job stalled: ${job.id}`);
    });
  }

  /**
   * Add a task to the queue
   */
  async addTask(data: TaskJobData, options?: JobOptions): Promise<Job<TaskJobData>> {
    const job = await this.taskQueue.add(data, {
      priority: data.priority || 5,
      ...options,
    });

    console.log(`📝 Task added to queue: ${job.id} (${data.taskId})`);
    return job;
  }

  /**
   * Add multiple tasks to the queue
   */
  async addBulkTasks(
    tasks: Array<{ data: TaskJobData; options?: JobOptions }>
  ): Promise<Job<TaskJobData>[]> {
    return await this.taskQueue.addBulk(tasks);
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const counts = await this.taskQueue.getJobCounts();
    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
    };
  }

  /**
   * Get jobs by state
   */
  async getJobsByState(state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'): Promise<Job<TaskJobData>[]> {
    return await this.taskQueue.getJobs([state]) as Job<TaskJobData>[];
  }

  /**
   * Get a specific job
   */
  async getJob(jobId: string): Promise<Job<TaskJobData> | null> {
    const job = await this.taskQueue.getJob(jobId);
    return job || null;
  }

  /**
   * Remove a job from the queue
   */
  async removeJob(jobId: string): Promise<boolean> {
    const job = await this.taskQueue.getJob(jobId);
    if (job) {
      await job.remove();
      return true;
    }
    return false;
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<Job<TaskJobData> | null> {
    const job = await this.taskQueue.getJob(jobId);
    if (job) {
      await job.retry();
      return job;
    }
    return null;
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    await this.taskQueue.pause();
    console.log('⏸️  Queue paused');
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    await this.taskQueue.resume();
    console.log('▶️  Queue resumed');
  }

  /**
   * Clean old jobs from the queue
   */
  async clean(
    grace: number = 5000,
    limit: number = 1000,
    type: 'completed' | 'failed' = 'completed'
  ): Promise<void> {
    await this.taskQueue.clean(grace, limit as any, type as any);
    console.log(`🧹 Cleaned ${type} jobs older than ${grace}ms`);
  }

  /**
   * Get the underlying Bull queue instance
   */
  getQueue(): Queue.Queue<TaskJobData> {
    return this.taskQueue;
  }

  /**
   * Close the queue and cleanup
   */
  async close(): Promise<void> {
    await this.taskQueue.close();
    console.log('🔒 Queue closed');
  }

  /**
   * Obliterate the queue (remove all jobs)
   */
  async obliterate(): Promise<void> {
    await this.taskQueue.obliterate({ force: true });
    console.log('💥 Queue obliterated');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let queueServiceInstance: QueueService | null = null;

export function getQueueService(): QueueService {
  if (!queueServiceInstance) {
    queueServiceInstance = new QueueService();
  }
  return queueServiceInstance;
}

export async function closeQueueService(): Promise<void> {
  if (queueServiceInstance) {
    await queueServiceInstance.close();
    queueServiceInstance = null;
  }
}
