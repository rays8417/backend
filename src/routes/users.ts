import express from 'express';
import {
  trackUser,
  getUserCount,
} from '../controllers/users.controller';

const router = express.Router();

// User tracking routes
router.post('/track', trackUser);
router.get('/count', getUserCount);

export default router;
