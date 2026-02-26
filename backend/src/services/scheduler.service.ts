// Scheduler service - centralized scheduling configuration and management
import cron from 'node-cron';
import { logger } from '../utils/logger.js';

export interface ScheduledJob {
  name: string;
  schedule: string;
  task: () => Promise<void>;
  enabled: boolean;
}

export class SchedulerService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private jobConfigs: Map<string, ScheduledJob> = new Map();

  /**
   * Register a scheduled job
   */
  registerJob(config: ScheduledJob): void {
    if (this.jobConfigs.has(config.name)) {
      logger.warn(`Scheduler: job '${config.name}' already registered, skipping`);
      return;
    }

    this.jobConfigs.set(config.name, config);
    logger.info(`Scheduler: registered job '${config.name}' with schedule '${config.schedule}'`);
  }

  /**
   * Start a specific job by name
   */
  startJob(name: string): boolean {
    const config = this.jobConfigs.get(name);
    if (!config) {
      logger.error(`Scheduler: job '${name}' not found`);
      return false;
    }

    if (!config.enabled) {
      logger.info(`Scheduler: job '${name}' is disabled, not starting`);
      return false;
    }

    if (this.jobs.has(name)) {
      logger.warn(`Scheduler: job '${name}' already running`);
      return false;
    }

    try {
      const task = cron.schedule(config.schedule, async () => {
        logger.info(`Scheduler: executing job '${name}'`);
        try {
          await config.task();
        } catch (error) {
          logger.error(`Scheduler: job '${name}' failed`, { error });
        }
      });

      this.jobs.set(name, task);
      logger.info(`Scheduler: started job '${name}'`);
      return true;
    } catch (error) {
      logger.error(`Scheduler: failed to start job '${name}'`, { error });
      return false;
    }
  }

  /**
   * Stop a specific job by name
   */
  stopJob(name: string): boolean {
    const task = this.jobs.get(name);
    if (!task) {
      logger.warn(`Scheduler: job '${name}' not running`);
      return false;
    }

    task.stop();
    this.jobs.delete(name);
    logger.info(`Scheduler: stopped job '${name}'`);
    return true;
  }

  /**
   * Start all registered jobs
   */
  startAll(): void {
    logger.info('Scheduler: starting all registered jobs');
    for (const [name] of this.jobConfigs) {
      this.startJob(name);
    }
  }

  /**
   * Stop all running jobs
   */
  stopAll(): void {
    logger.info('Scheduler: stopping all jobs');
    for (const [name, task] of this.jobs) {
      task.stop();
      logger.info(`Scheduler: stopped job '${name}'`);
    }
    this.jobs.clear();
  }

  /**
   * Get status of all jobs
   */
  getJobStatus(): Array<{ name: string; schedule: string; enabled: boolean; running: boolean }> {
    const status: Array<{ name: string; schedule: string; enabled: boolean; running: boolean }> = [];
    
    for (const [name, config] of this.jobConfigs) {
      status.push({
        name,
        schedule: config.schedule,
        enabled: config.enabled,
        running: this.jobs.has(name),
      });
    }

    return status;
  }

  /**
   * Validate cron expression
   */
  static validateCronExpression(expression: string): boolean {
    return cron.validate(expression);
  }
}

export const schedulerService = new SchedulerService();
