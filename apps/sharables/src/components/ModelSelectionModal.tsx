'use client'

import { useState, useEffect, type ReactNode } from 'react';
import { X, ChevronRight, ArrowLeft, Globe, Laptop, Settings, ExternalLink, Search, Zap, Brain, Stars, Cpu, Cloud, Shield, Gift, Check, Sparkles, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  PROVIDER_TABS,
  PROVIDERS,
  PROVIDER_IDS,
  getProvidersByIds,
  getApiKeyPolicy,
  IMAGE_MODELS,
  resolveImageMode,
  type ProviderConfig,
  type ImageModelConfig,
  type ImageModelMode
} from '../config/providers';

export interface ImageSelection {
  id: string;
  modelId: string;
  apiKey?: string;
  /** How the generator reaches the model (generateImage vs multimodal). */
  mode?: ImageModelMode;
}

const RECOMMENDED_MODEL_FAMILIES = [
  { name: 'Claude', className: 'border-orange-500/20 bg-orange-500/10 text-orange-700' },
  { name: 'Gemini', className: 'border-blue-500/20 bg-blue-500/10 text-blue-700' },
  { name: 'GPT', className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700' },
  { name: 'Kimi', className: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700' },
  { name: 'GLM', className: 'border-amber-500/20 bg-amber-500/10 text-amber-700' },
  { name: 'DeepSeek', className: 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-700' },
  { name: 'MiniMax', className: 'border-amber-500/20 bg-amber-500/10 text-amber-700' },
  { name: 'Qwen', className: 'border-rose-500/20 bg-rose-500/10 text-rose-700' },
  { name: 'Mimo', className: 'border-teal-500/20 bg-teal-500/10 text-teal-700' },
  { name: 'Grok', className: 'border-sky-500/20 bg-sky-500/10 text-sky-700' },
] as const;

interface ModelSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selection: {
    provider: ProviderConfig;
    modelId: string;
    apiKey?: string;
    customUrl?: string;
  }) => void;
  currentProvider?: string;
  currentModel?: string;
  currentApiKey?: string;
  currentCustomUrl?: string;
  providerSelections?: Record<string, {
    modelId?: string;
    apiKey?: string;
    customUrl?: string;
  }>;
  /** Optional image-model selection (separate, optional capability). */
  onSelectImage?: (selection: ImageSelection | null) => void;
  currentImage?: ImageSelection | null;
}

type TabType = 'cloud' | 'local' | 'custom' | 'image';
type ViewState =
  | { type: 'providers'; tab: TabType }
  | { type: 'models'; provider: ProviderConfig }
  | { type: 'configure'; provider: ProviderConfig }
  | { type: 'image-configure'; image: ImageModelConfig }
  | { type: 'image-models'; image: ImageModelConfig };

// --- Chrome shared by the provider and image flows (one source, no drift) ---

const INPUT_CLASS =
  'flex h-11 w-full rounded-xl border border-input bg-background/50 px-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary transition-all';

/** Centered icon + "Configure X" heading atop a configure view. */
function ConfigureHero({ icon, name, subtitle }: { icon: string; name: string; subtitle: string }) {
  return (
    <div className="text-center space-y-2">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/50 mb-4 shadow-inner p-3">
        <img src={icon} alt={name} className="w-full h-full object-contain" />
      </div>
      <h2 className="text-2xl font-bold">Configure {name}</h2>
      <p className="text-muted-foreground">{subtitle}</p>
    </div>
  );
}

/** Password input with shield icon and optional "Get API key" link. */
function ApiKeyField({
  value,
  onChange,
  label = 'API Key',
  placeholder = 'Enter your API key',
  getKeyUrl,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  getKeyUrl?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium ml-1">{label}</label>
      <div className="relative">
        <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={INPUT_CLASS}
        />
      </div>
      {getKeyUrl && (
        <div className="flex justify-end">
          <a
            href={getKeyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-xs font-medium text-primary hover:underline"
          >
            Get API key <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        </div>
      )}
    </div>
  );
}

/** Wide header card used by the model-entry views. */
function ProviderHero({
  icon,
  name,
  description,
  noteUrl,
}: {
  icon: string;
  name: string;
  description?: string;
  noteUrl?: string;
}) {
  return (
    <div className="flex flex-col items-start sm:flex-row sm:items-center gap-4 md:gap-6 p-5 md:p-6 rounded-2xl bg-gradient-to-br from-muted/50 to-transparent border border-border/50">
      <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-background shadow-sm border border-border/50 p-3 md:p-4 flex items-center justify-center">
        <img src={icon} alt={name} className="w-full h-full object-contain" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl md:text-2xl font-bold">{name}</h2>
        {description && <p className="text-muted-foreground">{description}</p>}
        {noteUrl && (
          <a
            href={noteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-xs font-medium text-primary hover:underline mt-1"
          >
            View provider details <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        )}
      </div>
    </div>
  );
}

/** "Enter Model ID" section with the Cpu-icon input and optional model-list link. */
function ModelIdEntry({
  value,
  onChange,
  placeholder,
  modelListUrl,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  modelListUrl?: string;
}) {
  return (
    <div className="space-y-3 pt-2 border-t border-border/50">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Enter Model ID</h3>
        {modelListUrl && (
          <a
            href={modelListUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
          >
            View all models <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <div className="relative">
        <Cpu className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={INPUT_CLASS}
        />
      </div>
    </div>
  );
}

/** Bottom-pinned primary action shared by the model-entry views. */
function StickyAction({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 pt-4 bg-gradient-to-t from-background via-background to-transparent pb-2">
      <Button
        className="w-full h-12 text-base font-medium shadow-lg shadow-primary/20"
        size="lg"
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </Button>
    </div>
  );
}

export function ModelSelectionModal({
  isOpen,
  onClose,
  onSelect,
  currentProvider,
  currentModel,
  currentApiKey,
  currentCustomUrl,
  providerSelections = {},
  onSelectImage,
  currentImage = null,
}: ModelSelectionModalProps) {
  const [viewState, setViewState] = useState<ViewState>({ type: 'providers', tab: 'cloud' });
  const [apiKey, setApiKey] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  // The custom-endpoint form keeps its own drafts — sharing apiKey/customUrl
  // with the provider flows leaks one flow's values into the other (e.g. the
  // Ollama Server URL pre-filling the custom endpoint).
  const [customModelId, setCustomModelId] = useState('');
  const [customEndpointUrl, setCustomEndpointUrl] = useState('');
  const [customEndpointKey, setCustomEndpointKey] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      const initialProvider = currentProvider ? PROVIDERS[currentProvider] : null;
      setViewState({
        type: 'providers',
        tab: initialProvider?.type === 'local' ? 'local' : 'cloud',
      });
      setSearchQuery('');
      setApiKey(currentApiKey ?? '');
      setCustomUrl(currentCustomUrl ?? '');
      setCustomModelInput(currentModel ?? '');
      // Seed the custom-endpoint form only when it is the active selection.
      const isCustomActive = currentProvider === PROVIDER_IDS.CUSTOM;
      setCustomModelId(isCustomActive ? currentModel ?? '' : '');
      setCustomEndpointUrl(isCustomActive ? currentCustomUrl ?? '' : '');
      setCustomEndpointKey(isCustomActive ? currentApiKey ?? '' : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentApiKey, currentCustomUrl, currentModel, currentProvider]);

  if (!isOpen) return null;

  const getProviderTab = (provider: ProviderConfig): TabType =>
    provider.type === 'local' ? 'local' : 'cloud';

  const getProviderBadge = (provider: ProviderConfig) => {
    if (currentProvider === provider.id) {
      return (
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
          Active
        </span>
      );
    }

    if (providerSelections[provider.id]?.apiKey) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          <Check className="h-3 w-3" />
          API Key
        </span>
      );
    }

    return null;
  };

  const loadProviderDraft = (provider: ProviderConfig) => {
    const savedSelection = providerSelections[provider.id];
    setApiKey(savedSelection?.apiKey ?? '');
    setCustomModelInput(savedSelection?.modelId ?? '');
    setCustomUrl(savedSelection?.customUrl ?? provider.defaultUrl ?? '');
  };

  const handleProviderClick = (provider: ProviderConfig) => {
    loadProviderDraft(provider);
    setViewState({ type: 'configure', provider });
  };

  const handleContinue = () => {
    const effectiveModelId = customModelInput.trim();

    if (viewState.type === 'models' && effectiveModelId) {
      const provider = viewState.provider;

      // Otherwise, complete the selection
      onSelect({
        provider,
        modelId: effectiveModelId,
        apiKey: apiKey.trim() || undefined,
        customUrl: customUrl.trim() || undefined
      });
      onClose();
    }
  };

  const handleConfigureContinue = () => {
    if (viewState.type === 'configure') {
      setViewState({ type: 'models', provider: viewState.provider });
    }
  };

  // --- Image generation flow (mirrors the cloud provider flow) ---

  const handleImageProviderClick = (image: ImageModelConfig) => {
    // Seed the API key from the active pick, else reuse the matching chat
    // provider's saved key (the model draft is seeded separately, below).
    setApiKey(
      (currentImage?.id === image.id ? currentImage?.apiKey : undefined) ??
      providerSelections[image.providerId]?.apiKey ??
      ''
    );
    // No default pre-selection — the examples are just hints; the user picks one
    // (or types their own). Only prefill when editing an existing pick.
    setCustomModelInput(
      (currentImage?.id === image.id ? currentImage?.modelId : undefined) ?? ''
    );
    setViewState({ type: 'image-configure', image });
  };

  const handleImageConfigureContinue = () => {
    if (viewState.type === 'image-configure') {
      setViewState({ type: 'image-models', image: viewState.image });
    }
  };

  const handleImageContinue = () => {
    if (viewState.type !== 'image-models') return;
    const image = viewState.image;
    const modelId = customModelInput.trim();
    if (!modelId || !apiKey.trim()) return;
    onSelectImage?.({
      id: image.id,
      modelId,
      apiKey: apiKey.trim(),
      mode: resolveImageMode(image, modelId),
    });
    onClose();
  };

  const handleBack = () => {
    if (viewState.type === 'models') {
      setViewState({ type: 'configure', provider: viewState.provider });
      return;
    }

    if (viewState.type === 'configure') {
      setViewState({ type: 'providers', tab: getProviderTab(viewState.provider) });
      return;
    }

    if (viewState.type === 'image-models') {
      setViewState({ type: 'image-configure', image: viewState.image });
      return;
    }

    if (viewState.type === 'image-configure') {
      setViewState({ type: 'providers', tab: 'image' });
    }
  };

  // --- Render Helpers ---

  const SidebarItem = ({
    active,
    icon: Icon,
    label,
    onClick
  }: {
    active: boolean;
    icon: any;
    label: string;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer",
        active
          ? "bg-primary/10 text-primary shadow-sm"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
    >
      <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
      <span>{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4 animate-in fade-in duration-300 ease-out" onClick={onClose}>
      <div
        className="bg-background/95 backdrop-blur-xl rounded-none md:rounded-3xl shadow-2xl w-full max-w-none md:max-w-5xl h-[100dvh] md:h-[85vh] min-h-0 flex flex-col md:flex-row overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ease-out border-0 md:border md:border-white/10 ring-0 md:ring-1 md:ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="hidden md:flex w-64 bg-muted/30 border-r border-border/50 flex-col p-6 gap-6">
          <div className="px-2">
            <h2 className="text-lg font-bold bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">
              Model Store
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Select your AI engine</p>
          </div>

          <div className="space-y-1">
            <div className="px-4 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Coding
            </div>
            <SidebarItem
              active={viewState.type === 'providers' && viewState.tab === 'cloud'}
              icon={Cloud}
              label="Cloud Providers"
              onClick={() => setViewState({ type: 'providers', tab: 'cloud' })}
            />
            <SidebarItem
              active={viewState.type === 'providers' && viewState.tab === 'local'}
              icon={Laptop}
              label="Local Engines"
              onClick={() => setViewState({ type: 'providers', tab: 'local' })}
            />
            <SidebarItem
              active={viewState.type === 'providers' && viewState.tab === 'custom'}
              icon={Settings}
              label="Custom Config"
              onClick={() => setViewState({ type: 'providers', tab: 'custom' })}
            />
            {onSelectImage && (
              <>
                <div className="px-4 pt-4 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Image
                </div>
                <SidebarItem
                  active={viewState.type === 'providers' && viewState.tab === 'image'}
                  icon={Sparkles}
                  label="Image Generation"
                  onClick={() => setViewState({ type: 'providers', tab: 'image' })}
                />
              </>
            )}
          </div>

          <div className="mt-auto">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/10">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-orange-500" />
                <span className="text-xs font-semibold text-orange-600">Secure & Private</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Your API keys are stored locally in your browser and never sent to our servers.
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-h-0 flex flex-col bg-background/50 relative">
          {/* Header */}
          <div className="border-b border-border/50 flex flex-col gap-3 md:h-16 md:flex-row md:items-center md:justify-between px-4 py-4 md:px-8 md:py-0 bg-background/50 backdrop-blur-sm">
            <div className="flex items-center gap-3 md:gap-4 min-w-0">
              {viewState.type !== 'providers' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 -ml-2 rounded-full hover:bg-muted"
                  onClick={handleBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <h1 className="text-base md:text-lg font-semibold truncate">
                {viewState.type === 'providers' && viewState.tab === 'cloud' && 'Explore Cloud Models'}
                {viewState.type === 'providers' && viewState.tab === 'local' && 'Local AI Engines'}
                {viewState.type === 'providers' && viewState.tab === 'custom' && 'Custom Configuration'}
                {viewState.type === 'providers' && viewState.tab === 'image' && 'Image Generation'}
                {viewState.type === 'models' && `${viewState.provider.name} Model ID`}
                {viewState.type === 'configure' && `Configure ${viewState.provider.name}`}
                {viewState.type === 'image-configure' && `Configure ${viewState.image.name}`}
                {viewState.type === 'image-models' && `${viewState.image.name} Model`}
              </h1>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              {viewState.type === 'providers' && (
                <div className="relative flex-1 md:flex-none">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search providers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 w-full md:w-64 rounded-full bg-muted/50 border border-border/50 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {viewState.type === 'providers' && (
            <div className="md:hidden border-b border-border/50 bg-background/70 px-4 py-3">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setViewState({ type: 'providers', tab: 'cloud' })}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    viewState.tab === 'cloud'
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  Cloud
                </button>
                <button
                  onClick={() => setViewState({ type: 'providers', tab: 'local' })}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    viewState.tab === 'local'
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  Local
                </button>
                <button
                  onClick={() => setViewState({ type: 'providers', tab: 'custom' })}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    viewState.tab === 'custom'
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  Custom
                </button>
                {onSelectImage && (
                  <button
                    onClick={() => setViewState({ type: 'providers', tab: 'image' })}
                    className={cn(
                      "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      viewState.tab === 'image'
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    Image
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Content Scroll Area */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8">
            {viewState.type === 'providers' && viewState.tab === 'cloud' && (
              <div className="space-y-8 md:space-y-10">
                {PROVIDER_TABS.cloud.sections.map((section, idx) => {
                  const providers = getProvidersByIds(section.providerIds)
                    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

                  if (providers.length === 0) return null;

                  return (
                    <div key={idx} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                      <div className="flex items-baseline justify-between border-b border-border/40 pb-2">
                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                          {section.title === 'Premium Providers' && <Zap className="h-4 w-4 text-yellow-500" />}
                          {section.title === 'Free Models' && <Gift className="h-4 w-4 text-green-500" />}
                          {section.title}
                        </h3>
                        {section.description && (
                          <span className="text-xs text-muted-foreground">{section.description}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3 md:gap-4">
                        {providers.map((provider) => (
                          <button
                            key={provider.id}
                            onClick={() => handleProviderClick(provider)}
                            className="group relative flex items-start gap-4 p-4 md:p-5 rounded-2xl border border-border/50 bg-card/30 hover:bg-card/80 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 text-left overflow-hidden cursor-pointer"
                          >
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                            <div className="relative z-10 flex-shrink-0">
                              <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-background shadow-sm border border-border/50 p-2.5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                <img src={provider.icon} alt={provider.name} className="w-full h-full object-contain" />
                              </div>
                            </div>

                            <div className="relative z-10 flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3 mb-1">
                                <div className="min-w-0">
                                  <span className="font-bold text-base md:text-lg tracking-tight group-hover:text-primary transition-colors">{provider.name}</span>
                                </div>
                                <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                              </div>

                              {provider.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                                  {provider.description}
                                </p>
                              )}

                              {getProviderBadge(provider)}

                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {viewState.type === 'providers' && viewState.tab === 'image' && (
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-start md:items-center gap-4 p-5 md:p-6 rounded-2xl bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/20">
                  <div className="p-3 rounded-xl bg-orange-500/20 text-orange-500">
                    <Sparkles className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Image Generation</h3>
                    <p className="text-sm text-muted-foreground">
                      Pick an image model so the agent can generate pictures and add them to your app.
                      It&apos;s separate from your chat model — bring its key (or reuse one you&apos;ve already entered).
                    </p>
                  </div>
                </div>

                {/* None / disable */}
                <button
                  onClick={() => onSelectImage?.(null)}
                  className={cn(
                    "w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all cursor-pointer",
                    !currentImage
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/50 bg-card/30 hover:bg-card/60"
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                    <Ban className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">No image generation</div>
                    <div className="text-xs text-muted-foreground">The agent writes code only (default).</div>
                  </div>
                  {!currentImage && <Check className="h-4 w-4 text-primary" />}
                </button>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  {IMAGE_MODELS.map((m) => {
                    const isActive = currentImage?.id === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => handleImageProviderClick(m)}
                        className="group relative flex items-start gap-4 p-4 md:p-5 rounded-2xl border border-border/50 bg-card/30 hover:bg-card/80 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 text-left overflow-hidden cursor-pointer"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                        <div className="relative z-10 flex-shrink-0">
                          <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-background shadow-sm border border-border/50 p-2.5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                            <img src={m.icon} alt={m.name} className="w-full h-full object-contain" />
                          </div>
                        </div>

                        <div className="relative z-10 flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <span className="font-bold text-base md:text-lg tracking-tight group-hover:text-primary transition-colors">{m.name}</span>
                            <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                          </div>

                          {m.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                              {m.description}
                            </p>
                          )}

                          {isActive && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                              <Check className="h-3 w-3" />
                              {currentImage?.modelId || 'Active'}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <p className="text-[11px] text-muted-foreground text-center">
                  Pick a provider, add its key, then choose a model. OpenAI is verified end-to-end today;
                  Nano Banana &amp; Grok are wired in — add their keys to try them.
                </p>
              </div>
            )}

            {viewState.type === 'providers' && viewState.tab === 'local' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-start md:items-center gap-4 p-5 md:p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/20">
                  <div className="p-3 rounded-xl bg-blue-500/20 text-blue-500">
                    <Laptop className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Run Locally</h3>
                    <p className="text-sm text-muted-foreground">
                      Run AI models directly on your machine for privacy and zero latency.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  {getProvidersByIds(PROVIDER_TABS.local.providerIds)
                    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((provider) => (
                      <button
                        key={provider.id}
                        onClick={() => handleProviderClick(provider)}
                        className="group relative flex items-start gap-4 p-4 md:p-5 rounded-2xl border border-border/50 bg-card/30 hover:bg-card/80 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 text-left overflow-hidden cursor-pointer"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                        <div className="relative z-10 flex-shrink-0">
                          <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-background shadow-sm border border-border/50 p-2.5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                            <img src={provider.icon} alt={provider.name} className="w-full h-full object-contain" />
                          </div>
                        </div>

                        <div className="relative z-10 flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <div className="min-w-0">
                              <span className="font-bold text-base md:text-lg tracking-tight group-hover:text-primary transition-colors">{provider.name}</span>
                            </div>
                            <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                          </div>

                          {provider.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                              {provider.description}
                            </p>
                          )}

                          {getProviderBadge(provider)}

                          <div className="flex flex-wrap gap-2">
                            {provider.browserOnly && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 uppercase tracking-wide">
                                <Globe className="h-3 w-3" /> Browser Only
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {viewState.type === 'providers' && viewState.tab === 'custom' && (
              <div className="w-full max-w-xl mx-auto space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 py-2 md:py-8">
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/50 mb-4 shadow-inner">
                    <Settings className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h2 className="text-2xl font-bold">Custom Configuration</h2>
                  <p className="text-muted-foreground">
                    Connect to any OpenAI-compatible API endpoint.
                  </p>
                </div>

                <div className="space-y-6 bg-card/50 backdrop-blur-sm p-5 md:p-8 rounded-3xl border border-border/50 shadow-xl">
                  <div className="space-y-2">
                    <label className="text-sm font-medium ml-1">Model ID</label>
                    <div className="relative">
                      <Cpu className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={customModelId}
                        onChange={(e) => setCustomModelId(e.target.value)}
                        placeholder="e.g., gpt-4, claude-3-opus, custom-model"
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium ml-1">API Endpoint</label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={customEndpointUrl}
                        onChange={(e) => setCustomEndpointUrl(e.target.value)}
                        placeholder="https://api.example.com/v1"
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>

                  <ApiKeyField value={customEndpointKey} onChange={setCustomEndpointKey} placeholder="sk-..." />

                  <Button
                    className="w-full h-12 text-base font-medium shadow-lg shadow-primary/20 mt-2"
                    size="lg"
                    disabled={!customModelId.trim() || !customEndpointKey.trim() || !customEndpointUrl.trim()}
                    onClick={() => {
                      // The dedicated `custom` provider routes the agent init to
                      // initializeCustomProvider, which actually honors the URL.
                      onSelect({
                        provider: PROVIDERS[PROVIDER_IDS.CUSTOM],
                        modelId: customModelId.trim(),
                        apiKey: customEndpointKey.trim(),
                        customUrl: customEndpointUrl.trim()
                      });
                      onClose();
                    }}
                  >
                    Connect Custom Model
                  </Button>
                </div>
              </div>
            )}

            {viewState.type === 'configure' && (
              <div className="w-full max-w-xl mx-auto space-y-6 md:space-y-8 animate-in fade-in slide-in-from-right-4 duration-300 py-2 md:py-8">
                <ConfigureHero
                  icon={viewState.provider.icon}
                  name={viewState.provider.name}
                  subtitle="Enter your credentials to connect."
                />

                <div className="space-y-6 bg-card/50 backdrop-blur-sm p-5 md:p-8 rounded-3xl border border-border/50 shadow-xl">
                  {getApiKeyPolicy(viewState.provider) !== 'none' && (
                    <ApiKeyField
                      value={apiKey}
                      onChange={setApiKey}
                      label={getApiKeyPolicy(viewState.provider) === 'required' ? 'API Key' : 'API Key (optional)'}
                      placeholder={
                        viewState.provider.apiKeyHint ??
                        (getApiKeyPolicy(viewState.provider) === 'required' ? 'Enter your API key' : 'Optional')
                      }
                      getKeyUrl={viewState.provider.getKeyUrl}
                    />
                  )}

                  {viewState.provider.defaultUrl && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium ml-1">Server URL</label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                          type="text"
                          value={customUrl || viewState.provider.defaultUrl}
                          onChange={(e) => setCustomUrl(e.target.value)}
                          placeholder={viewState.provider.defaultUrl}
                          className={INPUT_CLASS}
                        />
                      </div>
                    </div>
                  )}

                  <Button
                    className="w-full h-12 text-base font-medium shadow-lg shadow-primary/20 mt-2"
                    size="lg"
                    disabled={getApiKeyPolicy(viewState.provider) === 'required' && !apiKey.trim()}
                    onClick={handleConfigureContinue}
                  >
                    Continue to Models
                  </Button>
                </div>
              </div>
            )}

            {viewState.type === 'image-configure' && (
              <div className="w-full max-w-xl mx-auto space-y-6 md:space-y-8 animate-in fade-in slide-in-from-right-4 duration-300 py-2 md:py-8">
                <ConfigureHero
                  icon={viewState.image.icon}
                  name={viewState.image.name}
                  subtitle="Enter your API key to connect."
                />

                <div className="space-y-6 bg-card/50 backdrop-blur-sm p-5 md:p-8 rounded-3xl border border-border/50 shadow-xl">
                  <ApiKeyField value={apiKey} onChange={setApiKey} getKeyUrl={viewState.image.getKeyUrl} />

                  <Button
                    className="w-full h-12 text-base font-medium shadow-lg shadow-primary/20 mt-2"
                    size="lg"
                    disabled={!apiKey.trim()}
                    onClick={handleImageConfigureContinue}
                  >
                    Continue to Models
                  </Button>
                </div>
              </div>
            )}

            {viewState.type === 'image-models' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <ProviderHero
                  icon={viewState.image.icon}
                  name={viewState.image.name}
                  description={viewState.image.description}
                />

                {/* Example models — static hints; the user enters a model ID below */}
                <div className="space-y-4 rounded-2xl border border-border/50 bg-gradient-to-br from-muted/30 via-background/80 to-background p-5 shadow-sm">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                      Example Models
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      A few options to get you started — enter any model ID below.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {viewState.image.models.map((ex) => (
                      <span
                        key={ex.modelId}
                        title={ex.description}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-3 py-1.5 shadow-sm"
                      >
                        <span className="text-xs font-semibold text-foreground">{ex.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{ex.modelId}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <ModelIdEntry
                  value={customModelInput}
                  onChange={setCustomModelInput}
                  placeholder={viewState.image.customModelPlaceholder || 'e.g. specific-model-v1'}
                  modelListUrl={viewState.image.modelListUrl}
                />

                <StickyAction disabled={!customModelInput.trim()} onClick={handleImageContinue}>
                  Use {customModelInput.trim() || 'Model'}
                </StickyAction>
              </div>
            )}

            {viewState.type === 'models' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <ProviderHero
                  icon={viewState.provider.icon}
                  name={viewState.provider.name}
                  description={viewState.provider.description}
                  noteUrl={viewState.provider.noteUrl}
                />

                {viewState.provider.models.length > 1 && (
                  <div className="space-y-4 rounded-2xl border border-border/50 bg-gradient-to-br from-muted/30 via-background/80 to-background p-5 shadow-sm">
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                        Recommended Models
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        If you are not sure where to start, these families are usually solid picks.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {RECOMMENDED_MODEL_FAMILIES.map((modelFamily) => (
                        <span
                          key={modelFamily.name}
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shadow-sm",
                            modelFamily.className,
                          )}
                        >
                          {modelFamily.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <ModelIdEntry
                  value={customModelInput}
                  onChange={setCustomModelInput}
                  placeholder={viewState.provider.customModelPlaceholder || 'e.g. specific-model-v1'}
                  modelListUrl={viewState.provider.modelListUrl}
                />

                <StickyAction disabled={!customModelInput.trim()} onClick={handleContinue}>
                  Continue with {customModelInput.trim() || 'Model'}
                </StickyAction>
              </div>
            )}


          </div>
        </div>
      </div>
    </div>
  );
}
