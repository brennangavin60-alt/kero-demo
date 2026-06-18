"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  FilePlus2,
  History,
  Home,
  KeyRound,
  Layers3,
  ReceiptText,
  Scale,
  Sparkles,
  Star
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ActivityFeed } from "@/components/activity-feed";
import { PinMatterButton } from "@/components/pin-matter-button";
import { MatterStatusBadge } from "@/components/status-badges";
import { useToast } from "@/components/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, PageSkeleton } from "@/components/ui/states";
import { buildActivityEntries } from "@/lib/activity";
import { formatCurrency, getBillingSummary } from "@/lib/billing";
import {
  buildCalendarEvents,
  calendarEventStyles,
  daysUntilEvent,
  eventUrgencyClass,
  formatDaysUntil,
  formatEventTime,
  getUpcomingCalendarEvents
} from "@/lib/calendar";
import { formatDisplayDate, isWithinMonths } from "@/lib/dates";
import {
  getActiveMatterCount,
  getDashboardGreeting,
  getFirstMatterPrompt
} from "@/lib/personalisation";
import { getCurrentStage, MATTER_LABELS } from "@/lib/stages";
import { useKeroStore } from "@/lib/storage";
import type {
  Client,
  LitigationMatter,
  Matter,
  RecentMatterView,
  Settings,
  TimelineEvent
} from "@/lib/types";

type RecentlyViewedMatterRow = {
  view: RecentMatterView;
  matter: Matter;
  client: Client | undefined;
};

type PinnedMatterRow = {
  matter: Matter;
  client: Client | undefined;
  lastActivityLabel: string;
};

export function DashboardView() {
  const { state, hydrated, loadDemoData, hasPermission, togglePinnedMatter } = useKeroStore();
  const { toast } = useToast();

  const clientsById = useMemo(
    () => new Map(state.clients.map((client) => [client.id, client])),
    [state.clients]
  );
  const pinnedMatters = useMemo(() => {
    const mattersById = new Map(state.matters.map((matter) => [matter.id, matter]));
    return (state.pinnedMatterIds ?? [])
      .map((matterId) => {
        const matter = mattersById.get(matterId);
        if (!matter) return null;
        return {
          matter,
          client: clientsById.get(matter.clientId),
          lastActivityLabel: formatLastActivityLabel(getLastMatterActivityTime(matter, state.timelineEvents))
        };
      })
      .filter((item): item is PinnedMatterRow => item !== null);
  }, [clientsById, state.matters, state.pinnedMatterIds, state.timelineEvents]);
  const widgetSettings = state.settings.dashboard.widgets;
  const summaryWidgets = new Set<keyof typeof widgetSettings>([
    "activeMatters",
    "mattersByType",
    "urgentMatters",
    "lettersSent",
    "billingSummary",
    "calendarEvents",
    "recentlyViewed"
  ]);
  const showWidget = (key: keyof typeof widgetSettings) =>
    widgetSettings[key] &&
    (state.settings.dashboard.defaultView === "detailed" || summaryWidgets.has(key));

  const counts = useMemo(
    () => ({
      total: state.matters.length,
      sale: state.matters.filter((matter) => matter.type === "conveyancing").length,
      purchase: state.matters.filter((matter) => matter.type === "purchase").length,
      litigation: state.matters.filter((matter) => matter.type === "litigation").length,
      adhoc: state.matters.filter((matter) => matter.type === "adhoc").length
    }),
    [state.matters]
  );
  const activeMatterCount = useMemo(
    () => getActiveMatterCount(state.matters),
    [state.matters]
  );
  const attentionMatterCount = useMemo(
    () => state.matters.filter((matter) => needsDashboardAttention(matter, state.settings)).length,
    [state.matters, state.settings]
  );
  const amlOutstandingCount = useMemo(
    () =>
      state.settings.notifications.amlIncompleteWarnings
        ? state.matters.filter((matter) => matter.status !== "Closed" && !matter.aml.verified).length
        : 0,
    [state.matters, state.settings.notifications.amlIncompleteWarnings]
  );
  const lettersSentCount = useMemo(
    () => Object.values(state.documentStatuses).filter((status) => status === "Sent").length,
    [state.documentStatuses]
  );
  const billingSummary = useMemo(
    () => getBillingSummary(state.invoices),
    [state.invoices]
  );
  const upcomingCalendarEvents = useMemo(
    () => getUpcomingCalendarEvents(buildCalendarEvents(state), 30).slice(0, 5),
    [state]
  );

  const urgentMatters = useMemo(() => {
    if (!state.settings.notifications.limitationWarnings) return [];
    return state.matters.filter(
      (matter): matter is LitigationMatter =>
        matter.type === "litigation" &&
        matter.status !== "Closed" &&
        isWithinMonths(
          matter.fields.limitationDate,
          state.settings.notifications.limitationWarningMonths
        )
    );
  }, [
    state.matters,
    state.settings.notifications.limitationWarningMonths,
    state.settings.notifications.limitationWarnings
  ]);

  const inactiveMatters = useMemo(() => {
    if (!state.settings.notifications.stageInactivityAlerts) return [];
    const cutoff = Date.now() - state.settings.notifications.stageInactivityDays * 24 * 60 * 60 * 1000;
    return state.matters.filter(
      (matter) => matter.status !== "Closed" && getLastStageMovementTime(matter, state.timelineEvents) < cutoff
    );
  }, [
    state.matters,
    state.timelineEvents,
    state.settings.notifications.stageInactivityAlerts,
    state.settings.notifications.stageInactivityDays
  ]);

  const recentActions = useMemo(
    () =>
      buildActivityEntries({
        firmActivityLog: state.firmActivityLog,
        timelineEvents: state.timelineEvents,
        matters: state.matters,
        clients: state.clients,
        teamMembers: state.teamMembers
      }).slice(0, 10),
    [state.clients, state.firmActivityLog, state.matters, state.teamMembers, state.timelineEvents]
  );

  const recentlyViewedMatters = useMemo(() => {
    const mattersById = new Map(state.matters.map((matter) => [matter.id, matter]));
    return [...(state.recentMatterViews ?? [])]
      .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime())
      .map((view) => {
        const matter = mattersById.get(view.matterId);
        if (!matter) return null;
        return {
          view,
          matter,
          client: clientsById.get(matter.clientId)
        };
      })
      .filter((item): item is RecentlyViewedMatterRow => item !== null)
      .slice(0, 5);
  }, [clientsById, state.matters, state.recentMatterViews]);

  const typeBreakdown = useMemo(
    () => [
      { label: "House sales", value: counts.sale, icon: Home },
      { label: "House purchases", value: counts.purchase, icon: KeyRound },
      { label: "Litigation", value: counts.litigation, icon: Scale },
      { label: "Ad Hoc", value: counts.adhoc, icon: Sparkles }
    ],
    [counts.adhoc, counts.litigation, counts.purchase, counts.sale]
  );

  const stageBreakdown = useMemo(() => {
    const byStage = new Map<string, number>();
    state.matters.forEach((matter) => {
      const stage = getCurrentStage(matter);
      byStage.set(stage, (byStage.get(stage) ?? 0) + 1);
    });
    return Array.from(byStage.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [state.matters]);

  if (!hydrated) return <PageSkeleton rows={5} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">
            {getDashboardGreeting(state.settings)}
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            You have {activeMatterCount} active matters and {attentionMatterCount} need attention today.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {state.settings.dashboard.showDemoData ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                loadDemoData();
                toast("Demo data loaded");
              }}
            >
              Load Demo Data
            </Button>
          ) : null}
          {hasPermission("createMatter") ? (
            <Link href="/new" className={buttonVariants()}>
              <FilePlus2 className="h-4 w-4" />
              New Matter
            </Link>
          ) : null}
        </div>
      </div>

      {pinnedMatters.length > 0 ? (
        <section className="surface-card p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                <Star className="h-5 w-5 fill-current" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-950">Pinned matters</h2>
                <p className="text-sm text-muted-foreground">
                  Files kept at the top for daily attention.
                </p>
              </div>
            </div>
            <Badge variant="default">{pinnedMatters.length} pinned</Badge>
          </div>
          <div className="grid gap-2">
            {pinnedMatters.map(({ matter, client, lastActivityLabel }) => (
              <div
                key={matter.id}
                className="interactive-card grid gap-2 rounded-md border border-amber-100 bg-white px-3 py-3 text-sm shadow-soft lg:grid-cols-[130px_1fr_170px_150px_150px_44px] lg:items-center"
              >
                <Link href={`/matters/${matter.id}`} className="font-semibold text-primary">
                  {matter.fileReference}
                </Link>
                <span className="min-w-0">
                  <Link
                    href={`/matters/${matter.id}`}
                    className="block font-medium text-slate-950 hover:text-primary"
                  >
                    {client?.fullName ?? "Unknown client"}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {MATTER_LABELS[matter.type]}
                  </span>
                </span>
                <span className="text-slate-700">{getCurrentStage(matter)}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <MatterStatusBadge status={matter.status} />
                </span>
                <span className="text-xs text-muted-foreground">
                  Last activity {lastActivityLabel}
                </span>
                <span className="flex justify-start lg:justify-end">
                  <PinMatterButton
                    pinned
                    onToggle={() => togglePinnedMatter(matter.id)}
                    className="border-amber-200"
                  />
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {showWidget("activeMatters") || showWidget("mattersByType") || showWidget("lettersSent") || (showWidget("amlOutstanding") && state.settings.notifications.amlIncompleteWarnings) ? (
        <section className="grid gap-3 md:grid-cols-5">
          {showWidget("activeMatters") ? (
            <Metric
              label="Active matters"
              value={activeMatterCount}
              icon={BriefcaseBusiness}
              href="/matters"
              featured
            />
          ) : null}
          {showWidget("mattersByType") ? (
            <>
              <Metric label="House sales" value={counts.sale} icon={Home} href="/matters?type=conveyancing" />
              <Metric label="House purchases" value={counts.purchase} icon={KeyRound} href="/matters?type=purchase" />
              <Metric label="Litigation" value={counts.litigation} icon={Scale} href="/matters?type=litigation" />
              <Metric label="Ad Hoc" value={counts.adhoc} icon={Sparkles} href="/matters?type=adhoc" />
            </>
          ) : null}
          {showWidget("lettersSent") ? (
            <Metric label="Letters sent" value={lettersSentCount} icon={CheckCircle2} href="/documents" />
          ) : null}
          {showWidget("amlOutstanding") && state.settings.notifications.amlIncompleteWarnings ? (
            <Metric label="AML outstanding" value={amlOutstandingCount} icon={AlertTriangle} href="/matters" />
          ) : null}
        </section>
      ) : null}

      {showWidget("billingSummary") ? (
        <section className="surface-card p-4">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ReceiptText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">Billing summary</h2>
              <p className="text-sm text-muted-foreground">
                Invoice totals across all matters.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Link href="/billing" className="interactive-card rounded-md border bg-white p-3 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                Outstanding
              </p>
              <p className="mt-1 text-xl font-bold text-slate-950">
                {formatCurrency(billingSummary.outstandingAmount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {billingSummary.outstandingCount} invoices
              </p>
            </Link>
            <Link href="/billing?status=Overdue" className="interactive-card rounded-md border bg-white p-3 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                Overdue
              </p>
              <p className="mt-1 text-xl font-bold text-red-700">
                {formatCurrency(billingSummary.overdueAmount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {billingSummary.overdueCount} invoices
              </p>
            </Link>
            <Link href="/billing?status=Paid" className="interactive-card rounded-md border bg-white p-3 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                Paid this month
              </p>
              <p className="mt-1 text-xl font-bold text-emerald-700">
                {formatCurrency(billingSummary.paidThisMonthAmount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {billingSummary.paidThisMonthCount} invoices
              </p>
            </Link>
          </div>
        </section>
      ) : null}

      {showWidget("calendarEvents") ? (
        <section className="surface-card p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-950">Upcoming events</h2>
                <p className="text-sm text-muted-foreground">
                  The next 5 calendar dates across matters and invoices.
                </p>
              </div>
            </div>
            <Link href="/calendar" className={buttonVariants({ variant: "outline", size: "sm" })}>
              View Calendar
            </Link>
          </div>
          {upcomingCalendarEvents.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No upcoming events"
              description="Matter dates, invoice due dates, and manual calendar events will appear here."
              className="py-6"
            />
          ) : (
            <div className="grid gap-2">
              {upcomingCalendarEvents.map((event) => {
                const days = daysUntilEvent(event.date);
                return (
                  <Link
                    key={event.id}
                    href={event.matterId ? `/matters/${event.matterId}` : "/calendar"}
                    className={`interactive-card flex flex-col gap-2 rounded-md border px-3 py-2 text-sm shadow-soft sm:flex-row sm:items-center sm:justify-between ${eventUrgencyClass(event.date)}`}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${calendarEventStyles[event.type].dot}`} />
                        <span className="truncate">{event.title}</span>
                      </span>
                      <span className="mt-1 block text-xs">
                        {formatEventTime(event.time)} · {event.client?.fullName ?? "No client"} · {event.matter?.fileReference ?? "No matter"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold">
                      {formatDisplayDate(event.date)} · {formatDaysUntil(days)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {showWidget("mattersByType") || showWidget("stageDistribution") ? (
        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          {showWidget("mattersByType") ? (
            <BreakdownCard
              title="Matters by type"
              description="Current matter mix by workflow."
              icon={BarChart3}
              total={counts.total}
              rows={typeBreakdown}
              emptyTitle={getFirstMatterPrompt(state.settings)}
            />
          ) : null}
          {showWidget("stageDistribution") ? (
            <BreakdownCard
              title="Matters by stage"
              description="Most common active stages."
              icon={Layers3}
              total={counts.total}
              rows={stageBreakdown}
              emptyTitle={getFirstMatterPrompt(state.settings)}
            />
          ) : null}
        </section>
      ) : null}

      {showWidget("urgentMatters") ? (
      <section className="surface-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Urgent matters</h2>
            <p className="text-sm text-muted-foreground">
              Limitation warnings and matters with stalled stage movement.
            </p>
          </div>
          {urgentMatters.length + inactiveMatters.length > 0 ? (
            <Badge variant="danger">{urgentMatters.length + inactiveMatters.length}</Badge>
          ) : null}
        </div>
        {urgentMatters.length === 0 && inactiveMatters.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No urgent matters"
            description="No active matters currently match the enabled warning rules."
          />
        ) : (
          <div className="grid gap-2">
            {urgentMatters.map((matter) => {
              const client = clientsById.get(matter.clientId);
              return (
                <Link
                  key={matter.id}
                  href={`/matters/${matter.id}`}
                  className="interactive-card flex flex-col gap-1 rounded-md border border-red-200 bg-white px-3 py-2 text-sm shadow-soft sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex items-center gap-2 font-medium text-red-900">
                    <AlertTriangle className="h-4 w-4" />
                    {matter.fileReference} · {client?.fullName ?? "Unknown client"}
                  </span>
                  <span className="text-red-700">
                    Limitation date {formatDisplayDate(matter.fields.limitationDate)}
                  </span>
                </Link>
              );
            })}
            {inactiveMatters.map((matter) => {
              const client = clientsById.get(matter.clientId);
              return (
                <Link
                  key={`inactive-${matter.id}`}
                  href={`/matters/${matter.id}`}
                  className="interactive-card flex flex-col gap-1 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm shadow-soft sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex items-center gap-2 font-medium text-amber-900">
                    <AlertTriangle className="h-4 w-4" />
                    {matter.fileReference} · {client?.fullName ?? "Unknown client"}
                  </span>
                  <span className="text-amber-700">
                    No stage movement in {state.settings.notifications.stageInactivityDays}+ days
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      ) : null}

      {showWidget("recentlyViewed") ? (
      <section className="surface-card p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <History className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">Recently viewed</h2>
              <p className="text-sm text-muted-foreground">
                The last 5 matters opened on this device.
              </p>
            </div>
          </div>
          <Link href="/matters" className={buttonVariants({ variant: "outline", size: "sm" })}>
            View All Matters
          </Link>
        </div>
        {recentlyViewedMatters.length === 0 ? (
          <EmptyState
            icon={History}
            title="No recently viewed matters"
            description="Open a matter and it will appear here automatically."
            className="py-6"
          />
        ) : (
          <div className="grid gap-2">
            {recentlyViewedMatters.map(({ view, matter, client }) => (
              <Link
                key={matter.id}
                href={`/matters/${matter.id}`}
                className="interactive-card grid gap-2 rounded-md border bg-white px-3 py-3 text-sm shadow-soft lg:grid-cols-[130px_1fr_180px_150px] lg:items-center"
              >
                <span className="font-semibold text-primary">{matter.fileReference}</span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-950">
                    {client?.fullName ?? "Unknown client"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {MATTER_LABELS[matter.type]}
                  </span>
                </span>
                <span className="text-slate-700">{getCurrentStage(matter)}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <MatterStatusBadge status={matter.status} />
                  <span className="text-xs text-muted-foreground">
                    {formatDisplayDate(view.viewedAt)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
      ) : null}

      {showWidget("recentActivity") ? (
      <section className="surface-card p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Recent actions</h2>
            <p className="text-sm text-muted-foreground">
              The last 10 actions performed across the firm.
            </p>
          </div>
          <Link href="/activity" className={buttonVariants({ variant: "outline", size: "sm" })}>
            View All
          </Link>
        </div>
        <ActivityFeed
          entries={recentActions}
          compact
          emptyTitle="No recent actions"
          emptyDescription="Create a matter, add a note, send a letter or confirm a Kero AI action to start the feed."
        />
      </section>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  href,
  featured
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  href: string;
  featured?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={`View ${label.toLowerCase()} in matters`}
      className="interactive-card surface-card stagger-in block p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
          <div className="mt-1 text-3xl font-bold text-slate-950">{value}</div>
        </div>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
            featured ? "bg-primary text-white" : "bg-primary/10 text-primary"
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Link>
  );
}

function BreakdownCard({
  title,
  description,
  icon: Icon,
  total,
  rows,
  emptyTitle
}: {
  title: string;
  description: string;
  icon: typeof BarChart3;
  total: number;
  rows: Array<{ label: string; value: number; icon?: LucideIcon }>;
  emptyTitle: string;
}) {
  return (
    <section className="surface-card p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {rows.length === 0 || total === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={emptyTitle}
          description="Matter breakdowns will appear when matters are available."
          className="py-6"
        />
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => {
            const RowIcon = row.icon;
            const percent = Math.round((row.value / total) * 100);
            return (
              <div key={row.label} className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-medium text-slate-800">
                    {RowIcon ? <RowIcon className="h-4 w-4 text-primary" /> : null}
                    <span className="truncate">{row.label}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                    {row.value} · {percent}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(percent, row.value > 0 ? 6 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getLastStageMovementTime(matter: Matter, events: TimelineEvent[]) {
  const lastStageEvent = events
    .filter(
      (event) =>
        event.matterId === matter.id &&
        (event.type === "stage_advanced" || event.type === "matter_opened")
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return new Date(lastStageEvent?.createdAt ?? matter.dateOpened).getTime();
}

function getLastMatterActivityTime(matter: Matter, events: TimelineEvent[]) {
  const eventTimes = events
    .filter((event) => event.matterId === matter.id)
    .map((event) => new Date(event.createdAt).getTime());
  return Math.max(
    new Date(matter.updatedAt ?? matter.dateOpened).getTime(),
    new Date(matter.dateOpened).getTime(),
    ...eventTimes
  );
}

function formatLastActivityLabel(timestamp: number) {
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000)));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function needsDashboardAttention(matter: Matter, settings: Settings) {
  if (matter.status === "Closed") return false;
  const amlNeedsAttention =
    settings.notifications.amlIncompleteWarnings && !matter.aml.verified;
  const limitationNeedsAttention =
    settings.notifications.limitationWarnings &&
    matter.type === "litigation" &&
    isWithinMonths(matter.fields.limitationDate, settings.notifications.limitationWarningMonths);
  return amlNeedsAttention || limitationNeedsAttention;
}
