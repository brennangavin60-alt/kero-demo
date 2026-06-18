"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Home, KeyRound, MessageSquareWarning, SearchX, Sparkles, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EmptyState, PageSkeleton } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/toast-provider";
import { todayInput } from "@/lib/dates";
import { useKeroStore } from "@/lib/storage";
import type {
  AdHocFields,
  ConveyancingFields,
  Client,
  DisputeType,
  LitigationFields,
  MatterType,
  NewClientInput,
  PurchaseFields
} from "@/lib/types";
import { cn } from "@/lib/utils";

const disputeTypes: DisputeType[] = [
  "Neighbour Dispute",
  "Debt Recovery",
  "Contract Dispute",
  "Employment Dispute",
  "Property Dispute",
  "General Civil Dispute"
];

const matterOptions: Array<{
  type: MatterType;
  title: string;
  icon: typeof Home;
}> = [
  { type: "conveyancing", title: "Conveyancing — House Sale", icon: Home },
  { type: "purchase", title: "Conveyancing — House Purchase", icon: KeyRound },
  { type: "litigation", title: "Litigation — Dispute Resolution", icon: MessageSquareWarning },
  { type: "adhoc", title: "Ad Hoc Matter", icon: Sparkles }
];

const intakeSteps = ["Matter type", "Client details", "Matter details", "Create file"];

type ClientMode = "existing" | "new";

const emptyClient: NewClientInput = {
  fullName: "",
  address: "",
  phone: "",
  email: "",
  ppsNumber: "",
  dateOfBirth: ""
};

const emptyConveyancing: ConveyancingFields = {
  propertyAddress: "",
  salePrice: "",
  buyerName: "",
  buyerSolicitorName: "",
  buyerSolicitorAddress: "",
  auctioneerName: "",
  mortgageHolder: "",
  closingDate: ""
};

const emptyPurchase: PurchaseFields = {
  propertyAddress: "",
  purchasePrice: "",
  vendorName: "",
  vendorSolicitorName: "",
  vendorSolicitorAddress: "",
  mortgageLender: "",
  closingDate: ""
};

const emptyLitigation: Omit<LitigationFields, "limitationDate"> = {
  disputeType: "General Civil Dispute",
  disputeDescription: "",
  opponentName: "",
  opponentAddress: "",
  opponentSolicitor: "",
  claimValue: "",
  dateDisputeArose: todayInput()
};

const emptyAdhoc: AdHocFields = {
  matterDescription: "",
  thirdPartyName: "",
  thirdPartyAddress: ""
};

function clientToInput(existingClient: Client): NewClientInput {
  return {
    id: existingClient.id,
    fullName: existingClient.fullName,
    address: existingClient.address,
    phone: existingClient.phone,
    email: existingClient.email,
    ppsNumber: existingClient.ppsNumber,
    dateOfBirth: existingClient.dateOfBirth
  };
}

export function NewMatterForm({ initialClientId = "" }: { initialClientId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, hydrated, createMatter } = useKeroStore();
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<MatterType>("conveyancing");
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [clientMode, setClientMode] = useState<ClientMode>("new");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [appliedInitialClientId, setAppliedInitialClientId] = useState("");
  const [fileReference, setFileReference] = useState("");
  const [referenceEdited, setReferenceEdited] = useState(false);
  const [client, setClient] = useState<NewClientInput>(emptyClient);
  const [conveyancing, setConveyancing] = useState<ConveyancingFields>(emptyConveyancing);
  const [purchase, setPurchase] = useState<PurchaseFields>(emptyPurchase);
  const [litigation, setLitigation] =
    useState<Omit<LitigationFields, "limitationDate">>(emptyLitigation);
  const [adhoc, setAdhoc] = useState<AdHocFields>(emptyAdhoc);
  const [submitting, setSubmitting] = useState(false);
  const requestedClientId = searchParams.get("clientId") ?? initialClientId;

  const nextReference = useMemo(() => {
    const prefix = state.settings.matterDefaults.fileReferencePrefix || "KER";
    const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i");
    const next =
      state.matters.reduce((max, matter) => {
        const match = matter.fileReference.match(pattern);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0) + 1;
    return `${prefix}-${String(next).padStart(3, "0")}`;
  }, [state.matters, state.settings.matterDefaults.fileReferencePrefix]);

  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) return state.clients;

    return state.clients.filter((existingClient) =>
      [
        existingClient.fullName,
        existingClient.email,
        existingClient.phone,
        existingClient.address,
        existingClient.ppsNumber
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [clientSearch, state.clients]);

  const selectedExistingClient = useMemo(
    () => state.clients.find((item) => item.id === selectedClientId),
    [selectedClientId, state.clients]
  );

  useEffect(() => {
    if (!referenceEdited) setFileReference(nextReference);
  }, [nextReference, referenceEdited]);

  useEffect(() => {
    if (!hydrated || defaultsApplied || requestedClientId) return;
    setSelectedType(state.settings.matterDefaults.defaultMatterType);
    setDefaultsApplied(true);
  }, [defaultsApplied, hydrated, requestedClientId, state.settings.matterDefaults.defaultMatterType]);

  useEffect(() => {
    if (!hydrated || !requestedClientId || appliedInitialClientId === requestedClientId) return;

    const existingClient = state.clients.find((item) => item.id === requestedClientId);
    if (!existingClient) return;

    setClientMode("existing");
    setSelectedClientId(existingClient.id);
    setClientSearch("");
    setClient(clientToInput(existingClient));
    setAppliedInitialClientId(requestedClientId);
  }, [appliedInitialClientId, hydrated, requestedClientId, state.clients]);

  function selectExistingClient(clientId: string) {
    setSelectedClientId(clientId);

    const existingClient = state.clients.find((item) => item.id === clientId);
    if (!existingClient) {
      setClient(emptyClient);
      return;
    }

    setClientSearch(existingClient.fullName);
    setClient(clientToInput(existingClient));
  }

  function chooseExistingClient() {
    setClientMode("existing");
    if (selectedClientId) {
      selectExistingClient(selectedClientId);
      return;
    }
    setClient(emptyClient);
  }

  function chooseNewClient() {
    setClientMode("new");
    setSelectedClientId("");
    setClientSearch("");
    setClient(emptyClient);
  }

  async function submitMatter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      const requestedFileReference = fileReference.trim() || nextReference;
      const duplicateReference = state.matters.some(
        (matter) =>
          matter.fileReference.trim().toLowerCase() === requestedFileReference.toLowerCase()
      );

      if (duplicateReference) {
        toast(`${requestedFileReference} is already in use`);
        return;
      }

      if (selectedType === "adhoc") {
        const research = await fetchResearch(adhoc.matterDescription);
        const matter = createMatter({
          type: "adhoc",
          fileReference: requestedFileReference,
          client,
          fields: adhoc,
          aiResearch: research
        });
        toast(`${matter.fileReference} created`);
        router.push(`/matters/${matter.id}`);
        return;
      }

      if (selectedType === "litigation") {
        const matter = createMatter({
          type: "litigation",
          fileReference: requestedFileReference,
          client,
          fields: litigation
        });
        toast(`${matter.fileReference} created`);
        router.push(`/matters/${matter.id}`);
        return;
      }

      if (selectedType === "purchase") {
        const matter = createMatter({
          type: "purchase",
          fileReference: requestedFileReference,
          client,
          fields: purchase
        });
        toast(`${matter.fileReference} created`);
        router.push(`/matters/${matter.id}`);
        return;
      }

      const matter = createMatter({
        type: "conveyancing",
        fileReference: requestedFileReference,
        client,
        fields: conveyancing
      });
      toast(`${matter.fileReference} created`);
      router.push(`/matters/${matter.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated) return <PageSkeleton rows={7} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-slate-950">New Matter</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Default file reference {nextReference}
        </p>
      </div>

      <section className="surface-card p-3">
        <div className="grid gap-2 sm:grid-cols-4">
          {intakeSteps.map((step, index) => (
            <div
              key={step}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-all duration-200",
                index === 0
                  ? "border-primary bg-primary text-white shadow-soft"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs",
                  index === 0 ? "bg-white text-primary" : "bg-white text-slate-600"
                )}
              >
                {index + 1}
              </span>
              <span className="truncate">{step}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {matterOptions.map((option) => {
          const Icon = option.icon;
          const active = selectedType === option.type;
          return (
            <button
              key={option.type}
              type="button"
              onClick={() => setSelectedType(option.type)}
              className={cn(
                "interactive-card flex min-h-20 items-center gap-3 rounded-md border bg-white p-4 text-left shadow-soft",
                active && "border-primary bg-primary text-white shadow-elevated"
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary",
                  active && "bg-white text-primary"
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="font-semibold">{option.title}</span>
            </button>
          );
        })}
      </section>

      <form onSubmit={submitMatter} className="space-y-5">
        <section className="surface-card p-4">
          <h2 className="mb-4 text-base font-semibold text-slate-950">Matter details</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="File reference" required>
              <Input
                required
                value={fileReference}
                onChange={(event) => {
                  setReferenceEdited(true);
                  setFileReference(event.target.value);
                }}
              />
            </Field>
          </div>
        </section>

        <section className="surface-card p-4">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-base font-semibold text-slate-950">Client</h2>
            <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-1">
              <button
                type="button"
                onClick={chooseExistingClient}
                className={cn(
                  "h-9 rounded px-3 text-sm font-medium transition-colors",
                  clientMode === "existing"
                    ? "bg-white text-slate-950 shadow-soft"
                    : "text-muted-foreground hover:text-slate-950"
                )}
              >
                Existing Client
              </button>
              <button
                type="button"
                onClick={chooseNewClient}
                className={cn(
                  "h-9 rounded px-3 text-sm font-medium transition-colors",
                  clientMode === "new"
                    ? "bg-white text-slate-950 shadow-soft"
                    : "text-muted-foreground hover:text-slate-950"
                )}
              >
                New Client
              </button>
            </div>
          </div>

          {clientMode === "existing" && (
            <div className="mb-4 grid gap-3">
              <Field label="Search clients">
                <Input
                  value={clientSearch}
                  placeholder="Name, email, phone, address or PPS"
                  onChange={(event) => setClientSearch(event.target.value)}
                />
              </Field>
              <div className="max-h-64 overflow-y-auto rounded-md border bg-slate-50">
                {state.clients.length === 0 ? (
                  <EmptyState
                    icon={UsersRound}
                    title="No existing clients yet"
                    description="Choose New Client to create the client record with this matter."
                    className="rounded-none border-0"
                  />
                ) : filteredClients.length === 0 ? (
                  <EmptyState
                    icon={SearchX}
                    title="No clients match that search"
                    description="Try a name, email, phone, address, or PPS number."
                    className="rounded-none border-0"
                  />
                ) : (
                  filteredClients.map((existingClient) => {
                    const selected = selectedClientId === existingClient.id;
                    return (
                      <button
                        key={existingClient.id}
                        type="button"
                        onClick={() => selectExistingClient(existingClient.id)}
                        className={cn(
                          "grid w-full gap-1 border-b px-3 py-3 text-left text-sm transition-all duration-200 last:border-b-0 hover:bg-white hover:shadow-soft",
                          selected && "bg-primary/10"
                        )}
                      >
                        <span className="font-semibold text-slate-950">
                          {existingClient.fullName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {existingClient.email} · {existingClient.phone}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {existingClient.address}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              {selectedExistingClient ? (
                <p className="text-sm text-primary">
                  Selected {selectedExistingClient.fullName}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a client from the search results to pre-fill the intake form.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Client full name" required>
              <Input
                required
                value={client.fullName}
                onChange={(event) =>
                  setClient((current) => ({ ...current, fullName: event.target.value }))
                }
              />
            </Field>
            <Field label="Client phone" required>
              <Input
                required
                value={client.phone}
                onChange={(event) =>
                  setClient((current) => ({ ...current, phone: event.target.value }))
                }
              />
            </Field>
            <Field label="Client email" required>
              <Input
                required
                type="email"
                value={client.email}
                onChange={(event) =>
                  setClient((current) => ({ ...current, email: event.target.value }))
                }
              />
            </Field>
            <Field label="PPS number">
              <Input
                value={client.ppsNumber ?? ""}
                onChange={(event) =>
                  setClient((current) => ({ ...current, ppsNumber: event.target.value }))
                }
              />
            </Field>
            <Field label="Date of birth">
              <Input
                type="date"
                value={client.dateOfBirth ?? ""}
                onChange={(event) =>
                  setClient((current) => ({ ...current, dateOfBirth: event.target.value }))
                }
              />
            </Field>
            <Field label="Client address" className="md:col-span-2" required>
              <Textarea
                required
                value={client.address}
                onChange={(event) =>
                  setClient((current) => ({ ...current, address: event.target.value }))
                }
              />
            </Field>
          </div>
        </section>

        {selectedType === "conveyancing" && (
          <ConveyancingFieldsForm value={conveyancing} onChange={setConveyancing} />
        )}
        {selectedType === "purchase" && (
          <PurchaseFieldsForm value={purchase} onChange={setPurchase} />
        )}
        {selectedType === "litigation" && (
          <LitigationFieldsForm value={litigation} onChange={setLitigation} />
        )}
        {selectedType === "adhoc" && <AdhocFieldsForm value={adhoc} onChange={setAdhoc} />}

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create Matter"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  required,
  className
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

function ConveyancingFieldsForm({
  value,
  onChange
}: {
  value: ConveyancingFields;
  onChange: React.Dispatch<React.SetStateAction<ConveyancingFields>>;
}) {
  return (
    <section className="surface-card p-4">
      <h2 className="mb-4 text-base font-semibold text-slate-950">House sale intake</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Property address being sold" required className="md:col-span-2">
          <Textarea
            required
            value={value.propertyAddress}
            onChange={(event) =>
              onChange((current) => ({ ...current, propertyAddress: event.target.value }))
            }
          />
        </Field>
        <Field label="Agreed sale price" required>
          <Input
            required
            value={value.salePrice}
            onChange={(event) =>
              onChange((current) => ({ ...current, salePrice: event.target.value }))
            }
          />
        </Field>
        <Field label="Expected closing date" required>
          <Input
            required
            placeholder="YYYY-MM-DD"
            value={value.closingDate}
            onChange={(event) =>
              onChange((current) => ({ ...current, closingDate: event.target.value }))
            }
          />
        </Field>
        <Field label="Buyer full name" required>
          <Input
            required
            value={value.buyerName}
            onChange={(event) =>
              onChange((current) => ({ ...current, buyerName: event.target.value }))
            }
          />
        </Field>
        <Field label="Auctioneer name" required>
          <Input
            required
            value={value.auctioneerName}
            onChange={(event) =>
              onChange((current) => ({ ...current, auctioneerName: event.target.value }))
            }
          />
        </Field>
        <Field label="Buyer solicitor name" required>
          <Input
            required
            value={value.buyerSolicitorName}
            onChange={(event) =>
              onChange((current) => ({ ...current, buyerSolicitorName: event.target.value }))
            }
          />
        </Field>
        <Field label="Mortgage holder">
          <Input
            value={value.mortgageHolder}
            onChange={(event) =>
              onChange((current) => ({ ...current, mortgageHolder: event.target.value }))
            }
          />
        </Field>
        <Field label="Buyer solicitor name and address" required className="md:col-span-2">
          <Textarea
            required
            value={value.buyerSolicitorAddress}
            onChange={(event) =>
              onChange((current) => ({ ...current, buyerSolicitorAddress: event.target.value }))
            }
          />
        </Field>
      </div>
    </section>
  );
}

function PurchaseFieldsForm({
  value,
  onChange
}: {
  value: PurchaseFields;
  onChange: React.Dispatch<React.SetStateAction<PurchaseFields>>;
}) {
  return (
    <section className="surface-card p-4">
      <h2 className="mb-4 text-base font-semibold text-slate-950">House purchase intake</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Property address being purchased" required className="md:col-span-2">
          <Textarea
            required
            value={value.propertyAddress}
            onChange={(event) =>
              onChange((current) => ({ ...current, propertyAddress: event.target.value }))
            }
          />
        </Field>
        <Field label="Agreed purchase price" required>
          <Input
            required
            value={value.purchasePrice}
            onChange={(event) =>
              onChange((current) => ({ ...current, purchasePrice: event.target.value }))
            }
          />
        </Field>
        <Field label="Expected closing date" required>
          <Input
            required
            placeholder="YYYY-MM-DD"
            value={value.closingDate}
            onChange={(event) =>
              onChange((current) => ({ ...current, closingDate: event.target.value }))
            }
          />
        </Field>
        <Field label="Vendor full name" required>
          <Input
            required
            value={value.vendorName}
            onChange={(event) =>
              onChange((current) => ({ ...current, vendorName: event.target.value }))
            }
          />
        </Field>
        <Field label="Mortgage lender" required>
          <Input
            required
            value={value.mortgageLender}
            onChange={(event) =>
              onChange((current) => ({ ...current, mortgageLender: event.target.value }))
            }
          />
        </Field>
        <Field label="Vendor solicitor name" required>
          <Input
            required
            value={value.vendorSolicitorName}
            onChange={(event) =>
              onChange((current) => ({ ...current, vendorSolicitorName: event.target.value }))
            }
          />
        </Field>
        <Field label="Vendor solicitor address" required className="md:col-span-2">
          <Textarea
            required
            value={value.vendorSolicitorAddress}
            onChange={(event) =>
              onChange((current) => ({ ...current, vendorSolicitorAddress: event.target.value }))
            }
          />
        </Field>
      </div>
    </section>
  );
}

function LitigationFieldsForm({
  value,
  onChange
}: {
  value: Omit<LitigationFields, "limitationDate">;
  onChange: React.Dispatch<React.SetStateAction<Omit<LitigationFields, "limitationDate">>>;
}) {
  return (
    <section className="surface-card p-4">
      <h2 className="mb-4 text-base font-semibold text-slate-950">Dispute resolution intake</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Dispute type" required>
          <Select
            required
            value={value.disputeType}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                disputeType: event.target.value as DisputeType
              }))
            }
          >
            {disputeTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date dispute arose" required>
          <Input
            required
            placeholder="YYYY-MM-DD"
            value={value.dateDisputeArose}
            onChange={(event) =>
              onChange((current) => ({ ...current, dateDisputeArose: event.target.value }))
            }
          />
        </Field>
        <Field label="Description of dispute" required className="md:col-span-2">
          <Textarea
            required
            value={value.disputeDescription}
            onChange={(event) =>
              onChange((current) => ({ ...current, disputeDescription: event.target.value }))
            }
          />
        </Field>
        <Field label="Opponent full name" required>
          <Input
            required
            value={value.opponentName}
            onChange={(event) =>
              onChange((current) => ({ ...current, opponentName: event.target.value }))
            }
          />
        </Field>
        <Field label="Claim value">
          <Input
            value={value.claimValue}
            onChange={(event) =>
              onChange((current) => ({ ...current, claimValue: event.target.value }))
            }
          />
        </Field>
        <Field label="Opponent full address" required className="md:col-span-2">
          <Textarea
            required
            value={value.opponentAddress}
            onChange={(event) =>
              onChange((current) => ({ ...current, opponentAddress: event.target.value }))
            }
          />
        </Field>
        <Field label="Opponent solicitor">
          <Input
            value={value.opponentSolicitor}
            onChange={(event) =>
              onChange((current) => ({ ...current, opponentSolicitor: event.target.value }))
            }
          />
        </Field>
      </div>
    </section>
  );
}

function AdhocFieldsForm({
  value,
  onChange
}: {
  value: AdHocFields;
  onChange: React.Dispatch<React.SetStateAction<AdHocFields>>;
}) {
  return (
    <section className="surface-card p-4">
      <h2 className="mb-4 text-base font-semibold text-slate-950">Ad hoc matter intake</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Description of matter" required className="md:col-span-2">
          <Textarea
            required
            value={value.matterDescription}
            onChange={(event) =>
              onChange((current) => ({ ...current, matterDescription: event.target.value }))
            }
          />
        </Field>
        <Field label="Any third party name">
          <Input
            value={value.thirdPartyName}
            onChange={(event) =>
              onChange((current) => ({ ...current, thirdPartyName: event.target.value }))
            }
          />
        </Field>
        <Field label="Any third party address">
          <Textarea
            value={value.thirdPartyAddress}
            onChange={(event) =>
              onChange((current) => ({ ...current, thirdPartyAddress: event.target.value }))
            }
          />
        </Field>
      </div>
    </section>
  );
}

async function fetchResearch(matterDescription: string) {
  try {
    const response = await fetch("/api/research", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ matterDescription })
    });
    const data = (await response.json()) as { summary?: string; error?: string };
    if (!response.ok) {
      return {
        status: "error" as const,
        summary: "",
        error: data.error ?? "Research could not be completed."
      };
    }
    return {
      status: "complete" as const,
      summary: data.summary ?? ""
    };
  } catch {
    return {
      status: "error" as const,
      summary: "",
      error: "Research could not be completed."
    };
  }
}
