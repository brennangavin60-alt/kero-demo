"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageSkeleton } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_SETTINGS, KERO_AI_VOICE_OPTIONS, mergeSettings } from "@/lib/settings";
import { useKeroStore } from "@/lib/storage";
import type { MatterType, QuickNoteTemplateScope, Settings } from "@/lib/types";

const matterTypes: Array<{ value: MatterType; label: string }> = [
  { value: "conveyancing", label: "Conveyancing Sale" },
  { value: "purchase", label: "Conveyancing Purchase" },
  { value: "litigation", label: "Litigation" },
  { value: "adhoc", label: "Ad Hoc" }
];

const quickNoteScopes: Array<[QuickNoteTemplateScope, string]> = [
  ["all", "All Matter Types"],
  ["conveyancing", "Conveyancing Sale"],
  ["purchase", "Conveyancing Purchase"],
  ["litigation", "Litigation"],
  ["adhoc", "Ad Hoc"]
];

const dashboardWidgets: Array<{
  key: keyof Settings["dashboard"]["widgets"];
  label: string;
}> = [
  { key: "activeMatters", label: "Active Matters count" },
  { key: "mattersByType", label: "Matters by Type breakdown" },
  { key: "urgentMatters", label: "Urgent Matters" },
  { key: "recentActivity", label: "Recent Activity feed" },
  { key: "recentlyViewed", label: "Recently Viewed matters" },
  { key: "amlOutstanding", label: "AML Outstanding" },
  { key: "lettersSent", label: "Letters Sent summary" },
  { key: "stageDistribution", label: "Stage distribution chart" },
  { key: "billingSummary", label: "Billing summary" },
  { key: "calendarEvents", label: "Upcoming Events calendar widget" }
];

type SettingsSectionResetKey =
  | "firmDetails"
  | "dashboard"
  | "matterDefaults"
  | "quickNotes"
  | "letterDefaults"
  | "billing"
  | "keroAi"
  | "notifications"
  | "appearance";

const sectionResetCopy: Record<
  SettingsSectionResetKey,
  { title: string; items: string[] }
> = {
  firmDetails: {
    title: "Firm Details",
    items: [
      "Firm name, address, phone, email and website",
      "Solicitor name and title",
      "Law Society registration number",
      "VAT number"
    ]
  },
  dashboard: {
    title: "Dashboard Customisation",
    items: [
      "Dashboard widget toggles",
      "Default dashboard view",
      "Default matter sort order",
      "Demo/sample data visibility"
    ]
  },
  matterDefaults: {
    title: "Matter Defaults",
    items: [
      "Default matter type",
      "File reference prefix",
      "AML mandatory before stage advance"
    ]
  },
  quickNotes: {
    title: "Quick Note Templates",
    items: ["All custom quick note templates"]
  },
  letterDefaults: {
    title: "Letter & Document Defaults",
    items: [
      "Default sign-off text",
      "Default closing line",
      "Auto-generate letters setting",
      "Default download format"
    ]
  },
  billing: {
    title: "Time & Billing Defaults",
    items: [
      "Default hourly rate",
      "Invoice prefix",
      "Payment terms",
      "Bank details",
      "Default VAT setting"
    ]
  },
  keroAi: {
    title: "Kero AI Settings",
    items: [
      "Floating Kero AI button setting",
      "Kero AI action permission",
      "Kero AI voice",
      "Default opening message"
    ]
  },
  notifications: {
    title: "Notifications & Alerts",
    items: [
      "Limitation date warnings",
      "AML incomplete warnings",
      "Stage inactivity alerts",
      "Warning periods and inactivity days"
    ]
  },
  appearance: {
    title: "Appearance",
    items: ["Theme", "Accent colour"]
  }
};

export function SettingsForm() {
  const { state, updateSettings, hydrated } = useKeroStore();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Settings>(mergeSettings(state.settings));
  const [resetOpen, setResetOpen] = useState(false);
  const [sectionResetKey, setSectionResetKey] = useState<SettingsSectionResetKey | null>(null);
  const [newQuickNoteText, setNewQuickNoteText] = useState("");
  const [newQuickNoteScope, setNewQuickNoteScope] = useState<QuickNoteTemplateScope>("all");
  const selectedKeroAiVoice =
    KERO_AI_VOICE_OPTIONS.find((voice) => voice.value === draft.keroAi.voice) ??
    KERO_AI_VOICE_OPTIONS[0];

  useEffect(() => {
    if (hydrated) setDraft(mergeSettings(state.settings));
  }, [hydrated, state.settings]);

  if (!hydrated) return <PageSkeleton rows={8} />;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateSettings(mergeSettings(draft));
    toast("Settings saved");
  }

  function confirmReset() {
    const resetSettings = resetPreferenceSettings(draft);
    setDraft(resetSettings);
    updateSettings(resetSettings);
    setResetOpen(false);
    toast("Settings reset to defaults");
  }

  function confirmSectionReset() {
    if (!sectionResetKey) return;
    const resetSettings = resetSettingsSection(draft, sectionResetKey);
    setDraft(resetSettings);
    updateSettings(resetSettings);
    toast(`${sectionResetCopy[sectionResetKey].title} reset to defaults`);
    setSectionResetKey(null);
  }

  function addCustomQuickNoteTemplate() {
    const text = newQuickNoteText.trim();
    if (!text) return;
    setDraft((current) => ({
      ...current,
      quickNotes: {
        ...current.quickNotes,
        customTemplates: [
          ...current.quickNotes.customTemplates,
          {
            id: makeQuickNoteTemplateId(),
            matterType: newQuickNoteScope,
            text
          }
        ]
      }
    }));
    setNewQuickNoteText("");
  }

  function removeCustomQuickNoteTemplate(templateId: string) {
    setDraft((current) => ({
      ...current,
      quickNotes: {
        ...current.quickNotes,
        customTemplates: current.quickNotes.customTemplates.filter(
          (template) => template.id !== templateId
        )
      }
    }));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Settings</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Configure firm details, workflows, documents, Kero AI, alerts and appearance.
        </p>
      </div>

      <form onSubmit={save} className="space-y-5">
        <SettingsSection
          title="Firm Details"
          description="Used automatically in generated letters and future invoice surfaces."
          onReset={() => setSectionResetKey("firmDetails")}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Firm name" value={draft.firmName} onChange={(firmName) => setDraft((current) => ({ ...current, firmName }))} required />
            <TextField label="Solicitor name" value={draft.solicitorName} onChange={(solicitorName) => setDraft((current) => ({ ...current, solicitorName }))} required />
            <TextField label="Solicitor title" value={draft.solicitorTitle} onChange={(solicitorTitle) => setDraft((current) => ({ ...current, solicitorTitle }))} placeholder="Mr, Ms, Dr" />
            <TextField label="Firm phone" value={draft.firmPhone} onChange={(firmPhone) => setDraft((current) => ({ ...current, firmPhone }))} />
            <TextField label="Firm email" value={draft.firmEmail} onChange={(firmEmail) => setDraft((current) => ({ ...current, firmEmail }))} />
            <TextField label="Website" value={draft.firmWebsite} onChange={(firmWebsite) => setDraft((current) => ({ ...current, firmWebsite }))} />
            <TextField label="Law Society registration number" value={draft.lawSocietyNumber} onChange={(lawSocietyNumber) => setDraft((current) => ({ ...current, lawSocietyNumber }))} />
            <TextField label="VAT number" value={draft.vatNumber} onChange={(vatNumber) => setDraft((current) => ({ ...current, vatNumber }))} />
            <div className="grid gap-2 md:col-span-2">
              <Label>Firm address</Label>
              <Textarea
                value={draft.firmAddress}
                onChange={(event) => setDraft((current) => ({ ...current, firmAddress: event.target.value }))}
                required
              />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Dashboard Customisation"
          onReset={() => setSectionResetKey("dashboard")}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dashboardWidgets.map((widget) => (
              <ToggleRow
                key={widget.key}
                label={widget.label}
                checked={draft.dashboard.widgets[widget.key]}
                onChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    dashboard: {
                      ...current.dashboard,
                      widgets: { ...current.dashboard.widgets, [widget.key]: checked }
                    }
                  }))
                }
              />
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <SelectField
              label="Default dashboard view"
              value={draft.dashboard.defaultView}
              onChange={(defaultView) =>
                setDraft((current) => ({
                  ...current,
                  dashboard: { ...current.dashboard, defaultView: defaultView as Settings["dashboard"]["defaultView"] }
                }))
              }
              options={[
                ["summary", "Summary"],
                ["detailed", "Detailed"]
              ]}
            />
            <SelectField
              label="Default matter sort order"
              value={draft.dashboard.defaultMatterSort}
              onChange={(defaultMatterSort) =>
                setDraft((current) => ({
                  ...current,
                  dashboard: { ...current.dashboard, defaultMatterSort: defaultMatterSort as Settings["dashboard"]["defaultMatterSort"] }
                }))
              }
              options={[
                ["dateOpened", "Date Opened"],
                ["clientName", "Client Name"],
                ["stage", "Stage"],
                ["matterType", "Matter Type"]
              ]}
            />
          </div>
          <div className="mt-3">
            <ToggleRow
              label="Show demo/sample data controls"
              checked={draft.dashboard.showDemoData}
              onChange={(showDemoData) =>
                setDraft((current) => ({
                  ...current,
                  dashboard: { ...current.dashboard, showDemoData }
                }))
              }
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Matter Defaults"
          onReset={() => setSectionResetKey("matterDefaults")}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Default matter type"
              value={draft.matterDefaults.defaultMatterType}
              onChange={(defaultMatterType) =>
                setDraft((current) => ({
                  ...current,
                  matterDefaults: {
                    ...current.matterDefaults,
                    defaultMatterType: defaultMatterType as MatterType
                  }
                }))
              }
              options={matterTypes.map((item) => [item.value, item.label])}
            />
            <TextField
              label="File reference prefix"
              value={draft.matterDefaults.fileReferencePrefix}
              onChange={(fileReferencePrefix) =>
                setDraft((current) => ({
                  ...current,
                  matterDefaults: { ...current.matterDefaults, fileReferencePrefix }
                }))
              }
              placeholder="KER"
            />
          </div>
          <div className="mt-3">
            <ToggleRow
              label="AML checklist mandatory before advancing stage"
              checked={draft.matterDefaults.amlMandatoryBeforeStageAdvance}
              onChange={(amlMandatoryBeforeStageAdvance) =>
                setDraft((current) => ({
                  ...current,
                  matterDefaults: { ...current.matterDefaults, amlMandatoryBeforeStageAdvance }
                }))
              }
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Quick Note Templates"
          description="Create reusable note sentences that appear as buttons above the notes box on matter pages."
          onReset={() => setSectionResetKey("quickNotes")}
        >
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-end">
            <SelectField
              label="Show for"
              value={newQuickNoteScope}
              onChange={(scope) => setNewQuickNoteScope(scope as QuickNoteTemplateScope)}
              options={quickNoteScopes}
            />
            <TextField
              label="Template sentence"
              value={newQuickNoteText}
              onChange={setNewQuickNoteText}
              placeholder="Awaiting signed authority from client"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addCustomQuickNoteTemplate}
              disabled={!newQuickNoteText.trim()}
              className="lg:mb-0"
            >
              <Plus className="h-4 w-4" />
              Add Template
            </Button>
          </div>

          <div className="mt-4 grid gap-2">
            {draft.quickNotes.customTemplates.length === 0 ? (
              <div className="rounded-md border border-dashed bg-slate-50 px-4 py-6 text-sm text-muted-foreground">
                No custom quick note templates yet.
              </div>
            ) : (
              draft.quickNotes.customTemplates.map((template) => (
                <div
                  key={template.id}
                  className="flex flex-col gap-3 rounded-md border bg-white px-3 py-3 shadow-soft sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-950">
                      {template.text}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {quickNoteScopeLabel(template.matterType)}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => removeCustomQuickNoteTemplate(template.id)}
                    className="shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              ))
            )}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Letter & Document Defaults"
          onReset={() => setSectionResetKey("letterDefaults")}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Default sign-off text"
              value={draft.letterDefaults.signOffText}
              onChange={(signOffText) =>
                setDraft((current) => ({
                  ...current,
                  letterDefaults: { ...current.letterDefaults, signOffText }
                }))
              }
            />
            <SelectField
              label="Default download format"
              value={draft.letterDefaults.defaultDownloadFormat}
              onChange={(defaultDownloadFormat) =>
                setDraft((current) => ({
                  ...current,
                  letterDefaults: {
                    ...current.letterDefaults,
                    defaultDownloadFormat: defaultDownloadFormat as Settings["letterDefaults"]["defaultDownloadFormat"]
                  }
                }))
              }
              options={[
                ["pdf", "PDF"]
              ]}
            />
            <div className="grid gap-2 md:col-span-2">
              <Label>Default closing line before sign-off</Label>
              <Textarea
                value={draft.letterDefaults.closingLine}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    letterDefaults: { ...current.letterDefaults, closingLine: event.target.value }
                  }))
                }
              />
            </div>
          </div>
          <div className="mt-3">
            <ToggleRow
              label="Letters auto-generated on matter creation"
              checked={draft.letterDefaults.autoGenerateLetters}
              onChange={(autoGenerateLetters) =>
                setDraft((current) => ({
                  ...current,
                  letterDefaults: { ...current.letterDefaults, autoGenerateLetters }
                }))
              }
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Time & Billing Defaults"
          description="Used for matter time entries and generated invoices."
          onReset={() => setSectionResetKey("billing")}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Default hourly rate"
              value={String(draft.billing.defaultHourlyRate)}
              onChange={(defaultHourlyRate) =>
                setDraft((current) => ({
                  ...current,
                  billing: {
                    ...current.billing,
                    defaultHourlyRate: Number(defaultHourlyRate) || 0
                  }
                }))
              }
              type="number"
            />
            <TextField
              label="Invoice prefix"
              value={draft.billing.invoicePrefix}
              onChange={(invoicePrefix) =>
                setDraft((current) => ({
                  ...current,
                  billing: { ...current.billing, invoicePrefix }
                }))
              }
              placeholder="INV"
            />
            <TextField
              label="Payment terms days"
              value={String(draft.billing.defaultPaymentTermsDays)}
              onChange={(defaultPaymentTermsDays) =>
                setDraft((current) => ({
                  ...current,
                  billing: {
                    ...current.billing,
                    defaultPaymentTermsDays: Number(defaultPaymentTermsDays) || 1
                  }
                }))
              }
              type="number"
            />
            <TextField
              label="Bank name"
              value={draft.billing.bankName}
              onChange={(bankName) =>
                setDraft((current) => ({
                  ...current,
                  billing: { ...current.billing, bankName }
                }))
              }
            />
            <TextField
              label="IBAN"
              value={draft.billing.iban}
              onChange={(iban) =>
                setDraft((current) => ({
                  ...current,
                  billing: { ...current.billing, iban }
                }))
              }
            />
            <TextField
              label="BIC"
              value={draft.billing.bic}
              onChange={(bic) =>
                setDraft((current) => ({
                  ...current,
                  billing: { ...current.billing, bic }
                }))
              }
            />
          </div>
          <div className="mt-3">
            <ToggleRow
              label="Apply VAT at 23% by default on invoices"
              checked={draft.billing.vatEnabledByDefault}
              onChange={(vatEnabledByDefault) =>
                setDraft((current) => ({
                  ...current,
                  billing: { ...current.billing, vatEnabledByDefault }
                }))
              }
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Kero AI Settings"
          onReset={() => setSectionResetKey("keroAi")}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <ToggleRow
              label="Floating Kero AI button"
              checked={draft.keroAi.floatingButtonEnabled}
              onChange={(floatingButtonEnabled) =>
                setDraft((current) => ({
                  ...current,
                  keroAi: { ...current.keroAi, floatingButtonEnabled }
                }))
              }
            />
            <ToggleRow
              label="Allow Kero AI to propose actions"
              checked={draft.keroAi.canPerformActions}
              onChange={(canPerformActions) =>
                setDraft((current) => ({
                  ...current,
                  keroAi: { ...current.keroAi, canPerformActions }
                }))
              }
            />
          </div>
          <div className="mt-4 grid gap-2">
            <Label>Kero AI voice</Label>
            <Select
              value={draft.keroAi.voice}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  keroAi: {
                    ...current.keroAi,
                    voice: event.target.value as Settings["keroAi"]["voice"]
                  }
                }))
              }
            >
              {KERO_AI_VOICE_OPTIONS.map((voice) => (
                <option key={voice.value} value={voice.value}>
                  {voice.label} {voice.description}
                </option>
              ))}
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              {selectedKeroAiVoice.label} {selectedKeroAiVoice.description}. Applies when starting a new Voice Mode session.
            </p>
          </div>
          <div className="mt-4 grid gap-2">
            <Label>Kero AI default opening message</Label>
            <Textarea
              value={draft.keroAi.openingMessage}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  keroAi: { ...current.keroAi, openingMessage: event.target.value }
                }))
              }
              placeholder="Leave blank to use Kero's personalised default."
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Notifications & Alerts"
          onReset={() => setSectionResetKey("notifications")}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <ToggleRow
              label="Limitation date warnings"
              checked={draft.notifications.limitationWarnings}
              onChange={(limitationWarnings) =>
                setDraft((current) => ({
                  ...current,
                  notifications: { ...current.notifications, limitationWarnings }
                }))
              }
            />
            <ToggleRow
              label="AML incomplete warnings on dashboard"
              checked={draft.notifications.amlIncompleteWarnings}
              onChange={(amlIncompleteWarnings) =>
                setDraft((current) => ({
                  ...current,
                  notifications: { ...current.notifications, amlIncompleteWarnings }
                }))
              }
            />
            <ToggleRow
              label="Stage inactivity alerts"
              checked={draft.notifications.stageInactivityAlerts}
              onChange={(stageInactivityAlerts) =>
                setDraft((current) => ({
                  ...current,
                  notifications: { ...current.notifications, stageInactivityAlerts }
                }))
              }
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <SelectField
              label="Limitation warning lead time"
              value={String(draft.notifications.limitationWarningMonths)}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    limitationWarningMonths: Number(value) as 1 | 2 | 3 | 6
                  }
                }))
              }
              options={[
                ["1", "1 month"],
                ["2", "2 months"],
                ["3", "3 months"],
                ["6", "6 months"]
              ]}
            />
            <TextField
              label="Stage inactivity days"
              value={String(draft.notifications.stageInactivityDays)}
              onChange={(stageInactivityDays) =>
                setDraft((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    stageInactivityDays: Number(stageInactivityDays) || 1
                  }
                }))
              }
              type="number"
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Appearance"
          onReset={() => setSectionResetKey("appearance")}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Theme"
              value={draft.appearance.theme}
              onChange={(theme) =>
                setDraft((current) => ({
                  ...current,
                  appearance: { ...current.appearance, theme: theme as Settings["appearance"]["theme"] }
                }))
              }
              options={[
                ["light", "Light"],
                ["dark", "Dark"]
              ]}
            />
            <SelectField
              label="Accent colour"
              value={draft.appearance.accentColor}
              onChange={(accentColor) =>
                setDraft((current) => ({
                  ...current,
                  appearance: {
                    ...current.appearance,
                    accentColor: accentColor as Settings["appearance"]["accentColor"]
                  }
                }))
              }
              options={[
                ["navy", "Navy"],
                ["green", "Green"],
                ["burgundy", "Burgundy"],
                ["slate", "Slate"]
              ]}
            />
          </div>
        </SettingsSection>

        <div className="sticky bottom-4 flex flex-col gap-2 rounded-md bg-slate-50/90 py-2 backdrop-blur sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => setResetOpen(true)}>
            <RotateCcw className="h-4 w-4" />
            Reset to Default
          </Button>
          <Button type="submit" className="shadow-elevated">
            <Save className="h-4 w-4" />
            Save Settings
          </Button>
        </div>
      </form>

      {resetOpen ? (
        <ResetDefaultsModal
          title="Reset settings to defaults?"
          description="Are you sure you want to reset settings to default? This will reset only preferences and configuration. Matter and client data will not be changed."
          resetItems={overallResetItems}
          confirmLabel="Reset to Defaults"
          footerNote="Not reset: firm details, solicitor details, default hourly rate, bank details, invoice details, matters, clients, notes, documents, timeline, calendar, time, billing, or Kero AI chat history."
          onConfirm={confirmReset}
          onCancel={() => setResetOpen(false)}
        />
      ) : null}
      {sectionResetKey ? (
        <ResetDefaultsModal
          title={`Reset ${sectionResetCopy[sectionResetKey].title} to defaults?`}
          description={`Are you sure you want to reset ${sectionResetCopy[sectionResetKey].title.toLowerCase()} to default? Only this settings section will be changed.`}
          resetItems={sectionResetCopy[sectionResetKey].items}
          confirmLabel="Reset Section"
          footerNote="Matter, client, document, timeline, calendar, time, billing and Kero AI chat data will not be deleted."
          onConfirm={confirmSectionReset}
          onCancel={() => setSectionResetKey(null)}
        />
      ) : null}
    </div>
  );
}

const overallResetItems = [
  "Dashboard widget toggles",
  "Default dashboard view",
  "Default matter sort order",
  "Default matter type",
  "Letter sign-off text",
  "Default closing line before sign-off",
  "Kero AI toggles",
  "Kero AI voice",
  "Notification preferences",
  "Appearance settings",
  "Stage inactivity alert days",
  "Limitation warning period"
];

function resetPreferenceSettings(settings: Settings): Settings {
  return mergeSettings({
    ...settings,
    dashboard: {
      ...settings.dashboard,
      widgets: DEFAULT_SETTINGS.dashboard.widgets,
      defaultView: DEFAULT_SETTINGS.dashboard.defaultView,
      defaultMatterSort: DEFAULT_SETTINGS.dashboard.defaultMatterSort
    },
    matterDefaults: {
      ...settings.matterDefaults,
      defaultMatterType: DEFAULT_SETTINGS.matterDefaults.defaultMatterType
    },
    letterDefaults: {
      ...settings.letterDefaults,
      signOffText: DEFAULT_SETTINGS.letterDefaults.signOffText,
      closingLine: DEFAULT_SETTINGS.letterDefaults.closingLine
    },
    keroAi: {
      ...settings.keroAi,
      floatingButtonEnabled: DEFAULT_SETTINGS.keroAi.floatingButtonEnabled,
      canPerformActions: DEFAULT_SETTINGS.keroAi.canPerformActions,
      voice: DEFAULT_SETTINGS.keroAi.voice
    },
    notifications: DEFAULT_SETTINGS.notifications,
    appearance: DEFAULT_SETTINGS.appearance
  });
}

function resetSettingsSection(
  settings: Settings,
  sectionKey: SettingsSectionResetKey
): Settings {
  const nextSettings = { ...settings };
  if (sectionKey === "firmDetails") {
    return mergeSettings({
      ...nextSettings,
      firmName: DEFAULT_SETTINGS.firmName,
      firmAddress: DEFAULT_SETTINGS.firmAddress,
      firmPhone: DEFAULT_SETTINGS.firmPhone,
      firmEmail: DEFAULT_SETTINGS.firmEmail,
      firmWebsite: DEFAULT_SETTINGS.firmWebsite,
      solicitorName: DEFAULT_SETTINGS.solicitorName,
      solicitorTitle: DEFAULT_SETTINGS.solicitorTitle,
      lawSocietyNumber: DEFAULT_SETTINGS.lawSocietyNumber,
      vatNumber: DEFAULT_SETTINGS.vatNumber
    });
  }
  if (sectionKey === "dashboard") {
    return mergeSettings({ ...nextSettings, dashboard: DEFAULT_SETTINGS.dashboard });
  }
  if (sectionKey === "matterDefaults") {
    return mergeSettings({ ...nextSettings, matterDefaults: DEFAULT_SETTINGS.matterDefaults });
  }
  if (sectionKey === "quickNotes") {
    return mergeSettings({ ...nextSettings, quickNotes: DEFAULT_SETTINGS.quickNotes });
  }
  if (sectionKey === "letterDefaults") {
    return mergeSettings({ ...nextSettings, letterDefaults: DEFAULT_SETTINGS.letterDefaults });
  }
  if (sectionKey === "billing") {
    return mergeSettings({ ...nextSettings, billing: DEFAULT_SETTINGS.billing });
  }
  if (sectionKey === "keroAi") {
    return mergeSettings({ ...nextSettings, keroAi: DEFAULT_SETTINGS.keroAi });
  }
  if (sectionKey === "notifications") {
    return mergeSettings({ ...nextSettings, notifications: DEFAULT_SETTINGS.notifications });
  }
  return mergeSettings({ ...nextSettings, appearance: DEFAULT_SETTINGS.appearance });
}

function ResetDefaultsModal({
  title,
  description,
  resetItems,
  confirmLabel,
  footerNote,
  onConfirm,
  onCancel
}: {
  title: string;
  description: string;
  resetItems: string[];
  confirmLabel: string;
  footerNote?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-panel max-w-lg">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-md border bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-950">The following will be reset:</p>
          <ul className="mt-3 grid gap-2 text-sm text-slate-700">
            {resetItems.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {footerNote ? (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {footerNote}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
  onReset
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onReset?: () => void;
}) {
  return (
    <section className="surface-card p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {onReset ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReset}
            className="shrink-0"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Section
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-soft transition hover:bg-slate-50">
      <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function makeQuickNoteTemplateId() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `quick_note_${random}`;
}

function quickNoteScopeLabel(scope: QuickNoteTemplateScope) {
  return quickNoteScopes.find(([value]) => value === scope)?.[1] ?? "All Matter Types";
}
