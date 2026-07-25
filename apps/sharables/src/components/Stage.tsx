'use client'

import { useEffect, useState } from 'react';
import {
    Smartphone,
    Monitor,
    Code2,
    ExternalLink,
    X,
    Download,
    Box,
    Layout,
    Loader2,
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FileTree } from '@/components/FileTree';
import { BootScreen } from '@/components/BootScreen';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

import { DependencyPanel } from '@/components/DependencyPanel';
import { DeviceConnectionPanel } from '@/components/DeviceConnectionPanel';
import { AndroidIcon, AppleIcon, WebIcon } from '@/components/PlatformIcons';
import { buildAppetizeUrl, APPETIZE_IFRAME_ALLOW } from '@/lib/appetize';
import { canUseAppetize } from '@/lib/preview-capabilities';

type StageMode = 'web' | 'app' | 'code';

interface StageProps {
    files: Record<string, any>;
    selectedFile: string;
    onSelectFile: (path: string) => void;
    onUpdateFile: (path: string, content: string) => void;
    onDeleteFile: (path: string) => void;
    webPreviewURL: string | null;
    isClientReady: boolean;
    connectedClients: Record<string, any>;
    url: string | null;
    sdkVersion?: string;
    dependencies: Record<string, { version: string; handle?: string; }>;
    missingDependencies?: Record<string, { dependents: string[]; wantedVersion: string; }>;
    onAddDependency?: (name: string, version: string) => void;
    onRemoveDependency?: (name: string) => void;
    onExportProject?: () => Promise<void> | void;
    isExporting?: boolean;
    webPreviewRef: React.MutableRefObject<Window | null>;
    mode: StageMode;
    onModeChange: (mode: StageMode) => void;
    appPlatform?: 'ios' | 'android';
    isMobile: boolean;
}

const BACKGROUND_PATTERN = "data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000000' font-family='monospace' font-weight='bold'%3E%3Ctext x='10' y='15' font-size='10'%3E+%3C/text%3E%3Ctext x='30' y='15' font-size='8'%3E%E2%97%8B%3C/text%3E%3Ctext x='10' y='35' font-size='8'%3E%E2%97%8B%3C/text%3E%3Ctext x='30' y='35' font-size='10'%3E%E2%9C%A6%3C/text%3E%3C/g%3E%3C/svg%3E";

export function Stage({
    files,
    selectedFile,
    onSelectFile,
    onUpdateFile,
    onDeleteFile,
    webPreviewURL,
    isClientReady,
    connectedClients,
    url,
    sdkVersion,
    dependencies,
    missingDependencies,
    onAddDependency,
    onRemoveDependency,
    onExportProject,
    isExporting = false,
    webPreviewRef,
    mode,
    onModeChange,
    appPlatform,
    isMobile,
}: StageProps) {
    const [showDeps, setShowDeps] = useState(false);
    const [showMobileFileTree, setShowMobileFileTree] = useState(false);
    // Same-device Expo Go deep link. The runtime prefers the live channel over
    // the saved snack when a URL carries both — and once Expo Go foregrounds,
    // this tab is frozen and the channel goes silent, hanging the load. Strip
    // the channel so Expo Go fetches the saved snapshot read-only from Expo's
    // servers. Null until the background save has stamped snack=<id> into the
    // URL (SnackPage keeps the snack saved while the mobile preview is open).
    const savedDeviceUrl = (() => {
        if (!url) return null;
        try {
            const parsed = new URL(url.replace(/^[a-z]+:/i, 'http:'));
            if (!parsed.searchParams.has('snack')) return null;
            parsed.searchParams.delete('snack-channel');
            return `${url.split('?')[0]}?${parsed.searchParams.toString()}`;
        } catch {
            return null;
        }
    })();
    const [webSubMode, setWebSubMode] = useState<'phone' | 'desktop'>('phone');
    const [appSubMode, setAppSubMode] = useState<'ios' | 'android'>('ios');
    // Hydration-safe: SSR returns env default (typically false), client may
    // upgrade to true via NEXT_PUBLIC_SHOW_APPETIZE or ?appetize=1.
    const [appetizeEnabled, setAppetizeEnabled] = useState(false);
    useEffect(() => { setAppetizeEnabled(canUseAppetize()); }, []);
    // If Appetize is disabled but mode somehow lands on 'app' (deep link,
    // stale state), bounce back to web so the UI stays consistent.
    useEffect(() => {
        if (!appetizeEnabled && mode === 'app') onModeChange('web');
    }, [appetizeEnabled, mode, onModeChange]);
    const activeMode = isMobile ? (mode === 'code' ? 'code' : mode) : mode;
    const activeAppPlatform = isMobile && appPlatform ? appPlatform : appSubMode;
    const isWebPreview = activeMode === 'web';
    const isPhonePreview = isWebPreview && (isMobile || webSubMode === 'phone');
    const isDesktopPreview = isWebPreview && !isMobile && webSubMode === 'desktop';
    const isNativePreview = appetizeEnabled && activeMode === 'app';
    const appetizeUrl = isNativePreview ? buildAppetizeUrl(url, sdkVersion, activeAppPlatform) : null;
    const qrConnectedClientsCount = Object.values(connectedClients || {}).filter(
        (client: any) => client?.transport !== 'webplayer'
    ).length;

    return (
        <div className="flex flex-col h-full bg-slate-100 relative overflow-hidden">
            {/* Shared Background Pattern & Animation */}
            <div
                className="absolute inset-0 opacity-[0.03] pointer-events-none transition-[mask-image] duration-500 ease-in-out"
                style={{
                    backgroundImage: `url("${BACKGROUND_PATTERN}")`,
                    maskImage: activeMode !== 'code'
                        ? 'radial-gradient(circle at center, black 25%, transparent 80%)'
                        : 'radial-gradient(circle at center, black 50%, transparent 100%)',
                    WebkitMaskImage: activeMode !== 'code'
                        ? 'radial-gradient(circle at center, black 25%, transparent 80%)'
                        : 'radial-gradient(circle at center, black 50%, transparent 100%)'
                }}
            />
            <div className="absolute inset-0 pointer-events-none transition-[mask-image] duration-500 ease-in-out" style={{
                maskImage: activeMode !== 'code'
                    ? 'radial-gradient(circle at center, black 25%, transparent 80%)'
                    : 'radial-gradient(circle at center, black 50%, transparent 100%)',
                WebkitMaskImage: activeMode !== 'code'
                    ? 'radial-gradient(circle at center, black 25%, transparent 80%)'
                    : 'radial-gradient(circle at center, black 50%, transparent 100%)'
            }}>
                <div
                    className="absolute inset-0"
                    style={{
                        maskImage: `url("${BACKGROUND_PATTERN}")`,
                        WebkitMaskImage: `url("${BACKGROUND_PATTERN}")`,
                    }}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-500 via-amber-500 to-pink-500 opacity-40 blur-3xl animate-roam" />
                </div>
            </div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent pointer-events-none" />


            {/* Main Toggle - Hidden on Mobile.
                With Appetize: Web | App | Code (sub-modes selected separately).
                Without Appetize: Phone | Desktop | Code (pre-Appetize UI). */}
            <div className="hidden md:flex absolute top-[36px] left-1/2 -translate-x-1/2 z-50 items-center p-1 bg-muted/80 backdrop-blur-md rounded-full border shadow-sm">
                {appetizeEnabled ? (
                    <>
                        <button
                            onClick={() => onModeChange('web')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer",
                                mode === 'web'
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <WebIcon className="h-4 w-4" />
                            Web
                        </button>
                        <button
                            onClick={() => onModeChange('app')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer",
                                mode === 'app'
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Smartphone className="h-4 w-4" />
                            App
                        </button>
                        <button
                            onClick={() => onModeChange('code')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer",
                                mode === 'code'
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Code2 className="h-4 w-4" />
                            Code
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            onClick={() => { onModeChange('web'); setWebSubMode('phone'); }}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer",
                                mode === 'web' && webSubMode === 'phone'
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Smartphone className="h-4 w-4" />
                            Phone
                        </button>
                        <button
                            onClick={() => { onModeChange('web'); setWebSubMode('desktop'); }}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer",
                                mode === 'web' && webSubMode === 'desktop'
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Monitor className="h-4 w-4" />
                            Desktop
                        </button>
                        <button
                            onClick={() => onModeChange('code')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer",
                                mode === 'code'
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Code2 className="h-4 w-4" />
                            Code
                        </button>
                    </>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 relative z-10">

                {/* Preview Mode */}
                <div
                    className={cn(
                        "absolute inset-0 transition-all duration-500 ease-in-out flex flex-col",
                        activeMode !== 'code'
                            ? "opacity-100 translate-y-0 pointer-events-auto"
                            : "opacity-0 translate-y-4 pointer-events-none"
                    )}
                >
                    {/* Sub-mode Selector - top-left, aligned with main toggle.
                        Only shown when Appetize is enabled — without it, the main
                        toggle already exposes phone vs desktop directly. */}
                    <div className={cn(
                        "hidden md:flex absolute top-[36px] left-6 z-50 items-center p-1 bg-muted/80 backdrop-blur-md rounded-full border shadow-sm",
                        !appetizeEnabled && "md:hidden"
                    )}>
                        {mode === 'web' && (
                            <>
                                <button
                                    onClick={() => setWebSubMode('phone')}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer",
                                        webSubMode === 'phone'
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Smartphone className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => setWebSubMode('desktop')}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer",
                                        webSubMode === 'desktop'
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Monitor className="h-4 w-4" />
                                </button>
                            </>
                        )}
                        {mode === 'app' && (
                            <>
                                <button
                                    onClick={() => setAppSubMode('ios')}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer",
                                        appSubMode === 'ios'
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <AppleIcon className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => setAppSubMode('android')}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer",
                                        appSubMode === 'android'
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <AndroidIcon className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </div>

                    <div className={cn(
                        "flex-1 relative overflow-hidden min-h-0",
                        isPhonePreview || isNativePreview
                            ? "flex items-center justify-center p-4 md:px-6 md:pb-6 md:pt-23"
                            : "p-2 md:pt-28 md:pb-8 md:px-8 flex items-center justify-center",
                        isMobile ? "pb-26" : ""
                    )}>
                        <div
                            className={cn(
                                "relative group flex h-full w-full flex-col items-center transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                isPhonePreview || isNativePreview
                                    ? "md:h-[95%] md:w-[370px]"
                                    : "md:w-[min(72vw,1100px)] max-w-6xl",
                                isPhonePreview && !isNativePreview ? "animate-float" : ""
                            )}
                        >
                            {/* Native preview (Appetize renders its own device frame) */}
                            {isNativePreview && (
                                <div className="h-full w-full overflow-hidden">
                                    {appetizeUrl ? (
                                        <iframe
                                            key={`${activeAppPlatform}:${appetizeUrl}`}
                                            className="h-full w-full border-0 bg-transparent"
                                            src={appetizeUrl}
                                            allow={APPETIZE_IFRAME_ALLOW}
                                        />
                                    ) : (
                                        <div className="flex h-full w-full flex-col items-center justify-center bg-white">
                                            <p className="text-sm font-medium text-slate-900">Preview unavailable</p>
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                {!url ? 'Waiting for Snack to connect...' : `Not available for SDK ${sdkVersion ?? 'unknown'}`}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Web preview (our own phone/desktop frame) */}
                            {!isNativePreview && (
                            <div
                                className={cn(
                                    "relative overflow-hidden shrink-0 z-10 transition-[width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                    isPhonePreview
                                        ? "h-full w-full rounded-[32px] md:rounded-[44px] bg-slate-400 p-[5px] shadow-[0_36px_90px_-28px_rgba(15,23,42,0.38),0_0_120px_-40px_rgba(99,102,241,0.35)]"
                                        : "w-full h-full bg-background/95 backdrop-blur-xl rounded-xl md:rounded-2xl shadow-[0_32px_96px_-28px_rgba(15,23,42,0.4),0_0_120px_-22px_rgba(99,102,241,0.38)] flex flex-col"
                                )}
                            >
                                <div className={cn(
                                    "pointer-events-none absolute inset-0",
                                    isPhonePreview
                                        ? "rounded-[32px] md:rounded-[44px] ring-[1px] ring-slate-700/25 opacity-100"
                                        : "rounded-xl md:rounded-2xl opacity-0"
                                )} />
                                <div className={cn(
                                    "pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/10 to-transparent z-10",
                                    isPhonePreview ? "opacity-100" : "opacity-0"
                                )} />

                                <div className={cn("overflow-hidden", isDesktopPreview ? "block" : "hidden")}>
                                    <div className="flex items-center px-4 py-3 border-b border-border/40 bg-background/60 backdrop-blur-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                                            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                                        </div>
                                    </div>
                                </div>

                                <div
                                    className={cn(
                                        "relative transition-[width,height,border-radius] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                        isPhonePreview
                                            ? "h-full rounded-[27px] md:rounded-[39px] bg-slate-950 p-[4px]"
                                            : "flex-1 bg-white"
                                    )}
                                >
                                    {!isClientReady && (
                                        <BootScreen className="absolute inset-0 z-10" />
                                    )}

                                    <iframe
                                        className={cn(
                                            "h-full w-full bg-white border-0 transition-[border-radius] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                            isPhonePreview ? "rounded-[23px] md:rounded-[35px]" : ""
                                        )}
                                        ref={(c) => {
                                            webPreviewRef.current = c?.contentWindow ?? null;
                                        }}
                                        src={isClientReady ? webPreviewURL || undefined : undefined}
                                        allow="geolocation; camera; microphone"
                                    />
                                </div>
                            </div>
                            )}

                            {isMobile && isPhonePreview && (
                                <button
                                    type="button"
                                    disabled={!savedDeviceUrl || !isClientReady}
                                    onClick={() => {
                                        // Must navigate synchronously inside the tap:
                                        // Android only launches external apps while the
                                        // user gesture is still active (no awaits here).
                                        if (!savedDeviceUrl || typeof window === 'undefined') return;
                                        window.location.href = savedDeviceUrl;
                                    }}
                                    className={cn(
                                        "mt-4 mb-3 inline-flex items-center justify-center gap-1.5 text-[11px] transition-colors",
                                        savedDeviceUrl && isClientReady ? "cursor-pointer text-foreground/65 hover:text-foreground" : "cursor-default text-foreground/50"
                                    )}
                                >
                                    <span className="font-medium text-foreground">{savedDeviceUrl && isClientReady ? 'Run as a native app on your phone' : 'Preparing native preview...'}</span>
                                    {savedDeviceUrl && isClientReady && <ExternalLink className="h-3.5 w-3.5 text-foreground/70" />}
                                </button>
                            )}
                        </div>

                        {(isPhonePreview || isNativePreview) && (
                            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-[80%] h-12 bg-orange-500/20 blur-3xl rounded-[100%] pointer-events-none opacity-50 animate-pulse" />
                        )}

                        {/* Floating Connection Info — desktop only (in the
                            single-column layout the Device is its own tab).
                            Gated on isMobile so it follows the same 1024 (lg)
                            breakpoint as the layout switch, not md (768). */}
                        <DeviceConnectionPanel
                            url={url}
                            connectedClientsCount={qrConnectedClientsCount}
                            className={cn(
                                "absolute right-6 top-1/2 -translate-y-1/2 animate-in slide-in-from-right-8 duration-700",
                                !isMobile && (isPhonePreview || isNativePreview) ? "flex" : "hidden"
                            )}
                        />
                    </div>
                </div>

                {/* Code Mode - Desktop Window Style */}
                <div
                    className={cn(
                        "absolute inset-0 transition-all duration-500 ease-in-out p-2 md:pt-28 md:pb-8 md:px-8 flex items-center justify-center",
                        mode === 'code'
                            ? "opacity-100 translate-y-0 pointer-events-auto"
                            : "opacity-0 translate-y-4 pointer-events-none",
                        isMobile ? "pb-24" : ""
                    )}
                >
                    <div className="w-full h-full max-w-6xl bg-background/95 backdrop-blur-xl rounded-xl md:rounded-2xl shadow-[0_0_110px_-20px_rgba(99,102,241,0.4)] overflow-hidden flex flex-col ring-1 ring-white/20">
                        <div className="w-full h-full max-w-6xl bg-background/95 backdrop-blur-xl rounded-xl md:rounded-2xl shadow-[0_0_110px_-20px_rgba(99,102,241,0.4)] overflow-hidden flex flex-col ring-1 ring-white/20">
                            {/* Desktop Layout: Resizable Panels */}
                            {!isMobile && (
                                <ResizablePanelGroup direction="horizontal">
                                    <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="border-r border-border/50 bg-muted/30">
                                        <FileTree
                                            files={files}
                                            selectedFile={selectedFile}
                                            onSelectFile={onSelectFile}
                                            onDeleteFile={onDeleteFile}
                                        />
                                    </ResizablePanel>

                                    <ResizableHandle />

                                    <ResizablePanel defaultSize={80}>
                                        <div className="flex flex-col h-full bg-background/50 relative">
                                            <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-background/50 backdrop-blur-sm">
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <Code2 className="h-4 w-4" />
                                                    <span className="font-medium text-foreground">{selectedFile}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setShowDeps(!showDeps)}
                                                        className={cn(
                                                            "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
                                                            showDeps
                                                                ? "bg-blue-500/10 text-blue-600"
                                                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                                        )}
                                                    >
                                                        <Box className="h-3.5 w-3.5" />
                                                        Dependencies
                                                    </button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                        title="Export project as zip"
                                                        disabled={isExporting}
                                                        onClick={() => void onExportProject?.()}
                                                    >
                                                        {isExporting
                                                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            : <Download className="h-3.5 w-3.5" />}
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="flex-1 overflow-hidden relative">
                                                <CodeMirror
                                                    value={files[selectedFile]?.contents as string || ''}
                                                    height="100%"
                                                    extensions={[javascript({ jsx: true, typescript: selectedFile.endsWith('.tsx') || selectedFile.endsWith('.ts') })]}
                                                    onChange={(value) => onUpdateFile(selectedFile, value)}
                                                    className="h-full text-sm"
                                                />

                                                {/* Dependencies Overlay */}
                                                <div
                                                    className={cn(
                                                        "absolute inset-0 bg-background transition-all duration-300 ease-in-out z-10",
                                                        showDeps
                                                            ? "opacity-100 translate-y-0 pointer-events-auto"
                                                            : "opacity-0 translate-y-4 pointer-events-none"
                                                    )}
                                                >
                                                    <DependencyPanel
                                                        dependencies={dependencies}
                                                        missingDependencies={missingDependencies}
                                                        onAddDependency={onAddDependency}
                                                        onRemoveDependency={onRemoveDependency}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </ResizablePanel>
                                </ResizablePanelGroup>
                            )}

                            {/* Mobile Layout: Editor Only + File Tree Overlay */}
                            {isMobile && (
                                <div className="flex flex-col h-full bg-background/50 relative">
                                    <div className="relative flex items-center justify-between px-4 py-2 border-b border-border/40 bg-background/50 backdrop-blur-sm">
                                        {/* Left: Files Button */}
                                        <div className="flex items-center z-10">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 -ml-2 text-muted-foreground hover:text-foreground gap-2"
                                                onClick={() => setShowMobileFileTree(true)}
                                            >
                                                <Layout className="h-4 w-4" />
                                                <span className="text-xs font-medium">Files</span>
                                            </Button>
                                        </div>

                                        {/* Center: File Title */}
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/50 px-2 rounded-md backdrop-blur-sm">
                                                <Code2 className="h-4 w-4" />
                                                <span className="font-medium text-foreground">{selectedFile}</span>
                                            </div>
                                        </div>

                                        {/* Right: Dependencies Button */}
                                        <div className="flex items-center gap-2 z-10">
                                            <button
                                                onClick={() => setShowDeps(!showDeps)}
                                                className={cn(
                                                    "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
                                                    showDeps
                                                        ? "bg-blue-500/10 text-blue-600"
                                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                                )}
                                            >
                                                <Box className="h-3.5 w-3.5" />
                                                <span className="hidden sm:inline">Dependencies</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-hidden relative">
                                        <CodeMirror
                                            value={files[selectedFile]?.contents as string || ''}
                                            height="100%"
                                            extensions={[javascript({ jsx: true, typescript: selectedFile.endsWith('.tsx') || selectedFile.endsWith('.ts') })]}
                                            onChange={(value) => onUpdateFile(selectedFile, value)}
                                            className="h-full text-sm"
                                        />

                                        {/* Mobile File Tree Overlay */}
                                        <div
                                            className={cn(
                                                "absolute inset-0 bg-background/95 backdrop-blur-xl z-20 transition-all duration-300 ease-in-out flex flex-col",
                                                showMobileFileTree
                                                    ? "opacity-100 translate-x-0 pointer-events-auto"
                                                    : "opacity-0 -translate-x-4 pointer-events-none"
                                            )}
                                        >
                                            <div className="flex items-center justify-between p-4 border-b">
                                                <h3 className="font-semibold">Files</h3>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setShowMobileFileTree(false)}
                                                >
                                                    Close
                                                </Button>
                                            </div>
                                            <div className="flex-1 overflow-auto p-4">
                                                <FileTree
                                                    files={files}
                                                    selectedFile={selectedFile}
                                                    onSelectFile={(file) => {
                                                        onSelectFile(file);
                                                        setShowMobileFileTree(false);
                                                    }}
                                                    onDeleteFile={onDeleteFile}
                                                />
                                            </div>
                                        </div>

                                        {/* Dependencies Overlay */}
                                        <div
                                            className={cn(
                                                "absolute inset-0 bg-background transition-all duration-300 ease-in-out z-10",
                                                showDeps
                                                    ? "opacity-100 translate-y-0 pointer-events-auto"
                                                    : "opacity-0 translate-y-4 pointer-events-none"
                                            )}
                                        >
                                            <DependencyPanel
                                                dependencies={dependencies}
                                                missingDependencies={missingDependencies}
                                                onAddDependency={onAddDependency}
                                                onRemoveDependency={onRemoveDependency}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
