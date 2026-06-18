"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Download,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Square,
  Trash2,
  X
} from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import {
  buildInvoiceText,
  formatCurrency,
  formatHours,
  getExpenseTotals,
  getInvoiceDisplayStatus,
  getTimeTotals
} from "@/lib/billing";
import { formatDisplayDate } from "@/lib/dates";
import { useKeroStore } from "@/lib/storage";
import type { Client, ExpenseEntry, InvoiceStatus, Matter, TimeEntry } from "@/lib/types";

type TimeDraft = {
  id?: string;
  date: string;
  description: string;
  durationHours: string;
  hourlyRate: string;
  billable: boolean;
};

type ExpenseDraft = {
  id?: string;
  date: string;
  description: string;
  amount: string;
  billable: boolean;
  receiptName: string;
};

export function MatterTimeBillingPanel({
  matter,
  client
}: {
  matter: Matter;
  client: Client;
}) {
  const {
    state,
    addTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    addExpense,
    updateExpense,
    deleteExpense,
    generateInvoice,
    updateInvoiceStatus,
    hasPermission
  } = useKeroStore();
  const { toast } = useToast();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timeDraft, setTimeDraft] = useState<TimeDraft | null>(null);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null);
  const [vatEnabled, setVatEnabled] = useState(state.settings.billing.vatEnabledByDefault);
  const canLogTime = hasPermission("logTime");
  const canGenerateInvoices = hasPermission("generateInvoices");

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  useEffect(() => {
    setVatEnabled(state.settings.billing.vatEnabledByDefault);
  }, [state.settings.billing.vatEnabledByDefault]);

  const timeEntries = useMemo(
    () => state.timeEntries.filter((entry) => entry.matterId === matter.id),
    [matter.id, state.timeEntries]
  );
  const expenses = useMemo(
    () => state.expenses.filter((expense) => expense.matterId === matter.id),
    [matter.id, state.expenses]
  );
  const invoices = useMemo(
    () => state.invoices.filter((invoice) => invoice.matterId === matter.id),
    [matter.id, state.invoices]
  );
  const timeTotals = useMemo(() => getTimeTotals(timeEntries), [timeEntries]);
  const expenseTotals = useMemo(() => getExpenseTotals(expenses), [expenses]);
  const logRows = useMemo(() => {
    return [
      ...timeEntries.map((entry) => ({ kind: "time" as const, date: entry.date, item: entry })),
      ...expenses.map((expense) => ({ kind: "expense" as const, date: expense.date, item: expense }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, timeEntries]);

  function openManualTime() {
    setTimeDraft({
      date: todayInput(),
      description: "",
      durationHours: "",
      hourlyRate: String(state.settings.billing.defaultHourlyRate),
      billable: true
    });
  }

  function openTimedEntry() {
    setTimerRunning(false);
    setTimeDraft({
      date: todayInput(),
      description: "",
      durationHours: secondsToHours(elapsedSeconds),
      hourlyRate: String(state.settings.billing.defaultHourlyRate),
      billable: true
    });
    setElapsedSeconds(0);
  }

  function editTimeEntry(entry: TimeEntry) {
    setTimeDraft({
      id: entry.id,
      date: entry.date,
      description: entry.description,
      durationHours: String(entry.durationHours),
      hourlyRate: String(entry.hourlyRate),
      billable: entry.billable
    });
  }

  function editExpense(expense: ExpenseEntry) {
    setExpenseDraft({
      id: expense.id,
      date: expense.date,
      description: expense.description,
      amount: String(expense.amount),
      billable: expense.billable,
      receiptName: expense.receiptName ?? ""
    });
  }

  function openExpense() {
    setExpenseDraft({
      date: todayInput(),
      description: "",
      amount: "",
      billable: true,
      receiptName: ""
    });
  }

  function createInvoice() {
    const invoice = generateInvoice(matter.id, { vatEnabled });
    if (!invoice) {
      toast("Add billable time or expenses before generating an invoice");
      return;
    }
    toast(`${invoice.invoiceNumber} generated`);
  }

  function printInvoice(invoiceId: string) {
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;
    const text = buildInvoiceText({ invoice, matter, client, settings: state.settings });
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;
    printWindow.document.write(
      `<html><head><title>${escapeHtml(invoice.invoiceNumber)}</title><style>body{font-family:Georgia,serif;line-height:1.55;padding:32px;white-space:pre-wrap;color:#0f172a}</style></head><body>${escapeHtml(text)}</body></html>`
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <section className="surface-card p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Time & Billing</h2>
          <p className="text-sm text-muted-foreground">
            Track billable work, expenses, and invoices for this matter.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={openManualTime} disabled={!canLogTime}>
            <Plus className="h-4 w-4" />
            Log Time
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={openExpense} disabled={!canLogTime}>
            <ReceiptText className="h-4 w-4" />
            Log Expense
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <BillingMetric label="Total hours" value={formatHours(timeTotals.totalHours)} />
        <BillingMetric label="Billable hours" value={formatHours(timeTotals.billableHours)} />
        <BillingMetric label="Billable time" value={formatCurrency(timeTotals.billableAmount)} />
        <BillingMetric label="Billable expenses" value={formatCurrency(expenseTotals.billable)} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-md border bg-slate-50 p-3">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">Timer</p>
              <p className="text-3xl font-bold tabular-nums text-primary">
                {formatTimer(elapsedSeconds)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => setTimerRunning(true)}
                disabled={timerRunning || !canLogTime}
              >
                <Clock3 className="h-4 w-4" />
                Start
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTimerRunning(false)}
                disabled={!timerRunning || !canLogTime}
              >
                Pause
              </Button>
              <Button
                type="button"
                variant="success"
                size="sm"
                onClick={openTimedEntry}
                disabled={elapsedSeconds === 0 || !canLogTime}
              >
                <Square className="h-4 w-4" />
                Stop
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Stopping the timer opens a time entry form with the duration pre-filled.
          </p>
        </div>

        <div className="rounded-md border bg-white p-3">
          <p className="text-sm font-semibold text-slate-950">Generate invoice</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Includes all billable time entries and expenses currently logged on this matter.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-800">
            <Checkbox
              checked={vatEnabled}
              onChange={(event) => setVatEnabled(event.target.checked)}
            />
            Apply VAT at 23%
          </label>
          <Button type="button" className="mt-3 w-full" onClick={createInvoice} disabled={!canGenerateInvoices}>
            <ReceiptText className="h-4 w-4" />
            Generate Invoice
          </Button>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-950">Time log and expenses</h3>
          <Badge variant="navy">{logRows.length} entries</Badge>
        </div>
        <div className="overflow-hidden rounded-md border">
          <div className="hidden grid-cols-[110px_minmax(12rem,1fr)_100px_110px_110px_110px] gap-3 border-b bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground xl:grid">
            <span>Date</span>
            <span>Description</span>
            <span>Duration</span>
            <span>Rate</span>
            <span>Amount</span>
            <span>Actions</span>
          </div>
          {logRows.length === 0 ? (
            <EmptyState
              icon={Clock3}
              title="No time or expenses logged"
              description="Start the timer, log time manually, or add an expense for this matter."
              className="rounded-none border-0"
            />
          ) : (
            <div className="divide-y bg-white">
              {logRows.map((row) =>
                row.kind === "time" ? (
                  <TimeRow
                    key={row.item.id}
                    entry={row.item}
                    onEdit={() => editTimeEntry(row.item)}
                    onDelete={() => {
                      deleteTimeEntry(row.item.id);
                      toast("Time entry deleted");
                    }}
                  />
                ) : (
                  <ExpenseRow
                    key={row.item.id}
                    expense={row.item}
                    onEdit={() => editExpense(row.item)}
                    onDelete={() => {
                      deleteExpense(row.item.id);
                      toast("Expense deleted");
                    }}
                  />
                )
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-950">Invoices</h3>
          <Badge variant="navy">{invoices.length}</Badge>
        </div>
        {invoices.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No invoices generated"
            description="Generate an invoice once billable work or expenses have been logged."
            className="py-6"
          />
        ) : (
          <div className="overflow-hidden rounded-md border bg-white">
            <div className="divide-y">
              {invoices.map((invoice) => {
                const status = getInvoiceDisplayStatus(invoice);
                return (
                  <div
                    key={invoice.id}
                    className="grid gap-3 px-3 py-3 text-sm transition-colors duration-200 hover:bg-slate-50 lg:grid-cols-[120px_1fr_110px_110px_240px] lg:items-center"
                  >
                    <span className="font-semibold text-primary">{invoice.invoiceNumber}</span>
                    <span>
                      <span className="font-semibold text-slate-950">
                        {formatCurrency(invoice.total)}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        Due {formatDisplayDate(invoice.dueDate)}
                      </span>
                    </span>
                    <Badge variant={invoiceStatusVariant(status)}>{status}</Badge>
                    <Select
                      value={status}
                      onChange={(event) =>
                        updateInvoiceStatus(invoice.id, event.target.value as InvoiceStatus)
                      }
                      className="h-8 text-xs"
                      disabled={!canGenerateInvoices}
                    >
                      <option value="Draft">Draft</option>
                      <option value="Sent">Sent</option>
                      <option value="Paid">Paid</option>
                      <option value="Overdue">Overdue</option>
                    </Select>
                    <span className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => printInvoice(invoice.id)}>
                        <Printer className="h-4 w-4" />
                        Print
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => printInvoice(invoice.id)}>
                        <Download className="h-4 w-4" />
                        PDF
                      </Button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {timeDraft ? (
        <TimeEntryModal
          draft={timeDraft}
          setDraft={setTimeDraft}
          onClose={() => setTimeDraft(null)}
          onSave={(draft) => {
            if (draft.id) {
              updateTimeEntry(draft.id, {
                date: draft.date,
                description: draft.description,
                durationHours: Number(draft.durationHours),
                hourlyRate: Number(draft.hourlyRate),
                billable: draft.billable
              });
              toast("Time entry updated");
            } else {
              addTimeEntry({
                matterId: matter.id,
                date: draft.date,
                description: draft.description,
                durationHours: Number(draft.durationHours),
                hourlyRate: Number(draft.hourlyRate),
                billable: draft.billable
              });
              toast("Time entry logged");
            }
            setTimeDraft(null);
          }}
        />
      ) : null}

      {expenseDraft ? (
        <ExpenseModal
          draft={expenseDraft}
          setDraft={setExpenseDraft}
          onClose={() => setExpenseDraft(null)}
          onSave={(draft) => {
            if (draft.id) {
              updateExpense(draft.id, {
                date: draft.date,
                description: draft.description,
                amount: Number(draft.amount),
                billable: draft.billable,
                receiptName: draft.receiptName
              });
              toast("Expense updated");
            } else {
              addExpense({
                matterId: matter.id,
                date: draft.date,
                description: draft.description,
                amount: Number(draft.amount),
                billable: draft.billable,
                receiptName: draft.receiptName
              });
              toast("Expense logged");
            }
            setExpenseDraft(null);
          }}
        />
      ) : null}
    </section>
  );
}

function BillingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white px-3 py-3 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function TimeRow({
  entry,
  onEdit,
  onDelete
}: {
  entry: TimeEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const amount = entry.durationHours * entry.hourlyRate;
  return (
    <div className="grid gap-3 px-3 py-3 text-sm xl:grid-cols-[110px_minmax(12rem,1fr)_100px_110px_110px_110px] xl:items-center">
      <span className="text-muted-foreground">{formatDisplayDate(entry.date)}</span>
      <span className="min-w-0">
        <span className="block font-medium text-slate-950">{entry.description}</span>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant="navy">Time</Badge>
          <Badge variant={entry.billable ? "open" : "default"}>
            {entry.billable ? "Billable" : "Non-billable"}
          </Badge>
        </span>
      </span>
      <span>{formatHours(entry.durationHours)}</span>
      <span>{formatCurrency(entry.hourlyRate)}</span>
      <span>{entry.billable ? formatCurrency(amount) : "-"}</span>
      <RowActions onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function ExpenseRow({
  expense,
  onEdit,
  onDelete
}: {
  expense: ExpenseEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="grid gap-3 px-3 py-3 text-sm xl:grid-cols-[110px_minmax(12rem,1fr)_100px_110px_110px_110px] xl:items-center">
      <span className="text-muted-foreground">{formatDisplayDate(expense.date)}</span>
      <span className="min-w-0">
        <span className="block font-medium text-slate-950">{expense.description}</span>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant="warning">Expense</Badge>
          <Badge variant={expense.billable ? "open" : "default"}>
            {expense.billable ? "Billable" : "Non-billable"}
          </Badge>
          {expense.receiptName ? <span className="text-xs text-muted-foreground">{expense.receiptName}</span> : null}
        </span>
      </span>
      <span>-</span>
      <span>-</span>
      <span>{expense.billable ? formatCurrency(expense.amount) : "-"}</span>
      <RowActions onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
        Edit
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>
    </span>
  );
}

function TimeEntryModal({
  draft,
  setDraft,
  onClose,
  onSave
}: {
  draft: TimeDraft;
  setDraft: (draft: TimeDraft | null) => void;
  onClose: () => void;
  onSave: (draft: TimeDraft) => void;
}) {
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.description.trim()) {
      setError("Add a description of the work done.");
      return;
    }
    if (Number(draft.durationHours) <= 0) {
      setError("Add a duration greater than zero.");
      return;
    }
    onSave(draft);
  }

  return (
    <ModalFrame title={draft.id ? "Edit time entry" : "Log time"} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-2">
          <Label>Description of work done</Label>
          <Textarea
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            placeholder="e.g. Reviewed contract pack and title documents"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date">
            <Input
              type="date"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
            />
          </Field>
          <Field label="Hours">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.durationHours}
              onChange={(event) => setDraft({ ...draft, durationHours: event.target.value })}
            />
          </Field>
          <Field label="Hourly rate">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.hourlyRate}
              onChange={(event) => setDraft({ ...draft, hourlyRate: event.target.value })}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <Checkbox
            checked={draft.billable}
            onChange={(event) => setDraft({ ...draft, billable: event.target.checked })}
          />
          Billable
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            <CheckCircle2 className="h-4 w-4" />
            Save
          </Button>
        </div>
      </form>
    </ModalFrame>
  );
}

function ExpenseModal({
  draft,
  setDraft,
  onClose,
  onSave
}: {
  draft: ExpenseDraft;
  setDraft: (draft: ExpenseDraft | null) => void;
  onClose: () => void;
  onSave: (draft: ExpenseDraft) => void;
}) {
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.description.trim()) {
      setError("Add an expense description.");
      return;
    }
    if (Number(draft.amount) <= 0) {
      setError("Add an amount greater than zero.");
      return;
    }
    onSave(draft);
  }

  return (
    <ModalFrame title={draft.id ? "Edit expense" : "Log expense"} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-2">
          <Label>Description</Label>
          <Textarea
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            placeholder="e.g. Land Registry search fee"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date">
            <Input
              type="date"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
            />
          </Field>
          <Field label="Amount">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.amount}
              onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Receipt upload">
          <Input
            type="file"
            onChange={(event) =>
              setDraft({
                ...draft,
                receiptName: event.currentTarget.files?.[0]?.name ?? draft.receiptName
              })
            }
          />
          {draft.receiptName ? (
            <p className="mt-1 text-xs text-muted-foreground">Receipt: {draft.receiptName}</p>
          ) : null}
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <Checkbox
            checked={draft.billable}
            onChange={(event) => setDraft({ ...draft, billable: event.target.checked })}
          />
          Billable
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            <CheckCircle2 className="h-4 w-4" />
            Save
          </Button>
        </div>
      </form>
    </ModalFrame>
  );
}

function ModalFrame({
  title,
  children,
  onClose
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-panel max-h-[90vh] max-w-2xl overflow-auto">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
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

function formatTimer(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function secondsToHours(seconds: number) {
  return (seconds / 3600).toFixed(2);
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function invoiceStatusVariant(status: InvoiceStatus) {
  if (status === "Paid") return "open";
  if (status === "Sent") return "progress";
  if (status === "Overdue") return "danger";
  return "default";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
