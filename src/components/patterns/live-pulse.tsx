import { cn } from "@/lib/utils";

interface LivePulseProps {
  className?: string;
  /** Visually-hidden label for screen readers — status must never be color alone. */
  label?: string;
}

/**
 * 6px accent-bright dot with a soft radar ping for "live/streaming"
 * affordances (design-system.md §5/§6). Built on Tailwind's stock
 * animate-ping (transform+opacity only) — no custom keyframe needed, and it
 * already respects prefers-reduced-motion via Tailwind's motion-safe guard.
 */
export function LivePulse({ className, label = "Live" }: LivePulseProps) {
  return (
    <span className={cn("relative inline-flex size-1.5", className)} role="status">
      <span className="absolute inline-flex h-full w-full rounded-full bg-brand-bright opacity-75 motion-safe:animate-ping motion-reduce:hidden" />
      <span className="relative inline-flex size-1.5 rounded-full bg-brand-bright" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
