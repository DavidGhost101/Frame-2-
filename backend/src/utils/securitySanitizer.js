/**
 * Central Security Sanitizer and Sensitive-Field Denylist
 *
 * Enforces strict defense-in-depth sanitization across all API responses,
 * error handlers, logging routines, and model serializers.
 */

// Central denylist of sensitive fields that MUST NEVER be exposed to clients
const SENSITIVE_DENYLIST = [
  'password',
  'passwordhash',
  'hashedpassword',
  'salt',
  'resettoken',
  'resetpasswordtoken',
  'passwordresettoken',
  'passwordresetexpires',
  'verificationtoken',
  'emailverificationtoken',
  'emailverificationsecret',
  'otp',
  'otpcode',
  'otpsecret',
  'jwtsecret',
  'apikey',
  'apisecret',
  'secret',
  'privatekey',
  'encryptionkey',
  'internalauthemail'
];

const SENSITIVE_SET = new Set(SENSITIVE_DENYLIST);

// Pattern to catch variants like "adminApiKey", "userPasswordHash", etc.
const SENSITIVE_REGEX = /^(password|passwordhash|hashedpassword|salt|resettoken|resetpasswordtoken|passwordresettoken|verificationtoken|emailverificationtoken|otp|otpcode|otpsecret|jwtsecret|apikey|apisecret|privatekey|encryptionkey)$/i;

/**
 * Checks if a given property key is sensitive
 */
function isSensitiveKey(key) {
  if (!key || typeof key !== 'string') return false;
  const lower = key.toLowerCase();
  if (SENSITIVE_SET.has(lower)) return true;
  return SENSITIVE_REGEX.test(lower);
}

/**
 * Deeply sanitizes data by recursively stripping all denylisted keys.
 * Handles nested objects, arrays, Mongoose documents, and prevents circular references.
 *
 * @param {*} data - The input data to sanitize
 * @param {Object} options - Configuration options
 * @param {boolean} options.redactOnly - If true, replaces value with '[REDACTED]' instead of deleting
 * @param {Set<string>} options.allowKeys - Optional set of keys allowed to bypass (e.g. accessToken during login)
 * @param {WeakSet} seen - WeakSet tracking visited objects to prevent circular loops
 * @returns {*} Sanitized copy of the data
 */
function sanitizeData(data, options = {}, ancestors = new Set()) {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle primitive values
  if (typeof data !== 'object') {
    return data;
  }

  // Handle Dates, RegExps, Buffers, BSON ObjectIDs
  if (data instanceof Date || data instanceof RegExp || Buffer.isBuffer(data)) {
    return data;
  }
  if (data._bsontype === 'ObjectID' || (data.constructor && data.constructor.name === 'ObjectId')) {
    return data.toString();
  }

  // Handle Mongoose documents / objects with custom toObject or toJSON
  let target = data;
  if (typeof data.toObject === 'function') {
    target = data.toObject();
  } else if (typeof data.toJSON === 'function' && typeof data.then !== 'function') {
    target = data.toJSON();
  }

  // If toObject/toJSON returned a primitive, return it directly
  if (target === null || target === undefined || typeof target !== 'object') {
    return target;
  }

  if (target instanceof Date || target instanceof RegExp || Buffer.isBuffer(target)) {
    return target;
  }
  if (target._bsontype === 'ObjectID' || (target.constructor && target.constructor.name === 'ObjectId')) {
    return target.toString();
  }

  // Prevent infinite loops on cyclic data structures along active call stack
  if (ancestors.has(target)) {
    return '[Circular]';
  }
  ancestors.add(target);

  try {
    // Handle Arrays
    if (Array.isArray(target)) {
      return target.map(item => sanitizeData(item, options, ancestors));
    }

    // Handle Objects
    const cleanObj = {};
    const allowKeys = options.allowKeys || null;

    for (const key of Object.keys(target)) {
      // Check if key is explicitly permitted
      if (allowKeys && allowKeys.has(key)) {
        cleanObj[key] = sanitizeData(target[key], options, ancestors);
        continue;
      }

      if (isSensitiveKey(key)) {
        if (options.redactOnly) {
          cleanObj[key] = '[REDACTED]';
        }
        // Otherwise completely omit the key
        continue;
      }

      // Recursively sanitize child properties
      cleanObj[key] = sanitizeData(target[key], options, ancestors);
    }

    return cleanObj;
  } finally {
    ancestors.delete(target);
  }
}

/**
 * Sanitizes an object specifically for logging output (redacting sensitive fields)
 */
function sanitizeForLogging(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  return sanitizeData(meta, { redactOnly: true });
}

/**
 * Explicit Data Transfer Object Serializers
 */

/**
 * Serialize User Model
 */
function serializeUser(user, isPrivileged = false) {
  if (!user) return null;
  const raw = typeof user.toObject === 'function' ? user.toObject() : { ...user };

  const safe = {
    id: String(raw._id || raw.id || ''),
    _id: String(raw._id || raw.id || ''),
    fullName: raw.fullName || '',
    role: raw.role || 'USER',
    status: raw.status || 'active',
    isPhoneVerified: Boolean(raw.isPhoneVerified),
    isEmailVerified: Boolean(raw.isEmailVerified),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString()
  };

  if (raw.phone) safe.phone = raw.phone;

  // Privileged viewers (admin or account owner) see email and administrative flags
  if (isPrivileged) {
    if (raw.email) safe.email = raw.email;
    if (raw.admin !== undefined) safe.admin = Boolean(raw.admin);
  } else if (raw.email) {
    // Mask email for non-privileged viewers: j***e@example.com
    const parts = raw.email.split('@');
    if (parts.length === 2) {
      const name = parts[0];
      const masked = name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : `${name[0]}***`;
      safe.email = `${masked}@${parts[1]}`;
    }
  }

  return sanitizeData(safe);
}

/**
 * Serialize Landlord Model
 */
function serializeLandlord(landlord, isPrivileged = false) {
  if (!landlord) return null;
  const raw = typeof landlord.toObject === 'function' ? landlord.toObject() : { ...landlord };

  const safe = {
    id: String(raw._id || raw.id || ''),
    _id: String(raw._id || raw.id || ''),
    fullName: raw.fullName || 'Landlord',
    isPhoneVerified: Boolean(raw.isPhoneVerified),
    hasWhatsapp: Boolean(raw.hasWhatsapp),
    showPhonePublicly: Boolean(raw.showPhonePublicly),
    isPaidSubscriber: Boolean(raw.isPaidSubscriber),
    createdAt: raw.createdAt || new Date().toISOString()
  };

  if (raw.phone && (raw.showPhonePublicly || isPrivileged)) {
    safe.phone = raw.phone;
  }

  if (isPrivileged) {
    safe.isBlocked = Boolean(raw.isBlocked);
    safe.notes = raw.notes || '';
    if (raw.trialEndsAt) safe.trialEndsAt = raw.trialEndsAt;
    if (raw.userId) safe.userId = raw.userId;
    if (raw.listingCount !== undefined) safe.listingCount = raw.listingCount;
  }

  return sanitizeData(safe);
}

/**
 * Serialize Room Listing Model
 */
function serializeListing(listing, isPrivileged = false) {
  if (!listing) return null;
  const raw = typeof listing.toObject === 'function' ? listing.toObject() : { ...listing };

  const safe = {
    id: String(raw._id || raw.id || ''),
    _id: String(raw._id || raw.id || ''),
    title: raw.title || '',
    description: raw.description || '',
    suburb: raw.suburb || '',
    address: raw.address || raw.suburb || '',
    monthlyRent: Number(raw.monthlyRent || raw.price || 0),
    price: Number(raw.monthlyRent || raw.price || 0),
    propertyType: raw.propertyType || 'Backroom',
    nearbyInstitution: raw.nearbyInstitution || '',
    amenities: Array.isArray(raw.amenities) ? raw.amenities : [],
    image: raw.image || (raw.photos && raw.photos[0]) || '',
    photos: Array.isArray(raw.photos) ? raw.photos : (raw.image ? [raw.image] : []),
    status: raw.status || 'published',
    publicationStatus: raw.publicationStatus || 'PUBLISHED',
    availability: raw.availability || 'available',
    available: raw.available !== undefined ? Boolean(raw.available) : true,
    occupied: Boolean(raw.occupied || raw.isOccupied),
    isOccupied: Boolean(raw.occupied || raw.isOccupied),
    hasWhatsapp: Boolean(raw.hasWhatsapp),
    contactCount: Number(raw.contactCount || 0),
    viewsCount: Number(raw.viewsCount || raw.viewCount || 0),
    viewCount: Number(raw.viewsCount || raw.viewCount || 0),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString()
  };

  // Landlord reference (safe public representation)
  if (raw.landlordId) {
    if (typeof raw.landlordId === 'object') {
      safe.landlordId = serializeLandlord(raw.landlordId, isPrivileged);
    } else {
      safe.landlordId = String(raw.landlordId);
    }
  }
  if (raw.landlordFullName || raw.landlordName) {
    safe.landlordFullName = raw.landlordFullName || raw.landlordName;
  }
  if (raw.phone && (raw.showPhonePublicly !== false || isPrivileged)) {
    safe.phone = raw.phone;
  }

  // Internal Moderation / Administrative fields (strictly forbidden for general public)
  if (isPrivileged) {
    if (raw.flagged !== undefined) safe.flagged = Boolean(raw.flagged);
    if (raw.reportCount !== undefined) safe.reportCount = Number(raw.reportCount);
    if (raw.approvedBy) safe.approvedBy = raw.approvedBy;
    if (raw.approvedAt) safe.approvedAt = raw.approvedAt;
    if (raw.publishedAt) safe.publishedAt = raw.publishedAt;
    if (raw.rejectedBy) safe.rejectedBy = raw.rejectedBy;
    if (raw.rejectedAt) safe.rejectedAt = raw.rejectedAt;
    if (raw.rejectionReason) safe.rejectionReason = raw.rejectionReason;
    if (raw.suspendedBy) safe.suspendedBy = raw.suspendedBy;
    if (raw.suspendedAt) safe.suspendedAt = raw.suspendedAt;
    if (raw.suspensionReason) safe.suspensionReason = raw.suspensionReason;
  }

  return sanitizeData(safe);
}

/**
 * Serialize Room Request Model
 */
function serializeRoomRequest(request, isPrivileged = false) {
  if (!request) return null;
  const raw = typeof request.toObject === 'function' ? request.toObject() : { ...request };

  const safe = {
    id: String(raw._id || raw.id || ''),
    _id: String(raw._id || raw.id || ''),
    seekerName: raw.seekerName || 'Room Seeker',
    suburb: raw.suburb || '',
    maxBudget: Number(raw.maxBudget || 0),
    roomType: raw.roomType || 'Single Room',
    status: raw.status || 'active',
    moveInDate: raw.moveInDate || '',
    notes: raw.notes || '',
    urgency: raw.urgency || 'medium',
    contactCount: Number(raw.contactCount || 0),
    createdAt: raw.createdAt || new Date().toISOString()
  };

  if (raw.phone && isPrivileged) {
    safe.phone = raw.phone;
  }

  return sanitizeData(safe);
}

module.exports = {
  SENSITIVE_DENYLIST,
  isSensitiveKey,
  sanitizeData,
  sanitizeForLogging,
  serializeUser,
  serializeLandlord,
  serializeListing,
  serializeRoomRequest
};
