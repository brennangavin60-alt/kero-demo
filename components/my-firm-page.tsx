"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BotMessageSquare,
  Building2,
  CheckCircle2,
  Clock3,
  Euro,
  FileText,
  Mic,
  PieChart,
  ReceiptText,
  Scale,
  ShieldCheck,
  UserPlus,
  UsersRound
} from "lucide-react";
import { KeroLogo } from "@/components/kero-logo";
import { MatterStatusBadge } from "@/components/status-badges";
import { useToast } from "@/components/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, PageSkeleton } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  formatCurrency,
  getBillingSummary,
  getInvoiceDisplayStatus,
  getInvoicePaidAmount
} from "@/lib/billing";
import { formatDisplayDate, isWithinMonths, relativeTimestamp } from "@/lib/dates";
import { exportFirmMonthlyReport } from "@/lib/firm-report";
import { getFirmName } from "@/lib/personalisation";
import { TEAM_ROLES, getPermissions, permissionSummary, type PermissionKey } from "@/lib/permissions";
import { getCurrentStage, MATTER_LABELS } from "@/lib/stages";
import { useKeroStore } from "@/lib/storage";
import { getLetters } from "@/lib/templates";
import type {
  Client,
  CustomLetterTemplate,
  FirmActivityLogEntry,
  Invoice,
  Matter,
  MatterType,
  Settings,
  TeamMember,
  TeamRole,
  WordTemplate
} from "@/lib/types";
import { cn } from "@/lib/utils";

type NewTeamMemberDraft = {
  name: string;
  email: string;
  role: TeamRole;
};

const initialTeamDraft: NewTeamMemberDraft = {
  name: "",
  email: "",
  role: "Solicitor"
};

const matterTypes: MatterType[] = ["conveyancing", "purchase", "litigation", "adhoc"];

export function MyFirmPage() {
  const {
    state,
    hydrated,
    currentTeamMember,
    hasPermission,
    setCurrentTeamMember,
    addTeamMember,
    deactivateTeamMember,
    assignMatter
  } = useKeroStore();
  const { toast } = useToast();
  const [voiceConversationCount, setVoiceConversationCount] = useState(0);
  const [teamDraft, setTeamDraft] = useState<NewTeamMemberDraft>(initialTeamDraft);
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState("");
  const [activityMemberFilter, setActivityMemberFilter] = useState("all");
  const [activityTypeFilter, setActivityTypeFilter] = useState("all");
  const [activityFrom, setActivityFrom] = useState("");
  const [activityTo, setActivityTo] = useState("");

  const manageTeam = hasPermission("manageTeam");
  const viewBilling = hasPermission("viewBilling");
  const manageSettings = hasPermission("manageFirmSettings");

  useEffect(() => {
    setVoiceConversationCount(readVoiceConversationCount());
  }, []);

  useEffect(() => {
    const fallback = state.teamMembers[0]?.id ?? "";
    if (!selectedTeamMemberId && fallback) setSelectedTeamMemberId(fallback);
  }, [selectedTeamMemberId, state.teamMembers]);

  const clientsById = useMemo(
    () => new Map(state.clients.map((client) => [client.id, client])),
    [state.clients]
  );
  const membersById = useMemo(
    () => new Map(state.teamMembers.map((member) => [member.id, member])),
    [state.teamMembers]
  );
  const selectedTeamMember =
    state.teamMembers.find((member) => member.id === selectedTeamMemberId) ??
    state.teamMembers[0];

  const firmMetrics = useMemo(
    () => buildFirmMetrics(state.matters, state.clients, state.invoices, clientsById),
    [clientsById, state.clients, state.invoices, state.matters]
  );
  const lettersGenerated = useMemo(
    () => countGeneratedLetters(state.matters, state.clients, state.settings, state.globalTemplates, state.customLetterTemplates),
    [
      state.clients,
      state.customLetterTemplates,
      state.globalTemplates,
      state.matters,
      state.settings
    ]
  );
  const keroAiActions = useMemo(
    () => state.timelineEvents.filter((event) => event.type === "kero_ai").length,
    [state.timelineEvents]
  );
  const amlAutomations = useMemo(
    () =>
      state.timelineEvents.filter(
        (event) => event.type === "aml_updated" || event.type === "aml_verified"
      ).length,
    [state.timelineEvents]
  );
  const hoursSaved = useMemo(
    () =>
      calculateHoursSaved(
        lettersGenerated,
        keroAiActions,
        amlAutomations,
        state.settings.billing.defaultHourlyRate
      ),
    [amlAutomations, keroAiActions, lettersGenerated, state.settings.billing.defaultHourlyRate]
  );
  const financialSummary = useMemo(
    () => buildFinancialSummary(state.invoices, state.matters),
    [state.invoices, state.matters]
  );
  const monthlyRevenue = useMemo(() => monthlyRevenueBars(state.invoices), [state.invoices]);
  const teamWorkload = useMemo(
    () => buildTeamWorkload(state.teamMembers, state.matters),
    [state.matters, state.teamMembers]
  );
  const firmAlerts = useMemo(
    () => buildFirmAlerts(state.matters, state.invoices, state.timelineEvents, clientsById, state.settings.notifications.stageInactivityDays),
    [clientsById, state.invoices, state.matters, state.settings.notifications.stageInactivityDays, state.timelineEvents]
  );
  const activity = useMemo(
    () => mergeActivity(state.firmActivityLog, state.timelineEvents, membersById),
    [membersById, state.firmActivityLog, state.timelineEvents]
  );
  const actionTypes = useMemo(
    () => Array.from(new Set(activity.map((entry) => entry.actionType))).sort(),
    [activity]
  );
  const filteredActivity = useMemo(
    () =>
      activity.filter((entry) =>
        matchesActivityFilters(entry, activityMemberFilter, activityTypeFilter, activityFrom, activityTo)
      ),
    [activity, activityFrom, activityMemberFilter, activityTo, activityTypeFilter]
  );

  if (!hydrated) return <PageSkeleton rows={7} />;

  function submitTeamMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manageTeam) return;
    const member = addTeamMember(teamDraft);
    if (!member) {
      toast("Enter a name and email for the team member");
      return;
    }
    setTeamDraft(initialTeamDraft);
    setSelectedTeamMemberId(member.id);
    toast(`${member.name} added to the firm`);
  }

  function exportReport() {
    exportFirmMonthlyReport({
      settings: state.settings,
      matters: state.matters,
      clients: state.clients,
      invoices: state.invoices,
      activity: filteredActivity,
      lettersGenerated,
      hoursSaved: hoursSaved.total,
      hoursSavedValue: hoursSaved.value,
      keroAiActions,
      voiceConversations: voiceConversationCount,
      conflictChecks: state.conflictCheckLogs.length
    });
    toast("Monthly firm report generated");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <KeroLogo className="h-12 w-12" imageClassName="h-[82%] w-[82%]" />
            <div>
              <h1 className="text-3xl font-bold text-slate-950">My Firm</h1>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Firm profile, team, workload, reporting and performance across Kero.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {manageSettings ? (
            <Link href="/settings" className={buttonVariants({ variant: "outline" })}>
              Edit Firm Details
            </Link>
          ) : null}
          <Button type="button" onClick={exportReport}>
            <FileText className="h-4 w-4" />
            Monthly Report PDF
          </Button>
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.35fr]">
        <FirmProfileCard manageSettings={manageSettings} />
        <section className="surface-card p-4">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <BarChart3 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">Performance Dashboard</h2>
              <p className="text-sm text-muted-foreground">
                Operational performance across matters, documents, AI and checks.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <MiniMetric label="Matters opened" value={String(firmMetrics.openedAllTime)} detail={`${firmMetrics.openedThisMonth} this month`} />
            <MiniMetric label="Matters closed" value={String(firmMetrics.closedAllTime)} detail={`${firmMetrics.closedThisMonth} this month`} />
            <MiniMetric label="Letters generated" value={String(lettersGenerated)} detail="All standard and custom letters" />
            <MiniMetric label="Kero AI actions" value={String(keroAiActions)} detail={`${voiceConversationCount} voice chats`} />
            <MiniMetric label="Conflict checks" value={String(state.conflictCheckLogs.length)} detail="Matter and manual checks" />
            <MiniMetric label="Avg close time" value={firmMetrics.averageCloseOverall} detail="Across closed matters" />
            <MiniMetric label="Voice mode" value={String(voiceConversationCount)} detail="Saved voice conversations" />
            <MiniMetric label="AML automations" value={String(amlAutomations)} detail="AML events logged" />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <DonutBreakdown rows={firmMetrics.typeBreakdown} total={firmMetrics.openedAllTime} />
            <div className="rounded-md border bg-white p-3 shadow-soft">
              <h3 className="text-sm font-semibold text-slate-950">Average time to close</h3>
              <div className="mt-3 space-y-3">
                {firmMetrics.closeTimeByType.map((row) => (
                  <ProgressRow
                    key={row.label}
                    label={row.label}
                    value={row.days ? `${row.days} days` : "No closed matters"}
                    percent={row.percent}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <section className="surface-card p-4">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Clock3 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">Hours Saved Calculator</h2>
              <p className="text-sm text-muted-foreground">
                Kero has saved you approximately {hoursSaved.total.toFixed(1)} hours, worth{" "}
                {formatCurrency(hoursSaved.value)} at your hourly rate.
              </p>
            </div>
          </div>
          <div className="rounded-md border border-primary/15 bg-primary/5 p-4">
            <p className="text-3xl font-bold text-primary">{hoursSaved.total.toFixed(1)} hours</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              Worth {formatCurrency(hoursSaved.value)}
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Letters" value={`${hoursSaved.letters.toFixed(1)}h`} detail={`${lettersGenerated} x 20 mins`} />
            <MiniMetric label="AI actions" value={`${hoursSaved.ai.toFixed(1)}h`} detail={`${keroAiActions} x 5 mins`} />
            <MiniMetric label="AML" value={`${hoursSaved.aml.toFixed(1)}h`} detail={`${amlAutomations} x 15 mins`} />
          </div>
        </section>

        <section className="surface-card p-4">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Euro className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">Financial Summary</h2>
              <p className="text-sm text-muted-foreground">
                Billing, collections and revenue trend.
              </p>
            </div>
          </div>
          {!viewBilling ? (
            <RestrictedInline label="Financial summary is hidden for this role." />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniMetric label="Billed all time" value={formatCurrency(financialSummary.billedAllTime)} detail={`${formatCurrency(financialSummary.billedThisMonth)} this month`} />
                <MiniMetric label="Collected" value={formatCurrency(financialSummary.collectedAllTime)} detail={`${formatCurrency(financialSummary.collectedThisMonth)} this month`} />
                <MiniMetric label="Outstanding" value={formatCurrency(financialSummary.outstanding)} detail={`${formatCurrency(financialSummary.overdue)} overdue`} danger={financialSummary.overdue > 0} />
                <MiniMetric label="Average invoice" value={formatCurrency(financialSummary.averageInvoice)} detail={`${state.invoices.length} invoices`} />
                <MiniMetric label="Most billed type" value={financialSummary.mostBilledType} detail="By invoice total" />
                <MiniMetric label="Overdue count" value={String(financialSummary.overdueCount)} detail="Unpaid past due date" danger={financialSummary.overdueCount > 0} />
              </div>
              <RevenueBars rows={monthlyRevenue} />
            </>
          )}
        </section>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <ClientStatsCard
          clients={state.clients}
          matters={state.matters}
          clientsById={clientsById}
        />
        <FirmAlertsCard alerts={firmAlerts} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_1fr]">
        <TeamManagementCard
          members={state.teamMembers}
          currentMember={currentTeamMember}
          selectedMember={selectedTeamMember}
          selectedMemberId={selectedTeamMemberId}
          setSelectedMemberId={setSelectedTeamMemberId}
          setCurrentTeamMember={setCurrentTeamMember}
          deactivateTeamMember={(memberId) => {
            deactivateTeamMember(memberId);
            toast("Team member deactivated");
          }}
          manageTeam={manageTeam}
          draft={teamDraft}
          setDraft={setTeamDraft}
          onSubmit={submitTeamMember}
          matters={state.matters}
          activity={activity}
        />
        <PermissionsCard />
      </section>

      <MatterWorkloadCard
        matters={state.matters}
        clientsById={clientsById}
        members={state.teamMembers}
        workload={teamWorkload}
        assignMatter={(matterId, memberId) => {
          assignMatter(matterId, memberId);
          toast(memberId ? "Matter assigned" : "Matter marked unassigned");
        }}
        manageTeam={manageTeam}
      />

      <ActivityLogCard
        activity={filteredActivity}
        members={state.teamMembers}
        actionTypes={actionTypes}
        memberFilter={activityMemberFilter}
        setMemberFilter={setActivityMemberFilter}
        typeFilter={activityTypeFilter}
        setTypeFilter={setActivityTypeFilter}
        from={activityFrom}
        setFrom={setActivityFrom}
        to={activityTo}
        setTo={setActivityTo}
      />
    </div>
  );
}

function FirmProfileCard({ manageSettings }: { manageSettings: boolean }) {
  const { state } = useKeroStore();
  const settings = state.settings;
  const fields = [
    ["Address", settings.firmAddress],
    ["Phone", settings.firmPhone || "Not set"],
    ["Email", settings.firmEmail || "Not set"],
    ["Website", settings.firmWebsite || "Not set"],
    ["Law Society No.", settings.lawSocietyNumber || "Not set"],
    ["VAT No.", settings.vatNumber || "Not set"]
  ];
  return (
    <section className="surface-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <KeroLogo className="h-16 w-16" imageClassName="h-[82%] w-[82%]" />
          <div>
            <h2 className="text-xl font-bold text-slate-950">{getFirmName(settings)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Firm profile pulled from Settings.</p>
          </div>
        </div>
        {manageSettings ? (
          <Link href="/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Edit
          </Link>
        ) : null}
      </div>
      <div className="mt-5 grid gap-3">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-md border bg-white px-3 py-2 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-medium text-slate-950">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MiniMetric({
  label,
  value,
  detail,
  danger = false
}: {
  label: string;
  value: string;
  detail: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-md border bg-white p-3 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-bold text-slate-950", danger && "text-red-700")}>{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function DonutBreakdown({
  rows,
  total
}: {
  rows: Array<{ label: string; value: number; color: string; percent: number }>;
  total: number;
}) {
  const gradient = buildConicGradient(rows);
  return (
    <div className="rounded-md border bg-white p-3 shadow-soft">
      <div className="flex items-center gap-4">
        <div
          className="relative h-32 w-32 shrink-0 rounded-full"
          style={{ background: gradient }}
          aria-label="Matters by type donut chart"
        >
          <div className="absolute inset-5 flex items-center justify-center rounded-full bg-white text-center shadow-inner">
            <span>
              <span className="block text-2xl font-bold text-slate-950">{total}</span>
              <span className="block text-[11px] font-semibold text-muted-foreground">matters</span>
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-sm font-semibold text-slate-950">Matters by type</h3>
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", row.color)} />
                <span className="truncate">{row.label}</span>
              </span>
              <span className="font-semibold">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  percent
}: {
  label: string;
  value: string;
  percent: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, percent)}%` }} />
      </div>
    </div>
  );
}

function RevenueBars({ rows }: { rows: Array<{ label: string; amount: number; percent: number }> }) {
  return (
    <div className="mt-4 rounded-md border bg-white p-3 shadow-soft">
      <h3 className="text-sm font-semibold text-slate-950">Monthly revenue</h3>
      <div className="mt-3 flex h-36 items-end gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex h-full flex-1 flex-col justify-end gap-1 text-center">
            <div className="flex flex-1 items-end justify-center rounded-md bg-slate-50 p-1">
              <div
                className="w-full rounded-sm bg-primary transition-all duration-300"
                style={{ height: `${Math.max(4, row.percent)}%` }}
                title={formatCurrency(row.amount)}
              />
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground">{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientStatsCard({
  clients,
  matters,
  clientsById
}: {
  clients: Client[];
  matters: Matter[];
  clientsById: Map<string, Client>;
}) {
  const newClientsThisMonth = clients.filter((client) =>
    matters.some((matter) => matter.clientId === client.id && isCurrentMonth(matter.dateOpened))
  ).length;
  const activeClients = Array.from(
    matters.reduce((map, matter) => {
      map.set(matter.clientId, (map.get(matter.clientId) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  )
    .map(([clientId, count]) => ({ client: clientsById.get(clientId), count }))
    .filter((item): item is { client: Client; count: number } => Boolean(item.client))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const clientsWithOutstandingAml = new Set(
    matters.filter((matter) => !matter.aml.verified).map((matter) => matter.clientId)
  );

  return (
    <section className="surface-card p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <UsersRound className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">Client Stats</h2>
          <p className="text-sm text-muted-foreground">Client records, activity and AML status.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniMetric label="Clients" value={String(clients.length)} detail="On record" />
        <MiniMetric label="New this month" value={String(newClientsThisMonth)} detail="Based on opened matters" />
        <MiniMetric label="Outstanding AML" value={String(clientsWithOutstandingAml.size)} detail="Clients with any incomplete matter" danger={clientsWithOutstandingAml.size > 0} />
      </div>
      <div className="mt-4 space-y-2">
        <h3 className="text-sm font-semibold text-slate-950">Most active clients</h3>
        {activeClients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No client matters yet.</p>
        ) : (
          activeClients.map((item) => (
            <Link
              key={item.client.id}
              href={`/clients/${item.client.id}`}
              className="interactive-card flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm shadow-soft"
            >
              <span className="font-medium">{item.client.fullName}</span>
              <Badge>{item.count} matters</Badge>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

function FirmAlertsCard({
  alerts
}: {
  alerts: Array<{ title: string; detail: string; href: string; tone: "red" | "amber" }>;
}) {
  return (
    <section className="surface-card p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">Notifications and Alerts</h2>
          <p className="text-sm text-muted-foreground">Firm-wide risk and operations alerts.</p>
        </div>
      </div>
      {alerts.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No firm-wide alerts"
          description="Limitation dates, overdue invoices, AML issues and inactive matters will appear here."
          className="py-6"
        />
      ) : (
        <div className="space-y-2">
          {alerts.slice(0, 8).map((alert, index) => (
            <Link
              key={`${alert.title}-${index}`}
              href={alert.href}
              className={cn(
                "interactive-card block rounded-md border bg-white px-3 py-2 text-sm shadow-soft",
                alert.tone === "red" ? "border-red-200" : "border-amber-200"
              )}
            >
              <span className={cn("font-semibold", alert.tone === "red" ? "text-red-800" : "text-amber-800")}>
                {alert.title}
              </span>
              <span className="mt-1 block text-muted-foreground">{alert.detail}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function TeamManagementCard({
  members,
  currentMember,
  selectedMember,
  selectedMemberId,
  setSelectedMemberId,
  setCurrentTeamMember,
  deactivateTeamMember,
  manageTeam,
  draft,
  setDraft,
  onSubmit,
  matters,
  activity
}: {
  members: TeamMember[];
  currentMember: TeamMember;
  selectedMember?: TeamMember;
  selectedMemberId: string;
  setSelectedMemberId: (id: string) => void;
  setCurrentTeamMember: (id: string) => void;
  deactivateTeamMember: (id: string) => void;
  manageTeam: boolean;
  draft: NewTeamMemberDraft;
  setDraft: (draft: NewTeamMemberDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  matters: Matter[];
  activity: FirmActivityLogEntry[];
}) {
  const selectedActiveMatters = selectedMember
    ? matters.filter(
        (matter) => matter.assignedTeamMemberId === selectedMember.id && matter.status !== "Closed"
      )
    : [];
  const selectedActivity = selectedMember
    ? activity.filter((entry) => entry.actorId === selectedMember.id || entry.actorName === selectedMember.name).slice(0, 5)
    : [];

  return (
    <section className="surface-card p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <UserPlus className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">Team Management</h2>
          <p className="text-sm text-muted-foreground">
            Current user: {currentMember.name} ({currentMember.role})
          </p>
        </div>
      </div>

      {!manageTeam ? <RestrictedInline label="Team changes are hidden for this role." /> : null}

      {manageTeam ? (
        <form onSubmit={onSubmit} className="mb-4 grid gap-2 rounded-md border bg-white p-3 shadow-soft md:grid-cols-[1fr_1fr_0.8fr_auto]">
          <Input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Name"
          />
          <Input
            value={draft.email}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            placeholder="Email"
            type="email"
          />
          <Select
            value={draft.role}
            onChange={(event) => setDraft({ ...draft, role: event.target.value as TeamRole })}
          >
            {TEAM_ROLES.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </Select>
          <Button type="submit">
            <UserPlus className="h-4 w-4" />
            Add
          </Button>
        </form>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[1fr_0.95fr]">
        <div className="space-y-2">
          {members.map((member) => {
            const activeCount = matters.filter(
              (matter) => matter.assignedTeamMemberId === member.id && matter.status !== "Closed"
            ).length;
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => setSelectedMemberId(member.id)}
                className={cn(
                  "interactive-card w-full rounded-md border bg-white px-3 py-2 text-left text-sm shadow-soft",
                  selectedMemberId === member.id && "border-primary/40 bg-primary/5"
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span>
                    <span className="font-semibold text-slate-950">{member.name}</span>
                    <span className="block text-xs text-muted-foreground">{member.role} · {member.email}</span>
                  </span>
                  <Badge variant={member.status === "Active" ? "open" : "default"}>{member.status}</Badge>
                </span>
                <span className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{activeCount} active matters</span>
                  {member.isOwner ? <span>Owner</span> : null}
                </span>
              </button>
            );
          })}
        </div>
        <div className="rounded-md border bg-white p-3 shadow-soft">
          {selectedMember ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">{selectedMember.name}</h3>
                  <p className="text-xs text-muted-foreground">{selectedMember.role}</p>
                </div>
                <div className="flex gap-2">
                  {manageTeam && selectedMember.status === "Active" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentTeamMember(selectedMember.id)}
                    >
                      Use
                    </Button>
                  ) : null}
                  {manageTeam && !selectedMember.isOwner && selectedMember.status === "Active" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => deactivateTeamMember(selectedMember.id)}
                    >
                      Deactivate
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Active matters</h4>
                <div className="mt-2 space-y-2">
                  {selectedActiveMatters.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active matters assigned.</p>
                  ) : (
                    selectedActiveMatters.slice(0, 5).map((matter) => (
                      <Link key={matter.id} href={`/matters/${matter.id}`} className="block rounded-md border px-3 py-2 text-sm hover:bg-slate-50">
                        <span className="font-semibold">{matter.fileReference}</span>
                        <span className="ml-2 text-muted-foreground">{getCurrentStage(matter)}</span>
                      </Link>
                    ))
                  )}
                </div>
              </div>
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Recent activity</h4>
                <div className="mt-2 space-y-2">
                  {selectedActivity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No recorded activity yet.</p>
                  ) : (
                    selectedActivity.map((entry) => (
                      <p key={entry.id} className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-slate-800">{entry.actionType}</span> · {entry.description}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PermissionsCard() {
  return (
    <section className="surface-card p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">Permissions System</h2>
          <p className="text-sm text-muted-foreground">Role capabilities used across navigation and gated pages.</p>
        </div>
      </div>
      <div className="space-y-2">
        {(["Owner", ...TEAM_ROLES] as TeamRole[]).map((role) => {
          const permissions = getPermissions({
            id: role,
            name: role,
            email: "",
            role,
            status: "Active",
            isOwner: role === "Owner",
            createdAt: "",
            updatedAt: ""
          });
          return (
            <details key={role} className="rounded-md border bg-white p-3 shadow-soft">
              <summary className="cursor-pointer text-sm font-semibold text-slate-950">
                {role}
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{permissionSummary(role)}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(permissionLabels).map(([key, label]) => (
                  <Badge key={key} variant={permissions[key as PermissionKey] ? "open" : "default"}>
                    {label}
                  </Badge>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function MatterWorkloadCard({
  matters,
  clientsById,
  members,
  workload,
  assignMatter,
  manageTeam
}: {
  matters: Matter[];
  clientsById: Map<string, Client>;
  members: TeamMember[];
  workload: Array<{ member: TeamMember; activeCount: number }>;
  assignMatter: (matterId: string, memberId: string) => void;
  manageTeam: boolean;
}) {
  const unassigned = matters.filter((matter) => !matter.assignedTeamMemberId && matter.status !== "Closed");
  return (
    <section className="surface-card p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Scale className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">Matter Workload</h2>
          <p className="text-sm text-muted-foreground">Active file ownership across the firm.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {workload.map((row) => (
          <MiniMetric key={row.member.id} label={row.member.name} value={String(row.activeCount)} detail={row.member.role} />
        ))}
      </div>
      {unassigned.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">{unassigned.length} unassigned active matters</p>
        </div>
      ) : null}
      <div className="mt-4 grid gap-2">
        {matters.filter((matter) => matter.status !== "Closed").slice(0, 12).map((matter) => {
          const client = clientsById.get(matter.clientId);
          return (
            <div key={matter.id} className="grid gap-2 rounded-md border bg-white px-3 py-2 text-sm shadow-soft md:grid-cols-[1fr_12rem] md:items-center">
              <Link href={`/matters/${matter.id}`} className="min-w-0">
                <span className="font-semibold text-slate-950">{matter.fileReference}</span>
                <span className="ml-2 text-muted-foreground">{client?.fullName ?? "Unknown client"}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {MATTER_LABELS[matter.type]} · {getCurrentStage(matter)}
                </span>
              </Link>
              <Select
                value={matter.assignedTeamMemberId || ""}
                onChange={(event) => assignMatter(matter.id, event.target.value)}
                disabled={!manageTeam}
              >
                <option value="">Unassigned</option>
                {members.filter((member) => member.status === "Active").map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </Select>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActivityLogCard({
  activity,
  members,
  actionTypes,
  memberFilter,
  setMemberFilter,
  typeFilter,
  setTypeFilter,
  from,
  setFrom,
  to,
  setTo
}: {
  activity: FirmActivityLogEntry[];
  members: TeamMember[];
  actionTypes: string[];
  memberFilter: string;
  setMemberFilter: (value: string) => void;
  typeFilter: string;
  setTypeFilter: (value: string) => void;
  from: string;
  setFrom: (value: string) => void;
  to: string;
  setTo: (value: string) => void;
}) {
  return (
    <section className="surface-card p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Activity className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">Activity Log</h2>
          <p className="text-sm text-muted-foreground">Read-only firm activity across team members and matters.</p>
        </div>
      </div>
      <div className="mb-4 grid gap-2 md:grid-cols-4">
        <Select value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)}>
          <option value="all">All team members</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>{member.name}</option>
          ))}
        </Select>
        <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">All action types</option>
          {actionTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </Select>
        <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      {activity.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No activity found"
          description="Try changing the filters, or perform an action elsewhere in Kero."
          className="py-6"
        />
      ) : (
        <div className="divide-y rounded-md border bg-white shadow-soft">
          {activity.slice(0, 80).map((entry) => (
            <div key={entry.id} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[10rem_11rem_1fr]">
              <span className="text-xs text-muted-foreground">{relativeTimestamp(entry.createdAt)}</span>
              <span>
                <span className="font-semibold text-slate-950">{entry.actorName}</span>
                <span className="block text-xs text-muted-foreground">{entry.actionType}</span>
              </span>
              <span className="text-slate-800">{entry.description}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RestrictedInline({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

const permissionLabels: Record<PermissionKey, string> = {
  viewDashboard: "Dashboard",
  viewKeroAi: "Kero AI",
  useKeroAiActions: "AI actions",
  createMatter: "Create matters",
  openCloseMatters: "Open/close",
  viewMatters: "Matters",
  editMatters: "Edit matters",
  viewClients: "Clients",
  editClients: "Edit clients",
  viewDocuments: "Documents",
  generateLetters: "Letters",
  manageAml: "AML",
  viewCalendar: "Calendar",
  viewActivity: "Activity",
  viewBilling: "Billing",
  generateInvoices: "Invoices",
  logTime: "Time",
  viewResources: "Resources",
  viewFirmHub: "My Firm",
  manageFirmSettings: "Settings",
  manageTeam: "Team"
};

function buildFirmMetrics(
  matters: Matter[],
  clients: Client[],
  invoices: Invoice[],
  clientsById: Map<string, Client>
) {
  void clients;
  void invoices;
  void clientsById;
  const openedThisMonth = matters.filter((matter) => isCurrentMonth(matter.dateOpened)).length;
  const closedMatters = matters.filter((matter) => matter.status === "Closed");
  const closedThisMonth = closedMatters.filter((matter) => isCurrentMonth(matter.updatedAt)).length;
  const typeBreakdown = matterTypes.map((type, index) => {
    const value = matters.filter((matter) => matter.type === type).length;
    return {
      label: MATTER_LABELS[type],
      value,
      color: ["bg-primary", "bg-emerald-600", "bg-sky-600", "bg-amber-600"][index],
      percent: matters.length ? (value / matters.length) * 100 : 0
    };
  });
  const closeTimeByType = matterTypes.map((type) => {
    const days = averageCloseDays(closedMatters.filter((matter) => matter.type === type));
    return {
      label: MATTER_LABELS[type],
      days,
      percent: Math.min(100, days ? (days / 120) * 100 : 0)
    };
  });
  const overallDays = averageCloseDays(closedMatters);
  return {
    openedAllTime: matters.length,
    openedThisMonth,
    closedAllTime: closedMatters.length,
    closedThisMonth,
    averageCloseOverall: overallDays ? `${overallDays} days` : "No closed matters",
    typeBreakdown,
    closeTimeByType
  };
}

function buildFinancialSummary(invoices: Invoice[], matters: Matter[]) {
  const billingSummary = getBillingSummary(invoices);
  const billedAllTime = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const billedThisMonth = invoices
    .filter((invoice) => isCurrentMonth(invoice.invoiceDate))
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const collectedAllTime = invoices.reduce((sum, invoice) => sum + getInvoicePaidAmount(invoice), 0);
  const collectedThisMonth = invoices.reduce((sum, invoice) => {
    const payments = (invoice.payments ?? []).filter((payment) => isCurrentMonth(payment.date));
    return sum + payments.reduce((paymentTotal, payment) => paymentTotal + payment.amount, 0);
  }, 0);
  const invoiceTotalsByType = matterTypes.map((type) => {
    const matterIds = new Set(matters.filter((matter) => matter.type === type).map((matter) => matter.id));
    return {
      type,
      total: invoices
        .filter((invoice) => matterIds.has(invoice.matterId))
        .reduce((sum, invoice) => sum + invoice.total, 0)
    };
  });
  const mostBilled = invoiceTotalsByType.sort((a, b) => b.total - a.total)[0];
  return {
    billedAllTime,
    billedThisMonth,
    collectedAllTime,
    collectedThisMonth,
    outstanding: billingSummary.outstandingAmount,
    overdue: billingSummary.overdueAmount,
    overdueCount: billingSummary.overdueCount,
    averageInvoice: invoices.length ? billedAllTime / invoices.length : 0,
    mostBilledType: mostBilled && mostBilled.total > 0 ? MATTER_LABELS[mostBilled.type] : "No invoices"
  };
}

function buildTeamWorkload(members: TeamMember[], matters: Matter[]) {
  return members
    .filter((member) => member.status === "Active")
    .map((member) => ({
      member,
      activeCount: matters.filter(
        (matter) => matter.assignedTeamMemberId === member.id && matter.status !== "Closed"
      ).length
    }))
    .sort((a, b) => b.activeCount - a.activeCount);
}

function buildFirmAlerts(
  matters: Matter[],
  invoices: Invoice[],
  timelineEvents: Array<{ matterId: string; type: string; createdAt: string }>,
  clientsById: Map<string, Client>,
  inactivityDays: number
) {
  const alerts: Array<{ title: string; detail: string; href: string; tone: "red" | "amber" }> = [];
  matters.forEach((matter) => {
    const client = clientsById.get(matter.clientId);
    if (
      matter.type === "litigation" &&
      matter.status !== "Closed" &&
      isWithinMonths(matter.fields.limitationDate, 3)
    ) {
      alerts.push({
        title: `Limitation approaching: ${matter.fileReference}`,
        detail: `${client?.fullName ?? "Unknown client"} - ${formatDisplayDate(matter.fields.limitationDate)}`,
        href: `/matters/${matter.id}`,
        tone: "red"
      });
    }
    if (matter.status !== "Closed" && !matter.aml.verified) {
      alerts.push({
        title: `AML incomplete: ${matter.fileReference}`,
        detail: client?.fullName ?? "Unknown client",
        href: `/matters/${matter.id}`,
        tone: "amber"
      });
    }
    const lastActivity = timelineEvents
      .filter((event) => event.matterId === matter.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const lastTime = new Date(lastActivity?.createdAt || matter.updatedAt).getTime();
    if (matter.status !== "Closed" && Date.now() - lastTime > inactivityDays * 24 * 60 * 60 * 1000) {
      alerts.push({
        title: `No recent activity: ${matter.fileReference}`,
        detail: `${client?.fullName ?? "Unknown client"} has no activity in ${inactivityDays}+ days`,
        href: `/matters/${matter.id}`,
        tone: "amber"
      });
    }
  });
  invoices.forEach((invoice) => {
    if (getInvoiceDisplayStatus(invoice) !== "Overdue") return;
    alerts.push({
      title: `Overdue invoice: ${invoice.invoiceNumber}`,
      detail: `${formatCurrency(invoice.total)} due ${formatDisplayDate(invoice.dueDate)}`,
      href: "/billing?status=Overdue",
      tone: "red"
    });
  });
  return alerts;
}

function mergeActivity(
  stored: FirmActivityLogEntry[],
  timelineEvents: Array<{
    id: string;
    matterId: string;
    type: string;
    description: string;
    actorName: string;
    createdAt: string;
    metadata?: FirmActivityLogEntry["metadata"];
  }>,
  membersById: Map<string, TeamMember>
) {
  const storedIds = new Set(stored.map((entry) => `${entry.matterId ?? ""}:${entry.description}:${entry.createdAt}`));
  const derived = timelineEvents
    .filter((event) => !storedIds.has(`${event.matterId}:${event.description}:${event.createdAt}`))
    .map((event): FirmActivityLogEntry => {
      const member = Array.from(membersById.values()).find((item) => item.name === event.actorName);
      return {
        id: `derived_${event.id}`,
        actorId: member?.id,
        actorName: event.actorName,
        actionType: event.type
          .split("_")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" "),
        description: event.description,
        matterId: event.matterId,
        createdAt: event.createdAt,
        metadata: event.metadata
      };
    });
  return [...stored, ...derived].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function matchesActivityFilters(
  entry: FirmActivityLogEntry,
  memberFilter: string,
  typeFilter: string,
  from: string,
  to: string
) {
  if (memberFilter !== "all" && entry.actorId !== memberFilter) return false;
  if (typeFilter !== "all" && entry.actionType !== typeFilter) return false;
  const time = new Date(entry.createdAt).getTime();
  if (from && time < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && time > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

function countGeneratedLetters(
  matters: Matter[],
  clients: Client[],
  settings: Settings,
  globalTemplates: Record<string, WordTemplate>,
  customLetterTemplates: CustomLetterTemplate[]
) {
  return matters.reduce((total, matter) => {
    const client = clients.find((item) => item.id === matter.clientId);
    if (!client) return total;
    return total + getLetters(matter, client, settings, { globalTemplates, customLetterTemplates }).length;
  }, 0);
}

function calculateHoursSaved(
  lettersGenerated: number,
  aiActions: number,
  amlAutomations: number,
  hourlyRate: number
) {
  const letters = (lettersGenerated * 20) / 60;
  const ai = (aiActions * 5) / 60;
  const aml = (amlAutomations * 15) / 60;
  const total = letters + ai + aml;
  return {
    letters,
    ai,
    aml,
    total,
    value: total * (Number(hourlyRate) || 0)
  };
}

function monthlyRevenueBars(invoices: Invoice[]) {
  const now = new Date();
  const rows = Array.from({ length: 6 }).map((_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const amount = invoices.reduce((sum, invoice) => {
      const paymentTotal = (invoice.payments ?? [])
        .filter((payment) => sameMonth(payment.date, month))
        .reduce((paymentSum, payment) => paymentSum + payment.amount, 0);
      if (paymentTotal > 0) return sum + paymentTotal;
      return invoice.status === "Paid" && sameMonth(invoice.updatedAt || invoice.invoiceDate, month)
        ? sum + invoice.total
        : sum;
    }, 0);
    return {
      label: month.toLocaleString("en-IE", { month: "short" }),
      amount
    };
  });
  const max = Math.max(1, ...rows.map((row) => row.amount));
  return rows.map((row) => ({ ...row, percent: (row.amount / max) * 100 }));
}

function averageCloseDays(matters: Matter[]) {
  if (matters.length === 0) return 0;
  const total = matters.reduce((sum, matter) => {
    const opened = new Date(matter.dateOpened).getTime();
    const closed = new Date(matter.updatedAt).getTime();
    if (Number.isNaN(opened) || Number.isNaN(closed)) return sum;
    return sum + Math.max(0, Math.round((closed - opened) / (24 * 60 * 60 * 1000)));
  }, 0);
  return Math.round(total / matters.length);
}

function isCurrentMonth(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function sameMonth(value: string, month: Date) {
  const date = new Date(value);
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function buildConicGradient(rows: Array<{ percent: number }>) {
  const colors = ["#0f172a", "#059669", "#0284c7", "#d97706"];
  let cursor = 0;
  const stops = rows.map((row, index) => {
    const start = cursor;
    cursor += row.percent;
    return `${colors[index]} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(", ") || "#e2e8f0 0% 100%"})`;
}

function readVoiceConversationCount() {
  try {
    const stored = window.localStorage.getItem("kero-ai-conversations-v1");
    if (!stored) return 0;
    const conversations = JSON.parse(stored);
    if (!Array.isArray(conversations)) return 0;
    return conversations.filter((conversation) =>
      Array.isArray(conversation?.messages) &&
      conversation.messages.some((message: { mode?: string }) => message.mode === "voice")
    ).length;
  } catch {
    return 0;
  }
}
