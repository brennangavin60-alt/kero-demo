"use client";

import { type FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Trash2,
  X
} from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EmptyState, PageSkeleton } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import {
  buildCalendarEvents,
  calendarEventStyles,
  calendarEventTypeLabels,
  daysUntilEvent,
  eventUrgencyClass,
  formatDaysUntil,
  formatEventTime,
  getUpcomingCalendarEvents,
  timeKey,
  type CalendarEventItem
} from "@/lib/calendar";
import { formatDisplayDate } from "@/lib/dates";
import { useKeroStore } from "@/lib/storage";
import type { CalendarEventType } from "@/lib/types";
import { cn } from "@/lib/utils";

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const eventTypeOptions: Array<{ value: CalendarEventType; label: string }> = [
  { value: "closing", label: "Closing date" },
  { value: "limitation", label: "Limitation date" },
  { value: "court", label: "Court date" },
  { value: "invoice", label: "Invoice due date" },
  { value: "custom", label: "Custom event" }
];

type EventDraft = {
  id?: string;
  date: string;
  time: string;
  title: string;
  type: CalendarEventType;
  matterId: string;
  notes: string;
};

export function CalendarPage() {
  const {
    state,
    hydrated,
    addCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent
  } = useKeroStore();
  const { toast } = useToast();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEventItem | null>(null);

  const events = useMemo(() => buildCalendarEvents(state), [state]);
  const upcomingEvents = useMemo(() => getUpcomingCalendarEvents(events, 30), [events]);
  const clientsById = useMemo(
    () => new Map(state.clients.map((client) => [client.id, client])),
    [state.clients]
  );
  const mattersForSelect = useMemo(
    () =>
      [...state.matters].sort((a, b) =>
        a.fileReference.localeCompare(b.fileReference)
      ),
    [state.matters]
  );
  const monthDays = useMemo(() => getMonthCells(visibleMonth), [visibleMonth]);

  if (!hydrated) return <PageSkeleton rows={7} />;

  function shiftMonth(offset: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function openAddEvent(date: string) {
    setSelectedEvent(null);
    setEventDraft({
      date,
      time: "",
      title: "",
      type: "court",
      matterId: "",
      notes: ""
    });
  }

  function openEditEvent(event: CalendarEventItem) {
    if (event.source !== "manual") return;
    setSelectedEvent(null);
    setEventDraft({
      id: event.id,
      date: event.date,
      time: event.time ?? "",
      title: event.title,
      type: event.type,
      matterId: event.matterId ?? "",
      notes: event.notes ?? ""
    });
  }

  function saveEvent(draft: EventDraft) {
    const eventInput = {
      title: draft.title,
      type: draft.type,
      date: draft.date,
      time: timeKey(draft.time) || undefined,
      matterId: draft.matterId || undefined,
      notes: draft.notes
    };
    if (draft.id) {
      updateCalendarEvent(draft.id, eventInput);
      toast("Calendar event updated");
      setEventDraft(null);
      return;
    }
    addCalendarEvent({
      ...eventInput
    });
    setEventDraft(null);
    toast("Calendar event added");
  }

  function requestDeleteEvent(event: CalendarEventItem) {
    if (event.source !== "manual") return;
    setSelectedEvent(null);
    setDeleteTarget(event);
  }

  function confirmDeleteEvent() {
    if (!deleteTarget || deleteTarget.source !== "manual") return;
    deleteCalendarEvent(deleteTarget.id);
    toast("Calendar event removed");
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <h1 className="text-3xl font-bold text-slate-950">Calendar</h1>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Closing dates, limitation dates, court dates, invoice due dates, and manual events in one place.
          </p>
        </div>
        <Button type="button" onClick={() => openAddEvent(todayInput())}>
          <Plus className="h-4 w-4" />
          Add Event
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="surface-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                {monthFormatter.format(visibleMonth)}
              </h2>
              <p className="text-sm text-muted-foreground">
                Select a date number to add an event, or select an event to view details.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" onClick={() => setVisibleMonth(startOfMonth(new Date()))}>
                Today
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b bg-white">
            {weekDays.map((day) => (
              <div key={day} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 bg-slate-100">
            {monthDays.map((day) => {
              const dayEvents = events.filter((event) => event.date === day.date);
              const inMonth = day.month === visibleMonth.getMonth();
              const isToday = day.date === todayInput();
              return (
                <div
                  key={day.date}
                  className={cn(
                    "min-h-32 border-b border-r bg-white p-2 text-left align-top transition-all duration-200 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    !inMonth && "bg-slate-50 text-muted-foreground",
                    isToday && "bg-primary/5"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openAddEvent(day.date)}
                    aria-label={`Add event on ${formatDisplayDate(day.date)}`}
                    className={cn(
                      "mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold transition-all duration-200 hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isToday ? "bg-primary text-white" : "text-slate-700"
                    )}
                  >
                    {day.day}
                  </button>
                  <span className="grid gap-1">
                    {dayEvents.slice(0, 4).map((event) => {
                      const style = calendarEventStyles[event.type];
                      return (
                        <button
                          key={event.id}
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            setSelectedEvent(event);
                            setEventDraft(null);
                          }}
                          aria-label={`${event.title}, ${formatEventTime(event.time)} on ${formatDisplayDate(event.date)}. Open event details.`}
                          className={cn(
                            "block w-full truncate rounded-md border px-2 py-1 text-left text-xs font-semibold shadow-soft transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            style.border,
                            style.text
                          )}
                        >
                          {event.time ? `${formatEventTime(event.time)} · ` : ""}
                          {event.title}
                        </button>
                      );
                    })}
                    {dayEvents.length > 4 ? (
                      <span className="text-xs font-medium text-muted-foreground">
                        +{dayEvents.length - 4} more
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="surface-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Upcoming events</h2>
                <p className="text-sm text-muted-foreground">Next 30 days, including overdue dates.</p>
              </div>
              <Badge variant="navy">{upcomingEvents.length}</Badge>
            </div>
            {upcomingEvents.length === 0 ? (
              <EmptyState
                icon={Clock3}
                title="No upcoming events"
                description="Dates from matters, invoices, and manual calendar entries will appear here."
                className="py-6"
              />
            ) : (
              <div className="grid gap-2">
                {upcomingEvents.map((event) => (
                  <UpcomingEventRow
                    key={event.id}
                    event={event}
                    onSelect={() => {
                      setSelectedEvent(event);
                      setEventDraft(null);
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="surface-card p-4">
            <h2 className="mb-3 text-base font-semibold text-slate-950">Event colours</h2>
            <div className="grid gap-2 text-sm">
              {eventTypeOptions.slice(0, 4).map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <span className={cn("h-3 w-3 rounded-full", calendarEventStyles[option.value].dot)} />
                  <span>{option.label}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {selectedEvent ? (
        <EventPopup
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={() => openEditEvent(selectedEvent)}
          onDelete={() => requestDeleteEvent(selectedEvent)}
        />
      ) : null}

      {eventDraft ? (
        <AddEventModal
          draft={eventDraft}
          setDraft={setEventDraft}
          matters={mattersForSelect}
          clientsById={clientsById}
          onClose={() => setEventDraft(null)}
          onSave={saveEvent}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteEventModal
          event={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteEvent}
        />
      ) : null}
    </div>
  );
}

function UpcomingEventRow({
  event,
  onSelect
}: {
  event: CalendarEventItem;
  onSelect: () => void;
}) {
  const days = daysUntilEvent(event.date);
  const style = calendarEventStyles[event.type];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${event.title}, ${formatEventTime(event.time)} on ${formatDisplayDate(event.date)}. Open event details.`}
      className={cn(
        "interactive-card rounded-md border px-3 py-2 text-left text-sm shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        eventUrgencyClass(event.date)
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", style.dot)} />
            <span className="truncate font-semibold">{event.title}</span>
          </span>
          <span className="mt-1 block text-xs">
            {formatEventTime(event.time)} · {event.client?.fullName ?? "No client"} · {event.matter?.fileReference ?? "No matter"}
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold">{formatDaysUntil(days)}</span>
      </span>
    </button>
  );
}

function EventPopup({
  event,
  onClose,
  onEdit,
  onDelete
}: {
  event: CalendarEventItem;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const style = calendarEventStyles[event.type];
  const editable = event.source === "manual";
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title">
      <div className="modal-panel max-w-md">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold", style.badge)}>
              {calendarEventTypeLabels[event.type]}
            </span>
            <h2 id="calendar-event-title" className="mt-2 text-lg font-semibold text-slate-950">
              {event.title}
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close event popup">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm leading-6 text-muted-foreground">
          {editable
            ? "Manual calendar event. You can edit or remove it here."
            : event.source === "invoice"
              ? "Invoice due date generated from billing. Edit the invoice due date from Time & Billing."
              : "Matter date generated from the linked matter. Edit the key date from the matter details."}
        </p>
        <div className="grid gap-2 text-sm">
          <EventDetail label="Date" value={formatDisplayDate(event.date)} />
          <EventDetail label="Time" value={formatEventTime(event.time)} />
          <EventDetail label="Matter" value={event.matter?.fileReference ?? "Not linked"} />
          <EventDetail label="Client" value={event.client?.fullName ?? "Not linked"} />
          {event.notes ? <EventDetail label="Notes" value={event.notes} /> : null}
        </div>
        {event.matterId ? (
          <Link href={`/matters/${event.matterId}`} className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">
            Go to matter
          </Link>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {editable ? (
            <>
              <Button type="button" variant="destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
              <Button type="button" variant="outline" onClick={onEdit}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </>
          ) : null}
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function EventDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

function AddEventModal({
  draft,
  setDraft,
  matters,
  clientsById,
  onClose,
  onSave
}: {
  draft: EventDraft;
  setDraft: (draft: EventDraft | null) => void;
  matters: Array<{ id: string; fileReference: string; clientId: string }>;
  clientsById: Map<string, { fullName: string }>;
  onClose: () => void;
  onSave: (draft: EventDraft) => void;
}) {
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) {
      setError("Add an event title.");
      return;
    }
    if (!draft.date) {
      setError("Choose an event date.");
      return;
    }
    onSave({
      ...draft,
      title: draft.title.trim(),
      time: timeKey(draft.time),
      notes: draft.notes.trim()
    });
  }

  return (
    <div className="modal-backdrop">
      <form
        onSubmit={submit}
        className="modal-panel max-h-[90vh] max-w-2xl overflow-auto"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              {draft.id ? "Edit calendar event" : "Add calendar event"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Link to a matter to show this event in that matter&apos;s key dates.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Date">
              <Input
                type="date"
                value={draft.date}
                onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              />
            </Field>
            <Field label="Time">
              <Input
                type="time"
                value={draft.time}
                onChange={(event) => setDraft({ ...draft, time: event.target.value })}
              />
            </Field>
            <Field label="Type">
              <Select
                value={draft.type}
                onChange={(event) =>
                  setDraft({ ...draft, type: event.target.value as CalendarEventType })
                }
              >
                {eventTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Title">
            <Input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="e.g. Motion hearing"
            />
          </Field>

          <Field label="Linked matter">
            <Select
              value={draft.matterId}
              onChange={(event) => setDraft({ ...draft, matterId: event.target.value })}
            >
              <option value="">No linked matter</option>
              {matters.map((matter) => (
                <option key={matter.id} value={matter.id}>
                  {matter.fileReference} - {clientsById.get(matter.clientId)?.fullName ?? "Unknown client"}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Notes">
            <Textarea
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              placeholder="Optional notes"
            />
          </Field>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {draft.id ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {draft.id ? "Save Changes" : "Save Event"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function DeleteEventModal({
  event,
  onCancel,
  onConfirm
}: {
  event: CalendarEventItem;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-event-title">
      <div className="modal-panel max-w-md">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-700">
            <Trash2 className="h-5 w-5" />
          </span>
          <div>
            <h2 id="delete-event-title" className="text-lg font-semibold text-slate-950">
              Delete calendar event?
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              This will remove “{event.title}” from the calendar. Linked matter history will keep an audit entry.
            </p>
          </div>
        </div>
        <div className="mt-5 rounded-md border bg-slate-50 p-3 text-sm">
          <EventDetail label="Date" value={formatDisplayDate(event.date)} />
          <EventDetail label="Time" value={formatEventTime(event.time)} />
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            <Trash2 className="h-4 w-4" />
            Delete Event
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function getMonthCells(month: Date) {
  const first = startOfMonth(month);
  const startDay = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startDay);
  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date: inputDate(date),
      day: date.getDate(),
      month: date.getMonth()
    };
  });
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function inputDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function todayInput() {
  return inputDate(new Date());
}

const monthFormatter = new Intl.DateTimeFormat("en-IE", {
  month: "long",
  year: "numeric"
});
