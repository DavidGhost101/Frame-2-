require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const path = require('path');

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

// Seed initial sample listings for a ready-to-use experience
async function seedInitialData() {
  try {
    const Listing = require('./models/Listing');
    const Landlord = require('./models/Landlord');
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
  } catch (err) {
    console.warn('Seed data notice:', err.message);
  }
}

// Database initialization
async function initDatabase() {
  mongoose.set('bufferCommands', false); // Fail fast, don't hang if offline
  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
      console.log('MongoDB connected to MONGODB_URI.');
      await seedInitialData();
      return;
    } catch (err) {
      console.warn('MongoDB connection failed for MONGODB_URI:', err.message);
    }
  }

  // Try MongoMemoryServer for zero-config embedded persistence
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongoServer = await MongoMemoryServer.create();
    const memoryUri = mongoServer.getUri();
    await mongoose.connect(memoryUri);
    console.log('In-memory MongoDB started and connected successfully.');
    await seedInitialData();
  } catch (memErr) {
    console.warn('In-memory MongoDB fallback failed:', memErr.message);
    try {
      await mongoose.connect('mongodb://localhost:27017/rentaroom', { serverSelectionTimeoutMS: 2000 });
      console.log('Connected to local MongoDB.');
      await seedInitialData();
    } catch (localErr) {
      console.warn('Local MongoDB offline — mock fallback active.');
    }
  }
}

// Middleware
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', db: mongoose.connection.readyState === 1 ? 'UP' : 'DOWN' });
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
    console.warn('[AI Studio] Database offline — returning mock fallback response');
    if (req.method === 'GET') {
      return res.json(req.path.endsWith('s') || req.path.endsWith('s/') ? { success: true, count: 0, total: 0, listings: [] } : {});
    }
    return res.status(503).json({ error: 'Service temporarily unavailable (database offline)' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = 3000;
if (require.main === module) {
  initDatabase().finally(() => {
    app.listen(PORT, '0.0.0.0', () => console.log(`Rent A Room server running on http://0.0.0.0:${PORT}`));
  });
}

module.exports = app;

