import { parseRuntimeUrl } from 'snack-content';
import type { SDKVersion } from 'snack-content';
import { base32Encode } from './base32';

export const SNACK_CODE_CHANGES_DELAY = 500;
export const SNACK_VERBOSE = true;
export const SNACK_NAME = 'Codana Project';
export const SNACK_DESCRIPTION = 'Created with Codana';
export const PROJECTS_STORAGE_KEY = 'codana_projects';
export function getProjectPersistKey(projectId: string) {
  return `expo-snack:${projectId}`;
}

// Handoff slot for "Remix this app": the /remix/<id> route stashes the saved
// snack's files here, then navigates to the builder, which consumes the key
// on mount and seeds a new project from it. localStorage because both pages
// are same-origin and the payload outlives the navigation.
export const PENDING_REMIX_STORAGE_KEY = 'codana_pending_remix';

// Per-app share domain (e.g. "sharable.app"). When set, a preview link becomes
// an <encodedId>.sharable.app subdomain — one shared app per subdomain — which
// the middleware decodes and rewrites back to /preview. Unset (local dev) falls
// back to the relative /preview path.
const SHARE_DOMAIN = process.env.NEXT_PUBLIC_SHARE_DOMAIN;

export function buildSnackPreviewRoute(id: string, platforms?: string[], includeCode?: boolean) {
  const query = new URLSearchParams();

  if (platforms && platforms.length > 0 && platforms.length < 4) {
    query.set('platforms', platforms.join(','));
  }

  // Opt-in: surfaces the "Remix this app" button on the preview page.
  if (includeCode) {
    query.set('remix', '1');
  }

  const qs = query.toString();

  // Snack ids are case-sensitive but hostnames are not (browsers lowercase
  // them), so base32-encode the id into a lowercase label the middleware
  // decodes back. Fall back to the relative path if there's no share domain or
  // the label would exceed the 63-char DNS label limit.
  if (SHARE_DOMAIN && id) {
    const label = base32Encode(id).toLowerCase();
    if (label.length <= 63) {
      return `https://${label}.${SHARE_DOMAIN}/${qs ? `?${qs}` : ''}`;
    }
  }

  // Fallback: relative preview path on the builder origin.
  query.set('id', id);
  return `/preview?${query.toString()}`;
}

// "Share code" target — opening it drops the recipient straight into the
// builder with the code seeded (see app/remix/[id]).
export function buildRemixRoute(id: string) {
  return `/remix/${encodeURIComponent(id)}`;
}

export function parseSnackRuntimeUrl(runtimeUrl: string | null | undefined) {
  if (!runtimeUrl) {
    return null;
  }

  const runtimeInfo = parseRuntimeUrl(runtimeUrl.trim());
  if (!runtimeInfo) {
    return null;
  }

  return {
    ...runtimeInfo,
    sdkVersion: runtimeInfo.sdkVersion as SDKVersion,
  };
}
