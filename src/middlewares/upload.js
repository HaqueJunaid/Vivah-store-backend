import multer from 'multer';
import imagekit from '../config/imagekit.js';

const storage = multer.memoryStorage();

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

export const uploadToImageKit = async (files) => {
  try {
    if (!files || files.length === 0) {
      return [];
    }

    const uploadPromises = files.map((file) =>
      imagekit.upload({
        file: file.buffer,
        fileName: `${Date.now()}-${file.originalname}`,
        folder: '/vivahstore/products',
      })
    );

    const results = await Promise.all(uploadPromises);
    return results.map((result) => result.url);
  } catch (error) {
    console.error('ImageKit upload error:', error);
    throw new Error('Failed to upload images to ImageKit');
  }
};

export const deleteFromImageKit = async (urls) => {
  if (!urls || urls.length === 0) return;

  const deletePromises = urls.map(async (url) => {
    try {
      if (!url) return;
      const parts = url.split('/');
      const filename = parts[parts.length - 1];
      if (!filename) return;

      const files = await imagekit.listFiles({
        searchQuery: `name = "${filename}"`,
      });

      if (files && files.length > 0) {
        await imagekit.deleteFile(files[0].fileId);
        console.log(`Deleted file from ImageKit: ${filename} (ID: ${files[0].fileId})`);
      }
    } catch (error) {
      console.error(`Failed to delete image from ImageKit: ${url}`, error.message);
    }
  });

  await Promise.all(deletePromises);
};
