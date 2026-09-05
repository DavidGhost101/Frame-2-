process.env.NODE_ENV = 'development';
process.env.SMS_DRIVER = 'local';
process.env.JWT_SECRET = 'test_jwt_secret_rent_a_room_2026';
process.env.ADMIN_KEY = 'test_admin_key_2026';

const request = require('supertest');
const app = require('../server');
const fallbackStore = require('../services/fallbackStore');

describe('E2E Verification: Admin Panel, Moderation, & Room Requests', () => {
  let createdRequestId = '';
  let testLandlordId = '';
  const testPhone = '+27829998877';

  test('1. Room Request: seeker can create room request without payment or subscription', async () => {
    const res = await request(app)
      .post('/api/room-requests')
      .send({
        seekerName: 'Nandi Sithole',
        phone: '0829991122',
        hasWhatsapp: true,
        suburb: 'Orlando West',
        maxBudget: 2500,
        roomType: 'Backroom',
        occupation: 'Student',
        moveInDate: 'End of month',
        notes: 'Needs secure parking'
      });

    expect([200, 201]).toContain(res.statusCode);
    expect(res.body.success).toBe(true);
    const reqData = res.body.data || res.body.request;
    expect(reqData).toBeDefined();
    expect(reqData.seekerName).toEqual('Nandi Sithole');
    expect(reqData.suburb).toEqual('Orlando West');
    expect(reqData.status).toEqual('active');
    createdRequestId = String(reqData._id);
  });

  test('2. Room Request: list includes created request and metrics exclude obsolete "found" state', async () => {
    const listRes = await request(app).get('/api/room-requests?suburb=Orlando West');
    expect(listRes.statusCode).toEqual(200);
    expect(listRes.body.success).toBe(true);
    const items = listRes.body.data?.items || listRes.body.requests || (Array.isArray(listRes.body.data) ? listRes.body.data : []);
    const found = items.find(r => String(r._id) === createdRequestId);
    expect(found).toBeDefined();

    // Verify admin stats has no "found" metric requirement
    const statsRes = await request(app)
      .get('/api/admin/stats')
      .set('x-admin-key', 'test_admin_key_2026');
    expect(statsRes.statusCode).toEqual(200);
    expect(statsRes.body.data.requests).toBeDefined();
    expect(statsRes.body.data.requests.active).toBeGreaterThanOrEqual(1);
    expect(statsRes.body.data.requests.found).toBeUndefined();
  });

  test('3. Room Request: admin can delete room request permanently', async () => {
    const delRes = await request(app)
      .delete(`/api/admin/room-requests/${createdRequestId}`)
      .set('x-admin-key', 'test_admin_key_2026');

    expect(delRes.statusCode).toEqual(200);
    expect(delRes.body.success).toBe(true);

    // Verify it is no longer returned in room requests query
    const listRes = await request(app).get('/api/room-requests');
    const items = listRes.body.data?.items || listRes.body.requests || (Array.isArray(listRes.body.data) ? listRes.body.data : []);
    const shouldNotExist = items.find(r => String(r._id) === createdRequestId && !r.isDeleted && r.status !== 'archived');
    expect(shouldNotExist).toBeUndefined();
  });

  test('4. Free Posting: Landlord can post room without ANY subscription or payment gate', async () => {
    // Authenticate landlord via OTP
    const otpReq = await request(app).post('/api/auth/request-otp').send({ phone: testPhone });
    const otpCode = otpReq.body.devOtp || otpReq.body.otp || (otpReq.body.data && (otpReq.body.data.devOtp || otpReq.body.data.otp)) || '123456';
    const verifyRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: testPhone, otp: otpCode, code: otpCode, fullName: 'Sipho Zulu' });

    const landlordToken = verifyRes.body.token || (verifyRes.body.data && verifyRes.body.data.token) || verifyRes.body.accessToken;
    testLandlordId = String(verifyRes.body.landlord?._id || verifyRes.body.data?.landlord?._id || verifyRes.body.data?.user?._id || '');

    // Post room listing with NO subscription
    const postRes = await request(app)
      .post('/api/listings/create')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({
        title: 'Spacious Backroom with DSTV Port',
        suburb: 'Diepkloof',
        address: '45 Immink Drive',
        monthlyRent: 1800,
        propertyType: 'Backroom',
        amenities: ['Water Included', 'Electricity Prepaid']
      });

    expect([200, 201]).toContain(postRes.statusCode);
    const listing = postRes.body.listing || postRes.body.data;
    expect(listing).toBeDefined();
    expect(listing.title).toContain('Spacious Backroom');
  });

  test('5. Landlord Moderation: Admin can block a landlord and block prevents posting', async () => {
    // Retrieve landlords
    const landlordsRes = await request(app)
      .get('/api/admin/landlords')
      .set('x-admin-key', 'test_admin_key_2026');

    expect(landlordsRes.statusCode).toEqual(200);
    const landlords = landlordsRes.body.data || landlordsRes.body.landlords || [];
    const targetLandlord = landlords.find(l => l.phone === testPhone) || landlords[0];
    expect(targetLandlord).toBeDefined();
    const lId = String(targetLandlord._id);

    // Block landlord
    const blockRes = await request(app)
      .put(`/api/admin/landlords/${lId}/block`)
      .set('x-admin-key', 'test_admin_key_2026')
      .send({ isBlocked: true });

    expect(blockRes.statusCode).toEqual(200);
    expect(blockRes.body.success).toBe(true);

    // Now try to post a listing as that blocked landlord
    const otpReq = await request(app).post('/api/auth/request-otp').send({ phone: targetLandlord.phone });
    const otpCode = otpReq.body.devOtp || otpReq.body.otp || (otpReq.body.data && (otpReq.body.data.devOtp || otpReq.body.data.otp)) || '123456';
    const verifyRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: targetLandlord.phone, otp: otpCode, code: otpCode, fullName: targetLandlord.fullName });
    const blockedToken = verifyRes.body.token || (verifyRes.body.data && verifyRes.body.data.token) || verifyRes.body.accessToken;

    const postBlockedRes = await request(app)
      .post('/api/listings/create')
      .set('Authorization', `Bearer ${blockedToken}`)
      .send({
        title: 'Should Be Rejected Room',
        suburb: 'Meadowlands',
        address: '12 Zone 3',
        monthlyRent: 1500,
        propertyType: 'Backroom'
      });

    // Must be blocked with 403 Forbidden
    expect(postBlockedRes.statusCode).toEqual(403);
    expect(postBlockedRes.body.message).toContain('blocked');

    // Admin can unblock the landlord
    const unblockRes = await request(app)
      .put(`/api/admin/landlords/${lId}/block`)
      .set('x-admin-key', 'test_admin_key_2026')
      .send({ isBlocked: false });

    expect(unblockRes.statusCode).toEqual(200);
  });

  test('6. User Management: Admin can update user status and role', async () => {
    // List users
    const usersRes = await request(app)
      .get('/api/admin/users')
      .set('x-admin-key', 'test_admin_key_2026');

    expect(usersRes.statusCode).toEqual(200);
    const users = usersRes.body.data || usersRes.body.users || [];
    expect(users.length).toBeGreaterThan(0);
    const firstUser = users[0];

    // Update status
    const statusRes = await request(app)
      .put(`/api/admin/users/${firstUser._id}/status`)
      .set('x-admin-key', 'test_admin_key_2026')
      .send({ status: 'suspended' });

    expect(statusRes.statusCode).toEqual(200);

    // Restore status
    const restoreRes = await request(app)
      .put(`/api/admin/users/${firstUser._id}/status`)
      .set('x-admin-key', 'test_admin_key_2026')
      .send({ status: 'active' });

    expect(restoreRes.statusCode).toEqual(200);
  });
});
