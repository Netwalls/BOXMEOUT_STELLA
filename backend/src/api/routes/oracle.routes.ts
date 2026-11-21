import { Router } from "express";
import {
  submitOracleResultHandler,
  listOracleResultsHandler,
  getAllOraclesHandler,
  createOracleHandler,
  updateOracleHandler,
  deleteOracleHandler,
} from "../controllers/oracle.controller";
import { oracleAuth } from "../middleware/oracleAuth";
import { adminAuth } from "../middleware/adminAuth";
import { validate } from "../middleware/validate";
import { oracleResultsQuery, submitOracleResultBody } from "../schemas/routes.schema";

const router = Router();

// POST /api/oracle/submit — X-Oracle-Key header required (issue #908)
router.post("/submit", oracleAuth, validate({ body: submitOracleResultBody }), submitOracleResultHandler);

// GET /api/oracle/results — admin view, X-Admin-Key header required
router.get("/results", adminAuth, validate({ query: oracleResultsQuery }), listOracleResultsHandler);

// Oracle CRUD lives behind adminAuth at /api/admin/oracles (B-87 removed the
// unauthenticated duplicates that were previously mounted here).

export default router;
