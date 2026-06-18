import type { MatterType, QuickNoteTemplate } from "@/lib/types";

export type QuickNoteButtonTemplate = {
  id: string;
  text: string;
  custom: boolean;
};

export const DEFAULT_QUICK_NOTE_TEMPLATES: Record<MatterType, string[]> = {
  conveyancing: [
    "Awaiting client response",
    "Awaiting bank with title deeds",
    "Awaiting buyer's solicitor response",
    "Contracts exchanged, awaiting closing",
    "Awaiting redemption figure from bank",
    "Closing completed, file pending closure"
  ],
  purchase: [
    "Awaiting client response",
    "Awaiting bank with title deeds",
    "Awaiting buyer's solicitor response",
    "Contracts exchanged, awaiting closing",
    "Awaiting redemption figure from bank",
    "Closing completed, file pending closure"
  ],
  litigation: [
    "Awaiting client instructions",
    "Awaiting opposing solicitor response",
    "Awaiting expert report",
    "Settlement negotiations in progress",
    "Awaiting court date",
    "Matter resolved, file pending closure"
  ],
  adhoc: [
    "Awaiting client response",
    "Awaiting third party response",
    "Research completed, advice given",
    "Matter resolved"
  ]
};

export function getQuickNoteTemplatesForMatter(
  matterType: MatterType,
  customTemplates: QuickNoteTemplate[] = []
): QuickNoteButtonTemplate[] {
  const defaults = DEFAULT_QUICK_NOTE_TEMPLATES[matterType].map((text, index) => ({
    id: `default-${matterType}-${index}`,
    text,
    custom: false
  }));
  const custom = customTemplates
    .filter(
      (template) => template.text.trim() && (template.matterType === "all" || template.matterType === matterType)
    )
    .map((template) => ({
      id: template.id,
      text: template.text.trim(),
      custom: true
    }));

  return [...defaults, ...custom];
}

export function formatQuickNoteBody(templateText: string, createdAt = new Date()) {
  const timestamp = new Intl.DateTimeFormat("en-IE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(createdAt);
  const sentence = templateText.trim().replace(/[.!?]?$/, (match) => match || ".");
  return `${timestamp} - ${sentence}`;
}
