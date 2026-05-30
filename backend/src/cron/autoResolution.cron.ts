import cron from 'node-cron';
import { logger } from '../utils/logger';
import { runAutoResolutionJob } from '../oracle/OracleService';

let isRunning = false;

export function startAutoResolutionCron(): void {
  if (process.env.AUTO_RESOLUTION_CRON_DISABLED === 'true') {
    logger.info('Auto-resolution cron job is disabled via AUTO_RESOLUTION_CRON_DISABLED');
    return;
  }

  // Every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    if (isRunning) {
      logger.warn('autoResolutionJob: previous run still in progress, skipping');
      return;
    }

    isRunning = true;
    logger.info('autoResolutionJob: starting');

    try {
      await runAutoResolutionJob();
      logger.info('autoResolutionJob: completed');
    } catch (err) {
      logger.error({ err }, 'autoResolutionJob: failed');
    } finally {
      isRunning = false;
    }
  });

  logger.info('Auto-resolution cron job scheduled (every 10 minutes)');
}
