export function CardSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="h-4 w-1/2 animate-pulse rounded-lg bg-border" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 w-3/4 animate-pulse rounded-lg bg-border" />
      ))}
      <div className="h-7 w-24 animate-pulse rounded-lg bg-border" />
    </div>
  );
}
