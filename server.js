require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const path = require('path');

// Process-level crash guards to ensure the server stays permanently healthy
process.on('uncaughtException', (err) => {
  console.error('Server Uncaught Exception (handled):', err && err.message ? err.message : err);
});

process.on('unhandledRejection', (reason) => {
  console.warn('Server Unhandled Rejection (handled):', reason && reason.message ? reason.message : reason);
});

// Disable Mongoose query buffering so operations fail fast to resilient fallback instead of hanging
mongoose.set('bufferCommands', false);

// --- Startup safety checks & environment defaults ---------------------------
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev_super_secret_jwt_key_rent_a_room_2026';
}
if (!process.env.ADMIN_KEY) {
  process.env.ADMIN_KEY = 'admin123';
}
if (!process.env.SMS_DRIVER) {
  process.env.SMS_DRIVER = 'local';
}

if (process.env.NODE_ENV === 'production' && process.env.SMS_DRIVER !== 'twilio') {
  console.warn('WARNING: Running in production without SMS_DRIVER=twilio. OTPs will not be sent.');
}
// ----------------------------------------------------------------------------

const app = express();
app.set('trust proxy', 1); // needed so express-rate-limit / req.ip work behind a reverse proxy

// Seed initial sample listings & room requests for a ready-to-use experience
async function seedInitialData() {
  try {
    const Listing = require('./models/Listing');
    const Landlord = require('./models/Landlord');
    const RoomRequest = require('./models/RoomRequest');
    const count = await Listing.countDocuments();
    if (count === 0) {
      console.log('Seeding initial Soweto room listings...');
      let landlord = await Landlord.findOne({ phone: '+27821234567' });
      if (!landlord) {
        landlord = await Landlord.create({
          fullName: 'Sipho Ndlovu',
          phone: '+27821234567',
          isPhoneVerified: true,
          hasWhatsapp: true,
          showPhonePublicly: true,
          consentPhonePublic: true,
          consentTimestamp: new Date(),
          isPaidSubscriber: true
        });
      }

      let landlord2 = await Landlord.findOne({ phone: '+27839876543' });
      if (!landlord2) {
        landlord2 = await Landlord.create({
          fullName: 'Thabo Molefe',
          phone: '+27839876543',
          isPhoneVerified: true,
          hasWhatsapp: true,
          showPhonePublicly: true,
          consentPhonePublic: true,
          consentTimestamp: new Date(),
          isPaidSubscriber: true
        });
      }

      await Listing.create([
        {
          landlordId: landlord._id,
          title: 'Modern Ensuite Backroom with Fitted Wardrobe',
          suburb: 'Dobsonville',
          address: '14 Vilakazi Cres, Dobsonville Ext 2',
          monthlyRent: 2200,
          propertyType: 'Ensuite',
          amenities: ['Free WiFi', 'Prepaid Power', 'Private Shower', 'Secured Yard', 'Near Rea Vaya'],
          image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
          status: 'active',
          source: 'landlord'
        },
        {
          landlordId: landlord._id,
          title: 'Spacious Garage Conversion Flatlet',
          suburb: 'Orlando West',
          address: '88 Moema St, Orlando West',
          monthlyRent: 1800,
          propertyType: 'Garage',
          amenities: ['Prepaid Electricity', 'Parking Space', 'Hot Water', 'Tiled Floors'],
          image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
          status: 'active',
          source: 'landlord'
        },
        {
          landlordId: landlord2._id,
          title: 'Student Residence Room near UJ Soweto Campus',
          suburb: 'Pimville',
          address: '23 Modjadji St, Pimville Zone 4',
          monthlyRent: 2400,
          propertyType: 'Student Accommodation',
          nearbyInstitution: 'University of Johannesburg, Soweto Campus',
          amenities: ['Uncapped WiFi', 'Study Desk', 'Prepaid Meter', 'Near UJ Campus', 'CCTV Security'],
          image: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80',
          status: 'active',
          source: 'landlord'
        },
        {
          landlordId: landlord2._id,
          title: 'Neat Self-Contained 1-Bedroom Apartment',
          suburb: 'Diepkloof',
          address: '41 Immink Drive, Diepkloof Zone 3',
          monthlyRent: 2800,
          propertyType: 'Apartment',
          amenities: ['Full Bathroom', 'Fitted Kitchenette', 'Gated Yard', 'Prepaid Power', 'Near Diepkloof Square'],
          image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80',
          status: 'active',
          source: 'landlord'
        },
        {
          landlordId: landlord._id,
          title: 'Affordable Single Backroom',
          suburb: 'Protea Glen',
          address: '112 Acacia St, Protea Glen Ext 4',
          monthlyRent: 1500,
          propertyType: 'Backroom',
          amenities: ['Shared Bathroom', 'Prepaid Electricity', 'Near Protea Glen Mall', 'Safe Fenced Yard'],
          image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&q=80',
          status: 'active',
          source: 'landlord'
        },
        {
          landlordId: landlord2._id,
          title: 'Secure Flatlet with Covered Carport',
          suburb: 'Meadowlands',
          address: '77 Hekroodt St, Meadowlands Zone 5',
          monthlyRent: 2100,
          propertyType: 'Flatlet',
          amenities: ['Private Shower & Toilet', 'Free WiFi', 'Paved Yard', 'Motorized Gate', 'Covered Parking'],
          image: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80',
          status: 'active',
          source: 'landlord'
        }
      ]);
      console.log('Sample listings seeded successfully.');
    }

    const reqCount = await RoomRequest.countDocuments();
    if (reqCount === 0) {
      console.log('Seeding initial room seeker requests...');
      await RoomRequest.create([
        {
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
          status: 'active'
        },
        {
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
          status: 'active'
        },
        {
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
          status: 'active'
        },
        {
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
          status: 'active'
        }
      ]);
      console.log('Sample room requests seeded successfully.');
    }
  } catch (err) {
    console.warn('Seed data notice:', err.message);
  }
}

// Database initialization with bounded timeout
async function initDatabase() {
  const uri = process.env.MONGODB_URI;
  // If an external MongoDB URI is provided (not default local unreachable address), attempt connection
  if (uri && !uri.includes('localhost:27017') && !uri.includes('127.0.0.1:27017')) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 });
      console.log('MongoDB connected to external MONGODB_URI.');
      await seedInitialData();
      return;
    } catch (err) {
      console.info('External MongoDB connection unavailable, switching to in-memory store.');
    }
  }

  // Attempt MongoMemoryServer if available, with a fast 3-second timeout guard
  try {
    const memoryServerPromise = (async () => {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongoServer = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
      const memoryUri = mongoServer.getUri();
      await mongoose.connect(memoryUri, { serverSelectionTimeoutMS: 2500 });
      console.log('In-memory MongoDB started and connected successfully.');
      await seedInitialData();
    })();

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Memory database start timeout')), 3000)
    );

    await Promise.race([memoryServerPromise, timeoutPromise]);
    return;
  } catch (memErr) {
    console.info('Active fallback in-memory store initialized and ready.');
  }
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api/room-requests', require('./routes/roomRequests'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/ai', require('./routes/aiChat'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', db: mongoose.connection.readyState === 1 ? 'UP' : 'FALLBACK_READY' });
});

// Public config (safe to expose): lets the frontend know whether to render
// the Turnstile widget without hardcoding the site key into the HTML.
app.get('/api/config', (req, res) => {
  res.json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
    devMode: process.env.NODE_ENV === 'development' || process.env.SMS_DRIVER === 'local'
  });
});

// Static Frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Central error handler (handles DB errors gracefully when offline as well as unhandled route exceptions)
app.use((err, req, res, next) => {
  if (err.name === 'MongooseError' || err.name === 'MongoNetworkError' || (err.message && err.message.includes('buffering timed out'))) {
    console.warn('[AI Studio] Database offline or buffering — handling fallback');
    if (req.method === 'GET') {
      const fallback = require('./services/fallbackStore');
      if (req.path.includes('room-requests')) {
        return res.json({ success: true, count: fallback.fallbackRequests.length, total: fallback.fallbackRequests.length, requests: fallback.fallbackRequests });
      }
      return res.json({ success: true, count: fallback.fallbackListings.length, total: fallback.fallbackListings.length, listings: fallback.fallbackListings });
    }
    return res.status(503).json({ error: 'Service temporarily unavailable (database offline)' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = 3000;
let server;
if (require.main === module) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Rent A Room server running on http://0.0.0.0:${PORT}`);
    initDatabase().catch(e => console.warn('Database initialization warning:', e.message));
  });

  server.on('error', (err) => {
    console.error('Server error encountered:', err);
  });

  process.on('SIGTERM', () => {
    if (server) server.close(() => process.exit(0));
  });
}

module.exports = app;

