export type MatterType = "conveyancing" | "purchase" | "litigation" | "adhoc";

export type MatterStatus = "Open" | "In Progress" | "Closed";

export type LetterStatus = "Drafted" | "Sent" | "Awaiting Response";

export type QuickNoteTemplateScope = MatterType | "all";

export type KeroAiVoice =
  | "alloy"
  | "ash"
  | "ballad"
  | "coral"
  | "echo"
  | "sage"
  | "shimmer"
  | "verse"
  | "marin"
  | "cedar";

export type QuickNoteTemplate = {
  id: string;
  matterType: QuickNoteTemplateScope;
  text: string;
};

export type TeamRole =
  | "Owner"
  | "Senior Solicitor"
  | "Solicitor"
  | "Trainee Solicitor"
  | "Secretary"
  | "Paralegal"
  | "Administrator";

export type TeamMemberStatus = "Active" | "Inactive";

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: TeamMemberStatus;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FirmActivityLogEntry = {
  id: string;
  actorId?: string;
  actorName: string;
  actionType: string;
  description: string;
  matterId?: string;
  clientId?: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean>;
};

export type DisputeType =
  | "Neighbour Dispute"
  | "Debt Recovery"
  | "Contract Dispute"
  | "Employment Dispute"
  | "Property Dispute"
  | "General Civil Dispute";

export type Settings = {
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  firmEmail: string;
  firmWebsite: string;
  solicitorName: string;
  solicitorTitle: string;
  lawSocietyNumber: string;
  vatNumber: string;
  dashboard: {
    widgets: {
      activeMatters: boolean;
      mattersByType: boolean;
      urgentMatters: boolean;
      recentActivity: boolean;
      recentlyViewed: boolean;
      amlOutstanding: boolean;
      lettersSent: boolean;
      stageDistribution: boolean;
      billingSummary: boolean;
      calendarEvents: boolean;
    };
    defaultView: "summary" | "detailed";
    defaultMatterSort: "dateOpened" | "clientName" | "stage" | "matterType";
    showDemoData: boolean;
  };
  matterDefaults: {
    defaultMatterType: MatterType;
    fileReferencePrefix: string;
    amlMandatoryBeforeStageAdvance: boolean;
  };
  letterDefaults: {
    signOffText: string;
    closingLine: string;
    autoGenerateLetters: boolean;
    defaultDownloadFormat: "txt" | "pdf";
  };
  quickNotes: {
    customTemplates: QuickNoteTemplate[];
  };
  keroAi: {
    floatingButtonEnabled: boolean;
    openingMessage: string;
    canPerformActions: boolean;
    voice: KeroAiVoice;
  };
  notifications: {
    limitationWarnings: boolean;
    limitationWarningMonths: 1 | 2 | 3 | 6;
    amlIncompleteWarnings: boolean;
    stageInactivityAlerts: boolean;
    stageInactivityDays: number;
  };
  appearance: {
    theme: "light" | "dark";
    accentColor: "navy" | "green" | "burgundy" | "slate";
  };
  billing: {
    defaultHourlyRate: number;
    bankName: string;
    iban: string;
    bic: string;
    invoicePrefix: string;
    defaultPaymentTermsDays: number;
    vatEnabledByDefault: boolean;
  };
};

export type Client = {
  id: string;
  fullName: string;
  address: string;
  phone: string;
  email: string;
  ppsNumber: string;
  dateOfBirth: string;
};

export type AmlChecklist = {
  photoIdReceived: boolean;
  proofOfAddressReceived: boolean;
  sourceOfFundsReceived: boolean;
  verified: boolean;
};

export type Note = {
  id: string;
  body: string;
  createdAt: string;
};

export type ConveyancingFields = {
  propertyAddress: string;
  salePrice: string;
  buyerName: string;
  buyerSolicitorName: string;
  buyerSolicitorAddress: string;
  auctioneerName: string;
  mortgageHolder: string;
  closingDate: string;
};

export type PurchaseFields = {
  propertyAddress: string;
  purchasePrice: string;
  vendorName: string;
  vendorSolicitorName: string;
  vendorSolicitorAddress: string;
  mortgageLender: string;
  closingDate: string;
};

export type LitigationFields = {
  disputeType: DisputeType;
  disputeDescription: string;
  opponentName: string;
  opponentAddress: string;
  opponentSolicitor: string;
  claimValue: string;
  dateDisputeArose: string;
  limitationDate: string;
};

export type AdHocFields = {
  matterDescription: string;
  thirdPartyName: string;
  thirdPartyAddress: string;
};

export type ResearchStatus = "not_required" | "pending" | "complete" | "error";

export type MatterBase = {
  id: string;
  fileReference: string;
  clientId: string;
  assignedTeamMemberId?: string;
  dateOpened: string;
  updatedAt: string;
  status: MatterStatus;
  stageIndex: number;
  aml: AmlChecklist;
  notes: Note[];
  customTemplates: Record<string, WordTemplate>;
  aiResearch?: {
    status: ResearchStatus;
    summary: string;
    error?: string;
  };
};

export type ConveyancingMatter = MatterBase & {
  type: "conveyancing";
  fields: ConveyancingFields;
};

export type PurchaseMatter = MatterBase & {
  type: "purchase";
  fields: PurchaseFields;
};

export type LitigationMatter = MatterBase & {
  type: "litigation";
  fields: LitigationFields;
};

export type AdHocMatter = MatterBase & {
  type: "adhoc";
  fields: AdHocFields;
};

export type Matter = ConveyancingMatter | PurchaseMatter | LitigationMatter | AdHocMatter;

export type CustomLetterTemplate = {
  id: string;
  title: string;
  matterType: MatterType;
  body: string;
  createdAt: string;
};

export type WordTemplate = {
  kind: "docx";
  fileName: string;
  dataUrl: string;
  uploadedAt: string;
  previewHtml: string;
  extractedText: string;
  placeholders: string[];
  size: number;
};

export type TimeEntry = {
  id: string;
  matterId: string;
  date: string;
  description: string;
  durationHours: number;
  hourlyRate: number;
  billable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseEntry = {
  id: string;
  matterId: string;
  date: string;
  description: string;
  amount: number;
  billable: boolean;
  receiptName?: string;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceStatus = "Draft" | "Sent" | "Paid" | "Overdue";

export type PaymentMethod = "Bank Transfer" | "Cheque" | "Cash" | "Card" | "Other";

export type InvoiceLine = {
  id: string;
  sourceType: "time" | "expense" | "fixed";
  sourceId: string;
  date: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
};

export type InvoicePayment = {
  id: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  note?: string;
  createdAt: string;
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  matterId: string;
  clientId: string;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  vatEnabled: boolean;
  subtotal: number;
  vatAmount: number;
  total: number;
  lineItems: InvoiceLine[];
  payments: InvoicePayment[];
  createdAt: string;
  updatedAt: string;
};

export type CalendarEventType = "closing" | "limitation" | "court" | "invoice" | "custom";

export type CalendarEvent = {
  id: string;
  title: string;
  type: CalendarEventType;
  date: string;
  time?: string;
  matterId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type MatterChecklistItem = {
  id: string;
  label: string;
  custom: boolean;
  completedAt?: string;
};

export type TimelineEventType =
  | "matter_opened"
  | "matter_closed"
  | "matter_updated"
  | "stage_advanced"
  | "letter_generated"
  | "letter_status"
  | "document_template_uploaded"
  | "note_added"
  | "aml_updated"
  | "aml_verified"
  | "time_logged"
  | "expense_logged"
  | "invoice_generated"
  | "invoice_status"
  | "key_date_added"
  | "checklist_updated"
  | "conflict_check"
  | "kero_ai";

export type TimelineEvent = {
  id: string;
  matterId: string;
  type: TimelineEventType;
  description: string;
  actorName: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean>;
};

export type RecentMatterView = {
  matterId: string;
  viewedAt: string;
};

export type ConflictCheckMatch = {
  id: string;
  kind: "client" | "matter";
  label: string;
  detail: string;
};

export type ConflictCheckLog = {
  id: string;
  matterId?: string;
  queries: string[];
  matches: ConflictCheckMatch[];
  resultCount: number;
  checkedAt: string;
  checkedBy: string;
  source: "matter_creation" | "manual" | "kero_ai";
};

export type KeroState = {
  settings: Settings;
  clients: Client[];
  matters: Matter[];
  teamMembers: TeamMember[];
  currentTeamMemberId: string;
  firmActivityLog: FirmActivityLogEntry[];
  documentStatuses: Record<string, LetterStatus>;
  documentSentAt: Record<string, string>;
  globalTemplates: Record<string, WordTemplate>;
  customLetterTemplates: CustomLetterTemplate[];
  timeEntries: TimeEntry[];
  expenses: ExpenseEntry[];
  invoices: Invoice[];
  calendarEvents: CalendarEvent[];
  matterChecklists: Record<string, MatterChecklistItem[]>;
  timelineEvents: TimelineEvent[];
  recentMatterViews: RecentMatterView[];
  pinnedMatterIds: string[];
  conflictCheckLogs: ConflictCheckLog[];
};

export type NewClientInput = Omit<Client, "id" | "ppsNumber" | "dateOfBirth"> & {
  id?: string;
  ppsNumber?: string;
  dateOfBirth?: string;
};

export type NewMatterInput = {
  fileReference?: string;
} & (
  | {
      type: "conveyancing";
      client: NewClientInput;
      fields: ConveyancingFields;
    }
  | {
      type: "purchase";
      client: NewClientInput;
      fields: PurchaseFields;
    }
  | {
      type: "litigation";
      client: NewClientInput;
      fields: Omit<LitigationFields, "limitationDate"> & {
        limitationDate?: string;
      };
    }
  | {
      type: "adhoc";
      client: NewClientInput;
      fields: AdHocFields;
      aiResearch?: {
        status: ResearchStatus;
        summary: string;
        error?: string;
      };
    }
);

export type Letter = {
  id: string;
  title: string;
  recipientName: string;
  recipientAddress: string;
  text: string;
  isCustom: boolean;
};
