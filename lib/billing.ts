import { formatDisplayDate } from "@/lib/dates";
import { getMatterTitle } from "@/lib/stages";
import type { Client, ExpenseEntry, Invoice, InvoiceStatus, Matter, Settings, TimeEntry } from "@/lib/types";

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR"
});

export function formatCurrency(value: number) {
  return currency.format(Number(value) || 0);
}

export function formatHours(value: number) {
  const hours = Number(value) || 0;
  return `${hours.toLocaleString("en-IE", {
    minimumFractionDigits: hours % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })}h`;
}

export function getTimeTotals(entries: TimeEntry[]) {
  const totalHours = entries.reduce((total, entry) => total + entry.durationHours, 0);
  const billableEntries = entries.filter((entry) => entry.billable);
  const billableHours = billableEntries.reduce((total, entry) => total + entry.durationHours, 0);
  const billableAmount = billableEntries.reduce(
    (total, entry) => total + entry.durationHours * entry.hourlyRate,
    0
  );
  return { totalHours, billableHours, billableAmount };
}

export function getExpenseTotals(expenses: ExpenseEntry[]) {
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const billable = expenses
    .filter((expense) => expense.billable)
    .reduce((sum, expense) => sum + expense.amount, 0);
  return { total, billable };
}

export function getInvoicePaidAmount(invoice: Invoice) {
  return (invoice.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
}

export function getInvoiceBalance(invoice: Invoice) {
  return Math.max(0, invoice.total - getInvoicePaidAmount(invoice));
}

export function getInvoiceDisplayStatus(invoice: Invoice): InvoiceStatus {
  if (invoice.status === "Paid" || getInvoiceBalance(invoice) <= 0) return "Paid";
  if (invoice.status === "Overdue") return "Overdue";
  const due = new Date(`${invoice.dueDate}T23:59:59`);
  if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return "Overdue";
  return invoice.status;
}

export function getBillingSummary(invoices: Invoice[]) {
  const paidThisMonthAmount = invoices.reduce((sum, invoice) => {
    const monthPayments = (invoice.payments ?? []).filter((payment) => {
      const date = new Date(payment.date);
      const now = new Date();
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
    if (monthPayments.length > 0) {
      return sum + monthPayments.reduce((paymentSum, payment) => paymentSum + payment.amount, 0);
    }
    if (invoice.status !== "Paid") return sum;
    const date = new Date(invoice.updatedAt || invoice.invoiceDate);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
      ? sum + invoice.total
      : sum;
  }, 0);
  const paidThisMonthCount = invoices.filter((invoice) => {
    if ((invoice.payments ?? []).some((payment) => {
      const date = new Date(payment.date);
      const now = new Date();
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    })) return true;
    if (invoice.status !== "Paid") return false;
    const date = new Date(invoice.updatedAt || invoice.invoiceDate);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).length;
  const overdue = invoices.filter((invoice) => getInvoiceDisplayStatus(invoice) === "Overdue");
  const outstanding = invoices.filter((invoice) => getInvoiceDisplayStatus(invoice) !== "Paid");

  return {
    outstandingCount: outstanding.length,
    outstandingAmount: outstanding.reduce((sum, invoice) => sum + getInvoiceBalance(invoice), 0),
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((sum, invoice) => sum + getInvoiceBalance(invoice), 0),
    paidThisMonthCount,
    paidThisMonthAmount
  };
}

export function buildInvoiceText({
  invoice,
  matter,
  client,
  settings
}: {
  invoice: Invoice;
  matter: Matter;
  client: Client;
  settings: Settings;
}) {
  const firmLines = [
    settings.firmName || "Your firm",
    settings.firmAddress,
    settings.firmPhone ? `Phone: ${settings.firmPhone}` : "",
    settings.firmEmail ? `Email: ${settings.firmEmail}` : "",
    settings.lawSocietyNumber ? `Law Society No: ${settings.lawSocietyNumber}` : "",
    settings.vatNumber ? `VAT No: ${settings.vatNumber}` : ""
  ].filter(Boolean);
  const bankLines = [
    settings.billing.bankName ? `Bank: ${settings.billing.bankName}` : "",
    settings.billing.iban ? `IBAN: ${settings.billing.iban}` : "",
    settings.billing.bic ? `BIC: ${settings.billing.bic}` : ""
  ].filter(Boolean);
  const solicitorLine = settings.solicitorName
    ? `Solicitor: ${settings.solicitorTitle ? `${settings.solicitorTitle} ` : ""}${settings.solicitorName}`
    : "";

  const lineItems = invoice.lineItems
    .map((line) => {
      const quantity =
        line.sourceType === "time" ? formatHours(line.quantity) : `${line.quantity}`;
      return [
        formatDisplayDate(line.date),
        line.description,
        `Qty: ${quantity}`,
        `Rate: ${formatCurrency(line.rate)}`,
        `Amount: ${formatCurrency(line.amount)}`
      ].join(" | ");
    })
    .join("\n");

  return [
    firmLines.join("\n"),
    solicitorLine,
    "",
    "INVOICE",
    `Invoice number: ${invoice.invoiceNumber}`,
    `Invoice date: ${formatDisplayDate(invoice.invoiceDate)}`,
    `Payment due: ${formatDisplayDate(invoice.dueDate)}`,
    `Matter reference: ${matter.fileReference}`,
    `Matter: ${getMatterTitle(matter)}`,
    "",
    "Bill To",
    client.fullName,
    client.address,
    "",
    "Itemised billable work",
    lineItems || "No billable line items.",
    "",
    `Subtotal: ${formatCurrency(invoice.subtotal)}`,
    invoice.vatEnabled ? `VAT at 23%: ${formatCurrency(invoice.vatAmount)}` : "VAT: Not applied",
    `Total amount due: ${formatCurrency(invoice.total)}`,
    "",
    bankLines.length > 0 ? "Payment details" : "",
    bankLines.join("\n"),
    "",
    (invoice.payments ?? []).length > 0 ? "Payments received" : "",
    ...(invoice.payments ?? []).map((payment) =>
      `${formatDisplayDate(payment.date)} | ${payment.method} | ${formatCurrency(payment.amount)}${payment.note ? ` | ${payment.note}` : ""}`
    ),
    (invoice.payments ?? []).length > 0
      ? `Outstanding balance: ${formatCurrency(getInvoiceBalance(invoice))}`
      : ""
  ]
    .filter((line, index, lines) => line || lines[index - 1] !== "")
    .join("\n");
}
