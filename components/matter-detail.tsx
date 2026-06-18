"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BotMessageSquare,
  CalendarDays,
  Clipboard,
  CheckCircle2,
  CircleDot,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  History,
  ListChecks,
  Mail,
  MessageSquareText,
  Plus,
  Printer,
  ReceiptText,
  Send,
  ShieldCheck,
  Timer,
  Upload,
  UserRound
} from "lucide-react";
import { PinMatterButton } from "@/components/pin-matter-button";
import { AmlStatusBadge, MatterStatusBadge } from "@/components/status-badges";
import { MatterTimeBillingPanel } from "@/components/matter-time-billing";
import { StageTracker } from "@/components/stage-tracker";
import { useToast } from "@/components/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EmptyState, PageSkeleton } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import { calendarEventTypeLabels, formatEventTime, timeKey } from "@/lib/calendar";
import { formatDisplayDate, isWithinMonths, relativeTimestamp } from "@/lib/dates";
import { buildDefaultMatterChecklist } from "@/lib/matter-checklists";
import { exportMatterPdf } from "@/lib/matter-export";
import { formatQuickNoteBody, getQuickNoteTemplatesForMatter } from "@/lib/quick-note-templates";
import { getCurrentStage, getMatterReferenceLine, getStages, MATTER_LABELS } from "@/lib/stages";
import { useKeroStore } from "@/lib/storage";
import { getAmlStatus, getLetters, makeLetterVariables } from "@/lib/templates";
import type {
  AdHocMatter,
  CalendarEvent,
  Client,
  ConveyancingMatter,
  DisputeType,
  ConflictCheckLog,
  LetterStatus,
  LitigationMatter,
  Matter,
  MatterChecklistItem,
  PurchaseMatter,
  TimelineEvent,
  TimelineEventType,
  WordTemplate
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  buildFilledWordTemplateHtml,
  createWordTemplateFromFile,
  downloadHtmlAsPdf,
  emailLetterWithGeneratedPdf,
  letterTextToHtml,
  pdfFileName,
  printHtmlAsPdf
} from "@/lib/word-templates";

const disputeTypes: DisputeType[] = [
  "Neighbour Dispute",
  "Debt Recovery",
  "Contract Dispute",
  "Employment Dispute",
  "Property Dispute",
  "General Civil Dispute"
];

export function MatterDetail({ matterId }: { matterId: string }) {
  const {
    state,
    hydrated,
    updateClient,
    updateMatter,
    updateAml,
    toggleMatterChecklistItem,
    addMatterChecklistItem,
    addNote,
    setCustomTemplate,
    setLetterStatus,
    addTimelineEvent,
    recordMatterView,
    togglePinnedMatter,
    runConflictCheck
  } = useKeroStore();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [selectedLetterId, setSelectedLetterId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"matter" | "timeline">("matter");

  const matter = state.matters.find((item) => item.id === matterId);
  const client = matter ? state.clients.find((item) => item.id === matter.clientId) : undefined;

  const letters = useMemo(() => {
    if (!matter || !client) return [];
    return getLetters(matter, client, state.settings, {
      globalTemplates: state.globalTemplates,
      customLetterTemplates: state.customLetterTemplates
    });
  }, [client, matter, state.customLetterTemplates, state.globalTemplates, state.settings]);

  const selectedLetter =
    letters.find((letter) => letter.id === selectedLetterId) ?? letters[0];

  const timelineEvents = useMemo(() => {
    if (!matter) return [];
    return state.timelineEvents
      .filter((event) => event.matterId === matter.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [matter, state.timelineEvents]);

  const matterTimeEntries = useMemo(() => {
    if (!matter) return [];
    return state.timeEntries.filter((entry) => entry.matterId === matter.id);
  }, [matter, state.timeEntries]);

  const matterExpenses = useMemo(() => {
    if (!matter) return [];
    return state.expenses.filter((expense) => expense.matterId === matter.id);
  }, [matter, state.expenses]);

  const matterCalendarEvents = useMemo(() => {
    if (!matter) return [];
    return state.calendarEvents.filter((event) => event.matterId === matter.id);
  }, [matter, state.calendarEvents]);
  const matterChecklistItems = useMemo(() => {
    if (!matter) return [];
    return state.matterChecklists[matter.id] ?? buildDefaultMatterChecklist(matter.type);
  }, [matter, state.matterChecklists]);
  const quickNoteTemplates = useMemo(() => {
    if (!matter) return [];
    return getQuickNoteTemplatesForMatter(
      matter.type,
      state.settings.quickNotes.customTemplates
    );
  }, [matter, state.settings.quickNotes.customTemplates]);
  const matterConflictLogs = useMemo(() => {
    if (!matter) return [];
    return state.conflictCheckLogs
      .filter((log) => log.matterId === matter.id)
      .sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime());
  }, [matter, state.conflictCheckLogs]);
  const matterIdToRecord = matter?.id;

  useEffect(() => {
    if (!hydrated || !matterIdToRecord) return;
    recordMatterView(matterIdToRecord);
  }, [hydrated, matterIdToRecord, recordMatterView]);

  if (!hydrated) return <PageSkeleton rows={6} />;

  if (!matter || !client) {
    return (
      <EmptyState
        icon={FileText}
        title="Matter not found"
        description="This matter may have been removed or the link may be out of date."
        className="surface-card"
      />
    );
  }

  function saveNote() {
    if (!matter) return;
    addNote(matter.id, note);
    setNote("");
    toast("Note added");
  }

  function applyQuickNoteTemplate(templateText: string) {
    setNote(formatQuickNoteBody(templateText));
  }

  function exportMatter() {
    if (!matter || !client) return;
    const exportEvent = addTimelineEvent({
      matterId: matter.id,
      type: "matter_updated",
      description: "Matter exported to PDF"
    });
    exportMatterPdf({
      matter,
      client,
      settings: state.settings,
      letters,
      documentStatuses: state.documentStatuses,
      documentSentAt: state.documentSentAt,
      timeEntries: matterTimeEntries,
      expenses: matterExpenses,
      matterChecklistItems,
      calendarEvents: matterCalendarEvents,
      timelineEvents: [exportEvent, ...timelineEvents]
    });
    toast("Matter export downloaded");
  }

  function runConflictCheckForMatter() {
    if (!matter || !client) return;
    const log = runConflictCheck({
      matterId: matter.id,
      queries: getMatterConflictQueries(matter, client),
      source: "manual"
    });
    toast(`Conflict check complete: ${log.resultCount} potential match${log.resultCount === 1 ? "" : "es"}`);
  }

  const limitationWarning =
    state.settings.notifications.limitationWarnings &&
    matter.type === "litigation" &&
    isWithinMonths(
      matter.fields.limitationDate,
      state.settings.notifications.limitationWarningMonths
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="navy">{MATTER_LABELS[matter.type]}</Badge>
            <MatterStatusBadge status={matter.status} />
            <span className="text-sm text-muted-foreground">
              {matter.stageIndex + 1}/{getStages(matter.type).length}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-slate-950">{matter.fileReference}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {getMatterReferenceLine(matter)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PinMatterButton
            pinned={(state.pinnedMatterIds ?? []).includes(matter.id)}
            onToggle={() => togglePinnedMatter(matter.id)}
            label={(state.pinnedMatterIds ?? []).includes(matter.id) ? "Pinned" : "Pin Matter"}
          />
          <Button type="button" onClick={exportMatter}>
            <Download className="h-4 w-4" />
            Export Matter
          </Button>
          <Link href={`/clients/${client.id}`} className={buttonVariants({ variant: "outline" })}>
            <UserRound className="h-4 w-4" />
            {client.fullName}
          </Link>
        </div>
      </div>

      {limitationWarning && matter.type === "litigation" ? (
        <section className="stagger-in flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-red-800 shadow-soft">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-semibold">
              Limitation date within {state.settings.notifications.limitationWarningMonths} month{state.settings.notifications.limitationWarningMonths === 1 ? "" : "s"}
            </div>
            <div className="text-sm">
              Current limitation date: {formatDisplayDate(matter.fields.limitationDate)}
            </div>
          </div>
        </section>
      ) : null}

      <StageTracker matter={matter} />

      <div className="surface-card flex flex-wrap items-center gap-2 p-2">
        <Button
          type="button"
          variant={activeTab === "matter" ? "default" : "ghost"}
          onClick={() => setActiveTab("matter")}
        >
          <FileText className="h-4 w-4" />
          Matter
        </Button>
        <Button
          type="button"
          variant={activeTab === "timeline" ? "default" : "ghost"}
          onClick={() => setActiveTab("timeline")}
        >
          <History className="h-4 w-4" />
          Timeline
        </Button>
      </div>

      {activeTab === "timeline" ? (
        <TimelinePanel events={timelineEvents} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <ClientEditor client={client} onChange={(patch) => updateClient(client.id, patch)} />
            <MatterEditor matter={matter} updateMatter={updateMatter} />
            <LetterViewer
              matter={matter}
              client={client}
              letters={letters}
              selectedLetter={selectedLetter}
              documentStatuses={state.documentStatuses}
              documentSentAt={state.documentSentAt}
              globalTemplates={state.globalTemplates}
              settings={state.settings}
              onSelect={setSelectedLetterId}
              onStatus={(letterId, status) =>
                setLetterStatus(
                  matter.id,
                  letterId,
                  status,
                  letters.find((letter) => letter.id === letterId)?.title
                )
              }
              onTemplate={(letterId, template) => {
                setCustomTemplate(matter.id, letterId, template);
                toast("Word template uploaded");
              }}
              toast={toast}
            />
            <MatterTimeBillingPanel matter={matter} client={client} />
          </div>

          <div className="space-y-5">
            <AmlPanel matter={matter} updateAml={updateAml} />
            <MatterChecklistPanel
              matter={matter}
              items={matterChecklistItems}
              onToggle={toggleMatterChecklistItem}
              onAdd={addMatterChecklistItem}
            />
            <KeyDates matter={matter} calendarEvents={state.calendarEvents} />
            <ConflictCheckPanel logs={matterConflictLogs} onRun={runConflictCheckForMatter} />
            {matter.type === "adhoc" ? <ResearchPanel matter={matter} /> : null}
            <section className="surface-card p-4">
              <h2 className="mb-4 text-base font-semibold text-slate-950">Notes</h2>
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                    Quick note templates
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {quickNoteTemplates.length} available
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {quickNoteTemplates.map((template) => (
                    <Button
                      key={template.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyQuickNoteTemplate(template.text)}
                      className="max-w-full justify-start text-left"
                    >
                      <MessageSquareText className="h-4 w-4" />
                      <span className="truncate">{template.text}</span>
                      {template.custom ? (
                        <Badge variant="default" className="ml-1 shadow-none">
                          Custom
                        </Badge>
                      ) : null}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3">
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Internal note"
                />
                <Button type="button" onClick={saveNote} disabled={!note.trim()}>
                  Add Note
                </Button>
              </div>
              <div className="mt-4 grid gap-3">
                {matter.notes.length === 0 ? (
                  <EmptyState
                    icon={MessageSquareText}
                    title="No notes recorded"
                    description="Add an internal note to keep a running record of file activity."
                    className="py-6"
                  />
                ) : (
                  matter.notes.map((item) => (
                    <div key={item.id} className="stagger-in rounded-md border bg-slate-50 p-3 shadow-soft">
                      <div className="mb-1 text-xs font-medium text-muted-foreground">
                        {relativeTimestamp(item.createdAt)}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-slate-800">{item.body}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

const timelineTypeLabels: Record<TimelineEventType, string> = {
  matter_opened: "Matter",
  matter_closed: "Closed",
  matter_updated: "Update",
  stage_advanced: "Stage",
  letter_generated: "Letter",
  letter_status: "Letter",
  document_template_uploaded: "Template",
  note_added: "Note",
  aml_updated: "AML",
  aml_verified: "AML",
  time_logged: "Time",
  expense_logged: "Expense",
  invoice_generated: "Invoice",
  invoice_status: "Invoice",
  key_date_added: "Date",
  checklist_updated: "Checklist",
  conflict_check: "Conflict",
  kero_ai: "Kero AI"
};

function timelineIcon(type: TimelineEventType) {
  if (type === "matter_opened" || type === "matter_updated" || type === "matter_closed") return FileText;
  if (type === "stage_advanced") return CircleDot;
  if (type === "letter_generated" || type === "letter_status" || type === "document_template_uploaded") return FileCheck2;
  if (type === "note_added") return MessageSquareText;
  if (type === "aml_updated" || type === "aml_verified") return ShieldCheck;
  if (type === "time_logged") return Timer;
  if (type === "expense_logged" || type === "invoice_generated" || type === "invoice_status") {
    return ReceiptText;
  }
  if (type === "key_date_added") return CalendarDays;
  if (type === "checklist_updated") return ListChecks;
  if (type === "kero_ai") return BotMessageSquare;
  return Clock3;
}

function TimelinePanel({ events }: { events: TimelineEvent[] }) {
  return (
    <section className="surface-card overflow-hidden p-0">
      <div className="flex flex-col gap-2 border-b bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <History className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-semibold text-slate-950">Timeline</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Read-only audit trail of matter activity, newest first.
          </p>
        </div>
        <Badge variant="navy">{events.length} events</Badge>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={History}
          title="No timeline events yet"
          description="Actions on this matter will appear here automatically."
          className="py-12"
        />
      ) : (
        <div className="px-5 py-5">
          <ol className="relative space-y-5 before:absolute before:left-5 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-slate-200">
            {events.map((event) => {
              const Icon = timelineIcon(event.type);
              return (
                <li key={event.id} className="stagger-in relative flex gap-4 pl-0">
                  <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-white text-primary shadow-soft">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1 rounded-md border bg-slate-50 px-4 py-3 shadow-soft">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="default">{timelineTypeLabels[event.type]}</Badge>
                          <span className="text-xs font-medium text-muted-foreground">
                            {relativeTimestamp(event.createdAt)}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-900">
                          {event.description}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-slate-600">
                        {event.actorName || "Solicitor"}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  children,
  className
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-2 block">{label}</Label>
      {children}
    </div>
  );
}

function ClientEditor({
  client,
  onChange
}: {
  client: Client;
  onChange: (patch: Partial<Client>) => void;
}) {
  return (
    <section className="surface-card p-4">
      <h2 className="mb-4 text-base font-semibold text-slate-950">Client details</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Full name">
          <Input value={client.fullName} onChange={(event) => onChange({ fullName: event.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={client.phone} onChange={(event) => onChange({ phone: event.target.value })} />
        </Field>
        <Field label="Email">
          <Input value={client.email} onChange={(event) => onChange({ email: event.target.value })} />
        </Field>
        <Field label="Address" className="md:col-span-2">
          <Textarea value={client.address} onChange={(event) => onChange({ address: event.target.value })} />
        </Field>
      </div>
    </section>
  );
}

function MatterEditor({
  matter,
  updateMatter
}: {
  matter: Matter;
  updateMatter: (matterId: string, updater: (matter: Matter) => Matter) => void;
}) {
  if (matter.type === "conveyancing") {
    return <ConveyancingEditor matter={matter} updateMatter={updateMatter} />;
  }
  if (matter.type === "purchase") {
    return <PurchaseEditor matter={matter} updateMatter={updateMatter} />;
  }
  if (matter.type === "litigation") {
    return <LitigationEditor matter={matter} updateMatter={updateMatter} />;
  }
  return <AdhocEditor matter={matter} updateMatter={updateMatter} />;
}

function ConveyancingEditor({
  matter,
  updateMatter
}: {
  matter: ConveyancingMatter;
  updateMatter: (matterId: string, updater: (matter: Matter) => Matter) => void;
}) {
  function patch(fields: Partial<ConveyancingMatter["fields"]>) {
    updateMatter(matter.id, (current) =>
      current.type === "conveyancing"
        ? { ...current, fields: { ...current.fields, ...fields } }
        : current
    );
  }

  return (
    <section className="surface-card p-4">
      <h2 className="mb-4 text-base font-semibold text-slate-950">Matter information</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Property address" className="md:col-span-2">
          <Textarea value={matter.fields.propertyAddress} onChange={(event) => patch({ propertyAddress: event.target.value })} />
        </Field>
        <Field label="Sale price">
          <Input value={matter.fields.salePrice} onChange={(event) => patch({ salePrice: event.target.value })} />
        </Field>
        <Field label="Closing date">
          <Input placeholder="YYYY-MM-DD" value={matter.fields.closingDate} onChange={(event) => patch({ closingDate: event.target.value })} />
        </Field>
        <Field label="Buyer">
          <Input value={matter.fields.buyerName} onChange={(event) => patch({ buyerName: event.target.value })} />
        </Field>
        <Field label="Auctioneer">
          <Input value={matter.fields.auctioneerName} onChange={(event) => patch({ auctioneerName: event.target.value })} />
        </Field>
        <Field label="Buyer solicitor">
          <Input value={matter.fields.buyerSolicitorName} onChange={(event) => patch({ buyerSolicitorName: event.target.value })} />
        </Field>
        <Field label="Mortgage holder">
          <Input value={matter.fields.mortgageHolder} onChange={(event) => patch({ mortgageHolder: event.target.value })} />
        </Field>
        <Field label="Buyer solicitor address" className="md:col-span-2">
          <Textarea value={matter.fields.buyerSolicitorAddress} onChange={(event) => patch({ buyerSolicitorAddress: event.target.value })} />
        </Field>
      </div>
    </section>
  );
}

function PurchaseEditor({
  matter,
  updateMatter
}: {
  matter: PurchaseMatter;
  updateMatter: (matterId: string, updater: (matter: Matter) => Matter) => void;
}) {
  function patch(fields: Partial<PurchaseMatter["fields"]>) {
    updateMatter(matter.id, (current) =>
      current.type === "purchase"
        ? { ...current, fields: { ...current.fields, ...fields } }
        : current
    );
  }

  return (
    <section className="surface-card p-4">
      <h2 className="mb-4 text-base font-semibold text-slate-950">Matter information</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Property address" className="md:col-span-2">
          <Textarea value={matter.fields.propertyAddress} onChange={(event) => patch({ propertyAddress: event.target.value })} />
        </Field>
        <Field label="Purchase price">
          <Input value={matter.fields.purchasePrice} onChange={(event) => patch({ purchasePrice: event.target.value })} />
        </Field>
        <Field label="Closing date">
          <Input placeholder="YYYY-MM-DD" value={matter.fields.closingDate} onChange={(event) => patch({ closingDate: event.target.value })} />
        </Field>
        <Field label="Vendor">
          <Input value={matter.fields.vendorName} onChange={(event) => patch({ vendorName: event.target.value })} />
        </Field>
        <Field label="Mortgage lender">
          <Input value={matter.fields.mortgageLender} onChange={(event) => patch({ mortgageLender: event.target.value })} />
        </Field>
        <Field label="Vendor solicitor">
          <Input value={matter.fields.vendorSolicitorName} onChange={(event) => patch({ vendorSolicitorName: event.target.value })} />
        </Field>
        <Field label="Vendor solicitor address" className="md:col-span-2">
          <Textarea value={matter.fields.vendorSolicitorAddress} onChange={(event) => patch({ vendorSolicitorAddress: event.target.value })} />
        </Field>
      </div>
    </section>
  );
}

function LitigationEditor({
  matter,
  updateMatter
}: {
  matter: LitigationMatter;
  updateMatter: (matterId: string, updater: (matter: Matter) => Matter) => void;
}) {
  function patch(fields: Partial<LitigationMatter["fields"]>) {
    updateMatter(matter.id, (current) =>
      current.type === "litigation"
        ? { ...current, fields: { ...current.fields, ...fields } }
        : current
    );
  }

  return (
    <section className="surface-card p-4">
      <h2 className="mb-4 text-base font-semibold text-slate-950">Matter information</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Dispute type">
          <Select value={matter.fields.disputeType} onChange={(event) => patch({ disputeType: event.target.value as DisputeType })}>
            {disputeTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </Select>
        </Field>
        <Field label="Claim value">
          <Input value={matter.fields.claimValue} onChange={(event) => patch({ claimValue: event.target.value })} />
        </Field>
        <Field label="Dispute description" className="md:col-span-2">
          <Textarea value={matter.fields.disputeDescription} onChange={(event) => patch({ disputeDescription: event.target.value })} />
        </Field>
        <Field label="Opponent">
          <Input value={matter.fields.opponentName} onChange={(event) => patch({ opponentName: event.target.value })} />
        </Field>
        <Field label="Opponent solicitor">
          <Input value={matter.fields.opponentSolicitor} onChange={(event) => patch({ opponentSolicitor: event.target.value })} />
        </Field>
        <Field label="Opponent address" className="md:col-span-2">
          <Textarea value={matter.fields.opponentAddress} onChange={(event) => patch({ opponentAddress: event.target.value })} />
        </Field>
        <Field label="Date dispute arose">
          <Input placeholder="YYYY-MM-DD" value={matter.fields.dateDisputeArose} onChange={(event) => patch({ dateDisputeArose: event.target.value })} />
        </Field>
        <Field label="Limitation date">
          <Input placeholder="YYYY-MM-DD" value={matter.fields.limitationDate} onChange={(event) => patch({ limitationDate: event.target.value })} />
        </Field>
      </div>
    </section>
  );
}

function AdhocEditor({
  matter,
  updateMatter
}: {
  matter: AdHocMatter;
  updateMatter: (matterId: string, updater: (matter: Matter) => Matter) => void;
}) {
  function patch(fields: Partial<AdHocMatter["fields"]>) {
    updateMatter(matter.id, (current) =>
      current.type === "adhoc" ? { ...current, fields: { ...current.fields, ...fields } } : current
    );
  }

  return (
    <section className="surface-card p-4">
      <h2 className="mb-4 text-base font-semibold text-slate-950">Matter information</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Matter description" className="md:col-span-2">
          <Textarea value={matter.fields.matterDescription} onChange={(event) => patch({ matterDescription: event.target.value })} />
        </Field>
        <Field label="Third party">
          <Input value={matter.fields.thirdPartyName} onChange={(event) => patch({ thirdPartyName: event.target.value })} />
        </Field>
        <Field label="Third party address">
          <Textarea value={matter.fields.thirdPartyAddress} onChange={(event) => patch({ thirdPartyAddress: event.target.value })} />
        </Field>
      </div>
    </section>
  );
}

function AmlPanel({
  matter,
  updateAml
}: {
  matter: Matter;
  updateAml: (matterId: string, patch: Partial<Matter["aml"]>) => void;
}) {
  const amlStatus = getAmlStatus(matter.aml);
  const readyForReview =
    matter.aml.photoIdReceived &&
    matter.aml.proofOfAddressReceived &&
    matter.aml.sourceOfFundsReceived;

  return (
    <section className="surface-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">AML compliance</h2>
        <AmlStatusBadge aml={matter.aml} />
      </div>
      <div className="grid gap-3 text-sm">
        <ChecklistRow
          label="Photo ID Received"
          checked={matter.aml.photoIdReceived}
          onChange={(checked) => updateAml(matter.id, { photoIdReceived: checked })}
        />
        <ChecklistRow
          label="Proof of Address Received"
          checked={matter.aml.proofOfAddressReceived}
          onChange={(checked) => updateAml(matter.id, { proofOfAddressReceived: checked })}
        />
        <ChecklistRow
          label="Source of Funds Received"
          checked={matter.aml.sourceOfFundsReceived}
          onChange={(checked) => updateAml(matter.id, { sourceOfFundsReceived: checked })}
        />
      </div>
      <Button
        type="button"
        variant="success"
        className="mt-4 w-full"
        disabled={!readyForReview || amlStatus === "Verified"}
        onClick={() => updateAml(matter.id, { verified: true })}
      >
        Mark as Verified
      </Button>
    </section>
  );
}

function ChecklistRow({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border bg-slate-50 px-3 py-2 transition-all duration-200 hover:border-primary/30 hover:bg-white hover:shadow-soft active:scale-[0.99]">
      <span>{label}</span>
      <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function MatterChecklistPanel({
  matter,
  items,
  onToggle,
  onAdd
}: {
  matter: Matter;
  items: MatterChecklistItem[];
  onToggle: (matterId: string, itemId: string, completed: boolean) => void;
  onAdd: (matterId: string, label: string) => MatterChecklistItem | undefined;
}) {
  const [customItem, setCustomItem] = useState("");
  const completedCount = items.filter((item) => item.completedAt).length;
  const complete = items.length > 0 && completedCount === items.length;

  function addCustomItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = customItem.trim();
    if (!label || complete) return;
    onAdd(matter.id, label);
    setCustomItem("");
  }

  return (
    <section className="surface-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ListChecks className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold text-slate-950">Matter checklist</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Practical tasks for this {MATTER_LABELS[matter.type].toLowerCase()} workflow.
          </p>
        </div>
        <Badge variant={complete ? "open" : "navy"}>
          {complete ? "Complete" : `${completedCount}/${items.length}`}
        </Badge>
      </div>

      <div className="grid gap-2">
        {items.map((item) => {
          const checked = Boolean(item.completedAt);
          return (
            <label
              key={item.id}
              className={cn(
                "flex items-start justify-between gap-3 rounded-md border bg-slate-50 px-3 py-2 text-sm transition-all duration-200",
                complete
                  ? "cursor-default"
                  : "cursor-pointer hover:border-primary/30 hover:bg-white hover:shadow-soft active:scale-[0.99]"
              )}
            >
              <span className="min-w-0">
                <span
                  className={cn(
                    "block font-medium text-slate-900",
                    checked && "text-slate-600 line-through decoration-slate-300"
                  )}
                >
                  {item.label}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {item.custom ? <Badge variant="default">Custom</Badge> : null}
                  {item.completedAt ? (
                    <span>Ticked {relativeTimestamp(item.completedAt)}</span>
                  ) : (
                    <span>Outstanding</span>
                  )}
                </span>
              </span>
              <Checkbox
                checked={checked}
                disabled={complete}
                onChange={(event) => onToggle(matter.id, item.id, event.target.checked)}
              />
            </label>
          );
        })}
      </div>

      {complete ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>This checklist is complete and is now read-only.</span>
        </div>
      ) : (
        <form onSubmit={addCustomItem} className="mt-4 flex gap-2">
          <Input
            value={customItem}
            onChange={(event) => setCustomItem(event.target.value)}
            placeholder="Add custom checklist item"
          />
          <Button type="submit" variant="outline" disabled={!customItem.trim()}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </form>
      )}
    </section>
  );
}

function KeyDates({
  matter,
  calendarEvents
}: {
  matter: Matter;
  calendarEvents: CalendarEvent[];
}) {
  const rows =
    matter.type === "conveyancing"
      ? [
          ["Date opened", formatDisplayDate(matter.dateOpened)],
          ["Expected closing date", formatDisplayDate(matter.fields.closingDate)]
        ]
      : matter.type === "purchase"
        ? [
            ["Date opened", formatDisplayDate(matter.dateOpened)],
            ["Expected closing date", formatDisplayDate(matter.fields.closingDate)]
          ]
      : matter.type === "litigation"
        ? [
            ["Date opened", formatDisplayDate(matter.dateOpened)],
            ["Date dispute arose", formatDisplayDate(matter.fields.dateDisputeArose)],
            ["Limitation date", formatDisplayDate(matter.fields.limitationDate)]
          ]
        : [
            ["Date opened", formatDisplayDate(matter.dateOpened)],
            ["Review deadline", "To be agreed"]
          ];
  const linkedEvents = calendarEvents
    .filter((event) => event.matterId === matter.id)
    .sort((a, b) => {
      const dateOrder = a.date.localeCompare(b.date);
      if (dateOrder !== 0) return dateOrder;
      return (timeKey(a.time) || "23:59").localeCompare(timeKey(b.time) || "23:59");
    });

  return (
    <section className="surface-card p-4">
      <h2 className="mb-4 text-base font-semibold text-slate-950">Key dates</h2>
      <div className="grid gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right font-medium text-slate-800">{value}</span>
          </div>
        ))}
      </div>
      {linkedEvents.length > 0 ? (
        <div className="mt-4 border-t pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            Added calendar events
          </h3>
          <div className="grid gap-2">
            {linkedEvents.map((event) => (
              <div key={event.id} className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-950">{event.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {calendarEventTypeLabels[event.type]}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-medium text-slate-800">
                    {formatDisplayDate(event.date)}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatEventTime(event.time)}
                    </span>
                  </span>
                </div>
                {event.notes ? (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{event.notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ConflictCheckPanel({
  logs,
  onRun
}: {
  logs: ConflictCheckLog[];
  onRun: () => void;
}) {
  const latest = logs[0];
  return (
    <section className="surface-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Conflict check</h2>
          <p className="text-sm text-muted-foreground">
            Searches clients, counterparties, opponents, vendors, buyers, and third parties.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRun}>
          Run Check
        </Button>
      </div>
      {!latest ? (
        <EmptyState
          icon={AlertTriangle}
          title="No conflict check logged"
          description="Run a check to record it on this matter timeline."
          className="py-6"
        />
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3 rounded-md border bg-slate-50 px-3 py-2 text-sm">
            <span>
              <span className="block font-semibold text-slate-950">
                {latest.resultCount} potential match{latest.resultCount === 1 ? "" : "es"}
              </span>
              <span className="text-xs text-muted-foreground">
                {relativeTimestamp(latest.checkedAt)} by {latest.checkedBy}
              </span>
            </span>
            <Badge variant={latest.resultCount > 0 ? "warning" : "open"}>
              {latest.resultCount > 0 ? "Review" : "Clear"}
            </Badge>
          </div>
          {latest.matches.length > 0 ? (
            <div className="grid gap-2">
              {latest.matches.slice(0, 5).map((match) => (
                <div key={`${match.kind}-${match.id}-${match.detail}`} className="rounded-md border bg-white px-3 py-2 text-sm">
                  <div className="font-semibold text-slate-950">
                    {match.kind === "client" ? "Client" : "Matter"} · {match.label}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{match.detail}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ResearchPanel({ matter }: { matter: AdHocMatter }) {
  return (
    <section className="surface-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">AI Legal Research</h2>
        <Badge
          variant={
            matter.aiResearch?.status === "complete"
              ? "open"
              : matter.aiResearch?.status === "error"
                ? "danger"
                : "warning"
          }
        >
          {matter.aiResearch?.status === "complete"
            ? "Complete"
            : matter.aiResearch?.status === "error"
              ? "Error"
              : "Pending"}
        </Badge>
      </div>
      {matter.aiResearch?.summary ? (
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
          {matter.aiResearch.summary}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {matter.aiResearch?.error ?? "Research summary pending."}
        </p>
      )}
    </section>
  );
}

function LetterViewer({
  matter,
  client,
  letters,
  selectedLetter,
  documentStatuses,
  documentSentAt,
  globalTemplates,
  settings,
  onSelect,
  onStatus,
  onTemplate,
  toast
}: {
  matter: Matter;
  client: Client;
  letters: ReturnType<typeof getLetters>;
  selectedLetter: ReturnType<typeof getLetters>[number] | undefined;
  documentStatuses: Record<string, LetterStatus>;
  documentSentAt: Record<string, string>;
  globalTemplates: Record<string, WordTemplate>;
  settings: ReturnType<typeof useKeroStore>["state"]["settings"];
  onSelect: (letterId: string) => void;
  onStatus: (letterId: string, status: LetterStatus) => void;
  onTemplate: (letterId: string, template: WordTemplate) => void;
  toast: (message: string) => void;
}) {
  const [confirmLetterId, setConfirmLetterId] = useState<string | null>(null);

  if (!selectedLetter) return null;
  const currentLetter = selectedLetter;
  const sentCount = letters.filter((letter) => getLetterStatus(matter.id, letter.id, documentStatuses) === "Sent").length;

  async function copyLetter() {
    await navigator.clipboard.writeText(currentLetter.text);
    toast("Letter copied");
  }

  async function htmlForCurrentLetter() {
    const template = matter.customTemplates[currentLetter.id] ?? globalTemplates[currentLetter.id];
    if (!template) return letterTextToHtml(currentLetter);
    return buildFilledWordTemplateHtml(
      template,
      makeLetterVariables(matter, client, settings)
    );
  }

  async function printLetter() {
    try {
      await printHtmlAsPdf(
        await htmlForCurrentLetter(),
        pdfFileName(currentLetter, matter, client)
      );
      toast("PDF print preview opened");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not print PDF");
    }
  }

  async function downloadLetter() {
    try {
      await downloadHtmlAsPdf(
        await htmlForCurrentLetter(),
        pdfFileName(currentLetter, matter, client)
      );
      toast("PDF downloaded");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not download PDF");
    }
  }

  async function emailLetter() {
    try {
      await emailLetterWithGeneratedPdf({
        html: await htmlForCurrentLetter(),
        fileName: pdfFileName(currentLetter, matter, client),
        matter,
        client
      });
      toast("PDF downloaded and email draft opened");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not prepare email draft");
    }
  }

  async function uploadTemplate(file: File | undefined) {
    if (!file) return;
    try {
      const template = await createWordTemplateFromFile(file);
      onTemplate(currentLetter.id, template);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not upload Word template");
    }
  }

  function markSent(letter: ReturnType<typeof getLetters>[number]) {
    const alreadySent = getLetterStatus(matter.id, letter.id, documentStatuses) === "Sent";
    onStatus(letter.id, "Sent");
    setConfirmLetterId(null);
    toast(alreadySent ? "Letter marked as resent" : "Letter marked as sent");
  }

  return (
    <section className="surface-card p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Generated letters</h2>
          <p className="text-sm text-muted-foreground">
            {sentCount} of {letters.length} letters sent
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copyLetter}>
            <Clipboard className="h-4 w-4" />
            Copy
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={printLetter}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={downloadLetter}>
            <Download className="h-4 w-4" />
            Download
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={emailLetter}>
            <Mail className="h-4 w-4" />
            Email Draft
          </Button>
          <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md border bg-white px-3 text-xs font-semibold shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted hover:shadow-elevated active:scale-[0.98]">
            <Upload className="h-4 w-4" />
            .docx Template
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(event) => {
                uploadTemplate(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          {letters.map((letter) => {
            const status = getLetterStatus(matter.id, letter.id, documentStatuses);
            const sent = status === "Sent";
            const sentAt = documentSentAt[getDocumentKey(matter.id, letter.id)];
            const active = currentLetter.id === letter.id;

            return (
              <div
                key={letter.id}
                className={cn(
                  "rounded-md border bg-slate-50 p-3 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white hover:shadow-soft",
                  active && "border-primary bg-primary/5 shadow-soft"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSelect(letter.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-950">{letter.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          {letter.isCustom ? (
                            <Badge variant="navy" className="shadow-none">Custom</Badge>
                          ) : null}
                          {sent ? (
                            <Badge variant="open" className="gap-1 shadow-none">
                              <CheckCircle2 className="h-3 w-3" />
                              Sent{sentAt ? ` ${relativeTimestamp(sentAt)}` : ""}
                            </Badge>
                          ) : null}
                        </span>
                      </span>
                    </span>
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant={sent ? "outline" : "success"}
                    onClick={() => setConfirmLetterId(letter.id)}
                    className="shrink-0"
                  >
                    <Send className="h-4 w-4" />
                    {sent ? "Resend" : "Mark as Sent"}
                  </Button>
                </div>

                {confirmLetterId === letter.id ? (
                  <div className="mt-3 rounded-md border border-primary/20 bg-white p-3 shadow-soft">
                    <p className="text-sm font-semibold text-slate-950">
                      Mark this letter as sent?
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button type="button" size="sm" onClick={() => markSent(letter)}>
                        Confirm
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmLetterId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <article className="print-letter document-preview min-h-[620px] overflow-auto rounded-md border p-6">
          <pre className="whitespace-pre-wrap font-serif text-[15px] leading-7 text-slate-900">
            {currentLetter.text}
          </pre>
        </article>
      </div>
    </section>
  );
}

function getMatterConflictQueries(matter: Matter, client: Client) {
  const queries = [client.fullName];
  if (matter.type === "conveyancing") {
    queries.push(
      matter.fields.buyerName,
      matter.fields.buyerSolicitorName,
      matter.fields.buyerSolicitorAddress,
      matter.fields.auctioneerName,
      matter.fields.mortgageHolder,
      matter.fields.propertyAddress
    );
  }
  if (matter.type === "purchase") {
    queries.push(
      matter.fields.vendorName,
      matter.fields.vendorSolicitorName,
      matter.fields.vendorSolicitorAddress,
      matter.fields.mortgageLender,
      matter.fields.propertyAddress
    );
  }
  if (matter.type === "litigation") {
    queries.push(
      matter.fields.opponentName,
      matter.fields.opponentSolicitor,
      matter.fields.opponentAddress,
      matter.fields.disputeDescription
    );
  }
  if (matter.type === "adhoc") {
    queries.push(
      matter.fields.thirdPartyName,
      matter.fields.thirdPartyAddress,
      matter.fields.matterDescription
    );
  }
  return Array.from(new Set(queries.map((query) => query.trim()).filter((query) => query.length >= 3)));
}

function getDocumentKey(matterId: string, letterId: string) {
  return `${matterId}:${letterId}`;
}

function getLetterStatus(
  matterId: string,
  letterId: string,
  statuses: Record<string, LetterStatus>
): LetterStatus {
  return statuses[getDocumentKey(matterId, letterId)] ?? "Drafted";
}
