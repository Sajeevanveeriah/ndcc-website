import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get('next') || '/fantasy/account';
  const redirectUrl = new URL(next.startsWith('/') ? next : '/fantasy/account', url.origin);

  url.searchParams.forEach((value, key) => {
    if (key !== 'next') redirectUrl.searchParams.set(key, value);
  });

  return NextResponse.redirect(redirectUrl);
}
