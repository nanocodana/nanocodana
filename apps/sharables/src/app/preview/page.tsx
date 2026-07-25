import { PreviewPageClient } from '@/components/PreviewPageClient';
import { loadSavedSnack } from '@/lib/load-saved-snack';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const sessionIdValue = params.id;
  const sessionId =
    (Array.isArray(sessionIdValue) ? sessionIdValue[0] : sessionIdValue)?.trim() ?? '';
  const platformsValue = params.platforms;
  const platforms =
    (Array.isArray(platformsValue) ? platformsValue[0] : platformsValue)
      ?.split(',')
      .filter(Boolean) ?? null;
  const remixValue = params.remix;
  const remixEnabled = (Array.isArray(remixValue) ? remixValue[0] : remixValue) === '1';

  if (!sessionId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-6">
        <div className="max-w-md rounded-3xl border border-border/60 bg-background px-8 py-10 text-center shadow-xl">
          <h1 className="text-xl font-semibold text-foreground">Preview link unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            This preview link is incomplete or expired. Reopen the browser preview from Expo Snack.
          </p>
        </div>
      </div>
    );
  }

  const savedSnack = await loadSavedSnack(sessionId);

  return (
    <PreviewPageClient
      sessionId={sessionId}
      savedSnack={savedSnack}
      platforms={platforms}
      remixEnabled={remixEnabled}
    />
  );
}
