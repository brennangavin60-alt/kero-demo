import type { MatterChecklistItem, MatterType } from "@/lib/types";

export const DEFAULT_MATTER_CHECKLIST_LABELS: Record<MatterType, string[]> = {
  conveyancing: [
    "Have you got the folio/title documents?",
    "Client ID and AML verified?",
    "Contracts drafted and reviewed?",
    "Title report completed?",
    "Planning and BER checked?",
    "Buyer's solicitor received contracts?",
    "Contracts exchanged and deposit received?",
    "Redemption figure requested from bank?",
    "All searches completed?",
    "Closing funds received?"
  ],
  purchase: [
    "Mortgage offer received and reviewed?",
    "Survey completed?",
    "Title report on folio received?",
    "Planning and BER checked?",
    "Pre-contract enquiries raised and replied to?",
    "Contracts received and reviewed?",
    "Contracts signed and exchanged?",
    "Requisitions on title raised and replied to?",
    "Mortgage funds arranged?",
    "Closing funds available?"
  ],
  litigation: [
    "Instructions and conflict check completed?",
    "Merits advice given to client?",
    "Letter before action sent and replied to?",
    "Evidence gathered (statements, photos, reports)?",
    "Expert reports commissioned if needed?",
    "Proceedings drafted and issued?",
    "Defendant response received?",
    "Discovery exchanged?",
    "Hearing date obtained?",
    "Settlement explored?"
  ],
  adhoc: [
    "Instructions clarified with client?",
    "AML completed?",
    "First letter sent to third party?",
    "Client updated on response?",
    "Matter progressing toward resolution?"
  ]
};

export function buildDefaultMatterChecklist(type: MatterType): MatterChecklistItem[] {
  return DEFAULT_MATTER_CHECKLIST_LABELS[type].map((label, index) => ({
    id: defaultMatterChecklistItemId(type, index),
    label,
    custom: false
  }));
}

export function mergeMatterChecklist(
  type: MatterType,
  existing: MatterChecklistItem[] = []
): MatterChecklistItem[] {
  const existingById = new Map(existing.map((item) => [item.id, item]));
  const defaults = buildDefaultMatterChecklist(type).map((item) => ({
    ...item,
    completedAt: existingById.get(item.id)?.completedAt
  }));
  const defaultIds = new Set(defaults.map((item) => item.id));
  const customItems = existing
    .filter((item) => !defaultIds.has(item.id) && item.label.trim())
    .map((item) => ({
      ...item,
      label: item.label.trim(),
      custom: true
    }));

  return [...defaults, ...customItems];
}

function defaultMatterChecklistItemId(type: MatterType, index: number) {
  return `default-${type}-${index}`;
}
