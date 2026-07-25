/**
 * Capability flag for the Appetize-based native (App) preview.
 *
 * Why this exists:
 *   The Appetize iframe (used by Stage.tsx for iOS/Android previews) only
 *   loads on `localhost` because the publicKeys we use are Expo's own keys
 *   and Appetize enforces an origin allowlist + minute quota at the key
 *   level. On a prod origin the iframe is blocked. We use this flag to
 *   render the pre-Appetize UI (Phone | Desktop | Code) wherever Appetize
 *   won't work, and the full UI (Web | App | Code with iOS/Android
 *   sub-tabs) wherever it will (localhost dev, future desktop build, etc.).
 *
 * How to control it:
 *   - Default (no env, no query) → false (prod-safe).
 *   - Build-time:  set NEXT_PUBLIC_SHOW_APPETIZE=1 in .env.local (dev) or
 *                  in the desktop-app build pipeline.
 *   - Runtime:     append ?appetize=1 or ?appetize=0 to the URL to override
 *                  the env default per tab. Useful for quick A/B compare
 *                  without restarting `next dev`.
 */

export function canUseAppetize(): boolean {
  // URL query param wins if present (works both client- and server-side
  // during the initial render — server has no query string, so this is a
  // client-only escape hatch; SSR falls through to the env default).
  if (typeof window !== 'undefined') {
    const param = new URLSearchParams(window.location.search).get('appetize')
    if (param === '1') return true
    if (param === '0') return false
  }

  return process.env.NEXT_PUBLIC_SHOW_APPETIZE === '1'
}
