'use client'

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Smartphone, ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { createRuntimeUrl } from 'snack-content';

import { AndroidIcon, AppleIcon, WebIcon } from '@/components/PlatformIcons';
import { DeviceConnectionPanel } from '@/components/DeviceConnectionPanel';
import { cn } from '@/lib/utils';

type PreviewPlatform = 'web' | 'android' | 'ios' | 'device';

const IFRAME_ALLOW = [
  'accelerometer', 'ambient-light-sensor', 'autoplay', 'battery', 'camera',
  'fullscreen', 'gamepad', 'geolocation', 'gyroscope', 'idle-detection',
  'magnetometer', 'microphone', 'midi', 'payment', 'picture-in-picture',
  'screen-wake-lock', 'usb',
].join('; ');

const ALL_PLATFORM_OPTIONS: {
  value: PreviewPlatform;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: 'web', label: 'Web', icon: WebIcon },
  { value: 'android', label: 'Android', icon: AndroidIcon },
  { value: 'ios', label: 'iOS', icon: AppleIcon },
  { value: 'device', label: 'Device', icon: Smartphone },
];

function buildEmbedUrl(id: string, platform: string) {
  const params = new URLSearchParams({
    preview: 'true',
    platform,
    supportedPlatforms: platform,
  });
  return `https://snack.expo.dev/embedded/${encodeURIComponent(id)}?${params.toString()}`;
}

export default function ExpoEmbedPage() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const id = params?.get('id') ?? 'S_Xf6N2TDEjFy96WfnaRq';
  const [platform, setPlatform] = useState<PreviewPlatform>('web');

  const deviceUrl = useMemo(() => {
    return createRuntimeUrl({ sdkVersion: '54.0.0', snack: id });
  }, [id]);

  const webEmbedUrl = useMemo(() => buildEmbedUrl(id, 'web'), [id]);
  const iosEmbedUrl = useMemo(() => buildEmbedUrl(id, 'ios'), [id]);
  const androidEmbedUrl = useMemo(() => buildEmbedUrl(id, 'android'), [id]);

  const buttonsRef = useRef<HTMLDivElement>(null);
  const [iframeRight, setIframeRight] = useState(0);

  useEffect(() => {
    const update = () => {
      if (buttonsRef.current) {
        const rect = buttonsRef.current.getBoundingClientRect();
        setIframeRight(Math.round(window.innerWidth - rect.right) + 50);
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const hasDeviceTab = true;
  const isNativeTab = platform === 'android' || platform === 'ios';
  const showSideQR = isNativeTab && hasDeviceTab && deviceUrl;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <div className="flex-1 bg-white relative">
        {(platform === 'web' || platform === 'ios' || platform === 'android') && (
          <div className="relative h-[calc(100dvh-72px)] w-full overflow-hidden">
            <iframe
              key={platform}
              className="absolute border-0 bg-white"
              style={{ width: '300%', height: '100%', right: `${iframeRight}px` }}
              src={platform === 'web' ? webEmbedUrl : platform === 'ios' ? iosEmbedUrl : androidEmbedUrl}
              allow={IFRAME_ALLOW}
            />
          </div>
        )}

        {platform === 'device' && (
          <div className="flex h-[calc(100dvh-72px)] items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center gap-6 max-w-sm px-6 text-center">
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

        {/* Floating QR panel on native tabs */}
        {showSideQR && (
          <DeviceConnectionPanel
            url={deviceUrl}
            className="absolute right-6 top-1/2 -translate-y-1/2 hidden md:flex"
          />
        )}
      </div>

      {/* Platform switcher */}
      <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div ref={buttonsRef} className="mx-auto flex w-fit items-center overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
          {ALL_PLATFORM_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setPlatform(option.value)}
                className={cn(
                  'flex items-center gap-2 border-r border-slate-300 px-4 py-3 text-sm font-medium transition-colors last:border-r-0',
                  platform === option.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50'
                )}
              >
                <Icon className="h-4 w-4" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
