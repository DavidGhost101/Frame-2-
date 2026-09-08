const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Storage } = require('@google-cloud/storage');

// Load Firebase configuration
let firebaseConfig = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn('Could not parse firebase-applet-config.json:', e.message);
}

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || 'intricate-crowbar-nnm9t';
const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket || `${PROJECT_ID}.firebasestorage.app`;

class StorageService {
  constructor() {
    this.bucketName = BUCKET_NAME;
    this.projectId = PROJECT_ID;
    this.gcs = null;
    this.bucket = null;
    this.initStorage();
  }

  initStorage() {
    try {
      // Validate bucket name syntax: must be non-empty lowercase DNS string
      if (!this.bucketName || !/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/.test(this.bucketName)) {
        console.log(`[StorageService] Invalid or non-standard bucket name '${this.bucketName}', using resilient local storage`);
        this.bucket = null;
        return;
      }
      this.gcs = new Storage({
        projectId: this.projectId
      });
      this.bucket = this.gcs.bucket(this.bucketName);
      console.log(`[StorageService] Initialized Firebase Storage bucket: ${this.bucketName}`);
    } catch (err) {
      console.warn('[StorageService] GCS initialization notice:', err.message);
      this.bucket = null;
    }
  }

  /**
   * Helper to execute a promise with a timeout
   */
  async withTimeout(promise, ms = 2500) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Storage operation timed out after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Upload an image buffer directly to Firebase Storage
   * @param {Buffer} buffer - Raw image file buffer
   * @param {string} mimeType - e.g. 'image/jpeg', 'image/png', 'image/webp'
   * @param {string} folder - Destination folder, default 'listings'
   * @returns {Promise<{ url: string, storagePath: string, size: number }>}
   */
  async uploadImageBuffer(buffer, mimeType = 'image/jpeg', folder = 'listings') {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error('Invalid file buffer provided for upload.');
    }

    // Determine extension
    let ext = 'jpg';
    if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('gif')) ext = 'gif';

    const uniqueId = crypto.randomBytes(12).toString('hex');
    const filename = `${Date.now()}_${uniqueId}.${ext}`;
    const storagePath = `${folder}/${filename}`;
    const downloadToken = crypto.randomUUID();

    // 1. Attempt upload to Firebase Storage with quick timeout
    if (this.bucket && this.gcs) {
      try {
        const file = this.bucket.file(storagePath);
        
        await this.withTimeout(file.save(buffer, {
          metadata: {
            contentType: mimeType,
            cacheControl: 'public, max-age=31536000',
            metadata: {
              firebaseStorageDownloadTokens: downloadToken,
              uploadedVia: 'rentaroom-applet',
              uploadedAt: new Date().toISOString()
            }
          },
          resumable: false
        }), 2500);

        try { await file.makePublic(); } catch (_) {}

        const firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${this.bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;
        console.log(`[StorageService] Successfully uploaded photo to Firebase Storage: ${storagePath}`);
        return {
          url: firebaseUrl,
          storagePath,
          size: buffer.length,
          storageProvider: 'firebase'
        };
      } catch (gcsError) {
        console.warn(`[StorageService] Firebase Storage upload error (${gcsError.message}), falling back to resilient local storage...`);
      }
    }

    // 2. Resilient local fallback storage (instant, zero network latency)
    return this.saveLocalFallback(buffer, filename, storagePath);
  }

  /**
   * Upload a base64 Data URI to Firebase Storage, moving away from in-database base64
   * @param {string} base64DataUri - e.g. "data:image/jpeg;base64,/9j/4AAQSk..."
   * @param {string} folder - Destination folder
   * @returns {Promise<string>} - Permanent public HTTPS URL
   */
  async uploadBase64Image(base64DataUri, folder = 'listings') {
    if (!base64DataUri || typeof base64DataUri !== 'string') {
      return '';
    }

    // If it's already a hosted URL (http/https) or preset, do not re-upload
    if (base64DataUri.startsWith('http://') || base64DataUri.startsWith('https://') || base64DataUri.startsWith('/images/')) {
      return base64DataUri;
    }

    // Extract mime type and base64 payload
    const matches = base64DataUri.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      // Check if it's raw base64 without prefix
      try {
        const buffer = Buffer.from(base64DataUri, 'base64');
        const result = await this.uploadImageBuffer(buffer, 'image/jpeg', folder);
        return result.url;
      } catch (_) {
        return base64DataUri;
      }
    }

    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const result = await this.uploadImageBuffer(buffer, mimeType, folder);
    return result.url;
  }

  /**
   * Inspects and sanitizes a listing's image field.
   * If it contains a base64 data URI, uploads it to Firebase Storage and returns the URL.
   */
  async sanitizeListingImage(image) {
    if (!image || typeof image !== 'string') return '';
    if (image.startsWith('data:image/') || (image.length > 500 && !image.startsWith('http'))) {
      try {
        const publicUrl = await this.uploadBase64Image(image, 'listings');
        return publicUrl;
      } catch (err) {
        console.warn('[StorageService] Failed to upload base64 image to Firebase Storage:', err.message);
        return image;
      }
    }
    return image;
  }

  saveLocalFallback(buffer, filename, storagePath) {
    try {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const localFilePath = path.join(uploadDir, filename);
      fs.writeFileSync(localFilePath, buffer);
      const localUrl = `/uploads/${filename}`;
      console.log(`[StorageService] Saved photo to local fallback: ${localUrl}`);
      return {
        url: localUrl,
        storagePath,
        size: buffer.length,
        storageProvider: 'local_fallback'
      };
    } catch (fsErr) {
      console.error('[StorageService] Local storage write failed:', fsErr.message);
      throw fsErr;
    }
  }
}

module.exports = new StorageService();
