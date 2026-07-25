import { standardizeDependencies } from 'snack-sdk';
import type { SDKVersion } from 'snack-content';

export type SavedSnackPayload = {
  snackId?: string;
  accountSnackId?: string;
  name?: string;
  description?: string;
  sdkVersion?: SDKVersion;
  files?: Record<string, any>;
  dependencies?: Record<string, any>;
  error?: string | null;
};

/**
 * Fetch a saved Snack's code from Expo's public API. Server-only: the endpoint
 * sends no Access-Control-Allow-Origin header, so a browser fetch from our
 * origin is blocked — always call this from a Server Component / route handler.
 */
export async function loadSavedSnack(id: string): Promise<SavedSnackPayload | null> {
  try {
    const response = await fetch(`https://exp.host/--/api/v2/snack/${encodeURIComponent(id)}`, {
      headers: {
        'Snack-Api-Version': '3.0.0',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        error: `Expo Snack returned ${response.status} ${response.statusText}.`,
      };
    }

    const payload = await response.json();

    if (payload?.errors?.length) {
      return {
        error: 'Expo Snack returned errors when fetching the saved preview.',
      };
    }

    const files =
      payload.files && Object.keys(payload.files).length > 0
        ? payload.files
        : payload.code && typeof payload.code === 'object'
          ? payload.code
          : typeof payload.code === 'string'
            ? {
                'App.js': {
                  contents: payload.code,
                  type: 'CODE',
                },
              }
            : {};

    return {
      snackId: payload.id,
      accountSnackId: payload.accountSnackId,
      // Saved snacks keep name/description in the manifest, not top-level.
      name: payload.name ?? payload.manifest?.name,
      description: payload.description ?? payload.manifest?.description,
      sdkVersion: payload.sdkVersion as SDKVersion | undefined,
      files,
      dependencies: standardizeDependencies(payload.dependencies ?? {}),
      error: null,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to fetch saved Snack preview data.',
    };
  }
}
