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

// GET /api/oracle — list all oracles
router.get("/", getAllOraclesHandler);

// POST /api/oracle — create a new oracle
router.post("/", createOracleHandler);

// PUT /api/oracle/:id — update an existing oracle
router.put("/:id", updateOracleHandler);

// DELETE /api/oracle/:id — delete an oracle
router.delete("/:id", deleteOracleHandler);

export default router;
