"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BotMessageSquare,
  Building2,
  CalendarDays,
  Clock3,
  Files,
  FilePlus2,
  FileText,
  FolderKanban,
  History,
  LibraryBig,
  LayoutDashboard,
  ReceiptText,
  Search,
  SearchX,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import { EmptyState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { formatCurrency, getInvoiceDisplayStatus } from "@/lib/billing";
import { buildCalendarEvents, calendarEventTypeLabels, formatEventTime } from "@/lib/calendar";
import { formatDisplayDate } from "@/lib/dates";
import { buildDefaultMatterChecklist } from "@/lib/matter-checklists";
import { navigateWithSoftTransition } from "@/lib/navigation-transition";
import { displayResourceUrl, resourceCategories } from "@/lib/resources";
import { getCurrentStage, getMatterTitle, MATTER_LABELS } from "@/lib/stages";
import { useKeroStore } from "@/lib/storage";
import { getAmlStatus, getLetterCatalog, getLetters } from "@/lib/templates";
import type { Matter } from "@/lib/types";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  href: string;
  kind:
    | "Client"
    | "Matter"
    | "Letter"
    | "Note"
    | "Checklist"
    | "Research"
    | "Calendar"
    | "Invoice"
    | "Time"
    | "Expense"
    | "Timeline"
    | "Conflict"
    | "Resource"
    | "Settings"
    | "Section"
    | "Activity"
    | "Team"
    | "Template"
    | "AML";
  title: string;
  subtitle: string;
  detail: string;
  haystack: string;
  icon?: typeof Search;
  external?: boolean;
};

export function GlobalSearch({ className }: { className?: string }) {
  const router = useRouter();
  const { state, hydrated } = useKeroStore();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const records = useMemo(() => buildSearchRecords(state), [state]);

  const results = useMemo(() => {
    const terms = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    if (terms.length === 0) return [];

    return records
      .filter((record) => terms.every((term) => record.haystack.includes(term)))
      .sort((a, b) => scoreResult(b, terms[0]) - scoreResult(a, terms[0]))
      .slice(0, 10);
  }, [query, records]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    function focusSearch() {
      const input = inputRef.current;
      if (!input || input.getClientRects().length === 0 || input.disabled) return;
      input.focus();
      input.select();
      setOpen(true);
    }

    window.addEventListener("kero:focus-global-search", focusSearch);
    return () => window.removeEventListener("kero:focus-global-search", focusSearch);
  }, []);

  function openResult(result: SearchResult) {
    if (result.external) {
      setOpen(false);
      setQuery("");
      const opened = window.open(result.href, "_blank", "noopener,noreferrer");
      if (!opened) window.location.href = result.href;
      return;
    }

    navigateWithSoftTransition(router, result.href, () => {
      setOpen(false);
      setQuery("");
    });
  }

  function submitFirstResult() {
    if (results[0]) openResult(results[0]);
  }

  return (
    <div ref={wrapperRef} className={cn("relative w-full max-w-md", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        disabled={!hydrated}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            submitFirstResult();
          }
        }}
        placeholder="Search"
        className="h-9 bg-white/95 pl-9 pr-9"
      />
      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setOpen(false);
          }}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-slate-950"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      {open && query.trim() ? (
        <div className="stagger-in absolute right-0 top-11 z-50 w-full min-w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-md border bg-white shadow-elevated">
          {results.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No results found"
              description="Try a page, client name, file reference, note, letter title, or key date."
              className="rounded-none border-0 py-6"
            />
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {results.map((result) => {
                const Icon = result.icon ?? iconForKind(result.kind);
                return (
                  <button
                    key={result.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      openResult(result);
                    }}
                    className="grid w-full grid-cols-[32px_1fr] gap-3 border-b px-3 py-3 text-left text-sm transition-all duration-200 last:border-b-0 hover:bg-slate-50 hover:shadow-soft"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold text-slate-950">
                          {result.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {result.kind}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {result.subtitle}
                      </span>
                      {result.detail ? (
                        <span className="block truncate text-xs text-slate-600">
                          {result.detail}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function buildSearchRecords(state: ReturnType<typeof useKeroStore>["state"]) {
  const clientsById = new Map(state.clients.map((client) => [client.id, client]));
  const sectionRecords: SearchResult[] = [
    {
      id: "section-dashboard",
      href: "/",
      kind: "Section",
      icon: LayoutDashboard,
      title: "Dashboard",
      subtitle: "Summary view",
      detail: "Active matters, urgent matters, recent activity, billing and upcoming events",
      haystack: normalise([
        "dashboard",
        "home",
        "overview",
        "summary",
        "active matters",
        "urgent matters",
        "recent activity",
        "billing summary",
        "upcoming events"
      ])
    },
    {
      id: "section-kero-ai",
      href: "/briefing",
      kind: "Section",
      icon: BotMessageSquare,
      title: "Kero AI",
      subtitle: "Assistant chat and voice mode",
      detail: "Ask questions, brief files, search matters and propose changes",
      haystack: normalise([
        "kero ai",
        "ai",
        "assistant",
        "briefing",
        "chat",
        "voice",
        "dictation",
        "actions",
        "automation"
      ])
    },
    {
      id: "section-new-matter",
      href: "/new",
      kind: "Section",
      icon: FilePlus2,
      title: "New Matter",
      subtitle: "Create a new file",
      detail: "Open a conveyancing, litigation or ad hoc matter",
      haystack: normalise([
        "new matter",
        "create matter",
        "add matter",
        "new file",
        "intake",
        "client intake",
        "conveyancing",
        "litigation",
        "ad hoc"
      ])
    },
    {
      id: "section-matters",
      href: "/matters",
      kind: "Section",
      icon: FolderKanban,
      title: "Matters",
      subtitle: "Full matter list",
      detail: "Search, filter and open every matter",
      haystack: normalise([
        "matters",
        "matter",
        "files",
        "file list",
        "cases",
        "workflows",
        "filter matters",
        "search matters"
      ])
    },
    {
      id: "section-clients",
      href: "/clients",
      kind: "Section",
      icon: UsersRound,
      title: "Clients",
      subtitle: "Client records",
      detail: "View client details and linked matters",
      haystack: normalise([
        "clients",
        "client",
        "contacts",
        "client records",
        "people",
        "linked matters"
      ])
    },
    {
      id: "section-documents",
      href: "/documents",
      kind: "Section",
      icon: Files,
      title: "Documents",
      subtitle: "Letter and template hub",
      detail: "Manage generated letters, Word templates, PDFs and sent status",
      haystack: normalise([
        "documents",
        "document",
        "letters",
        "templates",
        "word templates",
        "docx",
        "pdf",
        "sent letters",
        "print",
        "download"
      ])
    },
    {
      id: "section-calendar",
      href: "/calendar",
      kind: "Section",
      icon: CalendarDays,
      title: "Calendar",
      subtitle: "Key dates and events",
      detail: "Closing dates, limitation dates, court dates, invoice due dates and meetings",
      haystack: normalise([
        "calendar",
        "events",
        "dates",
        "key dates",
        "meetings",
        "appointments",
        "closing date",
        "limitation date",
        "court date",
        "invoice due date"
      ])
    },
    {
      id: "section-activity",
      href: "/activity",
      kind: "Section",
      icon: History,
      title: "Activity",
      subtitle: "Firm-wide action log",
      detail: "Recent actions, audit trail and activity export",
      haystack: normalise([
        "activity",
        "actions",
        "recent actions",
        "audit log",
        "firm activity",
        "history",
        "export activity"
      ])
    },
    {
      id: "section-billing",
      href: "/billing",
      kind: "Section",
      icon: ReceiptText,
      title: "Time & Billing",
      subtitle: "Time entries, expenses and invoices",
      detail: "Billing dashboard, weekly timesheet, unbilled time and invoice management",
      haystack: normalise([
        "time billing",
        "billing",
        "time",
        "invoices",
        "invoice",
        "expenses",
        "expense",
        "timesheet",
        "payments",
        "paid",
        "overdue",
        "unbilled"
      ])
    },
    {
      id: "section-my-firm",
      href: "/my-firm",
      kind: "Section",
      icon: Building2,
      title: "My Firm",
      subtitle: "Firm management hub",
      detail: "Firm profile, performance, team, permissions, reports and workload",
      haystack: normalise([
        "my firm",
        "firm",
        "company",
        "team",
        "permissions",
        "performance",
        "reports",
        "workload",
        "hours saved",
        "team management"
      ])
    },
    {
      id: "section-resources",
      href: "/resources",
      kind: "Resource",
      icon: LibraryBig,
      title: "Resources",
      subtitle: "External solicitor tools and reference links",
      detail: "LandDirect, Registry of Deeds, Courts, legislation, Revenue, CRO, compliance and planning portals",
      haystack: normalise([
        "resources",
        "resource",
        "tools",
        "external links",
        "landdirect",
        "land direct",
        "land registry",
        "land registry online",
        "irish land commission",
        "registry of deeds",
        "courts service",
        "courts.ie",
        "irish statute book",
        "curia",
        "court of justice",
        "law society",
        "revenue",
        "cro",
        "companies registration office",
        "central bank",
        "data protection",
        "gdpr",
        "property registration",
        "pra",
        "tailte",
        "planning portals",
        "myplan"
      ])
    },
    {
      id: "section-settings",
      href: "/settings",
      kind: "Settings",
      icon: Settings,
      title: "Settings",
      subtitle: state.settings.firmName || "Firm preferences",
      detail: "Firm details, dashboard, matters, letters, Kero AI, notifications, appearance and billing defaults",
      haystack: normalise([
        "settings",
        "preferences",
        "configuration",
        "firm settings",
        "firm details",
        state.settings.firmName,
        state.settings.firmAddress,
        state.settings.solicitorName,
        "dashboard settings",
        "matter defaults",
        "letter defaults",
        "kero ai settings",
        "notifications",
        "appearance",
        "billing defaults"
      ])
    }
  ];

  const resourceRecords: SearchResult[] = resourceCategories.flatMap((category) =>
    category.links.map((link) => ({
      id: `resource-${slugify(`${category.title}-${link.title}`)}`,
      href: link.url,
      kind: "Resource" as const,
      icon: LibraryBig,
      title: link.title,
      subtitle: `${category.title} · Opens external site`,
      detail: `${displayResourceUrl(link.url)} · ${link.description}`,
      haystack: normalise([
        category.title,
        link.title,
        link.url,
        displayResourceUrl(link.url),
        link.description,
        ...(link.aliases ?? [])
      ]),
      external: true
    }))
  );

  const clientRecords: SearchResult[] = state.clients.map((client) => {
    const clientMatters = state.matters.filter((matter) => matter.clientId === client.id);
    const detail = `${client.email} · ${client.phone}`;
    return {
      id: `client-${client.id}`,
      href: `/clients/${client.id}`,
      kind: "Client",
      title: client.fullName,
      subtitle: `${clientMatters.length} linked matters`,
      detail,
      haystack: normalise([
        client.fullName,
        client.address,
        client.phone,
        client.email,
        client.ppsNumber,
        client.dateOfBirth,
        detail,
        ...clientMatters.map((matter) => matter.fileReference)
      ])
    };
  });

  const matterRecords: SearchResult[] = state.matters.map((matter) => {
    const client = clientsById.get(matter.clientId);
    const amlStatus = getAmlStatus(matter.aml);
    const checklistItems =
      state.matterChecklists[matter.id] ?? buildDefaultMatterChecklist(matter.type);
    const title = `${matter.fileReference} · ${getMatterTitle(matter)}`;
    const subtitle = `${MATTER_LABELS[matter.type]} · ${client?.fullName ?? "Unknown client"}`;
    const detail = `${matter.status} · ${getCurrentStage(matter)} · AML ${amlStatus}`;

    return {
      id: `matter-${matter.id}`,
      href: `/matters/${matter.id}`,
      kind: "Matter",
      title,
      subtitle,
      detail,
      haystack: normalise([
        title,
        subtitle,
        detail,
        matter.fileReference,
        MATTER_LABELS[matter.type],
        matter.status,
        getCurrentStage(matter),
        amlStatus,
        (state.pinnedMatterIds ?? []).includes(matter.id) ? "pinned favourite favorite starred" : undefined,
        matter.dateOpened,
        formatDisplayDate(matter.dateOpened),
        matter.updatedAt,
        formatDisplayDate(matter.updatedAt),
        client?.fullName,
        client?.email,
        client?.phone,
        ...checklistItems.flatMap((item) => [
          item.label,
          item.completedAt ? "completed" : "outstanding",
          item.completedAt,
          item.completedAt ? formatDisplayDate(item.completedAt) : undefined
        ]),
        ...collectMatterStrings(matter)
      ])
    };
  });

  const noteRecords = state.matters.flatMap((matter) => {
    const client = clientsById.get(matter.clientId);
    return matter.notes.map<SearchResult>((note) => ({
      id: `note-${matter.id}-${note.id}`,
      href: `/matters/${matter.id}`,
      kind: "Note",
      title: `${matter.fileReference} note`,
      subtitle: `${client?.fullName ?? "Unknown client"} · ${getMatterTitle(matter)}`,
      detail: note.body,
      haystack: normalise([
        note.body,
        note.createdAt,
        formatDisplayDate(note.createdAt),
        matter.fileReference,
        getMatterTitle(matter),
        client?.fullName
      ])
    }));
  });

  const letterRecords = state.matters.flatMap((matter) => {
    const client = clientsById.get(matter.clientId);
    if (!client) return [];

    return getLetters(matter, client, state.settings, {
      globalTemplates: state.globalTemplates,
      customLetterTemplates: state.customLetterTemplates
    }).map<SearchResult>((letter) => {
      const key = documentKey(matter.id, letter.id);
      const status = state.documentStatuses[key] ?? "Drafted";
      const sentAt = state.documentSentAt[key];
      return {
        id: `letter-${matter.id}-${letter.id}`,
        href: `/matters/${matter.id}`,
        kind: "Letter",
        title: `${matter.fileReference} · ${letter.title}`,
        subtitle: `${client.fullName} · ${getMatterTitle(matter)}`,
        detail: `${status}${sentAt ? ` ${formatDisplayDate(sentAt)}` : ""} · ${letter.recipientName}`,
        haystack: normalise([
          letter.title,
          letter.recipientName,
          letter.recipientAddress,
          letter.text,
          status,
          sentAt,
          sentAt ? formatDisplayDate(sentAt) : undefined,
          matter.fileReference,
          getMatterTitle(matter),
          client.fullName
        ])
      };
    });
  });

  const amlRecords: SearchResult[] = state.matters.flatMap((matter) => {
    const client = clientsById.get(matter.clientId);
    const items = [
      { key: "photoIdReceived", label: "Photo ID", completed: matter.aml.photoIdReceived },
      {
        key: "proofOfAddressReceived",
        label: "Proof of Address",
        completed: matter.aml.proofOfAddressReceived
      },
      {
        key: "sourceOfFundsReceived",
        label: "Source of Funds",
        completed: matter.aml.sourceOfFundsReceived
      },
      { key: "verified", label: "AML Verified", completed: matter.aml.verified }
    ];

    return items.map<SearchResult>((item) => ({
      id: `aml-${matter.id}-${item.key}`,
      href: `/matters/${matter.id}`,
      kind: "AML",
      title: `${matter.fileReference} · ${item.label}`,
      subtitle: `${client?.fullName ?? "Unknown client"} · AML Compliance`,
      detail: item.completed ? "Complete" : "Outstanding",
      haystack: normalise([
        "aml",
        "anti money laundering",
        item.label,
        item.completed ? "complete verified ticked done" : "outstanding incomplete missing",
        matter.fileReference,
        getMatterTitle(matter),
        client?.fullName
      ])
    }));
  });

  const checklistRecords = state.matters.flatMap((matter) => {
    const client = clientsById.get(matter.clientId);
    const checklistItems =
      state.matterChecklists[matter.id] ?? buildDefaultMatterChecklist(matter.type);
    return checklistItems.map<SearchResult>((item) => ({
      id: `checklist-${matter.id}-${item.id}`,
      href: `/matters/${matter.id}`,
      kind: "Checklist",
      title: `${matter.fileReference} checklist`,
      subtitle: `${client?.fullName ?? "Unknown client"} · ${getMatterTitle(matter)}`,
      detail: `${item.label} · ${item.completedAt ? `Ticked ${formatDisplayDate(item.completedAt)}` : "Outstanding"}`,
      haystack: normalise([
        item.label,
        item.custom ? "custom" : "default",
        item.completedAt ? "completed ticked done" : "outstanding incomplete",
        item.completedAt,
        item.completedAt ? formatDisplayDate(item.completedAt) : undefined,
        matter.fileReference,
        getMatterTitle(matter),
        client?.fullName
      ])
    }));
  });

  const researchRecords = state.matters
    .filter((matter) => matter.aiResearch?.summary || matter.aiResearch?.error)
    .map<SearchResult>((matter) => {
      const client = clientsById.get(matter.clientId);
      return {
        id: `research-${matter.id}`,
        href: `/matters/${matter.id}`,
        kind: "Research",
        title: `${matter.fileReference} research`,
        subtitle: `${client?.fullName ?? "Unknown client"} · ${getMatterTitle(matter)}`,
        detail: matter.aiResearch?.summary || matter.aiResearch?.error || "",
        haystack: normalise([
          matter.aiResearch?.status,
          matter.aiResearch?.summary,
          matter.aiResearch?.error,
          matter.fileReference,
          getMatterTitle(matter),
          client?.fullName
        ])
      };
    });

  const calendarRecords: SearchResult[] = buildCalendarEvents(state).map((event) => ({
    id: `calendar-${event.id}`,
    href: event.matterId ? `/matters/${event.matterId}` : "/calendar",
    kind: "Calendar",
    title: event.title,
    subtitle: `${calendarEventTypeLabels[event.type]} · ${formatDisplayDate(event.date)}`,
    detail: `${formatEventTime(event.time)} · ${event.client?.fullName ?? "No client"} · ${event.matter?.fileReference ?? "No matter"}`,
    haystack: normalise([
      event.title,
      calendarEventTypeLabels[event.type],
      event.date,
      formatDisplayDate(event.date),
      formatEventTime(event.time),
      event.notes,
      event.client?.fullName,
      event.matter?.fileReference,
      event.matter ? getMatterTitle(event.matter) : undefined
    ])
  }));

  const invoiceRecords: SearchResult[] = state.invoices.map((invoice) => {
    const matter = state.matters.find((item) => item.id === invoice.matterId);
    const client = state.clients.find((item) => item.id === invoice.clientId);
    const status = getInvoiceDisplayStatus(invoice);
    return {
      id: `invoice-${invoice.id}`,
      href: `/billing?status=${encodeURIComponent(status)}`,
      kind: "Invoice",
      title: invoice.invoiceNumber,
      subtitle: `${client?.fullName ?? "Unknown client"} · ${matter?.fileReference ?? "No matter"}`,
      detail: `${status} · ${formatCurrency(invoice.total)} · Due ${formatDisplayDate(invoice.dueDate)}`,
      haystack: normalise([
        invoice.invoiceNumber,
        status,
        formatCurrency(invoice.total),
        invoice.invoiceDate,
        invoice.dueDate,
        formatDisplayDate(invoice.invoiceDate),
        formatDisplayDate(invoice.dueDate),
        client?.fullName,
        client?.address,
        matter?.fileReference,
        matter ? getMatterTitle(matter) : undefined,
        ...invoice.lineItems.flatMap((line) => collectStrings(line))
      ])
    };
  });

  const timeRecords: SearchResult[] = state.timeEntries.map((entry) => {
    const matter = state.matters.find((item) => item.id === entry.matterId);
    const client = matter ? clientsById.get(matter.clientId) : undefined;
    return {
      id: `time-${entry.id}`,
      href: matter ? `/matters/${matter.id}` : "/billing",
      kind: "Time",
      title: entry.description || "Time entry",
      subtitle: `${matter?.fileReference ?? "No matter"} · ${client?.fullName ?? "Unknown client"}`,
      detail: `${entry.durationHours}h · ${formatCurrency(entry.hourlyRate)}/h · ${entry.billable ? "Billable" : "Non-billable"}`,
      haystack: normalise([
        entry.description,
        entry.date,
        formatDisplayDate(entry.date),
        String(entry.durationHours),
        String(entry.hourlyRate),
        entry.billable ? "billable" : "non billable",
        matter?.fileReference,
        matter ? getMatterTitle(matter) : undefined,
        client?.fullName
      ])
    };
  });

  const expenseRecords: SearchResult[] = state.expenses.map((expense) => {
    const matter = state.matters.find((item) => item.id === expense.matterId);
    const client = matter ? clientsById.get(matter.clientId) : undefined;
    return {
      id: `expense-${expense.id}`,
      href: matter ? `/matters/${matter.id}` : "/billing",
      kind: "Expense",
      title: expense.description || "Expense",
      subtitle: `${matter?.fileReference ?? "No matter"} · ${client?.fullName ?? "Unknown client"}`,
      detail: `${formatCurrency(expense.amount)} · ${expense.billable ? "Billable" : "Non-billable"}`,
      haystack: normalise([
        expense.description,
        expense.date,
        formatDisplayDate(expense.date),
        formatCurrency(expense.amount),
        expense.receiptName,
        expense.billable ? "billable" : "non billable",
        matter?.fileReference,
        matter ? getMatterTitle(matter) : undefined,
        client?.fullName
      ])
    };
  });

  const timelineRecords: SearchResult[] = state.timelineEvents.map((event) => {
    const matter = state.matters.find((item) => item.id === event.matterId);
    const client = matter ? clientsById.get(matter.clientId) : undefined;
    return {
      id: `timeline-${event.id}`,
      href: `/matters/${event.matterId}`,
      kind: "Timeline",
      title: `${matter?.fileReference ?? "Matter"} timeline`,
      subtitle: `${client?.fullName ?? "Unknown client"} · ${event.type.replaceAll("_", " ")}`,
      detail: event.description,
      haystack: normalise([
        event.description,
        event.type,
        event.actorName,
        event.createdAt,
        formatDisplayDate(event.createdAt),
        matter?.fileReference,
        matter ? getMatterTitle(matter) : undefined,
        client?.fullName,
        ...collectStrings(event.metadata)
      ])
    };
  });

  const conflictRecords: SearchResult[] = state.conflictCheckLogs.map((log) => {
    const matter = log.matterId
      ? state.matters.find((item) => item.id === log.matterId)
      : undefined;
    const client = matter ? clientsById.get(matter.clientId) : undefined;
    return {
      id: `conflict-${log.id}`,
      href: matter ? `/matters/${matter.id}` : "/matters",
      kind: "Conflict",
      title: `Conflict check · ${matter?.fileReference ?? "Unlinked"}`,
      subtitle: `${log.resultCount} potential match${log.resultCount === 1 ? "" : "es"} · ${log.source}`,
      detail: log.queries.join(", "),
      haystack: normalise([
        "conflict check",
        log.source,
        log.checkedAt,
        formatDisplayDate(log.checkedAt),
        log.checkedBy,
        ...log.queries,
        ...log.matches.flatMap((match) => [match.label, match.detail, match.kind]),
        matter?.fileReference,
        matter ? getMatterTitle(matter) : undefined,
        client?.fullName
      ])
    };
  });

  const activityRecords: SearchResult[] = state.firmActivityLog.map((entry) => {
    const matter = entry.matterId
      ? state.matters.find((item) => item.id === entry.matterId)
      : undefined;
    const client =
      (entry.clientId ? state.clients.find((item) => item.id === entry.clientId) : undefined) ??
      (matter ? clientsById.get(matter.clientId) : undefined);
    return {
      id: `activity-${entry.id}`,
      href: matter ? `/matters/${matter.id}` : client ? `/clients/${client.id}` : "/activity",
      kind: "Activity",
      title: entry.description,
      subtitle: `${entry.actorName} · ${formatDisplayDate(entry.createdAt)}`,
      detail: `${entry.actionType}${matter ? ` · ${matter.fileReference}` : ""}${client ? ` · ${client.fullName}` : ""}`,
      haystack: normalise([
        "activity",
        "recent action",
        "action log",
        entry.actionType,
        entry.description,
        entry.actorName,
        entry.createdAt,
        formatDisplayDate(entry.createdAt),
        matter?.fileReference,
        matter ? getMatterTitle(matter) : undefined,
        client?.fullName,
        ...collectStrings(entry.metadata)
      ])
    };
  });

  const teamRecords: SearchResult[] = state.teamMembers.map((member) => ({
    id: `team-${member.id}`,
    href: "/my-firm",
    kind: "Team",
    title: member.name,
    subtitle: `${member.role} · ${member.status}`,
    detail: member.email,
    haystack: normalise([
      "team",
      "staff",
      "user",
      "permission",
      member.name,
      member.email,
      member.role,
      member.status,
      member.isOwner ? "owner" : undefined
    ])
  }));

  const catalog = getLetterCatalog(state.customLetterTemplates);
  const templateRecords: SearchResult[] = [
    ...catalog.map<SearchResult>((item) => {
      const activeTemplate = state.globalTemplates[item.id];
      return {
        id: `letter-template-${item.id}`,
        href: "/documents",
        kind: "Template",
        title: item.title,
        subtitle: `${MATTER_LABELS[item.matterType]} · ${item.isCustomLetterType ? "Custom letter type" : "Letter template"}`,
        detail: activeTemplate
          ? `Custom Word template active · ${activeTemplate.fileName}`
          : "Default template",
        haystack: normalise([
          "document",
          "letter",
          "template",
          "word",
          "docx",
          item.title,
          MATTER_LABELS[item.matterType],
          item.templateBody,
          item.isCustomLetterType ? "custom letter type" : "default letter type",
          activeTemplate ? "custom template active uploaded" : "default template",
          activeTemplate?.fileName,
          activeTemplate?.extractedText,
          ...(activeTemplate?.placeholders ?? [])
        ])
      };
    }),
    ...state.settings.quickNotes.customTemplates.map<SearchResult>((template) => ({
      id: `quick-note-template-${template.id}`,
      href: "/settings",
      kind: "Template",
      title: "Quick note template",
      subtitle:
        template.matterType === "all"
          ? "All matter types"
          : `${MATTER_LABELS[template.matterType]} notes`,
      detail: template.text,
      haystack: normalise([
        "quick note",
        "note template",
        "settings",
        template.text,
        template.matterType === "all" ? "all matters" : MATTER_LABELS[template.matterType]
      ])
    }))
  ];

  return [
    ...sectionRecords,
    ...resourceRecords,
    ...clientRecords,
    ...matterRecords,
    ...letterRecords,
    ...amlRecords,
    ...noteRecords,
    ...checklistRecords,
    ...researchRecords,
    ...calendarRecords,
    ...invoiceRecords,
    ...timeRecords,
    ...expenseRecords,
    ...timelineRecords,
    ...conflictRecords,
    ...activityRecords,
    ...teamRecords,
    ...templateRecords
  ];
}

function collectMatterStrings(matter: Matter) {
  return [
    ...collectStrings(matter.fields),
    ...collectStrings(matter.aml),
    ...matter.notes.flatMap((note) => collectStrings(note)),
    ...collectStrings(matter.customTemplates),
    ...collectStrings(matter.aiResearch)
  ];
}

function collectStrings(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      collectStrings(item)
    );
  }
  return [];
}

function normalise(values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ").toLowerCase();
}

function documentKey(matterId: string, letterId: string) {
  return `${matterId}:${letterId}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function scoreResult(result: SearchResult, firstTerm: string) {
  const title = result.title.toLowerCase();
  if (title.startsWith(firstTerm)) return 40;
  if (title.includes(firstTerm)) return 30;
  if (result.subtitle.toLowerCase().includes(firstTerm)) return 20;
  return 10;
}

function iconForKind(kind: SearchResult["kind"]) {
  if (kind === "Client") return UserRound;
  if (kind === "AML") return ShieldCheck;
  if (kind === "Activity") return History;
  if (kind === "Calendar") return CalendarDays;
  if (kind === "Invoice" || kind === "Expense") return ReceiptText;
  if (kind === "Time") return Clock3;
  if (kind === "Timeline") return History;
  if (kind === "Conflict") return ShieldCheck;
  if (kind === "Resource") return LibraryBig;
  if (kind === "Settings") return Settings;
  if (kind === "Section") return LayoutDashboard;
  if (kind === "Team") return UsersRound;
  if (kind === "Template") return Files;
  return FileText;
}
