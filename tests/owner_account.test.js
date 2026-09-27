process.env.NODE_ENV = 'test';
process.env.SMS_DRIVER = 'local';
process.env.JWT_SECRET = 'test_jwt_secret_rent_a_room_2026';
process.env.ADMIN_KEY = 'test_admin_key_2026';
process.env.SMTP_PASS = 'smtp_mail_password_2026';
process.env.SUPER_ADMIN_EMAIL = '12rakosadavid@gmail.com';

// Stand-in for Firebase: each fake ID token maps to the claims Firebase
// would return after verifying it. No real credentials are involved.
const fakeTokens = {
  'owner-token': { uid: 'owner-uid-1', email: '12rakosadavid@gmail.com', role: 'SUPER_ADMIN_OWNER' },
  'no-claim-token': { uid: 'owner-uid-1', email: '12rakosadavid@gmail.com' },
  'wrong-email-token': { uid: 'someone-else', email: 'attacker@example.com', role: 'SUPER_ADMIN_OWNER' }
};
const mockRevoke = jest.fn(async () => {});
jest.mock('../backend/src/services/FirebaseAdminService', () => ({
  isAvailable: () => true,
  verifyIdToken: jest.fn(async token => {
    if (!fakeTokens[token]) throw new Error('auth/argument-error');
    return fakeTokens[token];
  }),
  revokeRefreshTokens: (...args) => mockRevoke(...args)
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const fallbackStore = require('../services/fallbackStore');

const auditActions = () => fallbackStore.fallbackAuditLogs.map(l => l.action);
const PROTECTED = 'Protected Super Admin Owner account.';

let adminToken;
let ownerToken;
let ownerId;

beforeAll(async () => {
  const res = await request(app).post('/api/admin/login').send({ username: 'admin', password: 'test_admin_key_2026' });
  adminToken = res.body.data.accessToken;
});

describe('Owner sign-in', () => {
  test('a verified owner token with the owner claim gets a SUPER_ADMIN_OWNER session', async () => {
    const res = await request(app).post('/api/admin/owner/session').send({ idToken: 'owner-token' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.role).toBe('SUPER_ADMIN_OWNER');
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain('password');
    ownerToken = res.body.data.accessToken;

    const owner = fallbackStore.fallbackUsers.find(u => u.firebaseUid === 'owner-uid-1');
    ownerId = owner._id;
    expect(owner.role).toBe('SUPER_ADMIN_OWNER');
    expect(owner.password).toBeUndefined();
    expect(owner.passwordHash).toBeUndefined();
    expect(auditActions()).toEqual(expect.arrayContaining(['OWNER_ROLE_VERIFIED', 'OWNER_LOGIN']));
  });

  test('the owner session is accepted as an admin session', async () => {
    const res = await request(app).get('/api/admin/verify').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.role).toBe('SUPER_ADMIN_OWNER');
  });

  test('the owner email without the custom claim is refused', async () => {
    const res = await request(app).post('/api/admin/owner/session').send({ idToken: 'no-claim-token' });
    expect(res.statusCode).toBe(403);
    expect(auditActions()).toContain('OWNER_ROLE_VERIFICATION_FAILED');
  });

  test('the owner claim on a different email is refused', async () => {
    const res = await request(app).post('/api/admin/owner/session').send({ idToken: 'wrong-email-token' });
    expect(res.statusCode).toBe(403);
  });

  test('an invalid token is refused and audited', async () => {
    const res = await request(app).post('/api/admin/owner/session').send({ idToken: 'forged' });
    expect(res.statusCode).toBe(401);
    expect(auditActions()).toContain('OWNER_AUTH_FAILURE');
  });

  test('a self-made JWT claiming the owner role is not accepted', async () => {
    const forged = jwt.sign({ role: 'SUPER_ADMIN_OWNER', email: '12rakosadavid@gmail.com', admin: true }, process.env.JWT_SECRET);
    const res = await request(app).get('/api/admin/verify').set('Authorization', `Bearer ${forged}`);
    expect(res.statusCode).toBe(403);
    const ownerOnly = await request(app).get('/api/admin/owner/session').set('Authorization', `Bearer ${forged}`);
    expect(ownerOnly.statusCode).toBe(401);
  });

  test('the admin key login never yields the owner role', async () => {
    const res = await request(app).get('/api/admin/verify').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.user.role).not.toBe('SUPER_ADMIN_OWNER');
  });

  test('the SMTP mail password is no longer accepted as an admin login', async () => {
    const res = await request(app).post('/api/admin/login').send({ username: 'admin', password: 'smtp_mail_password_2026' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Owner account protection', () => {
  const attempts = [
    ['demote via PATCH', () => ({ method: 'patch', url: `/api/admin/users/${ownerId}`, body: { role: 'ADMIN' } })],
    ['change role', () => ({ method: 'put', url: `/api/admin/users/${ownerId}/role`, body: { role: 'USER' } })],
    ['suspend', () => ({ method: 'put', url: `/api/admin/users/${ownerId}/status`, body: { status: 'suspended' } })],
    ['deactivate', () => ({ method: 'put', url: `/api/admin/users/${ownerId}`, body: { status: 'inactive' } })],
    ['block', () => ({ method: 'post', url: `/api/admin/users/${ownerId}/block`, body: { isBlocked: true } })],
    ['delete', () => ({ method: 'delete', url: `/api/admin/users/${ownerId}`, body: {} })]
  ];

  test.each(attempts)('a super admin cannot %s the owner', async (_label, build) => {
    const before = fallbackStore.fallbackAuditLogs.filter(l => l.action === 'OWNER_PROTECTION_BLOCKED').length;
    const { method, url, body } = build();
    const res = await request(app)[method](url).set('Authorization', `Bearer ${adminToken}`).send(body);
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe(PROTECTED);
    const after = fallbackStore.fallbackAuditLogs.filter(l => l.action === 'OWNER_PROTECTION_BLOCKED').length;
    expect(after).toBe(before + 1);
  });

  test('the owner record is unchanged after all attempts', () => {
    const owner = fallbackStore.fallbackUsers.find(u => u._id === ownerId);
    expect(owner.role).toBe('SUPER_ADMIN_OWNER');
    expect(owner.status).toBe('active');
    expect(owner.isBlocked).toBe(false);
  });

  test('the owner role cannot be granted to anyone through the app', async () => {
    const res = await request(app).put('/api/admin/users/user_005/role')
      .set('Authorization', `Bearer ${adminToken}`).send({ role: 'SUPER_ADMIN_OWNER' });
    expect(res.statusCode).toBe(403);
    expect(fallbackStore.fallbackUsers.find(u => u._id === 'user_005').role).not.toBe('SUPER_ADMIN_OWNER');
  });

  test('the owner cannot accidentally demote themself from the admin UI', async () => {
    const res = await request(app).put(`/api/admin/users/${ownerId}/role`)
      .set('Authorization', `Bearer ${ownerToken}`).send({ role: 'ADMIN' });
    expect(res.statusCode).toBe(403);
  });

  test('ordinary users are still manageable', async () => {
    const res = await request(app).put('/api/admin/users/user_005/status')
      .set('Authorization', `Bearer ${adminToken}`).send({ status: 'active' });
    expect(res.statusCode).toBe(200);
  });
});

describe('Owner recovery and sessions', () => {
  test('password reset goes only to the configured owner address and is audited', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
    const res = await request(app).post('/api/admin/owner/password-reset').send({ email: 'attacker@example.com' });
    expect(res.statusCode).toBe(200);
    const sent = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(sent).toEqual({ requestType: 'PASSWORD_RESET', email: '12rakosadavid@gmail.com' });
    expect(auditActions()).toContain('OWNER_PASSWORD_RESET_REQUESTED');
    fetchSpy.mockRestore();
  });

  test('revoking sessions signs out Firebase and invalidates existing owner sessions', async () => {
    const res = await request(app).post('/api/admin/owner/revoke-sessions').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.statusCode).toBe(200);
    expect(mockRevoke).toHaveBeenCalledWith('owner-uid-1');
    expect(auditActions()).toContain('OWNER_SESSIONS_REVOKED');
    const after = await request(app).get('/api/admin/verify').set('Authorization', `Bearer ${ownerToken}`);
    expect(after.statusCode).toBe(403);
  });

  test('the owner can sign in again after revoking, and log out', async () => {
    await new Promise(r => setTimeout(r, 1100));
    const login = await request(app).post('/api/admin/owner/session').send({ idToken: 'owner-token' });
    expect(login.statusCode).toBe(200);
    const token = login.body.data.accessToken;
    const out = await request(app).post('/api/admin/owner/logout').set('Authorization', `Bearer ${token}`);
    expect(out.statusCode).toBe(200);
    expect(auditActions()).toContain('OWNER_LOGOUT');
    const reuse = await request(app).get('/api/admin/owner/session').set('Authorization', `Bearer ${token}`);
    expect(reuse.statusCode).toBe(401);
  });

  test('no audit entry contains a password or secret value', () => {
    const logs = JSON.stringify(fallbackStore.fallbackAuditLogs);
    // Field names like "password" appear only with a redacted value.
    for (const secret of ['test_admin_key_2026', 'smtp_mail_password_2026']) {
      expect(logs).not.toContain(secret);
    }
    const values = [...logs.matchAll(/"password"\s*:\s*"([^"]*)"/gi)].map(m => m[1]);
    values.forEach(v => expect(v).toMatch(/REDACTED/i));
  });
});
