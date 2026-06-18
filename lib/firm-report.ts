import { formatCurrency, getInvoicePaidAmount } from "@/lib/billing";
import { SimplePdf } from "@/lib/matter-export";
import { MATTER_LABELS } from "@/lib/stages";
import type { Client, FirmActivityLogEntry, Invoice, Matter, Settings } from "@/lib/types";

type FirmReportInput = {
  settings: Settings;
  matters: Matter[];
  clients: Client[];
  invoices: Invoice[];
  activity: FirmActivityLogEntry[];
  lettersGenerated: number;
  hoursSaved: number;
  hoursSavedValue: number;
  keroAiActions: number;
  voiceConversations: number;
  conflictChecks: number;
};

export function exportFirmMonthlyReport(input: FirmReportInput) {
  const now = new Date();
  const monthLabel = now.toLocaleString("en-IE", { month: "long", year: "numeric" });
  const firmName = input.settings.firmName || "Your firm";
  const pdf = new SimplePdf(`${firmName} Firm Report`, `Kero firm report - ${monthLabel}`);

  const openedThisMonth = input.matters.filter((matter) => isCurrentMonth(matter.dateOpened));
  const closedThisMonth = input.matters.filter(
    (matter) => matter.status === "Closed" && isCurrentMonth(matter.updatedAt)
  );
  const revenueBilled = input.invoices
    .filter((invoice) => isCurrentMonth(invoice.invoiceDate))
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const revenueCollected = input.invoices.reduce((sum, invoice) => {
    const payments = (invoice.payments ?? []).filter((payment) => isCurrentMonth(payment.date));
    return sum + payments.reduce((paymentSum, payment) => paymentSum + payment.amount, 0);
  }, 0);
  const newClients = input.clients.filter((client) =>
    input.matters.some((matter) => matter.clientId === client.id && isCurrentMonth(matter.dateOpened))
  );

  pdf.startSection("Monthly Summary");
  pdf.addTitle(`${firmName} - ${monthLabel}`);
  pdf.addParagraph(
    [
      input.settings.firmAddress,
      input.settings.lawSocietyNumber ? `Law Society No: ${input.settings.lawSocietyNumber}` : "",
      input.settings.vatNumber ? `VAT No: ${input.settings.vatNumber}` : ""
    ]
      .filter(Boolean)
      .join("\n"),
    { size: 9.5 }
  );
  pdf.addGap(12);
  pdf.addKeyValues([
    ["Matters opened", `${openedThisMonth.length} this month / ${input.matters.length} all time`],
    ["Matters closed", `${closedThisMonth.length} this month / ${input.matters.filter((matter) => matter.status === "Closed").length} all time`],
    ["Revenue billed", formatCurrency(revenueBilled)],
    ["Revenue collected", formatCurrency(revenueCollected)],
    ["Letters generated", String(input.lettersGenerated)],
    ["Kero AI actions", String(input.keroAiActions)],
    ["Voice conversations", String(input.voiceConversations)],
    ["Conflict checks", String(input.conflictChecks)],
    ["Estimated hours saved", `${input.hoursSaved.toFixed(1)}h`],
    ["Estimated value saved", formatCurrency(input.hoursSavedValue)]
  ]);

  pdf.startSection("Matters By Type");
  (["conveyancing", "purchase", "litigation", "adhoc"] as const).forEach((type) => {
    const typedMatters = input.matters.filter((matter) => matter.type === type);
    const closed = typedMatters.filter((matter) => matter.status === "Closed");
    pdf.addText(`${MATTER_LABELS[type]}: ${typedMatters.length} total, ${closed.length} closed`);
  });

  pdf.startSection("Financials");
  const totalBilled = input.invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const totalCollected = input.invoices.reduce(
    (sum, invoice) => sum + getInvoicePaidAmount(invoice),
    0
  );
  pdf.addKeyValues([
    ["Total billed all time", formatCurrency(totalBilled)],
    ["Total collected all time", formatCurrency(totalCollected)],
    ["Outstanding", formatCurrency(Math.max(0, totalBilled - totalCollected))],
    [
      "Average invoice value",
      formatCurrency(input.invoices.length ? totalBilled / input.invoices.length : 0)
    ]
  ]);

  pdf.startSection("Team Activity");
  input.activity.slice(0, 60).forEach((entry) => {
    pdf.addText(`${displayDateTime(entry.createdAt)} | ${entry.actorName} | ${entry.actionType}`);
    pdf.addParagraph(entry.description, { size: 9.5 });
  });

  downloadBlob(pdf.toBlob(), reportFileName(now));
}

function isCurrentMonth(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function reportFileName(date: Date) {
  const month = date.toLocaleString("en-IE", { month: "long" });
  return `Kero-Firm-Report-${month}-${date.getFullYear()}.pdf`;
}

function displayDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IE", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
