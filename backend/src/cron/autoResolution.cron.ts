import cron from 'node-cron';
import { logger } from '../utils/logger';
import { runAutoResolutionJob, runAutoLockMarketsJob } from '../oracle/OracleService';

let isResolutionRunning = false;
let isLockRunning = false;

export function startAutoResolutionCron(): void {
  if (process.env.AUTO_RESOLUTION_CRON_DISABLED === 'true') {
    logger.info('Auto-resolution cron job is disabled via AUTO_RESOLUTION_CRON_DISABLED');
    return;
  }

  // Every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    if (isResolutionRunning) {
      logger.warn('autoResolutionJob: previous run still in progress, skipping');
      return;
    }

    isResolutionRunning = true;
    logger.info('autoResolutionJob: starting');

    try {
      await runAutoResolutionJob();
      logger.info('autoResolutionJob: completed');
    } catch (err) {
      logger.error({ err }, 'autoResolutionJob: failed');
    } finally {
      isResolutionRunning = false;
    }
  });

  logger.info('Auto-resolution cron job scheduled (every 10 minutes)');
}

export function startAutoLockCron(): void {
  if (process.env.AUTO_LOCK_CRON_DISABLED === 'true') {
    logger.info('Auto-lock cron job is disabled via AUTO_LOCK_CRON_DISABLED');
    return;
  }

  // Every 60 seconds — lock markets whose lock threshold has passed
  cron.schedule('* * * * *', async () => {
    if (isLockRunning) {
      logger.warn('autoLockJob: previous run still in progress, skipping');
      return;
    }

    isLockRunning = true;
    logger.debug('autoLockJob: starting');

    try {
      const { locked, failed } = await runAutoLockMarketsJob();
      if (locked > 0 || failed > 0) {
        logger.info({ locked, failed }, 'autoLockJob: completed');
      }
    } catch (err) {
      logger.error({ err }, 'autoLockJob: failed');
    } finally {
      isLockRunning = false;
    }
  });

  logger.info('Auto-lock cron job scheduled (every 60 seconds)');
}
