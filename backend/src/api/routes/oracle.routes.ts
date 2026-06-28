import { Router } from "express";
import {
  submitOracleResultHandler,
  listOracleResultsHandler,
  getAllOraclesHandler,
  createOracleHandler,
  updateOracleHandler,
  deleteOracleHandler,
} from "../controllers/oracle.controller";

const router = Router();

// POST /api/oracle/submit — Bearer ORACLE_API_KEY, returns 201 (issue #908)
router.post("/submit", submitOracleResultHandler);

// GET /api/oracle/results — admin view of all submitted results
router.get("/results", listOracleResultsHandler);

export default router;
