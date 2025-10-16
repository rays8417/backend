
import express, { Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const QUICKNODE_API_URL = process.env.QUICKNODE_API_URL;

router.post(/(.*)/, async (req: Request, res: Response) => {
    try {
        const headers = { ...req.headers };
        delete headers['host'];
        delete headers['accept-encoding'];

        const response = await axios.post(
            `${QUICKNODE_API_URL}${req.params[0]}`,
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
            `${QUICKNODE_API_URL}${req.params[0]}`,
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
