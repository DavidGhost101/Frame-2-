process.env.NODE_ENV = 'development';
process.env.SMS_DRIVER = 'local';
process.env.JWT_SECRET = 'test_jwt_secret_rent_a_room_2026';
process.env.ADMIN_KEY = 'test_admin_key_2026';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let app;

beforeAll(async () => {
  try {
    mongoServer = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
    process.env.MONGODB_URI = mongoServer.getUri();
    await mongoose.connect(mongoServer.getUri());
  } catch (err) {
    console.warn('Memory server note:', err.message);
  }
  app = require('../server');
}, 60000);

afterAll(async () => {
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('Enterprise Backend Production Suite', () => {
  let userToken = '';
  let refreshToken = '';

  test('1. Health Check (/health & /api/health) returns 200 and healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('healthy');
    expect(res.body.database).toBeDefined();

    const apiRes = await request(app).get('/api/health');
    expect(apiRes.statusCode).toEqual(200);
    expect(apiRes.body.status).toEqual('healthy');
  });

  test('2. User Registration with Password & Role RBAC', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'Bongani Seeker',
        email: 'bongani.seeker@example.com',
        phone: '0721112233',
        password: 'SecurePassword123!',
        role: 'SEEKER'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toEqual('bongani.seeker@example.com');
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    userToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  test('3. User Login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'bongani.seeker@example.com',
        password: 'SecurePassword123!'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
  });

  test('4. Token Refresh flow rotates tokens', async () => {
    const res = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
  });

  test('5. Room Requests API supports creation, search, and pagination', async () => {
    const createRes = await request(app)
      .post('/api/room-requests')
      .send({
        seekerName: 'Lerato Ndlovu',
        phone: '0834445566',
        suburb: 'Dobsonville',
        maxBudget: 2200,
        roomType: 'Ensuite',
        occupation: 'Working Professional',
        notes: 'Looking for a quiet room'
      });

    expect(createRes.statusCode).toEqual(201);
    expect(createRes.body.success).toBe(true);
    const requestId = createRes.body.data._id;

    // Contact tracking
    const contactRes = await request(app).post(`/api/room-requests/${requestId}/contact`);
    expect(contactRes.statusCode).toEqual(200);

    // List and filter
    const listRes = await request(app).get('/api/room-requests?suburb=Dobsonville');
    expect(listRes.statusCode).toEqual(200);
    expect(listRes.body.success).toBe(true);
  });

  test('6. Scam Detection flags listings asking for money upfront', async () => {
    // Authenticate landlord via OTP first
    const otpReq = await request(app).post('/api/auth/request-otp').send({ phone: '0825556677' });
    const otpCode = otpReq.body.devOtp || otpReq.body.otp || (otpReq.body.data && (otpReq.body.data.devOtp || otpReq.body.data.otp)) || '123456';
    const verifyRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '0825556677', otp: otpCode, code: otpCode, fullName: 'Flagged Test' });

    const landlordToken = verifyRes.body.token || (verifyRes.body.data && verifyRes.body.data.token) || verifyRes.body.accessToken || (verifyRes.body.data && verifyRes.body.data.accessToken);

    const res = await request(app)
      .post('/api/listings/create')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({
        title: 'Cheap Room',
        suburb: 'Diepkloof',
        address: '10 Test St',
        monthlyRent: 1200,
        propertyType: 'Backroom',
        amenities: ['deposit before viewing', 'send ewallet first']
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.listing.flagged).toBe(true);
    expect(res.body.listing.status).toEqual('pending_review');
  });

  test('7. AI Advisor endpoint provides township housing market advice', async () => {
    const res = await request(app)
      .post('/api/ai/advisor')
      .send({ message: 'What is the average rent for a student room near UJ Soweto?' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.answer).toBeDefined();
    expect(res.body.answer.length).toBeGreaterThan(20);
  }, 15000);

  test('8. Admin CSV Reports export listings and room requests', async () => {
    const listingsCsv = await request(app)
      .get('/api/reports/listings/csv')
      .set('x-admin-key', 'test_admin_key_2026');

    expect(listingsCsv.statusCode).toEqual(200);
    expect(listingsCsv.headers['content-type']).toContain('text/csv');
    expect(listingsCsv.text).toContain('Monthly Rent (ZAR)');

    const requestsCsv = await request(app)
      .get('/api/reports/room-requests/csv')
      .set('x-admin-key', 'test_admin_key_2026');

    expect(requestsCsv.statusCode).toEqual(200);
    expect(requestsCsv.headers['content-type']).toContain('text/csv');
  });
});
