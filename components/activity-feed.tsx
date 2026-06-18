"use client";

import Link from "next/link";
import {
  BotMessageSquare,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FilePlus2,
  FileText,
  FolderKanban,
  History,
  ListChecks,
  ReceiptText,
  Send,
  ShieldCheck,
  Upload,
  UserRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatActivityTime, type ActivityEntry } from "@/lib/activity";
import { cn } from "@/lib/utils";

export function ActivityFeed({
  entries,
  compact = false,
  emptyTitle = "No recent actions",
  emptyDescription = "Actions performed in Kero will appear here automatically."
}: {
  entries: ActivityEntry[];
  compact?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={History}
        title={emptyTitle}
        description={emptyDescription}
        className="py-6"
      />
    );
  }

  return (
    <div className={cn("divide-y overflow-hidden rounded-md border bg-white shadow-soft", compact && "text-sm")}>
      {entries.map((entry) => (
        <ActivityFeedRow key={entry.id} entry={entry} compact={compact} />
      ))}
    </div>
  );
}

function ActivityFeedRow({ entry, compact }: { entry: ActivityEntry; compact: boolean }) {
  const Icon = activityIcon(entry.actionType, entry.description);
  const matterHref = entry.matter ? `/matters/${entry.matter.id}` : undefined;
  const content = (
    <div
      className={cn(
        "grid gap-3 px-3 py-3 transition-colors duration-200 hover:bg-slate-50",
        compact
          ? "grid-cols-[2rem_minmax(0,1fr)_auto] items-center"
          : "md:grid-cols-[2.25rem_minmax(0,1fr)_12rem_9rem] md:items-center"
      )}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-slate-950">{entry.description}</span>
        {compact ? null : (
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {entry.matter ? (
              <span>
                {entry.matter.fileReference}
                {entry.client ? ` - ${entry.client.fullName}` : ""}
              </span>
            ) : entry.client ? (
              <span>{entry.client.fullName}</span>
            ) : (
              <span>Firm-wide</span>
            )}
            <span>By {entry.actorName}</span>
          </span>
        )}
      </span>
      {compact ? (
        <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
          {formatActivityTime(entry.createdAt)}
        </span>
      ) : (
        <>
          <span className="hidden min-w-0 md:block">
            {entry.matter ? (
              <span className="block truncate text-sm font-semibold text-primary">
                {entry.matter.fileReference}
              </span>
            ) : (
              <Badge>Firm-wide</Badge>
            )}
            {entry.client ? (
              <span className="block truncate text-xs text-muted-foreground">{entry.client.fullName}</span>
            ) : null}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {formatActivityTime(entry.createdAt)}
          </span>
        </>
      )}
    </div>
  );

  if (!matterHref) return content;
  return (
    <Link href={matterHref} className="block">
      {content}
    </Link>
  );
}

function activityIcon(actionType: string, description: string): LucideIcon {
  const value = `${actionType} ${description}`.toLowerCase();
  if (value.includes("kero ai")) return BotMessageSquare;
  if (value.includes("conflict")) return ShieldCheck;
  if (value.includes("aml")) return ShieldCheck;
  if (value.includes("checklist")) return ClipboardCheck;
  if (value.includes("invoice") || value.includes("payment")) return ReceiptText;
  if (value.includes("time logged") || value.includes("time entry")) return Clock3;
  if (value.includes("calendar") || value.includes("date")) return CalendarDays;
  if (value.includes("template") || value.includes("upload")) return Upload;
  if (value.includes("letter") && value.includes("sent")) return Send;
  if (value.includes("letter")) return FileText;
  if (value.includes("note")) return FileCheck2;
  if (value.includes("client")) return UserRound;
  if (value.includes("stage")) return ListChecks;
  if (value.includes("opened")) return FilePlus2;
  if (value.includes("closed")) return CheckCircle2;
  return FolderKanban;
}
