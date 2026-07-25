'use client'

import { useEffect, useState } from 'react';
import { PENDING_REMIX_STORAGE_KEY } from '@/lib/snack-preview';
import type { SavedSnackPayload } from '@/lib/load-saved-snack';

/**
 * Lands a "share code" recipient directly in the builder: stashes the
 * server-fetched snack code (the API has no CORS, so the fetch had to happen
 * server-side) into the same localStorage slot the in-app remix uses, then
 * replaces the URL with the builder, which seeds a new project from it on
 * mount. A pure client redirect — no builder rendered here.
 */
export function RemixHandoff({ snack }: { snack: SavedSnackPayload | null }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const codeFiles =
      snack?.files &&
      Object.values(snack.files).some(
        (file: any) => file?.type === 'CODE' && typeof file.contents === 'string'
      );

    if (snack?.error || !codeFiles) {
      setFailed(true);
      return;
    }

    try {
      localStorage.setItem(
        PENDING_REMIX_STORAGE_KEY,
        JSON.stringify({
          name: snack.name,
          files: snack.files,
          dependencies: snack.dependencies,
        })
      );
    } catch {
      setFailed(true);
      return;
    }
    window.location.replace('/');
  }, [snack]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      {failed ? (
        <>
          <h1 className="text-xl font-semibold text-foreground">Couldn&apos;t open this app</h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {snack?.error ?? 'This share link is incomplete or expired.'}
          </p>
          <a
            href="/"
            className="mt-2 inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Start a new app
          </a>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground">Opening in the editor…</p>
        </>
      )}
    </div>
  );
}
