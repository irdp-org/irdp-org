import { Construction, type LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon = Construction,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      <Icon className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
