import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("skeleton-shimmer rounded-md border border-slate-200/60", className)} />;
}

export function PageSkeleton({
  rows = 4,
  className
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("page-fade space-y-5", className)}>
      <div className="space-y-2">
        <SkeletonBlock className="h-9 w-56" />
        <SkeletonBlock className="h-4 w-72 max-w-full" />
      </div>
      <div className="surface-card p-4">
        <div className="grid gap-3">
          {Array.from({ length: rows }).map((_, index) => (
            <SkeletonBlock key={index} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
        className
      )}
    >
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-md border border-primary/10 bg-primary/10 text-primary shadow-soft">
        <Icon className="h-5 w-5" />
      </span>
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
