import { SimplePdf } from "@/lib/matter-export";
import type { Client, FirmActivityLogEntry, Matter, TeamMember, TimelineEvent } from "@/lib/types";

export type ActivityEntry = FirmActivityLogEntry & {
  matter?: Matter;
  client?: Client;
};

export function buildActivityEntries({
  firmActivityLog,
  timelineEvents,
  matters,
  clients,
  teamMembers
}: {
  firmActivityLog: FirmActivityLogEntry[];
  timelineEvents: TimelineEvent[];
  matters: Matter[];
  clients: Client[];
  teamMembers: TeamMember[];
}): ActivityEntry[] {
  const mattersById = new Map(matters.map((matter) => [matter.id, matter]));
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const membersByName = new Map(teamMembers.map((member) => [member.name, member]));
  const seen = new Set<string>();

  const persisted = firmActivityLog.map((entry) => enrichActivity(entry, mattersById, clientsById));
  persisted.forEach((entry) => seen.add(activityKey(entry)));

  const derived = timelineEvents
    .map((event): ActivityEntry => {
      const member = membersByName.get(event.actorName);
      return enrichActivity(
        {
          id: `derived_${event.id}`,
          actorId: member?.id,
          actorName: event.actorName,
          actionType: timelineActionLabel(event.type),
          description: event.description,
          matterId: event.matterId,
          createdAt: event.createdAt,
          metadata: event.metadata
        },
        mattersById,
        clientsById
      );
    })
    .filter((entry) => {
      const key = activityKey(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return [...persisted, ...derived].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function formatActivityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) {
    const minutes = Math.floor(diffMs / minute);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDate(date, yesterday)) {
    return `Yesterday at ${date.toLocaleTimeString("en-IE", {
      hour: "numeric",
      minute: "2-digit"
    })}`;
  }

  return date.toLocaleString("en-IE", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function matchesActivitySearch(entry: ActivityEntry, query: string) {
  const search = query.trim().toLowerCase();
  if (!search) return true;
  return [
    entry.description,
    entry.actionType,
    entry.actorName,
    entry.matter?.fileReference,
    entry.client?.fullName,
    entry.client?.email
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(search);
}

export function exportActivityCsv(entries: ActivityEntry[]) {
  const headers = [
    "Date",
    "Action type",
    "Description",
    "Matter reference",
    "Client",
    "Team member"
  ];
  const rows = entries.map((entry) => [
    entry.createdAt,
    entry.actionType,
    entry.description,
    entry.matter?.fileReference ?? "",
    entry.client?.fullName ?? "",
    entry.actorName
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "Kero-Activity-Log.csv");
}

export function exportActivityPdf(entries: ActivityEntry[]) {
  const pdf = new SimplePdf("Kero Activity Log", "Firm-wide activity");
  pdf.startSection("Activity Log");
  pdf.addTitle("Kero Activity Log");
  pdf.addText(`Generated: ${new Date().toLocaleString("en-IE", { dateStyle: "medium", timeStyle: "short" })}`, {
    size: 9.5,
    color: [0.39, 0.45, 0.55]
  });
  pdf.addGap(10);
  entries.forEach((entry, index) => {
    if (index > 0) pdf.addDivider();
    pdf.addSubheading(`${entry.actionType} - ${formatActivityTime(entry.createdAt)}`);
    pdf.addParagraph(entry.description);
    pdf.addText(
      [
        entry.matter?.fileReference,
        entry.client?.fullName,
        `By ${entry.actorName}`
      ]
        .filter(Boolean)
        .join(" | "),
      { size: 9.5, color: [0.39, 0.45, 0.55] }
    );
  });
  downloadBlob(pdf.toBlob(), "Kero-Activity-Log.pdf");
}

function enrichActivity(
  entry: FirmActivityLogEntry,
  mattersById: Map<string, Matter>,
  clientsById: Map<string, Client>
): ActivityEntry {
  const matter = entry.matterId ? mattersById.get(entry.matterId) : undefined;
  const client = entry.clientId
    ? clientsById.get(entry.clientId)
    : matter
      ? clientsById.get(matter.clientId)
      : undefined;
  return { ...entry, matter, client };
}

function timelineActionLabel(type: TimelineEvent["type"]) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function activityKey(entry: FirmActivityLogEntry) {
  return `${entry.matterId ?? ""}:${entry.clientId ?? ""}:${entry.actionType}:${entry.description}:${entry.createdAt}`;
}

function sameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function csvCell(value: string) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
