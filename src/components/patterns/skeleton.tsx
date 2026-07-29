import { cn } from "@/lib/utils";

/**
 * Thin, composable skeleton primitives (doc 02 §6) — standardize the ad-hoc
 * `animate-pulse` divs scattered across pages so loading states are built
 * from one shared vocabulary instead of hand-rolled each time. Adopt
 * opportunistically as pages are touched; existing `CardSkeleton`/
 * `TableSkeleton`/`StatTileSkeleton` (whole-layout skeletons) are unaffected
 * and may compose these underneath. Skeleton pulse is exempt from
 * reduced-motion (existing convention, doc 02 §5) — it's a brief loading
 * cue, not an idle decorative loop.
 */

export function SkeletonText({ className }: { className?: string }) {
  return <div className={cn("h-4 w-full animate-pulse rounded-md bg-muted", className)} />;
}

export function SkeletonTile({ className }: { className?: string }) {
  return <div className={cn("h-32 w-full animate-pulse rounded-lg bg-muted", className)} />;
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, j) => (
          <div key={j} className="h-4 flex-1 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-4 flex-1 animate-pulse rounded-md bg-muted/60" />
          ))}
        </div>
      ))}
    </div>
  );
}
