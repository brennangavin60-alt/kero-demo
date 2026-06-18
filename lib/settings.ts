import type { KeroAiVoice, Settings } from "@/lib/types";

export const KERO_AI_VOICE_OPTIONS: Array<{
  value: KeroAiVoice;
  label: string;
  description: string;
}> = [
  { value: "verse", label: "Orlaith", description: "(female, warm, clear and balanced)" },
  { value: "marin", label: "Seren", description: "(female, natural, polished and best for longer briefings)" },
  { value: "cedar", label: "Cormac", description: "(male, steady, professional and reassuring)" },
  { value: "alloy", label: "Lucan", description: "(male, neutral, crisp and concise)" },
  { value: "ash", label: "Blaise", description: "(male, calm, measured and low-pressure)" },
  { value: "ballad", label: "Isolde", description: "(female, soft, expressive and unhurried)" },
  { value: "coral", label: "Elowen", description: "(female, bright, conversational and upbeat)" },
  { value: "echo", label: "Lorcan", description: "(male, direct, energetic and clear)" },
  { value: "sage", label: "Tadhg", description: "(male, composed, grounded and deliberate)" },
  { value: "shimmer", label: "Aisling", description: "(female, light, friendly and lively)" }
];

export const DEFAULT_SETTINGS: Settings = {
  firmName: "Kero Solicitors",
  firmAddress: "1 Merrion Square, Dublin 2",
  firmPhone: "",
  firmEmail: "",
  firmWebsite: "",
  solicitorName: "Aoife Byrne",
  solicitorTitle: "",
  lawSocietyNumber: "",
  vatNumber: "",
  dashboard: {
    widgets: {
      activeMatters: true,
      mattersByType: true,
      urgentMatters: true,
      recentActivity: true,
      recentlyViewed: true,
      amlOutstanding: true,
      lettersSent: true,
      stageDistribution: true,
      billingSummary: true,
      calendarEvents: true
    },
    defaultView: "detailed",
    defaultMatterSort: "dateOpened",
    showDemoData: true
  },
  matterDefaults: {
    defaultMatterType: "conveyancing",
    fileReferencePrefix: "KER",
    amlMandatoryBeforeStageAdvance: false
  },
  letterDefaults: {
    signOffText: "Yours sincerely",
    closingLine: "Please do not hesitate to contact us should you have any queries.",
    autoGenerateLetters: true,
    defaultDownloadFormat: "pdf"
  },
  quickNotes: {
    customTemplates: []
  },
  keroAi: {
    floatingButtonEnabled: true,
    openingMessage: "",
    canPerformActions: true,
    voice: "verse"
  },
  notifications: {
    limitationWarnings: true,
    limitationWarningMonths: 3,
    amlIncompleteWarnings: true,
    stageInactivityAlerts: false,
    stageInactivityDays: 30
  },
  appearance: {
    theme: "light",
    accentColor: "navy"
  },
  billing: {
    defaultHourlyRate: 250,
    bankName: "",
    iban: "",
    bic: "",
    invoicePrefix: "INV",
    defaultPaymentTermsDays: 30,
    vatEnabledByDefault: true
  }
};

export function mergeSettings(settings?: Partial<Settings>): Settings {
  const incoming = settings ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...incoming,
    dashboard: {
      ...DEFAULT_SETTINGS.dashboard,
      ...incoming.dashboard,
      widgets: {
        ...DEFAULT_SETTINGS.dashboard.widgets,
        ...incoming.dashboard?.widgets
      }
    },
    matterDefaults: {
      ...DEFAULT_SETTINGS.matterDefaults,
      ...incoming.matterDefaults,
      fileReferencePrefix:
        incoming.matterDefaults?.fileReferencePrefix?.trim().toUpperCase() ||
        DEFAULT_SETTINGS.matterDefaults.fileReferencePrefix
    },
    letterDefaults: {
      ...DEFAULT_SETTINGS.letterDefaults,
      ...incoming.letterDefaults,
      defaultDownloadFormat: "pdf"
    },
    quickNotes: {
      ...DEFAULT_SETTINGS.quickNotes,
      ...incoming.quickNotes,
      customTemplates: (incoming.quickNotes?.customTemplates ?? [])
        .map((template) => ({
          id: template.id?.trim() || fallbackQuickNoteTemplateId(template.text ?? ""),
          matterType: validQuickNoteScope(template.matterType) ? template.matterType : "all",
          text: template.text?.trim() ?? ""
        }))
        .filter((template) => template.text)
    },
    keroAi: {
      ...DEFAULT_SETTINGS.keroAi,
      ...incoming.keroAi,
      voice: validKeroAiVoice(incoming.keroAi?.voice)
        ? incoming.keroAi.voice
        : DEFAULT_SETTINGS.keroAi.voice
    },
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...incoming.notifications,
      stageInactivityDays: Math.max(
        1,
        Number(incoming.notifications?.stageInactivityDays) ||
          DEFAULT_SETTINGS.notifications.stageInactivityDays
      )
    },
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      ...incoming.appearance
    },
    billing: {
      ...DEFAULT_SETTINGS.billing,
      ...incoming.billing,
      defaultHourlyRate:
        Number(incoming.billing?.defaultHourlyRate) ||
        DEFAULT_SETTINGS.billing.defaultHourlyRate,
      invoicePrefix:
        incoming.billing?.invoicePrefix?.trim().toUpperCase() ||
        DEFAULT_SETTINGS.billing.invoicePrefix,
      defaultPaymentTermsDays: Math.max(
        1,
        Number(incoming.billing?.defaultPaymentTermsDays) ||
          DEFAULT_SETTINGS.billing.defaultPaymentTermsDays
      ),
      vatEnabledByDefault:
        incoming.billing?.vatEnabledByDefault ?? DEFAULT_SETTINGS.billing.vatEnabledByDefault
    }
  };
}

function validQuickNoteScope(value: unknown) {
  return (
    value === "all" ||
    value === "conveyancing" ||
    value === "purchase" ||
    value === "litigation" ||
    value === "adhoc"
  );
}

export function validKeroAiVoice(value: unknown): value is KeroAiVoice {
  return KERO_AI_VOICE_OPTIONS.some((voice) => voice.value === value);
}

function fallbackQuickNoteTemplateId(text: string) {
  const slug =
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 48) || "custom";
  return `quick_note_${slug}`;
}
