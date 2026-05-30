/**
 * @swagger
 * tags:
 *   name: Wallet
 *   description: Wallet deposit and withdrawal
 */

/**
 * @swagger
 * /wallet/withdraw:
 *   post:
 *     summary: Withdraw funds to a Stellar wallet
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, destinationAddress]
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *               destinationAddress:
 *                 type: string
 *                 description: Stellar public key (G...)
 *     responses:
 *       200:
 *         description: Withdrawal initiated
 *       400:
 *         description: Insufficient balance or invalid address
 *       401:
 *         description: Unauthorized
 *
 * /wallet/balance:
 *   get:
 *     summary: Get wallet balance for the authenticated user
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current balance
 *       401:
 *         description: Unauthorized
 */
import { Router } from 'express';

const router = Router();

router.post('/withdraw', (_req, res) => res.json({ ok: true }));
router.get('/balance', (_req, res) => res.json({ balance: 0 }));

export default router;
