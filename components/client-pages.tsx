"use client";

import { useMemo } from "react";
import Link from "next/link";
import { FilePlus2, FolderKanban, ShieldCheck, UserRound } from "lucide-react";
import { AmlStatusBadge, MatterStatusBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageSkeleton } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatDisplayDate } from "@/lib/dates";
import { getCurrentStage, getMatterTitle, MATTER_LABELS } from "@/lib/stages";
import { useKeroStore } from "@/lib/storage";
import type { Client, Matter } from "@/lib/types";

export function ClientsList() {
  const { state, hydrated } = useKeroStore();

  if (!hydrated) return <PageSkeleton rows={6} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Clients</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Linked matters and contact details.
        </p>
      </div>
      <section className="surface-card p-4">
        {state.clients.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="No clients recorded"
            description="Clients will appear here once a matter is created or demo data is loaded."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {state.clients.map((client) => {
              const matters = state.matters.filter((matter) => matter.clientId === client.id);
              const latestMatter = getLatestMatter(matters);
              return (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="interactive-card rounded-md border bg-slate-50 p-4"
                >
                  <div className="mb-3 flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <UserRound className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-950">{client.fullName}</div>
                      <div className="truncate text-sm text-muted-foreground">{client.email}</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <Badge variant="navy">{matters.length} matters</Badge>
                    {latestMatter ? (
                      <span className="flex min-w-0 flex-1 items-center justify-start gap-2 sm:justify-end">
                        <span className="min-w-0 text-right text-xs leading-5">
                          <span className="block truncate font-semibold text-slate-950">
                            {latestMatter.fileReference}
                          </span>
                          <span className="block truncate text-muted-foreground">
                            {MATTER_LABELS[latestMatter.type]} · {getMatterTitle(latestMatter)}
                          </span>
                        </span>
                        <MatterStatusBadge status={latestMatter.status} />
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">
                        No recent matter
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function getLatestMatter(matters: Matter[]) {
  return [...matters].sort((a, b) => getMatterTime(b) - getMatterTime(a))[0];
}

function getMatterTime(matter: Matter) {
  return new Date(matter.updatedAt ?? matter.dateOpened).getTime();
}

export function ClientDetail({ clientId }: { clientId: string }) {
  const { state, hydrated, updateClient, hasPermission } = useKeroStore();
  const client = state.clients.find((item) => item.id === clientId);
  const matters = useMemo(
    () => state.matters.filter((matter) => matter.clientId === clientId),
    [clientId, state.matters]
  );

  if (!hydrated) return <PageSkeleton rows={5} />;

  if (!client) {
    return (
      <EmptyState
        icon={UserRound}
        title="Client not found"
        description="This client may have been removed or the link may be out of date."
        className="surface-card"
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">{client.fullName}</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {matters.length} linked matters
          </p>
        </div>
        {hasPermission("createMatter") ? (
          <Link
            href={`/new?clientId=${encodeURIComponent(client.id)}`}
            className={buttonVariants({ className: "w-full sm:w-auto" })}
          >
            <FilePlus2 className="h-4 w-4" />
            Create New Matter
          </Link>
        ) : null}
      </div>
      <section className="surface-card p-4">
        <h2 className="mb-4 text-base font-semibold text-slate-950">Contact details</h2>
        <ClientFields client={client} update={(patch) => updateClient(client.id, patch)} />
      </section>
      <section className="surface-card p-4">
        <h2 className="mb-4 text-base font-semibold text-slate-950">Matters</h2>
        <div className="grid gap-3">
          {matters.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No linked matters"
              description="Create a new matter from this client profile to link the file automatically."
              className="py-6"
            />
          ) : (
            matters.map((matter) => (
              <Link
                href={`/matters/${matter.id}`}
                key={matter.id}
                className="interactive-card grid gap-2 rounded-md border bg-slate-50 p-3 text-sm md:grid-cols-[120px_1fr_140px_160px_120px]"
              >
                <span className="font-semibold text-primary">{matter.fileReference}</span>
                <span>
                  <span className="block font-medium text-slate-950">{getMatterTitle(matter)}</span>
                  <span className="text-xs text-muted-foreground">
                    Opened {formatDisplayDate(matter.dateOpened)}
                  </span>
                </span>
                <span>{MATTER_LABELS[matter.type]}</span>
                <span>{getCurrentStage(matter)}</span>
                <MatterStatusBadge status={matter.status} />
              </Link>
            ))
          )}
        </div>
      </section>
      <section className="surface-card p-4">
        <h2 className="mb-4 text-base font-semibold text-slate-950">AML compliance</h2>
        <div className="grid gap-3">
          {matters.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No AML records"
              description="AML status will appear here for this client's linked matters."
              className="py-6"
            />
          ) : (
            matters.map((matter) => (
              <div
                key={matter.id}
                className="list-row grid gap-2 rounded-md border bg-slate-50 p-3 text-sm md:grid-cols-[120px_1fr_140px]"
              >
                <Link href={`/matters/${matter.id}`} className="font-semibold text-primary">
                  {matter.fileReference}
                </Link>
                <span>
                  ID {matter.aml.photoIdReceived ? "received" : "missing"} · Address{" "}
                  {matter.aml.proofOfAddressReceived ? "received" : "missing"} · Funds{" "}
                  {matter.aml.sourceOfFundsReceived ? "received" : "missing"}
                </span>
                <AmlStatusBadge aml={matter.aml} />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function ClientFields({
  client,
  update
}: {
  client: Client;
  update: (patch: Partial<Client>) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Full name">
        <Input value={client.fullName} onChange={(event) => update({ fullName: event.target.value })} />
      </Field>
      <Field label="Phone">
        <Input value={client.phone} onChange={(event) => update({ phone: event.target.value })} />
      </Field>
      <Field label="Email">
        <Input value={client.email} onChange={(event) => update({ email: event.target.value })} />
      </Field>
      <Field label="PPS number">
        <Input value={client.ppsNumber} onChange={(event) => update({ ppsNumber: event.target.value })} />
      </Field>
      <Field label="Date of birth">
        <Input placeholder="YYYY-MM-DD" value={client.dateOfBirth} onChange={(event) => update({ dateOfBirth: event.target.value })} />
      </Field>
      <Field label="Address" className="md:col-span-2">
        <Textarea value={client.address} onChange={(event) => update({ address: event.target.value })} />
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
  className
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-2 block">{label}</Label>
      {children}
    </div>
  );
}
