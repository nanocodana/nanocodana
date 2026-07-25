import { NextRequest, NextResponse } from 'next/server';

const RUNTIME_CDN = 'https://snack-runtime.eascdn.net';

/**
 * Same-origin mirror for the Snack web player's runtime assets.
 *
 * The player is served through /api/web-player, which rewrites the asset
 * paths inside index.html — but the player's JS also loads assets AT RUNTIME
 * by absolute path (e.g. the @expo/vector-icons font at
 * /v2/54/assets/.../Ionicons.<hash>.ttf). Those requests resolve against OUR
 * origin, so without this route they 404 and every icon renders as an empty
 * box. Redirecting to the CDN is not enough: fonts are fetched in CORS mode
 * and the CDN sends no Access-Control-Allow-Origin header — the bytes must
 * be served same-origin. Responses are immutable-cached, so the CDN in front
 * of the app absorbs repeat traffic.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const upstream = await fetch(`${RUNTIME_CDN}/v2/${path.join('/')}`, {
    headers: { 'Accept-Encoding': 'identity' },
  });

  if (!upstream.ok) {
    return new NextResponse('Not found', { status: 404 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'public, s-maxage=31536000, stale-while-revalidate=86400',
      'CDN-Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
