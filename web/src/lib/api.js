// Doc365 Client API and Session Management
// Handles JWT auth tokens, API rewrites, and structured AppError handling.

const TOKEN_KEY = 'doc365_token';
const USER_KEY = 'doc365_user';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser() {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
}

export function setSession(token, user) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function apiRequest(endpoint, { method = 'GET', body, headers = {}, token = null } = {}) {
  const activeToken = token ?? getToken();
  const reqHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (activeToken) {
    reqHeaders['Authorization'] = `Bearer ${activeToken}`;
  }

  const url = endpoint.startsWith('/') ? `/api${endpoint}` : `/api/${endpoint}`;

  try {
    const res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorObj = data.error || {
        code: `HTTP_${res.status}`,
        message: data.message || `Request failed with status ${res.status}`,
      };
      return { ok: false, status: res.status, error: errorObj, data };
    }

    return { ok: true, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: { code: 'NETWORK_ERROR', message: err.message || 'Cannot connect to Doc365 backend' },
    };
  }
}

// Auth API
export async function login({ username, password, membershipId, asPatient }) {
  const res = await apiRequest('/auth/login', {
    method: 'POST',
    body: { username, password, membershipId, asPatient },
  });
  if (res.ok && res.data?.token) {
    setSession(res.data.token, res.data.session);
  }
  return res;
}

// Doctor & Clinical API
export async function scanCard({ healthId, cardSerial }) {
  return apiRequest('/access/scan', {
    method: 'POST',
    body: { healthId, cardSerial },
  });
}

export async function getEmergencySummary(healthId) {
  return apiRequest(`/patients/${healthId}/emergency`);
}

export async function breakGlassAccess({ healthId, reason }) {
  return apiRequest('/access/break-glass', {
    method: 'POST',
    body: { healthId, reason },
  });
}

export async function getPatientRecords(healthId, pin = null) {
  const headers = pin ? { 'x-patient-pin': pin } : {};
  return apiRequest(`/patients/${healthId}/records`, { headers });
}

export async function createPrescription(prescriptionData) {
  return apiRequest('/prescriptions', {
    method: 'POST',
    body: prescriptionData,
  });
}

// Pharmacy API
export async function scanPrescription(code) {
  return apiRequest(`/prescriptions/scan/${encodeURIComponent(code)}`);
}

export async function dispensePrescription(code, dispenseData) {
  return apiRequest(`/prescriptions/scan/${encodeURIComponent(code)}/dispense`, {
    method: 'POST',
    body: dispenseData,
  });
}

// Patient Self-Sovereignty API
export async function getActiveMedications(healthId) {
  return apiRequest(`/patients/${healthId}/medications`);
}

export async function getAccessLedger(healthId) {
  return apiRequest(`/patients/${healthId}/access-ledger`);
}

export async function hideRecord(healthId, lineageId, reason = '') {
  return apiRequest(`/patients/${healthId}/hide`, {
    method: 'POST',
    body: { lineageId, reason },
  });
}

export async function unhideRecord(healthId, lineageId) {
  return apiRequest(`/patients/${healthId}/unhide`, {
    method: 'POST',
    body: { lineageId },
  });
}

export async function blockProvider(healthId, { facilityId, doctorUserId, reason }) {
  return apiRequest(`/patients/${healthId}/blocks`, {
    method: 'POST',
    body: { facilityId, doctorUserId, reason },
  });
}

export async function unblockProvider(healthId, blockId) {
  return apiRequest(`/patients/${healthId}/blocks/${blockId}/unblock`, {
    method: 'POST',
  });
}

export async function setPatientPin(healthId, pin) {
  return apiRequest(`/patients/${healthId}/pin`, {
    method: 'POST',
    body: { pin },
  });
}

export async function optOutPatient(healthId, reason = '') {
  return apiRequest(`/patients/${healthId}/opt-out`, {
    method: 'POST',
    body: { reason },
  });
}

export async function optInPatient(healthId) {
  return apiRequest(`/patients/${healthId}/opt-in`, {
    method: 'POST',
  });
}

// Laboratory & Orders API
export async function createLabOrder(orderData) {
  return apiRequest('/lab-orders', {
    method: 'POST',
    body: orderData,
  });
}

export async function getPatientLabOrders(healthId, status = null) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest(`/patients/${healthId}/lab-orders${query}`);
}

export async function completeLabOrder(orderId, { resultRecordId } = {}) {
  return apiRequest(`/lab-orders/${orderId}/complete`, {
    method: 'POST',
    body: { resultRecordId },
  });
}

export async function uploadRecord({ bundle, provenance = null, isSensitive = false }) {
  return apiRequest('/records', {
    method: 'POST',
    body: { bundle, provenance, isSensitive },
  });
}

// Client-side facility signing helper (Demo Lab simulation)
export async function signBundleClient(bundle, labReference = 'Organization/demo-lab-colombo') {
  try {
    const res = await fetch('/client-api/lab/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle, labReference }),
    });
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}
