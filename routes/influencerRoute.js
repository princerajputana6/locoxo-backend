import express from 'express';
import { 
    addInfluencer, 
    listInfluencers, 
    getActiveInfluencers,
    getInfluencer, 
    updateInfluencer, 
    deleteInfluencer, 
    trackClick,
    getInfluencerStats
} from '../controllers/influencerController.js';
import adminAuth from '../middleware/adminAuth.js';
import upload from '../middleware/multer.js';

const influencerRouter = express.Router();

// Admin routes
influencerRouter.post('/add', adminAuth, upload.single('image'), addInfluencer);
influencerRouter.get('/list', adminAuth, listInfluencers);
influencerRouter.get('/:id', adminAuth, getInfluencer);
influencerRouter.put('/:id', adminAuth, updateInfluencer);
influencerRouter.delete('/:id', adminAuth, deleteInfluencer);
influencerRouter.get('/stats/:id', adminAuth, getInfluencerStats);

// Public routes
influencerRouter.get('/active/all', getActiveInfluencers);
influencerRouter.post('/track-click', trackClick);

export default influencerRouter;
