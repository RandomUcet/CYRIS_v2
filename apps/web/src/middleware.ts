import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protected route guards: direct navigation without valid session cookie must redirect to login
  if (pathname.startsWith('/events') || pathname.startsWith('/admin')) {
    const sessionCookie = request.cookies.get('cyris_session');
    if (!sessionCookie || !sessionCookie.value) {
      const loginUrl = new URL('/', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/events/:path*', '/admin/:path*'],
};
