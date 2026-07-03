import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { uploadToImageKit, deleteFromImageKit } from '../middlewares/upload.js';

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
    const products = await Product.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: products.length,
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
    });

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
    const product = await Product.findById(id);
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
    }).limit(8);

    if (similarProducts.length < 4) {
      const fallbackProducts = await Product.find({
        _id: { $ne: product._id, $nin: similarProducts.map(p => p._id) }
      }).limit(8 - similarProducts.length);
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
