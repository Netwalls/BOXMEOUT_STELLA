import pino from "pino";
import pinoHttp from "pino-http";
import type { IncomingMessage } from "http";
import { Prisma } from "@prisma/client";

const isDev = process.env.NODE_ENV !== "production";

/**
 * B-100: Secrets that must never reach a log line. Any log call that includes
 * request headers or config values is censored at the logger, so a future
 * `logger.info({ req })` cannot leak an admin, oracle or wallet credential.
 */
export const redactConfig = {
  paths: [
    'req.headers["x-admin-key"]',
    'req.headers["x-oracle-key"]',
    'req.headers["x-wallet-signature"]',
    'req.headers["authorization"]',
    'req.headers["cookie"]',
    'headers["x-admin-key"]',
    'headers["x-oracle-key"]',
    'headers["x-wallet-signature"]',
    "ADMIN_SECRET_KEY",
    "*.ADMIN_SECRET_KEY",
    "*.password",
  ],
  censor: "[Redacted]",
};

export const logger = pino({
  level: isDev ? "debug" : "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: "boxmeout-backend" },
  redact: redactConfig,
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname,service",
      },
    },
  }),
});

/**
 * B-100: Prisma validation errors embed the full query arguments in their
 * message, and known-request errors can carry field values in `meta`. Those
 * errors are logged by class name and code only, so query parameters never
 * reach the logs. Other errors are returned unchanged for pino to serialise.
 */
export function sanitizeErrorForLog(err: unknown): unknown {
  if (err instanceof Prisma.PrismaClientValidationError) {
    return { name: err.name };
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return { name: err.name, code: err.code };
  }
  return err;
}

/**
 * B-74: Structured logging helpers for background jobs and services.
 *
 * Jobs previously used `console.log` / `console.warn`, which bypasses the
 * structured pino logger. These helpers route job logs through pino and
 * consistently attach the `marketId` and `txHash` fields whenever they are
 * available, so log lines can be correlated across the indexer pipeline.
 */
export interface JobLogContext {
  marketId?: string;
  txHash?: string;
  [key: string]: unknown;
}

function withJobContext(context: JobLogContext = {}): JobLogContext {
  const fields: JobLogContext = { ...context };
  if (fields.marketId === undefined) delete fields.marketId;
  if (fields.txHash === undefined) delete fields.txHash;
  return fields;
}

export const jobLogger = {
  debug(message: string, context?: JobLogContext): void {
    logger.debug(withJobContext(context), message);
  },
  info(message: string, context?: JobLogContext): void {
    logger.info(withJobContext(context), message);
  },
  warn(message: string, context?: JobLogContext): void {
    logger.warn(withJobContext(context), message);
  },
  error(message: string, context?: JobLogContext): void {
    logger.error(withJobContext(context), message);
  },
};

export const httpLogger = pinoHttp({
  logger,
  // B-59: Carry the request ID (set by requestIdMiddleware) into every log line
  genReqId(req: IncomingMessage): string {
    // req.id is set by requestIdMiddleware before pinoHttp runs
    return (req as IncomingMessage & { id?: string }).id ?? "";
  },
  customLogLevel(_req, res) {
    if (res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req(req) {
      return { method: req.method, url: req.url, reqId: req.id };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});
