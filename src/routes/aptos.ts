
import express, { Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;

router.post(/(.*)/, async (req: Request, res: Response) => {
    try {
        const headers = { ...req.headers };
        delete headers['host'];
        delete headers['accept-encoding'];

        const response = await axios.post(
            `${SOLANA_RPC_URL}${req.params[0]}`,
            req.body,
            {
                headers: headers as any,
            }
        );
        res.json(response.data);
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            console.error('Error proxying to QuickNode:', error);
            res.status(500).json({ error: 'Failed to proxy request' });
        }
    }
});

router.get(/(.*)/, async (req: Request, res: Response) => {
    try {
        const headers = { ...req.headers };
        delete headers['host'];
        delete headers['accept-encoding'];

        const response = await axios.get(
            `${SOLANA_RPC_URL}${req.params[0]}`,
            {
                headers: headers as any,
            }
        );
        res.json(response.data);
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            console.error('Error proxying to QuickNode:', error);
            res.status(500).json({ error: 'Failed to proxy request' });
        }
    }
});

export default router;
