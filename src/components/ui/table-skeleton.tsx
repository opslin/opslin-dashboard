export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, j) => (
          <div key={j} className="h-4 bg-muted animate-pulse rounded flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 mt-3">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-4 bg-muted/60 animate-pulse rounded flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
