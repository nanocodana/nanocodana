'use client'

import { Package, Trash2, Plus, AlertTriangle, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DependencyPanelProps {
  dependencies: Record<string, { version: string; handle?: string; }>;
  missingDependencies?: Record<string, { dependents: string[]; wantedVersion: string; }>;
  onAddDependency?: (name: string, version: string) => void;
  onRemoveDependency?: (name: string) => void;
}

export function DependencyPanel({
  dependencies,
  missingDependencies,
  onAddDependency,
  onRemoveDependency
}: DependencyPanelProps) {
  const installedCount = Object.keys(dependencies || {}).length;
  const missingCount = Object.keys(missingDependencies || {}).length;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Box className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Dependencies</h3>
        </div>
        <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full">
          {installedCount}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Missing Dependencies */}
        {missingCount > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-yellow-600 uppercase tracking-wider">
              <AlertTriangle className="h-3 w-3" />
              <span>Missing ({missingCount})</span>
            </div>
            <div className="space-y-2">
              {Object.entries(missingDependencies || {}).map(([name, info]) => (
                <div key={name} className="flex items-center justify-between p-3 rounded-lg border border-yellow-200 bg-yellow-50">
                  <div className="min-w-0 flex-1 mr-3">
                    <div className="font-mono text-sm font-medium text-yellow-900 truncate">{name}</div>
                    <div className="text-xs text-yellow-700 font-mono mt-0.5">{info.wantedVersion}</div>
                    <div className="text-[10px] text-yellow-600 mt-1 italic truncate">
                      Required by: {info.dependents.join(', ')}
                    </div>
                  </div>
                  {onAddDependency && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-yellow-300 hover:bg-yellow-100 text-yellow-800"
                      onClick={() => onAddDependency(name, info.wantedVersion)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Installed Dependencies */}
        {installedCount > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Package className="h-3 w-3" />
              <span>Installed ({installedCount})</span>
            </div>
            <div className="space-y-2">
              {Object.entries(dependencies || {}).map(([name, info]) => (
                <div key={name} className="group flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className="min-w-0 flex-1 mr-3">
                    <div className="font-mono text-sm font-medium truncate">{name}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">{info.version}</div>
                  </div>
                  {onRemoveDependency && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onRemoveDependency(name)}
                      title="Remove dependency"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {installedCount === 0 && missingCount === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Box className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-sm font-medium">No dependencies yet</p>
            <p className="text-xs mt-1 opacity-70">
              The AI will add packages as needed
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
