// Transaction routes - endpoint definitions for transaction operations
import { Router } from 'express';
import { transactionController } from '../controllers/transaction.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router: Router = Router();

/**
 * @route   GET /api/transactions
 * @desc    Get transaction history with pagination and filters
 * @access  Protected
 * @query   page, limit, type, status, startDate, endDate
 * @returns { transactions: Array, pagination: { page, limit, total, totalPages } }
 */
router.get('/', requireAuth, (req, res) =>
  transactionController.getTransactionHistory(req, res)
);

/**
 * @route   GET /api/transactions/pending
 * @desc    Get pending transactions for current user
 * @access  Protected
 * @returns { transactions: Array }
 */
router.get('/pending', requireAuth, (req, res) =>
  transactionController.getPendingTransactions(req, res)
);

/**
 * @route   GET /api/transactions/:id
 * @desc    Get a specific transaction by ID
 * @access  Protected
 * @returns { transaction: Object }
 */
router.get('/:id', requireAuth, (req, res) =>
  transactionController.getTransactionById(req, res)
);

/**
 * @route   POST /api/transactions
 * @desc    Record a new transaction
 * @access  Protected
 * @body    { txType, amountUsdc, txHash, fromAddress, toAddress }
 * @returns { transaction: Object }
 */
router.post('/', requireAuth, (req, res) =>
  transactionController.recordTransaction(req, res)
);

export default router;
