// backend/src/routes/metrics.routes.ts - Prometheus Metrics Endpoint
import { Router, Request, Response } from 'express';
import { register } from '../config/metrics.js';

const router = Router();

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Prometheus metrics endpoint
 *     description: Exposes application metrics in Prometheus format for monitoring and observability
 *     tags: [Metrics]
 *     responses:
 *       200:
 *         description: Prometheus metrics in text format
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: |
 *                 # HELP http_request_duration_seconds Duration of HTTP requests in seconds
 *                 # TYPE http_request_duration_seconds histogram
 *                 http_request_duration_seconds_bucket{le="0.01",method="GET",route="/api/markets",status_code="200"} 45
 *       500:
 *         description: Error retrieving metrics
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end(error);
  }
});

export default router;
