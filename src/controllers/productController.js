import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { uploadToImageKit, deleteFromImageKit } from '../middlewares/upload.js';
import mongoose from 'mongoose';

export const createProduct = async (req, res) => {
  try {
    const {
      title,
      description,
      about = '',
      note = '',
      productInfo: productInfoBody = null,
      price,
      quantity,
      inStock,
      category,
      subCategory = null,
      hasVariants = false,
      variantTitle = null,
      variants: variantsBody = null,
      variantImages: variantImagesBody = null,
      isCustomizable = false,
      customizations: customizationsBody = null,
    } = req.body;

    let parsedProductInfo = { description: '', about: '', note: '' };
    if (productInfoBody) {
      if (typeof productInfoBody === 'string') {
        try {
          parsedProductInfo = JSON.parse(productInfoBody);
        } catch (e) {
          parsedProductInfo = { description: productInfoBody, about: '', note: '' };
        }
      } else if (typeof productInfoBody === 'object') {
        parsedProductInfo = { ...productInfoBody };
      }
    }

    if (description !== undefined && !parsedProductInfo.description) {
      parsedProductInfo.description = description;
    }
    if (about !== undefined && !parsedProductInfo.about) {
      parsedProductInfo.about = about;
    }
    if (note !== undefined && !parsedProductInfo.note) {
      parsedProductInfo.note = note;
    }

    const finalDescription = parsedProductInfo.description || description || '';
    parsedProductInfo.description = finalDescription;
    parsedProductInfo.about = parsedProductInfo.about || about || '';
    parsedProductInfo.note = parsedProductInfo.note || note || '';

    if (!title || !finalDescription || price === undefined || !category) {
      return res.status(400).json({
        success: false,
        message: 'Missing required product fields: title, description, price, category.',
      });
    }

    const isInStock = inStock !== undefined 
      ? (inStock === 'true' || inStock === true) 
      : (quantity !== undefined ? Number(quantity) > 0 : true);

    let imageUrls = [];
    const filesList = Array.isArray(req.files) ? req.files : (req.files ? Object.values(req.files).flat() : []);

    // 1. Main images upload
    const mainImageFiles = filesList.filter((f) =>
      ['images', 'imageUrls', 'ImageUrls', 'files'].includes(f.fieldname)
    );
    if (mainImageFiles.length > 0) {
      imageUrls = await uploadToImageKit(mainImageFiles);
    }

    // 2. Process multiple variants
    const isHasVariants = hasVariants === 'true' || hasVariants === true;
    let finalVariants = [];

    let parsedVariants = [];
    if (variantsBody) {
      if (typeof variantsBody === 'string') {
        try {
          parsedVariants = JSON.parse(variantsBody);
        } catch (e) {
          parsedVariants = [];
        }
      } else if (Array.isArray(variantsBody)) {
        parsedVariants = variantsBody;
      }
    }

    if (isHasVariants && parsedVariants.length > 0) {
      const hasIndexedVariantFields = filesList.some((f) => f.fieldname.startsWith('variantImages_'));

      for (let i = 0; i < parsedVariants.length; i++) {
        const v = parsedVariants[i];
        const vTitle = (v.title || v.name || `Variant ${i + 1}`).trim();
        let vImages = Array.isArray(v.existingImages) ? [...v.existingImages] : (Array.isArray(v.images) ? [...v.images] : []);

        const vFiles = hasIndexedVariantFields
          ? filesList.filter((f) => f.fieldname === `variantImages_${i}`)
          : (i === 0 ? filesList.filter((f) => f.fieldname === 'variantImages') : []);

        if (vFiles.length > 0) {
          const uploaded = await uploadToImageKit(vFiles);
          vImages = [...vImages, ...uploaded];
        }

        finalVariants.push({
          title: vTitle,
          name: vTitle,
          images: Array.from(new Set(vImages.filter(Boolean))),
        });
      }
    } else if (isHasVariants && (variantTitle || variantImagesBody || filesList.some((f) => f.fieldname === 'variantImages'))) {
      let vImages = [];
      if (variantImagesBody) {
        if (typeof variantImagesBody === 'string') {
          vImages = variantImagesBody.split(',').map((u) => u.trim()).filter(Boolean);
        } else if (Array.isArray(variantImagesBody)) {
          vImages = variantImagesBody;
        }
      }
      const vFiles = filesList.filter((f) => f.fieldname === 'variantImages');
      if (vFiles.length > 0) {
        const uploaded = await uploadToImageKit(vFiles);
        vImages = [...vImages, ...uploaded];
      }
      const vTitle = (variantTitle || 'Variant 1').trim();
      finalVariants.push({
        title: vTitle,
        name: vTitle,
        images: Array.from(new Set(vImages.filter(Boolean))),
      });
    }

    const legacyVariantTitle = finalVariants.length > 0 ? finalVariants[0].title : null;
    const legacyVariantImages = finalVariants.length > 0 ? finalVariants[0].images : [];

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
      productInfo: parsedProductInfo,
      description: finalDescription,
      price,
      quantity: isInStock ? (quantity !== undefined ? Number(quantity) : 1) : 0,
      inStock: isInStock,
      category: category.toLowerCase(),
      subCategory: subCategory && subCategory.toLowerCase(),
      imageUrls,
      hasVariants: isHasVariants,
      variantTitle: legacyVariantTitle,
      variantImages: legacyVariantImages,
      variants: finalVariants,
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
        { 'productInfo.description': searchRegex },
        { 'productInfo.about': searchRegex },
        { 'productInfo.note': searchRegex },
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
        filter.$or = [
          { inStock: true },
          { inStock: { $exists: false }, quantity: { $gt: 0 } }
        ];
      } else if (stockStatus === 'Out of Stock') {
        filter.$or = [
          { inStock: false },
          { inStock: { $exists: false }, quantity: { $lte: 0 } }
        ];
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

    const variantImagesAll = (product.variants || []).flatMap((v) => v.images || []);
    const allImages = [...(product.imageUrls || []), ...(product.variantImages || []), ...variantImagesAll];
    const uniqueImages = Array.from(new Set(allImages.filter(Boolean)));

    if (uniqueImages.length > 0) {
      await deleteFromImageKit(uniqueImages);
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
      about,
      note,
      productInfo: productInfoBody,
      price,
      quantity,
      inStock,
      category,
      subCategory,
      hasVariants,
      variantTitle,
      variants: variantsBody,
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

    const filesList = Array.isArray(req.files) ? req.files : (req.files ? Object.values(req.files).flat() : []);

    // 1. Process Main Images
    let retainedMainUrls = [];
    if (existingImageUrls) {
      if (Array.isArray(existingImageUrls)) {
        retainedMainUrls = existingImageUrls;
      } else {
        retainedMainUrls = [existingImageUrls];
      }
    }

    const mainImageFiles = filesList.filter((f) =>
      ['images', 'imageUrls', 'ImageUrls', 'files'].includes(f.fieldname)
    );
    let newMainUrls = [];
    if (mainImageFiles.length > 0) {
      newMainUrls = await uploadToImageKit(mainImageFiles);
    }
    const updatedMainUrls = [...retainedMainUrls, ...newMainUrls];

    // 2. Process Variants
    const isHasVariants = hasVariants !== undefined ? (hasVariants === 'true' || hasVariants === true) : product.hasVariants;
    let finalVariants = [];

    let parsedVariants = null;
    if (variantsBody !== undefined) {
      if (typeof variantsBody === 'string') {
        try {
          parsedVariants = JSON.parse(variantsBody);
        } catch (e) {
          parsedVariants = null;
        }
      } else if (Array.isArray(variantsBody)) {
        parsedVariants = variantsBody;
      }
    }

    if (isHasVariants) {
      if (parsedVariants && Array.isArray(parsedVariants) && parsedVariants.length > 0) {
        const hasIndexedVariantFields = filesList.some((f) => f.fieldname.startsWith('variantImages_'));

        for (let i = 0; i < parsedVariants.length; i++) {
          const v = parsedVariants[i];
          const vTitle = (v.title || v.name || `Variant ${i + 1}`).trim();
          let retainedVImages = Array.isArray(v.existingImages)
            ? [...v.existingImages]
            : (Array.isArray(v.images) ? v.images.filter((img) => typeof img === 'string' && !img.startsWith('blob:')) : []);

          const vFiles = hasIndexedVariantFields
            ? filesList.filter((f) => f.fieldname === `variantImages_${i}`)
            : (i === 0 ? filesList.filter((f) => f.fieldname === 'variantImages') : []);

          if (vFiles.length > 0) {
            const uploaded = await uploadToImageKit(vFiles);
            retainedVImages = [...retainedVImages, ...uploaded];
          }

          finalVariants.push({
            title: vTitle,
            name: vTitle,
            images: Array.from(new Set(retainedVImages.filter(Boolean))),
          });
        }
      } else if (variantTitle !== undefined || variantImagesBody !== undefined || filesList.some((f) => f.fieldname === 'variantImages')) {
        let updatedLegacyVariantUrls = [];
        if (variantImagesBody) {
          if (typeof variantImagesBody === 'string') {
            updatedLegacyVariantUrls = variantImagesBody.split(',').map((u) => u.trim()).filter(Boolean);
          } else if (Array.isArray(variantImagesBody)) {
            updatedLegacyVariantUrls = variantImagesBody;
          }
        }
        const legacyVFiles = filesList.filter((f) => f.fieldname === 'variantImages');
        let newLegacyUrls = [];
        if (legacyVFiles.length > 0) {
          newLegacyUrls = await uploadToImageKit(legacyVFiles);
        }
        const vTitle = (variantTitle || product.variantTitle || 'Variant 1').trim();
        finalVariants.push({
          title: vTitle,
          name: vTitle,
          images: Array.from(new Set([...updatedLegacyVariantUrls, ...newLegacyUrls].filter(Boolean))),
        });
      } else {
        finalVariants = product.variants || [];
      }
    }

    // Identify and delete removed images from ImageKit
    const oldMainUrls = product.imageUrls || [];
    const oldVariantUrls = [...(product.variantImages || []), ...(product.variants || []).flatMap((v) => v.images || [])];
    const oldAllUrls = Array.from(new Set([...oldMainUrls, ...oldVariantUrls].filter(Boolean)));

    const newAllUrls = new Set([
      ...updatedMainUrls,
      ...finalVariants.flatMap((v) => v.images || [])
    ]);

    const urlsToDelete = oldAllUrls.filter((url) => !newAllUrls.has(url));
    if (urlsToDelete.length > 0) {
      await deleteFromImageKit(urlsToDelete);
    }

    product.title = title !== undefined ? title : product.title;

    let updatedProductInfo = product.productInfo ? {
      description: product.productInfo.description || product.description || '',
      about: product.productInfo.about || '',
      note: product.productInfo.note || '',
    } : {
      description: product.description || '',
      about: '',
      note: '',
    };

    if (productInfoBody !== undefined) {
      if (typeof productInfoBody === 'string') {
        try {
          updatedProductInfo = { ...updatedProductInfo, ...JSON.parse(productInfoBody) };
        } catch (e) {
          updatedProductInfo.description = productInfoBody;
        }
      } else if (typeof productInfoBody === 'object' && productInfoBody !== null) {
        updatedProductInfo = { ...updatedProductInfo, ...productInfoBody };
      }
    }

    if (description !== undefined) {
      updatedProductInfo.description = description;
      product.description = description;
    }
    if (about !== undefined) {
      updatedProductInfo.about = about;
    }
    if (note !== undefined) {
      updatedProductInfo.note = note;
    }

    product.productInfo = updatedProductInfo;
    if (updatedProductInfo.description) {
      product.description = updatedProductInfo.description;
    }

    product.price = price !== undefined ? Number(price) : product.price;
    if (inStock !== undefined) {
      const parsedInStock = inStock === 'true' || inStock === true;
      product.inStock = parsedInStock;
      product.quantity = parsedInStock ? (product.quantity > 0 ? product.quantity : 1) : 0;
    } else if (quantity !== undefined) {
      const numQty = Number(quantity);
      product.quantity = numQty;
      product.inStock = numQty > 0;
    }
    if (category) {
      product.category = category.toLowerCase();
    }
    if (subCategory !== undefined) {
      product.subCategory = subCategory ? subCategory.toLowerCase() : null;
    }
    product.imageUrls = updatedMainUrls;

    product.hasVariants = isHasVariants;
    product.variants = finalVariants;
    product.variantTitle = finalVariants.length > 0 ? finalVariants[0].title : null;
    product.variantImages = finalVariants.length > 0 ? finalVariants[0].images : [];

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
