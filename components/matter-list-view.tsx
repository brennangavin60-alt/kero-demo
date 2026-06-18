"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FilePlus2, FolderKanban, Search, SearchX } from "lucide-react";
import { PinMatterButton } from "@/components/pin-matter-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState, PageSkeleton } from "@/components/ui/states";
import { MatterStatusBadge } from "@/components/status-badges";
import { formatDisplayDate } from "@/lib/dates";
import type { MatterFilter, StatusFilter } from "@/lib/matter-filters";
import { getFirstMatterPrompt } from "@/lib/personalisation";
import { getCurrentStage, getMatterTitle, MATTER_LABELS } from "@/lib/stages";
import { useKeroStore } from "@/lib/storage";
import type { Matter } from "@/lib/types";

export function MatterListView({
  title = "Matters",
  initialTypeFilter = "all",
  initialStatusFilter = "All",
  initialQuery = ""
}: {
  title?: string;
  initialTypeFilter?: MatterFilter;
  initialStatusFilter?: StatusFilter;
  initialQuery?: string;
}) {
  const { state, hydrated, hasPermission, togglePinnedMatter } = useKeroStore();
  const [query, setQuery] = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState<MatterFilter>(initialTypeFilter);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);

  useEffect(() => {
    setQuery(initialQuery);
    setTypeFilter(initialTypeFilter);
    setStatusFilter(initialStatusFilter);
  }, [initialQuery, initialStatusFilter, initialTypeFilter]);

  const clientsById = useMemo(
    () => new Map(state.clients.map((client) => [client.id, client])),
    [state.clients]
  );

  const filteredMatters = useMemo(() => {
    const normalised = query.trim().toLowerCase();
    const pinnedOrder = new Map((state.pinnedMatterIds ?? []).map((matterId, index) => [matterId, index]));
    return state.matters.filter((matter) => {
      const client = clientsById.get(matter.clientId);
      const searchTarget = [
        matter.fileReference,
        client?.fullName,
        client?.address,
        client?.email,
        client?.phone,
        client?.ppsNumber,
        Object.values(matter.fields).join(" "),
        matter.notes.map((note) => note.body).join(" ")
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = normalised ? searchTarget.includes(normalised) : true;
      const matchesType =
        typeFilter === "all"
          ? true
          : typeFilter === "conveyancing-all"
            ? matter.type === "conveyancing" || matter.type === "purchase"
            : matter.type === typeFilter;
      const matchesStatus = statusFilter === "All" ? true : matter.status === statusFilter;
      return matchesQuery && matchesType && matchesStatus;
    }).sort((a, b) => {
      const aPinnedIndex = pinnedOrder.get(a.id);
      const bPinnedIndex = pinnedOrder.get(b.id);
      if (aPinnedIndex !== undefined || bPinnedIndex !== undefined) {
        if (aPinnedIndex === undefined) return 1;
        if (bPinnedIndex === undefined) return -1;
        return aPinnedIndex - bPinnedIndex;
      }
      return sortMatters(a, b, state.settings.dashboard.defaultMatterSort, clientsById);
    });
  }, [
    clientsById,
    query,
    state.matters,
    state.pinnedMatterIds,
    state.settings.dashboard.defaultMatterSort,
    statusFilter,
    typeFilter
  ]);

  if (!hydrated) {
    return <PageSkeleton rows={6} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">{title}</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Full searchable and filterable matter list.
          </p>
        </div>
        {hasPermission("createMatter") ? (
          <Link href="/new" className={buttonVariants()}>
            <FilePlus2 className="h-4 w-4" />
            New Matter
          </Link>
        ) : null}
      </div>

      <section className="surface-card p-4">
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search client, reference or property"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["conveyancing-all", "Conveyancing"],
              ["conveyancing", "House Sale"],
              ["purchase", "House Purchase"],
              ["litigation", "Litigation"],
              ["adhoc", "Ad Hoc"]
            ].map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={typeFilter === value ? "default" : "outline"}
                size="sm"
                onClick={() => setTypeFilter(value as MatterFilter)}
              >
                {label}
              </Button>
            ))}
          </div>
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="lg:w-40"
          >
            <option>All</option>
            <option>Open</option>
            <option>In Progress</option>
            <option>Closed</option>
          </Select>
        </div>

        <div className="overflow-hidden rounded-md border">
          <div className="hidden grid-cols-[130px_1fr_160px_180px_120px_140px_44px] border-b bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500 lg:grid">
            <span>Reference</span>
            <span>Client</span>
            <span>Type</span>
            <span>Stage</span>
            <span>Status</span>
            <span>Date opened</span>
            <span className="sr-only">Pinned</span>
          </div>
          {filteredMatters.length === 0 ? (
            <EmptyState
              icon={query.trim() ? SearchX : FolderKanban}
              title={
                query.trim()
                  ? "No matching matters"
                  : state.matters.length === 0
                    ? getFirstMatterPrompt(state.settings)
                    : "No matters to show"
              }
              description={
                query.trim()
                  ? "Try a different client name, file reference, property, or status filter."
                  : state.matters.length === 0
                    ? "Create a new matter to start building the full file list."
                    : "Try changing the type or status filters."
              }
              className="rounded-none border-0"
            />
          ) : (
            <div className="divide-y">
              {filteredMatters.map((matter) => {
                const client = clientsById.get(matter.clientId);
                const isPinned = (state.pinnedMatterIds ?? []).includes(matter.id);
                return (
                  <div
                    key={matter.id}
                    className="list-row relative grid gap-2 px-3 py-3 pr-14 text-sm lg:grid-cols-[130px_1fr_160px_180px_120px_140px_44px] lg:items-center lg:pr-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/matters/${matter.id}`} className="font-semibold text-primary">
                        {matter.fileReference}
                      </Link>
                      {isPinned ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-700">
                          Pinned
                        </span>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={client ? `/clients/${client.id}` : "#"}
                        className="font-medium text-slate-950 hover:text-primary"
                      >
                        {client?.fullName ?? "Unknown client"}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">
                        {getMatterTitle(matter)}
                      </div>
                    </div>
                    <span>{MATTER_LABELS[matter.type]}</span>
                    <span>{getCurrentStage(matter)}</span>
                    <MatterStatusBadge status={matter.status} />
                    <span className="text-muted-foreground">{formatDisplayDate(matter.dateOpened)}</span>
                    <span className="absolute right-3 top-3 flex justify-start lg:static lg:justify-end">
                      <PinMatterButton
                        pinned={isPinned}
                        onToggle={() => togglePinnedMatter(matter.id)}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function sortMatters(
  a: Matter,
  b: Matter,
  sort: "dateOpened" | "clientName" | "stage" | "matterType",
  clientsById: Map<string, { fullName: string }>
) {
  if (sort === "clientName") {
    return (clientsById.get(a.clientId)?.fullName ?? "").localeCompare(
      clientsById.get(b.clientId)?.fullName ?? ""
    );
  }
  if (sort === "stage") return a.stageIndex - b.stageIndex;
  if (sort === "matterType") return MATTER_LABELS[a.type].localeCompare(MATTER_LABELS[b.type]);
  return new Date(b.dateOpened).getTime() - new Date(a.dateOpened).getTime();
}
