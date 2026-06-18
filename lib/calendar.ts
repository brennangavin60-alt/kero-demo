import type {
  CalendarEventType,
  Client,
  Invoice,
  KeroState,
  Matter
} from "@/lib/types";

export type CalendarEventItem = {
  id: string;
  title: string;
  type: CalendarEventType;
  date: string;
  time?: string;
  notes?: string;
  source: "matter" | "invoice" | "manual";
  matterId?: string;
  invoiceId?: string;
  matter?: Matter;
  client?: Client;
  invoice?: Invoice;
};

export const calendarEventTypeLabels: Record<CalendarEventType, string> = {
  closing: "Closing date",
  limitation: "Limitation date",
  court: "Court date",
  invoice: "Invoice due date",
  custom: "Custom event"
};

export const calendarEventStyles: Record<
  CalendarEventType,
  { dot: string; badge: string; border: string; text: string }
> = {
  closing: {
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    border: "border-emerald-200 bg-emerald-50",
    text: "text-emerald-800"
  },
  limitation: {
    dot: "bg-red-500",
    badge: "border-red-200 bg-red-50 text-red-700",
    border: "border-red-200 bg-red-50",
    text: "text-red-800"
  },
  court: {
    dot: "bg-blue-500",
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    border: "border-blue-200 bg-blue-50",
    text: "text-blue-800"
  },
  invoice: {
    dot: "bg-orange-500",
    badge: "border-orange-200 bg-orange-50 text-orange-700",
    border: "border-orange-200 bg-orange-50",
    text: "text-orange-800"
  },
  custom: {
    dot: "bg-slate-500",
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    border: "border-slate-200 bg-slate-50",
    text: "text-slate-800"
  }
};

export function buildCalendarEvents(state: KeroState): CalendarEventItem[] {
  const clientsById = new Map(state.clients.map((client) => [client.id, client]));
  const mattersById = new Map(state.matters.map((matter) => [matter.id, matter]));
  const events: CalendarEventItem[] = [];

  state.matters.forEach((matter) => {
    const client = clientsById.get(matter.clientId);
    if ((matter.type === "conveyancing" || matter.type === "purchase") && matter.fields.closingDate) {
      events.push({
        id: `matter-closing-${matter.id}`,
        title: "Expected closing date",
        type: "closing",
        date: dateKey(matter.fields.closingDate),
        source: "matter",
        matterId: matter.id,
        matter,
        client
      });
    }

    if (matter.type === "litigation" && matter.fields.limitationDate) {
      events.push({
        id: `matter-limitation-${matter.id}`,
        title: "Limitation date",
        type: "limitation",
        date: dateKey(matter.fields.limitationDate),
        source: "matter",
        matterId: matter.id,
        matter,
        client
      });
    }
  });

  state.invoices.forEach((invoice) => {
    const matter = mattersById.get(invoice.matterId);
    const client = clientsById.get(invoice.clientId);
    if (!invoice.dueDate) return;
    events.push({
      id: `invoice-due-${invoice.id}`,
      title: `${invoice.invoiceNumber} due`,
      type: "invoice",
      date: dateKey(invoice.dueDate),
      source: "invoice",
      invoiceId: invoice.id,
      matterId: invoice.matterId,
      invoice,
      matter,
      client
    });
  });

  state.calendarEvents.forEach((event) => {
    const matter = event.matterId ? mattersById.get(event.matterId) : undefined;
    const client = matter ? clientsById.get(matter.clientId) : undefined;
    events.push({
      ...event,
      date: dateKey(event.date),
      source: "manual",
      matter,
      client
    });
  });

  return events
    .filter((event) => event.date)
    .sort(compareCalendarEvents);
}

export function getUpcomingCalendarEvents(events: CalendarEventItem[], daysAhead = 30) {
  const today = startOfToday();
  const end = new Date(today);
  end.setDate(today.getDate() + daysAhead);
  return events
    .filter((event) => {
      const date = parseDate(event.date);
      if (!date) return false;
      return date <= end;
    })
    .sort(compareCalendarEvents);
}

export function daysUntilEvent(date: string) {
  const eventDate = parseDate(date);
  if (!eventDate) return 0;
  const diff = eventDate.getTime() - startOfToday().getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

export function eventUrgencyClass(date: string) {
  const days = daysUntilEvent(date);
  if (days < 0) return "border-red-200 bg-red-50 text-red-800";
  if (days <= 7) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-white text-slate-800";
}

export function dateKey(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function timeKey(value?: string) {
  if (!value) return "";
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatEventTime(value?: string) {
  const normalized = timeKey(value);
  if (!normalized) return "All day";
  const [hour, minute] = normalized.split(":").map(Number);
  return new Intl.DateTimeFormat("en-IE", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(2000, 0, 1, hour, minute));
}

export function formatEventDateTime(date: string, time?: string) {
  return `${formatDate(date)} · ${formatEventTime(time)}`;
}

export function formatDaysUntil(days: number) {
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
}

function compareCalendarEvents(a: CalendarEventItem, b: CalendarEventItem) {
  const dateOrder = a.date.localeCompare(b.date);
  if (dateOrder !== 0) return dateOrder;
  return sortTime(a.time).localeCompare(sortTime(b.time));
}

function sortTime(value?: string) {
  return timeKey(value) || "23:59";
}

function formatDate(value: string) {
  const date = parseDate(value);
  if (!date) return value || "No date";
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function parseDate(value: string) {
  const date = new Date(`${dateKey(value)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
