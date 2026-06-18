import { PermissionGate } from "@/components/access-restricted";
import { NewMatterForm } from "@/components/new-matter-form";

export default function NewMatterPage({
  searchParams
}: {
  searchParams?: { clientId?: string | string[] };
}) {
  const clientId = Array.isArray(searchParams?.clientId)
    ? searchParams?.clientId[0]
    : searchParams?.clientId;

  return (
    <PermissionGate permission="createMatter" label="New Matter">
      <NewMatterForm initialClientId={clientId ?? ""} />
    </PermissionGate>
  );
}
