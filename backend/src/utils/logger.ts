/**
 * Structured logger for log aggregation.
 * JSON format with request ID, user ID, timestamp on every log.
 * Levels: debug, info, warn, error.
 */
import winston from 'winston';

const { combine, timestamp, json } = winston.format;

const logLevel =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

export const logger = winston.createLogger({
  level: logLevel,
  levels: { error: 0, warn: 1, info: 2, debug: 3 },
  format: combine(timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }), json()),
  defaultMeta: { service: 'boxmeout-backend' },
  transports: [new winston.transports.Console()],
});

export type Logger = winston.Logger;

/**
 * Create a child logger with request and user context for request-scoped logging.
 * Use in middleware to attach to req.log so handlers get requestId and userId in every log.
 */
export function child(meta: {
  requestId?: string;
  userId?: string | null;
  [key: string]: unknown;
}): Logger {
  return logger.child(meta);
}

export default logger;
