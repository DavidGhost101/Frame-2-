// Resilient In-Memory Store: Ensures instant, zero-latency operations
// even if MongoDB is not connected, preventing buffering timeouts.

const fallbackLandlords = [
  {
    _id: 'landlord_001',
    fullName: 'Sipho Ndlovu',
    email: 'sipho.ndlovu@rentaroom.co.za',
    phone: '+27821234567',
    suburb: 'Dobsonville',
    location: 'Dobsonville, Soweto',
    isPhoneVerified: true,
    hasWhatsapp: true,
    showPhonePublicly: true,
    consentPhonePublic: true,
    consentTimestamp: new Date(),
    isPaidSubscriber: true,
    trialEndsAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
    isWithinFreeAccess: () => true,
    createdAt: new Date('2026-01-15')
  },
  {
    _id: 'landlord_002',
    fullName: 'Thabo Molefe',
    email: 'thabo.molefe@gmail.com',
    phone: '+27839876543',
    suburb: 'Pimville',
    location: 'Pimville, Soweto',
    isPhoneVerified: true,
    hasWhatsapp: true,
    showPhonePublicly: true,
    consentPhonePublic: true,
    consentTimestamp: new Date(),
    isPaidSubscriber: true,
    trialEndsAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
    isWithinFreeAccess: () => true,
    createdAt: new Date('2026-01-20')
  },
  {
    _id: 'landlord_003',
    fullName: 'Nomsa Zulu',
    email: 'nomsa.zulu@gmail.com',
    phone: '+27845551234',
    suburb: 'Diepkloof',
    location: 'Diepkloof Zone 3, Soweto',
    isPhoneVerified: true,
    hasWhatsapp: true,
    showPhonePublicly: true,
    consentPhonePublic: true,
    consentTimestamp: new Date(),
    isPaidSubscriber: false,
    trialEndsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    isWithinFreeAccess: () => true,
    createdAt: new Date('2026-02-01')
  },
  {
    _id: 'landlord_004',
    fullName: 'Kagiso Mokoena',
    email: 'kagiso.mokoena@outlook.com',
    phone: '+27712349988',
    suburb: 'Meadowlands',
    location: 'Meadowlands Zone 2, Soweto',
    isPhoneVerified: true,
    hasWhatsapp: true,
    showPhonePublicly: true,
    consentPhonePublic: true,
    consentTimestamp: new Date(),
    isPaidSubscriber: true,
    trialEndsAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
    isWithinFreeAccess: () => true,
    createdAt: new Date('2026-02-10')
  },
  {
    _id: 'landlord_005',
    fullName: 'Busi Khumalo',
    email: 'busi.khumalo@gmail.com',
    phone: '+27814443322',
    suburb: 'Protea Glen',
    location: 'Protea Glen Ext 4, Soweto',
    isPhoneVerified: false,
    hasWhatsapp: true,
    showPhonePublicly: true,
    consentPhonePublic: true,
    consentTimestamp: new Date(),
    isPaidSubscriber: false,
    trialEndsAt: new Date(Date.now() + 15 * 24 * 3600 * 1000),
    isWithinFreeAccess: () => true,
    createdAt: new Date('2026-02-18')
  }
];

const fallbackListings = [
  {
    _id: 'listing_001',
    landlordId: 'landlord_001',
    title: 'Modern Ensuite Backroom with Fitted Wardrobe',
    suburb: 'Dobsonville',
    address: '14 Vilakazi Cres, Dobsonville Ext 2',
    monthlyRent: 2200,
    propertyType: 'Ensuite',
    amenities: ['Free WiFi', 'Prepaid Power', 'Private Shower', 'Secured Yard', 'Near Rea Vaya'],
    image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
    status: 'active',
    source: 'landlord',
    contactCount: 14,
    flagged: false,
    flagReasons: [],
    reportCount: 0,
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000)
  },
  {
    _id: 'listing_002',
    landlordId: 'landlord_001',
    title: 'Spacious Garage Conversion Flatlet',
    suburb: 'Orlando West',
    address: '88 Moema St, Orlando West',
    monthlyRent: 1800,
    propertyType: 'Garage',
    amenities: ['Prepaid Electricity', 'Parking Space', 'Hot Water', 'Tiled Floors'],
    image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
    status: 'active',
    source: 'landlord',
    contactCount: 8,
    flagged: false,
    flagReasons: [],
    reportCount: 0,
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000)
  },
  {
    _id: 'listing_003',
    landlordId: 'landlord_002',
    title: 'Student Residence Room near UJ Soweto Campus',
    suburb: 'Pimville',
    address: '23 Modjadji St, Pimville Zone 4',
    monthlyRent: 2400,
    propertyType: 'Student Accommodation',
    nearbyInstitution: 'University of Johannesburg, Soweto Campus',
    amenities: ['Uncapped WiFi', 'Study Desk', 'Prepaid Meter', 'Near UJ Campus', 'CCTV Security'],
    image: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80',
    status: 'active',
    source: 'landlord',
    contactCount: 22,
    flagged: false,
    flagReasons: [],
    reportCount: 0,
    createdAt: new Date(Date.now() - 1 * 24 * 3600 * 1000)
  },
  {
    _id: 'listing_004',
    landlordId: 'landlord_002',
    title: 'Neat Self-Contained 1-Bedroom Apartment',
    suburb: 'Diepkloof',
    address: '41 Immink Drive, Diepkloof Zone 3',
    monthlyRent: 2800,
    propertyType: 'Apartment',
    amenities: ['Full Bathroom', 'Fitted Kitchenette', 'Gated Yard', 'Prepaid Power', 'Near Diepkloof Square'],
    image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80',
    status: 'active',
    source: 'landlord',
    contactCount: 19,
    flagged: false,
    flagReasons: [],
    reportCount: 0,
    createdAt: new Date(Date.now() - 4 * 24 * 3600 * 1000)
  },
  {
    _id: 'listing_005',
    landlordId: 'landlord_001',
    title: 'Affordable Single Backroom',
    suburb: 'Protea Glen',
    address: '112 Acacia St, Protea Glen Ext 4',
    monthlyRent: 1500,
    propertyType: 'Backroom',
    amenities: ['Shared Bathroom', 'Prepaid Electricity', 'Near Protea Glen Mall', 'Safe Fenced Yard'],
    image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&q=80',
    status: 'active',
    source: 'landlord',
    contactCount: 5,
    flagged: false,
    flagReasons: [],
    reportCount: 0,
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000)
  },
  {
    _id: 'listing_006',
    landlordId: 'landlord_002',
    title: 'Secure Flatlet with Covered Carport',
    suburb: 'Meadowlands',
    address: '77 Hekroodt St, Meadowlands Zone 5',
    monthlyRent: 2100,
    propertyType: 'Flatlet',
    amenities: ['Private Shower & Toilet', 'Free WiFi', 'Paved Yard', 'Motorized Gate', 'Covered Parking'],
    image: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80',
    status: 'active',
    publicationStatus: 'PUBLISHED',
    approvedBy: '12rakosadavid@gmail.com',
    approvedAt: new Date(Date.now() - 6 * 24 * 3600 * 1000),
    publishedAt: new Date(Date.now() - 6 * 24 * 3600 * 1000),
    source: 'landlord',
    contactCount: 11,
    flagged: false,
    flagReasons: [],
    reportCount: 0,
    createdAt: new Date(Date.now() - 6 * 24 * 3600 * 1000)
  },
  {
    _id: 'listing_006',
    landlordId: 'landlord_003',
    title: 'Brand New Self-Contained Bachelor Room with Prepaid Meter',
    suburb: 'Meadowlands',
    address: '42 Heald St, Meadowlands Zone 2',
    monthlyRent: 2300,
    propertyType: 'Backroom',
    amenities: ['Prepaid Meter', 'Private Shower', 'Secured Burglar Bars', 'Paved Yard'],
    image: 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80',
    status: 'pending_review',
    publicationStatus: 'PENDING',
    source: 'landlord',
    contactCount: 0,
    flagged: false,
    flagReasons: [],
    reportCount: 0,
    createdAt: new Date(Date.now() - 2 * 3600 * 1000)
  }
];

const fallbackRequests = [
  {
    _id: 'req_001',
    seekerName: 'Nompumelelo Khumalo',
    phone: '+27721234567',
    hasWhatsapp: true,
    suburb: 'Dobsonville',
    maxBudget: 2200,
    roomType: 'Ensuite',
    occupation: 'Working Professional',
    moveInDate: '1st of Next Month',
    notes: 'Looking for a secure, quiet ensuite backroom with own shower and parking space. Employed in Roodepoort.',
    amenitiesWanted: ['Private Shower', 'Prepaid Electricity', 'Parking', 'Secured Yard'],
    status: 'active',
    contactCount: 3,
    isVerified: true,
    createdAt: new Date(Date.now() - 1 * 24 * 3600 * 1000)
  },
  {
    _id: 'req_002',
    seekerName: 'Kagiso Mokoena',
    phone: '+27812345678',
    hasWhatsapp: true,
    suburb: 'Pimville',
    maxBudget: 2000,
    roomType: 'Student Accommodation',
    occupation: 'Student',
    moveInDate: 'Immediate',
    notes: 'UJ Soweto Campus student looking for a neat room within walking distance to campus. WiFi required.',
    amenitiesWanted: ['Free WiFi', 'Study Desk', 'Prepaid Power'],
    status: 'active',
    contactCount: 5,
    isVerified: true,
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000)
  },
  {
    _id: 'req_003',
    seekerName: 'Bongani Sithole',
    phone: '+27734567890',
    hasWhatsapp: true,
    suburb: 'Orlando East',
    maxBudget: 1800,
    roomType: 'Backroom',
    occupation: 'Working Professional',
    moveInDate: 'Flexible',
    notes: 'Seeking a tiled backroom close to Rea Vaya or Metrorail train station. Non-smoker and quiet.',
    amenitiesWanted: ['Near Transport', 'Prepaid Meter', 'Hot Water'],
    status: 'active',
    contactCount: 2,
    isVerified: true,
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000)
  },
  {
    _id: 'req_004',
    seekerName: 'Zandile & Sibusiso',
    phone: '+27845678901',
    hasWhatsapp: true,
    suburb: 'Diepkloof',
    maxBudget: 3000,
    roomType: 'Flatlet',
    occupation: 'Couple',
    moveInDate: 'End of Month',
    notes: 'Young working couple looking for a self-contained 1-bedroom flatlet with own kitchen and secure parking.',
    amenitiesWanted: ['Fitted Kitchen', 'Full Bathroom', 'Gated Yard', 'Parking'],
    status: 'active',
    contactCount: 4,
    isVerified: true,
    createdAt: new Date(Date.now() - 4 * 24 * 3600 * 1000)
  }
];

function getLandlordById(id) {
  return fallbackLandlords.find(l => String(l._id) === String(id));
}

function getLandlordByPhone(phone) {
  return fallbackLandlords.find(l => l.phone === phone);
}

function addLandlord(data) {
  const newLandlord = {
    _id: 'landlord_' + Date.now(),
    isPhoneVerified: false,
    isBlocked: false,
    hasWhatsapp: true,
    showPhonePublicly: false,
    consentPhonePublic: false,
    consentTimestamp: null,
    trialEndsAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
    isPaidSubscriber: true,
    isWithinFreeAccess: () => true,
    createdAt: new Date(),
    ...data
  };
  fallbackLandlords.push(newLandlord);
  return newLandlord;
}

function addListing(data) {
  const newListing = {
    _id: 'listing_' + Date.now(),
    status: 'pending_review',
    contactCount: 0,
    source: 'landlord',
    flagged: false,
    flagReasons: [],
    reportCount: 0,
    createdAt: new Date(),
    ...data
  };
  fallbackListings.unshift(newListing);
  return newListing;
}

function reportListing(id, reason) {
  const listing = fallbackListings.find(l => String(l._id) === String(id));
  if (listing) {
    listing.reportCount = (listing.reportCount || 0) + 1;
    listing.flagReasons = Array.isArray(listing.flagReasons) ? listing.flagReasons : [];
    listing.flagReasons.push(reason || 'User report');
    if (listing.reportCount >= 2) {
      listing.flagged = true;
    }
    return listing;
  }
  return null;
}

function addRequest(data) {
  const newReq = {
    _id: 'req_' + Date.now(),
    status: 'active',
    contactCount: 0,
    isVerified: true,
    createdAt: new Date(),
    ...data
  };
  fallbackRequests.unshift(newReq);
  return newReq;
}

const fallbackAuditLogs = [
  {
    _id: 'audit_001',
    actorEmail: '12rakosadavid@gmail.com',
    actorRole: 'ADMIN',
    userRole: 'ADMIN',
    action: 'ADMIN_LOGIN',
    resource: 'AdminAuth',
    entityType: 'AdminAuth',
    resourceId: null,
    entityId: null,
    result: 'SUCCESS',
    status: 'SUCCESS',
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0 (AdminPortal/1.0)',
    details: { method: 'POST', path: '/api/auth/admin/login', responseTimeMs: 45 },
    createdAt: new Date(Date.now() - 3600 * 1000)
  },
  {
    _id: 'audit_002',
    actorEmail: '12rakosadavid@gmail.com',
    actorRole: 'ADMIN',
    userRole: 'ADMIN',
    action: 'LISTING_APPROVED',
    resource: 'Listing',
    entityType: 'Listing',
    resourceId: 'listing_001',
    entityId: 'listing_001',
    previousStatus: 'PENDING_REVIEW',
    newStatus: 'APPROVED',
    result: 'SUCCESS',
    status: 'SUCCESS',
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0 (AdminPortal/1.0)',
    details: { title: 'Modern Ensuite Backroom with Fitted Wardrobe', publicationStatus: 'PUBLISHED' },
    createdAt: new Date(Date.now() - 1800 * 1000)
  }
];

function addAuditLog(data) {
  const result = data.result || (data.status === 'FAILURE' || data.status === 'FAILED' ? 'FAILED' : 'SUCCESS');
  const status = data.status || (result === 'FAILED' ? 'FAILURE' : 'SUCCESS');
  const entityType = data.entityType || data.resource || 'Listing';
  const entityId = data.entityId ? String(data.entityId) : (data.resourceId ? String(data.resourceId) : null);
  const actorRole = data.actorRole || data.userRole || 'ADMIN';
  const actorEmail = data.actorEmail || (data.details && (data.details.actorEmail || data.details.email)) || '12rakosadavid@gmail.com';

  const newLog = {
    _id: 'audit_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    actorEmail,
    actorId: data.actorId ? String(data.actorId) : null,
    actorRole,
    userRole: actorRole,
    action: data.action || 'ADMIN_ACTION',
    resource: entityType,
    entityType,
    resourceId: entityId,
    entityId,
    previousStatus: data.previousStatus || null,
    newStatus: data.newStatus || null,
    changes: data.changes || null,
    failureReason: data.failureReason || null,
    ipAddress: data.ipAddress || null,
    userAgent: data.userAgent || null,
    details: data.details || {},
    metadata: data.metadata || {},
    previousValue: data.previousValue || null,
    newValue: data.newValue || null,
    status,
    result,
    createdAt: new Date(),
    ...data
  };
  fallbackAuditLogs.unshift(newLog);
  if (fallbackAuditLogs.length > 300) {
    fallbackAuditLogs.pop();
  }
  return newLog;
}

const fallbackMessages = [
  {
    _id: 'msg_001',
    listingId: 'listing_001',
    landlordId: 'landlord_001',
    tenantId: 'tenant_demo_1',
    sender: 'tenant',
    senderName: 'Sipho K.',
    senderPhone: '+27721112233',
    text: 'Sawubona! Is this ensuite backroom still available for viewing this weekend?',
    read: true,
    createdAt: new Date(Date.now() - 4 * 3600 * 1000)
  },
  {
    _id: 'msg_002',
    listingId: 'listing_001',
    landlordId: 'landlord_001',
    tenantId: 'tenant_demo_1',
    sender: 'landlord',
    senderName: 'Sipho Ndlovu (Landlord)',
    senderPhone: '+27821234567',
    text: 'Yebo, it is available! You are welcome to view on Saturday between 11:00 and 14:00. Please bring a friend with you.',
    read: true,
    createdAt: new Date(Date.now() - 3.5 * 3600 * 1000)
  }
];

function addMessage(data) {
  const newMsg = {
    _id: 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    listingId: data.listingId,
    landlordId: data.landlordId || '',
    tenantId: data.tenantId,
    sender: data.sender || 'tenant',
    senderName: data.senderName || 'Tenant',
    senderPhone: data.senderPhone || '',
    text: data.text,
    read: data.read || false,
    createdAt: new Date(),
    ...data
  };
  fallbackMessages.push(newMsg);
  return newMsg;
}

function getMessagesByListingAndTenant(listingId, tenantId) {
  return fallbackMessages.filter(m => 
    String(m.listingId) === String(listingId) &&
    (!tenantId || String(m.tenantId) === String(tenantId))
  ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function deleteListing(id) {
  const idx = fallbackListings.findIndex(l => String(l._id) === String(id));
  if (idx !== -1) {
    const item = fallbackListings[idx];
    item.isDeleted = true;
    item.status = 'archived';
    item.publicationStatus = 'UNPUBLISHED';
    // Remove from active array so it will never be returned in queries
    fallbackListings.splice(idx, 1);
    return item;
  }
  return null;
}

function getAllMessages(limit = 100) {
  return [...fallbackMessages]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

module.exports = {
  fallbackLandlords,
  fallbackListings,
  fallbackRequests,
  fallbackAuditLogs,
  getLandlordById,
  getLandlordByPhone,
  addLandlord,
  addListing,
  deleteListing,
  reportListing,
  addRequest,
  addAuditLog,
  fallbackMessages,
  addMessage,
  getMessagesByListingAndTenant,
  getAllMessages
};

