"use client";

import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PinMatterButton({
  pinned,
  onToggle,
  label,
  className
}: {
  pinned: boolean;
  onToggle: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size={label ? "sm" : "icon"}
      aria-pressed={pinned}
      aria-label={pinned ? "Unpin matter" : "Pin matter"}
      title={pinned ? "Unpin matter" : "Pin matter"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        pinned
          ? "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100 hover:text-amber-800"
          : "text-slate-500 hover:text-primary",
        className
      )}
    >
      <Star className={cn("h-4 w-4", pinned ? "fill-current" : "")} />
      {label ? <span>{label}</span> : null}
    </Button>
  );
}
