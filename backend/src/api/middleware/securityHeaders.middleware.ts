import { NextFunction, Request, Response } from "express";
import helmet from "helmet";

const defaultHeaders = helmet();

// Swagger UI (/docs, dev only) loads inline scripts and styles, so it skips the CSP.
const docsHeaders = helmet({ contentSecurityPolicy: false });

/** B-86: sends standard security headers (HSTS, X-Content-Type-Options, X-Frame-Options, ...). */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  const headers = req.path.startsWith("/docs") ? docsHeaders : defaultHeaders;
  headers(req, res, next);
}
