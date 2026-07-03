import express from 'express';
import { createProduct, getAllProducts, getProductByCategory, deleteProduct, getProductById, updateProduct, getSimilarProducts } from '../controllers/productController.js';
import { protect, admin } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = express.Router();

router.get('/', getAllProducts);
router.get('/category/:category', getProductByCategory);
router.get('/:id', getProductById);
router.get('/:id/similar', getSimilarProducts);
router.post(
  '/',
  protect,
  admin,
  (req, res, next) => {
    upload.fields([
      { name: 'images', maxCount: 10 },
      { name: 'imageUrls', maxCount: 10 },
      { name: 'ImageUrls', maxCount: 10 },
      { name: 'files', maxCount: 10 },
      { name: 'variantImages', maxCount: 10 },
    ])(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  },
  createProduct
);

router.put(
  '/:id',
  protect,
  admin,
  (req, res, next) => {
    upload.fields([
      { name: 'images', maxCount: 10 },
      { name: 'imageUrls', maxCount: 10 },
      { name: 'ImageUrls', maxCount: 10 },
      { name: 'files', maxCount: 10 },
      { name: 'variantImages', maxCount: 10 },
    ])(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  },
  updateProduct
);

router.delete('/:id', protect, admin, deleteProduct);

export default router;
