import test from 'node:test';
import assert from 'node:assert/strict';

// Role-to-Portal mapping matching web/src/middleware.js
const ROLE_PORTALS = {
  DOCTOR: '/doctor',
  PHARMACIST: '/pharmacy',
  LAB_STAFF: '/lab',
  PATIENT: '/patient',
};

const PROTECTED_ROUTES = [
  { prefix: '/doctor', role: 'DOCTOR' },
  { prefix: '/pharmacy', role: 'PHARMACIST' },
  { prefix: '/lab', role: 'LAB_STAFF' },
  { prefix: '/patient', role: 'PATIENT' },
];

function evaluateRouteAccess({ pathname, token, role }) {
  // If already logged in and visiting /login, redirect to user's assigned portal
  if (pathname === '/login') {
    if (token && role && ROLE_PORTALS[role]) {
      return { action: 'redirect', destination: ROLE_PORTALS[role] };
    }
    return { action: 'next' };
  }

  // Intercept protected clinical/patient routes
  const matchedRoute = PROTECTED_ROUTES.find((r) => pathname.startsWith(r.prefix));
  if (matchedRoute) {
    // 1. Unauthenticated -> redirect to /login
    if (!token || !role) {
      return { action: 'redirect', destination: `/login?from=${encodeURIComponent(pathname)}` };
    }

    // 2. Authenticated but unauthorized role -> redirect to the user's OWN portal
    if (role !== matchedRoute.role) {
      const ownPortal = ROLE_PORTALS[role] || '/login';
      return { action: 'redirect', destination: `${ownPortal}?denied=1` };
    }

    return { action: 'next' };
  }

  return { action: 'next' };
}

test('Middleware: unauthenticated requests to protected portals redirect to /login', () => {
  for (const portal of ['/doctor', '/pharmacy', '/lab', '/patient']) {
    const res = evaluateRouteAccess({ pathname: portal, token: null, role: null });
    assert.equal(res.action, 'redirect');
    assert.equal(res.destination, `/login?from=${encodeURIComponent(portal)}`);
  }
});

test('Middleware: cross-role access is blocked and redirects user to their OWN portal', () => {
  // Pharmacist attempting to open /doctor -> redirected to /pharmacy
  const pharmToDoctor = evaluateRouteAccess({ pathname: '/doctor', token: 'jwt-token', role: 'PHARMACIST' });
  assert.equal(pharmToDoctor.action, 'redirect');
  assert.equal(pharmToDoctor.destination, '/pharmacy?denied=1');

  // Doctor attempting to open /pharmacy -> redirected to /doctor
  const docToPharm = evaluateRouteAccess({ pathname: '/pharmacy', token: 'jwt-token', role: 'DOCTOR' });
  assert.equal(docToPharm.action, 'redirect');
  assert.equal(docToPharm.destination, '/doctor?denied=1');

  // Patient attempting to open /lab -> redirected to /patient
  const patientToLab = evaluateRouteAccess({ pathname: '/lab', token: 'jwt-token', role: 'PATIENT' });
  assert.equal(patientToLab.action, 'redirect');
  assert.equal(patientToLab.destination, '/patient?denied=1');

  // Lab staff attempting to open /patient -> redirected to /lab
  const labToPatient = evaluateRouteAccess({ pathname: '/patient', token: 'jwt-token', role: 'LAB_STAFF' });
  assert.equal(labToPatient.action, 'redirect');
  assert.equal(labToPatient.destination, '/lab?denied=1');
});

test('Middleware: authorized role is granted access (next)', () => {
  assert.deepEqual(
    evaluateRouteAccess({ pathname: '/doctor', token: 'jwt-token', role: 'DOCTOR' }),
    { action: 'next' }
  );
  assert.deepEqual(
    evaluateRouteAccess({ pathname: '/pharmacy', token: 'jwt-token', role: 'PHARMACIST' }),
    { action: 'next' }
  );
  assert.deepEqual(
    evaluateRouteAccess({ pathname: '/lab', token: 'jwt-token', role: 'LAB_STAFF' }),
    { action: 'next' }
  );
  assert.deepEqual(
    evaluateRouteAccess({ pathname: '/patient', token: 'jwt-token', role: 'PATIENT' }),
    { action: 'next' }
  );
});

test('Middleware: logged-in user visiting /login is redirected to their own portal', () => {
  const docLogin = evaluateRouteAccess({ pathname: '/login', token: 'jwt-token', role: 'DOCTOR' });
  assert.equal(docLogin.action, 'redirect');
  assert.equal(docLogin.destination, '/doctor');

  const patientLogin = evaluateRouteAccess({ pathname: '/login', token: 'jwt-token', role: 'PATIENT' });
  assert.equal(patientLogin.action, 'redirect');
  assert.equal(patientLogin.destination, '/patient');
});
