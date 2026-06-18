import { Badge } from "@/components/ui/badge";
import type { AmlChecklist, MatterStatus } from "@/lib/types";
import { getAmlStatus } from "@/lib/templates";

export function MatterStatusBadge({ status }: { status: MatterStatus }) {
  if (status === "Open") return <Badge variant="open">Open</Badge>;
  if (status === "In Progress") return <Badge variant="progress">In Progress</Badge>;
  return <Badge variant="closed">Closed</Badge>;
}

export function AmlStatusBadge({ aml }: { aml: AmlChecklist }) {
  const status = getAmlStatus(aml);
  if (status === "Verified") return <Badge variant="open">Verified</Badge>;
  if (status === "Pending Review") return <Badge variant="warning">Pending Review</Badge>;
  return <Badge variant="danger">Incomplete</Badge>;
}
