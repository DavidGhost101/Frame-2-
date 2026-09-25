// Rent A Room Soweto — in-browser demo backend.
//
// Answers every fetch('/api/...') made by public/index.html and
// public/admin.html from browser storage, returning the same response shapes
// as the Express backend in backend/src. This lets the site run as plain HTML
// on any static host (or a hosted preview) with no Node server, no MongoDB and
// no connection to the live Firestore database. It is NOT the real backend:
// no SMS is sent and data lives only in the viewer's browser.
//
// Built into demo/dist by scripts/build-demo.js, which replaces the seed
// placeholder below with the sample records from services/fallbackStore.
(function () {
  'use strict';

  const STORE_KEY = 'rentaroom_soweto_demo_v1';
  const ADMIN_USERNAME = 'admin';
  const ADMIN_PASSWORD = 'demo';
  const DAY = 24 * 60 * 60 * 1000;
  const SEED = /*__SEED__*/ { listings: [], landlords: [], requests: [], messages: [] };
  const SCAM_KEYWORDS = [
    'wire transfer', 'western union', 'moneygram', 'pay before viewing', 'deposit before viewing',
    'no viewing necessary', 'out of the country', 'send money to hold', 'agent overseas',
    'crypto', 'bitcoin', 'gift card'
  ];

  // ---- storage --------------------------------------------------------------
  let db = null;
  function freshDb() {
    const copy = JSON.parse(JSON.stringify(SEED));
    return {
      listings: copy.listings || [],
      landlords: copy.landlords || [],
      requests: copy.requests || [],
      messages: copy.messages || [],
      auditLogs: [],
      admin: false,
      otps: {}
    };
  }
  function load() {
    if (db) return db;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) db = JSON.parse(raw);
    } catch (e) { /* storage blocked: keep in memory */ }
    if (!db) db = freshDb();
    return db;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) { /* quota or blocked */ }
  }

  function uid(prefix) { return prefix + '_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8); }
  function now() { return new Date().toISOString(); }

  // ---- helpers mirroring the backend ---------------------------------------
  function normalizePhone(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith('0')) d = '27' + d.slice(1);
    if (!d.startsWith('27')) d = '27' + d;
    return '+' + d;
  }
  function isValidSAMobile(p) { return /^\+27[6-8]\d{8}$/.test(p); }
  function displayPhone(p) {
    const local = '0' + p.slice(3);
    return local.slice(0, 3) + ' ' + local.slice(3, 6) + ' ' + local.slice(6);
  }

  const PUB_STATUS = { active: 'PUBLISHED', pending_review: 'PENDING', suspended: 'SUSPENDED', rejected: 'REJECTED' };

  function landlordFor(l) {
    const lid = typeof l.landlordId === 'object' && l.landlordId ? l.landlordId._id : l.landlordId;
    return db.landlords.find(x => x._id === lid) || null;
  }

  function landlordView(ll, admin) {
    if (!ll) return null;
    const v = {
      id: ll._id, _id: ll._id, fullName: ll.fullName, isPhoneVerified: !!ll.isPhoneVerified,
      hasWhatsapp: ll.hasWhatsapp !== false, showPhonePublicly: !!ll.showPhonePublicly,
      isPaidSubscriber: !!ll.isPaidSubscriber, createdAt: ll.createdAt
    };
    if (admin) Object.assign(v, { phone: ll.phone, isBlocked: !!ll.isBlocked, notes: ll.notes || '', trialEndsAt: ll.trialEndsAt });
    return v;
  }

  // Public listings only carry the landlord's number when they opted in.
  function listingView(l, admin) {
    const ll = landlordFor(l);
    const v = {
      id: l._id, _id: l._id, title: l.title, description: l.description || '', suburb: l.suburb,
      address: l.address, monthlyRent: l.monthlyRent, price: l.monthlyRent,
      propertyType: l.propertyType, nearbyInstitution: l.nearbyInstitution || '',
      amenities: l.amenities || [], image: l.image || '', photos: l.image ? [l.image] : [],
      status: l.status, publicationStatus: PUB_STATUS[l.status] || 'PENDING',
      availability: 'available', available: true, occupied: false, isOccupied: false,
      hasWhatsapp: ll ? ll.hasWhatsapp !== false : true,
      contactCount: l.contactCount || 0, viewsCount: l.viewsCount || 0, viewCount: l.viewsCount || 0,
      createdAt: l.createdAt, updatedAt: l.updatedAt || l.createdAt,
      landlordId: landlordView(ll, admin),
      landlordFullName: ll ? ll.fullName : 'Landlord',
      source: l.source || 'landlord'
    };
    if (ll && (admin || ll.showPhonePublicly)) v.phone = ll.phone;
    if (admin) Object.assign(v, { flagged: !!l.flagged, flagReasons: l.flagReasons || [], reportCount: l.reportCount || 0 });
    return v;
  }

  function scamCheck(l) {
    const reasons = [];
    const blob = [l.title, l.address, l.description, ...(l.amenities || [])].join(' ').toLowerCase();
    const hit = SCAM_KEYWORDS.find(k => blob.includes(k));
    if (hit) reasons.push(`Contains suspicious phrase: "${hit}"`);
    if (l.monthlyRent > 0 && l.monthlyRent < 400) reasons.push('Rent is unusually low for the area.');
    return reasons;
  }

  function audit(action, entityType, entityId, details) {
    db.auditLogs.unshift({
      _id: uid('audit'), actorRole: db.admin ? 'SUPER_ADMIN' : 'ANONYMOUS', userRole: db.admin ? 'SUPER_ADMIN' : 'ANONYMOUS',
      action, resource: entityType, entityType, resourceId: entityId || null, entityId: entityId || null,
      details: details || {}, metadata: {}, status: 'SUCCESS', result: 'SUCCESS', category: 'ADMIN',
      ipAddress: 'browser-demo', createdAt: now()
    });
    db.auditLogs = db.auditLogs.slice(0, 200);
  }

  // ---- response helpers ------------------------------------------------------
  function send(status, body) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }
  function ok(message, data, extra) { return send(200, Object.assign({ success: true, message, data }, extra || {})); }
  function created(message, data, extra) { return send(201, Object.assign({ success: true, message, data }, extra || {})); }
  function fail(status, message, code) {
    return send(status, { success: false, message, error: message, code: code || 'ERROR', errors: [] });
  }
  function requireAdmin() { return db.admin ? null : fail(401, 'Admin authentication required.', 'SESSION_EXPIRED'); }

  // ---- live-update stream (stands in for Server-Sent Events) ---------------
  const streams = new Set();
  function emit(type, payload) {
    const data = JSON.stringify(payload || {});
    streams.forEach(es => es._dispatch(type, data));
  }
  class DemoEventSource {
    constructor(url) {
      this.url = url; this.readyState = 0; this._listeners = {};
      this.onopen = null; this.onerror = null; this.onmessage = null;
      streams.add(this);
      setTimeout(() => {
        this.readyState = 1;
        if (this.onopen) this.onopen({ type: 'open' });
        this._dispatch('connected', '{}');
      }, 50);
    }
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
    removeEventListener(type, fn) { this._listeners[type] = (this._listeners[type] || []).filter(f => f !== fn); }
    _dispatch(type, data) {
      const ev = { type, data };
      (this._listeners[type] || []).forEach(fn => { try { fn(ev); } catch (e) { console.error(e); } });
      if (type === 'message' && this.onmessage) this.onmessage(ev);
    }
    close() { this.readyState = 2; streams.delete(this); }
  }
  const RealEventSource = window.EventSource;
  window.EventSource = function (url, opts) {
    if (String(url).indexOf('/api/') !== -1) return new DemoEventSource(url);
    return new RealEventSource(url, opts);
  };

  // ---- routes -----------------------------------------------------------------
  const routes = [];
  function route(methods, pattern, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    methods.split(',').forEach(m => routes.push({ method: m, re, keys, handler }));
  }

  route('GET', '/api/config', () => send(200, { turnstileSiteKey: null, devMode: true }));
  route('GET', '/api/health', () => send(200, { status: 'healthy', database: 'browser_demo' }));

  // Auth / OTP (codes are shown on screen instead of sent by SMS)
  route('POST', '/api/auth/request-otp', (req) => {
    const p = normalizePhone(req.body.phone);
    if (!req.body.phone || !isValidSAMobile(p)) return fail(400, 'Enter a valid South African mobile number (e.g., 082 123 4567).', 'INVALID_MOBILE_FORMAT');
    const code = String(Math.floor(100000 + Math.random() * 900000));
    db.otps[p] = { code, expiresAt: Date.now() + 10 * 60 * 1000 };
    const data = { phone: p, displayPhone: displayPhone(p), maskedPhone: displayPhone(p).replace(/ \d{3} /, ' ••• '), retryAfter: 60, cooldownExpiresAt: Date.now() + 60000, devOtp: code };
    return ok('Verification code generated (demo: shown on screen, no SMS sent).', data, data);
  });

  route('POST', '/api/auth/verify-otp', (req) => {
    const p = normalizePhone(req.body.phone);
    const code = String(req.body.code || req.body.otp || '');
    const rec = db.otps[p];
    if (!rec || Date.now() > rec.expiresAt || rec.code !== code) {
      return fail(401, 'The verification code entered is invalid or has expired.', 'OTP_INVALID');
    }
    delete db.otps[p];
    let ll = db.landlords.find(x => x.phone === p);
    if (!ll) {
      ll = { _id: uid('landlord'), fullName: req.body.fullName || 'Landlord', phone: p, createdAt: now(), trialEndsAt: new Date(Date.now() + 90 * DAY).toISOString() };
      db.landlords.push(ll);
    }
    ll.isPhoneVerified = true;
    return ok('Phone number verified.', { verified: true, landlord: landlordView(ll, false) }, { verified: true });
  });

  // Listings (public)
  route('GET', '/api/listings', (req) => {
    const q = req.query;
    let items = db.listings.filter(l => l.status === 'active');
    const suburb = (q.get('suburb') || '').toLowerCase();
    if (suburb && suburb !== 'all') items = items.filter(l => (l.suburb || '').toLowerCase().includes(suburb));
    if (q.get('maxRent')) items = items.filter(l => l.monthlyRent <= Number(q.get('maxRent')));
    if (q.get('propertyType') && q.get('propertyType') !== 'All') items = items.filter(l => l.propertyType === q.get('propertyType'));
    if (q.get('wifi') === 'true') items = items.filter(l => (l.amenities || []).some(a => /wi-?fi/i.test(a)));
    const kw = (q.get('keyword') || '').toLowerCase();
    if (kw) items = items.filter(l => [l.title, l.suburb, l.address, l.nearbyInstitution, ...(l.amenities || [])].join(' ').toLowerCase().includes(kw));
    const sortBy = q.get('sortBy') === 'monthlyRent' ? 'monthlyRent' : 'createdAt';
    const dir = q.get('order') === 'asc' ? 1 : -1;
    items.sort((a, b) => {
      const av = sortBy === 'monthlyRent' ? a.monthlyRent : new Date(a.createdAt).getTime();
      const bv = sortBy === 'monthlyRent' ? b.monthlyRent : new Date(b.createdAt).getTime();
      return (av - bv) * dir;
    });
    const total = items.length;
    const limit = Math.min(50, Math.max(1, parseInt(q.get('limit') || '12', 10)));
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(totalPages, Math.max(1, parseInt(q.get('page') || '1', 10)));
    const pageItems = items.slice((page - 1) * limit, page * limit).map(l => listingView(l, false));
    return ok('Listings retrieved successfully', {
      items: pageItems,
      pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 }
    }, { listings: pageItems, count: pageItems.length, total, page });
  });

  route('POST', '/api/listings/create', (req) => {
    const b = req.body;
    const p = normalizePhone(b.phone);
    if (!b.title || !b.suburb || !b.address || !(Number(b.monthlyRent) > 0)) {
      return fail(400, 'Title, suburb, address and a positive monthly rent are required.', 'VALIDATION_ERROR');
    }
    if (!b.phone || !isValidSAMobile(p)) return fail(400, 'Enter a valid South African mobile number (e.g., 082 123 4567).', 'INVALID_MOBILE_FORMAT');
    let ll = db.landlords.find(x => x.phone === p);
    if (!ll) {
      ll = { _id: uid('landlord'), fullName: b.fullName || 'Landlord', phone: p, isPhoneVerified: false, createdAt: now(), trialEndsAt: new Date(Date.now() + 90 * DAY).toISOString(), isPaidSubscriber: false };
      db.landlords.push(ll);
    }
    if (ll.isBlocked) return fail(403, 'Your account has been restricted by platform administration.', 'LANDLORD_BLOCKED');
    ll.hasWhatsapp = b.hasWhatsapp !== false;
    ll.showPhonePublicly = !!b.showPhonePublicly && !!b.consentPhonePublic;
    const l = {
      _id: uid('listing'), landlordId: ll._id,
      title: String(b.title).slice(0, 120), description: String(b.description || '').slice(0, 1000),
      suburb: String(b.suburb).slice(0, 60), address: String(b.address).slice(0, 200),
      monthlyRent: Number(b.monthlyRent), propertyType: b.propertyType || 'Backroom',
      nearbyInstitution: String(b.nearbyInstitution || '').slice(0, 100),
      amenities: Array.isArray(b.amenities) ? b.amenities.slice(0, 15) : [],
      image: b.image || '/images/township_backroom.jpg',
      status: 'pending_review', source: 'landlord', contactCount: 0, viewsCount: 0,
      reportCount: 0, createdAt: now(), updatedAt: now()
    };
    l.flagReasons = scamCheck(l);
    l.flagged = l.flagReasons.length > 0;
    db.listings.unshift(l);
    const v = listingView(l, true);
    emit('listing:created', { listing: v });
    return created('Listing created successfully.', v, { listing: v });
  });

  route('GET', '/api/listings/:id', (req) => {
    const l = db.listings.find(x => x._id === req.params.id);
    if (!l || l.status !== 'active') return fail(404, 'The requested property could not be found.', 'NOT_FOUND');
    l.viewsCount = (l.viewsCount || 0) + 1;
    const v = listingView(l, false);
    return ok('Listing retrieved successfully', v, { listing: v });
  });

  route('POST', '/api/listings/:id/contact', (req) => {
    const l = db.listings.find(x => x._id === req.params.id);
    if (!l || l.status !== 'active') return fail(404, 'The requested property could not be found.', 'NOT_FOUND');
    const ll = landlordFor(l);
    if (!ll) return fail(404, 'Landlord not found.', 'NOT_FOUND');
    l.contactCount = (l.contactCount || 0) + 1;
    const clean = ll.phone.replace('+', '');
    const text = encodeURIComponent(`Hi ${ll.fullName}, I saw your room listing on Rent A Room: "${l.title}" in ${l.suburb} (R${l.monthlyRent}/month). Is it still available for viewing?`);
    const data = {
      whatsappLink: ll.hasWhatsapp !== false ? `https://wa.me/${clean}?text=${text}` : null,
      whatsappWebLink: ll.hasWhatsapp !== false ? `https://web.whatsapp.com/send?phone=${clean}&text=${text}` : null,
      callLink: `tel:${ll.phone}`, phone: ll.phone, cleanPhone: clean,
      landlordName: ll.fullName, listingTitle: l.title
    };
    return ok('Contact tracked successfully', data, data);
  });

  route('POST', '/api/listings/:id/report', (req) => {
    const l = db.listings.find(x => x._id === req.params.id);
    if (!l) return fail(404, 'The requested property could not be found.', 'NOT_FOUND');
    l.reportCount = (l.reportCount || 0) + 1;
    l.flagged = true;
    l.flagReasons = l.flagReasons || [];
    if (!l.flagReasons.includes('Reported by a user')) l.flagReasons.push('Reported by a user');
    return ok('Listing report submitted. Our team will review it.', null);
  });

  // Photos are kept as the browser's own data URL, so the page falls back to it.
  route('POST', '/api/upload/photo', () => fail(503, 'Photo storage is not available in the demo.', 'STORAGE_UNAVAILABLE'));

  // Room seekers
  route('GET', '/api/room-requests', (req) => {
    const q = req.query;
    let items = db.requests.filter(r => r.status === 'active');
    const suburb = (q.get('suburb') || '').toLowerCase();
    if (suburb) items = items.filter(r => (r.suburb || '').toLowerCase().includes(suburb));
    if (q.get('maxBudget')) items = items.filter(r => r.maxBudget <= Number(q.get('maxBudget')));
    if (q.get('roomType') && q.get('roomType') !== 'All') items = items.filter(r => r.roomType === q.get('roomType'));
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return ok('Room seeker requests retrieved successfully', {
      items, pagination: { page: 1, limit: items.length, total: items.length, totalPages: 1, hasNextPage: false, hasPrevPage: false }
    }, { requests: items, count: items.length, total: items.length, page: 1 });
  });

  route('POST', '/api/room-requests/create', (req) => {
    const b = req.body;
    const p = normalizePhone(b.phone);
    if (!b.seekerName || !b.suburb || !(Number(b.maxBudget) > 0)) return fail(400, 'Name, suburb and a budget are required.', 'VALIDATION_ERROR');
    if (!b.phone || !isValidSAMobile(p)) return fail(400, 'Enter a valid South African mobile number (e.g., 082 123 4567).', 'INVALID_MOBILE_FORMAT');
    const r = {
      _id: uid('req'), status: 'active', contactCount: 0, isVerified: true, createdAt: now(),
      seekerName: String(b.seekerName).slice(0, 80), phone: p, hasWhatsapp: b.hasWhatsapp !== false,
      suburb: String(b.suburb).slice(0, 60), maxBudget: Number(b.maxBudget), roomType: b.roomType || 'Backroom',
      occupation: b.occupation || 'Single Person', moveInDate: b.moveInDate || 'Immediate',
      notes: String(b.notes || '').slice(0, 500), amenitiesWanted: Array.isArray(b.amenitiesWanted) ? b.amenitiesWanted : []
    };
    db.requests.unshift(r);
    emit('request:created', { request: r });
    return created('Room request posted successfully.', r, { request: r });
  });

  route('POST', '/api/room-requests/:id/contact', (req) => {
    const r = db.requests.find(x => x._id === req.params.id);
    if (!r) return fail(404, 'Room request not found.', 'NOT_FOUND');
    r.contactCount = (r.contactCount || 0) + 1;
    const clean = r.phone.replace('+', '');
    const text = encodeURIComponent(`Hi ${r.seekerName}, I saw your room request on Rent A Room looking for a place in ${r.suburb} (R${r.maxBudget}/month). I have an available room for you!`);
    const data = {
      whatsappLink: `https://wa.me/${clean}?text=${text}`, whatsappWebLink: `https://web.whatsapp.com/send?phone=${clean}&text=${text}`,
      callLink: `tel:${r.phone}`, phone: r.phone, cleanPhone: clean, seekerName: r.seekerName
    };
    return ok('Contact inquiry recorded', data, data);
  });

  // Housing advisor: canned local answers (the live app uses Gemini)
  route('POST', '/api/ai/chat', (req) => {
    const msg = String(req.body.message || req.body.question || req.body.prompt || '').toLowerCase();
    const active = db.listings.filter(l => l.status === 'active');
    let answer;
    const match = active.filter(l => msg.includes((l.suburb || '').toLowerCase()));
    if (match.length) {
      answer = `I found ${match.length} room${match.length === 1 ? '' : 's'} in ${match[0].suburb}: ` +
        match.slice(0, 3).map(l => `**${l.title}** at R${l.monthlyRent.toLocaleString()}/mo`).join('; ') + '.';
    } else if (/cheap|budget|afford|price|cost|how much/.test(msg)) {
      const cheapest = active.slice().sort((a, b) => a.monthlyRent - b.monthlyRent).slice(0, 3);
      answer = 'In Soweto, standard single rooms average **R1,300 - R1,700/mo**, and ensuites or flatlets **R2,000 - R2,800/mo**. ' +
        (cheapest.length ? 'The most affordable rooms listed right now: ' + cheapest.map(l => `${l.title} (${l.suburb}, R${l.monthlyRent.toLocaleString()})`).join('; ') + '.' : '');
    } else if (/scam|safe|deposit/.test(msg)) {
      answer = 'Never pay a deposit before viewing a room in person, and meet the landlord at the property. Use **Report this listing** on anything that asks for money upfront.';
    } else {
      answer = 'Welcome to the Soweto Housing Advisor! Ask me about rooms in a suburb (e.g. Pimville, Dobsonville, Protea Glen), typical rents, or how to avoid rental scams. (Demo mode: answers are generated locally.)';
    }
    const data = { answer, model: 'demo_local_advisor', grounded: true };
    return ok('Advisor advice generated.', data, { reply: answer, answer });
  });

  // Admin auth
  function adminLogin(req) {
    const b = req.body;
    const user = String(b.username || b.email || b.user || '').trim().toLowerCase();
    const pass = String(b.password || b.adminKey || b.key || b.pass || '').trim();
    if (pass !== ADMIN_PASSWORD || (user && user !== ADMIN_USERNAME)) {
      return fail(401, 'Invalid admin credentials. Demo login: username "admin", password "demo".', 'INVALID_CREDENTIALS');
    }
    db.admin = true;
    audit('LOGIN', 'AdminAuth', null, { loginMethod: 'DEMO' });
    const user_ = { role: 'SUPER_ADMIN', admin: true, fullName: 'Administrator' };
    return ok('Admin authentication successful.', { authenticated: true, accessToken: 'demo-token', token: 'demo-token', user: user_ },
      { authenticated: true, accessToken: 'demo-token', token: 'demo-token', user: user_ });
  }
  route('POST', '/api/admin/login', adminLogin);
  route('POST', '/api/admin/verify', adminLogin);
  route('POST', '/api/admin/verify-key', adminLogin);
  route('POST', '/api/admin/logout', () => { db.admin = false; return ok('Logged out.', null); });
  route('GET', '/api/admin/session', () => requireAdmin() || ok('Admin session valid', { user: { role: 'SUPER_ADMIN', admin: true, fullName: 'Administrator' }, authenticated: true }, { authenticated: true }));
  route('GET', '/api/admin/verify', () => requireAdmin() || ok('Admin verification successful', { user: { role: 'SUPER_ADMIN', admin: true, fullName: 'Administrator' }, authenticated: true }, { authenticated: true }));

  route('GET', '/api/admin/stats', () => {
    const denied = requireAdmin(); if (denied) return denied;
    const L = db.listings;
    const stats = {
      listings: {
        total: L.length, active: L.filter(l => l.status === 'active').length,
        pending: L.filter(l => l.status === 'pending_review').length,
        suspended: L.filter(l => l.status === 'suspended').length,
        rejected: L.filter(l => l.status === 'rejected').length,
        flagged: L.filter(l => l.flagged).length
      },
      requests: { total: db.requests.length, active: db.requests.filter(r => r.status === 'active').length },
      landlords: {
        total: db.landlords.length, verified: db.landlords.filter(l => l.isPhoneVerified).length,
        active: db.landlords.filter(l => !l.isBlocked).length, blocked: db.landlords.filter(l => l.isBlocked).length,
        paid: db.landlords.filter(l => l.isPaidSubscriber).length
      },
      totalContactClicks: L.reduce((s, l) => s + (l.contactCount || 0), 0)
    };
    return ok('Dashboard metrics retrieved', stats, { stats });
  });

  route('GET', '/api/admin/listings', (req) => {
    const denied = requireAdmin(); if (denied) return denied;
    const q = req.query;
    let items = db.listings.slice();
    const status = q.get('status');
    if (q.get('flagged') === 'true' || status === 'flagged') items = items.filter(l => l.flagged);
    else if (status && status !== 'all' && status !== 'All') {
      const s = status === 'pending' ? 'pending_review' : status;
      items = items.filter(l => l.status === s);
    }
    const kw = (q.get('keyword') || '').toLowerCase();
    if (kw) items = items.filter(l => [l.title, l.suburb, l.address].join(' ').toLowerCase().includes(kw));
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const out = items.map(l => listingView(l, true));
    return ok('Admin listings retrieved', out, { listings: out, total: out.length, count: out.length });
  });

  route('GET', '/api/admin/listings/pending', () => {
    const denied = requireAdmin(); if (denied) return denied;
    const out = db.listings.filter(l => l.status === 'pending_review').map(l => listingView(l, true));
    return ok('Pending listings retrieved', out, { listings: out });
  });

  route('GET', '/api/admin/listings/:id', (req) => {
    const denied = requireAdmin(); if (denied) return denied;
    const l = db.listings.find(x => x._id === req.params.id);
    if (!l) return fail(404, 'Listing not found.', 'NOT_FOUND');
    const v = listingView(l, true);
    return ok('Listing retrieved', v, { listing: v });
  });

  function setListingStatus(id, status, event, message) {
    const denied = requireAdmin(); if (denied) return denied;
    const l = db.listings.find(x => x._id === id);
    if (!l) return fail(404, 'Listing not found.', 'NOT_FOUND');
    const previous = l.status;
    l.status = status; l.updatedAt = now();
    audit('LISTING_' + status.toUpperCase(), 'Listing', id, { previousStatus: previous, newStatus: status, title: l.title });
    const v = listingView(l, true);
    emit(event, { listing: v, listingId: id });
    emit('listing:status_changed', { listing: v, listingId: id, status });
    return ok(message, v, { listing: v });
  }
  route('PATCH,POST,PUT', '/api/admin/listings/:id/approve', (req) => setListingStatus(req.params.id, 'active', 'listing:approved', 'Listing approved and published successfully.'));
  route('POST,PUT', '/api/admin/listings/:id/unsuspend', (req) => setListingStatus(req.params.id, 'active', 'listing:approved', 'Listing approved and published successfully.'));
  route('PATCH,POST,PUT', '/api/admin/listings/:id/reject', (req) => setListingStatus(req.params.id, 'rejected', 'listing:rejected', 'Listing rejected.'));
  route('POST,PUT', '/api/admin/listings/:id/suspend', (req) => setListingStatus(req.params.id, 'suspended', 'listing:suspended', 'Listing suspended successfully.'));

  route('PATCH,PUT', '/api/admin/listings/:id', (req) => {
    const denied = requireAdmin(); if (denied) return denied;
    const l = db.listings.find(x => x._id === req.params.id);
    if (!l) return fail(404, 'Listing not found.', 'NOT_FOUND');
    const allowed = ['title', 'description', 'suburb', 'address', 'monthlyRent', 'propertyType', 'amenities', 'image', 'nearbyInstitution', 'status', 'flagged'];
    allowed.forEach(f => { if (req.body[f] !== undefined) l[f] = f === 'monthlyRent' ? Number(req.body[f]) : req.body[f]; });
    if (req.body.flagged === false) { l.flagReasons = []; l.reportCount = 0; }
    l.updatedAt = now();
    audit('LISTING_UPDATED', 'Listing', l._id, { title: l.title });
    const v = listingView(l, true);
    emit('listing:updated', { listing: v, listingId: l._id });
    return ok('Listing updated successfully.', v, { listing: v });
  });

  function deleteListing(req) {
    const denied = requireAdmin(); if (denied) return denied;
    const idx = db.listings.findIndex(x => x._id === req.params.id);
    if (idx === -1) return fail(404, 'Listing not found.', 'NOT_FOUND');
    const [l] = db.listings.splice(idx, 1);
    audit('LISTING_DELETED', 'Listing', l._id, { title: l.title });
    emit('listing:deleted', { listingId: l._id });
    return ok('Listing permanently deleted.', { _id: l._id });
  }
  route('DELETE', '/api/admin/listings/:id', deleteListing);
  route('POST,DELETE', '/api/admin/listings/:id/delete', deleteListing);

  route('POST', '/api/admin/listings/import', (req) => {
    const denied = requireAdmin(); if (denied) return denied;
    const entries = Array.isArray(req.body) ? req.body : req.body.listings;
    if (!Array.isArray(entries) || !entries.length) return fail(400, 'Send a non-empty array of listings.', 'VALIDATION_ERROR');
    const results = []; const imported = [];
    entries.slice(0, 100).forEach(e => {
      const title = (e && e.title) || '(untitled)';
      if (!e || !e.title || !e.suburb || !(Number(e.monthlyRent) > 0)) { results.push({ success: false, title, error: 'Missing title, suburb or rent.' }); return; }
      let ll = null;
      if (e.landlordPhone) {
        const p = normalizePhone(e.landlordPhone);
        ll = db.landlords.find(x => x.phone === p);
        if (!ll) {
          ll = { _id: uid('landlord'), fullName: e.landlordFullName || 'Landlord', phone: p, isPhoneVerified: false, hasWhatsapp: true, createdAt: now(), trialEndsAt: new Date(Date.now() + 90 * DAY).toISOString() };
          db.landlords.push(ll);
        }
      }
      const l = {
        _id: uid('import'), landlordId: ll ? ll._id : null, title: String(e.title), suburb: String(e.suburb),
        address: String(e.address || ''), monthlyRent: Number(e.monthlyRent), propertyType: e.propertyType || 'Backroom',
        amenities: Array.isArray(e.amenities) ? e.amenities : [], image: e.image || '/images/township_backroom.jpg',
        nearbyInstitution: e.nearbyInstitution || '', status: 'active', source: 'admin_import',
        contactCount: 0, flagged: false, flagReasons: [], reportCount: 0, createdAt: now()
      };
      db.listings.unshift(l); imported.push(listingView(l, true));
      results.push({ success: true, id: l._id, title });
    });
    audit('BULK_IMPORT', 'Listing', null, { importedCount: imported.length });
    return ok(`Imported ${imported.length} listings`, { importedCount: imported.length, listings: imported }, { results, count: imported.length });
  });

  route('GET', '/api/admin/landlords', () => {
    const denied = requireAdmin(); if (denied) return denied;
    const out = db.landlords.map(ll => Object.assign(landlordView(ll, true), {
      listingCount: db.listings.filter(l => (typeof l.landlordId === 'object' && l.landlordId ? l.landlordId._id : l.landlordId) === ll._id).length
    }));
    return ok('Landlords retrieved successfully', out, { landlords: out });
  });

  function updateLandlord(req, forceField) {
    const denied = requireAdmin(); if (denied) return denied;
    const ll = db.landlords.find(x => x._id === req.params.id);
    if (!ll) return fail(404, 'Landlord not found.', 'NOT_FOUND');
    const b = req.body;
    if (forceField === 'block') ll.isBlocked = typeof b.isBlocked === 'boolean' ? b.isBlocked : !ll.isBlocked;
    if (forceField === 'paid') ll.isPaidSubscriber = typeof b.isPaidSubscriber === 'boolean' ? b.isPaidSubscriber : !ll.isPaidSubscriber;
    if (!forceField) ['isBlocked', 'isPaidSubscriber', 'notes', 'fullName'].forEach(f => { if (b[f] !== undefined) ll[f] = b[f]; });
    audit('LANDLORD_UPDATED', 'Landlord', ll._id, { isBlocked: !!ll.isBlocked, isPaidSubscriber: !!ll.isPaidSubscriber });
    const v = landlordView(ll, true);
    emit('landlord:updated', { landlord: v });
    return ok('Landlord updated.', v, { landlord: v });
  }
  route('PATCH,PUT', '/api/admin/landlords/:id', (req) => updateLandlord(req, null));
  route('PUT,POST', '/api/admin/landlords/:id/block', (req) => updateLandlord(req, 'block'));
  route('POST', '/api/admin/landlords/:id/toggle-block', (req) => updateLandlord(req, 'block'));
  route('PUT', '/api/admin/landlords/:id/paid', (req) => updateLandlord(req, 'paid'));

  route('GET', '/api/admin/room-requests', () => {
    const denied = requireAdmin(); if (denied) return denied;
    const items = db.requests.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return ok('Room requests retrieved successfully', items, { requests: items, total: items.length, count: items.length });
  });
  function patchRequest(req) {
    const denied = requireAdmin(); if (denied) return denied;
    const r = db.requests.find(x => x._id === req.params.id);
    if (!r) return fail(404, 'Room request not found.', 'NOT_FOUND');
    ['status', 'notes', 'maxBudget', 'suburb', 'roomType', 'seekerName'].forEach(f => { if (req.body[f] !== undefined) r[f] = req.body[f]; });
    audit('REQUEST_UPDATED', 'RoomRequest', r._id, { status: r.status });
    return ok('Room request status updated', r, { request: r });
  }
  route('PATCH,PUT', '/api/admin/room-requests/:id', patchRequest);
  route('PUT', '/api/admin/room-requests/:id/status', patchRequest);
  route('DELETE', '/api/admin/room-requests/:id', (req) => {
    const denied = requireAdmin(); if (denied) return denied;
    const idx = db.requests.findIndex(x => x._id === req.params.id);
    if (idx === -1) return fail(404, 'Room request not found.', 'NOT_FOUND');
    db.requests.splice(idx, 1);
    audit('REQUEST_DELETED', 'RoomRequest', req.params.id, {});
    emit('request:deleted', { requestId: req.params.id });
    return ok('Room request removed.', { _id: req.params.id });
  });

  route('GET', '/api/admin/audit-logs', () => {
    const denied = requireAdmin(); if (denied) return denied;
    return ok('Audit logs retrieved successfully', db.auditLogs, { logs: db.auditLogs, auditLogs: db.auditLogs, total: db.auditLogs.length });
  });
  route('GET', '/api/admin/audit-logs/stats', () => {
    const denied = requireAdmin(); if (denied) return denied;
    const A = db.auditLogs;
    const count = (a) => A.filter(x => x.action === a).length;
    const today = new Date().toDateString();
    const stats = {
      totalLogs: A.length,
      todayLogins: A.filter(x => x.action === 'LOGIN' && new Date(x.createdAt).toDateString() === today).length,
      successfulLogins: count('LOGIN'), failedLogins: 0,
      listingApprovals: count('LISTING_ACTIVE'), approvedListings: count('LISTING_ACTIVE'),
      listingRejections: count('LISTING_REJECTED'), rejectedListings: count('LISTING_REJECTED'),
      modifiedListings: count('LISTING_UPDATED'), suspendedListings: count('LISTING_SUSPENDED'),
      aiQueries: 0, totalAdminActions: A.filter(x => x.action !== 'LOGIN').length
    };
    return ok('Audit statistics retrieved successfully', stats, { stats });
  });

  route('GET', '/api/admin/messages', () => {
    const denied = requireAdmin(); if (denied) return denied;
    const msgs = db.messages.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return ok('Inquiries and messages retrieved successfully', msgs, { messages: msgs, count: msgs.length });
  });
  route('POST', '/api/admin/messages/reply', (req) => {
    const denied = requireAdmin(); if (denied) return denied;
    const b = req.body;
    if (!b.text || !String(b.text).trim()) return fail(400, 'Reply text is required.', 'VALIDATION_ERROR');
    const listing = db.listings.find(l => l._id === b.listingId);
    const m = {
      _id: uid('msg'), listingId: b.listingId || null,
      landlordId: listing ? (typeof listing.landlordId === 'object' && listing.landlordId ? listing.landlordId._id : listing.landlordId) : null,
      tenantId: b.tenantId || null, sender: 'landlord', senderName: b.senderName || 'Administrator',
      text: String(b.text).slice(0, 1000), read: true, createdAt: now()
    };
    db.messages.push(m);
    return ok('Reply sent.', m, { message: m });
  });

  // ---- fetch interception -------------------------------------------------
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const rawUrl = typeof input === 'string' ? input : (input && input.url) || String(input);
    const url = new URL(rawUrl, 'http://demo.local');
    const apiIdx = url.pathname.indexOf('/api/');
    if (apiIdx === -1) return realFetch(input, init);

    const path = url.pathname.slice(apiIdx).replace(/\/+$/, '');
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    let body = {};
    const rawBody = init && init.body;
    if (typeof rawBody === 'string' && rawBody) {
      try { body = JSON.parse(rawBody); } catch (e) { return fail(400, 'Invalid JSON body.', 'INVALID_INPUT'); }
    }

    load();
    await new Promise(r => setTimeout(r, 90)); // feel like a network call
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = path.match(r.re);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      let res;
      try {
        res = r.handler({ params, query: url.searchParams, body });
      } catch (err) {
        console.error('[demo api]', err);
        res = fail(500, 'Something went wrong in the demo.', 'SERVER_ERROR');
      }
      save();
      return res;
    }
    return fail(404, 'This feature is not available in the demo.', 'NOT_FOUND');
  };

  window.RentARoomDemo = {
    reset() {
      db = freshDb(); save();
      try { sessionStorage.removeItem('adminToken'); localStorage.removeItem('adminToken'); } catch (e) { /* ignore */ }
      location.reload();
    }
  };
})();
