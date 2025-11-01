import express from 'express';
import {
  trackUser,
  getUserCount,
  getUser,
} from '../controllers/users.controller';

const router = express.Router();

// User tracking routes
router.post('/track', trackUser);
router.get('/count', getUserCount);
router.get('/:address', getUser);

export default router;
