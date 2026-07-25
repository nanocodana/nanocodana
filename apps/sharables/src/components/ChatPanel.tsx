'use client'

import { useState, useRef, useEffect, useMemo, memo, lazy, Suspense } from 'react';
import NextImage from 'next/image';
import { createPortal } from 'react-dom';
import { Chat, useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import {
  Send,
  Bot,
  User,
  Sparkles,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Shield,
  Image,
  CloudSun,
  ListTodo,
  Calculator,
  ChevronDown,
  Plus,
  Clock,
  LayoutGrid,
  Check,
  X,
  Rocket,
  Download,
  Trash2,
  Share2,
  Copy,
  Link,
  Smartphone,
  Monitor,
  Coins,
  Code2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  aggregateSessionUsage,
  formatTokens,
  hasUsage,
  type SessionUsage,
} from '@/lib/usage';
import { canUseAppetize } from '@/lib/preview-capabilities';
import { Button } from '@/components/ui/button';
import { AndroidIcon, AppleIcon, WebIcon } from '@/components/PlatformIcons';
import { ProviderIcon } from '@/components/ProviderIcon';

// Code-split the markdown stack (streamdown + its unified pipeline) out of the
// initial bundle — it's only needed once an assistant reply exists. While the
// chunk loads, the Suspense fallback shows the same plain text the chat
// rendered before markdown support.
const MarkdownMessage = lazy(() =>
  import('@/components/MarkdownMessage').then((m) => ({ default: m.MarkdownMessage })),
);

export interface Project {
  id: string;
  name: string;
  lastEdited: string;
  icon?: any;
}

/**
 * An actionable banner above the composer: `text` is the prompt sent to the
 * AI when the action button is clicked; `preview` is shown in the banner.
 * One shared shape for the app (SnackPage publishes, ChatPanel renders).
 */
export type ComposerSuggestion = {
  id: string;
  text: string;
  preview?: string;
  /** Banner heading. Defaults to the error heading. */
  title?: string;
  /** Action button label. Defaults to "Fix it". */
  action?: string;
  /** Visual tone: 'error' (red, default) or 'info' (orange). */
  tone?: 'error' | 'info';
};

export interface ChatPanelMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  position: number;
}

interface ChatPanelTool {
  id: string;
  toolCallId?: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  errorText?: string;
  state:
    | 'input-streaming'
    | 'input-available'
    | 'approval-requested'
    | 'approval-responded'
    | 'output-available'
    | 'output-error'
    | 'output-denied';
  approvalId?: string;
  approved?: boolean;
  reason?: string;
  position: number;
}

type ChatPanelItem =
  | ({
      kind: 'message';
    } & ChatPanelMessage)
  | ({
      kind: 'tool';
    } & ChatPanelTool);

interface ChatPanelProps {
  chat: Chat<any> | null;
  systemMessages: ChatPanelMessage[];
  /** Data-URI previews for generated images, keyed by tool-call id. */
  generatedImages?: Record<string, string>;
  onMessagesChange?: (messages: UIMessage[]) => void;
  composerSuggestion?: ComposerSuggestion | null;
  currentProvider?: string;
  currentModel?: string;
  onModelSelect?: () => void;
  onRequireModel?: () => void;
  isMobile?: boolean;
  projects?: Project[];
  currentProjectId?: string;
  onSelectProject?: (projectId: string) => void;
  onCreateProject?: () => void;
  onDeleteProject?: (projectId: string) => void;
  onExportProject?: () => Promise<void> | void;
  isExportingProject?: boolean;
  onShare?: (platforms: string[], mode?: 'preview' | 'code', includeCode?: boolean) => Promise<string | null>;
  isSharing?: boolean;
  /** Pre-fills the composer once on mount (e.g. the marketing site's ?prompt= handoff). */
  initialComposerText?: string;
  /** Called once after the initial composer text is consumed so the source can
   *  be cleared and later ChatPanel remounts don't resurrect the stale prompt. */
  onInitialComposerConsumed?: () => void;
}

const EXAMPLE_PROMPTS = [
  { icon: ListTodo, label: "Todo App", prompt: "Create a todo list app with add, edit, and delete features" },
  { icon: Calculator, label: "Counter", prompt: "Build a counter app with increment, decrement and reset" },
  { icon: CloudSun, label: "Weather", prompt: "Make a weather app that fetches data for a specific city" },
  { icon: Image, label: "Gallery", prompt: "Create a photo gallery grid using FlatList with mock images" }
];

// Playful "the agent is working" lines, rotated so the wait never feels stale.
const THINKING_MESSAGES = [
  'Going bananas...',
  'Cooking...',
  'Peeling it open...',
  'Wiring it up...',
  'Snapping it together...',
  'Manifesting your app...',
];

/** One random thinking line per turn: the processing block unmounts between
 *  turns, so each turn gets a fresh line, but it stays put while one streams. */
function ThinkingMessage() {
  const [message] = useState(
    () => THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)],
  );
  return <span className="text-muted-foreground font-medium">{message}</span>;
}

function buildDisplayItems(
  chatMessages: UIMessage[],
  systemMessages: ChatPanelMessage[],
  error?: Error,
): ChatPanelItem[] {
  const aiItems: ChatPanelItem[] = chatMessages.flatMap((message, messageIndex) => {
    if (message.role !== 'user' && message.role !== 'assistant') {
      return [];
    }

    if (message.role === 'user') {
      const content = message.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');

      if (!content.trim()) {
        return [];
      }

      return [{
        kind: 'message' as const,
        id: message.id,
        role: 'user' as const,
        content,
        position: messageIndex,
      }];
    }

    return message.parts.flatMap<ChatPanelItem>((part, partIndex) => {
      const position = messageIndex + (partIndex + 1) / 100;

      if (part.type === 'text') {
        if (!part.text.trim()) {
          return [];
        }

        return [{
          kind: 'message' as const,
          id: `${message.id}-text-${partIndex}`,
          role: 'assistant' as const,
          content: part.text,
          position,
        }];
      }

      if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
        const toolPart = part as any;
        const toolName =
          part.type === 'dynamic-tool'
            ? (toolPart.toolName as string)
            : part.type.replace(/^tool-/, '');

        return [{
          kind: 'tool' as const,
          id: `${message.id}-tool-${toolPart.toolCallId ?? partIndex}`,
          toolCallId: toolPart.toolCallId,
          toolName,
          input: toolPart.input,
          output: toolPart.output,
          errorText: toolPart.errorText,
          state: toolPart.state,
          approvalId: toolPart.approval?.id,
          approved: toolPart.approval?.approved,
          reason: toolPart.approval?.reason,
          position,
        }];
      }

      return [];
    });
  });

  const systemItems: ChatPanelItem[] = systemMessages.map((message) => ({
    kind: 'message',
    ...message,
  }));

  const errorItems: ChatPanelItem[] = error
      ? [{
        kind: 'message' as const,
        id: `error-${error.message}`,
        role: 'system',
        content: `Error: ${error.message}`,
        position: chatMessages.length + systemMessages.length + 1,
      }]
    : [];

  return [...aiItems, ...systemItems, ...errorItems].sort(
    (left, right) => left.position - right.position,
  );
}

interface ChatPanelLayoutProps {
  items: ChatPanelItem[];
  isProcessing: boolean;
  generatedImages?: Record<string, string>;
  composerSuggestion?: ComposerSuggestion | null;
  currentProvider?: string;
  currentModel?: string;
  onModelSelect?: () => void;
  onSubmitMessage: (message: string) => void;
  onApprovalResponse?: (approvalId: string, approved: boolean) => void;
  isMobile?: boolean;
  projects?: Project[];
  currentProjectId?: string;
  onSelectProject?: (projectId: string) => void;
  onCreateProject?: () => void;
  onDeleteProject?: (projectId: string) => void;
  onExportProject?: () => Promise<void> | void;
  isExportingProject?: boolean;
  onShare?: (platforms: string[], mode?: 'preview' | 'code', includeCode?: boolean) => Promise<string | null>;
  isSharing?: boolean;
  /** Cumulative token/cost totals for this project's chat (from message metadata). */
  sessionUsage?: SessionUsage;
  // Composer text is owned by the stable ChatPanel parent (see its comment) and
  // passed down, so it survives the remount when `chat` goes null↔set.
  input: string;
  setInput: (value: string) => void;
}

/**
 * Cumulative token readout for the project's chat. BYOK users pay for every
 * token out of their own key, so usage stays visible instead of silent —
 * tokens only, no dollar estimates, so nothing here goes stale when providers
 * change prices. The cached share makes the engine's automatic prompt caching
 * visible (it should climb toward ~90% on Anthropic models as a session grows).
 */
const UsageMeter = memo(function UsageMeter({ usage }: { usage: SessionUsage }) {
  // Gate on the ROUNDED percent, not the raw ratio, so a sub-0.5% share
  // doesn't render a nonsensical "0% cached" badge.
  const cachedPercent =
    usage.input > 0 ? Math.round((usage.cacheRead / usage.input) * 100) : 0;
  const tooltip = [
    `Input: ${usage.input.toLocaleString()} tokens`,
    `  cached reads: ${usage.cacheRead.toLocaleString()}`,
    `  cache writes: ${usage.cacheWrite.toLocaleString()}`,
    `Output: ${usage.output.toLocaleString()} tokens`,
  ].join('\n');

  return (
    <div
      title={tooltip}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 backdrop-blur-md rounded-full border border-border/50 shadow-sm text-[11px] font-medium text-muted-foreground whitespace-nowrap cursor-default"
    >
      <Coins className="h-3 w-3 text-orange-500" />
      <span>
        {formatTokens(usage.input)} in · {formatTokens(usage.output)} out
      </span>
      {cachedPercent >= 1 && (
        <span className="text-emerald-600">{cachedPercent}% cached</span>
      )}
    </div>
  );
});

function ChatPanelLayout({
  items,
  isProcessing,
  generatedImages,
  composerSuggestion,
  currentProvider,
  currentModel,
  onModelSelect,
  onSubmitMessage,
  onApprovalResponse,
  isMobile,
  projects = [],
  currentProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onExportProject,
  isExportingProject = false,
  onShare,
  isSharing = false,
  sessionUsage,
  input,
  setInput,
}: ChatPanelLayoutProps) {
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [deployStep, setDeployStep] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  // All keys default-true; the modal renders a flag-aware *subset* of these.
  // iOS/Android are intentionally hidden from the modal for now (per design)
  // but their keys are kept so the rest of the pipeline keeps working if a
  // URL or future build re-enables them. canUseAppetize() drives the subset.
  const [sharePlatforms, setSharePlatforms] = useState<Record<string, boolean>>({
    web: true,
    android: true,
    ios: true,
    device: true,
    phone: true,
    desktop: true,
  });
  // Which share button is in flight, so only that one shows the spinner.
  const [pendingShareMode, setPendingShareMode] = useState<'preview' | 'code' | null>(null);
  // Master switch (default OFF): whether the share invites remixing at all.
  // OFF → preview is view-only and the editable-code link is disabled.
  // ON  → preview carries a Remix button and the editable-code link opens.
  const [shareCode, setShareCode] = useState(false);
  // Hydration-safe flag read — see lib/preview-capabilities.ts.
  const [appetizeEnabled, setAppetizeEnabled] = useState(false);
  useEffect(() => { setAppetizeEnabled(canUseAppetize()); }, []);
  // Every time the share modal opens, reset all checkboxes to selected.
  // Without this, an earlier uncheck would persist into the next share.
  useEffect(() => {
    if (showShareModal) {
      setSharePlatforms({
        web: true,
        android: true,
        ios: true,
        device: true,
        phone: true,
        desktop: true,
      });
    }
  }, [showShareModal]);
  const [shareResultUrl, setShareResultUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Follow the stream only while the user is at (or near) the bottom. Only
  // USER-INTENT events (wheel/touch) pause auto-follow — plain scroll events
  // can come from our own programmatic follows, so they may only RE-arm it
  // when the user lands back near the bottom (or sends a message).
  const stickToBottomRef = useRef(true);
  // Coalesces follow scrolls to one per animation frame during fast streams.
  const followRafRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentProject = projects.find(p => p.id === currentProjectId) || { name: 'Current Project', icon: LayoutGrid };

  const deploySteps = [
    {
      title: 'Export Project',
      content: (
        <div className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-xl bg-background"
            onClick={() => void onExportProject?.()}
            disabled={isExportingProject}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExportingProject ? 'Exporting...' : 'Export Project'}
          </Button>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This downloads a zip file of the current project. Unzip it, then open a terminal in that project folder.
          </p>
        </div>
      ),
    },
    {
      title: 'Expo Account',
      content: (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            If you do not have one yet, create an account at{' '}
            <a
              href="https://expo.dev/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-4"
            >
              expo.dev/signup
            </a>
            {' '}and then log in from the CLI.
          </p>
          <pre className="overflow-x-auto rounded-2xl border border-border/60 bg-slate-950 px-4 py-3 text-xs leading-relaxed text-slate-100"><code>{`npx eas login`}</code></pre>
        </div>
      ),
    },
    {
      title: 'Configure EAS',
      content: (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Set up the project for EAS builds and store submission.
          </p>
          <pre className="overflow-x-auto rounded-2xl border border-border/60 bg-slate-950 px-4 py-3 text-xs leading-relaxed text-slate-100"><code>{`npx eas build:configure`}</code></pre>
        </div>
      ),
    },
    {
      title: 'Build',
      content: (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Generate your Android and iOS binaries with EAS Build.
          </p>
          <pre className="overflow-x-auto rounded-2xl border border-border/60 bg-slate-950 px-4 py-3 text-xs leading-relaxed text-slate-100"><code>{`npx eas build --platform android
npx eas build --platform ios`}</code></pre>
        </div>
      ),
    },
    {
      title: 'Submit',
      content: (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Upload the finished builds to Google Play and App Store Connect.
          </p>
          <pre className="overflow-x-auto rounded-2xl border border-border/60 bg-slate-950 px-4 py-3 text-xs leading-relaxed text-slate-100"><code>{`npx eas submit --platform android
npx eas submit --platform ios`}</code></pre>
        </div>
      ),
    },
  ] as const;

  // First render of a conversation lands at the bottom INSTANTLY — a smooth
  // animated crawl over a long transcript gets cancelled by lazy-markdown
  // layout shifts and never arrives. After that, follow new content with
  // instant rAF-coalesced scrolls (one per frame, no animation to interrupt),
  // but only while the user is stuck to the bottom.
  const hasPositionedRef = useRef(false);
  useEffect(() => {
    if (items.length === 0) {
      hasPositionedRef.current = false;
      return;
    }
    const el = messagesContainerRef.current;
    if (!hasPositionedRef.current) {
      hasPositionedRef.current = true;
      stickToBottomRef.current = true;
      el?.scrollTo({ top: el.scrollHeight, behavior: 'instant' as ScrollBehavior });
      return;
    }
    if (!stickToBottomRef.current || followRafRef.current !== null) return;
    followRafRef.current = requestAnimationFrame(() => {
      followRafRef.current = null;
      const container = messagesContainerRef.current;
      if (container && stickToBottomRef.current) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'instant' as ScrollBehavior });
      }
    });
  }, [items, isProcessing]);

  useEffect(() => {
    return () => {
      if (followRafRef.current !== null) cancelAnimationFrame(followRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    stickToBottomRef.current = true;
    onSubmitMessage(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleExampleClick = (prompt: string) => {
    if (isProcessing) return;
    stickToBottomRef.current = true;
    onSubmitMessage(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleCreateProjectClick = () => {
    onCreateProject?.();
    setIsProjectMenuOpen(false);
  };

  const deployModal = (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
      onClick={() => setShowDeployModal(false)}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-white/10 bg-background/95 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">Deploy your app</h3>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Expo Snack is the live prototype. To ship it, export the project into a normal Expo app and build it with EAS.
            </p>
          </div>
          <button
            onClick={() => setShowDeployModal(false)}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto pr-1">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {deploySteps.map((step, index) => (
              <button
                key={step.title}
                onClick={() => setDeployStep(index)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                  index === deployStep
                    ? "bg-primary text-primary-foreground"
                    : index < deployStep
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {index + 1}. {step.title}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-border/50 bg-muted/20 p-5">
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Step {deployStep + 1}
              </div>
              <h4 className="text-base font-semibold text-foreground">
                {deploySteps[deployStep].title}
              </h4>
            </div>
            {deploySteps[deployStep].content}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => setDeployStep((step) => Math.max(0, step - 1))}
              disabled={deployStep === 0}
            >
              Back
            </Button>
            {deployStep < deploySteps.length - 1 ? (
              <Button onClick={() => setDeployStep((step) => Math.min(deploySteps.length - 1, step + 1))}>
                Next
              </Button>
            ) : (
              <Button onClick={() => setShowDeployModal(false)}>
                Done
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const runShare = async (mode: 'preview' | 'code') => {
    // Only include keys visible in the current modal, so iOS/Android can
    // never be shared even though they're still in state and URL vocab.
    const visibleKeys = appetizeEnabled ? ['web', 'device'] : ['phone', 'desktop', 'device'];
    const selected = visibleKeys.filter((key) => sharePlatforms[key]);
    setPendingShareMode(mode);
    try {
      const url = await onShare?.(selected, mode, shareCode);
      if (url) setShareResultUrl(url);
    } finally {
      setPendingShareMode(null);
    }
  };

  const shareModal = (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
      onClick={() => {
        setShowShareModal(false);
        setShareResultUrl(null);
        setShareCopied(false);
      }}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-background/95 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        {!shareResultUrl ? (
          <>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">Share current version</h3>
                <p className="text-sm text-muted-foreground">
                  Choose which platforms to include in the preview.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setShareResultUrl(null);
                }}
                className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              {/* With Appetize: Web + Device (iOS/Android intentionally hidden
                  for now — kept in URL vocab so we can re-enable later).
                  Without Appetize: Phone + Desktop + Device, mirroring the
                  editor's Stage tabs in flag-off mode. */}
              {((appetizeEnabled
                ? [
                    { key: 'web', label: 'Web', icon: <WebIcon className="h-5 w-5" /> },
                    { key: 'device', label: 'Run on device', icon: <Smartphone className="h-5 w-5" /> },
                  ]
                : [
                    { key: 'phone', label: 'Phone', icon: <Smartphone className="h-5 w-5" /> },
                    { key: 'desktop', label: 'Desktop', icon: <Monitor className="h-5 w-5" /> },
                    { key: 'device', label: 'Run on device', icon: <Smartphone className="h-5 w-5" /> },
                  ]) as Array<{ key: string; label: string; icon: React.ReactNode }>).map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setSharePlatforms(prev => ({ ...prev, [key]: !prev[key] }))}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                    sharePlatforms[key]
                      ? "border-primary/30 bg-primary/5 text-foreground"
                      : "border-border/50 bg-muted/20 text-muted-foreground"
                  )}
                >
                  <div className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                    sharePlatforms[key] ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {icon}
                  </div>
                  <span className="flex-1 text-sm font-medium">{label}</span>
                  <div className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-md border transition-colors",
                    sharePlatforms[key]
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border"
                  )}>
                    {sharePlatforms[key] && <Check className="h-3 w-3" />}
                  </div>
                </button>
              ))}

            </div>

            {/* Master switch — whether the share actively invites remixing.
                Governs BOTH the preview's Remix button and the direct
                editable-code link below. Kept as a light inline checkbox so it
                doesn't compete with the platform rows above. */}
            <button
              onClick={() => setShareCode((value) => !value)}
              className="mb-3 flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-muted/40"
            >
              <div className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                shareCode ? "border-primary bg-primary text-primary-foreground" : "border-border"
              )}>
                {shareCode && <Check className="h-3 w-3" />}
              </div>
              <span className="text-sm text-foreground">Let anyone with the link remix this app</span>
            </button>

            <div className="space-y-2.5">
              <Button
                className="w-full h-11 rounded-xl"
                disabled={
                  isSharing ||
                  !(appetizeEnabled ? ['web', 'device'] : ['phone', 'desktop', 'device']).some(
                    (key) => sharePlatforms[key]
                  )
                }
                onClick={() => runShare('preview')}
              >
                {isSharing && pendingShareMode === 'preview' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Share2 className="mr-2 h-4 w-4" />
                    {shareCode ? 'Share preview + code' : 'Share preview'}
                  </>
                )}
              </Button>

              {shareCode && (
                <>
                  <Button
                    variant="outline"
                    className="w-full h-11 rounded-xl"
                    disabled={isSharing}
                    onClick={() => runShare('code')}
                  >
                    {isSharing && pendingShareMode === 'code' ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Code2 className="mr-2 h-4 w-4" />
                        Share editable code
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>

            {/* Independent notice — true of ANY share link, not just the code
                one: the source lives behind Expo's public snack API keyed by
                the id in the URL, so a preview link exposes it too. Kept as a
                quiet footnote under the actions, not an alert. */}
            <p className="mt-3 px-1 text-center text-[11px] leading-relaxed text-muted-foreground/70">
              Anyone with a share link can view this app&apos;s code.
            </p>
          </>
        ) : (
          <>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">Link ready</h3>
                <p className="text-sm text-muted-foreground">
                  {shareResultUrl?.includes('/remix/')
                    ? 'Anyone with this link can open and edit this app in the editor.'
                    : shareResultUrl?.includes('remix=1')
                      ? 'Anyone with this link can view the app and remix it.'
                      : 'Anyone with this link can view the app (and its code).'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setShareResultUrl(null);
                  setShareCopied(false);
                }}
                className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-1.5">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 text-sm text-foreground truncate">
                <Link className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{shareResultUrl}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 h-9 rounded-lg gap-2"
                onClick={async () => {
                  await navigator.clipboard.writeText(shareResultUrl);
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 2000);
                }}
              >
                {shareCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </Button>
            </div>

            <Button
              variant="outline"
              className="w-full mt-4 h-11 rounded-xl"
              onClick={() => {
                setShowShareModal(false);
                setShareResultUrl(null);
                setShareCopied(false);
              }}
            >
              Done
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-background relative">
      {showDeployModal && typeof document !== 'undefined' && createPortal(deployModal, document.body)}
      {showShareModal && typeof document !== 'undefined' && createPortal(shareModal, document.body)}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="relative flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 shadow-sm overflow-hidden">
            <NextImage src="/logo.png" alt="Sharables" width={40} height={40} className="object-contain" priority />
          </div>

          <div className="flex flex-col">
            <span className="text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent uppercase tracking-wide">
              Sharables
            </span>

            <button
              onClick={() => setIsProjectMenuOpen(!isProjectMenuOpen)}
              className="flex items-center gap-1.5 hover:bg-muted/50 rounded-md -ml-1 px-1 transition-colors group cursor-pointer"
            >
              <span className="text-sm font-semibold text-foreground">{currentProject.name}</span>
              <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform duration-200", isProjectMenuOpen && "rotate-180")} />
            </button>

            {isProjectMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsProjectMenuOpen(false)} />
                <div className="absolute top-full left-0 mt-3 w-64 bg-background/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-2 space-y-1">
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Recent Projects
                    </div>
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        className={cn(
                          "group flex items-center gap-2 rounded-xl px-2 py-1 transition-colors",
                          currentProjectId === project.id
                            ? "bg-primary/10"
                            : "hover:bg-muted/50"
                        )}
                      >
                        <button
                          onClick={() => {
                            onSelectProject?.(project.id);
                            setIsProjectMenuOpen(false);
                          }}
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors cursor-pointer",
                            currentProjectId === project.id ? "text-primary" : "text-foreground"
                          )}
                        >
                          <LayoutGrid className="h-4 w-4 shrink-0 opacity-70" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{project.name}</div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {project.lastEdited}
                            </div>
                          </div>
                          {currentProjectId === project.id && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        </button>
                        {projects.length > 1 && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteProject?.(project.id);
                              setIsProjectMenuOpen(false);
                            }}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                            aria-label={`Delete ${project.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}

                    <div className="h-px bg-border/50 my-1" />

                    <button
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-muted/50 text-foreground transition-colors group cursor-pointer"
                      onClick={handleCreateProjectClick}
                    >
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-background border border-transparent group-hover:border-border transition-all">
                        <Plus className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                      </div>
                      <span className="text-sm font-medium">New Project</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-full bg-background/80 backdrop-blur-md shadow-sm"
            onClick={() => {
              setShareResultUrl(null);
              setShareCopied(false);
              setSharePlatforms({ web: true, android: true, ios: true, device: true });
              setShowShareModal(true);
            }}
          >
            <Share2 className={cn("h-4 w-4", !isMobile && "mr-2")} />
            <span className={cn(isMobile && "sr-only")}>Share</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-full bg-background/80 backdrop-blur-md shadow-sm"
            onClick={() => {
              setDeployStep(0);
              setShowDeployModal(true);
            }}
          >
            <Rocket className={cn("h-4 w-4", !isMobile && "mr-2")} />
            <span className={cn(isMobile && "sr-only")}>Deploy</span>
          </Button>
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        // Scroll events also fire for our own programmatic follows, so they
        // may only RE-arm auto-follow — never pause it.
        onScroll={() => {
          const el = messagesContainerRef.current;
          if (!el) return;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
            stickToBottomRef.current = true;
          }
        }}
        // Pausing requires USER intent: a wheel-up, or a touch-drag while away
        // from the bottom.
        onWheel={(e) => {
          if (e.deltaY < 0) stickToBottomRef.current = false;
        }}
        onTouchMove={() => {
          const el = messagesContainerRef.current;
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight >= 150) {
            stickToBottomRef.current = false;
          }
        }}
        className={cn(
          "flex-1 overflow-y-auto pt-20 px-4 space-y-6 scroll-smooth",
          onModelSelect
            ? isMobile
              ? "pb-72"
              : "pb-64"
            : isMobile
              ? "pb-56"
              : "pb-40"
        )}>
        {items.length === 0 && (
          /* min-h-full (not h-full): when the hero is taller than a phone
             viewport it must grow so the cards scroll clear of the floating
             composer instead of being trapped underneath it. */
          <div className="flex flex-col items-center justify-center min-h-full text-center space-y-3 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 px-4">
            <div className="relative group">
              <div className="absolute inset-0 bg-orange-500/30 blur-2xl rounded-full opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
              <NextImage
                src="/logo.png"
                alt="Sharables"
                width={160}
                height={160}
                className="object-contain relative transform transition-transform duration-500 group-hover:scale-105 group-hover:rotate-3"
                priority
              />
            </div>

            <div className="space-y-4 max-w-lg">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
                What can I build for you?
              </h2>
              <p className="text-muted-foreground text-base leading-relaxed">
                Tell me what app to build, watch it run in your browser, and share it before the idea gets cold. Powered by nanocodana.
              </p>

              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-medium animate-in fade-in zoom-in-95 delay-200 duration-500">
                <Shield className="h-3 w-3" />
                <span>Running entirely in your browser</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl pt-4">
              {EXAMPLE_PROMPTS.map((item, idx) => (
                <button
                  key={idx}
                  className={cn(
                    "group flex items-center gap-3 text-left px-4 py-3.5 rounded-xl border bg-card/50 hover:bg-card hover:border-primary/30 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5",
                    idx === EXAMPLE_PROMPTS.length - 1 && EXAMPLE_PROMPTS.length % 2 !== 0 && "sm:col-span-2 sm:w-2/3 sm:mx-auto"
                  )}
                  onClick={() => handleExampleClick(item.prompt)}
                  disabled={isProcessing}
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                      {item.label}
                    </div>
                    <div className="text-xs text-muted-foreground truncate opacity-70 group-hover:opacity-100 transition-opacity">
                      {item.prompt}
                    </div>
                  </div>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </button>
              ))}
            </div>
          </div>
        )}

        {items.map((item) => {
          if (item.kind === 'tool') {
            const isApproval = item.state === 'approval-requested';
            const isError = item.state === 'output-error' || item.state === 'output-denied';
            const isSuccess = item.state === 'output-available';
            const title =
              item.state === 'approval-requested'
                ? `Approval required for ${item.toolName}`
                : item.state === 'approval-responded'
                  ? `${item.approved ? 'Approved' : 'Denied'} ${item.toolName}`
                  : item.state === 'output-available'
                    ? `Ran ${item.toolName}`
                    : item.state === 'output-error'
                      ? `${item.toolName} failed`
                      : item.state === 'output-denied'
                        ? `${item.toolName} was denied`
                        : `Using ${item.toolName}`;

            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-2xl px-5 py-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300",
                  isApproval
                    ? "border border-amber-200 bg-amber-50/90"
                    : isError
                      ? "border border-red-200 bg-red-50/90"
                      : isSuccess
                        ? "border border-emerald-200 bg-emerald-50/80"
                        : "border border-border/60 bg-card/80",
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      isApproval
                        ? "bg-amber-100 text-amber-700"
                        : isError
                          ? "bg-red-100 text-red-700"
                          : isSuccess
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-700",
                    )}
                  >
                    {isApproval ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : isSuccess ? (
                      <Check className="h-4 w-4" />
                    ) : isError ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "text-sm font-semibold",
                        isApproval
                          ? "text-amber-900"
                          : isError
                            ? "text-red-900"
                            : isSuccess
                              ? "text-emerald-900"
                              : "text-foreground",
                      )}
                    >
                      {title}
                    </div>
                    <p
                      className={cn(
                        "mt-1 text-xs leading-relaxed",
                        isApproval
                          ? "text-amber-800"
                          : isError
                            ? "text-red-800"
                            : isSuccess
                              ? "text-emerald-800"
                              : "text-muted-foreground",
                      )}
                    >
                      {isApproval
                        ? 'Review the tool input below before allowing it to run.'
                        : 'Tool activity remains visible in the timeline even after the assistant replies.'}
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-xl border border-border/60 bg-white/80 p-3 text-xs text-slate-700">
{JSON.stringify(item.input ?? {}, null, 2)}
                    </pre>
                    {item.output !== undefined && (
                      <pre className="mt-3 overflow-x-auto rounded-xl border border-border/60 bg-white/80 p-3 text-xs text-slate-700">
{JSON.stringify(item.output, null, 2)}
                      </pre>
                    )}
                    {item.toolName === 'GenerateImage' && item.toolCallId && generatedImages?.[item.toolCallId] && (
                      <div className="mt-3 flex justify-center rounded-xl border border-border/60 bg-white/80 p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={generatedImages[item.toolCallId]}
                          alt="Generated image"
                          className="rounded-lg max-h-64 w-auto object-contain"
                        />
                      </div>
                    )}
                    {item.errorText && (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                        {item.errorText}
                      </div>
                    )}
                    {item.reason && (
                      <div className="mt-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                        Reason: {item.reason}
                      </div>
                    )}
                    {isApproval && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() => item.approvalId && onApprovalResponse?.(item.approvalId, true)}
                          disabled={isProcessing || !item.approvalId}
                        >
                          <Check className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-2 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                          onClick={() => item.approvalId && onApprovalResponse?.(item.approvalId, false)}
                          disabled={isProcessing || !item.approvalId}
                        >
                          <X className="h-4 w-4" />
                          Deny
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          const msg = item;
          const isSystem = msg.role === 'system';
          const isError = isSystem && (msg.content.includes('Error:') || msg.content.includes('⚠️'));
          const isSuccess = isSystem && (msg.content.includes('✅') || msg.content.includes('✓'));

          if (isSystem && !isError) {
            return (
              <div key={msg.id} className="flex justify-center w-full my-2 animate-in fade-in zoom-in-95 duration-300">
                <div className="bg-muted/50 backdrop-blur-sm border border-border/50 rounded-full px-3 py-1.5 flex items-center gap-2 text-xs text-muted-foreground shadow-sm">
                  {isSuccess ? <Sparkles className="h-3 w-3 text-green-500" /> : <div className="h-1.5 w-1.5 rounded-full bg-orange-500/50" />}
                  <span>{msg.content}</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={cn(
                "flex gap-4 text-sm group animate-in fade-in slide-in-from-bottom-2 duration-300",
                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div className={cn(
                "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center shadow-sm border transition-transform group-hover:scale-105",
                msg.role === 'user' ? "bg-primary text-primary-foreground border-primary" :
                  isError ? "bg-red-50 text-red-600 border-red-200" : "bg-background text-foreground"
              )}>
                {msg.role === 'user' ? <User className="h-4 w-4" /> :
                  isError ? <AlertTriangle className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>

              <div className={cn(
                "rounded-2xl px-5 py-3.5 max-w-[85%] shadow-sm leading-relaxed",
                msg.role === 'user'
                  ? "bg-primary text-primary-foreground rounded-tr-sm whitespace-pre-wrap"
                  : isError
                    ? "bg-red-50 text-red-900 border border-red-100 whitespace-pre-wrap"
                    : "bg-card border text-card-foreground rounded-tl-sm"
              )}>
                {msg.role === 'assistant'
                  ? (
                    <Suspense fallback={<span className="whitespace-pre-wrap">{msg.content}</span>}>
                      <MarkdownMessage content={msg.content} />
                    </Suspense>
                  )
                  : msg.content}
              </div>
            </div>
          );
        })}

        {isProcessing && (
          <div className="flex gap-4 text-sm animate-in fade-in duration-300">
            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-background border flex items-center justify-center shadow-sm">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-card border rounded-2xl rounded-tl-sm px-5 py-3.5 flex items-center gap-3 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              <ThinkingMessage />
            </div>
          </div>
        )}

      </div>

      <div className={cn(
        "absolute left-0 right-0 z-10 p-4 bg-gradient-to-t from-background via-background to-transparent pt-10",
        isMobile ? "bottom-14" : "bottom-0"
      )}>
        <div className="max-w-3xl mx-auto relative">
          {/* Own row (not inside the overflow-x pill row, where it would sit
              off-screen whenever the pills overflow the narrow panel). */}
          {sessionUsage && hasUsage(sessionUsage) && (
            <div className="flex justify-end mb-2 px-1">
              <UsageMeter usage={sessionUsage} />
            </div>
          )}
          {onModelSelect && (
            <div className="flex items-center gap-2 mb-3 px-1 overflow-x-auto no-scrollbar">
              <div className="flex items-center p-1 bg-muted/50 backdrop-blur-md rounded-full border border-border/50 shadow-sm">
                <button
                  onClick={onModelSelect}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-background shadow-sm text-foreground border border-border/50 transition-all hover:bg-accent max-w-[220px]"
                >
                  <Sparkles className="h-3 w-3 text-orange-500" />
                  <span className="truncate">{currentModel || 'Select Model'}</span>
                </button>

                <div className="w-px h-4 bg-border/50 mx-1" />

                <button
                  onClick={onModelSelect}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-background/50 transition-colors whitespace-nowrap"
                >
                  <ProviderIcon id="openai" size={14} />
                  <span>GPT</span>
                </button>

                <button
                  onClick={onModelSelect}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-background/50 transition-colors whitespace-nowrap"
                >
                  <ProviderIcon id="anthropic" size={14} />
                  <span>Claude</span>
                </button>

                <button
                  onClick={onModelSelect}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-background/50 transition-colors whitespace-nowrap"
                >
                  <ProviderIcon id="gemini" size={14} />
                  <span>Gemini</span>
                </button>

                <div className="w-px h-4 bg-border/50 mx-1" />

                <button
                  onClick={onModelSelect}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-full text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-background/50 transition-colors whitespace-nowrap"
                >
                  <span>More</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="relative group">
            {composerSuggestion && (() => {
              const tone =
                composerSuggestion.tone === 'info'
                  ? {
                      container: 'border-orange-200 bg-orange-50/90',
                      heading: 'text-orange-800',
                      preview: 'text-orange-700/90',
                      button: 'bg-orange-600 hover:bg-orange-700',
                    }
                  : {
                      container: 'border-red-200 bg-red-50/90',
                      heading: 'text-red-800',
                      preview: 'text-red-700/90',
                      button: 'bg-red-600 hover:bg-red-700',
                    };
              return (
                <div
                  className={cn(
                    'mb-3 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left',
                    tone.container,
                  )}
                >
                  <div className="min-w-0">
                    <div className={cn('flex items-center gap-2 text-xs font-semibold', tone.heading)}>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>{composerSuggestion.title ?? 'There was an error found'}</span>
                    </div>
                    {composerSuggestion.preview && (
                      <p className={cn('mt-1 truncate text-xs', tone.preview)}>
                        {composerSuggestion.preview}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className={cn('h-8 shrink-0 rounded-full px-3 text-white', tone.button)}
                    onClick={() => {
                      if (isProcessing) return;
                      stickToBottomRef.current = true;
                      onSubmitMessage(composerSuggestion.text);
                    }}
                    disabled={isProcessing}
                  >
                    {composerSuggestion.action ?? 'Fix it'}
                  </Button>
                </div>
              );
            })()}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your app..."
              disabled={isProcessing}
              className="w-full min-h-[100px] max-h-[200px] px-5 py-6 pr-20 rounded-2xl border border-border bg-background/50 backdrop-blur-xl shadow-2xl shadow-orange-500/40 focus:bg-background focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/50 resize-none text-base outline-none transition-all focus:shadow-orange-500/30"
              rows={1}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isProcessing || !input.trim()}
              className={cn(
                "absolute right-4 bottom-4 h-12 w-12 rounded-xl transition-all duration-300 shadow-lg hover:shadow-orange-500/25 hover:scale-105 active:scale-95",
                input.trim()
                  ? "bg-gradient-to-br from-orange-500 to-amber-600 text-white border-0"
                  : "bg-gradient-to-br from-orange-500/50 to-amber-600/50 text-white border-0 cursor-not-allowed"
              )}
            >
              <Send className="h-5 w-5" />
            </Button>
          </form>
          <div className="absolute -bottom-6 left-0 right-0 text-[10px] text-center text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">
            AI can make mistakes. Review generated code.
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectedChatPanel(
  props: Omit<ChatPanelProps, 'chat'> & {
    chat: Chat<any>;
    input: string;
    setInput: (value: string) => void;
  },
) {
  const { chat, systemMessages, onMessagesChange, composerSuggestion, ...rest } = props;
  const { messages, sendMessage, status, error, addToolApprovalResponse } = useChat({ chat });
  const isProcessing = status === 'submitted' || status === 'streaming';
  // Memoized so renders that don't change the inputs (e.g. every composer
  // keystroke — input state lives in the parent) don't re-walk the whole
  // history or churn the items identity that the scroll effect keys on.
  const items = useMemo(
    () => buildDisplayItems(messages, systemMessages, error),
    [messages, systemMessages, error],
  );
  // Cheap integer sums; memoized only to keep the object identity stable for
  // memo(UsageMeter) across unrelated re-renders.
  const sessionUsage = useMemo(() => aggregateSessionUsage(messages), [messages]);

  useEffect(() => {
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  return (
    <ChatPanelLayout
      {...rest}
      items={items}
      sessionUsage={sessionUsage}
      isProcessing={isProcessing}
      composerSuggestion={composerSuggestion}
      onSubmitMessage={(message) => {
        void sendMessage({ text: message });
      }}
      onApprovalResponse={(approvalId, approved) => {
        void addToolApprovalResponse({
          id: approvalId,
          approved,
        });
      }}
    />
  );
}

export function ChatPanel({
  chat,
  systemMessages,
  onRequireModel,
  composerSuggestion,
  initialComposerText,
  onInitialComposerConsumed,
  currentProjectId,
  ...rest
}: ChatPanelProps) {
  // Composer text lives here, in the stable parent, rather than in
  // ChatPanelLayout — which remounts every time `chat` toggles null↔set (e.g.
  // when a model is selected, since ConnectedChatPanel wraps the layout to call
  // useChat). Owning it here keeps the user's draft (and the one-time ?prompt=
  // handoff) intact across that remount. Seeded once from the hero handoff.
  const [input, setInput] = useState(initialComposerText ?? '');
  // Clear the handoff source once we've seeded from it, so a later ChatPanel
  // remount (e.g. on project switch) can't re-run useState and resurrect the
  // stale prompt. Runs once; the input state itself persists across the
  // model-select remount because it lives here in the stable parent.
  useEffect(() => {
    if (initialComposerText) onInitialComposerConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The draft belongs to the active project: clear it on a real project switch
  // so it can't bleed into another project. Guard against the initial
  // undefined→id hydration so the seeded handoff prompt isn't wiped on mount.
  const composerProjectRef = useRef(currentProjectId);
  useEffect(() => {
    if (composerProjectRef.current !== currentProjectId) {
      const wasDefined = composerProjectRef.current !== undefined;
      composerProjectRef.current = currentProjectId;
      if (wasDefined) setInput('');
    }
  }, [currentProjectId]);

  if (chat) {
    return (
      <ConnectedChatPanel
        chat={chat}
        systemMessages={systemMessages}
        composerSuggestion={composerSuggestion}
        currentProjectId={currentProjectId}
        input={input}
        setInput={setInput}
        {...rest}
      />
    );
  }

  return (
    <ChatPanelLayout
      {...rest}
      currentProjectId={currentProjectId}
      input={input}
      setInput={setInput}
      items={systemMessages.map((message) => ({ kind: 'message' as const, ...message }))}
      isProcessing={false}
      composerSuggestion={composerSuggestion}
      onSubmitMessage={() => {
        onRequireModel?.();
      }}
    />
  );
}
