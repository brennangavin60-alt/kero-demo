"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileText,
  Mail,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Trash2,
  WalletCards,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState, PageSkeleton } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import {
  formatCurrency,
  formatHours,
  getBillingSummary,
  getInvoiceBalance,
  getInvoiceDisplayStatus,
  getInvoicePaidAmount
} from "@/lib/billing";
import { formatDisplayDate, todayInput } from "@/lib/dates";
import {
  downloadInvoicePdf,
  emailInvoiceWithPdf,
  printInvoicePdf
} from "@/lib/invoice-pdf";
import { getMatterTitle } from "@/lib/stages";
import { useKeroStore } from "@/lib/storage";
import type {
  Client,
  ExpenseEntry,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  Matter,
  PaymentMethod,
  TimeEntry
} from "@/lib/types";
import { cn } from "@/lib/utils";

type InvoiceFilter = "all" | InvoiceStatus;
type BillableFilter = "all" | "billable" | "non-billable";
type ActiveTab = "invoices" | "time" | "timesheet" | "expenses";

type InvoiceRow = {
  invoice: Invoice;
  matter?: Matter;
  client?: Client;
  status: InvoiceStatus;
};

type TimeFilters = {
  query: string;
  clientId: string;
  matterId: string;
  from: string;
  to: string;
  billable: BillableFilter;
};

type ExpenseFilters = {
  query: string;
  clientId: string;
  matterId: string;
  from: string;
  to: string;
  billable: BillableFilter;
};

type InvoiceDraftLine = Omit<InvoiceLine, "id">;

const paymentMethods: PaymentMethod[] = [
  "Bank Transfer",
  "Cheque",
  "Cash",
  "Card",
  "Other"
];

export function TimeBillingPage({
  initialStatusFilter = "all"
}: {
  initialStatusFilter?: InvoiceFilter;
}) {
  const {
    state,
    hydrated,
    generateInvoice,
    createInvoice,
    updateInvoice,
    duplicateInvoice,
    updateInvoiceStatus,
    recordInvoicePayment,
    addExpense
  } = useKeroStore();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ActiveTab>("invoices");
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceFilter>(initialStatusFilter);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [selectedTimeIds, setSelectedTimeIds] = useState<string[]>([]);
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeekInput(todayInput()));
  const [timeFilters, setTimeFilters] = useState<TimeFilters>({
    query: "",
    clientId: "",
    matterId: "",
    from: "",
    to: "",
    billable: "all"
  });
  const [expenseFilters, setExpenseFilters] = useState<ExpenseFilters>({
    query: "",
    clientId: "",
    matterId: "",
    from: "",
    to: "",
    billable: "all"
  });

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  const mattersById = useMemo(
    () => new Map(state.matters.map((matter) => [matter.id, matter])),
    [state.matters]
  );
  const clientsById = useMemo(
    () => new Map(state.clients.map((client) => [client.id, client])),
    [state.clients]
  );
  const billedTimeIds = useMemo(() => billedSourceIds(state.invoices, "time"), [state.invoices]);
  const billedExpenseIds = useMemo(
    () => billedSourceIds(state.invoices, "expense"),
    [state.invoices]
  );
  const invoiceRows = useMemo<InvoiceRow[]>(() => {
    return state.invoices.map((invoice) => ({
      invoice,
      matter: mattersById.get(invoice.matterId),
      client: clientsById.get(invoice.clientId),
      status: getInvoiceDisplayStatus(invoice)
    }));
  }, [clientsById, mattersById, state.invoices]);
  const selectedInvoice =
    invoiceRows.find((row) => row.invoice.id === selectedInvoiceId) ?? invoiceRows[0];

  const filteredInvoices = useMemo(() => {
    const search = invoiceQuery.trim().toLowerCase();
    return invoiceRows.filter((row) => {
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const haystack = [
        row.invoice.invoiceNumber,
        row.client?.fullName,
        row.matter?.fileReference,
        row.matter ? getMatterTitle(row.matter) : "",
        row.status
      ]
        .join(" ")
        .toLowerCase();
      return matchesStatus && (!search || haystack.includes(search));
    });
  }, [invoiceQuery, invoiceRows, statusFilter]);

  const filteredTimeEntries = useMemo(() => {
    return state.timeEntries.filter((entry) =>
      matchesTimeFilters(entry, timeFilters, mattersById, clientsById)
    );
  }, [clientsById, mattersById, state.timeEntries, timeFilters]);

  const filteredExpenses = useMemo(() => {
    return state.expenses.filter((expense) =>
      matchesExpenseFilters(expense, expenseFilters, mattersById, clientsById)
    );
  }, [clientsById, expenseFilters, mattersById, state.expenses]);

  const unbilledTimeEntries = useMemo(
    () =>
      state.timeEntries.filter(
        (entry) => entry.billable && !billedTimeIds.has(entry.id)
      ),
    [billedTimeIds, state.timeEntries]
  );
  const unbilledTimeValue = useMemo(
    () =>
      unbilledTimeEntries.reduce(
        (total, entry) => total + entry.durationHours * entry.hourlyRate,
        0
      ),
    [unbilledTimeEntries]
  );
  const financialSummary = useMemo(
    () => buildFinancialSummary(state.invoices, unbilledTimeValue),
    [state.invoices, unbilledTimeValue]
  );
  const monthlyRevenue = useMemo(() => monthlyRevenueBars(state.invoices), [state.invoices]);
  const selectedTimeEntries = useMemo(
    () => state.timeEntries.filter((entry) => selectedTimeIds.includes(entry.id)),
    [selectedTimeIds, state.timeEntries]
  );
  const selectedTimeMatterIds = new Set(selectedTimeEntries.map((entry) => entry.matterId));
  const canInvoiceSelectedTime =
    selectedTimeEntries.length > 0 &&
    selectedTimeMatterIds.size === 1 &&
    selectedTimeEntries.some((entry) => entry.billable && !billedTimeIds.has(entry.id));

  if (!hydrated) return <PageSkeleton rows={7} />;

  function printInvoice(row: InvoiceRow) {
    if (!row.matter || !row.client) return;
    printInvoicePdf({
      invoice: row.invoice,
      matter: row.matter,
      client: row.client,
      settings: state.settings
    });
  }

  function emailInvoice(row: InvoiceRow) {
    if (!row.matter || !row.client) return;
    emailInvoiceWithPdf({
      invoice: row.invoice,
      matter: row.matter,
      client: row.client,
      settings: state.settings
    });
    toast("Invoice PDF downloaded and email draft opened");
  }

  function invoiceSelectedTimeEntries() {
    if (!canInvoiceSelectedTime) {
      toast("Select unbilled billable time from one matter only");
      return;
    }
    const matterId = selectedTimeEntries[0]?.matterId;
    if (!matterId) return;
    const invoice = generateInvoice(matterId, {
      timeEntryIds: selectedTimeEntries
        .filter((entry) => entry.billable && !billedTimeIds.has(entry.id))
        .map((entry) => entry.id),
      expenseIds: []
    });
    if (!invoice) {
      toast("No unbilled billable time selected");
      return;
    }
    setSelectedInvoiceId(invoice.id);
    setActiveTab("invoices");
    setSelectedTimeIds([]);
    toast(`${invoice.invoiceNumber} created from selected time`);
  }

  function toggleTimeSelection(entryId: string, checked: boolean) {
    setSelectedTimeIds((current) =>
      checked
        ? Array.from(new Set([...current, entryId]))
        : current.filter((id) => id !== entryId)
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ReceiptText className="h-5 w-5" />
            </span>
            <h1 className="text-3xl font-bold text-slate-950">Time & Billing</h1>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Manage time, expenses, invoices, payments, and billing performance across every matter.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setCreateInvoiceOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Invoice
          </Button>
          <Button type="button" variant="outline" onClick={() => setExpenseModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Expense
          </Button>
        </div>
      </div>

      <FinancialDashboard
        summary={financialSummary}
        monthlyRevenue={monthlyRevenue}
      />

      {unbilledTimeEntries.length > 0 ? (
        <section className="surface-card border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                <span className="block font-semibold">
                  {unbilledTimeEntries.length} unbilled billable time entr{unbilledTimeEntries.length === 1 ? "y" : "ies"}
                </span>
                <span className="text-sm">
                  {formatCurrency(unbilledTimeValue)} is sitting uninvoiced across active files.
                </span>
              </span>
            </span>
            <Button type="button" variant="outline" onClick={() => setActiveTab("time")}>
              Review Time
            </Button>
          </div>
        </section>
      ) : null}

      <section className="surface-card flex flex-wrap gap-2 p-2">
        {[
          ["invoices", "Invoices"],
          ["time", "Time Entries"],
          ["timesheet", "Weekly Timesheet"],
          ["expenses", "Expenses"]
        ].map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant={activeTab === value ? "default" : "ghost"}
            onClick={() => setActiveTab(value as ActiveTab)}
          >
            {label}
          </Button>
        ))}
      </section>

      {activeTab === "invoices" ? (
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_440px]">
          <InvoicesPanel
            query={invoiceQuery}
            setQuery={setInvoiceQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            rows={filteredInvoices}
            selectedInvoiceId={selectedInvoice?.invoice.id ?? ""}
            onSelect={setSelectedInvoiceId}
            onPrint={printInvoice}
            onEmail={emailInvoice}
            onDownload={(row) => {
              if (!row.matter || !row.client) return;
              downloadInvoicePdf({
                invoice: row.invoice,
                matter: row.matter,
                client: row.client,
                settings: state.settings
              });
            }}
            onStatus={updateInvoiceStatus}
          />
          {selectedInvoice ? (
            <InvoiceDetailPanel
              row={selectedInvoice}
              state={state}
              billedTimeIds={billedTimeIds}
              billedExpenseIds={billedExpenseIds}
              updateInvoice={updateInvoice}
              duplicateInvoice={(invoiceId) => {
                const invoice = duplicateInvoice(invoiceId);
                if (invoice) {
                  setSelectedInvoiceId(invoice.id);
                  toast(`${invoice.invoiceNumber} duplicated`);
                }
              }}
              updateInvoiceStatus={updateInvoiceStatus}
              recordInvoicePayment={(invoiceId, payment) => {
                recordInvoicePayment(invoiceId, payment);
                toast("Payment recorded");
              }}
              onPrint={() => printInvoice(selectedInvoice)}
              onEmail={() => emailInvoice(selectedInvoice)}
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="No invoice selected"
              description="Select an invoice to review line items, payments and draft edits."
              className="surface-card"
            />
          )}
        </div>
      ) : null}

      {activeTab === "time" ? (
        <TimeEntriesPanel
          entries={filteredTimeEntries}
          filters={timeFilters}
          setFilters={setTimeFilters}
          clients={state.clients}
          matters={state.matters}
          mattersById={mattersById}
          clientsById={clientsById}
          billedTimeIds={billedTimeIds}
          selectedTimeIds={selectedTimeIds}
          toggleSelection={toggleTimeSelection}
          invoiceSelectedTimeEntries={invoiceSelectedTimeEntries}
          canInvoiceSelectedTime={canInvoiceSelectedTime}
        />
      ) : null}

      {activeTab === "timesheet" ? (
        <WeeklyTimesheetPanel
          entries={state.timeEntries}
          weekStart={weekStart}
          setWeekStart={setWeekStart}
          mattersById={mattersById}
          clientsById={clientsById}
        />
      ) : null}

      {activeTab === "expenses" ? (
        <ExpensesPanel
          expenses={filteredExpenses}
          filters={expenseFilters}
          setFilters={setExpenseFilters}
          clients={state.clients}
          matters={state.matters}
          mattersById={mattersById}
          clientsById={clientsById}
          billedExpenseIds={billedExpenseIds}
          openAddExpense={() => setExpenseModalOpen(true)}
        />
      ) : null}

      {createInvoiceOpen ? (
        <CreateInvoiceModal
          state={state}
          billedTimeIds={billedTimeIds}
          billedExpenseIds={billedExpenseIds}
          createInvoice={(input) => {
            const invoice = createInvoice(input);
            if (invoice) {
              setSelectedInvoiceId(invoice.id);
              setActiveTab("invoices");
              setCreateInvoiceOpen(false);
              toast(`${invoice.invoiceNumber} created`);
            } else {
              toast("Add at least one line item before creating the invoice");
            }
          }}
          onClose={() => setCreateInvoiceOpen(false)}
        />
      ) : null}

      {expenseModalOpen ? (
        <AddExpenseModal
          matters={state.matters}
          clientsById={clientsById}
          addExpense={(input) => {
            addExpense(input);
            setExpenseModalOpen(false);
            toast("Expense logged");
          }}
          onClose={() => setExpenseModalOpen(false)}
        />
      ) : null}
    </div>
  );
}

function FinancialDashboard({
  summary,
  monthlyRevenue
}: {
  summary: ReturnType<typeof buildFinancialSummary>;
  monthlyRevenue: Array<{ label: string; value: number }>;
}) {
  const maxRevenue = Math.max(1, ...monthlyRevenue.map((item) => item.value));
  return (
    <section className="surface-card p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <WalletCards className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">Financial summary</h2>
          <p className="text-sm text-muted-foreground">Billing performance and cash collection at a glance.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        <BillingStat label="Billed this month" value={formatCurrency(summary.billedThisMonth)} icon={ReceiptText} />
        <BillingStat label="Collected this month" value={formatCurrency(summary.collectedThisMonth)} icon={CheckCircle2} />
        <BillingStat label="Outstanding" value={formatCurrency(summary.outstandingSent)} icon={WalletCards} />
        <BillingStat label="Overdue" value={formatCurrency(summary.overdue)} icon={AlertTriangle} danger />
        <BillingStat label="Unbilled time" value={formatCurrency(summary.unbilledTimeValue)} icon={FileText} />
      </div>
      <div className="mt-5 rounded-md border bg-slate-50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-950">Monthly revenue</h3>
          <span className="text-xs text-muted-foreground">Last 6 months</span>
        </div>
        <div className="grid grid-cols-6 items-end gap-3">
          {monthlyRevenue.map((item) => (
            <div key={item.label} className="grid gap-2 text-center">
              <div className="flex h-28 items-end rounded-md bg-white px-2 py-2 shadow-soft">
                <div
                  className="w-full rounded bg-primary transition-all duration-500"
                  style={{ height: `${Math.max(8, (item.value / maxRevenue) * 100)}%` }}
                  title={formatCurrency(item.value)}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BillingStat({
  label,
  value,
  icon: Icon,
  danger
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  danger?: boolean;
}) {
  return (
    <div className="rounded-md border bg-white p-3 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            {label}
          </span>
          <span className={cn("mt-2 block text-xl font-bold text-slate-950", danger && "text-red-700")}>
            {value}
          </span>
        </span>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary", danger && "bg-red-50 text-red-700")}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function InvoicesPanel({
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  rows,
  selectedInvoiceId,
  onSelect,
  onPrint,
  onEmail,
  onDownload,
  onStatus
}: {
  query: string;
  setQuery: (value: string) => void;
  statusFilter: InvoiceFilter;
  setStatusFilter: (value: InvoiceFilter) => void;
  rows: InvoiceRow[];
  selectedInvoiceId: string;
  onSelect: (invoiceId: string) => void;
  onPrint: (row: InvoiceRow) => void;
  onEmail: (row: InvoiceRow) => void;
  onDownload: (row: InvoiceRow) => void;
  onStatus: (invoiceId: string, status: InvoiceStatus) => void;
}) {
  return (
    <section className="surface-card overflow-hidden">
      <div className="grid gap-3 border-b bg-slate-50 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search invoice, client or matter"
            className="pl-9"
          />
        </label>
        <Select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as InvoiceFilter)}
        >
          <option value="all">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Paid">Paid</option>
          <option value="Overdue">Overdue</option>
        </Select>
      </div>
      <div className="hidden grid-cols-[120px_minmax(12rem,1fr)_110px_100px_110px_110px_110px_120px] gap-3 border-b px-4 py-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground xl:grid">
        <span>Invoice</span>
        <span>Client / matter</span>
        <span>Amount</span>
        <span>VAT</span>
        <span>Total</span>
        <span>Issued</span>
        <span>Due</span>
        <span>Status</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices found"
          description="Create an invoice from unbilled time, expenses or fixed fees."
          className="rounded-none border-0"
        />
      ) : (
        <div className="divide-y">
          {rows.map((row) => (
            <InvoiceListRow
              key={row.invoice.id}
              row={row}
              selected={row.invoice.id === selectedInvoiceId}
              onSelect={() => onSelect(row.invoice.id)}
              onPrint={() => onPrint(row)}
              onEmail={() => onEmail(row)}
              onDownload={() => onDownload(row)}
              onStatus={(status) => onStatus(row.invoice.id, status)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function InvoiceListRow({
  row,
  selected,
  onSelect,
  onPrint,
  onEmail,
  onDownload,
  onStatus
}: {
  row: InvoiceRow;
  selected: boolean;
  onSelect: () => void;
  onPrint: () => void;
  onEmail: () => void;
  onDownload: () => void;
  onStatus: (status: InvoiceStatus) => void;
}) {
  const disabled = !row.matter || !row.client;
  return (
    <div
      className={cn(
        "grid gap-3 px-4 py-4 text-sm transition-colors duration-200 hover:bg-slate-50 xl:grid-cols-[120px_minmax(12rem,1fr)_110px_100px_110px_110px_110px_120px] xl:items-center",
        selected && "bg-primary/5"
      )}
    >
      <button type="button" onClick={onSelect} className="text-left font-semibold text-primary">
        {row.invoice.invoiceNumber}
      </button>
      <span className="min-w-0">
        <span className="block font-semibold text-slate-950">
          {row.client?.fullName ?? "Unknown client"}
        </span>
        {row.matter ? (
          <Link
            href={`/matters/${row.matter.id}`}
            className="mt-1 block truncate text-xs font-medium text-muted-foreground hover:text-primary"
          >
            {row.matter.fileReference} · {getMatterTitle(row.matter)}
          </Link>
        ) : (
          <span className="mt-1 block text-xs text-muted-foreground">Matter unavailable</span>
        )}
      </span>
      <span>{formatCurrency(row.invoice.subtotal)}</span>
      <span>{formatCurrency(row.invoice.vatAmount)}</span>
      <span className="font-semibold text-slate-950">{formatCurrency(row.invoice.total)}</span>
      <span className="text-muted-foreground">{formatDisplayDate(row.invoice.invoiceDate)}</span>
      <span className="text-muted-foreground">{formatDisplayDate(row.invoice.dueDate)}</span>
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant={invoiceStatusVariant(row.status)}>{row.status}</Badge>
        <span className="flex flex-wrap gap-1">
          <Button type="button" variant="outline" size="sm" onClick={onPrint} disabled={disabled}>
            <Printer className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDownload} disabled={disabled}>
            <Download className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onEmail} disabled={disabled}>
            <Mail className="h-4 w-4" />
          </Button>
        </span>
        <Select
          value={row.status}
          onChange={(event) => onStatus(event.target.value as InvoiceStatus)}
          className="h-8 w-28 text-xs"
        >
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Paid">Paid</option>
          <option value="Overdue">Overdue</option>
        </Select>
      </span>
    </div>
  );
}

function InvoiceDetailPanel({
  row,
  state,
  billedTimeIds,
  billedExpenseIds,
  updateInvoice,
  duplicateInvoice,
  updateInvoiceStatus,
  recordInvoicePayment,
  onPrint,
  onEmail
}: {
  row: InvoiceRow;
  state: ReturnType<typeof useKeroStore>["state"];
  billedTimeIds: Set<string>;
  billedExpenseIds: Set<string>;
  updateInvoice: (
    invoiceId: string,
    patch: Partial<Pick<Invoice, "dueDate" | "vatEnabled" | "lineItems">>
  ) => void;
  duplicateInvoice: (invoiceId: string) => void;
  updateInvoiceStatus: (invoiceId: string, status: InvoiceStatus) => void;
  recordInvoicePayment: (
    invoiceId: string,
    input: { amount: number; date: string; method: PaymentMethod; note?: string }
  ) => void;
  onPrint: () => void;
  onEmail: () => void;
}) {
  const invoice = row.invoice;
  const draftEditable = invoice.status === "Draft";
  const paidAmount = getInvoicePaidAmount(invoice);
  const balance = getInvoiceBalance(invoice);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayInput());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Bank Transfer");
  const [paymentNote, setPaymentNote] = useState("");
  const [fixedDescription, setFixedDescription] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");

  useEffect(() => {
    setPaymentAmount("");
    setPaymentDate(todayInput());
    setPaymentMethod("Bank Transfer");
    setPaymentNote("");
    setFixedDescription("");
    setFixedAmount("");
  }, [invoice.id]);

  function patchLines(lineItems: InvoiceLine[]) {
    updateInvoice(invoice.id, { lineItems });
  }

  function updateLine(lineId: string, patch: Partial<InvoiceLine>) {
    patchLines(
      invoice.lineItems.map((line) => {
        if (line.id !== lineId) return line;
        const quantity = patch.quantity ?? line.quantity;
        const rate = patch.rate ?? line.rate;
        return {
          ...line,
          ...patch,
          quantity,
          rate,
          amount: roundMoney(quantity * rate)
        };
      })
    );
  }

  function addUnbilledTime() {
    const newLines = state.timeEntries
      .filter(
        (entry) =>
          entry.matterId === invoice.matterId &&
          entry.billable &&
          !billedTimeIds.has(entry.id)
      )
      .map(timeEntryToInvoiceLine);
    if (newLines.length === 0) return;
    patchLines([...invoice.lineItems, ...newLines]);
  }

  function addUnbilledExpenses() {
    const newLines = state.expenses
      .filter(
        (expense) =>
          expense.matterId === invoice.matterId &&
          expense.billable &&
          !billedExpenseIds.has(expense.id)
      )
      .map(expenseToInvoiceLine);
    if (newLines.length === 0) return;
    patchLines([...invoice.lineItems, ...newLines]);
  }

  function addFixedLine() {
    const amount = Number(fixedAmount);
    if (!fixedDescription.trim() || !amount || amount <= 0) return;
    patchLines([
      ...invoice.lineItems,
      {
        id: makeLocalId("line"),
        sourceType: "fixed",
        sourceId: makeLocalId("fixed"),
        date: todayInput(),
        description: fixedDescription.trim(),
        quantity: 1,
        rate: amount,
        amount: roundMoney(amount)
      }
    ]);
    setFixedDescription("");
    setFixedAmount("");
  }

  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    recordInvoicePayment(invoice.id, {
      amount: Number(paymentAmount),
      date: paymentDate,
      method: paymentMethod,
      note: paymentNote
    });
    setPaymentAmount("");
    setPaymentNote("");
  }

  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-950">{invoice.invoiceNumber}</h2>
              <Badge variant={invoiceStatusVariant(getInvoiceDisplayStatus(invoice))}>
                {getInvoiceDisplayStatus(invoice)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {row.client?.fullName ?? "Unknown client"} · {row.matter?.fileReference ?? "No matter"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onPrint}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onEmail}>
              <Mail className="h-4 w-4" />
              Email
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => duplicateInvoice(invoice.id)}>
              <Copy className="h-4 w-4" />
              Duplicate
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <MiniMetric label="Subtotal" value={formatCurrency(invoice.subtotal)} />
          <MiniMetric label="VAT" value={formatCurrency(invoice.vatAmount)} />
          <MiniMetric label="Paid" value={formatCurrency(paidAmount)} />
          <MiniMetric label="Balance" value={formatCurrency(balance)} danger={balance > 0 && getInvoiceDisplayStatus(invoice) === "Overdue"} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-slate-800">Due date</span>
            <Input
              type="date"
              value={invoice.dueDate}
              disabled={!draftEditable}
              onChange={(event) => updateInvoice(invoice.id, { dueDate: event.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 self-end rounded-md border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
            <Checkbox
              checked={invoice.vatEnabled}
              disabled={!draftEditable}
              onChange={(event) => updateInvoice(invoice.id, { vatEnabled: event.target.checked })}
            />
            VAT at 23%
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-slate-800">Manual status</span>
            <Select
              value={invoice.status}
              onChange={(event) => updateInvoiceStatus(invoice.id, event.target.value as InvoiceStatus)}
            >
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Paid">Paid</option>
              <option value="Overdue">Overdue</option>
            </Select>
          </label>
        </div>

        <div className="rounded-md border">
          <div className="grid grid-cols-[minmax(0,1fr)_70px_90px_90px_auto] gap-2 border-b bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            <span>Description</span>
            <span>Qty</span>
            <span>Rate</span>
            <span>Amount</span>
            <span />
          </div>
          {invoice.lineItems.map((line) => (
            <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_70px_90px_90px_auto] gap-2 border-b px-3 py-2 text-sm last:border-b-0">
              {draftEditable ? (
                <>
                  <Input value={line.description} onChange={(event) => updateLine(line.id, { description: event.target.value })} />
                  <Input type="number" value={String(line.quantity)} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })} />
                  <Input type="number" value={String(line.rate)} onChange={(event) => updateLine(line.id, { rate: Number(event.target.value) })} />
                  <span className="self-center font-semibold">{formatCurrency(line.amount)}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => patchLines(invoice.lineItems.filter((item) => item.id !== line.id))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span>
                    <span className="block font-medium text-slate-900">{line.description}</span>
                    <span className="text-xs text-muted-foreground">{line.sourceType}</span>
                  </span>
                  <span>{line.sourceType === "time" ? formatHours(line.quantity) : line.quantity}</span>
                  <span>{formatCurrency(line.rate)}</span>
                  <span className="font-semibold">{formatCurrency(line.amount)}</span>
                  <span />
                </>
              )}
            </div>
          ))}
        </div>

        {draftEditable ? (
          <div className="grid gap-3 rounded-md border bg-slate-50 p-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addUnbilledTime}>
                <Plus className="h-4 w-4" />
                Add Unbilled Time
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addUnbilledExpenses}>
                <Plus className="h-4 w-4" />
                Add Unbilled Expenses
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_auto]">
              <Input value={fixedDescription} onChange={(event) => setFixedDescription(event.target.value)} placeholder="Fixed fee line item" />
              <Input type="number" value={fixedAmount} onChange={(event) => setFixedAmount(event.target.value)} placeholder="Amount" />
              <Button type="button" variant="outline" onClick={addFixedLine} disabled={!fixedDescription.trim() || !Number(fixedAmount)}>
                <Plus className="h-4 w-4" />
                Add Fixed Fee
              </Button>
            </div>
          </div>
        ) : null}

        <form onSubmit={submitPayment} className="grid gap-3 rounded-md border bg-white p-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Record payment</h3>
            <p className="text-xs text-muted-foreground">Partial payments are supported. Remaining balance is shown above.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <Input type="number" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Amount paid" />
            <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
            <Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
              {paymentMethods.map((method) => <option key={method}>{method}</option>)}
            </Select>
            <Button type="submit" disabled={!Number(paymentAmount)}>
              Record Payment
            </Button>
          </div>
          <Textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Optional payment note" />
          {(invoice.payments ?? []).length > 0 ? (
            <div className="grid gap-2">
              {invoice.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <span>{formatDisplayDate(payment.date)} · {payment.method}</span>
                  <span className="font-semibold">{formatCurrency(payment.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}

function MiniMetric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-bold text-slate-950", danger && "text-red-700")}>{value}</p>
    </div>
  );
}

function TimeEntriesPanel({
  entries,
  filters,
  setFilters,
  clients,
  matters,
  mattersById,
  clientsById,
  billedTimeIds,
  selectedTimeIds,
  toggleSelection,
  invoiceSelectedTimeEntries,
  canInvoiceSelectedTime
}: {
  entries: TimeEntry[];
  filters: TimeFilters;
  setFilters: (filters: TimeFilters) => void;
  clients: Client[];
  matters: Matter[];
  mattersById: Map<string, Matter>;
  clientsById: Map<string, Client>;
  billedTimeIds: Set<string>;
  selectedTimeIds: string[];
  toggleSelection: (entryId: string, checked: boolean) => void;
  invoiceSelectedTimeEntries: () => void;
  canInvoiceSelectedTime: boolean;
}) {
  return (
    <section className="surface-card overflow-hidden">
      <BillingFilters
        kind="time"
        filters={filters}
        setFilters={setFilters}
        clients={clients}
        matters={matters}
      />
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">All time entries</h2>
          <p className="text-sm text-muted-foreground">{entries.length} entries across all matters</p>
        </div>
        <Button type="button" onClick={invoiceSelectedTimeEntries} disabled={!canInvoiceSelectedTime}>
          <ReceiptText className="h-4 w-4" />
          Add Selected to Invoice
        </Button>
      </div>
      {entries.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No time entries found"
          description="Adjust filters or log time from a matter page."
          className="rounded-none border-0"
        />
      ) : (
        <div className="divide-y">
          {entries.map((entry) => {
            const matter = mattersById.get(entry.matterId);
            const client = matter ? clientsById.get(matter.clientId) : undefined;
            const billed = billedTimeIds.has(entry.id);
            return (
              <div key={entry.id} className={cn("grid gap-3 px-4 py-3 text-sm lg:grid-cols-[32px_120px_minmax(0,1fr)_120px_120px_120px] lg:items-center", entry.billable && !billed && "bg-amber-50/60")}>
                <Checkbox
                  checked={selectedTimeIds.includes(entry.id)}
                  disabled={!entry.billable || billed}
                  onChange={(event) => toggleSelection(entry.id, event.target.checked)}
                />
                <span className="text-muted-foreground">{formatDisplayDate(entry.date)}</span>
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-950">{entry.description}</span>
                  <span className="text-xs text-muted-foreground">
                    {matter?.fileReference ?? "No matter"} · {client?.fullName ?? "Unknown client"}
                  </span>
                </span>
                <span>{formatHours(entry.durationHours)}</span>
                <span>{formatCurrency(entry.durationHours * entry.hourlyRate)}</span>
                <span>
                  <Badge variant={entry.billable ? billed ? "open" : "warning" : "default"}>
                    {entry.billable ? billed ? "Billed" : "Unbilled" : "Non-billable"}
                  </Badge>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function BillingFilters({
  kind,
  filters,
  setFilters,
  clients,
  matters
}: {
  kind: "time" | "expense";
  filters: TimeFilters | ExpenseFilters;
  setFilters: (filters: any) => void;
  clients: Client[];
  matters: Matter[];
}) {
  return (
    <div className="grid gap-3 border-b bg-slate-50 p-4 xl:grid-cols-[minmax(0,1fr)_180px_180px_140px_140px_160px]">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          placeholder={`Search ${kind === "time" ? "time" : "expenses"}`}
          className="pl-9"
        />
      </label>
      <Select value={filters.clientId} onChange={(event) => setFilters({ ...filters, clientId: event.target.value, matterId: "" })}>
        <option value="">All clients</option>
        {clients.map((client) => <option key={client.id} value={client.id}>{client.fullName}</option>)}
      </Select>
      <Select value={filters.matterId} onChange={(event) => setFilters({ ...filters, matterId: event.target.value })}>
        <option value="">All matters</option>
        {matters
          .filter((matter) => !filters.clientId || matter.clientId === filters.clientId)
          .map((matter) => <option key={matter.id} value={matter.id}>{matter.fileReference}</option>)}
      </Select>
      <Input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
      <Input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
      <Select value={filters.billable} onChange={(event) => setFilters({ ...filters, billable: event.target.value as BillableFilter })}>
        <option value="all">All billing</option>
        <option value="billable">Billable</option>
        <option value="non-billable">Non-billable</option>
      </Select>
    </div>
  );
}

function WeeklyTimesheetPanel({
  entries,
  weekStart,
  setWeekStart,
  mattersById,
  clientsById
}: {
  entries: TimeEntry[];
  weekStart: string;
  setWeekStart: (value: string) => void;
  mattersById: Map<string, Matter>;
  clientsById: Map<string, Client>;
}) {
  const days = weekDays(weekStart);
  const weekEntries = entries.filter((entry) => entry.date >= days[0] && entry.date <= days[6]);
  const rows = Array.from(groupBy(weekEntries, (entry) => entry.matterId).entries());
  const dailyTotals = days.map((day) =>
    weekEntries
      .filter((entry) => entry.date === day)
      .reduce((total, entry) => total + entry.durationHours, 0)
  );
  const weekTotal = dailyTotals.reduce((total, value) => total + value, 0);

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Weekly timesheet</h2>
          <p className="text-sm text-muted-foreground">All time logged that week, Monday to Sunday.</p>
        </div>
        <Input type="date" value={weekStart} onChange={(event) => setWeekStart(startOfWeekInput(event.target.value))} className="sm:w-48" />
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[220px_repeat(7,1fr)_90px] border-b bg-white px-3 py-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            <span>Matter</span>
            {days.map((day) => <span key={day}>{shortDayLabel(day)}</span>)}
            <span>Total</span>
          </div>
          {rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No time logged this week"
              description="Change the week or log time from a matter page."
              className="rounded-none border-0"
            />
          ) : (
            rows.map(([matterId, matterEntries]) => {
              const matter = mattersById.get(matterId);
              const client = matter ? clientsById.get(matter.clientId) : undefined;
              const rowTotal = matterEntries.reduce((total, entry) => total + entry.durationHours, 0);
              return (
                <div key={matterId} className="grid grid-cols-[220px_repeat(7,1fr)_90px] border-b px-3 py-3 text-sm">
                  <span>
                    <span className="block font-semibold text-slate-950">{matter?.fileReference ?? "No matter"}</span>
                    <span className="text-xs text-muted-foreground">{client?.fullName ?? "Unknown client"}</span>
                  </span>
                  {days.map((day) => {
                    const hours = matterEntries
                      .filter((entry) => entry.date === day)
                      .reduce((total, entry) => total + entry.durationHours, 0);
                    return <span key={day}>{hours ? formatHours(hours) : "-"}</span>;
                  })}
                  <span className="font-semibold">{formatHours(rowTotal)}</span>
                </div>
              );
            })
          )}
          <div className="grid grid-cols-[220px_repeat(7,1fr)_90px] bg-slate-50 px-3 py-3 text-sm font-semibold">
            <span>Daily totals</span>
            {dailyTotals.map((total, index) => <span key={days[index]}>{formatHours(total)}</span>)}
            <span>{formatHours(weekTotal)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ExpensesPanel({
  expenses,
  filters,
  setFilters,
  clients,
  matters,
  mattersById,
  clientsById,
  billedExpenseIds,
  openAddExpense
}: {
  expenses: ExpenseEntry[];
  filters: ExpenseFilters;
  setFilters: (filters: ExpenseFilters) => void;
  clients: Client[];
  matters: Matter[];
  mattersById: Map<string, Matter>;
  clientsById: Map<string, Client>;
  billedExpenseIds: Set<string>;
  openAddExpense: () => void;
}) {
  return (
    <section className="surface-card overflow-hidden">
      <BillingFilters
        kind="expense"
        filters={filters}
        setFilters={setFilters}
        clients={clients}
        matters={matters}
      />
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">All expenses</h2>
          <p className="text-sm text-muted-foreground">{expenses.length} expenses across all matters</p>
        </div>
        <Button type="button" onClick={openAddExpense}>
          <Plus className="h-4 w-4" />
          Add Expense
        </Button>
      </div>
      {expenses.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No expenses found"
          description="Adjust filters or add an expense directly from this page."
          className="rounded-none border-0"
        />
      ) : (
        <div className="divide-y">
          {expenses.map((expense) => {
            const matter = mattersById.get(expense.matterId);
            const client = matter ? clientsById.get(matter.clientId) : undefined;
            const billed = billedExpenseIds.has(expense.id);
            return (
              <div key={expense.id} className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[120px_minmax(0,1fr)_130px_120px_120px] lg:items-center">
                <span className="text-muted-foreground">{formatDisplayDate(expense.date)}</span>
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-950">{expense.description}</span>
                  <span className="text-xs text-muted-foreground">
                    {matter?.fileReference ?? "No matter"} · {client?.fullName ?? "Unknown client"}
                  </span>
                </span>
                <span className="font-semibold">{formatCurrency(expense.amount)}</span>
                <span>{expense.receiptName || "No receipt"}</span>
                <Badge variant={expense.billable ? billed ? "open" : "warning" : "default"}>
                  {expense.billable ? billed ? "Billed" : "Unbilled" : "Non-billable"}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CreateInvoiceModal({
  state,
  billedTimeIds,
  billedExpenseIds,
  createInvoice,
  onClose
}: {
  state: ReturnType<typeof useKeroStore>["state"];
  billedTimeIds: Set<string>;
  billedExpenseIds: Set<string>;
  createInvoice: (input: {
    matterId: string;
    vatEnabled?: boolean;
    dueDate?: string;
    lineItems: InvoiceDraftLine[];
  }) => void;
  onClose: () => void;
}) {
  const firstMatter = state.matters[0];
  const [matterId, setMatterId] = useState(firstMatter?.id ?? "");
  const [dueDate, setDueDate] = useState(defaultDueDate(state.settings.billing.defaultPaymentTermsDays));
  const [vatEnabled, setVatEnabled] = useState(state.settings.billing.vatEnabledByDefault);
  const [lineItems, setLineItems] = useState<InvoiceDraftLine[]>([]);
  const [fixedDescription, setFixedDescription] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");

  useEffect(() => {
    setLineItems(buildUnbilledInvoiceLines(matterId, state.timeEntries, state.expenses, billedTimeIds, billedExpenseIds));
  }, [billedExpenseIds, billedTimeIds, matterId, state.expenses, state.timeEntries]);

  const selectedMatter = state.matters.find((matter) => matter.id === matterId);
  const selectedClient = selectedMatter
    ? state.clients.find((client) => client.id === selectedMatter.clientId)
    : undefined;
  const totals = invoiceTotalsForLines(lineItems, vatEnabled);

  function addFixedLine() {
    const amount = Number(fixedAmount);
    if (!fixedDescription.trim() || !amount || amount <= 0) return;
    setLineItems((current) => [
      ...current,
      {
        sourceType: "fixed",
        sourceId: makeLocalId("fixed"),
        date: todayInput(),
        description: fixedDescription.trim(),
        quantity: 1,
        rate: amount,
        amount: roundMoney(amount)
      }
    ]);
    setFixedDescription("");
    setFixedAmount("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matterId || lineItems.length === 0) return;
    createInvoice({
      matterId,
      vatEnabled,
      dueDate,
      lineItems
    });
  }

  return (
    <div className="modal-backdrop">
      <form onSubmit={submit} className="modal-panel max-h-[92vh] max-w-5xl overflow-auto">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Create invoice</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a matter. Kero pulls in all unbilled billable time and expenses automatically.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-800">Matter</span>
              <Select value={matterId} onChange={(event) => setMatterId(event.target.value)}>
                {state.matters.map((matter) => {
                  const client = state.clients.find((item) => item.id === matter.clientId);
                  return (
                    <option key={matter.id} value={matter.id}>
                      {matter.fileReference} - {client?.fullName ?? "Unknown client"}
                    </option>
                  );
                })}
              </Select>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-800">Due date</span>
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
            <label className="flex items-center gap-2 self-end rounded-md border bg-slate-50 px-3 py-2 text-sm font-medium">
              <Checkbox checked={vatEnabled} onChange={(event) => setVatEnabled(event.target.checked)} />
              Apply VAT at 23%
            </label>
          </div>

          <section className="rounded-md border bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-950">Preview</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedClient?.fullName ?? "No client"} · {selectedMatter?.fileReference ?? "No matter"}
            </p>
            <div className="mt-3 rounded-md border bg-white">
              {lineItems.length === 0 ? (
                <div className="px-3 py-6 text-sm text-muted-foreground">
                  No unbilled time or expenses found. Add a fixed fee line below.
                </div>
              ) : (
                lineItems.map((line, index) => (
                  <div key={`${line.sourceType}-${line.sourceId}-${index}`} className="grid gap-2 border-b px-3 py-2 text-sm last:border-b-0 md:grid-cols-[1fr_100px_100px_80px] md:items-center">
                    <Input value={line.description} onChange={(event) => setLineItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} />
                    <Input type="number" value={String(line.quantity)} onChange={(event) => setLineItems((current) => current.map((item, itemIndex) => updateDraftLineQuantity(current, item, itemIndex, index, Number(event.target.value))))} />
                    <Input type="number" value={String(line.rate)} onChange={(event) => setLineItems((current) => current.map((item, itemIndex) => updateDraftLineRate(current, item, itemIndex, index, Number(event.target.value))))} />
                    <Button type="button" variant="outline" size="sm" onClick={() => setLineItems((current) => current.filter((_item, itemIndex) => itemIndex !== index))}>
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_140px_auto]">
              <Input value={fixedDescription} onChange={(event) => setFixedDescription(event.target.value)} placeholder="Fixed fee description" />
              <Input type="number" value={fixedAmount} onChange={(event) => setFixedAmount(event.target.value)} placeholder="Amount" />
              <Button type="button" variant="outline" onClick={addFixedLine} disabled={!fixedDescription.trim() || !Number(fixedAmount)}>
                Add Fixed Fee
              </Button>
            </div>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
              <MiniMetric label="Subtotal" value={formatCurrency(totals.subtotal)} />
              <MiniMetric label="VAT" value={formatCurrency(totals.vatAmount)} />
              <MiniMetric label="Total" value={formatCurrency(totals.total)} />
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!matterId || lineItems.length === 0}>
              <Eye className="h-4 w-4" />
              Generate Draft Invoice
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function AddExpenseModal({
  matters,
  clientsById,
  addExpense,
  onClose
}: {
  matters: Matter[];
  clientsById: Map<string, Client>;
  addExpense: (input: {
    matterId: string;
    date: string;
    description: string;
    amount: number;
    billable: boolean;
    receiptName?: string;
  }) => void;
  onClose: () => void;
}) {
  const [matterId, setMatterId] = useState(matters[0]?.id ?? "");
  const [date, setDate] = useState(todayInput());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [billable, setBillable] = useState(true);
  const [receiptName, setReceiptName] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matterId || !description.trim() || !Number(amount)) return;
    addExpense({
      matterId,
      date,
      description,
      amount: Number(amount),
      billable,
      receiptName
    });
  }

  return (
    <div className="modal-backdrop">
      <form onSubmit={submit} className="modal-panel max-w-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Add expense</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Log an expense directly from the billing hub.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-4">
          <Select value={matterId} onChange={(event) => setMatterId(event.target.value)}>
            {matters.map((matter) => (
              <option key={matter.id} value={matter.id}>
                {matter.fileReference} - {clientsById.get(matter.clientId)?.fullName ?? "Unknown client"}
              </option>
            ))}
          </Select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <Input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" />
          </div>
          <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" />
          <Input value={receiptName} onChange={(event) => setReceiptName(event.target.value)} placeholder="Receipt filename or reference" />
          <label className="flex items-center gap-2 rounded-md border bg-slate-50 px-3 py-2 text-sm font-medium">
            <Checkbox checked={billable} onChange={(event) => setBillable(event.target.checked)} />
            Billable to client
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!matterId || !description.trim() || !Number(amount)}>
              Add Expense
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function matchesTimeFilters(
  entry: TimeEntry,
  filters: TimeFilters,
  mattersById: Map<string, Matter>,
  clientsById: Map<string, Client>
) {
  const matter = mattersById.get(entry.matterId);
  const client = matter ? clientsById.get(matter.clientId) : undefined;
  const query = filters.query.trim().toLowerCase();
  const haystack = [entry.description, matter?.fileReference, matter ? getMatterTitle(matter) : "", client?.fullName].join(" ").toLowerCase();
  if (query && !haystack.includes(query)) return false;
  if (filters.clientId && matter?.clientId !== filters.clientId) return false;
  if (filters.matterId && entry.matterId !== filters.matterId) return false;
  if (filters.from && entry.date < filters.from) return false;
  if (filters.to && entry.date > filters.to) return false;
  if (filters.billable === "billable" && !entry.billable) return false;
  if (filters.billable === "non-billable" && entry.billable) return false;
  return true;
}

function matchesExpenseFilters(
  expense: ExpenseEntry,
  filters: ExpenseFilters,
  mattersById: Map<string, Matter>,
  clientsById: Map<string, Client>
) {
  const matter = mattersById.get(expense.matterId);
  const client = matter ? clientsById.get(matter.clientId) : undefined;
  const query = filters.query.trim().toLowerCase();
  const haystack = [expense.description, expense.receiptName, matter?.fileReference, matter ? getMatterTitle(matter) : "", client?.fullName].join(" ").toLowerCase();
  if (query && !haystack.includes(query)) return false;
  if (filters.clientId && matter?.clientId !== filters.clientId) return false;
  if (filters.matterId && expense.matterId !== filters.matterId) return false;
  if (filters.from && expense.date < filters.from) return false;
  if (filters.to && expense.date > filters.to) return false;
  if (filters.billable === "billable" && !expense.billable) return false;
  if (filters.billable === "non-billable" && expense.billable) return false;
  return true;
}

function buildFinancialSummary(invoices: Invoice[], unbilledTimeValue: number) {
  const baseSummary = getBillingSummary(invoices);
  const billedThisMonth = invoices
    .filter((invoice) => isCurrentMonth(invoice.invoiceDate))
    .reduce((total, invoice) => total + invoice.total, 0);
  const collectedThisMonth = baseSummary.paidThisMonthAmount;
  const outstandingSent = invoices
    .filter((invoice) => {
      const status = getInvoiceDisplayStatus(invoice);
      return status === "Sent" || status === "Overdue";
    })
    .reduce((total, invoice) => total + getInvoiceBalance(invoice), 0);
  return {
    billedThisMonth,
    collectedThisMonth,
    outstandingSent,
    overdue: baseSummary.overdueAmount,
    unbilledTimeValue
  };
}

function monthlyRevenueBars(invoices: Invoice[]) {
  const now = new Date();
  return Array.from({ length: 6 }).map((_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const label = month.toLocaleDateString("en-IE", { month: "short" });
    const value = invoices.reduce((total, invoice) => {
      const paymentTotal = (invoice.payments ?? [])
        .filter((payment) => sameMonth(payment.date, month))
        .reduce((sum, payment) => sum + payment.amount, 0);
      if (paymentTotal > 0) return total + paymentTotal;
      if (invoice.status === "Paid" && sameMonth(invoice.updatedAt || invoice.invoiceDate, month)) {
        return total + invoice.total;
      }
      return total;
    }, 0);
    return { label, value };
  });
}

function billedSourceIds(invoices: Invoice[], sourceType: "time" | "expense") {
  return new Set(
    invoices.flatMap((invoice) =>
      invoice.lineItems
        .filter((line) => line.sourceType === sourceType)
        .map((line) => line.sourceId)
    )
  );
}

function buildUnbilledInvoiceLines(
  matterId: string,
  timeEntries: TimeEntry[],
  expenses: ExpenseEntry[],
  billedTimeIds: Set<string>,
  billedExpenseIds: Set<string>
): InvoiceDraftLine[] {
  return [
    ...timeEntries
      .filter((entry) => entry.matterId === matterId && entry.billable && !billedTimeIds.has(entry.id))
      .map(({ id, ...entry }) => timeEntryToInvoiceDraftLine({ id, ...entry })),
    ...expenses
      .filter((expense) => expense.matterId === matterId && expense.billable && !billedExpenseIds.has(expense.id))
      .map(({ id, ...expense }) => expenseToInvoiceDraftLine({ id, ...expense }))
  ];
}

function timeEntryToInvoiceLine(entry: TimeEntry): InvoiceLine {
  return {
    id: makeLocalId("line"),
    ...timeEntryToInvoiceDraftLine(entry)
  };
}

function timeEntryToInvoiceDraftLine(entry: TimeEntry): InvoiceDraftLine {
  return {
    sourceType: "time",
    sourceId: entry.id,
    date: entry.date,
    description: entry.description,
    quantity: entry.durationHours,
    rate: entry.hourlyRate,
    amount: roundMoney(entry.durationHours * entry.hourlyRate)
  };
}

function expenseToInvoiceLine(expense: ExpenseEntry): InvoiceLine {
  return {
    id: makeLocalId("line"),
    ...expenseToInvoiceDraftLine(expense)
  };
}

function expenseToInvoiceDraftLine(expense: ExpenseEntry): InvoiceDraftLine {
  return {
    sourceType: "expense",
    sourceId: expense.id,
    date: expense.date,
    description: expense.description,
    quantity: 1,
    rate: expense.amount,
    amount: roundMoney(expense.amount)
  };
}

function updateDraftLineQuantity(
  _current: InvoiceDraftLine[],
  item: InvoiceDraftLine,
  itemIndex: number,
  targetIndex: number,
  quantity: number
) {
  if (itemIndex !== targetIndex) return item;
  return {
    ...item,
    quantity,
    amount: roundMoney(quantity * item.rate)
  };
}

function updateDraftLineRate(
  _current: InvoiceDraftLine[],
  item: InvoiceDraftLine,
  itemIndex: number,
  targetIndex: number,
  rate: number
) {
  if (itemIndex !== targetIndex) return item;
  return {
    ...item,
    rate,
    amount: roundMoney(item.quantity * rate)
  };
}

function invoiceTotalsForLines(lines: InvoiceDraftLine[] | InvoiceLine[], vatEnabled: boolean) {
  const subtotal = roundMoney(lines.reduce((total, line) => total + line.amount, 0));
  const vatAmount = vatEnabled ? roundMoney(subtotal * 0.23) : 0;
  return {
    subtotal,
    vatAmount,
    total: roundMoney(subtotal + vatAmount)
  };
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function startOfWeekInput(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return todayInput();
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return inputDate(date);
}

function weekDays(start: string) {
  const startDate = new Date(`${start}T00:00:00`);
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return inputDate(date);
  });
}

function shortDayLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IE", {
    weekday: "short",
    day: "2-digit"
  });
}

function inputDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function defaultDueDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return inputDate(date);
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const key = keyFn(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  });
  return map;
}

function isCurrentMonth(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function sameMonth(value: string, month: Date) {
  const date = new Date(value);
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function makeLocalId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function invoiceStatusVariant(status: InvoiceStatus) {
  if (status === "Paid") return "open";
  if (status === "Sent") return "progress";
  if (status === "Overdue") return "danger";
  return "default";
}
