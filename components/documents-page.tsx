"use client";

import { type FormEvent, useMemo, useState } from "react";
import {
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  Mail,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Send,
  Upload,
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
import { formatDisplayDate } from "@/lib/dates";
import { getMatterTitle } from "@/lib/stages";
import { useKeroStore } from "@/lib/storage";
import {
  getLetterCatalog,
  getLetters,
  makeLetterVariables,
  type LetterCatalogItem
} from "@/lib/templates";
import type { Client, Letter, LetterStatus, Matter, MatterType, WordTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  buildFilledWordTemplateHtml,
  createWordTemplateFromFile,
  downloadHtmlAsPdf,
  emailLetterWithGeneratedPdf,
  highlightTemplatePlaceholders,
  letterTextToHtml,
  pdfFileName,
  placeholderReferenceRows,
  printHtmlAsPdf
} from "@/lib/word-templates";

type MatterTypeFilter = "all" | MatterType;

type DocumentInstance = {
  matter: Matter;
  client: Client;
  letter: Letter;
  status: LetterStatus;
  generatedAt: string;
};

type LetterTypeRow = LetterCatalogItem & {
  defaultText: string;
  activeTemplate?: WordTemplate;
  instances: DocumentInstance[];
};

const matterGroups: Array<{ type: MatterType; label: string }> = [
  { type: "conveyancing", label: "Conveyancing Sale" },
  { type: "purchase", label: "Conveyancing Purchase" },
  { type: "litigation", label: "Litigation" },
  { type: "adhoc", label: "Ad Hoc" }
];

function documentKey(matterId: string, letterId: string) {
  return `${matterId}:${letterId}`;
}

export function DocumentsPage() {
  const {
    state,
    hydrated,
    setLetterStatus,
    setGlobalTemplate,
    clearGlobalTemplate,
    addCustomLetterTemplate
  } = useKeroStore();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [matterTypeFilter, setMatterTypeFilter] = useState<MatterTypeFilter>("all");
  const [customLetterOpen, setCustomLetterOpen] = useState(false);
  const [placeholderGuideOpen, setPlaceholderGuideOpen] = useState(false);

  const clientsById = useMemo(
    () => new Map(state.clients.map((client) => [client.id, client])),
    [state.clients]
  );

  const activeInstances = useMemo<DocumentInstance[]>(() => {
    return state.matters.flatMap((matter) => {
      const client = clientsById.get(matter.clientId);
      if (!client) return [];
      return getLetters(matter, client, state.settings, {
        globalTemplates: state.globalTemplates,
        customLetterTemplates: state.customLetterTemplates
      }).map((letter) => ({
        matter,
        client,
        letter,
        status: state.documentStatuses[documentKey(matter.id, letter.id)] ?? "Drafted",
        generatedAt: matter.dateOpened
      }));
    });
  }, [
    clientsById,
    state.customLetterTemplates,
    state.documentStatuses,
    state.globalTemplates,
    state.matters,
    state.settings
  ]);

  const defaultInstances = useMemo<DocumentInstance[]>(() => {
    return state.matters.flatMap((matter) => {
      const client = clientsById.get(matter.clientId);
      if (!client) return [];
      return getLetters(matter, client, state.settings, {
        globalTemplates: {},
        customLetterTemplates: state.customLetterTemplates
      }).map((letter) => ({
        matter,
        client,
        letter,
        status: "Drafted" as const,
        generatedAt: matter.dateOpened
      }));
    });
  }, [clientsById, state.customLetterTemplates, state.matters, state.settings]);

  const catalog = useMemo(
    () => getLetterCatalog(state.customLetterTemplates),
    [state.customLetterTemplates]
  );

  const rows = useMemo<LetterTypeRow[]>(() => {
    return catalog.map((item) => {
      const instances = activeInstances.filter(
        (instance) => instance.matter.type === item.matterType && instance.letter.id === item.id
      );
      const defaultInstance = defaultInstances.find(
        (instance) => instance.matter.type === item.matterType && instance.letter.id === item.id
      );
      return {
        ...item,
        defaultText:
          defaultInstance?.letter.text ??
          item.templateBody ??
          "This default template will preview once a matching matter exists.",
        activeTemplate: state.globalTemplates[item.id],
        instances
      };
    });
  }, [activeInstances, catalog, defaultInstances, state.globalTemplates]);

  const filteredRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesType = matterTypeFilter === "all" || row.matterType === matterTypeFilter;
      const matchesSearch = !search || row.title.toLowerCase().includes(search);
      return matchesType && matchesSearch;
    });
  }, [matterTypeFilter, query, rows]);

  const totalSent = activeInstances.filter((instance) => instance.status === "Sent").length;
  const totalWithCustomTemplates = rows.filter(
    (row) => Boolean(row.activeTemplate) || row.isCustomLetterType
  ).length;

  if (!hydrated) return <PageSkeleton rows={7} />;

  async function copyLetter(letter: Letter) {
    await navigator.clipboard.writeText(letter.text);
    toast("Letter copied");
  }

  async function htmlForInstance(instance: DocumentInstance) {
    const template =
      instance.matter.customTemplates[instance.letter.id] ??
      state.globalTemplates[instance.letter.id];
    if (!template) return letterTextToHtml(instance.letter);
    return buildFilledWordTemplateHtml(
      template,
      makeLetterVariables(instance.matter, instance.client, state.settings)
    );
  }

  async function emailLetter(instance: DocumentInstance) {
    try {
      await emailLetterWithGeneratedPdf({
        html: await htmlForInstance(instance),
        fileName: pdfFileName(instance.letter, instance.matter, instance.client),
        matter: instance.matter,
        client: instance.client
      });
      toast("PDF downloaded and email draft opened");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not prepare email draft");
    }
  }

  async function downloadLetter(instance: DocumentInstance) {
    try {
      await downloadHtmlAsPdf(
        await htmlForInstance(instance),
        pdfFileName(instance.letter, instance.matter, instance.client)
      );
      toast("PDF downloaded");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not download PDF");
    }
  }

  async function printLetterPdf(instance: DocumentInstance) {
    try {
      await printHtmlAsPdf(
        await htmlForInstance(instance),
        pdfFileName(instance.letter, instance.matter, instance.client)
      );
      toast("PDF print preview opened");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not print PDF");
    }
  }

  async function uploadTemplate(row: LetterTypeRow, file: File | undefined) {
    if (!file) return;
    try {
      const template = await createWordTemplateFromFile(file);
      setGlobalTemplate(row.id, template);
      toast(`${row.title} Word template saved globally`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not upload Word template");
    }
  }

  function restoreDefault(row: LetterTypeRow) {
    clearGlobalTemplate(row.id);
    toast(`${row.title} restored to built-in template`);
  }

  function markAsSent(instance: DocumentInstance) {
    setLetterStatus(instance.matter.id, instance.letter.id, "Sent", instance.letter.title);
    toast(`${instance.letter.title} marked as sent`);
  }

  function unmarkAsSent(instance: DocumentInstance) {
    setLetterStatus(instance.matter.id, instance.letter.id, "Drafted", instance.letter.title);
    toast(`${instance.letter.title} moved back to drafted`);
  }

  async function saveCustomLetter(input: {
    title: string;
    matterType: MatterType;
    body: string;
    templateFile?: File;
  }) {
    const wordTemplate = input.templateFile
      ? await createWordTemplateFromFile(input.templateFile)
      : undefined;
    const fallbackBody = input.body.trim() || wordTemplate?.extractedText.trim();

    if (!fallbackBody) {
      throw new Error("Add fallback text or upload a Word template with readable text.");
    }

    const customLetter = addCustomLetterTemplate({
      title: input.title,
      matterType: input.matterType,
      body: fallbackBody
    });

    if (wordTemplate) {
      setGlobalTemplate(customLetter.id, wordTemplate);
    }

    setCustomLetterOpen(false);
    toast(input.templateFile ? "Custom letter type and Word template added" : "Custom letter type added");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </span>
            <h1 className="text-3xl font-bold text-slate-950">Documents</h1>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Upload existing Word .docx letter templates with placeholders, then generate filled PDFs for each matter.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setCustomLetterOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Custom Letter Type
          </Button>
          <Button type="button" variant="outline" onClick={() => setPlaceholderGuideOpen(true)}>
            <FileText className="h-4 w-4" />
            Placeholder Guide
          </Button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <StatCard label="Total letters generated" value={activeInstances.length} />
        <StatCard label="Total sent" value={totalSent} />
        <StatCard label="With custom templates" value={totalWithCustomTemplates} />
      </section>

      <section className="surface-card p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-normal text-muted-foreground">
              Search letter type
            </span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by letter name"
                className="pl-9"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-normal text-muted-foreground">
              Matter type
            </span>
            <Select
              value={matterTypeFilter}
              onChange={(event) => setMatterTypeFilter(event.target.value as MatterTypeFilter)}
            >
              <option value="all">All matter types</option>
              {matterGroups.map((group) => (
                <option key={group.type} value={group.type}>
                  {group.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </section>

      {filteredRows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No matching letter types"
          description="Try another letter name or matter type filter."
          className="surface-card"
        />
      ) : (
        <div className="space-y-4">
          {matterGroups.map((group) => {
            const groupRows = filteredRows.filter((row) => row.matterType === group.type);
            if (groupRows.length === 0) return null;
            const generatedCount = groupRows.reduce(
              (total, row) => total + row.instances.length,
              0
            );

            return (
              <details key={group.type} open className="group surface-card overflow-hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
                  <span>
                    <span className="block text-base font-semibold text-slate-950">
                      {group.label}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {groupRows.length} letter types · {generatedCount} generated letters
                    </span>
                  </span>
                  <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                </summary>

                <div className="divide-y">
                  {groupRows.map((row) => (
                    <LetterTypePanel
                      key={`${row.matterType}-${row.id}`}
                      row={row}
                      onUpload={(file) => uploadTemplate(row, file)}
                      onRestore={() => restoreDefault(row)}
                      onCopy={(letter) => copyLetter(letter)}
                      onPrint={printLetterPdf}
                      onEmail={emailLetter}
                      onDownload={downloadLetter}
                      onMarkSent={markAsSent}
                      onUnmarkSent={unmarkAsSent}
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {customLetterOpen ? (
        <CustomLetterTypeModal
          onClose={() => setCustomLetterOpen(false)}
          onSave={saveCustomLetter}
        />
      ) : null}

      {placeholderGuideOpen ? (
        <PlaceholderGuideModal onClose={() => setPlaceholderGuideOpen(false)} />
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function LetterTypePanel({
  row,
  onUpload,
  onRestore,
  onCopy,
  onPrint,
  onEmail,
  onDownload,
  onMarkSent,
  onUnmarkSent
}: {
  row: LetterTypeRow;
  onUpload: (file: File | undefined) => void;
  onRestore: () => void;
  onCopy: (letter: Letter) => void;
  onPrint: (instance: DocumentInstance) => void;
  onEmail: (instance: DocumentInstance) => void;
  onDownload: (instance: DocumentInstance) => void;
  onMarkSent: (instance: DocumentInstance) => void;
  onUnmarkSent: (instance: DocumentInstance) => void;
}) {
  const hasCustomTemplate = Boolean(row.activeTemplate);

  return (
    <details className="group/letter">
      <summary className="grid cursor-pointer list-none gap-3 px-4 py-3 transition-colors duration-200 hover:bg-slate-50 lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-center">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="font-semibold text-slate-950">{row.title}</span>
            {hasCustomTemplate ? (
              <Badge variant="open">Custom Template Active</Badge>
            ) : null}
            {row.isCustomLetterType ? <Badge variant="navy">Custom Letter Type</Badge> : null}
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">
            {row.instances.length} generated client letters
          </span>
        </span>

        <span className="flex flex-wrap items-center gap-2 lg:justify-end">
          <label
            className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md border bg-white px-3 text-xs font-semibold shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted hover:shadow-elevated active:scale-[0.98]"
            onClick={(event) => event.stopPropagation()}
          >
            <Upload className="h-4 w-4" />
            Upload .docx
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(event) => {
                onUpload(event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {hasCustomTemplate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRestore();
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Restore Default
            </Button>
          ) : null}
          <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 group-open/letter:rotate-180" />
        </span>
      </summary>

      <div className="space-y-3 bg-slate-50/60 px-4 pb-4">
        <details className="rounded-md border bg-white">
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-slate-950">
            Built-in fallback preview
          </summary>
          <pre className="document-preview max-h-72 overflow-auto border-0 border-t p-3 whitespace-pre-wrap text-sm leading-6">
            {row.defaultText}
          </pre>
        </details>

        {hasCustomTemplate ? (
          <details className="rounded-md border bg-white">
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-slate-950">
              Uploaded Word template preview
            </summary>
            <div className="border-t p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="open">Custom Template Active</Badge>
                <span>{row.activeTemplate?.fileName}</span>
                <span>{formatDisplayDate(row.activeTemplate?.uploadedAt)}</span>
              </div>
              <div
                className="document-preview max-h-72 overflow-auto rounded-md border p-4 text-sm leading-6"
                dangerouslySetInnerHTML={{
                  __html: highlightTemplatePlaceholders(row.activeTemplate?.previewHtml ?? "")
                }}
              />
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                  Placeholders found
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(row.activeTemplate?.placeholders.length
                    ? row.activeTemplate.placeholders
                    : ["No placeholders detected"]).map((placeholder) => (
                    <Badge key={placeholder} variant="default">
                      {placeholder}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </details>
        ) : null}

        <div className="overflow-hidden rounded-md border bg-white">
          <div className="hidden grid-cols-[minmax(12rem,1fr)_9rem_9rem_20rem] gap-3 border-b bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground xl:grid">
            <span>Client / matter</span>
            <span>Generated</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {row.instances.length > 0 ? (
            <div className="divide-y">
              {row.instances.map((instance) => (
                <DocumentInstanceRow
                  key={`${instance.matter.id}-${instance.letter.id}`}
                  instance={instance}
                  onCopy={() => onCopy(instance.letter)}
                  onPrint={() => onPrint(instance)}
                  onEmail={() => onEmail(instance)}
                  onDownload={() => onDownload(instance)}
                  onMarkSent={() => onMarkSent(instance)}
                  onUnmarkSent={() => onUnmarkSent(instance)}
                />
              ))}
            </div>
          ) : (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              No current matters generate this letter yet.
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

function DocumentInstanceRow({
  instance,
  onCopy,
  onPrint,
  onEmail,
  onDownload,
  onMarkSent,
  onUnmarkSent
}: {
  instance: DocumentInstance;
  onCopy: () => void;
  onPrint: () => void;
  onEmail: () => void;
  onDownload: () => void;
  onMarkSent: () => void;
  onUnmarkSent: () => void;
}) {
  const sent = instance.status === "Sent";

  return (
    <div className="grid gap-3 px-3 py-3 text-sm transition-colors duration-200 hover:bg-slate-50 xl:grid-cols-[minmax(12rem,1fr)_9rem_9rem_20rem] xl:items-center">
      <div className="min-w-0">
        <div className="font-semibold text-slate-950">
          {instance.client.fullName}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {instance.matter.fileReference} · {getMatterTitle(instance.matter)}
        </p>
      </div>
      <span className="text-sm text-muted-foreground">
        {formatDisplayDate(instance.generatedAt)}
      </span>
      <span>
        <Badge variant={statusBadgeVariant(instance.status)}>{instance.status}</Badge>
      </span>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onPrint}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          <Clipboard className="h-4 w-4" />
          Copy
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onEmail}>
          <Mail className="h-4 w-4" />
          Email Draft
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDownload}>
          <Download className="h-4 w-4" />
          Download
        </Button>
        <Button
          type="button"
          variant={sent ? "secondary" : "success"}
          size="sm"
          onClick={sent ? onUnmarkSent : onMarkSent}
        >
          <Send className="h-4 w-4" />
          {sent ? "Unmark Sent" : "Mark Sent"}
        </Button>
      </div>
    </div>
  );
}

function PlaceholderGuideModal({ onClose }: { onClose: () => void }) {
  const rows = placeholderReferenceRows();
  return (
    <div className="modal-backdrop">
      <div className="modal-panel max-h-[90vh] max-w-4xl overflow-auto">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Word template placeholders</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Add these placeholders to your Word document before uploading it as a .docx template.
              Kero replaces them with matter, client, firm and date data when generating the PDF.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="overflow-hidden rounded-md border">
          <div className="grid grid-cols-[minmax(13rem,18rem)_minmax(0,1fr)] gap-3 border-b bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            <span>Placeholder</span>
            <span>Maps to</span>
          </div>
          <div className="divide-y bg-white">
            {rows.map((row) => (
              <div
                key={row.placeholder}
                className="grid grid-cols-[minmax(13rem,18rem)_minmax(0,1fr)] gap-3 px-3 py-2 text-sm"
              >
                <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-primary">
                  {row.placeholder}
                </code>
                <span className="text-slate-700">{row.description}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function CustomLetterTypeModal({
  onClose,
  onSave
}: {
  onClose: () => void;
  onSave: (input: {
    title: string;
    matterType: MatterType;
    body: string;
    templateFile?: File;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [matterType, setMatterType] = useState<MatterType>("conveyancing");
  const [body, setBody] = useState("");
  const [templateFile, setTemplateFile] = useState<File | undefined>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Add a letter type name before saving.");
      return;
    }
    if (!body.trim() && !templateFile) {
      setError("Add fallback text or upload a Word .docx template before saving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        title: title.trim(),
        matterType,
        body: body.trim(),
        templateFile
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save custom letter type.");
      setSaving(false);
    }
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
              Add custom letter type
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a reusable letter type and upload its formatted Word .docx template now, or add a plain fallback body.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <div>
              <Label htmlFor="custom-letter-title">Letter type name</Label>
              <Input
                id="custom-letter-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Undertaking request"
              />
            </div>
            <div>
              <Label htmlFor="custom-letter-type">Matter type</Label>
              <Select
                id="custom-letter-type"
                value={matterType}
                onChange={(event) => setMatterType(event.target.value as MatterType)}
              >
                {matterGroups.map((group) => (
                  <option key={group.type} value={group.type}>
                    {group.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-dashed border-primary/25 bg-primary/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Label htmlFor="custom-letter-template">Word template upload</Label>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Optional .docx template used globally for this custom letter type across all matters of the selected type.
                </p>
                {templateFile ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="open">Template selected</Badge>
                    <span className="font-semibold text-slate-800">{templateFile.name}</span>
                    <span className="text-muted-foreground">
                      {(templateFile.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 text-sm font-semibold text-slate-800 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-white hover:text-primary hover:shadow-elevated active:scale-[0.98]">
                  <Upload className="h-4 w-4" />
                  {templateFile ? "Change .docx" : "Upload .docx"}
                  <input
                    id="custom-letter-template"
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="sr-only"
                    onChange={(event) => {
                      setTemplateFile(event.currentTarget.files?.[0]);
                      setError("");
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {templateFile ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setTemplateFile(undefined)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="custom-letter-body">
              Fallback text body {templateFile ? "(optional)" : ""}
            </Label>
            <Textarea
              id="custom-letter-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Use placeholders like {{client_name}}, {{file_reference}} and {{matter_description}}."
              className="min-h-64"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              If left blank with a Word upload, Kero uses the readable text extracted from the .docx as the fallback preview.
            </p>
          </div>

          <div className="rounded-md border bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
              Common placeholders
            </p>
            <div className="flex flex-wrap gap-2">
              {placeholderReferenceRows().slice(0, 12).map((row) => (
                <button
                  key={row.placeholder}
                  type="button"
                  onClick={() =>
                    setBody((current) => `${current}${current ? " " : ""}${row.placeholder}`)
                  }
                  className="rounded-md border bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-soft transition hover:bg-muted"
                >
                  {row.placeholder}
                </button>
              ))}
            </div>
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              <Plus className="h-4 w-4" />
              {saving ? "Saving..." : "Save Letter Type"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function statusBadgeVariant(status: LetterStatus) {
  if (status === "Sent") return "open";
  if (status === "Awaiting Response") return "warning";
  return "default";
}
