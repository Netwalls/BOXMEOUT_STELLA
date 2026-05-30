/**
 * @swagger
 * tags:
 *   name: Referrals
 *   description: Referral program management
 */

/**
 * @swagger
 * /referrals:
 *   get:
 *     summary: Get the authenticated user's referral info and history
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Referral code, link, and list of referred users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: string }
 *                 link: { type: string }
 *                 totalReferrals: { type: integer }
 *                 totalEarned: { type: number }
 *                 referrals:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId: { type: string }
 *                       joinedAt: { type: string, format: date-time }
 *                       earned: { type: number }
 *       401:
 *         description: Unauthorized
 */
import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => res.json({ code: '', link: '', totalReferrals: 0, totalEarned: 0, referrals: [] }));

export default router;
