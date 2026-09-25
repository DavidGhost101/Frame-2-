const request = require('supertest');
const app = require('../backend/src/app');
const auditLogRepository = require('../backend/src/repositories/AuditLogRepository');
const appEvents = require('../backend/src/events/eventEmitter');
const TokenUtil = require('../backend/src/utils/tokenUtil');

describe('Production Audit Logging & Global API Error Handling Verification', () => {
  let adminToken;
  let landlordToken;

  beforeAll(() => {
    adminToken = TokenUtil.generateAccessToken({
      userId: 'admin_audit_tester',
      role: 'ADMIN',
      admin: true,
      permissions: ['all']
    });

    landlordToken = TokenUtil.generateAccessToken({
      userId: 'landlord_standard',
      role: 'LANDLORD'
    });
  });

  describe('1. Standardized Error Response Formats & Request Tracing', () => {
    it('returns consistent JSON payload with requestId and error details on validation failure', async () => {
      const res = await request(app)
        .post('/api/listings/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(typeof res.body.message).toBe('string');
      expect(res.body.requestId).toBeDefined();
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.body.errorDetails).toBeDefined();
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it('returns 401 with AUTHENTICATION_REQUIRED code when unauthenticated', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('AUTHENTICATION_REQUIRED');
      expect(res.body.requestId).toBeDefined();
    });

    it('returns 403 with AUTHORIZATION_REQUIRED or forbidden message when non-admin accesses admin routes', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${landlordToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('AUTHORIZATION_REQUIRED');
    });
  });

  describe('2. Audit Logging System Integrity', () => {
    it('creates structured audit log with category, action, and sanitizes sensitive fields', async () => {
      const logged = await auditLogRepository.logAction({
        action: 'TEST_ACTION_EXECUTION',
        category: 'SECURITY',
        entityType: 'SystemTest',
        entityId: 'test_123',
        userId: 'admin_test_user',
        actorEmail: 'admin@rentaroom.co.za',
        status: 'SUCCESS',
        ipAddress: '127.0.0.1',
        requestId: 'req_test_abc123',
        details: {
          adminName: 'Lead DevSecOps',
          password: 'super-secret-password-should-be-stripped',
          token: 'sensitive-token-12345',
          safeProperty: 'Visible'
        }
      });

      expect(logged).toBeDefined();
      expect(logged.category).toBe('SECURITY');
      expect(logged.action).toBe('TEST_ACTION_EXECUTION');
      expect(logged.requestId).toBe('req_test_abc123');
      expect(logged.details.safeProperty).toBe('Visible');
      expect(logged.details.password).toBe('[REDACTED]');
      expect(logged.details.token).toBe('[REDACTED]');
    });

    it('emits real-time event via appEvents for Server-Sent Events integration', (done) => {
      const listener = (eventPayload) => {
        expect(eventPayload).toBeDefined();
        expect(eventPayload.action).toBe('SSE_VERIFICATION_EVENT');
        expect(eventPayload.category).toBe('ROOM');
        appEvents.removeListener('audit:created', listener);
        done();
      };

      appEvents.on('audit:created', listener);

      auditLogRepository.logAction({
        action: 'SSE_VERIFICATION_EVENT',
        category: 'ROOM',
        entityType: 'Listing',
        entityId: 'listing_sse_456',
        actorEmail: 'landlord@rentaroom.co.za',
        status: 'SUCCESS'
      });
    });

    it('retrieves audit trail through admin API with category and pagination filters', async () => {
      // First ensure an AI event is logged
      await auditLogRepository.logAction({
        action: 'AI_ADVISOR_INQUIRY',
        category: 'AI',
        entityType: 'AiSession',
        entityId: 'ai_session_789',
        actorEmail: 'seeker@soweto.org',
        status: 'SUCCESS',
        details: { query: 'Rental prices in Orlando West' }
      });

      const res = await request(app)
        .get('/api/admin/audit-logs?category=AI&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.logs || res.body.data)).toBe(true);

      const logs = res.body.data.logs || res.body.data;
      const foundAi = logs.find(l => l.category === 'AI' || l.action === 'AI_ADVISOR_INQUIRY');
      expect(foundAi).toBeDefined();
    });
  });

  describe('3. Idempotency & Duplicate Protection', () => {
    it('returns cached response on repeated requests with same Idempotency-Key', async () => {
      const idempotencyKey = `idemp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      
      const payload = {
        title: 'Safe Garden Room',
        suburb: 'Meadowlands',
        address: 'Zone 4, Meadowlands',
        monthlyRent: 1500,
        propertyType: 'Room',
        amenities: ['Water Included', 'Electricity Prepaid'],
        nearbyInstitution: 'UJ Soweto',
        phone: '0821112233',
        fullName: 'Bongani Khumalo',
        hasWhatsapp: true,
        showPhonePublicly: true,
        consentPhonePublic: true
      };

      const res1 = await request(app)
        .post('/api/listings/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res1.statusCode).toBe(201);
      const originalListingId = res1.body.data?.id || res1.body.listing?.id;

      // Repeat request with exact same Idempotency-Key
      const res2 = await request(app)
        .post('/api/listings/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res2.statusCode).toBe(201);
      const duplicateListingId = res2.body.data?.id || res2.body.listing?.id;
      expect(duplicateListingId).toBe(originalListingId);
    }, 15000);
  });
});
