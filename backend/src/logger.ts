import pino from "pino";
import pinoHttp from "pino-http";
import type { IncomingMessage } from "http";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: isDev ? "debug" : "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: "boxmeout-backend" },
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
