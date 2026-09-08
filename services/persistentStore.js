const fs = require('fs');
const path = require('path');

let firebaseConfig = null;
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn('[PersistentStore] Error loading firebase-applet-config.json:', e.message);
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'rentaroom_store.json');

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[PersistentStore] Could not create data directory:', e.message);
}

// Convert JavaScript value to Firestore REST API format
function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
      return { timestampValue: new Date(val).toISOString() };
    }
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (typeof v !== 'function') {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

// Convert JavaScript object to Firestore document fields
function toFirestoreDoc(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'function' && k !== '_id' && k !== 'id') {
      fields[k] = toFirestoreValue(v);
    }
  }
  return { fields };
}

// Convert Firestore REST field format back to standard JS value
function fromFirestoreValue(val) {
  if (!val) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return val.booleanValue;
  if ('timestampValue' in val) return new Date(val.timestampValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    const res = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return null;
}

// Convert a Firestore REST document to standard JS object
function fromFirestoreDoc(doc) {
  if (!doc || !doc.fields) return null;
  const data = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    data[k] = fromFirestoreValue(v);
  }
  const parts = (doc.name || '').split('/');
  data._id = parts[parts.length - 1];
  return data;
}

class PersistentStore {
  constructor() {
    this.isSyncing = false;
    this.firestoreEnabled = Boolean(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.firestoreDatabaseId);
    if (this.firestoreEnabled) {
      console.log(`[PersistentStore] Cloud Firestore persistence active for database: ${firebaseConfig.firestoreDatabaseId}`);
    } else {
      console.log('[PersistentStore] Local file-backed persistence active');
    }
  }

  /**
   * Load store from local disk file
   */
  loadFromDisk() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        const data = JSON.parse(raw);
        console.log(`[PersistentStore] Successfully restored from local storage: ${data.listings?.length || 0} listings, ${data.requests?.length || 0} seeker requests`);
        return data;
      }
    } catch (err) {
      console.warn('[PersistentStore] Error reading local store file:', err.message);
    }
    return null;
  }

  /**
   * Atomically save full store state to disk
   */
  saveToDisk(data) {
    try {
      const tempPath = `${STORE_PATH}.tmp.${Date.now()}`;
      const payload = {
        savedAt: new Date().toISOString(),
        listings: data.listings || [],
        requests: data.requests || [],
        landlords: data.landlords || [],
        users: data.users || [],
        messages: data.messages || [],
        auditLogs: (data.auditLogs || []).slice(0, 100)
      };
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tempPath, STORE_PATH);
    } catch (err) {
      console.error('[PersistentStore] Error saving store to disk:', err.message);
    }
  }

  /**
   * Asynchronously sync a document to Cloud Firestore
   */
  async syncDocToFirestore(collection, id, data) {
    if (!this.firestoreEnabled) return;
    try {
      const { projectId, firestoreDatabaseId, apiKey } = firebaseConfig;
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents/${collection}/${encodeURIComponent(id)}?key=${apiKey}`;
      const docPayload = toFirestoreDoc(data);

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docPayload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        console.warn(`[PersistentStore] Firestore sync warning for ${collection}/${id} (${res.status}):`, errJson.error?.message || res.statusText);
      } else {
        console.log(`[PersistentStore] Successfully synced to Firestore: ${collection}/${id}`);
      }
    } catch (err) {
      console.warn(`[PersistentStore] Firestore sync network warning for ${collection}/${id}:`, err.message);
    }
  }

  /**
   * Delete a document from Cloud Firestore
   */
  async deleteDocFromFirestore(collection, id) {
    if (!this.firestoreEnabled) return;
    try {
      const { projectId, firestoreDatabaseId, apiKey } = firebaseConfig;
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents/${collection}/${encodeURIComponent(id)}?key=${apiKey}`;
      await fetch(url, { method: 'DELETE' });
      console.log(`[PersistentStore] Deleted from Firestore: ${collection}/${id}`);
    } catch (err) {
      console.warn(`[PersistentStore] Firestore delete error for ${collection}/${id}:`, err.message);
    }
  }

  /**
   * Query all documents from a Firestore collection using runQuery
   */
  async queryFirestoreCollection(collection) {
    if (!this.firestoreEnabled) return [];
    try {
      const { projectId, firestoreDatabaseId, apiKey } = firebaseConfig;
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents:runQuery?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: collection }]
          }
        })
      });

      if (!res.ok) {
        return [];
      }

      const results = await res.json();
      if (!Array.isArray(results)) return [];

      const items = [];
      for (const entry of results) {
        if (entry.document) {
          const item = fromFirestoreDoc(entry.document);
          if (item) items.push(item);
        }
      }
      return items;
    } catch (err) {
      console.warn(`[PersistentStore] Firestore query error for ${collection}:`, err.message);
      return [];
    }
  }

  /**
   * Seed or two-way synchronize cloud Firestore with current in-memory store
   */
  async syncWithCloud(store) {
    if (!this.firestoreEnabled || this.isSyncing) return;
    this.isSyncing = true;
    try {
      // 1. Fetch remote listings from Firestore
      const remoteListings = await this.queryFirestoreCollection('listings');
      if (remoteListings.length > 0) {
        console.log(`[PersistentStore] Found ${remoteListings.length} listings in Cloud Firestore`);
        for (const remote of remoteListings) {
          const existingIdx = store.fallbackListings.findIndex(l => String(l._id) === String(remote._id));
          if (existingIdx >= 0) {
            store.fallbackListings[existingIdx] = { ...store.fallbackListings[existingIdx], ...remote };
          } else {
            store.fallbackListings.unshift(remote);
          }
        }
      } else {
        // Seed initial listings to Firestore
        console.log(`[PersistentStore] Seeding ${store.fallbackListings.length} initial listings to Cloud Firestore...`);
        for (const item of store.fallbackListings) {
          await this.syncDocToFirestore('listings', item._id, item);
        }
      }

      // 2. Fetch remote seeker requests from Firestore
      const remoteRequests = await this.queryFirestoreCollection('room_requests');
      if (remoteRequests.length > 0) {
        console.log(`[PersistentStore] Found ${remoteRequests.length} seeker requests in Cloud Firestore`);
        for (const remote of remoteRequests) {
          const existingIdx = store.fallbackRequests.findIndex(r => String(r._id) === String(remote._id));
          if (existingIdx >= 0) {
            store.fallbackRequests[existingIdx] = { ...store.fallbackRequests[existingIdx], ...remote };
          } else {
            store.fallbackRequests.unshift(remote);
          }
        }
      } else {
        // Seed initial requests to Firestore
        console.log(`[PersistentStore] Seeding ${store.fallbackRequests.length} initial seeker requests to Cloud Firestore...`);
        for (const item of store.fallbackRequests) {
          await this.syncDocToFirestore('room_requests', item._id, item);
        }
      }

      // 3. Save merged state to disk
      this.saveToDisk({
        listings: store.fallbackListings,
        requests: store.fallbackRequests,
        landlords: store.fallbackLandlords,
        users: store.fallbackUsers,
        messages: store.fallbackMessages,
        auditLogs: store.fallbackAuditLogs
      });
    } catch (err) {
      console.warn('[PersistentStore] Cloud synchronization warning:', err.message);
    } finally {
      this.isSyncing = false;
    }
  }
}

module.exports = new PersistentStore();
