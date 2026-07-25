import { RemixHandoff } from '@/components/RemixHandoff';
import { loadSavedSnack } from '@/lib/load-saved-snack';

// "Share code" target: fetch the saved snack server-side (Expo's API has no
// CORS), then hand the code to the client, which seeds a new project and
// opens the builder. Opening this link IS the remix.
export default async function RemixPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const snack = id ? await loadSavedSnack(id) : null;
  return <RemixHandoff snack={snack} />;
}
