// backend/src/routes/metrics.routes.ts
import { Router, Request, Response } from 'express';
import { register } from '../config/metrics.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /metrics
 *
 * Prometheus scrape endpoint — no authentication required.
 * In production this should be restricted at the network/reverse-proxy level
 * (e.g. only reachable from the internal monitoring subnet).
 *
 * @swagger
 * /metrics:
 *   get:
 *     summary: Prometheus metrics
 *     description: >
 *       Exposes application metrics in Prometheus text format.
 *       No authentication required; restrict access via firewall in production.
 *     tags: [Observability]
 *     responses:
 *       200:
 *         description: Prometheus text format metrics
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       500:
 *         description: Failed to collect metrics
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const metrics = await register.metrics();
    res.set('Content-Type', register.contentType);
    res.end(metrics);
  } catch (err) {
    logger.error('Failed to collect Prometheus metrics', { err });
    res.status(500).end('# Error collecting metrics\n');
  }
});

export default router;
