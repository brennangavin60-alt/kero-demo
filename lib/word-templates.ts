import { getMatterTitle } from "@/lib/stages";
import { placeholderGuide, replacePlaceholders, type TemplateVariables } from "@/lib/templates";
import type { Client, Letter, Matter, WordTemplate } from "@/lib/types";
import { slugify } from "@/lib/utils";

type MammothBrowser = {
  convertToHtml: (
    input: { arrayBuffer: ArrayBuffer },
    options?: Record<string, unknown>
  ) => Promise<{ value: string; messages?: unknown[] }>;
  extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
};

type JsPdfConstructor = new (options: {
  orientation: "portrait";
  unit: "pt";
  format: "a4";
}) => {
  internal: {
    pageSize: {
      getWidth: () => number;
      getHeight: () => number;
    };
  };
  addImage: (
    imageData: string,
    format: "PNG",
    x: number,
    y: number,
    width: number,
    height: number
  ) => void;
  addPage: () => void;
  output: (type: "blob") => Blob;
  save: (fileName: string) => void;
};

declare global {
  interface Window {
    mammoth?: MammothBrowser;
    html2canvas?: (
      element: HTMLElement,
      options?: Record<string, unknown>
    ) => Promise<HTMLCanvasElement>;
    jspdf?: {
      jsPDF: JsPdfConstructor;
    };
  }
}

const scriptPromises = new Map<string, Promise<void>>();

export async function createWordTemplateFromFile(file: File): Promise<WordTemplate> {
  if (!file.name.toLowerCase().endsWith(".docx")) {
    throw new Error("Upload a Word .docx template.");
  }

  const mammoth = await loadMammoth();
  const arrayBuffer = await file.arrayBuffer();
  const [htmlResult, rawTextResult, dataUrl] = await Promise.all([
    mammoth.convertToHtml({ arrayBuffer }),
    mammoth.extractRawText({ arrayBuffer }),
    fileToDataUrl(file)
  ]);
  const previewHtml = htmlResult.value || paragraphHtml(rawTextResult.value);
  const extractedText = rawTextResult.value || htmlToText(previewHtml);

  return {
    kind: "docx",
    fileName: file.name,
    dataUrl,
    uploadedAt: new Date().toISOString(),
    previewHtml,
    extractedText,
    placeholders: extractPlaceholders(`${previewHtml}\n${extractedText}`),
    size: file.size
  };
}

export async function buildFilledWordTemplateHtml(
  template: WordTemplate,
  variables: TemplateVariables
) {
  const mammoth = await loadMammoth();
  const arrayBuffer = dataUrlToArrayBuffer(template.dataUrl);
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const sourceHtml = result.value || paragraphHtml(template.extractedText);
  return documentShell(replacePlaceholders(sourceHtml, variables), template.fileName);
}

export function highlightTemplatePlaceholders(html: string) {
  return html.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match) => {
    return `<mark class="rounded bg-amber-100 px-1 py-0.5 text-amber-900">${escapeHtml(match)}</mark>`;
  });
}

export function letterTextToHtml(letter: Letter) {
  return documentShell(
    `<pre style="white-space:pre-wrap;font-family:Georgia,serif;font-size:14px;line-height:1.65;color:#0f172a">${escapeHtml(letter.text)}</pre>`,
    letter.title
  );
}

export async function downloadHtmlAsPdf(html: string, fileName: string) {
  const pdf = await htmlToPdf(html);
  pdf.save(fileName);
}

export async function printHtmlAsPdf(html: string, fileName: string) {
  const pdf = await htmlToPdf(html);
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.addEventListener("load", () => win.print(), { once: true });
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function emailLetterWithGeneratedPdf({
  html,
  fileName,
  matter,
  client
}: {
  html: string;
  fileName: string;
  matter: Matter;
  client: Client;
}) {
  await downloadHtmlAsPdf(html, fileName);
  const subject = `Re: ${matter.fileReference} — ${getMatterTitle(matter)}`;
  const body = [
    "Dear Client,",
    "",
    "Please see the generated PDF letter downloaded from Kero. Attach the downloaded PDF to this email before sending.",
    "",
    "Kind regards"
  ].join("\n");
  window.location.href = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

export function pdfFileName(letter: Letter, matter: Matter, client: Client) {
  return `${slugify(letter.title)}-${slugify(matter.fileReference)}-${slugify(
    client.fullName
  )}.pdf`;
}

export function placeholderReferenceRows() {
  return placeholderGuide;
}

function documentShell(bodyHtml: string, title: string) {
  return `
    <article class="kero-word-document">
      <style>
        .kero-word-document {
          width: 794px;
          min-height: 1123px;
          box-sizing: border-box;
          background: #ffffff;
          color: #0f172a;
          padding: 72px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 14px;
          line-height: 1.55;
        }
        .kero-word-document h1,
        .kero-word-document h2,
        .kero-word-document h3 {
          font-family: Georgia, "Times New Roman", serif;
          color: #0f172a;
        }
        .kero-word-document table {
          border-collapse: collapse;
          width: 100%;
        }
        .kero-word-document td,
        .kero-word-document th {
          border: 1px solid #cbd5e1;
          padding: 6px;
          vertical-align: top;
        }
        .kero-word-document img {
          max-width: 100%;
        }
      </style>
      <div aria-label="${escapeHtml(title)}">${bodyHtml}</div>
    </article>
  `;
}

async function htmlToPdf(html: string) {
  const { html2canvas, jsPDF } = await loadPdfTools();
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "794px";
  host.style.background = "#ffffff";
  host.innerHTML = html;
  document.body.appendChild(host);

  try {
    const element = host.firstElementChild as HTMLElement;
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true
    });
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const sourcePageHeight = Math.floor((pageHeight * canvas.width) / pageWidth);
    let sourceY = 0;
    let pageIndex = 0;

    while (sourceY < canvas.height) {
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = Math.min(sourcePageHeight, canvas.height - sourceY);
      const context = pageCanvas.getContext("2d");
      if (!context) throw new Error("Could not prepare PDF canvas.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        pageCanvas.height,
        0,
        0,
        canvas.width,
        pageCanvas.height
      );
      if (pageIndex > 0) pdf.addPage();
      const imageHeight = (pageCanvas.height * pageWidth) / pageCanvas.width;
      pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", 0, 0, pageWidth, imageHeight);
      sourceY += sourcePageHeight;
      pageIndex += 1;
    }
    return pdf;
  } finally {
    host.remove();
  }
}

async function loadMammoth() {
  await loadScript("/vendor/mammoth.browser.min.js");
  if (!window.mammoth) throw new Error("Mammoth could not be loaded.");
  return window.mammoth;
}

async function loadPdfTools() {
  await Promise.all([
    loadScript("/vendor/html2canvas.min.js"),
    loadScript("/vendor/jspdf.umd.min.js")
  ]);
  if (!window.html2canvas || !window.jspdf?.jsPDF) {
    throw new Error("PDF tools could not be loaded.");
  }
  return {
    html2canvas: window.html2canvas,
    jsPDF: window.jspdf.jsPDF
  };
}

function loadScript(src: string) {
  const existing = scriptPromises.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
  scriptPromises.set(src, promise);
  return promise;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function dataUrlToArrayBuffer(dataUrl: string) {
  const [, base64 = ""] = dataUrl.split(",");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function extractPlaceholders(value: string) {
  return Array.from(
    new Set(
      Array.from(value.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)).map((match) => `{{${match[1]}}}`)
    )
  ).sort();
}

function paragraphHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function htmlToText(html: string) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element.textContent ?? "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
