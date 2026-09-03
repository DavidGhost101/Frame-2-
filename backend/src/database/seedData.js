const Landlord = require('../models/Landlord');
const Listing = require('../models/Listing');
const RoomRequest = require('../models/RoomRequest');
const User = require('../models/User');
const { ROLES } = require('../config/roles');
const Logger = require('../utils/logger');

async function seed() {
  try {
    // 1. Seed Super Admin & Staff User accounts
    const adminUser = await User.findOne({ email: 'admin@rentaroomsoweto.co.za' });
    if (!adminUser) {
      await User.create({
        fullName: 'Soweto Platform Super Admin',
        email: 'admin@rentaroomsoweto.co.za',
        phone: '+27820000001',
        password: 'AdminSuperPassword2026!',
        role: ROLES.SUPER_ADMIN,
        status: 'active',
        isEmailVerified: true,
        isPhoneVerified: true
      });
      Logger.info('Super Admin user seeded.');
    }

    // 2. Seed Landlords and Listings
    const listingCount = await Listing.countDocuments();
    if (listingCount === 0) {
      Logger.info('Seeding initial verified Soweto listings...');
      
      let landlord1 = await Landlord.findOne({ phone: '+27821234567' });
      if (!landlord1) {
        landlord1 = await Landlord.create({
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
          landlordId: landlord1._id,
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
          landlordId: landlord1._id,
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
          landlordId: landlord1._id,
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
      Logger.info('Initial Soweto listings seeded successfully.');
    }

    // 3. Seed Room Requests
    const reqCount = await RoomRequest.countDocuments();
    if (reqCount === 0) {
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
      Logger.info('Initial room requests seeded successfully.');
    }
  } catch (err) {
    Logger.warn('Database seed notice:', { error: err.message });
  }
}

module.exports = {
  seed
};
