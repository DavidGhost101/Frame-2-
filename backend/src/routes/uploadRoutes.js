const express = require('express');
const router = express.Router();
const multer = require('multer');
const storageService = require('../services/StorageService');
const ApiResponse = require('../utils/apiResponse');

// Multer in-memory storage (up to 20MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, WEBP, GIF) are allowed.'), false);
    }
  }
});

// Upload listing photo (Multipart file OR base64 payload in JSON)
router.post('/photo', (req, res, next) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      return ApiResponse.error(res, err.message || 'File upload failed', 400);
    }

    try {
      // 1. Check if uploaded via multipart/form-data
      if (req.file) {
        const result = await storageService.uploadImageBuffer(
          req.file.buffer,
          req.file.mimetype || 'image/jpeg',
          'listings'
        );
        return ApiResponse.success(res, 'Photo uploaded to Firebase Storage successfully', {
          url: result.url,
          storagePath: result.storagePath,
          size: result.size,
          provider: result.storageProvider
        });
      }

      // 2. Check if uploaded via JSON { base64: "data:image/..." } or { image: "..." }
      const base64Data = req.body.base64 || req.body.image || req.body.photo;
      if (base64Data && typeof base64Data === 'string') {
        const url = await storageService.uploadBase64Image(base64Data, 'listings');
        return ApiResponse.success(res, 'Photo uploaded to Firebase Storage successfully', {
          url,
          provider: url.includes('firebasestorage') ? 'firebase' : 'fallback'
        });
      }

      return ApiResponse.error(res, 'No photo provided. Send a multipart file or base64 image data.', 400);
    } catch (uploadErr) {
      console.error('[UploadRoutes] Error uploading photo:', uploadErr);
      return ApiResponse.error(res, uploadErr.message || 'Failed to upload photo to Firebase Storage', 500);
    }
  });
});

// Alias endpoint
router.post('/listing-photo', (req, res, next) => {
  req.url = '/photo';
  router.handle(req, res, next);
});

// Config endpoint for client
router.get('/config', (req, res) => {
  return ApiResponse.success(res, 'Storage configuration retrieved', {
    bucket: storageService.bucketName,
    projectId: storageService.projectId,
    provider: 'firebase_storage'
  });
});

module.exports = router;
