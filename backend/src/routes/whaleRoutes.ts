import express from 'express';
import { TRADERS } from '../constants/whales.js';

const router = express.Router();

router.get('/', (req, res) => {
    res.json(TRADERS);
});

export default router;
