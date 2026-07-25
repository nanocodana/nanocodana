'use client'

import { useEffect, useMemo, useState } from 'react';
import { Monitor, Smartphone, ExternalLink } from 'lucide-react';
import NextImage from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { createRuntimeUrl } from 'snack-content';
import type { SDKVersion } from 'snack-content';
import { buildRemixRoute } from '@/lib/snack-preview';

import { SnackWebPreview } from '@/components/SnackWebPreview';
import { AndroidIcon, AppleIcon, WebIcon } from '@/components/PlatformIcons';
import { DeviceConnectionPanel } from '@/components/DeviceConnectionPanel';
import { cn } from '@/lib/utils';
import { buildAppetizeUrl, APPETIZE_IFRAME_ALLOW } from '@/lib/appetize';
import { canUseAppetize } from '@/lib/preview-capabilities';

// Extended platform vocabulary:
//   web/android/ios/device → original set, used when Appetize is enabled.
//   phone/desktop          → added for flag-off mode; both render the web
//                            preview, just in phone-bezel or desktop-window
//                            framing. Mirrors the editor's Stage tabs.
type PreviewPlatform = 'web' | 'android' | 'ios' | 'device' | 'phone' | 'desktop';

type PlatformOption = {
  value: PreviewPlatform;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type SavedSnackPayload = {
  snackId?: string;
  accountSnackId?: string;
  name?: string;
  description?: string;
  sdkVersion?: SDKVersion;
  files?: Record<string, any>;
  dependencies?: Record<string, any>;
  error?: string | null;
};

// Flag-on layout — current behavior, unchanged.
const ALL_OPTIONS_APPETIZE: PlatformOption[] = [
  { value: 'web', label: 'Web', icon: WebIcon },
  { value: 'android', label: 'Android', icon: AndroidIcon },
  { value: 'ios', label: 'iOS', icon: AppleIcon },
  { value: 'device', label: 'Device', icon: Smartphone },
];

// Flag-off, desktop browser — matches the editor's Stage tabs in flag-off
// mode. Default tab (first entry) is Desktop per design.
const ALL_OPTIONS_PROD_DESKTOP: PlatformOption[] = [
  { value: 'desktop', label: 'Desktop', icon: Monitor },
  { value: 'phone', label: 'Phone', icon: Smartphone },
  { value: 'device', label: 'Device', icon: Smartphone },
];

// Flag-off, mobile browser. Preview = phone-framed web; Full screen = the
// shared `desktop` framing, which on a phone means edge-to-edge (the
// visitor's device is the frame — no desktop window mock at 375px).
const ALL_OPTIONS_PROD_MOBILE: PlatformOption[] = [
  { value: 'phone', label: 'Preview', icon: Smartphone },
  { value: 'desktop', label: 'Full screen', icon: Monitor },
  { value: 'device', label: 'Device', icon: Smartphone },
];

// Translate the URL `platforms` array (the sharer's intent) into the set of
// tabs that are actually renderable in the recipient's current flag/mobile
// state. Falls back to the full default set if the URL doesn't yield
// anything renderable (e.g. an old URL containing only ios/android opened
// on a prod recipient).
function expandPlatforms(
  rawPlatforms: string[] | null | undefined,
  appetizeEnabled: boolean,
  isMobile: boolean
): Set<PreviewPlatform> {
  const fallback: Set<PreviewPlatform> = appetizeEnabled
    ? new Set(['web', 'android', 'ios', 'device'])
    : isMobile
      ? new Set(['phone', 'device'])
      : new Set(['phone', 'desktop', 'device']);

  if (!rawPlatforms || rawPlatforms.length === 0) {
    return fallback;
  }

  const expanded = new Set<PreviewPlatform>();
  for (const raw of rawPlatforms) {
    if (appetizeEnabled) {
      // flag on: phone/desktop both collapse to web; ios/android pass through
      if (raw === 'phone' || raw === 'desktop') expanded.add('web');
      else if (raw === 'web' || raw === 'android' || raw === 'ios' || raw === 'device') {
        expanded.add(raw);
      }
    } else {
      // flag off: legacy `web` expands to both framings; ios/android are
      // silently dropped (Appetize unavailable). Tabs mirror the sharer's
      // picks on every viewport — only the RENDERING adapts on mobile:
      // `phone` keeps its bezel (plus a native-handoff link), `desktop`
      // fills the screen edge-to-edge, `device` is the Expo Go screen.
      if (raw === 'web') {
        expanded.add('phone');
        expanded.add('desktop');
      } else if (raw === 'phone' || raw === 'desktop' || raw === 'device') {
        expanded.add(raw);
      }
    }
  }

  return expanded.size === 0 ? fallback : expanded;
}

function buildEmbeddedWebUrl(id: string) {
  const params = new URLSearchParams({
    preview: 'true',
    platform: 'web',
    supportedPlatforms: 'web',
  });

  return `https://snack.expo.dev/embedded/${encodeURIComponent(id)}?${params.toString()}`;
}

function Unavailable({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-md rounded-3xl border border-border/60 bg-background px-8 py-10 text-center shadow-xl">
        <h1 className="text-xl font-semibold text-foreground">Preview unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

// Phone bezel — visually matches Stage.tsx phone framing. Kept inline (not
// extracted) since Stage already has the canonical version; if both ever
// diverge the right move is a shared <PreviewFrame> component.
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-full w-full max-w-[370px] md:h-[95%] rounded-[32px] md:rounded-[44px] bg-slate-400 p-[5px] shadow-[0_36px_90px_-28px_rgba(15,23,42,0.38),0_0_120px_-40px_rgba(99,102,241,0.35)]">
      <div className="pointer-events-none absolute inset-0 rounded-[32px] md:rounded-[44px] ring-[1px] ring-slate-700/25" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/10 to-transparent z-10 rounded-t-[32px] md:rounded-t-[44px]" />
      <div className="relative h-full rounded-[27px] md:rounded-[39px] bg-slate-950 p-[4px] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

interface PreviewPageClientProps {
  sessionId: string;
  savedSnack: SavedSnackPayload | null;
  platforms?: string[] | null;
  /** Sharer opted into code sharing (remix=1) — surfaces the Remix button. */
  remixEnabled?: boolean;
}

export function PreviewPageClient({
  sessionId,
  savedSnack,
  platforms,
  remixEnabled = false,
}: PreviewPageClientProps) {
  // Hydration-safe client-only reads: SSR returns env-default (flag off,
  // not-mobile); effect upgrades on mount.
  const [appetizeEnabled, setAppetizeEnabled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setAppetizeEnabled(canUseAppetize());
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const renderable = useMemo(
    () => expandPlatforms(platforms, appetizeEnabled, isMobile),
    [platforms, appetizeEnabled, isMobile]
  );

  const platformOptions = useMemo(() => {
    const source = appetizeEnabled
      ? ALL_OPTIONS_APPETIZE
      : isMobile
        ? ALL_OPTIONS_PROD_MOBILE
        : ALL_OPTIONS_PROD_DESKTOP;
    return source.filter((opt) => renderable.has(opt.value));
  }, [appetizeEnabled, isMobile, renderable]);

  const [platform, setPlatform] = useState<PreviewPlatform>(
    platformOptions[0]?.value ?? 'web'
  );
  // Re-sync the selected tab when flag/mobile flips change the available set.
  useEffect(() => {
    if (platformOptions.length === 0) return;
    if (!platformOptions.some((opt) => opt.value === platform)) {
      setPlatform(platformOptions[0].value);
    }
  }, [platformOptions, platform]);
  // The initial tab is chosen during SSR-safe render (isMobile=false, desktop
  // list — defaults to Desktop). When the client viewport class resolves,
  // snap to THAT class's default so a phone lands on Preview, not on the
  // desktop-ordered pick. Deliberately keyed on isMobile only: re-running on
  // every options change would stomp the visitor's tab selection.
  useEffect(() => {
    const first = platformOptions[0]?.value;
    if (first) setPlatform(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  const sdkVersion = savedSnack?.sdkVersion;
  const deviceUrl = useMemo(() => {
    if (!sessionId || !sdkVersion) return null;
    return createRuntimeUrl({ sdkVersion, snack: sessionId });
  }, [sessionId, sdkVersion]);
  const webUrl = useMemo(
    () => (sessionId ? buildEmbeddedWebUrl(sessionId) : null),
    [sessionId]
  );
  const androidUrl = useMemo(
    () => buildAppetizeUrl(deviceUrl, sdkVersion, 'android'),
    [deviceUrl, sdkVersion]
  );
  const iosUrl = useMemo(
    () => buildAppetizeUrl(deviceUrl, sdkVersion, 'ios'),
    [deviceUrl, sdkVersion]
  );
  const showSwitcher = platformOptions.length > 1;
  // dvh, not vh: 100vh overflows the visible area on mobile while the
  // browser address bar is expanded.
  const contentHeight = showSwitcher ? 'h-[calc(100dvh-72px)]' : 'h-dvh';

  // Side QR on Phone tab — only when the sharer's URL included `device`
  // (preserved through expandPlatforms) and we're not on mobile.
  const hasDeviceTab = renderable.has('device');
  const showSideQR =
    !isMobile &&
    !appetizeEnabled &&
    platform === 'phone' &&
    hasDeviceTab &&
    !!deviceUrl;

  const hasWebData = !!(savedSnack?.sdkVersion && savedSnack.files);

  // Per-tab availability for the bottom switcher: phone/desktop need either
  // saved snack data or the embedded fallback; native tabs need Appetize URLs.
  const isAvailable = (value: PreviewPlatform): boolean => {
    if (value === 'web' || value === 'phone' || value === 'desktop') {
      return hasWebData || !!webUrl;
    }
    if (value === 'android') return !!androidUrl;
    if (value === 'ios') return !!iosUrl;
    if (value === 'device') return !!deviceUrl;
    return false;
  };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <div className="flex-1 bg-white relative">
        {/* Web tab — Appetize-on path, unchanged */}
        {platform === 'web' && (
          hasWebData ? (
            <div className={cn("w-full", contentHeight)}>
              <SnackWebPreview
                className="h-full w-full"
                iframeClassName="h-full w-full"
                sessionId={sessionId}
                snackId={savedSnack?.snackId}
                accountSnackId={savedSnack?.accountSnackId}
                sdkVersion={savedSnack?.sdkVersion}
                files={savedSnack?.files}
                dependencies={savedSnack?.dependencies}
                name={savedSnack?.name}
                description={savedSnack?.description}
                loadingLabel="Booting web preview..."
                unavailableMessage={savedSnack?.error || 'This web preview could not be opened.'}
                showUnavailableError
              />
            </div>
          ) : webUrl ? (
            <iframe
              key={`web:${webUrl}`}
              className={cn("w-full border-0 bg-white", contentHeight)}
              src={webUrl}
              allow={APPETIZE_IFRAME_ALLOW}
            />
          ) : (
            <Unavailable
              message={savedSnack?.error || 'This web preview could not be opened from the saved Snack id.'}
            />
          )
        )}

        {/* Phone tab — phone-framed web preview on every viewport. On mobile
            the bezel gains a native-handoff link below it (the same
            saved-snapshot deep link the Device tab uses), mirroring the
            builder's Stage. */}
        {platform === 'phone' && (
          <div className={cn(
            "w-full flex flex-col items-center justify-center",
            contentHeight,
            "p-4 md:px-6 md:pb-6 md:pt-10"
          )}>
            <div className="min-h-0 w-full flex-1 flex items-center justify-center">
            <PhoneFrame>
              {hasWebData ? (
                <SnackWebPreview
                  className="h-full w-full"
                  iframeClassName="h-full w-full rounded-[23px] md:rounded-[35px]"
                  sessionId={sessionId}
                  snackId={savedSnack?.snackId}
                  accountSnackId={savedSnack?.accountSnackId}
                  sdkVersion={savedSnack?.sdkVersion}
                  files={savedSnack?.files}
                  dependencies={savedSnack?.dependencies}
                  name={savedSnack?.name}
                  description={savedSnack?.description}
                  loadingLabel="Booting web preview..."
                  unavailableMessage={savedSnack?.error || 'This preview could not be opened.'}
                  showUnavailableError
                />
              ) : webUrl ? (
                <iframe
                  className="h-full w-full bg-white border-0 rounded-[23px] md:rounded-[35px]"
                  src={webUrl}
                  allow={APPETIZE_IFRAME_ALLOW}
                />
              ) : (
                <Unavailable
                  message={savedSnack?.error || 'This preview could not be opened from the saved Snack id.'}
                />
              )}
            </PhoneFrame>
            </div>
            {isMobile && deviceUrl && (
              <a
                href={deviceUrl}
                className="mt-3 inline-flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Run as a native app on your phone
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
              </a>
            )}
          </div>
        )}

        {/* Desktop tab — fullscreen web preview, identical to the flag-on
            Web tab. No window framing — fills the whole content area. */}
        {platform === 'desktop' && (
          hasWebData ? (
            <div className={cn("w-full", contentHeight)}>
              <SnackWebPreview
                className="h-full w-full"
                iframeClassName="h-full w-full"
                sessionId={sessionId}
                snackId={savedSnack?.snackId}
                accountSnackId={savedSnack?.accountSnackId}
                sdkVersion={savedSnack?.sdkVersion}
                files={savedSnack?.files}
                dependencies={savedSnack?.dependencies}
                name={savedSnack?.name}
                description={savedSnack?.description}
                loadingLabel="Booting web preview..."
                unavailableMessage={savedSnack?.error || 'This preview could not be opened.'}
                showUnavailableError
              />
            </div>
          ) : webUrl ? (
            <iframe
              key={`desktop:${webUrl}`}
              className={cn("w-full border-0 bg-white", contentHeight)}
              src={webUrl}
              allow={APPETIZE_IFRAME_ALLOW}
            />
          ) : (
            <Unavailable
              message={savedSnack?.error || 'This preview could not be opened from the saved Snack id.'}
            />
          )
        )}

        {/* Android (Appetize) — flag-on only */}
        {platform === 'android' && (
          androidUrl ? (
            <iframe
              key={`android:${androidUrl}`}
              className={cn("w-full border-0 bg-white", contentHeight)}
              src={androidUrl}
              allow={APPETIZE_IFRAME_ALLOW}
            />
          ) : (
            <Unavailable
              message={`This android preview is not available for SDK ${sdkVersion ?? 'unknown'}.`}
            />
          )
        )}

        {/* iOS (Appetize) — flag-on only */}
        {platform === 'ios' && (
          iosUrl ? (
            <iframe
              key={`ios:${iosUrl}`}
              className={cn("w-full border-0 bg-white", contentHeight)}
              src={iosUrl}
              allow={APPETIZE_IFRAME_ALLOW}
            />
          ) : (
            <Unavailable
              message={`This ios preview is not available for SDK ${sdkVersion ?? 'unknown'}.`}
            />
          )
        )}

        {/* Device tab. The deviceUrl is the saved-snapshot deep link (no live
            channel), so Expo Go loads it standalone. Desktop shows a QR to
            scan; on mobile the visitor IS the device — a QR they can't scan —
            so give them a tappable link instead (a plain anchor keeps the
            user gesture intact for the external-app launch). */}
        {platform === 'device' && (
          <div className={cn("flex items-center justify-center bg-slate-50", contentHeight)}>
            <div className="flex flex-col items-center gap-6 max-w-sm px-6 text-center">
              {isMobile ? (
                <>
                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground">Run on your phone</h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Open this project as a native app in Expo Go.
                    </p>
                  </div>
                  {deviceUrl ? (
                    <a
                      href={deviceUrl}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
                    >
                      <Smartphone className="h-4 w-4" />
                      Open in Expo Go
                    </a>
                  ) : (
                    <div className="w-full rounded-xl bg-slate-200 px-6 py-3.5 text-sm font-medium text-slate-400 animate-pulse">
                      Preparing...
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Don&apos;t have Expo Go yet? Install it first, then come back and tap the button.
                  </p>
                </>
              ) : (
                <>
                  <div className="bg-white p-4 rounded-2xl border shadow-sm">
                    {deviceUrl ? (
                      <QRCodeSVG value={deviceUrl} size={180} />
                    ) : (
                      <div className="w-[180px] h-[180px] bg-muted animate-pulse rounded-lg" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground">Run on your phone</h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Scan this QR code with your camera or the Expo Go app to open the project on your device.
                    </p>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3 w-full">
                <a
                  href="https://apps.apple.com/app/expo-go/id982107779"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  App Store
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                </a>
                <a
                  href="https://play.google.com/store/apps/details?id=host.exp.exponent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Google Play
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Remix — a view-first entry to the editor, only when the sharer
            opted into code sharing (remix=1). Links to the same /remix/<id>
            route the "Share editable code" link uses (one seeding path).
            Hidden on the Device tab, which shows the Expo Go handoff. */}
        {remixEnabled && hasWebData && platform !== 'device' && (
          <a
            href={buildRemixRoute(sessionId)}
            className="absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-full bg-slate-900/90 py-2 pl-2 pr-4 text-sm font-semibold text-white shadow-lg backdrop-blur transition-colors hover:bg-slate-900"
          >
            <NextImage
              src="/logo.png"
              alt=""
              width={22}
              height={22}
              className="h-[22px] w-[22px] rounded-full object-contain"
            />
            Remix this app
          </a>
        )}

        {/* Side QR on Phone tab — only when sharer included `device` */}
        {showSideQR && (
          <DeviceConnectionPanel
            url={deviceUrl}
            className="absolute right-6 top-1/2 -translate-y-1/2 hidden md:flex"
          />
        )}
      </div>

      {showSwitcher && (
        <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex w-fit items-center overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
            {platformOptions.map((option) => {
              const Icon = option.icon;
              const available = isAvailable(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => available && setPlatform(option.value)}
                  disabled={!available}
                  className={cn(
                    'flex items-center gap-2 border-r border-slate-300 px-4 py-3 text-sm font-medium transition-colors last:border-r-0',
                    platform === option.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-50',
                    !available && 'cursor-not-allowed opacity-40 hover:bg-white'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
