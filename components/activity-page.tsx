"use client";

import { useMemo, useState } from "react";
import { Download, FileText, History, Search } from "lucide-react";
import { ActivityFeed } from "@/components/activity-feed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageSkeleton } from "@/components/ui/states";
import {
  buildActivityEntries,
  exportActivityCsv,
  exportActivityPdf,
  matchesActivitySearch
} from "@/lib/activity";
import { useKeroStore } from "@/lib/storage";

export function ActivityPage() {
  const { state, hydrated } = useKeroStore();
  const [query, setQuery] = useState("");
  const [actionType, setActionType] = useState("all");
  const [matterId, setMatterId] = useState("all");
  const [teamMemberId, setTeamMemberId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const entries = useMemo(
    () =>
      buildActivityEntries({
        firmActivityLog: state.firmActivityLog,
        timelineEvents: state.timelineEvents,
        matters: state.matters,
        clients: state.clients,
        teamMembers: state.teamMembers
      }),
    [state.clients, state.firmActivityLog, state.matters, state.teamMembers, state.timelineEvents]
  );

  const actionTypes = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.actionType))).sort(),
    [entries]
  );

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (!matchesActivitySearch(entry, query)) return false;
        if (actionType !== "all" && entry.actionType !== actionType) return false;
        if (matterId !== "all" && entry.matterId !== matterId) return false;
        if (teamMemberId !== "all" && entry.actorId !== teamMemberId) return false;
        const time = new Date(entry.createdAt).getTime();
        if (from && time < new Date(`${from}T00:00:00`).getTime()) return false;
        if (to && time > new Date(`${to}T23:59:59`).getTime()) return false;
        return true;
      }),
    [actionType, entries, from, matterId, query, teamMemberId, to]
  );

  if (!hydrated) return <PageSkeleton rows={7} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary">
              <History className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-3xl font-bold text-slate-950">Activity</h1>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Firm-wide action log across matters, documents, AI, billing, calendar and compliance.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => exportActivityCsv(filteredEntries)}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button type="button" onClick={() => exportActivityPdf(filteredEntries)}>
            <FileText className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <section className="surface-card p-4">
        <div className="grid gap-3 xl:grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr_0.75fr_0.75fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search client or reference"
              className="pl-9"
            />
          </div>
          <Select value={actionType} onChange={(event) => setActionType(event.target.value)}>
            <option value="all">All action types</option>
            {actionTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </Select>
          <Select value={matterId} onChange={(event) => setMatterId(event.target.value)}>
            <option value="all">All matters</option>
            {state.matters.map((matter) => (
              <option key={matter.id} value={matter.id}>{matter.fileReference}</option>
            ))}
          </Select>
          <Select value={teamMemberId} onChange={(event) => setTeamMemberId(event.target.value)}>
            <option value="all">All team members</option>
            {state.teamMembers.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </Select>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{filteredEntries.length} of {entries.length} actions shown</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setActionType("all");
              setMatterId("all");
              setTeamMemberId("all");
              setFrom("");
              setTo("");
            }}
          >
            Clear filters
          </Button>
        </div>
      </section>

      <ActivityFeed
        entries={filteredEntries}
        emptyTitle="No activity found"
        emptyDescription="Try changing the filters or perform an action elsewhere in Kero."
      />
    </div>
  );
}
