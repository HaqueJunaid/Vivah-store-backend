import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { uploadToImageKit, deleteFromImageKit } from '../middlewares/upload.js';
import mongoose from 'mongoose';

export const createProduct = async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      quantity,
      category,
      subCategory = null,
      hasVariants = false,
      variantTitle = null,
      variantImages: variantImagesBody = null,
      isCustomizable = false,
      customizations: customizationsBody = null,
    } = req.body;

    if (!title || !description || price === undefined || quantity === undefined || !category) {
      return res.status(400).json({
        success: false,
        message: 'Missing required product fields: title, description, price, quantity, category.',
      });
    }

    let imageUrls = [];
    let variantImages = [];

    if (variantImagesBody) {
      if (typeof variantImagesBody === 'string') {
        variantImages = variantImagesBody
          .split(',')
          .map((url) => url.trim())
          .filter((url) => url.length > 0);
      } else if (Array.isArray(variantImagesBody)) {
        variantImages = variantImagesBody;
      }
    }

    if (req.files) {
      if (Array.isArray(req.files)) {
        imageUrls = await uploadToImageKit(req.files);
      } else {
        const mainImageFiles = req.files.images || req.files.imageUrls || req.files.ImageUrls || req.files.files;
        if (mainImageFiles && mainImageFiles.length > 0) {
          imageUrls = await uploadToImageKit(mainImageFiles);
        }
        if (req.files.variantImages && req.files.variantImages.length > 0) {
          const uploadedVariantImages = await uploadToImageKit(req.files.variantImages);
          variantImages = [...variantImages, ...uploadedVariantImages];
        }
      }
    }

    let parsedCustomizations = [];
    if (customizationsBody) {
      if (typeof customizationsBody === 'string') {
        try {
          parsedCustomizations = JSON.parse(customizationsBody);
        } catch (e) {
          parsedCustomizations = customizationsBody.split(',').map(s => s.trim()).filter(Boolean);
        }
      } else if (Array.isArray(customizationsBody)) {
        parsedCustomizations = customizationsBody;
      }
    }

    const product = await Product.create({
      title,
      description,
      price,
      quantity,
      category: category.toLowerCase(),
      subCategory: subCategory && subCategory.toLowerCase(),
      imageUrls,
      hasVariants: hasVariants === 'true' || hasVariants === true,
      variantTitle,
      variantImages,
      isCustomizable: isCustomizable === 'true' || isCustomizable === true,
      customizations: parsedCustomizations,
      adminId: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully.',
      product,
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create product.',
    });
  }
};

export const getAllProducts = async (req, res) => {
  try {
    const page = req.query.page ? parseInt(req.query.page, 10) : null;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const stockStatus = req.query.stockStatus || '';
    const sortBy = req.query.sortBy || 'Default';

    let filter = {};

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex }
      ];
      if (mongoose.Types.ObjectId.isValid(search)) {
        filter.$or.push({ _id: search });
      }
    }

    if (category && category !== 'All') {
      filter.category = category.toLowerCase();
    }

    if (stockStatus && stockStatus !== 'All') {
      if (stockStatus === 'In Stock') {
        filter.quantity = { $gt: 0 };
      } else if (stockStatus === 'Out of Stock') {
        filter.quantity = { $lte: 0 };
      }
    }

    let sortOption = { createdAt: -1, _id: -1 };
    if (sortBy === 'Price: Low to High') {
      sortOption = { price: 1 };
    } else if (sortBy === 'Price: High to Low') {
      sortOption = { price: -1 };
    } else if (sortBy === 'Name: A-Z') {
      sortOption = { title: 1 };
    }

    let query = Product.find(filter).sort(sortOption).lean();

    if (page && limit) {
      const skip = (page - 1) * limit;
      query = query.skip(skip).limit(limit);
    }

    const products = await query;
    const total = await Product.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: products.length,
      total,
      products,
    });
  } catch (error) {
    console.error('Get all products error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch products.',
    });
  }
};

const normalizeSearch = (value) => {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const buildPattern = (slug) => {
  const parts = slug.split('-');
  const escapedParts = parts.map(part =>
    part.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&')
  );
  return `^${escapedParts.join('[\\s&/-]*')}$`;
};

export const getProductByCategory = async (req, res) => {
  try {
    const category = decodeURIComponent(req.params.category || '').trim();
    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Category is required.',
      });
    }

    const slug = normalizeSearch(category);
    const pattern = buildPattern(slug);

    const products = await Product.find({
      $or: [
        { category: { $regex: pattern, $options: 'i' } },
        { subCategory: { $regex: pattern, $options: 'i' } },
      ],
    }).lean();

    res.status(200).json({
      success: true,
      count: products.length,
      category,
      products,
    });
  } catch (error) {
    console.error('Get products by category error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch products by category.',
    });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    const allImages = [...(product.imageUrls || []), ...(product.variantImages || [])];

    if (allImages.length > 0) {
      await deleteFromImageKit(allImages);
    }

    await Product.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Product and associated images deleted successfully.',
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete product.',
    });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id).lean();
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error('Get product by ID error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch product.',
    });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      price,
      quantity,
      category,
      subCategory,
      hasVariants,
      variantTitle,
      existingImageUrls,
      variantImages: variantImagesBody,
      isCustomizable,
      customizations: customizationsBody,
    } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    let retainedMainUrls = [];
    if (existingImageUrls) {
      if (Array.isArray(existingImageUrls)) {
        retainedMainUrls = existingImageUrls;
      } else {
        retainedMainUrls = [existingImageUrls];
      }
    }

    const removedMainUrls = (product.imageUrls || []).filter(
      (url) => !retainedMainUrls.includes(url)
    );

    if (removedMainUrls.length > 0) {
      await deleteFromImageKit(removedMainUrls);
    }

    let newMainUrls = [];
    if (req.files) {
      const mainImageFiles = req.files.images || req.files.imageUrls || req.files.ImageUrls || req.files.files;
      if (mainImageFiles && mainImageFiles.length > 0) {
        newMainUrls = await uploadToImageKit(mainImageFiles);
      }
    }

    const updatedMainUrls = [...retainedMainUrls, ...newMainUrls];

    let updatedVariantUrls = [];
    if (variantImagesBody) {
      if (typeof variantImagesBody === 'string') {
        updatedVariantUrls = variantImagesBody
          .split(',')
          .map((url) => url.trim())
          .filter((url) => url.length > 0);
      } else if (Array.isArray(variantImagesBody)) {
        updatedVariantUrls = variantImagesBody;
      }
    }

    const removedVariantUrls = (product.variantImages || []).filter(
      (url) => !updatedVariantUrls.includes(url)
    );

    if (removedVariantUrls.length > 0) {
      await deleteFromImageKit(removedVariantUrls);
    }

    let newVariantUrls = [];
    if (req.files && req.files.variantImages && req.files.variantImages.length > 0) {
      newVariantUrls = await uploadToImageKit(req.files.variantImages);
    }

    const finalVariantUrls = [...updatedVariantUrls, ...newVariantUrls];

    product.title = title !== undefined ? title : product.title;
    product.description = description !== undefined ? description : product.description;
    product.price = price !== undefined ? Number(price) : product.price;
    product.quantity = quantity !== undefined ? Number(quantity) : product.quantity;
    if (category) {
      product.category = category.toLowerCase();
    }
    if (subCategory !== undefined) {
      product.subCategory = subCategory ? subCategory.toLowerCase() : null;
    }
    product.imageUrls = updatedMainUrls;

    product.hasVariants = hasVariants !== undefined ? (hasVariants === 'true' || hasVariants === true) : product.hasVariants;
    if (product.hasVariants) {
      product.variantTitle = variantTitle !== undefined ? variantTitle : product.variantTitle;
      product.variantImages = finalVariantUrls;
    } else {
      product.variantTitle = null;
      if (product.variantImages && product.variantImages.length > 0) {
        await deleteFromImageKit(product.variantImages);
      }
      product.variantImages = [];
    }

    if (isCustomizable !== undefined) {
      product.isCustomizable = isCustomizable === 'true' || isCustomizable === true;
    }
    if (customizationsBody !== undefined) {
      let parsedCustomizations = [];
      if (typeof customizationsBody === 'string') {
        try {
          parsedCustomizations = JSON.parse(customizationsBody);
        } catch (e) {
          parsedCustomizations = customizationsBody.split(',').map(s => s.trim()).filter(Boolean);
        }
      } else if (Array.isArray(customizationsBody)) {
        parsedCustomizations = customizationsBody;
      }
      product.customizations = parsedCustomizations;
    }

    product.updatedAt = Date.now();
    await product.save();

    res.status(200).json({
      success: true,
      message: 'Product updated successfully.',
      product,
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update product.',
    });
  }
};

export const getSimilarProducts = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    let similarProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id }
    }).limit(8).lean();

    if (similarProducts.length < 4) {
      const fallbackProducts = await Product.find({
        _id: { $ne: product._id, $nin: similarProducts.map(p => p._id) }
      }).limit(8 - similarProducts.length).lean();
      similarProducts = [...similarProducts, ...fallbackProducts];
    }

    res.status(200).json({
      success: true,
      products: similarProducts,
    });
  } catch (error) {
    console.error('Get similar products error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch similar products.',
    });
  }
};

// Upload Customization Image to ImageKit in /vivahstore/customizations folder
export const uploadCustomizationImage = async (req, res) => {
  try {
    const file = req.file || (req.files && (req.files.image?.[0] || req.files.file?.[0] || (Array.isArray(req.files) ? req.files[0] : null)));
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded',
      });
    }

    const urls = await uploadToImageKit([file], '/vivahstore/customizations');
    if (!urls || urls.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to upload image to ImageKit',
      });
    }

    res.status(200).json({
      success: true,
      url: urls[0],
      message: 'Customization image uploaded successfully to ImageKit',
    });
  } catch (error) {
    console.error('Upload customization image error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload customization image',
    });
  }
};
