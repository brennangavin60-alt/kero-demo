import type { Matter, MatterType } from "@/lib/types";

export const STAGES: Record<MatterType, string[]> = {
  conveyancing: [
    "File Opening",
    "Contract Preparation",
    "Pre-Contract Enquiries",
    "Contracts Signed",
    "Pre-Closing",
    "Closing",
    "Complete"
  ],
  purchase: [
    "File Opening",
    "Contract Review",
    "Pre-Contract Enquiries",
    "Contracts Signed",
    "Pre-Closing",
    "Closing",
    "Complete"
  ],
  litigation: [
    "File Opening",
    "Pre-Litigation",
    "Proceedings Issued",
    "Pleadings",
    "Hearing/Settlement",
    "Complete"
  ],
  adhoc: ["File Opening", "Matter Review", "Correspondence", "Complete"]
};

export const MATTER_LABELS: Record<MatterType, string> = {
  conveyancing: "Conveyancing — Sale",
  purchase: "Conveyancing — Purchase",
  litigation: "Litigation",
  adhoc: "Ad Hoc"
};

export function getStages(type: MatterType) {
  return STAGES[type];
}

export function getCurrentStage(matter: Matter) {
  return getStages(matter.type)[matter.stageIndex] ?? "File Opening";
}

export function getMatterTitle(matter: Matter) {
  if (matter.type === "conveyancing") return matter.fields.propertyAddress;
  if (matter.type === "purchase") return matter.fields.propertyAddress;
  if (matter.type === "litigation") return matter.fields.disputeDescription;
  return matter.fields.matterDescription;
}

export function getMatterReferenceLine(matter: Matter) {
  if (matter.type === "conveyancing") return matter.fields.propertyAddress;
  if (matter.type === "purchase") return matter.fields.propertyAddress;
  if (matter.type === "litigation") return matter.fields.disputeDescription;
  return matter.fields.matterDescription;
}
