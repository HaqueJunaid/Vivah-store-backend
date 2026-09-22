import { Category } from '../models/Category.js';

export const slugify = (text) => {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

export const DEFAULT_NAVIGATION = [
  { title: "Assets", url: "assets", order: 1, baseItems: [] },
  {
    title: "Boards & Signage",
    url: "boards-signage",
    order: 2,
    baseItems: [
      { title: "Guest pick up card", url: "guest-pickup-card" },
      { title: "Playful Sign", url: "playful-sign" },
      { title: "Wedding Contact Board", url: "wedding-contact-board" },
      { title: "Wedding Welcome Board", url: "wedding-welcome-board" },
      { title: "Wedding Vow Board", url: "wedding-vow-board" },
    ],
  },
  {
    title: "Room Stationery",
    url: "room-stationery",
    order: 3,
    baseItems: [
      { title: "Door Dangler", url: "door-dangler" },
      { title: "Hangover Kit", url: "hangover-kit" },
      { title: "Itinerary", url: "itinerary" },
      { title: "Tent Card", url: "tent-card" },
      { title: "Gift & Hamper Tags", url: "gift-hamper-tags" },
      { title: "Welcome Note", url: "welcome-note" },
    ],
  },
  {
    title: "Utility Stationery",
    url: "utility-stationery",
    order: 4,
    baseItems: [
      { title: "Menu Card", url: "menu-card" },
      { title: "Ritual Kit", url: "ritual-kit" },
    ],
  },
  {
    title: "Fun & Entertainment",
    url: "fun-entertainment",
    order: 5,
    baseItems: [
      { title: "Ghunghroo Sticks", url: "ghunghroo-sticks" },
      { title: "Popcorn Tub", url: "popcorn-tub" },
      { title: "Newspaper", url: "newspaper" },
      { title: "Tambola Tickets", url: "tambola-tickets" },
      { title: "Playing Cards", url: "playing-cards" },
      { title: "Instagram / Snapchat Filter", url: "instagram-snapchat-filter" },
    ],
  },
  {
    title: "Thermatic Elements",
    url: "thermatic-elements",
    order: 6,
    baseItems: [
      { title: "Coconut Stamp", url: "coconut-stamp" },
      { title: "Food Topper", url: "food-topper" },
      { title: "Drink Stirrers", url: "drink-stirrers" },
      { title: "Petal Cones", url: "petal-cones" },
      { title: "Paper Cups", url: "paper-cups" },
      { title: "Straws", url: "straws" },
      { title: "Tissue Paper", url: "tissue-paper" },
    ],
  },
  {
    title: "Favour & Gifts",
    url: "favour-gifts",
    order: 7,
    baseItems: [
      { title: "Bells With Tags", url: "bells-with-tags" },
      { title: "Badges", url: "badges" },
      { title: "Chocolate Wrapper", url: "chocolate-wrapper" },
      { title: "Luggage Tags", url: "luggage-tags" },
      { title: "Favour Paper Bags", url: "favour-paper-bags" },
      { title: "Jute Bags", url: "jute-bags" },
      { title: "Money Envelope", url: "money-envelope" },
      { title: "Pin Brooches", url: "pin-brooches" },
      { title: "Wedding Stickers", url: "wedding-stickers" },
      { title: "Welcome Mala", url: "welcome-mala" },
    ],
  },
  {
    title: "Invites & Planner",
    url: "invites-planner",
    order: 8,
    baseItems: [
      { title: "E-Invite", url: "e-invite" },
      { title: "Wardrobe Planner", url: "wardrobe-planner" },
      { title: "Logo", url: "logo" },
      { title: "Hashtag", url: "hashtag" },
      { title: "Wax Seals", url: "wax-seals" },
      { title: "Wedding Logo Template", url: "wedding-logo-template" },
    ],
  },
];

// Helper to seed or sync default categories
const seedDefaultsIfNeeded = async () => {
  const count = await Category.countDocuments();
  if (count === 0) {
    await Category.insertMany(DEFAULT_NAVIGATION);
  }
};

export const getAllCategories = async (req, res) => {
  try {
    await seedDefaultsIfNeeded();
    const categories = await Category.find().sort({ order: 1, createdAt: 1 }).lean();

    res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch categories.',
    });
  }
};

export const addSubCategory = async (req, res) => {
  try {
    const { categoryTitleOrUrl, subCategoryTitle } = req.body;

    if (!categoryTitleOrUrl || !subCategoryTitle) {
      return res.status(400).json({
        success: false,
        message: 'Category identifier and sub-category title are required.',
      });
    }

    const trimmedTitle = subCategoryTitle.trim();
    if (!trimmedTitle) {
      return res.status(400).json({
        success: false,
        message: 'Sub-category title cannot be empty.',
      });
    }

    const slug = slugify(trimmedTitle);
    if (!slug) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sub-category title format.',
      });
    }

    await seedDefaultsIfNeeded();

    const normalizedTarget = categoryTitleOrUrl.trim();
    // Search category by URL or Title (case-insensitive)
    const category = await Category.findOne({
      $or: [
        { url: normalizedTarget.toLowerCase() },
        { title: { $regex: new RegExp(`^${normalizedTarget}$`, 'i') } },
      ],
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: `Category "${categoryTitleOrUrl}" not found.`,
      });
    }

    // Check duplicate
    const isDuplicate = (category.baseItems || []).some(
      (item) =>
        item.title.toLowerCase() === trimmedTitle.toLowerCase() ||
        item.url.toLowerCase() === slug.toLowerCase()
    );

    if (isDuplicate) {
      return res.status(400).json({
        success: false,
        message: `Sub-category "${trimmedTitle}" already exists in ${category.title}.`,
      });
    }

    const newSubCategory = {
      title: trimmedTitle,
      url: slug,
    };

    category.baseItems.push(newSubCategory);
    await category.save();

    res.status(201).json({
      success: true,
      message: `Sub-category "${trimmedTitle}" added successfully.`,
      subCategory: newSubCategory,
      category,
    });
  } catch (error) {
    console.error('Add sub-category error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add sub-category.',
    });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { title, url } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Category title is required.',
      });
    }

    const trimmedTitle = title.trim();
    const categoryUrl = url ? slugify(url) : slugify(trimmedTitle);

    const existing = await Category.findOne({
      $or: [
        { url: categoryUrl },
        { title: { $regex: new RegExp(`^${trimmedTitle}$`, 'i') } },
      ],
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Category "${trimmedTitle}" already exists.`,
      });
    }

    const maxOrderDoc = await Category.findOne().sort({ order: -1 });
    const order = maxOrderDoc ? (maxOrderDoc.order || 0) + 1 : 1;

    const newCategory = await Category.create({
      title: trimmedTitle,
      url: categoryUrl,
      order,
      baseItems: [],
    });

    res.status(201).json({
      success: true,
      message: `Category "${trimmedTitle}" created successfully.`,
      category: newCategory,
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create category.',
    });
  }
};

export const deleteSubCategory = async (req, res) => {
  try {
    const { categoryTitleOrUrl, subCategoryUrl } = req.body;

    if (!categoryTitleOrUrl || !subCategoryUrl) {
      return res.status(400).json({
        success: false,
        message: 'Category identifier and sub-category URL are required.',
      });
    }

    const normalizedTarget = categoryTitleOrUrl.trim();
    const category = await Category.findOne({
      $or: [
        { url: normalizedTarget.toLowerCase() },
        { title: { $regex: new RegExp(`^${normalizedTarget}$`, 'i') } },
      ],
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: `Category "${categoryTitleOrUrl}" not found.`,
      });
    }

    const initialLength = category.baseItems.length;
    category.baseItems = category.baseItems.filter(
      (item) => item.url.toLowerCase() !== subCategoryUrl.toLowerCase()
    );

    if (category.baseItems.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: `Sub-category "${subCategoryUrl}" not found in ${category.title}.`,
      });
    }

    await category.save();

    res.status(200).json({
      success: true,
      message: 'Sub-category deleted successfully.',
      category,
    });
  } catch (error) {
    console.error('Delete sub-category error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete sub-category.',
    });
  }
};
