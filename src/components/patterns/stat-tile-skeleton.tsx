import { cn } from "@/lib/utils";

/** Matches StatTile's layout exactly — no spinner-only pages (design-system.md §7). */
export function StatTileSkeleton({ variant = "default" }: { variant?: "default" | "inverse" }) {
  const inverse = variant === "inverse";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-2xl border p-5",
        inverse ? "border-transparent bg-inverse" : "border-border/80 bg-card"
      )}
    >
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className={cn("h-2.5 w-16 animate-pulse rounded-full", inverse ? "bg-white/10" : "bg-muted")} />
        <div className={cn("h-8 w-24 animate-pulse rounded-md", inverse ? "bg-white/10" : "bg-muted")} />
      </div>
      <div className={cn("size-9 shrink-0 animate-pulse rounded-full", inverse ? "bg-white/10" : "bg-muted")} />
    </div>
  );
}
