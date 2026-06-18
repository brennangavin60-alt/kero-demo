import { calendarEventTypeLabels, formatEventTime, timeKey } from "@/lib/calendar";
import {
  formatCurrency,
  formatHours,
  getExpenseTotals,
  getTimeTotals
} from "@/lib/billing";
import { formatDisplayDate, relativeTimestamp } from "@/lib/dates";
import { getAmlStatus } from "@/lib/templates";
import { getCurrentStage, getMatterTitle, MATTER_LABELS } from "@/lib/stages";
import type {
  CalendarEvent,
  Client,
  ExpenseEntry,
  Letter,
  LetterStatus,
  Matter,
  MatterChecklistItem,
  Settings,
  TimeEntry,
  TimelineEvent
} from "@/lib/types";

type MatterExportInput = {
  matter: Matter;
  client: Client;
  settings: Settings;
  letters: Letter[];
  documentStatuses: Record<string, LetterStatus>;
  documentSentAt: Record<string, string>;
  timeEntries: TimeEntry[];
  expenses: ExpenseEntry[];
  matterChecklistItems: MatterChecklistItem[];
  calendarEvents: CalendarEvent[];
  timelineEvents: TimelineEvent[];
};

type TextOptions = {
  size?: number;
  font?: "regular" | "bold";
  color?: [number, number, number];
  lineHeight?: number;
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 54;
const contentWidth = pageWidth - margin * 2;
const navy: [number, number, number] = [0.05, 0.12, 0.22];
const muted: [number, number, number] = [0.39, 0.45, 0.55];
const body: [number, number, number] = [0.08, 0.12, 0.18];

export function exportMatterPdf(input: MatterExportInput) {
  const pdf = new SimplePdf(`${input.matter.fileReference} Matter Export`);
  const exportedAt = relativeTimestamp(new Date().toISOString());
  const firmName = input.settings.firmName || "Kero";

  pdf.startSection("Matter Summary");
  pdf.addTitle(`${input.matter.fileReference} - Matter Export`);
  pdf.addText(`${firmName}${input.settings.solicitorName ? ` | ${input.settings.solicitorName}` : ""}`, {
    color: muted
  });
  pdf.addText(`Generated: ${exportedAt}`, { color: muted });
  pdf.addGap(14);
  pdf.addKeyValues([
    ["File reference", input.matter.fileReference],
    ["Client", input.client.fullName],
    ["Matter type", MATTER_LABELS[input.matter.type]],
    ["Matter title", getMatterTitle(input.matter)],
    ["Current stage", getCurrentStage(input.matter)],
    ["Status", input.matter.status],
    ["Date opened", formatDisplayDate(input.matter.dateOpened)],
    ["Last updated", relativeTimestamp(input.matter.updatedAt)]
  ]);

  pdf.startSection("Client Contact Details");
  pdf.addKeyValues([
    ["Name", input.client.fullName],
    ["Address", input.client.address],
    ["Phone", input.client.phone],
    ["Email", input.client.email],
    ["PPS number", input.client.ppsNumber || "Not recorded"],
    ["Date of birth", formatDisplayDate(input.client.dateOfBirth) || "Not recorded"]
  ]);

  pdf.startSection("Generated Letters");
  if (input.letters.length === 0) {
    pdf.addText("No generated letters are available for this matter.", { color: muted });
  } else {
    input.letters.forEach((letter, index) => {
      const key = documentKey(input.matter.id, letter.id);
      const status = input.documentStatuses[key] ?? "Drafted";
      const sentAt = input.documentSentAt[key];
      if (index > 0) pdf.addDivider();
      pdf.addSubheading(letter.title);
      pdf.addText(
        `Status: ${status}${sentAt ? ` | Sent: ${relativeTimestamp(sentAt)}` : ""}`,
        { color: muted, size: 9.5 }
      );
      pdf.addGap(6);
      pdf.addParagraph(letter.text);
    });
  }

  pdf.startSection("Time Log and Totals");
  const timeTotals = getTimeTotals(input.timeEntries);
  const expenseTotals = getExpenseTotals(input.expenses);
  pdf.addKeyValues([
    ["Total hours logged", formatHours(timeTotals.totalHours)],
    ["Total billable hours", formatHours(timeTotals.billableHours)],
    ["Total billable amount", formatCurrency(timeTotals.billableAmount)],
    ["Billable expenses", formatCurrency(expenseTotals.billable)]
  ]);
  pdf.addGap(10);
  if (input.timeEntries.length === 0) {
    pdf.addText("No time entries logged.", { color: muted });
  } else {
    input.timeEntries
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((entry) => {
        pdf.addSubheading(`${formatDisplayDate(entry.date)} - ${entry.description || "Time entry"}`);
        pdf.addText(
          [
            `Duration: ${formatHours(entry.durationHours)}`,
            `Rate: ${formatCurrency(entry.hourlyRate)}`,
            `Amount: ${formatCurrency(entry.durationHours * entry.hourlyRate)}`,
            `Billable: ${entry.billable ? "Yes" : "No"}`
          ].join(" | ")
        );
      });
  }
  if (input.expenses.length > 0) {
    pdf.addGap(12);
    pdf.addSubheading("Expenses");
    input.expenses
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((expense) => {
        pdf.addText(
          `${formatDisplayDate(expense.date)} - ${expense.description} | ${formatCurrency(expense.amount)} | Billable: ${expense.billable ? "Yes" : "No"}`
        );
      });
  }

  pdf.startSection("Notes");
  const notes = input.matter.notes
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  if (notes.length === 0) {
    pdf.addText("No notes recorded.", { color: muted });
  } else {
    notes.forEach((note) => {
      pdf.addSubheading(relativeTimestamp(note.createdAt));
      pdf.addParagraph(note.body);
    });
  }

  pdf.startSection("AML Checklist Status");
  pdf.addKeyValues([
    ["AML status", getAmlStatus(input.matter.aml)],
    ["Photo ID received", input.matter.aml.photoIdReceived ? "Yes" : "No"],
    ["Proof of address received", input.matter.aml.proofOfAddressReceived ? "Yes" : "No"],
    ["Source of funds received", input.matter.aml.sourceOfFundsReceived ? "Yes" : "No"],
    ["AML verified", input.matter.aml.verified ? "Yes" : "No"]
  ]);

  pdf.startSection("Matter Checklist");
  if (input.matterChecklistItems.length === 0) {
    pdf.addText("No matter checklist items recorded.", { color: muted });
  } else {
    input.matterChecklistItems.forEach((item) => {
      pdf.addText(
        [
          item.completedAt ? "Completed" : "Outstanding",
          item.label,
          item.completedAt ? `Ticked: ${relativeTimestamp(item.completedAt)}` : "",
          item.custom ? "Custom" : ""
        ]
          .filter(Boolean)
          .join(" | ")
      );
    });
  }

  pdf.startSection("Key Dates");
  pdf.addKeyValues(getMatterKeyDates(input.matter));
  const linkedEvents = input.calendarEvents
    .slice()
    .sort((a, b) => {
      const dateOrder = a.date.localeCompare(b.date);
      if (dateOrder !== 0) return dateOrder;
      return (timeKey(a.time) || "23:59").localeCompare(timeKey(b.time) || "23:59");
    });
  if (linkedEvents.length > 0) {
    pdf.addGap(10);
    pdf.addSubheading("Linked calendar events");
    linkedEvents.forEach((event) => {
      pdf.addText(
        `${formatDisplayDate(event.date)} ${formatEventTime(event.time)} - ${event.title} (${calendarEventTypeLabels[event.type]})`
      );
      if (event.notes) pdf.addParagraph(event.notes, { size: 9.5, color: muted });
    });
  }

  pdf.startSection("Matter Timeline");
  const timeline = input.timelineEvents
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (timeline.length === 0) {
    pdf.addText("No timeline events recorded.", { color: muted });
  } else {
    timeline.forEach((event) => {
      pdf.addSubheading(relativeTimestamp(event.createdAt));
      pdf.addParagraph(`${event.description}\nPerformed by: ${event.actorName || "Solicitor"}`);
    });
  }

  downloadBlob(pdf.toBlob(), exportFileName(input.matter, input.client));
}

function getMatterKeyDates(matter: Matter): Array<[string, string]> {
  if (matter.type === "conveyancing") {
    return [
      ["Date opened", formatDisplayDate(matter.dateOpened)],
      ["Expected closing date", formatDisplayDate(matter.fields.closingDate) || "Not recorded"]
    ];
  }

  if (matter.type === "purchase") {
    return [
      ["Date opened", formatDisplayDate(matter.dateOpened)],
      ["Expected closing date", formatDisplayDate(matter.fields.closingDate) || "Not recorded"]
    ];
  }

  if (matter.type === "litigation") {
    return [
      ["Date opened", formatDisplayDate(matter.dateOpened)],
      ["Date dispute arose", formatDisplayDate(matter.fields.dateDisputeArose) || "Not recorded"],
      ["Limitation date", formatDisplayDate(matter.fields.limitationDate) || "Not recorded"]
    ];
  }

  return [
    ["Date opened", formatDisplayDate(matter.dateOpened)],
    ["Review deadline", "To be agreed"]
  ];
}

function documentKey(matterId: string, letterId: string) {
  return `${matterId}:${letterId}`;
}

function exportFileName(matter: Matter, client: Client) {
  const surname = client.fullName.trim().split(/\s+/).pop() || client.fullName || "Matter";
  return `${filePart(matter.fileReference)}-${filePart(surname)}-Export.pdf`;
}

function filePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-") || "Matter";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export class SimplePdf {
  private pages: string[][] = [];
  private y = pageHeight - margin;
  private currentSection = "";
  private pageHasBody = false;

  constructor(
    private readonly title: string,
    private readonly subtitle = "Kero matter export"
  ) {}

  startSection(title: string) {
    this.currentSection = title;
    this.addPage();
    this.addHeading(title);
  }

  addTitle(text: string) {
    this.addText(text, { size: 18, font: "bold", color: navy, lineHeight: 23 });
  }

  addHeading(text: string) {
    this.ensureSpace(52);
    this.addText(text, { size: 16, font: "bold", color: navy, lineHeight: 22 });
    this.addRule();
    this.addGap(8);
  }

  addSubheading(text: string) {
    this.ensureSpace(30);
    this.addGap(4);
    this.addText(text, { size: 11.5, font: "bold", color: navy, lineHeight: 15 });
  }

  addKeyValues(rows: Array<[string, string]>) {
    rows.forEach(([label, value]) => {
      this.addParagraph(`${label}: ${value || "Not recorded"}`, { lineHeight: 15 });
    });
  }

  addParagraph(text: string, options: TextOptions = {}) {
    const paragraphs = (text || "").split(/\r?\n/);
    paragraphs.forEach((paragraph, index) => {
      if (index > 0 && !paragraph.trim()) {
        this.addGap(5);
        return;
      }
      const lines = wrapText(paragraph || " ", contentWidth, options.size ?? 10.5);
      lines.forEach((line) => this.addText(line, options));
      if (index < paragraphs.length - 1) this.addGap(4);
    });
  }

  addText(text: string, options: TextOptions = {}) {
    const size = options.size ?? 10.5;
    const lineHeight = options.lineHeight ?? size + 4;
    this.ensureSpace(lineHeight);
    const font = options.font === "bold" ? "F2" : "F1";
    const color = options.color ?? body;
    this.ops.push(`${pdfColor(color)} rg`);
    this.ops.push(`BT /${font} ${size.toFixed(2)} Tf ${margin.toFixed(2)} ${this.y.toFixed(2)} Td (${pdfText(text)}) Tj ET`);
    this.y -= lineHeight;
    this.pageHasBody = true;
  }

  addDivider() {
    this.addGap(10);
    this.addRule([0.82, 0.86, 0.91]);
    this.addGap(10);
  }

  addGap(points: number) {
    this.ensureSpace(points);
    this.y -= points;
  }

  toBlob() {
    const pdf = this.buildPdf();
    const bytes = new Uint8Array(pdf.length);
    for (let index = 0; index < pdf.length; index += 1) {
      bytes[index] = pdf.charCodeAt(index) & 0xff;
    }
    return new Blob([bytes], { type: "application/pdf" });
  }

  private get ops() {
    if (this.pages.length === 0) this.addPage();
    return this.pages[this.pages.length - 1];
  }

  private addPage() {
    this.pages.push([]);
    this.y = pageHeight - margin;
    this.pageHasBody = false;
    this.addPageHeader();
  }

  private addPageHeader() {
    this.ops.push(`${pdfColor(navy)} rg`);
    this.ops.push(`BT /F2 10 Tf ${margin.toFixed(2)} ${(pageHeight - 34).toFixed(2)} Td (${pdfText(this.title)}) Tj ET`);
    this.ops.push(`${pdfColor(muted)} rg`);
    this.ops.push(`BT /F1 8.5 Tf ${margin.toFixed(2)} ${(pageHeight - 49).toFixed(2)} Td (${pdfText(this.subtitle)}) Tj ET`);
    this.ops.push(`${pdfColor([0.82, 0.86, 0.91])} RG 0.5 w ${margin.toFixed(2)} ${(pageHeight - 62).toFixed(2)} m ${(pageWidth - margin).toFixed(2)} ${(pageHeight - 62).toFixed(2)} l S`);
    this.y = pageHeight - 84;
  }

  private addRule(color: [number, number, number] = [0.7, 0.76, 0.84]) {
    this.ensureSpace(8);
    this.ops.push(`${pdfColor(color)} RG 0.8 w ${margin.toFixed(2)} ${this.y.toFixed(2)} m ${(pageWidth - margin).toFixed(2)} ${this.y.toFixed(2)} l S`);
    this.y -= 8;
  }

  private ensureSpace(points: number) {
    if (this.y - points >= margin + 30) return;
    this.addPage();
    if (this.currentSection && this.pageHasBody === false) {
      this.addText(`${this.currentSection} (continued)`, {
        size: 13,
        font: "bold",
        color: navy,
        lineHeight: 18
      });
      this.addRule();
      this.addGap(6);
    }
  }

  private buildPdf() {
    const objects: string[] = [];
    const pageObjectIds: number[] = [];
    const catalogId = 1;
    const pagesId = 2;
    const fontRegularId = 3;
    const fontBoldId = 4;
    let nextObjectId = 5;

    setObject(objects, catalogId, "<< /Type /Catalog /Pages 2 0 R >>");
    setObject(objects, fontRegularId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    setObject(objects, fontBoldId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

    this.pages.forEach((pageOps, index) => {
      pageOps.push(`${pdfColor(muted)} rg`);
      pageOps.push(`BT /F1 8.5 Tf ${(pageWidth - margin - 74).toFixed(2)} 28 Td (${pdfText(`Page ${index + 1} of ${this.pages.length}`)}) Tj ET`);
      const stream = pageOps.join("\n");
      const contentId = nextObjectId;
      nextObjectId += 1;
      setObject(
        objects,
        contentId,
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
      );
      const pageId = nextObjectId;
      nextObjectId += 1;
      setObject(
        objects,
        pageId,
        [
          "<< /Type /Page",
          `/Parent ${pagesId} 0 R`,
          `/MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}]`,
          `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >>`,
          `/Contents ${contentId} 0 R`,
          ">>"
        ].join("\n")
      );
      pageObjectIds.push(pageId);
    });

    setObject(
      objects,
      pagesId,
      `<< /Type /Pages /Kids [${pageObjectIds
        .map((id) => `${id} 0 R`)
        .join(" ")}] /Count ${pageObjectIds.length} >>`
    );

    const orderedObjects = objects.slice(1);
    const header = "%PDF-1.4\n";
    let bodyText = header;
    const offsets = [0];
    orderedObjects.forEach((object) => {
      offsets.push(bodyText.length);
      bodyText += object;
    });
    const xrefOffset = bodyText.length;
    bodyText += `xref\n0 ${orderedObjects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
      bodyText += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    bodyText += `trailer\n<< /Size ${orderedObjects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return bodyText;
  }
}

function setObject(objects: string[], id: number, bodyText: string) {
  objects[id] = `${id} 0 obj\n${bodyText}\nendobj\n`;
}

function wrapText(text: string, width: number, size: number) {
  const maxChars = Math.max(18, Math.floor(width / (size * 0.52)));
  const words = cleanPdfText(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const parts = splitLongWord(word, maxChars);
    parts.forEach((part) => {
      const next = current ? `${current} ${part}` : part;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = part;
      } else {
        current = next;
      }
    });
  });

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function splitLongWord(word: string, maxChars: number) {
  if (word.length <= maxChars) return [word];
  const parts: string[] = [];
  for (let index = 0; index < word.length; index += maxChars) {
    parts.push(word.slice(index, index + maxChars));
  }
  return parts;
}

function pdfText(value: string) {
  return cleanPdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function cleanPdfText(value: string) {
  return String(value ?? "")
    .replace(/€/g, "EUR")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function pdfColor([r, g, b]: [number, number, number]) {
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}
