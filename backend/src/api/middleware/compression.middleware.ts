import compression from "compression";
import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * B-124 (#1560): gzip/deflate for JSON list responses.
 *
 * Responses smaller than the threshold are sent as-is. Server-Sent Events are
 * never compressed: a compressor buffers output, which would delay the market
 * stream's events.
 */
export const COMPRESSION_THRESHOLD_BYTES = 1024;

export function shouldCompress(req: Request, res: Response): boolean {
  const contentType = res.getHeader("Content-Type");
  if (
    typeof contentType === "string" &&
    contentType.toLowerCase().startsWith("text/event-stream")
  ) {
    return false;
  }
  return compression.filter(req, res);
}

/**
 * Returns the compression middleware, or a pass-through when disabled. The
 * COMPRESSION_ENABLED flag lets a compressing reverse proxy turn this off.
 */
export function createCompressionMiddleware(enabled: boolean): RequestHandler {
  if (!enabled) {
    return (_req: Request, _res: Response, next: NextFunction): void => next();
  }
  return compression({
    threshold: COMPRESSION_THRESHOLD_BYTES,
    filter: shouldCompress,
  });
}
