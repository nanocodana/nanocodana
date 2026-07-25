import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { base32Decode } from './lib/base32';

/**
 * Per-app share routing.
 *
 * Each shared app gets its own subdomain: `<appId>.sharable.app`. This
 * middleware turns that subdomain back into the internal preview route so one
 * subdomain serves exactly one shared app.
 *
 *   <label>.sharable.app/           → /preview?id=<snackId> (rewrite, same URL)
 *   sharable.app / www.sharable.app → the builder           (redirect)
 *   any other host (sharables.ai, *.vercel.app, localhost)  → untouched
 *
 * The subdomain label is the base32-encoded Snack id: Snack ids are
 * case-sensitive but hostnames are not, so the id is encoded to a lowercase
 * label by the share-link builder and decoded back here (see lib/base32).
 *
 * The builder itself lives on its own origin (BUILDER_ORIGIN); the share
 * domain is preview-only. Remixing has to happen on the builder origin (its
 * localStorage handoff lives there), so /remix on a share subdomain is bounced
 * over to the builder.
 */
const SHARE_DOMAIN = 'sharable.app';
const BUILDER_ORIGIN = 'https://sharables.ai';

export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();

  // Only the share domain is special; everything else passes straight through.
  if (host !== SHARE_DOMAIN && !host.endsWith(`.${SHARE_DOMAIN}`)) {
    return NextResponse.next();
  }

  const label = host === SHARE_DOMAIN ? '' : host.slice(0, -(SHARE_DOMAIN.length + 1));

  // Apex or www → this domain is for per-app links, not the builder.
  if (label === '' || label === 'www') {
    return NextResponse.redirect(BUILDER_ORIGIN, 307);
  }

  const { pathname, search } = request.nextUrl;

  // Remixing seeds localStorage on the builder origin, so keep it there.
  if (pathname === '/remix' || pathname.startsWith('/remix/')) {
    return NextResponse.redirect(`${BUILDER_ORIGIN}${pathname}${search}`, 307);
  }

  // Decode the base32 label back to the case-sensitive Snack id. A label that
  // isn't valid base32 can't be one of our links — send them to the builder.
  let snackId: string;
  try {
    snackId = base32Decode(label);
  } catch {
    return NextResponse.redirect(BUILDER_ORIGIN, 307);
  }
  if (!snackId) {
    return NextResponse.redirect(BUILDER_ORIGIN, 307);
  }

  // <label>.sharable.app/... → serve the shared app preview internally,
  // carrying through any platforms/remix flags already on the link.
  const url = request.nextUrl.clone();
  url.pathname = '/preview';
  url.searchParams.set('id', snackId);
  return NextResponse.rewrite(url);
}

export const config = {
  // Run on everything except Next internals, the API, and static files.
  matcher: ['/((?!_next/|api/|.*\\.[^/]+$).*)'],
};
