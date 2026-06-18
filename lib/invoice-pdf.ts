import {
  formatCurrency,
  formatHours,
  getInvoiceBalance,
  getInvoicePaidAmount
} from "@/lib/billing";
import { formatDisplayDate } from "@/lib/dates";
import { SimplePdf } from "@/lib/matter-export";
import { getMatterTitle } from "@/lib/stages";
import type { Client, Invoice, Matter, Settings } from "@/lib/types";

type InvoicePdfInput = {
  invoice: Invoice;
  matter: Matter;
  client: Client;
  settings: Settings;
};

export function buildInvoicePdfBlob({ invoice, matter, client, settings }: InvoicePdfInput) {
  const firmName = settings.firmName || "Your firm";
  const pdf = new SimplePdf(`Invoice ${invoice.invoiceNumber}`, `${firmName} invoice`);

  pdf.startSection("Invoice");
  pdf.addTitle(firmName);
  pdf.addParagraph(
    [
      settings.firmAddress,
      settings.firmPhone ? `Phone: ${settings.firmPhone}` : "",
      settings.firmEmail ? `Email: ${settings.firmEmail}` : "",
      settings.firmWebsite ? `Website: ${settings.firmWebsite}` : "",
      settings.lawSocietyNumber ? `Law Society No: ${settings.lawSocietyNumber}` : "",
      settings.vatNumber ? `VAT No: ${settings.vatNumber}` : ""
    ]
      .filter(Boolean)
      .join("\n"),
    { size: 9.5 }
  );
  if (settings.solicitorName) {
    pdf.addText(
      `Solicitor: ${settings.solicitorTitle ? `${settings.solicitorTitle} ` : ""}${settings.solicitorName}`,
      { size: 9.5 }
    );
  }

  pdf.addGap(14);
  pdf.addKeyValues([
    ["Invoice number", invoice.invoiceNumber],
    ["Invoice date", formatDisplayDate(invoice.invoiceDate)],
    ["Payment due", formatDisplayDate(invoice.dueDate)],
    ["Matter reference", matter.fileReference],
    ["Matter", getMatterTitle(matter)],
    ["Client", client.fullName],
    ["Client address", client.address]
  ]);

  pdf.addGap(12);
  pdf.addSubheading("Line Items");
  if (invoice.lineItems.length === 0) {
    pdf.addText("No billable line items.", { color: [0.39, 0.45, 0.55] });
  } else {
    invoice.lineItems.forEach((line, index) => {
      if (index > 0) pdf.addDivider();
      pdf.addText(line.description, { font: "bold" });
      pdf.addText(
        [
          formatDisplayDate(line.date),
          `Type: ${line.sourceType === "time" ? "Time" : line.sourceType === "expense" ? "Expense" : "Fixed fee"}`,
          `Quantity: ${line.sourceType === "time" ? formatHours(line.quantity) : line.quantity.toLocaleString("en-IE")}`,
          `Rate: ${formatCurrency(line.rate)}`,
          `Amount: ${formatCurrency(line.amount)}`
        ].join(" | "),
        { size: 9.5 }
      );
    });
  }

  pdf.addGap(14);
  pdf.addSubheading("Totals");
  pdf.addKeyValues([
    ["Subtotal", formatCurrency(invoice.subtotal)],
    ["VAT at 23%", invoice.vatEnabled ? formatCurrency(invoice.vatAmount) : "Not applied"],
    ["Total", formatCurrency(invoice.total)],
    ["Paid", formatCurrency(getInvoicePaidAmount(invoice))],
    ["Outstanding balance", formatCurrency(getInvoiceBalance(invoice))]
  ]);

  const payments = invoice.payments ?? [];
  if (payments.length > 0) {
    pdf.addGap(10);
    pdf.addSubheading("Payments");
    payments.forEach((payment) => {
      pdf.addText(
        `${formatDisplayDate(payment.date)} | ${payment.method} | ${formatCurrency(payment.amount)}${payment.note ? ` | ${payment.note}` : ""}`
      );
    });
  }

  const bankLines = [
    settings.billing.bankName ? `Bank: ${settings.billing.bankName}` : "",
    settings.billing.iban ? `IBAN: ${settings.billing.iban}` : "",
    settings.billing.bic ? `BIC: ${settings.billing.bic}` : ""
  ].filter(Boolean);
  if (bankLines.length > 0) {
    pdf.addGap(10);
    pdf.addSubheading("Payment Details");
    pdf.addParagraph(bankLines.join("\n"));
  }

  return pdf.toBlob();
}

export function downloadInvoicePdf(input: InvoicePdfInput) {
  downloadBlob(buildInvoicePdfBlob(input), invoicePdfFileName(input.invoice, input.matter, input.client));
}

export function printInvoicePdf(input: InvoicePdfInput) {
  const blob = buildInvoicePdfBlob(input);
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, "_blank", "width=900,height=700");
  if (!printWindow) {
    URL.revokeObjectURL(url);
    return;
  }
  printWindow.addEventListener(
    "load",
    () => {
      printWindow.print();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
    { once: true }
  );
}

export function emailInvoiceWithPdf(input: InvoicePdfInput) {
  downloadInvoicePdf(input);
  const subject = `Invoice ${input.invoice.invoiceNumber} - ${input.matter.fileReference}`;
  const body = [
    `Dear ${input.client.fullName},`,
    "",
    "Please see the invoice prepared by our office.",
    "",
    "Kero has downloaded the invoice PDF. Attach the downloaded PDF to this email before sending.",
    "",
    "Kind regards"
  ].join("\n");
  window.location.href = `mailto:${encodeURIComponent(input.client.email)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

function invoicePdfFileName(invoice: Invoice, matter: Matter, client: Client) {
  return `${filePart(invoice.invoiceNumber)}-${filePart(matter.fileReference)}-${filePart(
    client.fullName
  )}.pdf`;
}

function filePart(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "Invoice"
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
