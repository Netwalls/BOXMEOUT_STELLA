import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

// Custom format for console logging (more readable in development)
const consoleFormat = printf(
  ({ level, message, timestamp, stack, requestId, ...metadata }: any) => {
    let log = `${timestamp} [${level}] ${requestId ? `[${requestId}] ` : ''}${message}`;
    if (stack) {
      log += `\n${stack}`;
    }
    if (Object.keys(metadata).length > 0 && !stack) {
      log += ` ${JSON.stringify(metadata)}`;
    }
    return log;
  }
);

// Configure the levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Set level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' ? 'debug' : 'info';
};

// Log rotation configuration
const fileRotateTransport = new DailyRotateFile({
  filename: 'logs/app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  format: combine(timestamp(), json()),
});

// Define which transports to use
const transports: winston.transport[] = [
  new winston.transports.Console({
    format:
      process.env.NODE_ENV === 'production'
        ? combine(timestamp(), json())
        : combine(
            colorize(),
            timestamp({ format: 'HH:mm:ss' }),
            errors({ stack: true }),
            consoleFormat
          ),
  }),
  fileRotateTransport,
];

// Create the logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
  exitOnError: false, // Do not exit on handled exceptions
});

export default logger;
