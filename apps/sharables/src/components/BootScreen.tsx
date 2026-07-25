import NextImage from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Branded loading splash: the Sharables monkey zoom-pulsing (with a little lift
 * and wobble) inside its soft orange glow, so it reads as "loading" while
 * staying on-brand. Shown inside the preview pane while the Snack instance
 * spins up.
 *
 * `className` controls sizing: default full-screen; callers overlaying a pane
 * pass `absolute inset-0` etc.
 */
export function BootScreen({ className, label }: { className?: string; label?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading Sharables"
      className={cn(
        'flex flex-col items-center justify-center gap-4 bg-background',
        className ?? 'h-dvh w-full'
      )}
    >
      <div className="relative" style={{ animation: 'boot-monkey 1.1s ease-in-out infinite' }}>
        <div className="absolute inset-0 rounded-full bg-orange-500/25 blur-2xl" />
        <NextImage
          src="/logo.png"
          alt="Sharables"
          width={88}
          height={88}
          priority
          className="relative"
        />
      </div>
      {label ? <p className="text-xs font-medium text-muted-foreground">{label}</p> : null}
    </div>
  );
}
