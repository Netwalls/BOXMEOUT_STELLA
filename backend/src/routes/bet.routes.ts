import { Router } from 'express';
import { getBetsByAddress } from '../api/controllers/BetController';

const router = Router();

router.get('/:bettor_address', getBetsByAddress);

export default router;
