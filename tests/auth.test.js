process.env.NODE_ENV = 'development';
process.env.SMS_DRIVER = 'local';
process.env.JWT_SECRET = 'test_secret_key_for_jest_runs_only';

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
  app = require('../server'); // require after env vars are set
}, 60000);

afterAll(async () => {
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('OTP Authentication & Listing Creation Flow', () => {
  const testPhone = '0821234567';
  let devOtp = '';
  let agent;

  beforeAll(() => {
    agent = request.agent(app); // keeps the auth_token cookie between requests
  });

  test('1. Should request OTP successfully', async () => {
    const res = await agent
      .post('/api/auth/request-otp')
      .send({ phone: testPhone, fullName: 'Test Landlord' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.devOtp).toBeDefined();
    devOtp = res.body.devOtp;
  });

  test('2. Should reject invalid OTP', async () => {
    const res = await agent
      .post('/api/auth/verify-otp')
      .send({ phone: testPhone, code: '000000' });

    expect(res.statusCode).toEqual(401);
    expect(res.body.error).toContain('Incorrect');
  });

  test('3. Should verify valid OTP and set HTTP cookie', async () => {
    const res = await agent
      .post('/api/auth/verify-otp')
      .send({ phone: testPhone, code: devOtp });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  test('4. Should reject invalid listing creation parameters', async () => {
    const res = await request(app)
      .post('/api/listings/create')
      .send({ title: 'x', suburb: 'x', address: 'x', monthlyRent: 100 });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toEqual('Validation error');
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  test('5. Should create a listing once authenticated', async () => {
    const res = await agent
      .post('/api/listings/create')
      .send({
        title: 'Neat backroom',
        suburb: 'Dobsonville',
        address: '12 Vilakazi St',
        monthlyRent: 2200,
        propertyType: 'Backroom',
        amenities: ['Free WiFi', 'Prepaid Power']
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.listing.status).toBe('pending_review');
  });

  test('6. Pending listings should not appear in public browse', async () => {
    const res = await request(app).get('/api/listings');
    expect(res.statusCode).toEqual(200);
    expect(res.body.listings.find(l => l.title === 'Neat backroom')).toBeUndefined();
  });

  test('7. Admin can approve a listing and it becomes publicly visible', async () => {
    process.env.ADMIN_KEY = 'test_admin_key';
    const pending = await agent.get('/api/listings/mine');
    const listingId = pending.body.listings[0]._id;

    const approve = await request(app)
      .patch(`/api/admin/listings/${listingId}`)
      .set('x-admin-key', 'test_admin_key')
      .send({ status: 'active' });

    expect(approve.statusCode).toEqual(200);
    expect(approve.body.listing.status).toBe('active');

    const publicRes = await request(app).get('/api/listings');
    expect(publicRes.body.listings.find(l => l.title === 'Neat backroom')).toBeDefined();
  });

  test('8. Rejects invalid SA phone numbers', async () => {
    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ phone: '12345', fullName: 'Bad Number' });

    expect(res.statusCode).toEqual(400);
  });

  test('9. Rejects showing phone publicly without consent', async () => {
    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ phone: '0839876543', fullName: 'No Consent', showPhonePublicly: true });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toContain('Consent');
  });

  test('10. Admin can bulk import listings, which go live immediately', async () => {
    const res = await request(app)
      .post('/api/admin/listings/import')
      .set('x-admin-key', 'test_admin_key')
      .send({
        listings: [{
          title: 'Imported Room', suburb: 'Naledi', address: '5 Test Rd',
          monthlyRent: 1800, landlordFullName: 'Imported Landlord', landlordPhone: '+27831110000'
        }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.results[0].success).toBe(true);

    const publicRes = await request(app).get('/api/listings');
    expect(publicRes.body.listings.find(l => l.title === 'Imported Room')).toBeDefined();
  });

  test('11. Anyone can report a listing, which flags it for admin review', async () => {
    const listRes = await request(app).get('/api/listings');
    const target = listRes.body.listings.find(l => l.title === 'Imported Room');

    const reportRes = await request(app).post(`/api/listings/${target._id}/report`);
    expect(reportRes.statusCode).toEqual(200);

    const flaggedRes = await request(app)
      .get('/api/admin/listings?flagged=true')
      .set('x-admin-key', 'test_admin_key');
    expect(flaggedRes.body.listings.find(l => l.title === 'Imported Room')).toBeDefined();
  });
});
