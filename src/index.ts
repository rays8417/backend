import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';


import tournamentRoutes from './routes/tournaments';
import scoringRoutes from './routes/scoring';
import rewardRoutes from './routes/rewards';
import adminRoutes from './routes/admin';
import snapshotRoutes from './routes/snapshots';
import userRewardsRoutes from './routes/user-rewards';
import usersRoutes from './routes/users';
import aptosRoutes from './routes/aptos';
import liveScoresRoutes from './routes/live-scores';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Import route modules

// Use routes
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/scoring', scoringRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/snapshots', snapshotRoutes);
app.use('/api/user-rewards', userRewardsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/aptos', aptosRoutes);
app.use('/api/live-scores', liveScoresRoutes);

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong!" });
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Cricket Fantasy API running on port ${PORT}`);
});

