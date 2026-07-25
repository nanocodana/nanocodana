import { NextRequest, NextResponse } from 'next/server';

const RUNTIME_CDN = 'https://snack-runtime.eascdn.net';

// Patch the origin whitelist in the runtime's bundled JS
// The minified code has: t=['https://snack.expo.io',...];function s(e){return t.includes(e)||e.startsWith('http://localhost:')}
// We replace the isAllowedOrigin check to always return true
const ORIGIN_CHECK_PATTERN = /\.includes\((\w)\)\|\|\1\.startsWith\('http:\/\/localhost:'\)/g;
const ORIGIN_CHECK_REPLACEMENT = `.includes($1)||$1.startsWith('http://localhost:')||$1.startsWith('https://')`;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const fullPath = path.join('/');
  const cdnUrl = `${RUNTIME_CDN}/v2/${fullPath}`;

  // Only proxy index.html and JS bundles — redirect everything else to CDN
  const isIndexHtml = fullPath.endsWith('/index.html');
  const isJsBundle = fullPath.endsWith('.js');

  if (!isIndexHtml && !isJsBundle) {
    return NextResponse.redirect(cdnUrl);
  }

  const response = await fetch(cdnUrl, {
    headers: {
      'Accept-Encoding': 'identity',
    },
  });

  if (!response.ok) {
    return new NextResponse('Not found', { status: 404 });
  }

  let body = await response.text();

  if (isIndexHtml) {
    // Rewrite asset paths from /v2/{version}/... to our proxy /api/web-player/{version}/...
    body = body.replace(
      /src="\/v2\//g,
      `src="/api/web-player/`
    );
    body = body.replace(
      /href="\/v2\//g,
      `href="/api/web-player/`
    );
  }

  if (isJsBundle) {
    // Patch the origin whitelist check to allow all https origins
    body = body.replace(ORIGIN_CHECK_PATTERN, ORIGIN_CHECK_REPLACEMENT);
  }

  return new NextResponse(body, {
    headers: {
      'Content-Type': isIndexHtml ? 'text/html' : 'application/javascript',
      'Cache-Control': 'public, s-maxage=31536000, stale-while-revalidate=86400',
      'CDN-Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
