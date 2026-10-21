import { Router } from "express";
import { getChallengeHandler } from "../controllers/auth.controller";

const router = Router();

router.get("/challenge", getChallengeHandler);

export default router;
