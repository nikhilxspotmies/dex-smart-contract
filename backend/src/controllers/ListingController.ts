
import { type Request, type Response } from 'express';
import Listing from '../models/Listing.js';

export const getListings = async (req: Request, res: Response) => {
    try {
        const { active, sort } = req.query;

        const filter: any = {};
        if (active !== 'false') {
            filter.active = true;
        }

        let sortOption: any = { createdAt: -1 }; // Default: newest first
        if (sort === 'price_asc') {
            sortOption = { pricePerToken: 1 };
        } else if (sort === 'price_desc') {
            sortOption = { pricePerToken: -1 };
        }

        const listings = await Listing.find(filter).sort(sortOption);

        // Return structured response
        res.status(200).json({
            success: true,
            count: listings.length,
            data: listings
        });
    } catch (error) {
        console.error("Error fetching listings:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};
