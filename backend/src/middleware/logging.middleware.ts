import { Request, Response, NextFunction } from 'express';

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();
  const log = req.log;

  if (log) {
    log.info('Request', {
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'error' : 'info';
    if (log) {
      log[level]('Response', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
        ip: req.ip,
      });
    }
  });

  next();
};
