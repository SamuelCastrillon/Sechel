import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware: Protect admin routes by checking for session cookie.
 * The login page (/admin/login) is excluded from protection.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /admin routes (except login and API routes)
  const isAdminLogin = pathname === '/admin/login';
  const isAdminApi = pathname.startsWith('/admin/api/');

  if (pathname.startsWith('/admin') && !isAdminLogin && !isAdminApi) {
    const sessionCookie = request.cookies.get('session')?.value;

    if (!sessionCookie) {
      const loginUrl = new URL('/admin/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // For full protection, we'd verify the JWT here.
    // Since middleware runs on Edge, we delegate JWT verification
    // to the layout/page component for simplicity.
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
