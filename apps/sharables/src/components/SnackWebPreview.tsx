'use client'

import { useEffect, useRef, useState } from 'react';
import type { SDKVersion } from 'snack-content';

import { cn } from '@/lib/utils';
import { BootScreen } from '@/components/BootScreen';
import {
  SNACK_CODE_CHANGES_DELAY,
  SNACK_DESCRIPTION,
  SNACK_NAME,
} from '@/lib/snack-preview';

type SnackFileRecord = Record<string, any>;
type SnackDependencyRecord = Record<string, any>;

interface SnackWebPreviewProps {
  sdkVersion?: SDKVersion;
  sessionId?: string;
  snackId?: string;
  accountSnackId?: string;
  channel?: string;
  runtimeUrl?: string;
  files?: SnackFileRecord;
  dependencies?: SnackDependencyRecord;
  name?: string;
  description?: string;
  className?: string;
  iframeClassName?: string;
  loadingLabel?: string;
  unavailableMessage?: string;
  showUnavailableError?: boolean;
  debug?: boolean;
}

function buildFileUpdates(currentFiles: SnackFileRecord = {}, nextFiles: SnackFileRecord = {}) {
  const updates: Record<string, any> = {};

  Object.entries(nextFiles).forEach(([path, file]) => {
    const currentFile = currentFiles[path];
    if (!currentFile || currentFile.type !== file?.type || currentFile.contents !== file?.contents) {
      updates[path] = file;
    }
  });

  Object.keys(currentFiles).forEach((path) => {
    if (!(path in nextFiles)) {
      updates[path] = null;
    }
  });

  return Object.keys(updates).length > 0 ? updates : null;
}

function buildDependencyUpdates(
  currentDependencies: SnackDependencyRecord = {},
  nextDependencies: SnackDependencyRecord = {}
) {
  const updates: Record<string, any> = {};

  Object.entries(nextDependencies).forEach(([name, dependency]) => {
    const currentDependency = currentDependencies[name];
    if (
      !currentDependency ||
      currentDependency.version !== dependency?.version ||
      currentDependency.handle !== dependency?.handle
    ) {
      updates[name] = dependency;
    }
  });

  Object.keys(currentDependencies).forEach((name) => {
    if (!(name in nextDependencies)) {
      updates[name] = null;
    }
  });

  return Object.keys(updates).length > 0 ? updates : null;
}

export function SnackWebPreview({
  sdkVersion,
  sessionId,
  snackId,
  accountSnackId,
  channel,
  runtimeUrl,
  files,
  dependencies,
  name = SNACK_NAME,
  description = SNACK_DESCRIPTION,
  className,
  iframeClassName,
  loadingLabel = 'Booting Expo...',
  unavailableMessage = 'This preview link is incomplete or expired.',
  showUnavailableError = false,
  debug = false,
}: SnackWebPreviewProps) {
  const webPreviewRef = useRef<Window | null>(null);
  const snackRef = useRef<any>(null);
  const [webPreviewURL, setWebPreviewURL] = useState<string | undefined>(undefined);
  const [stateUrl, setStateUrl] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  // True once the snack-sdk chunk has downloaded — used to keep the "slow load"
  // grace period from being mistaken for a broken link.
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    let isActive = true;
    let unsubscribe: (() => any) | undefined;

    const initializePreview = async () => {
      try {
        setError(null);
        setIsBooting(true);
        setSdkReady(false);
        setWebPreviewURL(undefined);

        const { Snack } = await import('snack-sdk');
        if (!isActive) return;
        setSdkReady(true);

        const snack = new Snack({
          sdkVersion,
          files: files ?? {},
          dependencies: dependencies ?? {},
          name,
          description,
          codeChangesDelay: SNACK_CODE_CHANGES_DELAY,
          verbose: false,
          webPreviewRef,
          webPlayerURL: `${window.location.origin}/api/web-player/%%SDK_VERSION%%`,
          online: true,
          id: sessionId,
          snackId,
          accountSnackId,
          channel,
        });

        snackRef.current = snack;
        const initialState = snack.getState();
        setStateUrl(initialState.url);
        const nextPreviewURL = runtimeUrl
          ? initialState.webPreviewURL?.replace(
              /initialUrl=[^&]+/,
              `initialUrl=${encodeURIComponent(runtimeUrl)}`
            )
          : initialState.webPreviewURL;
        setWebPreviewURL(nextPreviewURL);
        setIsBooting(!nextPreviewURL);

        unsubscribe = snack.addStateListener((state: any) => {
          if (!isActive) return;
          setStateUrl(state.url);
          const nextUrl = runtimeUrl
            ? state.webPreviewURL?.replace(
                /initialUrl=[^&]+/,
                `initialUrl=${encodeURIComponent(runtimeUrl)}`
              )
            : state.webPreviewURL;
          setWebPreviewURL(nextUrl);
          if (nextUrl) {
            setIsBooting(false);
          }
        });
      } catch (nextError) {
        if (!isActive) return;
        setError(
          nextError instanceof Error ? nextError.message : 'Failed to initialize the Snack preview.'
        );
        setIsBooting(false);
      }
    };

    initializePreview();

    return () => {
      isActive = false;
      unsubscribe?.();
      if (snackRef.current) {
        snackRef.current.setOnline(false);
        snackRef.current = null;
      }
    };
  }, [sdkVersion, sessionId, snackId, accountSnackId, channel, runtimeUrl, name, description]);

  useEffect(() => {
    const snack = snackRef.current;
    if (!snack || !files) return;

    const fileUpdates = buildFileUpdates(snack.getState().files, files);
    if (fileUpdates) {
      snack.updateFiles(fileUpdates);
    }
  }, [files]);

  useEffect(() => {
    const snack = snackRef.current;
    if (!snack || !dependencies) return;

    const dependencyUpdates = buildDependencyUpdates(snack.getState().dependencies, dependencies);
    if (dependencyUpdates) {
      snack.updateDependencies(dependencyUpdates);
    }
  }, [dependencies]);

  useEffect(() => {
    if (!showUnavailableError || error || webPreviewURL) return;

    // Don't mistake a slow load for a broken link. While the snack-sdk chunk is
    // still downloading, allow a long window (slow networks); once it's loaded
    // but the web player still hasn't returned a preview URL, the link is
    // likely expired/broken, so fail sooner.
    const delay = sdkReady ? 6000 : 20000;
    const timeout = window.setTimeout(() => {
      setError(unavailableMessage);
      setIsBooting(false);
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [error, showUnavailableError, unavailableMessage, webPreviewURL, sdkReady]);

  return (
    <div className={cn('relative h-full w-full', className)}>
      {error ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white">
          <p className="max-w-sm px-6 text-center text-sm font-medium text-slate-900">{error}</p>
          <p className="mt-2 px-6 text-center text-xs text-muted-foreground">
            Try reopening the preview from the main Expo Snack page.
          </p>
        </div>
      ) : isBooting ? (
        <BootScreen className="absolute inset-0 z-10" label={loadingLabel} />
      ) : null}

      <iframe
        ref={(iframe) => {
          webPreviewRef.current = iframe?.contentWindow ?? null;
        }}
        className={cn('h-full w-full border-0 bg-white', iframeClassName)}
        src={webPreviewURL || undefined}
        allow="geolocation; camera; microphone"
      />

      {debug ? (
        <div className="absolute bottom-3 left-3 right-3 z-20 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white/95 p-3 text-[11px] text-slate-700 shadow-lg backdrop-blur">
          <div className="font-semibold text-slate-900">Snack preview debug</div>
          <div className="mt-2 space-y-2">
            <div>
              <div className="font-medium text-slate-900">state.url</div>
              <div className="break-all text-slate-600">{stateUrl || 'none'}</div>
            </div>
            <div>
              <div className="font-medium text-slate-900">webPreviewURL</div>
              <div className="break-all text-slate-600">{webPreviewURL || 'none'}</div>
            </div>
            <div>
              <div className="font-medium text-slate-900">error</div>
              <div className="break-all text-slate-600">{error || 'none'}</div>
            </div>
            <div>
              <div className="font-medium text-slate-900">sdkVersion</div>
              <div className="break-all text-slate-600">{sdkVersion || 'none'}</div>
            </div>
            <div>
              <div className="font-medium text-slate-900">sessionId</div>
              <div className="break-all text-slate-600">{sessionId || 'none'}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
