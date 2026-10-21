import type { Request, Response } from "express";

/**
 * B-93: JSON 404 for requests that match no route. Must be registered after
 * all routes and before errorHandlerMiddleware, so unknown paths and methods
 * get the same `{ error, code }` shape as every other error response.
 */
export function notFoundMiddleware(req: Request, res: Response): void {
  const requestId = (req as Request & { id?: string }).id;

  res.status(404).json({ error: "Not found", code: "NOT_FOUND", requestId });
}
