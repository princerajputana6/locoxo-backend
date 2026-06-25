import express from 'express';
import {
    listCampaigns, createCampaign, updateCampaign, deleteCampaign, previewAudience, sendCampaign
} from '../controllers/campaignController.js';
import adminAuth from '../middleware/adminAuth.js';

const campaignRouter = express.Router();

campaignRouter.get('/list', adminAuth, listCampaigns);
campaignRouter.post('/create', adminAuth, createCampaign);
campaignRouter.post('/preview', adminAuth, previewAudience);
campaignRouter.put('/:id', adminAuth, updateCampaign);
campaignRouter.delete('/:id', adminAuth, deleteCampaign);
campaignRouter.post('/:id/send', adminAuth, sendCampaign);

export default campaignRouter;
