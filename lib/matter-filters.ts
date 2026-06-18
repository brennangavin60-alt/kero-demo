import type { MatterStatus, MatterType } from "@/lib/types";

export type MatterFilter = "all" | "conveyancing-all" | MatterType;
export type StatusFilter = "All" | MatterStatus;

export function parseMatterFilter(value: string | null | undefined): MatterFilter {
  if (
    value === "all" ||
    value === "conveyancing-all" ||
    value === "conveyancing" ||
    value === "purchase" ||
    value === "litigation" ||
    value === "adhoc"
  ) {
    return value;
  }
  return "all";
}

export function parseStatusFilter(value: string | null | undefined): StatusFilter {
  if (value === "Open" || value === "In Progress" || value === "Closed") return value;
  return "All";
}
