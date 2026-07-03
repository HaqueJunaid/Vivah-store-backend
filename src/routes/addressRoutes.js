import express from 'express';
import { getAddresses, createAddress, updateAddress, deleteAddress } from '../controllers/addressController.js';
import { protect } from '../middlewares/auth.js';

const router = express.Router();

router.use(protect); // All address routes require authentication

router.get('/', getAddresses);
router.post('/', createAddress);
router.put('/:id', updateAddress);
router.delete('/:id', deleteAddress);

export default router;
