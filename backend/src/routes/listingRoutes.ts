
import express from 'express';
import { getListings } from '../controllers/ListingController.js';

const router = express.Router();

router.get('/', getListings);

export default router;
