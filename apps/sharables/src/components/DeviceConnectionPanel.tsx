'use client'

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, ListChecks, Loader2, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface DeviceConnectionPanelProps {
    url: string | null;
    connectedClientsCount?: number;
    className?: string;
}

function InstructionsModal({ onClose }: { onClose: () => void }) {
    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md rounded-3xl border border-white/10 bg-background/95 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <h3 className="text-lg font-semibold text-foreground">Run on your phone as a native app</h3>
                        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                            Use Expo Go to open this live preview on your device.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-5">
                    <div className="space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                1
                            </div>
                            <div className="space-y-3">
                                <p className="text-sm font-medium text-foreground">Install Expo Go on your phone.</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <a
                                        href="https://apps.apple.com/app/expo-go/id982107779"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors"
                                    >
                                        App Store
                                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                    </a>
                                    <a
                                        href="https://play.google.com/store/apps/details?id=host.exp.exponent"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors"
                                    >
                                        Google Play
                                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                    </a>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                2
                            </div>
                            <p className="pt-0.5 text-sm font-medium text-foreground">
                                Scan the QR code with your camera or with the Expo Go scanner.
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                3
                            </div>
                            <p className="pt-0.5 text-sm font-medium text-foreground">
                                Keep this page open while the app loads on your phone.
                            </p>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border/50 bg-muted/30 px-4 py-3">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            The QR code opens the current live Snack preview in Expo Go.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function DeviceConnectionPanel({
    url,
    connectedClientsCount = 0,
    className,
}: DeviceConnectionPanelProps) {
    const [showInstructions, setShowInstructions] = useState(false);

    return (
        <>
            {showInstructions && typeof document !== 'undefined' && createPortal(
                <InstructionsModal onClose={() => setShowInstructions(false)} />,
                document.body
            )}
            <div className={cn("flex-col gap-3 p-4 bg-background/60 backdrop-blur-md border shadow-xl rounded-2xl max-w-[208px]", className)}>
                <div className="flex flex-col items-center gap-2.5 text-center">
                    <div className="bg-white p-2 rounded-xl border shadow-sm">
                        {url ? (
                            <QRCodeSVG value={url} size={100} />
                        ) : (
                            <div className="w-[100px] h-[100px] bg-muted animate-pulse rounded-lg flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <h3 className="text-[15px] font-semibold leading-[1.25]">Run on your phone <br />as a native app</h3>
                        <p className="text-xs leading-5 text-muted-foreground">Scan with your camera or Expo Go to open it.</p>
                    </div>
                </div>

                <div className="my-0.5 h-px w-full bg-border/50" />

                <div className="flex flex-col gap-2.5">
                    <div
                        className={cn(
                            "flex items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                            connectedClientsCount > 0
                                ? "bg-green-500/10 text-green-600"
                                : "bg-muted text-muted-foreground"
                        )}
                    >
                        <span
                            className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                connectedClientsCount > 0 ? "bg-green-500" : "bg-muted-foreground/60"
                            )}
                        />
                        {connectedClientsCount > 0 ? `${connectedClientsCount} connected` : 'No phone connected'}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-8 gap-2 bg-background/50 hover:bg-background"
                        onClick={() => setShowInstructions((value) => !value)}
                    >
                        <ListChecks className="h-3.5 w-3.5" />
                        Instructions
                    </Button>
                </div>
            </div>
        </>
    );
}
