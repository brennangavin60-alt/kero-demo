import { PermissionGate } from "@/components/access-restricted";
import { TimeBillingPage } from "@/components/time-billing-page";
import type { InvoiceStatus } from "@/lib/types";

const statuses: InvoiceStatus[] = ["Draft", "Sent", "Paid", "Overdue"];

export default function BillingRoute({
  searchParams
}: {
  searchParams?: {
    status?: string | string[];
  };
}) {
  const status = Array.isArray(searchParams?.status)
    ? searchParams?.status[0]
    : searchParams?.status;
  const initialStatusFilter = statuses.includes(status as InvoiceStatus)
    ? (status as InvoiceStatus)
    : "all";

  return (
    <PermissionGate permission="viewBilling" label="Time & Billing">
      <TimeBillingPage initialStatusFilter={initialStatusFilter} />
    </PermissionGate>
  );
}
