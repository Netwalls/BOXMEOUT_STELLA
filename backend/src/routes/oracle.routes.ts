import { Router } from 'express';
import {
  submitOracleResult,
  validateSubmitOracleResult,
  getOracleReports,
} from '../api/controllers/OracleController';

const router = Router();

// POST /api/oracle/submit
// Validation middleware runs first; API key check is inside the controller
// (keeping auth logic co-located with the handler for this key-based pattern,
//  consistent with how admin routes inline their requireAdmin middleware).
router.post('/submit', validateSubmitOracleResult, submitOracleResult);

// GET /api/oracle/reports/:match_id — public transparency endpoint
router.get('/reports/:match_id', getOracleReports);

export default router;
