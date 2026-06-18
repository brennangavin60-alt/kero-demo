"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { timeKey } from "@/lib/calendar";
import { addYears, todayIso } from "@/lib/dates";
import { createDemoState } from "@/lib/demo-data";
import { buildDefaultMatterChecklist, mergeMatterChecklist } from "@/lib/matter-checklists";
import { getSolicitorName } from "@/lib/personalisation";
import { getPermissions, type PermissionKey } from "@/lib/permissions";
import { DEFAULT_SETTINGS, mergeSettings } from "@/lib/settings";
import { getStages } from "@/lib/stages";
import type {
  AmlChecklist,
  CalendarEvent,
  Client,
  ConflictCheckLog,
  ConflictCheckMatch,
  CustomLetterTemplate,
  ExpenseEntry,
  FirmActivityLogEntry,
  Invoice,
  InvoiceLine,
  InvoicePayment,
  InvoiceStatus,
  KeroState,
  LetterStatus,
  Matter,
  MatterChecklistItem,
  MatterType,
  NewClientInput,
  NewMatterInput,
  PaymentMethod,
  RecentMatterView,
  Settings,
  TeamMember,
  TeamRole,
  TimelineEvent,
  TimelineEventType,
  TimeEntry,
  WordTemplate
} from "@/lib/types";

const STORAGE_KEY = "kero-state-v1";

const DEFAULT_AML: AmlChecklist = {
  photoIdReceived: false,
  proofOfAddressReceived: false,
  sourceOfFundsReceived: false,
  verified: false
};

function ownerName(settings: Settings) {
  return getSolicitorName(settings) || "Firm Owner";
}

function ownerEmail(settings: Settings) {
  return settings.firmEmail || "owner@kero.local";
}

function defaultTeamMembers(settings: Settings): TeamMember[] {
  const now = todayIso();
  return [
    {
      id: "team_owner",
      name: ownerName(settings),
      email: ownerEmail(settings),
      role: "Owner",
      status: "Active",
      isOwner: true,
      createdAt: now,
      updatedAt: now
    }
  ];
}

function normaliseTeamMembers(teamMembers: TeamMember[] | undefined, settings: Settings): TeamMember[] {
  const fallbackOwner = defaultTeamMembers(settings)[0];
  const incoming = teamMembers && teamMembers.length > 0 ? teamMembers : [fallbackOwner];
  const normalised: TeamMember[] = incoming.map((member, index) => {
    const isOwner = Boolean(member.isOwner) || member.role === "Owner" || index === 0;
    return {
      ...member,
      id: member.id || (isOwner ? "team_owner" : makeId("team")),
      name: member.name?.trim() || (isOwner ? ownerName(settings) : "Team Member"),
      email: member.email?.trim() || (isOwner ? ownerEmail(settings) : ""),
      role: isOwner ? "Owner" as const : member.role,
      status: member.status ?? "Active",
      isOwner,
      createdAt: member.createdAt || todayIso(),
      updatedAt: member.updatedAt || member.createdAt || todayIso()
    } satisfies TeamMember;
  });
  if (!normalised.some((member) => member.isOwner)) {
    return [{ ...fallbackOwner }, ...normalised];
  }
  return normalised.map((member) =>
    member.isOwner
      ? {
          ...member,
          id: member.id || "team_owner",
          name: member.name || ownerName(settings),
          email: member.email || ownerEmail(settings),
          role: "Owner",
          status: "Active",
          isOwner: true
        }
      : member
  );
}

function currentTeamMember(state: KeroState) {
  return (
    state.teamMembers.find((member) => member.id === state.currentTeamMemberId) ??
    state.teamMembers.find((member) => member.isOwner) ??
    defaultTeamMembers(state.settings)[0]
  );
}

const DEFAULT_STATE: KeroState = {
  settings: DEFAULT_SETTINGS,
  clients: [],
  matters: [],
  teamMembers: defaultTeamMembers(DEFAULT_SETTINGS),
  currentTeamMemberId: "team_owner",
  firmActivityLog: [],
  documentStatuses: {},
  documentSentAt: {},
  globalTemplates: {},
  customLetterTemplates: [],
  timeEntries: [],
  expenses: [],
  invoices: [],
  calendarEvents: [],
  matterChecklists: {},
  timelineEvents: [],
  recentMatterViews: [],
  pinnedMatterIds: [],
  conflictCheckLogs: []
};

function emptyDemoState(settings?: Settings) {
  return createDemoState(mergeSettings(settings ?? DEFAULT_STATE.settings));
}

type TimelineEventInput = {
  matterId: string;
  type: TimelineEventType;
  description: string;
  createdAt?: string;
  actorName?: string;
  metadata?: TimelineEvent["metadata"];
};

type ConflictCheckInput = {
  matterId?: string;
  queries: string[];
  source?: ConflictCheckLog["source"];
  excludeClientId?: string;
};

type StoreContextValue = {
  state: KeroState;
  hydrated: boolean;
  currentTeamMember: TeamMember;
  hasPermission: (permission: PermissionKey) => boolean;
  updateSettings: (settings: Settings) => void;
  loadDemoData: () => void;
  setCurrentTeamMember: (memberId: string) => void;
  addTeamMember: (input: { name: string; email: string; role: TeamRole }) => TeamMember | undefined;
  updateTeamMember: (
    memberId: string,
    patch: Partial<Pick<TeamMember, "name" | "email" | "role" | "status">>
  ) => void;
  deactivateTeamMember: (memberId: string) => void;
  assignMatter: (matterId: string, memberId: string) => void;
  createMatter: (input: NewMatterInput) => Matter;
  updateMatter: (matterId: string, updater: (matter: Matter) => Matter) => void;
  updateClient: (clientId: string, patch: Partial<Client>) => void;
  addNote: (matterId: string, body: string) => void;
  updateAml: (matterId: string, patch: Partial<AmlChecklist>) => void;
  toggleMatterChecklistItem: (matterId: string, itemId: string, completed: boolean) => void;
  addMatterChecklistItem: (matterId: string, label: string) => MatterChecklistItem | undefined;
  advanceStage: (matterId: string) => Matter | undefined;
  setCustomTemplate: (matterId: string, letterId: string, template: WordTemplate) => void;
  setGlobalTemplate: (letterId: string, template: WordTemplate) => void;
  clearGlobalTemplate: (letterId: string) => void;
  setLetterStatus: (
    matterId: string,
    letterId: string,
    status: LetterStatus,
    letterTitle?: string
  ) => void;
  addCustomLetterTemplate: (input: {
    title: string;
    matterType: MatterType;
    body: string;
  }) => CustomLetterTemplate;
  addTimeEntry: (input: Omit<TimeEntry, "id" | "createdAt" | "updatedAt">) => TimeEntry | undefined;
  updateTimeEntry: (
    entryId: string,
    patch: Partial<Omit<TimeEntry, "id" | "matterId" | "createdAt">>
  ) => void;
  deleteTimeEntry: (entryId: string) => void;
  addExpense: (input: Omit<ExpenseEntry, "id" | "createdAt" | "updatedAt">) => ExpenseEntry | undefined;
  updateExpense: (
    expenseId: string,
    patch: Partial<Omit<ExpenseEntry, "id" | "matterId" | "createdAt">>
  ) => void;
  deleteExpense: (expenseId: string) => void;
  generateInvoice: (
    matterId: string,
    options?: {
      vatEnabled?: boolean;
      dueDate?: string;
      timeEntryIds?: string[];
      expenseIds?: string[];
      fixedLines?: Array<{
        description: string;
        quantity: number;
        rate: number;
        date?: string;
      }>;
    }
  ) => Invoice | undefined;
  createInvoice: (input: {
    matterId: string;
    vatEnabled?: boolean;
    dueDate?: string;
    lineItems: Array<Omit<InvoiceLine, "id">>;
  }) => Invoice | undefined;
  updateInvoice: (
    invoiceId: string,
    patch: Partial<Pick<Invoice, "dueDate" | "vatEnabled" | "lineItems">>
  ) => void;
  duplicateInvoice: (invoiceId: string) => Invoice | undefined;
  updateInvoiceStatus: (invoiceId: string, status: InvoiceStatus) => void;
  recordInvoicePayment: (
    invoiceId: string,
    input: {
      amount: number;
      date: string;
      method: PaymentMethod;
      note?: string;
    }
  ) => void;
  addCalendarEvent: (
    input: Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">
  ) => CalendarEvent;
  updateCalendarEvent: (
    eventId: string,
    patch: Partial<Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">>
  ) => void;
  deleteCalendarEvent: (eventId: string) => void;
  addTimelineEvent: (input: TimelineEventInput) => TimelineEvent;
  recordMatterView: (matterId: string) => void;
  togglePinnedMatter: (matterId: string) => void;
  runConflictCheck: (input: ConflictCheckInput) => ConflictCheckLog;
};

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

function makeId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}

function timelineActor(state: KeroState) {
  const member = currentTeamMember(state);
  return member.name || getSolicitorName(state.settings) || "Solicitor";
}

function buildTimelineEvent(state: KeroState, input: TimelineEventInput): TimelineEvent {
  return {
    id: makeId("timeline"),
    matterId: input.matterId,
    type: input.type,
    description: input.description.trim(),
    actorName: input.actorName?.trim() || timelineActor(state),
    createdAt: input.createdAt ?? todayIso(),
    metadata: input.metadata
  };
}

function timelineActionLabel(type: TimelineEventType) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildFirmActivityLogEntry(
  state: KeroState,
  input: {
    actionType: string;
    description: string;
    matterId?: string;
    clientId?: string;
    createdAt?: string;
    actorName?: string;
    metadata?: FirmActivityLogEntry["metadata"];
  }
): FirmActivityLogEntry {
  const member = currentTeamMember(state);
  return {
    id: makeId("activity"),
    actorId: member.id,
    actorName: input.actorName?.trim() || member.name || "Solicitor",
    actionType: input.actionType,
    description: input.description.trim(),
    matterId: input.matterId,
    clientId: input.clientId,
    createdAt: input.createdAt ?? todayIso(),
    metadata: input.metadata
  };
}

function appendFirmActivity(
  state: KeroState,
  input:
    | Parameters<typeof buildFirmActivityLogEntry>[1]
    | Array<Parameters<typeof buildFirmActivityLogEntry>[1]>
) {
  const inputs = Array.isArray(input) ? input : [input];
  const entries = inputs
    .filter((entry) => entry.description.trim())
    .map((entry) => buildFirmActivityLogEntry(state, entry));
  if (entries.length === 0) return state;
  return {
    ...state,
    firmActivityLog: [...entries, ...(state.firmActivityLog ?? [])]
  };
}

function appendTimelineEvents(state: KeroState, inputs: TimelineEventInput | TimelineEventInput[]) {
  const eventInputs = Array.isArray(inputs) ? inputs : [inputs];
  const validInputs = eventInputs.filter((input) => input.matterId && input.description.trim());
  if (validInputs.length === 0) return state;
  const events = validInputs.map((input) => buildTimelineEvent(state, input));
  const activities = events.map((event) =>
    buildFirmActivityLogEntry(state, {
      actionType: timelineActionLabel(event.type),
      description: event.description,
      matterId: event.matterId,
      actorName: event.actorName,
      createdAt: event.createdAt,
      metadata: event.metadata
    })
  );
  return {
    ...state,
    timelineEvents: [
      ...events,
      ...(state.timelineEvents ?? [])
    ],
    firmActivityLog: [...activities, ...(state.firmActivityLog ?? [])]
  };
}

function seedTimelineEvents(state: KeroState) {
  return state.matters.map((matter) => ({
    id: `timeline_seed_${matter.id}`,
    matterId: matter.id,
    type: "matter_opened" as const,
    description: `Matter opened (${matter.fileReference})`,
    actorName: timelineActor(state),
    createdAt: matter.dateOpened ?? todayIso()
  }));
}

function ensureMatterChecklists(state: KeroState): KeroState {
  const matterChecklists = { ...(state.matterChecklists ?? {}) };
  state.matters.forEach((matter) => {
    matterChecklists[matter.id] = mergeMatterChecklist(
      matter.type,
      matterChecklists[matter.id]
    );
  });
  return {
    ...state,
    matterChecklists
  };
}

function sanitiseWordTemplates(value: unknown): Record<string, WordTemplate> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, WordTemplate] => {
        const template = entry[1] as Partial<WordTemplate>;
        return (
          template?.kind === "docx" &&
          typeof template.fileName === "string" &&
          typeof template.dataUrl === "string" &&
          template.dataUrl.startsWith("data:") &&
          typeof template.uploadedAt === "string" &&
          typeof template.previewHtml === "string" &&
          typeof template.extractedText === "string" &&
          Array.isArray(template.placeholders)
        );
      }
    )
  );
}

function keyDateTimelineEvents(before: Matter, after: Matter): TimelineEventInput[] {
  const events: TimelineEventInput[] = [];

  if (
    (before.type === "conveyancing" || before.type === "purchase") &&
    before.type === after.type &&
    (after.type === "conveyancing" || after.type === "purchase")
  ) {
    const beforeDate = before.fields.closingDate.trim();
    const afterDate = after.fields.closingDate.trim();
    if (beforeDate !== afterDate && afterDate.length >= 10) {
      events.push({
        matterId: after.id,
        type: "key_date_added",
        description: beforeDate
          ? `Closing date changed from ${beforeDate} to ${afterDate}`
          : `Closing date added: ${afterDate}`,
        metadata: { field: "closingDate", previousValue: beforeDate, newValue: afterDate }
      });
    }
  }

  if (before.type === "litigation" && after.type === "litigation") {
    const beforeDate = before.fields.limitationDate.trim();
    const afterDate = after.fields.limitationDate.trim();
    if (beforeDate !== afterDate && afterDate.length >= 10) {
      events.push({
        matterId: after.id,
        type: "key_date_added",
        description: beforeDate
          ? `Limitation date changed from ${beforeDate} to ${afterDate}`
          : `Limitation date added: ${afterDate}`,
        metadata: { field: "limitationDate", previousValue: beforeDate, newValue: afterDate }
      });
    }
  }

  return events;
}

function matterFieldLabel(field: string) {
  const labels: Record<string, string> = {
    propertyAddress: "property address",
    salePrice: "sale price",
    purchasePrice: "purchase price",
    buyerName: "buyer",
    buyerSolicitorName: "buyer solicitor",
    buyerSolicitorAddress: "buyer solicitor address",
    auctioneerName: "auctioneer",
    mortgageHolder: "mortgage holder",
    vendorName: "vendor",
    vendorSolicitorName: "vendor solicitor",
    vendorSolicitorAddress: "vendor solicitor address",
    mortgageLender: "mortgage lender",
    disputeType: "dispute type",
    disputeDescription: "dispute description",
    opponentName: "opponent",
    opponentSolicitor: "opponent solicitor",
    opponentAddress: "opponent address",
    claimValue: "claim value",
    dateDisputeArose: "date dispute arose",
    matterDescription: "matter description",
    thirdPartyName: "third party",
    thirdPartyAddress: "third party address"
  };
  return labels[field] ?? field;
}

function changedMatterFieldLabels(before: Matter, after: Matter) {
  if (before.type !== after.type) return [];
  const beforeFields = before.fields as Record<string, string>;
  const afterFields = after.fields as Record<string, string>;
  return Object.keys(afterFields)
    .filter((field) => field !== "closingDate" && field !== "limitationDate")
    .filter((field) => beforeFields[field] !== afterFields[field])
    .map(matterFieldLabel);
}

function amlLabel(field: keyof AmlChecklist) {
  if (field === "photoIdReceived") return "photo ID";
  if (field === "proofOfAddressReceived") return "proof of address";
  if (field === "sourceOfFundsReceived") return "source of funds";
  return "AML verified";
}

function conflictSearchText(value: string) {
  return value.trim().toLowerCase();
}

function cleanConflictQueries(queries: string[]) {
  return Array.from(
    new Set(
      queries
        .map((query) => query.trim())
        .filter((query) => query.length >= 3)
    )
  );
}

function matterConflictQueries(matter: Matter, client?: Client) {
  return cleanConflictQueries([
    client?.fullName ?? "",
    ...matterConflictFields(matter).map(([, value]) => value)
  ]);
}

function matterConflictFields(matter: Matter) {
  if (matter.type === "conveyancing") {
    return [
      ["Buyer", matter.fields.buyerName],
      ["Buyer solicitor", matter.fields.buyerSolicitorName],
      ["Buyer solicitor address", matter.fields.buyerSolicitorAddress],
      ["Auctioneer", matter.fields.auctioneerName],
      ["Mortgage holder", matter.fields.mortgageHolder],
      ["Property", matter.fields.propertyAddress]
    ];
  }

  if (matter.type === "purchase") {
    return [
      ["Vendor", matter.fields.vendorName],
      ["Vendor solicitor", matter.fields.vendorSolicitorName],
      ["Vendor solicitor address", matter.fields.vendorSolicitorAddress],
      ["Mortgage lender", matter.fields.mortgageLender],
      ["Property", matter.fields.propertyAddress]
    ];
  }

  if (matter.type === "litigation") {
    return [
      ["Opponent", matter.fields.opponentName],
      ["Opponent solicitor", matter.fields.opponentSolicitor],
      ["Opponent address", matter.fields.opponentAddress],
      ["Dispute", matter.fields.disputeDescription]
    ];
  }

  return [
    ["Third party", matter.fields.thirdPartyName],
    ["Third party address", matter.fields.thirdPartyAddress],
    ["Matter description", matter.fields.matterDescription]
  ];
}

function buildConflictCheckLog(
  state: KeroState,
  input: ConflictCheckInput,
  createdAt = todayIso()
): ConflictCheckLog {
  const queries = cleanConflictQueries(input.queries);
  const matchesByKey = new Map<string, ConflictCheckMatch>();

  queries.forEach((query) => {
    const search = conflictSearchText(query);
    if (!search) return;

    state.clients.forEach((client) => {
      if (input.excludeClientId && client.id === input.excludeClientId) return;
      const haystack = conflictSearchText(
        [
          client.fullName,
          client.address,
          client.email,
          client.phone,
          client.ppsNumber
        ].join(" ")
      );
      if (!haystack.includes(search)) return;
      matchesByKey.set(`client:${client.id}`, {
        id: client.id,
        kind: "client",
        label: client.fullName,
        detail: `Client record matched "${query}"`
      });
    });

    state.matters.forEach((matter) => {
      if (input.matterId && matter.id === input.matterId) return;
      matterConflictFields(matter).forEach(([label, value]) => {
        if (!value || !conflictSearchText(value).includes(search)) return;
        matchesByKey.set(`matter:${matter.id}:${label}`, {
          id: matter.id,
          kind: "matter",
          label: matter.fileReference,
          detail: `${label} matched "${query}": ${value}`
        });
      });
    });
  });

  const matches = Array.from(matchesByKey.values());
  return {
    id: makeId("conflict"),
    matterId: input.matterId || undefined,
    queries,
    matches,
    resultCount: matches.length,
    checkedAt: createdAt,
    checkedBy: timelineActor(state),
    source: input.source ?? "manual"
  };
}

function nextFileReference(matters: Matter[], prefix = DEFAULT_SETTINGS.matterDefaults.fileReferencePrefix) {
  const cleanPrefix = prefix.trim().toUpperCase() || DEFAULT_SETTINGS.matterDefaults.fileReferencePrefix;
  const pattern = new RegExp(`^${cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i");
  const next =
    matters.reduce((max, matter) => {
      const match = matter.fileReference.match(pattern);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  return `${cleanPrefix}-${String(next).padStart(3, "0")}`;
}

function nextInvoiceNumber(invoices: Invoice[], prefix = DEFAULT_SETTINGS.billing.invoicePrefix) {
  const cleanPrefix = prefix.trim().toUpperCase() || DEFAULT_SETTINGS.billing.invoicePrefix;
  const pattern = new RegExp(`^${cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i");
  const next =
    invoices.reduce((max, invoice) => {
      const match = invoice.invoiceNumber.match(pattern);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  return `${cleanPrefix}-${String(next).padStart(3, "0")}`;
}

function invoiceTotals(lineItems: InvoiceLine[], vatEnabled: boolean) {
  const subtotal = money(lineItems.reduce((total, line) => total + line.amount, 0));
  const vatAmount = vatEnabled ? money(subtotal * 0.23) : 0;
  return {
    subtotal,
    vatAmount,
    total: money(subtotal + vatAmount)
  };
}

function invoicePaidAmount(invoice: Invoice) {
  return (invoice.payments ?? []).reduce((total, payment) => total + payment.amount, 0);
}

function normaliseInvoiceLine(line: InvoiceLine): InvoiceLine {
  const quantity = Math.max(0, Number(line.quantity) || 0);
  const rate = Math.max(0, Number(line.rate) || 0);
  return {
    ...line,
    id: line.id || makeId("line"),
    sourceType: line.sourceType,
    sourceId: line.sourceId || line.id || "manual",
    date: line.date || todayInput(),
    description: line.description.trim() || "Invoice line",
    quantity,
    rate,
    amount: money(Number(line.amount) || quantity * rate)
  };
}

function normaliseInvoice(invoice: Invoice): Invoice {
  const lineItems = (invoice.lineItems ?? []).map(normaliseInvoiceLine);
  const totals = invoiceTotals(lineItems, Boolean(invoice.vatEnabled));
  return {
    ...invoice,
    lineItems,
    payments: invoice.payments ?? [],
    subtotal: totals.subtotal,
    vatAmount: totals.vatAmount,
    total: totals.total
  };
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysInput(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function money(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normaliseClient(input: NewClientInput): Client {
  return {
    id: input.id || makeId("client"),
    fullName: input.fullName.trim(),
    address: input.address.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    ppsNumber: input.ppsNumber?.trim() ?? "",
    dateOfBirth: input.dateOfBirth?.trim() ?? ""
  };
}

function findExistingClient(clients: Client[], input: NewClientInput) {
  if (input.id) {
    const byId = clients.find((client) => client.id === input.id);
    if (byId) return byId;
  }

  const email = input.email.trim().toLowerCase();
  if (email) {
    const byEmail = clients.find((client) => client.email.toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  return clients.find(
    (client) =>
      client.fullName.trim().toLowerCase() === input.fullName.trim().toLowerCase() &&
      client.address.trim().toLowerCase() === input.address.trim().toLowerCase()
  );
}

function statusForStage(type: Matter["type"], stageIndex: number) {
  const finalStageIndex = getStages(type).length - 1;
  if (stageIndex >= finalStageIndex) return "Closed";
  if (stageIndex > 0) return "In Progress";
  return "Open";
}

function buildMatter(state: KeroState, input: NewMatterInput) {
  const existingClient = findExistingClient(state.clients, input.client);
  const incomingClient = normaliseClient(input.client);
  const selectedExistingClient =
    Boolean(input.client.id) && existingClient?.id === input.client.id;
  const client: Client = existingClient
    ? {
        ...existingClient,
        fullName: incomingClient.fullName,
        address: incomingClient.address,
        phone: incomingClient.phone,
        email: incomingClient.email,
        ppsNumber: selectedExistingClient
          ? incomingClient.ppsNumber
          : incomingClient.ppsNumber || existingClient.ppsNumber,
        dateOfBirth: selectedExistingClient
          ? incomingClient.dateOfBirth
          : incomingClient.dateOfBirth || existingClient.dateOfBirth
      }
    : incomingClient;
  const fileReference =
    input.fileReference?.trim() ||
    nextFileReference(state.matters, state.settings.matterDefaults.fileReferencePrefix);

  const base = {
    id: makeId("matter"),
    fileReference,
    clientId: client.id,
    assignedTeamMemberId: currentTeamMember(state).id,
    dateOpened: todayIso(),
    updatedAt: todayIso(),
    status: "Open" as const,
    stageIndex: 0,
    aml: { ...DEFAULT_AML },
    notes: [],
    customTemplates: {}
  };

  if (input.type === "conveyancing") {
    return {
      client,
      matter: {
        ...base,
        type: "conveyancing" as const,
        fields: input.fields
      }
    };
  }

  if (input.type === "purchase") {
    return {
      client,
      matter: {
        ...base,
        type: "purchase" as const,
        fields: input.fields
      }
    };
  }

  if (input.type === "litigation") {
    const limitationDate =
      input.fields.limitationDate || addYears(input.fields.dateDisputeArose, 5);
    return {
      client,
      matter: {
        ...base,
        type: "litigation" as const,
        fields: {
          ...input.fields,
          limitationDate
        }
      }
    };
  }

  return {
    client,
    matter: {
      ...base,
      type: "adhoc" as const,
      fields: input.fields,
      aiResearch: input.aiResearch ?? {
        status: "pending" as const,
        summary: ""
      }
    }
  };
}

function loadState() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return emptyDemoState();
    const parsed = JSON.parse(stored) as Partial<KeroState>;
    const matters = (parsed.matters ?? []).map((matter) => ({
      ...matter,
      assignedTeamMemberId: matter.assignedTeamMemberId || undefined,
      updatedAt: matter.updatedAt ?? matter.dateOpened,
      customTemplates: sanitiseWordTemplates(matter.customTemplates)
    })) as Matter[];
    if ((parsed.clients ?? []).length === 0 && matters.length === 0) {
      return emptyDemoState(parsed.settings ? mergeSettings(parsed.settings) : undefined);
    }
    const settings = mergeSettings(parsed.settings);
    const teamMembers = normaliseTeamMembers(parsed.teamMembers, settings);
    const currentTeamMemberId = teamMembers.some(
      (member) => member.id === parsed.currentTeamMemberId && member.status === "Active"
    )
      ? parsed.currentTeamMemberId || teamMembers[0].id
      : teamMembers.find((member) => member.isOwner)?.id || teamMembers[0].id;
    const loadedState = {
      settings,
      clients: parsed.clients ?? [],
      matters,
      teamMembers,
      currentTeamMemberId,
      firmActivityLog: parsed.firmActivityLog ?? [],
      documentStatuses: parsed.documentStatuses ?? {},
      documentSentAt: parsed.documentSentAt ?? {},
      globalTemplates: sanitiseWordTemplates(parsed.globalTemplates),
      customLetterTemplates: parsed.customLetterTemplates ?? [],
      timeEntries: parsed.timeEntries ?? [],
      expenses: parsed.expenses ?? [],
      invoices: (parsed.invoices ?? []).map((invoice) => normaliseInvoice(invoice as Invoice)),
      calendarEvents: parsed.calendarEvents ?? [],
      matterChecklists: parsed.matterChecklists ?? {},
      timelineEvents: parsed.timelineEvents ?? [],
      recentMatterViews: parsed.recentMatterViews ?? [],
      pinnedMatterIds: (parsed.pinnedMatterIds ?? []).filter((matterId) =>
        matters.some((matter) => matter.id === matterId)
      ),
      conflictCheckLogs: parsed.conflictCheckLogs ?? []
    };
    return ensureMatterChecklists({
      ...loadedState,
      timelineEvents:
        parsed.timelineEvents && parsed.timelineEvents.length > 0
          ? parsed.timelineEvents
          : seedTimelineEvents(loadedState)
    });
  } catch {
    return emptyDemoState();
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<KeroState>(DEFAULT_STATE);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const updateSettings = useCallback((settings: Settings) => {
    setState((current) => {
      const nextSettings = mergeSettings(settings);
      const now = todayIso();
      const nextState = {
        ...current,
        settings: nextSettings,
        teamMembers: normaliseTeamMembers(current.teamMembers, nextSettings).map((member) =>
          member.isOwner
            ? {
                ...member,
                name: ownerName(nextSettings),
                email: member.email || ownerEmail(nextSettings),
                updatedAt: now
              }
            : member
        )
      };
      return appendFirmActivity(nextState, {
        actionType: "Settings",
        description: "Firm settings updated",
        createdAt: now
      });
    });
  }, []);

  const loadDemoData = useCallback(() => {
    setState((current) => {
      const demoState = createDemoState(current.settings);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demoState));
      return demoState;
    });
  }, []);

  const setCurrentTeamMember = useCallback((memberId: string) => {
    setState((current) => {
      const member = current.teamMembers.find(
        (item) => item.id === memberId && item.status === "Active"
      );
      if (!member) return current;
      return {
        ...current,
        currentTeamMemberId: member.id
      };
    });
  }, []);

  const addTeamMember = useCallback(
    (input: { name: string; email: string; role: TeamRole }) => {
      const name = input.name.trim();
      const email = input.email.trim();
      if (!name || !email) return undefined;
      const now = todayIso();
      const member: TeamMember = {
        id: makeId("team"),
        name,
        email,
        role: input.role,
        status: "Active",
        isOwner: false,
        createdAt: now,
        updatedAt: now
      };
      setState((current) =>
        appendFirmActivity(
          {
            ...current,
            teamMembers: [member, ...current.teamMembers]
          },
          {
            actionType: "Team Management",
            description: `Team member added: ${member.name} (${member.role})`,
            createdAt: now,
            metadata: { teamMemberId: member.id, role: member.role }
          }
        )
      );
      return member;
    },
    []
  );

  const updateTeamMember = useCallback(
    (
      memberId: string,
      patch: Partial<Pick<TeamMember, "name" | "email" | "role" | "status">>
    ) => {
      const now = todayIso();
      setState((current) => {
        const member = current.teamMembers.find((item) => item.id === memberId);
        if (!member || member.isOwner) return current;
        const nextState = {
          ...current,
          teamMembers: current.teamMembers.map((item) =>
            item.id === memberId
              ? {
                  ...item,
                  ...patch,
                  name: patch.name?.trim() || item.name,
                  email: patch.email?.trim() || item.email,
                  updatedAt: now
                }
              : item
          )
        };
        return appendFirmActivity(nextState, {
          actionType: "Team Management",
          description: `Team member updated: ${member.name}`,
          createdAt: now,
          metadata: { teamMemberId: member.id }
        });
      });
    },
    []
  );

  const deactivateTeamMember = useCallback((memberId: string) => {
    const now = todayIso();
    setState((current) => {
      const member = current.teamMembers.find((item) => item.id === memberId);
      if (!member || member.isOwner) return current;
      const ownerId = current.teamMembers.find((item) => item.isOwner)?.id || current.currentTeamMemberId;
      const nextState = {
        ...current,
        currentTeamMemberId:
          current.currentTeamMemberId === memberId ? ownerId : current.currentTeamMemberId,
        teamMembers: current.teamMembers.map((item) =>
          item.id === memberId ? { ...item, status: "Inactive" as const, updatedAt: now } : item
        )
      };
      return appendFirmActivity(nextState, {
        actionType: "Team Management",
        description: `Team member deactivated: ${member.name}`,
        createdAt: now,
        metadata: { teamMemberId: member.id }
      });
    });
  }, []);

  const assignMatter = useCallback((matterId: string, memberId: string) => {
    const now = todayIso();
    setState((current) => {
      const matter = current.matters.find((item) => item.id === matterId);
      const member = current.teamMembers.find((item) => item.id === memberId && item.status === "Active");
      if (!matter) return current;
      const assignedTeamMemberId = member?.id || undefined;
      const nextState = {
        ...current,
        matters: current.matters.map((item) =>
          item.id === matterId
            ? {
                ...item,
                assignedTeamMemberId,
                updatedAt: now
              }
            : item
        )
      };
      return appendTimelineEvents(nextState, {
        matterId,
        type: "matter_updated",
        description: assignedTeamMemberId
          ? `Matter assigned to ${member?.name}`
          : "Matter marked as unassigned",
        createdAt: now,
        metadata: { assignedTeamMemberId: assignedTeamMemberId || "" }
      });
    });
  }, []);

  const createMatter = useCallback(
    (input: NewMatterInput) => {
      const { client, matter } = buildMatter(state, input);
      setState((current) => {
        const existingClient = current.clients.some((item) => item.id === client.id);
        const now = matter.dateOpened;
        const conflictLog = buildConflictCheckLog(
          current,
          {
            matterId: matter.id,
            queries: matterConflictQueries(matter, client),
            source: "matter_creation",
            excludeClientId: client.id
          },
          now
        );
        const nextState = {
          ...current,
          clients: existingClient
            ? current.clients.map((item) => (item.id === client.id ? client : item))
            : [client, ...current.clients],
          matters: [matter, ...current.matters],
          matterChecklists: {
            ...current.matterChecklists,
            [matter.id]: buildDefaultMatterChecklist(matter.type)
          },
          conflictCheckLogs: [conflictLog, ...current.conflictCheckLogs]
        };
        const events: TimelineEventInput[] = [
          {
            matterId: matter.id,
            type: "matter_opened",
            description: `Matter opened (${matter.fileReference})`,
            createdAt: now
          }
        ];
        if (current.settings.letterDefaults.autoGenerateLetters) {
          events.push({
            matterId: matter.id,
            type: "letter_generated",
            description: "Standard letter pack generated",
            createdAt: now
          });
        }
        events.push({
          matterId: matter.id,
          type: "conflict_check",
          description: `Conflict check run: ${conflictLog.resultCount} potential match${conflictLog.resultCount === 1 ? "" : "es"}`,
          createdAt: now,
          metadata: { conflictCheckId: conflictLog.id, resultCount: conflictLog.resultCount }
        });
        return appendTimelineEvents(nextState, events);
      });
      return matter;
    },
    [state]
  );

  const updateMatter = useCallback(
    (matterId: string, updater: (matter: Matter) => Matter) => {
      setState((current) => {
        const events: TimelineEventInput[] = [];
        const matters = current.matters.map((matter) => {
          if (matter.id !== matterId) return matter;
          const now = todayIso();
          const updatedMatter = { ...updater(matter), updatedAt: now };
          events.push(...keyDateTimelineEvents(matter, updatedMatter));
          const changedFields = changedMatterFieldLabels(matter, updatedMatter);
          if (changedFields.length > 0) {
            events.push({
              matterId,
              type: "matter_updated",
              description: `Matter details updated: ${changedFields.join(", ")}`,
              metadata: { fields: changedFields.join(", ") }
            });
          }
          if (updatedMatter.stageIndex !== matter.stageIndex) {
            const stages = getStages(updatedMatter.type);
            events.push({
              matterId,
              type: "stage_advanced",
              description: `Stage changed from ${stages[matter.stageIndex]} to ${stages[updatedMatter.stageIndex]}`,
              metadata: {
                previousStage: stages[matter.stageIndex],
                newStage: stages[updatedMatter.stageIndex],
                stageIndex: updatedMatter.stageIndex
              }
            });
          }
          if (matter.status !== "Closed" && updatedMatter.status === "Closed") {
            events.push({
              matterId,
              type: "matter_closed",
              description: `Matter closed (${updatedMatter.fileReference})`,
              createdAt: now
            });
          }
          return updatedMatter;
        });
        return appendTimelineEvents({ ...current, matters }, events);
      });
    },
    []
  );

  const updateClient = useCallback((clientId: string, patch: Partial<Client>) => {
    setState((current) => {
      const now = todayIso();
      const existingClient = current.clients.find((client) => client.id === clientId);
      const changedFields = existingClient
        ? (Object.keys(patch) as Array<keyof Client>).filter(
            (field) => patch[field] !== undefined && patch[field] !== existingClient[field]
          )
        : [];
      const linkedMatterIds = current.matters
        .filter((matter) => matter.clientId === clientId)
        .map((matter) => matter.id);
      const nextState = {
        ...current,
        clients: current.clients.map((client) =>
          client.id === clientId ? { ...client, ...patch } : client
        ),
        matters: current.matters.map((matter) =>
          matter.clientId === clientId ? { ...matter, updatedAt: now } : matter
        )
      };
      if (!existingClient || changedFields.length === 0 || linkedMatterIds.length === 0) {
        return nextState;
      }
      return appendTimelineEvents(
        nextState,
        linkedMatterIds.map((matterId) => ({
          matterId,
          type: "matter_updated" as const,
          description: `Client details updated: ${changedFields.join(", ")}`,
          createdAt: now,
          metadata: { clientId }
        }))
      );
    });
  }, []);

  const addNote = useCallback((matterId: string, body: string) => {
    const noteBody = body.trim();
    if (!noteBody) return;
    setState((current) => {
      const now = todayIso();
      const matterExists = current.matters.some((matter) => matter.id === matterId);
      if (!matterExists) return current;
      return appendTimelineEvents(
        {
          ...current,
          matters: current.matters.map((matter) =>
            matter.id === matterId
              ? {
                  ...matter,
                  updatedAt: now,
                  notes: [
                    {
                      id: makeId("note"),
                      body: noteBody,
                      createdAt: now
                    },
                    ...matter.notes
                  ]
                }
              : matter
          )
        },
        {
          matterId,
          type: "note_added",
          description: `Note added: ${noteBody.slice(0, 120)}${noteBody.length > 120 ? "..." : ""}`,
          createdAt: now
        }
      );
    });
  }, []);

  const updateAml = useCallback((matterId: string, patch: Partial<AmlChecklist>) => {
    setState((current) => {
      const now = todayIso();
      const events: TimelineEventInput[] = [];
      const matters = current.matters.map((matter) => {
        if (matter.id !== matterId) return matter;
        const nextAml = {
          ...matter.aml,
          ...patch,
          verified:
            patch.photoIdReceived === false ||
            patch.proofOfAddressReceived === false ||
            patch.sourceOfFundsReceived === false
              ? false
              : patch.verified ?? matter.aml.verified
        };
        (Object.keys(nextAml) as Array<keyof AmlChecklist>).forEach((field) => {
          if (matter.aml[field] === nextAml[field]) return;
          const value = nextAml[field];
          events.push({
            matterId,
            type: field === "verified" && value ? "aml_verified" : "aml_updated",
            description:
              field === "verified"
                ? value
                  ? "AML marked as verified"
                  : "AML verification removed"
                : `AML ${amlLabel(field)} ${value ? "ticked" : "unticked"}`,
            createdAt: now,
            metadata: { field, value }
          });
        });
        return {
          ...matter,
          updatedAt: now,
          aml: nextAml
        };
      });
      return appendTimelineEvents({ ...current, matters }, events);
    });
  }, []);

  const toggleMatterChecklistItem = useCallback(
    (matterId: string, itemId: string, completed: boolean) => {
      setState((current) => {
        const matter = current.matters.find((item) => item.id === matterId);
        if (!matter) return current;

        const items = mergeMatterChecklist(matter.type, current.matterChecklists[matterId]);
        const checklistComplete = items.length > 0 && items.every((item) => item.completedAt);
        if (checklistComplete) return current;

        const targetItem = items.find((item) => item.id === itemId);
        if (!targetItem) return current;
        const currentlyCompleted = Boolean(targetItem.completedAt);
        if (currentlyCompleted === completed) return current;

        const now = todayIso();
        const nextItems = items.map((item) =>
          item.id === itemId
            ? {
                ...item,
                completedAt: completed ? now : undefined
              }
            : item
        );
        const nextState = {
          ...current,
          matterChecklists: {
            ...current.matterChecklists,
            [matterId]: nextItems
          },
          matters: current.matters.map((item) =>
            item.id === matterId ? { ...item, updatedAt: now } : item
          )
        };

        return appendTimelineEvents(nextState, {
          matterId,
          type: "checklist_updated",
          description: completed
            ? `Matter checklist item completed: ${targetItem.label}`
            : `Matter checklist item reopened: ${targetItem.label}`,
          createdAt: now,
          metadata: { checklistItemId: itemId, completed }
        });
      });
    },
    []
  );

  const addMatterChecklistItem = useCallback((matterId: string, label: string) => {
    const cleanLabel = label.trim();
    if (!cleanLabel) return undefined;
    const item: MatterChecklistItem = {
      id: makeId("checklist"),
      label: cleanLabel,
      custom: true
    };

    setState((current) => {
      const matter = current.matters.find((entry) => entry.id === matterId);
      if (!matter) return current;
      const items = mergeMatterChecklist(matter.type, current.matterChecklists[matterId]);
      const checklistComplete = items.length > 0 && items.every((entry) => entry.completedAt);
      if (checklistComplete) return current;

      const now = todayIso();
      const nextState = {
        ...current,
        matterChecklists: {
          ...current.matterChecklists,
          [matterId]: [...items, item]
        },
        matters: current.matters.map((entry) =>
          entry.id === matterId ? { ...entry, updatedAt: now } : entry
        )
      };

      return appendTimelineEvents(nextState, {
        matterId,
        type: "checklist_updated",
        description: `Matter checklist item added: ${cleanLabel}`,
        createdAt: now,
        metadata: { checklistItemId: item.id, custom: true }
      });
    });

    return item;
  }, []);

  const advanceStage = useCallback((matterId: string) => {
    let updatedMatter: Matter | undefined;
    setState((current) => {
      if (!getPermissions(currentTeamMember(current)).openCloseMatters) {
        updatedMatter = undefined;
        return current;
      }
      const now = todayIso();
      const events: TimelineEventInput[] = [];
      const matters = current.matters.map((matter) => {
        if (matter.id !== matterId) return matter;
        if (current.settings.matterDefaults.amlMandatoryBeforeStageAdvance && !matter.aml.verified) {
          updatedMatter = undefined;
          return matter;
        }
        const stages = getStages(matter.type);
        const stageIndex = Math.min(matter.stageIndex + 1, stages.length - 1);
        updatedMatter = {
          ...matter,
          updatedAt: now,
          stageIndex,
          status: statusForStage(matter.type, stageIndex)
        };
        if (stageIndex !== matter.stageIndex) {
          events.push({
            matterId,
            type: "stage_advanced",
            description: `Stage advanced from ${stages[matter.stageIndex]} to ${stages[stageIndex]}`,
            createdAt: now,
            metadata: {
              previousStage: stages[matter.stageIndex],
              newStage: stages[stageIndex],
              stageIndex
            }
          });
          if (matter.status !== "Closed" && updatedMatter.status === "Closed") {
            events.push({
              matterId,
              type: "matter_closed",
              description: `Matter closed (${matter.fileReference})`,
              createdAt: now
            });
          }
        }
        return updatedMatter;
      });
      return appendTimelineEvents({ ...current, matters }, events);
    });
    return updatedMatter;
  }, []);

  const setCustomTemplate = useCallback(
    (matterId: string, letterId: string, template: WordTemplate) => {
      setState((current) => {
        const now = todayIso();
        const matterExists = current.matters.some((matter) => matter.id === matterId);
        if (!matterExists) return current;
        return appendTimelineEvents(
          {
            ...current,
            matters: current.matters.map((matter) =>
              matter.id === matterId
                ? {
                    ...matter,
                    updatedAt: now,
                    customTemplates: {
                      ...matter.customTemplates,
                      [letterId]: template
                    }
                  }
                : matter
            )
          },
          {
            matterId,
            type: "document_template_uploaded",
            description: `Word template uploaded for ${letterId}: ${template.fileName}`,
            createdAt: now,
            metadata: { letterId, fileName: template.fileName }
          }
        );
      });
    },
    []
  );

  const setGlobalTemplate = useCallback((letterId: string, template: WordTemplate) => {
    setState((current) =>
      appendFirmActivity(
        {
          ...current,
          globalTemplates: {
            ...current.globalTemplates,
            [letterId]: template
          }
        },
        {
          actionType: "Document Template Uploaded",
          description: `Document template uploaded for ${letterId}: ${template.fileName}`,
          createdAt: template.uploadedAt || todayIso(),
          metadata: { letterId, fileName: template.fileName }
        }
      )
    );
  }, []);

  const clearGlobalTemplate = useCallback((letterId: string) => {
    setState((current) => {
      const { [letterId]: _removed, ...globalTemplates } = current.globalTemplates;
      return appendFirmActivity(
        {
          ...current,
          globalTemplates
        },
        {
          actionType: "Document Template Restored",
          description: `Default document template restored for ${letterId}`,
          metadata: { letterId }
        }
      );
    });
  }, []);

  const setLetterStatus = useCallback(
    (matterId: string, letterId: string, status: LetterStatus, letterTitle?: string) => {
      setState((current) => {
        const key = `${matterId}:${letterId}`;
        const now = new Date().toISOString();
        const previousStatus = current.documentStatuses[key] ?? "Drafted";
        const { [key]: _removed, ...remainingSentAt } = current.documentSentAt;
        const nextState = {
          ...current,
          documentStatuses: {
            ...current.documentStatuses,
            [key]: status
          },
          documentSentAt:
            status === "Sent"
              ? {
                  ...current.documentSentAt,
                  [key]: now
                }
              : remainingSentAt,
          matters: current.matters.map((matter) =>
            matter.id === matterId ? { ...matter, updatedAt: now } : matter
          )
        };
        if (previousStatus === status || !current.matters.some((matter) => matter.id === matterId)) {
          return nextState;
        }
        return appendTimelineEvents(nextState, {
          matterId,
          type: "letter_status",
          description: `${letterTitle?.trim() || letterId} marked as ${status}`,
          createdAt: now,
          metadata: { letterId, previousStatus, status }
        });
      });
    },
    []
  );

  const addCustomLetterTemplate = useCallback(
    (input: { title: string; matterType: MatterType; body: string }) => {
      const template: CustomLetterTemplate = {
        id: makeId("custom_letter"),
        title: input.title.trim(),
        matterType: input.matterType,
        body: input.body.trim(),
        createdAt: todayIso()
      };
      setState((current) => ({
        ...current,
        customLetterTemplates: [template, ...current.customLetterTemplates]
      }));
      return template;
    },
    []
  );

  const addTimeEntry = useCallback(
    (input: Omit<TimeEntry, "id" | "createdAt" | "updatedAt">) => {
      if (!getPermissions(currentTeamMember(state)).logTime) return undefined;
      const now = todayIso();
      const entry: TimeEntry = {
        id: makeId("time"),
        matterId: input.matterId,
        date: input.date || todayInput(),
        description: input.description.trim(),
        durationHours: Math.max(0, Number(input.durationHours) || 0),
        hourlyRate: Math.max(0, Number(input.hourlyRate) || 0),
        billable: Boolean(input.billable),
        createdAt: now,
        updatedAt: now
      };
      setState((current) => {
        const matterExists = current.matters.some((matter) => matter.id === entry.matterId);
        const nextState = {
          ...current,
          timeEntries: [entry, ...current.timeEntries],
          matters: current.matters.map((matter) =>
            matter.id === entry.matterId ? { ...matter, updatedAt: now } : matter
          )
        };
        if (!matterExists) return nextState;
        return appendTimelineEvents(nextState, {
          matterId: entry.matterId,
          type: "time_logged",
          description: `Time logged: ${entry.description} (${entry.durationHours}h)`,
          createdAt: now,
          metadata: {
            entryId: entry.id,
            durationHours: entry.durationHours,
            billable: entry.billable
          }
        });
      });
      return entry;
    },
    [state]
  );

  const updateTimeEntry = useCallback(
    (
      entryId: string,
      patch: Partial<Omit<TimeEntry, "id" | "matterId" | "createdAt">>
    ) => {
      const now = todayIso();
      setState((current) => {
        const existing = current.timeEntries.find((entry) => entry.id === entryId);
        const nextState = {
          ...current,
          timeEntries: current.timeEntries.map((entry) =>
            entry.id === entryId
              ? {
                  ...entry,
                  ...patch,
                  description: patch.description?.trim() ?? entry.description,
                  durationHours:
                    patch.durationHours === undefined
                      ? entry.durationHours
                      : Math.max(0, Number(patch.durationHours) || 0),
                  hourlyRate:
                    patch.hourlyRate === undefined
                      ? entry.hourlyRate
                      : Math.max(0, Number(patch.hourlyRate) || 0),
                  updatedAt: now
                }
              : entry
          ),
          matters: current.matters.map((matter) =>
            matter.id === existing?.matterId ? { ...matter, updatedAt: now } : matter
          )
        };
        if (!existing) return nextState;
        return appendTimelineEvents(nextState, {
          matterId: existing.matterId,
          type: "time_logged",
          description: `Time entry updated: ${existing.description}`,
          createdAt: now,
          metadata: { entryId }
        });
      });
    },
    []
  );

  const deleteTimeEntry = useCallback((entryId: string) => {
    const now = todayIso();
    setState((current) => {
      const existing = current.timeEntries.find((entry) => entry.id === entryId);
      const nextState = {
        ...current,
        timeEntries: current.timeEntries.filter((entry) => entry.id !== entryId),
        matters: current.matters.map((matter) =>
          matter.id === existing?.matterId ? { ...matter, updatedAt: now } : matter
        )
      };
      if (!existing) return nextState;
      return appendTimelineEvents(nextState, {
        matterId: existing.matterId,
        type: "time_logged",
        description: `Time entry deleted: ${existing.description}`,
        createdAt: now,
        metadata: { entryId }
      });
    });
  }, []);

  const addExpense = useCallback(
    (input: Omit<ExpenseEntry, "id" | "createdAt" | "updatedAt">) => {
      if (!getPermissions(currentTeamMember(state)).logTime) return undefined;
      const now = todayIso();
      const expense: ExpenseEntry = {
        id: makeId("expense"),
        matterId: input.matterId,
        date: input.date || todayInput(),
        description: input.description.trim(),
        amount: Math.max(0, Number(input.amount) || 0),
        billable: Boolean(input.billable),
        receiptName: input.receiptName?.trim() || undefined,
        createdAt: now,
        updatedAt: now
      };
      setState((current) => {
        const matterExists = current.matters.some((matter) => matter.id === expense.matterId);
        const nextState = {
          ...current,
          expenses: [expense, ...current.expenses],
          matters: current.matters.map((matter) =>
            matter.id === expense.matterId ? { ...matter, updatedAt: now } : matter
          )
        };
        if (!matterExists) return nextState;
        return appendTimelineEvents(nextState, {
          matterId: expense.matterId,
          type: "expense_logged",
          description: `Expense logged: ${expense.description} (${expense.amount})`,
          createdAt: now,
          metadata: { expenseId: expense.id, amount: expense.amount, billable: expense.billable }
        });
      });
      return expense;
    },
    [state]
  );

  const updateExpense = useCallback(
    (
      expenseId: string,
      patch: Partial<Omit<ExpenseEntry, "id" | "matterId" | "createdAt">>
    ) => {
      const now = todayIso();
      setState((current) => {
        const existing = current.expenses.find((expense) => expense.id === expenseId);
        const nextState = {
          ...current,
          expenses: current.expenses.map((expense) =>
            expense.id === expenseId
              ? {
                  ...expense,
                  ...patch,
                  description: patch.description?.trim() ?? expense.description,
                  amount:
                    patch.amount === undefined
                      ? expense.amount
                      : Math.max(0, Number(patch.amount) || 0),
                  receiptName:
                    patch.receiptName === undefined
                      ? expense.receiptName
                      : patch.receiptName?.trim() || undefined,
                  updatedAt: now
                }
              : expense
          ),
          matters: current.matters.map((matter) =>
            matter.id === existing?.matterId ? { ...matter, updatedAt: now } : matter
          )
        };
        if (!existing) return nextState;
        return appendTimelineEvents(nextState, {
          matterId: existing.matterId,
          type: "expense_logged",
          description: `Expense updated: ${existing.description}`,
          createdAt: now,
          metadata: { expenseId }
        });
      });
    },
    []
  );

  const deleteExpense = useCallback((expenseId: string) => {
    const now = todayIso();
    setState((current) => {
      const existing = current.expenses.find((expense) => expense.id === expenseId);
      const nextState = {
        ...current,
        expenses: current.expenses.filter((expense) => expense.id !== expenseId),
        matters: current.matters.map((matter) =>
          matter.id === existing?.matterId ? { ...matter, updatedAt: now } : matter
        )
      };
      if (!existing) return nextState;
      return appendTimelineEvents(nextState, {
        matterId: existing.matterId,
        type: "expense_logged",
        description: `Expense deleted: ${existing.description}`,
        createdAt: now,
        metadata: { expenseId }
      });
    });
  }, []);

  const createInvoice = useCallback(
    (input: {
      matterId: string;
      vatEnabled?: boolean;
      dueDate?: string;
      lineItems: Array<Omit<InvoiceLine, "id">>;
    }) => {
      if (!getPermissions(currentTeamMember(state)).generateInvoices) return undefined;
      let createdInvoice: Invoice | undefined;
      const now = todayIso();
      setState((current) => {
        const matter = current.matters.find((item) => item.id === input.matterId);
        if (!matter) return current;
        const client = current.clients.find((item) => item.id === matter.clientId);
        if (!client) return current;
        const lineItems = input.lineItems.map((line) =>
          normaliseInvoiceLine({
            ...line,
            id: makeId("line")
          })
        );
        if (lineItems.length === 0) return current;

        const totals = invoiceTotals(
          lineItems,
          input.vatEnabled ?? current.settings.billing.vatEnabledByDefault
        );
        const invoiceDate = todayInput();
        const dueDate =
          input.dueDate || addDaysInput(current.settings.billing.defaultPaymentTermsDays);

        const invoice: Invoice = {
          id: makeId("invoice"),
          invoiceNumber: nextInvoiceNumber(
            current.invoices,
            current.settings.billing.invoicePrefix
          ),
          matterId: matter.id,
          clientId: client.id,
          invoiceDate,
          dueDate,
          status: "Draft",
          vatEnabled: input.vatEnabled ?? current.settings.billing.vatEnabledByDefault,
          subtotal: totals.subtotal,
          vatAmount: totals.vatAmount,
          total: totals.total,
          lineItems,
          payments: [],
          createdAt: now,
          updatedAt: now
        };
        createdInvoice = invoice;

        return appendTimelineEvents(
          {
            ...current,
            invoices: [invoice, ...current.invoices],
            matters: current.matters.map((item) =>
              item.id === matter.id ? { ...item, updatedAt: now } : item
            )
          },
          {
            matterId: matter.id,
            type: "invoice_generated",
            description: `Invoice generated: ${invoice.invoiceNumber}`,
            createdAt: now,
            metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, total: invoice.total }
          }
        );
      });
      return createdInvoice;
    },
    [state]
  );

  const generateInvoice = useCallback(
    (
      matterId: string,
      options?: {
        vatEnabled?: boolean;
        dueDate?: string;
        timeEntryIds?: string[];
        expenseIds?: string[];
        fixedLines?: Array<{
          description: string;
          quantity: number;
          rate: number;
          date?: string;
        }>;
      }
    ) => {
      if (!getPermissions(currentTeamMember(state)).generateInvoices) return undefined;
      let createdInvoice: Invoice | undefined;
      const now = todayIso();
      setState((current) => {
        const matter = current.matters.find((item) => item.id === matterId);
        if (!matter) return current;
        const client = current.clients.find((item) => item.id === matter.clientId);
        if (!client) return current;
        const billedTimeIds = new Set(
          current.invoices.flatMap((invoice) =>
            invoice.lineItems
              .filter((line) => line.sourceType === "time")
              .map((line) => line.sourceId)
          )
        );
        const billedExpenseIds = new Set(
          current.invoices.flatMap((invoice) =>
            invoice.lineItems
              .filter((line) => line.sourceType === "expense")
              .map((line) => line.sourceId)
          )
        );
        const timeEntryIds = new Set(options?.timeEntryIds ?? []);
        const expenseIds = new Set(options?.expenseIds ?? []);

        const timeLines = current.timeEntries
          .filter((entry) => {
            if (entry.matterId !== matterId || !entry.billable) return false;
            if (timeEntryIds.size > 0) return timeEntryIds.has(entry.id);
            return !billedTimeIds.has(entry.id);
          })
          .map((entry) => ({
            id: makeId("line"),
            sourceType: "time" as const,
            sourceId: entry.id,
            date: entry.date,
            description: entry.description,
            quantity: entry.durationHours,
            rate: entry.hourlyRate,
            amount: money(entry.durationHours * entry.hourlyRate)
          }));
        const expenseLines = current.expenses
          .filter((expense) => {
            if (expense.matterId !== matterId || !expense.billable) return false;
            if (expenseIds.size > 0) return expenseIds.has(expense.id);
            return !billedExpenseIds.has(expense.id);
          })
          .map((expense) => ({
            id: makeId("line"),
            sourceType: "expense" as const,
            sourceId: expense.id,
            date: expense.date,
            description: expense.description,
            quantity: 1,
            rate: expense.amount,
            amount: money(expense.amount)
          }));
        const fixedLines = (options?.fixedLines ?? [])
          .filter((line) => line.description.trim())
          .map((line) => ({
            id: makeId("line"),
            sourceType: "fixed" as const,
            sourceId: makeId("fixed"),
            date: line.date || todayInput(),
            description: line.description.trim(),
            quantity: Math.max(0, Number(line.quantity) || 1),
            rate: Math.max(0, Number(line.rate) || 0),
            amount: money((Number(line.quantity) || 1) * (Number(line.rate) || 0))
          }));
        const lineItems = [...timeLines, ...expenseLines, ...fixedLines];
        if (lineItems.length === 0) return current;

        const vatEnabled = options?.vatEnabled ?? current.settings.billing.vatEnabledByDefault;
        const totals = invoiceTotals(lineItems, vatEnabled);
        const invoiceDate = todayInput();
        const dueDate =
          options?.dueDate || addDaysInput(current.settings.billing.defaultPaymentTermsDays);

        const invoice: Invoice = {
          id: makeId("invoice"),
          invoiceNumber: nextInvoiceNumber(
            current.invoices,
            current.settings.billing.invoicePrefix
          ),
          matterId,
          clientId: client.id,
          invoiceDate,
          dueDate,
          status: "Draft",
          vatEnabled,
          subtotal: totals.subtotal,
          vatAmount: totals.vatAmount,
          total: totals.total,
          lineItems,
          payments: [],
          createdAt: now,
          updatedAt: now
        };
        createdInvoice = invoice;

        return appendTimelineEvents(
          {
            ...current,
            invoices: [invoice, ...current.invoices],
            matters: current.matters.map((item) =>
              item.id === matterId ? { ...item, updatedAt: now } : item
            )
          },
          {
            matterId,
            type: "invoice_generated",
            description: `Invoice generated: ${invoice.invoiceNumber}`,
            createdAt: now,
            metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, total: invoice.total }
          }
        );
      });
      return createdInvoice;
    },
    [state]
  );

  const updateInvoice = useCallback(
    (
      invoiceId: string,
      patch: Partial<Pick<Invoice, "dueDate" | "vatEnabled" | "lineItems">>
    ) => {
      if (!getPermissions(currentTeamMember(state)).generateInvoices) return;
      const now = todayIso();
      setState((current) => {
        const existing = current.invoices.find((invoice) => invoice.id === invoiceId);
        if (!existing || existing.status !== "Draft") return current;
        const lineItems = patch.lineItems
          ? patch.lineItems.map(normaliseInvoiceLine)
          : existing.lineItems;
        const vatEnabled = patch.vatEnabled ?? existing.vatEnabled;
        const totals = invoiceTotals(lineItems, vatEnabled);
        const updated: Invoice = {
          ...existing,
          dueDate: patch.dueDate ?? existing.dueDate,
          vatEnabled,
          lineItems,
          subtotal: totals.subtotal,
          vatAmount: totals.vatAmount,
          total: totals.total,
          updatedAt: now
        };
        const nextState = {
          ...current,
          invoices: current.invoices.map((invoice) =>
            invoice.id === invoiceId ? updated : invoice
          ),
          matters: current.matters.map((matter) =>
            matter.id === existing.matterId ? { ...matter, updatedAt: now } : matter
          )
        };
        return appendTimelineEvents(nextState, {
          matterId: existing.matterId,
          type: "invoice_status",
          description: `${existing.invoiceNumber} draft updated`,
          createdAt: now,
          metadata: { invoiceId }
        });
      });
    },
    [state]
  );

  const duplicateInvoice = useCallback((invoiceId: string) => {
    if (!getPermissions(currentTeamMember(state)).generateInvoices) return undefined;
    let createdInvoice: Invoice | undefined;
    const now = todayIso();
    setState((current) => {
      const existing = current.invoices.find((invoice) => invoice.id === invoiceId);
      if (!existing) return current;
      const invoice: Invoice = {
        ...existing,
        id: makeId("invoice"),
        invoiceNumber: nextInvoiceNumber(
          current.invoices,
          current.settings.billing.invoicePrefix
        ),
        invoiceDate: todayInput(),
        dueDate: addDaysInput(current.settings.billing.defaultPaymentTermsDays),
        status: "Draft",
        lineItems: existing.lineItems.map((line) => ({
          ...line,
          id: makeId("line"),
          sourceId: line.sourceType === "fixed" ? makeId("fixed") : line.sourceId
        })),
        payments: [],
        createdAt: now,
        updatedAt: now
      };
      const totals = invoiceTotals(invoice.lineItems, invoice.vatEnabled);
      invoice.subtotal = totals.subtotal;
      invoice.vatAmount = totals.vatAmount;
      invoice.total = totals.total;
      createdInvoice = invoice;
      return appendTimelineEvents(
        {
          ...current,
          invoices: [invoice, ...current.invoices],
          matters: current.matters.map((matter) =>
            matter.id === invoice.matterId ? { ...matter, updatedAt: now } : matter
          )
        },
        {
          matterId: invoice.matterId,
          type: "invoice_generated",
          description: `Invoice duplicated: ${existing.invoiceNumber} to ${invoice.invoiceNumber}`,
          createdAt: now,
          metadata: { invoiceId: invoice.id, sourceInvoiceId: existing.id }
        }
      );
    });
    return createdInvoice;
  }, [state]);

  const updateInvoiceStatus = useCallback((invoiceId: string, status: InvoiceStatus) => {
    if (!getPermissions(currentTeamMember(state)).generateInvoices) return;
    const now = todayIso();
    setState((current) => {
      const invoice = current.invoices.find((item) => item.id === invoiceId);
      const nextState = {
        ...current,
        invoices: current.invoices.map((item) =>
          item.id === invoiceId ? { ...item, status, updatedAt: now } : item
        ),
        matters: current.matters.map((matter) =>
          matter.id === invoice?.matterId ? { ...matter, updatedAt: now } : matter
        )
      };
      if (!invoice || invoice.status === status) return nextState;
      return appendTimelineEvents(nextState, {
        matterId: invoice.matterId,
        type: "invoice_status",
        description: `${invoice.invoiceNumber} marked ${status}`,
        createdAt: now,
        metadata: { invoiceId, previousStatus: invoice.status, status }
      });
    });
  }, [state]);

  const recordInvoicePayment = useCallback(
    (
      invoiceId: string,
      input: {
        amount: number;
        date: string;
        method: PaymentMethod;
        note?: string;
      }
    ) => {
      if (!getPermissions(currentTeamMember(state)).generateInvoices) return;
      const now = todayIso();
      setState((current) => {
        const invoice = current.invoices.find((item) => item.id === invoiceId);
        if (!invoice) return current;
        const amount = Math.max(0, Number(input.amount) || 0);
        if (amount <= 0) return current;
        const payment: InvoicePayment = {
          id: makeId("payment"),
          amount: money(amount),
          date: input.date || todayInput(),
          method: input.method,
          note: input.note?.trim() || undefined,
          createdAt: now
        };
        const payments = [...(invoice.payments ?? []), payment];
        const updatedInvoice: Invoice = {
          ...invoice,
          payments,
          status: invoicePaidAmount({ ...invoice, payments }) >= invoice.total ? "Paid" : invoice.status,
          updatedAt: now
        };
        const nextState = {
          ...current,
          invoices: current.invoices.map((item) =>
            item.id === invoiceId ? updatedInvoice : item
          ),
          matters: current.matters.map((matter) =>
            matter.id === invoice.matterId ? { ...matter, updatedAt: now } : matter
          )
        };
        const events: TimelineEventInput[] = [
          {
            matterId: invoice.matterId,
            type: "invoice_status",
            description: `Payment recorded on ${invoice.invoiceNumber}: ${payment.amount}`,
            createdAt: now,
            metadata: { invoiceId, paymentId: payment.id, amount: payment.amount }
          }
        ];
        if (invoice.status !== "Paid" && updatedInvoice.status === "Paid") {
          events.push({
            matterId: invoice.matterId,
            type: "invoice_status",
            description: `${invoice.invoiceNumber} marked Paid`,
            createdAt: now,
            metadata: { invoiceId, status: "Paid" }
          });
        }
        return appendTimelineEvents(nextState, events);
      });
    },
    [state]
  );

  const addCalendarEvent = useCallback(
    (input: Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">) => {
      const now = todayIso();
      const event: CalendarEvent = {
        id: makeId("calendar"),
        title: input.title.trim(),
        type: input.type,
        date: input.date,
        time: timeKey(input.time) || undefined,
        matterId: input.matterId || undefined,
        notes: input.notes?.trim() || undefined,
        createdAt: now,
        updatedAt: now
      };
      setState((current) => {
        const nextState = {
          ...current,
          calendarEvents: [event, ...current.calendarEvents],
          matters: current.matters.map((matter) =>
            matter.id === event.matterId ? { ...matter, updatedAt: now } : matter
          )
        };
        if (!event.matterId) return nextState;
        return appendTimelineEvents(nextState, {
          matterId: event.matterId,
          type: "key_date_added",
          description: `Calendar event added: ${event.title} on ${event.date}${event.time ? ` at ${event.time}` : ""}`,
          createdAt: now,
          metadata: { eventId: event.id, eventType: event.type, date: event.date, time: event.time || "" }
        });
      });
      return event;
    },
    []
  );

  const updateCalendarEvent = useCallback(
    (
      eventId: string,
      patch: Partial<Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">>
    ) => {
      const now = todayIso();
      setState((current) => {
        const existingEvent = current.calendarEvents.find((event) => event.id === eventId);
        if (!existingEvent) return current;
        const updatedEvent: CalendarEvent = {
          ...existingEvent,
          ...patch,
          title:
            patch.title !== undefined
              ? patch.title.trim() || existingEvent.title
              : existingEvent.title,
          date: patch.date || existingEvent.date,
          time:
            patch.time !== undefined
              ? timeKey(patch.time) || undefined
              : existingEvent.time,
          matterId:
            patch.matterId !== undefined
              ? patch.matterId || undefined
              : existingEvent.matterId,
          notes:
            patch.notes !== undefined
              ? patch.notes.trim() || undefined
              : existingEvent.notes,
          updatedAt: now
        };
        const affectedMatterIds = Array.from(
          new Set([existingEvent.matterId, updatedEvent.matterId].filter(Boolean))
        ) as string[];
        const nextState = {
          ...current,
          calendarEvents: current.calendarEvents.map((event) =>
            event.id === eventId ? updatedEvent : event
          ),
          matters: current.matters.map((matter) =>
            affectedMatterIds.includes(matter.id) ? { ...matter, updatedAt: now } : matter
          )
        };
        if (affectedMatterIds.length === 0) {
          return appendFirmActivity(nextState, {
            actionType: "Calendar Event Updated",
            description: `Calendar event updated: ${updatedEvent.title}`,
            createdAt: now,
            metadata: { eventId: updatedEvent.id, date: updatedEvent.date }
          });
        }
        return appendTimelineEvents(
          nextState,
          affectedMatterIds.map((matterId) => ({
            matterId,
            type: "key_date_added" as const,
            description: `Calendar event updated: ${updatedEvent.title} on ${updatedEvent.date}${updatedEvent.time ? ` at ${updatedEvent.time}` : ""}`,
            createdAt: now,
            metadata: {
              eventId: updatedEvent.id,
              eventType: updatedEvent.type,
              date: updatedEvent.date,
              time: updatedEvent.time || ""
            }
          }))
        );
      });
    },
    []
  );

  const deleteCalendarEvent = useCallback((eventId: string) => {
    const now = todayIso();
    setState((current) => {
      const eventToDelete = current.calendarEvents.find((event) => event.id === eventId);
      if (!eventToDelete) return current;
      const nextState = {
        ...current,
        calendarEvents: current.calendarEvents.filter((event) => event.id !== eventId),
        matters: current.matters.map((matter) =>
          matter.id === eventToDelete.matterId ? { ...matter, updatedAt: now } : matter
        )
      };
      if (!eventToDelete.matterId) {
        return appendFirmActivity(nextState, {
          actionType: "Calendar Event Deleted",
          description: `Calendar event deleted: ${eventToDelete.title}`,
          createdAt: now,
          metadata: { eventId: eventToDelete.id, date: eventToDelete.date }
        });
      }
      return appendTimelineEvents(nextState, {
        matterId: eventToDelete.matterId,
        type: "key_date_added",
        description: `Calendar event removed: ${eventToDelete.title} on ${eventToDelete.date}`,
        createdAt: now,
        metadata: {
          eventId: eventToDelete.id,
          eventType: eventToDelete.type,
          date: eventToDelete.date
        }
      });
    });
  }, []);

  const addTimelineEvent = useCallback((input: TimelineEventInput) => {
    let createdEvent: TimelineEvent | undefined;
    setState((current) => {
      createdEvent = buildTimelineEvent(current, input);
      return appendFirmActivity(
        {
          ...current,
          timelineEvents: [createdEvent, ...(current.timelineEvents ?? [])]
        },
        {
          actionType: timelineActionLabel(createdEvent.type),
          description: createdEvent.description,
          matterId: createdEvent.matterId,
          actorName: createdEvent.actorName,
          createdAt: createdEvent.createdAt,
          metadata: createdEvent.metadata
        }
      );
    });
    return (
      createdEvent ?? {
        id: makeId("timeline"),
        matterId: input.matterId,
        type: input.type,
        description: input.description,
        actorName: input.actorName || "Solicitor",
        createdAt: input.createdAt ?? todayIso(),
        metadata: input.metadata
      }
    );
  }, []);

  const recordMatterView = useCallback((matterId: string) => {
    setState((current) => {
      if (!current.matters.some((matter) => matter.id === matterId)) return current;
      const view: RecentMatterView = {
        matterId,
        viewedAt: todayIso()
      };
      return {
        ...current,
        recentMatterViews: [
          view,
          ...(current.recentMatterViews ?? []).filter((item) => item.matterId !== matterId)
        ].slice(0, 20)
      };
    });
  }, []);

  const togglePinnedMatter = useCallback((matterId: string) => {
    setState((current) => {
      const matter = current.matters.find((item) => item.id === matterId);
      if (!matter) return current;
      const isPinned = (current.pinnedMatterIds ?? []).includes(matterId);
      const nextPinnedMatterIds = isPinned
        ? (current.pinnedMatterIds ?? []).filter((id) => id !== matterId)
        : [matterId, ...(current.pinnedMatterIds ?? []).filter((id) => id !== matterId)];
      return appendFirmActivity(
        {
          ...current,
          pinnedMatterIds: nextPinnedMatterIds
        },
        {
          actionType: isPinned ? "Matter Unpinned" : "Matter Pinned",
          description: `${isPinned ? "Matter unpinned" : "Matter pinned"}: ${matter.fileReference}`,
          matterId: matter.id,
          clientId: matter.clientId,
          metadata: { pinned: !isPinned }
        }
      );
    });
  }, []);

  const runConflictCheck = useCallback((input: ConflictCheckInput) => {
    let createdLog: ConflictCheckLog | undefined;
    setState((current) => {
      const linkedMatter = input.matterId
        ? current.matters.find((matter) => matter.id === input.matterId)
        : undefined;
      createdLog = buildConflictCheckLog(current, {
        ...input,
        excludeClientId: input.excludeClientId ?? linkedMatter?.clientId
      });
      const nextState = {
        ...current,
        conflictCheckLogs: [createdLog, ...(current.conflictCheckLogs ?? [])]
      };
      if (!createdLog.matterId) return nextState;
      return appendTimelineEvents(nextState, {
        matterId: createdLog.matterId,
        type: "conflict_check",
        description: `Conflict check run: ${createdLog.resultCount} potential match${createdLog.resultCount === 1 ? "" : "es"}`,
        createdAt: createdLog.checkedAt,
        metadata: { conflictCheckId: createdLog.id, resultCount: createdLog.resultCount }
      });
    });
    return (
      createdLog ?? {
        id: makeId("conflict"),
        matterId: input.matterId,
        queries: cleanConflictQueries(input.queries),
        matches: [],
        resultCount: 0,
        checkedAt: todayIso(),
        checkedBy: "Solicitor",
        source: input.source ?? "manual"
      }
    );
  }, []);

  const currentMemberValue = useMemo(() => currentTeamMember(state), [state]);
  const hasPermissionValue = useCallback(
    (permission: PermissionKey) => getPermissions(currentMemberValue)[permission],
    [currentMemberValue]
  );

  const value = useMemo<StoreContextValue>(
    () => ({
      state,
      hydrated,
      currentTeamMember: currentMemberValue,
      hasPermission: hasPermissionValue,
      updateSettings,
      loadDemoData,
      setCurrentTeamMember,
      addTeamMember,
      updateTeamMember,
      deactivateTeamMember,
      assignMatter,
      createMatter,
      updateMatter,
      updateClient,
      addNote,
      updateAml,
      toggleMatterChecklistItem,
      addMatterChecklistItem,
      advanceStage,
      setCustomTemplate,
      setGlobalTemplate,
      clearGlobalTemplate,
      setLetterStatus,
      addCustomLetterTemplate,
      addTimeEntry,
      updateTimeEntry,
      deleteTimeEntry,
      addExpense,
      updateExpense,
      deleteExpense,
      generateInvoice,
      createInvoice,
      updateInvoice,
      duplicateInvoice,
      updateInvoiceStatus,
      recordInvoicePayment,
      addCalendarEvent,
      updateCalendarEvent,
      deleteCalendarEvent,
      addTimelineEvent,
      recordMatterView,
      togglePinnedMatter,
      runConflictCheck
    }),
    [
      state,
      hydrated,
      currentMemberValue,
      hasPermissionValue,
      updateSettings,
      loadDemoData,
      setCurrentTeamMember,
      addTeamMember,
      updateTeamMember,
      deactivateTeamMember,
      assignMatter,
      createMatter,
      updateMatter,
      updateClient,
      addNote,
      updateAml,
      toggleMatterChecklistItem,
      addMatterChecklistItem,
      advanceStage,
      setCustomTemplate,
      setGlobalTemplate,
      clearGlobalTemplate,
      setLetterStatus,
      addCustomLetterTemplate,
      addTimeEntry,
      updateTimeEntry,
      deleteTimeEntry,
      addExpense,
      updateExpense,
      deleteExpense,
      generateInvoice,
      createInvoice,
      updateInvoice,
      duplicateInvoice,
      updateInvoiceStatus,
      recordInvoicePayment,
      addCalendarEvent,
      updateCalendarEvent,
      deleteCalendarEvent,
      addTimelineEvent,
      recordMatterView,
      togglePinnedMatter,
      runConflictCheck
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useKeroStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useKeroStore must be used inside StoreProvider");
  return context;
}
