import { Router } from "express";
import {
  submitOracleResultHandler,
  listOracleResultsHandler,
} from "../controllers/oracle.controller";
import { oracleAuth } from "../middleware/oracleAuth";
import { adminAuth } from "../middleware/adminAuth";

const router = Router();

// POST /api/oracle/submit — X-Oracle-Key header required (issue #908)
router.post("/submit", oracleAuth, submitOracleResultHandler);

// GET /api/oracle/results — admin view, X-Admin-Key header required
router.get("/results", adminAuth, listOracleResultsHandler);

// GET /api/oracle — list all oracles
router.get("/", getAllOraclesHandler);

// POST /api/oracle — create a new oracle
router.post("/", createOracleHandler);

// PUT /api/oracle/:id — update an existing oracle
router.put("/:id", updateOracleHandler);

// DELETE /api/oracle/:id — delete an oracle
router.delete("/:id", deleteOracleHandler);

export default router;
