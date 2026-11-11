import { NextResponse } from 'next/server';

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

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('doc365_token')?.value;
  const role = request.cookies.get('doc365_role')?.value;

  // If already logged in and visiting /login, redirect to user's assigned portal
  if (pathname === '/login') {
    if (token && role && ROLE_PORTALS[role]) {
      return NextResponse.redirect(new URL(ROLE_PORTALS[role], request.url));
    }
    return NextResponse.next();
  }

  // Intercept protected clinical/patient routes
  const matchedRoute = PROTECTED_ROUTES.find((r) => pathname.startsWith(r.prefix));
  if (matchedRoute) {
    // 1. Unauthenticated -> redirect to /login
    if (!token || !role) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // 2. Authenticated but unauthorized role -> redirect to the user's OWN portal
    if (role !== matchedRoute.role) {
      const ownPortal = ROLE_PORTALS[role] || '/login';
      const redirectUrl = new URL(ownPortal, request.url);
      redirectUrl.searchParams.set('denied', '1');
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/doctor/:path*',
    '/pharmacy/:path*',
    '/lab/:path*',
    '/patient/:path*',
    '/login',
  ],
};
