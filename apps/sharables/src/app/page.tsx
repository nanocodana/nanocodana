'use client'

import dynamic from 'next/dynamic';

// Load SnackPage only on client side to avoid SSR issues with snack-sdk.
// The fallback (shown only while the chunk downloads) is a plain background —
// no full-screen splash — so the chat appears to load directly. The branded
// boot bounce lives inside the preview pane instead.
const SnackPage = dynamic(() => import('./SnackPage'), {
  ssr: false,
  loading: () => <div className="h-dvh w-full bg-background" aria-hidden />,
});

export default function Home() {
  return <SnackPage />;
}
